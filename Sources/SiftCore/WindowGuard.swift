import Foundation

/// Finder keeps a window's view while it browses into folders without a view of
/// their own. The guard watches Finder's windows and, whenever one shows a new
/// folder, sets the view that folder should have: its folder view, the folder
/// view above it, or the default. Finder's habit of saving a view as you adjust
/// it thus lasts exactly until you leave the folder.
///
/// Finder is scripted from a separate `osascript` process, never from Sift's
/// own threads: a Finder busy with a deletion can hold an Apple event for a
/// long time, and that must never hold Sift's window or menu bar. Every script
/// carries its own timeout, and the process is killed if it outlives it.
public enum WindowGuard {
    public struct Window: Hashable {
        public let id: Int
        public let path: String

        public init(id: Int, path: String) {
            self.id = id
            self.path = Paths.standardize(path)
        }
    }

    /// Seconds Finder gets to answer one script.
    public static let scriptTimeout = 3

    /// Every Finder window as "id posix-path", one per line. Windows on things
    /// that are not folders (Recents, AirDrop, the Trash) are left out.
    ///
    /// The id is fetched into a variable before it is coerced: inside a `tell`
    /// block AppleScript folds `(id of w) as text` into the request itself, and
    /// Finder answers that with "Unknown object type".
    public static let listScript = """
    with timeout of \(scriptTimeout) seconds
    set out to {}
    tell application "Finder"
    repeat with w in (every Finder window)
    set i to id of w
    try
    set p to POSIX path of ((target of w) as alias)
    set end of out to (i as text) & " " & p
    end try
    end repeat
    end tell
    set AppleScript's text item delimiters to linefeed
    return out as text
    end timeout
    """

    public static func parse(_ output: String) -> [Window] {
        output.split(separator: "\n", omittingEmptySubsequences: true).compactMap { line in
            let parts = line.split(separator: " ", maxSplits: 1).map(String.init)
            guard parts.count == 2, let id = Int(parts[0]), parts[1].hasPrefix("/") else { return nil }
            return Window(id: id, path: parts[1])
        }
    }

    /// Finder's name for a mode. Gallery view is "flow view" in Finder's
    /// dictionary (the name of the view it replaced); "gallery view" does not compile.
    static func viewName(_ mode: ViewMode) -> String {
        switch mode {
        case .icons: return "icon view"
        case .list: return "list view"
        case .columns: return "column view"
        case .gallery: return "flow view"
        }
    }

    static func arrangement(_ key: SortKey) -> String {
        switch key {
        case .name, .dateAdded: return "arranged by name"
        case .dateModified: return "arranged by modification date"
        case .dateCreated: return "arranged by creation date"
        case .size: return "arranged by size"
        case .kind: return "arranged by kind"
        }
    }

    static func column(_ key: SortKey) -> String {
        switch key {
        case .name, .dateAdded: return "name column"
        case .dateModified: return "modification date column"
        case .dateCreated: return "creation date column"
        case .size: return "size column"
        case .kind: return "kind column"
        }
    }

    /// The script that gives one window a view. Each option is set on its own
    /// so one Finder does not know about does not stop the rest.
    public static func applyScript(windowID: Int, view: FinderView) -> String {
        var lines = ["with timeout of \(scriptTimeout) seconds", "tell application \"Finder\"",
                     "set w to Finder window id \(windowID)",
                     "set current view of w to \(viewName(view.mode))"]
        func option(_ property: String, _ value: String) {
            lines += ["try", "set \(property) of o to \(value)", "end try"]
        }
        let o = view.options
        switch view.mode {
        case .icons:
            lines.append("set o to icon view options of w")
            option("arrangement", arrangement(view.sortKey))
            option("icon size", "\(Int(o.icon.iconSize))")
            option("text size", "\(Int(o.icon.textSize))")
            option("label position", o.icon.labelOnBottom ? "bottom" : "right")
            option("shows item info", "\(o.icon.showItemInfo)")
            option("shows icon preview", "\(o.icon.showIconPreview)")
        case .list:
            lines.append("set o to list view options of w")
            option("sort column", column(view.sortKey))
            option("sort direction of sort column", view.ascending ? "normal" : "reversed")
            option("icon size", o.list.largeIcons ? "large icon" : "small icon")
            option("text size", "\(Int(o.list.textSize))")
            option("uses relative dates", "\(o.list.relativeDates)")
            option("calculates folder sizes", "\(o.list.calculateAllSizes)")
            option("shows icon preview", "\(o.list.showIconPreview)")
        case .columns:
            lines.append("set o to column view options of w")
            option("text size", "\(Int(o.column.textSize))")
            option("shows icon", "\(o.column.showIcons)")
            option("shows icon preview", "\(o.column.showIconPreview)")
            option("shows preview column", "\(o.column.showPreviewColumn)")
        case .gallery:
            break
        }
        lines += ["end tell", "end timeout"]
        return lines.joined(separator: "\n")
    }

