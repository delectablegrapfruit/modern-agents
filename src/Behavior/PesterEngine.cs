using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using AgentWrangler.Agents;
using AgentWrangler.Config;
using AgentWrangler.Interop;
using AgentWrangler.Library;
using AgentWrangler.Ui;

namespace AgentWrangler.Behavior
{
    /// <summary>
    /// Decides what every active agent says, when it says it, and where it stands while it
    /// says it. Runs entirely on the UI thread, driven by a single timer in the manager
    /// window, because the Agent control is apartment-threaded and cannot be touched from
    /// anywhere else.
    ///
    /// The whole design is one loop over the roster per tick. There is no per-agent thread:
    /// a dozen characters all talking at once is the point of the program, and a dozen
    /// threads all marshalling COM calls onto the same apartment would be slower and far
    /// harder to reason about.
    /// </summary>
    public sealed class PesterEngine : IDisposable
    {
        /// <summary>Nothing may speak twice inside this window, whatever the pester level.</summary>
        private static readonly TimeSpan HardFloor = TimeSpan.FromSeconds(0.75);

        /// <summary>How long an agent remembers having commented on a specific thing.</summary>
        private static readonly TimeSpan DedupeWindow = TimeSpan.FromSeconds(45);

        /// <summary>Total prompts allowed on screen at once, across every agent.</summary>
        private const int MaxConcurrentPrompts = 3;

        /// <summary>Candidate positions tried before giving up on avoiding another agent.</summary>
        private const int PlacementAttempts = 8;

        private readonly AppSettings _settings;
        private readonly AgentRoster _roster;
        private readonly ActivityBus _bus;
        private readonly Random _rng = new Random();

        private readonly List<Ui.AssistPrompt> _openPrompts = new List<Ui.AssistPrompt>();

        private Phrasebook _phrasebook;
        private bool _panicHidden;

        public PesterEngine(AppSettings settings, AgentRoster roster, ActivityBus bus, Phrasebook phrasebook)
        {
            if (settings == null) throw new ArgumentNullException("settings");
            if (roster == null) throw new ArgumentNullException("roster");
            if (bus == null) throw new ArgumentNullException("bus");

            _settings = settings;
            _roster = roster;
            _bus = bus;
            _phrasebook = phrasebook ?? DefaultPhrasebook.Build();
        }

        /// <summary>Raised whenever an agent says anything, for the activity log.</summary>
        public event EventHandler<AgentSpokeEventArgs> AgentSpoke;

        /// <summary>Raised for observed activity, whether or not anybody commented on it.</summary>
        public event EventHandler<ActivityObservedEventArgs> ActivityObserved;

        public AgentRoster Roster { get { return _roster; } }

        public Phrasebook Phrasebook
        {
            get { return _phrasebook; }
            set { _phrasebook = value ?? DefaultPhrasebook.Build(); }
        }

        /// <summary>True while the panic key has everyone hidden.</summary>
        public bool PanicHidden { get { return _panicHidden; } }

        // ---- roster management -----------------------------------------------------

        public LiveAgent Summon(AgentProfile profile, CharacterFileInfo known)
        {
            LiveAgent agent = _roster.Summon(profile, known);

            DateTime now = DateTime.Now;
            agent.EffectivePester = PesterCurve.Combine(profile.Pester, _settings.MasterPester);
            agent.NextNagAt = now.AddSeconds(PesterCurve.Jitter(_rng, PesterCurve.NagIntervalSeconds(agent.EffectivePester)));
            agent.NextMoveAt = now.AddSeconds(PesterCurve.Jitter(_rng, PesterCurve.MoveIntervalSeconds(agent.EffectivePester)));

            // Put it somewhere sensible before it says hello, so two agents summoned back
            // to back do not appear on top of each other.
            MoveAgent(agent, true);

            if (!_settings.Muzzled && profile.ReactsTo(ActivityKind.Summoned))
            {
                agent.Play(profile.GreetAnimation);
                SayFor(agent, new ActivityEvent(ActivityKind.Summoned, agent.Name));
            }

            return agent;
        }

        /// <summary>
        /// Sends an agent away. With <paramref name="withFarewell"/> the character gets a
        /// moment to deliver its parting line before it is unloaded; on shutdown it does not.
        /// </summary>
        public void Dismiss(string profileId, bool withFarewell)
        {
            LiveAgent agent = _roster.Find(profileId);
            if (agent == null) return;

            if (withFarewell && !_settings.Muzzled && agent.Profile.ReactsTo(ActivityKind.Dismissed))
            {
                SayFor(agent, new ActivityEvent(ActivityKind.Dismissed, agent.Name));
                OneShot.Run(1400, delegate { _roster.Dismiss(profileId); });
                return;
            }

            _roster.Dismiss(profileId);
        }

