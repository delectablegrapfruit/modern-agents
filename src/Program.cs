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

        /// <summary>
        /// STAThread is not optional. The Agent control is an apartment-threaded COM
        /// object and the whole program is built around calling it from this one thread.
        /// </summary>
        [STAThread]
        private static void Main()
        {
            bool isFirstInstance;
            using (var mutex = new Mutex(true, InstanceMutexName, out isFirstInstance))
            {
                if (!isFirstInstance)
                {
                    MessageBox.Show(
                        "Agent Wrangler is already running." + Environment.NewLine + Environment.NewLine +
                        "Look for it next to the clock, or press Ctrl+Alt+Shift+A.",
                        "Agent Wrangler", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
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
                    MessageBox.Show(
                        "Agent Wrangler could not start:" + Environment.NewLine + Environment.NewLine + ex.Message,
                        "Agent Wrangler", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                finally
                {
                    // Unloads every character and lets go of the Agent server. Skipping this
                    // would leave characters stranded on screen with nothing driving them.
                    host.Dispose();
                    GC.KeepAlive(mutex);
                }
            }
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
