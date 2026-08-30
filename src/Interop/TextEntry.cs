using System;
using System.Text;

namespace AgentWrangler.Interop
{
    /// <summary>
    /// Works out whether the user is typing into something.
    ///
    /// The reliable signal is the caret: a control that accepts text creates one, and
    /// GetGUIThreadInfo reports it for whichever thread owns the foreground window. Some
    /// applications draw their own text cursor and never create a real caret, so the class
    /// name of the focused control is checked as a fallback.
    /// </summary>
    internal static class TextEntry
    {
        /// <summary>
        /// Answers are reused for this long. The check is cheap but it runs on every frame
        /// of movement, and the answer cannot meaningfully change faster than this.
        /// </summary>
        private const int CacheMilliseconds = 100;

        private static int _checkedAtTick;
        private static bool _cached;
        private static bool _hasCached;

        /// <summary>True while a caret is sitting in a text field somewhere in front.</summary>
        public static bool IsActive()
        {
            int now = Environment.TickCount;
            if (_hasCached && unchecked(now - _checkedAtTick) < CacheMilliseconds) return _cached;

            _cached = Detect();
            _checkedAtTick = now;
            _hasCached = true;
            return _cached;
        }

        private static bool Detect()
        {
            try
            {
                var info = new NativeMethods.GUITHREADINFO();
                info.cbSize = System.Runtime.InteropServices.Marshal.SizeOf(typeof(NativeMethods.GUITHREADINFO));

                if (!NativeMethods.GetGUIThreadInfo(0, ref info)) return false;

                if (info.hwndCaret != IntPtr.Zero) return true;
                if ((info.flags & NativeMethods.GUI_CARETBLINKING) != 0) return true;

                return LooksLikeTextInput(ClassNameOf(info.hwndFocus));
            }
            catch (Exception ex)
            {
                Diagnostics.Warn("Could not check for text entry: " + ex.Message);
                return false;
            }
        }

        private static string ClassNameOf(IntPtr hwnd)
        {
            if (hwnd == IntPtr.Zero) return string.Empty;

            var buffer = new StringBuilder(256);
            int length = NativeMethods.GetClassName(hwnd, buffer, buffer.Capacity);
            return length > 0 ? buffer.ToString() : string.Empty;
        }

        /// <summary>
        /// Whether a window class is one that takes typed text. Deliberately narrow: a
        /// false positive holds an agent still for no reason, which is a far smaller
        /// nuisance than one wandering across the sentence being typed.
        /// </summary>
        internal static bool LooksLikeTextInput(string className)
        {
            if (string.IsNullOrEmpty(className)) return false;

            // Covers Edit, RichEdit20W, RICHEDIT50W, WindowsForms10.EDIT.app.*, TEdit and
            // the rest of the family.
            if (className.IndexOf("edit", StringComparison.OrdinalIgnoreCase) >= 0) return true;
            if (className.IndexOf("textbox", StringComparison.OrdinalIgnoreCase) >= 0) return true;
            if (className.IndexOf("textfield", StringComparison.OrdinalIgnoreCase) >= 0) return true;
            if (className.IndexOf("scintilla", StringComparison.OrdinalIgnoreCase) >= 0) return true;

            return false;
        }
    }
}
