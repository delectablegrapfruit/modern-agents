import SwiftUI
import BooksCore

/// Home: the pieces you chose, in your order — strips of books across the width (Continue Reading, Pick Up Again,
/// For You, Recently Added, Recently Finished) and cards side by side in a grid (Reading Goals, Pages & Chapters,
/// the Reading Calendar, Activity, Statistics). Each can be hidden from the toolbar's Customize menu; Customize
/// Home… puts them in order. A strip with nothing to show stays out of the way.
struct HomeView: View {
    @Environment(LibraryModel.self) private var model

    /// Consecutive cards share a grid; a strip breaks it.
    private enum Block: Identifiable {
        case strip(HomeElement)
        case grid([HomeElement])

        var id: String {
            switch self {
            case .strip(let e): return e.rawValue
            case .grid(let es): return es.map(\.rawValue).joined(separator: "+")
            }
        }
    }

    private var blocks: [Block] {
        var blocks: [Block] = []
        var pending: [HomeElement] = []
        for element in model.settings.home.visible {
            if element.isStrip {
                if !pending.isEmpty { blocks.append(.grid(pending)); pending = [] }
                blocks.append(.strip(element))
            } else {
                pending.append(element)
            }
        }
        if !pending.isEmpty { blocks.append(.grid(pending)) }
        return blocks
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if model.books.isEmpty {
                    ContentUnavailableView {
                        Label("Your Library Is Empty", systemImage: "books.vertical")
                    } description: {
                        Text("Add EPUB, Kindle (MOBI, AZW3), PDF and text files, or drop them on the window. Everything stays on this Mac.")
                    } actions: {
                        Button("Add Books…") { model.chooseFiles() }.buttonStyle(.borderedProminent)
                    }
                    .frame(maxWidth: .infinity, minHeight: 420)
                } else if model.settings.home.visible.isEmpty {
                    ContentUnavailableView("Home Is Hidden", systemImage: "house", description: Text("Use Customize in the toolbar to choose what Home shows."))
                        .frame(maxWidth: .infinity, minHeight: 320)
                } else {
                    ForEach(blocks) { block in
                        switch block {
                        case .strip(let element):
                            card(element)
                        case .grid(let elements):
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 400, maximum: 760), spacing: 24, alignment: .top)], alignment: .leading, spacing: 24) {
                                ForEach(elements, id: \.self) { card($0) }
                            }
                        }
                    }
                }
            }
            .padding(28)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private func card(_ element: HomeElement) -> some View {
        switch element {
        case .continueReading:
            let books = model.continueReading
            if !books.isEmpty {
                BookStripCard(title: "Continue Reading", items: books.prefix(12).map { StripItem(book: $0, line: Display.progressLine($0)) }, action: { model.sidebarSelection = .all }, actionLabel: "See All")
            }
        case .pickUpAgain:
            let books = model.pickUpAgain
            if !books.isEmpty {
                BookStripCard(title: "Pick Up Again", subtitle: "Started, but not opened for a while", items: books.prefix(12).map { StripItem(book: $0, line: "Last read \(Display.ago($0.lastOpenedAt ?? $0.addedAt)) · \(whole($0.progress * 100))%") })
            }
        case .goals:
            GoalsCard()
        case .progress:
            ProgressGoalsCard()
        case .calendar:
            CalendarCard()
        case .activity:
            ActivityCard()
        case .statistics:
            StatisticsCard()
        case .forYou:
            let suggestions = model.forYou
            if !suggestions.isEmpty {
                BookStripCard(title: "For You", subtitle: "Unopened books in the genres and by the authors you read", items: suggestions.prefix(12).map { StripItem(book: $0.book, line: $0.reason) })
            }
        case .recentlyAdded:
            let books = model.recentlyAdded
            if !books.isEmpty {
                BookStripCard(title: "Recently Added", subtitle: "Not yet opened", items: books.prefix(12).map { StripItem(book: $0, line: "Added \(Display.ago($0.addedAt))") })
            }
        case .recentlyFinished:
            let books = model.recentlyFinished
            if !books.isEmpty {
                BookStripCard(title: "Recently Finished", items: books.prefix(12).map { StripItem(book: $0, line: "Finished \(Display.added($0.finishedAt ?? Date()))") }, action: { model.sidebarSelection = .finished }, actionLabel: "See All")
            }
        }
    }
}

// MARK: - Strips

