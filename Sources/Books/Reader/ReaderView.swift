import AppKit
import Combine
import SwiftUI
import WebKit
import BooksCore

/// The reader takes the library's place in the window: the book, a toolbar (Library, Contents · Appearance,
/// Search, Bookmark), and a footer with the chapter, page numbers and the timeline that appears when the pointer
/// comes near it. In full screen the window's toolbar is hidden — the menu bar and the window's buttons come down
/// alone when the pointer touches the top edge — and the reader's bar floats over the book instead, appearing
/// while the pointer is near the top.
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
    /// The height of the page under the toolbar, which bounds the popovers.
    @State private var pageHeight: CGFloat = 0

    /// Room kept under a popover, for its arrow and a margin above the page numbers; the part of the toolbar under a
    /// button, where the popovers hang from out of full screen; and the least height a popover is given.
    private static let popoverMargin: CGFloat = 40
    private static let toolbarAllowance: CGFloat = 24
    private static let popoverMinHeight: CGFloat = 240

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // The page's colour runs up under the toolbar, so the window reads as one page as in Books.
                Color(hex: session.effectiveTheme.colors.background)
                    .ignoresSafeArea()
                if session.usesPDFView {
                    PDFReaderView(session: session)
                } else {
                    ReaderWebViewRepresentable(session: session)
                }
                VStack(spacing: 0) {
                    Spacer()
                    footer(width: geo.size.width)
                }
                if session.preparing {
                    ProgressView(session.pdfLayout == .fit ? "Preparing the pages…" : "Preparing the text…")
                        .controlSize(.large)
                        .padding(Design.Space.xxxl)
                        .glassRounded(Design.Radius.card)
                        .transition(.opacity)
                }
                if session.showEndCard { EndCard(session: session) }
                if session.isFullScreen {
                    VStack {
                        if session.topBarVisible {
                            ReaderTopBar(session: session, popoverMaxHeight: popoverMaxHeight)
                                .transition(.move(edge: .top).combined(with: .opacity))
                        }
                        Spacer()
                    }
                    .animation(Design.Motion.standard, value: session.topBarVisible)
                }
            }
            .animation(Design.Motion.standard, value: session.preparing)
            .animation(Design.Motion.standard, value: session.showEndCard)
            .onChange(of: geo.size.height, initial: true) { _, height in
                pageHeight = height
                session.viewResized(height: height)
            }
        }
        .readerAppearance(dark: session.effectiveTheme.isDark, window: true)
        .navigationTitle(session.book.title)
        .navigationSubtitle(session.position.chapter)
        .toolbar(session.isFullScreen ? .hidden : .visible, for: .windowToolbar)
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

    /// The tallest a popover may be: the page under the bar it opens from, less room for its arrow and a margin, so it
    /// opens downwards whole instead of being pushed beside its button or off the screen in a short window.
    private var popoverMaxHeight: CGFloat {
        let bar = session.isFullScreen ? ReaderTopBar.reach : ReaderContent.toolbarAllowance
        return max(ReaderContent.popoverMinHeight, pageHeight - bar - ReaderContent.popoverMargin)
    }

    /// The popovers belong to the toolbar out of full screen and to the floating bar in it; the other set stays shut.
    private func gated(_ binding: Binding<Bool>, _ active: Bool) -> Binding<Bool> {
        Binding(get: { active && binding.wrappedValue }, set: { binding.wrappedValue = $0 })
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .navigation) {
            Button { session.close() } label: { Label("Library", systemImage: "chevron.left") }
                .labelStyle(.titleAndIcon)
                .help(ReaderHelp.library)
            Button { session.showContents.toggle() } label: { Label("Contents", systemImage: "list.bullet") }
                .help(ReaderHelp.contents)
                .popover(isPresented: gated($session.showContents, !session.isFullScreen), arrowEdge: .bottom) { ContentsPopover(session: session, maxHeight: popoverMaxHeight) }
        }
        ToolbarItemGroup(placement: .primaryAction) {
            Button { session.showAppearance.toggle() } label: { Label("Appearance", systemImage: "textformat.size") }
                .help(ReaderHelp.appearance)
                .popover(isPresented: gated($session.showAppearance, !session.isFullScreen), arrowEdge: .bottom) { AppearancePopover(session: session, maxHeight: popoverMaxHeight) }
            Button { session.showSearch.toggle() } label: { Label("Search", systemImage: "magnifyingglass") }
                .help(ReaderHelp.search)
                .popover(isPresented: gated($session.showSearch, !session.isFullScreen), arrowEdge: .bottom) { SearchPopover(session: session, maxHeight: popoverMaxHeight) }
            Button { session.toggleBookmark() } label: {
                Label { Text("Bookmark") } icon: { BookmarkGlyph(on: session.isBookmarked) }
            }
            .disabled(!session.isOpen)
            .help(ReaderHelp.bookmark(session.isBookmarked))
        }
    }

    /// ← and → are the Book menu's shortcuts for turning pages, and a menu's shortcuts come before the key window's
    /// first responder: while a note or the search field is being typed in, they move the caret instead.
    private var actions: ReaderActions {
        ReaderActions(
            nextPage: {
                if let text = NSApp.keyWindow?.firstResponder as? NSTextView { text.moveRight(nil) } else { session.next() }
            },
            previousPage: {
                if let text = NSApp.keyWindow?.firstResponder as? NSTextView { text.moveLeft(nil) } else { session.previous() }
            },
            nextChapter: { session.nextChapter() }, previousChapter: { session.previousChapter() },
            toggleBookmark: { session.toggleBookmark() },
            showContents: { session.showContents = true }, showSearch: { session.showSearch = true }, showAppearance: { session.showAppearance = true },
            biggerText: { session.changeFontSize(by: 10) }, smallerText: { session.changeFontSize(by: -10) },
            backToLibrary: { session.close() },
            isBookmarked: session.isBookmarked,
            actualSize: session.usesPDFView ? nil : { () -> Void in session.changeFontSize(by: 100 - model.settings.reader.fontSize) }
        )
    }

    // MARK: - Footer

    /// The page numbers sit on the page's centre whatever the texts either side of them say, in the theme's own
    /// secondary colour; the timeline floats above them while the pointer is near.
    private func footer(width: CGFloat) -> some View {
        let settings = model.settings.reader
        return VStack(spacing: Design.Space.s) {
            if session.timelineVisible, session.isOpen {
                Timeline(session: session)
                    .frame(maxWidth: min(760, width * 0.72))
                    .padding(.horizontal, Design.Space.l)
                    .padding(.vertical, Design.Space.s)
                    .glassCapsule()
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
            if session.footerVisible, session.isOpen, settings.showPageNumbers {
                HStack(spacing: Design.Space.l) {
                    // Out of full screen the window's subtitle already names the chapter.
                    Text(session.isFullScreen ? session.position.chapter : "")
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(pageText)
                        .monospacedDigit()
                        .fixedSize()
                    Text(settings.showChapterProgress ? leftText : "")
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                .font(.subheadline)
                .foregroundStyle(Color(hex: session.effectiveTheme.footerText))
                .padding(.horizontal, Design.Space.xxl)
                .allowsHitTesting(false)
            }
        }
        .padding(.bottom, Design.Space.m)
        .glassGroup(spacing: Design.Space.xs)
        .animation(Design.Motion.standard, value: session.timelineVisible)
        .animation(Design.Motion.standard, value: session.footerVisible)
    }

    private var pageText: String {
        let p = session.position
        if let label = session.pdfPageLabel { return label }
        if session.layout.mode == .scroll, !session.usesPDFView { return "\(whole(p.percent.rounded()))%" }
        let total = whole(p.total), page = whole(p.page) + 1
        if session.layout.columns == 2, page < total { return "Pages \(page)–\(page + 1) of \(total)" }
        return "Page \(page) of \(total)"
    }

    private var leftText: String {
        guard session.layout.mode == .paginated, !session.position.chapter.isEmpty else { return "" }
        let n = session.position.pagesLeftInChapter
        return n <= 0 ? "Last page in chapter" : Format.plural(n, "page") + " left in chapter"
    }

}

/// Full screen's bar over the book: the toolbar's buttons and the title in a capsule that floats under the top
/// edge while the pointer is near it, without the menu bar. It has the toolbar's type, glyphs and tooltips, and the
/// insets of the timeline's capsule at the foot of the page.
struct ReaderTopBar: View {
    @Bindable var session: ReaderSession
    /// The tallest its popovers may be.
    var popoverMaxHeight: CGFloat = 640

    /// Every button is at least this big, so the pointer finds it without having to land on the glyph itself.
    private static let hitSize: CGFloat = 28
    /// How far down the window the bar reaches: its margin from the top edge, and the buttons with the bar's insets.
    static var reach: CGFloat { Design.Space.m + hitSize + 2 * Design.Space.s }
    /// The room the centred title leaves on either side for the buttons.
    private static let titleInset: CGFloat = 128

    private func gated(_ binding: Binding<Bool>) -> Binding<Bool> {
        Binding(get: { session.isFullScreen && binding.wrappedValue }, set: { binding.wrappedValue = $0 })
    }

    var body: some View {
        HStack(spacing: Design.Space.s) {
            Button { session.close() } label: {
                Label("Library", systemImage: "chevron.left")
                    .labelStyle(.titleAndIcon)
                    .frame(height: ReaderTopBar.hitSize)
                    .contentShape(Rectangle())
            }
            .help(ReaderHelp.library)
            Button { session.showContents.toggle() } label: { icon("list.bullet", "Contents") }
                .help(ReaderHelp.contents)
                .popover(isPresented: gated($session.showContents), arrowEdge: .bottom) { ContentsPopover(session: session, maxHeight: popoverMaxHeight) }
            Spacer(minLength: Design.Space.xl)
            Button { session.showAppearance.toggle() } label: { icon("textformat.size", "Appearance") }
                .help(ReaderHelp.appearance)
                .popover(isPresented: gated($session.showAppearance), arrowEdge: .bottom) { AppearancePopover(session: session, maxHeight: popoverMaxHeight) }
            Button { session.showSearch.toggle() } label: { icon("magnifyingglass", "Search") }
                .help(ReaderHelp.search)
                .popover(isPresented: gated($session.showSearch), arrowEdge: .bottom) { SearchPopover(session: session, maxHeight: popoverMaxHeight) }
            Button { session.toggleBookmark() } label: {
                Label { Text("Bookmark") } icon: { BookmarkGlyph(on: session.isBookmarked) }
                    .labelStyle(.iconOnly)
                    .frame(width: ReaderTopBar.hitSize, height: ReaderTopBar.hitSize)
                    .contentShape(Rectangle())
            }
            .disabled(!session.isOpen)
            .help(ReaderHelp.bookmark(session.isBookmarked))
        }
        .buttonStyle(.borderless)
        .imageScale(.large)
        .overlay {
            // The title sits on the bar's centre, whatever the widths of the groups either side, and never over them.
            VStack(spacing: 0) {
                Text(session.book.title).font(.headline).lineLimit(1)
                if !session.position.chapter.isEmpty {
                    Text(session.position.chapter).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            .frame(maxWidth: 420)
            .padding(.horizontal, ReaderTopBar.titleInset)
            .allowsHitTesting(false)
        }
        .padding(.horizontal, Design.Space.l)
        .padding(.vertical, Design.Space.s)
        .glassCapsule()
        .shadow(Design.Shadow.raised)
        .frame(maxWidth: 980)
        .padding(.top, Design.Space.m)
        .padding(.horizontal, Design.Space.l)
        .onHover { session.topBarHover($0) }
    }

    /// An icon-only button's label: the glyph in a square the size of the bar's other buttons.
    private func icon(_ symbol: String, _ title: String) -> some View {
        Label(title, systemImage: symbol)
            .labelStyle(.iconOnly)
            .frame(width: ReaderTopBar.hitSize, height: ReaderTopBar.hitSize)
            .contentShape(Rectangle())
    }
}

/// The tooltips of the reader's buttons, the same in the toolbar and in full screen's bar, each with its shortcut.
private enum ReaderHelp {
    static let library = "Back to the library (⇧⌘L)"
    static let contents = "Table of contents, bookmarks and notes (⌥⌘T)"
    static let appearance = "Themes, fonts and layout (⇧⌘A)"
    static let search = "Search this book (⌘F)"
    static func bookmark(_ on: Bool) -> String { on ? "Remove bookmark (⌘D)" : "Add bookmark (⌘D)" }
}

/// The bookmark button's glyph: an outline, or filled in the bookmark red once the page is marked.
private struct BookmarkGlyph: View {
    let on: Bool

    var body: some View {
        if on {
            Image(systemName: "bookmark.fill").foregroundStyle(HighlightSwatch.bookmark)
        } else {
            Image(systemName: "bookmark")
        }
    }
}

extension Theme {
    /// The footer's colour on this theme's page (the chapter, the page numbers, the pages left), at 5:1 or better
    /// against `colors.background`: small text needs 4.5:1, which the text colour at partial opacity missed on Paper.
    var footerText: String {
        switch self {
        case .original, .bold: return "#6e6e73"
        case .quiet: return "#b4b4b8"
        case .paper: return "#7a6450"
        case .calm: return "#b3a48c"
        case .focus: return "#98989d"
        }
    }
}

extension View {
    /// Dresses the window this view is in — the reading window, or a popover, the highlight menu or the note editor
    /// opened from it — to match the page: dark with a dark theme, as Books does, and in the system's look with a
    /// light one. SwiftUI is told through the preferred colour scheme, which it applies to the window or popover the
    /// view is in. The window's own appearance is set as well, once each time the theme turns dark or light and after
    /// SwiftUI's update rather than inside it, and never again in answer to a change of the window's look: setting it
    /// on every update fought SwiftUI's own setting and hung the app. `window` marks the reading window itself, whose
    /// toolbar also loses its separator.
    func readerAppearance(dark: Bool, window: Bool = false) -> some View {
        preferredColorScheme(dark ? .dark : nil)
            .background { ReaderWindowAppearance(dark: dark, readingWindow: window) }
    }
}

/// Sets the appearance of the window it is in when the theme turns dark or light: dark aqua for a dark theme, nil —
/// the app's, which is the system's unless the app sets its own — for a light one, and nil again when it goes. For
/// the reading window it also takes away the separator AppKit draws under the toolbar over a PDF's scroll view, so
/// the page runs up under the toolbar as a book's does, and puts the window's own style back when the reader closes.
private struct ReaderWindowAppearance: NSViewRepresentable {
    let dark: Bool
    let readingWindow: Bool

    func makeNSView(context: Context) -> AppearanceSetter {
        let setter = AppearanceSetter()
        setter.readingWindow = readingWindow
        setter.dark = dark
        return setter
    }

    func updateNSView(_ nsView: AppearanceSetter, context: Context) {
        nsView.readingWindow = readingWindow
        nsView.dark = dark
    }

    static func dismantleNSView(_ nsView: AppearanceSetter, coordinator: ()) { nsView.giveBack() }

    final class AppearanceSetter: NSView {
        /// The setter that last dressed each window, so a reader going away cannot undo the look of the one that
        /// replaced it (a PDF reopened another way).
        private static var owners: [ObjectIdentifier: ObjectIdentifier] = [:]
        /// Each dressed window's separator style from before the reader, to put back when it closes.
        private static var separators: [ObjectIdentifier: NSTitlebarSeparatorStyle] = [:]
        private weak var host: NSWindow?

        var readingWindow = false

        /// Changes only when the theme turns dark or light. An update with the same value does nothing, whatever the
        /// window shows: the setter never answers a change it did not ask for, so it cannot fight SwiftUI.
        var dark = false {
            didSet { if dark != oldValue { scheduleApply() } }
        }
        private var applyPending = false

        override func hitTest(_ point: NSPoint) -> NSView? { nil }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            guard window !== host else { return }
            giveBack()
            host = window
            scheduleApply()
        }

        /// Hands the window back to the system's look, unless another reader has dressed it since.
        func giveBack() {
            if let host, AppearanceSetter.owners[ObjectIdentifier(host)] == ObjectIdentifier(self) {
                let id = ObjectIdentifier(host)
                AppearanceSetter.owners[id] = nil
                host.appearance = nil
                if let separator = AppearanceSetter.separators.removeValue(forKey: id) {
                    host.titlebarSeparatorStyle = separator
                }
                // SwiftUI lets the reader's preferred colour scheme go in the same update, and may put back a look of
                // its own as it does: once it has, a window no reader has dressed since is given back again.
                let window = host
                DispatchQueue.main.async { [weak window] in AppearanceSetter.release(window) }
                Task { @MainActor [weak window] in
                    try? await Task.sleep(nanoseconds: 400_000_000)
                    AppearanceSetter.release(window)
                }
            }
            host = nil
        }

        /// The system's look for a window that no setter dresses any more.
        private static func release(_ window: NSWindow?) {
            guard let window, owners[ObjectIdentifier(window)] == nil, window.appearance != nil else { return }
            window.appearance = nil
        }

        /// Applies on the next turn of the main queue, after the SwiftUI update that asked for it: setting a window's
        /// appearance inside the update makes SwiftUI update again at once. Several requests in one turn apply once.
        private func scheduleApply() {
            guard !applyPending else { return }
            applyPending = true
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.applyPending = false
                self.apply()
            }
        }

        private func apply() {
            guard let host, host === window else { return }
            let id = ObjectIdentifier(host)
            AppearanceSetter.owners[id] = ObjectIdentifier(self)
            let appearance: NSAppearance? = dark ? NSAppearance(named: .darkAqua) : nil
            if host.appearance?.name != appearance?.name { host.appearance = appearance }
            if readingWindow {
                if AppearanceSetter.separators[id] == nil { AppearanceSetter.separators[id] = host.titlebarSeparatorStyle }
                host.titlebarSeparatorStyle = .none
            }
        }
    }
}

private extension View {
    /// On macOS 26 the timeline's capsule and the page label over it are one Liquid Glass group rather than glass
    /// stacked on glass; earlier systems draw their materials as they are.
    @ViewBuilder
    func glassGroup(spacing: CGFloat) -> some View {
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            GlassEffectContainer(spacing: spacing) { self }
        } else {
            self
        }
        #else
        self
        #endif
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
