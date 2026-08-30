using System;
using System.Drawing;
using System.Windows.Forms;
using AgentWrangler.Behavior;
using AgentWrangler.Interop;

namespace AgentWrangler.Ui
{
    /// <summary>
    /// The manager window: the roster on the left, settings and activity on the right,
    /// and the global controls along the bottom. Handlers live in MainForm.Actions.cs.
    /// </summary>
    public sealed partial class MainForm : Form
    {
        // The engine integrates continuous movement on this timer, so it runs at something
        // close to a frame rate rather than at the decision-making interval.
        private const int TickIntervalMs = 40;
        private const int RefreshIntervalMs = 1000;
        private const int MaxLogRows = 300;

        private readonly AppHost _host;
        private readonly ToolTip _tips = new ToolTip();

        private readonly ListView _agentList = new ListView();
        private readonly TextBox _search = new TextBox();
        private readonly ProfilePanel _profilePanel = new ProfilePanel();
        private readonly ListView _activeList = new ListView();
        private readonly ListView _logList = new ListView();
        private readonly ListBox _libraryFolders = new ListBox();
        private readonly ListBox _watchedFolders = new ListBox();
        private readonly TextBox _diagnostics = new TextBox();

        private readonly TrackBar _masterPester = new TrackBar();
        private readonly Label _masterLabel = new Label();
        private readonly CheckBox _muzzle = new CheckBox();
        private readonly Button _panicButton = new Button();
        private readonly CheckBox _pauseLog = new CheckBox();
        private readonly Label _rosterCount = new Label();

        private readonly NotifyIcon _tray = new NotifyIcon();
        private readonly Timer _tickTimer = new Timer();
        private readonly Timer _refreshTimer = new Timer();

        private ContextMenuStrip _agentMenu;
        private Panel _header;
        private string _connectionText = string.Empty;
        private bool _connectionOk;

        private Icon _appIcon;
        private bool _reallyExit;
        private bool _updatingControls;

        public MainForm(AppHost host)
        {
            if (host == null) throw new ArgumentNullException("host");
            _host = host;

            BuildWindow();
            BuildBody();
            BuildHeader();
            BuildBottomBar();
            BuildTray();

            WireUp();
        }

        private void BuildWindow()
        {
            Text = "Agent Wrangler";
            ClientSize = new Size(940, 640);
            MinimumSize = new Size(820, 560);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = RetroTheme.Face;
            Font = RetroTheme.Ui;

            try
            {
                _appIcon = RetroTheme.BuildAppIcon();
                Icon = _appIcon;
            }
            catch (Exception ex)
            {
                Diagnostics.Warn("Could not build the application icon: " + ex.Message);
            }
        }

        // ---- header and footer -----------------------------------------------------

        private void BuildHeader()
        {
            _header = new Panel { Dock = DockStyle.Top, Height = 40, BackColor = RetroTheme.HeaderStart };
            _header.Paint += PaintHeaderStrip;
            _header.Click += OnReconnectClicked;
            _header.Cursor = Cursors.Hand;
            Controls.Add(_header);
        }

        private void PaintHeaderStrip(object sender, PaintEventArgs e)
        {
            var bounds = new Rectangle(0, 0, _header.Width, _header.Height);
            RetroTheme.PaintHeader(e.Graphics, bounds, string.Empty);

            using (var brush = new SolidBrush(RetroTheme.HeaderText))
            {
                e.Graphics.DrawString("AGENT WRANGLER", RetroTheme.Display, brush, 12, 10);
            }

            var status = new Rectangle(bounds.Width - 460, 0, 448, bounds.Height);
            var format = new StringFormat
            {
                Alignment = StringAlignment.Far,
                LineAlignment = StringAlignment.Center,
                Trimming = StringTrimming.EllipsisCharacter
            };
            using (var brush = new SolidBrush(_connectionOk ? Color.White : Color.FromArgb(255, 214, 140)))
            {
                e.Graphics.DrawString(_connectionText, RetroTheme.Ui, brush, status, format);
            }
        }

