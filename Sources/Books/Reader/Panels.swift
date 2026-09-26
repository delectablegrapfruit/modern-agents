import AppKit
import SwiftUI
import BooksCore

/// Contents · Bookmarks · Notes, behind the toolbar's list button.
struct ContentsPopover: View {
    @Bindable var session: ReaderSession
    /// The tallest it may be in the window it opens over.
    var maxHeight: CGFloat = 440

    var body: some View {
        VStack(spacing: 0) {
            Picker("Show", selection: $session.contentsTab) {
                Text("Contents").tag(0)
                Text("Bookmarks").tag(1)
                Text("Notes").tag(2)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(Design.Space.m)
            Divider()
            switch session.contentsTab {
            case 0: contents
            case 1: bookmarks
            default: notes
            }
        }
        .frame(width: Design.popoverWidth, height: min(440, maxHeight))
        .readerAppearance(dark: session.effectiveTheme.isDark)
        // Each opening starts at Contents, as it did when the tab was the popover's own state.
        .onDisappear { session.contentsTab = 0 }
    }

    /// The chapters, opened on the one being read, which is set in the accent colour so it is found at a glance.
    @ViewBuilder
    private var contents: some View {
        if session.toc.isEmpty {
            ContentUnavailableView("No Contents", systemImage: "list.bullet", description: Text("This book has no table of contents."))
        } else {
            let current = session.toc.last(where: { $0.label == session.position.chapter })?.id
            ScrollViewReader { proxy in
                List {
                    ForEach(session.toc) { item in
                        Button {
                            session.open(item)
                            session.showContents = false
                        } label: {
                            HStack(spacing: Design.Space.s) {
                                Text(item.label)
                                    .lineLimit(2)
                                    .fontWeight(item.id == current ? .semibold : .regular)
                                    .foregroundStyle(item.id == current ? Color.accentColor : Color.primary)
                                Spacer(minLength: Design.Space.s)
                                if session.usesPDFView || (item.pos > 0 && session.layout.mode == .paginated) {
                                    Text("\(session.usesPDFView ? item.spine + 1 : whole(item.pos) + 1)")
                                        .font(Design.Fonts.meta)
                                        .foregroundStyle(.tertiary)
                                        .monospacedDigit()
                                }
                            }
                            .padding(.leading, CGFloat(min(item.level, 3)) * Design.Space.l)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .id(item.id)
                    }
                }
                .listStyle(.plain)
                .onAppear {
                    if let current { proxy.scrollTo(current, anchor: .center) }
                }
            }
        }
    }

    @ViewBuilder
    private var bookmarks: some View {
        if session.bookmarks.isEmpty {
            ContentUnavailableView("No Bookmarks", systemImage: "bookmark", description: Text("Press ⌘D to bookmark the page you’re on."))
        } else {
            List {
                ForEach(session.bookmarks) { mark in
                    HStack(alignment: .firstTextBaseline, spacing: Design.Space.s) {
                        Button {
                            session.goToLocator(mark.locator)
                            session.showContents = false
                        } label: {
                            HStack(alignment: .firstTextBaseline, spacing: Design.Space.s) {
                                Image(systemName: "bookmark.fill").foregroundStyle(HighlightSwatch.bookmark)
                                VStack(alignment: .leading, spacing: Design.Space.xxs) {
                                    Text(bookmarkTitle(mark)).lineLimit(1)
                                    Text(mark.createdAt.formatted(date: .abbreviated, time: .shortened))
                                        .font(Design.Fonts.meta)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        removeButton("Remove bookmark") { session.removeAnnotation(mark.id) }
                    }
                    .contextMenu { Button("Remove Bookmark", role: .destructive) { session.removeAnnotation(mark.id) } }
                }
            }
            .listStyle(.plain)
        }
    }

    @ViewBuilder
    private var notes: some View {
        if session.highlights.isEmpty {
            ContentUnavailableView("No Highlights or Notes", systemImage: "highlighter", description: Text("Select text in the book to highlight it or add a note."))
        } else {
            List {
                ForEach(session.highlights) { h in
                    HStack(alignment: .top, spacing: Design.Space.s) {
                        Button {
                            session.goToLocator(h.locator)
                            session.showContents = false
                        } label: {
                            HStack(alignment: .top, spacing: Design.Space.s) {
                                Capsule().fill(HighlightSwatch.color(h.color ?? .yellow)).frame(width: 4)
                                VStack(alignment: .leading, spacing: Design.Space.xxs) {
                                    Text(h.text).lineLimit(3)
                                    if !h.note.isEmpty {
                                        Text(h.note).font(Design.Fonts.body).foregroundStyle(.secondary).lineLimit(3)
                                    }
                                    Text(h.chapter).font(Design.Fonts.meta).foregroundStyle(.tertiary).lineLimit(1)
                                }
                                Spacer(minLength: 0)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        removeButton(h.color == .underline ? "Remove underline" : "Remove highlight") { session.removeAnnotation(h.id) }
                    }
                    .contextMenu {
                        Button(h.note.isEmpty ? "Add Note…" : "Edit Note…") {
                            session.editingNote = h
                            session.showContents = false
                        }
                        Divider()
                        Button(h.color == .underline ? "Remove Underline" : "Remove Highlight", role: .destructive) { session.removeAnnotation(h.id) }
                    }
                }
            }
            .listStyle(.plain)
        }
    }

    /// A bookmark is named by its chapter; failing that, by its page in a PDF.
    private func bookmarkTitle(_ mark: Annotation) -> String {
        if !mark.chapter.isEmpty { return mark.chapter }
        return session.book.kind == .pdf ? "Page \(mark.locator.spine + 1)" : "Bookmark"
    }

    /// The small trash can at the end of a bookmark or note row.
    private func removeButton(_ help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: "trash")
                .frame(width: 24, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .foregroundStyle(.secondary)
        .help(help)
    }
}

/// The reader's marks. The five highlight colours and the underline are the ones the EPUB page paints (HL_COLORS and
/// HL_UNDERLINE in reader-core.js) and the PDF views draw from here, so a green highlight is the same green in the
/// menu, the Notes list, a book and a PDF. Bookmarks are red wherever they are marked, as in Books.
enum HighlightSwatch {
    static func hex(_ c: HighlightColor) -> String {
        switch c {
        case .yellow: return "#FFD93D"
        case .green: return "#99DB73"
        case .blue: return "#8CC7FF"
        case .pink: return "#FF9EBF"
        case .purple: return "#C7A6FF"
        case .underline: return "#FF3B30"
        }
    }

    static func color(_ c: HighlightColor) -> Color { Color(hex: hex(c)) }

    /// The toolbar's filled bookmark, the Bookmarks list and the timeline's dots.
    static let bookmark = Color.red
}

/// Text size, themes, fonts and layout: everything Books offers under "Aa", in its order. The size buttons come
/// first, then the theme circles and the fonts, each set in its own face in two short columns, then the text and
/// page settings, the wheel and the footer. It is as tall as its contents where the window has the room, and
/// scrolls within the window's height where it has not.
struct AppearancePopover: View {
    @Bindable var session: ReaderSession
    /// The tallest it may be in the window it opens over.
    var maxHeight: CGFloat = 720
    @Environment(LibraryModel.self) private var model

    /// Tall enough for everything at once, which a window has room for when it is not short.
    static let tallest: CGFloat = 720

    /// The layout and the spread as one choice, since a spread means nothing while the text scrolls.
    private enum Arrangement: Hashable {
        case one, two, scroll
    }

    var body: some View {
        @Bindable var model = model
        let pdfBook = session.book.kind == .pdf
        let pdfView = session.usesPDFView
        let fit = pdfView && session.pdfLayout == .fit
        let plainZoom = pdfView && !fit
        let scrolling = !pdfView && session.reader.layout == .scroll
        ScrollView {
            VStack(alignment: .leading, spacing: Design.Space.m) {
                VStack(spacing: Design.Space.xs) {
                    sizeButtons(plainZoom: plainZoom)
                    Text(sizeCaption(plainZoom: plainZoom, fit: fit))
                        .font(Design.Fonts.meta)
                        .foregroundStyle(.secondary)
                }
                if pdfBook {
                    VStack(alignment: .leading, spacing: Design.Space.s) {
                        Picker("View as", selection: Binding(get: { session.pdfLayout }, set: { session.setPDFLayout($0) })) {
                            ForEach(PDFLayout.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        Text(pdfLayoutHelp).font(Design.Fonts.meta).foregroundStyle(.secondary)
                    }
                }
                themes
                if !pdfView {
                    Divider()
                    fonts
                }
                Divider()
                Grid(alignment: .leading, horizontalSpacing: Design.Space.m, verticalSpacing: Design.Space.s) {
                    if !pdfView {
                        GridRow {
                            Text("Line spacing")
                            Picker("Line spacing", selection: Binding(get: { model.settings.reader.lineHeight }, set: { model.settings.reader.lineHeight = $0; session.applySettings() })) {
                                ForEach(LineHeight.allCases, id: \.self) { Text($0.label).tag($0) }
                            }
                            .labelsHidden()
                            .pickerStyle(.segmented)
                        }
                        GridRow {
                            Text("Text width")
                            Picker("Text width", selection: Binding(get: { model.settings.reader.textWidth }, set: { model.settings.reader.textWidth = $0; session.applySettings() })) {
                                ForEach(TextWidth.allCases, id: \.self) { Text($0.label).tag($0) }
                            }
                            .labelsHidden()
                            .pickerStyle(.segmented)
                        }
                        GridRow {
                            Color.clear.gridCellUnsizedAxes([.horizontal, .vertical])
                            HStack(spacing: Design.Space.l) {
                                Toggle("Justify text", isOn: Binding(get: { model.settings.reader.justify }, set: { model.settings.reader.justify = $0; session.applySettings() }))
                                Toggle("Hyphenation", isOn: Binding(get: { model.settings.reader.hyphenate }, set: { model.settings.reader.hyphenate = $0; session.applySettings() }))
                            }
                        }
                    }
                    GridRow {
                        Text("Layout")
                        Picker("Layout", selection: arrangement(pdfView: pdfView)) {
                            Text(Spread.one.label).tag(Arrangement.one)
                            Text(Spread.two.label).tag(Arrangement.two)
                            if !pdfView { Text("Scrolling").tag(Arrangement.scroll) }
                        }
                        .labelsHidden()
                        .pickerStyle(.segmented)
                    }
                    if !plainZoom {
                        GridRow {
                            Text("Page turn")
                            Picker("Page turn", selection: Binding(get: { model.settings.reader.pageTurn }, set: { model.settings.reader.pageTurn = $0; session.applySettings() })) {
                                ForEach(PageTurn.allCases, id: \.self) { Text($0.label).tag($0) }
                            }
                            .labelsHidden()
                            .pickerStyle(.segmented)
                            .disabled(scrolling)
                        }
                    }
                }
                Text(pdfBook ? "The view, the layout and the Zoom & Split text size are kept with this book." : "The layout is kept with this book; everything else applies to every book.")
                    .font(Design.Fonts.meta)
                    .foregroundStyle(.secondary)
                Divider()
                DisclosureGroup("Scroll Wheel & Trackpad") {
                    VStack(alignment: .leading, spacing: Design.Space.s) {
                        Toggle("Scroll wheel turns pages", isOn: Binding(get: { model.settings.reader.wheelTurnsPages }, set: { model.settings.reader.wheelTurnsPages = $0; session.applySettings() }))
                        Group {
                            if !pdfView {
                                Picker("Trackpad sensitivity", selection: Binding(get: { model.settings.reader.wheelSensitivity }, set: { model.settings.reader.wheelSensitivity = $0; session.applySettings() })) {
                                    ForEach(WheelSensitivity.allCases, id: \.self) { Text($0.label).tag($0) }
                                }
                                .pickerStyle(.segmented)
                            }
                            Toggle("Invert direction", isOn: Binding(get: { model.settings.reader.wheelInvert }, set: { model.settings.reader.wheelInvert = $0; session.applySettings() }))
                            Toggle("Turn pages with horizontal scrolling and ⇧-scroll", isOn: Binding(get: { model.settings.reader.wheelHorizontal }, set: { model.settings.reader.wheelHorizontal = $0; session.applySettings() }))
                        }
                        .disabled(!model.settings.reader.wheelTurnsPages)
                    }
                    .padding(.top, Design.Space.s)
                }
                VStack(alignment: .leading, spacing: Design.Space.s) {
                    Toggle("Show page numbers", isOn: $model.settings.reader.showPageNumbers)
                    Toggle("Show pages left in chapter", isOn: $model.settings.reader.showChapterProgress)
                        .disabled(!model.settings.reader.showPageNumbers)
                }
            }
            .padding(Design.Space.l)
        }
        .scrollBounceBehavior(.basedOnSize)
        .frame(width: Design.popoverWidth)
        .frame(maxHeight: min(AppearancePopover.tallest, maxHeight))
        .readerAppearance(dark: session.effectiveTheme.isDark)
    }

    private var pdfLayoutHelp: String {
        switch session.pdfLayout {
        case .pages: return "Whole pages, as printed."
        case .fit: return "Pages cropped to their text and split into screens. At 100% the text is its printed size; larger sizes rewrap the lines."
        case .text: return "The text reflowed like a book. Fonts, sizes and themes apply; the printed layout doesn’t."
        }
    }

    // MARK: Size

    private func sizeButtons(plainZoom: Bool) -> some View {
        HStack(spacing: 0) {
            Button { session.changeFontSize(by: -10) } label: { sizeLabel(plainZoom ? nil : 15, symbol: "minus.magnifyingglass") }
                .help(plainZoom ? "Zoom out (⌘−)" : "Smaller text (⌘−)")
            Divider().frame(height: 22)
            Button { session.changeFontSize(by: 10) } label: { sizeLabel(plainZoom ? nil : 24, symbol: "plus.magnifyingglass") }
                .help(plainZoom ? "Zoom in (⌘+)" : "Bigger text (⌘+)")
        }
        .buttonStyle(.plain)
        .background(.quaternary, in: Design.rounded(Design.Radius.control))
        .contextMenu {
            if !plainZoom { Button("Reset Text Size") { resetTextSize() } }
        }
    }

    /// Both halves of the size control respond across their whole width, not only on the glyph.
    private func sizeLabel(_ fontSize: CGFloat?, symbol: String) -> some View {
        Group {
            if let fontSize { Text("A").font(.system(size: fontSize)) } else { Image(systemName: symbol) }
        }
        .frame(maxWidth: .infinity, minHeight: 32)
        .contentShape(Rectangle())
    }

    private func sizeCaption(plainZoom: Bool, fit: Bool) -> String {
        if plainZoom { return "Zoom" }
        return "Text size \(fit ? session.reader.pdfZoom : model.settings.reader.fontSize)%"
    }

    /// Back to the book's own size, or for Zoom & Split to the printed size.
    private func resetTextSize() {
        if session.usesPDFView {
            session.setView { $0.pdfZoom = 100 }
        } else {
            model.settings.reader.fontSize = 100
        }
        session.applySettings()
    }

    // MARK: Themes

    private var themes: some View {
        let chosen = model.settings.reader.theme
        return VStack(alignment: .leading, spacing: Design.Space.m) {
            HStack(spacing: 0) {
                ForEach(Theme.allCases, id: \.self) { theme in
                    Button { choose(theme) } label: {
                        VStack(spacing: Design.Space.xs) {
                            Text("Aa")
                                .font(.system(size: 15, weight: theme == .bold ? .bold : .regular, design: .serif))
                                .foregroundStyle(Color(hex: theme.colors.text))
                                .frame(width: 40, height: 40)
                                .background(Color(hex: theme.colors.background), in: Circle())
                                .overlay(Circle().strokeBorder(Color.primary.opacity(0.15), lineWidth: Design.Stroke.hairline))
                                .chosenRing(theme == chosen)
                            Text(theme.label)
                                .font(Design.Fonts.micro)
                                .foregroundStyle(theme == chosen ? Color.primary : Color.secondary)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            Toggle(isOn: Binding(get: { model.settings.reader.autoNight }, set: { model.settings.reader.autoNight = $0; session.applySettings() })) {
                VStack(alignment: .leading, spacing: Design.Space.xxs) {
                    Text("Auto-Night Theme")
                    Text(chosen.isDark ? "\(chosen.label) is already dark" : "\(chosen.label) in Light Mode, \(chosen.nightVariant.label) in Dark Mode")
                        .font(Design.Fonts.meta)
                        .foregroundStyle(.secondary)
                }
            }
            .disabled(chosen.isDark)
            if session.book.kind == .pdf, session.usesPDFView {
                Toggle(isOn: Binding(get: { session.reader.themeBackgroundOnly }, set: { on in session.setView { $0.themeBackgroundOnly = on }; session.applySettings() })) {
                    VStack(alignment: .leading, spacing: Design.Space.xxs) {
                        Text("Theme the background only")
                        Text("This PDF’s pages stay as printed; the theme changes only the space around them.")
                            .font(Design.Fonts.meta)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    /// A light theme chosen while Auto-Night shows a dark one (or the other way round) turns Auto-Night off, so the
    /// theme chosen is the one shown.
    private func choose(_ theme: Theme) {
        model.settings.reader.theme = theme
        if theme.isDark != session.effectiveTheme.isDark { model.settings.reader.autoNight = false }
        session.applySettings()
    }

    // MARK: Fonts

    /// The fonts in two columns, read down the first and then the second: half as long as one list, so the popover
    /// keeps to a short window.
    private var fonts: some View {
        let chosen = model.settings.reader.font
        let all = ReaderFont.allCases
        let half = (all.count + 1) / 2
        return HStack(alignment: .top, spacing: Design.Space.xs) {
            fontColumn(Array(all.prefix(half)), chosen: chosen)
            fontColumn(Array(all.dropFirst(half)), chosen: chosen)
        }
        // The rows' hover pills reach a little past the column, so the names line up with the text above and below.
        .padding(.horizontal, -Design.Space.s)
    }

    private func fontColumn(_ list: [ReaderFont], chosen: ReaderFont) -> some View {
        VStack(spacing: 0) {
            ForEach(list, id: \.self) { font in
                ReaderFontRow(title: font.label, sample: AppearancePopover.sample(font), chosen: font == chosen) {
                    model.settings.reader.font = font
                    session.applySettings()
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .top)
    }

    /// Each font's name in its own face; the book's own fonts and San Francisco in the system face.
    private static func sample(_ font: ReaderFont) -> Font {
        let size: CGFloat = 14
        switch font {
        case .original, .sanfrancisco: return .system(size: size)
        case .newyork: return .system(size: size, design: .serif)
        case .athelas: return .custom("Athelas-Regular", size: size)
        case .charter: return .custom("Charter-Roman", size: size)
        case .georgia: return .custom("Georgia", size: size)
        case .iowan: return .custom("IowanOldStyle-Roman", size: size)
        case .palatino: return .custom("Palatino-Roman", size: size)
        case .seravek: return .custom("Seravek", size: size)
        case .times: return .custom("TimesNewRomanPSMT", size: size)
        }
    }

    // MARK: Layout

    /// One Page and Two Pages turn pages with that spread; Scrolling scrolls. PDFs shown as pages only have the spread.
    private func arrangement(pdfView: Bool) -> Binding<Arrangement> {
        Binding(
            get: {
                let reader = session.reader
                if !pdfView, reader.layout == .scroll { return .scroll }
                return reader.spread == .one ? .one : .two
            },
            set: { value in
                session.setView { view in
                    switch value {
                    case .one:
                        view.spread = .one
                        if !pdfView { view.layout = .paginated }
                    case .two:
                        view.spread = .two
                        if !pdfView { view.layout = .paginated }
                    case .scroll:
                        view.layout = .scroll
                    }
                }
                session.applySettings()
            }
        )
    }
}

/// One font in the Appearance popover's list: its name set in itself, a check when it is the one chosen, lit while
/// the pointer is over it.
private struct ReaderFontRow: View {
    let title: String
    let sample: Font
    let chosen: Bool
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: Design.Space.s) {
                Text(title).font(sample).foregroundStyle(Color.primary).lineLimit(1)
                Spacer(minLength: Design.Space.xs)
                if chosen {
                    Image(systemName: "checkmark")
                        .font(Design.Fonts.meta.weight(.semibold))
                        .foregroundStyle(Color.accentColor)
                }
            }
            .padding(.horizontal, Design.Space.s)
            .frame(height: 26)
            .background(hovering ? Color.primary.opacity(0.06) : Color.clear, in: Design.rounded(Design.Radius.control))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .animation(Design.Motion.quick, value: hovering)
    }
}

private extension View {
    /// The ring round a chosen circle (a theme, a highlight colour, the underline), drawn outside it with a gap so the
    /// colour it marks stays whole. The room for it is kept whether or not it is drawn, so nothing shifts.
    func chosenRing(_ chosen: Bool) -> some View {
        padding(3).overlay {
            if chosen { Circle().strokeBorder(Color.accentColor, lineWidth: 2) }
        }
    }
}

/// Search this book: results grouped by chapter, click to go there.
struct SearchPopover: View {
    @Bindable var session: ReaderSession
    /// The tallest it may be in the window it opens over.
    var maxHeight: CGFloat = 440
    @State private var query = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: Design.Space.s) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Search Book", text: $query)
                    .textFieldStyle(.plain)
                    .focused($focused)
                    .onSubmit { session.search(query) }
                if !query.isEmpty {
                    Button { query = ""; session.search("") } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                        .buttonStyle(.plain)
                        .help("Clear the search")
                }
            }
            .padding(.horizontal, Design.Space.s)
            .frame(height: 28)
            .background(.quaternary, in: Design.rounded(Design.Radius.control))
            .padding(Design.Space.m)
            Divider()
            if session.searchResults.isEmpty {
                if !session.searchDone {
                    ProgressView().controlSize(.small).frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if !session.searchQuery.isEmpty {
                    ContentUnavailableView.search(text: session.searchQuery)
                } else {
                    ContentUnavailableView("Search This Book", systemImage: "magnifyingglass", description: Text("Type a word or phrase and press Return."))
                }
            } else {
                List {
                    ForEach(chapters, id: \.self) { chapter in
                        Section(chapter.isEmpty ? "Untitled" : chapter) {
                            ForEach(session.searchResults.filter { $0.chapter == chapter }) { hit in
                                Button {
                                    session.open(hit)
                                    session.showSearch = false
                                } label: {
                                    excerpt(hit.excerpt)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(3)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.vertical, Design.Space.xxs)
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .listStyle(.plain)
                Divider()
                Text("\(session.searchResults.count) \(session.searchResults.count == 1 ? "match" : "matches")" + (session.searchDone ? "" : "…"))
                    .font(Design.Fonts.meta)
                    .foregroundStyle(.secondary)
                    .padding(Design.Space.s)
            }
        }
        .frame(width: Design.popoverWidth, height: min(440, maxHeight))
        .readerAppearance(dark: session.effectiveTheme.isDark)
        .onAppear { query = session.searchQuery; focused = true }
    }

    private var chapters: [String] {
        var seen: [String] = []
        for hit in session.searchResults where !seen.contains(hit.chapter) { seen.append(hit.chapter) }
        return seen
    }

    /// A match's excerpt with the words searched for in the primary colour and semibold, so the hit shows at a glance.
    private func excerpt(_ text: String) -> Text {
        let query = session.searchQuery.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty, let r = text.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) else { return Text(text) }
        let hit: Text = Text(String(text[r])).fontWeight(.semibold).foregroundStyle(Color.primary)
        return Text("\(String(text[..<r.lowerBound]))\(hit)\(String(text[r.upperBound...]))")
    }
}

/// The menu over selected words or a tapped highlight: a row of colours (and Underline, and Remove for a
/// highlight), then a row of actions with an icon each. Laid out at its own size, so nothing wraps.
struct HighlightMenu: View {
    @Bindable var session: ReaderSession
    let existing: Annotation?

    var body: some View {
        VStack(spacing: Design.Space.s) {
            HStack(spacing: Design.Space.s) {
                ForEach([HighlightColor.yellow, .green, .blue, .pink, .purple], id: \.self) { color in
                    Button { apply(color) } label: {
                        Circle()
                            .fill(HighlightSwatch.color(color))
                            .overlay(Circle().strokeBorder(.black.opacity(0.12), lineWidth: Design.Stroke.hairline))
                            .frame(width: 24, height: 24)
                            .chosenRing(existing?.color == color)
                            .contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .help(color.label)
                }
                Button { apply(.underline) } label: {
                    circled("underline")
                        .chosenRing(existing?.color == .underline)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .help("Underline")
                if let existing {
                    Divider().frame(height: 18)
                    Button { session.removeAnnotation(existing.id) } label: {
                        circled("trash")
                            .chosenRing(false)
                            .contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .help(existing.color == .underline ? "Remove underline" : "Remove highlight")
                }
            }
            Divider()
            HStack(spacing: Design.Space.xxs) {
                if let existing {
                    MenuAction(title: existing.note.isEmpty ? "Add Note…" : "Edit Note…", symbol: existing.note.isEmpty ? "note.text.badge.plus" : "note.text") {
                        session.tappedHighlight = nil
                        session.editingNote = existing
                    }
                    MenuAction(title: "Copy", symbol: "doc.on.doc") { copy(existing.text); session.tappedHighlight = nil }
                    if !existing.note.isEmpty {
                        // The menu closes with it: its `existing` still holds the note, and Edit Note… would bring it back.
                        MenuAction(title: "Remove Note", symbol: "text.badge.minus") { session.setNote("", for: existing.id); session.tappedHighlight = nil }
                    }
                } else if let sel = session.selection {
                    MenuAction(title: "Add Note…", symbol: "note.text.badge.plus") { session.pendingNoteAfterHighlight = true; session.highlightSelection(color: .yellow) }
                    MenuAction(title: "Copy", symbol: "doc.on.doc") { copy(sel.text); session.clearSelection() }
                    MenuAction(title: "Look Up", symbol: "character.book.closed") { session.lookUpSelection() }
                    MenuAction(title: "Search", symbol: "magnifyingglass") {
                        session.searchQuery = sel.text
                        session.search(sel.text)
                        session.clearSelection()
                        session.showSearch = true
                    }
                }
            }
        }
        .padding(.horizontal, Design.Space.m)
        .padding(.vertical, Design.Space.s)
        .fixedSize()
        .readerAppearance(dark: session.effectiveTheme.isDark)
    }

    /// A glyph in a tinted circle the size of a colour swatch: Underline and Remove.
    private func circled(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(Design.Fonts.menuIcon)
            .frame(width: 24, height: 24)
            .background(Color.primary.opacity(0.06), in: Circle())
    }

    private func apply(_ color: HighlightColor) {
        if let existing { session.recolor(existing.id, color); session.tappedHighlight = nil } else { session.highlightSelection(color: color) }
    }

    private func copy(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }
}

/// One action of the highlight menu: an icon over a word, lit while the pointer is over it.
struct MenuAction: View {
    let title: String
    let symbol: String
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            VStack(spacing: Design.Space.xxs) {
                Image(systemName: symbol).font(Design.Fonts.menuIcon).frame(height: 18)
                Text(title).font(Design.Fonts.meta).lineLimit(1)
            }
            .fixedSize()
            .frame(minWidth: 60)
            .padding(.vertical, Design.Space.xs)
            .padding(.horizontal, Design.Space.s)
            .background(hovering ? Color.primary.opacity(0.08) : Color.clear, in: Design.rounded(Design.Radius.control))
            .contentShape(Design.rounded(Design.Radius.control))
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .animation(Design.Motion.quick, value: hovering)
    }
}

/// The sheet for a highlight's note: the words it is on, the note in a text field, and Save once it has changed.
struct NoteEditor: View {
    @Bindable var session: ReaderSession
    let annotation: Annotation
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""

    var body: some View {
        VStack(alignment: .leading, spacing: Design.Space.m) {
            Text(annotation.note.isEmpty ? "Add Note" : "Edit Note").font(Design.Fonts.cardTitle)
            HStack(alignment: .top, spacing: Design.Space.s) {
                Capsule().fill(HighlightSwatch.color(annotation.color ?? .yellow)).frame(width: 4)
                Text(annotation.text).lineLimit(4).foregroundStyle(.secondary)
            }
            TextEditor(text: $note)
                .font(.body)
                .scrollContentBackground(.hidden)
                .padding(Design.Space.xs)
                .frame(minHeight: 140)
                .background(Color(nsColor: .textBackgroundColor), in: Design.rounded(Design.Radius.control))
                .overlay(Design.rounded(Design.Radius.control).strokeBorder(.separator, lineWidth: Design.Stroke.hairline))
            HStack(spacing: Design.Space.m) {
                Button(annotation.color == .underline ? "Remove Underline" : "Remove Highlight", role: .destructive) {
                    session.removeAnnotation(annotation.id)
                    dismiss()
                }
                Spacer()
                Button("Cancel") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button("Save") {
                    session.setNote(note, for: annotation.id)
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
                .disabled(note == annotation.note)
            }
        }
        .padding(Design.Space.xl)
        .frame(width: 420)
        .readerAppearance(dark: session.effectiveTheme.isDark)
        .onAppear { note = annotation.note }
    }
}

/// Shown when the last page is turned past.
struct EndCard: View {
    @Bindable var session: ReaderSession

    var body: some View {
        ZStack {
            Color.black.opacity(0.18).ignoresSafeArea().onTapGesture { session.showEndCard = false }
            VStack(spacing: Design.Space.m) {
                Image(systemName: "checkmark.seal.fill").font(.system(size: 40)).foregroundStyle(Color.accentColor)
                Text("You’ve finished").font(.title3).foregroundStyle(.secondary)
                Text(session.book.title).font(.title2.weight(.semibold)).multilineTextAlignment(.center)
                Text(session.book.author).foregroundStyle(.secondary)
                HStack(spacing: Design.Space.m) {
                    Button("Keep Reading") { session.showEndCard = false }
                        .keyboardShortcut(.cancelAction)
                    Button("Back to Library") { session.close() }
                        .keyboardShortcut(.defaultAction)
                }
                .controlSize(.large)
                .padding(.top, Design.Space.s)
            }
            .padding(Design.Space.xxxl)
            .frame(width: 380)
            .glassRounded(Design.Radius.card)
        }
        .transition(.opacity)
    }
}
