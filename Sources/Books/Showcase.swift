import AppKit
import CoreGraphics
import WebKit
import BooksCore

/// `BOOKS_SHOWCASE=1 Books.app/Contents/MacOS/Books`: lays out a sample library in a scratch folder — fourteen
/// public-domain classics with covers of their own and a typeset PDF, four collections, books part read and
/// finished, five months of reading, goals, highlights and a note — then walks through the app and saves a
/// screenshot of each part of it for a feature showcase, as NN-name.png in `BOOKS_SHOWCASE_DIR` (build/showcase by
/// default). CI runs it on its macOS runner for a commit whose message holds [showcase]. Prints one line per step;
/// a shot that fails is logged and the others still taken; exits 0 with a summary line once every shot was tried.
enum Showcase {
    /// Whether this launch is the showcase.
    static var isRequested: Bool {
        guard let value = ProcessInfo.processInfo.environment["BOOKS_SHOWCASE"] else { return false }
        return !value.isEmpty && value != "0"
    }

    /// The whole run must fit in this; the CI step allows a little more.
    private static let timeLimit: Double = 360

    @MainActor private static var directory = URL(fileURLWithPath: "build/showcase", isDirectory: true)
    @MainActor private static var window: NSWindow?
    @MainActor private static var saved = 0
    @MainActor private static var failures: [String] = []
    /// The app's presentation options from before the showcase hid the Dock, given back at the end; nil until then.
    @MainActor private static var optionsBeforeHidingDock: NSApplication.PresentationOptions?

    @MainActor
    static func start(model: LibraryModel) {
        log("starting Books with a sample library")
        let limit = timeLimit
        // On a thread of its own, so a main thread that hangs is caught too, with where it hangs.
        HangWatchdog.start(label: "SHOWCASE", limit: limit)
        Task { @MainActor in await run(model: model) }
    }

    private static func log(_ message: String) {
        print("SHOWCASE: " + message)
        fflush(stdout)
    }

    private static func fail(_ message: String) -> Never {
        print("SHOWCASE FAIL: " + message)
        fflush(stdout)
        FileHandle.standardError.write(Data(("SHOWCASE FAIL: " + message + "\n").utf8))
        exit(1)
    }

    private struct Failure: Error, CustomStringConvertible {
        let description: String
        init(_ description: String) { self.description = description }
    }

    // MARK: - The run

    @MainActor
    private static func run(model: LibraryModel) async {
        if let path = ProcessInfo.processInfo.environment["BOOKS_SHOWCASE_DIR"], !path.isEmpty {
            directory = URL(fileURLWithPath: path, isDirectory: true)
        }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            fail("could not make \(directory.path): \(error)")
        }
        log("screenshots go to \(directory.path)")

        NSApp.appearance = NSAppearance(named: .aqua)
        NSApp.activate(ignoringOtherApps: true)
        guard let main = try? await waitFor("the window", timeout: 15, { mainWindow() }) else { fail("no window appeared") }
        window = main
        place(main)
        await bringForward(main, for: "the window")
        if hideDock() {
            // The Dock slides away and the screen's visible part grows by its height, so the window is placed again
            // to take it.
            await pause(0.8)
            place(main)
            await pause(0.3)
        }
        let screen = main.screen ?? NSScreen.main
        let permission = screenCaptureAllowed.map { $0 ? "granted" : "not granted" } ?? "unknown"
        let dock = optionsBeforeHidingDock != nil ? "hidden" : "not hidden"
        log("window \(describe(main.frame)) on a \(describe(screen?.frame ?? .zero)) screen at \(screen?.backingScaleFactor ?? 1)×, its visible part \(describe(screen?.visibleFrame ?? .zero)); Dock \(dock); screen recording \(permission); app \(NSApp.isActive ? "active" : "not active"), window \(main.isKeyWindow ? "key" : "not key")")

        let samples: Samples
        do {
            samples = try await makeLibrary(model: model)
        } catch {
            fail("the sample library could not be made: \(error)")
        }
        log("library: \(model.books.count) books, \(model.collections.count) collections, \(model.continueReading.count) being read, \(model.recentlyFinished.count) finished, \(model.stats.days.count) days of reading")
        tidy(model)

        // The library.
        await attempt("01-home") {
            model.sidebarSelection = .home
            try await capture("01-home", settle: 2.5)
        }
        tidy(model)
        await attempt("02-home-dark") {
            // More of Home's widgets, in Dark Mode.
            for element in [HomeElement.pickUpAgain, .progress, .calendar, .forYou, .recentlyFinished] { model.setHomeElement(element, shown: true) }
            NSApp.appearance = NSAppearance(named: .darkAqua)
            try await capture("02-home-dark", settle: 2.2)
        }
        NSApp.appearance = NSAppearance(named: .aqua)
        tidy(model)
        await attempt("03-home-edit") {
            model.editingHome = true
            try await capture("03-home-edit", settle: 2)
        }
        tidy(model)
        await attempt("04-all-books") {
            model.setShelfView(.grid, for: .all)
            model.setShelfGrouping(.collection, for: .all)
            model.sidebarSelection = .all
            try await capture("04-all-books", settle: 2)
        }
        tidy(model)
        await attempt("05-collection-list") {
            guard let classics = samples.collections["Classics"] else { throw Failure("the Classics collection is missing") }
            model.setShelfView(.list, for: .collection(classics))
            model.sidebarSelection = .collection(classics)
            try await capture("05-collection-list", settle: 1.8)
        }
        tidy(model)
        let gridScale = model.settings.gridScale
        await attempt("06-shelf-by-genre") {
            // The whole library genre by genre, its covers smaller so that the first two groups show whole; then All
            // goes back to its collections, and the covers to their size.
            model.setShelfView(.grid, for: .all)
            model.setShelfGrouping(.genre, for: .all)
            setGridScale(0.7, model)
            model.sidebarSelection = .all
            try await capture("06-shelf-by-genre", settle: 2)
        }
        model.setShelfGrouping(.collection, for: .all)
        setGridScale(gridScale, model)
        tidy(model)
        await attempt("07-covers-monochrome") {
            setCovers(.monochrome, model)
            model.sidebarSelection = .all
            try await capture("07-covers-monochrome", settle: 2)
        }
        tidy(model)
        await attempt("08-covers-text-only") {
            // The same shelf as 04 and 07, so the three looks compare cover for cover.
            setCovers(.textOnly, model)
            model.sidebarSelection = .all
            try await capture("08-covers-text-only", settle: 2)
        }
        setCovers(.color, model)
        tidy(model)
        await attempt("09-get-info") {
            // Custom placement, so the sheet shows the cover editor.
            guard let id = samples.books["dorian"], var book = model.book(id) else { throw Failure("The Picture of Dorian Gray is missing") }
            book.coverStyle = CoverStyle(fit: .custom, frame: CoverFrame(x: -0.08, y: -0.08, width: 1.16, height: 1.16))
            model.update(book)
            model.sidebarSelection = .all
            await pause(1)
            model.selectedBookIDs = [id]
            model.infoBook = model.book(id)
            try await capture("09-get-info", settle: 1.8)
        }
        tidy(model)
        if let id = samples.books["dorian"], var book = model.book(id) {
            book.coverStyle = nil
            model.update(book)
        }
        await pause(0.6)
        await attempt("10-reading-goals") {
            model.sidebarSelection = .home
            await pause(1)
            model.editingGoals = true
            try await capture("10-reading-goals", settle: 1.6)
        }
        tidy(model)
        await pause(0.8)

        // The reader, a PDF, and the settings.
        if let id = samples.books["pride"] { await readerShots(model: model, book: id) } else { missed("11-reader", Failure("Pride and Prejudice is missing")) }
        tidy(model)
        if let id = samples.books["essays"] { await pdfShots(model: model, book: id) } else { missed("15-pdf-pages", Failure("the sample PDF is missing")) }
        tidy(model)
        model.sidebarSelection = .home
        // Settings' General tab draws its covers with the book last opened, the PDF by now: Pride and Prejudice is
        // opened and closed again, its place kept, so that its cover is the one shown.
        if let id = samples.books["pride"] { await openBriefly(model: model, book: id) }
        await settingsShots(model: model)

        // Home once more, with two widgets at their large size.
        tidy(model)
        let home = model.settings.home
        await attempt("24-home-large-widgets") {
            // The Reading Calendar and Statistics large, side by side, over the goals and the activity.
            let shown: [HomeElement] = [.calendar, .statistics, .goals, .activity]
            let rest: [HomeElement] = HomeElement.allCases.filter { !shown.contains($0) }
            var large = HomeSettings(order: shown + rest, hidden: rest)
            large.setSize(.large, for: .calendar)
            large.setSize(.large, for: .statistics)
            var settings = model.settings
            settings.home = large
            model.settings = settings
            model.sidebarSelection = .home
            try await capture("24-home-large-widgets", settle: 2.4)
        }
        var restored = model.settings
        restored.home = home
        model.settings = restored

