import AppKit
import Combine
import SwiftUI
import BooksCore

/// A shelf: the books of one sidebar item as a grid of covers or a list, each shelf keeping its own view, sort and
/// grouping (by collection for the Library's shelves, by genre for any). Every card in the grid is the same size,
/// scaled together from the toolbar slider or ⌘+ and ⌘-, and the columns are spread evenly across the width — or,
/// where even the widest gaps leave room over, grown a little and set in the middle — with the first cover in line
/// with the group titles and the floating title, as the Finder lays out its icons. Double-click reads; ⌘- and
/// ⇧-click select several; the arrow keys move the selection; the context menu carries the actions; books drag to
/// the sidebar, several at once when several are selected. Selections turn grey when the window is not key.
struct ShelfView: View {
    @Environment(LibraryModel.self) private var model
    let item: SidebarItem
    @State private var confirmDelete: [Book] = []
    /// Where each group lies against the visible shelf, for the floating title.
    @State private var groupFrames: [String: CGRect] = [:]
    /// The height of the list's visible part, under its header.
    @State private var viewportHeight: CGFloat = 0
    /// The system's scroller style once it has changed while the shelf is shown (a mouse plugged in, or the setting
    /// changed in System Settings), so the grid is laid out again for it.
    @State private var scrollerStyle: NSScroller.Style?

