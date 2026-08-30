using System;
using System.Collections.Generic;
using System.IO;
using System.Xml.Serialization;
using AgentWrangler.Behavior;
using AgentWrangler.Config;
using AgentWrangler.Library;

namespace AgentWrangler.Tests
{
    /// <summary>
    /// Checks the parts of the program that do not need Windows or a COM server: the
    /// pester curve, token substitution, phrasebook coverage, and the XML round trip that
    /// every setting depends on. Run with tools/smoke.sh.
    /// </summary>
    internal static class SmokeTest
    {
        private static int _failures;

        private static void Check(bool condition, string what)
        {
            if (condition)
            {
                Console.WriteLine("  ok    " + what);
            }
            else
            {
                Console.WriteLine("  FAIL  " + what);
                _failures++;
            }
        }

        public static int Main()
        {
            Console.WriteLine("== pester curve ==");
            PesterTable();
            CurveChecks();

            Console.WriteLine();
            Console.WriteLine("== master dial ==");
            CombineChecks();

            Console.WriteLine();
            Console.WriteLine("== phrasebook ==");
            PhrasebookChecks();

            Console.WriteLine();
            Console.WriteLine("== token substitution ==");
            FormatChecks();

            Console.WriteLine();
            Console.WriteLine("== xml round trip ==");
            RoundTripChecks();

            Console.WriteLine();
            Console.WriteLine(_failures == 0 ? "ALL CHECKS PASSED" : _failures + " CHECK(S) FAILED");
            return _failures == 0 ? 0 : 1;
        }

        private static void PesterTable()
        {
            Console.WriteLine("  lvl name                nag(s)   move(s)  react   cooldown(s)");
            for (int level = 0; level <= 10; level++)
            {
                Console.WriteLine(string.Format("  {0,3} {1,-18} {2,7} {3,8} {4,6:P0} {5,10}",
                    level,
                    PesterCurve.LevelName(level),
                    Fmt(PesterCurve.NagIntervalSeconds(level)),
                    Fmt(PesterCurve.MoveIntervalSeconds(level)),
                    PesterCurve.ReactionChance(level),
                    Fmt(PesterCurve.CooldownSeconds(level))));
            }
        }

        private static string Fmt(double seconds)
        {
            return double.IsInfinity(seconds) ? "never" : Math.Round(seconds, 1).ToString();
        }

        private static void CurveChecks()
        {
            Check(double.IsInfinity(PesterCurve.NagIntervalSeconds(0)), "level 0 never nags");
            Check(PesterCurve.ReactionChance(0) == 0.0, "level 0 never reacts");
            Check(Math.Abs(PesterCurve.ReactionChance(10) - 1.0) < 0.0001, "level 10 always reacts");

            bool nagMonotonic = true, moveMonotonic = true, coolMonotonic = true;
            for (int level = 2; level <= 10; level++)
            {
                if (PesterCurve.NagIntervalSeconds(level) >= PesterCurve.NagIntervalSeconds(level - 1))
                    nagMonotonic = false;
                if (PesterCurve.MoveIntervalSeconds(level) >= PesterCurve.MoveIntervalSeconds(level - 1))
                    moveMonotonic = false;
                if (PesterCurve.CooldownSeconds(level) >= PesterCurve.CooldownSeconds(level - 1))
                    coolMonotonic = false;
            }
            Check(nagMonotonic, "nag interval shortens with every level");
            Check(moveMonotonic, "move interval shortens with every level");
            Check(coolMonotonic, "cooldown shortens with every level");

            Check(PesterCurve.Clamp(-5) == 0 && PesterCurve.Clamp(99) == 10, "levels are clamped to 0..10");

            var rng = new Random(1234);
            bool jitterInRange = true;
            for (int i = 0; i < 500; i++)
            {
                double j = PesterCurve.Jitter(rng, 100);
                if (j < 55 || j > 145) jitterInRange = false;
            }
            Check(jitterInRange, "jitter stays within 55%..145% of the interval");
            Check(double.IsInfinity(PesterCurve.Jitter(rng, double.PositiveInfinity)),
                  "jitter leaves 'never' alone");
        }

        private static void CombineChecks()
        {
            Check(PesterCurve.Combine(5, 5) == 5, "master 5 leaves a level alone");
            Check(PesterCurve.Combine(0, 10) == 0, "a muzzled agent stays muzzled at master 10");
            Check(PesterCurve.Combine(9, 0) == 0, "master 0 muzzles everyone");
            Check(PesterCurve.Combine(6, 10) == 10, "master 10 doubles and clamps");
            Check(PesterCurve.Combine(4, 10) == 8, "master 10 doubles level 4");
            Check(PesterCurve.Combine(8, 2) == 3, "master 2 cuts level 8 down");
        }

