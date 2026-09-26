import AppKit
import SwiftUI
import UniformTypeIdentifiers
import BooksCore

/// What the reader can do, offered to the menu bar while a book is open.
struct ReaderActions {
    var nextPage: () -> Void
    var previousPage: () -> Void
    var nextChapter: () -> Void
    var previousChapter: () -> Void
    var toggleBookmark: () -> Void
    var showContents: () -> Void
    var showSearch: () -> Void
    var showAppearance: () -> Void
    var biggerText: () -> Void
    var smallerText: () -> Void
    var backToLibrary: () -> Void
    /// Whether the page shown is bookmarked, so the Book menu offers Remove Bookmark rather than Add.
    var isBookmarked = false
    /// Puts the text back at the book's own size; nil where the book has no such size (a PDF's pages).
    var actualSize: (() -> Void)? = nil
}

struct ReaderActionsKey: FocusedValueKey {
    typealias Value = ReaderActions
}

extension FocusedValues {
    var readerActions: ReaderActions? {
        get { self[ReaderActionsKey.self] }
        set { self[ReaderActionsKey.self] = newValue }
    }
}

/// The menu bar: File, Edit, View and Book menus as Books arranges them. The library's items are off while a book
/// is open, since they would change a shelf nobody can see; the reader's are on only then. The shelves themselves
/// stay on, and choosing one closes the book.
struct BooksCommands: Commands {
    let model: LibraryModel
    @FocusedValue(\.readerActions) private var reader

    /// The library fills the window, not a book.
    private var inLibrary: Bool { model.reading == nil }
    /// A shelf of books is showing (not Home), so its view, sort and grouping can change.
    private var onShelf: Bool { inLibrary && model.currentShelf != .home }
    /// The shelf showing is a grid, whose covers can be sized.
    private var onGrid: Bool { onShelf && model.shelfView(for: model.currentShelf) == .grid }

