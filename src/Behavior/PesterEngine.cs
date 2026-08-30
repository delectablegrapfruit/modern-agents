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

        /// <summary>Pointer movement, in pixels, before a follower bothers to re-position.</summary>
        private const int FollowDeadZone = 110;

        /// <summary>Gap left between a following character and the pointer.</summary>
        private const int FollowGap = 40;

        /// <summary>Arc covered by one step of an orbit.</summary>
        private const double OrbitStepRadians = Math.PI / 7;

        /// <summary>Odds that a perching agent leaves its corner instead of settling.</summary>
        private const double ExcursionChance = 0.3;

        private readonly AppSettings _settings;
        private readonly AgentRoster _roster;
        private readonly ActivityBus _bus;
        private readonly Random _rng = new Random();

        private readonly List<Ui.AssistPrompt> _openPrompts = new List<Ui.AssistPrompt>();
        private readonly LineRotation _rotation = new LineRotation();

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
            set
            {
                _phrasebook = value ?? DefaultPhrasebook.Build();
                _rotation.Clear();
            }
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
            agent.NextMoveAt = now.AddSeconds(PesterCurve.Jitter(_rng, MoveIntervalFor(agent)));

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
            double seconds = PesterCurve.Jitter(_rng, MoveIntervalFor(agent));
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
            string template = _phrasebook.PickLine(ev.Kind, agent.Profile.Persona, _rng,
                                                   _rotation, _settings.RandomDialogue);
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

            AssistOffer offer = _phrasebook.PickOffer(ev.Kind, agent.Profile.Persona, _rng);
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
                case AssistAnswer.Never:
                    SayLiteral(agent, ev.Kind, Phrasebook.Format(offer.Declined, ev, agent.Name, agent.LinesSpoken));
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

        /// <summary>How often each style wants to move, relative to the pester interval.</summary>
        private static double MoveIntervalFor(LiveAgent agent)
        {
            double baseline = PesterCurve.MoveIntervalSeconds(agent.EffectivePester);

            switch (agent.Profile.Movement)
            {
                case MovementStyle.Stay:
                    return double.PositiveInfinity;

                case MovementStyle.FollowCursor:
                    // Following has to keep pace with the pointer to look like following at
                    // all, so it runs on its own short clock rather than the pester one.
                    return Math.Min(baseline, 1.5);

                case MovementStyle.Orbit:
                    // Frequent small steps around the circle.
                    return Math.Min(baseline * 0.35, 6.0);

                case MovementStyle.Perch:
                    return baseline * 1.6;

                default:
                    return baseline;
            }
        }

        /// <summary>Moves an agent according to its style. Placement avoids the others.</summary>
        public void MoveAgent(LiveAgent agent, bool instant)
        {
            if (agent.Profile.Movement == MovementStyle.Stay && !instant) return;

            Rectangle bounds = agent.Bounds;
            Size size = bounds.IsEmpty ? new Size(128, 128) : bounds.Size;

            Point? target = PickTarget(agent, size);
            if (!target.HasValue) return;

            agent.MoveTo(target.Value.X, target.Value.Y, instant ? 0 : MoveDurationFor(agent));
        }

        /// <summary>
        /// A follower that takes two seconds to arrive is always somewhere the pointer used
        /// to be, so following is capped short whatever the configured speed.
        /// </summary>
        private static int MoveDurationFor(LiveAgent agent)
        {
            int configured = agent.Profile.MoveDurationMs;
            if (agent.Profile.Movement == MovementStyle.FollowCursor) return Math.Min(configured, 400);
            return configured;
        }

        private Point? PickTarget(LiveAgent agent, Size size)
        {
            Rectangle work = WorkAreaFor(agent);

            for (int attempt = 0; attempt < PlacementAttempts; attempt++)
            {
                Point? proposed = ProposeTarget(agent, size, work);
                if (!proposed.HasValue) return null;

                Point candidate = Clamp(proposed.Value, size, work);
                if (attempt == PlacementAttempts - 1 || !CollidesWithOtherAgent(agent, candidate, size))
                    return candidate;
            }

            return null;
        }

        private Point? ProposeTarget(LiveAgent agent, Size size, Rectangle work)
        {
            switch (agent.Profile.Movement)
            {
                case MovementStyle.FollowCursor:
                    return FollowCursorTarget(agent, size);

                case MovementStyle.Orbit:
                    return OrbitTarget(agent, size, work);

                case MovementStyle.Perch:
                    return PerchTarget(agent, size, work);

                case MovementStyle.Stay:
                    return HomeCorner(agent, size, work);

                default:
                    return new Point(_rng.Next(work.Left, Math.Max(work.Left + 1, work.Right - size.Width)),
                                     _rng.Next(work.Top, Math.Max(work.Top + 1, work.Bottom - size.Height)));
            }
        }

        /// <summary>
        /// Parks beside the pointer, on whichever side leaves the character fully on screen.
        /// Skips the move entirely while the pointer has barely shifted, so a still mouse
        /// does not produce a twitching character.
        /// </summary>
        private static Point? FollowCursorTarget(LiveAgent agent, Size size)
        {
            Point cursor = CursorPosition();

            Point last = agent.LastFollowedCursor;
            if (!last.IsEmpty)
            {
                int dx = cursor.X - last.X;
                int dy = cursor.Y - last.Y;
                if (dx * dx + dy * dy < FollowDeadZone * FollowDeadZone) return null;
            }
            agent.LastFollowedCursor = cursor;

            Rectangle work = Screen.FromPoint(cursor).WorkingArea;

            // Prefer the right of the pointer; flip when there is no room.
            int x = cursor.X + FollowGap;
            if (x + size.Width > work.Right) x = cursor.X - size.Width - FollowGap;

            int y = cursor.Y - size.Height / 3;
            return new Point(x, y);
        }

        /// <summary>Advances a fixed step around the window in front, rather than jumping.</summary>
        private static Point OrbitTarget(LiveAgent agent, Size size, Rectangle work)
        {
            Rectangle window = ForegroundWindowBounds();
            if (window.IsEmpty) window = work;

            agent.OrbitAngle += OrbitStepRadians;
            if (agent.OrbitAngle > Math.PI * 2) agent.OrbitAngle -= Math.PI * 2;

            int radiusX = Math.Max(120, window.Width / 2);
            int radiusY = Math.Max(100, window.Height / 2);
            int centreX = window.Left + window.Width / 2;
            int centreY = window.Top + window.Height / 2;

            return new Point(centreX + (int)(Math.Cos(agent.OrbitAngle) * radiusX) - size.Width / 2,
                             centreY + (int)(Math.Sin(agent.OrbitAngle) * radiusY) - size.Height / 2);
        }

        /// <summary>
        /// Sits in its corner most of the time, leaving for a single excursion now and then
        /// and returning on the next move.
        /// </summary>
        private Point PerchTarget(LiveAgent agent, Size size, Rectangle work)
        {
            if (agent.AwayFromHome)
            {
                agent.AwayFromHome = false;
                return HomeCorner(agent, size, work);
            }

            if (_rng.NextDouble() > ExcursionChance) return HomeCorner(agent, size, work);

            agent.AwayFromHome = true;
            return new Point(_rng.Next(work.Left, Math.Max(work.Left + 1, work.Right - size.Width)),
                             _rng.Next(work.Top, Math.Max(work.Top + 1, work.Bottom - size.Height)));
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
