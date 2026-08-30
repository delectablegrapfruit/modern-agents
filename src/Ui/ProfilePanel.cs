using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using AgentWrangler.Agents;
using AgentWrangler.Behavior;
using AgentWrangler.Config;
using AgentWrangler.Library;

namespace AgentWrangler.Ui
{
    /// <summary>
    /// The settings for one agent. Every control writes straight through to the profile it
    /// is bound to, so changes take effect on the next tick, including on an agent that is
    /// already on screen.
    /// </summary>
    public sealed class ProfilePanel : UserControl
    {
        private const int LabelColumnWidth = 96;

        private readonly TableLayoutPanel _table;

        private readonly TextBox _name = new TextBox();
        private readonly Label _file = new Label();
        private readonly ComboBox _persona = new ComboBox();
        private readonly TrackBar _pester = new TrackBar();
        private readonly Label _pesterLabel = new Label();
        private readonly NumericUpDown _cooldown = new NumericUpDown();
        private readonly ComboBox _movement = new ComboBox();
        private readonly Label _movementNote = new Label();
        private readonly ComboBox _speed = new ComboBox();
        private readonly ComboBox _corner = new ComboBox();
        private readonly TrackBar _size = new TrackBar();
        private readonly Label _sizeLabel = new Label();
        private readonly ComboBox _voice = new ComboBox();
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
        private CharacterFileInfo _info;
        private bool _loading;

        public event EventHandler ProfileEdited;

        /// <summary>Lets a change reach an agent that is already on screen.</summary>
        public Func<AgentProfile, LiveAgent> LiveAgentLookup { get; set; }

