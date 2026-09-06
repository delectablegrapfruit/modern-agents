import Foundation

// The library's records: books, collections, annotations, reading statistics and settings. Everything is a plain
// Codable value stored as JSON; the app owns the objects and asks the store to persist them.

public enum BookKind: String, Codable, CaseIterable, Hashable {
    case epub, pdf

    public var label: String { self == .epub ? "Book" : "PDF" }
}

/// A place in an EPUB: the spine document and the character offset into its text. Stable across font, size,
/// margin and window changes, which is what lets positions and highlights survive them.
public struct Locator: Codable, Hashable {
    public var spine: Int
    public var offset: Int

    public init(spine: Int, offset: Int) {
        self.spine = spine
        self.offset = offset
    }
}

public struct ReadingPosition: Codable, Hashable {
    public var locator: Locator?
    /// PDFs: the page shown last (1-based).
    public var pdfPage: Int?
    /// 0…100
    public var percent: Double
    public var updatedAt: Date

    public init(locator: Locator? = nil, pdfPage: Int? = nil, percent: Double, updatedAt: Date = Date()) {
        self.locator = locator
        self.pdfPage = pdfPage
        self.percent = percent
        self.updatedAt = updatedAt
    }
}

public struct Book: Codable, Identifiable, Hashable {
    public var id: UUID
    public var title: String
    public var author: String
    public var kind: BookKind
    /// Name of the file that was added, for Get Info.
    public var fileName: String
    public var fileSize: Int64
    public var metadata: BookMetadata
    public var words: Int
    /// PDFs only.
    public var pageCount: Int?
    public var addedAt: Date
    public var lastOpenedAt: Date?
    public var finishedAt: Date?
    public var position: ReadingPosition?
    /// File name of the cover inside the book's folder ("cover.jpg"), when it has one.
    public var coverFile: String?
    /// How this book is viewed, where it differs from the reader settings.
    public var view: BookView?

    public init(id: UUID = UUID(), title: String, author: String, kind: BookKind, fileName: String, fileSize: Int64, metadata: BookMetadata = BookMetadata(),
                words: Int = 0, pageCount: Int? = nil, addedAt: Date = Date(), lastOpenedAt: Date? = nil, finishedAt: Date? = nil,
                position: ReadingPosition? = nil, coverFile: String? = nil, view: BookView? = nil) {
        self.id = id
        self.title = title
        self.author = author
        self.kind = kind
        self.fileName = fileName
        self.fileSize = fileSize
        self.metadata = metadata
        self.words = words
        self.pageCount = pageCount
        self.addedAt = addedAt
        self.lastOpenedAt = lastOpenedAt
        self.finishedAt = finishedAt
        self.position = position
        self.coverFile = coverFile
        self.view = view
    }

    public var isNew: Bool { lastOpenedAt == nil }
    public var isFinished: Bool { finishedAt != nil }
    /// 0…1
    public var progress: Double { min(1, max(0, (position?.percent ?? 0) / 100)) }
    public var hasStarted: Bool { (position?.percent ?? 0) > 0 }

    /// Reading time left at the library's pace, in seconds.
    public func secondsLeft(wordsPerMinute: Double = 240) -> Int? {
        guard kind == .epub, words > 0 else { return nil }
        return Int(Double(words) * (1 - progress) / wordsPerMinute * 60)
    }

    /// Author name as it sorts: "Dickens, Charles" for "Charles Dickens"; explicit `file-as` metadata is not
    /// available from every book, so the last word is taken as the surname.
    public var authorSortKey: String {
        let parts = author.split(separator: " ")
        guard parts.count > 1, let last = parts.last else { return author.lowercased() }
        return (last + ", " + parts.dropLast().joined(separator: " ")).lowercased()
    }
}

public struct BookCollection: Codable, Identifiable, Hashable {
    public var id: UUID
    public var name: String
    public var bookIDs: [UUID]
    public var createdAt: Date

    public init(id: UUID = UUID(), name: String, bookIDs: [UUID] = [], createdAt: Date = Date()) {
        self.id = id
        self.name = name
        self.bookIDs = bookIDs
        self.createdAt = createdAt
    }
}

public enum HighlightColor: String, Codable, CaseIterable, Hashable {
    case yellow, green, blue, pink, purple, underline