        public void DismissAll(bool withFarewell)
        {
            foreach (LiveAgent agent in new List<LiveAgent>(_roster.Agents))
                Dismiss(agent.Profile.Id, withFarewell);
        }

        /// <summary>Panic key: everyone off screen at once, still loaded and instantly restorable.</summary>
        public void SetPanicHidden(bool hidden)
        {
            _panicHidden = hidden;
            if (hidden)
            {
                _roster.HideAll();
                // A prompt left behind after the characters vanish would defeat the point
                // of a panic key.
                CloseOpenPrompts();
                Diagnostics.Info("Panic: all agents hidden.");
            }
            else
            {
                _roster.ShowAll();
                Diagnostics.Info("Agents restored.");
            }
        }

        public void TogglePanic()
        {
            SetPanicHidden(!_panicHidden);
        }

        // ---- the loop --------------------------------------------------------------

        /// <summary>One pass of the brain. Call from a UI timer, roughly four times a second.</summary>
        public void Tick()
        {
            List<ActivityEvent> events = _bus.Drain();

            foreach (ActivityEvent ev in events)
            {
                EventHandler<ActivityObservedEventArgs> handler = ActivityObserved;
                if (handler != null) handler(this, new ActivityObservedEventArgs(ev));
            }

            _roster.RetireFaulted();
            if (_roster.Count == 0) return;

            DateTime now = DateTime.Now;

            foreach (LiveAgent agent in new List<LiveAgent>(_roster.Agents))
            {
                agent.EffectivePester = PesterCurve.Combine(agent.Profile.Pester, _settings.MasterPester);

                if (_settings.Muzzled || _panicHidden || agent.EffectivePester == PesterCurve.Min)
                {
                    // Still push the timers forward so an agent un-muzzled after an hour
                    // does not immediately empty its whole backlog into your face.
                    RescheduleNag(agent, now);
                    RescheduleMove(agent, now);
                    continue;
                }

                ReactToEvents(agent, events, now);
                MaybeNag(agent, now);
                MaybeMove(agent, now);
            }
        }

        private void ReactToEvents(LiveAgent agent, List<ActivityEvent> events, DateTime now)
        {
            foreach (ActivityEvent ev in events)
            {
                if (!agent.Profile.ReactsTo(ev.Kind)) continue;
                if (!CanSpeak(agent, now)) return;   // nothing else this tick either
                if (_rng.NextDouble() > PesterCurve.ReactionChance(agent.EffectivePester)) continue;
                if (agent.RecentlyMentioned(ev.DedupeKey, DedupeWindow)) continue;

                agent.Play(SalienceAnimation(agent, ev.Kind));
                if (!SayFor(agent, ev)) continue;

                MaybeGestureAt(agent, ev);
                MaybeOffer(agent, ev);
            }
        }

        private void MaybeNag(LiveAgent agent, DateTime now)
        {
            if (now < agent.NextNagAt) return;
            RescheduleNag(agent, now);

            if (!agent.Profile.ReactsTo(ActivityKind.Nag)) return;
            if (!CanSpeak(agent, now)) return;

            var ev = new ActivityEvent(ActivityKind.Nag, "check-in");
            if (SayFor(agent, ev)) MaybeOffer(agent, ev);
        }

        private void MaybeMove(LiveAgent agent, DateTime now)
        {
            if (now < agent.NextMoveAt) return;
            RescheduleMove(agent, now);
            MoveAgent(agent, false);
        }

        private void RescheduleNag(LiveAgent agent, DateTime now)
        {
            double seconds = PesterCurve.Jitter(_rng, PesterCurve.NagIntervalSeconds(agent.EffectivePester));
            agent.NextNagAt = double.IsInfinity(seconds) ? DateTime.MaxValue : now.AddSeconds(seconds);
        }

        private void RescheduleMove(LiveAgent agent, DateTime now)
        {
            double seconds = PesterCurve.Jitter(_rng, PesterCurve.MoveIntervalSeconds(agent.EffectivePester));
            agent.NextMoveAt = double.IsInfinity(seconds) ? DateTime.MaxValue : now.AddSeconds(seconds);
        }

