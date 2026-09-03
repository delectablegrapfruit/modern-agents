import Foundation

/// Asks Finder itself to give a folder a view, through its scripting interface.
/// This is Apple's supported route and works even where Finder ignores a
/// `.DS_Store` written by another process. Finder briefly opens the folder.
public enum FinderScripting {
    /// Candidate scripts, best first. Later ones drop constructs older or newer
    /// Finder dictionaries do not compile (gallery view is `flow view` in the dictionary).
    public static func scripts(for view: FolderView) -> [String] {
        var candidates: [String] = []
        for name in viewNames(view.viewStyle) {
            candidates.append(script(for: view, viewLine: "set current view of theWindow to \(name)"))
        }
        candidates.append(script(for: view, viewLine: nil))
        return candidates
    }

    static func script(for view: FolderView, viewLine: String?) -> String {
        let path = view.path.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        var lines = [
            "tell application \"Finder\"",
            "set theFolder to POSIX file \"\(path)\" as alias",
            "set theWindow to make new Finder window to theFolder",
        ]
        if let viewLine { lines.append(viewLine) }
        let o = view.options
        func attempt(_ statement: String) { lines += ["try", statement, "end try"] }
        switch view.viewStyle {
        case .icons:
            attempt("set arrangement of icon view options of theWindow to \(iconArrangement(view.sortKey))")
            attempt("set icon size of icon view options of theWindow to \(Int(o.icon.iconSize))")
            attempt("set text size of icon view options of theWindow to \(Int(o.icon.textSize))")
            attempt("set label position of icon view options of theWindow to \(o.icon.labelOnBottom ? "bottom" : "right")")
            attempt("set shows item info of icon view options of theWindow to \(o.icon.showItemInfo)")
            attempt("set shows icon preview of icon view options of theWindow to \(o.icon.showIconPreview)")
        case .list:
            attempt("set sort column of list view options of theWindow to \(listColumn(view.sortKey))")
            attempt("set icon size of list view options of theWindow to \(o.list.largeIcons ? "large icon" : "small icon")")
            attempt("set text size of list view options of theWindow to \(Int(o.list.textSize))")
            attempt("set calculates folder sizes of list view options of theWindow to \(o.list.calculateAllSizes)")
            attempt("set shows icon preview of list view options of theWindow to \(o.list.showIconPreview)")
            attempt("set uses relative dates of list view options of theWindow to \(o.list.useRelativeDates)")
        case .columns:
            attempt("set text size of column view options of theWindow to \(o.column.textSize)")
            attempt("set shows icon of column view options of theWindow to \(o.column.showIcons)")
            attempt("set shows icon preview of column view options of theWindow to \(o.column.showIconPreview)")
            attempt("set shows preview column of column view options of theWindow to \(o.column.showPreviewColumn)")
        case .gallery:
            break
        }
        lines += ["delay 0.5", "close theWindow", "end tell"]
        return lines.joined(separator: "\n")
    }

    static func viewNames(_ style: FinderViewStyle) -> [String] {
        switch style {
        case .icons: return ["icon view"]
        case .list: return ["list view"]
        case .columns: return ["column view"]
        case .gallery: return ["gallery view", "flow view"]
        }
    }

    static func iconArrangement(_ key: FinderSortKey) -> String {
        switch key {
        case .name, .dateAdded: return "arranged by name"
        case .dateModified: return "arranged by modification date"
        case .dateCreated: return "arranged by creation date"
        case .size: return "arranged by size"
        case .kind: return "arranged by kind"
        }
    }

    static func listColumn(_ key: FinderSortKey) -> String {
        switch key {
        case .name, .dateAdded: return "name column"
        case .dateModified: return "modification date column"
        case .dateCreated: return "creation date column"
        case .size: return "size column"
        case .kind: return "kind column"
        }
    }

    #if os(macOS)
    /// Must be called on the main thread. Tries each candidate script until one
    /// compiles and runs; throws Finder's message otherwise.
    public static func apply(_ view: FolderView) throws {
        var lastMessage = "no script"
        for source in scripts(for: view) {
            guard let script = NSAppleScript(source: source) else { continue }
            var errorInfo: NSDictionary?
            guard script.compileAndReturnError(&errorInfo) else {
                lastMessage = errorInfo?[NSAppleScript.errorMessage] as? String ?? "did not compile"
                continue
            }
            script.executeAndReturnError(&errorInfo)
            guard let info = errorInfo else { return }
            let number = info[NSAppleScript.errorNumber] as? Int ?? 0
            if number == -1743 {
                throw FinderDefaultsError.scriptFailed("Winnow is not allowed to control Finder. Allow it under System Settings → Privacy & Security → Automation.")
            }
            lastMessage = info[NSAppleScript.errorMessage] as? String ?? "AppleScript error \(number)"
        }
        throw FinderDefaultsError.scriptFailed(lastMessage)
    }
    #endif
}
