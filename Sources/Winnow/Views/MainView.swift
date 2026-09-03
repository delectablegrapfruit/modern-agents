import SwiftUI
import UniformTypeIdentifiers
import WinnowCore

struct MainView: View {
    @EnvironmentObject private var model: AppModel
    @State private var dropTargeted = false

    var body: some View {
        Form {
            StatusSection()
            RulesSection()
            VolumesSection()
            FoldersSection()
            OptionsSection()
            ActivitySection()
        }
        .formStyle(.grouped)
        .frame(minWidth: 480, minHeight: 480)
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

// MARK: - Status

struct StatusSection: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Section {
            HStack(spacing: 10) {
                Circle()
                    .fill(model.isWatching ? Color.green : Color.secondary.opacity(0.5))
                    .frame(width: 8, height: 8)
                Text(model.statusText)
                Spacer()
                Button(model.isWatching ? "Pause" : "Resume") { model.toggleWatching() }
                Button("Sweep Now") { model.sweepEverything() }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.sweep != .idle)
            }
            if case .scanning(let label, let detail) = model.sweep {
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Scanning \(label)")
                        Text(detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                    Spacer()
                    Button("Cancel") { model.cancelSweep() }
                }
            }
        } footer: {
            Text("Drop a folder on this window to clean just that folder.")
        }
    }
}

// MARK: - Rules

struct RulesSection: View {
    @EnvironmentObject private var model: AppModel
    @State private var newPattern = ""

    var body: some View {
        Section("Remove") {
            ForEach(JunkCatalog.builtIn) { rule in
                Toggle(isOn: model.ruleBinding(rule)) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(rule.name)
                        Text(rule.summary)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            ForEach(model.settings.rules.custom) { custom in
                HStack {
                    Text(custom.pattern)
                    Spacer()
                    Button { model.removeCustomPattern(custom.id) } label: {
                        Image(systemName: "minus.circle")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                }
            }
            TextField("Add a name or pattern, like Thumbs.db or *.bak", text: $newPattern)
                .textFieldStyle(.plain)
                .onSubmit {
                    model.addCustomPattern(newPattern)
                    newPattern = ""
                }
        }
    }
}

// MARK: - Volumes

struct VolumesSection: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Section("Disks") {
            Toggle("External disks", isOn: $model.settings.volumes.cleanExternal)
            Toggle("Network volumes", isOn: $model.settings.volumes.cleanNetwork)
            Toggle("Internal disks", isOn: $model.settings.volumes.cleanInternal)
            Toggle("Skip Mac-formatted disks", isOn: $model.settings.volumes.onlyNonMacFormatted)
            ForEach(model.volumes) { volume in
                Toggle(isOn: model.volumeBinding(volume)) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(volume.name)
                        Text(model.volumeDetail(volume))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .disabled(!model.canToggle(volume))
            }
        }
    }
}

// MARK: - Folders

struct FoldersSection: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Section("Folders") {
            ForEach(model.settings.locations) { location in
                HStack {
                    Toggle(isOn: model.locationEnabledBinding(location.id)) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(location.displayName)
                                .lineLimit(1)
                                .truncationMode(.middle)
                            Text(location.recursive ? "With subfolders" : "This folder only")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Button { model.removeLocation(location.id) } label: {
                        Image(systemName: "minus.circle")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                }
                .contextMenu {
                    Toggle("Include Subfolders", isOn: model.locationRecursiveBinding(location.id))
                    Button("Remove") { model.removeLocation(location.id) }
                }
            }
            Button("Add Folder…") { model.addFolders() }
        }
    }
}

// MARK: - Options

struct OptionsSection: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Section("Options") {
            Picker("Removal", selection: $model.settings.general.deletionMode) {
                ForEach(DeletionMode.allCases, id: \.self) { mode in
                    Text(mode.label).tag(mode)
                }
            }
            Toggle("Clean disks when they connect", isOn: $model.settings.volumes.cleanOnMount)
            Toggle("Clean disks before they eject", isOn: $model.settings.volumes.cleanOnEject)
            Toggle("Leave apps and packages alone", isOn: $model.settings.general.skipPackages)
            Toggle("Notify after cleaning", isOn: $model.settings.general.notify)
            Toggle("Launch at login", isOn: model.launchAtLoginBinding)
            Toggle("Spotlight: don't index cleaned disks", isOn: model.spotlightBinding)
        }
        Section {
            Toggle("Don't write .DS_Store on network volumes", isOn: model.dsStoreBinding(network: true))
            Toggle("Don't write .DS_Store on USB disks", isOn: model.dsStoreBinding(network: false))
            Picker("Default view", selection: $model.finderDefaults.viewStyle) {
                Text("Unchanged").tag(FinderViewStyle?.none)
                ForEach(FinderViewStyle.allCases, id: \.self) { style in
                    Text(style.label).tag(FinderViewStyle?.some(style))
                }
            }
            Picker("Sort by", selection: $model.finderDefaults.sortKey) {
                Text("Unchanged").tag(FinderSortKey?.none)
                ForEach(FinderSortKey.allCases, id: \.self) { key in
                    Text(key.label).tag(FinderSortKey?.some(key))
                }
            }
            Toggle("Folders first", isOn: $model.finderDefaults.foldersFirst)
            if model.finderNeedsRelaunch {
                HStack {
                    Text("Takes effect after Finder relaunches.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Relaunch Finder") { model.relaunchFinder() }
                }
            }
        } header: {
            Text("Finder")
        } footer: {
            Text("Defaults apply to every folder without its own .DS_Store, so fewer of them are needed.")
        }
        Section {
            Toggle(isOn: model.startupDiskBinding) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Remove .DS_Store on the startup disk")
                    Text(model.startupDiskDetail ?? "Home folder and Applications. Off by default.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .alert("Remove .DS_Store on the startup disk?", isPresented: $model.startupDiskWarningShown) {
                Button("Turn On", role: .destructive) { model.enableStartupDisk() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(AppModel.startupDiskWarning)
            }
            Picker("Turn off after", selection: model.startupDurationBinding) {
                ForEach(AppModel.startupDurations, id: \.seconds) { choice in
                    Text(choice.label).tag(choice.seconds)
                }
            }
        } header: {
            Text("Startup disk")
        }
        Section {
            TextEditor(text: $model.exclusionsDraft)
                .font(.body.monospaced())
                .frame(minHeight: 56)
        } header: {
            Text("Leave alone")
        } footer: {
            Text("One per line: a folder path, or a name pattern such as *.sketch.")
        }
    }
}

// MARK: - Activity

struct ActivitySection: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Section {
            if model.activity.isEmpty {
                Text("Nothing yet")
                    .foregroundStyle(.secondary)
            }
            ForEach(model.activity.prefix(60)) { entry in
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.message)
                        if let path = entry.path {
                            Text(path)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }
                    }
                    Spacer()
                    Text(entry.date, format: .relative(presentation: .named))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        } header: {
            HStack {
                Text("Activity")
                Spacer()
                if let stats = model.statisticsText {
                    Text(stats)
                }
                if !model.activity.isEmpty {
                    Button("Clear") { model.clearActivity() }
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}
