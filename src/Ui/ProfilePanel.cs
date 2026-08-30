using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using AgentWrangler.Behavior;
using AgentWrangler.Config;
using AgentWrangler.Library;

namespace AgentWrangler.Ui
{
    /// <summary>
    /// The behaviour editor for one agent. Every control writes straight through to the
    /// profile it is bound to, so changes take effect on the next tick without an Apply
    /// button -- including on an agent that is already on screen and talking.
    /// </summary>
    public sealed class ProfilePanel : UserControl
    {
        private readonly TableLayoutPanel _table;

        private readonly TextBox _name = new TextBox();
        private readonly Label _file = new Label();
        private readonly ComboBox _persona = new ComboBox();
        private readonly TrackBar _pester = new TrackBar();
        private readonly Label _pesterLabel = new Label();
        private readonly Label _pesterBlurb = new Label();
        private readonly ComboBox _movement = new ComboBox();
        private readonly ComboBox _speed = new ComboBox();
        private readonly ComboBox _corner = new ComboBox();
        private readonly NumericUpDown _cooldown = new NumericUpDown();
        private readonly ComboBox _greet = new ComboBox();
        private readonly ComboBox _alert = new ComboBox();
        private readonly ComboBox _rest = new ComboBox();
        private readonly CheckedListBox _reactions = new CheckedListBox();

        private readonly CheckBox _autoSummon = new CheckBox();
        private readonly CheckBox _offerAssistance = new CheckBox();
        private readonly CheckBox _speakAloud = new CheckBox();
        private readonly CheckBox _interrupt = new CheckBox();
        private readonly CheckBox _quoteClipboard = new CheckBox();
        private readonly CheckBox _evasive = new CheckBox();
        private readonly CheckBox _stealFocus = new CheckBox();

        private AgentProfile _profile;
        private bool _loading;

        /// <summary>Raised after any edit, so the owner can refresh its list and save.</summary>
        public event EventHandler ProfileEdited;

