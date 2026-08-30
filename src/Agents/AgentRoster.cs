using System;
using System.Collections.Generic;
using AgentWrangler.Config;
using AgentWrangler.Library;

namespace AgentWrangler.Agents
{
    /// <summary>
    /// The set of agents currently loaded and on screen. Several characters can be active
    /// at once; each one is driven by its own <see cref="AgentProfile"/> and keeps its own
    /// timers, so two agents summoned from the same character file still behave differently.
    /// </summary>
    public sealed class AgentRoster : IDisposable
    {
        private readonly AgentServer _server;
        private readonly List<LiveAgent> _agents = new List<LiveAgent>();
        private readonly System.Collections.ObjectModel.ReadOnlyCollection<LiveAgent> _readOnlyAgents;

        public AgentRoster(AgentServer server)
        {
            if (server == null) throw new ArgumentNullException("server");
            _server = server;
            _readOnlyAgents = _agents.AsReadOnly();
        }

        public event EventHandler RosterChanged;

        public IList<LiveAgent> Agents { get { return _readOnlyAgents; } }
        public int Count { get { return _agents.Count; } }
        public AgentServer Server { get { return _server; } }

        public LiveAgent Find(string profileId)
        {
            if (string.IsNullOrEmpty(profileId)) return null;
            foreach (LiveAgent agent in _agents)
                if (string.Equals(agent.Profile.Id, profileId, StringComparison.OrdinalIgnoreCase))
                    return agent;
            return null;
        }

        public bool IsActive(string profileId)
        {
            return Find(profileId) != null;
        }

        /// <summary>
        /// Loads the profile's character and puts it on screen. Returns the existing agent
        /// if this profile is already active.
        /// </summary>
        /// <param name="known">Cached probe result, used for the animation list. May be null.</param>
        public LiveAgent Summon(AgentProfile profile, CharacterFileInfo known)
        {
            if (profile == null) throw new ArgumentNullException("profile");

            LiveAgent existing = Find(profile.Id);
            if (existing != null) return existing;

            if (string.IsNullOrEmpty(profile.CharacterPath) || !System.IO.File.Exists(profile.CharacterPath))
                throw new AgentServerException("Character file is missing: " + profile.CharacterPath);

            string characterId;
            object character = _server.Load(profile.CharacterPath, out characterId);

            var agent = new LiveAgent(profile, characterId, character,
                                      known != null ? known.Animations : null);

            // A character with no cached probe still needs an animation list, otherwise
            // Play() would have nothing to validate against and would refuse everything.
            if (agent.Animations.Count == 0)
            {
                foreach (string name in ReadAnimationNames(character)) agent.Animations.Add(name);
            }

            agent.NativeSize = agent.ReadSize();
            agent.SetSoundEffects(profile.SpeakAloud);
            agent.ApplyVoice(profile.VoiceId);
            if (profile.ClampedSizePercent != 100) agent.ApplyScale(profile.ClampedSizePercent);
            agent.Show();

            if (known != null && known.NativeWidth == 0 && !agent.NativeSize.IsEmpty)
            {
                known.NativeWidth = agent.NativeSize.Width;
                known.NativeHeight = agent.NativeSize.Height;
            }

            _agents.Add(agent);
            Diagnostics.Info("Summoned " + agent.Name + " as " + characterId +
                             " (" + agent.Animations.Count + " animations).");
            RaiseChanged();
            return agent;
        }

        /// <summary>
        /// Asks a loaded character for its animation names. Not every implementation
        /// exposes the collection, so failure here is normal and non-fatal.
        /// </summary>
        public static List<string> ReadAnimationNames(object character)
        {
            var names = new List<string>();
            try
            {
                dynamic ch = character;
                // Cast to IEnumerable so the COM interop layer handles _NewEnum, rather
                // than asking the C# dynamic binder to find a GetEnumerator on a
                // dispatch-only object.
                var collection = (System.Collections.IEnumerable)ch.AnimationNames;
                foreach (object item in collection)
                {
                    string name = item as string;
                    if (!string.IsNullOrEmpty(name)) names.Add(name);
                }
            }
            catch (Exception ex)
            {
                Diagnostics.Warn("Could not read animation names: " + ex.Message);
            }
            return names;
        }

        public void Dismiss(string profileId)
        {
            LiveAgent agent = Find(profileId);
            if (agent == null) return;

            try { agent.Hide(); }
            catch (Exception ex) { Diagnostics.Warn("Hide during dismiss failed: " + ex.Message); }

            _server.Unload(agent.CharacterId);
            _agents.Remove(agent);
            Diagnostics.Info("Dismissed " + agent.Name + ".");
            RaiseChanged();
        }

        public void DismissAll()
        {
            foreach (LiveAgent agent in new List<LiveAgent>(_agents))
                Dismiss(agent.Profile.Id);
        }

        /// <summary>Panic button: everyone off screen, but still loaded and instantly restorable.</summary>
        public void HideAll()
        {
            foreach (LiveAgent agent in _agents) agent.Hide();
        }

        public void ShowAll()
        {
            foreach (LiveAgent agent in _agents) agent.Show();
        }

        /// <summary>Drops agents whose COM object has stopped responding.</summary>
        public void RetireFaulted()
        {
            List<LiveAgent> dead = null;
            foreach (LiveAgent agent in _agents)
            {
                if (agent.Faulted)
                {
                    if (dead == null) dead = new List<LiveAgent>();
                    dead.Add(agent);
                }
            }
            if (dead == null) return;

            foreach (LiveAgent agent in dead)
            {
                Diagnostics.Warn("Retiring " + agent.Name + ": too many failed calls to the Agent server.");
                _server.Unload(agent.CharacterId);
                _agents.Remove(agent);
            }
            RaiseChanged();
        }

        private void RaiseChanged()
        {
            EventHandler handler = RosterChanged;
            if (handler != null) handler(this, EventArgs.Empty);
        }

        public void Dispose()
        {
            DismissAll();
        }
    }
}
