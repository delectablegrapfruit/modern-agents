import Foundation
#if os(macOS)
import CoreFoundation
#endif

// Finder's own defaults: the dictionaries View Options → "Use as Defaults"
// writes, plus the two switches that stop `.DS_Store` on network and USB disks.
// The pure builders below are shared with per-folder `.DS_Store` records.

func plistDouble(_ any: Any?) -> Double? {
    if let d = any as? Double { return d }
    if let i = any as? Int { return Double(i) }
    if let n = any as? NSNumber { return n.doubleValue }
    return nil
}

func plistBool(_ any: Any?) -> Bool? {
    if let b = any as? Bool { return b }
    if let n = any as? NSNumber { return n.boolValue }
    return nil
}

extension IconOptions {
    /// `IconViewSettings` / `icvp`. Keys not managed here (backgrounds) are kept.
    public func plist(arrangeBy: String, existing: [String: Any]? = nil) -> [String: Any] {
        var d = existing ?? ["backgroundColorBlue": 1.0, "backgroundColorGreen": 1.0, "backgroundColorRed": 1.0,
                             "backgroundType": 0, "gridOffsetX": 0.0, "gridOffsetY": 0.0]
        d["arrangeBy"] = arrangeBy
        d["iconSize"] = iconSize
        d["gridSpacing"] = gridSpacing
        d["textSize"] = textSize
        d["labelOnBottom"] = labelOnBottom
        d["showItemInfo"] = showItemInfo
        d["showIconPreview"] = showIconPreview
        if d["viewOptionsVersion"] == nil { d["viewOptionsVersion"] = 1 }
        return d
    }

    public static func read(_ d: [String: Any]?) -> IconOptions {
        var o = IconOptions()
        guard let d else { return o }
        o.iconSize = plistDouble(d["iconSize"]) ?? o.iconSize
        o.gridSpacing = plistDouble(d["gridSpacing"]) ?? o.gridSpacing
        o.textSize = plistDouble(d["textSize"]) ?? o.textSize
        o.labelOnBottom = plistBool(d["labelOnBottom"]) ?? o.labelOnBottom
        o.showItemInfo = plistBool(d["showItemInfo"]) ?? o.showItemInfo
        o.showIconPreview = plistBool(d["showIconPreview"]) ?? o.showIconPreview
        return o
    }
}

extension ListOptions {
    static let order = ["name", "dateModified", "size", "kind", "dateCreated", "dateLastOpened", "dateAdded", "label", "version", "comments"]
    static let widths: [String: Int] = ["name": 300, "dateModified": 181, "size": 97, "kind": 115, "dateCreated": 181,
                                        "dateLastOpened": 200, "dateAdded": 181, "label": 100, "version": 75, "comments": 300]

    func isVisible(_ column: String, sortColumn: String) -> Bool {
        column == "name" || column == sortColumn || columns.contains(column)
    }

    private func common(into d: inout [String: Any], sortColumn: String) {
        d["sortColumn"] = sortColumn
        d["iconSize"] = largeIcons ? 32.0 : 16.0
        d["textSize"] = textSize
        d["useRelativeDates"] = relativeDates
        d["calculateAllSizes"] = calculateAllSizes
        d["showIconPreview"] = showIconPreview
        if d["viewOptionsVersion"] == nil { d["viewOptionsVersion"] = 1 }
    }

    /// `ListViewSettings` / `lsvp`: columns keyed by identifier.
    public func plist(sortColumn: String, ascending: Bool, existing: [String: Any]? = nil) -> [String: Any] {
        var d = existing ?? [:]
        var columns = d["columns"] as? [String: Any] ?? [:]
        for (index, id) in ListOptions.order.enumerated() {
            var column = columns[id] as? [String: Any] ?? ["index": index, "width": ListOptions.widths[id] ?? 150]
            column["visible"] = isVisible(id, sortColumn: sortColumn)
            if id == sortColumn { column["ascending"] = ascending } else if column["ascending"] == nil { column["ascending"] = true }
            columns[id] = column
        }
        d["columns"] = columns
        common(into: &d, sortColumn: sortColumn)
        return d
    }

    /// `ExtendedListViewSettingsV2` / `lsvP`: columns as an ordered array.
    public func extendedPlist(sortColumn: String, ascending: Bool, existing: [String: Any]? = nil) -> [String: Any] {
        var d = existing ?? [:]
        var columns = d["columns"] as? [[String: Any]] ?? []
        for id in ListOptions.order where !columns.contains(where: { $0["identifier"] as? String == id }) {
            columns.append(["identifier": id, "index": columns.count, "width": ListOptions.widths[id] ?? 150, "ascending": true])
        }
        for i in columns.indices {
            guard let id = columns[i]["identifier"] as? String else { continue }
            columns[i]["visible"] = isVisible(id, sortColumn: sortColumn)
            if id == sortColumn { columns[i]["ascending"] = ascending } else if columns[i]["ascending"] == nil { columns[i]["ascending"] = true }
        }
        d["columns"] = columns
        common(into: &d, sortColumn: sortColumn)
        return d
    }

