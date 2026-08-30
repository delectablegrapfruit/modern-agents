using System;
using System.Collections.Generic;
using System.Xml.Serialization;
using AgentWrangler.Behavior;

namespace AgentWrangler.Config
{
    /// <summary>Which bank of lines the agent draws from. Purely a personality skin.</summary>
    public enum Persona
    {
        Chirpy,     // relentlessly upbeat helper
        Corporate,  // sponsored, always selling something
        Gremlin,    // cryptic and slightly unwell
        Sleepy      // bored, put-upon, does the job anyway
    }

    public enum MovementStyle
    {
        Stay,          // never moves once placed
        Wander,        // random hops around the working area
        FollowCursor,  // parks itself next to the mouse
        Perch,         // returns to its home corner, with short excursions
        Orbit          // circles the foreground window
    }

    public enum MoveSpeed
    {
        Instant,
        Fast,
        Normal,
        Slow
    }

    /// <summary>
    /// Everything that makes one agent behave differently from another.
    /// Serialized to settings.xml, so all members are public and settable.
    /// </summary>
    public class AgentProfile
    {
        public string Id { get; set; }

        /// <summary>Full path of the .acs/.acf character file this profile drives.</summary>
        public string CharacterPath { get; set; }

        /// <summary>Name shown in the manager. Defaults to the character's own name.</summary>
        public string DisplayName { get; set; }

        /// <summary>Summon this agent automatically when the manager starts.</summary>
        public bool AutoSummon { get; set; }

        /// <summary>0 = muzzled, 10 = unhinged. Drives every rate in <see cref="PesterCurve"/>.</summary>
        public int Pester { get; set; }

        public Persona Persona { get; set; }
        public MovementStyle Movement { get; set; }
        public MoveSpeed MoveSpeed { get; set; }

        /// <summary>Corner the agent treats as home, 0..3 = TL, TR, BL, BR.</summary>
        public int HomeCorner { get; set; }

        /// <summary>May pop up an "want me to help with that?" prompt.</summary>
        public bool OfferAssistance { get; set; }

        /// <summary>Read a snippet of copied text back out loud. Off by default, on purpose.</summary>
        public bool QuoteClipboard { get; set; }

        /// <summary>Use the speech synthesiser when one is installed; the balloon shows either way.</summary>
        public bool SpeakAloud { get; set; }

        /// <summary>Cut off whatever the agent was saying rather than queueing behind it.</summary>
        public bool Interrupt { get; set; }

        /// <summary>The "No thanks" button slides away from the pointer. Deeply obnoxious.</summary>
        public bool EvasiveDecline { get; set; }

        /// <summary>Assist prompts take focus from whatever you were typing into.</summary>
        public bool StealFocus { get; set; }

        /// <summary>Seconds an agent stays quiet after speaking. 0 derives it from Pester.</summary>
        public int CooldownSecondsOverride { get; set; }

        /// <summary>Activity kinds this agent is allowed to comment on.</summary>
        [XmlIgnore]
        public List<ActivityKind> Reactions { get; set; }

        /// <summary>
        /// The serialized form of <see cref="Reactions"/>.
        ///
        /// It has to be an array. XmlSerializer populates a List property by calling Add on
        /// whatever the getter already returned, and the constructor pre-fills Reactions with
        /// the defaults -- so a list would merge the saved reactions into the defaults and an
        /// activity the user switched off would silently come back on the next run. An array
        /// property is assigned through its setter, replacing the defaults outright.
        ///
        /// A file with no Reactions element at all leaves the constructor's defaults alone,
        /// which is what a hand-written settings file should get.
        /// </summary>
        [XmlArray("Reactions")]
        [XmlArrayItem("Kind")]
        public ActivityKind[] ReactionsForXml
        {
            get { return Reactions == null ? new ActivityKind[0] : Reactions.ToArray(); }
            set { Reactions = new List<ActivityKind>(value ?? new ActivityKind[0]); }
        }

        // Animations, populated from the character's own animation list when it is probed.
        public string GreetAnimation { get; set; }
        public string AlertAnimation { get; set; }
        public string RestAnimation { get; set; }

        public AgentProfile()
        {
            Id = Guid.NewGuid().ToString("N");
            CharacterPath = string.Empty;
            DisplayName = string.Empty;
            AutoSummon = false;
            Pester = 5;
            Persona = Persona.Chirpy;
            Movement = MovementStyle.Wander;
            MoveSpeed = MoveSpeed.Normal;
            HomeCorner = 3;
            OfferAssistance = true;
            QuoteClipboard = false;
            SpeakAloud = true;
            Interrupt = false;
            EvasiveDecline = false;
            StealFocus = false;
            CooldownSecondsOverride = 0;
            Reactions = DefaultReactions();
            GreetAnimation = "Greet";
            AlertAnimation = "GetAttention";
            RestAnimation = "RestPose";
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

        public AgentProfile Clone()
        {
            var copy = (AgentProfile)MemberwiseClone();
            copy.Id = Guid.NewGuid().ToString("N");
            copy.Reactions = new List<ActivityKind>(Reactions ?? new List<ActivityKind>());
            return copy;
        }
    }
}
