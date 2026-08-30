using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using Microsoft.Win32;
using AgentWrangler.Agents;
using AgentWrangler.Behavior;
using AgentWrangler.Config;
using AgentWrangler.Interop;
using AgentWrangler.Library;
using AgentWrangler.Watchers;

namespace AgentWrangler
{
    /// <summary>
    /// Owns every long-lived object in the program and the order they are created and torn
    /// down in. The manager window talks to this and never to the COM layer directly.
    /// </summary>
    public sealed class AppHost : IDisposable
    {
        private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunValueName = "AgentWrangler";

        private bool _disposed;

        public AppSettings Settings { get; private set; }
        public CharacterLibrary Library { get; private set; }
        public AgentServer Server { get; private set; }
        public AgentRoster Roster { get; private set; }
        public PesterEngine Engine { get; private set; }
        public WatcherHub Watchers { get; private set; }
        public Phrasebook Phrasebook { get; private set; }

        /// <summary>Null while the Agent server is reachable; the reason it is not otherwise.</summary>
        public string ConnectionError { get; private set; }

        public bool IsConnected { get { return Server != null && Server.IsConnected; } }

        /// <summary>
        /// Brings the program up. Never throws for a missing Agent server: the manager is
        /// still useful for cataloguing character files and editing behaviour while
        /// DoubleAgent is being sorted out.
        /// </summary>
        public void Start()
        {
            SettingsStore.EnsureDataFolder();
            Diagnostics.Initialize(SettingsStore.DataFolder);
            Diagnostics.Info("Agent Wrangler starting.");

            Settings = SettingsStore.Load() ?? CreateDefaultSettings();
            if (Settings.LibraryFolders.Count == 0)
                Settings.LibraryFolders.AddRange(CharacterLibrary.DefaultFolders());
            if (Settings.WatchedFolders.Count == 0)
                Settings.WatchedFolders.AddRange(FileActivityWatcher.DefaultFolders());

            Phrasebook = Phrasebook.LoadOrCreate(SettingsStore.PhrasebookPath);

            Library = new CharacterLibrary();
            RescanLibrary();

            Server = new AgentServer();
            Roster = new AgentRoster(Server);

            Watchers = new WatcherHub();
            Engine = new PesterEngine(Settings, Roster, Watchers.Bus, Phrasebook);

            Watchers.Start(Settings.WatchedFolders, AnyAgentQuotesClipboard);

            TryConnect();
        }

        private static AppSettings CreateDefaultSettings()
        {
            Diagnostics.Info("No settings found; starting with defaults.");
            return new AppSettings();
        }

        /// <summary>
        /// The clipboard's contents are only read when at least one active agent is set to
        /// quote them. With nobody quoting, all that leaves the clipboard is the fact that
        /// it changed.
        /// </summary>
        private bool AnyAgentQuotesClipboard()
        {
            if (Roster == null) return false;
            foreach (LiveAgent agent in Roster.Agents)
                if (agent.Profile.QuoteClipboard) return true;
            return false;
        }

        // ---- the Agent server ------------------------------------------------------

        public bool TryConnect()
        {
            try
            {
                Server.Connect(Settings.ProgId);
                ConnectionError = null;
                return true;
            }
            catch (Exception ex)
            {
                ConnectionError = ex.Message;
                Diagnostics.Error("Agent server unavailable.", ex);
                return false;
            }
        }

        /// <summary>
        /// Drops the current connection and makes a fresh one, which is the only way a
        /// changed ProgID can take effect. Every character on screen belongs to the old
        /// connection and cannot survive it, so the roster is cleared first.
        /// </summary>
        public bool Reconnect()
        {
            if (Roster != null) Roster.DismissAll();
            Server.Disconnect();
            return TryConnect();
        }

        public string ConnectionSummary()
        {
            if (!IsConnected)
                return "Not connected" + (ConnectionError == null ? "" : " -- " + FirstLine(ConnectionError));

            string summary = "Connected via " + Server.ActiveProgId;
            if (!string.IsNullOrEmpty(Server.ServerModulePath))
                summary += "  (" + Path.GetFileName(Server.ServerModulePath) + ")";
            return summary;
        }

        private static string FirstLine(string text)
        {
            if (string.IsNullOrEmpty(text)) return string.Empty;
            int newline = text.IndexOf('\n');
            return newline < 0 ? text : text.Substring(0, newline).TrimEnd('\r');
        }

        // ---- library ---------------------------------------------------------------

