import Foundation

/// Finder keeps a window's view while it browses into folders without a view of
/// their own. The guard watches Finder's windows and, whenever one shows a new
/// folder, sets the view that folder should have: its folder view, the folder
/// view above it, or the default. Finder's habit of saving a view as you adjust
/// it thus lasts exactly until you leave the folder.
///
/// One script does the whole look: it carries the rules (folder views, longest
/// path first, then the default) and the windows already seen, lists Finder's
/// windows, and gives every window that moved its view right there. Finder is
/// scripted from a separate `osascript` process, never from Sift's own
/// threads: a Finder busy with a deletion can hold an Apple event for a long
/// time, and that must never hold Sift's window or menu bar. Every script
/// carries its own timeout, and the process is killed if it outlives it.
public enum WindowGuard {
    public struct Window: Hashable {
        public let id: Int
        public let path: String
        /// "id path" exactly as the script wrote it; handed back so the script knows it.
        public let raw: String

        public init(id: Int, path: String) {
            self.id = id
            self.path = Paths.standardize(path)
            raw = "\(id) \(path)"
        }
    }

    /// A folder view as the script matches it: paths inside `prefix` get `view`.
    /// The default rule has an empty prefix and comes last.
    public struct Rule: Hashable {
        public let prefix: String
        public let view: FinderView
        public let owner: String?

        public var label: String { view.mode.label + (owner == nil ? " (default)" : "") }
    }

    /// Folder views longest path first, then the default: the first match is
    /// the nearest folder view above a path, as `ViewSettings.view(for:)` decides.
    public static func rules(_ settings: ViewSettings) -> [Rule] {
        let custom = settings.folders
            .sorted { ($0.path.count, $0.path) > ($1.path.count, $1.path) }
            .map { Rule(prefix: Paths.standardize($0.path), view: $0.view, owner: $0.path) }
        return custom + [Rule(prefix: "", view: settings.default, owner: nil)]
    }

    public struct Applied: Hashable {
        public let window: Window
        public let rule: Int
    }

    public struct Failure: Hashable {
        public let id: Int
        public let number: Int
        public let path: String
        public let message: String
    }

    /// What one look found: every window on a folder, those given a view, and
    /// those that refused. A window that refused is not in `windows`.
    public struct Report: Hashable {
        public var windows: [Window] = []
        public var applied: [Applied] = []
        public var failures: [Failure] = []

        public init() {}
    }

    /// Seconds Finder gets to answer one request.
    public static let scriptTimeout = 3

    /// A string as AppleScript source. Plain ASCII is quoted; anything else is
    /// built from code points, so the script stays ASCII whatever osascript
    /// assumes about its input.
    static func literal(_ string: String) -> String {
        if string.unicodeScalars.allSatisfy({ $0.isASCII && $0.value >= 0x20 && $0.value < 0x7F }) {
            return "\"" + string.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
        }
        return "(string id {" + string.unicodeScalars.map { String($0.value) }.joined(separator: ", ") + "})"
    }

    /// The script for one look. Output, one line per window:
    ///   `= id path`         seen before, left alone
    ///   `+ rule id path`    moved: given the view of rule `rule`
    ///   `! id number path<TAB>message`  moved, but Finder refused
    /// Windows on things that are not folders (Recents, AirDrop, the Trash) are
    /// left out. The ids come in one request; each window is then addressed by
    /// id, so one that closes meanwhile only drops out of this look.
    public static func lookScript(rules: [Rule], known: [String]) -> String {
        var lines = [
            "with timeout of \(scriptTimeout) seconds",
            "set nl to linefeed",
            "set sep to tab",
            "set known to {" + known.map(literal).joined(separator: ", ") + "}",
            "set out to {}",
            "considering case",
            "tell application \"Finder\"",
            "set ids to id of every Finder window",
            "repeat with k from 1 to count of ids",
            "set n to item k of ids",
            "set p to \"\"",
            "try",
            "set p to POSIX path of ((target of Finder window id n) as alias)",
            "end try",
            "if p is not \"\" then",
            "if p does not end with \"/\" then set p to p & \"/\"",
            "set entry to (n as text) & \" \" & p",
            "if known contains entry then",
            "set end of out to \"= \" & entry",
            "else",
            "try",
            "set w to Finder window id n",
        ]
        for (index, rule) in rules.enumerated() {
            if rule.prefix.isEmpty {
                lines.append(index == 0 ? "if true then" : "else")
            } else {
                let prefix = rule.prefix == "/" ? "/" : rule.prefix + "/"
                lines.append((index == 0 ? "if" : "else if") + " p starts with \(literal(prefix)) then")
            }
            lines += viewLines(rule.view)
            lines.append("set end of out to \"+ \(index) \" & entry")
        }
        lines += [
            "end if",
            "on error msg number num",
            "set end of out to \"! \" & (n as text) & \" \" & (num as text) & \" \" & p & sep & msg",
            "end try",
            "end if",
            "end if",
            "end repeat",
            "end tell",
            "end considering",
            "set AppleScript's text item delimiters to nl",
            "return out as text",
            "end timeout",
        ]
        return lines.joined(separator: "\n")
    }

