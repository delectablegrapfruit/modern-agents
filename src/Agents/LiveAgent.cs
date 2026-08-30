using System;
using System.Collections.Generic;
using System.Drawing;
using AgentWrangler.Config;

namespace AgentWrangler.Agents
{
    /// <summary>
    /// One character that is currently loaded and on screen, plus the scheduling state the
    /// pester engine keeps for it.
    ///
    /// Every method here is a guarded wrapper around a COM call: the Agent server can fail
    /// for reasons entirely outside this program (a character with a missing animation, the
    /// server being restarted underneath us), and a single bad call must not take down the
    /// whole roster. Repeated failures raise <see cref="Faulted"/> so the roster can retire
    /// the agent instead of hammering a dead object.
    /// </summary>
    public sealed class LiveAgent
    {
        /// <summary>Consecutive COM failures tolerated before the agent is considered dead.</summary>
        private const int FaultThreshold = 5;

        private readonly object _character;
        private int _consecutiveFaults;

        public LiveAgent(AgentProfile profile, string characterId, object character,
                         IEnumerable<string> availableAnimations)
        {
            Profile = profile;
            CharacterId = characterId;
            _character = character;

            Animations = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (availableAnimations != null)
                foreach (string a in availableAnimations)
                    if (!string.IsNullOrEmpty(a)) Animations.Add(a);

            RecentSubjects = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
            SummonedAt = DateTime.Now;
            LastSpokeAt = DateTime.MinValue;
            LastPromptAt = DateTime.MinValue;
        }

        public AgentProfile Profile { get; private set; }
        public string CharacterId { get; private set; }

        /// <summary>Animation names this character actually has. Play() ignores anything else.</summary>
        public HashSet<string> Animations { get; private set; }

        public string Name
        {
            get
            {
                return string.IsNullOrEmpty(Profile.DisplayName)
                    ? CharacterId
                    : Profile.DisplayName;
            }
        }

        // ---- scheduling state ------------------------------------------------------
        public DateTime SummonedAt { get; set; }
        public DateTime NextNagAt { get; set; }
        public DateTime NextMoveAt { get; set; }
        public DateTime LastSpokeAt { get; set; }
        public DateTime LastPromptAt { get; set; }
        public string LastLine { get; set; }
        public int LinesSpoken { get; set; }

        /// <summary>Recently commented-on subjects, so the agent does not repeat itself.</summary>
        public Dictionary<string, DateTime> RecentSubjects { get; private set; }

        /// <summary>Pester level after the master dial is folded in. Recomputed every tick.</summary>
        public int EffectivePester { get; set; }

        /// <summary>The character's own drawn size, before any scaling is applied.</summary>
        public Size NativeSize { get; set; }

        /// <summary>Perching agents alternate between their corner and a short excursion.</summary>
        public bool AwayFromHome { get; set; }

        /// <summary>Current position around the orbit, in radians.</summary>
        public double OrbitAngle { get; set; }

        /// <summary>Where the pointer was when a following agent last moved.</summary>
        public Point LastFollowedCursor { get; set; }

        /// <summary>True once the character has failed too many COM calls to be useful.</summary>
        public bool Faulted { get { return _consecutiveFaults >= FaultThreshold; } }

        public bool IsShown { get; private set; }

        /// <summary>Set while an assist prompt owned by this agent is open.</summary>
        public bool PromptOpen { get; set; }

        // ---- guarded COM calls -----------------------------------------------------

        private void Guard(string what, Action action)
        {
            try
            {
                action();
                _consecutiveFaults = 0;
            }
            catch (Exception ex)
            {
                _consecutiveFaults++;
                Diagnostics.Warn(Name + ": " + what + " failed (" + _consecutiveFaults + "/" +
                                 FaultThreshold + ") -- " + ex.Message);
            }
        }

        private T Guard<T>(string what, Func<T> func, T fallback)
        {
            try
            {
                T result = func();
                _consecutiveFaults = 0;
                return result;
            }
            catch (Exception ex)
            {
                _consecutiveFaults++;
                Diagnostics.Warn(Name + ": " + what + " failed (" + _consecutiveFaults + "/" +
                                 FaultThreshold + ") -- " + ex.Message);
                return fallback;
            }
        }

        public void Show()
        {
            Guard("Show", delegate
            {
                dynamic character = _character;
                character.Show(false);
                IsShown = true;
            });
        }

        public void Hide()
        {
            Guard("Hide", delegate
            {
                dynamic character = _character;
                character.Hide(false);
                IsShown = false;
            });
        }

        /// <summary>
        /// Says a line. The word balloon appears whether or not a speech engine is
        /// installed, so this works on a bare Windows 7 box with no voices.
        /// </summary>
        public void Speak(string text)
        {
            if (string.IsNullOrEmpty(text)) return;

            if (Profile.Interrupt) StopCurrent();

            Guard("Speak", delegate
            {
                dynamic character = _character;
                character.Speak(text);
            });

            LastLine = text;
            LastSpokeAt = DateTime.Now;
            LinesSpoken++;
        }

