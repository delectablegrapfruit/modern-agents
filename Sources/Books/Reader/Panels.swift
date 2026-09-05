import AppKit
import SwiftUI
import BooksCore

/// Contents · Bookmarks · Notes, behind the toolbar's list button.
struct ContentsPopover: View {
    @Bindable var session: ReaderSession
    @State private var tab = 0

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) {
                Text("Contents").tag(0)
                Text("Bookmarks").tag(1)
                Text("Notes").tag(2)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(12)
            Divider()
            switch tab {
            case 0: contents
            case 1: bookmarks
            default: notes
            }
        }
        .frame(width: 340, height: 440)
    }

    private var contents: some View {
        List {
            if session.toc.isEmpty {
                Text("This book has no table of contents.").foregroundStyle(.secondary)
            }
            ForEach(session.toc) { item in
                Button {
                    session.open(item)
                    session.showContents = false
                } label: {
                    HStack {
                        Text(item.label)
                            .lineLimit(2)
                            .fontWeight(item.label == session.position.chapter ? .semibold : .regular)
                        Spacer()
                        if session.usesPDFView || (item.pos > 0 && session.layout.mode == .paginated) {
                            Text("\(session.usesPDFView ? item.spine + 1 : whole(item.pos) + 1)").font(.caption).foregroundStyle(.tertiary).monospacedDigit()
                        }
                    }
                    .padding(.leading, CGFloat(min(item.level, 3)) * 16)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .listStyle(.plain)
    }

    private var bookmarks: some View {
        List {
            if session.bookmarks.isEmpty {
                Text("No bookmarks yet. Press ⌘D on a page to keep your place.").foregroundStyle(.secondary)
            }
            ForEach(session.bookmarks) { mark in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Button {
                        session.goToLocator(mark.locator)
                        session.showContents = false
                    } label: {
                        HStack(alignment: .firstTextBaseline) {
                            Image(systemName: "bookmark.fill").foregroundStyle(Color.accentColor)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(mark.chapter.isEmpty ? (session.book.kind == .pdf ? "Page \(mark.locator.spine + 1)" : "Bookmark") : mark.chapter).lineLimit(1)
                                Text(mark.createdAt.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
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

    private var notes: some View {
        List {
            if session.highlights.isEmpty {
                Text("Select text in the book to highlight it or add a note.").foregroundStyle(.secondary)
            }
            ForEach(session.highlights) { h in
                HStack(alignment: .top, spacing: 8) {
                    Button {
                        session.goToLocator(h.locator)
                        session.showContents = false
                    } label: {
                        HStack(alignment: .top, spacing: 10) {
                            RoundedRectangle(cornerRadius: 2).fill(HighlightSwatch.color(h.color ?? .yellow)).frame(width: 4)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(h.text).lineLimit(3)
                                if !h.note.isEmpty { Text(h.note).font(.callout).foregroundStyle(.secondary).lineLimit(3) }
                                Text(h.chapter).font(.caption).foregroundStyle(.tertiary).lineLimit(1)
                            }
                            Spacer()
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    removeButton(h.color == .underline ? "Remove underline" : "Remove highlight") { session.removeAnnotation(h.id) }
                }
                .contextMenu {
                    Button(h.note.isEmpty ? "Add Note…" : "Edit Note…") { session.editingNote = h; session.showContents = false }
                    Divider()
                    Button("Remove Highlight", role: .destructive) { session.removeAnnotation(h.id) }
                }
            }
        }
        .listStyle(.plain)
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

enum HighlightSwatch {
    static func color(_ c: HighlightColor) -> Color {
        switch c {
        case .yellow: return Color(red: 1.0, green: 0.85, blue: 0.24)
        case .green: return Color(red: 0.60, green: 0.86, blue: 0.45)
        case .blue: return Color(red: 0.55, green: 0.78, blue: 1.0)
        case .pink: return Color(red: 1.0, green: 0.62, blue: 0.75)
        case .purple: return Color(red: 0.78, green: 0.65, blue: 1.0)
        case .underline: return Color.red
        }
    }
}

/// Text size, themes, fonts, layout, wheel — everything Books offers under "Aa".
struct AppearancePopover: View {
    @Bindable var session: ReaderSession
    @Environment(LibraryModel.self) private var model

    var body: some View {
        @Bindable var model = model
        let pdfBook = session.book.kind == .pdf
        let pdfView = session.usesPDFView
        let fit = pdfView && model.settings.reader.pdfLayout == .fit
        let plainZoom = pdfView && !fit
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 0) {
                    Button { session.changeFontSize(by: -10) } label: { sizeLabel(plainZoom ? nil : 15, symbol: "minus.magnifyingglass") }
                    Divider().frame(height: 22)
                    Button { session.changeFontSize(by: 10) } label: { sizeLabel(plainZoom ? nil : 24, symbol: "plus.magnifyingglass") }
                }
                .buttonStyle(.plain)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                Text(plainZoom ? "Zoom" : fit ? (model.settings.reader.pdfZoom > 100 ? "Text size \(model.settings.reader.pdfZoom)% · pages in \(model.settings.reader.pdfZoom >= 300 ? "three" : "two") parts" : "Text size \(model.settings.reader.pdfZoom)%") : "Text size \(model.settings.reader.fontSize)%")
                    .font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .center)
                if pdfBook {
                    VStack(alignment: .leading, spacing: 6) {
                        Picker("PDF", selection: Binding(get: { model.settings.reader.pdfLayout }, set: { session.setPDFLayout($0) })) {
                            ForEach(PDFLayout.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        Text(pdfLayoutHelp).font(.caption).foregroundStyle(.secondary)
                    }
                }
                themes
                Divider()
                if !pdfView {
                    Picker("Font", selection: Binding(get: { model.settings.reader.font }, set: { model.settings.reader.font = $0; session.applySettings() })) {
                        ForEach(ReaderFont.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    Picker("Line Spacing", selection: Binding(get: { model.settings.reader.lineHeight }, set: { model.settings.reader.lineHeight = $0; session.applySettings() })) {
                        ForEach(LineHeight.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Picker("Text Width", selection: Binding(get: { model.settings.reader.textWidth }, set: { model.settings.reader.textWidth = $0; session.applySettings() })) {
                        ForEach(TextWidth.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Toggle("Justify text", isOn: Binding(get: { model.settings.reader.justify }, set: { model.settings.reader.justify = $0; session.applySettings() }))
                    Toggle("Hyphenation", isOn: Binding(get: { model.settings.reader.hyphenate }, set: { model.settings.reader.hyphenate = $0; session.applySettings() }))
                    Divider()
                    Picker("Layout", selection: Binding(get: { model.settings.reader.layout }, set: { model.settings.reader.layout = $0; session.applySettings() })) {
                        ForEach(ReaderLayout.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
                Picker("Pages", selection: Binding(get: { model.settings.reader.spread }, set: { model.settings.reader.spread = $0; session.applySettings() })) {
                    ForEach(Spread.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                .disabled(!pdfView && model.settings.reader.layout == .scroll)
                if !plainZoom {
                    Picker("Page Turn", selection: Binding(get: { model.settings.reader.pageTurn }, set: { model.settings.reader.pageTurn = $0; session.applySettings() })) {
                        ForEach(PageTurn.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .disabled(!pdfView && model.settings.reader.layout == .scroll)
                }
                DisclosureGroup("Scroll Wheel & Trackpad") {
                    Toggle("Scroll wheel turns pages", isOn: Binding(get: { model.settings.reader.wheelTurnsPages }, set: { model.settings.reader.wheelTurnsPages = $0; session.applySettings() }))
                    if !pdfView {
                        Picker("Trackpad sensitivity", selection: Binding(get: { model.settings.reader.wheelSensitivity }, set: { model.settings.reader.wheelSensitivity = $0; session.applySettings() })) {
                            ForEach(WheelSensitivity.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }
                    Toggle("Invert direction", isOn: Binding(get: { model.settings.reader.wheelInvert }, set: { model.settings.reader.wheelInvert = $0; session.applySettings() }))
                    Toggle("Horizontal wheel and ⇧ + wheel", isOn: Binding(get: { model.settings.reader.wheelHorizontal }, set: { model.settings.reader.wheelHorizontal = $0; session.applySettings() }))
                }
                .font(.callout)
                Toggle("Show page numbers", isOn: $model.settings.reader.showPageNumbers)
                Toggle("Show pages left in chapter", isOn: $model.settings.reader.showChapterProgress)
            }
            .padding(16)
        }
        .frame(width: 340)
        .frame(maxHeight: 640)
    }

    private var pdfLayoutHelp: String {
        switch model.settings.reader.pdfLayout {
        case .pages: return "Whole pages, as printed."
        case .fit: return "Pages cropped to their text (two text columns become two strips) and cut into screens that turn like pages, one or two at a time. 100% fills a screen; above it a page is read in two or three parts, side by side."
        case .text: return "The text reflowed into a book: fonts, sizes and themes apply; the layout is not kept."
        }
    }

    /// Both halves of the size control respond across their whole width, not only on the glyph.
    private func sizeLabel(_ fontSize: CGFloat?, symbol: String) -> some View {
        Group {
            if let fontSize { Text("A").font(.system(size: fontSize)) } else { Image(systemName: symbol) }
        }
        .frame(maxWidth: .infinity, minHeight: 34)
        .contentShape(Rectangle())
    }

    private var themes: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Themes").font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 10) {
                ForEach(Theme.allCases, id: \.self) { theme in
                    Button {
                        model.settings.reader.theme = theme
                        if theme.isDark != session.effectiveTheme.isDark { model.settings.reader.autoNight = false }
                        session.applySettings()
                    } label: {
                        Text("Aa")
                            .font(.system(size: 14, weight: theme == .bold ? .bold : .regular, design: .serif))
                            .foregroundStyle(Color(hex: theme.colors.text))
                            .frame(width: 42, height: 42)
                            .background(Color(hex: theme.colors.background), in: Circle())
                            .overlay(Circle().strokeBorder(model.settings.reader.theme == theme ? Color.accentColor : Color.primary.opacity(0.15), lineWidth: model.settings.reader.theme == theme ? 2.5 : 1))
                            .contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .help(theme.label)
                }
            }
            Toggle(isOn: Binding(get: { model.settings.reader.autoNight }, set: { model.settings.reader.autoNight = $0; session.applySettings() })) {
                Text("Auto-Night Theme")
                Text("Original in Light Mode, Focus in Dark Mode").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

/// Search this book: results grouped by chapter, click to go there.
struct SearchPopover: View {
    @Bindable var session: ReaderSession
    @State private var query = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Search in book", text: $query)
                    .textFieldStyle(.plain)
                    .focused($focused)
                    .onSubmit { session.search(query) }
                if !query.isEmpty {
                    Button { query = ""; session.search("") } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }.buttonStyle(.plain)
                }
            }
            .padding(10)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .padding(12)
            Divider()
            if session.searchResults.isEmpty {
                VStack {
                    Spacer()
                    if !session.searchDone { ProgressView().controlSize(.small) }
                    else if !session.searchQuery.isEmpty { Text("No matches for “\(session.searchQuery)”").foregroundStyle(.secondary) }
                    else { Text("Type a word or phrase and press Return.").foregroundStyle(.secondary) }
                    Spacer()
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
                                    Text(hit.excerpt).lineLimit(3).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .listStyle(.plain)
                Divider()
                Text("\(session.searchResults.count) \(session.searchResults.count == 1 ? "match" : "matches")" + (session.searchDone ? "" : "…"))
                    .font(.caption).foregroundStyle(.secondary).padding(8)
            }
        }
        .frame(width: 360, height: 440)
        .onAppear { query = session.searchQuery; focused = true }
    }

    private var chapters: [String] {
        var seen: [String] = []
        for hit in session.searchResults where !seen.contains(hit.chapter) { seen.append(hit.chapter) }
        return seen
    }
}

/// The menu that appears over selected text: colours, underline, note, copy, look up — and Remove for an
/// existing highlight.
struct HighlightMenu: View {
    @Bindable var session: ReaderSession
    let existing: Annotation?

    var body: some View {
        HStack(spacing: 10) {
            ForEach([HighlightColor.yellow, .green, .blue, .pink, .purple], id: \.self) { color in
                Button { apply(color) } label: {
                    Circle()
                        .fill(HighlightSwatch.color(color))
                        .frame(width: 22, height: 22)
                        .overlay(Circle().strokeBorder(.black.opacity(0.12), lineWidth: 0.5))
                        .overlay { if existing?.color == color { Image(systemName: "checkmark").font(.caption2.bold()).foregroundStyle(.black.opacity(0.7)) } }
                }
                .buttonStyle(.plain)
                .help(color.label)
            }
            Button { apply(.underline) } label: {
                Image(systemName: "underline").frame(width: 22, height: 22)
                    .overlay { if existing?.color == .underline { Circle().strokeBorder(Color.accentColor, lineWidth: 1.5) } }
            }
            .buttonStyle(.plain)
            .help("Underline")
            Divider().frame(height: 18)
            if let existing {
                Button(existing.note.isEmpty ? "Add Note" : "Edit Note") { session.tappedHighlight = nil; session.editingNote = existing }
                Button("Copy") { copy(existing.text) }
                Button("Remove") { session.removeAnnotation(existing.id) }
            } else if let sel = session.selection {
                Button("Add Note") { session.pendingNoteAfterHighlight = true; session.highlightSelection(color: .yellow) }
                Button("Copy") { copy(sel.text); session.clearSelection() }
                Button("Look Up") { session.lookUpSelection() }
                Button("Search") { session.searchQuery = sel.text; session.search(sel.text); session.clearSelection(); session.showSearch = true }
            }
        }
        .buttonStyle(.borderless)
        .controlSize(.small)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private func apply(_ color: HighlightColor) {
        if let existing { session.recolor(existing.id, color); session.tappedHighlight = nil } else { session.highlightSelection(color: color) }
    }

    private func copy(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }
}

struct NoteEditor: View {
    @Bindable var session: ReaderSession
    let annotation: Annotation
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                RoundedRectangle(cornerRadius: 2).fill(HighlightSwatch.color(annotation.color ?? .yellow)).frame(width: 4)
                Text(annotation.text).lineLimit(4).foregroundStyle(.secondary)
            }
            TextEditor(text: $note)
                .font(.body)
                .frame(minHeight: 140)
                .scrollContentBackground(.hidden)
                .padding(6)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            HStack {
                Button("Remove Highlight", role: .destructive) { session.removeAnnotation(annotation.id); dismiss() }
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Save") { session.setNote(note, for: annotation.id); dismiss() }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 420)
        .onAppear { note = annotation.note }
    }
}

/// Shown when the last page is turned past.
struct EndCard: View {
    @Bindable var session: ReaderSession

    var body: some View {
        ZStack {
            Color.black.opacity(0.18).ignoresSafeArea().onTapGesture { session.showEndCard = false }
            VStack(spacing: 14) {
                Image(systemName: "checkmark.seal.fill").font(.system(size: 40)).foregroundStyle(Color.accentColor)
                Text("You’ve finished").font(.title3).foregroundStyle(.secondary)
                Text(session.book.title).font(.title2.weight(.semibold)).multilineTextAlignment(.center)
                Text(session.book.author).foregroundStyle(.secondary)
                HStack {
                    Button("Keep Reading") { session.showEndCard = false }.keyboardShortcut(.cancelAction)
                    Button("Back to Library") { session.close() }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
                }
                .padding(.top, 8)
            }
            .padding(32)
            .frame(width: 380)
            .glassRounded(20)
        }
        .transition(.opacity)
    }
}
