import Foundation

// MARK: - Genres

/// Genres read off a book's subjects. Publishers put many and various subjects in EPUBs ("Science Fiction",
/// "FICTION / Science Fiction / Space Opera", "sci-fi"), and PDFs carry keywords; this table, built into the app
/// rather than downloaded, folds them into a few dozen names. A book whose subjects match nothing has no genre.
public enum Genres {
    /// A genre and the phrases that mean it: a phrase of one word must be a whole word of the subject, a longer
    /// one is looked for anywhere in it.
    public struct Rule: Hashable {
        public let genre: String
        public let phrases: [String]
    }

    public static let rules: [Rule] = [
        Rule(genre: "Science Fiction", phrases: ["science fiction", "sci-fi", "scifi", "sf", "space opera", "cyberpunk", "dystopia", "dystopian", "time travel", "steampunk", "post-apocalyptic", "apocalyptic"]),
        Rule(genre: "Fantasy", phrases: ["fantasy", "magic", "dragons", "wizards", "sword and sorcery", "fairy tales", "mythology", "myths", "legends"]),
        Rule(genre: "Mystery & Crime", phrases: ["mystery", "mysteries", "detective", "detectives", "crime", "thriller", "thrillers", "suspense", "noir", "whodunit", "spy", "espionage", "police"]),
        Rule(genre: "Horror", phrases: ["horror", "ghost", "ghosts", "supernatural", "gothic", "vampires", "zombies", "occult", "paranormal"]),
        Rule(genre: "Romance", phrases: ["romance", "love stories", "love story", "romantic"]),
        Rule(genre: "Historical Fiction", phrases: ["historical fiction", "historical novel", "historical romance"]),
        Rule(genre: "Young Adult", phrases: ["young adult", "ya", "teen", "teens", "teenage", "coming of age"]),
        Rule(genre: "Children’s", phrases: ["children", "children's", "childrens", "juvenile", "picture book", "picture books", "kids", "middle grade"]),
        Rule(genre: "Adventure", phrases: ["adventure", "adventures", "action", "sea stories", "pirates", "survival"]),
        Rule(genre: "Humor", phrases: ["humor", "humour", "humorous", "comedy", "comic", "satire", "satirical", "parody"]),
        Rule(genre: "Poetry", phrases: ["poetry", "poems", "poem", "verse", "poets"]),
        Rule(genre: "Drama & Plays", phrases: ["drama", "plays", "play", "theatre", "theater", "tragedy", "tragedies", "comedies"]),
        Rule(genre: "Short Stories", phrases: ["short stories", "short story", "anthology", "anthologies", "novella", "novellas"]),
        Rule(genre: "Comics & Graphic Novels", phrases: ["comics", "graphic novel", "graphic novels", "manga", "cartoons"]),
        Rule(genre: "Classics", phrases: ["classics", "classic", "classic literature", "literary classics", "world literature"]),
        Rule(genre: "Literary Fiction", phrases: ["literary fiction", "literary", "contemporary fiction", "general fiction"]),
        Rule(genre: "Biography & Memoir", phrases: ["biography", "biographies", "biographical", "memoir", "memoirs", "autobiography", "autobiographies", "diaries", "diary", "letters", "correspondence"]),
        Rule(genre: "History", phrases: ["history", "historical", "world war", "civil war", "ancient", "medieval", "renaissance", "antiquity", "archaeology"]),
        Rule(genre: "Science & Nature", phrases: ["science", "sciences", "physics", "biology", "chemistry", "astronomy", "cosmology", "nature", "natural history", "mathematics", "math", "evolution", "geology", "ecology", "environment", "climate", "animals", "birds"]),
        Rule(genre: "Technology & Computing", phrases: ["computers", "computer", "computing", "programming", "software", "technology", "engineering", "internet", "artificial intelligence", "machine learning", "data", "electronics", "robotics"]),
        Rule(genre: "Business & Economics", phrases: ["business", "economics", "economy", "finance", "financial", "management", "marketing", "investing", "investment", "entrepreneurship", "leadership", "money", "careers", "career"]),
        Rule(genre: "Self-Help & Psychology", phrases: ["self-help", "self help", "psychology", "psychological", "personal development", "self-improvement", "motivation", "motivational", "mindfulness", "happiness", "habits", "productivity", "relationships"]),
        Rule(genre: "Health & Fitness", phrases: ["health", "fitness", "diet", "diets", "nutrition", "medicine", "medical", "wellness", "yoga", "exercise", "mental health", "sleep"]),
        Rule(genre: "Philosophy", phrases: ["philosophy", "philosophical", "ethics", "stoicism", "metaphysics", "logic", "epistemology"]),
        Rule(genre: "Religion & Spirituality", phrases: ["religion", "religious", "spirituality", "spiritual", "theology", "bible", "biblical", "buddhism", "christianity", "christian", "islam", "judaism", "hinduism", "meditation", "prayer"]),
        Rule(genre: "Politics & Society", phrases: ["politics", "political", "political science", "sociology", "society", "social science", "social sciences", "government", "current affairs", "current events", "law", "journalism", "culture", "cultural studies", "feminism", "gender"]),
        Rule(genre: "Travel", phrases: ["travel", "travels", "travel writing", "guidebook", "guidebooks", "voyages", "exploration", "explorers"]),
        Rule(genre: "Cooking & Food", phrases: ["cooking", "cookbook", "cookbooks", "cookery", "recipes", "food", "baking", "wine", "gastronomy"]),
        Rule(genre: "Art & Design", phrases: ["art", "arts", "design", "photography", "architecture", "painting", "sculpture", "fashion", "crafts", "drawing", "illustration"]),
        Rule(genre: "Music & Film", phrases: ["music", "musicians", "film", "films", "cinema", "movies", "television"]),
        Rule(genre: "Sports & Games", phrases: ["sports", "sport", "football", "soccer", "baseball", "basketball", "cycling", "running", "chess", "games", "gaming", "hiking", "mountaineering"]),
        Rule(genre: "Essays", phrases: ["essays", "essay", "criticism", "literary criticism"]),
        Rule(genre: "True Crime", phrases: ["true crime"]),
        Rule(genre: "Reference & Education", phrases: ["reference", "dictionary", "dictionaries", "encyclopedia", "encyclopedias", "education", "educational", "textbook", "textbooks", "study", "study guides", "language", "languages", "grammar", "linguistics", "teaching", "manual", "manuals", "how-to"]),
        Rule(genre: "Fiction", phrases: ["fiction", "novel", "novels", "stories"]),
        Rule(genre: "Nonfiction", phrases: ["nonfiction", "non-fiction", "general"]),
    ]

