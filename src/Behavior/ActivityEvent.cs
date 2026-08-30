using System;
using System.Collections.Generic;

namespace AgentWrangler.Behavior
{
    /// <summary>
    /// The kinds of user activity an agent can notice and comment on.
    /// Each value is independently toggleable per agent profile.
    /// </summary>
    public enum ActivityKind
    {
        ClipboardCopy,
        DownloadStarted,
        DownloadFinished,
        FileCreated,
        FileDeleted,
        FileRenamed,
        AppFocused,
        AppLaunched,
        UserIdle,
        UserReturned,
        Nag,        // spontaneous chatter with no external cause
        Summoned,   // the agent has just been shown
        Dismissed
    }

    /// <summary>
    /// Something the watchers noticed. Tokens hold the substitution values the
    /// phrasebook can splice into a line ("{file}", "{app}", ...).
    /// </summary>
    public sealed class ActivityEvent
    {
        public ActivityKind Kind { get; private set; }
        public DateTime At { get; private set; }

        /// <summary>Short human-readable subject, used for the log and for de-duplication.</summary>
        public string Subject { get; private set; }

        public IDictionary<string, string> Tokens { get; private set; }

        public ActivityEvent(ActivityKind kind, string subject)
        {
            Kind = kind;
            Subject = subject ?? string.Empty;
            At = DateTime.Now;
            Tokens = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }

        public ActivityEvent With(string token, string value)
        {
            Tokens[token] = value ?? string.Empty;
            return this;
        }

        public string Token(string name)
        {
            string v;
            return Tokens.TryGetValue(name, out v) ? v : string.Empty;
        }

        /// <summary>
        /// Key used to suppress a repeat of the same observation in quick succession
        /// (e.g. alt-tabbing back and forth between the same two windows).
        /// </summary>
        public string DedupeKey
        {
            get { return Kind.ToString() + "|" + Subject; }
        }

        public override string ToString()
        {
            return Kind + (string.IsNullOrEmpty(Subject) ? "" : ": " + Subject);
        }
    }
}
