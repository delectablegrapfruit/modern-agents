import Foundation

/// What macOS scatters across disks that nothing else needs.
///
/// The catalog is fixed: every entry is metadata Finder or a system daemon
/// regenerates on demand. Things a person chose (custom volume icons, document
/// version history, Time Machine markers) are not in it.
public enum Junk: String, Codable, CaseIterable, Hashable {
    case dsStore
    case appleDouble
    case apdisk
    case spotlight
    case fsevents
    case trashes
    case temporaryItems

    /// Files the app itself relies on; never removed, never reported.
    public static let markers: Set<String> = [".metadata_never_index", "no_log"]

    public var label: String {
        switch self {
        case .dsStore: return ".DS_Store"
        case .appleDouble: return "._ file"
        case .apdisk: return ".apdisk"
        case .spotlight: return ".Spotlight-V100"
        case .fsevents: return ".fseventsd"
        case .trashes: return ".Trashes"
        case .temporaryItems: return ".TemporaryItems"
        }
    }

    public var summary: String {
        switch self {
        case .dsStore: return "Finder view state, written into every folder it opens"
        case .appleDouble: return "Resource fork the disk cannot store natively"
        case .apdisk: return "Finder bookkeeping on shared folders"
        case .spotlight: return "Spotlight index for the disk"
        case .fsevents: return "File system event journal"
        case .trashes: return "The disk's Trash; removing it empties that Trash"
        case .temporaryItems: return "Scratch space left by saving documents"
        }
    }

    /// Volume-level items only ever live directly inside a mount point.
    public var volumeRootOnly: Bool {
        switch self {
        case .dsStore, .appleDouble, .apdisk: return false
        case .spotlight, .fsevents, .trashes, .temporaryItems: return true
        }
    }

    public var isDirectory: Bool { volumeRootOnly }

    /// The kind of junk an entry is, or nil when it is not junk.
    public static func kind(name: String, isDirectory: Bool, atVolumeRoot: Bool) -> Junk? {
        let lower = name.lowercased()
        if !isDirectory {
            if lower == ".ds_store" { return .dsStore }
            if lower.hasPrefix("._") && name.count > 2 { return .appleDouble }
            if lower == ".apdisk" { return .apdisk }
            return nil
        }
        guard atVolumeRoot else { return nil }
        switch lower {
        case ".spotlight-v100": return .spotlight
        case ".fseventsd": return .fsevents
        case ".trashes": return .trashes
        case ".temporaryitems": return .temporaryItems
        default: return nil
        }
    }

    /// Whether any junk kind could match this name, whatever its kind or place.
    /// Cheap enough to run on every file event.
    public static func couldMatch(name: String) -> Bool {
        let lower = name.lowercased()
        return lower == ".ds_store" || (lower.hasPrefix("._") && name.count > 2) || lower == ".apdisk"
            || lower == ".spotlight-v100" || lower == ".fseventsd" || lower == ".trashes" || lower == ".temporaryitems"
    }

    /// A `.fseventsd` holding only the `no_log` marker is the quiet form Sift
    /// leaves behind on purpose; it is not junk.
    public static func isQuietFSEvents(at path: String, fileManager: FileManager = .default) -> Bool {
        guard let names = try? fileManager.contentsOfDirectory(atPath: path) else { return false }
        return names.allSatisfy { $0 == "no_log" }
    }
}