        /// <summary>Shows a line in a thought balloon rather than saying it.</summary>
        public void Think(string text)
        {
            if (string.IsNullOrEmpty(text)) return;
            Guard("Think", delegate
            {
                dynamic character = _character;
                character.Think(text);
            });
            LastLine = text;
            LastSpokeAt = DateTime.Now;
            LinesSpoken++;
        }

        /// <summary>
        /// Queues an animation, skipping silently if this character does not have it.
        /// Characters vary wildly in which of the standard animations they define.
        /// </summary>
        public void Play(string animation)
        {
            if (string.IsNullOrEmpty(animation)) return;
            if (Animations.Count > 0 && !Animations.Contains(animation)) return;

            Guard("Play(" + animation + ")", delegate
            {
                dynamic character = _character;
                character.Play(animation);
            });
        }

        public void MoveTo(int x, int y, int durationMs)
        {
            short sx = ToAgentCoordinate(x);
            short sy = ToAgentCoordinate(y);
            Guard("MoveTo", delegate
            {
                dynamic character = _character;
                character.MoveTo(sx, sy, durationMs);
            });
        }

        public void GestureAt(int x, int y)
        {
            short sx = ToAgentCoordinate(x);
            short sy = ToAgentCoordinate(y);
            Guard("GestureAt", delegate
            {
                dynamic character = _character;
                character.GestureAt(sx, sy);
            });
        }

        /// <summary>
        /// The Agent interfaces take 16-bit screen coordinates. Clamping keeps a very wide
        /// multi-monitor desktop from wrapping a large X into a negative one and teleporting
        /// the character to the far side of the screen.
        /// </summary>
        private static short ToAgentCoordinate(int value)
        {
            if (value < short.MinValue) return short.MinValue;
            if (value > short.MaxValue) return short.MaxValue;
            return (short)value;
        }

        /// <summary>Drops anything queued so the next line starts immediately.</summary>
        public void StopCurrent()
        {
            Guard("Stop", delegate
            {
                dynamic character = _character;
                character.Stop();
            });
        }

        public void SetSoundEffects(bool on)
        {
            Guard("SoundEffectsOn", delegate
            {
                dynamic character = _character;
                character.SoundEffectsOn = on;
            });
        }

        /// <summary>Reads the size the character was authored at.</summary>
        public Size ReadSize()
        {
            return Guard("Size", delegate
            {
                dynamic character = _character;
                return new Size((int)character.Width, (int)character.Height);
            }, Size.Empty);
        }

        /// <summary>Redraws the character at a percentage of its own size.</summary>
        public void ApplyScale(int percent)
        {
            if (NativeSize.IsEmpty || percent <= 0) return;

            short width = ToAgentCoordinate(Math.Max(8, NativeSize.Width * percent / 100));
            short height = ToAgentCoordinate(Math.Max(8, NativeSize.Height * percent / 100));

            Guard("Resize", delegate
            {
                dynamic character = _character;
                character.Width = width;
                character.Height = height;
            });
        }

        /// <summary>
        /// Switches the speech voice. An empty id leaves whatever the character was
        /// authored with in place.
        /// </summary>
        public void ApplyVoice(string voiceId)
        {
            if (string.IsNullOrEmpty(voiceId)) return;

            Guard("Voice", delegate
            {
                dynamic character = _character;
                character.TTSModeID = voiceId;
            });
        }

        /// <summary>Screen rectangle the character occupies, or Empty if it cannot be read.</summary>
        public Rectangle Bounds
        {
            get
            {
                return Guard("Bounds", delegate
                {
                    dynamic character = _character;
                    return new Rectangle((int)character.Left, (int)character.Top,
                                         (int)character.Width, (int)character.Height);
                }, Rectangle.Empty);
            }
        }

        public Point Center
        {
            get
            {
                Rectangle b = Bounds;
                if (b.IsEmpty) return Point.Empty;
                return new Point(b.Left + b.Width / 2, b.Top + b.Height / 2);
            }
        }

        /// <summary>
        /// True if this agent has already commented on the same thing inside the window.
        /// Also prunes stale entries so the dictionary cannot grow without bound.
        /// </summary>
        public bool RecentlyMentioned(string dedupeKey, TimeSpan window)
        {
            DateTime now = DateTime.Now;

            if (RecentSubjects.Count > 64)
            {
                var stale = new List<string>();
                foreach (var pair in RecentSubjects)
                    if (now - pair.Value > TimeSpan.FromMinutes(10)) stale.Add(pair.Key);
                foreach (string key in stale) RecentSubjects.Remove(key);
            }

            DateTime when;
            if (RecentSubjects.TryGetValue(dedupeKey, out when) && now - when < window) return true;

            RecentSubjects[dedupeKey] = now;
            return false;
        }
    }
}
