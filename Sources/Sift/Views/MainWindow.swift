import SwiftUI
import SiftCore

/// One window: what is being cleaned and what needs you, how folders look,
/// what happened. Changes to views are committed from a bar that stays put.
struct MainWindow: View {
    @EnvironmentObject private var model: Model

    var body: some View {
        Form {
            StatusSection()
            ViewSection()
            FoldersSection()
            ActivitySection()
        }
        .formStyle(.grouped)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if model.hasChanges || model.applyPhase != nil { ApplyBar() }
        }
        .frame(minWidth: 520, minHeight: 480)
        .sheet(isPresented: sheetShown) { SweepSheet().environmentObject(model) }
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

/// What is being watched, and everything that needs the person: one row per
/// permission, in the order a first run meets them.
struct StatusSection: View {
    @EnvironmentObject private var model: Model

    var body: some View {
        Section {
            HStack(spacing: 10) {
                Circle()
                    .fill(model.isPaused ? Color.secondary.opacity(0.4) : Color.green)
                    .frame(width: 8, height: 8)
                Text(model.statusText)
                Spacer()
                if model.isPaused { Button("Resume") { model.togglePause() } }
                Button("Sweep") { model.sweepNow() }
                    .disabled(model.sweep != .idle)
            }
            if case .scanning(let directory) = model.sweep {
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    Captioned("Looking through every folder…", directory)
                    Spacer()
                    Button("Cancel") { model.cancelSweep() }
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
            Text("Removes .DS_Store, ._ files and the disk-level folders macOS leaves behind, the moment they appear. What was there before waits for a sweep.")
        }
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
