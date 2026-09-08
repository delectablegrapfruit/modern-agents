import AppKit
import Combine
import SwiftUI
import BooksCore

/// A shelf: the books of one sidebar item as a grid of covers or a list, each shelf keeping its own view, sort and
/// grouping (by collection for the Library's shelves, by genre for any). Every card in the grid is the same size,
/// scaled together from the toolbar slider or ⌥⌘+ and ⌥⌘-. Double-click reads; ⌘- and ⇧-click select several;
/// the context menu carries the actions; books drag to the sidebar.
struct ShelfView: View {
    @Environment(LibraryModel.self) private var model
    let item: SidebarItem
    @State private var confirmDelete: [Book] = []

    private var books: [Book] { model.books(for: item) }
    private var collectionID: UUID? { if case .collection(let id) = item { return id } else { return nil } }
    /// The shelf by collection, or nil when it is shown as one.
    private var groups: [ShelfGroup]? { model.groupedShelf(item, books: books) }
    /// The books in the order they are shown, for ⇧-click and the arrow keys.
    private var shown: [Book] { groups?.flatMap(\.books) ?? books }
    private var coverWidth: CGFloat { 150 * CGFloat(model.settings.gridScale) }

    var body: some View {
        @Bindable var model = model
        Group {
            if books.isEmpty {
                emptyState
            } else if model.shelfView(for: item) == .grid {
                grid
            } else {
                list
            }
        }
        .confirmationDialog(deleteTitle, isPresented: Binding(get: { !confirmDelete.isEmpty }, set: { if !$0 { confirmDelete = [] } }), titleVisibility: .visible) {
            Button("Delete", role: .destructive) { model.delete(confirmDelete.map(\.id)); confirmDelete = [] }
        } message: {
            Text("The book and its highlights, notes and bookmarks will be removed from this Mac.")
        }
        .onReceive(NotificationCenter.default.publisher(for: .booksDeleteSelection)) { _ in
            let selected = model.selectedBooks
            if !selected.isEmpty { confirmDelete = selected }
        }
    }

    private var deleteTitle: String {
        confirmDelete.count == 1 ? "Delete “\(confirmDelete[0].title)”?" : "Delete \(confirmDelete.count) books?"
    }

    private var emptyState: some View {
        Group {
            if !model.searchText.isEmpty {
                ContentUnavailableView.search(text: model.searchText)
            } else {
                switch item {
                case .finished:
                    ContentUnavailableView("No Finished Books", systemImage: "checkmark.circle", description: Text("Books you read to the end, or mark as finished, appear here."))
                case .pdfs:
                    ContentUnavailableView("No PDFs", systemImage: "doc.text", description: Text("PDF files you add to your library appear here."))
                case .collection:
                    ContentUnavailableView("Empty Collection", systemImage: "folder", description: Text("Drag books here from your library, or use Add to Collection in a book’s menu."))
                default:
                    ContentUnavailableView {
                        Label("No Books", systemImage: "books.vertical")
                    } description: {
                        Text("Add EPUB, Kindle, PDF and text files, or drop them on the window.")
                    } actions: {
                        Button("Add Books…") { model.chooseFiles() }.buttonStyle(.borderedProminent)
                    }
                }
            }
        }
    }

    // MARK: - Grid

    private var columns: [GridItem] {
        let card = coverWidth + 16
        return [GridItem(.adaptive(minimum: card, maximum: card * 1.3), spacing: 24, alignment: .top)]
    }

    private var grid: some View {
        ScrollView {
            if let groups {
                LazyVStack(alignment: .leading, spacing: 0, pinnedViews: .sectionHeaders) {
                    ForEach(groups) { group in
                        Section {
                            cards(group.books)
                                .padding(.horizontal, 28)
                                .padding(.top, 12)
                                .padding(.bottom, 28)
                        } header: {
                            groupHeader(group, inset: 36)
                        }
                    }
                }
            } else {
                cards(books).padding(28)
            }
        }
        .background(Color.clear.contentShape(Rectangle()).onTapGesture { model.selectedBookIDs = [] })
        .focusable()
        .focusEffectDisabled()
        .onKeyPress(.return) { openSelection(); return .handled }
        .onKeyPress(.delete) { requestDeleteSelection(); return .handled }
        .onKeyPress(.deleteForward) { requestDeleteSelection(); return .handled }
        .onDeleteCommand { requestDeleteSelection() }
    }

