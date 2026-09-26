import AppKit
import Carbon.HIToolbox
import SkirmishCore

/// Skirmish lives in the menu bar (no Dock icon) and in one small floating panel. ⌃⌥G shows and hides it from
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
            if let image = NSImage(systemSymbolName: "flag.2.crossed.fill", accessibilityDescription: "Skirmish") {
                image.isTemplate = true
                button.image = image
            } else {
                button.title = "⚔︎"
            }
        }
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu
        hotKey = HotKey(keyCode: kVK_ANSI_G, modifiers: controlKey | optionKey) { [weak self] in
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
        let campaign = session.campaign
        func note(_ text: String) {
            let item = NSMenuItem(title: text, action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
        }
        func add(_ title: String, _ action: Selector, key: String = "", modifiers: NSEvent.ModifierFlags = [], on: Bool? = nil, tag: Int = 0) -> NSMenuItem {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
            item.keyEquivalentModifierMask = modifiers
            item.target = self
            item.tag = tag
            if let on { item.state = on ? .on : .off }
            menu.addItem(item)
            return item
        }

        note("Sector \(campaign.sector) · \(Names.sector(campaign.sector))")
        var record = "\(campaign.rank) · \(campaign.victories) won"
        if campaign.streak > 1 { record += " · streak \(campaign.streak)" }
        note(record)
        if let next = campaign.nextRank { note("\(next.victories - campaign.victories) more to \(next.title)") }
        menu.addItem(.separator())
        _ = add(panel.panel.isVisible ? "Hide Skirmish" : "Show Skirmish", #selector(toggleWindow), key: "g", modifiers: [.control, .option])
        _ = add("Compact", #selector(toggleCompact), on: panel.scene.isCompact)
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
        _ = add("Pause When Pointer Leaves", #selector(togglePauseWhenAway), on: Settings.pauseWhenAway)
        _ = add("Dim When Pointer Leaves", #selector(toggleDimWhenAway), on: Settings.dimWhenAway)
        menu.addItem(.separator())
        _ = add("Retreat to a New Map", #selector(retreat))
        _ = add("Reset Campaign…", #selector(resetCampaign))
        menu.addItem(.separator())
        _ = add("Quit Skirmish", #selector(quit), key: "q", modifiers: [.command])
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

    @objc private func retreat() {
        session.retreat()
        panel.scene.loadBattle(intro: true)
        panel.show()
    }

    @objc private func resetCampaign() {
        NSApp.activate()
        let alert = NSAlert()
        alert.messageText = "Reset the campaign?"
        alert.informativeText = "Your rank, record and sector go back to the start."
        alert.addButton(withTitle: "Reset")
        alert.addButton(withTitle: "Cancel")
        alert.alertStyle = .warning
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        session.reset()
        panel.scene.loadBattle(intro: true)
    }

    @objc private func quit() { NSApp.terminate(nil) }
}
