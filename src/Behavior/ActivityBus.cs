using System.Collections.Generic;

namespace AgentWrangler.Behavior
{
    /// <summary>
    /// Thread-safe hand-off between the watchers (which raise events on worker threads,
    /// window-hook callbacks and FileSystemWatcher threads) and the pester engine, which
    /// runs entirely on the UI thread because the Agent control is apartment-threaded.
    /// </summary>
    public sealed class ActivityBus
    {
        /// <summary>Hard cap so a runaway watcher cannot grow the queue without bound.</summary>
        private const int MaxPending = 256;

        private readonly object _gate = new object();
        private readonly Queue<ActivityEvent> _pending = new Queue<ActivityEvent>();

        public void Publish(ActivityEvent ev)
        {
            if (ev == null) return;
            lock (_gate)
            {
                if (_pending.Count >= MaxPending) _pending.Dequeue();
                _pending.Enqueue(ev);
            }
        }

        /// <summary>Removes and returns everything queued since the last drain.</summary>
        public List<ActivityEvent> Drain()
        {
            lock (_gate)
            {
                var list = new List<ActivityEvent>(_pending);
                _pending.Clear();
                return list;
            }
        }
    }
}