    public static func parse(_ output: String) -> Report {
        var report = Report()
        for line in output.split(separator: "\n", omittingEmptySubsequences: true) {
            let parts = line.split(separator: " ", maxSplits: 3, omittingEmptySubsequences: false).map(String.init)
            switch parts.first {
            case "=":
                guard parts.count >= 3, let id = Int(parts[1]) else { continue }
                let path = parts.dropFirst(2).joined(separator: " ")
                guard path.hasPrefix("/") else { continue }
                report.windows.append(Window(id: id, path: path))
            case "+":
                guard parts.count == 4, let rule = Int(parts[1]), let id = Int(parts[2]), parts[3].hasPrefix("/") else { continue }
                let window = Window(id: id, path: parts[3])
                report.windows.append(window)
                report.applied.append(Applied(window: window, rule: rule))
            case "!":
                guard parts.count == 4, let id = Int(parts[1]), let number = Int(parts[2]) else { continue }
                let rest = parts[3].split(separator: "\t", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
                report.failures.append(Failure(id: id, number: number, path: Paths.standardize(rest[0]),
                                               message: rest.count > 1 ? rest[1] : ""))
            default:
                continue
            }
        }
        return report
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

    /// Finder's dictionary has no term for Date Added: that sort is left to the
    /// preferences and the folder record, which do know it.
    static func arrangement(_ key: SortKey) -> String? {
        switch key {
        case .name: return "arranged by name"
        case .dateModified: return "arranged by modification date"
        case .dateCreated: return "arranged by creation date"
        case .size: return "arranged by size"
        case .kind: return "arranged by kind"
        case .dateAdded: return nil
        }
    }

    static func column(_ key: SortKey) -> String? {
        switch key {
        case .name: return "name column"
        case .dateModified: return "modification date column"
        case .dateCreated: return "creation date column"
        case .size: return "size column"
        case .kind: return "kind column"
        case .dateAdded: return nil
        }
    }

    /// Lines that give window `w` a view. Mode and options are set only when
    /// they differ: Finder records every change in a `.DS_Store`, and a window
    /// keeps the last folder's options when the mode is the same. Each option
    /// is set on its own so one Finder does not know about does not stop the rest.
    public static func viewLines(_ view: FinderView) -> [String] {
        let name = viewName(view.mode)
        var lines = ["if current view of w is not \(name) then set current view of w to \(name)"]
        func option(_ property: String, _ value: String?) {
            guard let value else { return }
            lines += ["try", "if \(property) of o is not \(value) then set \(property) of o to \(value)", "end try"]
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
            if column(view.sortKey) != nil {
                option("sort direction of sort column", view.ascending ? "normal" : "reversed")
            }
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
        return lines
    }

    /// A Finder window to bring back after Finder was quit: its folder and frame.
    public struct OpenWindow: Hashable {
        public let path: String
        /// Finder's `bounds`: left, top, right, bottom.
        public let bounds: [Int]

        public init(path: String, bounds: [Int]) {
            self.path = path
            self.bounds = bounds
        }
    }

    /// Every Finder window on a folder, front to back, as "left top right bottom path".
    public static let openWindowsScript = """
    with timeout of \(scriptTimeout) seconds
    set out to {}
    tell application "Finder"
    set ids to id of every Finder window
    repeat with k from 1 to count of ids
    set n to item k of ids
    try
    set p to POSIX path of ((target of Finder window id n) as alias)
    set b to bounds of Finder window id n
    set end of out to (item 1 of b as text) & " " & (item 2 of b as text) & " " & (item 3 of b as text) & " " & (item 4 of b as text) & " " & p
    end try
    end repeat
    end tell
    set AppleScript's text item delimiters to linefeed
    return out as text
    end timeout
    """

    public static func parseOpenWindows(_ output: String) -> [OpenWindow] {
        output.split(separator: "\n", omittingEmptySubsequences: true).compactMap { line in
            let parts = line.split(separator: " ", maxSplits: 4, omittingEmptySubsequences: false).map(String.init)
            guard parts.count == 5, parts[4].hasPrefix("/") else { return nil }
            let bounds = parts[0..<4].compactMap(Int.init)
            guard bounds.count == 4 else { return nil }
            return OpenWindow(path: parts[4], bounds: bounds)
        }
    }

    /// Opens the windows again, back to front, each where it was. A folder
    /// that is gone by now is skipped.
    public static func reopenScript(_ windows: [OpenWindow]) -> String {
        var lines = ["with timeout of 10 seconds", "tell application \"Finder\""]
        for window in windows.reversed() {
            lines += [
                "try",
                "set w to make new Finder window to (POSIX file \(literal(window.path)) as alias)",
                "set bounds of w to {\(window.bounds.map(String.init).joined(separator: ", "))}",
                "end try",
            ]
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

    /// Remembers where each window was, so the script acts only on windows that moved.
    public struct Tracker {
        private var known: [Int: String] = [:]

        public init() {}

        /// What the next look is told.
        public var lines: [String] { known.values.sorted() }

        /// Windows the look reported are known from now on; a window that
        /// refused, or is gone, is not, so it is looked at again next time.
        public mutating func update(with report: Report) {
            known = Dictionary(report.windows.map { ($0.id, $0.raw) }, uniquingKeysWith: { a, _ in a })
        }

        public mutating func reset() { known = [:] }
    }

    public enum ScriptError: Error, LocalizedError, Equatable {
        case notAllowed
        case timedOut
        /// The window is gone or between folders (Finder's "can't get", -1728).
        case gone
        case failed(String)

        public var errorDescription: String? {
            switch self {
            case .notAllowed: return "Sift is not allowed to control Finder. Allow it under System Settings → Privacy & Security → Automation."
            case .timedOut: return "Finder did not answer in time."
            case .gone: return "The window is gone."
            case .failed(let message): return message
            }
        }
    }

    /// The AppleScript error number at the end of an osascript complaint, "… (-1743)".
    static func errorNumber(in message: String) -> Int? {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasSuffix(")"), let open = trimmed.lastIndex(of: "(") else { return nil }
        return Int(trimmed[trimmed.index(after: open)..<trimmed.index(before: trimmed.endIndex)])
    }

    /// osascript's complaint without its character range: "Finder got an error: …".
    static func complaint(_ message: String) -> String {
        var text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        if let range = text.range(of: #"^\d+:\d+: "#, options: .regularExpression) { text.removeSubrange(range) }
        if let range = text.range(of: #"^execution error: "#, options: .regularExpression) { text.removeSubrange(range) }
        return text
    }

    static func error(_ message: String) -> ScriptError {
        switch errorNumber(in: message) {
        case -1743: return .notAllowed
        case -1712: return .timedOut
        case -1728: return .gone
        default: return .failed(WindowGuard.complaint(message))
        }
    }

    #if os(macOS)
    /// Runs AppleScript in a child `osascript` process. Any thread; blocks the
    /// caller for at most a little over the script's timeout.
    public enum OSAScript {
        /// Returns the script's result as osascript prints it.
        public static func run(_ source: String, killAfter seconds: TimeInterval = TimeInterval(scriptTimeout) * 2 + 2) throws -> String {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            process.arguments = []  // no file: the script comes on standard input
            let input = Pipe(), output = Pipe(), errors = Pipe()
            process.standardInput = input
            process.standardOutput = output
            process.standardError = errors
            try process.run()
            try? input.fileHandleForWriting.write(contentsOf: Data(source.utf8))
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

        /// One look: lists the windows and gives the moved ones their view.
        public func look(_ rules: [Rule], known: [String]) throws -> Report {
            WindowGuard.parse(try OSAScript.run(WindowGuard.lookScript(rules: rules, known: known)))
        }

        public func quitFinder() throws {
            _ = try OSAScript.run(WindowGuard.quitScript, killAfter: 12)
        }

        public func openWindows() throws -> [OpenWindow] {
            WindowGuard.parseOpenWindows(try OSAScript.run(WindowGuard.openWindowsScript))
        }

        public func reopen(_ windows: [OpenWindow]) throws {
            guard !windows.isEmpty else { return }
            _ = try OSAScript.run(WindowGuard.reopenScript(windows), killAfter: 15)
        }
    }
    #endif
}
