import Foundation

// Per-view-mode options, the same values Finder's View Options window edits.
// Each type can render itself as the dictionary Finder stores (globally in
// `StandardViewSettings`, per folder inside `.DS_Store`).

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

public struct IconViewOptions: Hashable, Codable {
    public var iconSize: Double = 64
    public var gridSpacing: Double = 54
    public var textSize: Double = 12
    public var labelOnBottom = true
    public var showItemInfo = false
    public var showIconPreview = true

    public init() {}

    enum CodingKeys: String, CodingKey { case iconSize, gridSpacing, textSize, labelOnBottom, showItemInfo, showIconPreview }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        iconSize = try c.decodeIfPresent(Double.self, forKey: .iconSize) ?? 64
        gridSpacing = try c.decodeIfPresent(Double.self, forKey: .gridSpacing) ?? 54
        textSize = try c.decodeIfPresent(Double.self, forKey: .textSize) ?? 12
        labelOnBottom = try c.decodeIfPresent(Bool.self, forKey: .labelOnBottom) ?? true
        showItemInfo = try c.decodeIfPresent(Bool.self, forKey: .showItemInfo) ?? false
        showIconPreview = try c.decodeIfPresent(Bool.self, forKey: .showIconPreview) ?? true
    }

    /// `IconViewSettings` / `icvp`. Keys Finder stored that we do not manage are kept.
    public func plist(arrangeBy: String, existing: [String: Any]? = nil) -> [String: Any] {
        var d = existing ?? [
            "backgroundColorBlue": 1.0, "backgroundColorGreen": 1.0, "backgroundColorRed": 1.0,
            "backgroundType": 0, "gridOffsetX": 0.0, "gridOffsetY": 0.0,
        ]
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

    public static func read(_ d: [String: Any]?) -> IconViewOptions {
        var o = IconViewOptions()
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

public struct ListViewOptions: Hashable, Codable {
    public var largeIcons = false
    public var textSize: Double = 12
    public var useRelativeDates = true
    public var calculateAllSizes = false
    public var showIconPreview = true
    /// Columns shown besides Name. The sort column is always shown.
    public var visibleColumns: Set<String> = ["dateModified", "size", "kind"]

    public init() {}

    enum CodingKeys: String, CodingKey { case largeIcons, textSize, useRelativeDates, calculateAllSizes, showIconPreview, visibleColumns }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        largeIcons = try c.decodeIfPresent(Bool.self, forKey: .largeIcons) ?? false
        textSize = try c.decodeIfPresent(Double.self, forKey: .textSize) ?? 12
        useRelativeDates = try c.decodeIfPresent(Bool.self, forKey: .useRelativeDates) ?? true
        calculateAllSizes = try c.decodeIfPresent(Bool.self, forKey: .calculateAllSizes) ?? false
        showIconPreview = try c.decodeIfPresent(Bool.self, forKey: .showIconPreview) ?? true
        visibleColumns = try c.decodeIfPresent(Set<String>.self, forKey: .visibleColumns) ?? ["dateModified", "size", "kind"]
    }

    public static let optionalColumns: [(id: String, label: String)] = [
        ("dateModified", "Date Modified"), ("dateCreated", "Date Created"), ("dateLastOpened", "Date Last Opened"),
        ("dateAdded", "Date Added"), ("size", "Size"), ("kind", "Kind"), ("version", "Version"),
        ("comments", "Comments"), ("label", "Tags"),
    ]
    static let columnOrder = ["name", "dateModified", "size", "kind", "dateCreated", "dateLastOpened", "dateAdded", "label", "version", "comments"]
    static let columnWidths: [String: Int] = [
        "name": 300, "dateModified": 181, "size": 97, "kind": 115, "dateCreated": 181,
        "dateLastOpened": 200, "dateAdded": 181, "label": 100, "version": 75, "comments": 300,
    ]

    public func isVisible(_ column: String, sortColumn: String) -> Bool {
        column == "name" || column == sortColumn || visibleColumns.contains(column)
    }

    private func baseKeys(into d: inout [String: Any], sortColumn: String) {
        d["sortColumn"] = sortColumn
        d["iconSize"] = largeIcons ? 32.0 : 16.0
        d["textSize"] = textSize
        d["useRelativeDates"] = useRelativeDates
        d["calculateAllSizes"] = calculateAllSizes
        d["showIconPreview"] = showIconPreview
        if d["viewOptionsVersion"] == nil { d["viewOptionsVersion"] = 1 }
    }

    /// `ListViewSettings` / `lsvp`: columns keyed by identifier.
    public func plist(sortColumn: String, ascending: Bool, existing: [String: Any]? = nil) -> [String: Any] {
        var d = existing ?? [:]
        var columns = d["columns"] as? [String: Any] ?? [:]
        for (index, id) in ListViewOptions.columnOrder.enumerated() {
            var column = columns[id] as? [String: Any] ?? ["index": index, "width": ListViewOptions.columnWidths[id] ?? 150]
            column["visible"] = isVisible(id, sortColumn: sortColumn)
            if id == sortColumn { column["ascending"] = ascending } else if column["ascending"] == nil { column["ascending"] = true }
            columns[id] = column
        }
        d["columns"] = columns
        baseKeys(into: &d, sortColumn: sortColumn)
        return d
    }

    /// `ExtendedListViewSettingsV2` / `lsvP`: columns as an ordered array.
    public func extendedPlist(sortColumn: String, ascending: Bool, existing: [String: Any]? = nil) -> [String: Any] {
        var d = existing ?? [:]
        var columns = d["columns"] as? [[String: Any]] ?? []
        for id in ListViewOptions.columnOrder where !columns.contains(where: { $0["identifier"] as? String == id }) {
            columns.append(["identifier": id, "index": columns.count, "width": ListViewOptions.columnWidths[id] ?? 150, "ascending": true])
        }
        for i in columns.indices {
            guard let id = columns[i]["identifier"] as? String else { continue }
            columns[i]["visible"] = isVisible(id, sortColumn: sortColumn)
            if id == sortColumn { columns[i]["ascending"] = ascending } else if columns[i]["ascending"] == nil { columns[i]["ascending"] = true }
        }
        d["columns"] = columns
        baseKeys(into: &d, sortColumn: sortColumn)
        return d
    }

    public static func read(_ d: [String: Any]?, extended: [String: Any]?) -> ListViewOptions {
        var o = ListViewOptions()
        let source = extended ?? d
        guard let source else { return o }
        o.largeIcons = (plistDouble(source["iconSize"]) ?? 16) >= 32
        o.textSize = plistDouble(source["textSize"]) ?? o.textSize
        o.useRelativeDates = plistBool(source["useRelativeDates"]) ?? o.useRelativeDates
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
        o.visibleColumns = visible
        return o
    }
}

public struct ColumnViewOptions: Hashable, Codable {
    public var textSize = 12
    public var showIcons = true
    public var showIconPreview = true
    public var showPreviewColumn = true

    public init() {}

    enum CodingKeys: String, CodingKey { case textSize, showIcons, showIconPreview, showPreviewColumn }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        textSize = try c.decodeIfPresent(Int.self, forKey: .textSize) ?? 12
        showIcons = try c.decodeIfPresent(Bool.self, forKey: .showIcons) ?? true
        showIconPreview = try c.decodeIfPresent(Bool.self, forKey: .showIconPreview) ?? true
        showPreviewColumn = try c.decodeIfPresent(Bool.self, forKey: .showPreviewColumn) ?? true
    }

    /// `ColumnViewOptions` in Finder's preferences (column view has no per-folder options).
    public func plist(arrangeBy code: String?, existing: [String: Any]? = nil) -> [String: Any] {
        var d = existing ?? [:]
        d["FontSize"] = textSize
        d["ColumnShowIcons"] = showIcons
        d["ShowIconThumbnails"] = showIconPreview
        d["ShowPreview"] = showPreviewColumn
        if let code { d["ArrangeBy"] = code }
        return d
    }

    public static func read(_ d: [String: Any]?) -> ColumnViewOptions {
        var o = ColumnViewOptions()
        guard let d else { return o }
        o.textSize = plistDouble(d["FontSize"]).map(Int.init) ?? o.textSize
        o.showIcons = plistBool(d["ColumnShowIcons"]) ?? o.showIcons
        o.showIconPreview = plistBool(d["ShowIconThumbnails"]) ?? o.showIconPreview
        o.showPreviewColumn = plistBool(d["ShowPreview"]) ?? o.showPreviewColumn
        return o
    }
}

