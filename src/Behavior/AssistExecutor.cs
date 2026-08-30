using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Windows.Forms;
using AgentWrangler.Agents;

namespace AgentWrangler.Behavior
{
    /// <summary>
    /// Carries out an assist offer the user accepted.
    ///
    /// Everything here is harmless and reversible. An agent that interrupts every few
    /// seconds with a prompt whose decline buttons may be running away from the pointer
    /// must not be able to run a program, delete anything, or open a file that was just
    /// downloaded -- so it cannot. The most it does is open a folder, read something back,
    /// count what is in a directory, or turn itself down.
    /// </summary>
    internal static class AssistExecutor
    {
        /// <summary>How long an agent honours a promise to be quiet.</summary>
        private const int HushSeconds = 90;

        /// <summary>Directories bigger than this are reported approximately.</summary>
        private const int CountCeiling = 5000;

        public static void Execute(AssistAction action, ActivityEvent ev, LiveAgent agent, PesterEngine engine)
        {
            try
            {
                switch (action)
                {
                    case AssistAction.OpenFolder: OpenFolder(ev); break;
                    case AssistAction.CopyName: CopyName(ev); break;
                    case AssistAction.DescribeFile: DescribeFile(ev, agent, engine); break;
                    case AssistAction.CountFiles: CountFiles(ev, agent, engine); break;
                    case AssistAction.NameIdea: SuggestName(ev, agent, engine); break;
                    case AssistAction.WatchFolder: WatchFolder(ev, agent, engine); break;
                    case AssistAction.Quieten: Quieten(agent, engine); break;
                    case AssistAction.HushBriefly: Hush(agent); break;

                    case AssistAction.Reposition:
                        if (engine != null) engine.MoveAgent(agent, false);
                        break;

                    case AssistAction.CheckBackLater:
                        if (engine != null) engine.ScheduleSoonNag(agent, 15, 45);
                        break;

                    case AssistAction.Tip:
                    case AssistAction.Compliment:
                    case AssistAction.None:
                        // The line the agent already said was the entire favour.
                        break;
                }
            }
            catch (Exception ex)
            {
                Diagnostics.Error("Assist action " + action + " failed.", ex);
            }
        }

        /// <summary>
        /// Shows the file in Explorer, falling back to the plain folder. A download can be
        /// moved or deleted between the offer and the answer, in which case nothing happens.
        /// </summary>
        private static void OpenFolder(ActivityEvent ev)
        {
            string path = ev.Token("path");

            if (!string.IsNullOrEmpty(path) && File.Exists(path))
            {
                Process.Start(new ProcessStartInfo("explorer.exe", "/select,\"" + path + "\"")
                {
                    UseShellExecute = true
                });
                Diagnostics.Info("Opened Explorer at " + path);
                return;
            }

            string folder = FolderOf(path);
            if (!string.IsNullOrEmpty(folder) && Directory.Exists(folder))
            {
                Process.Start(new ProcessStartInfo("explorer.exe", "\"" + folder + "\"")
                {
                    UseShellExecute = true
                });
                Diagnostics.Info("Opened Explorer at " + folder);
                return;
            }

            Diagnostics.Warn("Nothing left to open for " + (path ?? "<no path>"));
        }

        private static void CopyName(ActivityEvent ev)
        {
            string name = ev.Token("file");
            if (string.IsNullOrEmpty(name)) name = ev.Subject;
            if (string.IsNullOrEmpty(name)) return;

            try
            {
                Clipboard.SetText(name);
                Diagnostics.Info("Copied \"" + name + "\" to the clipboard on request.");
            }
            catch (Exception ex)
            {
                Diagnostics.Warn("Clipboard write failed: " + ex.Message);
            }
        }

        private static void DescribeFile(ActivityEvent ev, LiveAgent agent, PesterEngine engine)
        {
            if (engine == null) return;

            string path = ev.Token("path");
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
            {
                engine.SpeakResult(agent, "It has gone. That was quick.");
                return;
            }

            var info = new FileInfo(path);
            double age = (DateTime.Now - info.LastWriteTime).TotalMinutes;
            string when = age < 2 ? "just now"
                        : age < 90 ? Math.Round(age) + " minutes ago"
                        : age < 60 * 36 ? Math.Round(age / 60) + " hours ago"
                        : "on " + info.LastWriteTime.ToShortDateString();

            engine.SpeakResult(agent, info.Name + " is " + DescribeSize(info.Length) +
                                      " and was last changed " + when + ".");
        }