struct StripItem: Identifiable {
    let book: Book
    let line: String
    var id: UUID { book.id }
}

/// A row of covers with a line under each, scrolling sideways.
struct BookStripCard: View {
    let title: String
    var subtitle: String?
    let items: [StripItem]
    var action: (() -> Void)?
    var actionLabel: String?

    var body: some View {
        HomeCard(title: title, subtitle: subtitle, action: action, actionLabel: actionLabel) {
            ScrollView(.horizontal) {
                HStack(alignment: .top, spacing: 22) {
                    ForEach(items) { item in
                        StripBook(book: item.book, line: item.line)
                    }
                }
                .padding(.vertical, 6)
            }
            .scrollIndicators(.hidden)
        }
    }
}

struct StripBook: View {
    @Environment(LibraryModel.self) private var model
    let book: Book
    let line: String
    @State private var hovering = false

    var body: some View {
        Button { model.open(book) } label: {
            VStack(alignment: .leading, spacing: 8) {
                CoverView(book: book, width: 132, height: 198)
                    .scaleEffect(hovering ? 1.03 : 1)
                    .animation(.easeOut(duration: 0.15), value: hovering)
                VStack(alignment: .leading, spacing: 2) {
                    Text(book.title).font(.callout.weight(.medium)).lineLimit(2, reservesSpace: true)
                    Text(book.author).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    Text(line).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                .frame(width: 132, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .contextMenu { BookContextMenu(books: [book], collection: nil) }
    }
}

// MARK: - Goals

/// Daily minutes ring with streak, books this month and books this year.
struct GoalsCard: View {
    @Environment(LibraryModel.self) private var model

    var body: some View {
        let goals = model.settings.goals
        let today = model.stats.todaySeconds
        let goalSeconds = goals.dailyMinutes * 60
        let streak = model.stats.streak(goalMinutes: goals.dailyMinutes)
        let now = Date()
        let year = Calendar.current.component(.year, from: now)
        let month = Calendar.current.component(.month, from: now)
        let finishedThisYear = model.store.booksFinished(inYear: year)
        let finishedThisMonth = model.store.booksFinished(inMonth: month, year: year)
        HomeCard(title: "Reading Goals", action: { model.editingGoals = true }, actionLabel: "Edit Goals…") {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .center, spacing: 20) {
                    GoalRing(progress: goalSeconds > 0 ? Double(today) / Double(goalSeconds) : 0, done: today >= goalSeconds)
                        .frame(width: 84, height: 84)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(today >= goalSeconds ? "Goal reached" : "Today’s Reading")
                            .font(.headline)
                        Text(today >= goalSeconds
                             ? "\(Format.duration(seconds: today)) read today · Goal \(goals.dailyMinutes) min"
                             : "\(Format.duration(seconds: today)) of \(goals.dailyMinutes) min")
                            .foregroundStyle(.secondary)
                        Label(streak == 0 ? "No streak yet — read \(goals.dailyMinutes) min today to start one" : "\(streak)-day streak", systemImage: "flame.fill")
                            .foregroundStyle(streak == 0 ? .secondary : Color.orange)
                            .font(.callout)
                    }
                    Spacer(minLength: 0)
                }
                HStack(alignment: .top, spacing: 24) {
                    BooksGoal(title: "Books This Month", finished: finishedThisMonth, goal: goals.monthlyBooks, period: now.formatted(.dateTime.month(.wide)))
                    BooksGoal(title: "Books This Year", finished: finishedThisYear, goal: goals.yearlyBooks, period: String(year))
                }
            }
        }
    }
}

/// Books finished against a goal, with a bar.
struct BooksGoal: View {
    let title: String
    let finished: Int
    let goal: Int
    let period: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            Text(finished >= goal ? "\(Format.plural(finished, "book")) finished in \(period) · goal reached" : "\(finished) of \(goal) finished in \(period)")
                .foregroundStyle(.secondary)
                .font(.callout)
                .lineLimit(2)
            ProgressView(value: Double(min(finished, goal)), total: Double(max(goal, 1)))
                .tint(finished >= goal ? .green : .accentColor)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct GoalRing: View {
    let progress: Double
    let done: Bool

    var body: some View {
        ZStack {
            Circle().stroke(Color.accentColor.opacity(0.18), lineWidth: 10)
            Circle()
                .trim(from: 0, to: min(1, max(0, progress)))
                .stroke(done ? Color.green : Color.accentColor, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.6), value: progress)
            if done {
                Image(systemName: "checkmark").font(.title2.weight(.bold)).foregroundStyle(.green)
            } else {
                Text("\(whole(min(1, max(0, progress)) * 100))%").font(.callout.weight(.semibold)).monospacedDigit()
            }
        }
    }
}

/// Pages and chapters read in the goal's period — week, month, three months or year, chosen here or in the
/// goals — against the goal, with the pace so far.
struct ProgressGoalsCard: View {
    @Environment(LibraryModel.self) private var model

