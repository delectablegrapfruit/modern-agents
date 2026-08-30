using System;
using System.Windows.Forms;
using AgentWrangler.Behavior;
using AgentWrangler.Interop;

namespace AgentWrangler.Watchers
{
    /// <summary>
    /// Reports when the user stops touching the machine and when they come back. An agent
    /// that notices you went for coffee is far more unsettling than one that only reacts
    /// to what you do.
    /// </summary>
    public sealed class IdleWatcher : IDisposable
    {
        private readonly ActivityBus _bus;
        private readonly Timer _timer;
        private bool _idle;
        private DateTime _idleSince;

        /// <summary>Seconds of no input before the user counts as away.</summary>
        public int ThresholdSeconds { get; set; }

        public IdleWatcher(ActivityBus bus)
        {
            _bus = bus;
            ThresholdSeconds = 90;
            _timer = new Timer();
            _timer.Interval = 5000;
            _timer.Tick += OnTick;
        }

        public void Start()
        {
            _timer.Start();
            Diagnostics.Info("Watching for idle time.");
        }

        private void OnTick(object sender, EventArgs e)
        {
            double idleSeconds = NativeMethods.IdleSeconds();

            if (!_idle && idleSeconds >= ThresholdSeconds)
            {
                _idle = true;
                _idleSince = DateTime.Now.AddSeconds(-idleSeconds);
                _bus.Publish(new ActivityEvent(ActivityKind.UserIdle, "away")
                    .With("minutes", Math.Max(1, (int)Math.Round(idleSeconds / 60.0)).ToString()));
            }
            else if (_idle && idleSeconds < ThresholdSeconds)
            {
                _idle = false;
                int awayMinutes = Math.Max(1, (int)Math.Round((DateTime.Now - _idleSince).TotalMinutes));
                _bus.Publish(new ActivityEvent(ActivityKind.UserReturned, "back")
                    .With("minutes", awayMinutes.ToString()));
            }
        }

        public bool IsIdle { get { return _idle; } }

        public void Dispose()
        {
            _timer.Stop();
            _timer.Dispose();
        }
    }
}
