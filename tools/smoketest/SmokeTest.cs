using System;
using System.Collections.Generic;
using System.Drawing;
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
            Console.WriteLine("== elevated helper guards ==");
            ElevatedHelperChecks();

            Console.WriteLine();
            Console.WriteLine("== splitter sizing ==");
            SplitterChecks();

            Console.WriteLine();
            Console.WriteLine("== line rotation ==");
            RotationChecks();

            Console.WriteLine();
            Console.WriteLine("== per-section reset ==");
            ResetChecks();

            Console.WriteLine();
            Console.WriteLine("== continuous movement ==");
            MotionChecks();

            Console.WriteLine();
            Console.WriteLine("== holding still while typing ==");
            TypingChecks();

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
                if (book.PickOffer(kind, Persona.Chirpy, rng) == null) offerless.Add(kind.ToString());
            }
            Check(offerless.Count < Enum.GetValues(typeof(ActivityKind)).Length,
                  "at least some activities can turn into an offer of help");
            Console.WriteLine("        activities with no offer: " + string.Join(", ", offerless.ToArray()));

            // Declining an offer must never remove it from circulation.
            bool everyOfferStillReachable = true;
            for (int i = 0; i < 400; i++)
            {
                if (book.PickOffer(ActivityKind.DownloadFinished, Persona.Chirpy, rng) == null)
                    everyOfferStillReachable = false;
            }
            Check(everyOfferStillReachable, "offers are always available, never suppressed");

            int lines = 0;
            bool bannedPhrase = false;
            foreach (PhraseBank bank in book.Banks)
            {
                lines += bank.Lines.Count;
                foreach (string line in bank.Lines)
                    if (line.IndexOf("Hiya", StringComparison.OrdinalIgnoreCase) >= 0) bannedPhrase = true;
            }
            Check(!bannedPhrase, "no line uses the retired greeting");

            Console.WriteLine("        " + book.Banks.Count + " banks, " + lines + " lines, " +
                              book.Offers.Count + " offers, " +
                              Enum.GetValues(typeof(Persona)).Length + " personalities");

            Check(book.Offers.Count >= 50, "there are plenty of prompts to draw on");

            // Actions that report their own result must not also carry an Accepted line,
            // or the agent says two things at once.
            bool noDoubleReplies = true;
            foreach (AssistOffer offer in book.Offers)
            {
                bool reportsBack = offer.Action == AssistAction.DescribeFile ||
                                   offer.Action == AssistAction.CountFiles ||
                                   offer.Action == AssistAction.NameIdea ||
                                   offer.Action == AssistAction.WatchFolder ||
                                   offer.Action == AssistAction.Quieten;
                if (reportsBack && !string.IsNullOrEmpty(offer.Accepted)) noDoubleReplies = false;
                if (string.IsNullOrEmpty(offer.Declined)) noDoubleReplies = false;
            }
            Check(noDoubleReplies, "self-reporting prompts leave the reply to the action");

            // Every activity the user actually does should be able to raise a prompt.
            var promptless = new List<string>();
            foreach (ActivityKind kind in Enum.GetValues(typeof(ActivityKind)))
            {
                if (kind == ActivityKind.Summoned || kind == ActivityKind.Dismissed) continue;
                bool any = false;
                foreach (Persona persona in Enum.GetValues(typeof(Persona)))
                    if (book.PickOffer(kind, persona, rng) != null) any = true;
                if (!any) promptless.Add(kind.ToString());
            }
            Check(promptless.Count == 0,
                  "every observable activity can raise a prompt" +
                  (promptless.Count == 0 ? "" : " -- missing " + string.Join(", ", promptless.ToArray())));

            // Prompts should mostly talk about the thing that just happened.
            int specific = 0;
            foreach (AssistOffer offer in book.Offers)
                if (offer.Ask.IndexOf('{') >= 0) specific++;
            Check(specific * 2 >= book.Offers.Count,
                  "at least half the prompts name what you just did (" + specific + " of " +
                  book.Offers.Count + ")");
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

        /// <summary>
        /// The elevated helper runs with administrator rights, so the checks that stop it
        /// touching anything other than a character file in its own folder are worth
        /// testing directly. Exit codes: 0 done, 1 failed, 2 refused.
        /// </summary>
        private static void ElevatedHelperChecks()
        {
            string dir = Path.Combine(Path.GetTempPath(), "aw-elev-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);

            try
            {
                Check(ElevatedHelper.IsHelperInvocation(new[] { ElevatedHelper.DeleteSwitch, "x.acs" }),
                      "a helper invocation is recognised");
                Check(!ElevatedHelper.IsHelperInvocation(new string[0]), "no arguments is not a helper invocation");
                Check(!ElevatedHelper.IsHelperInvocation(new[] { "--restarted" }),
                      "the restart switch is not a helper invocation");

                // Refuses anything that is not a character file.
                string notACharacter = Path.Combine(dir, "payload.txt");
                File.WriteAllText(notACharacter, "important");
                Check(ElevatedHelper.Run(new[] { ElevatedHelper.DeleteSwitch, notACharacter }) == 2,
                      "refuses to delete a file that is not .acs or .acf");
                Check(File.Exists(notACharacter), "the refused file is still there");

                // Refuses a new name that is a path, which would move the file elsewhere.
                string character = Path.Combine(dir, "merlin.acs");
                File.WriteAllText(character, "pretend character");
                int escaped = ElevatedHelper.Run(new[]
                    { ElevatedHelper.RenameSwitch, character, Path.Combine("..", "escaped.acs") });
                Check(escaped == 2, "refuses a new name containing a path");
                Check(File.Exists(character), "the file is untouched after a refused rename");

                Check(ElevatedHelper.Run(new[] { ElevatedHelper.RenameSwitch, character, "merlin.exe" }) == 2,
                      "refuses to rename a character into another kind of file");

                // Refuses to overwrite.
                string occupied = Path.Combine(dir, "taken.acs");
                File.WriteAllText(occupied, "already here");
                Check(ElevatedHelper.Run(new[] { ElevatedHelper.RenameSwitch, character, "taken.acs" }) == 2,
                      "refuses to rename over an existing file");
                Check(File.ReadAllText(occupied) == "already here", "the existing file is intact");

                // The operations it is actually for.
                Check(ElevatedHelper.Run(new[] { ElevatedHelper.RenameSwitch, character, "wizard.acs" }) == 0,
                      "renames a character file");
                Check(File.Exists(Path.Combine(dir, "wizard.acs")) && !File.Exists(character),
                      "the rename really happened");

                // Read-only is cleared, the way Explorer does for a confirmed delete.
                string readOnly = Path.Combine(dir, "locked.acs");
                File.WriteAllText(readOnly, "x");
                File.SetAttributes(readOnly, FileAttributes.ReadOnly);
                Check(ElevatedHelper.Run(new[] { ElevatedHelper.DeleteSwitch, readOnly }) == 0,
                      "deletes a read-only character file");
                Check(!File.Exists(readOnly), "the read-only file is gone");

                Check(ElevatedHelper.Run(new[] { ElevatedHelper.DeleteSwitch, Path.Combine(dir, "ghost.acs") }) == 0,
                      "deleting something already gone is not an error");

                Check(ElevatedHelper.Run(new[] { ElevatedHelper.DeleteSwitch }) == 2,
                      "a missing argument is refused");
                Check(ElevatedHelper.Run(new[] { ElevatedHelper.RenameSwitch, character }) == 2,
                      "a rename with no new name is refused");
            }
            finally
            {
                try { Directory.Delete(dir, true); } catch { }
            }
        }

        /// <summary>
        /// A SplitContainer rejects any minimum or splitter position its current width
        /// cannot accommodate, and it starts life 150 pixels wide. Getting this arithmetic
        /// wrong threw out of the manager window's constructor and stopped the program
        /// from starting, so the rules are checked here directly.
        /// </summary>
        private static void SplitterChecks()
        {
            const int splitterWidth = 6;

            Check(!Ui.SplitterLayout.FitsIn(150, splitterWidth),
                  "a default-sized SplitContainer is correctly rejected as too narrow");
            Check(!Ui.SplitterLayout.FitsIn(500, splitterWidth), "500 pixels is still too narrow");
            Check(Ui.SplitterLayout.FitsIn(Ui.SplitterLayout.Panel1Min + Ui.SplitterLayout.Panel2Min + splitterWidth,
                                           splitterWidth),
                  "the exact sum of both minimums fits");
            Check(Ui.SplitterLayout.FitsIn(960, splitterWidth), "the real window width fits");

            Check(Ui.SplitterLayout.Distance(960, splitterWidth) == Ui.SplitterLayout.Preferred,
                  "a roomy window gets the preferred splitter position");

            // Every width that fits must produce a position both panels can live with,
            // which is exactly the condition the control validates.
            bool alwaysValid = true;
            for (int width = 400; width <= 4000; width++)
            {
                if (!Ui.SplitterLayout.FitsIn(width, splitterWidth)) continue;

                int distance = Ui.SplitterLayout.Distance(width, splitterWidth);
                if (distance < Ui.SplitterLayout.Panel1Min ||
                    width - splitterWidth - distance < Ui.SplitterLayout.Panel2Min)
                {
                    Console.WriteLine("        width " + width + " gave " + distance);
                    alwaysValid = false;
                }
            }
            Check(alwaysValid, "every width that fits yields a position the control would accept");

            int tight = Ui.SplitterLayout.Panel1Min + Ui.SplitterLayout.Panel2Min + splitterWidth;
            Check(Ui.SplitterLayout.Distance(tight, splitterWidth) == Ui.SplitterLayout.Panel1Min,
                  "at the tightest fitting width the splitter sits at the first minimum");

            // The window can never be resized below this, so the preferred position always applies.
            Check(Ui.SplitterLayout.Distance(814, splitterWidth) == Ui.SplitterLayout.Preferred,
                  "the smallest allowed window still gets the preferred position");
        }

        /// <summary>
        /// Every line is used twice per cycle, never twice in a row, and the cycle is shared
        /// across the roster.
        /// </summary>
        private static void RotationChecks()
        {
            var rng = new Random(99);
            var rotation = new LineRotation();
            var pool = new List<string> { "a", "b", "c", "d", "e" };
            int cycleLength = pool.Count * LineRotation.Appearances;

            var counts = new Dictionary<string, int>();
            var drawn = new List<string>();
            for (int i = 0; i < cycleLength; i++)
            {
                string line = rotation.Next("bank", pool, rng, false);
                drawn.Add(line);
                counts[line] = counts.ContainsKey(line) ? counts[line] + 1 : 1;
            }

            bool twiceEach = counts.Count == pool.Count;
            foreach (var pair in counts) if (pair.Value != LineRotation.Appearances) twiceEach = false;
            Check(twiceEach, "one cycle uses every line exactly " + LineRotation.Appearances + " times");

            // Run many cycles back to back: the counts must stay even and nothing may ever
            // repeat immediately, including over the join between one cycle and the next.
            var running = new Dictionary<string, int>();
            string previous = drawn[drawn.Count - 1];
            bool adjacentRepeat = false;
            bool everyCycleEven = true;

            for (int cycle = 0; cycle < 60; cycle++)
            {
                running.Clear();
                for (int i = 0; i < cycleLength; i++)
                {
                    string line = rotation.Next("bank", pool, rng, false);
                    if (line == previous) adjacentRepeat = true;
                    previous = line;
                    running[line] = running.ContainsKey(line) ? running[line] + 1 : 1;
                }
                if (running.Count != pool.Count) everyCycleEven = false;
                foreach (var pair in running)
                    if (pair.Value != LineRotation.Appearances) everyCycleEven = false;
            }

            Check(everyCycleEven, "every later cycle is even too");
            Check(!adjacentRepeat, "no line is ever used twice in a row, cycle joins included");

            // Pool sizes from tiny to large must all behave.
            bool allSizesFine = true;
            for (int size = 2; size <= 25; size++)
            {
                var sized = new List<string>();
                for (int i = 0; i < size; i++) sized.Add("line" + i);

                var fresh = new LineRotation();
                string last = null;
                var seen = new Dictionary<string, int>();
                for (int i = 0; i < size * LineRotation.Appearances * 3; i++)
                {
                    string line = fresh.Next("k", sized, rng, false);
                    if (line == last) allSizesFine = false;
                    last = line;
                    seen[line] = seen.ContainsKey(line) ? seen[line] + 1 : 1;
                }
                if (seen.Count != size) allSizesFine = false;
            }
            Check(allSizesFine, "pools from 2 to 25 lines all rotate evenly without repeats");

            // Interleaved callers share one sequence rather than each running their own.
            var shared = new LineRotation();
            var interleaved = new Dictionary<string, int>();
            for (int i = 0; i < cycleLength; i++)
            {
                string line = shared.Next("bank", pool, rng, false);
                interleaved[line] = interleaved.ContainsKey(line) ? interleaved[line] + 1 : 1;
            }
            bool sharedEven = interleaved.Count == pool.Count;
            foreach (var pair in interleaved) if (pair.Value != LineRotation.Appearances) sharedEven = false;
            Check(sharedEven, "interleaved callers share one rotation");

            Check(shared.TrackedBanks == 1, "one bank in play means one tracked cycle");
            shared.Next("other", pool, rng, false);
            Check(shared.TrackedBanks == 2, "a different bank rotates separately");

            bool sawRepeat = false;
            string last2 = null;
            var random = new LineRotation();
            for (int i = 0; i < 300; i++)
            {
                string line = random.Next("bank", pool, rng, true);
                if (line == last2) sawRepeat = true;
                last2 = line;
            }
            Check(sawRepeat, "true random can repeat a line back to back");

            Check(rotation.Next("bank", new List<string>(), rng, false) == null, "an empty bank yields nothing");
            Check(rotation.Next("solo", new List<string> { "only" }, rng, false) == "only",
                  "a single-line bank always yields that line");
        }

        /// <summary>
        /// Continuous movement must accelerate and decelerate rather than starting and
        /// stopping, converge on its target, and behave the same at any frame rate.
        /// </summary>
        private static void MotionChecks()
        {
            const float MaxSpeed = 700f;
            const float Responsiveness = 5.5f;
            const float ArriveRadius = 150f;
            const float Frame = 0.04f;

            var state = new MotionState(new PointF(0f, 0f), new PointF(0f, 0f));
            var target = new PointF(1200f, 0f);

            // Speed must ramp rather than jump straight to the maximum.
            state = Motion.Step(state, target, MaxSpeed, Responsiveness, ArriveRadius, Frame);
            float firstFrameSpeed = state.Speed;
            Check(firstFrameSpeed > 0f && firstFrameSpeed < MaxSpeed * 0.35f,
                  "it starts moving gently rather than at full speed");

            float previousSpeed = firstFrameSpeed;
            bool acceleratedSmoothly = true;
            for (int i = 0; i < 25; i++)
            {
                state = Motion.Step(state, target, MaxSpeed, Responsiveness, ArriveRadius, Frame);
                if (state.Speed < previousSpeed - 0.01f) acceleratedSmoothly = false;
                previousSpeed = state.Speed;
            }
            Check(acceleratedSmoothly, "speed keeps building while the target is far away");
            Check(previousSpeed > firstFrameSpeed * 2f, "it does get properly up to speed");
            Check(previousSpeed <= MaxSpeed + 0.5f, "it never exceeds the cruising speed");

            // Approaching the target it must slow down, not stop dead.
            for (int i = 0; i < 400; i++)
                state = Motion.Step(state, target, MaxSpeed, Responsiveness, ArriveRadius, Frame);

            float distance = Distance(state.Position, target);
            Check(distance < 4f, "it arrives at the target");
            Check(state.Speed < 20f, "it is barely moving once it arrives");

            // Sitting on the target it must stay there rather than jitter around it.
            var settled = state.Position;
            for (int i = 0; i < 100; i++)
                state = Motion.Step(state, target, MaxSpeed, Responsiveness, ArriveRadius, Frame);
            Check(Distance(state.Position, settled) < 4f, "it stays put once it has arrived");

            // A target that jumps produces a curve, not a teleport.
            var far = new MotionState(new PointF(0f, 0f), new PointF(0f, 0f));
            far = Motion.Step(far, new PointF(3000f, 3000f), MaxSpeed, Responsiveness, ArriveRadius, Frame);
            Check(Distance(far.Position, new PointF(0f, 0f)) < MaxSpeed * Frame + 1f,
                  "one frame moves at most one frame's worth of distance");

            // Same journey, different frame rates, comparable outcome.
            var coarse = new MotionState(new PointF(0f, 0f), new PointF(0f, 0f));
            var fine = new MotionState(new PointF(0f, 0f), new PointF(0f, 0f));
            for (int i = 0; i < 50; i++)
                coarse = Motion.Step(coarse, target, MaxSpeed, Responsiveness, ArriveRadius, 0.08f);
            for (int i = 0; i < 200; i++)
                fine = Motion.Step(fine, target, MaxSpeed, Responsiveness, ArriveRadius, 0.02f);
            Check(Distance(coarse.Position, fine.Position) < 60f,
                  "the frame rate barely changes where it ends up");

            // A stalled frame must not fling the character across the screen.
            var stalled = new MotionState(new PointF(0f, 0f), new PointF(MaxSpeed, 0f));
            stalled = Motion.Step(stalled, target, MaxSpeed, Responsiveness, ArriveRadius, 30f);
            Check(stalled.Position.X <= MaxSpeed * Motion.MaxFrameSeconds + 1f,
                  "a long stall is clamped to one frame of travel");

            Check(Motion.Step(state, target, MaxSpeed, Responsiveness, ArriveRadius, 0f).Position == state.Position,
                  "a zero-length frame changes nothing");

            float eased = Motion.Approach(0f, 100f, 3f, Frame);
            Check(eased > 0f && eased < 100f, "eased values move part of the way, not all of it");
        }

        /// <summary>
        /// The caret is the real signal and cannot be tested without a desktop, but the
        /// window-class fallback is a plain function and is worth pinning down: a false
        /// positive only holds an agent still, a false negative lets one walk through the
        /// sentence being typed.
        /// </summary>
        private static void TypingChecks()
        {
            string[] editable =
            {
                "Edit",
                "RichEdit",
                "RichEdit20W",
                "RICHEDIT50W",
                "WindowsForms10.EDIT.app.0.141b42a_r9_ad1",
                "TEdit",
                "Scintilla",
                "TextBox",
                "SearchTextBox",
                "TextField"
            };

            bool allEditableCaught = true;
            foreach (string name in editable)
                if (!AgentWrangler.Interop.TextEntry.LooksLikeTextInput(name)) allEditableCaught = false;
            Check(allEditableCaught, "the usual text control classes are recognised");

            string[] notEditable =
            {
                "Button",
                "Static",
                "Shell_TrayWnd",
                "Progman",
                "SysListView32",
                "SysTreeView32",
                "ComboLBox",
                "#32770",
                "Chrome_WidgetWin_1",
                "MozillaWindowClass",
                "ToolbarWindow32",
                ""
            };

            bool noFalsePositives = true;
            string offender = null;
            foreach (string name in notEditable)
            {
                if (AgentWrangler.Interop.TextEntry.LooksLikeTextInput(name))
                {
                    noFalsePositives = false;
                    if (offender == null) offender = name;
                }
            }
            Check(noFalsePositives, "ordinary window classes are left alone" +
                                    (offender == null ? "" : " -- matched " + offender));

            Check(!AgentWrangler.Interop.TextEntry.LooksLikeTextInput(null), "a null class name is safe");

            // The option has to default on, for a fresh install and for a settings file
            // written before it existed.
            Check(new AppSettings().PauseMovementWhileTyping, "holding still is on for a new install");

            var serializer = new XmlSerializer(typeof(AppSettings));
            const string olderFile =
                "<?xml version=\"1.0\"?><AgentWrangler xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">" +
                "<MasterPester>5</MasterPester></AgentWrangler>";

            using (var reader = new StringReader(olderFile))
            {
                var older = (AppSettings)serializer.Deserialize(reader);
                Check(older.PauseMovementWhileTyping,
                      "a settings file from before the option still gets it switched on");
            }

            var off = new AppSettings { PauseMovementWhileTyping = false };
            var writer = new StringWriter();
            serializer.Serialize(writer, off);
            using (var reader = new StringReader(writer.ToString()))
            {
                var back = (AppSettings)serializer.Deserialize(reader);
                Check(!back.PauseMovementWhileTyping, "switching it off is remembered");
            }
        }

        private static float Distance(PointF a, PointF b)
        {
            float dx = a.X - b.X;
            float dy = a.Y - b.Y;
            return (float)Math.Sqrt(dx * dx + dy * dy);
        }

        /// <summary>Each group of settings resets on its own without disturbing the others.</summary>
        private static void ResetChecks()
        {
            var profile = new AgentProfile
            {
                DisplayName = "Buddy",
                Pester = 10,
                Persona = Persona.Gremlin,
                Movement = MovementStyle.Orbit,
                SizePercent = 250,
                VoiceId = "some-voice",
                EvasiveDecline = true,
                GreetAnimation = "Wave"
            };
            profile.SetReaction(ActivityKind.Nag, false);

            profile.ResetSection(ProfileSection.Movement);
            Check(profile.Movement == MovementStyle.Wander, "movement resets");
            Check(profile.Pester == 10, "resetting movement leaves pestering alone");
            Check(profile.SizePercent == 250, "resetting movement leaves appearance alone");

            profile.ResetSection(ProfileSection.Appearance);
            Check(profile.SizePercent == 100 && profile.VoiceId == string.Empty, "appearance resets");
            Check(profile.EvasiveDecline, "resetting appearance leaves habits alone");
            Check(profile.DisplayName == "Buddy", "no reset touches the name");

            profile.ResetSection(ProfileSection.Habits);
            Check(!profile.EvasiveDecline, "habits reset");

            profile.ResetSection(ProfileSection.Reactions);
            Check(profile.ReactsTo(ActivityKind.Nag), "reactions reset");

            profile.ResetSection(ProfileSection.Pestering);
            Check(profile.Pester == 5, "pestering resets");

            profile.ResetSection(ProfileSection.Animations);
            Check(profile.GreetAnimation == "Greet", "animations reset");

            profile.SizePercent = 5000;
            Check(profile.ClampedSizePercent == AgentProfile.MaxSizePercent, "an absurd size is clamped");
            profile.SizePercent = 1;
            Check(profile.ClampedSizePercent == AgentProfile.MinSizePercent, "a tiny size is clamped");
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
                EvasiveDecline = true,
                SizePercent = 175,
                VoiceId = "test-voice"
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
                Check(back.SizePercent == 175, "size survives");
                Check(back.VoiceId == "test-voice", "voice choice survives");
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
                Check(loaded.MasterPester == settings.MasterPester && !loaded.RandomDialogue,
                      "the dialogue mode survives");

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
