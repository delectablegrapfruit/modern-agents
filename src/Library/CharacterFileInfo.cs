using System;
using System.Collections.Generic;
using System.IO;
using System.Xml.Serialization;

namespace AgentWrangler.Library
{
    /// <summary>
    /// Result of sniffing the first bytes of a character file. This is advisory only:
    /// the authoritative test is whether the Agent server can actually load the file,
    /// which is what Probe does.
    /// </summary>
    public enum HeaderStatus
    {
        NotChecked,
        LooksLikeCharacter,
        Unrecognized,
        Unreadable
    }

    /// <summary>One character file in the library, plus whatever we have learned about it.</summary>
    public class CharacterFileInfo
    {
        public string Path { get; set; }

        /// <summary>The character's own name, filled in by a successful probe.</summary>
        public string Name { get; set; }

        /// <summary>The character's own description, filled in by a successful probe.</summary>
        public string Description { get; set; }

        public long SizeBytes { get; set; }
        public DateTime ModifiedUtc { get; set; }
        public HeaderStatus Header { get; set; }

        /// <summary>Animation names reported by the character. Empty until probed.</summary>
        [XmlArray("Animations")]
        [XmlArrayItem("Animation")]
        public List<string> Animations { get; set; }

        /// <summary>The character's own drawn size, read when it is inspected.</summary>
        public int NativeWidth { get; set; }
        public int NativeHeight { get; set; }

        public DateTime ProbedUtc { get; set; }

        /// <summary>Why the last probe failed, or empty if it succeeded / has not run.</summary>
        public string ProbeError { get; set; }

        public CharacterFileInfo()
        {
            Path = string.Empty;
            Name = string.Empty;
            Description = string.Empty;
            Animations = new List<string>();
            Header = HeaderStatus.NotChecked;
            ProbeError = string.Empty;
        }

        [XmlIgnore]
        public string FileName
        {
            get { return string.IsNullOrEmpty(Path) ? string.Empty : System.IO.Path.GetFileName(Path); }
        }

        [XmlIgnore]
        public string Folder
        {
            get
            {
                if (string.IsNullOrEmpty(Path)) return string.Empty;
                try { return System.IO.Path.GetDirectoryName(Path) ?? string.Empty; }
                catch { return string.Empty; }
            }
        }

        [XmlIgnore]
        public bool HasBeenProbed
        {
            get { return ProbedUtc != default(DateTime); }
        }

        /// <summary>Best available label: the character's real name, else the file name.</summary>
        [XmlIgnore]
        public string DisplayName
        {
            get
            {
                if (!string.IsNullOrEmpty(Name)) return Name;
                try { return System.IO.Path.GetFileNameWithoutExtension(Path); }
                catch { return FileName; }
            }
        }

        [XmlIgnore]
        public string StatusText
        {
            get
            {
                if (!string.IsNullOrEmpty(ProbeError)) return "Will not load";
                if (HasBeenProbed) return "Read OK";
                switch (Header)
                {
                    case HeaderStatus.LooksLikeCharacter: return "Not read";
                    case HeaderStatus.Unrecognized: return "Odd header";
                    case HeaderStatus.Unreadable: return "Unreadable";
                    default: return "Not read";
                }
            }
        }

        [XmlIgnore]
        public string SizeText
        {
            get
            {
                double kb = SizeBytes / 1024.0;
                if (kb < 1024) return Math.Round(kb) + " KB";
                return Math.Round(kb / 1024.0, 1) + " MB";
            }
        }

        public void RefreshFileFacts()
        {
            try
            {
                var info = new FileInfo(Path);
                if (!info.Exists) return;
                SizeBytes = info.Length;
                ModifiedUtc = info.LastWriteTimeUtc;
            }
            catch (Exception ex)
            {
                Diagnostics.Warn("Could not stat " + Path + ": " + ex.Message);
            }
        }
    }
}
