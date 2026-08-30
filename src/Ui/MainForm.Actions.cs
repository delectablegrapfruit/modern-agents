using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Windows.Forms;
using AgentWrangler.Agents;
using AgentWrangler.Behavior;
using AgentWrangler.Config;
using AgentWrangler.Interop;
using AgentWrangler.Library;

namespace AgentWrangler.Ui
{
    /// <summary>Everything the manager window actually does. The layout is in MainForm.cs.</summary>
    public sealed partial class MainForm
    {
        private const int HotkeyPanic = 1;
        private const int HotkeyShow = 2;

        private bool _startupHandled;

        // ---- start-up --------------------------------------------------------------

        private void WireUp()
        {
            _tips.SetToolTip(_panicButton, "Hide every agent at once (Ctrl+Alt+Shift+H)");
            _tips.SetToolTip(_muzzle, "Agents stay on screen but stop talking and moving");
            _tips.SetToolTip(_masterPester, "Scales every agent's own level. 5 leaves them alone, 0 silences all.");

            _tickTimer.Interval = TickIntervalMs;
            _tickTimer.Tick += OnEngineTick;

            _refreshTimer.Interval = RefreshIntervalMs;
            _refreshTimer.Tick += delegate
            {
                RefreshActiveList();
                RefreshStatusBar();
            };

            _host.Engine.AgentSpoke += OnAgentSpoke;
            _host.Engine.AgentSettingsChanged += delegate
            {
                RefreshAgentList();
                RefreshFolderLists();
                _host.SaveSettings();
            };
            _host.Engine.ActivityObserved += OnActivityObserved;
            _host.Roster.RosterChanged += delegate { RefreshAgentList(); RefreshActiveList(); };
        }

        protected override void OnLoad(EventArgs e)
        {
            base.OnLoad(e);

            _updatingControls = true;
            try
            {
                _masterPester.Value = PesterCurve.Clamp(_host.Settings.MasterPester);
                _muzzle.Checked = _host.Settings.Muzzled;
                UpdateMasterLabel();
            }
            finally
            {
                _updatingControls = false;
            }

            RefreshFolderLists();
            RefreshAgentList();
            RefreshStatusBar();
            RefreshDiagnostics();

            _tickTimer.Start();
            _refreshTimer.Start();

            if (!_host.IsConnected)
            {
                AppendLog("Agent Wrangler", "No Agent server yet -- see the Diagnostics tab.");
            }
            else
            {
                SummonAutoStart();
            }
        }

        /// <summary>Starts hidden in the tray when the user has asked for that.</summary>
        protected override void SetVisibleCore(bool value)
        {
            if (!_startupHandled && _host.Settings.StartMinimized)
            {
                _startupHandled = true;
                if (!IsHandleCreated) CreateHandle();
                value = false;
            }
            _startupHandled = true;
            base.SetVisibleCore(value);
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            RegisterHotkeys();
        }

        private void RegisterHotkeys()
        {
            uint modifiers = NativeMethods.MOD_CONTROL | NativeMethods.MOD_ALT | NativeMethods.MOD_SHIFT;

            if (!NativeMethods.RegisterHotKey(Handle, HotkeyPanic, modifiers, (uint)Keys.H))
                Diagnostics.Warn("Panic hotkey Ctrl+Alt+Shift+H is already taken by something else.");

            if (!NativeMethods.RegisterHotKey(Handle, HotkeyShow, modifiers, (uint)Keys.A))
                Diagnostics.Warn("Manager hotkey Ctrl+Alt+Shift+A is already taken by something else.");
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == NativeMethods.WM_HOTKEY)
            {
                switch (m.WParam.ToInt32())
                {
                    case HotkeyPanic:
                        TogglePanic();
                        return;
                    case HotkeyShow:
                        RestoreWindow();
                        return;
                }
            }
            base.WndProc(ref m);
        }

        private void OnEngineTick(object sender, EventArgs e)
        {
            try
            {
                _host.Engine.Tick();
            }
            catch (Exception ex)
            {
                // A throw here would kill the timer and silently stop every agent, so the
                // loop swallows and reports instead.
                Diagnostics.Error("Pester engine tick failed.", ex);
            }
        }

        // ---- selection helpers -----------------------------------------------------