        /// <summary>
        /// One flow row, so nothing can end up sitting on top of anything else however the
        /// controls are sized.
        /// </summary>
        private void BuildBottomBar()
        {
            var bar = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Padding = new Padding(10, 5, 10, 5),
                BackColor = RetroTheme.Face
            };
            bar.Paint += delegate(object sender, PaintEventArgs e)
            {
                using (var pen = new Pen(Color.FromArgb(150, 150, 156)))
                {
                    e.Graphics.DrawLine(pen, 0, 0, bar.Width, 0);
                }
            };

            bar.Controls.Add(new Label
            {
                Text = "Pestering",
                AutoSize = true,
                Font = RetroTheme.UiBold,
                Margin = new Padding(0, 9, 6, 0)
            });

            _masterPester.Minimum = PesterCurve.Min;
            _masterPester.Maximum = PesterCurve.Max;
            _masterPester.TickFrequency = 1;
            _masterPester.SmallChange = 1;
            _masterPester.LargeChange = 1;
            _masterPester.Width = 190;
            _masterPester.Height = 32;
            _masterPester.Margin = new Padding(0, 0, 6, 0);
            _masterPester.ValueChanged += OnMasterPesterChanged;
            bar.Controls.Add(_masterPester);

            _masterLabel.AutoSize = true;
            _masterLabel.Font = RetroTheme.UiBold;
            _masterLabel.ForeColor = RetroTheme.Accent;
            _masterLabel.Margin = new Padding(0, 9, 16, 0);
            bar.Controls.Add(_masterLabel);

            _muzzle.Text = "Muzzle everyone";
            _muzzle.AutoSize = true;
            _muzzle.Margin = new Padding(0, 9, 16, 0);
            _muzzle.CheckedChanged += OnMuzzleChanged;
            bar.Controls.Add(_muzzle);

            _panicButton.Text = "Hide all";
            _panicButton.Width = 110;
            _panicButton.Height = 26;
            _panicButton.Margin = new Padding(0, 4, 16, 0);
            RetroTheme.StyleButton(_panicButton, true);
            _panicButton.Click += delegate { TogglePanic(); };
            bar.Controls.Add(_panicButton);

            _rosterCount.AutoSize = true;
            _rosterCount.ForeColor = RetroTheme.Quiet;
            _rosterCount.Margin = new Padding(0, 9, 0, 0);
            bar.Controls.Add(_rosterCount);

            Controls.Add(bar);
        }

        // ---- body ------------------------------------------------------------------

        private void BuildBody()
        {
            var split = new SplitContainer
            {
                Orientation = Orientation.Vertical,
                SplitterWidth = 6,
                FixedPanel = FixedPanel.Panel1,
                BackColor = RetroTheme.Face
            };

            split.Size = new Size(Math.Max(ClientSize.Width, 640), Math.Max(ClientSize.Height, 400));
            SplitterLayout.Apply(split);
            split.Dock = DockStyle.Fill;

            split.Panel1.Controls.Add(BuildRosterPane());
            split.Panel2.Controls.Add(BuildTabs());
            Controls.Add(split);
        }

