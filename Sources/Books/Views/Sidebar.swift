import SwiftUI
import UniformTypeIdentifiers
import BooksCore

/// Home, the library's shelves, and the collections you made. Books can be dragged onto Finished and onto
/// collections. The "New Collection" button sits at the bottom, as in Books.
struct Sidebar: View {
    @Environment(LibraryModel.self) private var model

    var body: some View {
        @Bindable var model = model
        List(selection: $model.sidebarSelection) {
            Label("Home", systemImage: "house").tag(SidebarItem.home)
            Section("Library") {
                ForEach([SidebarItem.all, .finished, .books, .pdfs], id: \.self) { item in
                    Label(item.title, systemImage: item.symbol)
                        .tag(item)
                        .dropDestination(for: String.self) { items, _ in
                            let ids = BookDrag.ids(items)
                            guard !ids.isEmpty else { return false }
                            if item == .finished { model.setFinished(ids, true) }
                            return item == .finished
                        }
                }
            }
            Section("My Collections") {
                ForEach(model.collections) { collection in
                    Label(collection.name, systemImage: "folder")
                        .tag(SidebarItem.collection(collection.id))
                        .contextMenu {
                            Button("Rename…") { model.renamingCollection = collection }
                            Divider()
                            Button("Delete Collection", role: .destructive) { model.deleteCollection(collection.id) }
                        }
                        .dropDestination(for: String.self) { items, _ in
                            let ids = BookDrag.ids(items)
                            guard !ids.isEmpty else { return false }
                            model.add(ids, to: collection.id)
                            return true
                        }
                }
            }
        }
        .listStyle(.sidebar)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            HStack {
                Button { model.creatingCollection = true } label: {
                    Label("New Collection", systemImage: "plus")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Create a collection (⇧⌘N)")
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
    }
}

/// Books travel through drag and drop as strings: "book:<uuid>". Plain text dropped from elsewhere is ignored.
enum BookDrag {
    static let prefix = "book:"

    static func payload(_ id: UUID) -> String { prefix + id.uuidString }

    static func ids(_ items: [String]) -> [UUID] {
        items.compactMap { $0.hasPrefix(prefix) ? UUID(uuidString: String($0.dropFirst(prefix.count))) : nil }
    }
}