        private AgentProfile SelectedProfile
        {
            get
            {
                if (_agentList.SelectedItems.Count == 0) return null;
                return _agentList.SelectedItems[0].Tag as AgentProfile;
            }
        }

        private LiveAgent SelectedActiveAgent
        {
            get
            {
                if (_activeList.SelectedItems.Count == 0) return null;
                return _activeList.SelectedItems[0].Tag as LiveAgent;
            }
        }

        private LiveAgent LookUpLiveAgent(AgentProfile profile)
        {
            return profile == null ? null : _host.Roster.Find(profile.Id);
        }

        // ---- list refreshing -------------------------------------------------------

        private void RefreshAgentList()
        {
            string keepId = SelectedProfile != null ? SelectedProfile.Id : null;
            string filter = _search.Text.Trim();

            _agentList.BeginUpdate();
            try
            {
                _agentList.Items.Clear();

                foreach (AgentProfile profile in _host.Settings.Profiles)
                {
                    if (!MatchesFilter(profile, filter)) continue;

                    string fileName = string.IsNullOrEmpty(profile.CharacterPath)
                        ? "(none)"
                        : Path.GetFileName(profile.CharacterPath);

                    var item = new ListViewItem(profile.DisplayName);
                    item.SubItems.Add(fileName);
                    item.SubItems.Add(PesterCurve.Combine(profile.Pester, _host.Settings.MasterPester).ToString());
                    item.SubItems.Add(DescribeState(profile));
                    item.Tag = profile;

                    if (!string.IsNullOrEmpty(profile.CharacterPath) && !File.Exists(profile.CharacterPath))
                        item.ForeColor = RetroTheme.Alarm;
                    else if (_host.Roster.IsActive(profile.Id))
                        item.ForeColor = RetroTheme.HeaderStart;

                    _agentList.Items.Add(item);
                    if (profile.Id == keepId) item.Selected = true;
                }
            }
            finally
            {
                _agentList.EndUpdate();
            }
        }

        private string DescribeState(AgentProfile profile)
        {
            if (!string.IsNullOrEmpty(profile.CharacterPath) && !File.Exists(profile.CharacterPath))
                return "Missing";
            if (_host.Roster.IsActive(profile.Id)) return "On screen";
            return profile.AutoSummon ? "Auto" : "Idle";
        }

        private static bool MatchesFilter(AgentProfile profile, string filter)
        {
            if (string.IsNullOrEmpty(filter)) return true;

            if (profile.DisplayName != null &&
                profile.DisplayName.IndexOf(filter, StringComparison.CurrentCultureIgnoreCase) >= 0)
                return true;

            return profile.CharacterPath != null &&
                   profile.CharacterPath.IndexOf(filter, StringComparison.CurrentCultureIgnoreCase) >= 0;
        }

        private void RefreshActiveList()
        {
            string keepId = SelectedActiveAgent != null ? SelectedActiveAgent.Profile.Id : null;

            _activeList.BeginUpdate();
            try
            {
                _activeList.Items.Clear();
                foreach (LiveAgent agent in _host.Roster.Agents)
                {
                    var item = new ListViewItem(agent.Name);
                    item.SubItems.Add(agent.EffectivePester.ToString());
                    item.SubItems.Add(agent.LinesSpoken.ToString());
                    item.SubItems.Add(agent.LastLine ?? string.Empty);
                    item.Tag = agent;
                    _activeList.Items.Add(item);
                    if (agent.Profile.Id == keepId) item.Selected = true;
                }
            }
            finally
            {
                _activeList.EndUpdate();
            }
        }

        private void RefreshStatusBar()
        {
            _connectionText = _host.ConnectionSummary();
            _connectionOk = _host.IsConnected;
            if (_header != null) _header.Invalidate();

            _rosterCount.Text = _host.Roster.Count + " on screen" +
                                (_host.Engine.PanicHidden ? ", hidden" : string.Empty);

            _panicButton.Text = _host.Engine.PanicHidden ? "Bring back" : "Hide all";
        }

        private void RefreshFolderLists()
        {
            _libraryFolders.Items.Clear();
            foreach (string folder in _host.Settings.LibraryFolders) _libraryFolders.Items.Add(folder);

            _watchedFolders.Items.Clear();
            foreach (string folder in _host.Settings.WatchedFolders) _watchedFolders.Items.Add(folder);
        }

        // ---- log -------------------------------------------------------------------