    /// The genre names, in the table's order.
    public static let all: [String] = rules.map(\.genre)

    /// Names that only say a book is fiction or not; they give way to anything more particular.
    static let generic: Set<String> = ["Fiction", "Nonfiction"]

    /// The genres of a book with these subjects, most particular first and each once. Subjects are split at the
    /// slashes, semicolons and dashes publishers use for hierarchies ("FICTION / Science Fiction / Space Opera").
    /// Phrases of several words are looked for first and use up their words, so "science fiction" is not also
    /// science and "natural history" not also history; then single words are matched whole.
    public static func genres(for subjects: [String]) -> [String] {
        var found: [String] = []
        func note(_ genre: String) { if !found.contains(genre) { found.append(genre) } }
        for subject in subjects {
            for segment in segments(of: subject) {
                var words = Set(segment.split { !$0.isLetter && !$0.isNumber && $0 != "-" && $0 != "'" && $0 != "’" }.map { String($0) })
                for rule in rules {
                    for phrase in rule.phrases where phrase.contains(" ") && segment.contains(phrase) {
                        note(rule.genre)
                        for word in phrase.split(separator: " ") { words.remove(String(word)) }
                    }
                }
                for rule in rules {
                    if rule.phrases.contains(where: { !$0.contains(" ") && words.contains($0) }) { note(rule.genre) }
                }
            }
        }
        if found.contains(where: { !generic.contains($0) }) { found.removeAll { generic.contains($0) } }
        return found
    }