    private var books: [Book] { model.books(for: item) }
    private var collectionID: UUID? { if case .collection(let id) = item { return id } else { return nil } }
    /// The shelf by collection, or nil when it is shown as one.
    private var groups: [ShelfGroup]? { model.groupedShelf(item, books: books) }
    /// The books in the order they are shown, for ⇧-click and the arrow keys.
    private var shown: [Book] { groups?.flatMap(\.books) ?? books }
    private var coverWidth: CGFloat { 150 * CGFloat(model.settings.gridScale) }
    /// The width a legacy scroller takes from the side of the grid's scroll view, which the columns must leave free
    /// or the last one would run under it; overlay scrollers take none.
    private var scrollerWidth: CGFloat {
        let style = scrollerStyle ?? NSScroller.preferredScrollerStyle
        return style == .legacy ? NSScroller.scrollerWidth(for: .regular, scrollerStyle: .legacy) : 0
    }

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
        .onReceive(NotificationCenter.default.publisher(for: NSScroller.preferredScrollerStyleDidChangeNotification)) { _ in
            scrollerStyle = NSScroller.preferredScrollerStyle
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
                    ContentUnavailableView {
                        Label("Empty Collection", systemImage: "folder")
                    } description: {
                        Text("Drag books here from your library, or use Add to Collection in a book’s menu.")
                    } actions: {
                        Button("Show All Books") { model.sidebarSelection = .all }
                    }
                default:
                    EmptyLibraryContent()
                }
            }
        }
    }

    // MARK: - Grid

    /// The grid measures its width itself rather than through a preference, so its columns are right on the first
    /// frame instead of starting as one and jumping. The cards, the group titles and the floating title all start
    /// from the columns' leading edge, so they stay in line however the columns are spread or centred.
    private var grid: some View {
        GeometryReader { geo in
            let groups = self.groups
            let columns = ShelfGridColumns(width: geo.size.width - scrollerWidth, coverWidth: coverWidth)
            ScrollViewReader { proxy in
                ScrollView {
                    if let groups {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(groups) { group in
                                VStack(alignment: .leading, spacing: 0) {
                                    GroupTitle(group: group, inset: columns.titleInset, style: .grid)
                                    cards(group.books, columns: columns)
                                        .padding(.leading, columns.leading)
                                        .padding(.trailing, ShelfGridColumns.inset)
                                        .padding(.top, Design.Space.xs)
                                        .padding(.bottom, Design.Space.xxxl)
                                }
                                .reportGroupFrame(group.id)
                            }
                        }
                        .padding(.top, Design.Space.s)
                    } else {
                        cards(books, columns: columns)
                            .padding(.leading, columns.leading)
                            .padding(.trailing, ShelfGridColumns.inset)
                            .padding(.vertical, Design.Space.xl)
                    }
                }
                .floatingGroupTitle(groups: groups, frames: groupFrames, viewportHeight: geo.size.height, inset: columns.titleInset, style: .grid)
                .coordinateSpace(name: "shelf")
                .onPreferenceChange(GroupFramesKey.self) { groupFrames = $0 }
                .background(Color.clear.contentShape(Rectangle()).onTapGesture { model.selectedBookIDs = [] })
                .focusable()
                .focusEffectDisabled()
                .onKeyPress(.return) { openSelection(); return .handled }
                .onKeyPress(.leftArrow) { moveSelection(-1, proxy: proxy); return .handled }
                .onKeyPress(.rightArrow) { moveSelection(1, proxy: proxy); return .handled }
                .onKeyPress(.upArrow) { moveSelection(-columns.count, proxy: proxy); return .handled }
                .onKeyPress(.downArrow) { moveSelection(columns.count, proxy: proxy); return .handled }
                .onKeyPress(.delete) { requestDeleteSelection(); return .handled }
                .onKeyPress(.deleteForward) { requestDeleteSelection(); return .handled }
                .onDeleteCommand { requestDeleteSelection() }
            }
        }
    }

    private func cards(_ list: [Book], columns: ShelfGridColumns) -> some View {
        LazyVGrid(columns: columns.items, alignment: .leading, spacing: Design.Space.xxl) {
            ForEach(list) { book in
                BookCard(book: book, selected: model.selectedBookIDs.contains(book.id), coverWidth: columns.cover)
                    .id(book.id)
                    .onTapGesture(count: 2) { model.open(book) }
                    .simultaneousGesture(TapGesture().onEnded { select(book) })
                    .contextMenu {
                        BookContextMenu(books: contextBooks(for: book), collection: collectionID, requestDelete: { confirmDelete = $0 })
                    }
                    .draggable(BookDrag.payload(dragIDs(for: book))) {
                        BookDragPreview(book: book, count: dragCount(for: book)).environment(model)
                    }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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

    /// The arrow keys: the selection moves `delta` places in the shown order — one for a row of the list or a
    /// sideways step in the grid, a row's worth for up and down in the grid — or starts at an end, and the book it
    /// lands on is scrolled into view. With several selected it moves on from the last, or back from the first.
    private func moveSelection(_ delta: Int, proxy: ScrollViewProxy) {
        let order = shown
        guard !order.isEmpty, delta != 0 else { return }
        let selected = order.indices.filter { model.selectedBookIDs.contains(order[$0].id) }
        let current = delta > 0 ? selected.last : selected.first
        let next = current.map { max(0, min(order.count - 1, $0 + delta)) } ?? (delta > 0 ? 0 : order.count - 1)
        model.selectedBookIDs = [order[next].id]
        proxy.scrollTo(order[next].id)
    }

    private func contextBooks(for book: Book) -> [Book] {
        model.selectedBookIDs.contains(book.id) ? model.selectedBooks : [book]
    }

    /// A drag carries the whole selection when it starts on a selected book, else the book alone.
    private func dragIDs(for book: Book) -> [UUID] {
        model.selectedBookIDs.contains(book.id) ? model.selectedBooks.map(\.id) : [book.id]
    }

    private func dragCount(for book: Book) -> Int {
        model.selectedBookIDs.contains(book.id) ? max(1, model.selectedBookIDs.count) : 1
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
    /// second click turns it round — over rows drawn by this view itself in the inset style of the system's tables,
    /// with the same selection, menus and drags as the grid. No table view stands underneath: the system one had
    /// crashed while moving between collections.
    private var list: some View {
        GeometryReader { geo in
            let widths = ListColumns(width: geo.size.width)
            let groups = self.groups
            VStack(spacing: 0) {
                ListHeader(item: item, widths: widths)
                Divider()
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            if let groups {
                                ForEach(groups) { group in
                                    VStack(alignment: .leading, spacing: 0) {
                                        GroupTitle(group: group, inset: ListColumns.inset, style: .list)
                                        rows(group.books, widths: widths)
                                    }
                                    .reportGroupFrame(group.id)
                                }
                            } else {
                                rows(books, widths: widths)
                            }
                        }
                        .padding(.top, Design.Space.xs)
                        .padding(.bottom, Design.Space.xxl)
                    }
                    .floatingGroupTitle(groups: groups, frames: groupFrames, viewportHeight: viewportHeight, inset: ListColumns.inset, style: .list)
                    .coordinateSpace(name: "shelf")
                    .onPreferenceChange(GroupFramesKey.self) { groupFrames = $0 }
                    .background(ViewportHeightReader(height: $viewportHeight))
                    .background(Color.clear.contentShape(Rectangle()).onTapGesture { model.selectedBookIDs = [] })
                    .background(Color(nsColor: .controlBackgroundColor))
                    .focusable()
                    .focusEffectDisabled()
                    .onKeyPress(.return) { openSelection(); return .handled }
                    .onKeyPress(.upArrow) { moveSelection(-1, proxy: proxy); return .handled }
                    .onKeyPress(.downArrow) { moveSelection(1, proxy: proxy); return .handled }
                    .onKeyPress(.delete) { requestDeleteSelection(); return .handled }
                    .onKeyPress(.deleteForward) { requestDeleteSelection(); return .handled }
                    .onDeleteCommand { requestDeleteSelection() }
                }
            }
        }
    }

    /// The rows of one run of books. Neighbouring selected rows join into one block, as they do in a table.
    private func rows(_ list: [Book], widths: ListColumns) -> some View {
        let selectedIDs = model.selectedBookIDs
        return ForEach(Array(list.enumerated()), id: \.element.id) { index, book in
            let selected = selectedIDs.contains(book.id)
            let joinsAbove = selected && index > 0 && selectedIDs.contains(list[index - 1].id)
            let joinsBelow = selected && index + 1 < list.count && selectedIDs.contains(list[index + 1].id)
            BookRow(book: book, widths: widths, selected: selected, striped: index % 2 == 1, joinsAbove: joinsAbove, joinsBelow: joinsBelow)
                .id(book.id)
                .onTapGesture(count: 2) { model.open(book) }
                .simultaneousGesture(TapGesture().onEnded { select(book) })
                .contextMenu {
                    BookContextMenu(books: contextBooks(for: book), collection: collectionID, requestDelete: { confirmDelete = $0 })
                }
                .draggable(BookDrag.payload(dragIDs(for: book))) {
                    BookDragPreview(book: book, count: dragCount(for: book)).environment(model)
                }
        }
    }
}