        restoreDock()
        if !failures.isEmpty { log("not taken: " + failures.joined(separator: ", ")) }
        guard saved > 0 else { fail("no screenshots were taken") }
        print("SHOWCASE OK: \(saved) screenshots")
        fflush(stdout)
        exit(0)
    }

    /// One shot: its failure is logged and the run goes on.
    @MainActor
    private static func attempt(_ name: String, _ body: @MainActor () async throws -> Void) async {
        log("taking \(name)")
        do {
            try await body()
        } catch {
            missed(name, error)
        }
    }

    @MainActor
    private static func missed(_ name: String, _ error: Error) {
        failures.append(name)
        log("\(name) failed: \(error)")
    }

    /// Sheets and edit modes closed between shots, and any alert the library raised put away.
    @MainActor
    private static func tidy(_ model: LibraryModel) {
        if let error = model.error {
            log("the library reported: \(error)")
            model.error = nil
        }
        model.infoBook = nil
        model.editingGoals = false
        model.editingHome = false
    }

    @MainActor
    private static func setCovers(_ appearance: CoverAppearance, _ model: LibraryModel) {
        var settings = model.settings
        settings.coverAppearance = appearance
        model.settings = settings
    }

    /// The size of the covers in the grid, as the toolbar's slider sets it.
    @MainActor
    private static func setGridScale(_ scale: Double, _ model: LibraryModel) {
        var settings = model.settings
        settings.gridScale = scale
        model.settings = settings
    }

    /// Pride and Prejudice in two pages with its highlights, the Appearance popover, the Contents popover in a dark
    /// theme, and full screen with the floating bar; then, back in the Original theme, a search, the menu of a
    /// highlight, and the notes.
    @MainActor
    private static func readerShots(model: LibraryModel, book id: UUID) async {
        guard let book = model.book(id) else { return }
        var settings = model.settings
        settings.reader.theme = .original
        settings.reader.autoNight = false
        settings.reader.layout = .paginated
        settings.reader.spread = .two
        model.settings = settings
        model.open(book)
        let session: ReaderSession
        do {
            session = try await waitFor("the reader to lay the book out", timeout: 40) {
                if let s = SelfTest.currentSession, s.book.id == id, s.isOpen, s.position.locator != nil { return s }
                return nil
            }
        } catch {
            missed("11-reader", error)
            return
        }
        await attempt("11-reader") { try await capture("11-reader", settle: 2.2) }
        await attempt("12-reader-appearance") {
            session.showAppearance = true
            try await capture("12-reader-appearance", settle: 1.4)
        }
        session.showAppearance = false
        await pause(0.6)
        await attempt("13-reader-contents-dark") {
            var dark = model.settings
            dark.reader.theme = .calm
            dark.reader.autoNight = false
            model.settings = dark
            session.applySettings()
            await pause(1)
            session.showContents = true
            try await capture("13-reader-contents-dark", settle: 1.4)
        }
        session.showContents = false
        await pause(0.6)
        await attempt("14-reader-full-screen") {
            var paper = model.settings
            paper.reader.theme = .paper
            model.settings = paper
            session.applySettings()
            await pause(0.8)
            try await fullScreenShot("14-reader-full-screen")
        }
        var plain = model.settings
        plain.reader.theme = .original
        model.settings = plain
        session.applySettings()
        await pause(1)
        await attempt("18-reader-search") {
            session.search("Bingley")
            _ = try await waitFor("the search results", timeout: 12) { session.searchDone && !session.searchResults.isEmpty ? true : nil }
            session.showSearch = true
            try await capture("18-reader-search", settle: 1.4)
        }
        session.showSearch = false
        await pause(0.6)
        await attempt("19-reader-highlight-menu") { try await highlightMenuShot(session, name: "19-reader-highlight-menu") }
        session.tappedHighlight = nil
        await pause(0.6)
        await attempt("20-reader-notes") {
            // The Contents popover opened at its Notes tab.
            session.contentsTab = 2
            session.showContents = true
            try await capture("20-reader-notes", settle: 1.6)
        }
        session.showContents = false
        session.contentsTab = 0
        await pause(0.6)
        session.close()
        _ = try? await waitFor("the reader to close", timeout: 6) { model.reading == nil ? true : nil }
        await pause(0.8)
    }

    /// The menu a click on a highlight opens, over one of the sample's highlights that lies wholly on the pages shown
    /// (one with a note if one does). Where it lies is asked of the page as the page itself measures a highlight that
    /// is clicked, and the session is told of it as the page's message tells it.
    @MainActor
    private static func highlightMenuShot(_ session: ReaderSession, name: String) async throws {
        let marks = session.highlights.filter { !$0.note.isEmpty } + session.highlights.filter { $0.note.isEmpty }
        guard let found = await visibleHighlight(session, among: marks) else {
            throw Failure("no highlight lies wholly on the pages shown, so its menu was not opened")
        }
        let before = Set(NSApp.windows.filter(\.isVisible).map(\.windowNumber))
        session.tappedHighlight = found
        let shown = try? await waitFor("the highlight menu", timeout: 2) {
            NSApp.windows.contains(where: { $0.isVisible && !before.contains($0.windowNumber) }) ? true : nil
        }
        guard shown != nil else {
            session.tappedHighlight = nil
            throw Failure("the highlight menu did not appear")
        }
        try await capture(name, settle: 1.2)
    }

    /// The first of these highlights with a piece wholly within the web view, and that piece's rectangle in the web
    /// view's points from its top left — getBoundingClientRect, as the page reports a highlight clicked; nil when
    /// none is in view.
    @MainActor
    private static func visibleHighlight(_ session: ReaderSession, among marks: [Annotation]) async -> (annotation: Annotation, rect: CGRect)? {
        guard !marks.isEmpty else { return nil }
        let ids = marks.map { "\"" + $0.id.uuidString + "\"" }.joined(separator: ", ")
        let script = """
            (function (ids) {
              for (var i = 0; i < ids.length; i++) {
                var pieces = document.querySelectorAll('span.books-hl[data-id="' + ids[i] + '"]');
                for (var j = 0; j < pieces.length; j++) {
                  var r = pieces[j].getBoundingClientRect();
                  if (r.width > 2 && r.height > 2 && r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight) {
                    return [i, r.left, r.top, r.width, r.height];
                  }
                }
              }
              return null;
            })([\(ids)]);
            """
        let answer: [Double]? = await withCheckedContinuation { (continuation: CheckedContinuation<[Double]?, Never>) in
            session.webView.evaluateJavaScript(script) { result, _ in
                continuation.resume(returning: (result as? [NSNumber])?.map(\.doubleValue))
            }
        }
        guard let found = answer, found.count == 5 else { return nil }
        let index = Int(found[0])
        guard marks.indices.contains(index) else { return nil }
        return (annotation: marks[index], rect: CGRect(x: found[1], y: found[2], width: found[3], height: found[4]))
    }

    /// The essays as whole pages, then zoomed to their text and cut into screens, then reflowed as text.
    @MainActor
    private static func pdfShots(model: LibraryModel, book id: UUID) async {
        guard let book = model.book(id) else { return }
        model.open(book)
        let pages: ReaderSession
        do {
            pages = try await waitFor("the PDF to open", timeout: 30) {
                if let s = SelfTest.currentSession, s.book.id == id, s.isOpen, s.usesPDFView { return s }
                return nil
            }
        } catch {
            missed("15-pdf-pages", error)
            return
        }
        await attempt("15-pdf-pages") { try await capture("15-pdf-pages", settle: 2) }
        pages.setPDFLayout(.fit)
        do {
            let split = try await waitFor("the PDF in Zoom & Split", timeout: 30) {
                if let s = SelfTest.currentSession, s !== pages, s.book.id == id, s.isOpen, s.usesPDFView { return s }
                return nil
            }
            await attempt("16-pdf-zoom-and-split") { try await capture("16-pdf-zoom-and-split", settle: 2.4) }
            split.setPDFLayout(.text)
            do {
                let text = try await waitFor("the PDF as text", timeout: 40) {
                    if let s = SelfTest.currentSession, s !== split, s.book.id == id, s.isOpen, !s.usesPDFView, s.layout.total > 0 { return s }
                    return nil
                }
                await attempt("21-pdf-text") { try await capture("21-pdf-text", settle: 2.4) }
                text.close()
            } catch {
                missed("21-pdf-text", error)
                SelfTest.currentSession?.close()
            }
        } catch {
            missed("16-pdf-zoom-and-split", error)
            SelfTest.currentSession?.close()
        }
        _ = try? await waitFor("the reader to close", timeout: 6) { model.reading == nil ? true : nil }
        await pause(0.8)
    }

    /// Full screen, captured while the reader's bar is shown on entering it, then back to the window.
    @MainActor
    private static func fullScreenShot(_ name: String) async throws {
        guard let main = window else { throw Failure("there is no window") }
        main.toggleFullScreen(nil)
        do {
            _ = try await waitFor("full screen", timeout: 10) { main.styleMask.contains(.fullScreen) ? true : nil }
            // The bar shows for a few seconds from the moment the window is full screen; the move takes about one.
            try await capture(name, settle: 1.3)
        } catch {
            await leaveFullScreen(main)
            throw error
        }
        await leaveFullScreen(main)
    }

    @MainActor
    private static func leaveFullScreen(_ main: NSWindow) async {
        guard main.styleMask.contains(.fullScreen) else { return }
        main.toggleFullScreen(nil)
        _ = try? await waitFor("the window to leave full screen", timeout: 10) { !main.styleMask.contains(.fullScreen) ? true : nil }
        // AppKit puts the window's frame back from before full screen once the move is over: placed after that, and
        // again should the frame still change.
        await pause(1.2)
        place(main)
        await pause(1.0)
        let area = (main.screen ?? NSScreen.main)?.visibleFrame ?? main.frame
        if !area.insetBy(dx: -1, dy: -1).contains(main.frame) { place(main) }
        hideDock()
    }

    /// Opens a book in the reader and closes it again, so that it is the book last opened, and gives it back the place
    /// it had: opening a book is not reading it.
    @MainActor
    private static func openBriefly(model: LibraryModel, book id: UUID) async {
        guard let book = model.book(id) else { return }
        let place = book.position
        let finished = book.finishedAt
        log("opening and closing \(book.title), so that it is the book last opened")
        model.open(book)
        let session = try? await waitFor("the reader to open", timeout: 30) {
            if let s = SelfTest.currentSession, s.book.id == id, s.isOpen { return s }
            return nil
        }
        await pause(0.5)
        if let session { session.close() } else { model.closeReader() }
        _ = try? await waitFor("the reader to close", timeout: 6) { model.reading == nil ? true : nil }
        if var after = model.book(id), after.position != place || after.finishedAt != finished {
            after.position = place
            after.finishedAt = finished
            model.update(after)
        }
        await pause(0.6)
    }

    /// The Settings window's General tab, its covers drawn with the book last opened, then its Library and Reading
    /// tabs, each chosen through the model's selection of the tab. Each is moved wholly onto the screen before it is
    /// taken, and taken from the app's own windows, so that neither the Dock nor another app's window is in it.
    @MainActor
    private static func settingsShots(model: LibraryModel) async {
        model.settingsTab = .general
        let settings: NSWindow
        do {
            settings = try await openSettings()
        } catch {
            for name in ["17-settings", "22-settings-library", "23-settings-reading"] { missed(name, error) }
            return
        }
        await attempt("17-settings") {
            let general = await selectSettingsTab(.general, label: "General", in: settings, model: model)
            if !general { log("17-settings: the General tab could not be chosen; the window shows “\(settings.title)”") }
            await keepOnScreen(settings, for: "17-settings")
            try await capture("17-settings", settle: 1.4, window: settings, ownWindowsFirst: true)
        }
        let others: [(name: String, tab: SettingsTab, label: String)] = [
            (name: "22-settings-library", tab: .library, label: "Library"),
            (name: "23-settings-reading", tab: .reading, label: "Reading"),
        ]
        for shot in others {
            await attempt(shot.name) {
                let chosen = await selectSettingsTab(shot.tab, label: shot.label, in: settings, model: model)
                guard chosen else { throw Failure("the \(shot.label) tab could not be chosen; the window shows “\(settings.title)”") }
                await keepOnScreen(settings, for: shot.name)
                try await capture(shot.name, settle: 1.4, window: settings, ownWindowsFirst: true)
            }
        }
        settings.close()
        model.settingsTab = .general
        await pause(0.6)
    }

    /// Chooses a tab of the Settings window: through the model, which holds the window's selection, and failing that
    /// with the tab's toolbar item, as a click on the item does. True once the window shows the tab: its title is the
    /// tab's name, or its toolbar has the tab's item selected.
    @MainActor
    private static func selectSettingsTab(_ tab: SettingsTab, label: String, in settings: NSWindow, model: LibraryModel) async -> Bool {
        func showing() -> Bool {
            if settings.title == label { return true }
            guard let toolbar = settings.toolbar, let selected = toolbar.selectedItemIdentifier else { return false }
            return toolbar.items.first(where: { $0.itemIdentifier == selected })?.label == label
        }
        model.settingsTab = tab
        let selected = try? await waitFor("the \(label) tab", timeout: 2) { showing() ? true : nil }
        if selected != nil { return true }
        guard let toolbar = settings.toolbar, let item = toolbar.items.first(where: { $0.label == label }), let action = item.action else { return false }
        _ = NSApp.sendAction(action, to: item.target, from: item)
        let clicked = try? await waitFor("the \(label) tab", timeout: 2) { showing() ? true : nil }
        return clicked != nil
    }

    /// The Settings window, opened as a person would, with Settings… in the app menu.
    @MainActor
    private static func openSettings() async throws -> NSWindow {
        guard let main = window else { throw Failure("there is no window") }
        func settingsWindow() -> NSWindow? {
            NSApp.windows.first { $0 !== main && $0.isVisible && !($0 is NSPanel) && $0.styleMask.contains(.titled) && $0.sheetParent == nil }
        }
        if let menu = NSApp.mainMenu?.items.first?.submenu,
           let index = menu.items.firstIndex(where: { $0.keyEquivalent == "," && $0.keyEquivalentModifierMask.contains(.command) }) {
            menu.performActionForItem(at: index)
        }
        var found = try? await waitFor("the Settings window", timeout: 3) { settingsWindow() }
        if found == nil {
            NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
            found = try? await waitFor("the Settings window", timeout: 4) { settingsWindow() }
        }
        guard let settings = found else { throw Failure("the Settings window did not open") }
        settings.makeKeyAndOrderFront(nil)
        return settings
    }

    // MARK: - The window

    @MainActor
    private static func mainWindow() -> NSWindow? {
        let shown = NSApp.windows.filter { $0.isVisible && !($0 is NSPanel) && $0.styleMask.contains(.titled) }
        return shown.first { $0.identifier?.rawValue.contains("main") == true } ?? shown.first { $0.title == "Books" } ?? shown.first
    }

    /// A fixed 1440 × 900 window in the middle of the screen, or as much of that as the screen has.
    @MainActor
    private static func place(_ main: NSWindow) {
        let area = (main.screen ?? NSScreen.main)?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let size = NSSize(width: min(1440, area.width), height: min(900, area.height))
        let origin = NSPoint(x: (area.midX - size.width / 2).rounded(), y: (area.midY - size.height / 2).rounded())
        main.setFrame(NSRect(origin: origin, size: size), display: true)
        main.makeKeyAndOrderFront(nil)
    }

    /// Moves a window, once it has stopped changing size, into the middle of the screen's visible part — below the
    /// menu bar and above the Dock — keeping its size. The Settings window grows downward from its top when a taller
    /// tab is chosen, so on the runner's 1024 × 768 screen the Reading tab's 600 points and the toolbar over them
    /// would otherwise run under the Dock and off the foot of the screen. A window taller than the visible part is
    /// set against its top, so that its toolbar and the head of the tab show, and the log says so.
    @MainActor
    private static func keepOnScreen(_ target: NSWindow, for name: String) async {
        // A tab's change of size is animated: the frame is read until it has held still for two looks running.
        await pause(0.3)
        var frame: NSRect = target.frame
        var steady = 0
        let deadline = Date().addingTimeInterval(2.5)
        while steady < 2 && Date() < deadline {
            await pause(0.15)
            let now: NSRect = target.frame
            if now == frame {
                steady += 1
            } else {
                steady = 0
                frame = now
            }
        }
        guard let area = (target.screen ?? NSScreen.main)?.visibleFrame else { return }
        let x: CGFloat = max(area.minX, (area.midX - frame.width / 2).rounded())
        let top: CGFloat = min(area.maxY, (area.midY + frame.height / 2).rounded())
        let origin = NSPoint(x: x, y: top - frame.height)
        if origin != frame.origin { target.setFrameOrigin(origin) }
        if frame.height > area.height {
            log("\(name): the window is \(Int(frame.height)) points tall and the screen shows \(Int(area.height)) of them; it is set against the top")
        }
    }

    /// Hides the Dock while the pictures are taken, as an app may with its presentation options: on the runner's
    /// 1024 × 768 screen it otherwise lies over the foot of any window that reaches down to it, and a picture of the
    /// screen's rectangle shows it there. The options take effect only while the app is active, so this is asked
    /// after the app is made active and again before each picture, in case it was not active the first time. Full
    /// screen is left alone: the system sets the options itself there, and a combination it does not allow raises.
    /// True when the Dock was hidden just now, so that the caller can give it a moment to slide away.
    @MainActor
    @discardableResult
    private static func hideDock() -> Bool {
        guard NSApp.isActive else { return false }
        if NSApp.windows.contains(where: { $0.styleMask.contains(.fullScreen) }) { return false }
        let current: NSApplication.PresentationOptions = NSApp.presentationOptions
        if current.contains(.autoHideDock) || current.contains(.hideDock) || current.contains(.fullScreen) { return false }
        if optionsBeforeHidingDock == nil { optionsBeforeHidingDock = current }
        NSApp.presentationOptions = current.union(.autoHideDock)
        return true
    }

    /// Gives the app back the presentation options it had before the Dock was hidden. The system does the same when
    /// the app quits, so a run that fails part way leaves nothing behind either.
    @MainActor
    private static func restoreDock() {
        guard let previous = optionsBeforeHidingDock else { return }
        if NSApp.windows.contains(where: { $0.styleMask.contains(.fullScreen) }) { return }
        NSApp.presentationOptions = previous
        optionsBeforeHidingDock = nil
    }

    /// Whether the window shows as the active one: the app is active, and the window is key or holds the key window
    /// (a sheet, or a popover whose field has the focus).
    @MainActor
    private static func isFrontmost(_ target: NSWindow) -> Bool {
        guard NSApp.isActive, let key = NSApp.keyWindow else { return false }
        var current: NSWindow? = key
        while let shown = current {
            if shown === target { return true }
            current = shown.sheetParent ?? shown.parent
        }
        return target.isMainWindow && String(describing: type(of: key)).contains("Popover")
    }

    /// Makes the app active and the window key, as a click on it would, and waits up to a second for it to show as
    /// the active window: an app launched from a shell on the CI's runner is not frontmost, and an inactive window
    /// has grey traffic lights, dimmed toolbar text and grey selections. A window already frontmost, or holding the
    /// key window, is left alone, so a sheet or a popover over it stays.
    @MainActor
    private static func bringForward(_ target: NSWindow, for name: String) async {
        if isFrontmost(target) { return }
        NSApp.activate(ignoringOtherApps: true)
        _ = try? await waitFor("the app to become active", timeout: 0.4) { NSApp.isActive ? true : nil }
        if !isFrontmost(target) { target.makeKeyAndOrderFront(nil) }
        let keyed = try? await waitFor("the window to become key", timeout: 1) { isFrontmost(target) ? true : nil }
        if keyed == nil {
            log("\(name): the window is not key (the app is \(NSApp.isActive ? "active" : "not active")); it is taken as it is")
        }
    }

    private static func describe(_ rect: NSRect) -> String {
        "\(Int(rect.width))×\(Int(rect.height)) at \(Int(rect.minX)),\(Int(rect.minY))"
    }

    // MARK: - Capturing

    // The CGWindowList options as numbers: the types that name them may go the way of the function.
    /// kCGWindowListOptionOnScreenOnly.
    private static let listOnScreenOnly: UInt32 = 1 << 0
    /// kCGWindowListOptionIncludingWindow.
    private static let listIncludingWindow: UInt32 = 1 << 3
    /// kCGWindowImageBoundsIgnoreFraming: the window without its shadow.
    private static let imageBoundsIgnoreFraming: UInt32 = 1 << 0
    /// kCGWindowImageBestResolution: every pixel a Retina screen has.
    private static let imageBestResolution: UInt32 = 1 << 3

    private typealias WindowListImage = @convention(c) (CGRect, UInt32, UInt32, UInt32) -> UnsafeMutableRawPointer?
    private typealias PreflightScreenCapture = @convention(c) () -> Bool

    /// CGWindowListCreateImage, found at run time: the macOS 15 SDK and later make it unavailable to code that names
    /// it, but the function is still there, and an app's own windows need no screen-recording permission.
    private static let windowListImage: WindowListImage? = {
        guard let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGWindowListCreateImage") else { return nil }
        return unsafeBitCast(symbol, to: WindowListImage.self)
    }()

    /// Whether the app may record the screen, for the log; nil when that cannot be asked.
    private static var screenCaptureAllowed: Bool? {
        guard let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGPreflightScreenCaptureAccess") else { return nil }
        return unsafeBitCast(symbol, to: PreflightScreenCapture.self)()
    }

    private static func windowImage(_ rect: CGRect, list: UInt32, window: UInt32, options: UInt32) -> CGImage? {
        guard let create = windowListImage, let raw = create(rect, list, window, options) else { return nil }
        return Unmanaged<CGImage>.fromOpaque(UnsafeRawPointer(raw)).takeRetainedValue()
    }

    /// Saves the screen's rectangle of a window — the main window unless another is given — so the popovers, sheets
    /// and child windows over it are in the picture. The ways of taking it are tried in turn, and the first that gives
    /// a picture that is not blank, and that shows the window rather than the desktop behind it, is kept: the app's
    /// own windows captured one by one by CGWindowListCreateImage and laid over each other; the screen's rectangle by
    /// the same function; screencapture; and last the windows drawn by AppKit, with WebKit's snapshots of the book
    /// pages. With screen-recording permission the screen's rectangle comes first; without it (CI grants none) it
    /// comes second, since asking for more than the app's own windows can put up a system prompt that takes the focus
    /// and closes the popovers. `ownWindowsFirst` puts the app's own windows first either way, as the Settings shots
    /// ask, so that nothing of another app's, nor the Dock, can be in the picture of a window that reaches down to
    /// the foot of the screen.
    @MainActor
    private static func capture(_ name: String, settle: Double, window chosen: NSWindow? = nil, ownWindowsFirst: Bool = false) async throws {
        guard let target = chosen ?? window else { throw Failure("there is no window to capture") }
        // The app active and the window key before the pause, and still so after it; the Dock hidden, if it was not
        // yet, while the pause gives it time to go.
        await bringForward(target, for: name)
        if hideDock() { log("\(name): the Dock was hidden only now") }
        // The main window back inside the screen, should something have moved or grown it since it was placed:
        // leaving full screen puts back the window's saved frame, after the move is done and in its own time.
        if target === window, !target.styleMask.contains(.fullScreen), let area = (target.screen ?? NSScreen.main)?.visibleFrame,
           !area.insetBy(dx: -1, dy: -1).contains(target.frame) {
            log("\(name): the window was \(Int(target.frame.width)) × \(Int(target.frame.height)) at \(Int(target.frame.minX)),\(Int(target.frame.minY)), past the screen; placed again")
            place(target)
            await pause(0.6)
        }
        await pause(settle)
        if !isFrontmost(target) { await bringForward(target, for: name) }
        let frame = target.frame
        let rect = globalRect(frame)
        let permitted = screenCaptureAllowed == true
        let alone = windowImage(.null, list: listIncludingWindow, window: UInt32(truncatingIfNeeded: target.windowNumber), options: imageBoundsIgnoreFraming | imageBestResolution)
        let reference = alone.flatMap { isBlank($0) ? nil : $0 }
        var picture: CGImage?
        var method = ""
        let windowsFirst = !permitted || ownWindowsFirst
        if windowsFirst, reference != nil, let composite = ownWindows(over: target, frame: frame), !isBlank(composite) {
            picture = composite
            method = "CGWindowListCreateImage of each of the app's windows, laid over each other"
        }
        if picture == nil, let screen = windowImage(rect, list: listOnScreenOnly, window: 0, options: imageBestResolution), !isBlank(screen) {
            if let reference, difference(screen, reference) > 0.15 {
                log("\(name): the screen's rectangle differs from the window by \(Int(difference(screen, reference) * 100))%, so it was not kept")
            } else {
                picture = screen
                method = "CGWindowListCreateImage of the screen's rectangle"
            }
        }
        if picture == nil, !windowsFirst, reference != nil, let composite = ownWindows(over: target, frame: frame), !isBlank(composite) {
            picture = composite
            method = "CGWindowListCreateImage of each of the app's windows, laid over each other"
        }
        if picture == nil, let shot = await screencapture(rect), !isBlank(shot) {
            if let reference, difference(shot, reference) > 0.15 {
                log("\(name): screencapture differs from the window by \(Int(difference(shot, reference) * 100))%, so it was not kept")
            } else {
                picture = shot
                method = "screencapture -R"
            }
        }
        if picture == nil, let drawn = await rendering(over: target, frame: frame), !isBlank(drawn) {
            picture = drawn
            method = "cacheDisplay with WebKit snapshots"
        }
        guard let image = picture else { throw Failure("no way of capturing gave a picture") }
        guard let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else { throw Failure("the picture could not be made a PNG") }
        try png.write(to: directory.appendingPathComponent(name + ".png"), options: .atomic)
        saved += 1
        log("\(name).png, \(image.width)×\(image.height), by \(method)")
    }

    /// A frame in the coordinates CGWindowList and screencapture use: points from the top left of the main display.
    @MainActor
    private static func globalRect(_ frame: NSRect) -> CGRect {
        let height = NSScreen.screens.first?.frame.height ?? frame.maxY
        return CGRect(x: frame.minX, y: height - frame.maxY, width: frame.width, height: frame.height)
    }

    /// The app's windows over the frame, each captured alone and laid over the others from the back.
    @MainActor
    private static func ownWindows(over target: NSWindow, frame: NSRect) -> CGImage? {
        let scale = target.backingScaleFactor
        let order = (NSWindow.windowNumbers(options: []) ?? []).map(\.intValue)
        guard order.contains(target.windowNumber), let context = canvas(frame.size, scale: scale) else { return nil }
        for number in order.reversed() {
            guard let window = NSApp.window(withWindowNumber: number), window.isVisible, window.frame.intersects(frame),
                  let image = windowImage(.null, list: listIncludingWindow, window: UInt32(truncatingIfNeeded: number), options: imageBoundsIgnoreFraming | imageBestResolution) else { continue }
            context.draw(image, in: placed(window.frame, in: frame, scale: scale))
        }
        return context.makeImage()
    }

    /// The screen's rectangle by /usr/sbin/screencapture, given six seconds.
    @MainActor
    private static func screencapture(_ rect: CGRect) async -> CGImage? {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("Books Showcase \(UUID().uuidString).png")
        defer { try? FileManager.default.removeItem(at: file) }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = ["-x", "-R", "\(Int(rect.minX)),\(Int(rect.minY)),\(Int(rect.width)),\(Int(rect.height))", file.path]
        do {
            try process.run()
        } catch {
            return nil
        }
        let deadline = Date().addingTimeInterval(6)
        while process.isRunning && Date() < deadline { await pause(0.1) }
        if process.isRunning {
            process.terminate()
            return nil
        }
        guard process.terminationStatus == 0, let data = try? Data(contentsOf: file) else { return nil }
        return NSBitmapImageRep(data: data)?.cgImage
    }

    /// The windows over the frame as AppKit draws them, and the web views' pages as WebKit does, since it draws them
    /// in another process. Needs no permission, though what the window server draws (materials, layers) may be
    /// plainer than on screen.
    @MainActor
    private static func rendering(over target: NSWindow, frame: NSRect) async -> CGImage? {
        let scale = target.backingScaleFactor
        guard let context = canvas(frame.size, scale: scale) else { return nil }
        let numbers = (NSWindow.windowNumbers(options: []) ?? []).map(\.intValue)
        var windows = numbers.reversed().compactMap { NSApp.window(withWindowNumber: $0) }.filter { $0.isVisible && $0.frame.intersects(frame) }
        if windows.isEmpty { windows = [target] }
        for window in windows {
            guard let view = window.contentView?.superview ?? window.contentView, let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { continue }
            view.cacheDisplay(in: view.bounds, to: bitmap)
            if let image = bitmap.cgImage { context.draw(image, in: placed(window.frame, in: frame, scale: scale)) }
            for web in webViews(in: view) where !web.isHiddenOrHasHiddenAncestor {
                guard let page = await snapshot(of: web), let image = page.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
                let inWindow = web.convert(web.bounds, to: nil)
                let onScreen = NSRect(x: window.frame.minX + inWindow.minX, y: window.frame.minY + inWindow.minY, width: inWindow.width, height: inWindow.height)
                context.draw(image, in: placed(onScreen, in: frame, scale: scale))
            }
        }
        return context.makeImage()
    }

    @MainActor
    private static func webViews(in view: NSView) -> [WKWebView] {
        var found: [WKWebView] = []
        for child in view.subviews {
            if let web = child as? WKWebView { found.append(web) } else { found += webViews(in: child) }
        }
        return found
    }

    @MainActor
    private static func snapshot(of web: WKWebView) async -> NSImage? {
        await withCheckedContinuation { (continuation: CheckedContinuation<NSImage?, Never>) in
            web.takeSnapshot(with: nil) { image, _ in continuation.resume(returning: image) }
        }
    }

    /// A rectangle on the screen as it lies in a picture of the frame, in pixels from the picture's bottom left.
    private static func placed(_ rect: NSRect, in frame: NSRect, scale: CGFloat) -> CGRect {
        CGRect(x: (rect.minX - frame.minX) * scale, y: (rect.minY - frame.minY) * scale, width: rect.width * scale, height: rect.height * scale)
    }

    private static func canvas(_ size: NSSize, scale: CGFloat) -> CGContext? {
        let width = Int((size.width * scale).rounded()), height = Int((size.height * scale).rounded())
        guard width > 0, height > 0 else { return nil }
        return CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                         space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    }

    /// The picture drawn at 40 × 25 pixels: a thousand samples, enough to tell a blank or wrong capture from a real one.
    private static func thumbnail(_ image: CGImage) -> [UInt8]? {
        let width = 40, height = 25
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = pixels.withUnsafeMutableBytes { (buffer: UnsafeMutableRawBufferPointer) -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                          space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.interpolationQuality = .medium
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        return drawn ? pixels : nil
    }

    /// Blank: mostly transparent, or one colour throughout.
    private static func isBlank(_ image: CGImage) -> Bool {
        guard image.width >= 16, image.height >= 16, let pixels = thumbnail(image) else { return true }
        let count = pixels.count / 4
        var opaque = 0
        var sum = [Double](repeating: 0, count: 3), squares = [Double](repeating: 0, count: 3)
        for i in 0..<count {
            if pixels[i * 4 + 3] > 16 { opaque += 1 }
            for c in 0..<3 {
                let value = Double(pixels[i * 4 + c])
                sum[c] += value
                squares[c] += value * value
            }
        }
        guard opaque * 2 >= count else { return true }
        let n = Double(count)
        let spread = (0..<3).map { c in max(0, squares[c] / n - (sum[c] / n) * (sum[c] / n)).squareRoot() }.max() ?? 0
        return spread < 3
    }

    /// How far apart two pictures of the same rectangle are, 0 to 1, over the pixels both cover.
    private static func difference(_ a: CGImage, _ b: CGImage) -> Double {
        guard let pa = thumbnail(a), let pb = thumbnail(b) else { return 1 }
        var total = 0.0
        var counted = 0
        for i in stride(from: 0, to: min(pa.count, pb.count), by: 4) where pa[i + 3] > 200 && pb[i + 3] > 200 {
            for c in 0..<3 { total += abs(Double(pa[i + c]) - Double(pb[i + c])) }
            counted += 3
        }
        return counted > 0 ? total / Double(counted) / 255 : 1
    }

    // MARK: - Waiting

    private static func pause(_ seconds: Double) async {
        try? await Task.sleep(nanoseconds: UInt64(max(0, seconds) * 1_000_000_000))
    }

    @MainActor
    private static func waitFor<T>(_ what: String, timeout: Double, _ probe: @MainActor () -> T?) async throws -> T {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let value = probe() { return value }
            await pause(0.2)
        }
        throw Failure("timed out waiting for \(what)")
    }

    // MARK: - The sample library

    /// What the sample library holds, by the short names the shots use.
    private struct Samples {
        var books: [String: UUID] = [:]
        var collections: [String: UUID] = [:]
    }

    /// Where a book stands: how far in, when it was last opened and finished, and when it was added.
    private struct Plan {
        let percent: Double?
        let opened: Date?
        let finished: Date?
        let added: Date
    }

    /// A seeded generator, so the sample library comes out the same on every run.
    private struct Dice {
        var state: UInt64

        mutating func next() -> Double {
            state = state &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
            return Double(state >> 11) / 9_007_199_254_740_992
        }
    }

    /// The books and the PDF made and added, each with its cover; where each reader stands; highlights, collections,
    /// five months of reading and the goals.
    @MainActor
    private static func makeLibrary(model: LibraryModel) async throws -> Samples {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("Books Showcase Samples \(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }

        let classics = sampleClassics()
        var files: [URL] = []
        for classic in classics {
            let spec = EPUBSpec(title: classic.title, author: classic.author, description: classic.blurb, subjects: classic.subjects,
                                chapters: classic.parts.map(\.chapter), sourceNote: "The opening pages of the public-domain text.")
            let file = folder.appendingPathComponent(classic.title.replacingOccurrences(of: "/", with: "-") + ".epub")
            try EPUBWriter.build(spec).write(to: file)
            files.append(file)
        }
        guard let essays = essaysPDF() else { throw Failure("the sample PDF could not be typeset") }
        let pdfFile = folder.appendingPathComponent("Bacon, Essays.pdf")
        try essays.write(to: pdfFile)
        files.append(pdfFile)

        let added: [Book] = await withCheckedContinuation { continuation in
            model.importFiles(files, quiet: true, allowDuplicates: true) { continuation.resume(returning: $0) }
        }
        guard !added.isEmpty else { throw Failure("none of the sample books could be added: \(model.error ?? "no reason given")") }
        if added.count < files.count { log("only \(added.count) of \(files.count) sample books were added") }
        var samples = Samples()
        for book in added {
            if book.kind == .pdf {
                samples.books["essays"] = book.id
            } else if let classic = classics.first(where: { $0.title == book.title }) {
                samples.books[classic.slug] = book.id
            }
        }

        // Covers of their own.
        for classic in classics {
            guard let id = samples.books[classic.slug], let image = cover(for: classic) else { continue }
            model.setCover(image, for: id)
        }
        log("\(added.count) books added, \(classics.count) covers drawn")

        // Where each reader stands: some being read, one begun three weeks ago, some finished this month and this
        // year, and the rest new.
        let now = Date()
        let calendar = Calendar.current
        let monthStart = calendar.dateInterval(of: .month, for: now)?.start ?? now
        let yearStart = calendar.dateInterval(of: .year, for: now)?.start ?? now
        func ago(_ days: Double) -> Date { now.addingTimeInterval(-days * 86400) }
        func thisMonth(_ days: Double) -> Date { min(ago(0.01), max(ago(days), monthStart.addingTimeInterval(3600))) }
        func thisYear(_ days: Double) -> Date { min(ago(0.01), max(ago(days), yearStart.addingTimeInterval(86400))) }
        let plans: [(String, Plan)] = [
            ("pride", Plan(percent: 18, opened: ago(0.08), finished: nil, added: ago(150))),
            ("moby", Plan(percent: 62, opened: ago(0.9), finished: nil, added: ago(131))),
            ("sherlock", Plan(percent: 78, opened: ago(2.2), finished: nil, added: ago(112))),
            ("time", Plan(percent: 45, opened: ago(3.1), finished: nil, added: ago(96))),
            ("dracula", Plan(percent: 21, opened: ago(5.3), finished: nil, added: ago(83))),
            ("jane", Plan(percent: 30, opened: ago(21), finished: nil, added: ago(101))),
            ("frankenstein", Plan(percent: 100, opened: thisMonth(6), finished: thisMonth(6), added: ago(121))),
            ("dorian", Plan(percent: 100, opened: thisMonth(2), finished: thisMonth(2), added: ago(92))),
            ("alice", Plan(percent: 100, opened: thisYear(70), finished: thisYear(70), added: ago(141))),
            ("walden", Plan(percent: 100, opened: thisYear(110), finished: thisYear(110), added: ago(158))),
            ("war", Plan(percent: nil, opened: nil, finished: nil, added: ago(1.2))),
            ("essays", Plan(percent: nil, opened: nil, finished: nil, added: ago(2.4))),
            ("tale", Plan(percent: nil, opened: nil, finished: nil, added: ago(3.5))),
            ("expectations", Plan(percent: nil, opened: nil, finished: nil, added: ago(6))),
            ("odyssey", Plan(percent: nil, opened: nil, finished: nil, added: ago(9))),
        ]
        for (slug, plan) in plans {
            guard let id = samples.books[slug], var book = model.book(id) else { continue }
            book.addedAt = plan.added
            book.lastOpenedAt = plan.opened
            book.finishedAt = plan.finished
            book.position = plan.percent.map { ReadingPosition(percent: $0, updatedAt: plan.opened ?? now) }
            // The samples hold the opening pages; the shelves show the whole book's length and time left.
            if let classic = classics.first(where: { $0.slug == slug }) { book.words = classic.words }
            model.update(book)
        }

        // Pride and Prejudice, with highlights, notes and a bookmark to show, opens in its first chapter at the second
        // highlight, on the spread that holds the third and the fourth as well.
        if let id = samples.books["pride"], var book = model.book(id), let pride = classics.first(where: { $0.slug == "pride" }), pride.parts.count > 1 {
            let first = pride.parts[0]
            let marks: [(String, HighlightColor, String)] = [
                ("It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.", .yellow,
                 "Austen’s irony starts with the first sentence: it is the neighbourhood, not the single man, that is so sure of what he wants."),
                ("A single man of large fortune; four or five thousand a year. What a fine thing for our girls!", .green, ""),
                ("When a woman has five grown-up daughters, she ought to give over thinking of her own beauty.", .blue, ""),
                ("In such cases, a woman has not often much beauty to think of.", .pink, "Mr. Bennet in a single line."),
            ]
            let opening = offsets(of: marks[1].0, in: first)?.start ?? 0
            book.position = ReadingPosition(locator: Locator(spine: 1, offset: opening), percent: 18, updatedAt: ago(0.08))
            model.update(book)
            var annotations: [Annotation] = []
            for (index, mark) in marks.enumerated() {
                guard let range = offsets(of: mark.0, in: first) else {
                    log("the highlight “\(mark.0)” was not found in the text")
                    continue
                }
                annotations.append(Annotation(kind: .highlight, locator: Locator(spine: 1, offset: range.start), endOffset: range.end, color: mark.1,
                                              text: mark.0, note: mark.2, chapter: first.heading, createdAt: ago(Double(10 - index))))
            }
            annotations.append(Annotation(kind: .bookmark, locator: Locator(spine: 2, offset: 0), text: "Mr. Bennet was among the earliest of those who waited on Mr. Bingley.",
                                          chapter: pride.parts[1].heading, createdAt: ago(1)))
            model.store.saveAnnotations(annotations, for: id)
        }

        // The collections, made in the order the sidebar lists them.
        let groups: [(String, [String])] = [
            ("Classics", ["pride", "tale", "expectations", "jane", "odyssey", "moby"]),
            ("Science Fiction", ["time", "war", "frankenstein"]),
            ("Gothic & Horror", ["dracula", "dorian", "frankenstein", "jane"]),
            ("Summer Reading", ["sherlock", "alice", "walden", "moby", "essays"]),
        ]
        for (name, slugs) in groups {
            model.addCollection(named: name)
            guard let collection = model.collections.first(where: { $0.name == name }) else { continue }
            samples.collections[name] = collection.id
            let ids = slugs.compactMap { samples.books[$0] }
            model.add(ids, to: collection.id)
        }
        model.sidebarSelection = .home
        model.selectedBookIDs = []

        // Five months of reading: most days, more at weekends, a fortnight away about three months ago, and a run of
        // days lately; today is under way.
        let spans: [(ClosedRange<Int>, [String])] = [
            (122...150, ["walden"]), (100...121, ["alice", "walden"]), (72...99, ["frankenstein", "alice"]), (48...71, ["frankenstein", "dorian"]),
            (26...47, ["dorian", "sherlock"]), (21...25, ["jane", "sherlock"]), (8...20, ["time", "dracula", "sherlock"]), (0...7, ["moby", "pride", "time"]),
        ]
        var dice = Dice(state: 0x5EED_B00C)
        for back in stride(from: 150, through: 0, by: -1) {
            guard let day = calendar.date(byAdding: .day, value: -back, to: now) else { continue }
            let weekday = calendar.component(.weekday, from: day)
            let weekend = weekday == 1 || weekday == 7
            let away = (86...99).contains(back)
            let chance = back <= 12 ? 1.0 : (away ? 0.12 : (weekend ? 0.9 : 0.7))
            guard dice.next() < chance else { continue }
            var minutes = weekend ? 28 + dice.next() * 55 : 11 + dice.next() * 32
            if back <= 12 { minutes = max(minutes, 21 + dice.next() * 12) }
            if back == 0 { minutes = 14 }
            let pages = max(1, Int(minutes * (0.8 + dice.next() * 0.5)))
            let chapters = dice.next() < 0.4 ? 1 : 0
            let slugs = spans.first(where: { $0.0.contains(back) })?.1 ?? ["pride"]
            model.store.recordReading(seconds: Int(minutes * 60), pages: pages, chapters: chapters, in: samples.books[slugs[back % slugs.count]], on: day)
        }
        // The store was written to directly: a reading of nothing brings the model's statistics and books up to date.
        if let id = samples.books["pride"] { model.recordReading(seconds: 0, in: id) } else { model.recordReading(seconds: 0) }

        var settings = model.settings
        settings.goals.dailyMinutes = 20
        settings.goals.yearlyBooks = 24
        settings.goals.monthlyBooks = 2
        settings.goals.pages = 300
        settings.goals.chapters = 10
        settings.goals.period = .week
        settings.reader.autoNight = false
        model.settings = settings
        await pause(1)
        return samples
    }

    /// The place of a phrase in a chapter as the reader counts it: characters (UTF-16 units, as JavaScript counts
    /// them) into the chapter's section, whose text is its heading followed by its paragraphs with nothing between.
    private static func offsets(of phrase: String, in part: Part) -> (start: Int, end: Int)? {
        let found = (part.text as NSString).range(of: phrase)
        guard found.location != NSNotFound else { return nil }
        return (found.location, found.location + found.length)
    }

    // MARK: - Covers

    private enum Motif {
        case rings, waves, bolt, clock, tripod, checks, split, arch, lens, flame, frame, stars, pond, meander
    }

    /// A cover's look: a gradient from top to bottom, the colours of the lettering and the art, the art, and faces.
    private struct Jacket {
        let top: UInt32
        let bottom: UInt32
        let ink: UInt32
        let accent: UInt32
        let motif: Motif
        let titleFont: String
        let authorFont: String
        var capitals = false
    }

    private static func color(_ hex: UInt32, _ alpha: CGFloat = 1) -> NSColor {
        NSColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
    }

    /// An 800 × 1200 cover: the gradient, the art, a hairline border as on a printed jacket, the title at the top
    /// and the author at the foot.
    @MainActor
    private static func cover(for classic: Classic) -> NSImage? {
        let size = NSSize(width: 800, height: 1200)
        guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width), pixelsHigh: Int(size.height), bitsPerSample: 8, samplesPerPixel: 4,
                                            hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { return nil }
        let jacket = classic.jacket
        let ink = color(jacket.ink)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        let whole = NSRect(origin: .zero, size: size)
        NSGradient(starting: color(jacket.bottom), ending: color(jacket.top))?.draw(in: whole, angle: 90)
        drawMotif(jacket)
        let border = NSBezierPath(rect: whole.insetBy(dx: 34, dy: 34))
        border.lineWidth = 2
        ink.withAlphaComponent(0.3).setStroke()
        border.stroke()
        let title = jacket.capitals ? classic.title.uppercased() : classic.title
        let kern: CGFloat = jacket.capitals ? 4 : 0
        let titleBox = NSRect(x: 84, y: 826, width: 632, height: 296)
        drawText(title, font: fittedFont(jacket.titleFont, text: title, kern: kern, in: titleBox.size, largest: 104), color: ink, kern: kern, in: titleBox)
        let byline = NSFont(name: jacket.authorFont, size: 30) ?? NSFont.systemFont(ofSize: 30, weight: .medium)
        drawText(classic.author.uppercased(), font: byline, color: ink.withAlphaComponent(0.88), kern: 4, in: NSRect(x: 60, y: 76, width: 680, height: 70))
        NSGraphicsContext.restoreGraphicsState()
        let image = NSImage(size: size)
        image.addRepresentation(bitmap)
        return image
    }

    @MainActor
    private static func attributed(_ text: String, font: NSFont, color: NSColor, kern: CGFloat = 0, alignment: NSTextAlignment = .center) -> NSAttributedString {
        let style = NSMutableParagraphStyle()
        style.alignment = alignment
        style.lineBreakMode = .byWordWrapping
        return NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: color, .kern: kern, .paragraphStyle: style])
    }

    /// Lettering centred in a box, down from its top in whichever direction the context runs.
    @MainActor
    private static func drawText(_ text: String, font: NSFont, color: NSColor, kern: CGFloat, in box: NSRect) {
        let string = attributed(text, font: font, color: color, kern: kern)
        let height = string.boundingRect(with: NSSize(width: box.width, height: 10_000), options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil).height.rounded(.up)
        string.draw(in: NSRect(x: box.minX, y: box.midY - height / 2, width: box.width, height: height + 4))
    }

    /// The largest size, in steps of four points, at which the title fits the box without breaking a word.
    @MainActor
    private static func fittedFont(_ name: String, text: String, kern: CGFloat, in box: NSSize, largest: CGFloat) -> NSFont {
        var size = largest
        while true {
            let font = NSFont(name: name, size: size) ?? NSFont.systemFont(ofSize: size, weight: .semibold)
            let widest = text.split(separator: " ").map { NSAttributedString(string: String($0), attributes: [.font: font, .kern: kern]).size().width }.max() ?? 0
            let height = attributed(text, font: font, color: .black, kern: kern).boundingRect(with: NSSize(width: box.width, height: 10_000), options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil).height
            if (widest <= box.width && height <= box.height) || size <= 36 { return font }
            size -= 4
        }
    }

    /// The art in the middle of the cover, between y 170 and 800 of its 1200 points.
    @MainActor
    private static func drawMotif(_ jacket: Jacket) {
        let ink = color(jacket.ink), accent = color(jacket.accent)
        switch jacket.motif {
        case .rings:
            // Two rings, linked.
            let left = NSBezierPath(ovalIn: NSRect(x: 180, y: 330, width: 300, height: 300))
            left.lineWidth = 12
            accent.setStroke()
            left.stroke()
            let right = NSBezierPath(ovalIn: NSRect(x: 320, y: 330, width: 300, height: 300))
            right.lineWidth = 12
            ink.withAlphaComponent(0.85).setStroke()
            right.stroke()
            ink.withAlphaComponent(0.6).setFill()
            let dots: [CGFloat] = [250, 700]
            for y in dots { NSBezierPath(ovalIn: NSRect(x: 390, y: y, width: 20, height: 20)).fill() }
        case .waves:
            // A moon over rolling water.
            ink.withAlphaComponent(0.92).setFill()
            NSBezierPath(ovalIn: NSRect(x: 470, y: 590, width: 170, height: 170)).fill()
            for row in 0..<8 {
                let base = CGFloat(200 + row * 46)
                let wave = NSBezierPath()
                var x: CGFloat = -20
                wave.move(to: NSPoint(x: x, y: base))
                while x <= 820 {
                    x += 10
                    wave.line(to: NSPoint(x: x, y: base + CGFloat(sin(Double(x) / 55 + Double(row) * 0.9) * 13)))
                }
                wave.lineWidth = 5
                wave.lineCapStyle = .round
                accent.withAlphaComponent(0.85 - CGFloat(row) * 0.08).setStroke()
                wave.stroke()
            }
        case .bolt:
            // A laboratory's lines, and lightning.
            ink.withAlphaComponent(0.1).setStroke()
            for row in 0..<24 {
                let line = NSBezierPath()
                let y = CGFloat(190 + row * 24)
                line.move(to: NSPoint(x: 60, y: y))
                line.line(to: NSPoint(x: 740, y: y))
                line.lineWidth = 2
                line.stroke()
            }
            let points = [NSPoint(x: 470, y: 780), NSPoint(x: 330, y: 500), NSPoint(x: 415, y: 500), NSPoint(x: 340, y: 200),
                          NSPoint(x: 520, y: 560), NSPoint(x: 430, y: 560), NSPoint(x: 540, y: 780)]
            let bolt = NSBezierPath()
            bolt.move(to: points[0])
            for point in points.dropFirst() { bolt.line(to: point) }
            bolt.close()
            bolt.lineJoinStyle = .round
            bolt.lineWidth = 34
            accent.withAlphaComponent(0.22).setStroke()
            bolt.stroke()
            accent.setFill()
            bolt.fill()
        case .clock:
            // A dial at ten past ten.
            let centre = NSPoint(x: 400, y: 480)
            let rim = NSBezierPath(ovalIn: NSRect(x: centre.x - 250, y: centre.y - 250, width: 500, height: 500))
            rim.lineWidth = 8
            accent.setStroke()
            rim.stroke()
            let inner = NSBezierPath(ovalIn: NSRect(x: centre.x - 222, y: centre.y - 222, width: 444, height: 444))
            inner.lineWidth = 2
            ink.withAlphaComponent(0.5).setStroke()
            inner.stroke()
            for tick in 0..<60 {
                let angle = Double(tick) / 60 * 2 * Double.pi
                let major = tick % 5 == 0
                let from: Double = major ? 176 : 196
                let to: Double = 212
                let mark = NSBezierPath()
                mark.move(to: NSPoint(x: centre.x + CGFloat(sin(angle) * from), y: centre.y + CGFloat(cos(angle) * from)))
                mark.line(to: NSPoint(x: centre.x + CGFloat(sin(angle) * to), y: centre.y + CGFloat(cos(angle) * to)))
                mark.lineWidth = major ? 7 : 2
                (major ? ink : ink.withAlphaComponent(0.6)).setStroke()
                mark.stroke()
            }
            let hands: [(Double, Double, CGFloat)] = [(305, 120, 12), (60, 168, 7)]
            for (degrees, length, width) in hands {
                let angle = degrees / 180 * Double.pi
                let hand = NSBezierPath()
                hand.move(to: centre)
                hand.line(to: NSPoint(x: centre.x + CGFloat(sin(angle) * length), y: centre.y + CGFloat(cos(angle) * length)))
                hand.lineWidth = width
                hand.lineCapStyle = .round
                ink.setStroke()
                hand.stroke()
            }
            accent.setFill()
            NSBezierPath(ovalIn: NSRect(x: centre.x - 16, y: centre.y - 16, width: 32, height: 32)).fill()
        case .tripod:
            // A fighting machine striding over the dark ground, its heat-ray out.
            accent.setFill()
            let ground = NSBezierPath()
            ground.move(to: NSPoint(x: 0, y: 0))
            ground.line(to: NSPoint(x: 0, y: 250))
            ground.curve(to: NSPoint(x: 800, y: 230), controlPoint1: NSPoint(x: 260, y: 290), controlPoint2: NSPoint(x: 520, y: 200))
            ground.line(to: NSPoint(x: 800, y: 0))
            ground.close()
            ground.fill()
            let legs: [(NSPoint, NSPoint)] = [(NSPoint(x: 400, y: 615), NSPoint(x: 250, y: 250)), (NSPoint(x: 440, y: 610), NSPoint(x: 455, y: 240)),
                                              (NSPoint(x: 480, y: 615), NSPoint(x: 640, y: 236))]
            accent.setStroke()
            for (hip, foot) in legs {
                let leg = NSBezierPath()
                leg.move(to: hip)
                leg.line(to: foot)
                leg.lineWidth = 12
                leg.lineCapStyle = .round
                leg.stroke()
            }
            NSBezierPath(ovalIn: NSRect(x: 320, y: 600, width: 240, height: 80)).fill()
            NSBezierPath(ovalIn: NSRect(x: 370, y: 640, width: 130, height: 84)).fill()
            let ray = NSBezierPath()
            ray.move(to: NSPoint(x: 340, y: 630))
            ray.line(to: NSPoint(x: 110, y: 300))
            ray.lineCapStyle = .round
            ray.lineWidth = 24
            ink.withAlphaComponent(0.18).setStroke()
            ray.stroke()
            ray.lineWidth = 5
            ink.withAlphaComponent(0.9).setStroke()
            ray.stroke()
            ink.setFill()
            NSBezierPath(ovalIn: NSRect(x: 330, y: 620, width: 22, height: 22)).fill()
        case .checks:
            // A chequered floor and the Queen of Hearts' heart.
            ink.withAlphaComponent(0.1).setFill()
            for row in 0..<7 {
                for column in 0..<10 where (row + column) % 2 == 0 {
                    NSBezierPath(rect: NSRect(x: CGFloat(column * 80), y: CGFloat(200 + row * 80), width: 80, height: 80)).fill()
                }
            }
            let heart = NSBezierPath()
            heart.move(to: NSPoint(x: 400, y: 320))
            heart.curve(to: NSPoint(x: 262, y: 560), controlPoint1: NSPoint(x: 335, y: 395), controlPoint2: NSPoint(x: 245, y: 470))
            heart.curve(to: NSPoint(x: 400, y: 565), controlPoint1: NSPoint(x: 285, y: 665), controlPoint2: NSPoint(x: 390, y: 650))
            heart.curve(to: NSPoint(x: 538, y: 560), controlPoint1: NSPoint(x: 410, y: 650), controlPoint2: NSPoint(x: 515, y: 665))
            heart.curve(to: NSPoint(x: 400, y: 320), controlPoint1: NSPoint(x: 555, y: 470), controlPoint2: NSPoint(x: 465, y: 395))
            heart.close()
            accent.setFill()
            heart.fill()
        case .split:
            // Two cities: the cover in two halves, and two rings that overlap.
            accent.setFill()
            NSBezierPath(rect: NSRect(x: 400, y: 0, width: 400, height: 1200)).fill()
            let divider = NSBezierPath()
            divider.move(to: NSPoint(x: 400, y: 180))
            divider.line(to: NSPoint(x: 400, y: 780))
            divider.lineWidth = 2
            ink.withAlphaComponent(0.6).setStroke()
            divider.stroke()
            let centres: [CGFloat] = [310, 490]
            ink.withAlphaComponent(0.9).setStroke()
            for x in centres {
                let ring = NSBezierPath(ovalIn: NSRect(x: x - 150, y: 330, width: 300, height: 300))
                ring.lineWidth = 6
                ring.stroke()
            }
        case .arch:
            // A blood moon through a pointed window.
            accent.setFill()
            NSBezierPath(ovalIn: NSRect(x: 280, y: 440, width: 240, height: 240)).fill()
            let arch = NSBezierPath()
            arch.move(to: NSPoint(x: 240, y: 200))
            arch.line(to: NSPoint(x: 240, y: 540))
            arch.curve(to: NSPoint(x: 400, y: 790), controlPoint1: NSPoint(x: 240, y: 680), controlPoint2: NSPoint(x: 330, y: 760))
            arch.curve(to: NSPoint(x: 560, y: 540), controlPoint1: NSPoint(x: 470, y: 760), controlPoint2: NSPoint(x: 560, y: 680))
            arch.line(to: NSPoint(x: 560, y: 200))
            arch.close()
            arch.lineWidth = 10
            ink.withAlphaComponent(0.75).setStroke()
            arch.stroke()
            let bars = NSBezierPath()
            bars.move(to: NSPoint(x: 400, y: 200))
            bars.line(to: NSPoint(x: 400, y: 772))
            bars.move(to: NSPoint(x: 240, y: 420))
            bars.line(to: NSPoint(x: 560, y: 420))
            bars.lineWidth = 6
            bars.stroke()
        case .lens:
            // A magnifying glass.
            let handle = NSBezierPath()
            handle.move(to: NSPoint(x: 473, y: 447))
            handle.line(to: NSPoint(x: 620, y: 300))
            handle.lineWidth = 44
            handle.lineCapStyle = .round
            accent.setStroke()
            handle.stroke()
            let glass = NSBezierPath(ovalIn: NSRect(x: 200, y: 400, width: 320, height: 320))
            ink.withAlphaComponent(0.08).setFill()
            glass.fill()
            glass.lineWidth = 26
            ink.setStroke()
            glass.stroke()
            let shine = NSBezierPath()
            shine.appendArc(withCenter: NSPoint(x: 360, y: 560), radius: 110, startAngle: 110, endAngle: 160)
            shine.lineWidth = 10
            shine.lineCapStyle = .round
            NSColor.white.withAlphaComponent(0.55).setStroke()
            shine.stroke()
        case .flame:
            // A candle and its glow.
            let glows: [(CGFloat, CGFloat)] = [(260, 0.07), (190, 0.1), (125, 0.16)]
            for (radius, alpha) in glows {
                accent.withAlphaComponent(alpha).setFill()
                NSBezierPath(ovalIn: NSRect(x: 400 - radius, y: 620 - radius, width: 2 * radius, height: 2 * radius)).fill()
            }
            ink.withAlphaComponent(0.35).setFill()
            NSBezierPath(ovalIn: NSRect(x: 280, y: 215, width: 240, height: 56)).fill()
            ink.withAlphaComponent(0.92).setFill()
            NSBezierPath(roundedRect: NSRect(x: 358, y: 240, width: 84, height: 300), xRadius: 8, yRadius: 8).fill()
            let wick = NSBezierPath()
            wick.move(to: NSPoint(x: 400, y: 540))
            wick.line(to: NSPoint(x: 400, y: 566))
            wick.lineWidth = 4
            color(jacket.top).setStroke()
            wick.stroke()
            let flame = NSBezierPath()
            flame.move(to: NSPoint(x: 400, y: 705))
            flame.curve(to: NSPoint(x: 400, y: 560), controlPoint1: NSPoint(x: 350, y: 640), controlPoint2: NSPoint(x: 350, y: 560))
            flame.curve(to: NSPoint(x: 400, y: 705), controlPoint1: NSPoint(x: 450, y: 560), controlPoint2: NSPoint(x: 450, y: 640))
            flame.close()
            accent.setFill()
            flame.fill()
        case .frame:
            // A gilt frame round a portrait.
            let outer = NSRect(x: 220, y: 220, width: 360, height: 540)
            ink.withAlphaComponent(0.12).setFill()
            NSBezierPath(ovalIn: outer.insetBy(dx: 70, dy: 80)).fill()
            ink.withAlphaComponent(0.32).setFill()
            NSBezierPath(ovalIn: NSRect(x: 355, y: 490, width: 90, height: 110)).fill()
            let shoulders = NSBezierPath()
            shoulders.move(to: NSPoint(x: 310, y: 330))
            shoulders.curve(to: NSPoint(x: 490, y: 330), controlPoint1: NSPoint(x: 310, y: 470), controlPoint2: NSPoint(x: 490, y: 470))
            shoulders.close()
            shoulders.fill()
            let frame = NSBezierPath(rect: outer)
            frame.lineWidth = 24
            accent.setStroke()
            frame.stroke()
            let fillet = NSBezierPath(rect: outer.insetBy(dx: 26, dy: 26))
            fillet.lineWidth = 3
            fillet.stroke()
            accent.setFill()
            let corners = [NSPoint(x: outer.minX, y: outer.minY), NSPoint(x: outer.maxX, y: outer.minY), NSPoint(x: outer.minX, y: outer.maxY), NSPoint(x: outer.maxX, y: outer.maxY)]
            for corner in corners { NSBezierPath(ovalIn: NSRect(x: corner.x - 22, y: corner.y - 22, width: 44, height: 44)).fill() }
        case .stars:
            // A night sky over the marshes, one star brighter than the rest.
            var dice = Dice(state: 1861)
            for _ in 0..<80 {
                let x = CGFloat(40 + dice.next() * 720)
                let y = CGFloat(280 + dice.next() * 520)
                let radius = CGFloat(1.5 + dice.next() * 3)
                ink.withAlphaComponent(CGFloat(0.35 + dice.next() * 0.65)).setFill()
                NSBezierPath(ovalIn: NSRect(x: x - radius, y: y - radius, width: 2 * radius, height: 2 * radius)).fill()
            }
            let star = NSBezierPath()
            for i in 0..<10 {
                let angle = Double.pi / 2 + Double(i) * Double.pi / 5
                let radius: Double = i % 2 == 0 ? 60 : 24
                let point = NSPoint(x: 560 + CGFloat(cos(angle) * radius), y: 640 + CGFloat(sin(angle) * radius))
                if i == 0 { star.move(to: point) } else { star.line(to: point) }
            }
            star.close()
            accent.setFill()
            star.fill()
            NSColor.black.withAlphaComponent(0.35).setFill()
            let marsh = NSBezierPath()
            marsh.move(to: NSPoint(x: 0, y: 0))
            marsh.line(to: NSPoint(x: 0, y: 250))
            marsh.curve(to: NSPoint(x: 800, y: 240), controlPoint1: NSPoint(x: 250, y: 280), controlPoint2: NSPoint(x: 560, y: 215))
            marsh.line(to: NSPoint(x: 800, y: 0))
            marsh.close()
            marsh.fill()
        case .pond:
            // Pines along the far shore, mirrored in still water.
            let horizon: CGFloat = 470
            accent.withAlphaComponent(0.3).setFill()
            NSBezierPath(rect: NSRect(x: 0, y: 230, width: 800, height: horizon - 230)).fill()
            accent.withAlphaComponent(0.55).setFill()
            NSBezierPath(ovalIn: NSRect(x: 560, y: 660, width: 96, height: 96)).fill()
            let heights: [CGFloat] = [170, 230, 150, 260, 200, 140, 240, 180, 210]
            for (i, height) in heights.enumerated() {
                let x = CGFloat(48 + i * 88)
                let tree = NSBezierPath()
                tree.move(to: NSPoint(x: x - 44, y: horizon))
                tree.line(to: NSPoint(x: x + 44, y: horizon))
                tree.line(to: NSPoint(x: x, y: horizon + height))
                tree.close()
                ink.withAlphaComponent(0.85).setFill()
                tree.fill()
                let reflection = NSBezierPath()
                reflection.move(to: NSPoint(x: x - 44, y: horizon))
                reflection.line(to: NSPoint(x: x + 44, y: horizon))
                reflection.line(to: NSPoint(x: x, y: horizon - height * 0.6))
                reflection.close()
                ink.withAlphaComponent(0.16).setFill()
                reflection.fill()
            }
        case .meander:
            // A Greek key above and below a black-figure ship under sail.
            ink.setStroke()
            let bands: [CGFloat] = [196, 716]
            for base in bands {
                var x: CGFloat = 56
                for _ in 0..<11 {
                    let key = NSBezierPath()
                    key.move(to: NSPoint(x: x, y: base))
                    key.line(to: NSPoint(x: x + 48, y: base))
                    key.line(to: NSPoint(x: x + 48, y: base + 48))
                    key.line(to: NSPoint(x: x, y: base + 48))
                    key.line(to: NSPoint(x: x, y: base + 16))
                    key.line(to: NSPoint(x: x + 32, y: base + 16))
                    key.line(to: NSPoint(x: x + 32, y: base + 32))
                    key.line(to: NSPoint(x: x + 16, y: base + 32))
                    key.lineWidth = 6
                    key.lineJoinStyle = .miter
                    key.stroke()
                    x += 64
                }
                let rules = NSBezierPath()
                rules.move(to: NSPoint(x: 40, y: base - 14))
                rules.line(to: NSPoint(x: 760, y: base - 14))
                rules.move(to: NSPoint(x: 40, y: base + 62))
                rules.line(to: NSPoint(x: 760, y: base + 62))
                rules.lineWidth = 4
                rules.stroke()
            }
            ink.setFill()
            let hull = NSBezierPath()
            hull.move(to: NSPoint(x: 190, y: 470))
            hull.curve(to: NSPoint(x: 610, y: 470), controlPoint1: NSPoint(x: 260, y: 380), controlPoint2: NSPoint(x: 540, y: 380))
            hull.line(to: NSPoint(x: 640, y: 500))
            hull.line(to: NSPoint(x: 160, y: 500))
            hull.close()
            hull.fill()
            NSBezierPath(rect: NSRect(x: 310, y: 556, width: 180, height: 116)).fill()
            let rigging = NSBezierPath()
            rigging.move(to: NSPoint(x: 400, y: 500))
            rigging.line(to: NSPoint(x: 400, y: 694))
            rigging.move(to: NSPoint(x: 296, y: 680))
            rigging.line(to: NSPoint(x: 504, y: 680))
            for i in 0..<8 {
                let x = CGFloat(240 + i * 45)
                rigging.move(to: NSPoint(x: x, y: 452))
                rigging.line(to: NSPoint(x: x - 30, y: 384))
            }
            rigging.lineWidth = 6
            rigging.lineCapStyle = .round
            rigging.stroke()
        }
    }

    // MARK: - The PDF

    private struct Essay {
        let numeral: String
        let title: String
        let paragraphs: [String]
    }

    /// Francis Bacon's essays set as a small book on A5 pages: a title page that opens the text, and on every page
    /// after it a running head over a rule and a folio at the foot, as a printed book has them, so that Zoom & Split
    /// and Text find furniture to leave out as they would in a real one. Justified and hyphenated text in Hoefler
    /// Text, paginated here line by line: each page's text starts at the head of the text block and — but where the
    /// last page has room for FINIS at its foot — ends at its foot, what a page is short by spread between its essays
    /// and its lines as a compositor feathers a page, and no essay's heading is left at the foot of a page without
    /// two lines of its text. Title, author, subject and keywords go in the document's information, so the library
    /// reads its details and genres off it as it would any PDF's.
    @MainActor
    private static func essaysPDF() -> Data? {
        let page = CGSize(width: 420, height: 595)
        let margin: CGFloat = 54
        let column = page.width - 2 * margin
        // The text block, down from the top of the page; on the first page it starts below the title. The running
        // head, the rule under it and the folio lie outside it, in the outer tenth of the page.
        let top: CGFloat = 64, bottom: CGFloat = 533, firstTop: CGFloat = 236
        let ink = color(0x1D1D1F), grey = color(0x6E6E73), accent = color(0x9C3D2E)
        func font(_ name: String, _ size: CGFloat) -> NSFont {
            NSFont(name: name, size: size) ?? NSFont(name: "Georgia", size: size) ?? NSFont.systemFont(ofSize: size)
        }

        // The essays, each a numeral and a title over its paragraphs. A title is more than 1.35 times the size of the
        // text, which is what makes it a chapter when the PDF is read as Text.
        let text = NSMutableAttributedString()
        let numeralStyle = NSMutableParagraphStyle()
        numeralStyle.paragraphSpacingBefore = 18
        let headingStyle = NSMutableParagraphStyle()
        headingStyle.paragraphSpacing = 6
        var openings: [Int] = []
        for essay in baconEssays() {
            openings.append(text.length)
            text.append(NSAttributedString(string: "ESSAY " + essay.numeral + "\n",
                                           attributes: [.font: font("HoeflerText-Regular", 8), .foregroundColor: accent, .kern: CGFloat(1.8), .paragraphStyle: numeralStyle]))
            text.append(NSAttributedString(string: essay.title + "\n", attributes: [.font: font("HoeflerText-Italic", 15), .foregroundColor: ink, .paragraphStyle: headingStyle]))
            for (index, paragraph) in essay.paragraphs.enumerated() {
                let style = NSMutableParagraphStyle()
                style.alignment = .justified
                style.lineHeightMultiple = 1.16
                style.firstLineHeadIndent = index == 0 ? 0 : 14
                style.hyphenationFactor = 0.9
                text.append(NSAttributedString(string: paragraph + "\n", attributes: [.font: font("HoeflerText-Regular", 11), .foregroundColor: ink, .paragraphStyle: style]))
            }
        }

        // Laid out once in a column as long as it needs, then dealt out to pages a line at a time.
        let storage = NSTextStorage(attributedString: text)
        let layout = NSLayoutManager()
        storage.addLayoutManager(layout)
        let container = NSTextContainer(size: NSSize(width: column, height: 100_000))
        container.lineFragmentPadding = 0
        layout.addTextContainer(container)
        layout.ensureLayout(for: container)

        /// A line of the column: its glyphs, the top and the foot of its letters (ascender to descender, whatever
        /// space its paragraph puts around it), and whether it opens an essay.
        struct Line {
            let glyphs: NSRange
            let top: CGFloat
            let foot: CGFloat
            let opensEssay: Bool
        }
        let openingGlyphs = Set(openings.map { layout.glyphIndexForCharacter(at: $0) })
        var lines: [Line] = []
        var next = 0
        while next < layout.numberOfGlyphs {
            var range = NSRange(location: 0, length: 0)
            let fragment = layout.lineFragmentRect(forGlyphAt: next, effectiveRange: &range)
            guard range.length > 0 else { break }
            let baseline = fragment.minY + layout.location(forGlyphAt: range.location).y
            let character = layout.characterIndexForGlyph(at: range.location)
            let lineFont = (storage.attribute(.font, at: character, effectiveRange: nil) as? NSFont) ?? font("HoeflerText-Regular", 11)
            lines.append(Line(glyphs: range, top: baseline - lineFont.ascender, foot: baseline - lineFont.descender, opensEssay: openingGlyphs.contains(range.location)))
            next = NSMaxRange(range)
        }
        guard !lines.isEmpty else { return nil }

        // Each page takes the lines that fit its block, less an essay's heading that would have fewer than two lines
        // of the essay under it (a heading is a numeral and a title: four lines in all).
        var pages: [Range<Int>] = []
        var first = 0
        while first < lines.count && pages.count < 24 {
            let room = pages.isEmpty ? bottom - firstTop : bottom - top
            var end = first + 1
            while end < lines.count && lines[end].foot - lines[first].top <= room { end += 1 }
            if end < lines.count, let opening = (first + 1..<end).last(where: { lines[$0].opensEssay }), end - opening < 4 { end = opening }
            pages.append(first..<end)
            first = end
        }

        /// How far down each line of a page moves so that its last line ends at the foot of the block: more room
        /// before each essay the page opens (up to 24 points), and what is left shared between all its lines.
        func feathered(_ range: Range<Int>, room: CGFloat) -> [CGFloat] {
            var moves = [CGFloat](repeating: 0, count: range.count)
            guard range.count > 1, let last = range.last else { return moves }
            var short = max(0, room - (lines[last].foot - lines[range.lowerBound].top))
            let breaks = range.dropFirst().filter { lines[$0].opensEssay }.count
            let perBreak: CGFloat = breaks > 0 ? min(24, short / CGFloat(breaks)) : 0
            short -= perBreak * CGFloat(breaks)
            let perLine = short / CGFloat(range.count - 1)
            var moved: CGFloat = 0
            for (k, index) in range.enumerated() where k > 0 {
                moved += perLine
                if lines[index].opensEssay { moved += perBreak }
                moves[k] = moved
            }
            return moves
        }

        // FINIS at the foot of the last page, where its text leaves room for it; else that page is filled like the rest.
        guard let lastPage = pages.last, let lastLine = lastPage.last else { return nil }
        let lastRoom = pages.count == 1 ? bottom - firstTop : bottom - top
        let finis = lastRoom - (lines[lastLine].foot - lines[lastPage.lowerBound].top) >= 36

        let data = NSMutableData()
        var mediaBox = CGRect(origin: .zero, size: page)
        let info: [String: Any] = [
            kCGPDFContextTitle as String: "Essays, Civil and Moral",
            kCGPDFContextAuthor as String: "Francis Bacon",
            kCGPDFContextSubject as String: "Essays",
            kCGPDFContextKeywords as String: "Philosophy, Classics",
        ]
        guard let consumer = CGDataConsumer(data: data as CFMutableData), let context = CGContext(consumer: consumer, mediaBox: &mediaBox, info as CFDictionary) else { return nil }
        func typeset(_ string: String, _ font: NSFont, _ color: NSColor, kern: CGFloat = 0, alignment: NSTextAlignment = .center, in rect: NSRect) {
            attributed(string, font: font, color: color, kern: kern, alignment: alignment).draw(in: rect)
        }
        func rule(from start: NSPoint, to end: NSPoint, color: NSColor, width: CGFloat) {
            let path = NSBezierPath()
            path.move(to: start)
            path.line(to: end)
            path.lineWidth = width
            color.setStroke()
            path.stroke()
        }
        for (index, range) in pages.enumerated() {
            context.beginPDFPage(nil)
            // The text system draws top down, so the page is turned to run that way.
            context.saveGState()
            context.translateBy(x: 0, y: page.height)
            context.scaleBy(x: 1, y: -1)
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
            let blockTop = index == 0 ? firstTop : top
            if index == 0 {
                typeset("FRANCIS BACON", font("HoeflerText-Regular", 9), grey, kern: 2.5, in: NSRect(x: margin, y: 84, width: column, height: 14))
                typeset("Essays", font("HoeflerText-Regular", 38), ink, in: NSRect(x: margin, y: 100, width: column, height: 52))
                typeset("or Counsels, Civil and Moral", font("HoeflerText-Italic", 12.5), grey, in: NSRect(x: margin, y: 152, width: column, height: 20))
                rule(from: NSPoint(x: page.width / 2 - 28, y: 184), to: NSPoint(x: page.width / 2 + 28, y: 184), color: accent, width: 0.8)
                typeset("Ten essays from the edition of 1625: “Of Adversity” and “Of Studies” whole, the rest in part.", font("HoeflerText-Italic", 8.5), grey,
                        in: NSRect(x: margin + 30, y: 194, width: column - 60, height: 30))
            } else {
                typeset("FRANCIS BACON", font("HoeflerText-Regular", 7.5), grey, kern: 1.6, alignment: .left, in: NSRect(x: margin, y: 30, width: column / 2, height: 12))
                typeset("ESSAYS, CIVIL AND MORAL", font("HoeflerText-Regular", 7.5), grey, kern: 1.6, alignment: .right, in: NSRect(x: margin + column / 2, y: 30, width: column / 2, height: 12))
                rule(from: NSPoint(x: margin, y: 44), to: NSPoint(x: page.width - margin, y: 44), color: grey.withAlphaComponent(0.5), width: 0.5)
                typeset("\(index + 1)", font("HoeflerText-Regular", 8.5), grey, in: NSRect(x: margin, y: 555, width: column, height: 12))
            }
            let closing = index == pages.count - 1 && finis
            let moves = closing ? [CGFloat](repeating: 0, count: range.count) : feathered(range, room: bottom - blockTop)
            let shift = blockTop - lines[range.lowerBound].top
            for (k, lineIndex) in range.enumerated() {
                layout.drawGlyphs(forGlyphRange: lines[lineIndex].glyphs, at: NSPoint(x: margin, y: shift + moves[k]))
            }
            if closing {
                typeset("FINIS", font("HoeflerText-Regular", 8), accent, kern: 3, in: NSRect(x: margin, y: bottom - 11, width: column, height: 12))
            }
            NSGraphicsContext.restoreGraphicsState()
            context.restoreGState()
            context.endPDFPage()
        }
        context.closePDF()
        log("the sample PDF has \(pages.count) pages")
        return data as Data
    }

    /// Bacon's own numbers for the essays, from the edition of 1625.
    private static func baconEssays() -> [Essay] {
        [
            Essay(numeral: "I", title: "Of Truth", paragraphs: [
                "What is truth? said jesting Pilate, and would not stay for an answer. Certainly there be, that delight in giddiness, and count it a bondage to fix a belief; affecting free will in thinking, as well as in acting. And though the sects of philosophers of that kind be gone, yet there remain certain discoursing wits, which are of the same veins, though there be not so much blood in them, as was in those of the ancients. But it is not only the difficulty and labor, which men take in finding out of truth, nor again, that when it is found, it imposeth upon men’s thoughts, that doth bring lies in favor; but a natural, though corrupt love, of the lie itself. But I cannot tell; this same truth, is a naked, and open day-light, that doth not show the masks, and mummeries, and triumphs, of the world, half so stately and daintily as candle-lights.",
                "Truth may perhaps come to the price of a pearl, that showeth best by day; but it will not rise to the price of a diamond, or carbuncle, that showeth best in varied lights. A mixture of a lie doth ever add pleasure. Doth any man doubt, that if there were taken out of men’s minds, vain opinions, flattering hopes, false valuations, imaginations as one would, and the like, but it would leave the minds, of a number of men, poor shrunken things, full of melancholy and indisposition, and unpleasing to themselves?",
            ]),
            Essay(numeral: "II", title: "Of Death", paragraphs: [
                "Men fear death, as children fear to go in the dark; and as that natural fear in children, is increased with tales, so is the other. Certainly, the contemplation of death, as the wages of sin, and passage to another world, is holy and religious; but the fear of it, as a tribute due unto nature, is weak.",
                "It is worthy the observing, that there is no passion in the mind of man, so weak, but it mates, and masters, the fear of death; and therefore, death is no such terrible enemy, when a man hath so many attendants about him, that can win the combat of him. Revenge triumphs over death; love slights it; honor aspireth to it; grief flieth to it; fear preoccupateth it.",
            ]),
            Essay(numeral: "IV", title: "Of Revenge", paragraphs: [
                "Revenge is a kind of wild justice; which the more man’s nature runs to, the more ought law to weed it out. For as for the first wrong, it doth but offend the law; but the revenge of that wrong, putteth the law out of office. Certainly, in taking revenge, a man is but even with his enemy; but in passing it over, he is superior; for it is a prince’s part to pardon. And Solomon, I am sure, saith, It is the glory of a man, to pass by an offence.",
            ]),
            Essay(numeral: "V", title: "Of Adversity", paragraphs: [
                "It was an high speech of Seneca (after the manner of the Stoics), that the good things, which belong to prosperity, are to be wished; but the good things, that belong to adversity, are to be admired. Bona rerum secundarum optabilia; adversarum mirabilia. Certainly if miracles be the command over nature, they appear most in adversity. It is yet a higher speech of his, than the other (much too high for a heathen), It is true greatness, to have in one the frailty of a man, and the security of a God. Vere magnum habere fragilitatem hominis, securitatem Dei. This would have done better in poesy, where transcendences are more allowed. And the poets indeed have been busy with it; for it is in effect the thing, which figured in that strange fiction of the ancient poets, which seemeth not to be without mystery; nay, and to have some approach to the state of a Christian; that Hercules, when he went to unbind Prometheus (by whom human nature is represented), sailed the length of the great ocean, in an earthen pot or pitcher; lively describing Christian resolution, that saileth in the frail bark of the flesh, through the waves of the world.",
                "But to speak in a mean. The virtue of prosperity, is temperance; the virtue of adversity, is fortitude; which in morals is the more heroical virtue. Prosperity is the blessing of the Old Testament; adversity is the blessing of the New; which carrieth the greater benediction, and the clearer revelation of God’s favor. Yet even in the Old Testament, if you listen to David’s harp, you shall hear as many hearse-like airs as carols; and the pencil of the Holy Ghost hath labored more in describing the afflictions of Job, than the felicities of Solomon. Prosperity is not without many fears and distastes; and adversity is not without comforts and hopes. We see in needle-works and embroideries, it is more pleasing to have a lively work, upon a sad and solemn ground, than to have a dark and melancholy work, upon a lightsome ground: judge therefore of the pleasure of the heart, by the pleasure of the eye. Certainly virtue is like precious odors, most fragrant when they are incensed, or crushed: for prosperity doth best discover vice, but adversity doth best discover virtue.",
            ]),
            Essay(numeral: "VII", title: "Of Parents and Children", paragraphs: [
                "The joys of parents are secret; and so are their griefs and fears. They cannot utter the one; nor they will not utter the other. Children sweeten labors; but they make misfortunes more bitter. They increase the cares of life; but they mitigate the remembrance of death. The perpetuity by generation is common to beasts; but memory, merit, and noble works, are proper to men. And surely a man shall see the noblest works and foundations have proceeded from childless men; which have sought to express the images of their minds, where those of their bodies have failed. So the care of posterity is most in them, that have no posterity.",
            ]),
            Essay(numeral: "VIII", title: "Of Marriage and Single Life", paragraphs: [
                "He that hath wife and children hath given hostages to fortune; for they are impediments to great enterprises, either of virtue or mischief. Certainly the best works, and of greatest merit for the public, have proceeded from the unmarried or childless men; which both in affection and means, have married and endowed the public. Yet it were great reason that those that have children, should have greatest care of future times; unto which they know they must transmit their dearest pledges.",
            ]),
            Essay(numeral: "XI", title: "Of Great Place", paragraphs: [
                "Men in great place are thrice servants: servants of the sovereign or state; servants of fame; and servants of business. So as they have no freedom; neither in their persons, nor in their actions, nor in their times. It is a strange desire, to seek power and to lose liberty: or to seek power over others, and to lose power over a man’s self.",
            ]),
            Essay(numeral: "XVIII", title: "Of Travel", paragraphs: [
                "Travel, in the younger sort, is a part of education; in the elder, a part of experience. He that travelleth into a country, before he hath some entrance into the language, goeth to school, and not to travel. That young men travel under some tutor, or grave servant, I allow well; so that he be such a one that hath the language, and hath been in the country before; whereby he may be able to tell them what things are worthy to be seen, in the country where they go; what acquaintances they are to seek; what exercises, or discipline, the place yieldeth. For else, young men shall go hooded, and look abroad little.",
            ]),
            Essay(numeral: "XLVI", title: "Of Gardens", paragraphs: [
                "God Almighty first planted a garden. And indeed it is the purest of human pleasures. It is the greatest refreshment to the spirits of man; without which, buildings and palaces are but gross handiworks; and a man shall ever see, that when ages grow to civility and elegancy, men come to build stately sooner than to garden finely; as if gardening were the greater perfection. I do hold it, in the royal ordering of gardens, there ought to be gardens, for all the months in the year; in which severally things of beauty may be then in season.",
            ]),
            Essay(numeral: "L", title: "Of Studies", paragraphs: [
                "Studies serve for delight, for ornament, and for ability. Their chief use for delight, is in privateness and retiring; for ornament, is in discourse; and for ability, is in the judgment, and disposition of business. For expert men can execute, and perhaps judge of particulars, one by one; but the general counsels, and the plots and marshalling of affairs, come best, from those that are learned. To spend too much time in studies is sloth; to use them too much for ornament, is affectation; to make judgment wholly by their rules, is the humor of a scholar. They perfect nature, and are perfected by experience: for natural abilities are like natural plants, that need proyning, by study; and studies themselves, do give forth directions too much at large, except they be bounded in by experience.",
                "Crafty men contemn studies, simple men admire them, and wise men use them; for they teach not their own use; but that is a wisdom without them, and above them, won by observation. Read not to contradict and confute; nor to believe and take for granted; nor to find talk and discourse; but to weigh and consider. Some books are to be tasted, others to be swallowed, and some few to be chewed and digested; that is, some books are to be read only in parts; others to be read, but not curiously; and some few to be read wholly, and with diligence and attention. Some books also may be read by deputy, and extracts made of them by others; but that would be only in the less important arguments, and the meaner sort of books, else distilled books are like common distilled waters, flashy things.",
                "Reading maketh a full man; conference a ready man; and writing an exact man. And therefore, if a man write little, he had need have a great memory; if he confer little, he had need have a present wit: and if he read little, he had need have much cunning, to seem to know, that he doth not. Histories make men wise; poets witty; the mathematics subtile; natural philosophy deep; moral grave; logic and rhetoric able to contend. Abeunt studia in mores.",
                "Nay, there is no stond or impediment in the wit, but may be wrought out by fit studies; like as diseases of the body, may have appropriate exercises. Bowling is good for the stone and reins; shooting for the lungs and breast; gentle walking for the stomach; riding for the head; and the like. So if a man’s wit be wandering, let him study the mathematics; for in demonstrations, if his wit be called away never so little, he must begin again. If his wit be not apt to distinguish or find differences, let him study the Schoolmen; for they are cymini sectores. If he be not apt to beat over matters, and to call up one thing to prove and illustrate another, let him study the lawyers’ cases. So every defect of the mind, may have a special receipt.",
            ]),
        ]
    }

    // MARK: - The books

    /// One chapter of a sample: its heading and the opening paragraphs of the real text.
    private struct Part {
        let label: String?
        let title: String?
        let paragraphs: [String]

        /// As the contents list names the chapter, and a highlight's chapter with it.
        var heading: String { [label, title].compactMap { $0 }.joined(separator: ": ") }
        /// The section's text as the reader counts places in it: the heading's words, then the paragraphs, nothing between.
        var text: String { (label ?? "") + (title ?? "") + paragraphs.joined() }
        var chapter: EPUBChapter { EPUBChapter(label: label, title: title, html: paragraphs.map { "<p>" + XHTML.escape($0) + "</p>" }.joined()) }
    }

    private struct Classic {
        let slug: String
        let title: String
        let author: String
        let subjects: [String]
        let blurb: String
        /// The whole book's length in words, for the shelves' lengths and times left.
        let words: Int
        let jacket: Jacket
        let parts: [Part]
    }

    private static func sampleClassics() -> [Classic] {
        [pride(), moby(), frankenstein(), timeMachine(), warOfTheWorlds(), alice(), taleOfTwoCities(), dracula(), sherlock(), janeEyre(), dorianGray(), greatExpectations(), walden(), odyssey()]
    }

    private static func pride() -> Classic {
        Classic(slug: "pride", title: "Pride and Prejudice", author: "Jane Austen", subjects: ["Classics", "Romance", "Domestic fiction"],
                blurb: "Elizabeth Bennet, her four sisters and a mother set on marrying them well: Austen’s comedy of first impressions and second thoughts.",
                words: 122_000,
                jacket: Jacket(top: 0xF7ECE6, bottom: 0xE8CCC1, ink: 0x5B2333, accent: 0xB5838D, motif: .rings, titleFont: "Didot-Italic", authorFont: "AvenirNext-Medium"),
                parts: [
                    Part(label: nil, title: "Chapter I", paragraphs: [
                        "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.",
                        "However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.",
                        "“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”",
                        "Mr. Bennet replied that he had not.",
                        "“But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.”",
                        "Mr. Bennet made no answer.",
                        "“Do you not want to know who has taken it?” cried his wife impatiently.",
                        "“You want to tell me, and I have no objection to hearing it.”",
                        "This was invitation enough.",
                        "“Why, my dear, you must know, Mrs. Long says that Netherfield is taken by a young man of large fortune from the north of England; that he came down on Monday in a chaise and four to see the place, and was so much delighted with it, that he agreed with Mr. Morris immediately; that he is to take possession before Michaelmas, and some of his servants are to be in the house by the end of next week.”",
                        "“What is his name?”",
                        "“Bingley.”",
                        "“Is he married or single?”",
                        "“Oh! Single, my dear, to be sure! A single man of large fortune; four or five thousand a year. What a fine thing for our girls!”",
                        "“How so? How can it affect them?”",
                        "“My dear Mr. Bennet,” replied his wife, “how can you be so tiresome! You must know that I am thinking of his marrying one of them.”",
                        "“Is that his design in settling here?”",
                        "“Design! Nonsense, how can you talk so! But it is very likely that he may fall in love with one of them, and therefore you must visit him as soon as he comes.”",
                        "“I see no occasion for that. You and the girls may go, or you may send them by themselves, which perhaps will be still better, for as you are as handsome as any of them, Mr. Bingley may like you the best of the party.”",
                        "“My dear, you flatter me. I certainly have had my share of beauty, but I do not pretend to be anything extraordinary now. When a woman has five grown-up daughters, she ought to give over thinking of her own beauty.”",
                        "“In such cases, a woman has not often much beauty to think of.”",
                        "“But, my dear, you must indeed go and see Mr. Bingley when he comes into the neighbourhood.”",
                        "“It is more than I engage for, I assure you.”",
                        "“But consider your daughters. Only think what an establishment it would be for one of them. Sir William and Lady Lucas are determined to go, merely on that account, for in general, you know, they visit no newcomers. Indeed you must go, for it will be impossible for us to visit him if you do not.”",
                        "“You are over-scrupulous, surely. I dare say Mr. Bingley will be very glad to see you; and I will send a few lines by you to assure him of my hearty consent to his marrying whichever he chooses of the girls; though I must throw in a good word for my little Lizzy.”",
                        "“I desire you will do no such thing. Lizzy is not a bit better than the others; and I am sure she is not half so handsome as Jane, nor half so good-humoured as Lydia. But you are always giving her the preference.”",
                        "“They have none of them much to recommend them,” replied he; “they are all silly and ignorant like other girls; but Lizzy has something more of quickness than her sisters.”",
                        "“Mr. Bennet, how can you abuse your own children in such a way? You take delight in vexing me. You have no compassion for my poor nerves.”",
                        "“You mistake me, my dear. I have a high respect for your nerves. They are my old friends. I have heard you mention them with consideration these last twenty years at least.”",
                        "“Ah, you do not know what I suffer.”",
                        "“But I hope you will get over it, and live to see many young men of four thousand a year come into the neighbourhood.”",
                        "“It will be no use to us, if twenty such should come, since you will not visit them.”",
                        "“Depend upon it, my dear, that when there are twenty, I will visit them all.”",
                        "Mr. Bennet was so odd a mixture of quick parts, sarcastic humour, reserve, and caprice, that the experience of three-and-twenty years had been insufficient to make his wife understand his character. Her mind was less difficult to develop. She was a woman of mean understanding, little information, and uncertain temper. When she was discontented, she fancied herself nervous. The business of her life was to get her daughters married; its solace was visiting and news.",
                    ]),
                    Part(label: nil, title: "Chapter II", paragraphs: [
                        "Mr. Bennet was among the earliest of those who waited on Mr. Bingley. He had always intended to visit him, though to the last always assuring his wife that he should not go; and till the evening after the visit was paid she had no knowledge of it. It was then disclosed in the following manner. Observing his second daughter employed in trimming a hat, he suddenly addressed her with:",
                        "“I hope Mr. Bingley will like it, Lizzy.”",
                        "“We are not in a way to know what Mr. Bingley likes,” said her mother resentfully, “since we are not to visit.”",
                        "“But you forget, mamma,” said Elizabeth, “that we shall meet him at the assemblies, and that Mrs. Long promised to introduce him.”",
                        "“I do not believe Mrs. Long will do any such thing. She has two nieces of her own. She is a selfish, hypocritical woman, and I have no opinion of her.”",
                        "“No more have I,” said Mr. Bennet; “and I am glad to find that you do not depend on her serving you.”",
                        "Mrs. Bennet deigned not to make any reply, but, unable to contain herself, began scolding one of her daughters.",
                        "“Don’t keep coughing so, Kitty, for Heaven’s sake! Have a little compassion on my nerves. You tear them to pieces.”",
                        "“Kitty has no discretion in her coughs,” said her father; “she times them ill.”",
                        "“I do not cough for my own amusement,” replied Kitty fretfully. “When is your next ball to be, Lizzy?”",
                        "“To-morrow fortnight.”",
                        "“Aye, so it is,” cried her mother, “and Mrs. Long does not come back till the day before; so it will be impossible for her to introduce him, for she will not know him herself.”",
                        "“Then, my dear, you may have the advantage of your friend, and introduce Mr. Bingley to her.”",
                        "“Impossible, Mr. Bennet, impossible, when I am not acquainted with him myself; how can you be so teasing?”",
                        "“I honour your circumspection. A fortnight’s acquaintance is certainly very little. One cannot know what a man really is by the end of a fortnight. But if we do not venture somebody else will; and after all, Mrs. Long and her nieces must stand their chance; and, therefore, as she will think it an act of kindness, if you decline the office, I will take it on myself.”",
                        "The girls stared at their father. Mrs. Bennet said only, “Nonsense, nonsense!”",
                        "“What can be the meaning of that emphatic exclamation?” cried he. “Do you consider the forms of introduction, and the stress that is laid on them, as nonsense? I cannot quite agree with you there. What say you, Mary? For you are a young lady of deep reflection, I know, and read great books and make extracts.”",
                        "Mary wished to say something sensible, but knew not how.",
                        "“While Mary is adjusting her ideas,” he continued, “let us return to Mr. Bingley.”",
                        "“I am sick of Mr. Bingley,” cried his wife.",
                        "“I am sorry to hear that; but why did not you tell me that before? If I had known as much this morning I certainly would not have called on him. It is very unlucky; but as I have actually paid the visit, we cannot escape the acquaintance now.”",
                        "The astonishment of the ladies was just what he wished; that of Mrs. Bennet perhaps surpassing the rest; though, when the first tumult of joy was over, she began to declare that it was what she had expected all the while.",
                        "“How good it was in you, my dear Mr. Bennet! But I knew I should persuade you at last. I was sure you loved your girls too well to neglect such an acquaintance. Well, how pleased I am! and it is such a good joke, too, that you should have gone this morning and never said a word about it till now.”",
                        "“Now, Kitty, you may cough as much as you choose,” said Mr. Bennet; and, as he spoke, he left the room, fatigued with the raptures of his wife.",
                        "“What an excellent father you have, girls!” said she, when the door was shut. “I do not know how you will ever make him amends for his kindness; or me, either, for that matter. At our time of life it is not so pleasant, I can tell you, to be making new acquaintances every day; but for your sakes, we would do anything. Lydia, my love, though you are the youngest, I dare say Mr. Bingley will dance with you at the next ball.”",
                        "“Oh!” said Lydia stoutly, “I am not afraid; for though I am the youngest, I’m the tallest.”",
                        "The rest of the evening was spent in conjecturing how soon he would return Mr. Bennet’s visit, and determining when they should ask him to dinner.",
                    ]),
                    Part(label: nil, title: "Chapter III", paragraphs: [
                        "Not all that Mrs. Bennet, however, with the assistance of her five daughters, could ask on the subject, was sufficient to draw from her husband any satisfactory description of Mr. Bingley. They attacked him in various ways—with barefaced questions, ingenious suppositions, and distant surmises; but he eluded the skill of them all, and they were at last obliged to accept the second-hand intelligence of their neighbour, Lady Lucas. Her report was highly favourable. Sir William had been delighted with him. He was quite young, wonderfully handsome, extremely agreeable, and, to crown the whole, he meant to be at the next assembly with a large party. Nothing could be more delightful! To be fond of dancing was a certain step towards falling in love; and very lively hopes of Mr. Bingley’s heart were entertained.",
                        "“If I can but see one of my daughters happily settled at Netherfield,” said Mrs. Bennet to her husband, “and all the others equally well married, I shall have nothing to wish for.”",
                        "In a few days Mr. Bingley returned Mr. Bennet’s visit, and sat about ten minutes with him in his library. He had entertained hopes of being admitted to a sight of the young ladies, of whose beauty he had heard much; but he saw only the father. The ladies were somewhat more fortunate, for they had the advantage of ascertaining from an upper window that he wore a blue coat, and rode a black horse.",
                    ]),
                ])
    }

    private static func moby() -> Classic {
        Classic(slug: "moby", title: "Moby-Dick", author: "Herman Melville", subjects: ["Sea stories", "Adventure", "Classics"],
                blurb: "Ishmael signs on to the whaler Pequod and finds himself sailing under Captain Ahab, whose one purpose is the white whale that took his leg.",
                words: 206_000,
                jacket: Jacket(top: 0x0B2545, bottom: 0x134074, ink: 0xEEF4ED, accent: 0x8DA9C4, motif: .waves, titleFont: "Baskerville-SemiBold", authorFont: "GillSans"),
                parts: [
                    Part(label: "Chapter 1", title: "Loomings", paragraphs: [
                        "Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people’s hats off—then, I account it high time to get to sea as soon as I can. This is my substitute for pistol and ball. With a philosophical flourish Cato throws himself upon his sword; I quietly take to the ship. There is nothing surprising in this. If they but knew it, almost all men in their degree, some time or other, cherish very nearly the same feelings towards the ocean with me.",
                        "There now is your insular city of the Manhattoes, belted round by wharves as Indian isles by coral reefs—commerce surrounds it with her surf. Right and left, the streets take you waterward. Its extreme downtown is the battery, where that noble mole is washed by waves, and cooled by breezes, which a few hours previous were out of sight of land. Look at the crowds of water-gazers there.",
                        "Circumambulate the city of a dreamy Sabbath afternoon. Go from Corlears Hook to Coenties Slip, and from thence, by Whitehall, northward. What do you see?—Posted like silent sentinels all around the town, stand thousands upon thousands of mortal men fixed in ocean reveries. Some leaning against the spiles; some seated upon the pier-heads; some looking over the bulwarks of ships from China; some high aloft in the rigging, as if striving to get a still better seaward peep. But these are all landsmen; of week days pent up in lath and plaster—tied to counters, nailed to benches, clinched to desks. How then is this? Are the green fields gone? What do they here?",
                    ]),
                    Part(label: "Chapter 2", title: "The Carpet-Bag", paragraphs: [
                        "I stuffed a shirt or two into my old carpet-bag, tucked it under my arm, and started for Cape Horn and the Pacific. Quitting the good city of old Manhatto, I duly arrived in New Bedford. It was a Saturday night in December. Much was I disappointed upon learning that the little packet for Nantucket had already sailed, and that no way of reaching that place would offer, till the following Monday.",
                        "As most young candidates for the pains and penalties of whaling stop at this same New Bedford, thence to embark on their voyage, it may as well be related that I, for one, had no idea of so doing. For my mind was made up to sail in no other than a Nantucket craft, because there was a fine, boisterous something about everything connected with that famous old island, which amazingly pleased me.",
                    ]),
                    Part(label: "Chapter 3", title: "The Spouter-Inn", paragraphs: [
                        "Entering that gable-ended Spouter-Inn, you found yourself in a wide, low, straggling entry with old-fashioned wainscots, reminding one of the bulwarks of some condemned old craft. On one side hung a very large oil-painting so thoroughly besmoked, and every way defaced, that in the unequal cross-lights by which you viewed it, it was only by diligent study and a series of systematic visits to it, and careful inquiry of the neighbors, that you could any way arrive at an understanding of its purpose.",
                    ]),
                ])
    }

    private static func frankenstein() -> Classic {
        Classic(slug: "frankenstein", title: "Frankenstein", author: "Mary Shelley", subjects: ["Science fiction", "Gothic fiction", "Horror"],
                blurb: "A young scientist gives life to a creature of his own making, and spends the rest of his days pursued by what he has done.",
                words: 75_000,
                jacket: Jacket(top: 0x0E1A13, bottom: 0x1F3B2C, ink: 0xDCEFD0, accent: 0x9BE564, motif: .bolt, titleFont: "Copperplate-Bold", authorFont: "Optima-Regular", capitals: true),
                parts: [
                    Part(label: "Letter 1", title: "To Mrs. Saville, England", paragraphs: [
                        "St. Petersburgh, Dec. 11th, 17—.",
                        "You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings. I arrived here yesterday, and my first task is to assure my dear sister of my welfare and increasing confidence in the success of my undertaking.",
                        "I am already far north of London, and as I walk in the streets of Petersburgh, I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight. Do you understand this feeling? This breeze, which has travelled from the regions towards which I am advancing, gives me a foretaste of those icy climes. Inspirited by this wind of promise, my daydreams become more fervent and vivid. I try in vain to be persuaded that the pole is the seat of frost and desolation; it ever presents itself to my imagination as the region of beauty and delight. There, Margaret, the sun is for ever visible, its broad disk just skirting the horizon and diffusing a perpetual splendour.",
                    ]),
                    Part(label: nil, title: "Chapter 1", paragraphs: [
                        "I am by birth a Genevese, and my family is one of the most distinguished of that republic. My ancestors had been for many years counsellors and syndics, and my father had filled several public situations with honour and reputation. He was respected by all who knew him for his integrity and indefatigable attention to public business. He passed his younger days perpetually occupied by the affairs of his country; a variety of circumstances had prevented his marrying early, nor was it until the decline of life that he became a husband and the father of a family.",
                    ]),
                    Part(label: nil, title: "Chapter 5", paragraphs: [
                        "It was on a dreary night of November that I beheld the accomplishment of my toils. With an anxiety that almost amounted to agony, I collected the instruments of life around me, that I might infuse a spark of being into the lifeless thing that lay at my feet. It was already one in the morning; the rain pattered dismally against the panes, and my candle was nearly burnt out, when, by the glimmer of the half-extinguished light, I saw the dull yellow eye of the creature open; it breathed hard, and a convulsive motion agitated its limbs.",
                        "How can I describe my emotions at this catastrophe, or how delineate the wretch whom with such infinite pains and care I had endeavoured to form? His limbs were in proportion, and I had selected his features as beautiful. Beautiful! Great God! His yellow skin scarcely covered the work of muscles and arteries beneath; his hair was of a lustrous black, and flowing; his teeth of a pearly whiteness; but these luxuriances only formed a more horrid contrast with his watery eyes, that seemed almost of the same colour as the dun-white sockets in which they were set, his shrivelled complexion and straight black lips.",
                    ]),
                ])
    }

    private static func timeMachine() -> Classic {
        Classic(slug: "time", title: "The Time Machine", author: "H. G. Wells", subjects: ["Science fiction", "Time travel"],
                blurb: "A Victorian inventor travels to the year 802,701 and finds humanity divided into the gentle Eloi above ground and the Morlocks below.",
                words: 32_000,
                jacket: Jacket(top: 0x2A1B0C, bottom: 0x4A3219, ink: 0xF2D492, accent: 0xC9A227, motif: .clock, titleFont: "Futura-Medium", authorFont: "Futura-Medium", capitals: true),
                parts: [
                    Part(label: nil, title: "Chapter I", paragraphs: [
                        "The Time Traveller (for so it will be convenient to speak of him) was expounding a recondite matter to us. His grey eyes shone and twinkled, and his usually pale face was flushed and animated. The fire burned brightly, and the soft radiance of the incandescent lights in the lilies of silver caught the bubbles that flashed and passed in our glasses. Our chairs, being his patents, embraced and caressed us rather than submitted to be sat upon, and there was that luxurious after-dinner atmosphere when thought roams gracefully free of the trammels of precision. And he put it to us in this way—marking the points with a lean forefinger—as we sat and lazily admired his earnestness over this new paradox (as we thought it) and his fecundity.",
                        "“You must follow me carefully. I shall have to controvert one or two ideas that are almost universally accepted. The geometry, for instance, they taught you at school is founded on a misconception.”",
                        "“Is not that rather a large thing to expect us to begin upon?” said Filby, an argumentative person with red hair.",
                        "“I do not mean to ask you to accept anything without reasonable ground for it. You will soon admit as much as I need from you. You know of course that a mathematical line, a line of thickness nil, has no real existence. They taught you that? Neither has a mathematical plane. These things are mere abstractions.”",
                        "“That is all right,” said the Psychologist.",
                        "“Nor, having only length, breadth, and thickness, can a cube have a real existence.”",
                        "“There I object,” said Filby. “Of course a solid body may exist. All real things—”",
                        "“So most people think. But wait a moment. Can an instantaneous cube exist?”",
                        "“Don’t follow you,” said Filby.",
                        "“Can a cube that does not last for any time at all, have a real existence?”",
                        "Filby became pensive. “Clearly,” the Time Traveller proceeded, “any real body must have extension in four directions: it must have Length, Breadth, Thickness, and—Duration.”",
                    ]),
                    Part(label: nil, title: "Chapter II", paragraphs: [
                        "I think that at that time none of us quite believed in the Time Machine. The fact is, the Time Traveller was one of those men who are too clever to be believed: you never felt that you saw all round him; you always suspected some subtle reserve, some ingenuity in ambush, behind his lucid frankness. Had Filby shown the model and explained the matter in the Time Traveller’s words, we should have shown him far less scepticism.",
                    ]),
                    Part(label: nil, title: "Chapter III", paragraphs: [
                        "“I told some of you last Thursday of the principles of the Time Machine, and showed you the actual thing itself, incomplete in the workshop. There it is now, a little travel-worn, truly; and one of the ivory bars is cracked, and a brass rail bent; but the rest of it’s sound enough.”",
                    ]),
                ])
    }

    private static func warOfTheWorlds() -> Classic {
        Classic(slug: "war", title: "The War of the Worlds", author: "H. G. Wells", subjects: ["Science fiction", "Martians", "Invasion"],
                blurb: "Cylinders fall on the common near Woking, and out of them come the Martians and their fighting machines.",
                words: 60_000,
                jacket: Jacket(top: 0x240606, bottom: 0xB23A0B, ink: 0xFFE8D6, accent: 0x1A0404, motif: .tripod, titleFont: "Futura-Bold", authorFont: "Futura-Medium", capitals: true),
                parts: [
                    Part(label: "Chapter I", title: "The Eve of the War", paragraphs: [
                        "No one would have believed in the last years of the nineteenth century that this world was being watched keenly and closely by intelligences greater than man’s and yet as mortal as his own; that as men busied themselves about their various concerns they were scrutinised and studied, perhaps almost as narrowly as a man with a microscope might scrutinise the transient creatures that swarm and multiply in a drop of water. With infinite complacency men went to and fro over this globe about their little affairs, serene in their assurance of their empire over matter. It is possible that the infusoria under the microscope do the same. No one gave a thought to the older worlds of space as sources of human danger, or thought of them only to dismiss the idea of life upon them as impossible or improbable. It is curious to recall some of the mental habits of those departed days. At most terrestrial men fancied there might be other men upon Mars, perhaps inferior to themselves and ready to welcome a missionary enterprise. Yet across the gulf of space, minds that are to our minds as ours are to those of the beasts that perish, intellects vast and cool and unsympathetic, regarded this earth with envious eyes, and slowly and surely drew their plans against us. And early in the twentieth century came the great disillusionment.",
                        "The planet Mars, I scarcely need remind the reader, revolves about the sun at a mean distance of 140,000,000 miles, and the light and heat it receives from the sun is barely half of that received by this world. It must be, if the nebular hypothesis has any truth, older than our world; and long before this earth ceased to be molten, life upon its surface must have begun its course.",
                    ]),
                    Part(label: "Chapter II", title: "The Falling Star", paragraphs: [
                        "Then came the night of the first falling star. It was seen early in the morning, rushing over Winchester eastward, a line of flame high in the atmosphere. Hundreds must have seen it, and taken it for an ordinary falling star. Albin described it as leaving a greenish streak behind it that glowed for some seconds. Denning, our greatest authority on meteorites, stated that the height of its first appearance was about ninety or one hundred miles. It seemed to him that it fell to earth about one hundred miles east of him.",
                    ]),
                ])
    }

    private static func alice() -> Classic {
        Classic(slug: "alice", title: "Alice’s Adventures in Wonderland", author: "Lewis Carroll", subjects: ["Adventure stories", "Fantasy", "Children’s stories"],
                blurb: "Alice follows a White Rabbit down a hole into a world where nothing, least of all she herself, stays the same size for long.",
                words: 26_500,
                jacket: Jacket(top: 0xE3F4F1, bottom: 0xB7E0DA, ink: 0x173F4F, accent: 0xD62839, motif: .checks, titleFont: "Cochin-Bold", authorFont: "Cochin"),
                parts: [
                    Part(label: "Chapter I", title: "Down the Rabbit-Hole", paragraphs: [
                        "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, “and what is the use of a book,” thought Alice “without pictures or conversations?”",
                        "So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.",
                        "There was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, “Oh dear! Oh dear! I shall be late!” (when she thought it over afterwards, it occurred to her that she ought to have wondered at this, but at the time it all seemed quite natural); but when the Rabbit actually took a watch out of its waistcoat-pocket, and looked at it, and then hurried on, Alice started to her feet, for it flashed across her mind that she had never before seen a rabbit with either a waistcoat-pocket, or a watch to take out of it, and burning with curiosity, she ran across the field after it, and fortunately was just in time to see it pop down a large rabbit-hole under the hedge.",
                        "In another moment down went Alice after it, never once considering how in the world she was to get out again.",
                        "The rabbit-hole went straight on like a tunnel for some way, and then dipped suddenly down, so suddenly that Alice had not a moment to think about stopping herself before she found herself falling down a very deep well.",
                        "Either the well was very deep, or she fell very slowly, for she had plenty of time as she went down to look about her and to wonder what was going to happen next.",
                    ]),
                    Part(label: "Chapter II", title: "The Pool of Tears", paragraphs: [
                        "“Curiouser and curiouser!” cried Alice (she was so much surprised, that for the moment she quite forgot how to speak good English); “now I’m opening out like the largest telescope that ever was! Good-bye, feet!” (for when she looked down at her feet, they seemed to be almost out of sight, they were getting so far off).",
                    ]),
                    Part(label: "Chapter III", title: "A Caucus-Race and a Long Tale", paragraphs: [
                        "They were indeed a queer-looking party that assembled on the bank—the birds with draggled feathers, the animals with their fur clinging close to them, and all dripping wet, cross, and uncomfortable.",
                    ]),
                ])
    }

    private static func taleOfTwoCities() -> Classic {
        Classic(slug: "tale", title: "A Tale of Two Cities", author: "Charles Dickens", subjects: ["Classics", "Historical fiction", "French Revolution"],
                blurb: "London and Paris before and during the Revolution, and the lives of Charles Darnay, Lucie Manette and Sydney Carton.",
                words: 135_000,
                jacket: Jacket(top: 0x1D3557, bottom: 0x14213D, ink: 0xF1FAEE, accent: 0x9B2226, motif: .split, titleFont: "BodoniSvtyTwoITCTT-Bold", authorFont: "BodoniSvtyTwoITCTT-Book"),
                parts: [
                    Part(label: "Chapter I", title: "The Period", paragraphs: [
                        "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair, we had everything before us, we had nothing before us, we were all going direct to Heaven, we were all going direct the other way—in short, the period was so far like the present period, that some of its noisiest authorities insisted on its being received, for good or for evil, in the superlative degree of comparison only.",
                        "There were a king with a large jaw and a queen with a plain face, on the throne of England; there were a king with a large jaw and a queen with a fair face, on the throne of France. In both countries it was clearer than crystal to the lords of the State preserves of loaves and fishes, that things in general were settled for ever.",
                        "It was the year of Our Lord one thousand seven hundred and seventy-five. Spiritual revelations were conceded to England at that favoured period, as at this.",
                    ]),
                    Part(label: "Chapter II", title: "The Mail", paragraphs: [
                        "It was the Dover road that lay, on a Friday night late in November, before the first of the persons with whom this history has business. The Dover road lay, as to him, beyond the Dover mail, as it lumbered up Shooter’s Hill. He walked up hill in the mire by the side of the mail, as the rest of the passengers did; not because they had the least relish for walking exercise, under the circumstances, but because the hill, and the harness, and the mud, and the mail, were all so heavy, that the horses had three times already come to a stop, besides once drawing the coach across the road, with the mutinous intent of taking it back to Blackheath.",
                    ]),
                    Part(label: "Chapter III", title: "The Night Shadows", paragraphs: [
                        "A wonderful fact to reflect upon, that every human creature is constituted to be that profound secret and mystery to every other. A solemn consideration, when I enter a great city by night, that every one of those darkly clustered houses encloses its own secret; that every room in every one of them encloses its own secret; that every beating heart in the hundreds of thousands of breasts there, is, in some of its imaginings, a secret to the heart nearest it!",
                    ]),
                ])
    }

    private static func dracula() -> Classic {
        Classic(slug: "dracula", title: "Dracula", author: "Bram Stoker", subjects: ["Horror", "Vampires", "Gothic fiction"],
                blurb: "Told in journals, letters and cuttings: a Transylvanian count comes to England, and a small band sets out to stop him.",
                words: 160_000,
                jacket: Jacket(top: 0x1A0A10, bottom: 0x050505, ink: 0xF3E6E8, accent: 0x9D0208, motif: .arch, titleFont: "HoeflerText-Black", authorFont: "HoeflerText-Regular", capitals: true),
                parts: [
                    Part(label: "Chapter I", title: "Jonathan Harker’s Journal", paragraphs: [
                        "(Kept in shorthand.)",
                        "3 May. Bistritz.—Left Munich at 8:35 P. M., on 1st May, arriving at Vienna early next morning; should have arrived at 6:46, but train was an hour late. Buda-Pesth seems a wonderful place, from the glimpse which I got of it from the train and the little I could walk through the streets. I feared to go very far from the station, as we had arrived late and would start as near the correct time as possible. The impression I had was that we were leaving the West and entering the East; the most western of splendid bridges over the Danube, which is here of noble width and depth, took us among the traditions of Turkish rule.",
                        "We left in pretty good time, and came after nightfall to Klausenburgh. Here I stopped for the night at the Hotel Royale. I had for dinner, or rather supper, a chicken done up some way with red pepper, which was very good but thirsty. (Mem., get recipe for Mina.)",
                    ]),
                    Part(label: "Chapter II", title: "Jonathan Harker’s Journal—continued", paragraphs: [
                        "5 May.—I must have been asleep, for certainly if I had been fully awake I must have noticed the approach of such a remarkable place. In the gloom the courtyard looked of considerable size, and as several dark ways led from it under great round arches, it perhaps seemed bigger than it really is. I have not yet been able to see it by daylight.",
                    ]),
                    Part(label: "Chapter III", title: "Jonathan Harker’s Journal—continued", paragraphs: [
                        "When I found that I was a prisoner a sort of wild feeling came over me. I rushed up and down the stairs, trying every door and peering out of every window I could find; but after a little the conviction of my helplessness overpowered all other feelings.",
                    ]),
                ])
    }

    private static func sherlock() -> Classic {
        Classic(slug: "sherlock", title: "The Adventures of Sherlock Holmes", author: "Arthur Conan Doyle", subjects: ["Detective and mystery stories", "Short stories"],
                blurb: "Twelve cases for the consulting detective of Baker Street, told by his friend Dr. Watson.",
                words: 105_000,
                jacket: Jacket(top: 0xF1DDA0, bottom: 0xE0B94F, ink: 0x2B2118, accent: 0x6B4226, motif: .lens, titleFont: "Rockwell-Bold", authorFont: "Rockwell-Regular"),
                parts: [
                    Part(label: "Adventure I", title: "A Scandal in Bohemia", paragraphs: [
                        "To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex. It was not that he felt any emotion akin to love for Irene Adler. All emotions, and that one particularly, were abhorrent to his cold, precise but admirably balanced mind. He was, I take it, the most perfect reasoning and observing machine that the world has seen, but as a lover he would have placed himself in a false position. He never spoke of the softer passions, save with a gibe and a sneer. They were admirable things for the observer—excellent for drawing the veil from men’s motives and actions. But for the trained reasoner to admit such intrusions into his own delicate and finely adjusted temperament was to introduce a distracting factor which might throw a doubt upon all his mental results. Grit in a sensitive instrument, or a crack in one of his own high-power lenses, would not be more disturbing than a strong emotion in a nature such as his. And yet there was but one woman to him, and that woman was the late Irene Adler, of dubious and questionable memory.",
                        "I had seen little of Holmes lately. My marriage had drifted us away from each other. My own complete happiness, and the home-centred interests which rise up around the man who first finds himself master of his own establishment, were sufficient to absorb all my attention, while Holmes, who loathed every form of society with his whole Bohemian soul, remained in our lodgings in Baker Street, buried among his old books, and alternating from week to week between cocaine and ambition, the drowsiness of the drug, and the fierce energy of his own keen nature.",
                    ]),
                    Part(label: "Adventure II", title: "The Red-Headed League", paragraphs: [
                        "I had called upon my friend, Mr. Sherlock Holmes, one day in the autumn of last year and found him in deep conversation with a very stout, florid-faced, elderly gentleman with fiery red hair. With an apology for my intrusion, I was about to withdraw when Holmes pulled me abruptly into the room and closed the door behind me.",
                        "“You could not possibly have come at a better time, my dear Watson,” he said cordially.",
                    ]),
                    Part(label: "Adventure III", title: "A Case of Identity", paragraphs: [
                        "“My dear fellow,” said Sherlock Holmes as we sat on either side of the fire in his lodgings at Baker Street, “life is infinitely stranger than anything which the mind of man could invent. We would not dare to conceive the things which are really mere commonplaces of existence.”",
                    ]),
                ])
    }

    private static func janeEyre() -> Classic {
        Classic(slug: "jane", title: "Jane Eyre", author: "Charlotte Brontë", subjects: ["Classics", "Romance", "Gothic fiction", "Bildungsroman"],
                blurb: "An orphan governess of fierce independence, the master of Thornfield Hall, and the secret the house keeps.",
                words: 183_000,
                jacket: Jacket(top: 0x2E2A36, bottom: 0x3F3947, ink: 0xF3E9DC, accent: 0xF4A259, motif: .flame, titleFont: "Didot", authorFont: "Didot"),
                parts: [
                    Part(label: nil, title: "Chapter I", paragraphs: [
                        "There was no possibility of taking a walk that day. We had been wandering, indeed, in the leafless shrubbery an hour in the morning; but since dinner (Mrs. Reed, when there was no company, dined early) the cold winter wind had brought with it clouds so sombre, and a rain so penetrating, that further out-door exercise was now out of the question.",
                        "I was glad of it: I never liked long walks, especially on chilly afternoons: dreadful to me was the coming home in the raw twilight, with nipped fingers and toes, and a heart saddened by the chidings of Bessie, the nurse, and humbled by the consciousness of my physical inferiority to Eliza, John, and Georgiana Reed.",
                        "The said Eliza, John, and Georgiana were now clustered round their mama in the drawing-room: she lay reclined on a sofa by the fireside, and with her darlings about her (for the time neither quarrelling nor crying) looked perfectly happy.",
                    ]),
                    Part(label: nil, title: "Chapter II", paragraphs: [
                        "I resisted all the way: a new thing for me, and a circumstance which greatly strengthened the bad opinion Bessie and Miss Abbot were disposed to entertain of me. The fact is, I was a trifle beside myself; or rather out of myself, as the French would say: I was conscious that a moment’s mutiny had already rendered me liable to strange penalties, and, like any other rebel slave, I felt resolved, in my desperation, to go all lengths.",
                    ]),
                    Part(label: nil, title: "Chapter III", paragraphs: [
                        "The next thing I remember is, waking up with a feeling as if I had had a frightful nightmare, and seeing before me a terrible red glare, crossed with thick black bars. I heard voices, too, speaking with a hollow sound, and as if muffled by a rush of wind or water: agitation, uncertainty, and an all-predominating sense of terror confused my faculties.",
                    ]),
                ])
    }

    private static func dorianGray() -> Classic {
        Classic(slug: "dorian", title: "The Picture of Dorian Gray", author: "Oscar Wilde", subjects: ["Gothic fiction", "Philosophical fiction"],
                blurb: "A young man’s portrait ages and coarsens in his place while he keeps his beauty, whatever he does.",
                words: 78_000,
                jacket: Jacket(top: 0x0D3B3E, bottom: 0x0A2A2C, ink: 0xF2E3BC, accent: 0xD4AF37, motif: .frame, titleFont: "Baskerville-Italic", authorFont: "Baskerville"),
                parts: [
                    Part(label: nil, title: "The Preface", paragraphs: [
                        "The artist is the creator of beautiful things. To reveal art and conceal the artist is art’s aim. The critic is he who can translate into another manner or a new material his impression of beautiful things.",
                        "The highest as the lowest form of criticism is a mode of autobiography. Those who find ugly meanings in beautiful things are corrupt without being charming. This is a fault.",
                        "Those who find beautiful meanings in beautiful things are the cultivated. For these there is hope. They are the elect to whom beautiful things mean only beauty.",
                        "There is no such thing as a moral or an immoral book. Books are well written, or badly written. That is all.",
                        "The nineteenth century dislike of realism is the rage of Caliban seeing his own face in a glass.",
                        "The nineteenth century dislike of romanticism is the rage of Caliban not seeing his own face in a glass.",
                    ]),
                    Part(label: nil, title: "Chapter I", paragraphs: [
                        "The studio was filled with the rich odour of roses, and when the light summer wind stirred amidst the trees of the garden, there came through the open door the heavy scent of the lilac, or the more delicate perfume of the pink-flowering thorn.",
                        "From the corner of the divan of Persian saddle-bags on which he was lying, smoking, as was his custom, innumerable cigarettes, Lord Henry Wotton could just catch the gleam of the honey-sweet and honey-coloured blossoms of a laburnum, whose tremulous branches seemed hardly able to bear the burden of a beauty so flamelike as theirs; and now and then the fantastic shadows of birds in flight flitted across the long tussore-silk curtains that were stretched in front of the huge window, producing a kind of momentary Japanese effect, and making him think of those pallid, jade-faced painters of Tokyo who, through the medium of an art that is necessarily immobile, seek to convey the sense of swiftness and motion.",
                    ]),
                    Part(label: nil, title: "Chapter II", paragraphs: [
                        "As they entered they saw Dorian Gray. He was seated at the piano, with his back to them, turning over the pages of a volume of Schumann’s “Forest Scenes.” “You must lend me these, Basil,” he cried. “I want to learn them. They are perfectly charming.”",
                    ]),
                ])
    }

    private static func greatExpectations() -> Classic {
        Classic(slug: "expectations", title: "Great Expectations", author: "Charles Dickens", subjects: ["Classics", "Bildungsroman", "Literary fiction"],
                blurb: "Pip, an orphan of the Kent marshes, comes into money from a benefactor he cannot name.",
                words: 183_000,
                jacket: Jacket(top: 0x0B132B, bottom: 0x1C2541, ink: 0xFDF0D5, accent: 0xF6BD60, motif: .stars, titleFont: "Optima-Bold", authorFont: "Optima-Regular"),
                parts: [
                    Part(label: nil, title: "Chapter I", paragraphs: [
                        "My father’s family name being Pirrip, and my Christian name Philip, my infant tongue could make of both names nothing longer or more explicit than Pip. So, I called myself Pip, and came to be called Pip.",
                        "I give Pirrip as my father’s family name, on the authority of his tombstone and my sister,—Mrs. Joe Gargery, who married the blacksmith. As I never saw my father or my mother, and never saw any likeness of either of them (for their days were long before the days of photographs), my first fancies regarding what they were like were unreasonably derived from their tombstones. The shape of the letters on my father’s, gave me an odd idea that he was a square, stout, dark man, with curly black hair. From the character and turn of the inscription, “Also Georgiana Wife of the Above,” I drew a childish conclusion that my mother was freckled and sickly.",
                        "To five little stone lozenges, each about a foot and a half long, which were arranged in a neat row beside their grave, and were sacred to the memory of five little brothers of mine,—who gave up trying to get a living, exceedingly early in that universal struggle,—I am indebted for a belief I religiously entertained that they had all been born on their backs with their hands in their trousers-pockets, and had never taken them out in this state of existence.",
                        "Ours was the marsh country, down by the river, within, as the river wound, twenty miles of the sea. My first most vivid and broad impression of the identity of things seems to me to have been gained on a memorable raw afternoon towards evening. At such a time I found out for certain that this bleak place overgrown with nettles was the churchyard; and that Philip Pirrip, late of this parish, and also Georgiana wife of the above, were dead and buried; and that Alexander, Bartholomew, Abraham, Tobias, and Roger, infant children of the aforesaid, were also dead and buried; and that the dark flat wilderness beyond the churchyard, intersected with dikes and mounds and gates, with scattered cattle feeding on it, was the marshes; and that the low leaden line beyond was the river; and that the distant savage lair from which the wind was rushing was the sea; and that the small bundle of shivers growing afraid of it all and beginning to cry, was Pip.",
                    ]),
                    Part(label: nil, title: "Chapter II", paragraphs: [
                        "My sister, Mrs. Joe Gargery, was more than twenty years older than I, and had established a great reputation with herself and the neighbours because she had brought me up “by hand.” Having at that time to find out for myself what the expression meant, and knowing her to have a hard and heavy hand, and to be much in the habit of laying it upon her husband as well as upon me, I supposed that Joe Gargery and I were both brought up by hand.",
                    ]),
                    Part(label: nil, title: "Chapter III", paragraphs: [
                        "It was a rimy morning, and very damp. I had seen the damp lying on the outside of my little window, as if some goblin had been crying there all night, and using the window for a pocket-handkerchief.",
                    ]),
                ])
    }

    private static func walden() -> Classic {
        Classic(slug: "walden", title: "Walden", author: "Henry David Thoreau", subjects: ["Essays", "Philosophy", "Nature"],
                blurb: "Two years and two months in a cabin Thoreau built beside Walden Pond, and what they taught him about living simply.",
                words: 114_000,
                jacket: Jacket(top: 0xEEF5E0, bottom: 0xCFE1B9, ink: 0x2D4A22, accent: 0x6A8D73, motif: .pond, titleFont: "GillSans-SemiBold", authorFont: "GillSans", capitals: true),
                parts: [
                    Part(label: nil, title: "Economy", paragraphs: [
                        "When I wrote the following pages, or rather the bulk of them, I lived alone, in the woods, a mile from any neighbor, in a house which I had built myself, on the shore of Walden Pond, in Concord, Massachusetts, and earned my living by the labor of my hands only. I lived there two years and two months. At present I am a sojourner in civilized life again.",
                        "I should not obtrude my affairs so much on the notice of my readers if very particular inquiries had not been made by my townsmen concerning my mode of life, which some would call impertinent, though they do not appear to me at all impertinent, but, considering the circumstances, very natural and pertinent.",
                    ]),
                    Part(label: nil, title: "Where I Lived, and What I Lived For", paragraphs: [
                        "I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived. I did not wish to live what was not life, living is so dear; nor did I wish to practise resignation, unless it was quite necessary. I wanted to live deep and suck out all the marrow of life, to live so sturdily and Spartan-like as to put to rout all that was not life, to cut a broad swath and shave close, to drive life into a corner, and reduce it to its lowest terms.",
                    ]),
                    Part(label: nil, title: "Solitude", paragraphs: [
                        "This is a delicious evening, when the whole body is one sense, and imbibes delight through every pore. I go and come with a strange liberty in Nature, a part of herself.",
                    ]),
                ])
    }

    private static func odyssey() -> Classic {
        Classic(slug: "odyssey", title: "The Odyssey", author: "Homer", subjects: ["Adventure", "Epic poetry", "Mythology, Greek", "Classics"],
                blurb: "Ten years after Troy, Ulysses makes his way home to Ithaca, where suitors crowd his house and court his wife. In Samuel Butler’s prose translation.",
                words: 117_000,
                jacket: Jacket(top: 0xD0643F, bottom: 0xA8452C, ink: 0x1B1512, accent: 0xF2D0A4, motif: .meander, titleFont: "Palatino-Bold", authorFont: "Palatino-Roman", capitals: true),
                parts: [
                    Part(label: nil, title: "Book I", paragraphs: [
                        "Tell me, O Muse, of that ingenious hero who travelled far and wide after he had sacked the famous town of Troy. Many cities did he visit, and many were the nations with whose manners and customs he was acquainted; moreover he suffered much by sea while trying to save his own life and bring his men safely home; but do what he might he could not save his men, for they perished through their own sheer folly in eating the cattle of the Sun-god Hyperion; so the god prevented them from ever reaching home. Tell me, too, about all these things, O daughter of Jove, from whatsoever source you may know them.",
                        "So now all who escaped death in battle or by shipwreck had got safely home except Ulysses, and he, though he was longing to return to his wife and country, was detained by the goddess Calypso, who had got him into a large cave and wanted to marry him. But as years went by, there came a time when the gods settled that he should go back to Ithaca; even then, however, when he was among his own people, his troubles were not yet over; nevertheless all the gods had now begun to pity him except Neptune, who still persecuted him without ceasing and would not let him get home.",
                    ]),
                    Part(label: nil, title: "Book V", paragraphs: [
                        "And now, as Dawn rose from her couch beside Tithonus—harbinger of light alike to mortals and immortals—the gods met in council and with them, Jove the lord of thunder, who is their king. Thereon Minerva began to tell them of the many sufferings of Ulysses, for she pitied him away there in the house of the nymph Calypso.",
                    ]),
                    Part(label: nil, title: "Book VI", paragraphs: [
                        "Here Ulysses slept, overcome by sleep and toil; but Minerva went off to the country and city of the Phaeacians—a people who used to live in the fair town of Hypereia, near the lawless Cyclopes.",
                    ]),
                ])
    }
}
