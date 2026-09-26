import AppKit
import SwiftUI
import UniformTypeIdentifiers
import BooksCore

/// Home, the library's shelves and your collections, each section in the order you drag its rows into. Any row but
/// All can be hidden from its context menu and brought back from the menu behind the button that appears at the
/// trailing edge of the section's name when the pointer is over it. Books can be dropped on Finished and on
/// collections. The New Collection button sits in a bar at the bottom, as in Books. While Settings asks for it, a
/// scroll over the sidebar steps the selection from shelf to shelf, keeping the selected row in view.
struct Sidebar: View {
    @Environment(LibraryModel.self) private var model

    var body: some View {
        @Bindable var model = model
        ScrollViewReader { proxy in
            List(selection: $model.sidebarSelection) {
                Label("Home", systemImage: SidebarItem.home.symbol)
                    .id(SidebarItem.home)
                    .tag(SidebarItem.home)
                section("Library", group: .library)
                // With no collections the section would be a heading over nothing; the New Collection button below
                // makes the first.
                if !model.collections.isEmpty {
                    section("My Collections", group: .collections)
                }
            }
            .listStyle(.sidebar)
            .background(SidebarScrollStepper(isEnabled: model.settings.sidebarScrollSwitchesShelves) { step($0, proxy: proxy) })
        }
        .newCollectionBar {
            HStack {
                Button { model.creatingCollection = true } label: {
                    Label("New Collection", systemImage: "plus")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Create a collection (⇧⌘N)")
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Design.Space.l)
            .padding(.vertical, Design.Space.s + Design.Space.xxs)
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
            .id(item)
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

    /// One step through the shelves, as a scroll over the sidebar asks: Home, then the Library's rows, then the
    /// collections, in the order the sidebar shows them, stopping at either end. False when there is no row that way.
    private func step(_ delta: Int, proxy: ScrollViewProxy) -> Bool {
        let order = [SidebarItem.home] + model.visibleSidebarEntries(in: .library) + model.visibleSidebarEntries(in: .collections)
        let current = model.sidebarSelection.flatMap { order.firstIndex(of: $0) } ?? 0
        let next = min(max(current + delta, 0), order.count - 1)
        guard next != current else { return false }
        model.sidebarSelection = order[next]
        proxy.scrollTo(order[next])
        return true
    }
}

/// A section's name with, while the pointer is over the header, a button at its trailing edge opening the menu of
/// the section's rows: each can be shown or hidden.
private struct SectionHeader: View {
    @Environment(LibraryModel.self) private var model
    let title: String
    let hideable: [SidebarItem]
    @State private var hovering = false

    var body: some View {
        HStack(spacing: Design.Space.xs) {
            Text(title)
            Spacer(minLength: 0)
            if !hideable.isEmpty {
                Menu {
                    ForEach(hideable, id: \.self) { item in
                        Toggle(model.name(of: item), isOn: Binding(get: { !model.isHidden(item) }, set: { model.setHidden(item, !$0) }))
                    }
                } label: {
                    Image(systemName: "line.3.horizontal.decrease.circle")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .frame(width: 20, height: 20)
                        .contentShape(Rectangle())
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .fixedSize()
                .opacity(hovering ? 1 : 0)
                .accessibilityLabel("Rows of \(title)")
                .help("Choose which rows of \(title) are shown")
            }
        }
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
        .animation(Design.Motion.quick, value: hovering)
    }
}

private extension View {
    /// The bar under the sidebar's rows. On macOS 26 it is a safe-area bar, which fades the rows scrolling under it
    /// the way the system's own bars do; before that, the regular material with a hairline above it, so the rows
    /// never show through the button.
    @ViewBuilder
    func newCollectionBar<Bar: View>(@ViewBuilder _ bar: () -> Bar) -> some View {
        let content = bar()
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            self.safeAreaBar(edge: .bottom) { content }
        } else {
            self.safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    Divider()
                    content
                }
                .background(.regularMaterial)
            }
        }
        #else
        self.safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                Divider()
                content
            }
            .background(.regularMaterial)
        }
        #endif
    }
}

