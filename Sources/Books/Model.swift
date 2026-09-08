import AppKit
import Observation
import PDFKit
import UniformTypeIdentifiers
import BooksCore

/// Where the sidebar points.
enum SidebarItem: Hashable {
    case home
    case all
    case finished
    case books
    case pdfs
    case collection(UUID)

    var title: String {
        switch self {
        case .home: return "Home"
        case .all: return "All"
        case .finished: return "Finished"
        case .books: return "Books"
        case .pdfs: return "PDFs"
        case .collection: return "Collection"
        }
    }

    /// The Library section's shelves, which can be shown collection by collection.
    var isLibraryShelf: Bool {
        switch self {
        case .all, .finished, .books, .pdfs: return true
        case .home, .collection: return false
        }
    }

    var symbol: String {
        switch self {
        case .home: return "house"
        case .all: return "books.vertical"
        case .finished: return "checkmark.circle"
        case .books: return "book"
        case .pdfs: return "doc.text"
        case .collection: return "folder"
        }
    }

    /// Stable key for the sidebar preferences.
    var key: String {
        switch self {
        case .home: return "home"
        case .all: return "all"
        case .finished: return "finished"
        case .books: return "books"
        case .pdfs: return "pdfs"
        case .collection(let id): return "collection:" + id.uuidString
        }
    }

    init?(key: String) {
        switch key {
        case "home": self = .home
        case "all": self = .all
        case "finished": self = .finished
        case "books": self = .books
        case "pdfs": self = .pdfs
        default:
            let prefix = "collection:"
            guard key.hasPrefix(prefix), let id = UUID(uuidString: String(key.dropFirst(prefix.count))) else { return nil }
            self = .collection(id)
        }
    }
}

/// The library as the window sees it: the store's records plus selection, navigation, import progress and errors.
@MainActor
@Observable
final class LibraryModel {
    let store: LibraryStore

    private(set) var books: [Book] = []
    private(set) var collections: [BookCollection] = []
    var settings: Settings {
        didSet {
            store.settings = settings
            try? store.saveSettings()
            if oldValue.library != settings.library { refreshFolderSync(scanNow: settings.library.sync && settings.library.folder != nil && (!oldValue.library.sync || oldValue.library.folder != settings.library.folder)) }
        }
    }
    private(set) var stats: ReadingStats

    /// Moving to another shelf drops the selection: the table must not carry rows of one shelf into the next.
    var sidebarSelection: SidebarItem? = .home {
        didSet { if sidebarSelection != oldValue { selectedBookIDs = [] } }
    }
    var searchText = ""
    var selectedBookIDs: Set<UUID> = []
    /// Bumped when a cover changes on disk, so the views draw it again.
    private(set) var coverVersion = 0
    /// The book open in the reader, replacing the library in the window.
    var reading: Book?
    var infoBook: Book?
    var editingGoals = false
    var customizingHome = false
    var creatingCollection = false
    var renamingCollection: BookCollection?
    var importProgress: (done: Int, total: Int)?
    var error: String?
    /// What the last scan of the library folder found.
    var libraryFolderStatus: String?
    @ObservationIgnored private var folderWatcher: FolderWatcher?
    @ObservationIgnored private var folderScanTimer: Timer?
    @ObservationIgnored private var scanningFolder = false
    /// Decoded covers. Filled while views draw, so it must stay outside observation: a tracked write during a
    /// SwiftUI update is undefined behaviour and has crashed the shelf.
    @ObservationIgnored private var coverCache: [UUID: NSImage] = [:]
    /// Genres.csv beside the library and in the library folder, for books whose subjects say too little.
    private(set) var genreDatabase = GenreDatabase()
    private(set) var genreDatabaseFiles: [URL] = []

    init(store: LibraryStore = LibraryStore()) {
        self.store = store
        books = store.books
        collections = store.collections
        settings = store.settings
        stats = store.stats
        store.pdfInspector = { url in PDFInspector.inspect(url) }
        store.svgRasterizer = { svg in Rasterizer.png(fromSVG: svg) }
        reloadGenreDatabase()
    }

    // MARK: - Genres