/// The grid's columns for a shelf so wide: as many cards as fit at the size chosen with at least `minGap` between
/// them, and the room left over shared evenly between the gaps up to `maxGap`. Where even the widest gaps leave room
/// over, the cards grow together to take it up, by no more than `maxGrowth` so the size stays the one chosen, and
/// whatever is still over is split between the two sides, so the grid sits in the middle of a wide shelf instead of
/// hugging its left edge. Every card is the same size. `leading` is where the first card starts, and the group
/// titles start with its cover at every width.
struct ShelfGridColumns {
    /// Cards in a row.
    let count: Int
    /// A card's width: the cover and a selection margin on each side.
    let card: CGFloat
    /// The space between two cards; the visible gap between covers is this and two margins.
    let gap: CGFloat
    /// The first card's distance from the shelf's leading edge: the page's inset, and half of any width the cards
    /// and the gaps between them leave over.
    let leading: CGFloat

    /// The page's inset from the shelf's edges, as on Home.
    static let inset = Design.Space.page
    static let minGap = Design.Space.xxl
    static let maxGap: CGFloat = 48
    /// The most the cards grow past the size chosen, to fill a row the widest gaps cannot: an eighth.
    static let maxGrowth: CGFloat = 1.125
    /// The selection margin on each side of a cover.
    static let margin = Design.Space.s

    /// A cover's width, as the cards are drawn.
    var cover: CGFloat { card - 2 * ShelfGridColumns.margin }
    /// Where the group titles start, in line with the first cover.
    var titleInset: CGFloat { leading + ShelfGridColumns.margin }

