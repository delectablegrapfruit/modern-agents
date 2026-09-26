import AppKit
import Carbon.HIToolbox
import SidewaysCore

/// A menu bar app with no Dock icon and no menu bar of its own: the floating window, a steering-wheel item in the
/// menu bar, and ⌃⌥D from anywhere to bring the window up with the keyboard, or tuck it away.
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, NSWindowDelegate {
    private var game: Game!
    private var panel: GamePanel!
    private var view: GameView!
    private var statusItem: NSStatusItem?
    private var hotKey: HotKey?
    private var store = RecordStore.standard
    /// Records are written off the main thread, in order.
    private let saveQueue = DispatchQueue(label: "Sideways.records")

    func applicationDidFinishLaunching(_ notification: Notification) {
        let environment = ProcessInfo.processInfo.environment
        if let directory = environment["SIDEWAYS_SNAPSHOT"] {
            exit(Snapshot.render(into: URL(fileURLWithPath: directory)) ? 0 : 1)
        }
        let selfTest = environment["SIDEWAYS_SELFTEST"] != nil
        if selfTest {
            // The self-test drives in a scratch file so it never touches anyone's records.
            store = RecordStore(url: FileManager.default.temporaryDirectory.appendingPathComponent("Sideways Self-Test \(UUID().uuidString)/records.json"))
        }

        let store = self.store, queue = saveQueue
        game = Game(records: store.load()) { records in
            queue.async { try? store.save(records) }
        }
        panel = GamePanel(size: GamePanel.size(game.records.size))
        view = GameView(game: game, size: GamePanel.size(game.records.size))
        panel.contentView = view
        panel.delegate = self
        view.menuProvider = { [weak self] in self?.makeMenu() }
        view.onHide = { [weak self] in self?.hidePanel() }

        // Where it was last time; the size is the one chosen in the menu.
        if !panel.setFrameUsingName("Sideways") { panel.placeInDefaultCorner() }
        panel.setFrameAutosaveName("Sideways")
        panel.resize(to: GamePanel.size(game.records.size))
        panel.keepOnScreen()
        panel.orderFrontRegardless()

        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let image = NSImage(systemSymbolName: "steeringwheel", accessibilityDescription: "Sideways")
            ?? NSImage(systemSymbolName: "car.fill", accessibilityDescription: "Sideways")
        image?.isTemplate = true
        item.button?.image = image
        let menu = NSMenu()
        menu.delegate = self
        menu.autoenablesItems = false
        item.menu = menu
        statusItem = item

        hotKey = HotKey(keyCode: kVK_ANSI_D, modifiers: controlKey | optionKey) { [weak self] in self?.toggleFromHotKey() }

        if selfTest { SelfTest.start(game: game, view: view, panel: panel) }
    }

    func applicationWillTerminate(_ notification: Notification) {
        game?.flush()
        saveQueue.sync {}
    }

    func applicationDidChangeScreenParameters(_ notification: Notification) {
        panel?.keepOnScreen()
    }

    // MARK: Showing and hiding

    private func toggleFromHotKey() {
        if !panel.isVisible {
            showPanel()
        } else if panel.isKeyWindow {
            hidePanel()
        } else {
            panel.makeKeyAndOrderFront(nil)
        }
    }

    private func showPanel() {
        panel.keepOnScreen()
        panel.makeKeyAndOrderFront(nil)
        view.wake()
    }

    private func hidePanel() {
        game.pause()
        panel.orderOut(nil)
    }

    // MARK: Menu

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        menuItems().forEach { menu.addItem($0) }
    }

    private func item(_ title: String, _ action: Selector?, key: String = "", tag: Int = 0, on: Bool = false, enabled: Bool = true) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self
        item.tag = tag
        item.state = on ? .on : .off
        item.isEnabled = enabled
        return item
    }

    private func makeMenu() -> NSMenu {
        let menu = NSMenu()
        menu.autoenablesItems = false
        menuItems().forEach { menu.addItem($0) }
        return menu
    }

    private func menuItems() -> [NSMenuItem] {
        let menu = NSMenu()
        let toggle = item(panel.isVisible ? "Hide Sideways" : "Show Sideways", #selector(toggleVisible), key: "d")
        toggle.keyEquivalentModifierMask = [.control, .option]
        menu.addItem(toggle)
        menu.addItem(.separator())

        let tracks = NSMenu()
        tracks.autoenablesItems = false
        for (index, info) in game.tracks.enumerated() {
            if index == 1 { tracks.addItem(.separator()) }
            let best = game.records[track: info.id].bestLap.map { "   " + Format.lap($0) } ?? ""
            tracks.addItem(item("\(info.subtitle) — \(info.name)\(best)", #selector(chooseTrack(_:)), tag: index, on: info.id == game.info.id))
        }
        let trackItem = NSMenuItem(title: "Track", action: nil, keyEquivalent: "")
        trackItem.submenu = tracks
        menu.addItem(trackItem)

        let paints = NSMenu()
        paints.autoenablesItems = false
        for (index, paint) in Paint.all.enumerated() {
            let unlocked = index <= game.rank.index
            let title = unlocked ? paint.name : "\(paint.name) — \(Paint.rank(unlocking: index).title)"
            let paintItem = item(title, #selector(choosePaint(_:)), tag: index, on: index == game.records.paint, enabled: unlocked)
            paintItem.image = swatch(NSColor(paint), unlocked: unlocked)
            paints.addItem(paintItem)
        }
        let paintItem = NSMenuItem(title: "Paint", action: nil, keyEquivalent: "")
        paintItem.submenu = paints
        menu.addItem(paintItem)

        let sizes = NSMenu()
        sizes.autoenablesItems = false
        for (index, name) in GamePanel.sizeNames.enumerated() {
            sizes.addItem(item(name, #selector(chooseSize(_:)), tag: index, on: index == game.records.size))
        }
        let sizeItem = NSMenuItem(title: "Window Size", action: nil, keyEquivalent: "")
        sizeItem.submenu = sizes
        menu.addItem(sizeItem)

        menu.addItem(item("Race the Ghost", #selector(toggleGhost), on: game.records.showGhost))
        menu.addItem(item("Fade When Not Playing", #selector(toggleFade), on: game.records.fadeWhenIdle))
        menu.addItem(.separator())

        let rank = game.rank, points = game.records.careerPoints
        var standing = "\(rank.title) · \(Format.points(points)) pts"
        if let next = rank.next { standing += " — \(next.title) at \(Format.points(next.threshold))" }
        menu.addItem(item(standing, nil, enabled: false))
        menu.addItem(item("How to Play", #selector(showHelp)))
        menu.addItem(.separator())
        menu.addItem(item("Reset Records…", #selector(resetRecords)))
        menu.addItem(item("Quit Sideways", #selector(quit), key: "q"))
        let items = menu.items
        menu.removeAllItems()
        return items
    }

    private func swatch(_ color: NSColor, unlocked: Bool) -> NSImage {
        NSImage(size: NSSize(width: 12, height: 12), flipped: false) { rect in
            let path = NSBezierPath(ovalIn: rect.insetBy(dx: 1, dy: 1))
            color.withAlphaComponent(unlocked ? 1 : 0.3).setFill()
            path.fill()
            return true
        }
    }

    @objc private func toggleVisible() {
        if panel.isVisible { hidePanel() } else { showPanel() }
    }

    @objc private func chooseTrack(_ sender: NSMenuItem) {
        let tracks = game.tracks
        guard tracks.indices.contains(sender.tag) else { return }
        game.select(tracks[sender.tag])
        showPanel()
    }

    @objc private func choosePaint(_ sender: NSMenuItem) {
        game.setPaint(sender.tag)
        view.wake()
    }

    @objc private func chooseSize(_ sender: NSMenuItem) {
        game.setSize(sender.tag)
        let size = GamePanel.size(game.records.size)
        panel.resize(to: size)
        view.setFrameSize(size)
        view.wake()
    }

    @objc private func toggleGhost() {
        game.setShowGhost(!game.records.showGhost)
        view.wake()
    }

    @objc private func toggleFade() {
        game.setFadeWhenIdle(!game.records.fadeWhenIdle)
        view.updateAlpha(animated: true)
    }

    @objc private func showHelp() {
        game.pause()
        game.showHelp = true
        showPanel()
    }

    @objc private func resetRecords() {
        NSApp.activate()
        let alert = NSAlert()
        alert.messageText = "Reset all records?"
        alert.informativeText = "Best laps, ghosts, career points and rank go back to zero. This can't be undone."
        alert.addButton(withTitle: "Reset")
        alert.addButton(withTitle: "Cancel")
        alert.buttons.first?.hasDestructiveAction = true
        if alert.runModal() == .alertFirstButtonReturn {
            game.resetRecords()
            view.wake()
        }
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    // MARK: Window

    func windowDidMove(_ notification: Notification) {
        panel.invalidateShadow()
    }
}