        /// <summary>Rescans every library folder and makes sure each file has a profile.</summary>
        public void RescanLibrary()
        {
            Library.Scan(Settings.LibraryFolders, Settings.CharacterCache);

            foreach (CharacterFileInfo info in Library.Snapshot())
            {
                if (Settings.FindProfileForPath(info.Path) != null) continue;

                Settings.Profiles.Add(new AgentProfile
                {
                    CharacterPath = info.Path,
                    DisplayName = info.DisplayName
                });
            }

            SyncCache();
        }

        /// <summary>Copies the library's knowledge back into the settings for persistence.</summary>
        private void SyncCache()
        {
            Settings.CharacterCache.Clear();
            foreach (CharacterFileInfo info in Library.Items)
                if (info.HasBeenProbed) Settings.CharacterCache.Add(info);
        }

        /// <summary>
        /// Loads a character just long enough to read its real name, description and
        /// animation list, then unloads it again. This is what fills the animation pickers
        /// in the behaviour editor with names the character actually has.
        /// </summary>
        public void Probe(CharacterFileInfo info)
        {
            if (info == null) return;
            if (!IsConnected) throw new AgentServerException("Not connected to an Agent server.");

            string characterId = null;
            try
            {
                object character = Server.Load(info.Path, out characterId);

                dynamic ch = character;
                try { info.Name = (string)ch.Name; } catch { info.Name = string.Empty; }
                try { info.Description = (string)ch.Description; } catch { info.Description = string.Empty; }

                info.Animations.Clear();
                info.Animations.AddRange(AgentRoster.ReadAnimationNames(character));

                info.ProbedUtc = DateTime.UtcNow;
                info.ProbeError = string.Empty;
                info.RefreshFileFacts();

                Diagnostics.Info("Probed " + info.FileName + ": \"" + info.Name + "\", " +
                                 info.Animations.Count + " animations.");

                // A profile still named after the file gets the character's real name.
                AgentProfile profile = Settings.FindProfileForPath(info.Path);
                if (profile != null && !string.IsNullOrEmpty(info.Name) &&
                    string.Equals(profile.DisplayName, Path.GetFileNameWithoutExtension(info.Path),
                                  StringComparison.OrdinalIgnoreCase))
                {
                    profile.DisplayName = info.Name;
                }
            }
            catch (Exception ex)
            {
                info.ProbeError = ex.Message;
                info.ProbedUtc = default(DateTime);
                Diagnostics.Error("Probe of " + info.FileName + " failed.", ex);
                throw;
            }
            finally
            {
                if (characterId != null) Server.Unload(characterId);
                SyncCache();
            }
        }

        // ---- privileged file operations --------------------------------------------

        /// <summary>
        /// Deletes a character file, asking Windows for administrator rights only if the
        /// plain attempt is refused -- which it will be for the characters installed under
        /// %WINDIR% or Program Files.
        /// </summary>
        public void DeleteCharacterFile(string path)
        {
            try
            {
                Library.DeleteFile(path);
                return;
            }
            catch (UnauthorizedAccessException ex)
            {
                Diagnostics.Info("Deleting " + path + " needs administrator rights (" + ex.Message + ").");
            }

            string error;
            if (!Elevation.RunElevated(ElevatedHelper.DeleteSwitch + " " + Quote(path), out error))
                throw new UnauthorizedAccessException(error);

            Library.Forget(path);
            Diagnostics.Info("Deleted " + path + " with administrator rights.");
        }

        /// <summary>
        /// Renames a character file, elevating only if Windows refuses. Returns the new path.
        /// </summary>
        public string RenameCharacterFile(string path, string newStem)
        {
            try
            {
                return Library.RenameFile(path, newStem);
            }
            catch (UnauthorizedAccessException ex)
            {
                Diagnostics.Info("Renaming " + path + " needs administrator rights (" + ex.Message + ").");
            }

            string folder = Path.GetDirectoryName(path);
            if (string.IsNullOrEmpty(folder))
                throw new IOException("Cannot determine the folder for " + path);

            string newFileName = newStem + Path.GetExtension(path);

            string error;
            if (!Elevation.RunElevated(
                    ElevatedHelper.RenameSwitch + " " + Quote(path) + " " + Quote(newFileName), out error))
                throw new UnauthorizedAccessException(error);

            string target = Path.Combine(folder, newFileName);
            Library.Forget(path);
            Library.Track(target);
            Diagnostics.Info("Renamed " + path + " with administrator rights.");
            return target;
        }

        /// <summary>
        /// Wraps an argument for the elevated helper. Windows file names cannot contain a
        /// quote character, so nothing here needs escaping beyond the surrounding pair.
        /// </summary>
        private static string Quote(string value)
        {
            return "\"" + value + "\"";
        }