    init(width: CGFloat, coverWidth: CGFloat) {
        let margins = 2 * ShelfGridColumns.margin
        let inner = max(0, width - 2 * ShelfGridColumns.inset)
        let chosen = coverWidth + margins
        let fitting = ((inner + ShelfGridColumns.minGap) / (chosen + ShelfGridColumns.minGap)).rounded(.down)
        let columns = max(1, fitting.isFinite ? Int(fitting) : 1)
        let gaps = CGFloat(columns - 1)
        // The cover that fills the row at the widest gaps, held between the size chosen and the growth allowed.
        let widest = gaps * ShelfGridColumns.maxGap
        let filling = ((inner - widest) / CGFloat(columns) - margins).rounded(.down)
        let largest = (coverWidth * ShelfGridColumns.maxGrowth).rounded(.down)
        let coverSize = max(coverWidth, min(largest, filling))
        let cardWidth = coverSize + margins
        var spacing: CGFloat = 0
        if columns > 1 {
            let spread = (inner - CGFloat(columns) * cardWidth) / gaps
            spacing = min(ShelfGridColumns.maxGap, max(ShelfGridColumns.minGap, spread))
        }
        let used = CGFloat(columns) * cardWidth + gaps * spacing
        let over = max(0, ((inner - used) / 2).rounded(.down))
        count = columns
        card = cardWidth
        gap = spacing
        leading = ShelfGridColumns.inset + over
    }

    var items: [GridItem] { Array(repeating: GridItem(.fixed(card), spacing: gap, alignment: .top), count: count) }
}

/// A group's name and count, as the heading of its books and as the title floating over them. In the grid it is
/// as large as a section of a page; in the list it is sized to sit with the rows. Only the floating copy has the
/// bar's material and a hairline under it, so the headings in the page stay part of the page.
struct GroupTitle: View {
    enum Style { case grid, list }

    let group: ShelfGroup
    let inset: CGFloat
    var style: Style = .grid
    var floating = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Design.Space.s) {
            Text(group.name)
                .font(style == .grid ? Font.title3.weight(.semibold) : Font.headline)
            Text(Format.plural(group.books.count, "book"))
                .font(style == .grid ? Design.Fonts.body.monospacedDigit() : Font.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
        .lineLimit(1)
        .padding(.horizontal, inset)
        .frame(height: GroupTitle.height(style))
        .background {
            if floating { Rectangle().fill(.bar) }
        }
        .overlay(alignment: .bottom) {
            if floating { Divider() }
        }
    }

    static func height(_ style: Style) -> CGFloat { style == .grid ? 36 : 28 }
}

/// Where the groups of a shelf lie against its visible part, by group id, in the "shelf" coordinate space.
struct GroupFramesKey: PreferenceKey {
    static var defaultValue: [String: CGRect] { [:] }
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue()) { $1 }
    }
}

/// The height of the shelf's visible part.
struct ViewportHeightReader: View {
    @Binding var height: CGFloat

    var body: some View {
        GeometryReader { geo in
            Color.clear
                .onAppear { height = geo.size.height }
                .onChange(of: geo.size.height) { _, new in height = new }
        }
    }
}

extension View {
    /// Reports where a group lies in the shelf, for the floating title.
    func reportGroupFrame(_ id: String) -> some View {
        background(GeometryReader { geo in
            Color.clear.preference(key: GroupFramesKey.self, value: [id: geo.frame(in: .named("shelf"))])
        })
    }

    /// The title of the group that fills most of the shelf, floating over its top edge once the group's own
    /// heading has scrolled away — and only while that group is the greater part of what is shown, so a title
    /// fades out as the next group comes up and the next fades in when it takes over, never two meeting.
    func floatingGroupTitle(groups: [ShelfGroup]?, frames: [String: CGRect], viewportHeight: CGFloat, inset: CGFloat, style: GroupTitle.Style) -> some View {
        let floating = ShelfView.floatingGroup(groups: groups, frames: frames, viewportHeight: viewportHeight, titleHeight: GroupTitle.height(style))
        return overlay(alignment: .top) {
            if let floating {
                GroupTitle(group: floating, inset: inset, style: style, floating: true)
                    .transition(.opacity)
                    .id(floating.id)
                    .allowsHitTesting(false)
            }
        }
        .animation(Design.Motion.standard, value: floating?.id)
    }
}

