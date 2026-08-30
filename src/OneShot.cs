using System;
using System.Windows.Forms;

namespace AgentWrangler
{
    /// <summary>
    /// Runs an action once, later, on the UI thread. Used where something has to happen
    /// after a short pause without blocking the pester engine's tick -- letting an agent
    /// finish saying goodbye before its character is unloaded, for instance.
    /// </summary>
    internal static class OneShot
    {
        public static void Run(int delayMs, Action action)
        {
            if (action == null) return;

            var timer = new Timer { Interval = Math.Max(1, delayMs) };
            timer.Tick += delegate
            {
                timer.Stop();
                timer.Dispose();
                try { action(); }
                catch (Exception ex) { Diagnostics.Error("Delayed action failed.", ex); }
            };
            timer.Start();
        }
    }
}