public struct GalleryViewOptions: Hashable, Codable {
    public var thumbnailSize: Double = 48
    public var showIconPreview = true

    public init() {}

    enum CodingKeys: String, CodingKey { case thumbnailSize, showIconPreview }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        thumbnailSize = try c.decodeIfPresent(Double.self, forKey: .thumbnailSize) ?? 48
        showIconPreview = try c.decodeIfPresent(Bool.self, forKey: .showIconPreview) ?? true
    }

    /// `GalleryViewSettings` / `glvp`.
    public func plist(arrangeBy: String, existing: [String: Any]? = nil) -> [String: Any] {
        var d = existing ?? [:]
        d["arrangeBy"] = arrangeBy
        d["iconSize"] = thumbnailSize
        d["showIconPreview"] = showIconPreview
        if d["viewOptionsVersion"] == nil { d["viewOptionsVersion"] = 1 }
        return d
    }

    public static func read(_ d: [String: Any]?) -> GalleryViewOptions {
        var o = GalleryViewOptions()
        guard let d else { return o }
        o.thumbnailSize = plistDouble(d["iconSize"]) ?? o.thumbnailSize
        o.showIconPreview = plistBool(d["showIconPreview"]) ?? o.showIconPreview
        return o
    }
}

public struct ViewOptions: Hashable, Codable {
    public var icon = IconViewOptions()
    public var list = ListViewOptions()
    public var column = ColumnViewOptions()
    public var gallery = GalleryViewOptions()

