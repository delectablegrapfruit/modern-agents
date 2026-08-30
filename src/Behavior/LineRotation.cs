using System;
using System.Collections.Generic;

namespace AgentWrangler.Behavior
{
    /// <summary>
    /// Hands out lines so a bank is exhausted before any line repeats, and shuffles again
    /// once it runs dry. One instance is shared by the whole roster, so two agents drawing
    /// on the same bank do not both open with the same greeting.
    /// </summary>
    public sealed class LineRotation
    {
        private readonly Dictionary<string, Queue<string>> _remaining =
            new Dictionary<string, Queue<string>>(StringComparer.Ordinal);

        /// <summary>Number of banks currently part-way through a cycle.</summary>
        public int TrackedBanks { get { return _remaining.Count; } }

        public void Clear()
        {
            _remaining.Clear();
        }

        /// <summary>
        /// Next line from a bank. With <paramref name="trueRandom"/> the pool is sampled
        /// independently every time and repeats are possible.
        /// </summary>
        public string Next(string bankKey, IList<string> pool, Random rng, bool trueRandom)
        {
            if (pool == null || pool.Count == 0) return null;
            if (trueRandom || pool.Count == 1) return pool[rng.Next(pool.Count)];

            Queue<string> queue;
            if (!_remaining.TryGetValue(bankKey, out queue) || queue.Count == 0)
            {
                queue = new Queue<string>(Shuffled(pool, rng));
                _remaining[bankKey] = queue;
            }

            return queue.Dequeue();
        }

        /// <summary>
        /// Fisher-Yates. The last line of the previous cycle is kept out of the first slot
        /// of the next one, so reshuffling cannot produce an immediate repeat.
        /// </summary>
        private static List<string> Shuffled(IList<string> pool, Random rng)
        {
            var order = new List<string>(pool);
            for (int i = order.Count - 1; i > 0; i--)
            {
                int j = rng.Next(i + 1);
                string swap = order[i];
                order[i] = order[j];
                order[j] = swap;
            }
            return order;
        }
    }
}
