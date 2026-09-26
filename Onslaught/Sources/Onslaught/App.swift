import AppKit
import Carbon.HIToolbox
import OnslaughtCore

/// Onslaught lives in the menu bar (no Dock icon) and in one small floating panel. ⌃⌥O shows and hides it from
/// anywhere.
@main
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private static var instance: AppDelegate?

    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        instance = delegate
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.run()
    }

    let session: GameSession
    private(set) var panel: PanelController!
    private var statusItem: NSStatusItem!
    private var hotKey: HotKey?

    override init() {
        session = GameSession(store: SelfTest.enabled ? Store.scratch() : Store.standard)
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        signal(SIGPIPE, SIG_IGN)
        panel = PanelController(session: session)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            if let image = NSImage(systemSymbolName: "scope", accessibilityDescription: "Onslaught") {
                image.isTemplate = true
                button.image = image
            } else {
                button.title = "◎"
            }
        }
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu
        hotKey = HotKey(keyCode: kVK_ANSI_O, modifiers: controlKey | optionKey) { [weak self] in
            MainActor.assumeIsolated { self?.panel.toggle() }
        }
        if Settings.visible || SelfTest.enabled { panel.show() }
        if SelfTest.enabled { SelfTest.start(self) }
    }

    func applicationWillTerminate(_ notification: Notification) {
        session.save()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        panel.show()
        return true
    }

    // MARK: The menu

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let game = session.game
        let career = game.career
        func note(_ text: String) {
            let item = NSMenuItem(title: text, action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
        }
        func add(_ title: String, _ action: Selector, key: String = "", modifiers: NSEvent.ModifierFlags = [], on: Bool? = nil) {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
            item.keyEquivalentModifierMask = modifiers
            item.target = self
            if let on { item.state = on ? .on : .off }
            menu.addItem(item)
        }

        switch game.stage {
        case .fighting: note("Wave \(game.fight.wave) · \(game.fight.boss.design.name.capitalized)")
        case .armory: note("Wave \(game.run.wave) cleared · choose an upgrade")
        case .debrief: note("Shot down at wave \(game.run.wave)")
        }
        note("Run \(game.run.number) · \(grouped(game.score)) points")
        var record = "\(career.rank) · \(career.kills) \(career.kills == 1 ? "kill" : "kills")"
        if career.bestWave > 0 { record += " · best wave \(career.bestWave)" }
        note(record)
        if let next = career.nextRank { note("\(next.kills - career.kills) more to \(next.title)") }
        menu.addItem(.separator())
        add(panel.panel.isVisible ? "Hide Onslaught" : "Show Onslaught", #selector(toggleWindow), key: "o", modifiers: [.control, .option])
        add("Compact", #selector(toggleCompact), on: panel.scene.isCompact)
        let sizes = NSMenu()
        for size in Settings.Size.allCases {
            let item = NSMenuItem(title: size.title, action: #selector(chooseSize(_:)), keyEquivalent: "")
            item.target = self
            item.tag = size.rawValue
            item.state = size == Settings.size ? .on : .off
            sizes.addItem(item)
        }
        let sizeItem = NSMenuItem(title: "Size", action: nil, keyEquivalent: "")
        sizeItem.submenu = sizes
        menu.addItem(sizeItem)
        add("Pause When Pointer Leaves", #selector(togglePauseWhenAway), on: Settings.pauseWhenAway)
        add("Dim When Pointer Leaves", #selector(toggleDimWhenAway), on: Settings.dimWhenAway)
        menu.addItem(.separator())
        if game.stage != .debrief { add("Abandon Run", #selector(abandon)) }
        add("Reset Career…", #selector(resetCareer))
        menu.addItem(.separator())
        add("Quit Onslaught", #selector(quit), key: "q", modifiers: [.command])
    }

    @objc private func toggleWindow() { panel.toggle() }

    @objc private func toggleCompact() {
        if !panel.panel.isVisible { panel.show() }
        panel.setCompact(!panel.scene.isCompact)
    }

    @objc private func chooseSize(_ sender: NSMenuItem) {
        panel.setSize(Settings.Size(rawValue: sender.tag) ?? .medium)
    }

    @objc private func togglePauseWhenAway() {
        Settings.pauseWhenAway.toggle()
        panel.updatePauseState()
    }

    @objc private func toggleDimWhenAway() {
        Settings.dimWhenAway.toggle()
        panel.updatePauseState()
    }

    @objc private func abandon() {
        session.abandon()
        panel.scene.loadFight(intro: false)
        panel.show()
    }

    @objc private func resetCareer() {
        NSApp.activate()
        let alert = NSAlert()
        alert.messageText = "Reset your career?"
        alert.informativeText = "Your rank, kills, records and the run in progress are wiped."
        alert.addButton(withTitle: "Reset")
        alert.addButton(withTitle: "Cancel")
        alert.alertStyle = .warning
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        session.reset()
        panel.scene.loadFight(intro: true)
    }

    @objc private func quit() { NSApp.terminate(nil) }
}