    /// Where a Genres.csv is looked for: beside the library, and in the library folder when one is set.
    var genreDatabaseLocations: [URL] {
        var urls = [store.directory.appendingPathComponent("Genres.csv")]
        if let folder = settings.library.folder { urls.append(URL(fileURLWithPath: folder).appendingPathComponent("Genres.csv")) }
        return urls
    }

    /// Reads the genre tables again; a later file's line for a book wins.
    func reloadGenreDatabase() {
        var merged = GenreDatabase()
        var found: [URL] = []
        for url in genreDatabaseLocations {
            guard let table = GenreDatabase.load(from: url) else { continue }
            merged.merge(table)
            found.append(url)
        }
        genreDatabase = merged
        genreDatabaseFiles = found
    }

    /// A book's genres: what your table says of it first, then what its own subjects say.
    func genres(of book: Book) -> [String] {
        var genres = Genres.genres(for: genreDatabase.subjects(identifier: book.metadata.identifier, title: book.title, author: book.author))
        for genre in book.genres where !genres.contains(genre) { genres.append(genre) }
        return genres
    }

    func flush() {
        try? store.save()
        try? store.saveSettings()
        try? store.saveStats()
    }

    private func reload() {
        books = store.books
        collections = store.collections
        stats = store.stats
    }

    // MARK: - Shelves

    /// Books for a sidebar item, filtered by the search field and sorted as chosen.
    func books(for item: SidebarItem) -> [Book] {
        var list: [Book]
        switch item {
        case .home, .all: list = books
        case .finished: list = books.filter(\.isFinished)
        case .books: list = books.filter { $0.kind == .epub }
        case .pdfs: list = books.filter { $0.kind == .pdf }
        case .collection(let id):
            let ids = collections.first { $0.id == id }?.bookIDs ?? []
            list = ids.compactMap { id in books.first { $0.id == id } }
        }
        let query = searchText.trimmingCharacters(in: .whitespaces).lowercased()
        if !query.isEmpty {
            list = list.filter { $0.title.lowercased().contains(query) || $0.author.lowercased().contains(query) || $0.metadata.subjects.contains { $0.lowercased().contains(query) } }
        }
        // A book once only, whatever a collection's list says: a list given the same row twice can go wrong.
        var seen = Set<UUID>()
        list = list.filter { seen.insert($0.id).inserted }
        return sorted(list, for: item)
    }

    // MARK: - What each shelf chose

    /// The shelf the window shows.
    var currentShelf: SidebarItem { sidebarSelection ?? .home }

    func shelfSettings(for item: SidebarItem) -> ShelfSettings { settings.shelves[item.key] ?? ShelfSettings() }

    private func updateShelf(_ item: SidebarItem, _ change: (inout ShelfSettings) -> Void) {
        var s = shelfSettings(for: item)
        change(&s)
        if s.isEmpty { settings.shelves.removeValue(forKey: item.key) } else { settings.shelves[item.key] = s }
    }

    func shelfView(for item: SidebarItem) -> LibraryViewMode { shelfSettings(for: item).view ?? settings.libraryView }
    func shelfSort(for item: SidebarItem) -> LibrarySort { shelfSettings(for: item).sort ?? settings.sort }

    /// The direction the shelf is sorted in: as chosen for it, or its sort's own.
    func shelfSortAscending(for item: SidebarItem) -> Bool {
        let s = shelfSettings(for: item)
        if let own = s.sortAscending { return own }
        if s.sort == nil, let global = settings.sortAscending { return global }
        return shelfSort(for: item).ascendingByDefault
    }

    /// How the shelf is grouped: as it chose, else by collection for the Library's shelves (unless that default was
    /// turned off) and not at all for a collection's own shelf, which cannot group by collection.
    func shelfGrouping(for item: SidebarItem) -> ShelfGrouping {
        let chosen = shelfSettings(for: item).grouping ?? (item.isLibraryShelf ? settings.shelfGrouping : .none)
        if chosen == .collection, !item.isLibraryShelf { return .none }
        return chosen
    }

    func setShelfView(_ view: LibraryViewMode, for item: SidebarItem) { updateShelf(item) { $0.view = view } }

    /// Chooses a shelf's sort; a new kind of sort starts in its own direction.
    func setShelfSort(_ sort: LibrarySort, for item: SidebarItem) {
        updateShelf(item) { s in
            if s.sort != sort || (s.sort == nil && sort != settings.sort) { s.sortAscending = nil }
            s.sort = sort
        }
    }

