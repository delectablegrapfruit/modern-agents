import AppKit
import Carbon.HIToolbox
import RoninCore

/// Ronin lives in the menu bar (no Dock icon) and in one small floating strip. ⌃⌥R shows and hides it from anywhere.
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
            if let image = NSImage(systemSymbolName: "figure.fencing", accessibilityDescription: "Ronin") {
                image.isTemplate = true
                button.image = image
            } else {
                button.title = "⚔︎"
            }
        }
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu
        hotKey = HotKey(keyCode: kVK_ANSI_R, modifiers: controlKey | optionKey) { [weak self] in
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
        let career = session.career
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

        note("Stage \(session.fight.stage) · \(session.fight.setting.name)")
        var record = "\(career.rank) · \(career.kills) kills"
        if career.streak > 1 { record += " · \(career.streak) in a row" }
        note(record)
        if let next = career.nextRank { note("\(next.kills - career.kills) more to \(next.title)") }
        if career.bestCombo > 0 { note("Best combo \(career.bestCombo) · \(career.flawless) flawless · \(career.falls) falls") }
        menu.addItem(.separator())
        add(panel.panel.isVisible ? "Hide Ronin" : "Show Ronin", #selector(toggleWindow), key: "r", modifiers: [.control, .option])
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
        add("Restart Stage", #selector(restart))
        add("Reset Career…", #selector(resetCareer))
        menu.addItem(.separator())
        add("Quit Ronin", #selector(quit), key: "q", modifiers: [.command])
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

    @objc private func restart() {
        session.restart()
        panel.scene.loadFight(intro: true)
        panel.show()
    }

    @objc private func resetCareer() {
        NSApp.activate()
        let alert = NSAlert()
        alert.messageText = "Reset your career?"
        alert.informativeText = "Your rank, kills and stage go back to the start."
        alert.addButton(withTitle: "Reset")
        alert.addButton(withTitle: "Cancel")
        alert.alertStyle = .warning
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        session.reset()
        panel.scene.loadFight(intro: true)
    }

    @objc private func quit() { NSApp.terminate(nil) }
}