    static func segments(of subject: String) -> [String] {
        let lowered = subject.lowercased().replacingOccurrences(of: "’", with: "'")
        var parts = lowered.components(separatedBy: CharacterSet(charactersIn: "/;|")).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        parts += lowered.components(separatedBy: " -- ").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        if parts.isEmpty { parts = [lowered] }
        return Array(Set(parts)).sorted()
    }
}

/// A table of your own for books whose subjects say too little: Genres.csv beside the library (and in the library
/// folder, if one is set), one book a line — an ISBN, or `title|author`, then a comma and the subjects or genres
/// separated by semicolons. Subjects are folded through the built-in table like a book's own. Such a file can be
/// made from the Open Library dumps with tools/genres_from_openlibrary.py.
public struct GenreDatabase {
    public private(set) var byISBN: [String: [String]] = [:]
    public private(set) var byTitle: [String: [String]] = [:]
    public var count: Int { byISBN.count + byTitle.count }
    public var isEmpty: Bool { byISBN.isEmpty && byTitle.isEmpty }

    public init() {}

    public init(csv: String) {
        for rawLine in csv.split(whereSeparator: { $0 == "\n" || $0 == "\r\n" }) {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            guard !line.isEmpty, !line.hasPrefix("#"), let comma = line.firstIndex(of: ",") else { continue }
            let key = line[..<comma].trimmingCharacters(in: .whitespaces)
            let subjects = line[line.index(after: comma)...].split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            guard !subjects.isEmpty else { continue }
            if let isbn = GenreDatabase.isbn(in: key) {
                byISBN[isbn] = subjects
            } else if key.contains("|") {
                let parts = key.split(separator: "|", maxSplits: 1).map(String.init)
                byTitle[GenreDatabase.titleKey(parts[0], parts.count > 1 ? parts[1] : "")] = subjects
            } else if key.lowercased() != "key" && key.lowercased() != "isbn" {
                byTitle[GenreDatabase.titleKey(key, "")] = subjects
            }
        }
    }

    /// The file at the URL, or nil when there is none or it cannot be read.
    public static func load(from url: URL) -> GenreDatabase? {
        guard let data = try? Data(contentsOf: url), let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) else { return nil }
        return GenreDatabase(csv: text)
    }

    /// Several files together; a later one's line for a book wins.
    public mutating func merge(_ other: GenreDatabase) {
        byISBN.merge(other.byISBN) { $1 }
        byTitle.merge(other.byTitle) { $1 }
    }

    /// The subjects the table has for a book, by its ISBN first, then by title and author, then by title alone.
    public func subjects(identifier: String, title: String, author: String) -> [String] {
        if let isbn = GenreDatabase.isbn(in: identifier), let found = byISBN[isbn] { return found }
        if let found = byTitle[GenreDatabase.titleKey(title, author)] { return found }
        if let found = byTitle[GenreDatabase.titleKey(title, "")] { return found }
        return []
    }

    /// The digits of an ISBN-10 or ISBN-13 in a string such as "urn:isbn:978-0-14-044913-6", or nil.
    public static func isbn(in text: String) -> String? {
        let lowered = text.lowercased()
        let start = lowered.range(of: "isbn").map { lowered[$0.upperBound...] } ?? Substring(lowered)
        let digits = start.filter { $0.isNumber || $0 == "x" }
        guard digits.count == 10 || digits.count == 13, start.filter({ $0.isLetter && $0 != "x" }).isEmpty else { return nil }
        return String(digits)
    }

    /// Title and author folded to lower case without accents, spaces squeezed.
    public static func titleKey(_ title: String, _ author: String) -> String {
        func fold(_ s: String) -> String {
            s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil).split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        }
        let a = fold(author)
        return a.isEmpty ? fold(title) : fold(title) + "|" + a
    }
}

// MARK: - Goal periods

/// The stretch a pages or chapters goal is set for.
public enum GoalPeriod: String, Codable, CaseIterable, Hashable {
    case week, month, quarter, year

    public var label: String {
        switch self {
        case .week: return "Week"
        case .month: return "Month"
        case .quarter: return "3 Months"
        case .year: return "Year"
        }
    }

