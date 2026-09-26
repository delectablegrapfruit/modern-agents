import AppKit
import Metal
import SpriteKit
import SkirmishCore

/// `SKIRMISH_SELFTEST=1 Skirmish.app/Contents/MacOS/Skirmish`: plays a battle on autopilot at six times speed in a
/// scratch save, folds the panel into its pill and back, launches a fleet the way a drag does, checks the save
/// and the pause, and exits 0 (or 1, saying what failed). With `SKIRMISH_SNAPSHOTS=<dir>` it also writes what the
/// panel showed along the way as PNGs.
enum SelfTest {
    static var enabled: Bool { ProcessInfo.processInfo.environment["SKIRMISH_SELFTEST"] != nil }

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
            try? await Task.sleep(nanoseconds: 150_000_000_000)
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
        panel.setSize(.medium)
        if let screen = NSScreen.main?.visibleFrame { panel.move(topLeft: NSPoint(x: screen.minX + 60, y: screen.maxY - 60)) }
        panel.show()
        try await pause(1)
        guard panel.panel.isVisible, panel.gameView.scene === scene else { throw Failure("panel not on screen") }
        print("metal device: \(MTLCreateSystemDefaultDevice()?.name ?? "none")")

        // A player's first move, the way the pointer makes it: press on home, drag to the nearest outpost, let go.
        let battle = session.battle
        guard let home = battle.outposts.first(where: { $0.owner == Side.player })?.id else { throw Failure("no home") }
        let target = battle.outposts.filter { $0.id != home }
            .min { $0.position.distance(to: battle.outposts[home].position) < $1.position.distance(to: battle.outposts[home].position) }!.id
        let homePoint = scene.point(ofOutpost: home), targetPoint = scene.point(ofOutpost: target)
        scene.pointerDown(at: homePoint, clickCount: 1)
        scene.pointerDragged(to: CGPoint(x: (homePoint.x + targetPoint.x) / 2, y: (homePoint.y + targetPoint.y) / 2))
        scene.pointerDragged(to: targetPoint)
        try snapshot("1-aiming", panel)
        scene.pointerUp(at: targetPoint)
        guard session.battle.fleets.contains(where: { $0.from == home && $0.to == target }) else { throw Failure("the drag launched nothing") }
        guard Settings.hintShown else { throw Failure("the hint did not go away after the first launch") }
        try await pause(0.4)
        try snapshot("2-launch", panel)

        // The rest of the battle on autopilot, fast.
        session.autopilot = true
        scene.timeScale = 6
        try await pause(3)
        try snapshot("3-battle", panel)
        let started = Date()
        while session.battle.outcome == nil {
            if Date().timeIntervalSince(started) > 100 { throw Failure("the battle did not finish (t = \(Int(session.battle.time))s)") }
            try await pause(0.5)
        }
        let outcome = session.battle.outcome!
        print("battle over: \(outcome.rawValue) in \(Int(session.battle.time))s, \(Int(session.battle.stats.kills)) destroyed")
        try await pause(1.2)
        try snapshot("4-\(outcome.rawValue)", panel)
        guard session.campaign.victories + session.campaign.defeats == 1 else { throw Failure("the result was not recorded once") }
        guard let saved = session.store.load(), saved.campaign == session.campaign else { throw Failure("the result was not saved") }

        scene.pointerDown(at: CGPoint(x: scene.size.width / 2, y: scene.size.height / 2), clickCount: 1)
        guard session.battle.outcome == nil, session.battle.time == 0, session.battle.sector == session.campaign.sector
        else { throw Failure("clicking the banner did not start the next battle") }
        try await pause(0.8)
        try snapshot("5-next", panel)

        // The pill and back.
        panel.setCompact(true)
        try await pause(0.5)
        guard panel.panel.frame.size == BattleScene.pillSize, scene.isCompact else { throw Failure("compact did not fold to the pill") }
        try snapshot("6-compact", panel)
        panel.setCompact(false)
        try await pause(0.5)
        guard panel.panel.frame.width == Settings.size.side else { throw Failure("the panel did not unfold") }

        // Leaving pauses: the curtain, then SpriteKit stops drawing.
        Settings.pauseWhenAway = true
        panel.setHovering(false)
        let clock = session.battle.time
        try await pause(0.8)
        guard scene.isAwayPaused, panel.gameView.isPaused, session.battle.time == clock else { throw Failure("leaving did not pause") }
        panel.setHovering(true)
        try await pause(0.5)
        guard !scene.isAwayPaused, session.battle.time > clock else { throw Failure("coming back did not resume") }
        session.autopilot = false

        // A saved battle comes back exactly.
        session.save()
        guard let reloaded = session.store.load(), reloaded.battle == session.battle else { throw Failure("the save did not round-trip") }
    }

    @MainActor
    private static func pause(_ seconds: Double) async throws {
        try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }

    /// Writes what the scene shows. Where SpriteKit cannot render offscreen (no GPU), it says so and carries on.
    @MainActor
    private static func snapshot(_ name: String, _ panel: PanelController) throws {
        guard let path = ProcessInfo.processInfo.environment["SKIRMISH_SNAPSHOTS"] else { return }
        let directory = URL(fileURLWithPath: path, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let scene = panel.scene
        let crop = CGRect(origin: .zero, size: scene.size)
        guard let texture = panel.gameView.texture(from: scene, crop: crop) else {
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
