import SwiftUI
import UniformTypeIdentifiers
import WinnowCore

enum Pane: String, CaseIterable, Identifiable {
    case clean, rules, locations, finder, options, activity

    var id: Pane { self }

    var label: String {
        switch self {
        case .clean: return "Clean"
        case .rules: return "Rules"
        case .locations: return "Locations"
        case .finder: return "Finder"
        case .options: return "Options"
        case .activity: return "Activity"
        }
    }

    var symbol: String {
        switch self {
        case .clean: return "wind"
        case .rules: return "checklist"
        case .locations: return "externaldrive"
        case .finder: return "macwindow"
        case .options: return "slider.horizontal.3"
        case .activity: return "clock"
        }
    }
}

struct MainView: View {
    @EnvironmentObject private var model: AppModel
    @State private var pane: Pane? = .clean
    @State private var dropTargeted = false

    var body: some View {
        NavigationSplitView {
            List(Pane.allCases, selection: $pane) { pane in
                Label(pane.label, systemImage: pane.symbol)
            }
            .navigationSplitViewColumnWidth(min: 150, ideal: 168, max: 220)
        } detail: {
            Form {
                switch pane ?? .clean {
                case .clean: CleanPane()
                case .rules: RulesPane()
                case .locations: LocationsPane()
                case .finder: FinderPane()
                case .options: OptionsPane()
                case .activity: ActivityPane()
                }
            }
            .formStyle(.grouped)
        }
        .frame(minWidth: 660, minHeight: 460)
        .overlay {
            if dropTargeted {
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(.tint, lineWidth: 2)
                    .padding(6)
            }
        }
        .onDrop(of: [.fileURL], isTargeted: $dropTargeted, perform: handleDrop)
        .sheet(isPresented: sheetShown) {
            SweepSheet().environmentObject(model)
        }
        .alert("Winnow", isPresented: errorShown, presenting: model.lastError) { _ in
            Button("OK") {}
        } message: { message in
            Text(message)
        }
    }

    private var sheetShown: Binding<Bool> {
        Binding(get: { model.sweep.showsSheet }, set: { if !$0 { model.dismissSweep() } })
    }

    private var errorShown: Binding<Bool> {
        Binding(get: { model.lastError != nil }, set: { if !$0 { model.lastError = nil } })
    }

    private func handleDrop(_ providers: [NSItemProvider]) -> Bool {
        let group = DispatchGroup()
        let lock = NSLock()
        var urls: [URL] = []
        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            group.enter()
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                defer { group.leave() }
                let url: URL?
                if let data = item as? Data {
                    url = URL(dataRepresentation: data, relativeTo: nil)
                } else {
                    url = item as? URL
                }
                guard let url else { return }
                lock.lock(); urls.append(url); lock.unlock()
            }
        }
        group.notify(queue: .main) {
            model.sweep(urls: urls)
        }
        return true
    }
}

/// Two-line row: title plus a secondary caption.
struct Captioned: View {
    let title: String
    let caption: String?

    init(_ title: String, _ caption: String? = nil) {
        self.title = title
        self.caption = caption
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .lineLimit(1)
                .truncationMode(.middle)
            if let caption, !caption.isEmpty {
                Text(caption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
        }
    }
}