        private static string DescribeSize(long bytes)
        {
            if (bytes < 1024) return bytes + " bytes";
            double kb = bytes / 1024.0;
            if (kb < 1024) return Math.Round(kb) + " KB";
            return Math.Round(kb / 1024.0, 1).ToString(CultureInfo.CurrentCulture) + " MB";
        }

        private static void CountFiles(ActivityEvent ev, LiveAgent agent, PesterEngine engine)
        {
            if (engine == null) return;

            string folder = FolderOf(ev.Token("path"));
            if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder))
            {
                engine.SpeakResult(agent, "I could not find that folder to count.");
                return;
            }

            int files;
            try
            {
                files = Directory.GetFiles(folder).Length;
            }
            catch (Exception ex)
            {
                Diagnostics.Warn("Could not count " + folder + ": " + ex.Message);
                engine.SpeakResult(agent, "That folder would not let me look inside.");
                return;
            }

            string count = files >= CountCeiling ? "more than " + CountCeiling : files.ToString();
            engine.SpeakResult(agent, "There are " + count + " files in " +
                                      new DirectoryInfo(folder).Name + ". I counted them all.");
        }

        /// <summary>Says a different name out loud. Nothing is renamed.</summary>
        private static void SuggestName(ActivityEvent ev, LiveAgent agent, PesterEngine engine)
        {
            if (engine == null) return;

            string file = ev.Token("file");
            if (string.IsNullOrEmpty(file)) file = ev.Subject;
            if (string.IsNullOrEmpty(file))
            {
                engine.SpeakResult(agent, "I have lost track of which one we were naming.");
                return;
            }

            string stem, extension;
            try
            {
                stem = Path.GetFileNameWithoutExtension(file);
                extension = Path.GetExtension(file);
            }
            catch (ArgumentException)
            {
                stem = file;
                extension = string.Empty;
            }

            engine.SpeakResult(agent, "How about " + stem + "_final_v2_USE_THIS" + extension +
                                      "? I am not going to rename it. I am just saying it.");
        }

        private static void WatchFolder(ActivityEvent ev, LiveAgent agent, PesterEngine engine)
        {
            if (engine == null) return;

            string folder = FolderOf(ev.Token("path"));
            if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder))
            {
                engine.SpeakResult(agent, "I could not work out which folder you meant.");
                return;
            }

            if (engine.FolderWatchRequested != null) engine.FolderWatchRequested(folder);
            engine.SpeakResult(agent, "Watching " + new DirectoryInfo(folder).Name +
                                      " from now on. Nothing will happen in there without me.");
        }

        /// <summary>The one thing an agent can do that makes it less of a nuisance.</summary>
        private static void Quieten(LiveAgent agent, PesterEngine engine)
        {
            if (engine == null) return;

            int before = agent.Profile.Pester;
            agent.Profile.Pester = Math.Max(PesterCurve.Min, before - 1);

            if (agent.Profile.Pester == before)
            {
                engine.SpeakResult(agent, "I am already as quiet as I go.");
                return;
            }

            engine.NotifySettingsChanged();
            engine.SpeakResult(agent, "Turning myself down to " + agent.Profile.Pester + ". " +
                                      PesterCurve.LevelName(agent.Profile.Pester) + ". For you.");
            Diagnostics.Info(agent.Name + " lowered its own level to " + agent.Profile.Pester + ".");
        }

        private static void Hush(LiveAgent agent)
        {
            agent.SilentUntil = DateTime.Now.AddSeconds(HushSeconds);
            Diagnostics.Info(agent.Name + " is keeping quiet for " + HushSeconds + " seconds.");
        }

        private static string FolderOf(string path)
        {
            if (string.IsNullOrEmpty(path)) return null;
            try { return Path.GetDirectoryName(path); }
            catch (ArgumentException) { return null; }
        }
    }
}
