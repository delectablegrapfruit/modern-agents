import Foundation

public enum MatchKind: String, Codable, CaseIterable, Hashable {
    case exact, prefix, suffix, glob
}

public enum EntryKind: String, Codable, CaseIterable, Hashable {
    case file, directory, any

    public var label: String {
        switch self {
        case .file: return "File"
        case .directory: return "Folder"
        case .any: return "File or folder"
        }
    }
}

/// Where a rule may match. Volume-metadata folders such as `.Spotlight-V100`
/// only ever live at the top of a volume; matching them anywhere else would be
/// a false positive.
public enum RuleScope: String, Codable, CaseIterable, Hashable {
    case anywhere
    case volumeRoot

    public var label: String {
        switch self {
        case .anywhere: return "Anywhere"
        case .volumeRoot: return "Top of volume only"
        }
    }
}

public enum RuleCategory: String, Codable, CaseIterable, Hashable {
    case finder
    case volume
    case fileServer
    case archive
    case custom

    public var label: String {
        switch self {
        case .finder: return "Finder"
        case .volume: return "Volume metadata"
        case .fileServer: return "File servers"
        case .archive: return "Archives"
        case .custom: return "Custom"
        }
    }
}

public struct JunkRule: Codable, Identifiable, Hashable {
    public var id: String
    public var name: String
    public var pattern: String
    public var matchKind: MatchKind
    public var entryKind: EntryKind
    public var scope: RuleScope
    public var category: RuleCategory
    public var summary: String
    public var enabledByDefault: Bool
    public var isBuiltIn: Bool

    public init(id: String, name: String, pattern: String, matchKind: MatchKind, entryKind: EntryKind,
                scope: RuleScope, category: RuleCategory, summary: String,
                enabledByDefault: Bool = true, isBuiltIn: Bool = true) {
        self.id = id
        self.name = name
        self.pattern = pattern
        self.matchKind = matchKind
        self.entryKind = entryKind
        self.scope = scope
        self.category = category
        self.summary = summary
        self.enabledByDefault = enabledByDefault
        self.isBuiltIn = isBuiltIn
    }

    public func matches(name: String, isDirectory: Bool, atVolumeRoot: Bool) -> Bool {
        if scope == .volumeRoot && !atVolumeRoot { return false }
        switch entryKind {
        case .file: if isDirectory { return false }
        case .directory: if !isDirectory { return false }
        case .any: break
        }
        return matchesName(name)
    }

    /// Name test alone, ignoring kind and scope. Cheap enough to run on every file event.
    public func matchesName(_ name: String) -> Bool {
        switch matchKind {
        case .exact:
            return name.caseInsensitiveCompare(pattern) == .orderedSame
        case .prefix:
            return name.count > pattern.count && name.lowercased().hasPrefix(pattern.lowercased())
        case .suffix:
            return name.count > pattern.count && name.lowercased().hasSuffix(pattern.lowercased())
        case .glob:
            return GlobPattern.cached(pattern).matches(name)
        }
    }
}

