using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Xml;
using System.Xml.Serialization;
using AgentWrangler.Config;

namespace AgentWrangler.Behavior
{
    /// <summary>
    /// Things an agent can offer to do for you. Deliberately a short, closed list of
    /// harmless actions: an agent that pesters you every few seconds must never be one
    /// keystroke away from running a file you just downloaded.
    /// </summary>
    public enum AssistAction
    {
        None,
        OpenFolder,      // open the containing folder in Explorer, with the file selected
        CopyName,        // put the file's name on the clipboard
        Tip,             // deliver an unsolicited "helpful" tip
        Compliment,      // say something nice, do nothing
        Reposition,      // move itself somewhere else on screen
        CheckBackLater   // promise to return, and schedule itself to do exactly that
    }

    /// <summary>One bank of interchangeable lines for a given activity and persona.</summary>
    public class PhraseBank
    {
        [XmlAttribute("Kind")]
        public ActivityKind Kind { get; set; }

        /// <summary>A <see cref="Persona"/> name, or "Any" to make the bank shared.</summary>
        [XmlAttribute("Persona")]
        public string Persona { get; set; }

        [XmlElement("Line")]
        public List<string> Lines { get; set; }

        public PhraseBank()
        {
            Persona = "Any";
            Lines = new List<string>();
        }
    }

    /// <summary>A prompt the agent can pop up, and what it says either way.</summary>
    public class AssistOffer
    {
        [XmlAttribute("Kind")]
        public ActivityKind Kind { get; set; }

        [XmlAttribute("Persona")]
        public string Persona { get; set; }

        [XmlAttribute("Action")]
        public AssistAction Action { get; set; }

        public string Ask { get; set; }
        public string Accepted { get; set; }
        public string Declined { get; set; }

        public AssistOffer()
        {
            Persona = "Any";
            Ask = string.Empty;
            Accepted = string.Empty;
            Declined = string.Empty;
        }
    }

    /// <summary>
    /// Every line the agents can say, loaded from an XML file the user is free to edit.
    /// A missing or broken file falls back to the built-in defaults, so the program always
    /// has something to say.
    /// </summary>
    [XmlRoot("Phrasebook")]
    public class Phrasebook
    {
        private static readonly Dictionary<string, string> GenericFillers =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                { "file", "that file" },
                { "app", "that program" },
                { "clip", "that" },
                { "folder", "that folder" },
                { "ext", "mystery" },
                { "doc", "whatever that is" },
                { "minutes", "a few" },
                { "oldfile", "the old one" },
                { "kind", "something" },
                { "path", "somewhere" },
                { "title", "that window" },
                { "process", "something" }
            };

        [XmlElement("Bank")]
        public List<PhraseBank> Banks { get; set; }

        [XmlElement("Offer")]
        public List<AssistOffer> Offers { get; set; }

        public Phrasebook()
        {
            Banks = new List<PhraseBank>();
            Offers = new List<AssistOffer>();
        }

        // ---- selection -------------------------------------------------------------

        /// <summary>
        /// The lines available for an activity and personality. Persona-specific banks win
        /// outright; the shared "Any" banks are the fallback. Empty means nothing to say.
        /// </summary>
        public IList<string> Pool(ActivityKind kind, Persona persona, out string bankKey)
        {
            List<string> specific = null;
            List<string> shared = null;

            foreach (PhraseBank bank in Banks)
            {
                if (bank == null || bank.Kind != kind || bank.Lines == null || bank.Lines.Count == 0)
                    continue;

                if (IsAny(bank.Persona))
                {
                    if (shared == null) shared = new List<string>();
                    shared.AddRange(bank.Lines);
                }
                else if (Matches(bank.Persona, persona))
                {
                    if (specific == null) specific = new List<string>();
                    specific.AddRange(bank.Lines);
                }
            }

            if (specific != null && specific.Count > 0)
            {
                bankKey = kind + "|" + persona;
                return specific;
            }

            bankKey = kind + "|Any";
            return shared ?? EmptyPool;
        }

        private static readonly List<string> EmptyPool = new List<string>();

        /// <summary>
        /// Picks a line, cycling through the bank so none repeats until all have been used.
        /// Pass a null rotation, or trueRandom, to sample independently instead.
        /// </summary>
        public string PickLine(ActivityKind kind, Persona persona, Random rng,
                               LineRotation rotation, bool trueRandom)
        {
            string bankKey;
            IList<string> pool = Pool(kind, persona, out bankKey);
            if (pool.Count == 0) return null;

            if (rotation == null || trueRandom) return pool[rng.Next(pool.Count)];
            return rotation.Next(bankKey, pool, rng, false);
        }

