using System;
using System.Collections.Generic;
using AgentWrangler.Behavior;

namespace AgentWrangler.Watchers
{
    /// <summary>
    /// Owns every source of user activity and funnels all of them into one bus.
    /// Start it once from the UI thread; the individual watchers raise their events on
    /// whatever thread Windows hands them, and the bus does the marshalling.
    /// </summary>
    public sealed class WatcherHub : IDisposable
    {
        private readonly ActivityBus _bus = new ActivityBus();
        private ClipboardWatcher _clipboard;
        private FileActivityWatcher _files;
        private ForegroundWatcher _foreground;
        private IdleWatcher _idle;
        private bool _started;

        public ActivityBus Bus { get { return _bus; } }

        /// <summary>True while the user has not touched the keyboard or mouse for a while.</summary>
        public bool UserIsIdle { get { return _idle != null && _idle.IsIdle; } }

        /// <summary>
        /// Starts every watcher.
        /// </summary>
        /// <param name="folders">Folders to watch for file activity.</param>
        /// <param name="mayQuoteClipboard">
        /// Asked on every clipboard change. Returning false means the clipboard's contents
        /// are never read, only the fact that it changed.
        /// </param>
        public void Start(IEnumerable<string> folders, Func<bool> mayQuoteClipboard)
        {
            if (_started) return;
            _started = true;

            _clipboard = new ClipboardWatcher(_bus, mayQuoteClipboard);
            _clipboard.Start();

            _files = new FileActivityWatcher(_bus);
            _files.Start(folders);

            _foreground = new ForegroundWatcher(_bus);
            _foreground.Start();

            _idle = new IdleWatcher(_bus);
            _idle.Start();
        }

        /// <summary>Rebuilds the file watchers after the watched-folder list is edited.</summary>
        public void UpdateWatchedFolders(IEnumerable<string> folders)
        {
            if (_files == null) return;
            _files.Start(folders);
        }

        public void Dispose()
        {
            var disposables = new List<IDisposable> { _clipboard, _files, _foreground, _idle };
            foreach (IDisposable d in disposables)
            {
                if (d == null) continue;
                try { d.Dispose(); }
                catch (Exception ex) { Diagnostics.Warn("Watcher shutdown: " + ex.Message); }
            }

            _clipboard = null;
            _files = null;
            _foreground = null;
            _idle = null;
            _started = false;
        }
    }
}
