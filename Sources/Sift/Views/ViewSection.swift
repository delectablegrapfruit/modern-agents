import SwiftUI
import SiftCore

/// The default view: mode, sort, grouping; then the options, shown for the
/// default mode until another is chosen.
struct ViewSection: View {
    @EnvironmentObject private var model: Model
    @State private var optionsMode: ViewMode = .list

    var body: some View {
        Section {
            Picker("Folders open in", selection: $model.draft.default.mode) {
                ForEach(ViewMode.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .onAppear { optionsMode = model.draft.default.mode }
            .onChange(of: model.draft.default.mode) { optionsMode = $0 }
            SortPickers(view: $model.draft.default)
            Picker("Group by", selection: $model.draft.groupBy) {
                ForEach(GroupBy.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            Toggle(isOn: $model.draft.foldersFirst) {
                Captioned("Folders first", model.draft.foldersFirst && model.draft.default.sortKey != .name
                          ? "Finder keeps folders on top only when sorting by Name." : "One Finder setting, the same in every folder.")
            }
        } header: {
            Text("View")
        }
        Section {
            Picker("Options for", selection: $optionsMode) {
                ForEach(ViewMode.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            OptionsForm(mode: optionsMode, options: $model.draft.default.options)
        } header: {
            Text("Options")
        } footer: {
            Text("The same values as Finder's View Options window. Options for the view folders open in apply everywhere. Options for the other views are used when you switch a window to that view.")
        }
    }
}

/// Sort by, and the order where Finder has one (list view).
struct SortPickers: View {
    @Binding var view: FinderView

    var body: some View {
        // Choosing a key takes Finder's own direction for it; Revert never counts as a choice.
        Picker("Sort by", selection: Binding(get: { view.sortKey }, set: { key in
            view.sortKey = key
            view.ascending = key.defaultAscending
        })) {
            ForEach(SortKey.allCases, id: \.self) { Text($0.label).tag($0) }
        }
        if view.mode == .list {
            Picker("Order", selection: $view.ascending) {
                Text("Ascending").tag(true)
                Text("Descending").tag(false)
            }
        }
    }
}

struct FoldersSection: View {
    @EnvironmentObject private var model: Model

    var body: some View {
        Section {
            ForEach(model.draft.folders) { folder in
                HStack {
                    Captioned(Paths.display(folder.path),
                              folder.view.summary + (model.isRecorded(folder) ? "" : " · set when a window shows it"))
                    Spacer()
                    Button("Edit…") { model.editing = folder }
                    Button { model.removeFolder(folder.id) } label: { Image(systemName: "minus.circle") }
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                }
            }
            Button("Add Folder…") { model.addFolder() }
        } header: {
            Text("Folders with their own view")
        } footer: {
            Text("A folder's view carries into the folders beneath it.")
        }
    }
}

/// Controls for one mode, matching Finder's View Options window.
struct OptionsForm: View {
    let mode: ViewMode
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
            Toggle("Use relative dates", isOn: $options.list.relativeDates)
            Toggle("Calculate all sizes", isOn: $options.list.calculateAllSizes)
            Toggle("Show icon preview", isOn: $options.list.showIconPreview)
            LabeledContent("Show columns") {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(ListOptions.optionalColumns, id: \.id) { column in
                        Toggle(column.label, isOn: columnBinding(column.id))
                    }
                }
            }
        case .columns:
            TextSizePicker(value: $options.column.textSize)
            Toggle("Show icons", isOn: $options.column.showIcons)
            Toggle("Show icon preview", isOn: $options.column.showIconPreview)
            Toggle("Show preview column", isOn: $options.column.showPreviewColumn)
        case .gallery:
            SliderRow("Thumbnail size", value: $options.gallery.thumbnailSize, in: 48...256, step: 8, unit: "px")
            Toggle("Show icon preview", isOn: $options.gallery.showIconPreview)
        }
    }

    private func columnBinding(_ id: String) -> Binding<Bool> {
        Binding(get: { options.list.columns.contains(id) },
                set: { on in if on { options.list.columns.insert(id) } else { options.list.columns.remove(id) } })
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

/// One folder's view. Column view sorts and shows columns the same everywhere,
/// so it has nothing to set here.
struct FolderEditor: View {
    @EnvironmentObject private var model: Model
    @State private var draft: FolderView

    init(folder: FolderView) {
        _draft = State(initialValue: folder)
    }

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section(Paths.display(draft.path)) {
                    Picker("Open in", selection: $draft.view.mode) {
                        ForEach(ViewMode.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    if draft.view.mode != .columns {
                        SortPickers(view: $draft.view)
                    }
                }
                if draft.view.mode == .columns {
                    Section {
                        Text("Column view sorts and looks the same in every folder.")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Section("Options") {
                        OptionsForm(mode: draft.view.mode, options: $draft.view.options)
                    }
                }
            }
            .formStyle(.grouped)
            HStack {
                Button("Cancel") { model.editing = nil }.keyboardShortcut(.cancelAction)
                Spacer()
                Button("Save") { model.saveFolder(draft) }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
            }
            .padding()
        }
        .frame(width: 480, height: 520)
    }
}
