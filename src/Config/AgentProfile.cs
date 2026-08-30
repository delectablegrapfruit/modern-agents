using System;
using System.Collections.Generic;
using System.Xml.Serialization;
using AgentWrangler.Behavior;

namespace AgentWrangler.Config
{
    /// <summary>Which bank of lines the agent draws from.</summary>
    public enum Persona
    {
        Chirpy,     // relentlessly upbeat helper
        Corporate,  // sponsored, always selling something
        Gremlin,    // cryptic and slightly unwell
        Sleepy,     // bored, put-upon, does the job anyway
        Bureaucrat, // procedural, logs everything, cites policy
        Fan         // an admirer, far too invested in you
    }

    public enum MovementStyle
    {
        Stay,          // placed once, never moves again
        Wander,        // hops to unrelated spots around the screen
        FollowCursor,  // shadows the pointer continuously
        Perch,         // lives in its corner, with occasional excursions
        Orbit          // circles the window you are working in
    }

    public enum MoveSpeed
    {
        Instant,
        Fast,
        Normal,
        Slow
    }

    /// <summary>Groups of settings that can be reset independently.</summary>
    public enum ProfileSection
    {
        Identity,
        Pestering,
        Movement,
        Appearance,
        Habits,
        Animations,
        Reactions
    }

    /// <summary>
    /// Everything that makes one agent behave differently from another. Serialized to
    /// settings.xml, so all members are public and settable.
    /// </summary>
    public class AgentProfile
    {
        public const int MinSizePercent = 25;
        public const int MaxSizePercent = 300;

        public string Id { get; set; }

        /// <summary>Full path of the .acs/.acf character file this profile drives.</summary>
        public string CharacterPath { get; set; }

        public string DisplayName { get; set; }

        public bool AutoSummon { get; set; }

        /// <summary>0 = muzzled, 10 = unhinged. Drives every rate in <see cref="PesterCurve"/>.</summary>
        public int Pester { get; set; }

        public Persona Persona { get; set; }
        public MovementStyle Movement { get; set; }
        public MoveSpeed MoveSpeed { get; set; }

        /// <summary>Corner the agent treats as home, 0..3 = TL, TR, BL, BR.</summary>
        public int HomeCorner { get; set; }

        /// <summary>Percentage of the character's own size to draw it at.</summary>
        public int SizePercent { get; set; }

        /// <summary>
        /// Speech token to speak with. Empty leaves the character with whichever voice it
        /// was authored to use.
        /// </summary>
        public string VoiceId { get; set; }

        public bool OfferAssistance { get; set; }

        /// <summary>Read a snippet of copied text back out loud. Off by default, on purpose.</summary>
        public bool QuoteClipboard { get; set; }

        public bool SpeakAloud { get; set; }

        /// <summary>Cut off whatever the agent was saying rather than queueing behind it.</summary>
        public bool Interrupt { get; set; }

        /// <summary>The "No thanks" button slides away from the pointer.</summary>
        public bool EvasiveDecline { get; set; }

        public bool StealFocus { get; set; }

        /// <summary>Seconds an agent stays quiet after speaking. 0 derives it from Pester.</summary>
        public int CooldownSecondsOverride { get; set; }

        /// <summary>Activity kinds this agent is allowed to comment on.</summary>
        [XmlIgnore]
        public List<ActivityKind> Reactions { get; set; }

        /// <summary>
        /// The serialized form of <see cref="Reactions"/>. It has to be an array:
        /// XmlSerializer populates a List property by calling Add on whatever the getter
        /// returned, and the constructor pre-fills Reactions with the defaults, so a list
        /// would merge rather than replace. An array is assigned through its setter.
        /// </summary>
        [XmlArray("Reactions")]
        [XmlArrayItem("Kind")]
        public ActivityKind[] ReactionsForXml
        {
            get { return Reactions == null ? new ActivityKind[0] : Reactions.ToArray(); }
            set { Reactions = new List<ActivityKind>(value ?? new ActivityKind[0]); }
        }

