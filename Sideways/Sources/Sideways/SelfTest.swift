import AppKit
import SidewaysCore

/// `SIDEWAYS_SELFTEST=1`: the real app, window and all, driven by the autopilot through the view's own key
/// handling until it has banked points and finished a lap (or a minute and a half has gone), then a verdict on
/// stdout and in the exit code. With `SIDEWAYS_SELFTEST_SHOT=<file>` the window's last frame is saved as a PNG.
enum SelfTest {
    private static var activity: NSObjectProtocol?

    static func start(game: Game, view: GameView, panel: GamePanel) {
        activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiatedAllowingIdleSystemSleep, .latencyCritical], reason: "Self-test")
        setvbuf(stdout, nil, _IOLBF, 0)
        panel.makeKeyAndOrderFront(nil)
        let becameKey = panel.isKeyWindow
        view.drawsSpecimen = true
        view.display()
        var pilot = Autopilot(style: .drift)
        var held: Set<UInt16> = []
        let start = game.session.car.position
        var furthest = 0.0
        let began = Date()
        var ticks = 0, pauses = 0, lastReport = 0
        let timer = Timer(timeInterval: 1.0 / 60, repeats: true) { timer in
            ticks += 1
            // A pause (the window lost the keyboard) lets go of every key: press the held ones again.
            if game.isPaused && !held.isEmpty {
                pauses += 1
                held = []
            }
            let keys = pilot.keys(for: game.session, dt: 1.0 / 60)
            var wanted: Set<UInt16> = []
            if keys.left { wanted.insert(123) }
            if keys.right { wanted.insert(124) }
            if keys.up { wanted.insert(126) }
            if keys.down { wanted.insert(125) }
            if keys.handbrake { wanted.insert(49) }
            for code in wanted.subtracting(held) { send(code, down: true, to: view, in: panel) }
            for code in held.subtracting(wanted) { send(code, down: false, to: view, in: panel) }
            held = wanted
            furthest = max(furthest, game.session.car.position.distance(to: start))
            let elapsed = Date().timeIntervalSince(began)
            if Int(elapsed) / 5 > lastReport {
                lastReport = Int(elapsed) / 5
                let session = game.session
                print(String(format: "SELFTEST %4.0fs  clock %5.1f  frames %5d  ticks %5d  lap %d  s %4.0f/%4.0f  speed %3.0f  key %@  paused %@",
                             elapsed, session.clock, game.frames, ticks, session.lapNumber, session.position.s, session.track.length,
                             session.car.speed, panel.isKeyWindow ? "yes" : "no", game.isPaused ? "yes" : "no"))
            }
            let done = game.records.careerLaps >= 1 && game.records.careerPoints > 0
            guard done || elapsed > 90 else { return }
            timer.invalidate()
            print("SELFTEST pauses: \(pauses)")
            finish(game: game, view: view, panel: panel, becameKey: becameKey, furthest: furthest)
        }
        RunLoop.main.add(timer, forMode: .common)
    }

    private static func send(_ code: UInt16, down: Bool, to view: GameView, in panel: GamePanel) {
        guard let event = NSEvent.keyEvent(with: down ? .keyDown : .keyUp, location: .zero, modifierFlags: [],
                                           timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: panel.windowNumber,
                                           context: nil, characters: "", charactersIgnoringModifiers: "", isARepeat: false,
                                           keyCode: code) else { return }
        if down { view.keyDown(with: event) } else { view.keyUp(with: event) }
    }

    private static func finish(game: Game, view: GameView, panel: GamePanel, becameKey: Bool, furthest: Double) {
        let laps = game.records.careerLaps
        let checks: [(String, Bool)] = [
            ("the window is on screen", panel.isVisible),
            ("frames were drawn (\(game.frames))", game.frames > 600),
            ("the car drove (\(Int(furthest)) units from the grid)", furthest > 300),
            ("a lap was completed (\(laps), best \(game.session.bestLap.map(Format.lap) ?? "none"))", laps >= 1),
            ("points were banked (\(game.records.careerPoints))", game.records.careerPoints > 0),
        ]
        print("SELFTEST window became key on show: \(becameKey)")
        for (name, passed) in checks { print("SELFTEST \(passed ? "PASS" : "FAIL") \(name)") }

        game.pause()
        view.display()
        if let path = ProcessInfo.processInfo.environment["SIDEWAYS_SELFTEST_SHOT"],
           let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) {
            view.cacheDisplay(in: view.bounds, to: rep)
            try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
        }
        exit(checks.allSatisfy { $0.1 } ? 0 : 1)
    }
}
