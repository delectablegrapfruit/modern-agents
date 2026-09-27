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

        if let run = career.endless {
            note("\(career.mode.title) · endless from \(run.start) · stage \(session.fight.stage)")
        } else {
            note("\(career.mode.title) · stage \(session.fight.stage) · \(session.fight.setting.name)")
        }
        var record = "\(career.rank) · \(career.kills) kills"
        if career.streak > 1 { record += " · \(career.streak) in a row" }
        note(record)
        if let next = career.nextRank { note("\(next.kills - career.kills) more to \(next.title)") }
        if career.bestCombo > 0 { note("Best combo \(career.bestCombo) · \(career.flawless) flawless · \(career.falls) falls") }
        menu.addItem(.separator())
        add(panel.panel.isVisible ? "Hide Ronin" : "Show Ronin", #selector(toggleWindow), key: "r", modifiers: [.control, .option])
        add("Compact", #selector(toggleCompact), on: panel.scene.isCompact)
        let modes = NSMenu()
        for mode in Mode.allCases {
            var probe = career
            probe.choose(mode)
            let item = NSMenuItem(title: "\(mode.title) — \(mode.gist), \(mode.hearts) hearts · stage \(probe.stage)",
                                  action: #selector(chooseMode(_:)), keyEquivalent: "")
            item.target = self
            item.tag = mode.level
            item.state = mode == career.mode ? .on : .off
            modes.addItem(item)
        }
        let modeItem = NSMenuItem(title: "Difficulty", action: nil, keyEquivalent: "")
        modeItem.submenu = modes
        menu.addItem(modeItem)
        // Endless: stage after stage from any stage reached, hearts carried, until the ronin falls.
        let endless = NSMenu()
        let campaign = NSMenuItem(title: "Campaign · stage \(career.stage)", action: #selector(leaveEndless), keyEquivalent: "")
        campaign.target = self
        campaign.state = career.isEndless ? .off : .on
        endless.addItem(campaign)
        endless.addItem(.separator())
        let unlocked = career.unlocked
        var stages = Array(unlocked)
        if stages.count > 30 { stages = stages.filter { $0 == 1 || $0 % 5 == 0 || $0 == unlocked.upperBound } }
        for stage in stages {
            let item = NSMenuItem(title: "From Stage \(stage)" + (stage % 5 == 0 ? " · warlord" : ""), action: #selector(startEndless(_:)), keyEquivalent: "")
            item.target = self
            item.tag = stage
            item.state = career.endless?.start == stage ? .on : .off
            endless.addItem(item)
        }
        if let best = career.bestEndless[career.mode.rawValue], best > 0 {
            endless.addItem(.separator())
            let note = NSMenuItem(title: "Best run: \(best) stage\(best == 1 ? "" : "s")", action: nil, keyEquivalent: "")
            note.isEnabled = false
            endless.addItem(note)
        }
        let endlessItem = NSMenuItem(title: "Endless", action: nil, keyEquivalent: "")
        endlessItem.submenu = endless
        menu.addItem(endlessItem)
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
        add("Floor Hints", #selector(toggleFloorHints), on: Settings.floorHints)
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

    @objc private func chooseMode(_ sender: NSMenuItem) {
        guard Mode.allCases.indices.contains(sender.tag) else { return }
        session.choose(Mode.allCases[sender.tag])
        panel.scene.loadFight(intro: true)
        panel.show()
    }

    @objc private func startEndless(_ sender: NSMenuItem) {
        session.startEndless(at: sender.tag)
        panel.scene.loadFight(intro: true)
        panel.show()
    }

    @objc private func leaveEndless() {
        session.leaveEndless()
        panel.scene.loadFight(intro: true)
        panel.show()
    }

    @objc private func chooseSize(_ sender: NSMenuItem) {
        panel.setSize(Settings.Size(rawValue: sender.tag) ?? .medium)
    }

    @objc private func togglePauseWhenAway() {
        Settings.pauseWhenAway.toggle()
        panel.updatePauseState()
    }

    @objc private func toggleFloorHints() {
        Settings.floorHints.toggle()
        if Settings.floorHints { Settings.hintShown = false }
        panel.scene.loadFight(intro: false)
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