    private func cards(_ list: [Book]) -> some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 30) {
            ForEach(list) { book in
                BookCard(book: book, collectionID: collectionID, selected: model.selectedBookIDs.contains(book.id), coverWidth: coverWidth)
                    .onTapGesture(count: 2) { model.open(book) }
                    .simultaneousGesture(TapGesture().onEnded { select(book) })
                    .contextMenu {
                        BookContextMenu(books: contextBooks(for: book), collection: collectionID, requestDelete: { confirmDelete = $0 })
                    }
                    .draggable(BookDrag.payload(book.id))
            }
        }
    }

    private func groupHeader(_ group: ShelfGroup, inset: CGFloat) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(group.name).font(.title3.weight(.semibold))
            Text(Format.plural(group.books.count, "book")).font(.callout).foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.horizontal, inset)
        .padding(.vertical, 8)
        .background(.bar)
    }

    private func select(_ book: Book) {
        let flags = NSEvent.modifierFlags
        let order = shown
        if flags.contains(.command) {
            if model.selectedBookIDs.contains(book.id) { model.selectedBookIDs.remove(book.id) } else { model.selectedBookIDs.insert(book.id) }
        } else if flags.contains(.shift), let anchor = model.selectedBookIDs.first.flatMap({ id in order.firstIndex { $0.id == id } }), let end = order.firstIndex(where: { $0.id == book.id }) {
            for b in order[min(anchor, end)...max(anchor, end)] { model.selectedBookIDs.insert(b.id) }
        } else {
            model.selectedBookIDs = [book.id]
        }
    }

    /// The arrow keys in the list: the selection moves one row, or starts at an end.
    private func moveSelection(_ delta: Int) {
        let order = shown
        guard !order.isEmpty else { return }
        let current = model.selectedBookIDs.first.flatMap { id in order.firstIndex { $0.id == id } }
        let next = current.map { max(0, min(order.count - 1, $0 + delta)) } ?? (delta > 0 ? 0 : order.count - 1)
        model.selectedBookIDs = [order[next].id]
    }

    private func contextBooks(for book: Book) -> [Book] {
        model.selectedBookIDs.contains(book.id) ? model.selectedBooks : [book]
    }

    private func openSelection() {
        if let first = model.selectedBooks.first { model.open(first) }
    }

    private func requestDeleteSelection() {
        let selected = model.selectedBooks
        if !selected.isEmpty { confirmDelete = selected }
    }

    // MARK: - List

    /// The list: a header of column names that sort — the shelf's sort, so the toolbar and the list agree; a
    /// second click turns it round — over rows drawn by this view itself, with the same selection, menus and drags
    /// as the grid. No table view stands underneath: the system one had crashed while moving between collections.
    private var list: some View {
        GeometryReader { geo in
            let widths = ListColumns(width: geo.size.width)
            VStack(spacing: 0) {
                ListHeader(item: item, widths: widths)
                Divider()
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0, pinnedViews: .sectionHeaders) {
                        if let groups {
                            ForEach(groups) { group in
                                Section {
                                    rows(group.books, widths: widths)
                                } header: {
                                    groupHeader(group, inset: ListColumns.inset)
                                }
                            }
                        } else {
                            rows(books, widths: widths)
                        }
                    }
                    .padding(.bottom, 20)
                }
                .background(Color.clear.contentShape(Rectangle()).onTapGesture { model.selectedBookIDs = [] })
            }
        }
        .focusable()
        .focusEffectDisabled()
        .onKeyPress(.return) { openSelection(); return .handled }
        .onKeyPress(.upArrow) { moveSelection(-1); return .handled }
        .onKeyPress(.downArrow) { moveSelection(1); return .handled }
        .onKeyPress(.delete) { requestDeleteSelection(); return .handled }
        .onKeyPress(.deleteForward) { requestDeleteSelection(); return .handled }
        .onDeleteCommand { requestDeleteSelection() }
    }

    private func rows(_ list: [Book], widths: ListColumns) -> some View {
        ForEach(Array(list.enumerated()), id: \.element.id) { index, book in
            BookRow(book: book, widths: widths, selected: model.selectedBookIDs.contains(book.id), striped: index % 2 == 1)
                .onTapGesture(count: 2) { model.open(book) }
                .simultaneousGesture(TapGesture().onEnded { select(book) })
                .contextMenu {
                    BookContextMenu(books: contextBooks(for: book), collection: collectionID, requestDelete: { confirmDelete = $0 })
                }
                .draggable(BookDrag.payload(book.id))
        }
    }
}

