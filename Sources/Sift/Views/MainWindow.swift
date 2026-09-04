import SwiftUI
import SiftCore

/// One window: what is being cleaned and what needs you, how folders look,
/// what happened. Changes to views are committed from a bar that stays put.
struct MainWindow: View {
    @EnvironmentObject private var model: Model
    @State private var showsAbout = false

    var body: some View {
        Form {
            StatusSection()
            ViewSection()
            FoldersSection()
            ActivitySection()
        }
        .formStyle(.grouped)
        .toolbar {
            // What Sift is, on demand: the window itself shows what it does.
            ToolbarItem(placement: .primaryAction) {
                Button { showsAbout.toggle() } label: { Image(systemName: "info.circle") }
                    .help("About Sift")
                    .popover(isPresented: $showsAbout, arrowEdge: .bottom) { About() }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if model.hasChanges || model.applyPhase != nil { ApplyBar() }
        }
        .frame(minWidth: 520, minHeight: 480)
        .sheet(isPresented: sheetShown) { SweepSheet().environmentObject(model) }
        .sheet(isPresented: $model.editingWatch) { WatchSheet().environmentObject(model) }
        .sheet(item: $model.editing) { folder in FolderEditor(folder: folder).environmentObject(model) }
        .alert("Sift", isPresented: errorShown, presenting: model.error) { _ in
            Button("OK") {}
        } message: { message in
            Text(message)
        }
        .onAppear { model.checkPermissions() }
    }

    private var sheetShown: Binding<Bool> {
        Binding(get: { model.sweep.showsSheet }, set: { if !$0 { model.dismissSweep() } })
    }

    private var errorShown: Binding<Bool> {
        Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })
    }
}

/// What Sift does, in three short paragraphs, behind the toolbar's ⓘ.
struct About: View {
    private var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? ""
        return short.isEmpty ? "" : "Version " + short
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Sift").font(.headline)
                if !version.isEmpty { Text(version).font(.caption).foregroundStyle(.secondary) }
            }
            Text("Removes the hidden files macOS leaves on every disk, such as .DS_Store, ._ sidecar files and the disk-level folders, the moment they appear. Sweep clears what was there before.")
            Text("Makes Finder show folders your way: one view for every folder on every disk, folders with a view of their own, and no more remembering whatever view a window last had.")
            Text("Never touched: system folders, apps, Time Machine disks, and anything of yours.")
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .frame(width: 340)
    }
}

/// What is being watched, whether a sweep is needed, and everything that
/// needs the person: one row each, the same shape (light · words · button).
struct StatusSection: View {
    @EnvironmentObject private var model: Model

    var body: some View {
        Section {
            // Watching.
            HStack(spacing: 10) {
                Light(model.isPaused || model.roots.isEmpty ? .off : .good)
                Captioned(model.statusText, model.isPaused || model.unwatchedNames.isEmpty ? nil
                          : "Not watched: " + model.unwatchedNames.joined(separator: ", "))
                Spacer()
                if model.isPaused { Button("Resume") { model.togglePause() } }
                Button("Edit…") { model.editingWatch = true }
            }
            // Sweeping.
            HStack(spacing: 10) {
                if case .scanning(let directory) = model.sweep {
                    Light(.due)
                    ProgressView().controlSize(.small)
                    Captioned("Looking through every folder…", directory)
                    Spacer()
                    Button("Cancel") { model.cancelSweep() }
                } else {
                    let text = model.sweepText
                    Light(model.sweepDue.isEmpty ? .good : .due)
                    Captioned(text.title, text.reason)
                    Spacer()
                    Button("Sweep") { model.sweepNow() }
                        .disabled(model.sweepDue.isEmpty || model.sweep != .idle)
                }
            }
            if !model.hasFullDiskAccess {
                Need("Full Disk Access lets Sift reach every folder",
                     "Drag Sift into the list under Full Disk Access.") {
                    Button("Reveal Sift") { model.revealApp() }
                    Button("Open Settings") { model.openFullDiskAccess() }
                }
            }
            if !model.canControlFinder {
                Need("Sift needs to control Finder to set views",
                     "Turn on Finder under Sift in Automation.") {
                    Button("Open Settings") { model.openAutomation() }
                }
            }
            if !model.reactsInstantly {
                Need("With Accessibility access, windows take their view at once",
                     "Without it, within a second.") {
                    Button("Allow Accessibility…") { model.requestAccessibility() }
                }
            }
            if !model.locked.isEmpty {
                let count = "\(model.locked.count) item\(model.locked.count == 1 ? "" : "s")"
                let names = model.locked.map { $0.name + " on " + Paths.name(of: $0.parent) }.joined(separator: ", ")
                if model.helperReady {
                    Need(count + " protected by macOS privacy controls · " + names,
                         "Drag Sift's helper into the list under Full Disk Access.") {
                        Button("Reveal Helper") { model.revealHelper() }
                        Button("Open Settings") { model.openFullDiskAccess() }
                    }
                } else {
                    Need(count + " can only be removed by an administrator · " + names,
                         "Allow once; Sift's helper then removes such items by itself.") {
                        Button("Allow Administrator…") { model.allowAdministrator() }
                    }
                }
            }
        } footer: {
            Text("Removes .DS_Store, ._ files and the disk-level folders macOS leaves behind, the moment they appear.")
        }
    }
}