    func setShelfSortAscending(_ ascending: Bool, for item: SidebarItem) {
        updateShelf(item) { s in
            if s.sort == nil { s.sort = settings.sort }
            s.sortAscending = ascending
        }
    }

    func setShelfGrouping(_ grouping: ShelfGrouping, for item: SidebarItem) { updateShelf(item) { $0.grouping = grouping } }

    func sorted(_ list: [Book], for item: SidebarItem) -> [Book] {
        let ascending = shelfSortAscending(for: item)
        func byTitle(_ a: Book, _ b: Book) -> Bool { a.title.localizedStandardCompare(b.title) == .orderedAscending }
        func ordered<T: Comparable>(_ key: (Book) -> T) -> [Book] {
            list.sorted { a, b in
                let ka = key(a), kb = key(b)
                if ka != kb { return ascending ? ka < kb : ka > kb }
                return byTitle(a, b)
            }
        }
        switch shelfSort(for: item) {
        case .recent: return ordered { $0.lastOpenedAt ?? $0.addedAt }
        case .title:
            return list.sorted { a, b in
                let order = a.title.localizedStandardCompare(b.title)
                if order == .orderedSame { return a.addedAt < b.addedAt }
                return ascending ? order == .orderedAscending : order == .orderedDescending
            }
        case .author:
            return list.sorted { a, b in
                if a.authorSortKey != b.authorSortKey { return ascending ? a.authorSortKey < b.authorSortKey : a.authorSortKey > b.authorSortKey }
                return byTitle(a, b)
            }
        case .timeRead: return ordered { $0.secondsRead ?? 0 }
        case .percentRead: return ordered { $0.isFinished ? 1.0 : $0.progress }
        case .pagesRead: return ordered { $0.pagesRead ?? 0 }
        case .length: return ordered { $0.lengthInWords }
        }
    }

    /// A shelf collection by collection: each collection in the sidebar's order with the books in it, a book in
    /// several collections counted with the first, and the rest under "Not in a Collection". Empty groups are left
    /// out; with no collection holding any of the books there is one group, "rest", and nothing to group.
    func shelfGroups(for books: [Book]) -> [ShelfGroup] {
        var placed = Set<UUID>()
        var groups: [ShelfGroup] = []
        for case .collection(let id) in sidebarEntries(in: .collections) {
            guard let found = self.collection(id) else { continue }
            let members = Set(found.bookIDs)
            let mine = books.filter { members.contains($0.id) && !placed.contains($0.id) }
            guard !mine.isEmpty else { continue }
            placed.formUnion(mine.map(\.id))
            groups.append(ShelfGroup(id: "collection:" + id.uuidString, name: found.name, books: mine))
        }
        let rest = books.filter { !placed.contains($0.id) }
        if !rest.isEmpty { groups.append(ShelfGroup(id: "rest", name: "Not in a Collection", books: rest)) }
        return groups
    }

    /// A shelf genre by genre, in alphabetical order, a book with several genres counted with the first and the
    /// rest under "No Genre".
    func genreGroups(for books: [Book]) -> [ShelfGroup] {
        var byGenre: [String: [Book]] = [:]
        var rest: [Book] = []
        for book in books {
            if let genre = genres(of: book).first { byGenre[genre, default: []].append(book) } else { rest.append(book) }
        }
        var groups = byGenre.keys.sorted { $0.localizedStandardCompare($1) == .orderedAscending }.map { ShelfGroup(id: "genre:" + $0, name: $0, books: byGenre[$0] ?? []) }
        if !rest.isEmpty { groups.append(ShelfGroup(id: "rest", name: "No Genre", books: rest)) }
        return groups
    }

    /// The groups of a shelf as it is to be grouped, when there is something to group by; nil for a shelf shown
    /// as one.
    func groupedShelf(_ item: SidebarItem, books: [Book]) -> [ShelfGroup]? {
        let groups: [ShelfGroup]
        switch shelfGrouping(for: item) {
        case .none: return nil
        case .collection: groups = shelfGroups(for: books)
        case .genre: groups = genreGroups(for: books)
        }
        guard groups.contains(where: { $0.id != "rest" }) else { return nil }
        return groups
    }

