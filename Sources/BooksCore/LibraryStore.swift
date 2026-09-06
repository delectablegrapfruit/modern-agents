import Foundation

public enum AppPaths {
    public static let appName = "Books"

    /// `~/Library/Application Support/Books` on macOS, `$XDG_DATA_HOME/books` (or `~/.local/share/books`) elsewhere.
    public static func supportDirectory(fileManager: FileManager = .default) -> URL {
        #if os(macOS)
        let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        return base.appendingPathComponent(appName, isDirectory: true)
        #else
        if let xdg = ProcessInfo.processInfo.environment["XDG_DATA_HOME"], !xdg.isEmpty {
            return URL(fileURLWithPath: xdg).appendingPathComponent("books", isDirectory: true)
        }
        return URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".local/share/books", isDirectory: true)
        #endif
    }
}

/// The catalog file: every book and collection. Files, covers and annotations live in one folder per book.
struct Catalog: Codable {
    var version = 2
    var books: [Book] = []
    var collections: [BookCollection] = []
}

public enum ImportError: Error, LocalizedError {
    case unsupportedType(String)
    case unreadable(String)
    case kindle(Error)
    case epub(String)

    public var errorDescription: String? {
        switch self {
        case .unsupportedType(let name): return "“\(name)” is not a kind of file Books can add. Books opens EPUB, Kindle (MOBI, AZW3), PDF and text files."
        case .unreadable(let name): return "“\(name)” could not be read."
        case .kindle(let error): return (error as? LocalizedError)?.errorDescription ?? "The Kindle file could not be converted: \(error)"
        case .epub(let what): return "The book could not be opened: \(what)"
        }
    }
}

public enum ImportOutcome {
    case added(Book)
    /// The same book (by identifier, or by title, author and size) is already in the library.
    case duplicate(Book)

    public var book: Book {
        switch self {
        case .added(let b), .duplicate(let b): return b
        }
    }
}

/// Information the core cannot get on its own from a PDF: the app supplies it through PDFKit.
public struct PDFInfo {
    public var title: String?
    public var author: String?
    public var pageCount: Int?
    public var cover: Data?
    public var coverMediaType: String?

    public init(title: String? = nil, author: String? = nil, pageCount: Int? = nil, cover: Data? = nil, coverMediaType: String? = nil) {
        self.title = title
        self.author = author
        self.pageCount = pageCount
        self.cover = cover
        self.coverMediaType = coverMediaType
    }
}

/// Everything the library remembers, on disk under one folder:
///
///     library.json          books and collections
///     settings.json         reader, library, goals
///     stats.json            reading time per day
///     Books/<id>/book.epub  the book (converted to EPUB when it was a Kindle or text file), or book.pdf
///     Books/<id>/cover.*    the cover image
///     Books/<id>/annotations.json
///
/// Not thread-safe: the app calls it from the main actor and does slow imports on the caller's thread.
public final class LibraryStore {
    public let directory: URL
    public private(set) var books: [Book] = []
    public private(set) var collections: [BookCollection] = []
    public var settings: Settings
    public private(set) var stats: ReadingStats
    public var pdfInspector: ((URL) -> PDFInfo?)?
    /// Renders an SVG cover to a raster image; set by the app, since the core has no graphics.
    public var svgRasterizer: ((String) -> (data: Data, mediaType: String)?)?

    private let fileManager: FileManager
    private var annotationCache: [UUID: [Annotation]] = [:]

    public init(directory: URL = AppPaths.supportDirectory(), fileManager: FileManager = .default) {
        self.directory = directory
        self.fileManager = fileManager
        try? fileManager.createDirectory(at: directory.appendingPathComponent("Books", isDirectory: true), withIntermediateDirectories: true)
        let catalog: Catalog = LibraryStore.read(directory.appendingPathComponent("library.json")) ?? Catalog()
        books = catalog.books
        collections = catalog.collections
        settings = LibraryStore.read(directory.appendingPathComponent("settings.json")) ?? Settings()
        stats = LibraryStore.read(directory.appendingPathComponent("stats.json")) ?? ReadingStats()
    }

    public var isEmpty: Bool { books.isEmpty }

    // MARK: - Files

    public func folder(for id: UUID) -> URL {
        directory.appendingPathComponent("Books", isDirectory: true).appendingPathComponent(id.uuidString, isDirectory: true)
    }

    public func fileURL(for book: Book) -> URL {
        folder(for: book.id).appendingPathComponent(book.kind == .pdf ? "book.pdf" : "book.epub")
    }

    public func coverURL(for book: Book) -> URL? {
        guard let name = book.coverFile else { return nil }
        return folder(for: book.id).appendingPathComponent(name)
    }

    public func book(_ id: UUID) -> Book? { books.first { $0.id == id } }

    // MARK: - Persistence

    public func save() throws {
        try LibraryStore.write(Catalog(books: books, collections: collections), to: directory.appendingPathComponent("library.json"))
    }

