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
/// Every `.DS_Store` Winnow maintains for a set of folder views.
///
/// Finder keeps a folder's view ("Always open in … view") in the parent folder's
/// `.DS_Store`, under the folder's name. Only when the parent cannot be written, or
/// the folder is the root of its volume, does the record go into the folder's own
/// store under ".". Winnow writes records where Finder looks for them. Any view
/// record Finder adds to a managed store is dropped again, so a view changed in
/// Finder is never persisted.
public struct FolderViewPlan {
    public let views: [FolderView]
    let roots: [String: FolderView]
    let fileManager: FileManager

    /// Only enabled views whose folder exists take part.
    public init(views: [FolderView], fileManager: FileManager = .default) {
        self.views = views.filter { $0.isEnabled && FileStats.info($0.path)?.isDirectory == true }
        roots = Dictionary(self.views.map { ($0.path, $0) }, uniquingKeysWith: { a, _ in a })
        self.fileManager = fileManager
    }

    public var isEmpty: Bool { roots.isEmpty }

    static func parent(of path: String) -> String {
        SafetyPolicy.standardize(NSString(string: path).deletingLastPathComponent)
    }

    /// The directory whose `.DS_Store` holds `folder`'s view: its parent, unless the
    /// folder is a volume root or the parent cannot be written, then the folder itself.
    public func storeDirectory(for folder: String) -> String {
        let f = SafetyPolicy.standardize(folder)
        let parent = FolderViewPlan.parent(of: f)
        guard f != "/", parent != f, !SafetyPolicy().isProtected(parent), fileManager.isWritableFile(atPath: parent),
              let own = FileStats.info(f), let up = FileStats.info(parent), own.device == up.device else { return f }
        return parent
    }

    /// A folder Finder shows and a view can flow into: visible, not a package, a real
    /// directory on the same device as its parent.
    static func isBrowsable(_ path: String, name: String, device: UInt64?) -> Bool {
        guard !name.hasPrefix("."), name != "node_modules" else { return false }
        guard let st = FileStats.info(path), st.isDirectory, !st.isSymlink else { return false }
        if let device, st.device != device { return false }
        return !JunkScanner.isPackage(path: path, name: name)
    }

    /// The view that applies to `directory`: its own root, or the deepest root above it
    /// that includes subfolders and reaches it through browsable folders only.
    public func view(covering directory: String) -> FolderView? {
        let d = SafetyPolicy.standardize(directory)
        if let exact = roots[d] { return exact }
        let owner = roots.values.filter { d.hasPrefix($0.path + "/") }.max { $0.path.count < $1.path.count }
        guard let owner, owner.includeSubfolders else { return nil }
        let device = FileStats.info(owner.path)?.device
        var node = owner.path
        for component in d.dropFirst(owner.path.count + 1).split(separator: "/").map(String.init) {
            node += "/" + component
            guard FolderViewPlan.isBrowsable(node, name: component, device: device) else { return nil }
        }
        return owner.derived(for: d)
    }

    /// The records the store in `directory` should hold, without window records:
    /// one set per child folder that has a view, and a "." set when the directory's
    /// own view cannot live in its parent. `full` includes option blobs per child.
    public func records(in directory: String, full: Bool = true) throws -> [DSStoreRecord] {
        let d = SafetyPolicy.standardize(directory)
        var out: [DSStoreRecord] = []
        let own = view(covering: d)
        if let own, storeDirectory(for: d) == d {
            out += try FolderViewWriter.records(for: own)
        }
        guard let names = try? fileManager.contentsOfDirectory(atPath: d) else { return out }
        let device = FileStats.info(d)?.device
        for name in names.sorted() {
            let child = d + "/" + name
            let childView: FolderView?
            if let root = roots[child] {
                childView = root
            } else if let own, own.includeSubfolders, FolderViewPlan.isBrowsable(child, name: name, device: device) {
                childView = own.derived(for: child)
            } else {
                childView = nil
            }
            guard let childView, storeDirectory(for: child) == d else { continue }
            out += try FolderViewWriter.records(for: childView, as: name, full: full)
        }
        return out
    }

    /// Whether the `.DS_Store` in `directory` is Winnow's to keep and rewrite.
    public func manages(storeIn directory: String) -> Bool {
        let d = SafetyPolicy.standardize(directory)
        guard !roots.isEmpty else { return false }
        let near = view(covering: d) != nil || roots.values.contains { FolderViewPlan.parent(of: $0.path) == d }
        guard near else { return false }
        return !((try? records(in: d, full: false)) ?? []).isEmpty
    }