extension ShelfView {
    /// The group whose title floats: the one with the most of itself on show, once its own heading has scrolled
    /// past the top and while it holds at least half of the visible shelf.
    static func floatingGroup(groups: [ShelfGroup]?, frames: [String: CGRect], viewportHeight: CGFloat, titleHeight: CGFloat) -> ShelfGroup? {
        guard let groups, viewportHeight > 0 else { return nil }
        var best: ShelfGroup?
        var bestVisible: CGFloat = 0
        for group in groups {
            guard let frame = frames[group.id] else { continue }
            let visible = min(frame.maxY, viewportHeight) - max(frame.minY, 0)
            if visible > bestVisible { best = group; bestVisible = visible }
        }
        guard let best, let frame = frames[best.id] else { return nil }
        guard frame.minY < -titleHeight * 0.5, bestVisible >= viewportHeight * 0.5 else { return nil }
        return best
    }
}

/// The list's columns: title with the cover, author, kind, progress, time read, added. The fixed ones are as
/// given; title and author share what is left, three to two. Text stands `inset` from the list's edges in the
/// header and the rows alike; a row's selection and stripe stand `rowMargin` in, rounded, as in the system's
/// inset tables.
struct ListColumns {
    let title: CGFloat
    let author: CGFloat
    static let kind: CGFloat = 64
    static let progress: CGFloat = 84
    static let time: CGFloat = 92
    static let added: CGFloat = 112
    static let gap = Design.Space.m
    static let inset = Design.Space.l
    static let rowMargin: CGFloat = 10
    static var rowPadding: CGFloat { inset - rowMargin }
    static let rowHeight: CGFloat = 40
    static let headerHeight: CGFloat = 28

    init(width: CGFloat) {
        let fixed = ListColumns.kind + ListColumns.progress + ListColumns.time + ListColumns.added + ListColumns.gap * 5 + ListColumns.inset * 2
        let free = max(300, width - fixed)
        title = free * 0.6
        author = free * 0.4
    }
}

/// The column names over the list, in the size and weight of a table's header: the sorted column stands out, with
/// its direction at its trailing edge. Numbers are right-aligned, their headings with them.
struct ListHeader: View {
    @Environment(LibraryModel.self) private var model
    let item: SidebarItem
    let widths: ListColumns

    var body: some View {
        HStack(spacing: ListColumns.gap) {
            column("Title", sort: .title, width: widths.title)
            column("Author", sort: .author, width: widths.author)
            column("Kind", sort: nil, width: ListColumns.kind)
            column("Progress", sort: .percentRead, width: ListColumns.progress, trailing: true)
            column("Time Read", sort: .timeRead, width: ListColumns.time, trailing: true)
            column("Added", sort: .recent, width: ListColumns.added)
        }
        .padding(.horizontal, ListColumns.inset)
        .frame(height: ListColumns.headerHeight)
        .background(.bar)
    }

    @ViewBuilder
    private func column(_ title: String, sort: LibrarySort?, width: CGFloat, trailing: Bool = false) -> some View {
        if let sort {
            let sorted = model.shelfSort(for: item) == sort
            Button {
                if sorted { model.setShelfSortAscending(!model.shelfSortAscending(for: item), for: item) } else { model.setShelfSort(sort, for: item) }
            } label: {
                heading(title, sorted: sorted, trailing: trailing)
            }
            .buttonStyle(.plain)
            .frame(width: width, alignment: .leading)
            .help("Sort by \(title.lowercased()); click again to turn the order round")
        } else {
            heading(title, sorted: false, trailing: trailing)
                .frame(width: width, alignment: .leading)
        }
    }

