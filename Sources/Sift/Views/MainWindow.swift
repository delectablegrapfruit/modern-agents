import SwiftUI
import SiftCore

/// One window: what is being cleaned, how folders look, what happened.
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
                Button(model.isPaused ? "Resume" : "Pause") { model.togglePause() }
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
            if !model.locked.isEmpty {
                HStack {
                    Captioned("\(model.locked.count) item\(model.locked.count == 1 ? "" : "s") can only be removed by an administrator",
                              model.locked.map { $0.name + " on " + Paths.name(of: $0.parent) }.joined(separator: ", "))
                    Spacer()
                    Button("Remove…") { model.removeAsAdministrator(model.locked) }
                }
            }
            if !model.hasFullDiskAccess {
                HStack {
                    Captioned("Full Disk Access lets Sift reach every folder",
                              "Without it, Desktop, Documents and the Trash on other disks need separate permission.")
                    Spacer()
                    Button("Open Settings") { model.openFullDiskAccess() }
                }
            }
        } footer: {
            Text(model.statisticsText ?? "Removes .DS_Store, ._ files and the disk-level folders macOS leaves behind, the moment they appear.")
        }
    }
}

struct ActivitySection: View {
    @EnvironmentObject private var model: Model

    var body: some View {
        Section("Activity") {
            if model.activity.isEmpty {
                Text("Nothing yet").foregroundStyle(.secondary)
            }
            ForEach(model.activity) { entry in
                HStack(alignment: .firstTextBaseline) {
                    Captioned(entry.text, entry.path)
                    Spacer()
                    Text(entry.date, format: .relative(presentation: .named))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
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
            Text(title).lineLimit(1).truncationMode(.middle)
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