    // MARK: - Home

    /// Books begun but not opened for a fortnight, the longest left first.
    var pickUpAgain: [Book] {
        let cutoff = Date().addingTimeInterval(-14 * 86400)
        return books.filter { $0.hasStarted && !$0.isFinished && ($0.lastOpenedAt ?? $0.addedAt) < cutoff }
            .sorted { ($0.lastOpenedAt ?? $0.addedAt) < ($1.lastOpenedAt ?? $1.addedAt) }
    }

    /// Books never opened, the newest first.
    var recentlyAdded: [Book] {
        books.filter { $0.isNew && !$0.isFinished }.sorted { $0.addedAt > $1.addedAt }
    }

    /// Books finished, the latest first.
    var recentlyFinished: [Book] {
        books.filter(\.isFinished).sorted { ($0.finishedAt ?? .distantPast) > ($1.finishedAt ?? .distantPast) }
    }

    /// Unopened books in the genres, and by the authors, of the books you have read: the more of those they
    /// share, the earlier they come.
    var forYou: [Suggestion] {
        let read = books.filter { $0.hasStarted || $0.isFinished }
        guard !read.isEmpty else { return [] }
        var genreWeight: [String: Int] = [:]
        for book in read { for genre in genres(of: book) { genreWeight[genre, default: 0] += 1 } }
        let authors = Set(read.map { $0.author.lowercased() }.filter { !$0.isEmpty && $0 != "unknown author" && $0 != "pdf document" })
        var scored: [(Suggestion, Int)] = []
        for book in books where book.isNew && !book.isFinished {
            var score = 0
            var reason: String?
            if authors.contains(book.author.lowercased()) {
                score += 3
                reason = "More by \(book.author)"
            }
            let shared = genres(of: book).filter { genreWeight[$0] != nil }.sorted { genreWeight[$0] ?? 0 > genreWeight[$1] ?? 0 }
            score += shared.reduce(0) { $0 + (genreWeight[$1] ?? 0) }
            if reason == nil, let genre = shared.first { reason = "Because you read \(genre)" }
            if let reason, score > 0 { scored.append((Suggestion(book: book, reason: reason), score)) }
        }
        return scored.sorted { a, b in a.1 != b.1 ? a.1 > b.1 : a.0.book.addedAt > b.0.book.addedAt }.map(\.0)
    }

    func setHomeElement(_ element: HomeElement, shown: Bool) { settings.home.setShown(element, shown) }
    func moveHomeElements(fromOffsets source: IndexSet, toOffset destination: Int) { settings.home.move(fromOffsets: source, toOffset: destination) }
    func resetHome() { settings.home = HomeSettings() }

    /// The title and author the book came with, for Get Info's reset.
    func originalDetails(for book: Book) -> (title: String, author: String) { store.originalDetails(for: book) }

    /// Cover size in the grid, in steps: +1 bigger, -1 smaller.
    func zoomGrid(_ steps: Int) {
        settings.gridScale = Settings.clampedGridScale(settings.gridScale + Double(steps) * 0.1)
    }

    /// Books with a position, most recently read first: the Continue Reading shelf.
    var continueReading: [Book] {
        books.filter { $0.hasStarted && !$0.isFinished }.sorted { ($0.lastOpenedAt ?? .distantPast) > ($1.lastOpenedAt ?? .distantPast) }
    }

    func book(_ id: UUID) -> Book? { books.first { $0.id == id } }

    // MARK: - Sidebar

    func name(of item: SidebarItem) -> String {
        if case .collection(let id) = item { return collection(id)?.name ?? "Collection" }
        return item.title
    }

    enum SidebarGroup { case library, collections }

    /// The shelves, or the collections, in the user's order with hidden ones included; new collections join at the end.
    func sidebarEntries(in group: SidebarGroup) -> [SidebarItem] {
        let known: [SidebarItem] = group == .library ? [.all, .finished, .books, .pdfs] : collections.map { SidebarItem.collection($0.id) }
        var ordered = settings.sidebarOrder.compactMap { SidebarItem(key: $0) }.filter { known.contains($0) }
        for item in known where !ordered.contains(item) { ordered.append(item) }
        return ordered
    }

