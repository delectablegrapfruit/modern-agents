import AppKit
import Metal
import SpriteKit
import OnslaughtCore

/// `ONSLAUGHT_SELFTEST=1 Onslaught.app/Contents/MacOS/Onslaught`: in a scratch save, engages the way a returning
/// pointer does, steers the ship with pointer moves, lets the autopilot fight a boss at triple speed, sets off a
/// nova with a click, picks an upgrade from the card, folds into the pill and back, checks that leaving pauses and
/// returning resumes only after the dwell, abandons the run and starts another from the debrief, and checks the
/// save. Exits 0, or 1 saying what failed. With `ONSLAUGHT_SNAPSHOTS=<dir>` it also writes what the panel showed.
enum SelfTest {
    static var enabled: Bool { ProcessInfo.processInfo.environment["ONSLAUGHT_SELFTEST"] != nil }

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
            try? await Task.sleep(nanoseconds: 170_000_000_000)
            print("SELFTEST FAIL: timed out (stage \(app.session.game.stage.rawValue), wave \(app.session.game.fight.wave), t = \(Int(app.session.game.fight.time))s)")
            exit(1)
        }
    }

    @MainActor
    private static func run(_ app: AppDelegate) async throws {
        let panel = app.panel!, scene = panel.scene, session = app.session
        Settings.pauseWhenAway = true
        Settings.hintShown = false
        Settings.novaHints = 0
        panel.setCompact(false)
        panel.setSize(.medium)
        if let screen = NSScreen.main?.visibleFrame { panel.move(topLeft: NSPoint(x: screen.minX + 60, y: screen.maxY - 60)) }
        panel.show()
        panel.setHovering(false)
        try await pause(0.6)
        guard panel.panel.isVisible, panel.gameView.scene === scene else { throw Failure("panel not on screen") }
        guard scene.isAwayPaused, session.game.fight.time == 0 else { throw Failure("the fight ran before the pointer arrived") }
        print("metal device: \(MTLCreateSystemDefaultDevice()?.name ?? "none")")
        print("boss: \(session.game.fight.boss.design.name), \(Int(session.game.fight.boss.maxHP)) hull")

        // The pointer arrives: a dwell, then the fight.
        panel.setHovering(true)
        scene.pointerMoved(to: scene.point(Vec2(120, 42)))
        try await pause(0.12)
        guard scene.isEngaging, scene.isAwayPaused else { throw Failure("arriving did not start the dwell") }
        try await pause(0.5)
        guard !scene.isAwayPaused else { throw Failure("the dwell did not end in the fight") }
        try snapshot("1-intro", panel)

        // Steering is just moving the pointer.
        scene.pointerMoved(to: scene.point(Vec2(50, 70)))
        try await pause(0.6)
        let ship = session.game.fight.ship.pos
        guard ship.x < 80, ship.y > 50 else { throw Failure("the ship did not follow the pointer (at \(Int(ship.x)), \(Int(ship.y)))") }

        // The autopilot fights the rest, fast.
        session.autopilot = true
        scene.timeScale = 3
        try await pause(2.5)
        try snapshot("2-battle", panel)
        try await waitFor("phase II", 60) { session.game.fight.boss.phase >= 1 }
        try await pause(0.9)
        try snapshot("3-phase", panel)

        // A click sets off a charged nova.
        let novas = session.game.fight.stats.novas
        session.chargeNova()
        scene.pointerDown(at: scene.point(Vec2(120, 100)))
        guard session.game.fight.stats.novas == novas + 1 else { throw Failure("the click did not set off the nova") }
        try await pause(0.12)
        try snapshot("4-nova", panel)

        try await waitFor("the boss to go down", 100) { !session.game.fight.boss.alive || session.game.stage != .fighting }
        try await pause(0.45)
        try snapshot("5-destroyed", panel)
        try await waitFor("the fight to end", 20) { session.game.stage != .fighting }
        guard session.game.stage == .armory else {
            throw Failure("the autopilot lost wave 1 (\(session.game.fight.stats.hitsTaken) hits)")
        }
        print("wave 1 won in \(Int(session.game.fight.stats.time))s, \(session.game.fight.stats.hitsTaken) hits, \(session.game.fight.stats.grazes) grazes, score \(session.game.score)")
        try await waitFor("the upgrade card", 5) { scene.choiceFrames.count == 3 }
        try await pause(0.6)
        try snapshot("6-armory", panel)
        guard session.store.load()?.stage == .armory, session.game.career.kills == 1 else { throw Failure("the victory was not saved") }

        // Pick the first upgrade by clicking its card.
        let offered = session.game.run.offer[0]
        let frame = scene.choiceFrames[0]
        scene.pointerDown(at: CGPoint(x: frame.midX, y: frame.midY))
        guard session.game.stage == .fighting, session.game.fight.wave == 2, session.game.fight.loadout.level(offered) == 1
        else { throw Failure("clicking the card did not take \(offered.title) into wave 2") }
        try await pause(1.2)
        try snapshot("7-wave2", panel)

        // The pill and back.
        panel.setCompact(true)
        try await pause(0.5)
        guard panel.panel.frame.size == ArenaScene.pillSize, scene.isCompact, scene.isAwayPaused else { throw Failure("compact did not fold and pause") }
        try snapshot("8-compact", panel)
        panel.setCompact(false)
        panel.setHovering(true)
        try await pause(0.6)
        guard panel.panel.frame.width == Settings.size.width, !scene.isAwayPaused else { throw Failure("the panel did not unfold and resume") }

        // Leaving pauses at once; coming back resumes only after the dwell.
        panel.setHovering(false)
        let clock = session.game.fight.time
        try await pause(0.7)
        guard scene.isAwayPaused, panel.gameView.isPaused, session.game.fight.time == clock else { throw Failure("leaving did not pause") }
        guard session.store.load()?.fight == session.game.fight else { throw Failure("pausing did not save the fight") }
        panel.setHovering(true)
        try await pause(0.1)
        guard session.game.fight.time == clock else { throw Failure("a passing pointer resumed the fight") }
        try await pause(0.6)
        guard !scene.isAwayPaused, session.game.fight.time > clock else { throw Failure("resting the pointer did not resume") }

        // Down: the debrief, then a click starts a new run.
        session.autopilot = false
        session.abandon()
        scene.loadFight(intro: false)
        try await pause(1.0)
        try snapshot("9-debrief", panel)
        scene.pointerDown(at: CGPoint(x: scene.size.width / 2, y: scene.size.height / 2))
        guard session.game.stage == .fighting, session.game.run.number == 2, session.game.fight.wave == 1, session.game.career.kills == 1
        else { throw Failure("the debrief did not start a new run") }

        session.save()
        guard session.store.load() == session.game else { throw Failure("the save did not round-trip") }
    }

    @MainActor
    private static func waitFor(_ what: String, _ seconds: Double, _ condition: () -> Bool) async throws {
        let started = Date()
        while !condition() {
            if Date().timeIntervalSince(started) > seconds { throw Failure("timed out waiting for \(what)") }
            try await pause(0.1)
        }
    }

    @MainActor
    private static func pause(_ seconds: Double) async throws {
        try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }

    /// Writes what the scene shows. Where SpriteKit cannot render offscreen (no GPU), it says so and carries on.
    @MainActor
    private static func snapshot(_ name: String, _ panel: PanelController) throws {
        guard let path = ProcessInfo.processInfo.environment["ONSLAUGHT_SNAPSHOTS"] else { return }
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
