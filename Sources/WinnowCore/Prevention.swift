import Foundation

#if os(macOS)
import CoreFoundation
#endif

public enum FinderViewStyle: String, CaseIterable, Hashable, Codable {
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

public enum FinderSortKey: String, CaseIterable, Hashable, Codable {
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

    /// Four-character code used by column view (`ColumnViewOptions.ArrangeBy`). Unknown for Date Added.
    public var columnViewCode: String? {
        switch self {
        case .name: return "dnam"
        case .dateModified: return "dmod"
        case .dateCreated: return "ascd"
        case .size: return "phys"
        case .kind: return "kipl"
        case .dateAdded: return nil
        }
    }

    /// Finder's own default direction for this key (dates newest first).
    public var defaultAscending: Bool {
        switch self {
        case .name, .kind, .size: return true
        case .dateModified, .dateCreated, .dateAdded: return false
        }
    }
}

public enum FinderGroupBy: String, CaseIterable, Hashable, Codable {
    case none = "None"
    case kind = "Kind"
    case dateModified = "Date Modified"
    case dateCreated = "Date Created"
    case dateAdded = "Date Added"
    case size = "Size"

    public var label: String { rawValue }
}

public enum FinderDefaultsError: Error, LocalizedError, Equatable {
    case unsupported
    case writeFailed(String)
    case verifyFailed(String)
    case scriptFailed(String)

    public var errorDescription: String? {
        switch self {
        case .unsupported: return "Finder preferences can only be changed on macOS."
        case .writeFailed(let domain): return "Could not save \(domain) preferences."
        case .verifyFailed(let key): return "Finder did not accept the new value for \(key)."
        case .scriptFailed(let message): return "Finder did not apply the folder view: \(message)"
        }
    }
}

/// Finder's global defaults, the same values View Options → "Use as Defaults" writes,
/// plus Finder's switches for not creating `.DS_Store` on network and USB volumes.
/// Read with `read()`, edit, then `write()` and relaunch Finder.
public struct FinderDefaults: Hashable {
    public static let finderDomain = "com.apple.finder"
    public static let desktopServicesDomain = "com.apple.desktopservices"

    public var viewStyle: FinderViewStyle = .icons
    public var sortKey: FinderSortKey = .name
    public var ascending = true
    public var groupBy: FinderGroupBy = .none
    public var foldersFirst = false
    public var noDSStoreOnNetwork = false
    public var noDSStoreOnUSB = false
    public var options = ViewOptions()

    public init() {}

    public static var isSupported: Bool {
        #if os(macOS)
        return true
        #else
        return false
        #endif
    }

    /// Value Finder stores in `FXArrangeGroupViewBy`.
    public var sortLabel: String { sortKey.label }

    // MARK: Pure transformation (testable everywhere)

    /// Merges these defaults into Finder's `StandardViewSettings`, keeping keys we do not manage.
    public func mergedStandardViewSettings(into existing: [String: Any]?) -> [String: Any] {
        var standard = existing ?? [:]
        let sort = sortKey.rawValue
        standard["IconViewSettings"] = options.icon.plist(arrangeBy: sort, existing: standard["IconViewSettings"] as? [String: Any])
        standard["ListViewSettings"] = options.list.plist(sortColumn: sort, ascending: ascending,
                                                          existing: standard["ListViewSettings"] as? [String: Any])
        standard["ExtendedListViewSettingsV2"] = options.list.extendedPlist(sortColumn: sort, ascending: ascending,
                                                                            existing: standard["ExtendedListViewSettingsV2"] as? [String: Any])
        standard["GalleryViewSettings"] = options.gallery.plist(arrangeBy: sort, existing: standard["GalleryViewSettings"] as? [String: Any])
        standard["ViewStyle"] = viewStyle.rawValue
        standard["SettingsType"] = "StandardViewSettings"
        return standard
    }

    public func mergedColumnViewOptions(into existing: [String: Any]?) -> [String: Any] {
        options.column.plist(arrangeBy: sortKey.columnViewCode, existing: existing)
    }

    // MARK: macOS I/O

    #if os(macOS)
    private static func value(_ key: String, in domain: String) -> Any? {
        CFPreferencesCopyAppValue(key as CFString, domain as CFString)
    }

    private static func set(_ value: Any?, for key: String, in domain: String) {
        CFPreferencesSetAppValue(key as CFString, value.map { $0 as AnyObject }, domain as CFString)
    }