    func visibleSidebarEntries(in group: SidebarGroup) -> [SidebarItem] {
        sidebarEntries(in: group).filter { !isHidden($0) }
    }

    /// "All" is always there; anything else can be hidden.
    func isHidden(_ item: SidebarItem) -> Bool { item != .all && settings.sidebarHidden.contains(item.key) }

    func setHidden(_ item: SidebarItem, _ hidden: Bool) {
        guard item != .all else { return }
        var keys = settings.sidebarHidden.filter { $0 != item.key }
        if hidden { keys.append(item.key) }
        settings.sidebarHidden = keys
        if hidden, sidebarSelection == item { sidebarSelection = .all }
    }

    /// Drag reordering of one section's visible rows; hidden rows keep their places between their neighbours.
    func moveSidebarEntries(in group: SidebarGroup, from source: IndexSet, to destination: Int) {
        var visible = visibleSidebarEntries(in: group)
        let moving = source.sorted().compactMap { visible.indices.contains($0) ? visible[$0] : nil }
        for index in source.sorted(by: >) where visible.indices.contains(index) { visible.remove(at: index) }
        let insertAt = min(max(0, destination - source.filter { $0 < destination }.count), visible.count)
        visible.insert(contentsOf: moving, at: insertAt)
        var full = sidebarEntries(in: group)
        var next = visible.makeIterator()
        for i in full.indices where !isHidden(full[i]) {
            if let item = next.next() { full[i] = item }
        }
        let other = sidebarEntries(in: group == .library ? .collections : .library)
        settings.sidebarOrder = (group == .library ? full + other : other + full).map(\.key)
    }

    func collection(_ id: UUID) -> BookCollection? { collections.first { $0.id == id } }

    var selectedBooks: [Book] { books.filter { selectedBookIDs.contains($0.id) } }

    // MARK: - Covers

    func cover(for book: Book) -> NSImage? {
        if let cached = coverCache[book.id] { return cached }
        guard let url = store.coverURL(for: book), let image = NSImage(contentsOf: url) else { return nil }
        coverCache[book.id] = image
        return image
    }

    /// Puts a picture of your own on a book, from an image file.
    func setCover(fileAt url: URL, for id: UUID) {
        guard let image = NSImage(contentsOf: url), image.isValid else {
            error = "“\(url.lastPathComponent)” isn’t a picture Books can use as a cover."
            return
        }
        setCover(image, for: id)
    }

    /// Puts a picture of your own on a book. It is kept as a JPEG no larger than 1600 pixels on its long side;
    /// the book's own cover stays on disk for Restore.
    func setCover(_ image: NSImage, for id: UUID) {
        guard let data = Covers.jpegData(image) else {
            error = "That picture couldn’t be read."
            return
        }
        do {
            try store.replaceCover(with: data, ext: "jpg", for: id)
        } catch {
            self.error = "The cover couldn’t be saved: \(error.localizedDescription)"
            return
        }
        coverCache[id] = nil
        coverVersion += 1
        reload()
    }

    /// Takes a picture of your own off a book; its own cover, or none, shows again.
    func restoreCover(for id: UUID) {
        store.restoreCover(for: id)
        coverCache[id] = nil
        coverVersion += 1
        reload()
    }

    // MARK: - Reading

    func open(_ book: Book) {
        guard let current = self.book(book.id) else { return }
        store.recordOpened(current.id)
        reload()
        reading = self.book(current.id)
        selectedBookIDs = []
    }

    func closeReader() {
        reading = nil
        reload()
    }

    /// Closes and reopens a book, for changes that need a fresh reader (a PDF shown another way).
    func reopen(_ book: Book) {
        closeReader()
        DispatchQueue.main.async { [weak self] in self?.open(book) }
    }

    func savePosition(_ position: ReadingPosition, for id: UUID, finished: Bool? = nil) {
        store.savePosition(position, for: id, finished: finished)
        reload()
        if let reading, reading.id == id { self.reading = book(id) }
    }

    func setFinished(_ ids: [UUID], _ finished: Bool) {
        for id in ids { store.setFinished(id, finished) }
        reload()
    }

    func resetPosition(_ ids: [UUID]) {
        for id in ids { store.resetPosition(id) }
        reload()
    }

