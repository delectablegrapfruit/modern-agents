using System;
using System.Threading;
using System.Windows.Forms;
using AgentWrangler.Ui;

namespace AgentWrangler
{
    internal static class Program
    {
        /// <summary>
        /// Local, not Global: one manager per logged-on user is the right granularity, and
        /// a Global mutex would need rights a normal user may not have.
        /// </summary>
        private const string InstanceMutexName = @"Local\AgentWrangler.SingleInstance";

        /// <summary>Marks a copy started by "Run as administrator" on an earlier copy.</summary>
        public const string RestartedSwitch = "--restarted";

        /// <summary>How long a restarted copy waits for its predecessor to let go.</summary>
        private const int RestartWaitSteps = 40;
        private const int RestartWaitStepMs = 250;

        /// <summary>
        /// STAThread is not optional. The Agent control is an apartment-threaded COM
        /// object and the whole program is built around calling it from this one thread.
        /// </summary>
        [STAThread]
        private static int Main(string[] args)
        {
            // Started to perform one privileged file operation and nothing else. This runs
            // before the single-instance check so it never collides with a running manager.
            if (ElevatedHelper.IsHelperInvocation(args)) return ElevatedHelper.Run(args);

            bool restarted = args != null && Array.IndexOf(args, RestartedSwitch) >= 0;

            bool owned;
            using (var mutex = new Mutex(true, InstanceMutexName, out owned))
            {
                if (!owned && restarted) owned = WaitForPredecessor(mutex);

                if (!owned)
                {
                    MessageBox.Show(
                        "Agent Wrangler is already running." + Environment.NewLine + Environment.NewLine +
                        "Look for it next to the clock, or press Ctrl+Alt+Shift+A.",
                        "Agent Wrangler", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 0;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                Application.ThreadException += OnThreadException;
                AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;

                var host = new AppHost();
                try
                {
                    host.Start();
                    Application.Run(new MainForm(host));
                }
                catch (Exception ex)
                {
                    Diagnostics.Error("Agent Wrangler could not start.", ex);

                    string where = Diagnostics.LogPath;
                    MessageBox.Show(
                        "Agent Wrangler could not start:" + Environment.NewLine + Environment.NewLine +
                        ex.Message +
                        (string.IsNullOrEmpty(where)
                            ? string.Empty
                            : Environment.NewLine + Environment.NewLine + "Details, including where it "
                              + "happened, are in:" + Environment.NewLine + where),
                        "Agent Wrangler", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                }
                finally
                {
                    // Unloads every character and lets go of the Agent server. Skipping this
                    // would leave characters stranded on screen with nothing driving them.
                    host.Dispose();
                    GC.KeepAlive(mutex);
                }
            }

            return 0;
        }

        /// <summary>
        /// "Run as administrator" starts this copy while the old one is still shutting down,
        /// so the single-instance lock is briefly held by a process that is on its way out.
        /// </summary>
        private static bool WaitForPredecessor(Mutex mutex)
        {
            for (int attempt = 0; attempt < RestartWaitSteps; attempt++)
            {
                try
                {
                    if (mutex.WaitOne(RestartWaitStepMs)) return true;
                }
                catch (AbandonedMutexException)
                {
                    // The predecessor exited without releasing it. Ownership passes to us,
                    // which is exactly what was wanted.
                    return true;
                }
            }

            Diagnostics.Warn("Timed out waiting for the previous copy to close.");
            return false;
        }

        private static void OnThreadException(object sender, ThreadExceptionEventArgs e)
        {
            Diagnostics.Error("Unhandled UI exception.", e.Exception);
            MessageBox.Show(
                "Something went wrong:" + Environment.NewLine + Environment.NewLine + e.Exception.Message +
                Environment.NewLine + Environment.NewLine + "The details are in the log on the Diagnostics tab.",
                "Agent Wrangler", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        private static void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
        {
            Diagnostics.Error("Unhandled exception.", e.ExceptionObject as Exception);
        }
    }
}
