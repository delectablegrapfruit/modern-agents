using System;
using System.Drawing;
using System.Windows.Forms;
using AgentWrangler.Interop;

namespace AgentWrangler.Ui
{
    public enum AssistAnswer
    {
        Ignored,
        Accepted,
        Declined,
        Never
    }

    /// <summary>
    /// The little window an agent uses to offer its help.
    ///
    /// It is deliberately not modal: the pester engine runs on the UI thread, and a modal
    /// dialog would stop every other agent dead while this one waits for an answer. The
    /// caller gets the result through <see cref="Answered"/> instead.
    /// </summary>
    public sealed class AssistPrompt : Form
    {
        private const int HeaderHeight = 22;
        private const int Gutter = 12;

        private readonly Label _question;
        private readonly Button _yes;
        private readonly Button _no;
        private readonly Button _never;
        private readonly Timer _countdown;
        private readonly bool _stealFocus;
        private readonly Random _rng;

        private int _secondsLeft;
        private bool _answered;

        /// <summary>Raised exactly once, with the user's answer or Ignored on timeout.</summary>
        public event EventHandler<AssistAnsweredEventArgs> Answered;

        public AssistPrompt(string agentName, string question, int timeoutSeconds,
                            bool evasiveDecline, bool stealFocus, Random rng)
        {
            _stealFocus = stealFocus;
            _rng = rng ?? new Random();
            _secondsLeft = Math.Max(4, timeoutSeconds);

            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            TopMost = true;
            StartPosition = FormStartPosition.Manual;
            BackColor = RetroTheme.Face;
            Font = RetroTheme.Ui;
            Width = 330;
            Text = agentName;
            DoubleBuffered = true;

            _question = new Label
            {
                Text = question,
                Font = RetroTheme.Display,
                ForeColor = RetroTheme.Ink,
                BackColor = RetroTheme.Paper,
                BorderStyle = BorderStyle.FixedSingle,
                Location = new Point(Gutter, HeaderHeight + Gutter),
                Width = Width - Gutter * 2,
                AutoSize = false,
                Padding = new System.Windows.Forms.Padding(8)
            };
            _question.Height = MeasureQuestionHeight(question, _question.Width - 16);
            Controls.Add(_question);

            int buttonTop = _question.Bottom + 10;

            _yes = MakeButton("Yes please!", true);
            _no = MakeButton("No thanks", false);
            _never = MakeButton("Never ask", false);

            _yes.Location = new Point(Gutter, buttonTop);
            _no.Location = new Point(_yes.Right + 6, buttonTop);
            _never.Location = new Point(_no.Right + 6, buttonTop);

            _yes.Click += delegate { Answer(AssistAnswer.Accepted); };
            _no.Click += delegate { Answer(AssistAnswer.Declined); };
            _never.Click += delegate { Answer(AssistAnswer.Never); };

            if (evasiveDecline)
            {
                // The whole joke of an over-eager assistant: saying no is made slightly
                // harder than saying yes. The button always stays inside the window, so
                // it is obnoxious rather than impossible.
                _no.MouseEnter += DodgeAway;
                _never.MouseEnter += DodgeAway;
            }

            Controls.Add(_yes);
            Controls.Add(_no);
            Controls.Add(_never);

            Height = HeaderHeight + Gutter + _question.Height + 10 + _yes.Height + Gutter;

            _countdown = new Timer { Interval = 1000 };
            _countdown.Tick += OnCountdownTick;
            _countdown.Start();
        }

        private Button MakeButton(string caption, bool primary)
        {
            var button = new Button
            {
                Text = caption,
                Width = primary ? 96 : 96,
                Height = 26,
                TabStop = true
            };
            RetroTheme.StyleButton(button, primary);
            return button;
        }

        /// <summary>
        /// Label draws through TextRenderer once SetCompatibleTextRenderingDefault(false)
        /// is in force, so the height is measured the same way. This also avoids creating
        /// the form's window handle from inside its own constructor.
        /// </summary>
        private static int MeasureQuestionHeight(string text, int width)
        {
            Size measured = TextRenderer.MeasureText(text, RetroTheme.Display,
                                                     new Size(width, 0), TextFormatFlags.WordBreak);
            return Math.Max(48, measured.Height + 22);
        }