    func delete(_ ids: [UUID]) {
        store.remove(ids)
        for id in ids { coverCache[id] = nil }
        selectedBookIDs.subtract(ids)
        reload()
    }

    func update(_ book: Book) {
        store.update(book)
        reload()
    }

    func recordReading(seconds: Int, pages: Int = 0, chapters: Int = 0, in bookID: UUID? = nil) {
        store.recordReading(seconds: seconds, pages: pages, chapters: chapters, in: bookID)
        stats = store.stats
        if bookID != nil { books = store.books }
    }

    // MARK: - Collections

    func addCollection(named name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        let c = store.addCollection(named: trimmed)
        reload()
        sidebarSelection = .collection(c.id)
    }

    func renameCollection(_ id: UUID, to name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        store.renameCollection(id, to: trimmed)
        reload()
    }

    func deleteCollection(_ id: UUID) {
        store.deleteCollection(id)
        if sidebarSelection == .collection(id) { sidebarSelection = .all }
        let key = SidebarItem.collection(id).key
        settings.sidebarOrder.removeAll { $0 == key }
        settings.sidebarHidden.removeAll { $0 == key }
        reload()
    }

    func add(_ ids: [UUID], to collectionID: UUID) {
        store.add(ids, to: collectionID)
        reload()
    }

    func remove(_ ids: [UUID], from collectionID: UUID) {
        store.remove(ids, from: collectionID)
        reload()
    }

    // MARK: - Import

    static let readableTypes: [UTType] = {
        var types: [UTType] = [.epub, .pdf, .plainText, .text]
        for id in ["com.amazon.mobi8-ebook", "com.amazon.azw", "org.mobipocket.ebook", "net.daringfireball.markdown"] { if let t = UTType(id) { types.append(t) } }
        for ext in ["mobi", "azw", "azw3", "prc", "md", "markdown", "txt"] { if let t = UTType(filenameExtension: ext) { types.append(t) } }
        return types
    }()

    func chooseFiles() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = true
        panel.canChooseFiles = true
        panel.allowedContentTypes = LibraryModel.readableTypes
        panel.message = "Add EPUB, Kindle (MOBI, AZW3), PDF or text files — or folders of them, searched through — to your library"
        panel.prompt = "Add"
        let collections = NSButton(checkboxWithTitle: "Make collections from the folders' subfolders", target: nil, action: nil)
        collections.state = settings.library.importCollections ? .on : .off
        panel.accessoryView = collections
        panel.isAccessoryViewDisclosed = true
        guard panel.runModal() == .OK else { return }
        settings.library.importCollections = collections.state == .on
        importFiles(panel.urls)
    }

    /// What to add from files and folders chosen or dropped: files as they are, folders searched through, each
    /// file with the first-level subfolder it lies in.
    private func expand(_ urls: [URL]) -> [(url: URL, folder: String?)] {
        var out: [(url: URL, folder: String?)] = []
        for url in urls {
            let values = try? url.resourceValues(forKeys: [.isDirectoryKey, .isPackageKey])
            if values?.isDirectory == true, values?.isPackage != true {
                for entry in FolderScan.files(in: url) { out.append((entry.url, entry.folder)) }
            } else {
                out.append((url, nil))
            }
        }
        return out
    }

    /// Adds files in the background, one at a time, reporting progress; duplicates are skipped silently. Folders are
    /// searched through, and when asked their subfolders become collections (an existing one of the same name in
    /// any case is used).
    func importFiles(_ urls: [URL], quiet: Bool = false, allowDuplicates: Bool = false, collections: Bool? = nil, completion: (([Book]) -> Void)? = nil) {
        let files = expand(urls)
        guard !files.isEmpty else { return }
        let makeCollections = collections ?? settings.library.importCollections
        importProgress = (0, files.count)
        let store = self.store
        Task.detached(priority: .userInitiated) {
            var added: [Book] = []
            var failures: [String] = []
            var skipped = 0
            for (i, file) in files.enumerated() {
                let url = file.url
                do {
                    let book: Book
                    switch try store.importFile(at: url, allowDuplicates: allowDuplicates) {
                    case .added(let b): added.append(b); book = b
                    case .duplicate(let b): skipped += 1; book = b
                    }
                    store.setSource(url.path, for: book.id)
                    if makeCollections, let folder = file.folder { LibraryModel.place(book.id, from: nil, inCollectionNamed: folder, store: store) }
                } catch {
                    failures.append("\(url.lastPathComponent): \(error.localizedDescription)")
                }
                await MainActor.run { self.importProgress = (i + 1, files.count) }
            }
            let result = (added, failures, skipped)
            await MainActor.run {
                self.importProgress = nil
                self.reload()
                if !quiet {
                    if !result.1.isEmpty {
                        self.error = result.1.joined(separator: "\n")
                    }
                    if result.2 > 0, result.0.isEmpty, result.1.isEmpty {
                        self.error = result.2 == 1 ? "That book is already in your library." : "Those books are already in your library."
                    }
                    if !result.0.isEmpty, self.sidebarSelection == .home || self.sidebarSelection == nil { self.sidebarSelection = .all }
                }
                completion?(result.0)
            }
        }
    }
}