        public string GreetAnimation { get; set; }
        public string AlertAnimation { get; set; }
        public string RestAnimation { get; set; }

        public AgentProfile()
        {
            Id = Guid.NewGuid().ToString("N");
            CharacterPath = string.Empty;
            DisplayName = string.Empty;
            Reactions = DefaultReactions();

            ResetSection(ProfileSection.Pestering);
            ResetSection(ProfileSection.Movement);
            ResetSection(ProfileSection.Appearance);
            ResetSection(ProfileSection.Habits);
            ResetSection(ProfileSection.Animations);
            AutoSummon = false;
        }

        public static List<ActivityKind> DefaultReactions()
        {
            return new List<ActivityKind>
            {
                ActivityKind.ClipboardCopy,
                ActivityKind.DownloadStarted,
                ActivityKind.DownloadFinished,
                ActivityKind.FileCreated,
                ActivityKind.FileDeleted,
                ActivityKind.FileRenamed,
                ActivityKind.AppFocused,
                ActivityKind.AppLaunched,
                ActivityKind.UserIdle,
                ActivityKind.UserReturned,
                ActivityKind.Nag,
                ActivityKind.Summoned
            };
        }

        /// <summary>Puts one group of settings back to how a new agent starts out.</summary>
        public void ResetSection(ProfileSection section)
        {
            switch (section)
            {
                case ProfileSection.Identity:
                    Persona = Persona.Chirpy;
                    AutoSummon = false;
                    break;

                case ProfileSection.Pestering:
                    Pester = 5;
                    CooldownSecondsOverride = 0;
                    Interrupt = false;
                    break;

                case ProfileSection.Movement:
                    Movement = MovementStyle.Wander;
                    MoveSpeed = MoveSpeed.Normal;
                    HomeCorner = 3;
                    break;

                case ProfileSection.Appearance:
                    SizePercent = 100;
                    VoiceId = string.Empty;
                    SpeakAloud = true;
                    break;

                case ProfileSection.Habits:
                    OfferAssistance = true;
                    QuoteClipboard = false;
                    EvasiveDecline = false;
                    StealFocus = false;
                    break;

                case ProfileSection.Animations:
                    GreetAnimation = "Greet";
                    AlertAnimation = "GetAttention";
                    RestAnimation = "RestPose";
                    break;

                case ProfileSection.Reactions:
                    Reactions = DefaultReactions();
                    break;
            }
        }

        public bool ReactsTo(ActivityKind kind)
        {
            return Reactions != null && Reactions.Contains(kind);
        }

        public void SetReaction(ActivityKind kind, bool on)
        {
            if (Reactions == null) Reactions = new List<ActivityKind>();
            if (on)
            {
                if (!Reactions.Contains(kind)) Reactions.Add(kind);
            }
            else
            {
                Reactions.Remove(kind);
            }
        }

        /// <summary>Milliseconds passed to Character.MoveTo. Larger is slower; 0 teleports.</summary>
        [XmlIgnore]
        public int MoveDurationMs
        {
            get
            {
                switch (MoveSpeed)
                {
                    case MoveSpeed.Instant: return 0;
                    case MoveSpeed.Fast: return 350;
                    case MoveSpeed.Slow: return 2200;
                    default: return 1000;
                }
            }
        }

        [XmlIgnore]
        public int ClampedSizePercent
        {
            get
            {
                if (SizePercent < MinSizePercent) return MinSizePercent;
                if (SizePercent > MaxSizePercent) return MaxSizePercent;
                return SizePercent;
            }
        }

        public AgentProfile Clone()
        {
            var copy = (AgentProfile)MemberwiseClone();
            copy.Id = Guid.NewGuid().ToString("N");
            copy.Reactions = new List<ActivityKind>(Reactions ?? new List<ActivityKind>());
            return copy;
        }
    }
}