    public static func read() -> FinderDefaults {
        var d = FinderDefaults()
        if let raw = value("FXPreferredViewStyle", in: finderDomain) as? String, let style = FinderViewStyle(rawValue: raw) {
            d.viewStyle = style
        }
        let standard = value("StandardViewSettings", in: finderDomain) as? [String: Any]
        let extended = standard?["ExtendedListViewSettingsV2"] as? [String: Any]
        let list = standard?["ListViewSettings"] as? [String: Any]
        if let raw = (extended?["sortColumn"] ?? list?["sortColumn"]) as? String, let key = FinderSortKey(rawValue: raw) {
            d.sortKey = key
            d.ascending = key.defaultAscending
            if let columns = extended?["columns"] as? [[String: Any]],
               let column = columns.first(where: { $0["identifier"] as? String == raw }),
               let asc = plistBool(column["ascending"]) {
                d.ascending = asc
            } else if let columns = list?["columns"] as? [String: Any],
                      let column = columns[raw] as? [String: Any],
                      let asc = plistBool(column["ascending"]) {
                d.ascending = asc
            }
        }
        if let raw = value("FXPreferredGroupBy", in: finderDomain) as? String, let group = FinderGroupBy(rawValue: raw) {
            d.groupBy = group
        }
        d.foldersFirst = plistBool(value("_FXSortFoldersFirst", in: finderDomain)) ?? false
        d.options.icon = IconViewOptions.read(standard?["IconViewSettings"] as? [String: Any])
        d.options.list = ListViewOptions.read(list, extended: extended)
        d.options.gallery = GalleryViewOptions.read(standard?["GalleryViewSettings"] as? [String: Any])
        d.options.column = ColumnViewOptions.read(value("ColumnViewOptions", in: finderDomain) as? [String: Any])
        d.noDSStoreOnNetwork = plistBool(value("DSDontWriteNetworkStores", in: desktopServicesDomain)) ?? false
        d.noDSStoreOnUSB = plistBool(value("DSDontWriteUSBStores", in: desktopServicesDomain)) ?? false
        return d
    }

    /// Writes every value and reads it back. Finder must be relaunched afterwards.
    public func write() throws {
        let finder = FinderDefaults.finderDomain
        let desktop = FinderDefaults.desktopServicesDomain
        FinderDefaults.set(viewStyle.rawValue, for: "FXPreferredViewStyle", in: finder)
        FinderDefaults.set(foldersFirst, for: "_FXSortFoldersFirst", in: finder)
        FinderDefaults.set(foldersFirst, for: "_FXSortFoldersFirstOnDesktop", in: finder)
        FinderDefaults.set(groupBy.rawValue, for: "FXPreferredGroupBy", in: finder)
        FinderDefaults.set(sortLabel, for: "FXArrangeGroupViewBy", in: finder)
        let standard = mergedStandardViewSettings(into: FinderDefaults.value("StandardViewSettings", in: finder) as? [String: Any])
        FinderDefaults.set(standard, for: "StandardViewSettings", in: finder)
        let column = mergedColumnViewOptions(into: FinderDefaults.value("ColumnViewOptions", in: finder) as? [String: Any])
        FinderDefaults.set(column, for: "ColumnViewOptions", in: finder)
        guard CFPreferencesAppSynchronize(finder as CFString) else { throw FinderDefaultsError.writeFailed("Finder") }

        FinderDefaults.set(noDSStoreOnNetwork, for: "DSDontWriteNetworkStores", in: desktop)
        FinderDefaults.set(noDSStoreOnUSB, for: "DSDontWriteUSBStores", in: desktop)
        guard CFPreferencesAppSynchronize(desktop as CFString) else { throw FinderDefaultsError.writeFailed("Desktop Services") }

        let check = FinderDefaults.read()
        if check.viewStyle != viewStyle { throw FinderDefaultsError.verifyFailed("view") }
        if check.sortKey != sortKey { throw FinderDefaultsError.verifyFailed("sort order") }
        if check.foldersFirst != foldersFirst { throw FinderDefaultsError.verifyFailed("folders first") }
        if Int(check.options.icon.iconSize) != Int(options.icon.iconSize) { throw FinderDefaultsError.verifyFailed("icon size") }
        if check.noDSStoreOnNetwork != noDSStoreOnNetwork || check.noDSStoreOnUSB != noDSStoreOnUSB {
            throw FinderDefaultsError.verifyFailed(".DS_Store")
        }
    }
    #else
    public static func read() -> FinderDefaults { FinderDefaults() }
    public func write() throws { throw FinderDefaultsError.unsupported }
    #endif
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
