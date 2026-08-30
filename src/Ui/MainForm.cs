using System;
using System.Drawing;
using System.Windows.Forms;
using AgentWrangler.Behavior;
using AgentWrangler.Interop;

namespace AgentWrangler.Ui
{
    /// <summary>
    /// The manager window: the character library on the left, the behaviour editor and the
    /// live roster on the right, and the global controls along the bottom.
    ///
    /// This file builds the window. The handlers live in MainForm.Actions.cs.
    /// </summary>
    public sealed partial class MainForm : Form
    {
        private const int TickIntervalMs = 250;
        private const int RefreshIntervalMs = 1000;
        private const int MaxLogRows = 300;

        private readonly AppHost _host;

        private readonly ListView _agentList = new ListView();
        private readonly TextBox _search = new TextBox();
        private readonly ProfilePanel _profilePanel = new ProfilePanel();
        private readonly ListView _activeList = new ListView();
        private readonly ListView _logList = new ListView();
        private readonly ListBox _libraryFolders = new ListBox();
        private readonly ListBox _watchedFolders = new ListBox();
        private readonly TextBox _diagnostics = new TextBox();

        private Panel _header;
        private string _connectionText = string.Empty;
        private bool _connectionOk;
        private readonly TrackBar _masterPester = new TrackBar();
        private readonly Label _masterLabel = new Label();
        private readonly CheckBox _muzzle = new CheckBox();
        private readonly Button _panicButton = new Button();
        private readonly CheckBox _pauseLog = new CheckBox();
        private readonly Label _rosterCount = new Label();

        private readonly NotifyIcon _tray = new NotifyIcon();
        private readonly Timer _tickTimer = new Timer();
        private readonly Timer _refreshTimer = new Timer();

        private Icon _appIcon;
        private bool _reallyExit;
        private bool _updatingControls;

        public MainForm(AppHost host)
        {
            if (host == null) throw new ArgumentNullException("host");
            _host = host;

            BuildWindow();

            // Order matters. Windows Forms docks children from the highest index down, so
            // the Fill control has to be added first or it would claim the whole client
            // area and the header and status bar would be painted on top of it.
            BuildBody();
            BuildHeader();
            BuildBottomBar();
            BuildTray();

            WireUp();
        }

        // ---- window ----------------------------------------------------------------

