using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace AgentWrangler.Agents
{
    /// <summary>
    /// Thin late-bound wrapper over the Microsoft Agent control, which on this machine is
    /// expected to be served by DoubleAgent running in the background.
    ///
    /// Late binding (rather than a generated interop assembly) is deliberate: it means the
    /// program builds and ships without AxInterop/Interop DLLs, and it works against
    /// whichever implementation happens to own the ProgID -- DoubleAgent, or the original
    /// Microsoft Agent on an untouched machine.
    ///
    /// Every member of this class must be called from the UI thread. The control is
    /// apartment-threaded and will marshal (or fail) unpredictably otherwise.
    /// </summary>
    public sealed class AgentServer : IDisposable
    {
        /// <summary>
        /// Tried in order. DoubleAgent registers itself under the Microsoft ProgIDs when
        /// installed as the replacement, and under its own names otherwise.
        /// </summary>
        private static readonly string[] KnownProgIds =
        {
            "Agent.Control.2",
            "Agent.Control",
            "DoubleAgent.Control.2",
            "DoubleAgent.Control",
            "DoubleAgentCtl.Control"
        };

        private object _control;
        private readonly Dictionary<string, object> _loaded =
            new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        private int _nextCharacterOrdinal = 1;

        public bool IsConnected { get { return _control != null; } }

        /// <summary>ProgID that actually worked, for the diagnostics panel.</summary>
        public string ActiveProgId { get; private set; }

        public string ActiveClsid { get; private set; }

        /// <summary>Path of the DLL/EXE registered behind the ProgID, if we can read it.</summary>
        public string ServerModulePath { get; private set; }

        /// <summary>
        /// Connects to the Agent server.
        /// </summary>
        /// <param name="preferredProgId">
        /// ProgID to try first; pass null or empty to use the built-in list.
        /// </param>
        public void Connect(string preferredProgId)
        {
            if (_control != null) return;

            var candidates = new List<string>();
            if (!string.IsNullOrEmpty(preferredProgId)) candidates.Add(preferredProgId.Trim());
            foreach (string id in KnownProgIds)
                if (!candidates.Contains(id)) candidates.Add(id);

            var failures = new List<string>();

            foreach (string progId in candidates)
            {
                Type type = Type.GetTypeFromProgID(progId, false);
                if (type == null)
                {
                    failures.Add(progId + ": not registered");
                    continue;
                }

                object instance = null;
                try
                {
                    instance = Activator.CreateInstance(type);
                    dynamic control = instance;
                    control.Connected = true;

                    _control = instance;
                    ActiveProgId = progId;
                    ActiveClsid = type.GUID.ToString("B").ToUpperInvariant();
                    ServerModulePath = LookUpServerModule(type.GUID);

                    Diagnostics.Info("Connected to Agent server via " + progId +
                                     " " + ActiveClsid +
                                     (string.IsNullOrEmpty(ServerModulePath) ? "" : " -> " + ServerModulePath));
                    return;
                }
                catch (Exception ex)
                {
                    failures.Add(progId + ": " + ex.Message);
                    if (instance != null) SafeRelease(instance);
                }
            }

            throw new AgentServerException(
                "Could not reach an Agent server. Check that DoubleAgent is installed and running." +
                Environment.NewLine + Environment.NewLine +
                "Tried:" + Environment.NewLine + "  " + string.Join(Environment.NewLine + "  ", failures.ToArray()));
        }

        /// <summary>Reads HKCR\CLSID\{clsid}\InprocServer32 (or LocalServer32) for diagnostics.</summary>
        private static string LookUpServerModule(Guid clsid)
        {
            string key = @"CLSID\" + clsid.ToString("B").ToUpperInvariant();
            foreach (string server in new[] { "InprocServer32", "LocalServer32" })
            {
                try
                {
                    using (RegistryKey k = Registry.ClassesRoot.OpenSubKey(key + "\\" + server))
                    {
                        if (k == null) continue;
                        var value = k.GetValue("") as string;
                        if (!string.IsNullOrEmpty(value)) return value.Trim('"');
                    }
                }
                catch
                {
                    // Diagnostics only.
                }
            }
            return string.Empty;
        }

        /// <summary>
        /// Loads a character file and returns the COM character object.
        /// The returned id must be passed back to <see cref="Unload"/>.
        /// </summary>
        public object Load(string characterPath, out string characterId)
        {
            if (_control == null) throw new AgentServerException("Not connected to an Agent server.");

            characterId = "AW" + _nextCharacterOrdinal++;
            dynamic control = _control;

            try
            {
                control.Characters.Load(characterId, (object)characterPath);
            }
            catch (Exception ex)
            {
                throw new AgentServerException(
                    "The Agent server refused to load " + System.IO.Path.GetFileName(characterPath) +
                    ": " + ex.Message, ex);
            }

            object character;
            try
            {
                character = control.Characters.Character(characterId);
            }
            catch (Exception ex)
            {
                // Loaded but unreachable: do not leave it stranded inside the server.
                try { control.Characters.Unload(characterId); } catch { }
                throw new AgentServerException("Loaded " + characterId + " but could not obtain it: " + ex.Message, ex);
            }

            _loaded[characterId] = character;
            return character;
        }

        public void Unload(string characterId)
        {
            if (_control == null || string.IsNullOrEmpty(characterId)) return;
            try
            {
                dynamic control = _control;
                control.Characters.Unload(characterId);
            }
            catch (Exception ex)
            {
                Diagnostics.Warn("Unload of " + characterId + " failed: " + ex.Message);
            }
            finally
            {
                object character;
                if (_loaded.TryGetValue(characterId, out character))
                {
                    _loaded.Remove(characterId);
                    SafeRelease(character);
                }
            }
        }

        /// <summary>Character ids currently loaded in the server by this program.</summary>
        public ICollection<string> LoadedIds { get { return _loaded.Keys; } }

        private static void SafeRelease(object comObject)
        {
            try
            {
                if (comObject != null && Marshal.IsComObject(comObject))
                    Marshal.ReleaseComObject(comObject);
            }
            catch
            {
                // Releasing is best-effort during teardown.
            }
        }

        /// <summary>
        /// Unloads everything and lets go of the server. The object stays usable: calling
        /// <see cref="Connect"/> again establishes a fresh connection, which is what
        /// changing the ProgID needs.
        /// </summary>
        public void Disconnect()
        {
            if (_control == null) return;

            foreach (string id in new List<string>(_loaded.Keys)) Unload(id);

            try
            {
                dynamic control = _control;
                control.Connected = false;
            }
            catch (Exception ex)
            {
                Diagnostics.Warn("Disconnect failed: " + ex.Message);
            }

            SafeRelease(_control);
            _control = null;
            ActiveProgId = null;
            ActiveClsid = null;
            ServerModulePath = null;
            Diagnostics.Info("Disconnected from Agent server.");
        }

        public void Dispose()
        {
            Disconnect();
        }
    }

    public class AgentServerException : Exception
    {
        public AgentServerException(string message) : base(message) { }
        public AgentServerException(string message, Exception inner) : base(message, inner) { }
    }
}
