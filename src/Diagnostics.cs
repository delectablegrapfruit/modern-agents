using System;
using System.Collections.Generic;
using System.IO;

namespace AgentWrangler
{
    /// <summary>
    /// Small append-only log. Everything the agents say and every problem talking to the
    /// Agent server lands here, so a user can work out why a character will not load
    /// without attaching a debugger.
    /// </summary>
    public static class Diagnostics
    {
        private const int MaxMemoryLines = 500;

        private static readonly object Gate = new object();
        private static readonly Queue<string> Recent = new Queue<string>();
        private static string _logPath;

        public static void Initialize(string dataFolder)
        {
            try
            {
                Directory.CreateDirectory(dataFolder);
                _logPath = Path.Combine(dataFolder, "agentwrangler.log");

                // Keep the log from growing forever across many sessions.
                var info = new FileInfo(_logPath);
                if (info.Exists && info.Length > 512 * 1024)
                {
                    string old = _logPath + ".1";
                    if (File.Exists(old)) File.Delete(old);
                    File.Move(_logPath, old);
                }
            }
            catch
            {
                _logPath = null; // logging to disk is optional
            }
        }

        public static void Info(string message) { Write("INFO", message); }
        public static void Warn(string message) { Write("WARN", message); }

        public static void Error(string message, Exception ex)
        {
            Write("ERR ", ex == null ? message : message + " -- " + ex.GetType().Name + ": " + ex.Message);
        }

        private static void Write(string level, string message)
        {
            string line = DateTime.Now.ToString("HH:mm:ss") + " " + level + " " + message;
            lock (Gate)
            {
                Recent.Enqueue(line);
                while (Recent.Count > MaxMemoryLines) Recent.Dequeue();
                if (_logPath != null)
                {
                    try { File.AppendAllText(_logPath, line + Environment.NewLine); }
                    catch { }
                }
            }
        }

        public static string[] Snapshot()
        {
            lock (Gate) { return Recent.ToArray(); }
        }

        public static string LogPath { get { return _logPath; } }
    }
}
