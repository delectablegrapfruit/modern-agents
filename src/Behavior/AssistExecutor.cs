using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using AgentWrangler.Agents;

namespace AgentWrangler.Behavior
{
    /// <summary>
    /// Carries out an assist offer the user accepted.
    ///
    /// The set of actions is small and deliberately harmless. An agent that interrupts you
    /// every few seconds with a prompt whose "Yes" button is bigger than its "No" button
    /// must not be able to run a program, delete anything, or open a file that was just
    /// downloaded -- so it cannot. Opening a folder and copying a file name are the only
    /// things here that touch the system at all.
    /// </summary>
    internal static class AssistExecutor
    {
        public static void Execute(AssistAction action, ActivityEvent ev, LiveAgent agent, PesterEngine engine)
        {
            try
            {
                switch (action)
                {
                    case AssistAction.OpenFolder:
                        OpenFolder(ev);
                        break;

                    case AssistAction.CopyName:
                        CopyName(ev);
                        break;

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
        /// Shows the file in Explorer. Falls back to opening the plain folder, and does
        /// nothing at all if neither still exists -- a download can be moved or deleted
        /// between the offer and the answer.
        /// </summary>
        private static void OpenFolder(ActivityEvent ev)
        {
            string path = ev.Token("path");

            if (!string.IsNullOrEmpty(path) && File.Exists(path))
            {
                // /select needs the path quoted; it is a real path from the file watcher,
                // not anything the user typed.
                Process.Start(new ProcessStartInfo("explorer.exe", "/select,\"" + path + "\"")
                {
                    UseShellExecute = true
                });
                Diagnostics.Info("Opened Explorer at " + path);
                return;
            }

            string folder = null;
            try { folder = string.IsNullOrEmpty(path) ? null : Path.GetDirectoryName(path); }
            catch (ArgumentException) { folder = null; }

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
                // Another process can own the clipboard; nothing to do but say so.
                Diagnostics.Warn("Clipboard write failed: " + ex.Message);
            }
        }
    }
}