    /// Quits Finder the way the Quit menu item would. Finder then stays quit
    /// (launchd brings it back only after a crash or a signal), so what is
    /// written meanwhile is read when it is started again.
    public static let quitScript = """
    with timeout of 10 seconds
    tell application "Finder" to quit
    end timeout
    """

    /// Remembers where each window was, so only windows that moved are acted on.
    public struct Tracker {
        private var known: [Int: String] = [:]

        public init() {}

        /// Windows that are new or now show a different folder; forgets closed windows.
        public mutating func moved(_ windows: [Window]) -> [Window] {
            var next: [Int: String] = [:]
            var out: [Window] = []
            for window in windows {
                next[window.id] = window.path
                if known[window.id] != window.path { out.append(window) }
            }
            known = next
            return out
        }

        /// The window will count as moved next time (its view could not be set).
        public mutating func forget(_ id: Int) { known[id] = nil }

        public mutating func reset() { known = [:] }
    }

    public enum ScriptError: Error, LocalizedError, Equatable {
        case notAllowed
        case timedOut
        case failed(String)

        public var errorDescription: String? {
            switch self {
            case .notAllowed: return "Sift is not allowed to control Finder. Allow it under System Settings → Privacy & Security → Automation."
            case .timedOut: return "Finder did not answer in time."
            case .failed(let message): return "Finder did not apply the view: \(message)"
            }
        }
    }

    /// The AppleScript error number at the end of an osascript complaint, "… (-1743)".
    static func errorNumber(in message: String) -> Int? {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasSuffix(")"), let open = trimmed.lastIndex(of: "(") else { return nil }
        return Int(trimmed[trimmed.index(after: open)..<trimmed.index(before: trimmed.endIndex)])
    }

    static func error(_ message: String) -> ScriptError {
        switch errorNumber(in: message) {
        case -1743: return .notAllowed
        case -1712: return .timedOut
        default: return .failed(message.trimmingCharacters(in: .whitespacesAndNewlines))
        }
    }

    #if os(macOS)
    /// Runs AppleScript in a child `osascript` process. Any thread; blocks the
    /// caller for at most a little over the script's timeout.
    public enum OSAScript {
        /// Returns the script's result as osascript prints it.
        public static func run(_ source: String, killAfter seconds: TimeInterval = TimeInterval(scriptTimeout) + 3) throws -> String {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            process.arguments = []  // no file: the script comes on standard input
            let input = Pipe(), output = Pipe(), errors = Pipe()
            process.standardInput = input
            process.standardOutput = output
            process.standardError = errors
            try process.run()
            input.fileHandleForWriting.write(Data(source.utf8))
            try? input.fileHandleForWriting.close()
            let killer = DispatchWorkItem { if process.isRunning { kill(process.processIdentifier, SIGKILL) } }
            DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + seconds, execute: killer)
            let out = output.fileHandleForReading.readDataToEndOfFile()
            let err = errors.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            killer.cancel()
            if process.terminationReason == .uncaughtSignal { throw ScriptError.timedOut }
            guard process.terminationStatus == 0 else {
                throw WindowGuard.error(String(decoding: err, as: UTF8.self))
            }
            return String(decoding: out, as: UTF8.self)
        }
    }

    /// Talks to Finder. Safe from any thread.
    public final class Session {
        public init() {}

        public func windows() throws -> [Window] {
            WindowGuard.parse(try OSAScript.run(WindowGuard.listScript))
        }

        public func apply(_ view: FinderView, to windowID: Int) throws {
            _ = try OSAScript.run(WindowGuard.applyScript(windowID: windowID, view: view))
        }

        public func quitFinder() throws {
            _ = try OSAScript.run(WindowGuard.quitScript, killAfter: 12)
        }
    }
    #endif
}
