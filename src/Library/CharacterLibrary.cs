using System;
using System.Collections.Generic;
using System.IO;
using Microsoft.Win32;

namespace AgentWrangler.Library
{
    /// <summary>
    /// Finds, catalogues and maintains the .acs / .acf character files on the machine.
    /// This is the "manages agent files" half of the program; the roster and the pester
    /// engine are the other half.
    /// </summary>
    public sealed class CharacterLibrary
    {
        /// <summary>
        /// First DWORD of a Microsoft Agent character file. Used only to label a file in
        /// the list; a file that fails this check is still offered for loading, because
        /// the Agent server is the real authority on what it can open.
        /// </summary>
        private const uint AcsSignature = 0xABCDABC3;

        private readonly Dictionary<string, CharacterFileInfo> _byPath =
            new Dictionary<string, CharacterFileInfo>(StringComparer.OrdinalIgnoreCase);

        public IEnumerable<CharacterFileInfo> Items
        {
            get { return _byPath.Values; }
        }

        public int Count { get { return _byPath.Count; } }

        /// <summary>Folder this program copies imported characters into.</summary>
        public static string UserCharacterFolder
        {
            get { return Path.Combine(Config.SettingsStore.DataFolder, "Characters"); }
        }

        /// <summary>
        /// The places worth looking for characters on a Windows 7 box with DoubleAgent
        /// installed. Missing folders are simply skipped by the scanner.
        /// </summary>
        public static List<string> DefaultFolders()
        {
            var folders = new List<string>();

            Action<string> add = delegate(string p)
            {
                if (string.IsNullOrEmpty(p)) return;
                foreach (string existing in folders)
                    if (string.Equals(existing, p, StringComparison.OrdinalIgnoreCase)) return;
                folders.Add(p);
            };

            add(UserCharacterFolder);

            string windir = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            if (!string.IsNullOrEmpty(windir))
            {
                add(Path.Combine(windir, @"msagent\chars"));
                add(Path.Combine(windir, @"SysWOW64\msagent\chars"));
            }

            foreach (string programFiles in ProgramFilesRoots())
            {
                add(Path.Combine(programFiles, @"DoubleAgent\Characters"));
                add(Path.Combine(programFiles, @"Double Agent\Characters"));
                add(Path.Combine(programFiles, @"Microsoft Agent\Characters"));
            }

            foreach (string fromRegistry in RegistryCharacterFolders()) add(fromRegistry);

            return folders;
        }

        private static IEnumerable<string> ProgramFilesRoots()
        {
            var roots = new List<string>();
            string pf = Environment.GetEnvironmentVariable("ProgramFiles");
            string pf86 = Environment.GetEnvironmentVariable("ProgramFiles(x86)");
            if (!string.IsNullOrEmpty(pf)) roots.Add(pf);
            if (!string.IsNullOrEmpty(pf86) && !roots.Contains(pf86)) roots.Add(pf86);
            return roots;
        }

        /// <summary>
        /// Both Microsoft Agent and DoubleAgent record where their characters live.
        /// Anything we cannot read is ignored; this only ever adds candidates.
        /// </summary>
        private static IEnumerable<string> RegistryCharacterFolders()
        {
            var found = new List<string>();
            string[] keys =
            {
                @"SOFTWARE\Microsoft\Microsoft Agent\Characters",
                @"SOFTWARE\Wow6432Node\Microsoft\Microsoft Agent\Characters",
                @"SOFTWARE\Cinnamon Software\Double Agent",
                @"SOFTWARE\Wow6432Node\Cinnamon Software\Double Agent",
                @"SOFTWARE\DoubleAgent",
                @"SOFTWARE\Wow6432Node\DoubleAgent"
            };

            foreach (string keyPath in keys)
            {
                foreach (RegistryKey hive in new[] { Registry.LocalMachine, Registry.CurrentUser })
                {
                    try
                    {
                        using (RegistryKey key = hive.OpenSubKey(keyPath))
                        {
                            if (key == null) continue;
                            foreach (string valueName in new[] { "", "Path", "Characters", "CharacterPath", "Directory" })
                            {
                                var raw = key.GetValue(valueName) as string;
                                if (string.IsNullOrEmpty(raw)) continue;
                                string expanded = Environment.ExpandEnvironmentVariables(raw.Trim('"'));
                                if (Directory.Exists(expanded)) found.Add(expanded);
                            }
                        }
                    }
                    catch
                    {
                        // Registry access is best-effort; a locked-down box just gets fewer hints.
                    }
                }
            }
            return found;
        }

