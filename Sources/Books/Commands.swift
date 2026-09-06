import SwiftUI
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

/// The menu bar: File, View and Book menus as Books arranges them; the reader items are enabled while reading.
struct BooksCommands: Commands {
    let model: LibraryModel
    @FocusedValue(\.readerActions) private var reader

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("Add to Library…") { model.chooseFiles() }
                .keyboardShortcut("o")
            Button("New Collection") { model.creatingCollection = true }
                .keyboardShortcut("n", modifiers: [.command, .shift])
        }
        CommandGroup(after: .sidebar) {
            Divider()
            Button("Home") { show(.home) }.keyboardShortcut("1")
            Button("All Books") { show(.all) }.keyboardShortcut("2")
            Button("Finished") { show(.finished) }.keyboardShortcut("3")
            Button("Books") { show(.books) }.keyboardShortcut("4")
            Button("PDFs") { show(.pdfs) }.keyboardShortcut("5")
            Divider()
            Button("as Grid") { model.settings.libraryView = .grid }
            Button("as List") { model.settings.libraryView = .list }
            Menu("Sort By") {
                ForEach(LibrarySort.allCases, id: \.self) { sort in
                    Button(sort.label) { model.settings.sort = sort }
                }
            }
        }
        CommandMenu("Book") {
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
            Divider()
            Button("Add Bookmark") { reader?.toggleBookmark() }
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
            Button("Bigger Text") { reader?.biggerText() }
                .keyboardShortcut("+")
                .disabled(reader == nil)
            Button("Smaller Text") { reader?.smallerText() }
                .keyboardShortcut("-")
                .disabled(reader == nil)
            Divider()
            Button("Library") { reader?.backToLibrary() }
                .keyboardShortcut("l", modifiers: [.command, .shift])
                .disabled(reader == nil)
        }
        CommandGroup(replacing: .help) {
            Button("Books Help") { model.error = "Add books with ⌘O or by dropping files on the window. Double-click a book to read it; turn pages with the arrow keys, the scroll wheel or a swipe. Everything stays on this Mac." }
        }
    }

    private func show(_ item: SidebarItem) {
        model.reading = nil
        model.sidebarSelection = item
    }
}
