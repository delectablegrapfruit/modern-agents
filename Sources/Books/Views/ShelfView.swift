import AppKit
import Combine
import SwiftUI
import BooksCore

/// A shelf: the books of one sidebar item as a grid of covers or a table. Every card in the grid is the same size,
/// scaled together from the toolbar slider or ⌥⌘+ and ⌥⌘-; All Books is shown collection by collection unless
/// grouping is off. Double-click reads; ⌘- and ⇧-click select several; the context menu carries the actions;
/// books drag to the sidebar.
struct ShelfView: View {
    @Environment(LibraryModel.self) private var model
    let item: SidebarItem
    @State private var confirmDelete: [Book] = []
    /// The table's own column sort; empty, the table follows the toolbar's sort.
    @State private var sortOrder: [KeyPathComparator<Book>] = []

    private var books: [Book] { model.books(for: item) }
    private var collectionID: UUID? { if case .collection(let id) = item { return id } else { return nil } }
    private var grouped: Bool { item == .all && model.settings.groupAllByCollection }
    private var groups: [ShelfGroup] { grouped ? model.shelfGroups(for: books) : [ShelfGroup(id: "all", name: "", books: books)] }
    /// The books in the order they are shown, for ⇧-click.
    private var shown: [Book] { grouped ? groups.flatMap(\.books) : books }
    private var coverWidth: CGFloat { 150 * CGFloat(model.settings.gridScale) }

    var body: some View {
        @Bindable var model = model
        Group {
            if books.isEmpty {
                emptyState
            } else if model.settings.libraryView == .grid {
                grid
            } else {
                table
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
            if grouped {
                LazyVStack(alignment: .leading, spacing: 0, pinnedViews: .sectionHeaders) {
                    ForEach(groups) { group in
                        Section {
                            cards(group.books)
                                .padding(.horizontal, 28)
                                .padding(.top, 12)
                                .padding(.bottom, 28)
                        } header: {
                            groupHeader(group)
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

    private func groupHeader(_ group: ShelfGroup) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(group.name).font(.title3.weight(.semibold))
            Text(Format.plural(group.books.count, "book")).font(.callout).foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.horizontal, 36)
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

    // MARK: - Table

    /// The list. Its rows follow the toolbar's sort until a column header is clicked; All Books grouped shows a
    /// section per collection. The table is made anew for each shelf: the same table given another shelf's rows
    /// had crashed while moving between collections.
    private var table: some View {
        @Bindable var model = model
        return Table(of: Book.self, selection: $model.selectedBookIDs, sortOrder: $sortOrder) {
            TableColumn("Title", value: \.title) { book in
                HStack(spacing: 10) {
                    CoverView(book: book, width: 22, height: 33)
                    Text(book.title)
                    if book.isNew { NewBadge() }
                }
            }
            .width(min: 220)
            TableColumn("Author", value: \.author)
            TableColumn("Kind", value: \.kind.rawValue) { Text($0.kind.label) }.width(60)
            TableColumn("Progress", value: \.progress) { book in
                Text(book.isFinished ? "Finished" : (book.hasStarted ? "\(whole(book.progress * 100))%" : "—")).foregroundStyle(.secondary)
            }
            .width(80)
            TableColumn("Time Read", value: \.secondsReadValue) { book in
                Text(book.secondsReadValue > 0 ? Format.duration(seconds: book.secondsReadValue) : "—").foregroundStyle(.secondary)
            }
            .width(90)
            TableColumn("Added", value: \.addedAt) { Text(Display.added($0.addedAt)).foregroundStyle(.secondary) }.width(110)
        } rows: {
            if grouped {
                ForEach(groups) { group in
                    Section(group.name) {
                        ForEach(group.books.sorted(using: sortOrder))
                    }
                }
            } else {
                ForEach(books.sorted(using: sortOrder))
            }
        }
        .id(item)
        .contextMenu(forSelectionType: UUID.self) { ids in
            let selected = ids.compactMap { model.book($0) }
            if !selected.isEmpty {
                BookContextMenu(books: selected, collection: collectionID, requestDelete: { confirmDelete = $0 })
            }
        } primaryAction: { ids in
            if let id = ids.first, let book = model.book(id) { model.open(book) }
        }
        .onDeleteCommand { requestDeleteSelection() }
    }
}

extension Book {
    /// Seconds read, for a sortable table column.
    var secondsReadValue: Int { secondsRead ?? 0 }
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