        private void OnAgentSpoke(object sender, AgentSpokeEventArgs e)
        {
            AppendLog(e.Agent.Name, e.Line);
        }

        private void OnActivityObserved(object sender, ActivityObservedEventArgs e)
        {
            AppendLog("(noticed)", e.Activity.ToString());
        }

        private void AppendLog(string who, string what)
        {
            if (_pauseLog.Checked || IsDisposed) return;

            var item = new ListViewItem(DateTime.Now.ToString("HH:mm:ss"));
            item.SubItems.Add(who);
            item.SubItems.Add(what);
            if (who == "(noticed)") item.ForeColor = RetroTheme.Quiet;

            _logList.BeginUpdate();
            try
            {
                _logList.Items.Add(item);
                while (_logList.Items.Count > MaxLogRows) _logList.Items.RemoveAt(0);
            }
            finally
            {
                _logList.EndUpdate();
            }

            item.EnsureVisible();
        }

        // ---- global controls -------------------------------------------------------

        private void OnMasterPesterChanged(object sender, EventArgs e)
        {
            UpdateMasterLabel();
            if (_updatingControls) return;

            _host.Settings.MasterPester = _masterPester.Value;
            RefreshAgentList();
            _host.SaveSettings();
        }

        private void UpdateMasterLabel()
        {
            _masterLabel.Text = _masterPester.Value + " -- " + PesterCurve.LevelName(_masterPester.Value);
        }

        private void OnMuzzleChanged(object sender, EventArgs e)
        {
            if (_updatingControls) return;
            _host.Settings.Muzzled = _muzzle.Checked;
            _host.SaveSettings();
            AppendLog("Agent Wrangler", _muzzle.Checked ? "Everyone muzzled." : "Muzzle lifted.");
        }

        private void TogglePanic()
        {
            _host.Engine.TogglePanic();
            RefreshStatusBar();
            AppendLog("Agent Wrangler", _host.Engine.PanicHidden ? "Panic: all agents hidden." : "Agents restored.");
        }

        private void OnProfileEdited(object sender, EventArgs e)
        {
            RefreshAgentList();
            _host.SaveSettings();
        }

        private void OnAgentSelectionChanged(object sender, EventArgs e)
        {
            AgentProfile profile = SelectedProfile;
            _profilePanel.Bind(profile, profile == null ? null : _host.Library.Find(profile.CharacterPath));
        }

        // ---- summoning -------------------------------------------------------------

        private void ToggleSelectedAgent()
        {
            AgentProfile profile = SelectedProfile;
            if (profile == null) return;

            if (_host.Roster.IsActive(profile.Id)) DismissSelected();
            else SummonSelected();
        }

        private void SummonSelected()
        {
            AgentProfile profile = SelectedProfile;
            if (profile == null) return;

            if (!RequireConnection()) return;

            try
            {
                _host.Engine.SetPanicHidden(false);
                _host.Summon(profile);
                RefreshAgentList();
                RefreshActiveList();
                RefreshStatusBar();
            }
            catch (Exception ex)
            {
                Complain("Could not summon " + profile.DisplayName, ex);
            }
        }

        private void DismissSelected()
        {
            AgentProfile profile = SelectedProfile;
            if (profile == null) return;
            _host.Engine.Dismiss(profile.Id, true);
            RefreshAgentList();
        }

        private void DismissActiveSelection()
        {
            LiveAgent agent = SelectedActiveAgent;
            if (agent == null) return;
            _host.Engine.Dismiss(agent.Profile.Id, true);
            RefreshActiveList();
        }

        private void DismissAll()
        {
            _host.Engine.DismissAll(true);
            RefreshAgentList();
            RefreshActiveList();
            RefreshStatusBar();
        }

        private void SummonAutoStart()
        {
            if (!RequireConnection()) return;
            _host.SummonAutoStart();
            RefreshAgentList();
            RefreshActiveList();
            RefreshStatusBar();
        }

        private void MoveActiveSelection()
        {
            LiveAgent agent = SelectedActiveAgent;
            if (agent != null) _host.Engine.MoveAgent(agent, false);
        }

        private void ProvokeActiveSelection()
        {
            LiveAgent agent = SelectedActiveAgent;
            if (agent != null) _host.Engine.Provoke(agent);
        }

        // ---- library management ----------------------------------------------------