        private static void PhrasebookChecks()
        {
            Phrasebook book = BuildDefault();
            var rng = new Random(7);

            int missing = 0;
            foreach (ActivityKind kind in Enum.GetValues(typeof(ActivityKind)))
            {
                foreach (Persona persona in Enum.GetValues(typeof(Persona)))
                {
                    if (string.IsNullOrEmpty(book.PickLine(kind, persona, rng)))
                    {
                        Console.WriteLine("        no line for " + kind + " / " + persona);
                        missing++;
                    }
                }
            }
            Check(missing == 0, "every activity has a line for every personality");

            // Personas must actually differ, or the setting is decorative.
            var chirpy = new HashSet<string>();
            var gremlin = new HashSet<string>();
            for (int i = 0; i < 400; i++)
            {
                chirpy.Add(book.PickLine(ActivityKind.Nag, Persona.Chirpy, rng));
                gremlin.Add(book.PickLine(ActivityKind.Nag, Persona.Gremlin, rng));
            }
            chirpy.IntersectWith(gremlin);
            Check(chirpy.Count == 0, "personalities draw from different lines");

            var offerless = new List<string>();
            foreach (ActivityKind kind in Enum.GetValues(typeof(ActivityKind)))
            {
                AssistOffer offer = book.PickOffer(kind, Persona.Chirpy, rng, new List<string>());
                if (offer == null) offerless.Add(kind.ToString());
            }
            Check(offerless.Count < Enum.GetValues(typeof(ActivityKind)).Length,
                  "at least some activities can turn into an offer of help");
            Console.WriteLine("        activities with no offer: " + string.Join(", ", offerless.ToArray()));

            var excluded = new List<string> { "openfolder" };
            bool respected = true;
            for (int i = 0; i < 200; i++)
            {
                AssistOffer offer = book.PickOffer(ActivityKind.DownloadFinished, Persona.Chirpy, rng, excluded);
                if (offer != null && offer.Topic == "openfolder") respected = false;
            }
            Check(respected, "'never ask again' topics are never offered again");

            int lines = 0;
            foreach (PhraseBank bank in book.Banks) lines += bank.Lines.Count;
            Console.WriteLine("        " + book.Banks.Count + " banks, " + lines + " lines, " +
                              book.Offers.Count + " offers");
        }

        private static Phrasebook BuildDefault()
        {
            // DefaultPhrasebook is internal; reach it the way the program does.
            string path = Path.Combine(Path.GetTempPath(), "aw-default-" + Guid.NewGuid().ToString("N") + ".xml");
            try
            {
                return Phrasebook.LoadOrCreate(path);
            }
            finally
            {
                if (File.Exists(path)) File.Delete(path);
            }
        }

        private static void FormatChecks()
        {
            var ev = new ActivityEvent(ActivityKind.DownloadFinished, "holiday.jpg")
                .With("file", "holiday.jpg")
                .With("folder", "Downloads");

            string filled = Phrasebook.Format("{file} landed in {folder}.", ev, "Buddy", 3);
            Check(filled == "holiday.jpg landed in Downloads.", "known tokens are substituted");

            string vague = Phrasebook.Format("Look at {app}!", ev, "Buddy", 3);
            Check(vague == "Look at that program!", "unknown tokens fall back to a stand-in");
            Check(!vague.Contains("{"), "no braces survive into a spoken line");

            Check(Phrasebook.Format("I am {agent}.", ev, "Buddy", 3) == "I am Buddy.", "{agent} is the agent name");
            Check(Phrasebook.Format("That is {count}.", ev, "Buddy", 42) == "That is 42.", "{count} is the line number");
            Check(Phrasebook.Format("Nothing to do here.", ev, "Buddy", 1) == "Nothing to do here.",
                  "a line with no tokens is untouched");
            Check(Phrasebook.Format("Unbalanced {file", ev, "Buddy", 1) == "Unbalanced {file",
                  "an unclosed brace does not throw");
            Check(Phrasebook.Format("", ev, "Buddy", 1) == "", "an empty line is safe");

            // Every default line must survive formatting with an event that has no tokens.
            Phrasebook book = BuildDefault();
            var bare = new ActivityEvent(ActivityKind.Nag, "");
            bool clean = true;
            foreach (PhraseBank bank in book.Banks)
            {
                foreach (string line in bank.Lines)
                {
                    string result = Phrasebook.Format(line, bare, "Buddy", 1);
                    if (result.Contains("{") || result.Contains("}")) { clean = false; Console.WriteLine("        " + result); }
                }
            }
            Check(clean, "no built-in line leaves braces showing when tokens are missing");
        }