    public var label: String {
        switch self {
        case .yellow: return "Yellow"
        case .green: return "Green"
        case .blue: return "Blue"
        case .pink: return "Pink"
        case .purple: return "Purple"
        case .underline: return "Underline"
        }
    }
}

public enum AnnotationKind: String, Codable, Hashable {
    case highlight, bookmark
}

/// A rectangle on a PDF page in page space: one line of a highlight.
public struct PDFRect: Codable, Hashable {
    public var page: Int
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double

    public init(page: Int, x: Double, y: Double, width: Double, height: Double) {
        self.page = page
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}

/// A highlight (with an optional note) or a bookmark, anchored by locator. In a PDF the locator's spine is the
/// page index and highlights carry the page rectangles they cover.
public struct Annotation: Codable, Identifiable, Hashable {
    public var id: UUID
    public var kind: AnnotationKind
    public var locator: Locator
    /// Highlights: the end offset of the range in the same spine document.
    public var endOffset: Int?
    public var color: HighlightColor?
    /// The highlighted words, or the first words of a bookmarked page.
    public var text: String
    public var note: String
    public var chapter: String
    public var createdAt: Date
    public var updatedAt: Date
    public var pdfRects: [PDFRect]?
    /// PDFs read as reflowed text: the locator is a place in that text, not a page.
    public var pdfText: Bool?