    public init() {}

    enum CodingKeys: String, CodingKey { case icon, list, column, gallery }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        icon = try c.decodeIfPresent(IconViewOptions.self, forKey: .icon) ?? IconViewOptions()
        list = try c.decodeIfPresent(ListViewOptions.self, forKey: .list) ?? ListViewOptions()
        column = try c.decodeIfPresent(ColumnViewOptions.self, forKey: .column) ?? ColumnViewOptions()
        gallery = try c.decodeIfPresent(GalleryViewOptions.self, forKey: .gallery) ?? GalleryViewOptions()
    }
}

// MARK: - Per-folder views

/// A folder that keeps its own view, stored in its `.DS_Store`, which sweeps then leave alone.
public struct FolderView: Codable, Identifiable, Hashable {
    public var id: UUID
    public var path: String
    public var isEnabled: Bool
    public var viewStyle: FinderViewStyle
    public var sortKey: FinderSortKey
    public var ascending: Bool
    public var options: ViewOptions
    /// Apply the same view to every folder beneath, except folders with their own view.
    public var includeSubfolders: Bool

    public init(id: UUID = UUID(), path: String, isEnabled: Bool = true, viewStyle: FinderViewStyle = .icons,
                sortKey: FinderSortKey = .name, ascending: Bool? = nil, options: ViewOptions = ViewOptions(),
                includeSubfolders: Bool = true) {
        self.id = id
        self.path = SafetyPolicy.standardize(path)
        self.isEnabled = isEnabled
        self.viewStyle = viewStyle
        self.sortKey = sortKey
        self.ascending = ascending ?? sortKey.defaultAscending
        self.options = options
        self.includeSubfolders = includeSubfolders
    }

