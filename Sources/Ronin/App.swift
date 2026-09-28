import AppKit
import RoninCore

/// Ronin lives in the menu bar (no Dock icon) and in one small floating strip. ⌃⌥R (or another shortcut from the menu,
/// if another app holds that one) shows and hides it from anywhere, on the screen you are working on.
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
    /// Which of `Shortcut.all` is registered; nil when every one is held by another app.
    private(set) var shortcut: Int?

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
        registerShortcut()
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

    /// Registers the shortcut chosen in the menu, or if another app holds it, the next one free.
    private func registerShortcut() {
        hotKey = nil
        shortcut = nil
        let all = Shortcut.all
        let chosen = all.indices.contains(Settings.shortcut) ? Settings.shortcut : 0
        for k in [chosen] + all.indices.filter({ $0 != chosen }) {
            let key = HotKey(keyCode: all[k].keyCode, modifiers: all[k].carbonModifiers, action: { [weak self] in
                MainActor.assumeIsolated { self?.panel.summon() }
            })
            if let key {
                hotKey = key
                shortcut = k
                return
            }
        }
    }

    // MARK: The menu

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let career = session.career
        let fight = session.fight
        func note(_ text: String, to target: NSMenu) {
            let item = NSMenuItem(title: text, action: nil, keyEquivalent: "")
            item.isEnabled = false
            target.addItem(item)
        }
        func add(_ title: String, _ action: Selector, key: String = "", modifiers: NSEvent.ModifierFlags = [], on: Bool? = nil) {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
            item.keyEquivalentModifierMask = modifiers
            item.target = self
            if let on { item.state = on ? .on : .off }
            menu.addItem(item)
        }
        func submenu(_ title: String, _ items: NSMenu) {
            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            item.submenu = items
            menu.addItem(item)
        }
        func count(_ n: Int, _ word: String) -> String { "\(n) \(word)\(n == 1 ? "" : "s")" }

        // Where you are, and the career.
        if let run = career.endless {
            note("\(career.mode.title) · endless on stage \(run.stage) · \(run.cleared) in a row", to: menu)
        } else {
            note("\(career.mode.title) · stage \(fight.stage) · \(fight.setting.name)", to: menu)
        }
        var record = "\(career.rank) · \(count(career.kills, "kill"))"
        if career.streak > 1 { record += " · \(career.streak) in a row" }
        note(record, to: menu)
        if let next = career.nextRank {
            note("\(count(Rank.kills(from: career.merit, to: next.kills, on: career.mode), "more kill")) to \(next.title)", to: menu)
        }
        if career.bestCombo > 0 {
            note("Best combo \(career.bestCombo) · \(career.flawless) flawless · \(count(career.falls, "fall"))", to: menu)
        }
        // The best run of the kind being played: the campaign's most stages, or on the endless run's stage its most
        // clears in a row.
        if let run = career.endless {
            if let best = career.bestRun(from: run.start) {
                note("Best on stage \(run.start): \(best.cleared) in a row · \(DuelScene.grouped(best.score))", to: menu)
            }
        } else if let best = career.bestCampaignRun {
            note("Best run \(count(best.cleared, "stage")) · \(DuelScene.grouped(best.score))", to: menu)
        }
        if career.score > 0 {
            note("\(DuelScene.grouped(career.score)) points in all · best stage \(DuelScene.grouped(career.bestScore))", to: menu)
        }
        menu.addItem(.separator())

        let live = shortcut.map { Shortcut.all[$0] }
        add(panel.panel.isVisible ? "Hide Ronin" : "Show Ronin", #selector(toggleWindow), key: live?.key ?? "", modifiers: live?.modifiers ?? [])
        if live == nil { note("No shortcut: other apps hold them all", to: menu) }
        add("Compact", #selector(toggleCompact), on: panel.scene.isCompact)

        // Each mode's campaign: its stage, and the hearts it carries of the most it can hold.
        let modes = NSMenu()
        for mode in Mode.allCases {
            var probe = career
            probe.choose(mode)
            let hearts = mode == career.mode && !career.isEndless && fight.outcome == nil ? fight.hp : probe.carried
            let item = NSMenuItem(title: "\(mode.title) — \(mode.gist) · ♥ \(hearts)/\(mode.hearts) · stage \(probe.stage)",
                                  action: #selector(chooseMode(_:)), keyEquivalent: "")
            item.target = self
            item.tag = mode.level
            item.state = mode == career.mode ? .on : .off
            modes.addItem(item)
        }
        submenu("Difficulty", modes)

        // Endless: any stage reached, played over and over (a fresh roll each time), hearts carried, until the ronin
        // falls. Each stage keeps its own best run: the most clears in a row.
        let endless = NSMenu()
        var campaignTitle = "Campaign · stage \(career.stage)"
        if let best = career.bestCampaignRun { campaignTitle += " · best \(count(best.cleared, "stage"))" }
        let campaign = NSMenuItem(title: campaignTitle, action: #selector(leaveEndless), keyEquivalent: "")
        campaign.target = self
        campaign.state = career.isEndless ? .off : .on
        endless.addItem(campaign)
        endless.addItem(.separator())
        let unlocked = career.unlocked
        var stages = Array(unlocked)
        if stages.count > 30 { stages = stages.filter { $0 == 1 || $0 % 5 == 0 || $0 == unlocked.upperBound } }
        for stage in stages {
            var title = "Stage \(stage)" + (stage % 5 == 0 ? " · warlord" : "")
            if let best = career.bestRun(from: stage) { title += " · best \(best.cleared) in a row" }
            let item = NSMenuItem(title: title, action: #selector(startEndless(_:)), keyEquivalent: "")
            item.target = self
            item.tag = stage
            item.state = career.endless?.start == stage ? .on : .off
            endless.addItem(item)
        }
        if let most = career.bestEndless[career.mode.rawValue], most > 0 {
            endless.addItem(.separator())
            note("Most clears in a row: \(most)", to: endless)
        }
        submenu("Endless", endless)

        let sizes = NSMenu()
        for size in Settings.Size.allCases {
            let item = NSMenuItem(title: size.title, action: #selector(chooseSize(_:)), keyEquivalent: "")
            item.target = self
            item.tag = size.rawValue
            item.state = size == Settings.size ? .on : .off
            sizes.addItem(item)
        }
        submenu("Size", sizes)
        add("Pause When Pointer Leaves", #selector(togglePauseWhenAway), on: Settings.pauseWhenAway)
        add("Dim When Pointer Leaves", #selector(toggleDimWhenAway), on: Settings.dimWhenAway)
        add("Floor Hints", #selector(toggleFloorHints), on: Settings.floorHints)
        add("Reduce Motion", #selector(toggleReduceMotion), on: Settings.reduceMotion)
        add("Gore", #selector(toggleGore), on: Settings.gore)

        let shortcuts = NSMenu()
        for (k, option) in Shortcut.all.enumerated() {
            let taken = k == Settings.shortcut && shortcut != k
            let item = NSMenuItem(title: option.title + (taken ? " — held by another app" : ""), action: #selector(chooseShortcut(_:)),
                                  keyEquivalent: "")
            item.target = self
            item.tag = k
            item.state = shortcut == k ? .on : .off
            shortcuts.addItem(item)
        }
        submenu("Shortcut", shortcuts)

        let controls = NSMenu()
        for line in [
            "Cut left: left button, ←, A or F",
            "Cut right: right button (two-finger or ⌃-click), →, D or J",
            "Go on, or resume: a click, Space or Return",
            "Leave the panel to pause; come back to resume",
            "Fold into the pill: C or – · Hide: Esc or ⌘W",
            "Show or hide from anywhere: " + (live?.title ?? "the menu"),
        ] { note(line, to: controls) }
        submenu("Controls", controls)

        // Development: the crowd rules, the game's ticked, to try the game without one (or with another).
        let development = NSMenu()
        let crowd = Settings.crowding
        func rule(_ title: String, _ tag: Int, _ on: Bool, enabled: Bool = true) {
            let item = NSMenuItem(title: title, action: enabled ? #selector(toggleRule(_:)) : nil, keyEquivalent: "")
            item.target = self
            item.tag = tag
            item.state = on ? .on : .off
            development.addItem(item)
        }
        note("Crowd (the game: Slip Past, Runners Pass Everyone, Pass the Busy, Shove Through)", to: development)
        rule("Queue — each waits behind the man in front", 0, !crowd.passes)
        rule("Full Pass-Through — everyone walks through everyone", 1, crowd.passThrough)
        rule("Slip Past — runners, dancers and the gourd-bearer past brutes and archers", 2, crowd.slipPast, enabled: !crowd.passThrough)
        rule("Runners Pass Everyone — past anyone but the warlord", 6, crowd.runnersPassAll, enabled: !crowd.passThrough)
        rule("Pass the Busy — past a man winding up or recovering", 3, crowd.passBusy, enabled: !crowd.passThrough)
        rule("Shove Through — the brute through lighter men", 4, crowd.shove, enabled: !crowd.passThrough)
        development.addItem(.separator())
        note("The brute (the game: No Knockback)", to: development)
        rule("No Brute Knockback — a cut neither moves him nor breaks his blow; cut as his club glares to turn it", 5,
             crowd.noBruteKnockback)
        development.addItem(.separator())
        rule("Restore the Game's Rules", 7, false, enabled: !crowd.isStandard)
        submenu(crowd.isStandard ? "Development" : "Development (rules changed)", development)
        menu.addItem(.separator())

        // Walking away from a fight keeps the hearts it cost; past a stage's card, this goes on as the card does.
        switch fight.outcome {
        case nil: add("Restart Stage · ♥ \(fight.hp)", #selector(restart))
        case .victory?: add("Next Stage", #selector(restart))
        case .defeat?: add("Start Over · Stage \(career.current)", #selector(restart))
        }
        add("Reset Career…", #selector(resetCareer))
        menu.addItem(.separator())
        add("Quit Ronin", #selector(quit), key: "q", modifiers: [.command])
    }

    /// Hides the panel, or shows it on the screen you are working on.
    @objc private func toggleWindow() {
        if panel.panel.isVisible { panel.hide() } else { panel.summon() }
    }

    @objc private func toggleCompact() {
        if !panel.panel.isVisible { panel.show() }
        panel.setCompact(!panel.scene.isCompact)
    }

    @objc private func chooseMode(_ sender: NSMenuItem) {
        guard Mode.allCases.indices.contains(sender.tag) else { return }
        let mode = Mode.allCases[sender.tag]
        // The mode already being played is left as it is (its lane, its dead).
        if mode != session.career.mode {
            session.choose(mode)
            panel.scene.loadFight(intro: true)
        }
        panel.show()
    }

    @objc private func startEndless(_ sender: NSMenuItem) {
        session.startEndless(at: sender.tag)
        panel.scene.loadFight(intro: true)
        panel.show()
    }

    @objc private func leaveEndless() {
        if session.career.isEndless {
            session.leaveEndless()
            panel.scene.loadFight(intro: true)
        }
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
        panel.setFloorHints(!Settings.floorHints)
    }

    @objc private func toggleReduceMotion() {
        Settings.reduceMotion.toggle()
    }

    /// A crowd rule on or off, played from the next step on. Queue turns every passing rule off (and, already a queue,
    /// back to the game's); Restore puts every rule back as the game plays it.
    @objc private func toggleRule(_ sender: NSMenuItem) {
        var crowd = Settings.crowding
        let game = Crowding.standard
        switch sender.tag {
        case 0:
            let queued = !crowd.passes
            crowd.passThrough = false
            crowd.slipPast = queued && game.slipPast
            crowd.runnersPassAll = queued && game.runnersPassAll
            crowd.passBusy = queued && game.passBusy
            crowd.shove = queued && game.shove
        case 1: crowd.passThrough.toggle()
        case 2: crowd.slipPast.toggle()
        case 3: crowd.passBusy.toggle()
        case 4: crowd.shove.toggle()
        case 5: crowd.noBruteKnockback.toggle()
        case 6: crowd.runnersPassAll.toggle()
        case 7: crowd = game
        default: return
        }
        Settings.crowding = crowd
    }

    /// Gore on or off: the lane takes it up with whatever happens next (the blood already spilt stays where it is).
    @objc private func toggleGore() {
        Settings.gore.toggle()
    }

    @objc private func toggleDimWhenAway() {
        Settings.dimWhenAway.toggle()
        panel.updatePauseState()
    }

    @objc private func chooseShortcut(_ sender: NSMenuItem) {
        guard Shortcut.all.indices.contains(sender.tag) else { return }
        Settings.shortcut = sender.tag
        registerShortcut()
    }

    /// Restart Stage: a fresh roll of the stage at the hearts left. Past a card: on, as the card goes.
    @objc private func restart() {
        session.restart()
        panel.scene.loadFight(intro: true)
        panel.show()
    }

    @objc private func resetCareer() {
        // The alert has to come up in front; afterwards, the app you were working in is given back the keys.
        let previous = NSWorkspace.shared.frontmostApplication
        defer {
            if let previous, previous != NSRunningApplication.current {
                previous.activate(from: NSRunningApplication.current, options: [])
            }
        }
        NSApp.activate()
        let alert = NSAlert()
        alert.messageText = "Reset your career?"
        alert.informativeText = "Your rank, kills, stages and best runs go back to the start."
        alert.addButton(withTitle: "Reset")
        alert.addButton(withTitle: "Cancel")
        alert.alertStyle = .warning
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        session.reset()
        panel.scene.loadFight(intro: true)
        panel.show()
    }

    @objc private func quit() { NSApp.terminate(nil) }
}
