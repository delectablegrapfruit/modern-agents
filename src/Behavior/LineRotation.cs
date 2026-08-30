using System;
using System.Collections.Generic;

namespace AgentWrangler.Behavior
{
    /// <summary>
    /// Hands out lines so that every line in a bank is used twice before any of them comes
    /// round again, and never twice in a row -- including across the join between one cycle
    /// and the next. One instance is shared by the whole roster, so two agents drawing on
    /// the same bank work through the same sequence rather than each repeating the openers.
    /// </summary>
    public sealed class LineRotation
    {
        /// <summary>Uses each line gets per cycle before the bank is reshuffled.</summary>
        public const int Appearances = 2;

        private readonly Dictionary<string, Queue<string>> _remaining =
            new Dictionary<string, Queue<string>>(StringComparer.Ordinal);

        private readonly Dictionary<string, string> _lastIssued =
            new Dictionary<string, string>(StringComparer.Ordinal);

        /// <summary>Number of banks currently part-way through a cycle.</summary>
        public int TrackedBanks { get { return _remaining.Count; } }

        public void Clear()
        {
            _remaining.Clear();
            _lastIssued.Clear();
        }

        /// <summary>
        /// Next line from a bank. With <paramref name="trueRandom"/> the pool is sampled
        /// independently every time and repeats are possible.
        /// </summary>
        public string Next(string bankKey, IList<string> pool, Random rng, bool trueRandom)
        {
            if (pool == null || pool.Count == 0) return null;
            if (trueRandom) return pool[rng.Next(pool.Count)];
            if (pool.Count == 1) return pool[0];

            Queue<string> queue;
            if (!_remaining.TryGetValue(bankKey, out queue) || queue.Count == 0)
            {
                string previous;
                _lastIssued.TryGetValue(bankKey, out previous);
                queue = new Queue<string>(BuildCycle(pool, rng, previous));
                _remaining[bankKey] = queue;
            }

            string line = queue.Dequeue();
            _lastIssued[bankKey] = line;
            return line;
        }

        /// <summary>
        /// Lays out one cycle: every line <see cref="Appearances"/> times, in a random order
        /// that never places the same line next to itself.
        ///
        /// Shuffling and then repairing collisions can fail on the last few entries, so the
        /// order is built by always taking a line with the most uses left, excluding
        /// whichever line came before it. With every count equal that always leaves a legal
        /// choice, and it keeps the two uses of a line well apart.
        /// </summary>
        internal static List<string> BuildCycle(IList<string> pool, Random rng, string previous)
        {
            int count = pool.Count;
            var left = new int[count];
            for (int i = 0; i < count; i++) left[i] = Appearances;

            var order = new List<string>(count * Appearances);
            var candidates = new List<int>();
            string last = previous;

            for (int step = 0; step < count * Appearances; step++)
            {
                candidates.Clear();
                int most = 0;

                for (int i = 0; i < count; i++)
                {
                    if (left[i] == 0) continue;
                    if (last != null && string.Equals(pool[i], last, StringComparison.Ordinal)) continue;

                    if (left[i] > most)
                    {
                        most = left[i];
                        candidates.Clear();
                        candidates.Add(i);
                    }
                    else if (left[i] == most)
                    {
                        candidates.Add(i);
                    }
                }

                if (candidates.Count == 0)
                {
                    // Only the line just used is left. Possible when a bank contains the
                    // same text more than once; repeating beats stalling.
                    for (int i = 0; i < count; i++)
                    {
                        if (left[i] > 0) { candidates.Add(i); break; }
                    }
                    if (candidates.Count == 0) break;
                }

                int chosen = candidates[rng.Next(candidates.Count)];
                left[chosen]--;
                order.Add(pool[chosen]);
                last = pool[chosen];
            }

            return order;
        }
    }
}
