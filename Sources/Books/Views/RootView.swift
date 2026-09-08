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
        // Files dropped anywhere on the window are added to the library.
        .dropDestination(for: URL.self) { urls, _ in
            model.importFiles(urls)
            return true
        }
        .background(WindowAccessor { FullScreenChrome.install(on: $0) })
    }
}

/// Sidebar plus shelf, with the toolbar Books has: cover size, view switch, sort, search, add.
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
            .navigationTitle(title(for: item))
            .toolbar { toolbarItems(for: item) }
        }
        .searchable(text: $model.searchText, placement: .toolbar, prompt: "Search")
        .sheet(item: $model.infoBook) { book in InfoSheet(book: book) }
        .sheet(isPresented: $model.editingGoals) { GoalsSheet() }
        .sheet(isPresented: $model.customizingHome) { HomeCustomizeSheet() }
        .sheet(isPresented: $model.creatingCollection) {
            NameSheet(title: "New Collection", prompt: "Name", initial: "", action: "Create") { model.addCollection(named: $0) }
        }
        .sheet(item: $model.renamingCollection) { collection in
            NameSheet(title: "Rename Collection", prompt: "Name", initial: collection.name, action: "Rename") { model.renameCollection(collection.id, to: $0) }
        }
        .overlay(alignment: .bottom) {
            if let progress = model.importProgress { ImportBanner(progress: progress) }
        }
    }

    private func title(for item: SidebarItem) -> String {
        if case .collection(let id) = item { return model.collection(id)?.name ?? "Collection" }
        return item.title
    }

    @ToolbarContentBuilder
    private func toolbarItems(for item: SidebarItem) -> some ToolbarContent {
        @Bindable var model = model
        if item != .home, model.shelfView(for: item) == .grid {
            // The cover-size slider in a capsule of its own, wide enough for its thumb to travel.
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
                .frame(width: 190)
                .padding(.horizontal, 8)
                .help("Size of the covers (⌥⌘+ and ⌥⌘-)")
            }
        }
        ToolbarItemGroup(placement: .primaryAction) {
            if item == .home {
                Menu {
                    ForEach(model.settings.home.elements, id: \.self) { element in
                        Toggle(element.label, isOn: Binding(get: { model.settings.home.isShown(element) }, set: { model.setHomeElement(element, shown: $0) }))
                    }
                    Divider()
                    Button("Customize Home…") { model.customizingHome = true }
                } label: {
                    Label("Customize Home", systemImage: "slider.horizontal.3")
                }
                .help("Choose what Home shows, and in what order")
            } else {
                Picker("View", selection: Binding(get: { model.shelfView(for: item) }, set: { model.setShelfView($0, for: item) })) {
                    Label("Grid", systemImage: "square.grid.2x2").tag(LibraryViewMode.grid)
                    Label("List", systemImage: "list.bullet").tag(LibraryViewMode.list)
                }
                .pickerStyle(.segmented)
                .help("Show this shelf as a grid or a list")
                Menu {
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
                } label: {
                    Label("Sort", systemImage: "arrow.up.arrow.down")
                }
                .help("Sort and group this shelf")
            }
            Button { model.chooseFiles() } label: { Label("Add Books", systemImage: "plus") }
                .help("Add books to your library (⌘O)")
        }
    }
}

/// Progress while files are being added, at the bottom of the shelf.
struct ImportBanner: View {
    let progress: (done: Int, total: Int)

    var body: some View {
        HStack(spacing: 10) {
            ProgressView().controlSize(.small)
            Text(progress.total == 1 ? "Adding book…" : "Adding \(progress.done) of \(progress.total)…")
                .font(.callout)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .glassCapsule()
        .padding(.bottom, 16)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

/// A one-field sheet: naming and renaming collections.
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
        VStack(alignment: .leading, spacing: 14) {
            Text(title).font(.headline)
            TextField(prompt, text: $name)
                .textFieldStyle(.roundedBorder)
                .onSubmit(save)
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button(action, action: save)
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 360)
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        onSave(trimmed)
        dismiss()
    }
}