        private void BuildWindow()
        {
            Text = "Agent Wrangler";
            ClientSize = new Size(960, 660);
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

        private void BuildHeader()
        {
            _header = new Panel { Dock = DockStyle.Top, Height = 46, BackColor = RetroTheme.HeaderStart };
            _header.Paint += PaintHeaderStrip;
            _header.Click += OnReconnectClicked;
            _header.Cursor = Cursors.Hand;
            Controls.Add(_header);
        }

        /// <summary>
        /// Paints the title strip and the connection status together. Doing it in one
        /// handler avoids a transparent child control sitting over a gradient, which
        /// Windows Forms renders inconsistently.
        /// </summary>
        private void PaintHeaderStrip(object sender, PaintEventArgs e)
        {
            var bounds = new Rectangle(0, 0, _header.Width, _header.Height);
            RetroTheme.PaintHeader(e.Graphics, bounds, string.Empty);

            using (var brush = new SolidBrush(RetroTheme.HeaderText))
            {
                e.Graphics.DrawString("AGENT WRANGLER", RetroTheme.Display, brush, 12, 6);
            }
            using (var brush = new SolidBrush(Color.FromArgb(210, 210, 255)))
            {
                e.Graphics.DrawString("desktop assistant manager for Microsoft Agent / DoubleAgent",
                                      RetroTheme.Ui, brush, 14, 26);
            }

            var status = new Rectangle(bounds.Width - 440, 0, 428, bounds.Height);
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

        private void BuildBottomBar()
        {
            var bar = new Panel { Dock = DockStyle.Bottom, Height = 58, BackColor = RetroTheme.Face };
            bar.Paint += delegate(object sender, PaintEventArgs e)
            {
                using (var pen = new Pen(Color.FromArgb(150, 150, 156)))
                {
                    e.Graphics.DrawLine(pen, 0, 0, bar.Width, 0);
                }
            };

            var caption = new Label
            {
                Text = "Master pestering",
                AutoSize = true,
                Font = RetroTheme.UiBold,
                Location = new Point(12, 8)
            };
            bar.Controls.Add(caption);

            _masterPester.Minimum = PesterCurve.Min;
            _masterPester.Maximum = PesterCurve.Max;
            _masterPester.TickFrequency = 1;
            _masterPester.SmallChange = 1;
            _masterPester.LargeChange = 1;
            _masterPester.Width = 240;
            _masterPester.Location = new Point(120, 4);
            _masterPester.ValueChanged += OnMasterPesterChanged;
            bar.Controls.Add(_masterPester);

            _masterLabel.AutoSize = true;
            _masterLabel.Font = RetroTheme.UiBold;
            _masterLabel.ForeColor = RetroTheme.Accent;
            _masterLabel.Location = new Point(368, 12);
            bar.Controls.Add(_masterLabel);

            _muzzle.Text = "Muzzle everyone";
            _muzzle.AutoSize = true;
            _muzzle.Location = new Point(12, 32);
            _muzzle.CheckedChanged += OnMuzzleChanged;
            bar.Controls.Add(_muzzle);

            _panicButton.Text = "Panic: hide all  (Ctrl+Alt+Shift+H)";
            _panicButton.Width = 230;
            _panicButton.Height = 26;
            _panicButton.Location = new Point(150, 28);
            RetroTheme.StyleButton(_panicButton, true);
            _panicButton.Click += delegate { TogglePanic(); };
            bar.Controls.Add(_panicButton);

            _rosterCount.AutoSize = false;
            _rosterCount.Dock = DockStyle.Right;
            _rosterCount.Width = 220;
            _rosterCount.TextAlign = ContentAlignment.MiddleRight;
            _rosterCount.Padding = new Padding(0, 0, 12, 0);
            _rosterCount.ForeColor = RetroTheme.Quiet;
            bar.Controls.Add(_rosterCount);

            Controls.Add(bar);
        }

        private void BuildBody()
        {
            var split = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Vertical,
                SplitterWidth = 6,
                Panel1MinSize = 260,
                Panel2MinSize = 320,
                BackColor = RetroTheme.Face
            };

            split.Panel1.Controls.Add(BuildLibraryPane());
            split.Panel2.Controls.Add(BuildTabs());
            Controls.Add(split);

            // SplitterDistance is rejected outright while the control is still at its
            // default 150px width, so it is set once after docking and again when the
            // handle appears, and a refusal is not worth reporting.
            TrySetSplitter(split, 380);
            split.HandleCreated += delegate { TrySetSplitter(split, 380); };
        }

        private static void TrySetSplitter(SplitContainer split, int distance)
        {
            try { split.SplitterDistance = distance; }
            catch (InvalidOperationException) { }
            catch (ArgumentOutOfRangeException) { }
        }

        private Control BuildLibraryPane()
        {
            var host = new Panel { Dock = DockStyle.Fill, Padding = new Padding(8) };

            var title = new Label
            {
                Text = "YOUR AGENTS",
                Dock = DockStyle.Top,
                Height = 18,
                Font = RetroTheme.UiBold,
                ForeColor = RetroTheme.HeaderStart
            };

            _search.Dock = DockStyle.Top;
            _search.Text = string.Empty;
            _search.TextChanged += delegate { RefreshAgentList(); };

            var searchHint = new Label
            {
                Text = "Filter by name or file",
                Dock = DockStyle.Top,
                Height = 16,
                ForeColor = RetroTheme.Quiet
            };

            _agentList.Dock = DockStyle.Fill;
            _agentList.View = View.Details;
            _agentList.FullRowSelect = true;
            _agentList.MultiSelect = false;
            _agentList.HideSelection = false;
            _agentList.GridLines = true;
            _agentList.Columns.Add("Agent", 150);
            _agentList.Columns.Add("Character file", 130);
            _agentList.Columns.Add("Level", 44);
            _agentList.Columns.Add("State", 60);
            _agentList.SelectedIndexChanged += OnAgentSelectionChanged;
            _agentList.DoubleClick += delegate { ToggleSelectedAgent(); };

            var buttons = BuildLibraryButtons();

            host.Controls.Add(_agentList);
            host.Controls.Add(searchHint);
            host.Controls.Add(_search);
            host.Controls.Add(title);
            host.Controls.Add(buttons);
            return host;
        }

        private Control BuildLibraryButtons()
        {
            var panel = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = true,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Padding = new Padding(0, 6, 0, 0)
            };

            panel.Controls.Add(MakeButton("Summon", 78, delegate { SummonSelected(); }));
            panel.Controls.Add(MakeButton("Dismiss", 78, delegate { DismissSelected(); }));
            panel.Controls.Add(MakeButton("Probe", 62, delegate { ProbeSelected(); }));
            panel.Controls.Add(MakeButton("Duplicate", 78, delegate { DuplicateSelected(); }));
            panel.Controls.Add(MakeButton("Remove", 70, delegate { RemoveSelected(); }));
            panel.Controls.Add(MakeButton("Rescan", 66, delegate { RescanLibrary(); }));
            panel.Controls.Add(MakeButton("Import file...", 96, delegate { ImportCharacter(); }));
            panel.Controls.Add(MakeButton("Rename file...", 96, delegate { RenameCharacterFile(); }));
            panel.Controls.Add(MakeButton("Delete file...", 92, delegate { DeleteCharacterFile(); }));
            panel.Controls.Add(MakeButton("Show in folder", 100, delegate { ShowInFolder(); }));

            return panel;
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

            tabs.TabPages.Add(BuildActiveTab());
            tabs.TabPages.Add(BuildLogTab());
            tabs.TabPages.Add(BuildWatchingTab());
            tabs.TabPages.Add(BuildDiagnosticsTab());

            return tabs;
        }

