using System;
using System.Windows.Forms;
using AgentWrangler.Behavior;
using AgentWrangler.Interop;

namespace AgentWrangler.Watchers
{
    /// <summary>
    /// Notices every clipboard change using AddClipboardFormatListener, which replaced the
    /// fragile clipboard-viewer chain in Vista and works fine on Windows 7.
    ///
    /// The clipboard's text is only read when at least one agent is configured to quote it;
    /// otherwise all the agent ever learns is that *something* was copied and what kind of
    /// thing it was.
    /// </summary>
    public sealed class ClipboardWatcher : IDisposable
    {
        /// <summary>Longest snippet an agent will ever read back, before ellipsis.</summary>
        private const int MaxQuoteLength = 60;

        private readonly ActivityBus _bus;
        private readonly Func<bool> _mayReadText;
        private Listener _listener;

        public ClipboardWatcher(ActivityBus bus, Func<bool> mayReadText)
        {
            _bus = bus;
            _mayReadText = mayReadText;
        }

        public void Start()
        {
            if (_listener != null) return;
            _listener = new Listener(OnClipboardChanged);
            if (!NativeMethods.AddClipboardFormatListener(_listener.Handle))
                Diagnostics.Warn("Clipboard listener could not be registered; copy events will be missed.");
            else
                Diagnostics.Info("Watching the clipboard.");
        }

        private void OnClipboardChanged()
        {
            try
            {
                string kind = DescribeClipboard();
                if (kind == null) return;

                var ev = new ActivityEvent(ActivityKind.ClipboardCopy, kind).With("kind", kind);

                bool quote = _mayReadText != null && _mayReadText();
                if (quote && Clipboard.ContainsText())
                {
                    ev.With("clip", Summarize(Clipboard.GetText()));
                }
                else
                {
                    ev.With("clip", kind);
                }

                _bus.Publish(ev);
            }
            catch (Exception ex)
            {
                // Another process can hold the clipboard open; there is nothing to do but
                // miss this one change.
                Diagnostics.Warn("Clipboard read failed: " + ex.Message);
            }
        }

        /// <summary>A word for what is on the clipboard, or null if it is empty/uninteresting.</summary>
        private static string DescribeClipboard()
        {
            try
            {
                if (Clipboard.ContainsFileDropList()) return "some files";
                if (Clipboard.ContainsImage()) return "an image";
                if (Clipboard.ContainsText()) return "some text";
                if (Clipboard.ContainsAudio()) return "some audio";
            }
            catch (Exception ex)
            {
                Diagnostics.Warn("Clipboard inspection failed: " + ex.Message);
                return null;
            }
            return null;
        }

        /// <summary>Flattens copied text to a single short line fit for a word balloon.</summary>
        public static string Summarize(string text)
        {
            if (string.IsNullOrEmpty(text)) return "something";
            string flat = text.Replace('\r', ' ').Replace('\n', ' ').Replace('\t', ' ').Trim();
            while (flat.Contains("  ")) flat = flat.Replace("  ", " ");
            if (flat.Length == 0) return "some whitespace, apparently";
            if (flat.Length > MaxQuoteLength) flat = flat.Substring(0, MaxQuoteLength).TrimEnd() + "...";
            return flat;
        }

        public void Dispose()
        {
            if (_listener == null) return;
            try { NativeMethods.RemoveClipboardFormatListener(_listener.Handle); }
            catch (Exception ex) { Diagnostics.Warn("Clipboard unhook failed: " + ex.Message); }
            _listener.ReleaseHandle();
            _listener = null;
        }

        /// <summary>Message-only window that exists purely to receive WM_CLIPBOARDUPDATE.</summary>
        private sealed class Listener : NativeWindow
        {
            private readonly Action _onChange;

            public Listener(Action onChange)
            {
                _onChange = onChange;
                var cp = new CreateParams();
                cp.Caption = "AgentWrangler.ClipboardListener";
                cp.Parent = NativeMethods.HWND_MESSAGE;
                CreateHandle(cp);
            }

            protected override void WndProc(ref Message m)
            {
                if (m.Msg == NativeMethods.WM_CLIPBOARDUPDATE) _onChange();
                base.WndProc(ref m);
            }
        }
    }
}
