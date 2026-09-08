import SwiftUI
import UniformTypeIdentifiers
import BooksCore

/// Get Info: the cover, editable title and author, and everything else known about the file.
struct InfoSheet: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var draft: Book
    @State private var frame: CoverFrame?
    private let box = CGSize(width: 200, height: 300)

    init(book: Book) {
        _draft = State(initialValue: book)
        _frame = State(initialValue: book.coverStyle?.frame)
    }

    private var fit: CoverFit { draft.coverStyle?.fit ?? .fit }
    /// The book as it is now on disk, for the cover: the picture may have been swapped while the sheet is up.
    private var current: Book { model.book(draft.id) ?? draft }
    private var image: NSImage? { model.cover(for: current) }

    var body: some View {
        let _ = model.coverVersion
        HStack(alignment: .top, spacing: 20) {
            coverColumn
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
                        if let seconds = current.secondsRead, seconds > 0 { LabeledContent("Time Read", value: Format.duration(seconds: seconds)) }
                        if let pages = current.pagesRead, pages > 0 { LabeledContent("Pages Read", value: Format.plural(pages, "page")) }
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
                    Button("Done", action: save)
                        .buttonStyle(.borderedProminent)
                        .keyboardShortcut(.defaultAction)
                }
                .padding([.horizontal, .bottom], 16)
            }
        }
        .padding(.leading, 20)
        .frame(width: 800, height: 600)
    }

    /// The cover, as it will look on the shelf — or, for Custom, the editor — with the fit choice and the
    /// picture buttons under it. An image file dropped on the cover becomes the cover.
    private var coverColumn: some View {
        VStack(spacing: 12) {
            Group {
                if fit == .custom, let image {
                    CoverEditor(image: image, frame: Binding(get: { frame ?? CoverLayout.fillFrame(image: image.size, box: box) }, set: { frame = $0 }), box: box)
                } else {
                    CoverView(book: preview, width: box.width, height: box.height)
                        .frame(width: box.width + 80, height: box.height + 80)
                }
            }
            .dropDestination(for: URL.self) { urls, _ in
                guard let url = urls.first else { return false }
                model.setCover(fileAt: url, for: draft.id)
                return true
            }
            Picker("Cover", selection: Binding(get: { fit }, set: { setFit($0) })) {
                ForEach(CoverFit.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: box.width + 80)
            .help("How the picture fills the cover: fitted inside, filling it, stretched to it, or placed by hand")
            if fit == .custom {
                HStack {
                    Text("Drag the picture to move it, a corner to size it, a side to stretch it.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Reset") { frame = nil }
                        .controlSize(.small)
                        .disabled(frame == nil)
                }
                .frame(width: box.width + 80)
            }
            HStack(spacing: 8) {
                Button("Choose Picture…") { choosePicture() }
                if current.coverReplaced {
                    Button("Restore Original") { model.restoreCover(for: draft.id) }
                }
                Spacer()
            }
            .controlSize(.small)
            .frame(width: box.width + 80)
        }
    }

    /// The draft with the cover as it is now: the title typed, the picture on disk, the fit being chosen.
    private var preview: Book {
        var book = current
        book.title = draft.title
        book.author = draft.author
        book.coverStyle = style
        return book
    }

    private var style: CoverStyle? {
        let s = CoverStyle(fit: fit, frame: fit == .custom ? frame : nil)
        return s.isDefault ? nil : s
    }

    private func setFit(_ newFit: CoverFit) {
        var s = draft.coverStyle ?? CoverStyle()
        s.fit = newFit
        draft.coverStyle = s
        if newFit == .custom, frame == nil, let image { frame = CoverLayout.fillFrame(image: image.size, box: box) }
    }

    private func choosePicture() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.message = "Choose a picture for the cover of “\(draft.title)”"
        panel.prompt = "Use as Cover"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        model.setCover(fileAt: url, for: draft.id)
    }

    /// Title, author and cover style go onto the book as it is on disk now; the picture itself was saved as chosen.
    private func save() {
        var book = current
        book.title = draft.title.trimmingCharacters(in: .whitespaces)
        book.author = draft.author.trimmingCharacters(in: .whitespaces)
        if book.title.isEmpty { book.title = "Untitled" }
        book.coverStyle = style
        model.update(book)
        dismiss()
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
                    Toggle("Make collections from subfolders when adding folders", isOn: $model.settings.library.importCollections)
                }
                Section("Library Folder") {
                    if let folder = model.settings.library.folder {
                        LabeledContent("Folder", value: folder)
                            .textSelection(.enabled)
                        HStack {
                            Button("Choose…") { model.chooseLibraryFolder() }
                            Button("Clear") { model.clearLibraryFolder() }
                        }
                        Toggle("Keep the library in sync with this folder", isOn: $model.settings.library.sync)
                        Toggle("Collections from its subfolders", isOn: $model.settings.library.syncCollections)
                        HStack {
                            Button("Scan Now") { model.scanLibraryFolder(manual: true) }
                            if let status = model.libraryFolderStatus { Text(status).font(.caption).foregroundStyle(.secondary) }
                        }
                    } else {
                        Text("Books put in a folder you choose — and in its subfolders, which become collections — appear in the library by themselves.")
                            .font(.caption).foregroundStyle(.secondary)
                        Button("Choose Folder…") { model.chooseLibraryFolder() }
                    }
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
