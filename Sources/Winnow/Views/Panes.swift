import SwiftUI
import WinnowCore

// MARK: - Clean

struct CleanPane: View {
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
                    Captioned("Scanning \(label)", detail)
                    Spacer()
                    Button("Cancel") { model.cancelSweep() }
                }
            }
        } footer: {
            Text("Drop a folder on this window to clean just that folder. Finder’s Services menu also offers “Clean with Winnow”.")
        }
        Section {
            if model.watches.isEmpty {
                Text(model.isWatching ? "Nothing to watch. Connect a disk or add a folder under Locations." : "Paused")
                    .foregroundStyle(.secondary)
            }
            ForEach(model.watches) { target in
                Captioned(target.label, target.path)
            }
        } header: {
            Text("Watching")
        } footer: {
            if let stats = model.statisticsText {
                Text(stats + " so far.")
            }
        }
    }
}

// MARK: - Rules

struct RulesPane: View {
    @EnvironmentObject private var model: AppModel
    @State private var newPattern = ""

    var body: some View {
        Section("Remove") {
            ForEach(JunkCatalog.builtIn) { rule in
                Toggle(isOn: model.ruleBinding(rule)) {
                    Captioned(rule.name, rule.summary)
                }
            }
        }
        Section {
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
        } header: {
            Text("Also remove")
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

// MARK: - Locations

struct LocationsPane: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Section {
            Toggle("External disks", isOn: $model.settings.volumes.cleanExternal)
            Toggle("Network volumes", isOn: $model.settings.volumes.cleanNetwork)
            Toggle("Internal disks", isOn: $model.settings.volumes.cleanInternal)
            Toggle("Skip Mac-formatted disks", isOn: $model.settings.volumes.onlyNonMacFormatted)
        } header: {
            Text("Disks")
        }
        Section {
            ForEach(model.volumes) { volume in
                Toggle(isOn: model.volumeBinding(volume)) {
                    Captioned(volume.name, model.volumeDetail(volume))
                }
                .disabled(!model.canToggle(volume))
            }
        } header: {
            Text("Connected now")
        } footer: {
            Text("Switching a disk here overrides the policy above for that disk only.")
        }
        Section {
            ForEach(model.settings.locations) { location in
                HStack {
                    Toggle(isOn: model.locationEnabledBinding(location.id)) {
                        Captioned(location.displayName, location.recursive ? "With subfolders" : "This folder only")
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
        } header: {
            Text("Folders")
        }
        Section {
            Toggle(isOn: model.startupDiskBinding) {
                Captioned("Remove .DS_Store on the startup disk",
                          model.startupDiskDetail ?? "Home folder and Applications. Off by default.")
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
    }
}

// MARK: - Options

struct OptionsPane: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Section("Removal") {
            Picker("Removed items are", selection: $model.settings.general.deletionMode) {
                ForEach(DeletionMode.allCases, id: \.self) { mode in
                    Text(mode.label.lowercased()).tag(mode)
                }
            }
            Toggle("Leave apps and packages alone", isOn: $model.settings.general.skipPackages)
        }
        Section("Disks") {
            Toggle("Clean when a disk connects", isOn: $model.settings.volumes.cleanOnMount)
            Toggle("Clean before a disk ejects", isOn: $model.settings.volumes.cleanOnEject)
            Toggle("Stop Spotlight indexing cleaned disks", isOn: model.spotlightBinding)
        }
        Section("General") {
            Toggle("Notify after cleaning", isOn: $model.settings.general.notify)
            Toggle("Launch at login", isOn: model.launchAtLoginBinding)
        }
    }
}

// MARK: - Activity

struct ActivityPane: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Section {
            if model.activity.isEmpty {
                Text("Nothing yet")
                    .foregroundStyle(.secondary)
            }
            ForEach(model.activity.prefix(100)) { entry in
                HStack(alignment: .firstTextBaseline) {
                    Captioned(entry.message, entry.path)
                    Spacer()
                    Text(entry.date, format: .relative(presentation: .named))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        } header: {
            HStack {
                if let stats = model.statisticsText {
                    Text(stats)
                }
                Spacer()
                if !model.activity.isEmpty {
                    Button("Clear") { model.clearActivity() }
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}