    public init(id: UUID = UUID(), kind: AnnotationKind, locator: Locator, endOffset: Int? = nil, color: HighlightColor? = nil,
                text: String = "", note: String = "", chapter: String = "", createdAt: Date = Date(), updatedAt: Date = Date(), pdfRects: [PDFRect]? = nil, pdfText: Bool? = nil) {
        self.id = id
        self.kind = kind
        self.pdfRects = pdfRects
        self.pdfText = pdfText
        self.locator = locator
        self.endOffset = endOffset
        self.color = color
        self.text = text
        self.note = note
        self.chapter = chapter
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// MARK: - Statistics and goals

public struct DailyReading: Codable, Hashable {
    /// Local calendar day, "yyyy-MM-dd".
    public var day: String
    public var seconds: Int
    public var pages: Int

    public init(day: String, seconds: Int = 0, pages: Int = 0) {
        self.day = day
        self.seconds = seconds
        self.pages = pages
    }
}

public struct ReadingGoals: Codable, Hashable {
    public var dailyMinutes: Int
    public var yearlyBooks: Int

    public init(dailyMinutes: Int = 5, yearlyBooks: Int = 12) {
        self.dailyMinutes = dailyMinutes
        self.yearlyBooks = yearlyBooks
    }
}

public struct ReadingStats: Codable, Hashable {
    public var days: [DailyReading]

    public init(days: [DailyReading] = []) { self.days = days }

    public static func dayKey(_ date: Date = Date(), calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }

    public func seconds(on day: String) -> Int { days.first { $0.day == day }?.seconds ?? 0 }

    public var todaySeconds: Int { seconds(on: ReadingStats.dayKey()) }

    public var totalSeconds: Int { days.reduce(0) { $0 + $1.seconds } }

    public var totalPages: Int { days.reduce(0) { $0 + $1.pages } }

    public mutating func add(seconds: Int, pages: Int = 0, on date: Date = Date()) {
        let key = ReadingStats.dayKey(date)
        if let i = days.firstIndex(where: { $0.day == key }) {
            days[i].seconds += seconds
            days[i].pages += pages
        } else {
            days.append(DailyReading(day: key, seconds: seconds, pages: pages))
        }
    }

    /// Consecutive days, ending today or yesterday, on which the daily goal was met.
    public func streak(goalMinutes: Int, today: Date = Date(), calendar: Calendar = .current) -> Int {
        let met = Set(days.filter { $0.seconds >= goalMinutes * 60 }.map(\.day))
        var day = today
        var count = 0
        if !met.contains(ReadingStats.dayKey(day, calendar: calendar)) {
            guard let yesterday = calendar.date(byAdding: .day, value: -1, to: day) else { return 0 }
            day = yesterday
        }
        while met.contains(ReadingStats.dayKey(day, calendar: calendar)) {
            count += 1
            guard let previous = calendar.date(byAdding: .day, value: -1, to: day) else { break }
            day = previous
        }
        return count
    }

    /// Days with any reading in the last `count` days, oldest first; for the little bar chart.
    public func recent(_ count: Int, ending today: Date = Date(), calendar: Calendar = .current) -> [DailyReading] {
        (0..<count).reversed().compactMap { back in
            guard let date = calendar.date(byAdding: .day, value: -back, to: today) else { return nil }
            let key = ReadingStats.dayKey(date, calendar: calendar)
            return DailyReading(day: key, seconds: seconds(on: key), pages: days.first { $0.day == key }?.pages ?? 0)
        }
    }
}

// MARK: - Settings

public enum Theme: String, Codable, CaseIterable, Hashable {
    case original, quiet, paper, bold, calm, focus

    public var label: String { rawValue.prefix(1).uppercased() + rawValue.dropFirst() }
    public var isDark: Bool { self == .quiet || self == .calm || self == .focus }

    /// The dark counterpart chosen by Auto-Night.
    public var nightVariant: Theme {
        switch self {
        case .original, .bold: return .focus
        case .paper: return .calm
        case .quiet, .calm, .focus: return self
        }
    }

    /// Page and text colours, for native views that sit on the book (the PDF viewer, the end-of-book card).
    public var colors: (background: String, text: String) {
        switch self {
        case .original: return ("#ffffff", "#000000")
        case .quiet: return ("#4a4a4a", "#f2f2f2")
        case .paper: return ("#f6ecd9", "#4d3b2a")
        case .bold: return ("#ffffff", "#000000")
        case .calm: return ("#2f2a24", "#e8dcc4")
        case .focus: return ("#000000", "#ffffff")
        }
    }
}

public enum ReaderFont: String, Codable, CaseIterable, Hashable {
    case original, athelas, charter, georgia, iowan, palatino, sanfrancisco, seravek, times, newyork

    public var label: String {
        switch self {
        case .original: return "Original"
        case .athelas: return "Athelas"
        case .charter: return "Charter"
        case .georgia: return "Georgia"
        case .iowan: return "Iowan"
        case .palatino: return "Palatino"
        case .sanfrancisco: return "San Francisco"
        case .seravek: return "Seravek"
        case .times: return "Times New Roman"
        case .newyork: return "New York"
        }
    }
}

public enum LineHeight: String, Codable, CaseIterable, Hashable {
    case tight, normal, relaxed, loose
    public var label: String { rawValue.prefix(1).uppercased() + rawValue.dropFirst() }
}

public enum TextWidth: String, Codable, CaseIterable, Hashable {
    case narrow, medium, wide, full
    public var label: String { rawValue.prefix(1).uppercased() + rawValue.dropFirst() }
}

public enum ReaderLayout: String, Codable, CaseIterable, Hashable {
    case paginated, scroll
    public var label: String { self == .paginated ? "Pages" : "Vertical Scrolling" }
}

public enum Spread: String, Codable, CaseIterable, Hashable {
    case one, two
    public var label: String {
        switch self {
        case .one: return "One Page"
        case .two: return "Two Pages"
        }
    }
}

/// The view settings of one book, kept with the book: whatever is set here stands in for the reader settings while
/// that book is read, so a dense PDF keeps its text size and a reference its scrolling.
public struct BookView: Codable, Hashable {
    /// Paginated or scrolling.
    public var layout: ReaderLayout?
    /// One or two pages a screen.
    public var spread: Spread?
    /// PDFs: Pages, Zoom & Split or Text.
    public var pdfLayout: PDFLayout?
    /// Zoom & Split: the text size, 50–400%.
    public var pdfZoom: Int?

    public init(layout: ReaderLayout? = nil, spread: Spread? = nil, pdfLayout: PDFLayout? = nil, pdfZoom: Int? = nil) {
        self.layout = layout
        self.spread = spread
        self.pdfLayout = pdfLayout
        self.pdfZoom = pdfZoom
    }

    public var isEmpty: Bool { layout == nil && spread == nil && pdfLayout == nil && pdfZoom == nil }
}

/// How a PDF is shown: whole pages; pages zoomed to their text and cut into screens that turn like pages; or the
/// text reflowed into a book.
public enum PDFLayout: String, Codable, CaseIterable, Hashable {
    case pages, fit, text

    public var label: String {
        switch self {
        case .pages: return "Pages"
        case .fit: return "Zoom & Split"
        case .text: return "Text"
        }
    }
}

public enum PageTurn: String, Codable, CaseIterable, Hashable {
    case slide, none
    public var label: String { self == .slide ? "Slide" : "None" }
}

public enum WheelSensitivity: String, Codable, CaseIterable, Hashable {
    case low, medium, high
    public var label: String { rawValue.prefix(1).uppercased() + rawValue.dropFirst() }
}

/// How books are shown: everything the reader page needs, plus a few native display toggles.
public struct ReaderSettings: Codable, Hashable {
    public var theme: Theme = .original
    public var autoNight = true
    public var font: ReaderFont = .original
    /// Percent of the book's own size.
    public var fontSize = 100
    public var lineHeight: LineHeight = .normal
    public var textWidth: TextWidth = .medium
    public var justify = false
    public var hyphenate = true
    public var layout: ReaderLayout = .paginated
    public var spread: Spread = .two
    public var pageTurn: PageTurn = .slide
    public var wheelTurnsPages = true
    public var wheelSensitivity: WheelSensitivity = .medium
    public var wheelInvert = false
    public var wheelHorizontal = true
    public var showPageNumbers = true
    public var showChapterProgress = true
    public var pdfLayout: PDFLayout = .pages
    /// Zoom & Split: the text width as a percentage of the view, the PDF's text size.
    public var pdfZoom = 100

    public init() {}

    enum CodingKeys: String, CodingKey {
        case theme, autoNight, font, fontSize, lineHeight, textWidth, justify, hyphenate, layout, spread, pageTurn
        case wheelTurnsPages, wheelSensitivity, wheelInvert, wheelHorizontal, showPageNumbers, showChapterProgress, pdfLayout, pdfZoom
    }

    /// These settings with a book's own choices laid over them.
    public func applying(_ view: BookView?) -> ReaderSettings {
        guard let view else { return self }
        var s = self
        if let v = view.layout { s.layout = v }
        if let v = view.spread { s.spread = v }
        if let v = view.pdfLayout { s.pdfLayout = v }
        if let v = view.pdfZoom { s.pdfZoom = min(400, max(50, v)) }
        return s
    }

    /// Every value falls back to its default, so a settings file from another version still loads.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        theme = (try? c.decodeIfPresent(Theme.self, forKey: .theme)) ?? .original
        autoNight = (try? c.decodeIfPresent(Bool.self, forKey: .autoNight)) ?? true
        font = (try? c.decodeIfPresent(ReaderFont.self, forKey: .font)) ?? .original
        fontSize = (try? c.decodeIfPresent(Int.self, forKey: .fontSize)) ?? 100
        lineHeight = (try? c.decodeIfPresent(LineHeight.self, forKey: .lineHeight)) ?? .normal
        textWidth = (try? c.decodeIfPresent(TextWidth.self, forKey: .textWidth)) ?? .medium
        justify = (try? c.decodeIfPresent(Bool.self, forKey: .justify)) ?? false
        hyphenate = (try? c.decodeIfPresent(Bool.self, forKey: .hyphenate)) ?? true
        layout = (try? c.decodeIfPresent(ReaderLayout.self, forKey: .layout)) ?? .paginated
        spread = (try? c.decodeIfPresent(Spread.self, forKey: .spread)) ?? .two
        pageTurn = (try? c.decodeIfPresent(PageTurn.self, forKey: .pageTurn)) ?? .slide
        wheelTurnsPages = (try? c.decodeIfPresent(Bool.self, forKey: .wheelTurnsPages)) ?? true
        wheelSensitivity = (try? c.decodeIfPresent(WheelSensitivity.self, forKey: .wheelSensitivity)) ?? .medium
        wheelInvert = (try? c.decodeIfPresent(Bool.self, forKey: .wheelInvert)) ?? false
        wheelHorizontal = (try? c.decodeIfPresent(Bool.self, forKey: .wheelHorizontal)) ?? true
        showPageNumbers = (try? c.decodeIfPresent(Bool.self, forKey: .showPageNumbers)) ?? true
        showChapterProgress = (try? c.decodeIfPresent(Bool.self, forKey: .showChapterProgress)) ?? true
        pdfLayout = (try? c.decodeIfPresent(PDFLayout.self, forKey: .pdfLayout)) ?? .pages
        pdfZoom = min(400, max(50, (try? c.decodeIfPresent(Int.self, forKey: .pdfZoom)) ?? 100))
    }

    /// The theme actually shown: the night variant when Auto-Night is on and the system is dark.
    public func effectiveTheme(systemIsDark: Bool) -> Theme {
        autoNight && systemIsDark ? theme.nightVariant : theme
    }

    /// The settings object of the reader page's protocol.
    public func webSettings(systemIsDark: Bool) -> [String: Any] {
        [
            "theme": effectiveTheme(systemIsDark: systemIsDark).rawValue, "font": font.rawValue, "fontSize": fontSize,
            "lineHeight": lineHeight.rawValue, "textWidth": textWidth.rawValue, "justify": justify, "hyphenate": hyphenate,
            "layout": layout.rawValue, "spread": spread.rawValue, "pageTurn": pageTurn.rawValue,
            "wheelTurnsPages": wheelTurnsPages, "wheelSensitivity": wheelSensitivity.rawValue, "wheelInvert": wheelInvert, "wheelHorizontal": wheelHorizontal,
        ]
    }
}

public enum LibraryViewMode: String, Codable, CaseIterable, Hashable {
    case grid, list
}

public enum LibrarySort: String, Codable, CaseIterable, Hashable {
    case recent, title, author