// MARK: - The library folder

extension LibraryModel {
    /// Puts a book in the collection a subfolder names, making the collection when there is none of that name
    /// (in any case); when it came from another subfolder before, it leaves that one's collection.
    nonisolated static func place(_ id: UUID, from previousFolder: String?, inCollectionNamed folder: String?, store: LibraryStore) {
        if let previousFolder, previousFolder.compare(folder ?? "", options: .caseInsensitive) != .orderedSame, let old = store.collection(named: previousFolder), old.bookIDs.contains(id) {
            store.remove([id], from: old.id)
        }
        guard let folder, !folder.isEmpty else { return }
        let collection = store.collection(named: folder) ?? store.addCollection(named: folder)
        if !collection.bookIDs.contains(id) { store.add([id], to: collection.id) }
    }

    func chooseLibraryFolder() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.message = "Choose the folder whose books — and whose subfolders' books — belong in the library"
        panel.prompt = "Choose"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        settings.library.folder = url.standardizedFileURL.resolvingSymlinksInPath().path
        scanLibraryFolder(manual: true)
    }

    func clearLibraryFolder() {
        settings.library.folder = nil
        libraryFolderStatus = nil
    }

    /// Watches the library folder while sync is on (and scans now when asked), stops when it is off or gone.
    func refreshFolderSync(scanNow: Bool) {
        folderWatcher = nil
        folderScanTimer?.invalidate()
        guard let path = settings.library.folder else { return }
        if settings.library.sync {
            folderWatcher = FolderWatcher(path: path) { [weak self] in self?.libraryFolderChanged() }
        }
        if scanNow { scanLibraryFolder(manual: false) }
    }

    private func libraryFolderChanged() {
        folderScanTimer?.invalidate()
        folderScanTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.scanLibraryFolder(manual: false) }
        }
    }

    /// Takes in what the library folder holds that the library does not (a book already in the library from
    /// elsewhere is recognised, not doubled), and, when asked, puts every book in the collection its subfolder
    /// names — a file moved to another subfolder moves with it. Files gone from the folder leave their books be.
    func scanLibraryFolder(manual: Bool, completion: ((_ added: Int, _ scanned: Int) -> Void)? = nil) {
        reloadGenreDatabase()
        guard let path = settings.library.folder, !scanningFolder else { completion?(0, 0); return }
        let root = URL(fileURLWithPath: path)
        let wantCollections = settings.library.syncCollections
        scanningFolder = true
        if manual { libraryFolderStatus = "Scanning…" }
        let store = self.store
        Task.detached(priority: .utility) {
            let entries = FolderScan.files(in: root)
            var added = 0
            var failures: [String] = []
            for entry in entries {
                let sourcePath = entry.url.path
                var book = store.book(withSource: sourcePath)
                var previousFolder: String?
                if book == nil {
                    do {
                        switch try store.importFile(at: entry.url, allowDuplicates: false) {
                        case .added(let b): book = b; added += 1
                        case .duplicate(let b): book = b; previousFolder = b.source.flatMap { FolderScan.folder(of: $0, under: path) }
                        }
                    } catch {
                        failures.append("\(entry.relativePath): \(error.localizedDescription)")
                        continue
                    }
                    if let b = book { store.setSource(sourcePath, for: b.id) }
                }
                guard let book else { continue }
                if wantCollections { LibraryModel.place(book.id, from: previousFolder, inCollectionNamed: entry.folder, store: store) }
            }
            let result = (added: added, scanned: entries.count, failures: failures)
            await MainActor.run {
                self.scanningFolder = false
                self.reload()
                let time = Date().formatted(date: .omitted, time: .shortened)
                var status = "Scanned at \(time): \(result.scanned) files, \(result.added) added"
                if !result.failures.isEmpty { status += ", \(result.failures.count) not readable" }
                self.libraryFolderStatus = status
                if manual, !result.failures.isEmpty { self.error = result.failures.joined(separator: "\n") }
                completion?(result.added, result.scanned)
            }
        }
    }
}

