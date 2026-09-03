import SwiftUI
import WinnowCore

func foldersFirstCaption(_ on: Bool, _ sortKey: FinderSortKey) -> String {
    if on && sortKey != .name {
        return "Won't take effect: Finder keeps folders on top only when sorting by Name. Sort by is \(sortKey.label)."
    }
    return "Finder applies this when sorting by name."
}

struct FinderPane: View {
    @EnvironmentObject private var model: AppModel
    @State private var optionsMode: FinderViewStyle = .icons

    var body: some View {
        Section("Default view") {
            Picker("Open folders in", selection: $model.finderDraft.viewStyle) {
                ForEach(FinderViewStyle.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            Picker("Sort by", selection: $model.finderDraft.sortKey) {
                ForEach(FinderSortKey.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            Picker("Order", selection: $model.finderDraft.ascending) {
                Text("Ascending").tag(true)
                Text("Descending").tag(false)
            }
            Picker("Group by", selection: $model.finderDraft.groupBy) {
                ForEach(FinderGroupBy.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            Toggle(isOn: $model.finderDraft.foldersFirst) {
                Captioned("Folders first", foldersFirstCaption(model.finderDraft.foldersFirst, model.finderDraft.sortKey))
            }
        }
        Section {
            Picker("Mode", selection: $optionsMode) {
                ForEach(FinderViewStyle.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .onAppear { optionsMode = model.finderDraft.viewStyle }
            .sheet(item: $model.editingFolderView) { view in
                FolderViewEditor(view: view).environmentObject(model)
            }
            ViewOptionsForm(mode: optionsMode, options: $model.finderDraft.options)
        } header: {
            Text("View options")
        } footer: {
            Text("Used by every folder without its own settings — the same as View Options → Use as Defaults.")
        }
        Section {
            ForEach(model.folderViewsDraft) { view in
                HStack {
                    Toggle(isOn: model.folderViewEnabledBinding(view.id)) {
                        Captioned(view.displayName, view.summary)
                    }
                    Button("Edit…") { model.editingFolderView = view }
                    Button { model.removeFolderView(view.id) } label: {
                        Image(systemName: "minus.circle")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                }
            }
            Button("Add Folder…") { model.addFolderView() }
        } header: {
            Text("Folders with their own view")
        } footer: {
            Text("Each keeps a .DS_Store holding these settings; sweeps leave it alone.")
        }
        Section(".DS_Store") {
            Toggle("Don’t write on network volumes", isOn: $model.finderDraft.noDSStoreOnNetwork)
            Toggle("Don’t write on USB disks", isOn: $model.finderDraft.noDSStoreOnUSB)
        }
        Section {
            Toggle(isOn: model.startupDiskBinding) {
                Captioned("Enforce defaults on every drive",
                          model.startupDiskDetail ?? "Keeps removing .DS_Store everywhere, so changes made in Finder last only for the session.")
            }
            .alert("Enforce Finder defaults everywhere?", isPresented: $model.startupDiskWarningShown) {
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
            Text("Enforce")
        }
        Section {
            Toggle(isOn: $model.resetFoldersOnApply) {
                Captioned("Reset every folder to these defaults now",
                          "Removes .DS_Store across your home folder, Applications and every connected drive. Folders above keep theirs.")
            }
            HStack {
                if model.isApplyingFinder || model.isResettingFolders {
                    ProgressView().controlSize(.small)
                }
                Text(statusText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer()
                if model.isResettingFolders {
                    Button("Cancel") { model.cancelSweep() }
                }
                if model.finderHasChanges && !model.isApplyingFinder {
                    Button("Revert") { model.revertFinderDraft() }
                }
                Button("Apply") { model.applyFinderDefaults() }
                    .buttonStyle(.borderedProminent)
                    .disabled(!(model.finderHasChanges || model.resetFoldersOnApply) || model.isApplyingFinder || model.isResettingFolders)
            }
        }
    }

    private var statusText: String {
        if let phase = model.finderPhase { return phase }
        if model.isResettingFolders {
            if case .scanning(_, let detail) = model.sweep, !detail.isEmpty { return "Resetting folders… " + detail }
            return "Resetting folders…"
        }
        if model.finderHasChanges { return "Finder relaunches when you apply." }
        return model.finderStatus ?? "Finder is up to date."
    }
}

/// Controls for one view mode, matching Finder's View Options window.
struct ViewOptionsForm: View {
    let mode: FinderViewStyle
    @Binding var options: ViewOptions

    var body: some View {
        switch mode {
        case .icons:
            SliderRow("Icon size", value: $options.icon.iconSize, in: 16...512, step: 16, unit: "px")
            SliderRow("Grid spacing", value: $options.icon.gridSpacing, in: 32...100, step: 2, unit: "")
            TextSizePicker(value: $options.icon.textSize)
            Picker("Label position", selection: $options.icon.labelOnBottom) {
                Text("Bottom").tag(true)
                Text("Right").tag(false)
            }
            Toggle("Show item info", isOn: $options.icon.showItemInfo)
            Toggle("Show icon preview", isOn: $options.icon.showIconPreview)
        case .list:
            Picker("Icon size", selection: $options.list.largeIcons) {
                Text("Small").tag(false)
                Text("Large").tag(true)
            }
            TextSizePicker(value: $options.list.textSize)
            Toggle("Use relative dates", isOn: $options.list.useRelativeDates)
            Toggle("Calculate all sizes", isOn: $options.list.calculateAllSizes)
            Toggle("Show icon preview", isOn: $options.list.showIconPreview)
            LabeledContent("Show columns") {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(ListViewOptions.optionalColumns, id: \.id) { column in
                        Toggle(column.label, isOn: columnBinding(column.id))
                    }
                }
            }
        case .columns:
            Picker("Text size", selection: $options.column.textSize) {
                ForEach([10, 11, 12, 13, 14, 15, 16], id: \.self) { Text("\($0) pt").tag($0) }
            }
            Toggle("Show icons", isOn: $options.column.showIcons)
            Toggle("Show icon preview", isOn: $options.column.showIconPreview)
            Toggle("Show preview column", isOn: $options.column.showPreviewColumn)
        case .gallery:
            SliderRow("Thumbnail size", value: $options.gallery.thumbnailSize, in: 48...256, step: 8, unit: "px")
            Toggle("Show icon preview", isOn: $options.gallery.showIconPreview)
        }
    }

    private func columnBinding(_ id: String) -> Binding<Bool> {
        Binding(
            get: { options.list.visibleColumns.contains(id) },
            set: { on in
                if on { options.list.visibleColumns.insert(id) } else { options.list.visibleColumns.remove(id) }
            }
        )
    }
}

struct SliderRow: View {
    let title: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double
    let unit: String

    init(_ title: String, value: Binding<Double>, in range: ClosedRange<Double>, step: Double, unit: String) {
        self.title = title
        _value = value
        self.range = range
        self.step = step
        self.unit = unit
    }

    var body: some View {
        LabeledContent(title) {
            HStack {
                Slider(value: $value, in: range, step: step)
                Text(unit.isEmpty ? "\(Int(value))" : "\(Int(value)) \(unit)")
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .frame(width: 56, alignment: .trailing)
            }
        }
    }
}

struct TextSizePicker: View {
    @Binding var value: Double

    var body: some View {
        Picker("Text size", selection: $value) {
            ForEach([10.0, 11, 12, 13, 14, 15, 16], id: \.self) { Text("\(Int($0)) pt").tag($0) }
        }
    }
}

struct FolderViewEditor: View {
    @EnvironmentObject private var model: AppModel
    @State private var draft: FolderView

    init(view: FolderView) {
        _draft = State(initialValue: view)
    }

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section(draft.displayName) {
                    Picker("View", selection: $draft.viewStyle) {
                        ForEach(FinderViewStyle.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    Picker("Sort by", selection: $draft.sortKey) {
                        ForEach(FinderSortKey.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    Picker("Order", selection: $draft.ascending) {
                        Text("Ascending").tag(true)
                        Text("Descending").tag(false)
                    }
                    Toggle(isOn: $draft.includeSubfolders) {
                        Captioned("Include subfolders", "Folders inside with their own view keep it.")
                    }
                    if draft.sortKey != .name {
                        Text("Finder keeps folders on top only when sorting by Name.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Section("Options") {
                    ViewOptionsForm(mode: draft.viewStyle, options: $draft.options)
                }
            }
            .formStyle(.grouped)
            HStack {
                Button("Cancel") { model.editingFolderView = nil }
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button("Save") { model.saveFolderView(draft) }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
            }
            .padding()
        }
        .frame(width: 480, height: 540)
    }
}
