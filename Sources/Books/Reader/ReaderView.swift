import AppKit
import Combine
import SwiftUI
import WebKit
import BooksCore

/// The reader takes the library's place in the window: the book, a toolbar (Library, Contents · Appearance,
/// Search, Bookmark), and a footer with the chapter, page numbers and the timeline that appears when the pointer
/// comes near it.
struct ReaderView: View {
    @Environment(LibraryModel.self) private var model
    let book: Book
    @State private var session: ReaderSession?

    var body: some View {
        Group {
            if let session {
                ReaderContent(session: session)
            } else {
                Color.clear
            }
        }
        .onAppear {
            if session == nil {
                let s = ReaderSession(book: book, model: model)
                session = s
                SelfTest.currentSession = s
            }
        }
        .onDisappear {
            session?.teardown()
            session = nil
        }
    }
}

struct ReaderContent: View {
    @Bindable var session: ReaderSession
    @Environment(LibraryModel.self) private var model

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color(hex: session.effectiveTheme.colors.background)
                if session.book.kind == .pdf {
                    PDFReaderView(session: session)
                } else {
                    ReaderWebViewRepresentable(session: session)
                }
                VStack(spacing: 0) {
                    Spacer()
                    footer(width: geo.size.width)
                }
                anchors
                if session.showEndCard { EndCard(session: session) }
            }
            .onChange(of: geo.size.height, initial: true) { _, height in session.viewResized(height: height) }
        }
        .navigationTitle(session.book.title)
        .navigationSubtitle(session.position.chapter)
        .toolbar { toolbar }
        .focusedSceneValue(\.readerActions, actions)
        .sheet(item: $session.editingNote) { annotation in NoteEditor(session: session, annotation: annotation) }
        .alert("Books", isPresented: Binding(get: { session.error != nil }, set: { if !$0 { session.error = nil } }), presenting: session.error) { _ in
            Button("OK") {}
        } message: { message in
            Text(message)
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didEnterFullScreenNotification)) { _ in
            session.isFullScreen = true
            session.refreshChrome()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didExitFullScreenNotification)) { _ in
            session.isFullScreen = false
            session.refreshChrome()
        }
        .onAppear {
            session.isFullScreen = NSApp.keyWindow?.styleMask.contains(.fullScreen) ?? false
            session.refreshChrome()
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .navigation) {
            Button { session.close() } label: { Label("Library", systemImage: "chevron.left") }
                .labelStyle(.titleAndIcon)
                .help("Back to the library (⇧⌘L)")
            Button { session.showContents.toggle() } label: { Label("Contents", systemImage: "list.bullet") }
                .help("Table of contents, bookmarks and notes")
                .popover(isPresented: $session.showContents, arrowEdge: .bottom) { ContentsPopover(session: session) }
        }
        ToolbarItemGroup(placement: .primaryAction) {
            Button { session.showAppearance.toggle() } label: { Label("Appearance", systemImage: "textformat.size") }
                .help("Themes, fonts and layout")
                .popover(isPresented: $session.showAppearance, arrowEdge: .bottom) { AppearancePopover(session: session) }
            Button { session.showSearch.toggle() } label: { Label("Search", systemImage: "magnifyingglass") }
                .help("Search this book (⌘F)")
                .popover(isPresented: $session.showSearch, arrowEdge: .bottom) { SearchPopover(session: session) }
            Button { session.toggleBookmark() } label: { Label("Bookmark", systemImage: session.isBookmarked ? "bookmark.fill" : "bookmark") }
                .disabled(!session.isOpen)
                .help(session.isBookmarked ? "Remove bookmark (⌘D)" : "Add bookmark (⌘D)")
        }
    }

    private var actions: ReaderActions {
        ReaderActions(
            nextPage: { session.next() }, previousPage: { session.previous() },
            nextChapter: { session.nextChapter() }, previousChapter: { session.previousChapter() },
            toggleBookmark: { session.toggleBookmark() },
            showContents: { session.showContents = true }, showSearch: { session.showSearch = true }, showAppearance: { session.showAppearance = true },
            biggerText: { session.changeFontSize(by: 10) }, smallerText: { session.changeFontSize(by: -10) },
            backToLibrary: { session.close() }
        )
    }

    // MARK: - Footer

    private func footer(width: CGFloat) -> some View {
        let settings = model.settings.reader
        return VStack(spacing: 10) {
            if session.timelineVisible, session.isOpen {
                Timeline(session: session)
                    .frame(maxWidth: min(760, width * 0.72))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .glassCapsule()
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
            if session.footerVisible, session.isOpen, settings.showPageNumbers {
                HStack {
                    Text(session.position.chapter).lineLimit(1)
                    Spacer()
                    Text(pageText).monospacedDigit()
                    Spacer()
                    Text(settings.showChapterProgress ? leftText : "").lineLimit(1)
                }
                .font(.caption)
                .foregroundStyle(Color(hex: session.effectiveTheme.colors.text).opacity(0.55))
                .padding(.horizontal, 24)
                .allowsHitTesting(false)
            }
        }
        .padding(.bottom, 10)
        .animation(.easeInOut(duration: 0.18), value: session.timelineVisible)
        .animation(.easeInOut(duration: 0.18), value: session.footerVisible)
    }

    private var pageText: String {
        let p = session.position
        if session.layout.mode == .scroll, session.book.kind == .epub { return "\(whole(p.percent.rounded()))%" }
        let total = whole(p.total), page = whole(p.page) + 1
        if session.layout.columns == 2, page < total { return "Pages \(page)–\(page + 1) of \(total)" }
        return "Page \(page) of \(total)"
    }

    private var leftText: String {
        guard session.layout.mode == .paginated, !session.position.chapter.isEmpty else { return "" }
        let n = session.position.pagesLeftInChapter
        return n <= 0 ? "Last page in this chapter" : Format.plural(n, "page") + " left in this chapter"
    }

    // MARK: - Popover anchors over the text

    @ViewBuilder
    private var anchors: some View {
        if let sel = session.selection {
            Color.clear
                .frame(width: max(sel.rect.width, 2), height: max(sel.rect.height, 2))
                .position(x: sel.rect.midX, y: sel.rect.midY)
                .popover(isPresented: Binding(get: { session.selection != nil }, set: { if !$0 { session.clearSelection() } }), arrowEdge: .top) {
                    HighlightMenu(session: session, existing: nil)
                }
        }
        if let tapped = session.tappedHighlight {
            Color.clear
                .frame(width: max(tapped.rect.width, 2), height: max(tapped.rect.height, 2))
                .position(x: tapped.rect.midX, y: tapped.rect.midY)
                .popover(isPresented: Binding(get: { session.tappedHighlight != nil }, set: { if !$0 { session.tappedHighlight = nil } }), arrowEdge: .top) {
                    HighlightMenu(session: session, existing: tapped.annotation)
                }
        }
    }
}

/// Hosts the session's web view.
struct ReaderWebViewRepresentable: NSViewRepresentable {
    let session: ReaderSession

    func makeNSView(context: Context) -> ReaderWebView {
        let view = session.webView
        DispatchQueue.main.async { view.window?.makeFirstResponder(view) }
        return view
    }

    func updateNSView(_ nsView: ReaderWebView, context: Context) {}
}

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        var value: UInt64 = 0
        Scanner(string: s).scanHexInt64(&value)
        let r = Double((value >> 16) & 0xFF) / 255, g = Double((value >> 8) & 0xFF) / 255, b = Double(value & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }
}