    public func saveSettings() throws {
        try LibraryStore.write(settings, to: directory.appendingPathComponent("settings.json"))
    }

    public func saveStats() throws {
        try LibraryStore.write(stats, to: directory.appendingPathComponent("stats.json"))
    }

    static func read<T: Decodable>(_ url: URL) -> T? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(T.self, from: data)
    }

    static func write<T: Encodable>(_ value: T, to url: URL) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try encoder.encode(value).write(to: url, options: .atomic)
    }

    // MARK: - Books

    public func update(_ book: Book) {
        guard let i = books.firstIndex(where: { $0.id == book.id }) else { return }
        books[i] = book
        try? save()
    }

    public func recordOpened(_ id: UUID) {
        guard let i = books.firstIndex(where: { $0.id == id }) else { return }
        books[i].lastOpenedAt = Date()
        try? save()
    }

    public func savePosition(_ position: ReadingPosition, for id: UUID, finished: Bool? = nil) {
        guard let i = books.firstIndex(where: { $0.id == id }) else { return }
        books[i].position = position
        if let finished {
            if finished, books[i].finishedAt == nil { books[i].finishedAt = Date() }
            if !finished { books[i].finishedAt = nil }
        }
        try? save()
    }

    public func setFinished(_ id: UUID, _ finished: Bool) {
        guard let i = books.firstIndex(where: { $0.id == id }) else { return }
        books[i].finishedAt = finished ? Date() : nil
        if finished, var position = books[i].position { position.percent = 100; books[i].position = position }
        try? save()
    }

    public func resetPosition(_ id: UUID) {
        guard let i = books.firstIndex(where: { $0.id == id }) else { return }
        books[i].position = nil
        books[i].finishedAt = nil
        try? save()
    }

    public func remove(_ ids: [UUID]) {
        let set = Set(ids)
        for id in ids { try? fileManager.removeItem(at: folder(for: id)); annotationCache[id] = nil }
        books.removeAll { set.contains($0.id) }
        for i in collections.indices { collections[i].bookIDs.removeAll { set.contains($0) } }
        try? save()
    }

    // MARK: - Collections

    @discardableResult
    public func addCollection(named name: String) -> BookCollection {
        let collection = BookCollection(name: name)
        collections.append(collection)
        try? save()
        return collection
    }

    public func renameCollection(_ id: UUID, to name: String) {
        guard let i = collections.firstIndex(where: { $0.id == id }) else { return }
        collections[i].name = name
        try? save()
    }

    public func deleteCollection(_ id: UUID) {
        collections.removeAll { $0.id == id }
        try? save()
    }

    public func add(_ bookIDs: [UUID], to collectionID: UUID) {
        guard let i = collections.firstIndex(where: { $0.id == collectionID }) else { return }
        for id in bookIDs where !collections[i].bookIDs.contains(id) && books.contains(where: { $0.id == id }) { collections[i].bookIDs.append(id) }
        try? save()
    }

    public func remove(_ bookIDs: [UUID], from collectionID: UUID) {
        guard let i = collections.firstIndex(where: { $0.id == collectionID }) else { return }
        let set = Set(bookIDs)
        collections[i].bookIDs.removeAll { set.contains($0) }
        try? save()
    }

    // MARK: - Annotations

    public func annotations(for bookID: UUID) -> [Annotation] {
        if let cached = annotationCache[bookID] { return cached }
        let list: [Annotation] = LibraryStore.read(folder(for: bookID).appendingPathComponent("annotations.json")) ?? []
        annotationCache[bookID] = list
        return list
    }

    public func saveAnnotations(_ list: [Annotation], for bookID: UUID) {
        annotationCache[bookID] = list
        try? LibraryStore.write(list, to: folder(for: bookID).appendingPathComponent("annotations.json"))
    }

    public func annotationCount(for bookID: UUID) -> Int { annotations(for: bookID).count }

    /// Every highlight and note in the library, as Markdown grouped by book and chapter.
    public func annotationsMarkdown() -> String {
        var out = "# Highlights and Notes\n"
        for book in books.sorted(by: { $0.title.lowercased() < $1.title.lowercased() }) {
            let highlights = annotations(for: book.id).filter { $0.kind == .highlight }
            guard !highlights.isEmpty else { continue }
            out += "\n## \(book.title)\n*\(book.author)*\n"
            var chapter = ""
            for h in highlights.sorted(by: { ($0.locator.spine, $0.locator.offset) < ($1.locator.spine, $1.locator.offset) }) {
                if h.chapter != chapter { chapter = h.chapter; out += "\n### \(chapter.isEmpty ? "Untitled" : chapter)\n" }
                out += "\n> \(h.text.replacingOccurrences(of: "\n", with: " "))\n"
                if !h.note.isEmpty { out += "\n\(h.note)\n" }
            }
        }
        return out
    }

    // MARK: - Statistics

    public func recordReading(seconds: Int, pages: Int = 0) {
        stats.add(seconds: seconds, pages: pages)
        try? saveStats()
    }

    public func booksFinished(inYear year: Int, calendar: Calendar = .current) -> Int {
        books.filter { $0.finishedAt.map { calendar.component(.year, from: $0) == year } ?? false }.count
    }

    // MARK: - Import

    public static let readableExtensions: Set<String> = ["epub", "mobi", "azw", "azw3", "prc", "kf8", "pdf", "txt", "text", "md", "markdown"]

    /// Adds a file: EPUBs are copied, Kindle and text files are converted to EPUB, PDFs are copied. The cover and
    /// metadata are extracted here so the shelf never has to open the file again.
    public func importFile(at url: URL, allowDuplicates: Bool = false) throws -> ImportOutcome {
        let name = url.lastPathComponent
        let ext = url.pathExtension.lowercased()
        guard let data = try? Data(contentsOf: url) else { throw ImportError.unreadable(name) }
        let magic = data.prefix(8)
        let isZip = magic.starts(with: [0x50, 0x4B, 0x03, 0x04])
        let isPDF = magic.starts(with: Array("%PDF".utf8))
        let isKindle = KindleBook.isKindle(data)

        var kind: BookKind = .epub
        var epubData: Data?
        var metadata = BookMetadata()
        var title = "", author = ""
        var cover: (data: Data, mediaType: String)?
        var words = 0
        var pageCount: Int?

        if isPDF || (ext == "pdf" && !isZip) {
            kind = .pdf
            let info = pdfInspector?(url)
            title = info?.title?.trimmingCharacters(in: .whitespaces) ?? ""
            author = info?.author?.trimmingCharacters(in: .whitespaces) ?? ""
            pageCount = info?.pageCount
            if let c = info?.cover { cover = (c, info?.coverMediaType ?? "image/jpeg") }
        } else if isKindle || ["mobi", "azw", "azw3", "prc", "kf8"].contains(ext) {
            let converted: ConvertedBook
            do { converted = try KindleBook.convertToEPUB(data) } catch { throw ImportError.kindle(error) }
            epubData = converted.epub
        } else if isZip || ext == "epub" {
            epubData = data
        } else if ["txt", "text", "md", "markdown"].contains(ext) || looksLikeText(data) {
            let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) ?? String(decoding: data, as: UTF8.self)
            let built = TextBook.epub(fileName: name, text: text)
            epubData = built.data
            if let raster = svgRasterizer?(built.coverSVG) { cover = raster } else { cover = (Data(built.coverSVG.utf8), "image/svg+xml") }
        } else {
            throw ImportError.unsupportedType(name)
        }

        if let epubData {
            let epub: EPUBBook
            do { epub = try EPUBBook(data: epubData) } catch { throw ImportError.epub("\(error)") }
            metadata = epub.metadata
            title = metadata.title
            author = metadata.author
            words = epub.wordCount()
            if cover == nil, let c = epub.coverImage() {
                if c.mediaType == "image/svg+xml", let raster = svgRasterizer?(String(decoding: c.data, as: UTF8.self)) { cover = raster } else { cover = c }
            }
        }

        if title.isEmpty { title = TextBook.guessTitleAuthor(fileName: name, text: "").title }
        if author.isEmpty { author = kind == .pdf ? "PDF Document" : "Unknown Author" }
        let size = Int64(epubData?.count ?? data.count)

        if !allowDuplicates, let existing = books.first(where: { existing in
            (!metadata.identifier.isEmpty && !metadata.identifier.lowercased().hasPrefix("urn:uuid") && existing.metadata.identifier == metadata.identifier)
                || (existing.title.lowercased() == title.lowercased() && existing.author.lowercased() == author.lowercased() && existing.fileSize == size)
        }) {
            return .duplicate(existing)
        }

        var book = Book(title: title, author: author, kind: kind, fileName: name, fileSize: size, metadata: metadata, words: words, pageCount: pageCount)
        let dir = folder(for: book.id)
        try fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        try (epubData ?? data).write(to: fileURL(for: book), options: .atomic)
        if let cover {
            let file = "cover." + MediaTypes.fileExtension(forMediaType: cover.mediaType)
            try cover.data.write(to: dir.appendingPathComponent(file), options: .atomic)
            book.coverFile = file
        }
        books.append(book)
        try save()
        return .added(book)
    }

    private func looksLikeText(_ data: Data) -> Bool {
        let sample = data.prefix(4096)
        guard !sample.isEmpty, String(data: sample, encoding: .utf8) != nil || String(data: sample, encoding: .isoLatin1) != nil else { return false }
        let control = sample.filter { $0 < 0x09 || ($0 > 0x0D && $0 < 0x20) }.count
        return control * 100 < sample.count
    }
}
