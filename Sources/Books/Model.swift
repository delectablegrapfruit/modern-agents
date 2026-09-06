import AppKit
import ImageIO
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
        didSet { store.settings = settings; try? store.saveSettings() }
    }
    private(set) var stats: ReadingStats

    var sidebarSelection: SidebarItem? = .home
    var searchText = ""
    var selectedBookIDs: Set<UUID> = []
    /// The book open in the reader, replacing the library in the window.
    var reading: Book?
    var infoBook: Book?
    var editingGoals = false
    var creatingCollection = false
    var renamingCollection: BookCollection?
    var importProgress: (done: Int, total: Int)?
    var error: String?
    /// Decoded covers. Filled while views draw, so it must stay outside observation: a tracked write during a
    /// SwiftUI update is undefined behaviour and has crashed the shelf.
    @ObservationIgnored private var coverCache: [UUID: NSImage] = [:]

    init(store: LibraryStore = LibraryStore()) {
        self.store = store
        books = store.books
        collections = store.collections
        settings = store.settings
        stats = store.stats
        store.pdfInspector = { url in PDFInspector.inspect(url) }
        store.svgRasterizer = { svg in Rasterizer.png(fromSVG: svg) }
        store.comicPDFMaker = { images in ComicPDF.make(images) }
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
        return sorted(list)
    }

    func sorted(_ list: [Book]) -> [Book] {
        switch settings.sort {
        case .recent: return list.sorted { ($0.lastOpenedAt ?? $0.addedAt) > ($1.lastOpenedAt ?? $1.addedAt) }
        case .title: return list.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
        case .author: return list.sorted { ($0.authorSortKey, $0.title) < ($1.authorSortKey, $1.title) }
        }
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

    func recordReading(seconds: Int, pages: Int = 0) {
        store.recordReading(seconds: seconds, pages: pages)
        stats = store.stats
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
        for ext in ["mobi", "azw", "azw3", "prc", "md", "markdown", "txt", "cbz", "cbr", "cb7", "cbt"] { if let t = UTType(filenameExtension: ext) { types.append(t) } }
        return types
    }()

    func chooseFiles() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = LibraryModel.readableTypes
        panel.message = "Add EPUB, Kindle (MOBI, AZW3), PDF, comic (CBZ, CBR, CB7, CBT) or text files to your library"
        panel.prompt = "Add"
        guard panel.runModal() == .OK else { return }
        importFiles(panel.urls)
    }

    /// Adds files in the background, one at a time, reporting progress; duplicates are skipped silently.
    func importFiles(_ urls: [URL], quiet: Bool = false, allowDuplicates: Bool = false, completion: (([Book]) -> Void)? = nil) {
        let files = urls.filter { LibraryStore.readableExtensions.contains($0.pathExtension.lowercased()) || (try? $0.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == false }
        guard !files.isEmpty else { return }
        importProgress = (0, files.count)
        let store = self.store
        Task.detached(priority: .userInitiated) {
            var added: [Book] = []
            var failures: [String] = []
            var skipped = 0
            for (i, url) in files.enumerated() {
                do {
                    switch try store.importFile(at: url, allowDuplicates: allowDuplicates) {
                    case .added(let book): added.append(book)
                    case .duplicate: skipped += 1
                    }
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

/// A comic's page images as a PDF, one image a page, at the image's size (the longer side at most 1600 points).
enum ComicPDF {
    static func make(_ images: [Data]) -> (pdf: Data, pageCount: Int)? {
        let data = NSMutableData()
        var mediaBox = CGRect(x: 0, y: 0, width: 612, height: 792)
        guard let consumer = CGDataConsumer(data: data as CFMutableData), let context = CGContext(consumer: consumer, mediaBox: &mediaBox, nil) else { return nil }
        var pages = 0
        for imageData in images {
            guard let source = CGImageSourceCreateWithData(imageData as CFData, nil),
                  let image = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCache as String: false] as CFDictionary) else { continue }
            let w = CGFloat(image.width), h = CGFloat(image.height)
            guard w > 0, h > 0 else { continue }
            let s = min(1, 1600 / max(w, h))
            var box = CGRect(x: 0, y: 0, width: (w * s).rounded(), height: (h * s).rounded())
            let boxData = Data(bytes: &box, count: MemoryLayout<CGRect>.size)
            context.beginPDFPage([kCGPDFContextMediaBox as String: boxData] as CFDictionary)
            context.interpolationQuality = .high
            context.draw(image, in: box)
            context.endPDFPage()
            pages += 1
        }
        context.closePDF()
        return pages > 0 ? (data as Data, pages) : nil
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
