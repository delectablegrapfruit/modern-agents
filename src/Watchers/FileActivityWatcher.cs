using System;
using System.Collections.Generic;
using System.IO;
using AgentWrangler.Behavior;

namespace AgentWrangler.Watchers
{
    /// <summary>
    /// Watches the folders where visible things happen -- Downloads, Desktop, Documents --
    /// and turns file churn into something an agent can talk about.
    ///
    /// Browsers write partial downloads under a temporary extension and rename them on
    /// completion, which is what lets this distinguish "started downloading" from
    /// "finished downloading" without hooking any browser.
    /// </summary>
    public sealed class FileActivityWatcher : IDisposable
    {
        private static readonly string[] PartialExtensions =
        {
            ".crdownload",   // Chrome, Edge
            ".part",         // Firefox
            ".partial",      // Internet Explorer / Edge legacy
            ".opdownload",   // Opera
            ".download",     // Safari
            ".!ut"           // uTorrent
        };

        /// <summary>
        /// Half-finished downloads sometimes land as plain .tmp, but so does most of what
        /// Office writes next to a document. Treated as a download only inside a Downloads
        /// folder, and as ordinary scratch everywhere else.
        /// </summary>
        private const string AmbiguousTempExtension = ".tmp";

        /// <summary>Office and friends leave these beside an open document. Nobody needs a bulletin.</summary>
        private const string LockFilePrefix = "~$";

        private readonly ActivityBus _bus;
        private readonly List<FileSystemWatcher> _watchers = new List<FileSystemWatcher>();
        private readonly HashSet<string> _downloadFolders =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        public FileActivityWatcher(ActivityBus bus)
        {
            _bus = bus;
        }

        /// <summary>The folders worth watching on a stock Windows 7 profile.</summary>
        public static List<string> DefaultFolders()
        {
            var folders = new List<string>();
            string profile = Environment.GetEnvironmentVariable("USERPROFILE");

            // Downloads has no Environment.SpecialFolder entry before .NET 4's known-folder
            // support, and the profile-relative path is stable on Windows 7.
            if (!string.IsNullOrEmpty(profile))
            {
                string downloads = Path.Combine(profile, "Downloads");
                if (Directory.Exists(downloads)) folders.Add(downloads);
            }

            foreach (Environment.SpecialFolder special in new[]
                     {
                         Environment.SpecialFolder.DesktopDirectory,
                         Environment.SpecialFolder.MyDocuments
                     })
            {
                try
                {
                    string path = Environment.GetFolderPath(special);
                    if (!string.IsNullOrEmpty(path) && Directory.Exists(path) && !folders.Contains(path))
                        folders.Add(path);
                }
                catch (Exception ex)
                {
                    Diagnostics.Warn("Could not resolve " + special + ": " + ex.Message);
                }
            }

            return folders;
        }

        public void Start(IEnumerable<string> folders)
        {
            Stop();

            foreach (string folder in folders ?? new List<string>())
            {
                if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder)) continue;

                if (IsDownloadsFolder(folder)) _downloadFolders.Add(folder);

