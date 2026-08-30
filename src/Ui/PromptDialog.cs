using System;
using System.Drawing;
using System.Windows.Forms;

namespace AgentWrangler.Ui
{
    /// <summary>
    /// A one-line text prompt. Windows Forms has no InputBox, and the two places that need
    /// one (renaming a character file, naming a duplicate) do not justify a designer form.
    /// </summary>
    public static class PromptDialog
    {
        /// <summary>Returns the entered text, or null if the user cancelled.</summary>
        public static string Ask(IWin32Window owner, string title, string prompt, string initialValue)
        {
            using (var form = new Form())
            {
                form.Text = title;
                form.FormBorderStyle = FormBorderStyle.FixedDialog;
                form.MinimizeBox = false;
                form.MaximizeBox = false;
                form.ShowInTaskbar = false;
                form.StartPosition = FormStartPosition.CenterParent;
                form.ClientSize = new Size(380, 118);
                form.BackColor = RetroTheme.Face;
                form.Font = RetroTheme.Ui;

                var label = new Label
                {
                    Text = prompt,
                    Location = new Point(12, 12),
                    Size = new Size(356, 32),
                    AutoSize = false
                };

                var textBox = new TextBox
                {
                    Text = initialValue ?? string.Empty,
                    Location = new Point(12, 48),
                    Width = 356
                };
                textBox.SelectAll();

                var ok = new Button
                {
                    Text = "OK",
                    DialogResult = DialogResult.OK,
                    Location = new Point(206, 80),
                    Width = 76
                };
                var cancel = new Button
                {
                    Text = "Cancel",
                    DialogResult = DialogResult.Cancel,
                    Location = new Point(292, 80),
                    Width = 76
                };
                RetroTheme.StyleButton(ok, true);
                RetroTheme.StyleButton(cancel, false);

                form.Controls.Add(label);
                form.Controls.Add(textBox);
                form.Controls.Add(ok);
                form.Controls.Add(cancel);
                form.AcceptButton = ok;
                form.CancelButton = cancel;

                if (form.ShowDialog(owner) != DialogResult.OK) return null;

                string value = textBox.Text.Trim();
                return value.Length == 0 ? null : value;
            }
        }
    }
}