        private Control BuildRosterPane()
        {
            var host = new Panel { Dock = DockStyle.Fill, Padding = new Padding(8, 6, 8, 8) };

            _agentMenu = BuildAgentMenu();

            _agentList.Dock = DockStyle.Fill;
            _agentList.View = View.Details;
            _agentList.FullRowSelect = true;
            _agentList.MultiSelect = false;
            _agentList.HideSelection = false;
            _agentList.GridLines = true;
            _agentList.ContextMenuStrip = _agentMenu;
            _agentList.Columns.Add("Agent", 148);
            _agentList.Columns.Add("Character", 118);
            _agentList.Columns.Add("Level", 42);
            _agentList.Columns.Add("State", 62);
            _agentList.SelectedIndexChanged += OnAgentSelectionChanged;
            _agentList.DoubleClick += delegate { ToggleSelectedAgent(); };

            _search.Dock = DockStyle.Top;
            _search.TextChanged += delegate { RefreshAgentList(); };
            _tips.SetToolTip(_search, "Filter the list by agent name or character file");

            var title = new Label
            {
                Text = "YOUR AGENTS",
                Dock = DockStyle.Top,
                Height = 18,
                Font = RetroTheme.UiBold,
                ForeColor = RetroTheme.HeaderStart
            };

            var buttons = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                WrapContents = true,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Padding = new Padding(0, 6, 0, 0)
            };
            buttons.Controls.Add(Button("Summon", 76, delegate { SummonSelected(); },
                                        "Load this character and put it on screen"));
            buttons.Controls.Add(Button("Dismiss", 76, delegate { DismissSelected(); },
                                        "Take this agent off screen and unload it"));
            buttons.Controls.Add(Button("Inspect", 76, delegate { ProbeSelected(); },
                                        "Load the character briefly to read its name, size and animation list"));
            buttons.Controls.Add(Button("More...", 76, ShowAgentMenu,
                                        "Duplicate, remove, import and character file management"));