    /// "This Week", "This Month", "These 3 Months", "This Year".
    public var thisLabel: String {
        switch self {
        case .week: return "This Week"
        case .month: return "This Month"
        case .quarter: return "These 3 Months"
        case .year: return "This Year"
        }
    }

    /// The stretch of this kind that holds the date: start included, end excluded.
    public func interval(containing date: Date, calendar: Calendar = .current) -> (start: Date, end: Date) {
        switch self {
        case .week:
            let i = calendar.dateInterval(of: .weekOfYear, for: date) ?? DateInterval(start: date, duration: 7 * 86400)
            return (i.start, i.end)
        case .month:
            let i = calendar.dateInterval(of: .month, for: date) ?? DateInterval(start: date, duration: 30 * 86400)
            return (i.start, i.end)
        case .quarter:
            var c = calendar.dateComponents([.year, .month], from: date)
            let month = c.month ?? 1
            c.month = ((month - 1) / 3) * 3 + 1
            c.day = 1
            let start = calendar.date(from: c) ?? date
            let end = calendar.date(byAdding: .month, value: 3, to: start) ?? start
            return (start, end)
        case .year:
            let i = calendar.dateInterval(of: .year, for: date) ?? DateInterval(start: date, duration: 365 * 86400)
            return (i.start, i.end)
        }
    }

    /// Days in the stretch holding the date.
    public func days(containing date: Date, calendar: Calendar = .current) -> Int {
        let (start, end) = interval(containing: date, calendar: calendar)
        return max(1, calendar.dateComponents([.day], from: start, to: end).day ?? 1)
    }
}

// MARK: - Home

/// The widgets Home is made of, each shown or not, in an order of your own and at a size of its own.
public enum HomeElement: String, Codable, CaseIterable, Hashable {
    case continueReading, pickUpAgain, goals, progress, calendar, activity, statistics, forYou, recentlyAdded, recentlyFinished

    public var label: String {
        switch self {
        case .continueReading: return "Continue Reading"
        case .pickUpAgain: return "Pick Up Again"
        case .goals: return "Reading Goals"
        case .progress: return "Pages & Chapters"
        case .calendar: return "Reading Calendar"
        case .activity: return "Activity"
        case .statistics: return "Statistics"
        case .forYou: return "For You"
        case .recentlyAdded: return "Recently Added"
        case .recentlyFinished: return "Recently Finished"
        }
    }

    /// What the widget does, for the widget gallery: one sentence starting with a verb, as Apple's widget
    /// descriptions do.
    public var galleryDescription: String {
        switch self {
        case .continueReading: return "Pick up where you left off in the books you’re reading."
        case .pickUpAgain: return "Return to books you started but haven’t opened for a while."
        case .goals: return "Track today’s reading, your streak and the books you finish."
        case .progress: return "Follow the pages and chapters you read this week, month or year."
        case .calendar: return "See the days you read this month."
        case .activity: return "See months of reading at a glance, darker the more you read."
        case .statistics: return "Keep an eye on your library and your reading in numbers."
        case .forYou: return "Discover unopened books in the genres and by the authors you read."
        case .recentlyAdded: return "Find the newest books in your library."
        case .recentlyFinished: return "Look back at the books you finished last."
        }
    }

    /// The line under the name wherever widgets are listed; the same as the gallery's description.
    public var detail: String { galleryDescription }

    /// The SF Symbol that stands for the widget in its header, the gallery and the lists of widgets.
    public var symbol: String {
        switch self {
        case .continueReading: return "book.fill"
        case .pickUpAgain: return "clock.arrow.circlepath"
        case .goals: return "target"
        case .progress: return "doc.text.fill"
        case .calendar: return "calendar"
        case .activity: return "square.grid.3x3.fill"
        case .statistics: return "chart.bar.xaxis"
        case .forYou: return "sparkles"
        case .recentlyAdded: return "plus.circle.fill"
        case .recentlyFinished: return "checkmark.circle.fill"
        }
    }

