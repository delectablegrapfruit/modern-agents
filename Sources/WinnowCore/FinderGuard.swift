import Foundation

/// Watches Finder's windows and, whenever one moves to a folder without its own
/// view, sets the default view. Finder otherwise keeps a window's current view
/// until it reaches a folder that has one stored, so a folder view carried one
/// folder further and a view changed in Finder outlived the folder it was changed
/// in. With the guard, a change lasts exactly until the window leaves the folder.
public enum FinderWindowGuard {
    public struct Window: Hashable {
        public let id: Int
        public let path: String

        public init(id: Int, path: String) {
            self.id = id
            self.path = SafetyPolicy.standardize(path)
        }
    }

    /// Lists every Finder window as "id<tab>posix path"; windows showing something
    /// that is not a folder (Recents, AirDrop, the Trash…) are left out.
    public static let listScript = """
    tell application "Finder"
    set out to {}
    repeat with w in (every Finder window)
    try
    set end of out to ((id of w) as text) & tab & POSIX path of ((target of w) as alias)
    end try
    end repeat
    return out
    end tell
    """

    public static func parse(_ lines: [String]) -> [Window] {
        lines.compactMap { line in
            let parts = line.split(separator: "\t", maxSplits: 1).map(String.init)
            guard parts.count == 2, let id = Int(parts[0]) else { return nil }
            return Window(id: id, path: parts[1])
        }
    }

    /// Scripts that set one window to the defaults, best first (gallery view is
    /// `flow view` in older dictionaries). Sort order follows the defaults too.
    public static func setViewScripts(windowID: Int, defaults: FinderDefaults) -> [String] {
        FinderScripting.viewNames(defaults.viewStyle).map { name in
            var lines = ["tell application \"Finder\"", "set w to Finder window id \(windowID)",
                         "set current view of w to \(name)"]
            switch defaults.viewStyle {
            case .icons:
                lines += ["try", "set arrangement of icon view options of w to \(FinderScripting.iconArrangement(defaults.sortKey))", "end try"]
            case .list:
                lines += ["try", "set sort column of list view options of w to \(FinderScripting.listColumn(defaults.sortKey))", "end try"]
            case .columns, .gallery:
                break
            }
            lines.append("end tell")
            return lines.joined(separator: "\n")
        }
    }

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
    }

    #if os(macOS)
    /// Main thread only.
    public static func windows() throws -> [Window] {
        guard let script = NSAppleScript(source: listScript) else { return [] }
        var errorInfo: NSDictionary?
        let result = script.executeAndReturnError(&errorInfo)
        if let info = errorInfo { throw scriptError(info) }
        var lines: [String] = []
        if result.numberOfItems > 0 {
            for index in 1...result.numberOfItems {
                if let line = result.atIndex(index)?.stringValue { lines.append(line) }
            }
        } else if let single = result.stringValue, !single.isEmpty {
            lines.append(single)
        }
        return parse(lines)
    }

    /// Main thread only.
    public static func setDefaultView(windowID: Int, defaults: FinderDefaults) throws {
        var lastMessage = "no script"
        for source in setViewScripts(windowID: windowID, defaults: defaults) {
            guard let script = NSAppleScript(source: source) else { continue }
            var errorInfo: NSDictionary?
            guard script.compileAndReturnError(&errorInfo) else {
                lastMessage = errorInfo?[NSAppleScript.errorMessage] as? String ?? "did not compile"
                continue
            }
            script.executeAndReturnError(&errorInfo)
            guard let info = errorInfo else { return }
            if (info[NSAppleScript.errorNumber] as? Int) == -1743 { throw scriptError(info) }
            lastMessage = info[NSAppleScript.errorMessage] as? String ?? "AppleScript error"
        }
        throw FinderDefaultsError.scriptFailed(lastMessage)
    }

    static func scriptError(_ info: NSDictionary) -> FinderDefaultsError {
        let number = info[NSAppleScript.errorNumber] as? Int ?? 0
        if number == -1743 {
            return .scriptFailed("Winnow is not allowed to control Finder. Allow it under System Settings → Privacy & Security → Automation.")
        }
        return .scriptFailed(info[NSAppleScript.errorMessage] as? String ?? "AppleScript error \(number)")
    }

    /// Whether the error means Finder cannot be controlled at all (no point retrying).
    public static func isPermissionError(_ error: Error) -> Bool {
        guard case FinderDefaultsError.scriptFailed(let message) = error else { return false }
        return message.contains("not allowed to control Finder")
    }
    #endif
}
