import SwiftUI
import UniformTypeIdentifiers
import BooksCore

/// Get Info: the cover, editable title and author, and everything else known about the file.
struct InfoSheet: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var draft: Book
    @State private var frame: CoverFrame?
    /// The title and author the file came with, read once the sheet is up.
    @State private var original: (title: String, author: String)?
    /// The cover as the sheet found it, taken at the first change of picture so that Cancel can put it back: a
    /// picture is written to disk as soon as it is chosen, so the preview can show it.
    @State private var pictureBefore: PictureBefore?
    private let box = CGSize(width: 200, height: 300)

    private struct PictureBefore {
        /// The cover file the book had, so Cancel can tell whether anything changed.
        let file: String?
        /// Whether that was a picture of your own rather than the book's.
        let custom: Bool
        /// That picture of your own, to put back; nil for the book's own cover or one that couldn't be read.
        let picture: NSImage?
    }

    init(book: Book) {
        _draft = State(initialValue: book)
        _frame = State(initialValue: book.coverStyle?.frame)
    }

    private var fit: CoverFit { draft.coverStyle?.fit ?? .fill }
    /// The book as it is now on disk, for the cover: the picture may have been swapped while the sheet is up.
    private var current: Book { model.book(draft.id) ?? draft }
    private var image: NSImage? { model.cover(for: current) }
    /// The well the cover sits in, and the width of everything under it: the editor's size, so switching between
    /// Custom and the other fits leaves the column's outline where it was.
    private var column: CGFloat { box.width + 80 }

    var body: some View {
        let _ = model.coverVersion
        HStack(alignment: .top, spacing: Design.Space.s) {
            coverColumn
                .padding(.top, Design.Space.xl)
            VStack(spacing: 0) {
                Form {
                    Section {
                        TextField("Title", text: $draft.title)
                        TextField("Author", text: $draft.author)
                    } footer: {
                        HStack {
                            Spacer()
                            Button("Restore Original Title and Author") {
                                if let original {
                                    draft.title = original.title
                                    draft.author = original.author
                                }
                            }
                            .buttonStyle(.link)
                            .controlSize(.small)
                            .disabled(original == nil || (original?.title == draft.title && original?.author == draft.author))
                            .help("Put back the title and author the file came with")
                        }
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
                HStack(spacing: Design.Space.m) {
                    Spacer()
                    Button("Cancel", action: cancel)
                        .keyboardShortcut(.cancelAction)
                    Button("Save", action: save)
                        .keyboardShortcut(.defaultAction)
                }
                .padding(.horizontal, Design.Space.xl)
                .padding(.bottom, Design.Space.xl)
            }
        }
        .padding(.leading, Design.Space.xl)
        .frame(width: 740, height: 540)
        .onAppear { if original == nil { original = model.originalDetails(for: current) } }
    }

    /// The cover, as it will look on the shelf — or, for Custom, the editor — with the fit choice and the
    /// picture buttons under it. An image file dropped on the cover becomes the cover. Both show the picture in
    /// its own colours whatever the library's cover appearance, so its placement can be judged.
    private var coverColumn: some View {
        VStack(spacing: Design.Space.m) {
            Group {
                if fit == .custom, let image {
                    CoverEditor(image: image, frame: Binding(get: { frame ?? CoverLayout.fillFrame(image: image.size, box: box) }, set: { frame = $0 }), box: box)
                } else {
                    CoverView(book: preview, width: box.width, height: box.height, showsProgress: false, appearance: .color)
                        .frame(width: column, height: box.height + 80)
                        .background(Design.Fill.empty, in: Design.rounded(Design.Radius.tile))
                }
            }
            .dropDestination(for: URL.self) { urls, _ in
                guard let url = urls.first else { return false }
                changePicture { model.setCover(fileAt: url, for: draft.id) }
                return true
            }
            Picker("Cover", selection: Binding(get: { fit }, set: { setFit($0) })) {
                ForEach(CoverFit.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: column)
            .help("How the picture fills the cover: fitted inside, filling it, stretched to it, or placed by hand")
            if fit == .custom {
                HStack(alignment: .top, spacing: Design.Space.s) {
                    Text("Drag the picture to move it, a corner to size it, a side to stretch it.")
                        .font(Design.Fonts.meta)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    Button("Reset Placement") { frame = nil }
                        .controlSize(.small)
                        .disabled(frame == nil)
                }
                .frame(width: column)
            } else if let note = appearanceNote {
                Text(note)
                    .font(Design.Fonts.meta)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(width: column, alignment: .leading)
            }
            HStack(spacing: Design.Space.s) {
                Button("Choose Picture…") { choosePicture() }
                if current.coverReplaced {
                    Button("Restore Original Cover") { changePicture { model.restoreCover(for: draft.id) } }
                }
                Spacer(minLength: 0)
            }
            .controlSize(.small)
            .frame(width: column)
        }
    }

    /// Why the cover here may not look as it does on the shelves: the library shows every cover another way.
    private var appearanceNote: String? {
        switch model.settings.coverAppearance {
        case .color: return nil
        case .monochrome: return "The library shows covers in monochrome; here you see the picture as it is."
        case .textOnly: return "The library shows covers as text only; here you see the picture as it is."
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
        changePicture { model.setCover(fileAt: url, for: draft.id) }
    }

    /// Changes the picture on disk, noting first, once, what the cover was.
    private func changePicture(_ change: () -> Void) {
        if pictureBefore == nil {
            let book = current
            pictureBefore = PictureBefore(file: book.coverFile, custom: book.coverReplaced, picture: book.coverReplaced ? model.cover(for: book) : nil)
        }
        change()
    }

    /// Leaves the book as it was, the picture included.
    private func cancel() {
        if let before = pictureBefore, current.coverFile != before.file {
            if !before.custom {
                model.restoreCover(for: draft.id)
            } else if let picture = before.picture {
                model.setCover(picture, for: draft.id)
            }
        }
        dismiss()
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

/// The reading goals: Settings ▸ Goals and the sheet the goal widgets open show this same form, so the goals read
/// and step alike wherever they are set.
struct GoalsForm: View {
    @Environment(LibraryModel.self) private var model

    var body: some View {
        @Bindable var model = model
        let goals = model.settings.goals
        let per = GoalsForm.perLabel(goals.period)
        Form {
            Section {
                Stepper(value: $model.settings.goals.dailyMinutes, in: 1...240, step: goals.dailyMinutes < 10 ? 1 : 5) {
                    LabeledContent("Daily reading", value: "\(goals.dailyMinutes) min")
                }
                Stepper(value: $model.settings.goals.monthlyBooks, in: 1...100) {
                    LabeledContent("Books per month", value: "\(goals.monthlyBooks)")
                }
                Stepper(value: $model.settings.goals.yearlyBooks, in: 1...365) {
                    LabeledContent("Books per year", value: "\(goals.yearlyBooks)")
                }
            } header: {
                Text("Reading Goals")
            } footer: {
                Text("Reading time counts while a book is open and you are turning pages. A streak grows every day you reach the daily goal.")
            }
            Section {
                Picker("Goal period", selection: $model.settings.goals.period) {
                    ForEach(GoalPeriod.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                Stepper(value: $model.settings.goals.pages, in: 0...100_000, step: goals.pages < 100 ? 10 : 50) {
                    LabeledContent("Pages per \(per)", value: goals.pages == 0 ? "Off" : "\(goals.pages)")
                }
                Stepper(value: $model.settings.goals.chapters, in: 0...1000) {
                    LabeledContent("Chapters per \(per)", value: goals.chapters == 0 ? "Off" : "\(goals.chapters)")
                }
            } header: {
                Text("Pages & Chapters")
            } footer: {
                Text("Pages count as you turn them; a chapter counts when you read to its end. A goal of 0 leaves it out.")
            }
        }
        .formStyle(.grouped)
    }

    /// "week", "month", "quarter", "year": the period as the steppers' labels say it ("Pages per quarter" reads
    /// better than "Pages per 3 months").
    private static func perLabel(_ period: GoalPeriod) -> String {
        period == .quarter ? "quarter" : period.label.lowercased()
    }
}

/// The goals, from the goal widgets on Home. Changes apply as they are made, so Done is the only button.
struct GoalsSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            GoalsForm()
                .scrollContentBackground(.hidden)
            HStack(spacing: Design.Space.m) {
                Spacer()
                Button("Done") { dismiss() }
                    .keyboardShortcut(.defaultAction)
            }
            .padding(.horizontal, Design.Space.xl)
            .padding(.bottom, Design.Space.xl)
        }
        .frame(width: 480, height: 480)
        .onExitCommand { dismiss() }
    }
}

/// Books ▸ Settings…: how covers and the sidebar behave, what Home shows, where the library lives, the goals, and
/// how books open. Every tab is the same width; each is as tall as it needs.
struct SettingsView: View {
    @Environment(LibraryModel.self) private var model

    private static let width: CGFloat = 500

    /// The layout and the spread as one choice, as the reader's Appearance popover offers them: a spread means
    /// nothing while the text scrolls.
    private enum Arrangement: Hashable {
        case one, two, scroll
    }

    var body: some View {
        TabView {
            general
                .frame(width: SettingsView.width, height: 330)
                .tabItem { Label("General", systemImage: "gearshape") }
            home
                .frame(width: SettingsView.width, height: 470)
                .tabItem { Label("Home", systemImage: "house") }
            library
                .frame(width: SettingsView.width, height: 500)
                .tabItem { Label("Library", systemImage: "books.vertical") }
            GoalsForm()
                .frame(width: SettingsView.width, height: 430)
                .tabItem { Label("Goals", systemImage: "target") }
            reading
                .frame(width: SettingsView.width, height: 600)
                .tabItem { Label("Reading", systemImage: "book") }
        }
    }

    // MARK: - General

    private var general: some View {
        @Bindable var model = model
        return Form {
            Section {
                LabeledContent("Appearance") {
                    CoverAppearanceChooser(selection: $model.settings.coverAppearance)
                }
            } header: {
                Text("Covers")
            } footer: {
                Text(model.settings.coverAppearance.detail + ".")
            }
            Section("Sidebar") {
                Toggle(isOn: $model.settings.sidebarScrollSwitchesShelves) {
                    Text("Scroll over the sidebar to move between shelves")
                    Text("Each click of a mouse wheel, or a short swipe on a trackpad, selects the shelf above or below instead of scrolling the list. ⌥⌘↑ and ⌥⌘↓ do the same from the keyboard.")
                }
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - Home

    private var home: some View {
        Form {
            Section {
                ForEach(model.settings.home.elements, id: \.self) { element in
                    Toggle(isOn: Binding(get: { model.settings.home.isShown(element) }, set: { model.setHomeElement(element, shown: $0) })) {
                        Label(element.label, systemImage: element.symbol)
                    }
                }
            } header: {
                Text("Show on Home")
            } footer: {
                Text("Right-click a widget on Home to change its size, or choose Edit Widgets…")
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - Library

    private var library: some View {
        @Bindable var model = model
        let location = model.store.directory.path
        let genreFiles = model.genreDatabaseFiles.map(\.path).joined(separator: "\n")
        let genreSummary = model.genreDatabase.isEmpty ? "None" : Format.plural(model.genreDatabase.count, "book")
        return Form {
            Section("Library") {
                LabeledContent("Location") {
                    HStack(spacing: Design.Space.s) {
                        Text(location)
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .foregroundStyle(.secondary)
                            .help(location)
                        Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([model.store.directory]) }
                            .controlSize(.small)
                    }
                }
                Toggle(isOn: $model.settings.library.importCollections) {
                    Text("Make collections from subfolders")
                    Text("When you add a folder, the books in each of its subfolders go into a collection named after it.")
                }
            }
            Section {
                if let folder = model.settings.library.folder {
                    LabeledContent("Folder") {
                        HStack(spacing: Design.Space.s) {
                            Text(folder)
                                .lineLimit(1)
                                .truncationMode(.middle)
                                .foregroundStyle(.secondary)
                                .help(folder)
                            Button("Change…") { model.chooseLibraryFolder() }
                                .controlSize(.small)
                        }
                    }
                    Toggle("Keep the library in sync with this folder", isOn: $model.settings.library.sync)
                    Toggle("Make collections from its subfolders", isOn: $model.settings.library.syncCollections)
                    LabeledContent {
                        Button("Scan Now") { model.scanLibraryFolder(manual: true) }
                            .controlSize(.small)
                    } label: {
                        Text(model.libraryFolderStatus ?? "Not scanned yet")
                            .foregroundStyle(.secondary)
                    }
                    HStack {
                        Spacer()
                        Button("Stop Using This Folder") { model.clearLibraryFolder() }
                    }
                } else {
                    LabeledContent("Folder") {
                        Button("Choose…") { model.chooseLibraryFolder() }
                            .controlSize(.small)
                    }
                }
            } header: {
                Text("Library Folder")
            } footer: {
                Text("Books you put in this folder or its subfolders are added to the library by themselves. Stopping leaves your books where they are.")
            }
            Section {
                LabeledContent("Genre table") {
                    HStack(spacing: Design.Space.s) {
                        Text(genreSummary)
                            .foregroundStyle(.secondary)
                            .help(genreFiles)
                        Button("Reload") { model.reloadGenreDatabase() }
                            .controlSize(.small)
                    }
                }
            } header: {
                Text("Genres")
            } footer: {
                Text("Shelves grouped by genre also use a Genres.csv file placed beside the library or in the library folder.")
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - Reading

    private var reading: some View {
        @Bindable var model = model
        let reader = model.settings.reader
        let autoNightDetail = reader.theme.isDark
            ? "\(reader.theme.label) is already dark"
            : "\(reader.theme.label) in Light Mode, \(reader.theme.nightVariant.label) in Dark Mode"
        return Form {
            Section("Appearance") {
                Picker("Theme", selection: $model.settings.reader.theme) {
                    ForEach(Theme.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                Toggle(isOn: $model.settings.reader.autoNight) {
                    Text("Auto-Night Theme")
                    Text(autoNightDetail)
                }
                .disabled(reader.theme.isDark)
                Picker("Font", selection: $model.settings.reader.font) {
                    ForEach(ReaderFont.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                Stepper(value: $model.settings.reader.fontSize, in: 50...300, step: 10) {
                    LabeledContent("Text size", value: "\(reader.fontSize)%")
                }
            }
            Section("Text") {
                Picker("Line spacing", selection: $model.settings.reader.lineHeight) {
                    ForEach(LineHeight.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                Picker("Text width", selection: $model.settings.reader.textWidth) {
                    ForEach(TextWidth.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                Toggle("Justify text", isOn: $model.settings.reader.justify)
                Toggle("Hyphenation", isOn: $model.settings.reader.hyphenate)
            }
            Section {
                Picker("Layout", selection: arrangement) {
                    Text(Spread.one.label).tag(Arrangement.one)
                    Text(Spread.two.label).tag(Arrangement.two)
                    Text("Scrolling").tag(Arrangement.scroll)
                }
                Picker("Page turn", selection: $model.settings.reader.pageTurn) {
                    ForEach(PageTurn.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                .disabled(reader.layout == .scroll)
                Toggle("Show page numbers", isOn: $model.settings.reader.showPageNumbers)
                Toggle("Show pages left in chapter", isOn: $model.settings.reader.showChapterProgress)
                    .disabled(!reader.showPageNumbers)
            } header: {
                Text("Pages")
            } footer: {
                Text("A book keeps the layout you choose for it in the reader; these are for the rest.")
            }
            Section {
                Picker("View PDFs as", selection: $model.settings.reader.pdfLayout) {
                    ForEach(PDFLayout.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                Toggle(isOn: $model.settings.reader.themeBackgroundOnly) {
                    Text("Theme the background only")
                    Text("In Pages and Zoom & Split, the pages stay as printed; the theme changes only the space around them.")
                }
            } header: {
                Text("PDFs")
            } footer: {
                Text("A PDF keeps the view you choose for it in the reader.")
            }
            Section {
                Toggle("Scroll wheel turns pages", isOn: $model.settings.reader.wheelTurnsPages)
                Group {
                    Picker("Trackpad sensitivity", selection: $model.settings.reader.wheelSensitivity) {
                        ForEach(WheelSensitivity.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    Toggle("Invert direction", isOn: $model.settings.reader.wheelInvert)
                    Toggle("Turn pages with horizontal scrolling and ⇧-scroll", isOn: $model.settings.reader.wheelHorizontal)
                }
                .disabled(!reader.wheelTurnsPages)
            } header: {
                Text("Scroll Wheel & Trackpad")
            } footer: {
                Text("One click of a mouse wheel or one two-finger swipe turns one page. With Scrolling the wheel scrolls the text instead.")
            }
        }
        .formStyle(.grouped)
    }

    /// Layout and spread set together, in one change of the settings.
    private var arrangement: Binding<Arrangement> {
        Binding(get: {
            let reader = model.settings.reader
            if reader.layout == .scroll { return Arrangement.scroll }
            return reader.spread == Spread.one ? Arrangement.one : Arrangement.two
        }, set: { choice in
            var reader = model.settings.reader
            switch choice {
            case .one:
                reader.layout = .paginated
                reader.spread = .one
            case .two:
                reader.layout = .paginated
                reader.spread = .two
            case .scroll:
                reader.layout = .scroll
            }
            model.settings.reader = reader
        })
    }
}

/// The three ways covers can look, drawn as System Settings draws Appearance: the book last opened shown each way,
/// the chosen one ringed in the accent colour.
private struct CoverAppearanceChooser: View {
    @Environment(LibraryModel.self) private var model
    @Binding var selection: CoverAppearance

    var body: some View {
        let book = sample
        HStack(alignment: .top, spacing: Design.Space.l) {
            ForEach(CoverAppearance.allCases, id: \.self) { appearance in
                let chosen = appearance == selection
                Button {
                    selection = appearance
                } label: {
                    VStack(spacing: Design.Space.s) {
                        CoverView(book: book, width: 44, height: 66, showsProgress: false, appearance: appearance)
                            .padding(Design.Space.xs)
                            .overlay {
                                Design.rounded(Design.Radius.cell)
                                    .strokeBorder(Color.accentColor, lineWidth: 2)
                                    .opacity(chosen ? 1 : 0)
                            }
                        Text(appearance.label)
                            .font(Design.Fonts.meta)
                            .foregroundStyle(chosen ? Color.primary : Color.secondary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(appearance.detail)
                .accessibilityAddTraits(chosen ? AccessibilityTraits.isSelected : [])
            }
        }
        .padding(.vertical, Design.Space.xs)
    }

    /// The book last opened, else any, else a stand-in with no picture, which shows as a plain cover.
    private var sample: Book {
        model.continueReading.first ?? model.books.first ?? Book(title: "Title", author: "Author", kind: .epub, fileName: "", fileSize: 0)
    }
}