        /// <summary>
        /// Cooldown gate. An agent that interrupts itself still respects the hard floor,
        /// otherwise a tick every 250ms would fire four lines a second at level 10.
        /// </summary>
        private bool CanSpeak(LiveAgent agent, DateTime now)
        {
            TimeSpan since = now - agent.LastSpokeAt;
            if (since < HardFloor) return false;

            if (agent.Profile.Interrupt || PesterCurve.InterruptsByDefault(agent.EffectivePester))
                return true;

            double cooldown = agent.Profile.CooldownSecondsOverride > 0
                ? agent.Profile.CooldownSecondsOverride
                : PesterCurve.CooldownSeconds(agent.EffectivePester);

            return !double.IsInfinity(cooldown) && since.TotalSeconds >= cooldown;
        }

        /// <summary>Picks a line, says it and reports it. False if the phrasebook had nothing.</summary>
        private bool SayFor(LiveAgent agent, ActivityEvent ev)
        {
            string template = _phrasebook.PickLine(ev.Kind, agent.Profile.Persona, _rng);
            if (string.IsNullOrEmpty(template)) return false;

            string line = Phrasebook.Format(template, ev, agent.Name, agent.LinesSpoken + 1);
            agent.Speak(line);

            EventHandler<AgentSpokeEventArgs> handler = AgentSpoke;
            if (handler != null) handler(this, new AgentSpokeEventArgs(agent, ev.Kind, line));
            return true;
        }

        /// <summary>A louder animation for the activities that deserve one.</summary>
        private static string SalienceAnimation(LiveAgent agent, ActivityKind kind)
        {
            switch (kind)
            {
                case ActivityKind.DownloadFinished:
                case ActivityKind.FileDeleted:
                case ActivityKind.UserReturned:
                    return agent.Profile.AlertAnimation;
                default:
                    return null;
            }
        }

        /// <summary>Points at the window the user is working in, when there is one to point at.</summary>
        private void MaybeGestureAt(LiveAgent agent, ActivityEvent ev)
        {
            if (agent.EffectivePester < 4) return;
            if (ev.Kind != ActivityKind.AppFocused && ev.Kind != ActivityKind.AppLaunched) return;

            Rectangle window = ForegroundWindowBounds();
            if (window.IsEmpty) return;

            agent.GestureAt(window.Left + window.Width / 2, window.Top + window.Height / 2);
        }

        // ---- offering to help ------------------------------------------------------

        private void MaybeOffer(LiveAgent agent, ActivityEvent ev)
        {
            if (!agent.Profile.OfferAssistance) return;
            if (agent.PromptOpen || _openPrompts.Count >= MaxConcurrentPrompts) return;
            if (_rng.NextDouble() > PesterCurve.AssistChance(agent.EffectivePester)) return;

            AssistOffer offer = _phrasebook.PickOffer(ev.Kind, agent.Profile.Persona, _rng, agent.DeclinedTopics);
            if (offer == null) return;

            string question = Phrasebook.Format(offer.Ask, ev, agent.Name, agent.LinesSpoken);

            var prompt = new AssistPrompt(agent.Name, question,
                                          PesterCurve.PromptTimeoutSeconds(agent.EffectivePester),
                                          agent.Profile.EvasiveDecline,
                                          agent.Profile.StealFocus,
                                          _rng);

            prompt.PositionNear(agent.Bounds);
            prompt.Answered += delegate(object sender, AssistAnsweredEventArgs args)
            {
                agent.PromptOpen = false;
                _openPrompts.Remove(prompt);
                OnPromptAnswered(agent, offer, ev, args.Answer);
            };

            agent.PromptOpen = true;
            agent.LastPromptAt = DateTime.Now;
            _openPrompts.Add(prompt);

            try
            {
                prompt.Show();
            }
            catch (Exception ex)
            {
                agent.PromptOpen = false;
                _openPrompts.Remove(prompt);
                Diagnostics.Error("Could not show an assist prompt.", ex);
            }
        }

        /// <summary>
        /// Closes every prompt on screen. Each close raises Answered, which removes it from
        /// the list, so the loop runs over a copy.
        /// </summary>
        private void CloseOpenPrompts()
        {
            foreach (Ui.AssistPrompt prompt in new List<Ui.AssistPrompt>(_openPrompts))
            {
                try { prompt.Close(); }
                catch (Exception ex) { Diagnostics.Warn("Closing a prompt failed: " + ex.Message); }
            }
            _openPrompts.Clear();
        }

