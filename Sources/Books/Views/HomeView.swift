import SwiftUI
import BooksCore

/// Home: widgets, as on the desktop — each a rounded card of a size of its own (small, medium or wide), shown or
/// hidden and put in order from the toolbar's Customize menu and Customize Home…; strips of books run the width,
/// the rest share rows of four units. Home starts simple: Continue Reading, Reading Goals, Activity and Recently
/// Added; the other widgets are a switch away. A strip with nothing to show stays out of the way.
struct HomeView: View {
    @Environment(LibraryModel.self) private var model

    /// One widget as placed: the element, its size and the units of the row it takes.
    private struct Placed: Identifiable {
        let element: HomeElement
        let size: WidgetSize
        let units: Int
        var id: HomeElement { element }
    }

    private struct Row: Identifiable {
        let items: [Placed]
        var id: String { items.map(\.element.rawValue).joined(separator: "+") }
    }

    private static let gap: CGFloat = 20
    private static let unitMinimum: CGFloat = 230
    private static let widgetHeight: CGFloat = 236

    /// How many units fit a row at this width: four on a wide window, two on a narrow one, one when very narrow.
    private func capacity(for width: CGFloat) -> Int {
        if width >= 4 * HomeView.unitMinimum + 3 * HomeView.gap { return 4 }
        if width >= 2 * HomeView.unitMinimum + HomeView.gap { return 2 }
        return 1
    }

    /// The visible widgets dealt into rows, in order, each taking its units of the row; a wide one takes the row.
    private func rows(capacity: Int) -> [Row] {
        var rows: [Row] = []
        var current: [Placed] = []
        var used = 0
        for element in model.settings.home.visible where hasContent(element) {
            let size = model.settings.home.size(of: element)
            let units = min(capacity, size == .wide ? capacity : size.units)
            if used + units > capacity, !current.isEmpty {
                rows.append(Row(items: current))
                current = []
                used = 0
            }
            current.append(Placed(element: element, size: size, units: units))
            used += units
            if used >= capacity {
                rows.append(Row(items: current))
                current = []
                used = 0
            }
        }
        if !current.isEmpty { rows.append(Row(items: current)) }
        return rows
    }

    /// Strips with no books stay away; every other widget shows.
    private func hasContent(_ element: HomeElement) -> Bool {
        switch element {
        case .continueReading: return !model.continueReading.isEmpty
        case .pickUpAgain: return !model.pickUpAgain.isEmpty
        case .forYou: return !model.forYou.isEmpty
        case .recentlyAdded: return !model.recentlyAdded.isEmpty
        case .recentlyFinished: return !model.recentlyFinished.isEmpty
        case .goals, .progress, .calendar, .activity, .statistics: return true
        }
    }