// MARK: - Platform helpers the core delegates to

enum PDFInspector {
    static func inspect(_ url: URL) -> PDFInfo? {
        guard let document = PDFDocument(url: url) else { return nil }
        var info = PDFInfo()
        info.pageCount = document.pageCount
        let attrs = document.documentAttributes ?? [:]
        info.title = (attrs[PDFDocumentAttribute.titleAttribute] as? String)?.trimmingCharacters(in: .whitespaces)
        info.author = (attrs[PDFDocumentAttribute.authorAttribute] as? String)?.trimmingCharacters(in: .whitespaces)
        if info.title?.isEmpty == true { info.title = nil }
        // The subject and keywords, for genres: keywords come as one string or a list.
        var subjects: [String] = []
        if let subject = attrs[PDFDocumentAttribute.subjectAttribute] as? String { subjects.append(subject) }
        if let keywords = attrs[PDFDocumentAttribute.keywordsAttribute] as? String { subjects += keywords.components(separatedBy: CharacterSet(charactersIn: ",;")) }
        if let keywords = attrs[PDFDocumentAttribute.keywordsAttribute] as? [String] { subjects += keywords }
        info.subjects = subjects.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        if let page = document.page(at: 0) {
            let bounds = page.bounds(for: .mediaBox)
            let scale = 600 / max(bounds.width, 1)
            let size = NSSize(width: bounds.width * scale, height: bounds.height * scale)
            let image = page.thumbnail(of: size, for: .mediaBox)
            if let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let jpeg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.85]) {
                info.cover = jpeg
                info.coverMediaType = "image/jpeg"
            }
        }
        return info
    }
}

enum Rasterizer {
    /// Draws an SVG cover into a PNG, so the shelf never has to lay out SVG.
    static func png(fromSVG svg: String) -> (data: Data, mediaType: String)? {
        guard let image = NSImage(data: Data(svg.utf8)) else { return nil }
        let size = NSSize(width: 600, height: 900)
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width), pixelsHigh: Int(size.height), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)
        guard let bitmap else { return nil }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        image.draw(in: NSRect(origin: .zero, size: size), from: .zero, operation: .copy, fraction: 1)
        NSGraphicsContext.restoreGraphicsState()
        guard let png = bitmap.representation(using: .png, properties: [:]) else { return nil }
        return (png, "image/png")
    }
}

/// One group of a shelf shown by collection or genre.
struct ShelfGroup: Identifiable, Hashable {
    let id: String
    let name: String
    let books: [Book]
}

/// A book Home puts forward, and why.
struct Suggestion: Identifiable, Hashable {
    let book: Book
    let reason: String
    var id: UUID { book.id }
}

/// Pictures chosen as covers, made into files.
enum Covers {
    /// The picture as JPEG, no larger than `maxSide` pixels on its long side, on white where it was transparent.
    static func jpegData(_ image: NSImage, maxSide: CGFloat = 1600) -> Data? {
        guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil), cg.width > 0, cg.height > 0 else { return nil }
        let scale = min(1, maxSide / CGFloat(max(cg.width, cg.height)))
        let width = max(1, Int(CGFloat(cg.width) * scale)), height = max(1, Int(CGFloat(cg.height) * scale))
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        context.interpolationQuality = .high
        context.setFillColor(CGColor(gray: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
        guard let drawn = context.makeImage() else { return nil }
        return NSBitmapImageRep(cgImage: drawn).representation(using: .jpeg, properties: [.compressionFactor: 0.9])
    }
}
