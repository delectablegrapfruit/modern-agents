using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Security.Principal;

namespace AgentWrangler.Interop
{
    /// <summary>
    /// Everything to do with administrator rights.
    ///
    /// Agent Wrangler runs unelevated. Its settings, log, phrasebook and imported
    /// characters all live under %APPDATA%, the only registry key it writes is the
    /// per-user Run key, and connecting to the Agent server needs no special rights.
    ///
    /// The one thing that does need administrator rights is renaming or deleting a
    /// character file that lives in a protected folder -- %WINDIR%\msagent\chars and
    /// Program Files, where most characters are installed. Rather than run the whole
    /// program elevated for the sake of two menu items, those operations are tried
    /// normally first and, if Windows refuses, re-run through a short-lived elevated
    /// copy of this same executable. The consent prompt appears by itself at the moment
    /// it is actually needed.
    ///
    /// Running the whole program elevated all the time would also break "start when I log
    /// in": Windows 7 will not launch an elevated program from the Run key.
    /// </summary>
    internal static class Elevation
    {
        /// <summary>Win32 error returned when the user dismisses the consent prompt.</summary>
        private const int ErrorCancelled = 1223;

        /// <summary>Long enough for someone to find and answer the consent prompt.</summary>
        private const int ElevatedWaitMs = 120000;

        /// <summary>True when this process is already running with administrator rights.</summary>
        public static bool IsElevated
        {
            get
            {
                try
                {
                    using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
                    {
                        return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
                    }
                }
                catch (Exception ex)
                {
                    Diagnostics.Warn("Could not determine elevation state: " + ex.Message);
                    return false;
                }
            }
        }

        /// <summary>
        /// Whether this process can create a file in a folder. Used to tell the user which
        /// character folders they can actually modify, before they try.
        /// </summary>
        public static bool CanWriteTo(string folder)
        {
            if (string.IsNullOrEmpty(folder)) return false;
            try
            {
                if (!Directory.Exists(folder)) return false;

                string probe = Path.Combine(folder, "aw-write-probe-" + Guid.NewGuid().ToString("N") + ".tmp");
                using (new FileStream(probe, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                                      1, FileOptions.DeleteOnClose))
                {
                    // DeleteOnClose removes it as the handle closes, so nothing is left behind
                    // even if this process is killed mid-check.
                }
                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }

        /// <summary>
        /// Runs this same executable elevated with the given arguments and waits for it.
        /// Returns false with a reason if the user declined or the operation failed.
        /// </summary>
        public static bool RunElevated(string arguments, out string error)
        {
            error = null;

            string executable = AppHost.ExecutablePath;
            if (string.IsNullOrEmpty(executable) || !File.Exists(executable))
            {
                error = "Could not work out where this program is running from.";
                return false;
            }

            var startInfo = new ProcessStartInfo(executable, arguments)
            {
                // The runas verb only exists for shell execution.
                UseShellExecute = true,
                Verb = "runas",
                WindowStyle = ProcessWindowStyle.Hidden
            };

            try
            {
                using (Process process = Process.Start(startInfo))
                {
                    if (process == null)
                    {
                        error = "Windows did not start the elevated helper.";
                        return false;
                    }

                    if (!process.WaitForExit(ElevatedWaitMs))
                    {
                        error = "The elevated helper did not finish in time.";
                        return false;
                    }

                    if (process.ExitCode == 0)
                    {
                        Diagnostics.Info("Elevated helper completed: " + arguments);
                        return true;
                    }

                    error = "The elevated helper could not complete the operation " +
                            "(exit code " + process.ExitCode + "). See the log for details.";
                    return false;
                }
            }
            catch (Win32Exception ex)
            {
                error = ex.NativeErrorCode == ErrorCancelled
                    ? "Administrator access was declined, so nothing was changed."
                    : "Could not request administrator access: " + ex.Message;
                Diagnostics.Warn("Elevation failed: " + error);
                return false;
            }
            catch (Exception ex)
            {
                error = "Could not request administrator access: " + ex.Message;
                Diagnostics.Error("Elevation failed.", ex);
                return false;
            }
        }

        /// <summary>
        /// Starts a fresh elevated copy of the program. The caller is expected to shut this
        /// one down; the new copy waits for the single-instance mutex to come free.
        /// </summary>
        public static bool RestartElevated(out string error)
        {
            error = null;

            string executable = AppHost.ExecutablePath;
            if (string.IsNullOrEmpty(executable) || !File.Exists(executable))
            {
                error = "Could not work out where this program is running from.";
                return false;
            }

            var startInfo = new ProcessStartInfo(executable, Program.RestartedSwitch)
            {
                UseShellExecute = true,
                Verb = "runas"
            };

            try
            {
                Process.Start(startInfo);
                Diagnostics.Info("Restarting with administrator rights.");
                return true;
            }
            catch (Win32Exception ex)
            {
                error = ex.NativeErrorCode == ErrorCancelled
                    ? "Administrator access was declined."
                    : "Could not restart with administrator access: " + ex.Message;
                return false;
            }
            catch (Exception ex)
            {
                error = "Could not restart with administrator access: " + ex.Message;
                Diagnostics.Error("Elevated restart failed.", ex);
                return false;
            }
        }
    }
}