        private static void RoundTripChecks()
        {
            var settings = new AppSettings();
            settings.MasterPester = 8;
            settings.LibraryFolders.Add(@"C:\Windows\msagent\chars");
            settings.WatchedFolders.Add(@"C:\Users\test\Downloads");

            var profile = new AgentProfile
            {
                DisplayName = "Buddy",
                CharacterPath = @"C:\Windows\msagent\chars\merlin.acs",
                Pester = 9,
                Persona = Persona.Gremlin,
                Movement = MovementStyle.FollowCursor,
                MoveSpeed = MoveSpeed.Fast,
                EvasiveDecline = true
            };
            profile.SetReaction(ActivityKind.AppFocused, false);
            settings.Profiles.Add(profile);

            var info = new CharacterFileInfo { Path = profile.CharacterPath, Name = "Merlin", SizeBytes = 4096 };
            info.Animations.Add("Greet");
            info.Animations.Add("Wave");
            info.ProbedUtc = DateTime.UtcNow;
            settings.CharacterCache.Add(info);

            string path = Path.Combine(Path.GetTempPath(), "aw-settings-" + Guid.NewGuid().ToString("N") + ".xml");
            try
            {
                SettingsStore.Save(settings);   // exercises the real save path too
            }
            catch (Exception ex)
            {
                Console.WriteLine("        (real settings path unavailable: " + ex.Message + ")");
            }

            try
            {
                var serializer = new XmlSerializer(typeof(AppSettings));
                using (var writer = new StreamWriter(path)) serializer.Serialize(writer, settings);

                AppSettings loaded;
                using (var reader = new StreamReader(path)) loaded = (AppSettings)serializer.Deserialize(reader);

                Check(loaded.MasterPester == 8, "master level survives the round trip");
                Check(loaded.Profiles.Count == 1, "profiles survive the round trip");

                AgentProfile back = loaded.Profiles[0];
                Check(back.DisplayName == "Buddy", "profile name survives");
                Check(back.Persona == Persona.Gremlin, "personality survives");
                Check(back.Movement == MovementStyle.FollowCursor, "movement style survives");
                Check(back.MoveSpeed == MoveSpeed.Fast && back.MoveDurationMs == 350, "move speed maps to a duration");
                Check(back.EvasiveDecline, "toggles survive");
                Check(!back.ReactsTo(ActivityKind.AppFocused), "a switched-off reaction stays off");
                Check(back.ReactsTo(ActivityKind.ClipboardCopy), "the other reactions stay on");
                Check(back.Reactions.Count == profile.Reactions.Count,
                      "reactions are replaced on load, not merged with the defaults");

                // An agent with everything switched off must stay switched off.
                var silent = new AppSettings();
                var mute = new AgentProfile { DisplayName = "Mute" };
                mute.Reactions.Clear();
                silent.Profiles.Add(mute);

                string mutePath = path + ".mute";
                using (var writer = new StreamWriter(mutePath)) serializer.Serialize(writer, silent);
                AppSettings silentBack;
                using (var reader = new StreamReader(mutePath)) silentBack = (AppSettings)serializer.Deserialize(reader);
                File.Delete(mutePath);
                Check(silentBack.Profiles[0].Reactions.Count == 0, "an agent set to react to nothing stays that way");
                Check(back.Id == profile.Id, "profile identity survives");

                Check(loaded.CharacterCache.Count == 1 &&
                      loaded.CharacterCache[0].Animations.Count == 2 &&
                      loaded.CharacterCache[0].Name == "Merlin",
                      "cached probe results survive");
                Check(loaded.LibraryFolders.Count == 1 && loaded.WatchedFolders.Count == 1,
                      "folder lists survive");

                Console.WriteLine("        settings.xml is " + new FileInfo(path).Length + " bytes");
            }
            finally
            {
                if (File.Exists(path)) File.Delete(path);
            }

            // The phrasebook is written and re-read on every run, so it must round trip too.
            string bookPath = Path.Combine(Path.GetTempPath(), "aw-book-" + Guid.NewGuid().ToString("N") + ".xml");
            try
            {
                Phrasebook first = Phrasebook.LoadOrCreate(bookPath);
                Check(File.Exists(bookPath), "a starter phrasebook is written on first run");

                Phrasebook second = Phrasebook.LoadOrCreate(bookPath);
                Check(second.Banks.Count == first.Banks.Count, "the written phrasebook reads back identically");
                Check(second.Offers.Count == first.Offers.Count, "offers read back too");

                File.WriteAllText(bookPath, "this is not xml at all");
                Phrasebook broken = Phrasebook.LoadOrCreate(bookPath);
                Check(broken != null && broken.Banks.Count > 0, "a corrupt phrasebook falls back to the defaults");
            }
            finally
            {
                if (File.Exists(bookPath)) File.Delete(bookPath);
            }
        }
    }
}