    /// Home, the library's shelves and the collections, in the sidebar's order and without the rows it hides.
    private var shelves: [SidebarItem] {
        [SidebarItem.home] + model.visibleSidebarEntries(in: .library) + model.visibleSidebarEntries(in: .collections)
    }

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("Add to Library…") { model.chooseFiles() }
                .keyboardShortcut("o")
            Button("New Collection…") { model.creatingCollection = true }
                .keyboardShortcut("n", modifiers: [.command, .shift])
                .disabled(!inLibrary)
            Divider()
            // A rare action, and the folder is watched anyway: no shortcut.
            Button("Scan Library Folder") { model.scanLibraryFolder(manual: true) }
                .disabled(model.settings.library.folder == nil)
            Divider()
            Button("Get Info") { model.infoBook = model.selectedBooks.first }
                .keyboardShortcut("i")
                .disabled(!inLibrary || model.selectedBookIDs.count != 1)
            Button("Export Highlights and Notes…") { exportAnnotations() }
                .keyboardShortcut("e", modifiers: [.command, .shift])
        }
        CommandGroup(after: .pasteboard) {
            Button("Delete from Library…") { deleteSelection() }
                .keyboardShortcut(.delete)
                .disabled(!onShelf || model.selectedBookIDs.isEmpty)
        }
        CommandGroup(after: .sidebar) {
            Group {
                Divider()
                // ⌘1 to ⌘9 follow the sidebar as it is arranged, so the menu and the sidebar always agree.
                ForEach(Array(shelves.prefix(9).enumerated()), id: \.element) { index, item in
                    Button(model.name(of: item)) { show(item) }
                        .keyboardShortcut(KeyEquivalent(Character(String(index + 1))))
                }
                Button("Previous Shelf") { stepShelf(-1) }
                    .keyboardShortcut(.upArrow, modifiers: [.command, .option])
                    .disabled(!inLibrary || model.currentShelf == shelves.first)
                Button("Next Shelf") { stepShelf(1) }
                    .keyboardShortcut(.downArrow, modifiers: [.command, .option])
                    .disabled(!inLibrary || model.currentShelf == shelves.last)
            }
            Group {
                Divider()
                Toggle("as Grid", isOn: viewMode(.grid))
                    .keyboardShortcut("1", modifiers: [.command, .control])
                    .disabled(!onShelf)
                Toggle("as List", isOn: viewMode(.list))
                    .keyboardShortcut("2", modifiers: [.command, .control])
                    .disabled(!onShelf)
                Menu("Sort By") {
                    Picker("Sort By", selection: Binding(get: { model.shelfSort(for: model.currentShelf) }, set: { model.setShelfSort($0, for: model.currentShelf) })) {
                        ForEach(LibrarySort.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.inline)
                    Divider()
                    Picker("Order", selection: Binding(get: { model.shelfSortAscending(for: model.currentShelf) }, set: { model.setShelfSortAscending($0, for: model.currentShelf) })) {
                        Text("Ascending").tag(true)
                        Text("Descending").tag(false)
                    }
                    .pickerStyle(.inline)
                }
                .disabled(!onShelf)
                Menu("Group By") {
                    // A collection's own shelf can't be grouped by collection; the toolbar leaves it out there too.
                    Picker("Group By", selection: Binding(get: { model.shelfGrouping(for: model.currentShelf) }, set: { model.setShelfGrouping($0, for: model.currentShelf) })) {
                        ForEach(ShelfGrouping.allCases.filter { $0 != .collection || model.currentShelf.isLibraryShelf }, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.inline)
                }
                .disabled(!onShelf)
            }
            Group {
                Divider()
                // One pair of sizes with the keys of Photos and Safari: the text while reading, the covers otherwise.
                Button(biggerTitle) {
                    if let actions = reader { actions.biggerText() } else { model.zoomGrid(1) }
                }
                .keyboardShortcut("+")
                .disabled(reader == nil && (!onGrid || model.settings.gridScale >= Settings.gridScaleRange.upperBound))
                Button(smallerTitle) {
                    if let actions = reader { actions.smallerText() } else { model.zoomGrid(-1) }
                }
                .keyboardShortcut("-")
                .disabled(reader == nil && (!onGrid || model.settings.gridScale <= Settings.gridScaleRange.lowerBound))
                Button("Actual Size") {
                    if let actions = reader { actions.actualSize?() } else { model.settings.gridScale = 1 }
                }
                .keyboardShortcut("0")
                .disabled(reader != nil ? reader?.actualSize == nil : (!onGrid || model.settings.gridScale == 1))
                Picker("Covers", selection: Binding(get: { model.settings.coverAppearance }, set: { model.settings.coverAppearance = $0 })) {
                    ForEach(CoverAppearance.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                .pickerStyle(.menu)
                .disabled(!inLibrary)
                Divider()
                Button("Edit Widgets…") {
                    model.sidebarSelection = .home
                    withAnimation(Design.Motion.spring) { model.editingHome = true }
                }
                .disabled(!inLibrary)
            }
        }
        CommandMenu("Book") {
            Group {
                Button("Next Page") { reader?.nextPage() }
                    .keyboardShortcut(.rightArrow, modifiers: [])
                    .disabled(reader == nil)
                Button("Previous Page") { reader?.previousPage() }
                    .keyboardShortcut(.leftArrow, modifiers: [])
                    .disabled(reader == nil)
                Button("Next Chapter") { reader?.nextChapter() }
                    .keyboardShortcut("]")
                    .disabled(reader == nil)
                Button("Previous Chapter") { reader?.previousChapter() }
                    .keyboardShortcut("[")
                    .disabled(reader == nil)
            }
            Group {
                Divider()
                Button(bookmarkTitle) { reader?.toggleBookmark() }
                    .keyboardShortcut("d")
                    .disabled(reader == nil)
                Button("Table of Contents") { reader?.showContents() }
                    .keyboardShortcut("t", modifiers: [.command, .option])
                    .disabled(reader == nil)
                Button("Search Book…") { reader?.showSearch() }
                    .keyboardShortcut("f")
                    .disabled(reader == nil)
                Button("Appearance…") { reader?.showAppearance() }
                    .keyboardShortcut("a", modifiers: [.command, .shift])
                    .disabled(reader == nil)
                Divider()
                Button("Back to Library") { reader?.backToLibrary() }
                    .keyboardShortcut("l", modifiers: [.command, .shift])
                    .disabled(reader == nil)
            }
        }
        CommandGroup(replacing: .help) {
            Button("Books Help") { showHelp() }
        }
    }

    private var biggerTitle: String { reader != nil ? "Bigger Text" : "Bigger Covers" }
    private var smallerTitle: String { reader != nil ? "Smaller Text" : "Smaller Covers" }
    private var bookmarkTitle: String { reader?.isBookmarked == true ? "Remove Bookmark" : "Add Bookmark" }

    /// A shelf chosen from the menu: a book open in the window is closed first, its place kept.
    private func show(_ item: SidebarItem) {
        if let actions = reader {
            actions.backToLibrary()
        } else if model.reading != nil {
            model.closeReader()
        }
        model.sidebarSelection = item
    }

    /// The shelf above or below the current one in the sidebar, as a scroll over the sidebar moves.
    private func stepShelf(_ step: Int) {
        let rows = shelves
        guard let index = rows.firstIndex(of: model.currentShelf) else {
            model.sidebarSelection = rows.first
            return
        }
        guard rows.indices.contains(index + step) else { return }
        model.sidebarSelection = rows[index + step]
    }

    /// A check mark in the View menu for one way of showing the shelf; choosing it shows the shelf that way.
    private func viewMode(_ mode: LibraryViewMode) -> Binding<Bool> {
        Binding(get: { model.shelfView(for: model.currentShelf) == mode }, set: { on in
            if on { model.setShelfView(mode, for: model.currentShelf) }
        })
    }

    /// ⌘⌫ asks to delete the selected books, except while text is being typed, where it deletes to the start of
    /// the line as it always does: a menu's shortcut reaches the menu before the field.
    private func deleteSelection() {
        if let text = NSApp.keyWindow?.firstResponder as? NSTextView {
            text.deleteToBeginningOfLine(nil)
        } else {
            NotificationCenter.default.post(name: .booksDeleteSelection, object: nil)
        }
    }

    /// Every highlight and note in the library, as one Markdown file.
    private func exportAnnotations() {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "Books Highlights.md"
        panel.allowedContentTypes = [.plainText]
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try model.store.annotationsMarkdown().write(to: url, atomically: true, encoding: .utf8)
        } catch {
            model.error = "The highlights and notes couldn’t be saved: \(error.localizedDescription)"
        }
    }

    /// A few lines on getting started, in an alert of its own rather than one styled as an error.
    private func showHelp() {
        let alert = NSAlert()
        alert.alertStyle = .informational
        alert.messageText = "Books Help"
        alert.informativeText = "Add books with File ▸ Add to Library… (⌘O) or by dropping files on the window. Double-click a book to read it; turn pages with the arrow keys, the scroll wheel or a swipe. Everything stays on this Mac."
        _ = alert.runModal()
    }
}