    var body: some View {
        GeometryReader { geo in
            let inset: CGFloat = 28
            let available = max(200, geo.size.width - 2 * inset)
            let capacity = capacity(for: available)
            let unit = (available - CGFloat(capacity - 1) * HomeView.gap) / CGFloat(capacity)
            ScrollView {
                VStack(alignment: .leading, spacing: HomeView.gap) {
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
                        ForEach(rows(capacity: capacity)) { row in
                            HStack(alignment: .top, spacing: HomeView.gap) {
                                ForEach(row.items) { placed in
                                    widget(placed)
                                        .frame(width: unit * CGFloat(placed.units) + HomeView.gap * CGFloat(placed.units - 1))
                                        .frame(height: placed.element.isStrip ? nil : HomeView.widgetHeight)
                                }
                                if row.items.reduce(0, { $0 + $1.units }) < capacity { Spacer(minLength: 0) }
                            }
                        }
                    }
                }
                .padding(inset)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    @ViewBuilder
    private func widget(_ placed: Placed) -> some View {
        let compact = placed.size == .small
        switch placed.element {
        case .continueReading:
            BookStripCard(title: "Continue Reading", symbol: "book", items: model.continueReading.prefix(12).map { StripItem(book: $0, line: Display.progressLine($0)) }, action: { model.sidebarSelection = .all }, actionLabel: "See All")
        case .pickUpAgain:
            BookStripCard(title: "Pick Up Again", subtitle: "Started, but not opened for a while", symbol: "clock.arrow.circlepath", items: model.pickUpAgain.prefix(12).map { StripItem(book: $0, line: "Last read \(Display.ago($0.lastOpenedAt ?? $0.addedAt)) · \(whole($0.progress * 100))%") })
        case .goals:
            GoalsCard(compact: compact)
        case .progress:
            ProgressGoalsCard(compact: compact)
        case .calendar:
            CalendarCard()
        case .activity:
            ActivityCard(weeks: placed.units >= 4 ? 26 : 13)
        case .statistics:
            StatisticsCard(size: placed.size)
        case .forYou:
            BookStripCard(title: "For You", subtitle: "Unopened books in the genres and by the authors you read", symbol: "sparkles", items: model.forYou.prefix(12).map { StripItem(book: $0.book, line: $0.reason) })
        case .recentlyAdded:
            BookStripCard(title: "Recently Added", subtitle: "Not yet opened", symbol: "plus.circle", items: model.recentlyAdded.prefix(12).map { StripItem(book: $0, line: "Added \(Display.ago($0.addedAt))") })
        case .recentlyFinished:
            BookStripCard(title: "Recently Finished", symbol: "checkmark.seal", items: model.recentlyFinished.prefix(12).map { StripItem(book: $0, line: "Finished \(Display.added($0.finishedAt ?? Date()))") }, action: { model.sidebarSelection = .finished }, actionLabel: "See All")
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
    var symbol: String?
    let items: [StripItem]
    var action: (() -> Void)?
    var actionLabel: String?

    var body: some View {
        HomeCard(title: title, subtitle: subtitle, symbol: symbol, action: action, actionLabel: actionLabel) {
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
                CoverView(book: book, width: 108, height: 162)
                    .scaleEffect(hovering ? 1.03 : 1)
                    .animation(.easeOut(duration: 0.15), value: hovering)
                VStack(alignment: .leading, spacing: 2) {
                    Text(book.title).font(.callout.weight(.medium)).lineLimit(2, reservesSpace: true)
                    Text(book.author).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    Text(line).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                .frame(width: 108, alignment: .leading)
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
    var compact = false

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
        HomeCard(title: "Reading Goals", symbol: "target", action: compact ? nil : { model.editingGoals = true }, actionLabel: compact ? nil : "Edit Goals…") {
            if compact {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 14) {
                        GoalRing(progress: goalSeconds > 0 ? Double(today) / Double(goalSeconds) : 0, done: today >= goalSeconds)
                            .frame(width: 64, height: 64)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(today >= goalSeconds ? "Goal reached" : "\(Format.duration(seconds: today)) of \(goals.dailyMinutes) min").font(.callout.weight(.medium)).lineLimit(2)
                            Label(streak == 0 ? "No streak" : "\(streak)-day streak", systemImage: "flame.fill")
                                .foregroundStyle(streak == 0 ? .secondary : Color.orange)
                                .font(.caption)
                        }
                    }
                    Text("\(finishedThisMonth) of \(goals.monthlyBooks) this month · \(finishedThisYear) of \(goals.yearlyBooks) this year")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .center, spacing: 18) {
                        GoalRing(progress: goalSeconds > 0 ? Double(today) / Double(goalSeconds) : 0, done: today >= goalSeconds)
                            .frame(width: 76, height: 76)
                        VStack(alignment: .leading, spacing: 5) {
                            Text(today >= goalSeconds ? "Goal reached" : "Today’s Reading")
                                .font(.subheadline.weight(.semibold))
                            Text(today >= goalSeconds
                                 ? "\(Format.duration(seconds: today)) read today · Goal \(goals.dailyMinutes) min"
                                 : "\(Format.duration(seconds: today)) of \(goals.dailyMinutes) min")
                                .font(.callout)
                                .foregroundStyle(.secondary)
                            Label(streak == 0 ? "No streak yet — read \(goals.dailyMinutes) min today to start one" : "\(streak)-day streak", systemImage: "flame.fill")
                                .foregroundStyle(streak == 0 ? .secondary : Color.orange)
                                .font(.caption)
                                .lineLimit(2)
                        }
                        Spacer(minLength: 0)
                    }
                    HStack(alignment: .top, spacing: 20) {
                        BooksGoal(title: "Books This Month", finished: finishedThisMonth, goal: goals.monthlyBooks, period: now.formatted(.dateTime.month(.wide)))
                        BooksGoal(title: "Books This Year", finished: finishedThisYear, goal: goals.yearlyBooks, period: String(year))
                    }
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
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline.weight(.semibold))
            Text(finished >= goal ? "\(Format.plural(finished, "book")) finished in \(period) · goal reached" : "\(finished) of \(goal) finished in \(period)")
                .foregroundStyle(.secondary)
                .font(.caption)
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
    var compact = false

    var body: some View {
        let goals = model.settings.goals
        let period = goals.period
        let now = Date()
        let totals = model.stats.totals(in: period, containing: now)
        let (start, _) = period.interval(containing: now)
        let daysSoFar = max(1, (Calendar.current.dateComponents([.day], from: start, to: now).day ?? 0) + 1)
        HomeCard(title: compact ? "Pages" : "Pages & Chapters", subtitle: period.thisLabel, symbol: "doc.text", action: compact ? nil : { model.editingGoals = true }, actionLabel: compact ? nil : "Edit Goals…") {
            VStack(alignment: .leading, spacing: compact ? 10 : 12) {
                if !compact {
                    Picker("Period", selection: Binding(get: { model.settings.goals.period }, set: { model.settings.goals.period = $0 })) {
                        ForEach(GoalPeriod.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .controlSize(.small)
                    .frame(maxWidth: 320)
                }
                CountGoal(title: "Pages", count: totals.pages, goal: goals.pages, unit: "page", perDay: Double(totals.pages) / Double(daysSoFar))
                if !compact {
                    CountGoal(title: "Chapters", count: totals.chapters, goal: goals.chapters, unit: "chapter", perDay: Double(totals.chapters) / Double(daysSoFar))
                }
                Text("\(Format.duration(seconds: totals.seconds)) read · \(Format.plural(daysSoFar, "day")) in")
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
                Text(title).font(.subheadline.weight(.semibold))
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
        let allSymbols: [String] = calendar.veryShortStandaloneWeekdaySymbols
        let firstIndex = max(0, min(allSymbols.count - 1, calendar.firstWeekday - 1))
        let symbols: [String] = Array(allSymbols[firstIndex...]) + Array(allSymbols[..<firstIndex])
        let todayKey = ReadingStats.dayKey(Date(), calendar: calendar)
        HomeCard(title: "Reading Calendar", subtitle: "\(Format.plural(readDays, "day")) with reading in \(shown.formatted(.dateTime.month(.wide).year()))", symbol: "calendar") {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Button { monthOffset -= 1 } label: { Image(systemName: "chevron.left") }
                        .buttonStyle(.borderless)
                        .help("The month before")
                    Text(shown.formatted(.dateTime.month(.wide).year())).font(.subheadline.weight(.semibold)).frame(minWidth: 130)
                    Button { monthOffset += 1 } label: { Image(systemName: "chevron.right") }
                        .buttonStyle(.borderless)
                        .disabled(monthOffset >= 0)
                        .help("The month after")
                    Spacer()
                    if monthOffset != 0 { Button("Today") { monthOffset = 0 }.buttonStyle(.link).controlSize(.small) }
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(minimum: 18, maximum: 44), spacing: 3), count: 7), spacing: 3) {
                    ForEach(symbols, id: \.self) { symbol in
                        Text(symbol).font(.caption2.weight(.semibold)).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                    }
                    ForEach(0..<leading, id: \.self) { _ in Color.clear.frame(height: 22) }
                    ForEach(days, id: \.day) { day in
                        let read = day.seconds > 0 || day.pages > 0
                        let level = min(1, 0.35 + 0.65 * Double(day.seconds) / Double(peak))
                        Text(String(day.day.suffix(2).drop { $0 == "0" }))
                            .font(.caption2.monospacedDigit())
                            .frame(maxWidth: .infinity, minHeight: 22)
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
    var weeks: Int = 26

    var body: some View {
        let calendar = Calendar.current
        let weeks = model.stats.weeks(self.weeks, calendar: calendar)
        let peak = max(1, weeks.flatMap { $0 }.map(\.seconds).max() ?? 1)
        let all = weeks.flatMap { $0 }
        let active = all.filter { $0.seconds > 0 || $0.pages > 0 }.count
        let total = all.reduce(0) { $0 + $1.seconds }
        let todayKey = ReadingStats.dayKey(Date(), calendar: calendar)
        HomeCard(title: "Activity", subtitle: "\(Format.plural(active, "day")) with reading in \(self.weeks) weeks · \(Format.duration(seconds: total))", symbol: "chart.bar.fill") {
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
    var size: WidgetSize = .medium

    var body: some View {
        let recent = model.stats.recent(14)
        let peak = max(1, recent.map(\.seconds).max() ?? 1)
        let goals = model.settings.goals
        let activeDays = model.stats.activeDays
        let total = model.stats.totalSeconds
        HomeCard(title: "Statistics", symbol: "chart.pie") {
            VStack(alignment: .leading, spacing: 14) {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 88, maximum: 160), spacing: 12, alignment: .topLeading)], alignment: .leading, spacing: 10) {
                    StatTile(value: "\(model.books.count)", label: model.books.count == 1 ? "book" : "books")
                    StatTile(value: "\(model.books.filter(\.isFinished).count)", label: "finished")
                    StatTile(value: Format.duration(seconds: total), label: "reading time")
                    StatTile(value: "\(model.stats.totalPages)", label: "pages turned")
                    if size != .small {
                        StatTile(value: "\(model.stats.totalChapters)", label: "chapters finished")
                        StatTile(value: "\(activeDays)", label: activeDays == 1 ? "day with reading" : "days with reading")
                        StatTile(value: "\(model.stats.longestStreak(goalMinutes: goals.dailyMinutes))", label: "longest streak (days)")
                        StatTile(value: activeDays > 0 ? Format.duration(seconds: total / activeDays) : "—", label: "a reading day, on average")
                    }
                }
                if size != .small {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Last 14 days").font(.caption2).foregroundStyle(.secondary)
                        HStack(alignment: .bottom, spacing: 4) {
                            ForEach(recent, id: \.day) { day in
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(day.seconds > 0 ? Color.accentColor : Color.secondary.opacity(0.25))
                                    .frame(width: 10, height: max(4, 32 * CGFloat(day.seconds) / CGFloat(peak)))
                                    .help("\(Display.dayName(day.day)): \(Format.duration(seconds: day.seconds))")
                            }
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
            Text(value).font(.system(size: 20, weight: .semibold, design: .rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            Text(label).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
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
                Text("Switch widgets on or off, choose their size, and drag them into the order you want. Wide widgets take a row; small and medium ones share one.").font(.callout).foregroundStyle(.secondary)
            }
            .padding(20)
            List {
                ForEach(model.settings.home.elements, id: \.self) { element in
                    HStack(spacing: 12) {
                        Toggle(isOn: Binding(get: { model.settings.home.isShown(element) }, set: { model.setHomeElement(element, shown: $0) })) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(element.label)
                                Text(element.detail).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .toggleStyle(.switch)
                        .controlSize(.small)
                        Spacer(minLength: 0)
                        if element.sizes.count > 1 {
                            Picker("Size", selection: Binding(get: { model.settings.home.size(of: element) }, set: { model.setHomeSize($0, for: element) })) {
                                ForEach(element.sizes, id: \.self) { Text($0.label).tag($0) }
                            }
                            .pickerStyle(.segmented)
                            .labelsHidden()
                            .controlSize(.small)
                            .frame(width: element.sizes.count == 3 ? 190 : 130)
                            .disabled(!model.settings.home.isShown(element))
                            .help("How much of a row the widget takes")
                        }
                    }
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
        .frame(width: 560, height: 600)
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