        private void OnPromptAnswered(LiveAgent agent, AssistOffer offer, ActivityEvent ev, AssistAnswer answer)
        {
            switch (answer)
            {
                case AssistAnswer.Accepted:
                    SayLiteral(agent, ev.Kind, Phrasebook.Format(offer.Accepted, ev, agent.Name, agent.LinesSpoken));
                    AssistExecutor.Execute(offer.Action, ev, agent, this);
                    break;

                case AssistAnswer.Declined:
                    SayLiteral(agent, ev.Kind, Phrasebook.Format(offer.Declined, ev, agent.Name, agent.LinesSpoken));
                    break;

                case AssistAnswer.Never:
                    agent.DeclinedTopics.Add(offer.Topic ?? "general");
                    SayLiteral(agent, ev.Kind, Phrasebook.Format(offer.Declined, ev, agent.Name, agent.LinesSpoken));
                    Diagnostics.Info(agent.Name + " will stop asking about: " + offer.Topic);
                    break;

                default:
                    // Ignored. A pushy agent takes that personally.
                    if (agent.EffectivePester >= 7)
                        SayLiteral(agent, ev.Kind, "I'll take that as a maybe!");
                    break;
            }
        }

        private void SayLiteral(LiveAgent agent, ActivityKind kind, string line)
        {
            if (string.IsNullOrEmpty(line)) return;
            if (_settings.Muzzled || _panicHidden) return;

            agent.Speak(line);
            EventHandler<AgentSpokeEventArgs> handler = AgentSpoke;
            if (handler != null) handler(this, new AgentSpokeEventArgs(agent, kind, line));
        }

        /// <summary>
        /// Makes an agent say something right now, ignoring its cooldown. This is the
        /// "make it talk" button in the manager, and the only way to get a line out of an
        /// agent whose level is set to Muzzled.
        /// </summary>
        public void Provoke(LiveAgent agent)
        {
            if (agent == null) return;

            // Speaking into a hidden character produces nothing visible, so bring it back
            // first. Poking a specific agent is an explicit instruction; it overrides both
            // the muzzle and a level of zero.
            if (_panicHidden) SetPanicHidden(false);
            if (!agent.IsShown) agent.Show();

            var ev = new ActivityEvent(ActivityKind.Nag, "poked");
            if (!SayFor(agent, ev)) agent.Speak("Yes? I'm right here.");
        }

        /// <summary>Bumps an agent's next unprompted remark forward. Used by CheckBackLater.</summary>
        public void ScheduleSoonNag(LiveAgent agent, int minSeconds, int maxSeconds)
        {
            agent.NextNagAt = DateTime.Now.AddSeconds(_rng.Next(minSeconds, maxSeconds + 1));
        }

        // ---- movement --------------------------------------------------------------

        /// <summary>Moves an agent according to its movement style. Placement avoids the others.</summary>
        public void MoveAgent(LiveAgent agent, bool instant)
        {
            if (agent.Profile.Movement == MovementStyle.Stay && !instant) return;

            Rectangle bounds = agent.Bounds;
            Size size = bounds.IsEmpty ? new Size(128, 128) : bounds.Size;

            Point target = PickTarget(agent, size);
            if (target == Point.Empty) return;

            agent.MoveTo(target.X, target.Y, instant ? 0 : agent.Profile.MoveDurationMs);
        }

        private Point PickTarget(LiveAgent agent, Size size)
        {
            Rectangle work = WorkAreaFor(agent);

            for (int attempt = 0; attempt < PlacementAttempts; attempt++)
            {
                Point candidate = ProposeTarget(agent, size, work);
                candidate = Clamp(candidate, size, work);
                if (attempt == PlacementAttempts - 1 || !CollidesWithOtherAgent(agent, candidate, size))
                    return candidate;
            }

            return Point.Empty;
        }

