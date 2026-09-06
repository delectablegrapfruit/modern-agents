import SwiftUI
import BooksCore

/// Home: what you were reading, how the reading goals are going, and the library in numbers. Each card can be
/// hidden from the toolbar's Customize menu.
struct HomeView: View {
    @Environment(LibraryModel.self) private var model

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
                } else {
                    if model.settings.showContinueReading, !model.continueReading.isEmpty { ContinueReadingCard() }
                    if model.settings.showGoals { GoalsCard() }
                    if model.settings.showStatistics { StatisticsCard() }
                    if !model.settings.showContinueReading, !model.settings.showGoals, !model.settings.showStatistics {
                        ContentUnavailableView("Home Is Hidden", systemImage: "house", description: Text("Use Customize in the toolbar to show Continue Reading, Reading Goals or Statistics."))
                            .frame(maxWidth: .infinity, minHeight: 320)
                    }
                }
            }
            .padding(28)
            .frame(maxWidth: 1100, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct ContinueReadingCard: View {
    @Environment(LibraryModel.self) private var model

    var body: some View {
        HomeCard(title: "Continue Reading", action: { model.sidebarSelection = .all }, actionLabel: "See All") {
            ScrollView(.horizontal) {
                HStack(alignment: .top, spacing: 22) {
                    ForEach(model.continueReading.prefix(12)) { book in
                        ContinueItem(book: book)
                    }
                }
                .padding(.vertical, 6)
            }
            .scrollIndicators(.hidden)
        }
    }
}

struct ContinueItem: View {
    @Environment(LibraryModel.self) private var model
    let book: Book
    @State private var hovering = false

    var body: some View {
        Button { model.open(book) } label: {
            VStack(alignment: .leading, spacing: 8) {
                CoverView(book: book, width: 132)
                    .scaleEffect(hovering ? 1.03 : 1)
                    .animation(.easeOut(duration: 0.15), value: hovering)
                VStack(alignment: .leading, spacing: 2) {
                    Text(book.title).font(.callout.weight(.medium)).lineLimit(2)
                    Text(book.author).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    Text(status).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                .frame(width: 132, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .contextMenu { BookContextMenu(books: [book], collection: nil) }
    }

    private var status: String {
        var parts: [String] = ["\(whole(book.progress * 100))%"]
        if let left = Display.timeLeft(book) { parts.append(left) }
        return parts.joined(separator: " · ")
    }
}

/// Daily minutes ring with streak, and books per year.
struct GoalsCard: View {
    @Environment(LibraryModel.self) private var model

    var body: some View {
        let goals = model.settings.goals
        let today = model.stats.todaySeconds
        let goalSeconds = goals.dailyMinutes * 60
        let streak = model.stats.streak(goalMinutes: goals.dailyMinutes)
        let year = Calendar.current.component(.year, from: Date())
        let finished = model.store.booksFinished(inYear: year)
        HomeCard(title: "Reading Goals", action: { model.editingGoals = true }, actionLabel: "Edit Goals…") {
            HStack(alignment: .center, spacing: 28) {
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
                Spacer(minLength: 20)
                VStack(alignment: .leading, spacing: 8) {
                    Text("Books This Year").font(.headline)
                    Text("\(finished) of \(goals.yearlyBooks) finished").foregroundStyle(.secondary)
                    ProgressView(value: Double(min(finished, goals.yearlyBooks)), total: Double(max(goals.yearlyBooks, 1)))
                        .frame(width: 220)
                }
            }
        }
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

struct StatisticsCard: View {
    @Environment(LibraryModel.self) private var model

    var body: some View {
        let recent = model.stats.recent(14)
        let peak = max(1, recent.map(\.seconds).max() ?? 1)
        HomeCard(title: "Statistics") {
            HStack(alignment: .top, spacing: 36) {
                StatTile(value: "\(model.books.count)", label: model.books.count == 1 ? "book" : "books")
                StatTile(value: "\(model.books.filter(\.isFinished).count)", label: "finished")
                StatTile(value: Format.duration(seconds: model.stats.totalSeconds), label: "reading time")
                StatTile(value: "\(model.stats.totalPages)", label: "pages turned")
                Spacer()
                VStack(alignment: .leading, spacing: 6) {
                    Text("Last 14 days").font(.caption).foregroundStyle(.secondary)
                    HStack(alignment: .bottom, spacing: 4) {
                        ForEach(recent, id: \.day) { day in
                            RoundedRectangle(cornerRadius: 2)
                                .fill(day.seconds > 0 ? Color.accentColor : Color.secondary.opacity(0.25))
                                .frame(width: 10, height: max(4, 44 * CGFloat(day.seconds) / CGFloat(peak)))
                                .help("\(day.day): \(Format.duration(seconds: day.seconds))")
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
            Text(value).font(.system(size: 26, weight: .semibold, design: .rounded)).monospacedDigit()
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }
}