    var body: some View {
        let goals = model.settings.goals
        let period = goals.period
        let now = Date()
        let totals = model.stats.totals(in: period, containing: now)
        let (start, _) = period.interval(containing: now)
        let daysSoFar = max(1, (Calendar.current.dateComponents([.day], from: start, to: now).day ?? 0) + 1)
        HomeCard(title: "Pages & Chapters", action: { model.editingGoals = true }, actionLabel: "Edit Goals…") {
            VStack(alignment: .leading, spacing: 16) {
                Picker("Period", selection: Binding(get: { model.settings.goals.period }, set: { model.settings.goals.period = $0 })) {
                    ForEach(GoalPeriod.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .frame(maxWidth: 360)
                CountGoal(title: "Pages \(period.thisLabel.lowercased())", count: totals.pages, goal: goals.pages, unit: "page", perDay: Double(totals.pages) / Double(daysSoFar))
                CountGoal(title: "Chapters \(period.thisLabel.lowercased())", count: totals.chapters, goal: goals.chapters, unit: "chapter", perDay: Double(totals.chapters) / Double(daysSoFar))
                Text("\(Format.duration(seconds: totals.seconds)) read \(period.thisLabel.lowercased()) · \(Format.plural(daysSoFar, "day")) in")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// A count against a goal, or on its own when the goal is off.
struct CountGoal: View {
    let title: String
    let count: Int
    let goal: Int
    let unit: String
    let perDay: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.headline)
                Spacer()
                Text(goal > 0 ? "\(count) of \(goal)" : Format.plural(count, unit))
                    .font(.callout.weight(.medium))
                    .monospacedDigit()
                    .foregroundStyle(goal > 0 && count >= goal ? Color.green : Color.primary)
            }
            if goal > 0 {
                ProgressView(value: Double(min(count, goal)), total: Double(max(goal, 1)))
                    .tint(count >= goal ? .green : .accentColor)
            }
            Text(perDay >= 10 ? "\(Int(perDay.rounded())) \(unit)s a day so far" : String(format: "%.1f %@s a day so far", perDay, unit))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Calendar and activity

/// A month of days, each marked when you read on it — the more, the darker — with the months before within reach.
struct CalendarCard: View {
    @Environment(LibraryModel.self) private var model
    @State private var monthOffset = 0

    var body: some View {
        let calendar = Calendar.current
        let shown = calendar.date(byAdding: .month, value: monthOffset, to: Date()) ?? Date()
        let days = model.stats.month(containing: shown, calendar: calendar)
        let readDays = days.filter { $0.seconds > 0 || $0.pages > 0 }.count
        let peak = max(1, days.map(\.seconds).max() ?? 1)
        let firstWeekday = days.first.flatMap { ReadingStats.date(fromKey: $0.day, calendar: calendar) }.map { calendar.component(.weekday, from: $0) } ?? 1
        let leading = (firstWeekday - calendar.firstWeekday + 7) % 7
        let symbols = Array(calendar.veryShortStandaloneWeekdaySymbols[calendar.firstWeekday - 1...] + calendar.veryShortStandaloneWeekdaySymbols[..<(calendar.firstWeekday - 1)])
        let todayKey = ReadingStats.dayKey(Date(), calendar: calendar)
        HomeCard(title: "Reading Calendar", subtitle: "\(Format.plural(readDays, "day")) with reading in \(shown.formatted(.dateTime.month(.wide).year()))") {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Button { monthOffset -= 1 } label: { Image(systemName: "chevron.left") }
                        .buttonStyle(.borderless)
                        .help("The month before")
                    Text(shown.formatted(.dateTime.month(.wide).year())).font(.headline).frame(minWidth: 150)
                    Button { monthOffset += 1 } label: { Image(systemName: "chevron.right") }
                        .buttonStyle(.borderless)
                        .disabled(monthOffset >= 0)
                        .help("The month after")
                    Spacer()
                    if monthOffset != 0 { Button("Today") { monthOffset = 0 }.buttonStyle(.link).controlSize(.small) }
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(minimum: 24, maximum: 44), spacing: 4), count: 7), spacing: 4) {
                    ForEach(symbols, id: \.self) { symbol in
                        Text(symbol).font(.caption2.weight(.semibold)).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                    }
                    ForEach(0..<leading, id: \.self) { _ in Color.clear.frame(height: 30) }
                    ForEach(days, id: \.day) { day in
                        let read = day.seconds > 0 || day.pages > 0
                        let level = min(1, 0.35 + 0.65 * Double(day.seconds) / Double(peak))
                        Text(String(day.day.suffix(2).drop { $0 == "0" }))
                            .font(.caption.monospacedDigit())
                            .frame(maxWidth: .infinity, minHeight: 30)
                            .background(read ? Color.accentColor.opacity(level) : Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                            .overlay {
                                if day.day == todayKey { RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Color.accentColor, lineWidth: 1.5) }
                            }
                            .foregroundStyle(read && level > 0.6 ? Color.white : Color.primary)
                            .help(read ? "\(Display.dayName(day.day)): \(Format.duration(seconds: day.seconds))\(day.pages > 0 ? ", \(Format.plural(day.pages, "page"))" : "")" : "\(Display.dayName(day.day)): no reading")
                    }
                }
            }
        }
    }
}

/// Half a year of days as a heat map, week by week, darker the more was read.
struct ActivityCard: View {
    @Environment(LibraryModel.self) private var model