    enum CodingKeys: String, CodingKey { case id, path, isEnabled, viewStyle, sortKey, ascending, options, includeSubfolders }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        path = SafetyPolicy.standardize(try c.decode(String.self, forKey: .path))
        isEnabled = try c.decodeIfPresent(Bool.self, forKey: .isEnabled) ?? true
        viewStyle = try c.decodeIfPresent(FinderViewStyle.self, forKey: .viewStyle) ?? .icons
        sortKey = try c.decodeIfPresent(FinderSortKey.self, forKey: .sortKey) ?? .name
        ascending = try c.decodeIfPresent(Bool.self, forKey: .ascending) ?? sortKey.defaultAscending
        options = try c.decodeIfPresent(ViewOptions.self, forKey: .options) ?? ViewOptions()
        includeSubfolders = try c.decodeIfPresent(Bool.self, forKey: .includeSubfolders) ?? true
    }

    public var dsStorePath: String { path + "/.DS_Store" }

    /// The same view for a folder beneath this one.
    public func derived(for subfolder: String) -> FolderView {
        var copy = self
        copy.path = SafetyPolicy.standardize(subfolder)
        return copy
    }

    public var displayName: String {
        let home = NSHomeDirectory()
        if path == home { return "Home" }
        if path.hasPrefix(home + "/") { return "~" + path.dropFirst(home.count) }
        return path
    }

    public var summary: String {
        var parts = [viewStyle.label, "by " + sortKey.label]
        switch viewStyle {
        case .icons: parts.append("\(Int(options.icon.iconSize)) px")
        case .gallery: parts.append("\(Int(options.gallery.thumbnailSize)) px")
        case .list: if options.list.largeIcons { parts.append("large icons") }
        case .columns: break
        }
        if includeSubfolders { parts.append("with subfolders") }
        return parts.joined(separator: " · ")
    }

    /// Pictures as large icons, Movies as a gallery. Fixed ids so the entries are the
    /// same on every launch and in every settings file.
    public static let picturesID = UUID(uuidString: "5B2E1C1A-6F3D-4B8E-9C1D-000000000001")!
    public static let moviesID = UUID(uuidString: "5B2E1C1A-6F3D-4B8E-9C1D-000000000002")!

    public static func seeded(home: String = NSHomeDirectory()) -> [FolderView] {
        var pictures = FolderView(id: picturesID, path: home + "/Pictures", viewStyle: .icons)
        pictures.options.icon.iconSize = 128
        pictures.options.icon.gridSpacing = 70
        var movies = FolderView(id: moviesID, path: home + "/Movies", viewStyle: .gallery)
        movies.options.gallery.thumbnailSize = 128
        return [pictures, movies]
    }
}

/// Writes a folder's view into its `.DS_Store`, keeping whatever else Finder stored there.
public enum FolderViewWriter {
    /// Record ids that describe the folder's own view. `vstl` is what Finder writes for
    /// "Always open in … view"; `icvl` is the form DMG tools use and Finder also honours.
    public static let managedIDs: Set<String> = ["vstl", "icvl", "vSrn", "icvp", "icvo", "lsvp", "lsvP", "lsvo", "glvp"]

    /// Window settings Finder expects next to a folder's view; only added when none exist.
    static let defaultWindowSettings: [String: Any] = [
        "ContainerShowSidebar": true, "ShowPathbar": true, "ShowSidebar": true, "ShowStatusBar": true,
        "ShowTabView": false, "ShowToolbar": true, "SidebarWidth": 192, "WindowBounds": "{{120, 120}, {920, 600}}",
    ]

    public static func plistData(_ dictionary: [String: Any]) throws -> Data {
        do {
            return try PropertyListSerialization.data(fromPropertyList: dictionary, format: .binary, options: 0)
        } catch {
            return try PropertyListSerialization.data(fromPropertyList: dictionary, format: .xml, options: 0)
        }
    }

    public static func records(for view: FolderView) throws -> [DSStoreRecord] {
        var out = [
            DSStoreRecord(filename: ".", structID: "vstl", value: .type(view.viewStyle.rawValue)),
            DSStoreRecord(filename: ".", structID: "icvl", value: .type(view.viewStyle.rawValue)),
            DSStoreRecord(filename: ".", structID: "vSrn", value: .long(1)),
        ]
        let sort = view.sortKey.rawValue
        switch view.viewStyle {
        case .icons:
            out.append(DSStoreRecord(filename: ".", structID: "icvp",
                                     value: .blob(try plistData(view.options.icon.plist(arrangeBy: sort)))))
        case .list:
            out.append(DSStoreRecord(filename: ".", structID: "lsvp",
                                     value: .blob(try plistData(view.options.list.plist(sortColumn: sort, ascending: view.ascending)))))
            out.append(DSStoreRecord(filename: ".", structID: "lsvP",
                                     value: .blob(try plistData(view.options.list.extendedPlist(sortColumn: sort, ascending: view.ascending)))))
        case .gallery:
            out.append(DSStoreRecord(filename: ".", structID: "glvp",
                                     value: .blob(try plistData(view.options.gallery.plist(arrangeBy: sort)))))
        case .columns:
            break
        }
        return out
    }