        /// <summary>
        /// Rebuilds the catalogue from the given folders, keeping any probe results we
        /// already have for files that are still present.
        /// </summary>
        public void Scan(IEnumerable<string> folders, IEnumerable<CharacterFileInfo> cached)
        {
            var previous = new Dictionary<string, CharacterFileInfo>(StringComparer.OrdinalIgnoreCase);
            foreach (var existing in _byPath.Values) previous[existing.Path] = existing;
            if (cached != null)
            {
                foreach (var c in cached)
                {
                    if (c != null && !string.IsNullOrEmpty(c.Path)) previous[c.Path] = c;
                }
            }

            _byPath.Clear();

            foreach (string folder in folders ?? new List<string>())
            {
                if (string.IsNullOrEmpty(folder)) continue;
                string[] files;
                try
                {
                    if (!Directory.Exists(folder)) continue;
                    files = Directory.GetFiles(folder);
                }
                catch (Exception ex)
                {
                    Diagnostics.Warn("Cannot list " + folder + ": " + ex.Message);
                    continue;
                }

                foreach (string file in files)
                {
                    string ext = Path.GetExtension(file);
                    if (!string.Equals(ext, ".acs", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(ext, ".acf", StringComparison.OrdinalIgnoreCase))
                        continue;

                    if (_byPath.ContainsKey(file)) continue;

                    CharacterFileInfo info;
                    if (!previous.TryGetValue(file, out info) || info == null)
                    {
                        info = new CharacterFileInfo { Path = file };
                    }

                    info.RefreshFileFacts();
                    if (info.Header == HeaderStatus.NotChecked) info.Header = SniffHeader(file);
                    _byPath[file] = info;
                }
            }

            Diagnostics.Info("Library scan found " + _byPath.Count + " character file(s).");
        }

        public CharacterFileInfo Find(string path)
        {
            if (string.IsNullOrEmpty(path)) return null;
            CharacterFileInfo info;
            return _byPath.TryGetValue(path, out info) ? info : null;
        }

        /// <summary>Adds a file that lives outside any scanned folder.</summary>
        public CharacterFileInfo Track(string path)
        {
            CharacterFileInfo info = Find(path);
            if (info != null) return info;
            info = new CharacterFileInfo { Path = path };
            info.RefreshFileFacts();
            info.Header = SniffHeader(path);
            _byPath[path] = info;
            return info;
        }

        /// <summary>
        /// Reads the leading signature. Advisory: an unrecognized header is reported but
        /// never prevents a load attempt.
        /// </summary>
        public static HeaderStatus SniffHeader(string path)
        {
            try
            {
                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    var buffer = new byte[4];
                    if (stream.Read(buffer, 0, 4) < 4) return HeaderStatus.Unrecognized;
                    uint signature = BitConverter.ToUInt32(buffer, 0);
                    return signature == AcsSignature ? HeaderStatus.LooksLikeCharacter
                                                     : HeaderStatus.Unrecognized;
                }
            }
            catch (Exception ex)
            {
                Diagnostics.Warn("Cannot read header of " + path + ": " + ex.Message);
                return HeaderStatus.Unreadable;
            }
        }

        /// <summary>Copies a character file into the user library folder. Returns the new path.</summary>
        public string Import(string sourcePath)
        {
            Directory.CreateDirectory(UserCharacterFolder);
            string target = Path.Combine(UserCharacterFolder, Path.GetFileName(sourcePath));

            // Never silently clobber an existing character with the same file name.
            if (File.Exists(target) &&
                !string.Equals(target, sourcePath, StringComparison.OrdinalIgnoreCase))
            {
                string stem = Path.GetFileNameWithoutExtension(sourcePath);
                string ext = Path.GetExtension(sourcePath);
                for (int n = 2; n < 1000 && File.Exists(target); n++)
                    target = Path.Combine(UserCharacterFolder, stem + " (" + n + ")" + ext);
            }

            if (!string.Equals(target, sourcePath, StringComparison.OrdinalIgnoreCase))
                File.Copy(sourcePath, target);

            Track(target);
            Diagnostics.Info("Imported " + Path.GetFileName(sourcePath) + " to library.");
            return target;
        }

        public void Forget(string path)
        {
            if (!string.IsNullOrEmpty(path)) _byPath.Remove(path);
        }

        /// <summary>Deletes the file from disk and drops it from the catalogue.</summary>
        public void DeleteFile(string path)
        {
            File.Delete(path);
            Forget(path);
            Diagnostics.Info("Deleted character file " + path);
        }

        /// <summary>Renames the file on disk, keeping its extension. Returns the new path.</summary>
        public string RenameFile(string path, string newStem)
        {
            string folder = Path.GetDirectoryName(path);
            string ext = Path.GetExtension(path);
            if (string.IsNullOrEmpty(folder)) throw new IOException("Cannot determine folder for " + path);

            string target = Path.Combine(folder, newStem + ext);
            if (string.Equals(target, path, StringComparison.OrdinalIgnoreCase)) return path;
            if (File.Exists(target)) throw new IOException("A file called " + newStem + ext + " is already there.");

            File.Move(path, target);

            CharacterFileInfo info = Find(path);
            _byPath.Remove(path);
            if (info == null) info = new CharacterFileInfo();
            info.Path = target;
            info.RefreshFileFacts();
            _byPath[target] = info;

            Diagnostics.Info("Renamed character file to " + Path.GetFileName(target));
            return target;
        }

        public List<CharacterFileInfo> Snapshot()
        {
            var list = new List<CharacterFileInfo>(_byPath.Values);
            list.Sort(delegate(CharacterFileInfo a, CharacterFileInfo b)
            {
                return string.Compare(a.DisplayName, b.DisplayName, StringComparison.CurrentCultureIgnoreCase);
            });
            return list;
        }
    }
}