    /// Whether `path` is a `.DS_Store` this plan manages.
    public func manages(store path: String) -> Bool {
        let p = SafetyPolicy.standardize(path)
        guard NSString(string: p).lastPathComponent == ".DS_Store" else { return false }
        return manages(storeIn: FolderViewPlan.parent(of: p))
    }

    /// Folders beneath a root that inherit its view: browsable folders on the same
    /// device, stopping at other roots.
    public func subfolders(of root: FolderView) -> [String] {
        guard root.includeSubfolders, let device = FileStats.info(root.path)?.device else { return [] }
        var out: [String] = []
        var stack = [root.path]
        while let dir = stack.popLast() {
            guard let names = try? fileManager.contentsOfDirectory(atPath: dir) else { continue }
            for name in names.sorted() {
                let path = dir + "/" + name
                guard roots[path] == nil, FolderViewPlan.isBrowsable(path, name: name, device: device) else { continue }
                out.append(path)
                stack.append(path)
            }
        }
        return out
    }

    /// Every directory whose store may hold records: where each root's own record
    /// lives, the root, and the folders beneath it when it includes subfolders.
    public func directories() -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        func add(_ path: String) {
            if seen.insert(path).inserted { out.append(path) }
        }
        for root in views.sorted(by: { $0.path < $1.path }) {
            add(storeDirectory(for: root.path))
            add(root.path)
            subfolders(of: root).forEach(add)
        }
        return out
    }
}

public enum FolderViewWriter {
    /// Record ids that describe a folder's view. `vstl` is "Always open in … view";
    /// the rest are the per-style option blobs (older forms included, so they get stripped).
    public static let managedIDs: Set<String> = ["vstl", "icvl", "vSrn", "icvp", "icvo", "lsvp", "lsvP", "lsvo", "glvp"]

    /// Window settings Finder expects next to a view; only added when none exist.
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

    /// The view's records, filed under `filename`: "." for the folder's own store, the
    /// folder's name for its parent's store.
    public static func records(for view: FolderView, as filename: String = ".", full: Bool = true) throws -> [DSStoreRecord] {
        var out = [
            DSStoreRecord(filename: filename, structID: "vstl", value: .type(view.viewStyle.rawValue)),
            DSStoreRecord(filename: filename, structID: "vSrn", value: .long(1)),
        ]
        guard full else { return out }
        let sort = view.sortKey.rawValue
        switch view.viewStyle {
        case .icons:
            out.append(DSStoreRecord(filename: filename, structID: "icvp",
                                     value: .blob(try plistData(view.options.icon.plist(arrangeBy: sort)))))
        case .list:
            out.append(DSStoreRecord(filename: filename, structID: "lsvp",
                                     value: .blob(try plistData(view.options.list.plist(sortColumn: sort, ascending: view.ascending)))))
            out.append(DSStoreRecord(filename: filename, structID: "lsvP",
                                     value: .blob(try plistData(view.options.list.extendedPlist(sortColumn: sort, ascending: view.ascending)))))
        case .gallery:
            out.append(DSStoreRecord(filename: filename, structID: "glvp",
                                     value: .blob(try plistData(view.options.gallery.plist(arrangeBy: sort)))))
        case .columns:
            break
        }
        return out
    }