    static func isDefaultWindowSettings(_ data: Data) -> Bool {
        guard let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil),
              let dictionary = plist as? [String: Any] else { return false }
        return NSDictionary(dictionary: dictionary).isEqual(to: defaultWindowSettings)
    }

    static func existingFile(at url: URL) -> DSStoreFile? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? DSStoreFile.read(data)
    }

    @discardableResult
    public static func write(_ view: FolderView, fileManager: FileManager = .default) throws -> URL {
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: view.path, isDirectory: &isDirectory), isDirectory.boolValue else {
            throw ScanError.notADirectory(view.path)
        }
        let url = URL(fileURLWithPath: view.dsStorePath)
        var file = existingFile(at: url) ?? DSStoreFile()
        file.records.removeAll { $0.filename == "." && managedIDs.contains($0.structID) }
        var fresh = try records(for: view)
        if !file.records.contains(where: { $0.filename == "." && $0.structID == "bwsp" }) {
            fresh.append(DSStoreRecord(filename: ".", structID: "bwsp", value: .blob(try plistData(defaultWindowSettings))))
        }
        file.records += fresh
        let data: Data
        do {
            data = try file.encoded()
        } catch DSStoreError.tooManyRecords {
            data = try DSStoreFile(records: fresh).encoded()
        }
        try data.write(to: url, options: .atomic)
        return url
    }

    /// Folders beneath `view.path` that inherit its view: not hidden, not packages,
    /// not symlinks, on the same volume, and not inside another folder view.
    public static func subfolders(of view: FolderView, excluding otherRoots: [String], fileManager: FileManager = .default) -> [String] {
        guard view.includeSubfolders, let rootDevice = FileStats.info(view.path)?.device else { return [] }
        let stops = Set(otherRoots.map(SafetyPolicy.standardize)).subtracting([view.path])
        var out: [String] = []
        var stack = [view.path]
        while let dir = stack.popLast() {
            guard let names = try? fileManager.contentsOfDirectory(atPath: dir) else { continue }
            for name in names.sorted() where !name.hasPrefix(".") && name != "node_modules" {
                let path = dir + "/" + name
                guard let st = FileStats.info(path), st.isDirectory, !st.isSymlink, st.device == rootDevice else { continue }
                if stops.contains(path) { continue }
                if JunkScanner.isPackage(path: path, name: name) { continue }
                out.append(path)
                stack.append(path)
            }
        }
        return out
    }

    /// Writes the view into the folder and, when it includes subfolders, into each of them.
    /// Returns how many folders were written; individual subfolder failures are skipped.
    @discardableResult
    public static func writeTree(_ view: FolderView, excluding otherRoots: [String], fileManager: FileManager = .default) throws -> Int {
        try write(view, fileManager: fileManager)
        var count = 1
        for subfolder in subfolders(of: view, excluding: otherRoots, fileManager: fileManager) {
            if (try? write(view.derived(for: subfolder), fileManager: fileManager)) != nil { count += 1 }
        }
        return count
    }

    /// Strips the view from the folder and every subfolder it covered.
    public static func removeTree(_ view: FolderView, excluding otherRoots: [String], fileManager: FileManager = .default) {
        try? remove(view, fileManager: fileManager)
        for subfolder in subfolders(of: view, excluding: otherRoots, fileManager: fileManager) {
            try? remove(view.derived(for: subfolder), fileManager: fileManager)
        }
    }

    /// Removes the folder's view; the file goes too once nothing else is in it.
    public static func remove(_ view: FolderView, fileManager: FileManager = .default) throws {
        let url = URL(fileURLWithPath: view.dsStorePath)
        guard fileManager.fileExists(atPath: url.path) else { return }
        guard var file = existingFile(at: url) else {
            try fileManager.removeItem(at: url)
            return
        }
        file.records.removeAll { $0.filename == "." && managedIDs.contains($0.structID) }
        // The window record is ours only if it still holds exactly the default we added.
        file.records.removeAll { record in
            guard record.filename == ".", record.structID == "bwsp", case .blob(let data) = record.value else { return false }
            return isDefaultWindowSettings(data)
        }
        if file.records.isEmpty {
            try fileManager.removeItem(at: url)
        } else {
            try file.encoded().write(to: url, options: .atomic)
        }
    }
}