        private Point ProposeTarget(LiveAgent agent, Size size, Rectangle work)
        {
            switch (agent.Profile.Movement)
            {
                case MovementStyle.FollowCursor:
                {
                    Point cursor = CursorPosition();
                    // Just far enough away to not sit under the pointer, close enough to
                    // be genuinely in the way.
                    int dx = _rng.Next(0, 2) == 0 ? 48 : -(size.Width + 48);
                    int dy = _rng.Next(-40, 41);
                    return new Point(cursor.X + dx, cursor.Y + dy);
                }

                case MovementStyle.Orbit:
                {
                    Rectangle window = ForegroundWindowBounds();
                    if (window.IsEmpty) window = work;
                    double angle = _rng.NextDouble() * Math.PI * 2;
                    int radiusX = Math.Max(80, window.Width / 2);
                    int radiusY = Math.Max(80, window.Height / 2);
                    int cx = window.Left + window.Width / 2;
                    int cy = window.Top + window.Height / 2;
                    return new Point(cx + (int)(Math.Cos(angle) * radiusX) - size.Width / 2,
                                     cy + (int)(Math.Sin(angle) * radiusY) - size.Height / 2);
                }

                case MovementStyle.Perch:
                {
                    Point home = HomeCorner(agent, size, work);
                    // Small excursions around home, so it still looks alive.
                    return new Point(home.X + _rng.Next(-60, 61), home.Y + _rng.Next(-60, 61));
                }

                case MovementStyle.Stay:
                    return HomeCorner(agent, size, work);

                default:
                    return new Point(_rng.Next(work.Left, Math.Max(work.Left + 1, work.Right - size.Width)),
                                     _rng.Next(work.Top, Math.Max(work.Top + 1, work.Bottom - size.Height)));
            }
        }

        private static Point HomeCorner(LiveAgent agent, Size size, Rectangle work)
        {
            const int Margin = 16;
            switch (agent.Profile.HomeCorner)
            {
                case 0: return new Point(work.Left + Margin, work.Top + Margin);
                case 1: return new Point(work.Right - size.Width - Margin, work.Top + Margin);
                case 2: return new Point(work.Left + Margin, work.Bottom - size.Height - Margin);
                default: return new Point(work.Right - size.Width - Margin, work.Bottom - size.Height - Margin);
            }
        }

        private static Point Clamp(Point p, Size size, Rectangle work)
        {
            int x = Math.Min(Math.Max(p.X, work.Left), Math.Max(work.Left, work.Right - size.Width));
            int y = Math.Min(Math.Max(p.Y, work.Top), Math.Max(work.Top, work.Bottom - size.Height));
            return new Point(x, y);
        }

        /// <summary>Keeps agents from stacking on top of one another.</summary>
        private bool CollidesWithOtherAgent(LiveAgent mover, Point candidate, Size size)
        {
            var proposed = new Rectangle(candidate, size);
            proposed.Inflate(12, 12);

            foreach (LiveAgent other in _roster.Agents)
            {
                if (ReferenceEquals(other, mover)) continue;
                Rectangle bounds = other.Bounds;
                if (bounds.IsEmpty) continue;
                if (proposed.IntersectsWith(bounds)) return true;
            }
            return false;
        }

        /// <summary>
        /// The screen the agent should stay on: the one it is already on, or the primary
        /// one if its position cannot be read.
        /// </summary>
        private static Rectangle WorkAreaFor(LiveAgent agent)
        {
            Rectangle bounds = agent.Bounds;
            if (bounds.IsEmpty) return Screen.PrimaryScreen.WorkingArea;

            Screen screen = Screen.FromRectangle(bounds);
            return screen != null ? screen.WorkingArea : Screen.PrimaryScreen.WorkingArea;
        }

        private static Point CursorPosition()
        {
            NativeMethods.POINT p;
            if (NativeMethods.GetCursorPos(out p)) return new Point(p.X, p.Y);
            return Cursor.Position;
        }

        internal static Rectangle ForegroundWindowBounds()
        {
            IntPtr hwnd = NativeMethods.GetForegroundWindow();
            if (hwnd == IntPtr.Zero) return Rectangle.Empty;

            NativeMethods.RECT r;
            if (!NativeMethods.GetWindowRect(hwnd, out r)) return Rectangle.Empty;

            int width = r.Right - r.Left;
            int height = r.Bottom - r.Top;
            if (width <= 0 || height <= 0) return Rectangle.Empty;
            return new Rectangle(r.Left, r.Top, width, height);
        }

        public void Dispose()
        {
            CloseOpenPrompts();
            DismissAll(false);
        }
    }

    public sealed class AgentSpokeEventArgs : EventArgs
    {
        public LiveAgent Agent { get; private set; }
        public ActivityKind Kind { get; private set; }
        public string Line { get; private set; }

        public AgentSpokeEventArgs(LiveAgent agent, ActivityKind kind, string line)
        {
            Agent = agent;
            Kind = kind;
            Line = line;
        }
    }

    public sealed class ActivityObservedEventArgs : EventArgs
    {
        public ActivityEvent Activity { get; private set; }
        public ActivityObservedEventArgs(ActivityEvent activity) { Activity = activity; }
    }
}
