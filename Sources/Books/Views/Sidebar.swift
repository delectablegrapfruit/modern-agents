import SwiftUI
import UniformTypeIdentifiers
import BooksCore

/// Home, the library's shelves and your collections, each section in the order you drag its rows into. Any row but
/// All can be hidden from its context menu and brought back from the menu under the arrow that appears beside the
/// section's name when the pointer is over it. Books can be dropped on Finished and on collections. The "New
/// Collection" button sits at the bottom, as in Books.
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
            SectionHeader(title: title, hideable: hideable)
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

/// A section's name with, while the pointer is over the header, a small arrow beside it opening the menu of the
/// section's rows: each can be shown or hidden.
private struct SectionHeader: View {
    @Environment(LibraryModel.self) private var model
    let title: String
    let hideable: [SidebarItem]
    @State private var hovering = false

    var body: some View {
        HStack(spacing: 2) {
            Text(title)
            if !hideable.isEmpty {
                Menu {
                    ForEach(hideable, id: \.self) { item in
                        Toggle(model.name(of: item), isOn: Binding(get: { !model.isHidden(item) }, set: { model.setHidden(item, !$0) }))
                    }
                } label: {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 9, weight: .bold))
                        .frame(width: 16, height: 16)
                        .contentShape(Rectangle())
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .fixedSize()
                .opacity(hovering ? 1 : 0)
                .accessibilityLabel("Show or hide rows of \(title)")
                .help("Choose which rows of this section are shown")
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
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