/// A status light: green for good, orange for something to do, grey for off.
struct Light: View {
    enum State { case good, due, off }
    let state: State

    init(_ state: State) { self.state = state }

    var body: some View {
        Circle()
            .fill(state == .good ? Color.green : (state == .due ? Color.orange : Color.secondary.opacity(0.4)))
            .frame(width: 8, height: 8)
    }
}

/// Which disks are watched and swept. A disk that cannot be (read-only, Time
/// Machine) is listed so it is clear why it is not.
struct WatchSheet: View {
    @EnvironmentObject private var model: Model

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section {
                    ForEach(model.volumes.sorted { ($0.kind == .startup ? 0 : 1, $0.name) < ($1.kind == .startup ? 0 : 1, $1.name) }) { volume in
                        Toggle(isOn: Binding(get: { model.isWatchable(volume) && model.isWatched(volume) },
                                             set: { model.setWatched(volume, $0) })) {
                            Captioned(volume.kind == .startup ? "Startup disk" : volume.name, caption(for: volume))
                        }
                        .disabled(!model.isWatchable(volume))
                    }
                } header: {
                    Text("Watch and sweep")
                } footer: {
                    Text("A disk left out is neither watched nor swept.")
                }
            }
            .formStyle(.grouped)
            HStack {
                Spacer()
                Button("Done") { model.editingWatch = false }.keyboardShortcut(.defaultAction)
            }
            .padding()
        }
        .frame(width: 420, height: 360)
    }

    private func caption(for volume: Volume) -> String? {
        if volume.kind == .startup { return "Your folders, Shared, Applications" }
        if volume.isReadOnly { return "Read-only" }
        if !volume.isCleanable() { return "Time Machine backups" }
        return nil
    }
}

/// A row that needs the person: what, how, and the buttons that do it.
struct Need<Buttons: View>: View {
    let title: String
    let how: String
    @ViewBuilder let buttons: () -> Buttons

    init(_ title: String, _ how: String, @ViewBuilder buttons: @escaping () -> Buttons) {
        self.title = title
        self.how = how
        self.buttons = buttons
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Captioned(title, how)
            Spacer()
            buttons()
        }
    }
}

/// The bar that commits view changes; it stays at the bottom while the form scrolls.
struct ApplyBar: View {
    @EnvironmentObject private var model: Model

    var body: some View {
        HStack {
            if model.applyPhase != nil { ProgressView().controlSize(.small) }
            Text(model.applyPhase ?? "Finder quits and reopens when you apply, with its windows.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Button("Revert") { model.revert() }
                .disabled(model.applyPhase != nil)
            Button("Apply") { model.apply() }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
                .disabled(model.applyPhase != nil)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(.bar)
    }
}

struct ActivitySection: View {
    @EnvironmentObject private var model: Model
    @State private var showsAll = false
    private let few = 12

    var body: some View {
        Section {
            if model.activity.isEmpty {
                Text("Nothing yet.").foregroundStyle(.secondary)
            }
            ForEach(showsAll ? model.activity : Array(model.activity.prefix(few))) { entry in
                HStack(alignment: .firstTextBaseline) {
                    Captioned(entry.text, entry.path)
                        .foregroundStyle(entry.kind == .failed ? Color.red : (entry.kind == .info ? Color.secondary : Color.primary))
                    Spacer()
                    Text(entry.date, format: .relative(presentation: .named))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            if model.activity.count > few {
                Button(showsAll ? "Show fewer" : "Show all") { showsAll.toggle() }
                    .buttonStyle(.link)
            }
        } header: {
            Text("Activity")
        }
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
            Text(title).lineLimit(2).truncationMode(.middle)
            if let caption, !caption.isEmpty {
                Text(caption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .truncationMode(.middle)
            }
        }
    }
}
