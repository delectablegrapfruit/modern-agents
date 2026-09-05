import SwiftUI
import UniformTypeIdentifiers
import BooksCore

/// Home, the library's shelves and your collections, each section in the order you drag its rows into. Any row but
/// All can be hidden from its context menu and brought back from its section's menu. Books can be dropped on
/// Finished and on collections. The "New Collection" button sits at the bottom, as in Books.
struct Sidebar: View {
    @Environment(LibraryModel.self) private var model

    var body: some View {
        @Bindable var model = model
        List(selection: $model.sidebarSelection) {
            Label("Home", systemImage: "house").tag(SidebarItem.home)
            section("Library", group: .library)
            section("My Collections", group: .collections)
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

    private func section(_ title: String, group: LibraryModel.SidebarGroup) -> some View {
        let hideable = model.sidebarEntries(in: group).filter { $0 != .all }
        return Section {
            ForEach(model.visibleSidebarEntries(in: group), id: \.self) { item in
                row(item)
            }
            .onMove { source, destination in model.moveSidebarEntries(in: group, from: source, to: destination) }
        } header: {
            HStack {
                Text(title)
                Spacer()
                if !hideable.isEmpty {
                    Menu {
                        ForEach(hideable, id: \.self) { item in
                            Toggle(model.name(of: item), isOn: Binding(get: { !model.isHidden(item) }, set: { model.setHidden(item, !$0) }))
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .menuStyle(.borderlessButton)
                    .menuIndicator(.hidden)
                    .fixedSize()
                    .help("Choose which rows of this section are shown")
                }
            }
        }
    }

    private func row(_ item: SidebarItem) -> some View {
        Label(model.name(of: item), systemImage: item.symbol)
            .tag(item)
            .contextMenu {
                if case .collection(let id) = item, let collection = model.collection(id) {
                    Button("Rename…") { model.renamingCollection = collection }
                    Divider()
                }
                if item != .all {
                    Button("Hide “\(model.name(of: item))”") { model.setHidden(item, true) }
                }
                if case .collection(let id) = item {
                    Divider()
                    Button("Delete Collection", role: .destructive) { model.deleteCollection(id) }
                }
            }
            .dropDestination(for: String.self) { items, _ in
                let ids = BookDrag.ids(items)
                guard !ids.isEmpty else { return false }
                switch item {
                case .finished:
                    model.setFinished(ids, true)
                    return true
                case .collection(let id):
                    model.add(ids, to: id)
                    return true
                default:
                    return false
                }
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
