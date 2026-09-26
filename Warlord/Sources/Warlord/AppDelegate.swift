import AppKit
import ServiceManagement
import WarlordCore

/// A menu-bar app with no Dock icon and no main window: the floating panel, a shield in the menu bar showing how
/// many orders are ready, and ⌃⌥W to show or hide the panel from anywhere.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    static let radii: [CGFloat] = [12, 15, 18]

    private var session: Session!
    private var board: BoardView!
    private var panel: FloatingPanel!
    private var statusItem: NSStatusItem!
    private var hotKey: HotKey?
    private var ticker: Timer?
    private var fade: Timer?
    private let defaults = UserDefaults.standard
    private let selfTest = ProcessInfo.processInfo.environment["WARLORD_SELFTEST"] != nil

    func applicationDidFinishLaunching(_ notification: Notification) {
        // The self-test plays in a scratch campaign so it never touches yours.
        let store = selfTest
            ? GameStore(directory: FileManager.default.temporaryDirectory.appendingPathComponent("Warlord Self-Test \(UUID().uuidString)", isDirectory: true))
            : GameStore()
        session = Session(store: store)
        defaults.register(defaults: ["fade": true, "compact": false, "size": 1, "visible": true])

        board = BoardView(session: session)
        board.radius = Self.radii[sizeIndex]
        board.compact = defaults.bool(forKey: "compact") && !selfTest
        panel = FloatingPanel(board: board)
        board.onResize = { [weak self] in self?.boardResized() }
        board.onHover = { [weak self] inside in self?.hover(inside) }
        board.onMoved = { [weak self] in self?.rememberPosition() }
        session.onChange.append { [weak self] in self?.changed() }

        place()
        setUpStatusItem()
        hotKey = HotKey.controlOptionW { [weak self] in self?.togglePanel() }
        NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.keepOnScreen() }
        }

        if defaults.bool(forKey: "visible") || selfTest { panel.orderFrontRegardless() }
        scheduleFade()
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.session.tick() }
        }
        ticker?.tolerance = 0.25
        changed()

        if selfTest { SelfTest.start(board: board, panel: panel, session: session) }
    }

    func applicationWillTerminate(_ notification: Notification) {
        session.save()
    }

    // MARK: Panel

    private var sizeIndex: Int { min(max(defaults.integer(forKey: "size"), 0), Self.radii.count - 1) }

    private func changed() {
        board.needsDisplay = true
        fit(animate: true)
        let orders = session.game.orders
        let title = orders > 0 ? " \(orders)" : ""
        if statusItem?.button?.title != title { statusItem?.button?.title = title }
    }

    private func boardResized() {
        defaults.set(board.compact, forKey: "compact")
        fit(animate: true)
    }

    /// Sizes the panel to the board, keeping its top edge where it is.
    private func fit(animate: Bool) {
        let size = board.preferredSize
        var frame = panel.frame
        guard frame.size != size else { return }
        let top = frame.maxY
        frame.size = size
        frame.origin.y = top - size.height
        panel.setFrame(frame, display: true, animate: animate && panel.isVisible)
        panel.invalidateShadow()
    }

    /// Where you left it, or the top-right corner of the screen.
    private func place() {
        let size = panel.frame.size
        if defaults.object(forKey: "left") != nil {
            let frame = NSRect(x: defaults.double(forKey: "left"), y: defaults.double(forKey: "top") - size.height, width: size.width, height: size.height)
            if NSScreen.screens.contains(where: { $0.visibleFrame.intersects(frame) }) {
                panel.setFrameOrigin(frame.origin)
                return
            }
        }
        let screen = (NSScreen.main ?? NSScreen.screens.first)?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        panel.setFrameOrigin(NSPoint(x: screen.maxX - size.width - 16, y: screen.maxY - size.height - 16))
    }

    private func keepOnScreen() {
        if !NSScreen.screens.contains(where: { $0.visibleFrame.intersects(panel.frame) }) {
            defaults.removeObject(forKey: "left")
            place()
        }
    }

    private func rememberPosition() {
        defaults.set(panel.frame.minX, forKey: "left")
        defaults.set(panel.frame.maxY, forKey: "top")
    }

    func togglePanel() {
        if panel.isVisible {
            panel.orderOut(nil)
        } else {
            panel.orderFrontRegardless()
            setAlpha(1)
            scheduleFade()
        }
        defaults.set(panel.isVisible, forKey: "visible")
    }

    // Out of the way when you are not looking at it: the panel dims a moment after the pointer leaves.
    private func hover(_ inside: Bool) {
        fade?.invalidate()
        if inside { setAlpha(1) } else { scheduleFade() }
    }

    private func scheduleFade() {
        fade?.invalidate()
        guard defaults.bool(forKey: "fade"), !selfTest else { return setAlpha(1) }
        fade = Timer.scheduledTimer(withTimeInterval: 2.5, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated { self?.setAlpha(0.4) }
        }
    }

    private func setAlpha(_ alpha: CGFloat) {
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.35
            self.panel.animator().alphaValue = alpha
        }
    }

    // MARK: Menu bar

    private func setUpStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            let image = NSImage(systemSymbolName: "shield.lefthalf.filled", accessibilityDescription: "Warlord")
            image?.isTemplate = true
            button.image = image
            button.imagePosition = .imageLeading
            button.font = NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .medium)
            button.toolTip = "Warlord — orders ready"
        }
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let game = session.game, stats = game.stats

        let show = item(panel.isVisible ? "Hide Warlord" : "Show Warlord", #selector(togglePanelFromMenu))
        show.keyEquivalent = "w"
        show.keyEquivalentModifierMask = [.control, .option]
        menu.addItem(show)
        menu.addItem(item("Compact", #selector(toggleCompact), on: board.compact))
        menu.addItem(item("Dim When Idle", #selector(toggleFade), on: defaults.bool(forKey: "fade")))
        let sizes = NSMenu()
        for (index, name) in ["Small", "Medium", "Large"].enumerated() {
            let size = item(name, #selector(chooseSize(_:)), on: index == sizeIndex)
            size.tag = index
            sizes.addItem(size)
        }
        let sizeItem = NSMenuItem(title: "Size", action: nil, keyEquivalent: "")
        sizeItem.submenu = sizes
        menu.addItem(sizeItem)
        menu.addItem(item("Open at Login", #selector(toggleLogin), on: SMAppService.mainApp.status == .enabled))

        menu.addItem(.separator())
        menu.addItem(note("\(game.title) · \(game.realm.name)"))
        menu.addItem(note("\(stats.realmsConquered) realms · \(stats.battlesWon) victories · \(stats.housesBroken) houses broken"))
        menu.addItem(note("Income \(BoardView.decimal(game.incomePerMinute)) gold a minute"))

        menu.addItem(.separator())
        menu.addItem(item("Abandon This Realm…", #selector(abandonRealm)))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit Warlord", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
    }

    private func item(_ title: String, _ action: Selector, on: Bool = false) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        item.state = on ? .on : .off
        return item
    }

    private func note(_ title: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        return item
    }

    @objc private func togglePanelFromMenu() { togglePanel() }

    @objc private func toggleCompact() {
        if !panel.isVisible { togglePanel() }
        board.compact.toggle()
    }

    @objc private func toggleFade() {
        defaults.set(!defaults.bool(forKey: "fade"), forKey: "fade")
        scheduleFade()
    }

    @objc private func chooseSize(_ sender: NSMenuItem) {
        defaults.set(sender.tag, forKey: "size")
        board.radius = Self.radii[sizeIndex]
    }

    @objc private func toggleLogin() {
        do {
            if SMAppService.mainApp.status == .enabled {
                try SMAppService.mainApp.unregister()
            } else {
                try SMAppService.mainApp.register()
            }
        } catch {
            board.say("Open at Login: \(error.localizedDescription)", .bad)
        }
    }

    @objc private func abandonRealm() {
        NSApp.activate()
        let alert = NSAlert()
        alert.messageText = "Abandon \(session.game.realm.name)?"
        alert.informativeText = "Your gold, orders and title stay with you. A fresh realm of the same size takes its place."
        alert.addButton(withTitle: "Abandon")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        session.apply { $0.abandon(now: Date()) }
        board.reset()
    }
}