public enum JunkCatalog {
    /// Built-in knowledge of what macOS (and Apple file-sharing software) scatters
    /// across volumes that other systems do not need.
    public static let builtIn: [JunkRule] = [
        JunkRule(id: "ds_store", name: ".DS_Store", pattern: ".DS_Store", matchKind: .exact, entryKind: .file,
                 scope: .anywhere, category: .finder,
                 summary: "Finder view settings written into every folder it opens."),
        JunkRule(id: "apple_double", name: "._ resource forks", pattern: "._", matchKind: .prefix, entryKind: .file,
                 scope: .anywhere, category: .finder,
                 summary: "AppleDouble sidecar files holding metadata the target file system cannot store."),
        JunkRule(id: "localized", name: ".localized", pattern: ".localized", matchKind: .exact, entryKind: .file,
                 scope: .anywhere, category: .finder,
                 summary: "Marker telling Finder to translate a folder's name.", enabledByDefault: false),
        JunkRule(id: "apdisk", name: ".apdisk", pattern: ".apdisk", matchKind: .exact, entryKind: .file,
                 scope: .anywhere, category: .finder,
                 summary: "Finder bookkeeping left on shared folders."),

        JunkRule(id: "spotlight", name: ".Spotlight-V100", pattern: ".Spotlight-V100", matchKind: .exact, entryKind: .directory,
                 scope: .volumeRoot, category: .volume,
                 summary: "Spotlight search index for the volume."),
        JunkRule(id: "fseventsd", name: ".fseventsd", pattern: ".fseventsd", matchKind: .exact, entryKind: .directory,
                 scope: .volumeRoot, category: .volume,
                 summary: "File system event journal."),
        JunkRule(id: "trashes", name: ".Trashes", pattern: ".Trashes", matchKind: .exact, entryKind: .directory,
                 scope: .volumeRoot, category: .volume,
                 summary: "Per-user Trash for the volume. Removing it empties that Trash."),
        JunkRule(id: "temporary_items", name: ".TemporaryItems", pattern: ".TemporaryItems", matchKind: .exact, entryKind: .directory,
                 scope: .volumeRoot, category: .volume,
                 summary: "Scratch space used while saving documents."),
        JunkRule(id: "tm_donotpresent", name: ".com.apple.timemachine.donotpresent", pattern: ".com.apple.timemachine.donotpresent",
                 matchKind: .exact, entryKind: .file, scope: .volumeRoot, category: .volume,
                 summary: "Tells Time Machine not to offer the volume as a backup destination."),
        JunkRule(id: "tm_supported", name: ".com.apple.timemachine.supported", pattern: ".com.apple.timemachine.supported",
                 matchKind: .exact, entryKind: .file, scope: .volumeRoot, category: .volume,
                 summary: "Time Machine capability marker.", enabledByDefault: false),
        JunkRule(id: "document_revisions", name: ".DocumentRevisions-V100", pattern: ".DocumentRevisions-V100",
                 matchKind: .exact, entryKind: .directory, scope: .volumeRoot, category: .volume,
                 summary: "Version history for documents edited on the volume.", enabledByDefault: false),
        JunkRule(id: "volume_icon", name: ".VolumeIcon.icns", pattern: ".VolumeIcon.icns", matchKind: .exact, entryKind: .file,
                 scope: .volumeRoot, category: .volume,
                 summary: "Custom icon shown for the volume.", enabledByDefault: false),

        JunkRule(id: "apple_double_dir", name: ".AppleDouble", pattern: ".AppleDouble", matchKind: .exact, entryKind: .directory,
                 scope: .anywhere, category: .fileServer,
                 summary: "Resource-fork folders written by Netatalk/AFP servers."),
        JunkRule(id: "apple_db", name: ".AppleDB", pattern: ".AppleDB", matchKind: .exact, entryKind: .directory,
                 scope: .volumeRoot, category: .fileServer,
                 summary: "Netatalk catalog database."),
        JunkRule(id: "apple_desktop", name: ".AppleDesktop", pattern: ".AppleDesktop", matchKind: .exact, entryKind: .directory,
                 scope: .volumeRoot, category: .fileServer,
                 summary: "Netatalk desktop database."),
        JunkRule(id: "network_trash", name: "Network Trash Folder", pattern: "Network Trash Folder", matchKind: .exact, entryKind: .directory,
                 scope: .volumeRoot, category: .fileServer,
                 summary: "Trash folder created on AFP shares."),
        JunkRule(id: "temporary_items_afp", name: "Temporary Items", pattern: "Temporary Items", matchKind: .exact, entryKind: .directory,
                 scope: .volumeRoot, category: .fileServer,
                 summary: "Scratch folder created on AFP shares."),

        JunkRule(id: "macosx_archive", name: "__MACOSX", pattern: "__MACOSX", matchKind: .exact, entryKind: .directory,
                 scope: .anywhere, category: .archive,
                 summary: "Resource-fork folder left behind when a Mac-made zip is expanded elsewhere."),
    ]

    public static func builtIn(id: String) -> JunkRule? {
        builtIn.first { $0.id == id }
    }
}