        /// <summary>Moves the button somewhere else inside the window when hovered.</summary>
        private void DodgeAway(object sender, EventArgs e)
        {
            var button = sender as Button;
            if (button == null) return;

            int minX = Gutter;
            int maxX = Math.Max(minX, ClientSize.Width - button.Width - Gutter);
            int minY = HeaderHeight + Gutter;
            int maxY = Math.Max(minY, ClientSize.Height - button.Height - Gutter);

            button.Location = new Point(_rng.Next(minX, maxX + 1), _rng.Next(minY, maxY + 1));
            button.BringToFront();
        }

        private void OnCountdownTick(object sender, EventArgs e)
        {
            _secondsLeft--;
            Invalidate(new Rectangle(0, 0, Width, HeaderHeight));
            if (_secondsLeft <= 0) Answer(AssistAnswer.Ignored);
        }

        private void Answer(AssistAnswer answer)
        {
            if (_answered) return;
            _answered = true;
            _countdown.Stop();

            EventHandler<AssistAnsweredEventArgs> handler = Answered;
            if (handler != null) handler(this, new AssistAnsweredEventArgs(answer));

            Close();
        }

        /// <summary>
        /// Places the prompt beside the character, nudged back on screen if the character
        /// is standing near an edge.
        /// </summary>
        public void PositionNear(Rectangle characterBounds)
        {
            Rectangle work = Screen.PrimaryScreen.WorkingArea;
            if (!characterBounds.IsEmpty)
            {
                Screen screen = Screen.FromRectangle(characterBounds);
                if (screen != null) work = screen.WorkingArea;
            }

            int x, y;
            if (characterBounds.IsEmpty)
            {
                x = work.Right - Width - 24;
                y = work.Bottom - Height - 24;
            }
            else
            {
                x = characterBounds.Right + 8;
                y = characterBounds.Top;
                // Flip to the character's left if there is no room on the right.
                if (x + Width > work.Right) x = characterBounds.Left - Width - 8;
            }

            if (x < work.Left) x = work.Left + 8;
            if (x + Width > work.Right) x = work.Right - Width - 8;
            if (y < work.Top) y = work.Top + 8;
            if (y + Height > work.Bottom) y = work.Bottom - Height - 8;

            Location = new Point(x, y);
        }

        /// <summary>
        /// Unless the agent is configured to steal focus, the prompt appears without
        /// taking the caret out of whatever the user was typing into.
        /// </summary>
        protected override bool ShowWithoutActivation
        {
            get { return !_stealFocus; }
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            NativeMethods.SetWindowPos(Handle, NativeMethods.HWND_TOPMOST, 0, 0, 0, 0,
                NativeMethods.SWP_NOMOVE | NativeMethods.SWP_NOSIZE |
                (_stealFocus ? 0 : NativeMethods.SWP_NOACTIVATE));
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            string caption = Text + "   (" + Math.Max(0, _secondsLeft) + ")";
            RetroTheme.PaintHeader(e.Graphics, new Rectangle(0, 0, Width, HeaderHeight), caption);
            RetroTheme.PaintBorder(e.Graphics, new Rectangle(0, 0, Width, Height));
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            // A close that did not go through Answer (alt-F4, shutdown) still owes the
            // engine a result, or the agent would wait for an answer forever.
            if (!_answered)
            {
                _answered = true;
                _countdown.Stop();
                EventHandler<AssistAnsweredEventArgs> handler = Answered;
                if (handler != null) handler(this, new AssistAnsweredEventArgs(AssistAnswer.Ignored));
            }
            _countdown.Dispose();
            base.OnFormClosed(e);
        }
    }

    public sealed class AssistAnsweredEventArgs : EventArgs
    {
        public AssistAnswer Answer { get; private set; }
        public AssistAnsweredEventArgs(AssistAnswer answer) { Answer = answer; }
    }
}