        private void RescanLibrary()
        {
            Cursor = Cursors.WaitCursor;
            try
            {
                _host.RescanLibrary();
                RefreshAgentList();
                AppendLog("Agent Wrangler", "Library rescanned: " + _host.Library.Count + " character file(s).");
                _host.SaveSettings();
            }
            finally
            {
                Cursor = Cursors.Default;
            }
        }

        private void ProbeSelected()
        {
            AgentProfile profile = SelectedProfile;
            if (profile == null) return;
            if (!RequireConnection()) return;

            CharacterFileInfo info = _host.Library.Find(profile.CharacterPath);
            if (info == null) info = _host.Library.Track(profile.CharacterPath);

            Cursor = Cursors.WaitCursor;
            try
            {
                _host.Probe(info);
                _profilePanel.Bind(profile, info);
                RefreshAgentList();
                _host.SaveSettings();
                AppendLog("Agent Wrangler",
                    "Inspected " + info.FileName + ": \"" + info.Name + "\", " +
                    info.Animations.Count + " animations.");
            }
            catch (Exception ex)
            {
                Complain("Could not load " + info.FileName, ex);
            }
            finally
            {
                Cursor = Cursors.Default;
            }
        }

        private void DuplicateSelected()
        {
            AgentProfile profile = SelectedProfile;
            if (profile == null) return;

            AgentProfile copy = _host.Duplicate(profile);
            RefreshAgentList();
            SelectProfile(copy);
            _host.SaveSettings();
        }