    public var label: String {
        switch self {
        case .recent: return "Recent"
        case .title: return "Title"
        case .author: return "Author"
        }
    }
}

public struct Settings: Codable, Hashable {
    public var reader = ReaderSettings()
    public var libraryView: LibraryViewMode = .grid
    public var sort: LibrarySort = .recent
    public var goals = ReadingGoals()
    public var showContinueReading = true
    public var showGoals = true
    public var showStatistics = true
    /// Sidebar rows in the user's order and the ones hidden, by key ("all", "finished", "collection:<id>", …).
    public var sidebarOrder: [String] = []
    public var sidebarHidden: [String] = []

    public init() {}

    enum CodingKeys: String, CodingKey { case reader, libraryView, sort, goals, showContinueReading, showGoals, showStatistics, sidebarOrder, sidebarHidden }

    /// Missing or unknown values fall back to defaults, so settings written by another version still load.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        reader = (try? c.decodeIfPresent(ReaderSettings.self, forKey: .reader)) ?? ReaderSettings()
        libraryView = (try? c.decodeIfPresent(LibraryViewMode.self, forKey: .libraryView)) ?? .grid
        sort = (try? c.decodeIfPresent(LibrarySort.self, forKey: .sort)) ?? .recent
        goals = (try? c.decodeIfPresent(ReadingGoals.self, forKey: .goals)) ?? ReadingGoals()
        showContinueReading = (try? c.decodeIfPresent(Bool.self, forKey: .showContinueReading)) ?? true
        showGoals = (try? c.decodeIfPresent(Bool.self, forKey: .showGoals)) ?? true
        showStatistics = (try? c.decodeIfPresent(Bool.self, forKey: .showStatistics)) ?? true
        sidebarOrder = (try? c.decodeIfPresent([String].self, forKey: .sidebarOrder)) ?? []
        sidebarHidden = (try? c.decodeIfPresent([String].self, forKey: .sidebarHidden)) ?? []
    }
}

/// Formatting shared by the app and the command line.
public enum Format {
    public static func bytes(_ n: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: n, countStyle: .file)
    }

    /// "2 hr 5 min", "45 min", "less than a minute".
    public static func duration(seconds: Int) -> String {
        let minutes = seconds / 60
        if minutes < 1 { return "less than a minute" }
        if minutes < 60 { return "\(minutes) min" }
        let hours = minutes / 60, rest = minutes % 60
        return rest == 0 ? "\(hours) hr" : "\(hours) hr \(rest) min"
    }

    public static func plural(_ n: Int, _ word: String) -> String {
        "\(n) \(word)\(n == 1 ? "" : "s")"
    }
}