    var body: some View {
        let calendar = Calendar.current
        let weeks = model.stats.weeks(26, calendar: calendar)
        let peak = max(1, weeks.flatMap { $0 }.map(\.seconds).max() ?? 1)
        let all = weeks.flatMap { $0 }
        let active = all.filter { $0.seconds > 0 || $0.pages > 0 }.count
        let total = all.reduce(0) { $0 + $1.seconds }
        let todayKey = ReadingStats.dayKey(Date(), calendar: calendar)
        HomeCard(title: "Activity", subtitle: "\(Format.plural(active, "day")) with reading in the last 26 weeks · \(Format.duration(seconds: total))") {
            VStack(alignment: .leading, spacing: 8) {
                ScrollView(.horizontal) {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(alignment: .bottom, spacing: 3) {
                            ForEach(Array(weeks.enumerated()), id: \.offset) { index, week in
                                let first = week.first.flatMap { ReadingStats.date(fromKey: $0.day, calendar: calendar) }
                                let previous = index > 0 ? weeks[index - 1].first.flatMap { ReadingStats.date(fromKey: $0.day, calendar: calendar) } : nil
                                let newMonth = first.map { f in previous.map { calendar.component(.month, from: $0) != calendar.component(.month, from: f) } ?? true } ?? false
                                Text(newMonth ? (first?.formatted(.dateTime.month(.abbreviated)) ?? "") : "")
                                    .font(.system(size: 9))
                                    .foregroundStyle(.secondary)
                                    .frame(width: 13, alignment: .leading)
                                    .fixedSize(horizontal: true, vertical: false)
                            }
                        }
                        .frame(height: 12)
                        HStack(alignment: .top, spacing: 3) {
                            ForEach(Array(weeks.enumerated()), id: \.offset) { _, week in
                                VStack(spacing: 3) {
                                    ForEach(week, id: \.day) { day in
                                        let future = day.day > todayKey
                                        let read = day.seconds > 0 || day.pages > 0
                                        let level = read ? min(1, 0.3 + 0.7 * Double(day.seconds) / Double(peak)) : 0
                                        RoundedRectangle(cornerRadius: 2.5)
                                            .fill(future ? Color.clear : (read ? Color.accentColor.opacity(level) : Color.primary.opacity(0.07)))
                                            .frame(width: 13, height: 13)
                                            .help(future ? "" : (read ? "\(Display.dayName(day.day)): \(Format.duration(seconds: day.seconds))" : "\(Display.dayName(day.day)): no reading"))
                                    }
                                }
                            }
                        }
                    }
                    .padding(.vertical, 2)
                }
                .scrollIndicators(.hidden)
                HStack(spacing: 4) {
                    Text("Less").font(.caption2).foregroundStyle(.secondary)
                    ForEach([0.0, 0.3, 0.5, 0.75, 1.0], id: \.self) { level in
                        RoundedRectangle(cornerRadius: 2.5)
                            .fill(level == 0 ? Color.primary.opacity(0.07) : Color.accentColor.opacity(level))
                            .frame(width: 11, height: 11)
                    }
                    Text("More").font(.caption2).foregroundStyle(.secondary)
                    Spacer()
                    if let best = model.stats.bestDay, best.seconds > 0 {
                        Text("Best day: \(Display.dayName(best.day)), \(Format.duration(seconds: best.seconds))").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}

// MARK: - Statistics

struct StatisticsCard: View {
    @Environment(LibraryModel.self) private var model

    var body: some View {
        let recent = model.stats.recent(14)
        let peak = max(1, recent.map(\.seconds).max() ?? 1)
        let goals = model.settings.goals
        let activeDays = model.stats.activeDays
        let total = model.stats.totalSeconds
        HomeCard(title: "Statistics") {
            VStack(alignment: .leading, spacing: 18) {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 110, maximum: 180), spacing: 16, alignment: .topLeading)], alignment: .leading, spacing: 14) {
                    StatTile(value: "\(model.books.count)", label: model.books.count == 1 ? "book" : "books")
                    StatTile(value: "\(model.books.filter(\.isFinished).count)", label: "finished")
                    StatTile(value: Format.duration(seconds: total), label: "reading time")
                    StatTile(value: "\(model.stats.totalPages)", label: "pages turned")
                    StatTile(value: "\(model.stats.totalChapters)", label: "chapters finished")
                    StatTile(value: "\(activeDays)", label: activeDays == 1 ? "day with reading" : "days with reading")
                    StatTile(value: "\(model.stats.longestStreak(goalMinutes: goals.dailyMinutes))", label: "longest streak (days)")
                    StatTile(value: activeDays > 0 ? Format.duration(seconds: total / activeDays) : "—", label: "a reading day, on average")
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("Last 14 days").font(.caption).foregroundStyle(.secondary)
                    HStack(alignment: .bottom, spacing: 4) {
                        ForEach(recent, id: \.day) { day in
                            RoundedRectangle(cornerRadius: 2)
                                .fill(day.seconds > 0 ? Color.accentColor : Color.secondary.opacity(0.25))
                                .frame(width: 10, height: max(4, 44 * CGFloat(day.seconds) / CGFloat(peak)))
                                .help("\(Display.dayName(day.day)): \(Format.duration(seconds: day.seconds))")
                        }
                    }
                }
            }
        }
    }
}

struct StatTile: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.system(size: 24, weight: .semibold, design: .rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            Text(label).font(.caption).foregroundStyle(.secondary).lineLimit(2)
        }
    }
}

