import SwiftUI
import BooksCore

/// Get Info: the cover, editable title and author, and everything else known about the file.
struct InfoSheet: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var draft: Book

    init(book: Book) {
        _draft = State(initialValue: book)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 24) {
            CoverView(book: draft, width: 170)
                .padding(.top, 8)
            VStack(alignment: .leading, spacing: 0) {
                Form {
                    Section {
                        TextField("Title", text: $draft.title)
                        TextField("Author", text: $draft.author)
                    }
                    Section("Details") {
                        LabeledContent("Kind", value: draft.kind == .pdf ? "PDF Document" : "EPUB Book")
                        LabeledContent("File", value: draft.fileName)
                        LabeledContent("Size", value: Format.bytes(draft.fileSize))
                        if draft.kind == .epub { LabeledContent("Length", value: Format.plural(draft.words, "word") + (draft.words > 0 ? " · about " + Format.duration(seconds: Int(Double(draft.words) / 240 * 60)) : "")) }
                        if let pages = draft.pageCount { LabeledContent("Pages", value: "\(pages)") }
                        LabeledContent("Added", value: Display.added(draft.addedAt))
                        if let opened = draft.lastOpenedAt { LabeledContent("Last Opened", value: opened.formatted(date: .abbreviated, time: .shortened)) }
                        if let finished = draft.finishedAt { LabeledContent("Finished", value: Display.added(finished)) }
                        if !draft.metadata.publisher.isEmpty { LabeledContent("Publisher", value: draft.metadata.publisher) }
                        if !draft.metadata.published.isEmpty { LabeledContent("Published", value: draft.metadata.published) }
                        if !draft.metadata.language.isEmpty { LabeledContent("Language", value: draft.metadata.language) }
                        if !draft.metadata.identifier.isEmpty { LabeledContent("Identifier", value: draft.metadata.identifier).textSelection(.enabled) }
                        if !draft.metadata.subjects.isEmpty { LabeledContent("Subjects", value: draft.metadata.subjects.joined(separator: ", ")) }
                    }
                    if !draft.metadata.description.isEmpty {
                        Section("Description") {
                            Text(draft.metadata.description).textSelection(.enabled)
                        }
                    }
                }
                .formStyle(.grouped)
                .scrollContentBackground(.hidden)
                HStack {
                    Spacer()
                    Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                    Button("Done") {
                        var book = draft
                        book.title = book.title.trimmingCharacters(in: .whitespaces)
                        book.author = book.author.trimmingCharacters(in: .whitespaces)
                        if book.title.isEmpty { book.title = "Untitled" }
                        model.update(book)
                        dismiss()
                    }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
                }
                .padding([.horizontal, .bottom], 16)
            }
        }
        .padding(.leading, 24)
        .frame(width: 680, height: 520)
    }
}

struct GoalsSheet: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 0) {
            Form {
                Section {
                    Stepper(value: $model.settings.goals.dailyMinutes, in: 1...240, step: model.settings.goals.dailyMinutes < 10 ? 1 : 5) {
                        LabeledContent("Daily reading", value: "\(model.settings.goals.dailyMinutes) min")
                    }
                    Stepper(value: $model.settings.goals.yearlyBooks, in: 1...365) {
                        LabeledContent("Books per year", value: "\(model.settings.goals.yearlyBooks)")
                    }
                } header: {
                    Text("Reading Goals")
                } footer: {
                    Text("Reading time counts while a book is open and you are turning pages. A streak grows every day you reach the daily goal.")
                }
            }
            .formStyle(.grouped)
            HStack {
                Spacer()
                Button("Done") { dismiss() }.keyboardShortcut(.defaultAction)
            }
            .padding()
        }
        .frame(width: 420, height: 260)
    }
}

/// Books ▸ Settings…: what Home shows, the goals, and how new books open.
struct SettingsView: View {
    @Environment(LibraryModel.self) private var model

    var body: some View {
        @Bindable var model = model
        TabView {
            Form {
                Section("Home") {
                    Toggle("Continue Reading", isOn: $model.settings.showContinueReading)
                    Toggle("Reading Goals", isOn: $model.settings.showGoals)
                    Toggle("Statistics", isOn: $model.settings.showStatistics)
                }
                Section("Goals") {
                    Stepper(value: $model.settings.goals.dailyMinutes, in: 1...240) { LabeledContent("Daily reading", value: "\(model.settings.goals.dailyMinutes) min") }
                    Stepper(value: $model.settings.goals.yearlyBooks, in: 1...365) { LabeledContent("Books per year", value: "\(model.settings.goals.yearlyBooks)") }
                }
                Section("Library") {
                    LabeledContent("Location", value: model.store.directory.path)
                        .textSelection(.enabled)
                    Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([model.store.directory]) }
                    Button("Export Highlights and Notes…") { exportAnnotations() }
                }
            }
            .formStyle(.grouped)
            .tabItem { Label("General", systemImage: "gearshape") }

            Form {
                Section("Appearance") {
                    Picker("Theme", selection: $model.settings.reader.theme) { ForEach(Theme.allCases, id: \.self) { Text($0.label).tag($0) } }
                    Toggle(isOn: $model.settings.reader.autoNight) {
                        Text("Auto-Night Theme")
                        Text("Original and Bold switch to Focus, Paper to Calm, when the Mac is in Dark Mode.")
                    }
                    Picker("Font", selection: $model.settings.reader.font) { ForEach(ReaderFont.allCases, id: \.self) { Text($0.label).tag($0) } }
                }
                Section("Layout") {
                    Picker("Pages", selection: $model.settings.reader.layout) { ForEach(ReaderLayout.allCases, id: \.self) { Text($0.label).tag($0) } }
                    Picker("Spread", selection: $model.settings.reader.spread) { ForEach(Spread.allCases, id: \.self) { Text($0.label).tag($0) } }
                        .disabled(model.settings.reader.layout == .scroll)
                    Picker("Text Width", selection: $model.settings.reader.textWidth) { ForEach(TextWidth.allCases, id: \.self) { Text($0.label).tag($0) } }
                    Toggle("Show page numbers", isOn: $model.settings.reader.showPageNumbers)
                    Toggle("Show pages left in chapter", isOn: $model.settings.reader.showChapterProgress)
                }
                Section {
                    Toggle("Scroll wheel turns pages", isOn: $model.settings.reader.wheelTurnsPages)
                    Picker("Sensitivity", selection: $model.settings.reader.wheelSensitivity) { ForEach(WheelSensitivity.allCases, id: \.self) { Text($0.label).tag($0) } }
                    Toggle("Invert direction", isOn: $model.settings.reader.wheelInvert)
                    Toggle("Horizontal scrolling and ⇧ + wheel", isOn: $model.settings.reader.wheelHorizontal)
                } header: {
                    Text("Scroll Wheel & Trackpad")
                } footer: {
                    Text("One click of a mouse wheel or one two-finger swipe turns one page. With Vertical Scrolling the wheel scrolls the text instead.")
                }
            }
            .formStyle(.grouped)
            .tabItem { Label("Reading", systemImage: "book") }
        }
        .frame(width: 520, height: 560)
    }

    private func exportAnnotations() {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "Books Highlights.md"
        panel.allowedContentTypes = [.plainText]
        guard panel.runModal() == .OK, let url = panel.url else { return }
        try? model.store.annotationsMarkdown().write(to: url, atomically: true, encoding: .utf8)
    }
}