        public ProfilePanel()
        {
            BackColor = RetroTheme.Face;
            Font = RetroTheme.Ui;
            AutoScroll = true;
            Padding = new Padding(10, 6, 10, 10);

            _table = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                ColumnCount = 2,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                GrowStyle = TableLayoutPanelGrowStyle.AddRows
            };
            _table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, LabelColumnWidth));
            _table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            Controls.Add(_table);

            BuildIdentity();
            BuildPestering();
            BuildMovement();
            BuildAppearance();
            BuildHabits();
            BuildReactions();

            SetEnabled(false);
        }

        // ---- sections --------------------------------------------------------------

        private void BuildIdentity()
        {
            Heading("Agent", null);

            _name.Width = 220;
            _name.TextChanged += delegate
            {
                if (Editing()) return;
                _profile.DisplayName = _name.Text;
                Edited();
            };
            Row("Name", _name);

            _file.AutoSize = true;
            _file.ForeColor = RetroTheme.Quiet;
            _file.MaximumSize = new Size(400, 0);
            Row("Character", _file);
        }

        private void BuildPestering()
        {
            Heading("Personality and pestering", ProfileSection.Pestering);

            Fill(_persona, typeof(Persona));
            _persona.SelectedIndexChanged += delegate
            {
                if (Editing() || _persona.SelectedItem == null) return;
                _profile.Persona = (Persona)Enum.Parse(typeof(Persona), _persona.SelectedItem.ToString());
                Edited();
            };
            Row("Voice of", _persona);

            _pester.Minimum = PesterCurve.Min;
            _pester.Maximum = PesterCurve.Max;
            _pester.TickFrequency = 1;
            _pester.SmallChange = 1;
            _pester.LargeChange = 1;
            _pester.Width = 260;
            _pester.Height = 34;
            _pester.ValueChanged += delegate
            {
                UpdatePesterLabel();
                if (Editing()) return;
                _profile.Pester = _pester.Value;
                Edited();
            };
            Row("Pestering", _pester);

            _pesterLabel.AutoSize = true;
            _pesterLabel.MaximumSize = new Size(400, 0);
            _pesterLabel.ForeColor = RetroTheme.Quiet;
            Row("", _pesterLabel);

            _cooldown.Minimum = 0;
            _cooldown.Maximum = 3600;
            _cooldown.Width = 70;
            _cooldown.ValueChanged += delegate
            {
                if (Editing()) return;
                _profile.CooldownSecondsOverride = (int)_cooldown.Value;
                Edited();
            };
            Row("Quiet time", Beside(_cooldown, "seconds between lines, 0 to follow the level"));
        }

        private void BuildMovement()
        {
            Heading("Movement", ProfileSection.Movement);

            _movement.DropDownStyle = ComboBoxStyle.DropDownList;
            _movement.Width = 180;
            foreach (MovementStyle style in Enum.GetValues(typeof(MovementStyle)))
                _movement.Items.Add(new MovementItem(style));
            _movement.SelectedIndexChanged += delegate
            {
                UpdateMovementNote();
                var item = _movement.SelectedItem as MovementItem;
                if (Editing() || item == null) return;
                _profile.Movement = item.Style;
                Edited();
            };
            Row("Style", _movement);

            _movementNote.AutoSize = true;
            _movementNote.MaximumSize = new Size(400, 0);
            _movementNote.ForeColor = RetroTheme.Quiet;
            Row("", _movementNote);

            Fill(_speed, typeof(MoveSpeed));
            _speed.SelectedIndexChanged += delegate
            {
                if (Editing() || _speed.SelectedItem == null) return;
                _profile.MoveSpeed = (MoveSpeed)Enum.Parse(typeof(MoveSpeed), _speed.SelectedItem.ToString());
                Edited();
            };
            Row("Speed", _speed);

            _corner.DropDownStyle = ComboBoxStyle.DropDownList;
            _corner.Width = 140;
            _corner.Items.AddRange(new object[] { "Top left", "Top right", "Bottom left", "Bottom right" });
            _corner.SelectedIndexChanged += delegate
            {
                if (Editing()) return;
                _profile.HomeCorner = _corner.SelectedIndex < 0 ? 3 : _corner.SelectedIndex;
                Edited();
            };
            Row("Home", _corner);
        }

        private void BuildAppearance()
        {
            Heading("Appearance and voice", ProfileSection.Appearance);

            _size.Minimum = AgentProfile.MinSizePercent;
            _size.Maximum = AgentProfile.MaxSizePercent;
            _size.TickFrequency = 25;
            _size.SmallChange = 5;
            _size.LargeChange = 25;
            _size.Width = 260;
            _size.Height = 34;
            _size.ValueChanged += delegate
            {
                UpdateSizeLabel();
                if (Editing()) return;
                _profile.SizePercent = _size.Value;
                LiveAgent live = Live();
                if (live != null) live.ApplyScale(_profile.ClampedSizePercent);
                Edited();
            };
            Row("Size", _size);

            _sizeLabel.AutoSize = true;
            _sizeLabel.ForeColor = RetroTheme.Quiet;
            Row("", _sizeLabel);

            _voice.DropDownStyle = ComboBoxStyle.DropDownList;
            _voice.Width = 220;
            _voice.SelectedIndexChanged += delegate
            {
                var item = _voice.SelectedItem as VoiceItem;
                if (Editing() || item == null) return;
                _profile.VoiceId = item.Id;
                LiveAgent live = Live();
                if (live != null) live.ApplyVoice(_profile.VoiceId);
                Edited();
            };
            Row("Voice", _voice);

            Toggle(_speakAloud, "Speak aloud and play sound effects",
                delegate
                {
                    _profile.SpeakAloud = _speakAloud.Checked;
                    LiveAgent live = Live();
                    if (live != null) live.SetSoundEffects(_profile.SpeakAloud);
                });

            WireAnimation(_greet, delegate { _profile.GreetAnimation = _greet.Text; });
            WireAnimation(_alert, delegate { _profile.AlertAnimation = _alert.Text; });
            WireAnimation(_rest, delegate { _profile.RestAnimation = _rest.Text; });
            Row("Greeting", _greet);
            Row("Big news", _alert);
            Row("Resting", _rest);
        }

        private void BuildHabits()
        {
            Heading("Habits", ProfileSection.Habits);

            Toggle(_autoSummon, "Summon this agent when the manager starts",
                delegate { _profile.AutoSummon = _autoSummon.Checked; });

            Toggle(_offerAssistance, "May interrupt with offers to help",
                delegate { _profile.OfferAssistance = _offerAssistance.Checked; });

            Toggle(_interrupt, "Talks over its own unfinished sentences",
                delegate { _profile.Interrupt = _interrupt.Checked; });

            Toggle(_quoteClipboard, "Reads copied text back out loud",
                delegate { _profile.QuoteClipboard = _quoteClipboard.Checked; });

            Toggle(_evasive, "The decline buttons dodge the pointer",
                delegate { _profile.EvasiveDecline = _evasive.Checked; });

            Toggle(_stealFocus, "Prompts take focus from what you are typing in",
                delegate { _profile.StealFocus = _stealFocus.Checked; });
        }

        private void BuildReactions()
        {
            Heading("Reacts to", ProfileSection.Reactions);

            _reactions.Width = 300;
            _reactions.Height = 180;
            _reactions.CheckOnClick = true;
            _reactions.IntegralHeight = false;
            foreach (ActivityKind kind in Enum.GetValues(typeof(ActivityKind)))
                _reactions.Items.Add(new ReactionItem(kind));

            _reactions.ItemCheck += delegate(object sender, ItemCheckEventArgs e)
            {
                var item = _reactions.Items[e.Index] as ReactionItem;
                if (Editing() || item == null) return;
                // ItemCheck runs before the state is applied, so the new value is the truth.
                _profile.SetReaction(item.Kind, e.NewValue == CheckState.Checked);
                Edited();
            };
            Row("", _reactions);
        }

        // ---- layout helpers --------------------------------------------------------

        private void Heading(string text, ProfileSection? resettable)
        {
            var host = new Panel
            {
                Height = 22,
                Margin = new Padding(0, 10, 0, 2),
                Width = 380
            };

            host.Controls.Add(new Label
            {
                Text = text.ToUpperInvariant(),
                Dock = DockStyle.Left,
                AutoSize = true,
                Font = RetroTheme.UiBold,
                ForeColor = RetroTheme.HeaderStart
            });

            if (resettable.HasValue)
            {
                ProfileSection section = resettable.Value;
                var reset = new LinkLabel
                {
                    Text = "reset",
                    Dock = DockStyle.Right,
                    AutoSize = true,
                    LinkColor = RetroTheme.Quiet,
                    ActiveLinkColor = RetroTheme.Accent,
                    LinkBehavior = LinkBehavior.HoverUnderline
                };
                reset.Click += delegate { ResetSection(section); };
                host.Controls.Add(reset);
            }

            _table.Controls.Add(host);
            _table.SetColumnSpan(host, 2);
        }

        private void Row(string label, Control editor)
        {
            _table.Controls.Add(new Label
            {
                Text = label,
                AutoSize = true,
                Margin = new Padding(0, 5, 6, 2),
                ForeColor = RetroTheme.Ink
            });
            editor.Margin = new Padding(0, 2, 0, 2);
            _table.Controls.Add(editor);
        }

        private void Toggle(CheckBox box, string caption, Action apply)
        {
            box.Text = caption;
            box.AutoSize = true;
            box.Margin = new Padding(0, 1, 0, 1);
            box.CheckedChanged += delegate
            {
                if (Editing()) return;
                apply();
                Edited();
            };
            _table.Controls.Add(box);
            _table.SetColumnSpan(box, 2);
        }

        private void WireAnimation(ComboBox combo, Action apply)
        {
            combo.Width = 180;
            combo.DropDownStyle = ComboBoxStyle.DropDown;
            combo.TextChanged += delegate
            {
                if (Editing()) return;
                apply();
                Edited();
            };
        }

        private static Control Beside(Control editor, string hint)
        {
            var host = new FlowLayoutPanel
            {
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
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

        private static void Fill(ComboBox combo, Type enumType)
        {
            combo.DropDownStyle = ComboBoxStyle.DropDownList;
            combo.Width = 140;
            foreach (object value in Enum.GetValues(enumType)) combo.Items.Add(value.ToString());
        }

        // ---- binding ---------------------------------------------------------------

        public AgentProfile Profile { get { return _profile; } }

        private bool Editing() { return _loading || _profile == null; }

        private LiveAgent Live()
        {
            return LiveAgentLookup == null || _profile == null ? null : LiveAgentLookup(_profile);
        }

        public void Bind(AgentProfile profile, CharacterFileInfo info)
        {
            _profile = profile;
            _info = info;
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
                SelectMovement(profile.Movement);
                _speed.SelectedItem = profile.MoveSpeed.ToString();
                _corner.SelectedIndex = Math.Min(3, Math.Max(0, profile.HomeCorner));
                _size.Value = profile.ClampedSizePercent;

                LoadVoices(profile.VoiceId);
                LoadAnimations(info);

                _autoSummon.Checked = profile.AutoSummon;
                _offerAssistance.Checked = profile.OfferAssistance;
                _speakAloud.Checked = profile.SpeakAloud;
                _interrupt.Checked = profile.Interrupt;
                _quoteClipboard.Checked = profile.QuoteClipboard;
                _evasive.Checked = profile.EvasiveDecline;
                _stealFocus.Checked = profile.StealFocus;

                for (int i = 0; i < _reactions.Items.Count; i++)
                {
                    var item = _reactions.Items[i] as ReactionItem;
                    _reactions.SetItemChecked(i, item != null && profile.ReactsTo(item.Kind));
                }

                UpdatePesterLabel();
                UpdateMovementNote();
                UpdateSizeLabel();
            }
            finally
            {
                _loading = false;
            }
        }

        private void ResetSection(ProfileSection section)
        {
            if (_profile == null) return;
            _profile.ResetSection(section);
            Bind(_profile, _info);

            LiveAgent live = Live();
            if (live != null)
            {
                live.ApplyScale(_profile.ClampedSizePercent);
                live.SetSoundEffects(_profile.SpeakAloud);
            }
            Edited();
        }

        private void SelectMovement(MovementStyle style)
        {
            foreach (object item in _movement.Items)
            {
                var candidate = item as MovementItem;
                if (candidate != null && candidate.Style == style)
                {
                    _movement.SelectedItem = candidate;
                    return;
                }
            }
        }

        private void LoadVoices(string selectedId)
        {
            _voice.Items.Clear();
            _voice.Items.Add(new VoiceItem(string.Empty, "The character's own voice"));
            foreach (VoiceInfo voice in SapiVoices.All())
                _voice.Items.Add(new VoiceItem(voice.Id, voice.Name));

            foreach (object item in _voice.Items)
            {
                var candidate = item as VoiceItem;
                if (candidate != null &&
                    string.Equals(candidate.Id, selectedId ?? string.Empty, StringComparison.OrdinalIgnoreCase))
                {
                    _voice.SelectedItem = candidate;
                    return;
                }
            }
            _voice.SelectedIndex = 0;
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

        private static string DescribeFile(AgentProfile profile, CharacterFileInfo info)
        {
            string fileName = string.IsNullOrEmpty(profile.CharacterPath)
                ? "(none)"
                : System.IO.Path.GetFileName(profile.CharacterPath);

            if (!string.IsNullOrEmpty(profile.CharacterPath) && !System.IO.File.Exists(profile.CharacterPath))
                return fileName + "  (missing)";

            if (info != null && info.HasBeenProbed && !string.IsNullOrEmpty(info.Description))
                return fileName + " -- " + info.Description;

            return fileName;
        }

        private void UpdatePesterLabel()
        {
            _pesterLabel.Text = _pester.Value + " -- " + PesterCurve.LevelName(_pester.Value) + ". " +
                                PesterCurve.LevelBlurb(_pester.Value);
        }

        private void UpdateMovementNote()
        {
            var item = _movement.SelectedItem as MovementItem;
            _movementNote.Text = item == null ? string.Empty : item.Description;
        }

        private void UpdateSizeLabel()
        {
            string text = _size.Value + "% of the character's own size";
            if (_info != null && _info.NativeWidth > 0)
            {
                text += "  (" + _info.NativeWidth * _size.Value / 100 + " x " +
                        _info.NativeHeight * _size.Value / 100 + " pixels)";
            }
            _sizeLabel.Text = text;
        }

        private void SetEnabled(bool enabled)
        {
            foreach (Control control in _table.Controls)
            {
                if (control is Label) continue;
                control.Enabled = enabled;
            }
        }

        private void Edited()
        {
            EventHandler handler = ProfileEdited;
            if (handler != null) handler(this, EventArgs.Empty);
        }

        // ---- list items ------------------------------------------------------------

        private sealed class MovementItem
        {
            public MovementStyle Style { get; private set; }
            public MovementItem(MovementStyle style) { Style = style; }

            public string Description
            {
                get
                {
                    switch (Style)
                    {
                        case MovementStyle.Stay:
                            return "Placed in its home corner once and never moves again.";
                        case MovementStyle.Wander:
                            return "Hops to an unrelated part of the screen every so often.";
                        case MovementStyle.FollowCursor:
                            return "Shadows the pointer, keeping pace as you move it.";
                        case MovementStyle.Perch:
                            return "Lives in its home corner, leaving for the odd excursion.";
                        case MovementStyle.Orbit:
                            return "Circles the window you are working in, one step at a time.";
                        default:
                            return string.Empty;
                    }
                }
            }

            public override string ToString()
            {
                switch (Style)
                {
                    case MovementStyle.Stay: return "Stay put";
                    case MovementStyle.Wander: return "Wander";
                    case MovementStyle.FollowCursor: return "Follow the pointer";
                    case MovementStyle.Perch: return "Perch in a corner";
                    case MovementStyle.Orbit: return "Orbit the window";
                    default: return Style.ToString();
                }
            }
        }

        private sealed class VoiceItem
        {
            public string Id { get; private set; }
            private readonly string _name;

            public VoiceItem(string id, string name)
            {
                Id = id ?? string.Empty;
                _name = name;
            }

            public override string ToString() { return _name; }
        }

        private sealed class ReactionItem
        {
            public ActivityKind Kind { get; private set; }
            public ReactionItem(ActivityKind kind) { Kind = kind; }

            public override string ToString()
            {
                switch (Kind)
                {
                    case ActivityKind.ClipboardCopy: return "Something is copied";
                    case ActivityKind.DownloadStarted: return "A download starts";
                    case ActivityKind.DownloadFinished: return "A download finishes";
                    case ActivityKind.FileCreated: return "A file appears";
                    case ActivityKind.FileDeleted: return "A file is deleted";
                    case ActivityKind.FileRenamed: return "A file is renamed";
                    case ActivityKind.AppFocused: return "You switch windows";
                    case ActivityKind.AppLaunched: return "You open a program";
                    case ActivityKind.UserIdle: return "You stop using the computer";
                    case ActivityKind.UserReturned: return "You come back";
                    case ActivityKind.Nag: return "Nothing at all";
                    case ActivityKind.Summoned: return "It is summoned";
                    case ActivityKind.Dismissed: return "It is dismissed";
                    default: return Kind.ToString();
                }
            }
        }
    }
}