// MARK: - Customizing

/// The pieces of Home: shown or not, and dragged into order.
struct HomeCustomizeSheet: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Customize Home").font(.headline)
                Text("Switch pieces on or off, and drag them into the order you want. Strips of books run across; the rest share rows.").font(.callout).foregroundStyle(.secondary)
            }
            .padding(20)
            List {
                ForEach(model.settings.home.elements, id: \.self) { element in
                    Toggle(isOn: Binding(get: { model.settings.home.isShown(element) }, set: { model.setHomeElement(element, shown: $0) })) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(element.label)
                            Text(element.detail).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .toggleStyle(.switch)
                    .controlSize(.small)
                    .padding(.vertical, 2)
                }
                .onMove { source, destination in model.moveHomeElements(fromOffsets: source, toOffset: destination) }
            }
            .listStyle(.inset)
            HStack {
                Button("Reset to Default") { model.resetHome() }
                Spacer()
                Button("Done") { dismiss() }.keyboardShortcut(.defaultAction)
            }
            .padding(16)
        }
        .frame(width: 480, height: 560)
    }
}

extension Display {
    /// "3 days ago", "2 months ago".
    static func ago(_ date: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .full
        return f.localizedString(for: date, relativeTo: Date())
    }

    /// A day key ("2026-09-08") as "Sep 8".
    static func dayName(_ key: String) -> String {
        guard let date = ReadingStats.date(fromKey: key) else { return key }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }

    /// "40% · 2 hr left" for a book in progress.
    static func progressLine(_ book: Book) -> String {
        var parts: [String] = ["\(whole(book.progress * 100))%"]
        if let left = timeLeft(book) { parts.append(left) }
        return parts.joined(separator: " · ")
    }
}
