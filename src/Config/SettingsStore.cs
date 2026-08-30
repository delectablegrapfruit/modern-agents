using System;
using System.IO;
using System.Xml;
using System.Xml.Serialization;

namespace AgentWrangler.Config
{
    /// <summary>Loads and saves <see cref="AppSettings"/> under %APPDATA%\AgentWrangler.</summary>
    public static class SettingsStore
    {
        public const string AppFolderName = "AgentWrangler";

        public static string DataFolder
        {
            get
            {
                string root = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                return Path.Combine(root, AppFolderName);
            }
        }

        public static string SettingsPath
        {
            get { return Path.Combine(DataFolder, "settings.xml"); }
        }

        public static string PhrasebookPath
        {
            get { return Path.Combine(DataFolder, "phrasebook.xml"); }
        }

        public static void EnsureDataFolder()
        {
            Directory.CreateDirectory(DataFolder);
        }

        public static AppSettings Load()
        {
            try
            {
                if (!File.Exists(SettingsPath)) return null;
                var serializer = new XmlSerializer(typeof(AppSettings));
                using (var stream = File.OpenRead(SettingsPath))
                {
                    return (AppSettings)serializer.Deserialize(stream);
                }
            }
            catch (Exception ex)
            {
                // A corrupt settings file should never stop the app from starting. Move it
                // aside so the next save starts clean and the old one is still recoverable.
                try
                {
                    string spoiled = SettingsPath + ".bad-" + DateTime.Now.ToString("yyyyMMdd-HHmmss");
                    if (File.Exists(SettingsPath)) File.Move(SettingsPath, spoiled);
                }
                catch { }
                Diagnostics.Warn("Could not read settings: " + ex.Message);
                return null;
            }
        }

        public static void Save(AppSettings settings)
        {
            if (settings == null) return;
            EnsureDataFolder();

            // Write to a temporary file first so a crash mid-write cannot truncate the
            // real settings file.
            string temp = SettingsPath + ".tmp";
            var serializer = new XmlSerializer(typeof(AppSettings));
            var xmlSettings = new XmlWriterSettings { Indent = true, IndentChars = "  " };

            using (var writer = XmlWriter.Create(temp, xmlSettings))
            {
                serializer.Serialize(writer, settings);
            }

            if (File.Exists(SettingsPath)) File.Delete(SettingsPath);
            File.Move(temp, SettingsPath);
        }
    }
}
