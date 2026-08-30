using System;
using System.IO;
using AgentWrangler.Config;

namespace AgentWrangler
{
    /// <summary>
    /// The other half of <see cref="Interop.Elevation"/>: when the program is started with
    /// one of these switches it does a single file operation and exits, rather than putting
    /// up a window.
    ///
    /// This mode is deliberately narrow. It only touches files whose extension is .acs or
    /// .acf, it will not move a file out of its own folder, and it does nothing else at all.
    /// Reaching it still costs a consent prompt, so it grants no rights the caller did not
    /// already have -- but a helper that runs as administrator has no business accepting an
    /// arbitrary path either.
    /// </summary>
    internal static class ElevatedHelper
    {
        public const string DeleteSwitch = "--elevated-delete";
        public const string RenameSwitch = "--elevated-rename";

        private const int Ok = 0;
        private const int Failed = 1;
        private const int BadArguments = 2;

        public static bool IsHelperInvocation(string[] args)
        {
            if (args == null || args.Length == 0) return false;
            return args[0] == DeleteSwitch || args[0] == RenameSwitch;
        }

        public static int Run(string[] args)
        {
            SettingsStore.EnsureDataFolder();
            Diagnostics.Initialize(SettingsStore.DataFolder);

            try
            {
                switch (args[0])
                {
                    case DeleteSwitch:
                        if (args.Length != 2) return Complain("delete needs exactly one path");
                        return Delete(args[1]);

                    case RenameSwitch:
                        if (args.Length != 3) return Complain("rename needs a path and a new file name");
                        return Rename(args[1], args[2]);

                    default:
                        return Complain("unknown switch " + args[0]);
                }
            }
            catch (Exception ex)
            {
                Diagnostics.Error("Elevated helper failed.", ex);
                return Failed;
            }
        }

        private static int Delete(string path)
        {
            if (!IsCharacterFile(path)) return Complain("refusing to delete a non-character file: " + path);
            if (!File.Exists(path))
            {
                Diagnostics.Info("Elevated delete: " + path + " was already gone.");
                return Ok;
            }

            ClearReadOnly(path);
            File.Delete(path);
            Diagnostics.Info("Elevated delete: removed " + path);
            return Ok;
        }

        private static int Rename(string path, string newFileName)
        {
            if (!IsCharacterFile(path)) return Complain("refusing to rename a non-character file: " + path);
            if (!File.Exists(path)) return Complain("nothing to rename at " + path);

            // The new name is a bare file name, never a path: the helper must not be usable
            // to move a file somewhere else.
            if (newFileName != Path.GetFileName(newFileName))
                return Complain("the new name must not contain a path: " + newFileName);
            if (!IsCharacterFile(newFileName))
                return Complain("the new name must keep a character file extension: " + newFileName);

            string folder = Path.GetDirectoryName(path);
            if (string.IsNullOrEmpty(folder)) return Complain("could not determine the folder for " + path);

            string target = Path.Combine(folder, newFileName);
            if (File.Exists(target)) return Complain("something is already called " + newFileName);

            ClearReadOnly(path);
            File.Move(path, target);
            Diagnostics.Info("Elevated rename: " + path + " -> " + target);
            return Ok;
        }

        /// <summary>
        /// Characters shipped with Windows are often marked read-only. The user has already
        /// confirmed the operation and answered a consent prompt, so clear it the way
        /// Explorer does rather than failing at the last step.
        /// </summary>
        private static void ClearReadOnly(string path)
        {
            try
            {
                var attributes = File.GetAttributes(path);
                if ((attributes & FileAttributes.ReadOnly) == FileAttributes.ReadOnly)
                    File.SetAttributes(path, attributes & ~FileAttributes.ReadOnly);
            }
            catch (Exception ex)
            {
                Diagnostics.Warn("Could not clear the read-only flag on " + path + ": " + ex.Message);
            }
        }

        private static bool IsCharacterFile(string path)
        {
            if (string.IsNullOrEmpty(path)) return false;
            try
            {
                string extension = Path.GetExtension(path);
                return string.Equals(extension, ".acs", StringComparison.OrdinalIgnoreCase) ||
                       string.Equals(extension, ".acf", StringComparison.OrdinalIgnoreCase);
            }
            catch (ArgumentException)
            {
                return false;
            }
        }

        private static int Complain(string reason)
        {
            Diagnostics.Warn("Elevated helper refused: " + reason);
            return BadArguments;
        }
    }
}
