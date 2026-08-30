using System;
using System.Drawing;
using System.Windows.Forms;

namespace AgentWrangler.Ui
{
    /// <summary>
    /// Colours and fonts shared by the manager and the pop-up prompts. Loud on purpose:
    /// these windows are supposed to feel like a piece of shareware that is very pleased
    /// with itself.
    /// </summary>
    public static class RetroTheme
    {
        public static readonly Color Face = Color.FromArgb(212, 208, 200);
        public static readonly Color Paper = Color.FromArgb(248, 246, 236);
        public static readonly Color Ink = Color.FromArgb(24, 24, 32);
        public static readonly Color HeaderStart = Color.FromArgb(28, 28, 148);
        public static readonly Color HeaderEnd = Color.FromArgb(102, 68, 190);
        public static readonly Color HeaderText = Color.White;
        public static readonly Color Accent = Color.FromArgb(226, 88, 0);
        public static readonly Color Highlight = Color.FromArgb(255, 246, 176);
        public static readonly Color Quiet = Color.FromArgb(96, 96, 104);
        public static readonly Color Alarm = Color.FromArgb(176, 16, 16);

        private static Font _ui;
        private static Font _uiBold;
        private static Font _display;

        /// <summary>The workhorse UI font.</summary>
        public static Font Ui
        {
            get { return _ui ?? (_ui = Pick(8.25f, FontStyle.Regular, "Tahoma", "Microsoft Sans Serif", "Segoe UI")); }
        }

        public static Font UiBold
        {
            get { return _uiBold ?? (_uiBold = Pick(8.25f, FontStyle.Bold, "Tahoma", "Microsoft Sans Serif", "Segoe UI")); }
        }

        /// <summary>Chunky font for headings and the thing an agent is asking you.</summary>
        public static Font Display
        {
            get { return _display ?? (_display = Pick(11f, FontStyle.Bold, "Tahoma", "Microsoft Sans Serif", "Segoe UI")); }
        }

        /// <summary>Returns the first of the named families that is actually installed.</summary>
        private static Font Pick(float size, FontStyle style, params string[] families)
        {
            foreach (string family in families)
            {
                try
                {
                    using (var test = new FontFamily(family))
                    {
                        if (test.IsStyleAvailable(style)) return new Font(family, size, style);
                    }
                }
                catch (ArgumentException)
                {
                    // Family is not installed; try the next one.
                }
            }
            return new Font(FontFamily.GenericSansSerif, size, style);
        }

        /// <summary>Paints the gradient caption bar used by the prompt windows.</summary>
        public static void PaintHeader(Graphics g, Rectangle bounds, string title)
        {
            if (bounds.Width <= 0 || bounds.Height <= 0) return;

            using (var brush = new System.Drawing.Drawing2D.LinearGradientBrush(
                       bounds, HeaderStart, HeaderEnd, 0f))
            {
                g.FillRectangle(brush, bounds);
            }

            var format = new StringFormat { LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter };
            format.FormatFlags |= StringFormatFlags.NoWrap;
            var textArea = new Rectangle(bounds.X + 6, bounds.Y, bounds.Width - 12, bounds.Height);
            using (var brush = new SolidBrush(HeaderText))
            {
                g.DrawString(title, UiBold, brush, textArea, format);
            }
        }

        /// <summary>Draws the raised outline that makes a borderless form look like a window.</summary>
        public static void PaintBorder(Graphics g, Rectangle bounds)
        {
            var outer = new Rectangle(bounds.X, bounds.Y, bounds.Width - 1, bounds.Height - 1);
            using (var pen = new Pen(Color.FromArgb(64, 64, 72)))
            {
                g.DrawRectangle(pen, outer);
            }
            using (var pen = new Pen(Color.White))
            {
                g.DrawLine(pen, outer.X + 1, outer.Y + 1, outer.Right - 1, outer.Y + 1);
                g.DrawLine(pen, outer.X + 1, outer.Y + 1, outer.X + 1, outer.Bottom - 1);
            }
        }

        /// <summary>Gives a button the flat, slightly cheap look the rest of the UI has.</summary>
        public static void StyleButton(Button button, bool primary)
        {
            button.FlatStyle = FlatStyle.System;
            button.Font = primary ? UiBold : Ui;
            button.UseVisualStyleBackColor = true;
        }

        /// <summary>
        /// Builds the tray/window icon in code so the program ships as a single executable
        /// with no resource files to lose.
        /// </summary>
        public static Icon BuildAppIcon()
        {
            using (var bitmap = new Bitmap(32, 32))
            {
                using (Graphics g = Graphics.FromImage(bitmap))
                {
                    g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                    g.Clear(Color.Transparent);

                    g.FillEllipse(new SolidBrush(Color.FromArgb(255, 214, 0)), 2, 2, 27, 27);
                    g.DrawEllipse(new Pen(Ink, 2f), 2, 2, 27, 27);

                    // Two eyes and a speech dot: an assistant, watching.
                    g.FillEllipse(new SolidBrush(Ink), 10, 11, 4, 6);
                    g.FillEllipse(new SolidBrush(Ink), 18, 11, 4, 6);
                    g.DrawArc(new Pen(Ink, 2f), 9, 15, 14, 10, 20, 140);
                }

                IntPtr handle = bitmap.GetHicon();
                try
                {
                    // Clone so the icon survives DestroyIcon on the temporary handle.
                    using (Icon temporary = Icon.FromHandle(handle))
                    {
                        return (Icon)temporary.Clone();
                    }
                }
                finally
                {
                    NativeIcon.DestroyIcon(handle);
                }
            }
        }

        private static class NativeIcon
        {
            [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
            public static extern bool DestroyIcon(IntPtr handle);
        }
    }
}
