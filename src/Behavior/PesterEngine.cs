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

        /// <summary>Gap left between a following character and the pointer.</summary>
        private const int FollowGap = 40;

        /// <summary>Odds that a perching agent leaves its corner instead of settling.</summary>
        private const double ExcursionChance = 0.3;

        /// <summary>How often the decision-making half of the engine runs.</summary>
        private const double BrainIntervalSeconds = 0.25;

        private readonly AppSettings _settings;
        private readonly AgentRoster _roster;
        private readonly ActivityBus _bus;
        private readonly Random _rng = new Random();

        private readonly List<Ui.AssistPrompt> _openPrompts = new List<Ui.AssistPrompt>();
        private readonly LineRotation _rotation = new LineRotation();

        private Phrasebook _phrasebook;
        private bool _panicHidden;
        private DateTime _lastFrameAt = DateTime.Now;
        private DateTime _lastBrainAt = DateTime.MinValue;

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

        /// <summary>Raised when an agent changes its own settings, so they can be saved.</summary>
        public event EventHandler AgentSettingsChanged;

        /// <summary>Set by the host so an agent can offer to watch a folder it noticed.</summary>
        public Action<string> FolderWatchRequested { get; set; }

        internal void NotifySettingsChanged()
        {
            EventHandler handler = AgentSettingsChanged;
            if (handler != null) handler(this, EventArgs.Empty);
        }

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
            RescheduleNag(agent, now);
            RescheduleMove(agent, now);

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

        /// <summary>
        /// One frame. Called often -- around twenty-five times a second -- because the
        /// continuous movement styles are integrated here. The decision-making runs on its
        /// own slower schedule inside.
        /// </summary>
        public void Tick()
        {
            DateTime frameAt = DateTime.Now;

            float dt = (float)(frameAt - _lastFrameAt).TotalSeconds;
            _lastFrameAt = frameAt;
            if (dt > 0f) StepMotion(frameAt, dt);

            if ((frameAt - _lastBrainAt).TotalSeconds < BrainIntervalSeconds) return;
            _lastBrainAt = frameAt;

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
            if (now < agent.SilentUntil) return false;

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

        /// <summary>Lets an assist action report back through the agent that offered it.</summary>
        internal void SpeakResult(LiveAgent agent, string line)
        {
            SayLiteral(agent, ActivityKind.Nag, line);
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

        /// <summary>Styles driven frame by frame rather than by scheduled hops.</summary>
        private static bool IsContinuous(MovementStyle style)
        {
            return style == MovementStyle.FollowCursor || style == MovementStyle.Orbit;
        }

        /// <summary>How often the hop-based styles want to move.</summary>
        private static double MoveIntervalFor(LiveAgent agent)
        {
            switch (agent.Profile.Movement)
            {
                case MovementStyle.Stay:
                case MovementStyle.FollowCursor:
                case MovementStyle.Orbit:
                    return double.PositiveInfinity;

                case MovementStyle.Perch:
                    return PesterCurve.MoveIntervalSeconds(agent.EffectivePester) * 1.6;

                default:
                    return PesterCurve.MoveIntervalSeconds(agent.EffectivePester);
            }
        }

        /// <summary>Cruising speed, in pixels per second, for a style and speed setting.</summary>
        private static float MaxSpeedFor(AgentProfile profile)
        {
            switch (profile.MoveSpeed)
            {
                case MoveSpeed.Instant: return 2000f;
                case MoveSpeed.Fast: return 1100f;
                case MoveSpeed.Slow: return 380f;
                default: return 700f;
            }
        }

        /// <summary>How eagerly velocity converges on what is wanted. Lower feels heavier.</summary>
        private static float ResponsivenessFor(AgentProfile profile)
        {
            switch (profile.MoveSpeed)
            {
                case MoveSpeed.Instant: return 22f;
                case MoveSpeed.Fast: return 9f;
                case MoveSpeed.Slow: return 3.2f;
                default: return 5.5f;
            }
        }

        /// <summary>Radians per second travelled around an orbit.</summary>
        private static double OrbitSpeedFor(AgentProfile profile)
        {
            switch (profile.MoveSpeed)
            {
                case MoveSpeed.Instant: return 1.15;
                case MoveSpeed.Fast: return 0.80;
                case MoveSpeed.Slow: return 0.22;
                default: return 0.45;
            }
        }

        /// <summary>
        /// One frame of continuous movement for every agent that uses it. Called far more
        /// often than the rest of the engine.
        /// </summary>
        private void StepMotion(DateTime now, float dt)
        {
            if (_settings.Muzzled || _panicHidden || _roster.Count == 0) return;

            Rectangle foreground = Rectangle.Empty;
            bool foregroundRead = false;

            foreach (LiveAgent agent in _roster.Agents)
            {
                AgentProfile profile = agent.Profile;
                if (!IsContinuous(profile.Movement)) continue;
                if (PesterCurve.Combine(profile.Pester, _settings.MasterPester) == PesterCurve.Min) continue;

                // Movement waits for the character to finish talking, then picks up from
                // wherever it actually ended up.
                if (now < agent.SpeakingUntil)
                {
                    agent.MotionReady = false;
                    continue;
                }

                if (!agent.MotionReady && !SeedMotion(agent)) continue;

                PointF target;
                if (profile.Movement == MovementStyle.Orbit)
                {
                    if (!foregroundRead)
                    {
                        foreground = ForegroundWindowBounds();
                        foregroundRead = true;
                    }
                    target = OrbitTarget(agent, foreground, dt);
                }
                else
                {
                    target = FollowTarget(agent);
                }

                MotionState next = Motion.Step(agent.Motion, target,
                                               MaxSpeedFor(profile),
                                               ResponsivenessFor(profile),
                                               profile.Movement == MovementStyle.Orbit ? 60f : 150f,
                                               dt);

                Rectangle work = WorkAreaFor(agent);
                next.Position = ClampF(next.Position, agent.MotionSize, work);
                agent.Motion = next;

                agent.MoveInstant((int)Math.Round(next.Position.X), (int)Math.Round(next.Position.Y));
            }
        }

        /// <summary>Reads the character's real position once, to start moving from.</summary>
        private static bool SeedMotion(LiveAgent agent)
        {
            Rectangle bounds = agent.Bounds;
            if (bounds.IsEmpty) return false;

            agent.MotionSize = bounds.Size;
            agent.Motion = new MotionState(new PointF(bounds.X, bounds.Y), new PointF(0f, 0f));
            agent.MotionReady = true;
            agent.ForgetIssuedPosition();
            return true;
        }

        /// <summary>
        /// A point on the circle around the window in front. The centre and radii are eased
        /// rather than assigned, so switching windows curves the path instead of snapping it.
        /// </summary>
        private static PointF OrbitTarget(LiveAgent agent, Rectangle foreground, float dt)
        {
            Rectangle window = foreground.IsEmpty ? WorkAreaFor(agent) : foreground;

            var wantedCentre = new PointF(window.Left + window.Width / 2f, window.Top + window.Height / 2f);
            var wantedRadius = new SizeF(Math.Max(140f, window.Width / 2f + 30f),
                                         Math.Max(110f, window.Height / 2f + 30f));

            if (agent.OrbitCentre.IsEmpty)
            {
                agent.OrbitCentre = wantedCentre;
                agent.OrbitRadius = wantedRadius;
            }
            else
            {
                agent.OrbitCentre = Motion.Approach(agent.OrbitCentre, wantedCentre, 2.2f, dt);
                agent.OrbitRadius = new SizeF(
                    Motion.Approach(agent.OrbitRadius.Width, wantedRadius.Width, 2.2f, dt),
                    Motion.Approach(agent.OrbitRadius.Height, wantedRadius.Height, 2.2f, dt));
            }

            agent.OrbitAngle += OrbitSpeedFor(agent.Profile) * dt;
            if (agent.OrbitAngle > Math.PI * 2) agent.OrbitAngle -= Math.PI * 2;

            return new PointF(
                agent.OrbitCentre.X + (float)Math.Cos(agent.OrbitAngle) * agent.OrbitRadius.Width
                    - agent.MotionSize.Width / 2f,
                agent.OrbitCentre.Y + (float)Math.Sin(agent.OrbitAngle) * agent.OrbitRadius.Height
                    - agent.MotionSize.Height / 2f);
        }

        /// <summary>
        /// A spot beside the pointer. The steering does the easing, so there is no dead
        /// zone: a small movement produces a small drift rather than nothing then a lurch.
        /// </summary>
        private static PointF FollowTarget(LiveAgent agent)
        {
            Point cursor = CursorPosition();
            Rectangle work = Screen.FromPoint(cursor).WorkingArea;

            float x = cursor.X + FollowGap;
            if (x + agent.MotionSize.Width > work.Right) x = cursor.X - agent.MotionSize.Width - FollowGap;

            return new PointF(x, cursor.Y - agent.MotionSize.Height / 3f);
        }

        private static PointF ClampF(PointF p, Size size, Rectangle work)
        {
            float maxX = Math.Max(work.Left, work.Right - size.Width);
            float maxY = Math.Max(work.Top, work.Bottom - size.Height);
            float x = p.X < work.Left ? work.Left : (p.X > maxX ? maxX : p.X);
            float y = p.Y < work.Top ? work.Top : (p.Y > maxY ? maxY : p.Y);
            return new PointF(x, y);
        }

        /// <summary>
        /// A scheduled hop, for the styles that are meant to move in discrete jumps. The
        /// Agent server animates the character across the gap itself.
        /// </summary>
        public void MoveAgent(LiveAgent agent, bool instant)
        {
            if (IsContinuous(agent.Profile.Movement) && !instant)
            {
                // Continuous movement has no "move now"; send it round the other side instead.
                agent.OrbitAngle += Math.PI;
                agent.MotionReady = false;
                return;
            }

            if (agent.Profile.Movement == MovementStyle.Stay && !instant) return;

            Rectangle bounds = agent.Bounds;
            Size size = bounds.IsEmpty ? new Size(128, 128) : bounds.Size;

            Point? target = PickTarget(agent, size);
            if (!target.HasValue) return;

            agent.MoveTo(target.Value.X, target.Value.Y, instant ? 0 : agent.Profile.MoveDurationMs);
            agent.MotionReady = false;
        }

        private Point? PickTarget(LiveAgent agent, Size size)
        {
            Rectangle work = WorkAreaFor(agent);

            for (int attempt = 0; attempt < PlacementAttempts; attempt++)
            {
                Point candidate = Clamp(ProposeTarget(agent, size, work), size, work);
                if (attempt == PlacementAttempts - 1 || !CollidesWithOtherAgent(agent, candidate, size))
                    return candidate;
            }

            return null;
        }

        private Point ProposeTarget(LiveAgent agent, Size size, Rectangle work)
        {
            switch (agent.Profile.Movement)
            {
                case MovementStyle.Perch:
                    return PerchTarget(agent, size, work);

                case MovementStyle.Stay:
                case MovementStyle.FollowCursor:
                case MovementStyle.Orbit:
                    return HomeCorner(agent, size, work);

                default:
                    return new Point(_rng.Next(work.Left, Math.Max(work.Left + 1, work.Right - size.Width)),
                                     _rng.Next(work.Top, Math.Max(work.Top + 1, work.Bottom - size.Height)));
            }
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

        /// <summary>Keeps the hopping agents from landing on top of one another.</summary>
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
            Rectangle bounds = agent.MotionReady
                ? new Rectangle((int)agent.Motion.Position.X, (int)agent.Motion.Position.Y,
                                agent.MotionSize.Width, agent.MotionSize.Height)
                : agent.Bounds;

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
