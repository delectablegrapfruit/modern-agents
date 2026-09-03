import Foundation

/// Finder keeps a window's view while it browses into folders without a view of
/// their own. The guard watches Finder's windows and, whenever one shows a new
/// folder, sets the view that folder should have: its folder view, the folder
/// view above it, or the default. Finder's habit of saving a view as you adjust
/// it thus lasts exactly until you leave the folder.
public enum WindowGuard {
    public struct Window: Hashable {
        public let id: Int
        public let path: String

        public init(id: Int, path: String) {
            self.id = id
            self.path = Path.standardize(path)
        }
    }

    /// Every Finder window as "id<tab>posix path". Windows on things that are
    /// not folders (Recents, AirDrop, the Trash) are left out.
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

    /// Finder's names for a mode, best first (gallery was "flow view" in older dictionaries).
    static func viewNames(_ mode: ViewMode) -> [String] {
        switch mode {
        case .icons: return ["icon view"]
        case .list: return ["list view"]
        case .columns: return ["column view"]
        case .gallery: return ["gallery view", "flow view"]
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

    /// Scripts that give one window a view, best first. Each option is set on
    /// its own so one Finder does not know about does not stop the rest.
    public static func applyScripts(windowID: Int, view: FinderView) -> [String] {
        viewNames(view.mode).map { name in
            var lines = ["tell application \"Finder\"", "set w to Finder window id \(windowID)",
                         "set current view of w to \(name)"]
            func set(_ property: String, _ value: String) {
                lines += ["try", "set \(property) of o to \(value)", "end try"]
            }
            let o = view.options
            switch view.mode {
            case .icons:
                lines.append("set o to icon view options of w")
                set("arrangement", arrangement(view.sortKey))
                set("icon size", "\(Int(o.icon.iconSize))")
                set("text size", "\(Int(o.icon.textSize))")
                set("label position", o.icon.labelOnBottom ? "bottom" : "right")
                set("shows item info", "\(o.icon.showItemInfo)")
                set("shows icon preview", "\(o.icon.showIconPreview)")
            case .list:
                lines.append("set o to list view options of w")
                set("sort column", column(view.sortKey))
                set("sort direction of sort column", view.ascending ? "normal" : "reversed")
                set("icon size", o.list.largeIcons ? "large icon" : "small icon")
                set("text size", "\(Int(o.list.textSize))")
                set("uses relative dates", "\(o.list.relativeDates)")
                set("calculates folder sizes", "\(o.list.calculateAllSizes)")
                set("shows icon preview", "\(o.list.showIconPreview)")
            case .columns:
                lines.append("set o to column view options of w")
                set("text size", "\(Int(o.column.textSize))")
                set("shows icon", "\(o.column.showIcons)")
                set("shows icon preview", "\(o.column.showIconPreview)")
                set("shows preview column", "\(o.column.showPreviewColumn)")
            case .gallery:
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

        public mutating func reset() { known = [:] }
    }

    public enum ScriptError: Error, LocalizedError, Equatable {
        case notAllowed
        case failed(String)

        public var errorDescription: String? {
            switch self {
            case .notAllowed: return "Sift is not allowed to control Finder. Allow it under System Settings → Privacy & Security → Automation."
            case .failed(let message): return "Finder did not apply the view: \(message)"
            }
        }
    }

    #if os(macOS)
    /// Talks to Finder with the list script compiled once. Main thread only.
    public final class Session {
        private var list: NSAppleScript?

        public init() {}

        public func windows() throws -> [Window] {
            if list == nil {
                var info: NSDictionary?
                guard let script = NSAppleScript(source: WindowGuard.listScript), script.compileAndReturnError(&info) else {
                    throw ScriptError.failed(info?[NSAppleScript.errorMessage] as? String ?? "the window list script did not compile")
                }
                list = script
            }
            var info: NSDictionary?
            let result = list!.executeAndReturnError(&info)
            if let info { throw WindowGuard.error(info) }
            var lines: [String] = []
            if result.numberOfItems > 0 {
                for index in 1...result.numberOfItems {
                    if let line = result.atIndex(index)?.stringValue { lines.append(line) }
                }
            } else if let single = result.stringValue, !single.isEmpty {
                lines.append(single)
            }
            return WindowGuard.parse(lines)
        }

        public func apply(_ view: FinderView, to windowID: Int) throws {
            var last = "no script"
            for source in WindowGuard.applyScripts(windowID: windowID, view: view) {
                guard let script = NSAppleScript(source: source) else { continue }
                var info: NSDictionary?
                guard script.compileAndReturnError(&info) else {
                    last = info?[NSAppleScript.errorMessage] as? String ?? "did not compile"
                    continue
                }
                script.executeAndReturnError(&info)
                guard let info else { return }
                let error = WindowGuard.error(info)
                if error == .notAllowed { throw error }
                last = info[NSAppleScript.errorMessage] as? String ?? "AppleScript error"
            }
            throw ScriptError.failed(last)
        }
    }

    static func error(_ info: NSDictionary) -> ScriptError {
        let number = info[NSAppleScript.errorNumber] as? Int ?? 0
        if number == -1743 { return .notAllowed }
        return .failed(info[NSAppleScript.errorMessage] as? String ?? "AppleScript error \(number)")
    }
    #endif
}
