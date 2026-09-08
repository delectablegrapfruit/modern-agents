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
    public static func genres(for subjects: [String]) -> [String] {
        var found: [String] = []
        for subject in subjects {
            for segment in segments(of: subject) {
                let words = Set(segment.split { !$0.isLetter && !$0.isNumber && $0 != "-" && $0 != "'" && $0 != "’" }.map { String($0) })
                for rule in rules where !found.contains(rule.genre) {
                    for phrase in rule.phrases {
                        let matched = phrase.contains(" ") || phrase.contains("-") ? segment.contains(phrase) : words.contains(phrase)
                        if matched { found.append(rule.genre); break }
                    }
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

/// The pieces Home is made of, each shown or not and in an order of your own.
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

    /// What the piece shows, for the customizing list.
    public var detail: String {
        switch self {
        case .continueReading: return "Books you are in the middle of, the latest first"
        case .pickUpAgain: return "Books you started but haven’t opened for two weeks"
        case .goals: return "Today’s minutes, books this month and this year"
        case .progress: return "Pages and chapters read against a goal for the week, month, 3 months or year"
        case .calendar: return "A month of days, marked when you read"
        case .activity: return "Half a year of days, darker the more you read"
        case .statistics: return "The library and your reading in numbers"
        case .forYou: return "Unopened books in the genres and by the authors you read"
        case .recentlyAdded: return "The newest books not yet opened"
        case .recentlyFinished: return "The books you finished last"
        }
    }

    /// Strips of books run the width; the rest sit in a grid.
    public var isStrip: Bool {
        switch self {
        case .continueReading, .pickUpAgain, .forYou, .recentlyAdded, .recentlyFinished: return true
        case .goals, .progress, .calendar, .activity, .statistics: return false
        }
    }
}

/// Which pieces Home shows and in what order. Pieces the order does not name follow it in the usual order, so
/// a version with new pieces shows them.
public struct HomeSettings: Codable, Hashable {
    public var order: [HomeElement]
    public var hidden: [HomeElement]

    public init(order: [HomeElement] = HomeElement.allCases, hidden: [HomeElement] = []) {
        self.order = order
        self.hidden = hidden
    }

    enum CodingKeys: String, CodingKey { case order, hidden }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // Unknown names — a piece this version no longer has — are dropped rather than failing the whole thing.
        let names = (try? c.decodeIfPresent([String].self, forKey: .order)) ?? []
        order = names.compactMap(HomeElement.init(rawValue:))
        hidden = ((try? c.decodeIfPresent([String].self, forKey: .hidden)) ?? []).compactMap(HomeElement.init(rawValue:))
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