        private TabPage BuildActiveTab()
        {
            var page = new TabPage("On screen now") { BackColor = RetroTheme.Face, Padding = new Padding(8) };

            _activeList.Dock = DockStyle.Fill;
            _activeList.View = View.Details;
            _activeList.FullRowSelect = true;
            _activeList.MultiSelect = false;
            _activeList.HideSelection = false;
            _activeList.GridLines = true;
            _activeList.Columns.Add("Agent", 120);
            _activeList.Columns.Add("Personality", 80);
            _activeList.Columns.Add("Level", 44);
            _activeList.Columns.Add("Lines", 46);
            _activeList.Columns.Add("Last thing it said", 300);

            var buttons = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Padding = new Padding(0, 6, 0, 0)
            };
            buttons.Controls.Add(MakeButton("Dismiss", 78, delegate { DismissActiveSelection(); }));
            buttons.Controls.Add(MakeButton("Dismiss all", 88, delegate { DismissAll(); }));
            buttons.Controls.Add(MakeButton("Move it now", 92, delegate { MoveActiveSelection(); }));
            buttons.Controls.Add(MakeButton("Make it talk", 92, delegate { ProvokeActiveSelection(); }));

            page.Controls.Add(_activeList);
            page.Controls.Add(buttons);
            return page;
        }

        private TabPage BuildLogTab()
        {
            var page = new TabPage("Activity log") { BackColor = RetroTheme.Face, Padding = new Padding(8) };

            _logList.Dock = DockStyle.Fill;
            _logList.View = View.Details;
            _logList.FullRowSelect = true;
            _logList.GridLines = true;
            _logList.Columns.Add("Time", 64);
            _logList.Columns.Add("Who", 110);
            _logList.Columns.Add("What", 460);

            var buttons = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Padding = new Padding(0, 6, 0, 0)
            };
            _pauseLog.Text = "Pause";
            _pauseLog.AutoSize = true;
            _pauseLog.Margin = new Padding(8, 6, 0, 0);
            buttons.Controls.Add(MakeButton("Clear", 62, delegate { _logList.Items.Clear(); }));
            buttons.Controls.Add(_pauseLog);