                try
                {
                    var watcher = new FileSystemWatcher(folder);
                    watcher.IncludeSubdirectories = false;
                    // Only structural changes; NotifyFilters.LastWrite would fire dozens of
                    // times for a single save and drown everything else out.
                    watcher.NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName;
                    watcher.Created += OnCreated;
                    watcher.Deleted += OnDeleted;
                    watcher.Renamed += OnRenamed;
                    watcher.Error += OnError;
                    watcher.EnableRaisingEvents = true;
                    _watchers.Add(watcher);
                    Diagnostics.Info("Watching folder " + folder);
                }
                catch (Exception ex)
                {
                    Diagnostics.Warn("Cannot watch " + folder + ": " + ex.Message);
                }
            }
        }

        /// <summary>
        /// True for a folder actually called "Downloads", whether or not the path the user
        /// picked has a trailing separator.
        /// </summary>
        private static bool IsDownloadsFolder(string folder)
        {
            try
            {
                string trimmed = folder.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                return string.Equals(Path.GetFileName(trimmed), "Downloads", StringComparison.OrdinalIgnoreCase);
            }
            catch (ArgumentException)
            {
                return false;
            }
        }

        private bool IsPartialDownload(string path)
        {
            string ext = Path.GetExtension(path);
            if (string.IsNullOrEmpty(ext)) return false;

            foreach (string partial in PartialExtensions)
                if (string.Equals(ext, partial, StringComparison.OrdinalIgnoreCase)) return true;

            return string.Equals(ext, AmbiguousTempExtension, StringComparison.OrdinalIgnoreCase)
                   && IsInDownloads(path);
        }

        private static bool IsNoise(string path)
        {
            string name = Path.GetFileName(path);
            return !string.IsNullOrEmpty(name) &&
                   name.StartsWith(LockFilePrefix, StringComparison.Ordinal);
        }

        private bool IsInDownloads(string path)
        {
            try
            {
                string folder = Path.GetDirectoryName(path);
                return folder != null && _downloadFolders.Contains(folder);
            }
            catch { return false; }
        }

        private void OnCreated(object sender, FileSystemEventArgs e)
        {
            if (IsNoise(e.FullPath)) return;
            string name = Path.GetFileName(e.FullPath);

            if (IsPartialDownload(e.FullPath))
            {
                // Strip the temporary extension so the agent names the real file.
                string realName = Path.GetFileNameWithoutExtension(e.FullPath);
                Publish(ActivityKind.DownloadStarted, realName, e.FullPath);
                return;
            }

            if (IsInDownloads(e.FullPath))
            {
                Publish(ActivityKind.DownloadFinished, name, e.FullPath);
                return;
            }

            Publish(ActivityKind.FileCreated, name, e.FullPath);
        }

        private void OnDeleted(object sender, FileSystemEventArgs e)
        {
            if (IsNoise(e.FullPath)) return;
            if (IsPartialDownload(e.FullPath)) return; // the rename below is the real story
            Publish(ActivityKind.FileDeleted, Path.GetFileName(e.FullPath), e.FullPath);
        }

        private void OnRenamed(object sender, RenamedEventArgs e)
        {
            if (IsNoise(e.FullPath)) return;

            // Partial -> real name is how a browser signals a completed download.
            if (IsPartialDownload(e.OldFullPath) && !IsPartialDownload(e.FullPath))
            {
                Publish(ActivityKind.DownloadFinished, Path.GetFileName(e.FullPath), e.FullPath);
                return;
            }

            if (IsPartialDownload(e.FullPath)) return;

            var ev = new ActivityEvent(ActivityKind.FileRenamed, Path.GetFileName(e.FullPath))
                .With("file", Path.GetFileName(e.FullPath))
                .With("oldfile", Path.GetFileName(e.OldFullPath))
                .With("path", e.FullPath)
                .With("folder", SafeFolderName(e.FullPath))
                .With("ext", SafeExtension(e.FullPath));
            _bus.Publish(ev);
        }

        private void OnError(object sender, ErrorEventArgs e)
        {
            // Happens when the watched folder disappears or the internal buffer overflows.
            Exception ex = e.GetException();
            Diagnostics.Warn("File watcher error: " + (ex == null ? "unknown" : ex.Message));
        }

        private void Publish(ActivityKind kind, string displayName, string fullPath)
        {
            _bus.Publish(new ActivityEvent(kind, displayName)
                .With("file", displayName)
                .With("path", fullPath)
                .With("folder", SafeFolderName(fullPath))
                .With("ext", SafeExtension(fullPath)));
        }

        private static string SafeFolderName(string fullPath)
        {
            try
            {
                string dir = Path.GetDirectoryName(fullPath);
                return string.IsNullOrEmpty(dir) ? string.Empty : new DirectoryInfo(dir).Name;
            }
            catch { return string.Empty; }
        }

        private static string SafeExtension(string fullPath)
        {
            try
            {
                string ext = Path.GetExtension(fullPath);
                return string.IsNullOrEmpty(ext) ? string.Empty : ext.TrimStart('.').ToUpperInvariant();
            }
            catch { return string.Empty; }
        }

        public void Stop()
        {
            foreach (FileSystemWatcher watcher in _watchers)
            {
                try
                {
                    watcher.EnableRaisingEvents = false;
                    watcher.Dispose();
                }
                catch (Exception ex) { Diagnostics.Warn("Watcher teardown: " + ex.Message); }
            }
            _watchers.Clear();
            _downloadFolders.Clear();
        }

        public void Dispose() { Stop(); }
    }
}