/// The list's columns: title with the cover, author, kind, progress, time read, added. The fixed ones are as
/// given; title and author share what is left, three to two.
struct ListColumns {
    let title: CGFloat
    let author: CGFloat
    static let kind: CGFloat = 64
    static let progress: CGFloat = 84
    static let time: CGFloat = 92
    static let added: CGFloat = 112
    static let gap: CGFloat = 12
    static let inset: CGFloat = 16

    init(width: CGFloat) {
        let fixed = ListColumns.kind + ListColumns.progress + ListColumns.time + ListColumns.added + ListColumns.gap * 5 + ListColumns.inset * 2
        let free = max(300, width - fixed)
        title = free * 0.6
        author = free * 0.4
    }
}

struct ListHeader: View {
    @Environment(LibraryModel.self) private var model
    let item: SidebarItem
    let widths: ListColumns

    var body: some View {
        HStack(spacing: ListColumns.gap) {
            column("Title", sort: .title, width: widths.title)
            column("Author", sort: .author, width: widths.author)
            column("Kind", sort: nil, width: ListColumns.kind)
            column("Progress", sort: .percentRead, width: ListColumns.progress)
            column("Time Read", sort: .timeRead, width: ListColumns.time)
            column("Added", sort: .recent, width: ListColumns.added)
        }
        .padding(.horizontal, ListColumns.inset)
        .frame(height: 26)
        .background(.bar)
    }