    private func heading(_ title: String, sorted: Bool, trailing: Bool) -> some View {
        HStack(spacing: Design.Space.xs) {
            if trailing { Spacer(minLength: 0) }
            Text(title)
                .font(sorted ? Design.Fonts.sectionTitle : Font.subheadline)
                .foregroundStyle(sorted ? Color.primary : Color.secondary)
                .lineLimit(1)
            if !trailing { Spacer(minLength: 0) }
            if sorted {
                Image(systemName: model.shelfSortAscending(for: item) ? "chevron.up" : "chevron.down")
                    .font(Design.Fonts.indicator)
                    .foregroundStyle(.secondary)
            }
        }
        .contentShape(Rectangle())
    }
}

/// One book in the list, in the inset style: a rounded stripe on every other row, and a rounded selection that
/// joins its selected neighbours, in the accent while the window is key and grey when it is not.
struct BookRow: View {
    @Environment(\.controlActiveState) private var active
    let book: Book
    let widths: ListColumns
    let selected: Bool
    let striped: Bool
    var joinsAbove = false
    var joinsBelow = false

    var body: some View {
        let emphasised = selected && active == .key
        let secondary: Color = emphasised ? .white.opacity(0.85) : .secondary
        HStack(spacing: ListColumns.gap) {
            HStack(spacing: Design.Space.s) {
                CoverView(book: book, width: 20, height: 30, showsProgress: false)
                Text(book.title).lineLimit(1)
                if book.isNew, !book.isFinished { NewBadge(onSelection: emphasised) }
                Spacer(minLength: 0)
            }
            .frame(width: widths.title, alignment: .leading)
            Text(book.author).lineLimit(1).foregroundStyle(secondary).frame(width: widths.author, alignment: .leading)
            Text(book.kind.label).foregroundStyle(secondary).frame(width: ListColumns.kind, alignment: .leading)
            Text(progress).font(Font.body.monospacedDigit()).foregroundStyle(secondary).lineLimit(1).frame(width: ListColumns.progress, alignment: .trailing)
            Text(time).font(Font.body.monospacedDigit()).foregroundStyle(secondary).lineLimit(1).frame(width: ListColumns.time, alignment: .trailing)
            Text(Display.added(book.addedAt)).foregroundStyle(secondary).lineLimit(1).frame(width: ListColumns.added, alignment: .leading)
        }
        .foregroundStyle(emphasised ? Color.white : Color.primary)
        .padding(.horizontal, ListColumns.rowPadding)
        .frame(height: ListColumns.rowHeight)
        .background { rowBackground }
        .padding(.horizontal, ListColumns.rowMargin)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var rowBackground: some View {
        let radius = Design.Radius.cell
        if selected {
            UnevenRoundedRectangle(
                topLeadingRadius: joinsAbove ? 0 : radius,
                bottomLeadingRadius: joinsBelow ? 0 : radius,
                bottomTrailingRadius: joinsBelow ? 0 : radius,
                topTrailingRadius: joinsAbove ? 0 : radius,
                style: .continuous
            )
            .fill(Color(nsColor: active == .key ? NSColor.selectedContentBackgroundColor : NSColor.unemphasizedSelectedContentBackgroundColor))
        } else if striped {
            Design.rounded(radius).fill(Color(nsColor: NSColor.alternatingContentBackgroundColors[1]))
        }
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
/// grid stays in rank whatever the pictures' shapes and the titles' lengths. Selected, it is drawn as the Finder
/// draws a selected icon: a grey well behind the cover and the title on the selection's colour, which turns grey
/// when the window is not key. New books carry the NEW badge under the cover, beside their status, where it is
/// always on the page's plain background.
struct BookCard: View {
    @Environment(\.controlActiveState) private var active
    let book: Book
    let selected: Bool
    var coverWidth: CGFloat = 150

    var body: some View {
        let emphasised = selected && active == .key
        // Type steps with the cover instead of scaling smoothly, so it stays at whole sizes and never below ten
        // points; the smallest step matches Home's.
        let titleScale: CGFloat = coverWidth < 120 ? 12.0 / 13 : (coverWidth < 180 ? 1 : 14.0 / 13)
        let metaScale: CGFloat = coverWidth < 120 ? 10.0 / 11 : (coverWidth < 180 ? 1 : 12.0 / 11)
        let titleFont = Design.Fonts.bookTitle(scale: titleScale)
        let metaFont = Design.Fonts.bookMeta(scale: metaScale)
        VStack(alignment: .leading, spacing: Design.Space.xxs) {
            CoverView(book: book, width: coverWidth, height: coverWidth * 1.5, badges: true)
                .padding(Design.Space.s)
                .background(selected ? Color(nsColor: .quaternaryLabelColor) : Color.clear, in: Design.rounded(Design.Radius.tile))
            VStack(alignment: .leading, spacing: Design.Space.xxs) {
                // Two lines are always kept for the title, outside its highlight, so the highlight hugs the words.
                ZStack(alignment: .topLeading) {
                    Text("X\nX").font(titleFont).hidden()
                    Text(book.title)
                        .font(titleFont)
                        .lineLimit(2)
                        .foregroundStyle(emphasised ? Color.white : Color.primary)
                        .padding(.horizontal, Design.Space.xs)
                        .padding(.vertical, 1)
                        .background(titleHighlight(emphasised: emphasised), in: Design.rounded(Design.Radius.cell))
                        .padding(.horizontal, -Design.Space.xs)
                }
                Text(book.author)
                    .font(metaFont)
                    .foregroundStyle(.secondary)
                    .lineLimit(1, reservesSpace: true)
                HStack(alignment: .firstTextBaseline, spacing: Design.Space.xs) {
                    if book.isNew, !book.isFinished { NewBadge() }
                    Text(statusLine ?? " ")
                        .font(metaFont.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .lineLimit(1, reservesSpace: true)
                }
            }
            .frame(width: coverWidth, alignment: .leading)
            .padding(.horizontal, Design.Space.s)
        }
        .padding(.bottom, Design.Space.xs)
        .contentShape(Rectangle())
    }

    private func titleHighlight(emphasised: Bool) -> Color {
        guard selected else { return .clear }
        return Color(nsColor: emphasised ? NSColor.selectedContentBackgroundColor : NSColor.unemphasizedSelectedContentBackgroundColor)
    }

    private var statusLine: String? {
        if book.isFinished { return "Finished" }
        if book.hasStarted { return Display.progressLine(book) }
        if book.kind == .pdf, let pages = book.pageCount { return Format.plural(pages, "page") }
        return nil
    }
}

/// What a drag of books shows under the pointer: the cover picked up and, when others go with it, the edges of one
/// or two more behind it and their number in a badge, as the Finder draws a drag of several files.
struct BookDragPreview: View {
    let book: Book
    let count: Int

    var body: some View {
        ZStack(alignment: .topTrailing) {
            ZStack {
                if count > 2 { stackedEdge(angle: 5, x: 6, y: 4) }
                if count > 1 { stackedEdge(angle: -4, x: -4, y: 2) }
                CoverView(book: book, width: 60, height: 90, showsProgress: false)
            }
            .padding(Design.Space.s)
            if count > 1 {
                Text("\(count)")
                    .font(Design.Fonts.value)
                    .foregroundStyle(.white)
                    .padding(.horizontal, Design.Space.xs)
                    .frame(minWidth: 20, minHeight: 20)
                    .background(Color.red, in: Capsule())
            }
        }
    }

    /// One of the books under the one picked up, shown as a plain edge.
    private func stackedEdge(angle: Double, x: CGFloat, y: CGFloat) -> some View {
        let corners = Design.rounded(Design.Radius.cover(width: 60))
        return corners
            .fill(Color(nsColor: .windowBackgroundColor))
            .overlay(corners.strokeBorder(.separator, lineWidth: Design.Stroke.hairline))
            .frame(width: 60, height: 90)
            .rotationEffect(.degrees(angle))
            .offset(x: x, y: y)
            .shadow(Design.Shadow.glyph)
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
            Button("Get Info") { model.infoBook = books[0] }
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
