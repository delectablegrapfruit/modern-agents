import SwiftUI
import BooksCore

/// The window's content: the library, or the book being read in its place.
struct RootView: View {
    @Environment(LibraryModel.self) private var model

    var body: some View {
        @Bindable var model = model
        Group {
            if let book = model.reading {
                ReaderView(book: book).id(book.id)
            } else {
                LibraryView()
            }
        }
        .alert("Books", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } }), presenting: model.error) { _ in
            Button("OK") {}
        } message: { message in
            Text(message)
        }
        // The sheets hang on the window's content rather than on the library, so one asked for while a book is open
        // shows over the reader at once instead of waiting to surprise you on the way back to the library.
        .sheet(item: $model.infoBook) { book in InfoSheet(book: book) }
        .sheet(isPresented: $model.editingGoals) { GoalsSheet() }
        .sheet(isPresented: $model.creatingCollection) {
            NameSheet(title: "New Collection", prompt: "Name", initial: "", action: "Create") { model.addCollection(named: $0) }
        }
        .sheet(item: $model.renamingCollection) { collection in
            NameSheet(title: "Rename Collection", prompt: "Name", initial: collection.name, action: "Rename") { model.renameCollection(collection.id, to: $0) }
        }
        // Files dropped anywhere on the window are added to the library.
        .dropDestination(for: URL.self) { urls, _ in
            model.importFiles(urls)
            return true
        }
        .background(WindowAccessor { FullScreenChrome.install(on: $0) })
    }
}

/// Sidebar plus shelf, with the toolbar Books has. On a shelf: the cover size, then the view and the sort in one
/// group, then Add on its own, then search, as the Finder arranges its toolbar. On Home: Edit Widgets, or Done while
/// Home is being edited.
struct LibraryView: View {
    @Environment(LibraryModel.self) private var model
    @State private var columnVisibility: NavigationSplitViewVisibility = .automatic

    var body: some View {
        @Bindable var model = model
        let item = model.sidebarSelection ?? .home
        NavigationSplitView(columnVisibility: $columnVisibility) {
            Sidebar()
                .navigationSplitViewColumnWidth(min: 200, ideal: 232, max: 320)
        } detail: {
            Group {
                switch item {
                case .home: HomeView()
                default: ShelfView(item: item)
                }
            }
            // Progress while files are added sits at the foot of the shelf, not across the sidebar too.
            .overlay(alignment: .bottom) {
                ZStack {
                    if let progress = model.importProgress { ImportBanner(progress: progress) }
                }
                .animation(Design.Motion.standard, value: model.importProgress == nil)
            }
            .navigationTitle(title(for: item))
            .toolbar { toolbarItems(for: item) }
        }
        .searchable(text: $model.searchText, placement: .toolbar, prompt: "Search Library")
        .onChange(of: model.searchText) { _, text in
            // Home has nothing to filter, so a search typed there looks through the whole library.
            if !text.isEmpty, model.sidebarSelection == .home || model.sidebarSelection == nil { model.sidebarSelection = .all }
        }
    }

    private func title(for item: SidebarItem) -> String {
        if case .collection(let id) = item { return model.collection(id)?.name ?? "Collection" }
        return item.title
    }

    @ToolbarContentBuilder
    private func toolbarItems(for item: SidebarItem) -> some ToolbarContent {
        if item == .home {
            ToolbarItem(placement: .primaryAction) {
                EditWidgetsButton(model: model)
            }
        }
        if item != .home, model.shelfView(for: item) == .grid {
            // The cover-size slider in a capsule of its own, about as wide as the zoom slider in Photos.
            ToolbarItem(placement: .primaryAction) {
                Slider(value: Binding(get: { model.settings.gridScale }, set: { model.settings.gridScale = Settings.clampedGridScale($0) }), in: Settings.gridScaleRange) {
                    Text("Cover Size")
                } minimumValueLabel: {
                    Image(systemName: "square.grid.3x3").font(.caption2)
                } maximumValueLabel: {
                    Image(systemName: "square.grid.2x2").font(.callout)
                }
                .labelsHidden()
                .controlSize(.small)
                .frame(width: 120)
                .padding(.horizontal, Design.Space.xs)
                .help("Size of the covers (⌘+ and ⌘-)")
            }
        }
        if item != .home {
            ToolbarItemGroup(placement: .primaryAction) {
                Picker("View", selection: Binding(get: { model.shelfView(for: item) }, set: { model.setShelfView($0, for: item) })) {
                    Label("Grid", systemImage: "square.grid.2x2").tag(LibraryViewMode.grid)
                    Label("List", systemImage: "list.bullet").tag(LibraryViewMode.list)
                }
                .pickerStyle(.segmented)
                .help("Show this shelf as a grid or a list")
                Menu {
                    ShelfArrangementChoices(model: model, item: item)
                } label: {
                    Label("Sort", systemImage: "arrow.up.arrow.down")
                }
                .help("Sort and group this shelf")
            }
        }
        // While Home is edited its toolbar is Done alone, as on the desktop.
        if !(item == .home && model.editingHome) {
            ToolbarItem(placement: .primaryAction) {
                Button { model.chooseFiles() } label: { Label("Add Books", systemImage: "plus") }
                    .help("Add books to your library (⌘O)")
            }
        }
    }
}