    public static func read(_ d: [String: Any]?, extended: [String: Any]?) -> ListOptions {
        var o = ListOptions()
        guard let source = extended ?? d else { return o }
        o.largeIcons = (plistDouble(source["iconSize"]) ?? 16) >= 32
        o.textSize = plistDouble(source["textSize"]) ?? o.textSize
        o.relativeDates = plistBool(source["useRelativeDates"]) ?? o.relativeDates
        o.calculateAllSizes = plistBool(source["calculateAllSizes"]) ?? o.calculateAllSizes
        o.showIconPreview = plistBool(source["showIconPreview"]) ?? o.showIconPreview
        var visible = Set<String>()
        if let array = extended?["columns"] as? [[String: Any]] {
            for column in array where plistBool(column["visible"]) == true {
                if let id = column["identifier"] as? String, id != "name" { visible.insert(id) }
            }
        } else if let dict = d?["columns"] as? [String: Any] {
            for (id, value) in dict where id != "name" {
                if let column = value as? [String: Any], plistBool(column["visible"]) == true { visible.insert(id) }
            }
        } else {
            return o
        }
        o.columns = visible
        return o
    }
}

extension ColumnOptions {
    /// `ColumnViewOptions` in Finder's preferences.
    public func plist(arrangeBy code: String?, existing: [String: Any]? = nil) -> [String: Any] {
        var d = existing ?? [:]
        d["FontSize"] = Int(textSize)
        d["ColumnShowIcons"] = showIcons
        d["ShowIconThumbnails"] = showIconPreview
        d["ShowPreview"] = showPreviewColumn
        if let code { d["ArrangeBy"] = code }
        return d
    }

    public static func read(_ d: [String: Any]?) -> ColumnOptions {
        var o = ColumnOptions()
        guard let d else { return o }
        o.textSize = plistDouble(d["FontSize"]) ?? o.textSize
        o.showIcons = plistBool(d["ColumnShowIcons"]) ?? o.showIcons
        o.showIconPreview = plistBool(d["ShowIconThumbnails"]) ?? o.showIconPreview
        o.showPreviewColumn = plistBool(d["ShowPreview"]) ?? o.showPreviewColumn
        return o
    }
}

extension GalleryOptions {
    /// `GalleryViewSettings` / `glvp`.
    public func plist(arrangeBy: String, existing: [String: Any]? = nil) -> [String: Any] {
        var d = existing ?? [:]
        d["arrangeBy"] = arrangeBy
        d["iconSize"] = thumbnailSize
        d["showIconPreview"] = showIconPreview
        if d["viewOptionsVersion"] == nil { d["viewOptionsVersion"] = 1 }
        return d
    }

    public static func read(_ d: [String: Any]?) -> GalleryOptions {
        var o = GalleryOptions()
        guard let d else { return o }
        o.thumbnailSize = plistDouble(d["iconSize"]) ?? o.thumbnailSize
        o.showIconPreview = plistBool(d["showIconPreview"]) ?? o.showIconPreview
        return o
    }
}

public enum FinderPrefsError: Error, LocalizedError, Equatable {
    case unsupported
    case writeFailed(String)
    case verifyFailed(String)

    public var errorDescription: String? {
        switch self {
        case .unsupported: return "Finder preferences can only be changed on macOS."
        case .writeFailed(let domain): return "Could not save \(domain) preferences."
        case .verifyFailed(let key): return "Finder did not accept the new \(key)."
        }
    }
}

public enum FinderPrefs {
    public static let finderDomain = "com.apple.finder"
    public static let desktopServicesDomain = "com.apple.desktopservices"

    // MARK: Pure (testable everywhere)

    /// Merges the default view into Finder's `StandardViewSettings`, keeping keys not managed here.
    public static func standardViewSettings(_ s: ViewSettings, into existing: [String: Any]?) -> [String: Any] {
        var d = existing ?? [:]
        let v = s.default
        let sort = v.sortKey.rawValue
        d["IconViewSettings"] = v.options.icon.plist(arrangeBy: sort, existing: d["IconViewSettings"] as? [String: Any])
        d["ListViewSettings"] = v.options.list.plist(sortColumn: sort, ascending: v.ascending, existing: d["ListViewSettings"] as? [String: Any])
        d["ExtendedListViewSettingsV2"] = v.options.list.extendedPlist(sortColumn: sort, ascending: v.ascending,
                                                                        existing: d["ExtendedListViewSettingsV2"] as? [String: Any])
        d["GalleryViewSettings"] = v.options.gallery.plist(arrangeBy: sort, existing: d["GalleryViewSettings"] as? [String: Any])
        d["ViewStyle"] = v.mode.rawValue
        d["SettingsType"] = "StandardViewSettings"
        return d
    }

    /// The Desktop is an icon view too; it follows the same icon options and sort.
    public static func desktopViewSettings(_ s: ViewSettings, into existing: [String: Any]?) -> [String: Any] {
        var d = existing ?? [:]
        d["IconViewSettings"] = s.default.options.icon.plist(arrangeBy: s.default.sortKey.rawValue,
                                                             existing: d["IconViewSettings"] as? [String: Any])
        return d
    }