        public string PickLine(ActivityKind kind, Persona persona, Random rng)
        {
            return PickLine(kind, persona, rng, null, true);
        }

        public AssistOffer PickOffer(ActivityKind kind, Persona persona, Random rng)
        {
            var specific = new List<AssistOffer>();
            var shared = new List<AssistOffer>();

            foreach (AssistOffer offer in Offers)
            {
                if (offer == null || offer.Kind != kind || string.IsNullOrEmpty(offer.Ask)) continue;

                if (IsAny(offer.Persona)) shared.Add(offer);
                else if (Matches(offer.Persona, persona)) specific.Add(offer);
            }

            List<AssistOffer> pool = specific.Count > 0 ? specific : shared;
            if (pool.Count == 0) return null;
            return pool[rng.Next(pool.Count)];
        }

        private static bool IsAny(string persona)
        {
            return string.IsNullOrEmpty(persona) ||
                   string.Equals(persona, "Any", StringComparison.OrdinalIgnoreCase);
        }

        private static bool Matches(string personaName, Persona persona)
        {
            return string.Equals(personaName, persona.ToString(), StringComparison.OrdinalIgnoreCase);
        }

        // ---- token substitution ----------------------------------------------------

        /// <summary>
        /// Replaces {token} placeholders with values from the activity, falling back to a
        /// vague filler when a watcher could not supply one. A line is never left with a
        /// literal "{file}" showing in the word balloon.
        /// </summary>
        public static string Format(string template, ActivityEvent ev, string agentName, int lineNumber)
        {
            if (string.IsNullOrEmpty(template)) return string.Empty;
            if (template.IndexOf('{') < 0) return template;

            var result = new StringBuilder(template.Length + 32);
            int i = 0;

            while (i < template.Length)
            {
                char c = template[i];
                if (c != '{') { result.Append(c); i++; continue; }

                int close = template.IndexOf('}', i + 1);
                if (close < 0) { result.Append(template, i, template.Length - i); break; }

                string token = template.Substring(i + 1, close - i - 1);
                result.Append(Resolve(token, ev, agentName, lineNumber));
                i = close + 1;
            }

            return result.ToString();
        }

        private static string Resolve(string token, ActivityEvent ev, string agentName, int lineNumber)
        {
            switch (token.ToLowerInvariant())
            {
                case "agent":
                    return string.IsNullOrEmpty(agentName) ? "your assistant" : agentName;
                case "user":
                    return SafeUserName();
                case "time":
                    return DateTime.Now.ToShortTimeString();
                case "count":
                    return lineNumber.ToString();
            }

            string value = ev != null ? ev.Token(token) : string.Empty;
            if (!string.IsNullOrEmpty(value)) return value;

            string filler;
            return GenericFillers.TryGetValue(token, out filler) ? filler : "something";
        }

        private static string SafeUserName()
        {
            try
            {
                string name = Environment.UserName;
                return string.IsNullOrEmpty(name) ? "friend" : name;
            }
            catch { return "friend"; }
        }

        // ---- persistence -----------------------------------------------------------

        /// <summary>
        /// Loads the user's phrasebook, writing out the built-in one the first time.
        /// Never throws: a phrasebook the user has broken falls back to the defaults.
        /// </summary>
        public static Phrasebook LoadOrCreate(string path)
        {
            try
            {
                if (File.Exists(path))
                {
                    var serializer = new XmlSerializer(typeof(Phrasebook));
                    using (var stream = File.OpenRead(path))
                    {
                        var loaded = (Phrasebook)serializer.Deserialize(stream);
                        if (loaded != null && loaded.Banks != null && loaded.Banks.Count > 0)
                        {
                            Diagnostics.Info("Loaded phrasebook with " + loaded.Banks.Count +
                                             " bank(s) and " + loaded.Offers.Count + " offer(s).");
                            return loaded;
                        }
                        Diagnostics.Warn("Phrasebook was empty; using the built-in lines.");
                    }
                }
                else
                {
                    Phrasebook fresh = DefaultPhrasebook.Build();
                    Save(fresh, path);
                    Diagnostics.Info("Wrote a starter phrasebook to " + path);
                    return fresh;
                }
            }
            catch (Exception ex)
            {
                Diagnostics.Error("Phrasebook could not be read; using the built-in lines.", ex);
            }

            return DefaultPhrasebook.Build();
        }

        public static void Save(Phrasebook phrasebook, string path)
        {
            string folder = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(folder)) Directory.CreateDirectory(folder);

            var serializer = new XmlSerializer(typeof(Phrasebook));
            var settings = new XmlWriterSettings { Indent = true, IndentChars = "  " };
            using (var writer = XmlWriter.Create(path, settings))
            {
                serializer.Serialize(writer, phrasebook);
            }
        }
    }
}