        // ---- profiles --------------------------------------------------------------

        public AgentProfile Duplicate(AgentProfile source)
        {
            if (source == null) return null;
            AgentProfile copy = source.Clone();
            copy.DisplayName = MakeUniqueName(source.DisplayName);
            copy.AutoSummon = false;
            Settings.Profiles.Add(copy);
            Diagnostics.Info("Created a second agent from " + source.DisplayName + ": " + copy.DisplayName);
            return copy;
        }

        private string MakeUniqueName(string baseName)
        {
            if (string.IsNullOrEmpty(baseName)) baseName = "Agent";
            for (int n = 2; n < 500; n++)
            {
                string candidate = baseName + " " + n;
                bool taken = false;
                foreach (AgentProfile p in Settings.Profiles)
                {
                    if (string.Equals(p.DisplayName, candidate, StringComparison.OrdinalIgnoreCase))
                    {
                        taken = true;
                        break;
                    }
                }
                if (!taken) return candidate;
            }
            return baseName + " " + Guid.NewGuid().ToString("N").Substring(0, 4);
        }

        /// <summary>Removes a profile, dismissing it first if it is on screen.</summary>
        public void RemoveProfile(AgentProfile profile)
        {
            if (profile == null) return;
            if (Roster.IsActive(profile.Id)) Engine.Dismiss(profile.Id, false);
            Settings.Profiles.Remove(profile);
            Diagnostics.Info("Removed agent entry " + profile.DisplayName + ".");
        }

        /// <summary>Points every profile that used the old path at the new one.</summary>
        public void RepointProfiles(string oldPath, string newPath)
        {
            foreach (AgentProfile profile in Settings.Profiles)
            {
                if (string.Equals(profile.CharacterPath, oldPath, StringComparison.OrdinalIgnoreCase))
                    profile.CharacterPath = newPath;
            }
        }

        public LiveAgent Summon(AgentProfile profile)
        {
            return Engine.Summon(profile, Library.Find(profile.CharacterPath));
        }

        public void SummonAutoStart()
        {
            if (!IsConnected) return;
            foreach (AgentProfile profile in new List<AgentProfile>(Settings.Profiles))
            {
                if (!profile.AutoSummon) continue;
                try { Summon(profile); }
                catch (Exception ex) { Diagnostics.Error("Auto-summon of " + profile.DisplayName + " failed.", ex); }
            }
        }

        // ---- watched folders -------------------------------------------------------

        public void ApplyWatchedFolders()
        {
            if (Watchers != null) Watchers.UpdateWatchedFolders(Settings.WatchedFolders);
        }

        // ---- start with Windows ----------------------------------------------------

        public static string ExecutablePath
        {
            get
            {
                try { return Assembly.GetEntryAssembly().Location; }
                catch { return string.Empty; }
            }
        }

        /// <summary>Adds or removes the per-user Run entry. Needs no administrator rights.</summary>
        public void SetLaunchOnLogin(bool enabled)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKeyPath, true))
                {
                    if (key == null)
                    {
                        Diagnostics.Warn("Run key is not available; cannot change the login setting.");
                        return;
                    }

                    if (enabled)
                    {
                        string exe = ExecutablePath;
                        if (string.IsNullOrEmpty(exe))
                        {
                            Diagnostics.Warn("Cannot work out this program's path; login setting unchanged.");
                            return;
                        }
                        key.SetValue(RunValueName, "\"" + exe + "\"");
                    }
                    else
                    {
                        key.DeleteValue(RunValueName, false);
                    }
                }

                Settings.LaunchOnLogin = enabled;
                Diagnostics.Info("Launch at login " + (enabled ? "enabled." : "disabled."));
            }
            catch (Exception ex)
            {
                Diagnostics.Error("Could not change the launch-at-login setting.", ex);
            }
        }

        // ---- persistence -----------------------------------------------------------

        public void SaveSettings()
        {
            try
            {
                SyncCache();
                SettingsStore.Save(Settings);
            }
            catch (Exception ex)
            {
                Diagnostics.Error("Settings could not be saved.", ex);
            }
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;

            // Order matters: stop noticing things, then take the agents off screen, then
            // let go of the COM server.
            if (Watchers != null) Watchers.Dispose();
            if (Engine != null) Engine.Dispose();
            if (Roster != null) Roster.Dispose();
            if (Server != null) Server.Dispose();

            SaveSettings();
            Diagnostics.Info("Agent Wrangler stopped.");
        }
    }
}