            page.Controls.Add(_logList);
            page.Controls.Add(buttons);
            return page;
        }

        private TabPage BuildWatchingTab()
        {
            var page = new TabPage("Folders") { BackColor = RetroTheme.Face, Padding = new Padding(8) };

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 4
            };
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 22f));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 50f));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 22f));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 50f));

            layout.Controls.Add(SectionLabel("WHERE CHARACTER FILES ARE FOUND"), 0, 0);
            layout.Controls.Add(FolderEditor(_libraryFolders, AddLibraryFolder, RemoveLibraryFolder), 0, 1);
            layout.Controls.Add(SectionLabel("WHICH FOLDERS THE AGENTS WATCH"), 0, 2);
            layout.Controls.Add(FolderEditor(_watchedFolders, AddWatchedFolder, RemoveWatchedFolder), 0, 3);

            page.Controls.Add(layout);
            return page;
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
            var host = new Panel { Dock = DockStyle.Fill };
            list.Dock = DockStyle.Fill;
            list.IntegralHeight = false;

            var buttons = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink
            };
            buttons.Controls.Add(MakeButton("Add folder...", 92, delegate { add(); }));
            buttons.Controls.Add(MakeButton("Remove", 70, delegate { remove(); }));

            host.Controls.Add(list);
            host.Controls.Add(buttons);
            return host;
        }

        private TabPage BuildDiagnosticsTab()
        {
            var page = new TabPage("Diagnostics") { BackColor = RetroTheme.Face, Padding = new Padding(8) };

            _diagnostics.Multiline = true;
            _diagnostics.ReadOnly = true;
            _diagnostics.ScrollBars = ScrollBars.Vertical;
            _diagnostics.Dock = DockStyle.Fill;
            _diagnostics.BackColor = RetroTheme.Paper;
            _diagnostics.Font = new Font(FontFamily.GenericMonospace, 8.25f);

            var buttons = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Padding = new Padding(0, 6, 0, 0)
            };
            buttons.Controls.Add(MakeButton("Reconnect", 84, delegate { Reconnect(); }));
            buttons.Controls.Add(MakeButton("Refresh", 74, delegate { RefreshDiagnostics(); }));
            buttons.Controls.Add(MakeButton("Open data folder", 116, delegate { OpenDataFolder(); }));
            buttons.Controls.Add(MakeButton("Reload phrasebook", 124, delegate { ReloadPhrasebook(); }));

            // Only offered when it would do something. Everyday use needs no elevation; this
            // is for someone who wants to tidy up several protected character files without
            // answering a consent prompt for each one.
            if (Elevation.IsElevated)
            {
                buttons.Controls.Add(new Label
                {
                    Text = "Running as administrator",
                    AutoSize = true,
                    Font = RetroTheme.UiBold,
                    ForeColor = RetroTheme.Accent,
                    Margin = new Padding(12, 7, 0, 0)
                });
            }
            else
            {
                buttons.Controls.Add(MakeButton("Run as administrator", 136,
                                                delegate { RestartAsAdministrator(); }));
            }

            var loginBox = new CheckBox
            {
                Text = "Start when I log in",
                AutoSize = true,
                Margin = new Padding(12, 6, 0, 0),
                Checked = _host.Settings.LaunchOnLogin
            };
            loginBox.CheckedChanged += delegate
            {
                if (_updatingControls) return;
                _host.SetLaunchOnLogin(loginBox.Checked);
            };
            buttons.Controls.Add(loginBox);

            var trayBox = new CheckBox
            {
                Text = "Start hidden in the tray",
                AutoSize = true,
                Margin = new Padding(12, 6, 0, 0),
                Checked = _host.Settings.StartMinimized
            };
            trayBox.CheckedChanged += delegate
            {
                if (_updatingControls) return;
                _host.Settings.StartMinimized = trayBox.Checked;
                _host.SaveSettings();
            };
            buttons.Controls.Add(trayBox);

            page.Controls.Add(_diagnostics);
            page.Controls.Add(BuildServerRow());
            page.Controls.Add(buttons);
            return page;
        }

        /// <summary>
        /// Lets the user name the Agent server's ProgID by hand. Left blank, the program
        /// tries the ProgIDs that Microsoft Agent and DoubleAgent are known to register;
        /// this is the escape hatch for an installation that uses something else.
        /// </summary>
        private Control BuildServerRow()
        {
            var row = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Padding = new Padding(0, 6, 0, 0)
            };

            row.Controls.Add(new Label
            {
                Text = "Agent server ProgID:",
                AutoSize = true,
                Margin = new Padding(0, 7, 4, 0)
            });

            var progId = new TextBox
            {
                Width = 180,
                Text = _host.Settings.ProgId ?? string.Empty,
                Margin = new Padding(0, 4, 4, 0)
            };
            row.Controls.Add(progId);

            row.Controls.Add(MakeButton("Use this", 72, delegate
            {
                _host.Settings.ProgId = progId.Text.Trim();
                _host.SaveSettings();
                Reconnect();
            }));

            row.Controls.Add(new Label
            {
                Text = "leave blank to try the usual names",
                AutoSize = true,
                ForeColor = RetroTheme.Quiet,
                Margin = new Padding(6, 7, 0, 0)
            });

            return row;
        }

        private void BuildTray()
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add("Open manager", null, delegate { RestoreWindow(); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Summon everyone set to auto", null, delegate { SummonAutoStart(); });
            menu.Items.Add("Dismiss all", null, delegate { DismissAll(); });
            menu.Items.Add("Panic: hide / show", null, delegate { TogglePanic(); });
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

        private static Button MakeButton(string caption, int width, EventHandler onClick)
        {
            var button = new Button { Text = caption, Width = width, Height = 26, Margin = new Padding(0, 0, 4, 4) };
            RetroTheme.StyleButton(button, false);
            button.Click += onClick;
            return button;
        }
    }
}
