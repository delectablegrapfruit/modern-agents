import Foundation

/// Asks Finder itself to give a folder a view, through its scripting interface.
/// This is Apple's supported route and works even where Finder ignores a
/// `.DS_Store` written by another process. Finder briefly opens the folder.
public enum FinderScripting {
    public static func script(for view: FolderView) -> String {
        let path = view.path.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        var lines = [
            "tell application \"Finder\"",
            "set theFolder to POSIX file \"\(path)\" as alias",
            "set theWindow to make new Finder window to theFolder",
            "set current view of theWindow to \(viewName(view.viewStyle))",
        ]
        let o = view.options
        switch view.viewStyle {
        case .icons:
            lines += [
                "tell icon view options of theWindow",
                "set arrangement to \(iconArrangement(view.sortKey))",
                "set icon size to \(Int(o.icon.iconSize))",
                "set text size to \(Int(o.icon.textSize))",
                "set label position to \(o.icon.labelOnBottom ? "bottom" : "right")",
                "set shows item info to \(o.icon.showItemInfo)",
                "set shows icon preview to \(o.icon.showIconPreview)",
                "end tell",
            ]
        case .list:
            lines += [
                "tell list view options of theWindow",
                "set sort column to \(listColumn(view.sortKey))",
                "set icon size to \(o.list.largeIcons ? "large icon" : "small icon")",
                "set text size to \(Int(o.list.textSize))",
                "set calculates folder sizes to \(o.list.calculateAllSizes)",
                "set shows icon preview to \(o.list.showIconPreview)",
                "set uses relative dates to \(o.list.useRelativeDates)",
                "end tell",
            ]
        case .columns:
            lines += [
                "tell column view options of theWindow",
                "set text size to \(o.column.textSize)",
                "set shows icon to \(o.column.showIcons)",
                "set shows icon preview to \(o.column.showIconPreview)",
                "set shows preview column to \(o.column.showPreviewColumn)",
                "end tell",
            ]
        case .gallery:
            break
        }
        lines += ["delay 0.3", "close theWindow", "end tell"]
        return lines.joined(separator: "\n")
    }

    static func viewName(_ style: FinderViewStyle) -> String {
        switch style {
        case .icons: return "icon view"
        case .list: return "list view"
        case .columns: return "column view"
        case .gallery: return "gallery view"
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
    /// Must be called on the main thread. Throws with Finder's message on failure,
    /// including "not authorized" when Automation access has been refused.
    public static func apply(_ view: FolderView) throws {
        guard let script = NSAppleScript(source: script(for: view)) else {
            throw FinderDefaultsError.writeFailed("Finder script")
        }
        var errorInfo: NSDictionary?
        script.executeAndReturnError(&errorInfo)
        if let info = errorInfo {
            let number = info[NSAppleScript.errorNumber] as? Int ?? 0
            let message = info[NSAppleScript.errorMessage] as? String ?? "AppleScript error \(number)"
            if number == -1743 {
                throw FinderDefaultsError.writeFailed("Finder (allow Winnow under System Settings → Privacy & Security → Automation)")
            }
            throw FinderDefaultsError.writeFailed("Finder: \(message)")
        }
    }
    #endif
}