    /// The sizes the widget comes in, smallest first. A widget offers only the sizes it has a real layout for:
    /// a calendar has no row of four, and a heat map has no square of one.
    public var families: [WidgetSize] {
        switch self {
        case .continueReading, .pickUpAgain, .forYou, .recentlyAdded, .recentlyFinished: return [.small, .medium, .large, .extraLarge]
        case .goals, .calendar, .statistics: return [.small, .medium, .large]
        case .progress: return [.small, .medium]
        case .activity: return [.medium, .large, .extraLarge]
        }
    }

    /// The size a widget takes until you choose another. Home's first four fill a block of four by four exactly:
    /// Continue Reading large beside Reading Goals and Activity, both medium, over a row of Recently Added.
    public var defaultSize: WidgetSize {
        switch self {
        case .continueReading: return .large
        case .recentlyAdded: return .extraLarge
        case .pickUpAgain, .goals, .activity, .statistics, .forYou, .recentlyFinished: return .medium
        case .progress, .calendar: return .small
        }
    }

    /// Widgets with settings of their own, offered as Edit “Name”… in the widget's menu; both open the goals.
    public var isConfigurable: Bool {
        switch self {
        case .goals, .progress: return true
        case .continueReading, .pickUpAgain, .calendar, .activity, .statistics, .forYou, .recentlyAdded, .recentlyFinished: return false
        }
    }

    /// Home starts simple: what you are reading, the goals, the activity of the half year and the newest books.
    public var isShownByDefault: Bool {
        switch self {
        case .continueReading, .goals, .activity, .recentlyAdded: return true
        case .pickUpAgain, .progress, .calendar, .statistics, .forYou, .recentlyFinished: return false
        }
    }
}

/// How many columns and rows of Home's square grid a widget covers.
public struct GridSpan: Hashable {
    public let columns: Int
    public let rows: Int

    public init(columns: Int, rows: Int) {
        self.columns = columns
        self.rows = rows
    }
}

/// A widget's size, as Apple's widget families: small is one square of the grid, medium two side by side, large
/// two by two and extra large four by two.
public enum WidgetSize: String, Codable, CaseIterable, Hashable {
    case small, medium, large, extraLarge

    public var label: String {
        switch self {
        case .small: return "Small"
        case .medium: return "Medium"
        case .large: return "Large"
        case .extraLarge: return "Extra Large"
        }
    }

    public var span: GridSpan {
        switch self {
        case .small: return GridSpan(columns: 1, rows: 1)
        case .medium: return GridSpan(columns: 2, rows: 1)
        case .large: return GridSpan(columns: 2, rows: 2)
        case .extraLarge: return GridSpan(columns: 4, rows: 2)
        }
    }

    /// A size by its stored name. "wide", the full-row size of the version before, is extra large now.
    public static func named(_ name: String) -> WidgetSize? {
        name == "wide" ? .extraLarge : WidgetSize(rawValue: name)
    }

    public init(from decoder: Decoder) throws {
        let name = try decoder.singleValueContainer().decode(String.self)
        guard let size = WidgetSize.named(name) else {
            throw DecodingError.dataCorrupted(DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "No widget size is called \(name)"))
        }
        self = size
    }

    /// This size when it fits a grid of so many columns, else the biggest of the supported sizes that does, so
    /// an extra large widget is drawn large on a narrow Home rather than squeezed.
    public func fitting(columns: Int, supported: [WidgetSize]) -> WidgetSize {
        if span.columns <= columns { return self }
        let fits = supported.filter { $0.span.columns <= columns }
        return fits.max { $0.span.columns * $0.span.rows < $1.span.columns * $1.span.rows } ?? .small
    }
}

/// Which widgets Home shows, in what order and at what size. Widgets the order does not name follow it in the
/// usual order, so a version with new widgets shows them.
public struct HomeSettings: Codable, Hashable {
    public var order: [HomeElement]
    public var hidden: [HomeElement]
    /// A widget's size where it differs from its usual one, by the element's name.
    public var sizes: [String: WidgetSize]

