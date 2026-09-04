import Foundation

// The view Finder shows a folder in: the mode, the sort, and the per-mode
// options from Finder's View Options window. One `View` describes the default;
// a `FolderView` binds one to a folder and, through it, to every folder beneath.

public enum ViewMode: String, Codable, CaseIterable, Hashable {
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

public enum SortKey: String, Codable, CaseIterable, Hashable {
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

    /// Column view's four-character code; Date Added has none.
    public var columnCode: String? {
        switch self {
        case .name: return "dnam"
        case .dateModified: return "dmod"
        case .dateCreated: return "ascd"
        case .size: return "phys"
        case .kind: return "kipl"
        case .dateAdded: return nil
        }
    }

    /// Finder's own direction for the key: dates newest first.
    public var defaultAscending: Bool {
        switch self {
        case .name, .kind, .size: return true
        case .dateModified, .dateCreated, .dateAdded: return false
        }
    }
}

/// Values of Finder's `FXPreferredGroupBy`.
public enum GroupBy: String, Codable, CaseIterable, Hashable {
    case none = "None"
    case name = "Name"
    case kind = "Kind"
    case application = "Application"
    case dateLastOpened = "Date Last Opened"
    case dateAdded = "Date Added"
    case dateModified = "Date Modified"
    case dateCreated = "Date Created"
    case size = "Size"
    case tags = "Tags"

    public var label: String { rawValue }
}

public struct IconOptions: Hashable, Codable {
    public var iconSize: Double = 64
    public var gridSpacing: Double = 54
    public var textSize: Double = 12
    public var labelOnBottom = true
    public var showItemInfo = false
    public var showIconPreview = true

    public init() {}
}

public struct ListOptions: Hashable, Codable {
    public var largeIcons = false
    public var textSize: Double = 12
    public var relativeDates = true
    public var calculateAllSizes = false
    public var showIconPreview = true
    /// Columns shown besides Name. The sort column is always shown.
    public var columns: Set<String> = ["dateModified", "size", "kind"]

    public init() {}

    public static let optionalColumns: [(id: String, label: String)] = [
        ("dateModified", "Date Modified"), ("dateCreated", "Date Created"), ("dateLastOpened", "Date Last Opened"),
        ("dateAdded", "Date Added"), ("size", "Size"), ("kind", "Kind"), ("version", "Version"),
        ("comments", "Comments"), ("label", "Tags"),
    ]
}

public struct ColumnOptions: Hashable, Codable {
    public var textSize: Double = 12
    public var showIcons = true
    public var showIconPreview = true
    public var showPreviewColumn = true

    public init() {}
}

public struct GalleryOptions: Hashable, Codable {
    public var thumbnailSize: Double = 48
    public var showIconPreview = true

    public init() {}
}

public struct ViewOptions: Hashable, Codable {
    public var icon = IconOptions()
    public var list = ListOptions()
    public var column = ColumnOptions()
    public var gallery = GalleryOptions()

    public init() {}
}

public struct FinderView: Hashable, Codable {
    public var mode: ViewMode = .list
    public var sortKey: SortKey = .name
    public var ascending = true
    public var options = ViewOptions()

    public init(mode: ViewMode = .icons, sortKey: SortKey = .name, ascending: Bool? = nil, options: ViewOptions = ViewOptions()) {
        self.mode = mode
        self.sortKey = sortKey
        self.ascending = ascending ?? sortKey.defaultAscending
        self.options = options
    }

    public var summary: String {
        var parts = [mode.label, "by " + sortKey.label]
        switch mode {
        case .icons: parts.append("\(Int(options.icon.iconSize)) px")
        case .gallery: parts.append("\(Int(options.gallery.thumbnailSize)) px")
        case .list: if options.list.largeIcons { parts.append("large icons") }
        case .columns: break
        }
        return parts.joined(separator: " · ")
    }
}

/// A folder with its own view, which its subfolders share unless they have their own.
public struct FolderView: Hashable, Codable, Identifiable {
    public var id: UUID
    public var path: String
    public var view: FinderView

    public init(id: UUID = UUID(), path: String, view: FinderView) {
        self.id = id
        self.path = Paths.standardize(path)
        self.view = view
    }
}

/// Everything about how folders look. The default applies everywhere a folder
/// view does not.
public struct ViewSettings: Hashable, Codable {
    public var `default` = FinderView()
    public var groupBy: GroupBy = .none
    public var foldersFirst = false
    public var folders: [FolderView] = []

    public init() {}

    /// The view for a folder: its own, the nearest folder view above it, or the default.
    public func view(for path: String) -> (view: FinderView, owner: String?) {
        let p = Paths.standardize(path)
        let owner = folders.filter { Paths.isInside(p, $0.path) }.max { $0.path.count < $1.path.count }
        guard let owner else { return (`default`, nil) }
        return (owner.view, owner.path)
    }
}
