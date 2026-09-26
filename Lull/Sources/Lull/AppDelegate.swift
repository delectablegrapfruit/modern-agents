import AppKit
import WebKit

/// Receives the page's messages (see Game/js/util.js, `native.post`) as dictionaries.
final class BridgeHandler: NSObject, WKScriptMessageHandler {
    var onMessage: (([String: Any]) -> Void)?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if let body = message.body as? [String: Any] { onMessage?(body) }
    }
}

/// Reports a page that failed to load, and brings the game back if its web content process ever dies.
final class NavigationGuard: NSObject, WKNavigationDelegate {
    var onFailure: ((String) -> Void)?
    var onCrash: (() -> Void)?

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { onFailure?(error.localizedDescription) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { onFailure?(error.localizedDescription) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { onCrash?() }
}

/// The game's web view: first responder, so the arrow keys and space reach the page.
final class GameWebView: WKWebView {
    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { false }

    /// Reload and Inspect Element are not what a game menu needs.
    override func willOpenMenu(_ menu: NSMenu, with event: NSEvent) {
        let keep: Set<String> = ["WKMenuItemIdentifierCopy", "WKMenuItemIdentifierPaste", "WKMenuItemIdentifierCut"]
        for item in menu.items where !keep.contains(item.identifier?.rawValue ?? "") { menu.removeItem(item) }
        super.willOpenMenu(menu, with: event)
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private var panel: FloatingPanel!
    private var chrome: ChromeView!
    private var webView: GameWebView!
    private var store: SaveStore!
    private let bridge = BridgeHandler()
    private let navigation = NavigationGuard()
    private var hotKey: HotKey?
    private var terminating = false
    private var theme = "dark"
    private var background = "glass"
    private let selfTest = ProcessInfo.processInfo.environment["LULL_SELFTEST"] != nil
    private static let frameName = "LullPanel"

    func applicationDidFinishLaunching(_ notification: Notification) {
        signal(SIGPIPE, SIG_IGN)
        // The self-test plays in a scratch folder so it never touches a real save.
        store = selfTest
            ? SaveStore(directory: FileManager.default.temporaryDirectory.appendingPathComponent("Lull Self-Test " + UUID().uuidString, isDirectory: true))
            : SaveStore()
        buildMenu()
        buildPanel()
        hotKey = HotKey(keyCode: HotKey.defaultKeyCode, modifiers: HotKey.defaultModifiers) { [weak self] in
            MainActor.assumeIsolated { self?.toggleShown() }
        }
        if selfTest { startSelfTestWatchdog() }
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // MARK: - Window

    private func buildPanel() {
        let size = NSSize(width: 440, height: 680)
        panel = FloatingPanel(contentRect: NSRect(origin: .zero, size: size))
        panel.delegate = self
        if !panel.setFrameUsingName(AppDelegate.frameName) {
            let visible = (NSScreen.main ?? NSScreen.screens[0]).visibleFrame
            panel.setFrameOrigin(NSPoint(x: visible.maxX - size.width - 28, y: visible.maxY - size.height - 28))
        }
        _ = panel.setFrameAutosaveName(AppDelegate.frameName)

        chrome = ChromeView(frame: NSRect(origin: .zero, size: panel.frame.size))
        chrome.autoresizingMask = [.width, .height]
        panel.contentView = chrome

        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(bridge, name: "lull")
        configuration.userContentController.addUserScript(WKUserScript(source: bootScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.preferences.isElementFullscreenEnabled = false
        webView = GameWebView(frame: chrome.bounds, configuration: configuration)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = .clear
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsMagnification = false
        webView.isInspectable = true
        webView.navigationDelegate = navigation
        navigation.onFailure = { message in NSLog("Lull: the page failed to load: %@", message) }
        navigation.onCrash = { [weak self] in MainActor.assumeIsolated { self?.reloadGame() } }
        bridge.onMessage = { [weak self] body in MainActor.assumeIsolated { self?.receive(body) } }
        chrome.addSubview(webView)
        applyWindow()

        if let dir = AppDelegate.gameDirectory() {
            webView.loadFileURL(dir.appendingPathComponent("index.html"), allowingReadAccessTo: dir)
        } else {
            let alert = NSAlert()
            alert.messageText = "Lull is missing its game files"
            alert.informativeText = "Contents/Resources/Game was not found in the app. Rebuild it with Lull/scripts/make-app.sh."
            alert.runModal()
            NSApp.terminate(nil)
        }
        panel.makeFirstResponder(webView)
    }

    /// Reloads the page with the latest save (the boot script carries the save, so it is rebuilt first).
    private func reloadGame() {
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        controller.addUserScript(WKUserScript(source: bootScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView.reload()
    }

    /// The page's files: in the app bundle, or next to the sources when run with `swift run`.
    static func gameDirectory() -> URL? {
        let fm = FileManager.default
        if let env = ProcessInfo.processInfo.environment["LULL_GAME_DIR"], fm.fileExists(atPath: env + "/index.html") {
            return URL(fileURLWithPath: env, isDirectory: true)
        }
        if let res = Bundle.main.resourceURL?.appendingPathComponent("Game", isDirectory: true),
           fm.fileExists(atPath: res.appendingPathComponent("index.html").path) {
            return res
        }
        let source = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Game", isDirectory: true)
        if fm.fileExists(atPath: source.appendingPathComponent("index.html").path) { return source }
        return nil
    }

    /// Runs before the page's own scripts: hands it the save and says it lives in the native panel.
    private func bootScript() -> String {
        let save = store.load()?.base64EncodedString() ?? ""
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
        return "window.LULL_NATIVE = { platform: 'macos', version: '\(version)', saveB64: '\(save)', selftest: \(selfTest ? "true" : "false") };"
    }

    private func applyWindow(onTop: Bool? = nil) {
        chrome.effect.isHidden = background != "glass"
        chrome.effect.material = theme == "light" ? .popover : .hudWindow
        chrome.effect.appearance = NSAppearance(named: theme == "light" ? .aqua : .darkAqua)
        if let onTop { panel.level = onTop ? .floating : .normal }
        panel.invalidateShadow()
    }

    private func toggleShown() {
        if NSApp.isActive && panel.isVisible && panel.isKeyWindow {
            call("flush")
            NSApp.hide(nil)
        } else {
            NSApp.unhide(nil)
            panel.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            panel.makeFirstResponder(webView)
            call("shown")
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        panel.makeKeyAndOrderFront(nil)
        call("shown")
        return true
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        if !panel.isVisible { panel.makeKeyAndOrderFront(nil) }
    }

    func windowDidResignKey(_ notification: Notification) { call("flush") }

    // MARK: - Messages

    /// Calls `Lull.fromNative({type})` in the page.
    private func call(_ type: String, _ extra: String = "") {
        webView?.evaluateJavaScript("window.Lull && Lull.fromNative && Lull.fromNative({type: '\(type)'\(extra)})") { _, _ in }
    }

    private func receive(_ body: [String: Any]) {
        switch body["type"] as? String {
        case "save":
            if let data = body["data"] as? String { store.save(data) }
        case "window":
            if let bg = body["bg"] as? String { background = bg }
            if let t = body["theme"] as? String { theme = t }
            applyWindow(onTop: (body["onTop"] as? Bool) ?? true)
        case "dragRegions":
            chrome.dragRects = rects(body["drag"])
            chrome.noDragRects = rects(body["noDrag"])
        case "hide":
            NSApp.hide(nil)
        case "quit":
            NSApp.terminate(nil)
        case "flushed":
            if terminating { NSApp.reply(toApplicationShouldTerminate: true) }
        case "selftest":
            finishSelfTest(ok: (body["ok"] as? Bool) ?? false, report: body["report"] as? String ?? "")
        default:
            break
        }
    }

    private func rects(_ value: Any?) -> [NSRect] {
        guard let list = value as? [[NSNumber]] else { return [] }
        return list.compactMap { r in r.count == 4 ? NSRect(x: r[0].doubleValue, y: r[1].doubleValue, width: r[2].doubleValue, height: r[3].doubleValue) : nil }
    }

    // MARK: - Quitting: the page saves first

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if terminating || webView == nil { return .terminateNow }
        terminating = true
        call("flush")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { NSApp.reply(toApplicationShouldTerminate: true) }
        return .terminateLater
    }

    // MARK: - Menu

    private func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        main.addItem(appItem)
        let appMenu = NSMenu(title: "Lull")
        appMenu.addItem(withTitle: "About Lull", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        let settings = appMenu.addItem(withTitle: "Settings…", action: #selector(openSettings(_:)), keyEquivalent: ",")
        settings.target = self
        let onTop = appMenu.addItem(withTitle: "Float on Top", action: #selector(toggleOnTop(_:)), keyEquivalent: "t")
        onTop.target = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Lull", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let others = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        others.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Lull", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem = NSMenuItem()
        main.addItem(editItem)
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit

        let windowItem = NSMenuItem()
        main.addItem(windowItem)
        let windowMenu = NSMenu(title: "Window")
        let show = windowMenu.addItem(withTitle: "Show or Hide Lull (⌥⌘L anywhere)", action: #selector(toggleFromMenu(_:)), keyEquivalent: "")
        show.target = self
        let reset = windowMenu.addItem(withTitle: "Reset Window Position", action: #selector(resetPosition(_:)), keyEquivalent: "")
        reset.target = self
        windowItem.submenu = windowMenu
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = main
    }

    @objc private func openSettings(_ sender: Any?) { call("settings") }
    @objc private func toggleOnTop(_ sender: Any?) { call("toggleTop") }
    @objc private func toggleFromMenu(_ sender: Any?) { toggleShown() }
    @objc private func resetPosition(_ sender: Any?) {
        let visible = (NSScreen.main ?? NSScreen.screens[0]).visibleFrame
        let size = NSSize(width: 440, height: 680)
        panel.setFrame(NSRect(x: visible.maxX - size.width - 28, y: visible.maxY - size.height - 28, width: size.width, height: size.height), display: true, animate: true)
    }

    // MARK: - Self-test (CI): the page checks itself, the app saves a picture of the window and exits

    private func startSelfTestWatchdog() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 45) {
            print("LULL SELFTEST: timed out waiting for the page")
            exit(2)
        }
    }

    private func finishSelfTest(ok: Bool, report: String) {
        print("LULL SELFTEST: " + (ok ? "PASS" : "FAIL"))
        print(report)
        let shot = ProcessInfo.processInfo.environment["LULL_SELFTEST_SHOT"]
        webView.takeSnapshot(with: nil) { image, _ in
            if let shot, let image, let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
               let png = rep.representation(using: .png, properties: [:]) {
                try? png.write(to: URL(fileURLWithPath: shot))
            }
            exit(ok ? 0 : 1)
        }
    }
}