    public init(order: [HomeElement] = HomeElement.allCases, hidden: [HomeElement] = HomeElement.allCases.filter { !$0.isShownByDefault }, sizes: [String: WidgetSize] = [:]) {
        self.order = order
        self.hidden = hidden
        self.sizes = sizes
    }

    enum CodingKeys: String, CodingKey { case order, hidden, sizes }

    /// One stored size that never fails to decode, so a value this version does not know costs only itself.
    private struct StoredSize: Decodable {
        let size: WidgetSize?

        init(from decoder: Decoder) throws {
            size = (try? decoder.singleValueContainer().decode(String.self)).flatMap(WidgetSize.named)
        }
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // Unknown names — a piece this version no longer has — are dropped rather than failing the whole thing.
        let names = (try? c.decodeIfPresent([String].self, forKey: .order)) ?? []
        order = names.compactMap(HomeElement.init(rawValue:))
        hidden = ((try? c.decodeIfPresent([String].self, forKey: .hidden)) ?? []).compactMap(HomeElement.init(rawValue:))
        let stored = (try? c.decodeIfPresent([String: StoredSize].self, forKey: .sizes)) ?? [:]
        sizes = stored.compactMapValues { $0.size }
    }

    /// The widget's size: as chosen, if the widget can take it, else its usual one.
    public func size(of element: HomeElement) -> WidgetSize {
        if let chosen = sizes[element.rawValue], element.families.contains(chosen) { return chosen }
        return element.defaultSize
    }

    public mutating func setSize(_ size: WidgetSize, for element: HomeElement) {
        guard element.families.contains(size) else { return }
        if size == element.defaultSize { sizes.removeValue(forKey: element.rawValue) } else { sizes[element.rawValue] = size }
    }

    /// Every piece, the chosen order first, then any the order does not name.
    public var elements: [HomeElement] {
        var seen = Set<HomeElement>()
        var all = order.filter { seen.insert($0).inserted }
        all += HomeElement.allCases.filter { seen.insert($0).inserted }
        return all
    }

    public var visible: [HomeElement] { elements.filter { !hidden.contains($0) } }

    public func isShown(_ element: HomeElement) -> Bool { !hidden.contains(element) }

    public mutating func setShown(_ element: HomeElement, _ shown: Bool) {
        hidden.removeAll { $0 == element }
        if !shown { hidden.append(element) }
    }

    public mutating func move(fromOffsets source: IndexSet, toOffset destination: Int) {
        var all = elements
        let moving = source.sorted().map { all[$0] }
        for i in source.sorted().reversed() { all.remove(at: i) }
        let target = destination - source.filter { $0 < destination }.count
        all.insert(contentsOf: moving, at: max(0, min(all.count, target)))
        order = all
    }

    /// Puts a widget in another's place, as dragging one onto another does: after it when coming from before it,
    /// before it when coming from after, so the two change places when they are neighbours.
    public mutating func move(_ element: HomeElement, to target: HomeElement) {
        guard element != target else { return }
        var all = elements
        guard let from = all.firstIndex(of: element), let to = all.firstIndex(of: target) else { return }
        all.remove(at: from)
        guard let landing = all.firstIndex(of: target) else { return }
        all.insert(element, at: from < to ? landing + 1 : landing)
        order = all
    }

    /// Puts a widget after all the others.
    public mutating func moveToEnd(_ element: HomeElement) {
        var all = elements
        all.removeAll { $0 == element }
        all.append(element)
        order = all
    }

    /// Shows a widget at a size, as clicking it in the widget gallery does: a hidden widget joins at the end of
    /// Home, one already shown keeps its place and takes the size.
    public mutating func add(_ element: HomeElement, size: WidgetSize) {
        if !isShown(element) {
            moveToEnd(element)
            setShown(element, true)
        }
        setSize(size, for: element)
    }
}

/// A widget where Home's grid puts it: its size as drawn, and the column and row of its top-left square.
public struct HomePlacement: Hashable, Identifiable {
    public let element: HomeElement
    public let size: WidgetSize
    public let column: Int
    public let row: Int

    public init(element: HomeElement, size: WidgetSize, column: Int, row: Int) {
        self.element = element
        self.size = size
        self.column = column
        self.row = row
    }

