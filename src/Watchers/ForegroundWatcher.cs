using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;
using AgentWrangler.Behavior;
using AgentWrangler.Interop;

namespace AgentWrangler.Watchers
{
    /// <summary>
    /// Follows which window is in front. This is what lets an agent say "opening Notepad
    /// again?" -- window titles usually carry the document name too, so switching to a
    /// window is also the cheapest proxy for "opening a file".
    ///
    /// The first time a given program is seen in a session it is reported as a launch
    /// rather than a focus change, which reads better and avoids a chorus of agents
    /// announcing the same alt-tab.
    /// </summary>
    public sealed class ForegroundWatcher : IDisposable
    {
        /// <summary>Common executables worth naming properly in a word balloon.</summary>
        private static readonly Dictionary<string, string> FriendlyNames =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                { "explorer", "Windows Explorer" },
                { "iexplore", "Internet Explorer" },
                { "chrome", "Chrome" },
                { "firefox", "Firefox" },
                { "opera", "Opera" },
                { "msedge", "Edge" },
                { "notepad", "Notepad" },
                { "wordpad", "WordPad" },
                { "mspaint", "Paint" },
                { "calc", "Calculator" },
                { "cmd", "the Command Prompt" },
                { "powershell", "PowerShell" },
                { "winword", "Word" },
                { "excel", "Excel" },
                { "powerpnt", "PowerPoint" },
                { "outlook", "Outlook" },
                { "wmplayer", "Windows Media Player" },
                { "vlc", "VLC" },
                { "devenv", "Visual Studio" },
                { "taskmgr", "Task Manager" },
                { "control", "Control Panel" },
                { "regedit", "the Registry Editor" }
            };

        private readonly ActivityBus _bus;
        private readonly HashSet<string> _seenThisSession =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // The delegate must be kept alive for as long as the hook, or the GC will collect
        // it and the callback will crash the process.
        private NativeMethods.WinEventProc _callback;
        private IntPtr _hook = IntPtr.Zero;
        private string _lastReported = string.Empty;

        public ForegroundWatcher(ActivityBus bus)
        {
            _bus = bus;
        }

        public void Start()
        {
            if (_hook != IntPtr.Zero) return;

            _callback = OnWinEvent;
            _hook = NativeMethods.SetWinEventHook(
                NativeMethods.EVENT_SYSTEM_FOREGROUND,
                NativeMethods.EVENT_SYSTEM_FOREGROUND,
                IntPtr.Zero, _callback, 0, 0,
                NativeMethods.WINEVENT_OUTOFCONTEXT | NativeMethods.WINEVENT_SKIPOWNPROCESS);

            if (_hook == IntPtr.Zero)
                Diagnostics.Warn("Foreground hook could not be installed; app switches will be missed.");
            else
                Diagnostics.Info("Watching foreground window changes.");
        }

        private void OnWinEvent(IntPtr hook, uint eventType, IntPtr hwnd,
                                int idObject, int idChild, uint thread, uint time)
        {
            // idObject OBJID_WINDOW (0) only; the same event fires for child objects.
            if (hwnd == IntPtr.Zero || idObject != 0) return;

            try
            {
                string title = GetTitle(hwnd);
                string process = GetProcessName(hwnd);
                if (string.IsNullOrEmpty(process)) return;

                string friendly = Friendly(process);

                // Ignore our own windows and the desktop itself.
                if (string.Equals(process, "AgentWrangler", StringComparison.OrdinalIgnoreCase)) return;
                if (string.IsNullOrEmpty(title) && string.IsNullOrEmpty(friendly)) return;

                bool firstTime = _seenThisSession.Add(process);
                string key = process + "|" + title;
                if (!firstTime && string.Equals(key, _lastReported, StringComparison.Ordinal)) return;
                _lastReported = key;

                var ev = new ActivityEvent(
                        firstTime ? ActivityKind.AppLaunched : ActivityKind.AppFocused,
                        friendly)
                    .With("app", friendly)
                    .With("process", process)
                    .With("title", title)
                    .With("doc", DocumentFromTitle(title, friendly));

                _bus.Publish(ev);
            }
            catch (Exception ex)
            {
                Diagnostics.Warn("Foreground event failed: " + ex.Message);
            }
        }

        private static string GetTitle(IntPtr hwnd)
        {
            var buffer = new StringBuilder(512);
            int length = NativeMethods.GetWindowText(hwnd, buffer, buffer.Capacity);
            return length > 0 ? buffer.ToString() : string.Empty;
        }

        private static string GetProcessName(IntPtr hwnd)
        {
            uint pid;
            NativeMethods.GetWindowThreadProcessId(hwnd, out pid);
            if (pid == 0) return string.Empty;

            try
            {
                using (Process process = Process.GetProcessById((int)pid))
                {
                    return process.ProcessName;
                }
            }
            catch
            {
                // Process exited between the event and the lookup, or is not readable
                // from our integrity level. Either way there is nothing to report.
                return string.Empty;
            }
        }

        public static string Friendly(string processName)
        {
            if (string.IsNullOrEmpty(processName)) return string.Empty;
            string friendly;
            if (FriendlyNames.TryGetValue(processName, out friendly)) return friendly;

            // Capitalise the executable name as a last resort: "audacity" -> "Audacity".
            return char.ToUpperInvariant(processName[0]) + processName.Substring(1);
        }

        /// <summary>
        /// Most Windows titles read "Document - Application". Pulling the leading segment
        /// out gives the agent something specific to be nosy about.
        /// </summary>
        public static string DocumentFromTitle(string title, string appName)
        {
            if (string.IsNullOrEmpty(title)) return string.Empty;

            int separator = title.LastIndexOf(" - ", StringComparison.Ordinal);
            string candidate = separator > 0 ? title.Substring(0, separator) : title;
            candidate = candidate.Trim();

            if (candidate.Length == 0) return string.Empty;
            if (string.Equals(candidate, appName, StringComparison.OrdinalIgnoreCase)) return string.Empty;
            if (candidate.Length > 48) candidate = candidate.Substring(0, 48).TrimEnd() + "...";
            return candidate;
        }

        public void Dispose()
        {
            if (_hook == IntPtr.Zero) return;
            try { NativeMethods.UnhookWinEvent(_hook); }
            catch (Exception ex) { Diagnostics.Warn("Foreground unhook failed: " + ex.Message); }
            _hook = IntPtr.Zero;
            _callback = null;
        }
    }
}
