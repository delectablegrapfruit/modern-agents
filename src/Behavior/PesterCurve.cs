using System;

namespace AgentWrangler.Behavior
{
    /// <summary>
    /// Turns the single 0..10 "pester" dial into every rate the engine needs.
    ///
    /// Rates that are intervals interpolate geometrically, because the difference
    /// between "every 15 minutes" and "every 8 minutes" is barely noticeable while the
    /// difference between "every 20 seconds" and "every 8 seconds" is the whole point.
    /// Probabilities interpolate linearly.
    /// </summary>
    public static class PesterCurve
    {
        public const int Min = 0;
        public const int Max = 10;

        public static int Clamp(int level)
        {
            if (level < Min) return Min;
            if (level > Max) return Max;
            return level;
        }

        /// <summary>
        /// Folds the global master dial into a profile's own level. A master of 5 is
        /// neutral, 10 roughly doubles every agent, 0 muzzles the whole roster.
        /// </summary>
        public static int Combine(int profileLevel, int masterLevel)
        {
            profileLevel = Clamp(profileLevel);
            masterLevel = Clamp(masterLevel);
            if (masterLevel == Min || profileLevel == Min) return Min;
            return Clamp((int)Math.Round(profileLevel * (masterLevel / 5.0)));
        }

        public static string LevelName(int level)
        {
            switch (Clamp(level))
            {
                case 0: return "Muzzled";
                case 1: return "Barely there";
                case 2: return "Polite";
                case 3: return "Chatty";
                case 4: return "Helpful";
                case 5: return "Clingy";
                case 6: return "Needy";
                case 7: return "Overbearing";
                case 8: return "Relentless";
                case 9: return "Unhinged";
                default: return "TOTAL SATURATION";
            }
        }

        public static string LevelBlurb(int level)
        {
            switch (Clamp(level))
            {
                case 0: return "Silent unless you poke it yourself.";
                case 1: return "Speaks up a couple of times an hour.";
                case 2: return "Notices the big things and lets the rest go.";
                case 3: return "Comments on most of what you do.";
                case 4: return "Offers to help, and means it.";
                case 5: return "Always somewhere on screen, always talking.";
                case 6: return "Follows you between windows.";
                case 7: return "Interrupts. Frequently. Asks again if you say no.";
                case 8: return "Barely stops for breath.";
                case 9: return "Talks over itself. Prompts steal focus.";
                default: return "Everything, all the time. You asked for this.";
            }
        }

        private static double Geometric(int level, double atZero, double atTen)
        {
            double t = Clamp(level) / 10.0;
            return atZero * Math.Pow(atTen / atZero, t);
        }

        private static double Linear(int level, double atZero, double atTen)
        {
            double t = Clamp(level) / 10.0;
            return atZero + (atTen - atZero) * t;
        }

        /// <summary>Average seconds between unprompted remarks.</summary>
        public static double NagIntervalSeconds(int level)
        {
            if (Clamp(level) == Min) return double.PositiveInfinity;
            return Geometric(level, 1800, 9);
        }

        /// <summary>Average seconds between moves for agents that wander.</summary>
        public static double MoveIntervalSeconds(int level)
        {
            if (Clamp(level) == Min) return double.PositiveInfinity;
            return Geometric(level, 600, 5);
        }

        /// <summary>Odds that an observed activity actually gets a comment.</summary>
        public static double ReactionChance(int level)
        {
            if (Clamp(level) == Min) return 0.0;
            return Linear(level, 0.02, 1.0);
        }

        /// <summary>Odds that a comment escalates into an offer of assistance.</summary>
        public static double AssistChance(int level)
        {
            if (Clamp(level) == Min) return 0.0;
            return Linear(level, 0.0, 0.40);
        }

        /// <summary>Minimum quiet time after a line, before this agent may speak again.</summary>
        public static double CooldownSeconds(int level)
        {
            if (Clamp(level) == Min) return double.PositiveInfinity;
            return Geometric(level, 240, 1.5);
        }

        /// <summary>Above this level the agent talks over its own unfinished sentences.</summary>
        public static bool InterruptsByDefault(int level)
        {
            return Clamp(level) >= 9;
        }

        /// <summary>Seconds an assist prompt waits before giving up and closing itself.</summary>
        public static int PromptTimeoutSeconds(int level)
        {
            return (int)Math.Round(Linear(level, 30, 12));
        }

        /// <summary>
        /// Spreads scheduled events out so they do not arrive on an audible metronome.
        /// Returns the interval scaled by a random factor in [0.55, 1.45].
        /// </summary>
        public static double Jitter(Random rng, double seconds)
        {
            if (double.IsInfinity(seconds) || double.IsNaN(seconds)) return seconds;
            return seconds * (0.55 + rng.NextDouble() * 0.9);
        }
    }
}