    public var id: HomeElement { element }
}

/// Home's grid, as on the iPad and the Mac desktop: square units in two or four columns with one gap between
/// them on both axes, and the widgets placed in reading order, each in the first place further on where it fits
/// whole. Smaller widgets later in the order fill the holes left earlier, and nothing is stretched to fill a row.
public enum HomeGrid {
    /// The gap between widgets, across and down.
    public static let gap: Double = 20
    /// Four columns need at least this much of a unit; narrower, Home has two.
    public static let minimumUnit: Double = 150
    /// Units stop growing here; a wider Home centres its grid rather than stretch the widgets.
    public static let maximumUnit: Double = 240

    /// Two columns, or four when four units of at least the minimum fit the width.
    public static func columns(forWidth width: Double) -> Int {
        width >= 4 * minimumUnit + 3 * gap ? 4 : 2
    }

    /// The side of a unit: the width shared by the columns less their gaps, in whole points, no more than the maximum.
    public static func unit(forWidth width: Double, columns: Int) -> Double {
        let count = max(1, columns)
        return max(1, min(maximumUnit, ((width - Double(count - 1) * gap) / Double(count)).rounded(.down)))
    }

    /// Rows the placed widgets take, the last one's bottom included.
    public static func rows(_ placements: [HomePlacement]) -> Int {
        placements.map { $0.row + $0.size.span.rows }.max() ?? 0
    }

    /// The widgets placed in order, dense first-fit: each goes to the first row, and the first column in it, where
    /// its whole span is free. A widget wider than the grid takes the biggest of its sizes that fits. The grid is
    /// never narrower than two columns, so every widget has a size that fits.
    public static func place(_ items: [(HomeElement, WidgetSize)], columns requested: Int) -> [HomePlacement] {
        let columns = max(2, requested)
        var taken: [[Bool]] = []
        func free(_ column: Int, _ row: Int, _ span: GridSpan) -> Bool {
            for y in row..<(row + span.rows) where y < taken.count {
                for x in column..<(column + span.columns) where taken[y][x] { return false }
            }
            return true
        }
        var placed: [HomePlacement] = []
        for (element, chosen) in items {
            let size = chosen.fitting(columns: columns, supported: element.families)
            let span = GridSpan(columns: min(columns, size.span.columns), rows: size.span.rows)
            var row = 0
            var spot: Int?
            while spot == nil {
                spot = (0...(columns - span.columns)).first { free($0, row, span) }
                if spot == nil { row += 1 }
            }
            let column = spot ?? 0
            while taken.count < row + span.rows { taken.append(Array(repeating: false, count: columns)) }
            for y in row..<(row + span.rows) {
                for x in column..<(column + span.columns) { taken[y][x] = true }
            }
            placed.append(HomePlacement(element: element, size: size, column: column, row: row))
        }
        return placed
    }
}

/// How a shelf is grouped: not at all, by collection (the Library's shelves), or by genre (any shelf).
public enum ShelfGrouping: String, Codable, CaseIterable, Hashable {
    case none, collection, genre

    public var label: String {
        switch self {
        case .none: return "None"
        case .collection: return "Collection"
        case .genre: return "Genre"
        }
    }
}

// MARK: - Reading over time

