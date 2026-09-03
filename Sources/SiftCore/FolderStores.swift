import Foundation

/// The `.DS_Store` files that carry folder views.
///
/// Finder keeps a folder's own view ("Always open in … view") in the parent
/// folder's `.DS_Store` under the folder's name; only a volume root, or a folder
/// whose parent cannot be written, keeps it in its own store under ".". Sift
/// writes the record where Finder looks for it and holds the store to exactly
/// that: anything Finder adds is dropped again, so a view changed in Finder never
/// outlives the window it was changed in. Subfolders need no record: a window
/// keeps its view while browsing down, and the window guard covers the rest.
public struct StorePlan: Hashable {
    /// Records per store directory, keyed by the directory (not the file).
    public let stores: [String: [DSRecord]]

    /// Only folders that exist take part.
    public init(settings: ViewSettings, safety: Safety = Safety(), fileManager: FileManager = .default) {
        var stores: [String: [DSRecord]] = [:]
        for folder in settings.folders where Files.isDirectory(folder.path) && !safety.isProtected(folder.path) {
            let directory = StorePlan.storeDirectory(for: folder.path, safety: safety, fileManager: fileManager)
            let name = directory == folder.path ? "." : Path.name(of: folder.path)
            if let records = try? StorePlan.records(for: folder.view, as: name) {
                stores[directory, default: []] += records
            }
        }
        self.stores = stores
    }

    public var isEmpty: Bool { stores.isEmpty }

    /// Paths of every managed `.DS_Store`.
    public var storePaths: Set<String> { Set(stores.keys.map { $0 + "/.DS_Store" }) }

    /// The directory whose `.DS_Store` holds `folder`'s view.
    public static func storeDirectory(for folder: String, safety: Safety = Safety(), fileManager: FileManager = .default) -> String {
        let f = Path.standardize(folder)
        let parent = Path.parent(of: f)
        guard f != "/", parent != f, !safety.isProtected(parent), fileManager.isWritableFile(atPath: parent),
              let own = Files.info(f), let up = Files.info(parent), own.device == up.device else { return f }
        return parent
    }

    /// Record ids that describe a view. Anything else Finder writes is not kept.
    public static let viewIDs: Set<String> = ["vstl", "vSrn", "icvp", "lsvp", "lsvP", "glvp", "bwsp"]

    /// Window settings Finder expects next to a view.
    static let defaultWindow: [String: Any] = [
        "ContainerShowSidebar": true, "ShowPathbar": true, "ShowSidebar": true, "ShowStatusBar": true,
        "ShowTabView": false, "ShowToolbar": true, "SidebarWidth": 192, "WindowBounds": "{{120, 120}, {920, 600}}",
    ]

    /// A view as records filed under `name`: "." for the folder's own store, the
    /// folder's name for its parent's.
    public static func records(for view: FinderView, as name: String) throws -> [DSRecord] {
        var out = [
            DSRecord(filename: name, structID: "vstl", value: .type(view.mode.rawValue)),
            DSRecord(filename: name, structID: "vSrn", value: .long(1)),
        ]
        let sort = view.sortKey.rawValue
        switch view.mode {
        case .icons:
            out.append(DSRecord(filename: name, structID: "icvp", value: .blob(try Plist.data(view.options.icon.plist(arrangeBy: sort)))))
        case .list:
            out.append(DSRecord(filename: name, structID: "lsvp",
                                value: .blob(try Plist.data(view.options.list.plist(sortColumn: sort, ascending: view.ascending)))))
            out.append(DSRecord(filename: name, structID: "lsvP",
                                value: .blob(try Plist.data(view.options.list.extendedPlist(sortColumn: sort, ascending: view.ascending)))))
        case .gallery:
            out.append(DSRecord(filename: name, structID: "glvp", value: .blob(try Plist.data(view.options.gallery.plist(arrangeBy: sort)))))
        case .columns:
            break
        }
        return out
    }

    /// The complete contents for a managed store: the plan's records plus a window
    /// record per viewed name, reusing the one Finder already wrote when there is one.
    public func contents(of directory: String, existing: DSStore?) throws -> [DSRecord]? {
        guard let planned = stores[Path.standardize(directory)] else { return nil }
        var out = planned
        for name in Set(planned.map(\.filename)).sorted() {
            if let window = existing?.records.first(where: { $0.filename == name && $0.structID == "bwsp" }) {
                out.append(window)
            } else {
                out.append(DSRecord(filename: name, structID: "bwsp", value: .blob(try Plist.data(StorePlan.defaultWindow))))
            }
        }
        return out
    }

    static func existing(at url: URL) -> DSStore? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? DSStore.read(data)
    }

    /// Brings one managed store to exactly what the plan says. Returns true when
    /// the file was written.
    @discardableResult
    public func write(directory: String) throws -> Bool {
        let d = Path.standardize(directory)
        let url = URL(fileURLWithPath: d + "/.DS_Store")
        guard Files.isDirectory(d) else { throw ScanError.notADirectory(d) }
        let existing = StorePlan.existing(at: url)
        guard let wanted = try contents(of: d, existing: existing) else { return false }
        if let existing, DSRecord.equivalent(existing.records, wanted) { return false }
        try DSStore(records: wanted).encoded().write(to: url, options: .atomic)
        return true
    }

    /// Writes every store in the plan. Returns how many were changed.
    @discardableResult
    public func writeAll() throws -> Int {
        var written = 0
        var firstError: Error?
        for directory in stores.keys.sorted() {
            do { if try write(directory: directory) { written += 1 } } catch { firstError = firstError ?? error }
        }
        if let firstError { throw firstError }
        return written
    }

    /// Removes the stores of folders that are no longer in the plan.
    public func retire(from previous: StorePlan, fileManager: FileManager = .default) {
        for directory in previous.stores.keys where stores[directory] == nil {
            try? fileManager.removeItem(atPath: directory + "/.DS_Store")
        }
    }
}