/// Turns a scroll over the sidebar into a step from shelf to shelf while `isEnabled`: one step for each notch of a
/// mouse wheel; one for every `MonitorView.distance` points a trackpad or Magic Mouse travels, with the travel
/// starting afresh at each gesture and the momentum after the fingers lift swallowed, so a flick moves a row or two
/// instead of racing to the end. It watches the app's scroll events through a local monitor, which it removes when
/// it leaves the window or is taken down, and takes only those over its own frame in its own window while no mouse
/// button is held; everything else, and everything while it is off, passes through untouched, so dragging rows
/// into order and scrolling elsewhere work as before.
private struct SidebarScrollStepper: NSViewRepresentable {
    let isEnabled: Bool
    /// Moves the selection by a step, positive down the list; false when there is no row that way.
    let onStep: (Int) -> Bool

    func makeNSView(context: Context) -> MonitorView { MonitorView() }

    func updateNSView(_ nsView: MonitorView, context: Context) {
        nsView.isEnabled = isEnabled
        nsView.onStep = onStep
    }

    static func dismantleNSView(_ nsView: MonitorView, coordinator: ()) {
        nsView.stopMonitoring()
    }

    final class MonitorView: NSView {
        /// Trackpad travel, in points, that makes one step: about a sidebar row.
        static let distance: CGFloat = 28
        var isEnabled = false
        var onStep: ((Int) -> Bool)?
        private var monitor: Any?
        /// Trackpad travel not yet spent on a step, in the current gesture.
        private var travel: CGFloat = 0

        /// It only watches; clicks and drags go to the rows over it.
        override func hitTest(_ point: NSPoint) -> NSView? { nil }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if window == nil { stopMonitoring() } else { startMonitoring() }
        }

        func startMonitoring() {
            guard monitor == nil else { return }
            monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
                let taken = MainActor.assumeIsolated { self?.take(event) ?? false }
                return taken ? nil : event
            }
        }

        func stopMonitoring() {
            if let monitor { NSEvent.removeMonitor(monitor) }
            monitor = nil
            travel = 0
        }

        /// Whether the event was used here, and so goes no further.
        private func take(_ event: NSEvent) -> Bool {
            guard isEnabled, let window, event.window === window, !isHiddenOrHasHiddenAncestor else { return false }
            guard bounds.contains(convert(event.locationInWindow, from: nil)) else { return false }
            // With a button held — a row being dragged into order, a book carried in — the list scrolls as usual.
            guard NSEvent.pressedMouseButtons == 0 else { return false }
            let dx = event.scrollingDeltaX
            let dy = event.scrollingDeltaY
            if event.hasPreciseScrollingDeltas {
                if event.phase.contains(.began) || event.phase.contains(.mayBegin) { travel = 0 }
                // The glide after the fingers lift neither steps nor scrolls the list under the selection.
                if event.momentumPhase != [] { return true }
                if abs(dx) > abs(dy) { return false }
                travel += dy
                var stepped = false
                // AppKit reports a scroll down the list as a negative delta.
                while abs(travel) >= MonitorView.distance {
                    let direction = travel < 0 ? 1 : -1
                    travel += CGFloat(direction) * MonitorView.distance
                    if onStep?(direction) == true {
                        stepped = true
                    } else {
                        travel = 0
                        break
                    }
                }
                if stepped { NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now) }
                if event.phase.contains(.ended) || event.phase.contains(.cancelled) { travel = 0 }
                return true
            }
            guard dy != 0, abs(dy) >= abs(dx) else { return false }
            _ = onStep?(dy < 0 ? 1 : -1)
            return true
        }
    }
}

/// Books travel through drag and drop as strings: "book:<uuid>", one line for each book when several go together.
/// Plain text dropped from elsewhere, and Home's widgets being arranged, are ignored.
enum BookDrag {
    static let prefix = "book:"

    static func payload(_ id: UUID) -> String { prefix + id.uuidString }

    static func payload(_ ids: [UUID]) -> String { ids.map { payload($0) }.joined(separator: "\n") }

    static func ids(_ items: [String]) -> [UUID] {
        items
            .flatMap { $0.split(whereSeparator: \.isNewline) }
            .compactMap { line in line.hasPrefix(prefix) ? UUID(uuidString: String(line.dropFirst(prefix.count))) : nil }
    }
}
