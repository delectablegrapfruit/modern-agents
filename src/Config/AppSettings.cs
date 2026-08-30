using System;
using System.Collections.Generic;
using System.Xml.Serialization;
using AgentWrangler.Library;

namespace AgentWrangler.Config
{
    /// <summary>
    /// Everything persisted between runs. Written as plain XML so it can be edited by
    /// hand or copied between machines.
    /// </summary>
    [XmlRoot("AgentWrangler")]
    public class AppSettings
    {
        public int SchemaVersion { get; set; }

        /// <summary>
        /// COM ProgID of the Agent control. Empty means "try the known ones in order",
        /// which is what you want with DoubleAgent installed as the MS Agent replacement.
        /// </summary>
        public string ProgId { get; set; }

        /// <summary>Global multiplier over every profile's own pester level. 5 is neutral.</summary>
        public int MasterPester { get; set; }

        /// <summary>Global mute. Agents stay on screen but stop talking and moving.</summary>
        public bool Muzzled { get; set; }

        /// <summary>
        /// Pick lines at random instead of cycling through each bank before repeating.
        /// The cycle is shared by every agent drawing on the same bank.
        /// </summary>
        public bool RandomDialogue { get; set; }

        /// <summary>Hold the agents still while the caret is in a text field.</summary>
        public bool PauseMovementWhileTyping { get; set; }

        public bool StartMinimized { get; set; }
        public bool LaunchOnLogin { get; set; }

        [XmlArray("LibraryFolders")]
        [XmlArrayItem("Folder")]
        public List<string> LibraryFolders { get; set; }

        [XmlArray("Profiles")]
        [XmlArrayItem("Agent")]
        public List<AgentProfile> Profiles { get; set; }

        /// <summary>Cached results of probing character files, keyed by full path.</summary>
        [XmlArray("CharacterCache")]
        [XmlArrayItem("Character")]
        public List<CharacterFileInfo> CharacterCache { get; set; }

        /// <summary>Folders the file watcher treats as "downloads" for download chatter.</summary>
        [XmlArray("WatchedFolders")]
        [XmlArrayItem("Folder")]
        public List<string> WatchedFolders { get; set; }

        public AppSettings()
        {
            SchemaVersion = 1;
            ProgId = string.Empty;
            MasterPester = 5;
            Muzzled = false;
            RandomDialogue = false;
            PauseMovementWhileTyping = true;
            StartMinimized = false;
            LaunchOnLogin = false;
            LibraryFolders = new List<string>();
            Profiles = new List<AgentProfile>();
            CharacterCache = new List<CharacterFileInfo>();
            WatchedFolders = new List<string>();
        }

        public AgentProfile FindProfile(string id)
        {
            if (string.IsNullOrEmpty(id) || Profiles == null) return null;
            foreach (var p in Profiles)
                if (string.Equals(p.Id, id, StringComparison.OrdinalIgnoreCase)) return p;
            return null;
        }

        public AgentProfile FindProfileForPath(string path)
        {
            if (string.IsNullOrEmpty(path) || Profiles == null) return null;
            foreach (var p in Profiles)
                if (string.Equals(p.CharacterPath, path, StringComparison.OrdinalIgnoreCase)) return p;
            return null;
        }
    }
}