        public ProfilePanel()
        {
            BackColor = RetroTheme.Face;
            Font = RetroTheme.Ui;
            AutoScroll = true;
            Padding = new Padding(10);

            _table = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                ColumnCount = 2,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                GrowStyle = TableLayoutPanelGrowStyle.AddRows
            };
            _table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 118f));
            _table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            Controls.Add(_table);

            BuildIdentity();
            BuildPester();
            BuildMovement();
            BuildToggles();
            BuildAnimations();
            BuildReactions();

            SetEnabled(false);
        }

        // ---- construction ----------------------------------------------------------

        private void BuildIdentity()
        {
            Heading("Identity");

            _name.Width = 240;
            _name.TextChanged += delegate
            {
                if (_loading || _profile == null) return;
                _profile.DisplayName = _name.Text;
                RaiseEdited();
            };
            Row("Name", _name);

            _file.AutoSize = true;
            _file.ForeColor = RetroTheme.Quiet;
            _file.MaximumSize = new Size(420, 0);
            Row("Character", _file);

            FillEnum(_persona, typeof(Persona));
            _persona.SelectedIndexChanged += delegate
            {
                if (_loading || _profile == null || _persona.SelectedItem == null) return;
                _profile.Persona = (Persona)Enum.Parse(typeof(Persona), _persona.SelectedItem.ToString());
                RaiseEdited();
            };
            Row("Personality", _persona);
        }

        private void BuildPester()
        {
            Heading("How much it pesters you");

            _pester.Minimum = PesterCurve.Min;
            _pester.Maximum = PesterCurve.Max;
            _pester.TickFrequency = 1;
            _pester.SmallChange = 1;
            _pester.LargeChange = 1;
            _pester.Width = 300;
            _pester.Height = 40;
            _pester.ValueChanged += delegate
            {
                UpdatePesterLabels();
                if (_loading || _profile == null) return;
                _profile.Pester = _pester.Value;
                RaiseEdited();
            };
            Row("Level", _pester);

            _pesterLabel.AutoSize = true;
            _pesterLabel.Font = RetroTheme.UiBold;
            _pesterLabel.ForeColor = RetroTheme.Accent;
            Row("", _pesterLabel);

            _pesterBlurb.AutoSize = true;
            _pesterBlurb.ForeColor = RetroTheme.Quiet;
            _pesterBlurb.MaximumSize = new Size(420, 0);
            Row("", _pesterBlurb);

            _cooldown.Minimum = 0;
            _cooldown.Maximum = 3600;
            _cooldown.Width = 80;
            _cooldown.ValueChanged += delegate
            {
                if (_loading || _profile == null) return;
                _profile.CooldownSecondsOverride = (int)_cooldown.Value;
                RaiseEdited();
            };
            Row("Quiet time", WithHint(_cooldown, "seconds between lines (0 = follow the level)"));
        }

        private void BuildMovement()
        {
            Heading("Where it goes");

            FillEnum(_movement, typeof(MovementStyle));
            _movement.SelectedIndexChanged += delegate
            {
                if (_loading || _profile == null || _movement.SelectedItem == null) return;
                _profile.Movement = (MovementStyle)Enum.Parse(typeof(MovementStyle), _movement.SelectedItem.ToString());
                RaiseEdited();
            };
            Row("Movement", _movement);

            FillEnum(_speed, typeof(MoveSpeed));
            _speed.SelectedIndexChanged += delegate
            {
                if (_loading || _profile == null || _speed.SelectedItem == null) return;
                _profile.MoveSpeed = (MoveSpeed)Enum.Parse(typeof(MoveSpeed), _speed.SelectedItem.ToString());
                RaiseEdited();
            };
            Row("Speed", _speed);

            _corner.DropDownStyle = ComboBoxStyle.DropDownList;
            _corner.Items.AddRange(new object[] { "Top left", "Top right", "Bottom left", "Bottom right" });
            _corner.Width = 160;
            _corner.SelectedIndexChanged += delegate
            {
                if (_loading || _profile == null) return;
                _profile.HomeCorner = _corner.SelectedIndex < 0 ? 3 : _corner.SelectedIndex;
                RaiseEdited();
            };
            Row("Home corner", _corner);
        }

        private void BuildToggles()
        {
            Heading("Habits");

            Toggle(_autoSummon, "Summon this agent when the manager starts",
                delegate { _profile.AutoSummon = _autoSummon.Checked; });

            Toggle(_offerAssistance, "May interrupt with offers to help",
                delegate { _profile.OfferAssistance = _offerAssistance.Checked; });

            Toggle(_speakAloud, "Use the speech engine and sound effects when available",
                delegate
                {
                    _profile.SpeakAloud = _speakAloud.Checked;
                    if (LiveAgentLookup != null)
                    {
                        var live = LiveAgentLookup(_profile);
                        if (live != null) live.SetSoundEffects(_profile.SpeakAloud);
                    }
                });

            Toggle(_interrupt, "Talks over its own unfinished sentences",
                delegate { _profile.Interrupt = _interrupt.Checked; });

            Toggle(_quoteClipboard, "Reads copied text back out loud (off by default)",
                delegate { _profile.QuoteClipboard = _quoteClipboard.Checked; });

            Toggle(_evasive, "The \"No thanks\" button dodges the pointer",
                delegate { _profile.EvasiveDecline = _evasive.Checked; });

            Toggle(_stealFocus, "Prompts take focus from whatever you were typing in",
                delegate { _profile.StealFocus = _stealFocus.Checked; });
        }

        private void BuildAnimations()
        {
            Heading("Animations");

            WireAnimation(_greet, delegate { _profile.GreetAnimation = _greet.Text; });
            Row("Greeting", _greet);

            WireAnimation(_alert, delegate { _profile.AlertAnimation = _alert.Text; });
            Row("Big news", _alert);

            WireAnimation(_rest, delegate { _profile.RestAnimation = _rest.Text; });
            Row("Resting", _rest);

            var hint = new Label
            {
                Text = "Probe the character to fill these lists with the animations it really has.",
                AutoSize = true,
                ForeColor = RetroTheme.Quiet,
                MaximumSize = new Size(420, 0)
            };
            Row("", hint);
        }

        private void BuildReactions()
        {
            Heading("What it comments on");

            _reactions.Width = 300;
            _reactions.Height = 190;
            _reactions.CheckOnClick = true;
            _reactions.IntegralHeight = false;
            foreach (ActivityKind kind in Enum.GetValues(typeof(ActivityKind)))
                _reactions.Items.Add(new ReactionItem(kind));

            _reactions.ItemCheck += delegate(object sender, ItemCheckEventArgs e)
            {
                if (_loading || _profile == null) return;
                var item = _reactions.Items[e.Index] as ReactionItem;
                if (item == null) return;

                // ItemCheck fires before the state is applied, so use the new value.
                _profile.SetReaction(item.Kind, e.NewValue == CheckState.Checked);
                RaiseEdited();
            };
            Row("Activities", _reactions);
        }

        // ---- layout helpers --------------------------------------------------------

        private void Heading(string text)
        {
            var label = new Label
            {
                Text = text.ToUpperInvariant(),
                AutoSize = true,
                Font = RetroTheme.UiBold,
                ForeColor = RetroTheme.HeaderStart,
                Margin = new Padding(0, 12, 0, 4)
            };
            _table.Controls.Add(label);
            _table.SetColumnSpan(label, 2);
        }

        private void Row(string label, Control editor)
        {
            var caption = new Label
            {
                Text = label,
                AutoSize = true,
                Margin = new Padding(0, 5, 6, 4),
                ForeColor = RetroTheme.Ink
            };
            _table.Controls.Add(caption);
            editor.Margin = new Padding(0, 2, 0, 4);
            _table.Controls.Add(editor);
        }

        private void Toggle(CheckBox box, string caption, Action apply)
        {
            box.Text = caption;
            box.AutoSize = true;
            box.Margin = new Padding(0, 2, 0, 2);
            box.CheckedChanged += delegate
            {
                if (_loading || _profile == null) return;
                apply();
                RaiseEdited();
            };
            _table.Controls.Add(box);
            _table.SetColumnSpan(box, 2);
        }

        private void WireAnimation(ComboBox combo, Action apply)
        {
            combo.Width = 200;
            combo.DropDownStyle = ComboBoxStyle.DropDown;
            combo.TextChanged += delegate
            {
                if (_loading || _profile == null) return;
                apply();
                RaiseEdited();
            };
        }

        private static Control WithHint(Control editor, string hint)
        {
            var host = new FlowLayoutPanel
            {
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                FlowDirection = FlowDirection.LeftToRight,
                Margin = Padding.Empty,
                WrapContents = false
            };
            host.Controls.Add(editor);
            host.Controls.Add(new Label
            {
                Text = hint,
                AutoSize = true,
                ForeColor = RetroTheme.Quiet,
                Margin = new Padding(6, 5, 0, 0)
            });
            return host;
        }

        private static void FillEnum(ComboBox combo, Type enumType)
        {
            combo.DropDownStyle = ComboBoxStyle.DropDownList;
            combo.Width = 160;
            foreach (object value in Enum.GetValues(enumType)) combo.Items.Add(value.ToString());
        }

        // ---- binding ---------------------------------------------------------------

        /// <summary>
        /// Set by the manager so the panel can push a live change (sound effects) straight
        /// to an agent that is already on screen.
        /// </summary>
        public Func<AgentProfile, Agents.LiveAgent> LiveAgentLookup { get; set; }

        public AgentProfile Profile { get { return _profile; } }

        public void Bind(AgentProfile profile, CharacterFileInfo info)
        {
            _profile = profile;
            _loading = true;

            try
            {
                if (profile == null)
                {
                    SetEnabled(false);
                    _name.Text = string.Empty;
                    _file.Text = string.Empty;
                    return;
                }

                SetEnabled(true);

                _name.Text = profile.DisplayName ?? string.Empty;
                _file.Text = DescribeFile(profile, info);
                _persona.SelectedItem = profile.Persona.ToString();
                _pester.Value = PesterCurve.Clamp(profile.Pester);
                _cooldown.Value = Math.Min(_cooldown.Maximum, Math.Max(0, profile.CooldownSecondsOverride));
                _movement.SelectedItem = profile.Movement.ToString();
                _speed.SelectedItem = profile.MoveSpeed.ToString();
                _corner.SelectedIndex = Math.Min(3, Math.Max(0, profile.HomeCorner));

                _autoSummon.Checked = profile.AutoSummon;
                _offerAssistance.Checked = profile.OfferAssistance;
                _speakAloud.Checked = profile.SpeakAloud;
                _interrupt.Checked = profile.Interrupt;
                _quoteClipboard.Checked = profile.QuoteClipboard;
                _evasive.Checked = profile.EvasiveDecline;
                _stealFocus.Checked = profile.StealFocus;

                LoadAnimations(info);

                for (int i = 0; i < _reactions.Items.Count; i++)
                {
                    var item = _reactions.Items[i] as ReactionItem;
                    _reactions.SetItemChecked(i, item != null && profile.ReactsTo(item.Kind));
                }

                UpdatePesterLabels();
            }
            finally
            {
                _loading = false;
            }
        }

        private static string DescribeFile(AgentProfile profile, CharacterFileInfo info)
        {
            string fileName = string.IsNullOrEmpty(profile.CharacterPath)
                ? "(none)"
                : System.IO.Path.GetFileName(profile.CharacterPath);

            if (info != null && info.HasBeenProbed && !string.IsNullOrEmpty(info.Description))
                return fileName + " -- " + info.Description;

            if (!string.IsNullOrEmpty(profile.CharacterPath) && !System.IO.File.Exists(profile.CharacterPath))
                return fileName + "  (MISSING)";

            return fileName;
        }

        private void LoadAnimations(CharacterFileInfo info)
        {
            var names = new List<string>();
            if (info != null && info.Animations != null) names.AddRange(info.Animations);
            names.Sort(StringComparer.CurrentCultureIgnoreCase);

            foreach (ComboBox combo in new[] { _greet, _alert, _rest })
            {
                combo.Items.Clear();
                combo.Items.Add(string.Empty);
                foreach (string name in names) combo.Items.Add(name);
            }

            _greet.Text = _profile.GreetAnimation ?? string.Empty;
            _alert.Text = _profile.AlertAnimation ?? string.Empty;
            _rest.Text = _profile.RestAnimation ?? string.Empty;
        }

        private void UpdatePesterLabels()
        {
            _pesterLabel.Text = _pester.Value + " -- " + PesterCurve.LevelName(_pester.Value);
            _pesterBlurb.Text = PesterCurve.LevelBlurb(_pester.Value);
        }

        private void SetEnabled(bool enabled)
        {
            foreach (Control control in _table.Controls)
            {
                if (control is Label) continue;
                control.Enabled = enabled;
            }
        }

        private void RaiseEdited()
        {
            EventHandler handler = ProfileEdited;
            if (handler != null) handler(this, EventArgs.Empty);
        }

        /// <summary>Wraps an activity kind with a caption the user can actually read.</summary>
        private sealed class ReactionItem
        {
            public ActivityKind Kind { get; private set; }
            public ReactionItem(ActivityKind kind) { Kind = kind; }

            public override string ToString()
            {
                switch (Kind)
                {
                    case ActivityKind.ClipboardCopy: return "Something is copied to the clipboard";
                    case ActivityKind.DownloadStarted: return "A download starts";
                    case ActivityKind.DownloadFinished: return "A download finishes";
                    case ActivityKind.FileCreated: return "A file appears";
                    case ActivityKind.FileDeleted: return "A file is deleted";
                    case ActivityKind.FileRenamed: return "A file is renamed";
                    case ActivityKind.AppFocused: return "You switch windows";
                    case ActivityKind.AppLaunched: return "You open a program";
                    case ActivityKind.UserIdle: return "You stop using the computer";
                    case ActivityKind.UserReturned: return "You come back";
                    case ActivityKind.Nag: return "Nothing at all (unprompted chatter)";
                    case ActivityKind.Summoned: return "It is summoned";
                    case ActivityKind.Dismissed: return "It is dismissed";
                    default: return Kind.ToString();
                }
            }
        }
    }
}
