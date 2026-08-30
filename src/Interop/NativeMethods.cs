using System;
using System.Runtime.InteropServices;
using System.Text;

namespace AgentWrangler.Interop
{
    /// <summary>
    /// P/Invoke surface used by the watchers and the always-on-top prompt windows.
    /// Everything here is available on Windows 7.
    /// </summary>
    internal static class NativeMethods
    {
        // ---- message-only windows -------------------------------------------------
        public static readonly IntPtr HWND_MESSAGE = new IntPtr(-3);

        // ---- clipboard ------------------------------------------------------------
        public const int WM_CLIPBOARDUPDATE = 0x031D;

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool AddClipboardFormatListener(IntPtr hwnd);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool RemoveClipboardFormatListener(IntPtr hwnd);

        // ---- hot keys -------------------------------------------------------------
        public const int WM_HOTKEY = 0x0312;
        public const uint MOD_ALT = 0x0001;
        public const uint MOD_CONTROL = 0x0002;
        public const uint MOD_SHIFT = 0x0004;

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        // ---- foreground window tracking ------------------------------------------
        public const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
        public const uint WINEVENT_OUTOFCONTEXT = 0x0000;
        public const uint WINEVENT_SKIPOWNPROCESS = 0x0002;

        public delegate void WinEventProc(IntPtr hWinEventHook, uint eventType, IntPtr hwnd,
                                          int idObject, int idChild, uint dwEventThread, uint dwmsEventTime);

        [DllImport("user32.dll")]
        public static extern IntPtr SetWinEventHook(uint eventMin, uint eventMax, IntPtr hmodWinEventProc,
                                                    WinEventProc lpfnWinEventProc, uint idProcess,
                                                    uint idThread, uint dwFlags);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool UnhookWinEvent(IntPtr hWinEventHook);

        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetWindowTextW")]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

        public const uint GW_OWNER = 4;

        // ---- idle detection -------------------------------------------------------
        [StructLayout(LayoutKind.Sequential)]
        public struct LASTINPUTINFO
        {
            public uint cbSize;
            public uint dwTime;
        }

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

        /// <summary>Seconds since the last keyboard/mouse input, or 0 if unavailable.</summary>
        public static double IdleSeconds()
        {
            LASTINPUTINFO lii = new LASTINPUTINFO();
            lii.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
            if (!GetLastInputInfo(ref lii)) return 0;
            // Both values wrap every ~49.7 days; unchecked subtraction stays correct across the wrap.
            uint delta = unchecked((uint)Environment.TickCount - lii.dwTime);
            return delta / 1000.0;
        }

        // ---- z-order --------------------------------------------------------------
        public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
        public const uint SWP_NOSIZE = 0x0001;
        public const uint SWP_NOMOVE = 0x0002;
        public const uint SWP_NOACTIVATE = 0x0010;
        public const uint SWP_SHOWWINDOW = 0x0040;

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y,
                                               int cx, int cy, uint uFlags);

        [DllImport("user32.dll")]
        public static extern bool GetCursorPos(out POINT lpPoint);

        // ---- text entry detection -------------------------------------------------
        public const int GUI_CARETBLINKING = 0x00000001;

        [StructLayout(LayoutKind.Sequential)]
        public struct GUITHREADINFO
        {
            public int cbSize;
            public int flags;
            public IntPtr hwndActive;
            public IntPtr hwndFocus;
            public IntPtr hwndCapture;
            public IntPtr hwndMenuOwner;
            public IntPtr hwndMoveSize;
            public IntPtr hwndCaret;
            public RECT rcCaret;
        }

        /// <summary>Pass 0 for the thread id to describe whatever is in the foreground.</summary>
        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GetGUIThreadInfo(uint idThread, ref GUITHREADINFO lpgui);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetClassNameW")]
        public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT
        {
            public int X;
            public int Y;
        }
    }
}