            host.Controls.Add(_agentList);
            host.Controls.Add(_search);
            host.Controls.Add(title);
            host.Controls.Add(buttons);
            return host;
        }

        private ContextMenuStrip BuildAgentMenu()
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add("Summon", null, delegate { SummonSelected(); });
            menu.Items.Add("Dismiss", null, delegate { DismissSelected(); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Inspect character", null, delegate { ProbeSelected(); });
            menu.Items.Add("Duplicate agent", null, delegate { DuplicateSelected(); });
            menu.Items.Add("Remove from list", null, delegate { RemoveSelected(); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Import character file...", null, delegate { ImportCharacter(); });
            menu.Items.Add("Rescan folders", null, delegate { RescanLibrary(); });
            menu.Items.Add("Show file in folder", null, delegate { ShowInFolder(); });
            menu.Items.Add("Rename character file...", null, delegate { RenameCharacterFile(); });
            menu.Items.Add("Delete character file...", null, delegate { DeleteCharacterFile(); });
            return menu;
        }

        private void ShowAgentMenu(object sender, EventArgs e)
        {
            var button = sender as Control;
            if (button == null) return;
            _agentMenu.Show(button, new Point(0, button.Height));
        }

        private Control BuildTabs()
        {
            var tabs = new TabControl { Dock = DockStyle.Fill, Padding = new Point(10, 4) };

            var behaviour = new TabPage("Behaviour") { BackColor = RetroTheme.Face };
            _profilePanel.Dock = DockStyle.Fill;
            _profilePanel.LiveAgentLookup = LookUpLiveAgent;
            _profilePanel.ProfileEdited += OnProfileEdited;
            behaviour.Controls.Add(_profilePanel);
            tabs.TabPages.Add(behaviour);

            tabs.TabPages.Add(BuildActivityTab());
            tabs.TabPages.Add(BuildSetupTab());
            return tabs;
        }

        /// <summary>Who is on screen, and what everyone has been saying.</summary>
        private TabPage BuildActivityTab()
        {
            var page = new TabPage("Activity") { BackColor = RetroTheme.Face, Padding = new Padding(8) };

            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 4 };
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 38f));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 62f));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));

            _activeList.Dock = DockStyle.Fill;
            _activeList.View = View.Details;
            _activeList.FullRowSelect = true;
            _activeList.MultiSelect = false;
            _activeList.HideSelection = false;
            _activeList.GridLines = true;
            _activeList.Columns.Add("On screen", 120);
            _activeList.Columns.Add("Level", 44);
            _activeList.Columns.Add("Lines", 46);
            _activeList.Columns.Add("Last thing it said", 300);

            var rosterButtons = Row(
                Button("Dismiss", 76, delegate { DismissActiveSelection(); }, "Take this agent off screen"),
                Button("Dismiss all", 84, delegate { DismissAll(); }, "Take every agent off screen"),
                Button("Move it", 70, delegate { MoveActiveSelection(); }, "Send it somewhere else now"),
                Button("Make it talk", 90, delegate { ProvokeActiveSelection(); }, "Force a line out of it now"));

            _logList.Dock = DockStyle.Fill;
            _logList.View = View.Details;
            _logList.FullRowSelect = true;
            _logList.GridLines = true;
            _logList.Columns.Add("Time", 62);
            _logList.Columns.Add("Who", 104);
            _logList.Columns.Add("What", 440);

            _pauseLog.Text = "Pause";
            _pauseLog.AutoSize = true;
            _pauseLog.Margin = new Padding(8, 6, 0, 0);
            var logButtons = Row(Button("Clear log", 78, delegate { _logList.Items.Clear(); }, null));
            logButtons.Controls.Add(_pauseLog);

            layout.Controls.Add(_activeList, 0, 0);
            layout.Controls.Add(rosterButtons, 0, 1);
            layout.Controls.Add(_logList, 0, 2);
            layout.Controls.Add(logButtons, 0, 3);

            page.Controls.Add(layout);
            return page;
        }

        /// <summary>Folders, the Agent server, the options nobody changes twice, and the report.</summary>
        private TabPage BuildSetupTab()
        {
            var page = new TabPage("Setup") { BackColor = RetroTheme.Face, Padding = new Padding(8) };

            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 4 };
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 44f));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 56f));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));

            layout.Controls.Add(BuildOptions(), 0, 0);
            layout.Controls.Add(BuildFolders(), 0, 1);

            _diagnostics.Multiline = true;
            _diagnostics.ReadOnly = true;
            _diagnostics.ScrollBars = ScrollBars.Vertical;
            _diagnostics.Dock = DockStyle.Fill;
            _diagnostics.BackColor = RetroTheme.Paper;
            _diagnostics.Font = new Font(FontFamily.GenericMonospace, 8.25f);
            layout.Controls.Add(_diagnostics, 0, 2);

            layout.Controls.Add(BuildSetupButtons(), 0, 3);

            page.Controls.Add(layout);
            return page;
        }

        private Control BuildOptions()
        {
            var options = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                WrapContents = true,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink
            };

            options.Controls.Add(Check("Start when I log in", _host.Settings.LaunchOnLogin,
                delegate(bool on) { _host.SetLaunchOnLogin(on); }));

            options.Controls.Add(Check("Start hidden in the tray", _host.Settings.StartMinimized,
                delegate(bool on) { _host.Settings.StartMinimized = on; _host.SaveSettings(); }));

            options.Controls.Add(Check("Random lines instead of a full rotation", _host.Settings.RandomDialogue,
                delegate(bool on) { _host.Settings.RandomDialogue = on; _host.SaveSettings(); },
                "Off: every line in a bank is used before any repeats, shared across all agents"));

            return options;
        }

        private Control BuildFolders()
        {
            var folders = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 2 };
            folders.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            folders.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            folders.RowStyles.Add(new RowStyle(SizeType.Absolute, 18f));
            folders.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

            folders.Controls.Add(SectionLabel("WHERE CHARACTERS ARE FOUND"), 0, 0);
            folders.Controls.Add(SectionLabel("WHAT THE AGENTS WATCH"), 1, 0);
            folders.Controls.Add(FolderEditor(_libraryFolders, AddLibraryFolder, RemoveLibraryFolder), 0, 1);
            folders.Controls.Add(FolderEditor(_watchedFolders, AddWatchedFolder, RemoveWatchedFolder), 1, 1);
            return folders;
        }

        private Control BuildSetupButtons()
        {
            var buttons = Row(
                Button("Reconnect", 84, delegate { Reconnect(); }, "Reconnect to the Agent server"),
                Button("Refresh", 70, delegate { RefreshDiagnostics(); }, null),
                Button("Data folder", 90, delegate { OpenDataFolder(); },
                       "Open the folder holding settings, the phrasebook and the log"),
                Button("Reload lines", 90, delegate { ReloadPhrasebook(); },
                       "Re-read phrasebook.xml after editing it"));

            buttons.Controls.Add(new Label
            {
                Text = "Server:",
                AutoSize = true,
                Margin = new Padding(12, 9, 4, 0)
            });

            var progId = new TextBox
            {
                Width = 150,
                Text = _host.Settings.ProgId ?? string.Empty,
                Margin = new Padding(0, 6, 4, 0)
            };
            _tips.SetToolTip(progId, "Agent server ProgID. Leave blank to try the usual names.");
            buttons.Controls.Add(progId);

            buttons.Controls.Add(Button("Use", 46, delegate
            {
                _host.Settings.ProgId = progId.Text.Trim();
                _host.SaveSettings();
                Reconnect();
            }, null));

            if (!Elevation.IsElevated)
            {
                buttons.Controls.Add(Button("Administrator", 100, delegate { RestartAsAdministrator(); },
                    "Restart with administrator rights, for managing characters in protected folders"));
            }

            return buttons;
        }

        private void BuildTray()
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add("Open manager", null, delegate { RestoreWindow(); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Summon the automatic ones", null, delegate { SummonAutoStart(); });
            menu.Items.Add("Dismiss all", null, delegate { DismissAll(); });
            menu.Items.Add("Hide / show all", null, delegate { TogglePanic(); });
            menu.Items.Add(new ToolStripSeparator());
            if (!Elevation.IsElevated)
                menu.Items.Add("Run as administrator", null, delegate { RestartAsAdministrator(); });
            menu.Items.Add("Exit", null, delegate { ExitApplication(); });

            _tray.Text = "Agent Wrangler";
            _tray.Icon = _appIcon ?? SystemIcons.Application;
            _tray.ContextMenuStrip = menu;
            _tray.Visible = true;
            _tray.DoubleClick += delegate { RestoreWindow(); };
        }

        // ---- small builders --------------------------------------------------------

        private Button Button(string caption, int width, EventHandler onClick, string tip)
        {
            var button = new Button
            {
                Text = caption,
                Width = width,
                Height = 26,
                Margin = new Padding(0, 4, 4, 2)
            };
            RetroTheme.StyleButton(button, false);
            button.Click += onClick;
            if (!string.IsNullOrEmpty(tip)) _tips.SetToolTip(button, tip);
            return button;
        }

        private CheckBox Check(string caption, bool initial, Action<bool> apply)
        {
            return Check(caption, initial, apply, null);
        }

        private CheckBox Check(string caption, bool initial, Action<bool> apply, string tip)
        {
            var box = new CheckBox
            {
                Text = caption,
                AutoSize = true,
                Checked = initial,
                Margin = new Padding(0, 4, 18, 2)
            };
            box.CheckedChanged += delegate
            {
                if (_updatingControls) return;
                apply(box.Checked);
            };
            if (!string.IsNullOrEmpty(tip)) _tips.SetToolTip(box, tip);
            return box;
        }

        private static FlowLayoutPanel Row(params Control[] controls)
        {
            var row = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                WrapContents = true,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Margin = new Padding(0, 2, 0, 2)
            };
            row.Controls.AddRange(controls);
            return row;
        }

        private static Label SectionLabel(string text)
        {
            return new Label
            {
                Text = text,
                Dock = DockStyle.Fill,
                Font = RetroTheme.UiBold,
                ForeColor = RetroTheme.HeaderStart
            };
        }

        private Control FolderEditor(ListBox list, Action add, Action remove)
        {
            var host = new Panel { Dock = DockStyle.Fill, Margin = new Padding(0, 0, 6, 0) };
            list.Dock = DockStyle.Fill;
            list.IntegralHeight = false;

            var buttons = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink
            };
            buttons.Controls.Add(Button("Add...", 66, delegate { add(); }, null));
            buttons.Controls.Add(Button("Remove", 66, delegate { remove(); }, null));

            host.Controls.Add(list);
            host.Controls.Add(buttons);
            return host;
        }
    }
}
