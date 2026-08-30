using System;
using System.Collections.Generic;

namespace AgentWrangler.Agents
{
    /// <summary>One installed speech voice.</summary>
    public sealed class VoiceInfo
    {
        public string Id { get; private set; }
        public string Name { get; private set; }

        public VoiceInfo(string id, string name)
        {
            Id = id;
            Name = string.IsNullOrEmpty(name) ? id : name;
        }

        public override string ToString() { return Name; }
    }

    /// <summary>
    /// Lists the speech voices installed on the machine, through SAPI's own automation
    /// object. Late-bound, so nothing has to be referenced at build time and a machine with
    /// no speech support simply reports no voices.
    /// </summary>
    public static class SapiVoices
    {
        private static List<VoiceInfo> _cached;

        public static IList<VoiceInfo> All()
        {
            if (_cached != null) return _cached;

            var voices = new List<VoiceInfo>();
            try
            {
                Type type = Type.GetTypeFromProgID("SAPI.SpVoice", false);
                if (type == null)
                {
                    Diagnostics.Info("No speech engine is installed; agents will use word balloons only.");
                    _cached = voices;
                    return _cached;
                }

                dynamic speech = Activator.CreateInstance(type);
                dynamic tokens = speech.GetVoices();
                int count = (int)tokens.Count;

                for (int i = 0; i < count; i++)
                {
                    try
                    {
                        dynamic token = tokens.Item(i);
                        var id = (string)token.Id;
                        string name;
                        try { name = (string)token.GetDescription(0); }
                        catch { name = id; }

                        if (!string.IsNullOrEmpty(id)) voices.Add(new VoiceInfo(id, name));
                    }
                    catch (Exception ex)
                    {
                        Diagnostics.Warn("Skipped a speech voice: " + ex.Message);
                    }
                }

                Diagnostics.Info("Found " + voices.Count + " speech voice(s).");
            }
            catch (Exception ex)
            {
                Diagnostics.Warn("Could not list speech voices: " + ex.Message);
            }

            _cached = voices;
            return _cached;
        }

        public static string NameFor(string id)
        {
            if (string.IsNullOrEmpty(id)) return string.Empty;
            foreach (VoiceInfo voice in All())
                if (string.Equals(voice.Id, id, StringComparison.OrdinalIgnoreCase)) return voice.Name;
            return id;
        }
    }
}
