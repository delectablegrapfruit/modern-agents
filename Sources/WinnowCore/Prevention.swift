import Foundation

/// Finder's own switches for not writing `.DS_Store` files in the first place.
/// Finder reads them at launch, so it must be relaunched after a change.
public enum FinderPreferences {
    public static let domain = "com.apple.desktopservices"
    public static let networkKey = "DSDontWriteNetworkStores"
    public static let usbKey = "DSDontWriteUSBStores"

    public static var isSupported: Bool {
        #if os(macOS)
        return true
        #else
        return false
        #endif
    }

    public static func isSuppressed(network: Bool) -> Bool {
        guard isSupported, let defaults = UserDefaults(suiteName: domain) else { return false }
        return defaults.bool(forKey: network ? networkKey : usbKey)
    }

    @discardableResult
    public static func setSuppressed(network: Bool, _ value: Bool) -> Bool {
        guard isSupported, let defaults = UserDefaults(suiteName: domain) else { return false }
        defaults.set(value, forKey: network ? networkKey : usbKey)
        return defaults.synchronize()
    }
}

public enum FinderViewStyle: String, CaseIterable, Hashable {
    case icons = "icnv"
    case list = "Nlsv"
    case columns = "clmv"
    case gallery = "glyv"

    public var label: String {
        switch self {
        case .icons: return "Icons"
        case .list: return "List"
        case .columns: return "Columns"
        case .gallery: return "Gallery"
        }
    }
}

public enum FinderSortKey: String, CaseIterable, Hashable {
    case name, dateModified, dateCreated, dateAdded, size, kind

    public var label: String {
        switch self {
        case .name: return "Name"
        case .dateModified: return "Date Modified"
        case .dateCreated: return "Date Created"
        case .dateAdded: return "Date Added"
        case .size: return "Size"
        case .kind: return "Kind"
        }
    }
}

/// Finder's global defaults for folders that carry no `.DS_Store` of their own.
/// Equivalent to View Options → "Use as Defaults". Finder must relaunch to notice.
public struct FinderDefaults: Hashable {
    public static let domain = "com.apple.finder"

    public var viewStyle: FinderViewStyle?
    public var sortKey: FinderSortKey?
    public var foldersFirst: Bool

    public init(viewStyle: FinderViewStyle? = nil, sortKey: FinderSortKey? = nil, foldersFirst: Bool = false) {
        self.viewStyle = viewStyle
        self.sortKey = sortKey
        self.foldersFirst = foldersFirst
    }

    public static var isSupported: Bool { FinderPreferences.isSupported }

    public static func read() -> FinderDefaults {
        guard isSupported, let defaults = UserDefaults(suiteName: domain) else { return FinderDefaults() }
        let standard = defaults.dictionary(forKey: "StandardViewSettings")
        let list = standard?["ListViewSettings"] as? [String: Any]
        let sortRaw = list?["sortColumn"] as? String
        return FinderDefaults(
            viewStyle: defaults.string(forKey: "FXPreferredViewStyle").flatMap(FinderViewStyle.init(rawValue:)),
            sortKey: sortRaw.flatMap(FinderSortKey.init(rawValue:)),
            foldersFirst: defaults.bool(forKey: "_FXSortFoldersFirst"))
    }

    @discardableResult
    public func write() -> Bool {
        guard FinderDefaults.isSupported, let defaults = UserDefaults(suiteName: FinderDefaults.domain) else { return false }
        if let viewStyle { defaults.set(viewStyle.rawValue, forKey: "FXPreferredViewStyle") }
        defaults.set(foldersFirst, forKey: "_FXSortFoldersFirst")
        if let sortKey {
            var standard = defaults.dictionary(forKey: "StandardViewSettings") ?? [:]
            for key in ["ListViewSettings", "ExtendedListViewSettingsV2"] {
                var view = standard[key] as? [String: Any] ?? [:]
                view["sortColumn"] = sortKey.rawValue
                standard[key] = view
            }
            var icon = standard["IconViewSettings"] as? [String: Any] ?? [:]
            icon["arrangeBy"] = sortKey.rawValue
            standard["IconViewSettings"] = icon
            defaults.set(standard, forKey: "StandardViewSettings")
        }
        return defaults.synchronize()
    }
}

public enum VolumeMarkers {
    public static let spotlightMarker = ".metadata_never_index"

    /// Creates the marker Spotlight honours to skip a volume. Returns true if it was created.
    @discardableResult
    public static func ensureSpotlightDisabled(at mountPoint: String, fileManager: FileManager = .default) throws -> Bool {
        let path = SafetyPolicy.standardize(mountPoint) + "/" + spotlightMarker
        if fileManager.fileExists(atPath: path) { return false }
        guard fileManager.createFile(atPath: path, contents: Data()) else {
            throw CocoaError(.fileWriteNoPermission, userInfo: [NSFilePathErrorKey: path])
        }
        return true
    }

    public static func isSpotlightDisabled(at mountPoint: String, fileManager: FileManager = .default) -> Bool {
        fileManager.fileExists(atPath: SafetyPolicy.standardize(mountPoint) + "/" + spotlightMarker)
    }
}
