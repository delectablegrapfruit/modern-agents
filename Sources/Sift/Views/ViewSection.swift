import SwiftUI
import SiftCore

struct ViewSection: View {
    @EnvironmentObject private var model: Model
    @State private var optionsMode: ViewMode = .icons

    var body: some View {
        Section {
            Picker("Folders open in", selection: $model.draft.default.mode) {
                ForEach(ViewMode.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .onChange(of: model.draft.default.mode) { optionsMode = $0 }
            Picker("Sort by", selection: $model.draft.default.sortKey) {
                ForEach(SortKey.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            Picker("Order", selection: $model.draft.default.ascending) {
                Text("Ascending").tag(true)
                Text("Descending").tag(false)
            }
            Picker("Group by", selection: $model.draft.groupBy) {
                ForEach(GroupBy.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            Toggle(isOn: $model.draft.foldersFirst) {
                Captioned("Folders first", model.draft.foldersFirst && model.draft.default.sortKey != .name
                          ? "Finder keeps folders on top only when sorting by Name." : nil)
            }
        } header: {
            Text("View")
        } footer: {
            guardFooter
        }
        Section {
            Picker("Options for", selection: $optionsMode) {
                ForEach(ViewMode.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .onAppear { optionsMode = model.draft.default.mode }
            OptionsForm(mode: optionsMode, options: $model.draft.default.options)
        } footer: {
            Text("The same values as Finder's View Options window, used by every folder without a view of its own.")
        }
    }

    @ViewBuilder private var guardFooter: some View {
        if !model.canControlFinder {
            HStack {
                Text("Sift is not allowed to control Finder, so windows keep whatever view they had. Allow it under Automation.")
                Spacer()
                Button("Open Settings") { model.openAutomation() }
            }
        } else if !model.reactsInstantly {
            HStack {
                Text("Windows take the view within a second of showing a folder. With Accessibility access new windows take it at once.")
                Spacer()
                Button("Allow…") { model.requestAccessibility() }
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
                    Captioned(Paths.display(folder.path), folder.view.summary)
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
            Text("A folder's view carries into the folders beneath it. Finder keeps it in the parent folder's .DS_Store; Sift keeps that one file and removes the rest.")
        }
        if model.hasChanges || model.applyPhase != nil {
            Section {
                HStack {
                    if model.applyPhase != nil { ProgressView().controlSize(.small) }
                    Text(model.applyPhase ?? "Finder relaunches when you apply.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Revert") { model.revert() }
                        .disabled(model.applyPhase != nil)
                    Button("Apply") { model.apply() }
                        .buttonStyle(.borderedProminent)
                        .disabled(model.applyPhase != nil)
                }
            }
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
                    Picker("Sort by", selection: $draft.view.sortKey) {
                        ForEach(SortKey.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    Picker("Order", selection: $draft.view.ascending) {
                        Text("Ascending").tag(true)
                        Text("Descending").tag(false)
                    }
                }
                Section("Options") {
                    OptionsForm(mode: draft.view.mode, options: $draft.view.options)
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