/// Home's toolbar button, the way the Mac desktop and the iPad do it: Edit Widgets starts arranging Home, and Done,
/// in the accent, ends it. The widgets themselves are shown, hidden and resized from the gallery that editing
/// opens and from each widget's own menu, so the toolbar needs nothing more.
private struct EditWidgetsButton: View {
    let model: LibraryModel

    var body: some View {
        if model.editingHome {
            Button("Done") {
                withAnimation(Design.Motion.spring) { model.editingHome = false }
            }
            .prominentToolbarButton()
            .help("Finish editing Home")
        } else {
            Button("Edit Widgets") {
                withAnimation(Design.Motion.spring) { model.editingHome = true }
            }
            .help("Add, remove, resize and arrange the widgets on Home")
        }
    }
}

/// A shelf's Sort By, Order and Group By, as menu items with check marks. A collection's own shelf is never grouped
/// by collection, so it is not offered there.
private struct ShelfArrangementChoices: View {
    let model: LibraryModel
    let item: SidebarItem

    var body: some View {
        Picker("Sort By", selection: Binding(get: { model.shelfSort(for: item) }, set: { model.setShelfSort($0, for: item) })) {
            ForEach(LibrarySort.allCases, id: \.self) { Text($0.label).tag($0) }
        }
        .pickerStyle(.inline)
        Divider()
        Picker("Order", selection: Binding(get: { model.shelfSortAscending(for: item) }, set: { model.setShelfSortAscending($0, for: item) })) {
            Text("Ascending").tag(true)
            Text("Descending").tag(false)
        }
        .pickerStyle(.inline)
        Divider()
        Picker("Group By", selection: Binding(get: { model.shelfGrouping(for: item) }, set: { model.setShelfGrouping($0, for: item) })) {
            Text("None").tag(ShelfGrouping.none)
            if item.isLibraryShelf { Text("Collection").tag(ShelfGrouping.collection) }
            Text("Genre").tag(ShelfGrouping.genre)
        }
        .pickerStyle(.inline)
    }
}

private extension View {
    /// The accent button of a toolbar: Liquid Glass's prominent style on macOS 26, bordered prominent before.
    @ViewBuilder
    func prominentToolbarButton() -> some View {
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            self.buttonStyle(.glassProminent)
        } else {
            self.buttonStyle(.borderedProminent)
        }
        #else
        self.buttonStyle(.borderedProminent)
        #endif
    }
}

/// Progress while files are added, at the foot of the shelf: which of how many, with a dial filling as they go once
/// there is more than one.
struct ImportBanner: View {
    let progress: (done: Int, total: Int)

    var body: some View {
        HStack(spacing: Design.Space.s) {
            if progress.total > 1 {
                ProgressView(value: Double(min(progress.done, progress.total)), total: Double(progress.total))
                    .progressViewStyle(.circular)
                    .controlSize(.small)
            } else {
                ProgressView().controlSize(.small)
            }
            Text(label)
                .font(Design.Fonts.body.monospacedDigit())
        }
        .padding(.horizontal, Design.Space.l)
        .padding(.vertical, Design.Space.s)
        .glassCapsule()
        .padding(.bottom, Design.Space.xl)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    /// The book being added, counted from one, so the count never reads "0 of 10".
    private var label: String {
        progress.total == 1 ? "Adding 1 book…" : "Adding \(min(progress.done + 1, progress.total)) of \(progress.total) books…"
    }
}

/// A one-field sheet: naming and renaming collections. The default button takes the system's own look, which
/// follows the window's state and Liquid Glass.
struct NameSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let prompt: String
    let action: String
    let onSave: (String) -> Void
    @State private var name: String

    init(title: String, prompt: String, initial: String, action: String, onSave: @escaping (String) -> Void) {
        self.title = title
        self.prompt = prompt
        self.action = action
        self.onSave = onSave
        _name = State(initialValue: initial)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Design.Space.l) {
            Text(title).font(Design.Fonts.cardTitle)
            TextField(prompt, text: $name)
                .textFieldStyle(.roundedBorder)
                .onSubmit(save)
            HStack(spacing: Design.Space.m) {
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button(action, action: save)
                    .keyboardShortcut(.defaultAction)
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(Design.Space.xl)
        .frame(width: 360)
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        onSave(trimmed)
        dismiss()
    }
}