    private func column(_ title: String, sort: LibrarySort?, width: CGFloat) -> some View {
        Button {
            guard let sort else { return }
            if model.shelfSort(for: item) == sort { model.setShelfSortAscending(!model.shelfSortAscending(for: item), for: item) } else { model.setShelfSort(sort, for: item) }
        } label: {
            HStack(spacing: 4) {
                Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                if let sort, model.shelfSort(for: item) == sort {
                    Image(systemName: model.shelfSortAscending(for: item) ? "chevron.up" : "chevron.down")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(width: width, alignment: .leading)
        .disabled(sort == nil)
        .help(sort == nil ? "" : "Sort by \(title.lowercased()); click again to turn the order round")
    }
}

/// One book in the list.
struct BookRow: View {
    let book: Book
    let widths: ListColumns
    let selected: Bool
    let striped: Bool

    var body: some View {
        let secondary: Color = selected ? .white.opacity(0.85) : .secondary
        HStack(spacing: ListColumns.gap) {
            HStack(spacing: 10) {
                CoverView(book: book, width: 20, height: 30)
                Text(book.title).lineLimit(1)
                if book.isNew { NewBadge() }
                Spacer(minLength: 0)
            }
            .frame(width: widths.title, alignment: .leading)
            Text(book.author).lineLimit(1).foregroundStyle(secondary).frame(width: widths.author, alignment: .leading)
            Text(book.kind.label).foregroundStyle(secondary).frame(width: ListColumns.kind, alignment: .leading)
            Text(progress).foregroundStyle(secondary).frame(width: ListColumns.progress, alignment: .leading)
            Text(time).foregroundStyle(secondary).frame(width: ListColumns.time, alignment: .leading)
            Text(Display.added(book.addedAt)).foregroundStyle(secondary).lineLimit(1).frame(width: ListColumns.added, alignment: .leading)
        }
        .foregroundStyle(selected ? Color.white : Color.primary)
        .padding(.horizontal, ListColumns.inset)
        .frame(height: 38)
        .background(selected ? Color.accentColor : (striped ? Color.primary.opacity(0.04) : Color.clear))
        .contentShape(Rectangle())
    }

    private var progress: String {
        book.isFinished ? "Finished" : (book.hasStarted ? "\(whole(book.progress * 100))%" : "—")
    }

    private var time: String {
        let seconds = book.secondsRead ?? 0
        return seconds > 0 ? Format.duration(seconds: seconds) : "—"
    }
}

/// One book in the grid: a cover box of 2:3 and three lines of text under it, all cards the same size so the
/// grid stays in rank whatever the pictures' shapes and the titles' lengths.
struct BookCard: View {
    let book: Book
    let collectionID: UUID?
    let selected: Bool
    var coverWidth: CGFloat = 150

    var body: some View {
        let f = min(1.15, max(0.85, coverWidth / 150))
        VStack(alignment: .leading, spacing: 8) {
            CoverView(book: book, width: coverWidth, height: coverWidth * 1.5, badges: true)
            VStack(alignment: .leading, spacing: 2) {
                Text(book.title).font(.system(size: 13 * f, weight: .medium)).lineLimit(2, reservesSpace: true)
                Text(book.author).font(.system(size: 11 * f)).foregroundStyle(.secondary).lineLimit(1, reservesSpace: true)
                Text(statusLine ?? " ").font(.system(size: 11 * f)).foregroundStyle(.tertiary).lineLimit(1, reservesSpace: true)
            }
            .frame(width: coverWidth, alignment: .leading)
        }
        .padding(8)
        .background(selected ? Color.accentColor.opacity(0.16) : .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .contentShape(Rectangle())
    }

    private var statusLine: String? {
        if book.isFinished { return "Finished" }
        if book.hasStarted { return [String(whole(book.progress * 100)) + "%", Display.timeLeft(book)].compactMap { $0 }.joined(separator: " · ") }
        if book.kind == .pdf, let pages = book.pageCount { return Format.plural(pages, "page") }
        return nil
    }
}

/// Read · Get Info · Mark as Finished · Add to Collection · Remove from Collection · Reset Position · Delete.
struct BookContextMenu: View {
    @Environment(LibraryModel.self) private var model
    let books: [Book]
    let collection: UUID?
    var requestDelete: (([Book]) -> Void)?

    var body: some View {
        let ids = books.map(\.id)
        if books.count == 1 {
            Button("Read") { model.open(books[0]) }
            Button("Get Info…") { model.infoBook = books[0] }
            Divider()
        }
        if books.allSatisfy(\.isFinished) {
            Button("Mark as Unfinished") { model.setFinished(ids, false) }
        } else {
            Button("Mark as Finished") { model.setFinished(ids, true) }
        }
        Menu("Add to Collection") {
            ForEach(model.collections) { c in
                Button(c.name) { model.add(ids, to: c.id) }
            }
            if !model.collections.isEmpty { Divider() }
            Button("New Collection…") { model.creatingCollection = true }
        }
        if let collection {
            Button("Remove from Collection") { model.remove(ids, from: collection) }
        }
        Button("Reset Reading Position") { model.resetPosition(ids) }
            .disabled(!books.contains { $0.position != nil || $0.isFinished })
        Divider()
        Button(books.count == 1 ? "Delete…" : "Delete \(books.count) Books…", role: .destructive) {
            if let requestDelete { requestDelete(books) } else { model.delete(ids) }
        }
    }
}

extension Notification.Name {
    static let booksDeleteSelection = Notification.Name("org.modernagents.Books.deleteSelection")
}
