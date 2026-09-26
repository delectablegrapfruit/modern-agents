import AppKit
import Metal
import SpriteKit
import RoninCore

/// `RONIN_SELFTEST=1 Ronin.app/Contents/MacOS/Ronin`: in a scratch save, makes the first cut and a whiff with real
/// left and right mouse-button events, lets the autopilot clear stage 1, advances from the banner, shows a new foe's
/// card, fights a warlord, switches to Oni and rides a combo into bloodlust, falls and rises again, switches back and
/// finds Bushidō's stage kept, folds into the pill and back, checks that leaving pauses and that coming back takes the
/// dwell, and checks the save. Exits 0, or 1 saying what failed. With `RONIN_SNAPSHOTS=<dir>` it also writes
/// what the panel showed along the way as PNGs.
enum SelfTest {
    static var enabled: Bool { ProcessInfo.processInfo.environment["RONIN_SELFTEST"] != nil }

    struct Failure: Error, CustomStringConvertible {
        let description: String
        init(_ description: String) { self.description = description }
    }

    @MainActor
    static func start(_ app: AppDelegate) {
        Task { @MainActor in
            do {
                try await run(app)
                print("SELFTEST PASS")
                exit(0)
            } catch {
                print("SELFTEST FAIL: \(error)")
                exit(1)
            }
        }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 200_000_000_000)
            print("SELFTEST FAIL: timed out")
            exit(1)
        }
    }

    @MainActor
    private static func run(_ app: AppDelegate) async throws {
        let panel = app.panel!, scene = panel.scene, session = app.session
        Settings.pauseWhenAway = false
        Settings.hintShown = false
        panel.setCompact(false)
        panel.setSize(.large)
        if let screen = NSScreen.main?.visibleFrame { panel.move(topLeft: NSPoint(x: screen.minX + 60, y: screen.maxY - 60)) }
        panel.show()
        try await pause(0.7)
        guard panel.panel.isVisible, panel.gameView.scene === scene else { throw Failure("panel not on screen") }
        guard !scene.isAwayPaused else { throw Failure("the fight did not start with pausing turned off") }
        print("metal device: \(MTLCreateSystemDefaultDevice()?.name ?? "none")")
        
        try snapshot("1-hint", panel)

        // The first cut, with the mouse button for the side a spearman has walked into reach on.
        try await until("a foe came into reach", timeout: 15) { session.fight.target(.left) != nil || session.fight.target(.right) != nil }
        let side: Side = session.fight.target(.left) != nil ? .left : .right
        click(side, panel)
        guard session.fight.stats.kills == 1, session.fight.combo == 1, session.fight.facing == side
        else { throw Failure("the \(side == .left ? "left" : "right") button did not cut that way") }
        try await pause(0.05)
        try snapshot("2-cut", panel)

        // The other button, at nothing: a whiff that way, and a stumble.
        try await pause(0.3)
        try await until("nothing in reach on the other side", timeout: 10) { session.fight.target(side.opposite) == nil }
        click(side.opposite, panel)
        guard session.fight.stats.whiffs == 1, session.fight.isStumbling, session.fight.facing == side.opposite
        else { throw Failure("the \(side == .left ? "right" : "left") button did not swing that way") }

        // The rest of stage 1 on autopilot, fast.
        session.autopilot = true
        scene.timeScale = 3
        try await pause(2.5)
        try snapshot("3-fight", panel)
        try await until("stage 1 ended", timeout: 60) { session.fight.outcome != nil }
        guard session.fight.outcome == .victory else { throw Failure("the autopilot lost stage 1") }
        print("stage 1: \(session.fight.stats.kills) kills in \(Int(session.fight.time))s, best combo \(session.fight.stats.bestCombo)")
        try await until("the banner", timeout: 5) { scene.isShowingBanner }
        try await pause(0.7)
        try snapshot("4-cleared", panel)
        guard session.career.stage == 2, session.career.kills == session.fight.stats.kills else { throw Failure("the win was not booked") }
        guard let saved = session.store.load(), saved.career == session.career else { throw Failure("the win was not saved") }
        guard Settings.hintShown else { throw Failure("the button hint stayed up after kills on both sides") }

        // Clicking the banner starts stage 2.
        click(.right, panel)
        guard session.fight.stage == 2, session.fight.outcome == nil, session.fight.time == 0 else { throw Failure("the banner did not advance") }
        try await pause(0.5)

        // A new kind of foe gets a card: stage 4's archer.
        session.jump(to: 4)
        scene.loadFight(intro: true)
        try await pause(0.45)
        try snapshot("5-newcomer", panel)

        // A warlord, at the end of stage 5.
        session.jump(to: 5)
        scene.loadFight(intro: true)
        scene.timeScale = 5
        try await until("the warlord arrived", timeout: 60) { session.fight.boss != nil || session.fight.outcome != nil }
        guard session.fight.outcome == nil else { throw Failure("stage 5 ended (\(session.fight.outcome!.rawValue)) before its warlord came") }
        scene.timeScale = 1
        try await until("the warlord closed in", timeout: 10) { (session.fight.boss?.distance ?? 0) < 0.55 }
        try await pause(0.2)
        try snapshot("6-warlord", panel)
        scene.timeScale = 3
        try await until("stage 5 ended", timeout: 40) { session.fight.outcome != nil }
        guard session.fight.outcome == .victory else { throw Failure("the autopilot lost to the warlord") }
        try await pause(0.35)
        try snapshot("7-warlord-slain", panel)

        // Oni: three hearts and its own stage count. Bloodlust in the thick of its stage 7.
        session.choose(.oni)
        guard session.fight.mode == .oni, session.fight.hp == 3, session.fight.stage == 1 else { throw Failure("Oni did not start at stage 1 with 3 hearts") }
        session.jump(to: 7)
        scene.loadFight(intro: true)
        scene.timeScale = 2
        try await until("bloodlust with a crowd", timeout: 60) {
            (session.fight.inBloodlust && session.fight.foes.count >= 3) || session.fight.outcome != nil
        }
        if session.fight.outcome == nil {
            scene.timeScale = 1
            try await pause(0.5)
            try snapshot("8-oni-bloodlust", panel)
        } else {
            print("stage 7 ended before a crowd met bloodlust; no snapshot")
            session.next()
            scene.loadFight(intro: false)
        }

        // Hands off: the ronin falls, and rises again into the same stage.
        let stage = session.fight.stage
        session.autopilot = false
        scene.timeScale = 6
        try await until("the ronin fell", timeout: 60) { session.fight.outcome != nil }
        guard session.fight.outcome == .defeat else { throw Failure("stage \(stage) was won with nobody cutting") }
        try await until("the banner", timeout: 5) { scene.isShowingBanner }
        try await pause(0.7)
        try snapshot("9-fallen", panel)
        guard session.career.falls == 1, session.career.stage == stage, session.career.attempt == 2 else { throw Failure("the fall was not booked") }
        click(.left, panel)
        guard session.fight.stage == stage, session.fight.outcome == nil else { throw Failure("rising again did not restart the stage") }

        // Back to Bushidō: its stage is where it was left (stage 5 won, so 6), and it has five hearts again.
        session.choose(.bushido)
        guard session.fight.mode == .bushido, session.fight.stage == 6, session.fight.hp == 5 else { throw Failure("Bushidō's stage was not kept") }
        session.autopilot = true

        // The pill and back.
        panel.setCompact(true)
        try await pause(0.4)
        guard panel.panel.frame.size == DuelScene.pillSize, scene.isCompact else { throw Failure("compact did not fold to the pill") }
        try snapshot("10-compact", panel)
        panel.setCompact(false)
        try await pause(0.4)
        guard panel.panel.frame.width == Settings.size.width else { throw Failure("the panel did not unfold") }

        // Leaving pauses at once; coming back takes the dwell.
        Settings.pauseWhenAway = true
        scene.timeScale = 1
        panel.setHovering(false)
        let clock = session.fight.time
        try await pause(1.6)
        guard scene.isAwayPaused, panel.gameView.isPaused, session.fight.time == clock else { throw Failure("leaving did not pause") }
        panel.setHovering(true)
        try await pause(0.1)
        guard scene.isAwayPaused, scene.isEngaging, session.fight.time == clock else { throw Failure("coming back resumed without the dwell") }
        try await pause(0.6)
        guard !scene.isAwayPaused, session.fight.time > clock else { throw Failure("coming back did not resume") }

        // A saved fight comes back exactly.
        session.save()
        guard let reloaded = session.store.load(), reloaded.fight == session.fight, reloaded.career == session.career
        else { throw Failure("the save did not round-trip") }
    }

    /// A real mouse-button event on the lane: the left button, or the right.
    @MainActor
    private static func click(_ side: Side, _ panel: PanelController) {
        let view = panel.gameView
        let location = view.convert(NSPoint(x: view.bounds.midX, y: view.bounds.height * 0.35), to: nil)
        guard let event = NSEvent.mouseEvent(with: side == .left ? .leftMouseDown : .rightMouseDown, location: location, modifierFlags: [],
                                             timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: panel.panel.windowNumber,
                                             context: nil, eventNumber: 0, clickCount: 1, pressure: 1)
        else { return }
        if side == .left { view.mouseDown(with: event) } else { view.rightMouseDown(with: event) }
    }

    @MainActor
    private static func pause(_ seconds: Double) async throws {
        try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }

    @MainActor
    private static func until(_ what: String, timeout: Double, _ condition: () -> Bool) async throws {
        let start = Date()
        while !condition() {
            if Date().timeIntervalSince(start) > timeout { throw Failure("timed out waiting for \(what)") }
            try await pause(0.02)
        }
    }

    /// Writes what the scene shows. Where SpriteKit cannot render offscreen (no GPU), it says so and carries on.
    @MainActor
    private static func snapshot(_ name: String, _ panel: PanelController) throws {
        guard let path = ProcessInfo.processInfo.environment["RONIN_SNAPSHOTS"] else { return }
        let directory = URL(fileURLWithPath: path, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let scene = panel.scene
        guard let texture = panel.gameView.texture(from: scene, crop: CGRect(origin: .zero, size: scene.size)) else {
            print("snapshot \(name): no texture")
            return
        }
        let image = texture.cgImage()
        guard let data = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else {
            throw Failure("could not encode \(name)")
        }
        try data.write(to: directory.appendingPathComponent(name + ".png"))
        print("snapshot \(name): \(image.width)×\(image.height)")
    }
}