    static func isDefaultWindowSettings(_ data: Data) -> Bool {
        guard let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) else { return false }
        return canonical(plist) == canonical(defaultWindowSettings)
    }

    /// Order- and number-type-independent rendering of a plist value, so a decoded
    /// copy compares equal to the original on every platform.
    static func canonical(_ value: Any) -> String {
        if let b = value as? Bool { return "n:\(b ? 1.0 : 0.0)" }
        if let d = plistDouble(value) { return "n:\(d)" }
        if let s = value as? String { return "s:" + s }
        if let data = value as? Data { return "d:" + data.map { String(format: "%02x", $0) }.joined() }
        if let dictionary = value as? [String: Any] {
            return "{" + dictionary.keys.sorted().map { "\($0)=" + canonical(dictionary[$0]!) }.joined(separator: ",") + "}"
        }
        if let array = value as? [Any] { return "[" + array.map(canonical).joined(separator: ",") + "]" }
        return "?:" + String(describing: value)
    }

    /// Whether two record values mean the same thing (blobs compare as plists when they parse).
    static func equivalent(_ a: DSStoreRecord.Value, _ b: DSStoreRecord.Value) -> Bool {
        if a == b { return true }
        guard case .blob(let da) = a, case .blob(let db) = b,
              let pa = try? PropertyListSerialization.propertyList(from: da, options: [], format: nil),
              let pb = try? PropertyListSerialization.propertyList(from: db, options: [], format: nil) else { return false }
        return canonical(pa) == canonical(pb)
    }

    /// Whether two record sets are the same, ignoring order and blob encoding.
    public static func equivalent(_ a: [DSStoreRecord], _ b: [DSStoreRecord]) -> Bool {
        guard a.count == b.count else { return false }
        let sa = a.sorted(by: DSStoreRecord.ordered), sb = b.sorted(by: DSStoreRecord.ordered)
        for (x, y) in zip(sa, sb) {
            guard x.filename == y.filename, x.structID == y.structID, equivalent(x.value, y.value) else { return false }
        }
        return true
    }

    static func existingFile(at url: URL) -> DSStoreFile? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? DSStoreFile.read(data)
    }

    /// The complete contents for a managed store: the plan's records plus a window
    /// record per viewed name, reusing the one Finder already wrote when there is one.
    static func contents(for directory: String, plan: FolderViewPlan, existing: DSStoreFile?, full: Bool) throws -> [DSStoreRecord]? {
        let expected = try plan.records(in: directory, full: full)
        guard !expected.isEmpty else { return nil }
        var out = expected
        for name in Set(expected.filter { $0.structID == "vstl" }.map(\.filename)).sorted() {
            if let window = existing?.records.first(where: { $0.filename == name && $0.structID == "bwsp" }) {
                out.append(window)
            } else {
                out.append(DSStoreRecord(filename: name, structID: "bwsp", value: .blob(try plistData(defaultWindowSettings))))
            }
        }
        return out
    }

    /// Brings the store in `directory` to exactly what the plan says. Returns true when
    /// the file was written, false when it already matched or the plan has nothing for it.
    @discardableResult
    public static func write(directory: String, plan: FolderViewPlan) throws -> Bool {
        let d = SafetyPolicy.standardize(directory)
        var isDirectory: ObjCBool = false
        guard plan.fileManager.fileExists(atPath: d, isDirectory: &isDirectory), isDirectory.boolValue else {
            throw ScanError.notADirectory(d)
        }
        let url = URL(fileURLWithPath: d + "/.DS_Store")
        let existing = existingFile(at: url)
        guard let wanted = try contents(for: d, plan: plan, existing: existing, full: true) else {
            // Nothing belongs here: view records left behind (ours or Finder's) go, other records stay.
            let existed = plan.fileManager.fileExists(atPath: url.path)
            try remove(directory: d, fileManager: plan.fileManager)
            return existed && !plan.fileManager.fileExists(atPath: url.path)
        }
        if let existing, equivalent(existing.records, wanted) { return false }
        let data: Data
        do {
            data = try DSStoreFile(records: wanted).encoded()
        } catch DSStoreError.tooManyRecords {
            // Too many subfolders for one store: keep every child's view style, drop their options.
            let slim = try contents(for: d, plan: plan, existing: existing, full: false) ?? wanted
            if let existing, equivalent(existing.records, slim) { return false }
            data = try DSStoreFile(records: slim).encoded()
        }
        try data.write(to: url, options: .atomic)
        return true
    }

    /// Writes every store in the plan. Returns how many folders now carry a view;
    /// failures inside a root's tree are skipped, a failure on a root's own store is thrown.
    @discardableResult
    public static func apply(_ plan: FolderViewPlan) throws -> Int {
        var count = 0
        var rootFailure: Error?
        let rootStores = Set(plan.views.map { plan.storeDirectory(for: $0.path) })
        for directory in plan.directories() {
            do {
                try write(directory: directory, plan: plan)
                count += try plan.records(in: directory, full: false).filter { $0.structID == "vstl" }.count
            } catch {
                if rootStores.contains(directory), rootFailure == nil { rootFailure = error }
            }
        }
        if let rootFailure { throw rootFailure }
        return count
    }

    /// Strips Winnow's records from the store in `directory`; the file goes once nothing else is in it.
    public static func remove(directory: String, fileManager: FileManager = .default) throws {
        let url = URL(fileURLWithPath: SafetyPolicy.standardize(directory) + "/.DS_Store")
        guard fileManager.fileExists(atPath: url.path) else { return }
        guard var file = existingFile(at: url) else {
            try fileManager.removeItem(at: url)
            return
        }
        file.records.removeAll { managedIDs.contains($0.structID) }
        // A window record is ours only while it still holds exactly the default we added.
        file.records.removeAll { record in
            guard record.structID == "bwsp", case .blob(let data) = record.value else { return false }
            return isDefaultWindowSettings(data)
        }
        if file.records.isEmpty {
            try fileManager.removeItem(at: url)
        } else {
            try file.encoded().write(to: url, options: .atomic)
        }
    }

    /// Strips every store a plan wrote.
    public static func retire(_ plan: FolderViewPlan) {
        for directory in plan.directories() {
            try? remove(directory: directory, fileManager: plan.fileManager)
        }
    }
}