        private void RemoveSelected()
        {
            AgentProfile profile = SelectedProfile;
            if (profile == null) return;

            DialogResult answer = MessageBox.Show(this,
                "Remove \"" + profile.DisplayName + "\" from the list?" + Environment.NewLine + Environment.NewLine +
                "The character file itself is not deleted.",
                "Remove agent", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (answer != DialogResult.Yes) return;

            _host.RemoveProfile(profile);
            RefreshAgentList();
            _host.SaveSettings();
        }

        private void ImportCharacter()
        {
            using (var dialog = new OpenFileDialog())
            {
                dialog.Title = "Import a character file";
                dialog.Filter = "Agent characters (*.acs;*.acf)|*.acs;*.acf|All files (*.*)|*.*";
                dialog.Multiselect = true;
                if (dialog.ShowDialog(this) != DialogResult.OK) return;

                foreach (string source in dialog.FileNames)
                {
                    try
                    {
                        string imported = _host.Library.Import(source);
                        EnsureLibraryFolder(Path.GetDirectoryName(imported));
                        AppendLog("Agent Wrangler", "Imported " + Path.GetFileName(imported) + ".");
                    }
                    catch (Exception ex)
                    {
                        Complain("Could not import " + Path.GetFileName(source), ex);
                    }
                }
            }

            RescanLibrary();
        }

        private void EnsureLibraryFolder(string folder)
        {
            if (string.IsNullOrEmpty(folder)) return;
            foreach (string existing in _host.Settings.LibraryFolders)
                if (string.Equals(existing, folder, StringComparison.OrdinalIgnoreCase)) return;

            _host.Settings.LibraryFolders.Add(folder);
            RefreshFolderLists();
        }

        private void RenameCharacterFile()
        {
            AgentProfile profile = SelectedProfile;
            if (profile == null || string.IsNullOrEmpty(profile.CharacterPath)) return;

            if (IsFileInUse(profile.CharacterPath))
            {
                MessageBox.Show(this,
                    "That character is on screen right now, so its file is locked by the Agent server." +
                    Environment.NewLine + "Dismiss it first.",
                    "Rename character file", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            string current = Path.GetFileNameWithoutExtension(profile.CharacterPath);
            string newName = PromptDialog.Ask(this, "Rename character file",
                "New file name (the extension is kept):" + ElevationWarning(profile.CharacterPath),
                current);
            if (newName == null || newName == current) return;

            try
            {
                string oldPath = profile.CharacterPath;
                Cursor = Cursors.WaitCursor;
                string newPath = _host.RenameCharacterFile(oldPath, newName);
                _host.RepointProfiles(oldPath, newPath);
                RefreshAgentList();
                _host.SaveSettings();
                AppendLog("Agent Wrangler", "Renamed to " + Path.GetFileName(newPath) + ".");
            }
            catch (Exception ex)
            {
                Complain("Could not rename the file", ex);
            }
            finally
            {
                Cursor = Cursors.Default;
            }
        }

        private void DeleteCharacterFile()
        {
            AgentProfile profile = SelectedProfile;
            if (profile == null || string.IsNullOrEmpty(profile.CharacterPath)) return;

            string path = profile.CharacterPath;

            DialogResult answer = MessageBox.Show(this,
                "Permanently delete this character file?" + Environment.NewLine + Environment.NewLine +
                path + Environment.NewLine + Environment.NewLine +
                "Every agent built on it will be removed from the list too." +
                ElevationWarning(path),
                "Delete character file", MessageBoxButtons.YesNo, MessageBoxIcon.Warning,
                MessageBoxDefaultButton.Button2);
            if (answer != DialogResult.Yes) return;

            // The Agent server holds the file open while a character from it is loaded.
            foreach (AgentProfile other in new List<AgentProfile>(_host.Settings.Profiles))
            {
                if (string.Equals(other.CharacterPath, path, StringComparison.OrdinalIgnoreCase) &&
                    _host.Roster.IsActive(other.Id))
                {
                    _host.Engine.Dismiss(other.Id, false);
                }
            }

            try
            {
                Cursor = Cursors.WaitCursor;
                _host.DeleteCharacterFile(path);
            }
            catch (Exception ex)
            {
                Complain("Could not delete the file", ex);
                return;
            }
            finally
            {
                Cursor = Cursors.Default;
            }

            foreach (AgentProfile other in new List<AgentProfile>(_host.Settings.Profiles))
            {
                if (string.Equals(other.CharacterPath, path, StringComparison.OrdinalIgnoreCase))
                    _host.RemoveProfile(other);
            }

            RefreshAgentList();
            _host.SaveSettings();
            AppendLog("Agent Wrangler", "Deleted " + Path.GetFileName(path) + ".");
        }

        private void ShowInFolder()
        {
            AgentProfile profile = SelectedProfile;
            if (profile == null || string.IsNullOrEmpty(profile.CharacterPath)) return;

            try
            {
                if (File.Exists(profile.CharacterPath))
                {
                    Process.Start(new ProcessStartInfo("explorer.exe",
                        "/select,\"" + profile.CharacterPath + "\"") { UseShellExecute = true });
                }
                else
                {
                    string folder = Path.GetDirectoryName(profile.CharacterPath);
                    if (!string.IsNullOrEmpty(folder) && Directory.Exists(folder))
                        Process.Start(new ProcessStartInfo("explorer.exe", "\"" + folder + "\"") { UseShellExecute = true });
                }
            }
            catch (Exception ex)
            {
                Complain("Could not open Explorer", ex);
            }
        }

        /// <summary>
        /// A line warning that Windows will ask for administrator access, but only when the
        /// file really does sit somewhere this process cannot write.
        /// </summary>
        private static string ElevationWarning(string path)
        {
            if (Elevation.IsElevated) return string.Empty;

            string folder;
            try { folder = Path.GetDirectoryName(path); }
            catch (ArgumentException) { return string.Empty; }

            if (string.IsNullOrEmpty(folder) || Elevation.CanWriteTo(folder)) return string.Empty;

            return Environment.NewLine + Environment.NewLine +
                   "This file is in a protected folder, so Windows will ask for administrator " +
                   "access first.";
        }

        private void RestartAsAdministrator()
        {
            if (Elevation.IsElevated)
            {
                MessageBox.Show(this, "Agent Wrangler is already running as administrator.",
                                "Run as administrator", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            string message = "Agent Wrangler will close and start again with administrator rights.";
            if (_host.Roster.Count > 0)
                message += Environment.NewLine + Environment.NewLine +
                           "The " + _host.Roster.Count + " agent(s) on screen will be taken down and " +
                           "re-summoned by the new copy if they are set to start automatically.";
            message += Environment.NewLine + Environment.NewLine + "Carry on?";

            if (MessageBox.Show(this, message, "Run as administrator",
                                MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
                return;

            string error;
            if (!Elevation.RestartElevated(out error))
            {
                MessageBox.Show(this, error, "Run as administrator",
                                MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            // The new copy waits for this one to release the single-instance lock.
            _reallyExit = true;
            Close();
        }

        private bool IsFileInUse(string path)
        {
            foreach (LiveAgent agent in _host.Roster.Agents)
                if (string.Equals(agent.Profile.CharacterPath, path, StringComparison.OrdinalIgnoreCase))
                    return true;
            return false;
        }

        private void SelectProfile(AgentProfile profile)
        {
            if (profile == null) return;
            foreach (ListViewItem item in _agentList.Items)
            {
                if (ReferenceEquals(item.Tag, profile))
                {
                    item.Selected = true;
                    item.EnsureVisible();
                    return;
                }
            }
        }

        // ---- folders ---------------------------------------------------------------

        private void AddLibraryFolder()
        {
            string folder = BrowseForFolder("Choose a folder that holds .acs character files");
            if (folder == null) return;

            EnsureLibraryFolder(folder);
            RescanLibrary();
        }

        private void RemoveLibraryFolder()
        {
            var folder = _libraryFolders.SelectedItem as string;
            if (folder == null) return;

            _host.Settings.LibraryFolders.Remove(folder);
            RefreshFolderLists();
            RescanLibrary();
        }

        private void AddWatchedFolder()
        {
            string folder = BrowseForFolder("Choose a folder for the agents to watch");
            if (folder == null) return;

            foreach (string existing in _host.Settings.WatchedFolders)
                if (string.Equals(existing, folder, StringComparison.OrdinalIgnoreCase)) return;

            _host.Settings.WatchedFolders.Add(folder);
            _host.ApplyWatchedFolders();
            RefreshFolderLists();
            _host.SaveSettings();
        }

        private void RemoveWatchedFolder()
        {
            var folder = _watchedFolders.SelectedItem as string;
            if (folder == null) return;

            _host.Settings.WatchedFolders.Remove(folder);
            _host.ApplyWatchedFolders();
            RefreshFolderLists();
            _host.SaveSettings();
        }

        private string BrowseForFolder(string description)
        {
            using (var dialog = new FolderBrowserDialog())
            {
                dialog.Description = description;
                dialog.ShowNewFolderButton = false;
                return dialog.ShowDialog(this) == DialogResult.OK ? dialog.SelectedPath : null;
            }
        }

        // ---- diagnostics -----------------------------------------------------------

        private void OnReconnectClicked(object sender, EventArgs e)
        {
            if (!_host.IsConnected) Reconnect();
        }

        private void Reconnect()
        {
            // Reconnecting replaces the COM connection the characters live in, so they all
            // have to come off screen. Worth saying so before doing it.
            if (_host.Roster.Count > 0)
            {
                DialogResult confirm = MessageBox.Show(this,
                    "Reconnecting will take all " + _host.Roster.Count + " agent(s) off screen." +
                    Environment.NewLine + Environment.NewLine + "Carry on?",
                    "Reconnect", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (confirm != DialogResult.Yes) return;
            }

            Cursor = Cursors.WaitCursor;
            try
            {
                if (_host.Reconnect())
                {
                    AppendLog("Agent Wrangler", _host.ConnectionSummary());
                }
                else
                {
                    MessageBox.Show(this, _host.ConnectionError, "No Agent server",
                                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
            finally
            {
                Cursor = Cursors.Default;
                RefreshAgentList();
                RefreshActiveList();
                RefreshStatusBar();
                RefreshDiagnostics();
            }
        }

        private void RefreshDiagnostics()
        {
            var report = new StringBuilder();

            report.AppendLine("AGENT SERVER");
            report.AppendLine("  Status      : " + (_host.IsConnected ? "connected" : "not connected"));
            report.AppendLine("  ProgID      : " + Or(_host.Server.ActiveProgId, "(none)"));
            report.AppendLine("  CLSID       : " + Or(_host.Server.ActiveClsid, "(none)"));
            report.AppendLine("  Server      : " + Or(_host.Server.ServerModulePath, "(unknown)"));
            report.AppendLine("  Preferred   : " + Or(_host.Settings.ProgId, "(auto-detect)"));
            if (!_host.IsConnected && _host.ConnectionError != null)
            {
                report.AppendLine();
                report.AppendLine(_host.ConnectionError);
            }

            report.AppendLine();
            report.AppendLine("ADMINISTRATOR RIGHTS");
            report.AppendLine("  This process : " + (Elevation.IsElevated ? "elevated" : "normal user"));
            report.AppendLine("  Needed for   : renaming or deleting character files in protected folders.");
            report.AppendLine("                 Windows is asked for them at the moment they are needed.");
            foreach (string folder in _host.Settings.LibraryFolders)
            {
                if (!Directory.Exists(folder)) continue;
                report.AppendLine("   " + (Elevation.CanWriteTo(folder) ? "[writable] " : "[protected] ") + folder);
            }

            report.AppendLine();
            report.AppendLine("LIBRARY");
            report.AppendLine("  Character files : " + _host.Library.Count);
            report.AppendLine("  Agent entries   : " + _host.Settings.Profiles.Count);
            report.AppendLine("  On screen now   : " + _host.Roster.Count);
            foreach (CharacterFileInfo info in _host.Library.Snapshot())
            {
                report.AppendLine("   - " + info.FileName.PadRight(28) +
                                  info.SizeText.PadLeft(9) + "  " + info.StatusText +
                                  (info.Animations.Count > 0 ? "  (" + info.Animations.Count + " animations)" : ""));
            }

            report.AppendLine();
            report.AppendLine("FILES");
            report.AppendLine("  Settings   : " + SettingsStore.SettingsPath);
            report.AppendLine("  Phrasebook : " + SettingsStore.PhrasebookPath);
            report.AppendLine("  Log        : " + Or(Diagnostics.LogPath, "(disabled)"));
            report.AppendLine("  Imports    : " + CharacterLibrary.UserCharacterFolder);

            report.AppendLine();
            report.AppendLine("RECENT MESSAGES");
            foreach (string line in Diagnostics.Snapshot()) report.AppendLine("  " + line);

            _diagnostics.Text = report.ToString();
            _diagnostics.SelectionStart = 0;
            _diagnostics.ScrollToCaret();
        }

        private static string Or(string value, string fallback)
        {
            return string.IsNullOrEmpty(value) ? fallback : value;
        }

        private void OpenDataFolder()
        {
            try
            {
                Directory.CreateDirectory(SettingsStore.DataFolder);
                Process.Start(new ProcessStartInfo("explorer.exe",
                    "\"" + SettingsStore.DataFolder + "\"") { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                Complain("Could not open the data folder", ex);
            }
        }

        private void ReloadPhrasebook()
        {
            _host.Engine.Phrasebook = Phrasebook.LoadOrCreate(SettingsStore.PhrasebookPath);
            AppendLog("Agent Wrangler", "Phrasebook reloaded.");
            RefreshDiagnostics();
        }

        // ---- window lifecycle ------------------------------------------------------

        private bool RequireConnection()
        {
            if (_host.IsConnected) return true;

            DialogResult answer = MessageBox.Show(this,
                "There is no Agent server to talk to yet." + Environment.NewLine + Environment.NewLine +
                "Check that DoubleAgent is installed and running, then try again." +
                Environment.NewLine + Environment.NewLine + "Try connecting now?",
                "No Agent server", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);

            if (answer == DialogResult.Yes) Reconnect();
            return _host.IsConnected;
        }

        private void Complain(string what, Exception ex)
        {
            Diagnostics.Error(what, ex);
            MessageBox.Show(this, what + ":" + Environment.NewLine + Environment.NewLine + ex.Message,
                            "Agent Wrangler", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        private void RestoreWindow()
        {
            Show();
            if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
            Activate();
            BringToFront();
        }

        private void ExitApplication()
        {
            _reallyExit = true;
            Close();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // Closing the window is not the same as quitting: the agents are the program,
            // and they carry on from the tray.
            if (!_reallyExit && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
                try
                {
                    _tray.ShowBalloonTip(3000, "Agent Wrangler",
                        "Still running. Double-click here, or press Ctrl+Alt+Shift+A, to come back.",
                        ToolTipIcon.Info);
                }
                catch (Exception ex)
                {
                    Diagnostics.Warn("Balloon tip failed: " + ex.Message);
                }
                return;
            }

            _tickTimer.Stop();
            _refreshTimer.Stop();
            base.OnFormClosing(e);
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            NativeMethods.UnregisterHotKey(Handle, HotkeyPanic);
            NativeMethods.UnregisterHotKey(Handle, HotkeyShow);

            _tray.Visible = false;
            _tray.Dispose();
            _tickTimer.Dispose();
            _refreshTimer.Dispose();

            if (_appIcon != null) _appIcon.Dispose();

            base.OnFormClosed(e);
        }
    }
}