public extension ReadingStats {
    /// The date a day key names, at the start of that day.
    static func date(fromKey key: String, calendar: Calendar = .current) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var c = DateComponents()
        c.year = parts[0]
        c.month = parts[1]
        c.day = parts[2]
        return calendar.date(from: c)
    }

    /// Everything read from `start` up to but not including `end`.
    func totals(from start: Date, to end: Date, calendar: Calendar = .current) -> DailyReading {
        var sum = DailyReading(day: ReadingStats.dayKey(start, calendar: calendar))
        for day in days {
            guard let date = ReadingStats.date(fromKey: day.day, calendar: calendar), date >= start, date < end else { continue }
            sum.seconds += day.seconds
            sum.pages += day.pages
            sum.chapters += day.chapters
        }
        return sum
    }

    /// Everything read in the goal period holding the date.
    func totals(in period: GoalPeriod, containing date: Date = Date(), calendar: Calendar = .current) -> DailyReading {
        let (start, end) = period.interval(containing: date, calendar: calendar)
        return totals(from: start, to: end, calendar: calendar)
    }

    /// The most consecutive days ever on which the daily goal was met.
    func longestStreak(goalMinutes: Int, calendar: Calendar = .current) -> Int {
        let met = days.filter { $0.seconds >= goalMinutes * 60 }.compactMap { ReadingStats.date(fromKey: $0.day, calendar: calendar) }.sorted()
        var best = 0, run = 0
        var previous: Date?
        for date in met {
            if let previous, let next = calendar.date(byAdding: .day, value: 1, to: previous), calendar.isDate(next, inSameDayAs: date) {
                run += 1
            } else {
                run = 1
            }
            best = max(best, run)
            previous = date
        }
        return best
    }

    /// Days on which anything was read.
    var activeDays: Int { days.filter { $0.seconds > 0 || $0.pages > 0 }.count }

    /// The day with the most reading.
    var bestDay: DailyReading? { days.max { $0.seconds < $1.seconds } }

    var totalChapters: Int { days.reduce(0) { $0 + $1.chapters } }

    /// Every day of the month holding the date, in order, with what was read on it.
    func month(containing date: Date, calendar: Calendar = .current) -> [DailyReading] {
        guard let interval = calendar.dateInterval(of: .month, for: date) else { return [] }
        var result: [DailyReading] = []
        var day = interval.start
        while day < interval.end {
            let key = ReadingStats.dayKey(day, calendar: calendar)
            result.append(days.first { $0.day == key } ?? DailyReading(day: key))
            guard let next = calendar.date(byAdding: .day, value: 1, to: day) else { break }
            day = next
        }
        return result
    }

    /// The month holding the date as rows of seven days, the calendar's first weekday first, the way a month is
    /// printed; the places before the first and after the last day are nil.
    func monthWeeks(containing date: Date, calendar: Calendar = .current) -> [[DailyReading?]] {
        let days = month(containing: date, calendar: calendar)
        guard let firstKey = days.first?.day, let first = ReadingStats.date(fromKey: firstKey, calendar: calendar) else { return [] }
        let leading = (calendar.component(.weekday, from: first) - calendar.firstWeekday + 7) % 7
        var cells = [DailyReading?](repeating: nil, count: leading)
        for day in days { cells.append(day) }
        while cells.count % 7 != 0 { cells.append(nil) }
        return stride(from: 0, to: cells.count, by: 7).map { Array(cells[$0..<($0 + 7)]) }
    }

    /// How dark a day is drawn on the calendar and the heat map: 0 when nothing was read, else 1 to 4 by the
    /// quarter of the busiest day's time it reaches. A day with pages turned but no time counted is 1.
    static func heatLevel(seconds: Int, pages: Int = 0, peak: Int) -> Int {
        guard seconds > 0 || pages > 0 else { return 0 }
        guard seconds > 0, peak > 0 else { return 1 }
        let share = min(1, Double(seconds) / Double(peak))
        return max(1, min(4, Int((share * 4).rounded(.up))))
    }

    /// The last `count` weeks as columns of seven days, the first day of each week first, ending with the week
    /// holding today (its days to come included, empty).
    func weeks(_ count: Int, ending today: Date = Date(), calendar: Calendar = .current) -> [[DailyReading]] {
        guard let thisWeek = calendar.dateInterval(of: .weekOfYear, for: today) else { return [] }
        var columns: [[DailyReading]] = []
        for back in (0..<count).reversed() {
            guard let start = calendar.date(byAdding: .weekOfYear, value: -back, to: thisWeek.start) else { continue }
            var week: [DailyReading] = []
            for offset in 0..<7 {
                guard let day = calendar.date(byAdding: .day, value: offset, to: start) else { continue }
                let key = ReadingStats.dayKey(day, calendar: calendar)
                week.append(days.first { $0.day == key } ?? DailyReading(day: key))
            }
            columns.append(week)
        }
        return columns
    }
}