    public static func columnViewOptions(_ s: ViewSettings, into existing: [String: Any]?) -> [String: Any] {
        s.default.options.column.plist(arrangeBy: s.default.sortKey.columnCode, existing: existing)
    }

    // MARK: macOS

    #if os(macOS)
    private static func value(_ key: String, _ domain: String) -> Any? {
        CFPreferencesCopyAppValue(key as CFString, domain as CFString)
    }

    private static func set(_ value: Any?, _ key: String, _ domain: String) {
        CFPreferencesSetAppValue(key as CFString, value.map { $0 as AnyObject }, domain as CFString)
    }

    /// What Finder currently uses, for a first draft that matches reality.
    public static func read() -> ViewSettings {
        var s = ViewSettings()
        if let raw = value("FXPreferredViewStyle", finderDomain) as? String, let mode = ViewMode(rawValue: raw) {
            s.default.mode = mode
        }
        let standard = value("StandardViewSettings", finderDomain) as? [String: Any]
        let extended = standard?["ExtendedListViewSettingsV2"] as? [String: Any]
        let list = standard?["ListViewSettings"] as? [String: Any]
        if let raw = (extended?["sortColumn"] ?? list?["sortColumn"]) as? String, let key = SortKey(rawValue: raw) {
            s.default.sortKey = key
            s.default.ascending = key.defaultAscending
            if let columns = extended?["columns"] as? [[String: Any]],
               let column = columns.first(where: { $0["identifier"] as? String == raw }),
               let asc = plistBool(column["ascending"]) {
                s.default.ascending = asc
            }
        }
        if let raw = value("FXPreferredGroupBy", finderDomain) as? String, let group = GroupBy(rawValue: raw) {
            s.groupBy = group
        }
        s.foldersFirst = plistBool(value("_FXSortFoldersFirst", finderDomain)) ?? false
        s.default.options.icon = IconOptions.read(standard?["IconViewSettings"] as? [String: Any])
        s.default.options.list = ListOptions.read(list, extended: extended)
        s.default.options.gallery = GalleryOptions.read(standard?["GalleryViewSettings"] as? [String: Any])
        s.default.options.column = ColumnOptions.read(columnViewOptionsStored())
        return s
    }

    /// Writes the defaults and the `.DS_Store` switches, then reads them back.
    /// Finder must be relaunched afterwards.
    public static func write(_ s: ViewSettings) throws {
        set(s.default.mode.rawValue, "FXPreferredViewStyle", finderDomain)
        set(s.foldersFirst, "_FXSortFoldersFirst", finderDomain)
        set(s.foldersFirst, "_FXSortFoldersFirstOnDesktop", finderDomain)
        set(s.groupBy.rawValue, "FXPreferredGroupBy", finderDomain)
        set(s.default.sortKey.label, "FXArrangeGroupViewBy", finderDomain)
        set(standardViewSettings(s, into: value("StandardViewSettings", finderDomain) as? [String: Any]), "StandardViewSettings", finderDomain)
        set(desktopViewSettings(s, into: value("DesktopViewSettings", finderDomain) as? [String: Any]), "DesktopViewSettings", finderDomain)
        // Finder keeps the column view's options inside StandardViewOptions.
        var standardOptions = value("StandardViewOptions", finderDomain) as? [String: Any] ?? [:]
        standardOptions["ColumnViewOptions"] = columnViewOptions(s, into: columnViewOptionsStored())
        set(standardOptions, "StandardViewOptions", finderDomain)
        guard CFPreferencesAppSynchronize(finderDomain as CFString) else { throw FinderPrefsError.writeFailed("Finder") }
        try preventStores()
        let check = read()
        if check.default.mode != s.default.mode { throw FinderPrefsError.verifyFailed("view") }
        if check.default.sortKey != s.default.sortKey { throw FinderPrefsError.verifyFailed("sort order") }
        if Int(check.default.options.icon.iconSize) != Int(s.default.options.icon.iconSize) { throw FinderPrefsError.verifyFailed("icon size") }
    }

    private static func columnViewOptionsStored() -> [String: Any]? {
        (value("StandardViewOptions", finderDomain) as? [String: Any])?["ColumnViewOptions"] as? [String: Any]
    }

    /// Finder's own switches for not writing `.DS_Store` on network and USB disks. Always on.
    public static func preventStores() throws {
        let keys = ["DSDontWriteNetworkStores", "DSDontWriteUSBStores"]
        guard keys.contains(where: { plistBool(value($0, desktopServicesDomain)) != true }) else { return }
        for key in keys { set(true, key, desktopServicesDomain) }
        guard CFPreferencesAppSynchronize(desktopServicesDomain as CFString) else { throw FinderPrefsError.writeFailed("Desktop Services") }
    }
    #else
    public static func read() -> ViewSettings { ViewSettings() }
    public static func write(_ s: ViewSettings) throws { throw FinderPrefsError.unsupported }
    public static func preventStores() throws { throw FinderPrefsError.unsupported }
    #endif
}
