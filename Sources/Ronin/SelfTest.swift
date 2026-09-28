import AppKit
import Metal
import SpriteKit
import RoninArt
import RoninCore

/// `RONIN_SELFTEST=1 Ronin.app/Contents/MacOS/Ronin`: in a scratch save and a scratch defaults domain, checks the
/// defaults (floor hints off, a Medium panel, gore on) and that what is drawn over a foe's head stays on the lane at
/// every size (a gourd-bearer's pips and marker clear of his gourd), grows the panel from its default corner and folds
/// it there and back without it leaving the screen, shows what a new player first sees, makes the first cut and a whiff
/// with real left and right mouse-button events, lets the autopilot clear stage 1 and checks that its dead fall on
/// under the card, folds into the pill and back and changes the size with the dead still lying there, advances from the
/// banner, shows a new foe's card and checks it follows a resize, fights a warlord (his bar in the header, his blow
/// coming, a cut into his set guard bound on his blade), switches to Oni and rides a combo into bloodlust, falls and
/// starts again from stage 1, switches back and finds Bushidō's stage and hearts kept, runs an endless stage with gore
/// off (nobody cut apart, not a drop of blood) straight into the next, checks that dragging the window holds the fight
/// still and that a stage won with the pointer away does not start the next behind its back, folds into the pill and
/// back, checks that leaving pauses and gives the keys back (so a key typed elsewhere does nothing) and that coming
/// back takes the dwell, and checks the save. Exits 0, or 1 saying what failed. With `RONIN_SNAPSHOTS=<dir>` it also
/// writes what the panel showed along the way as PNGs, and fails if one cannot be taken.
enum SelfTest {
    static var enabled: Bool { ProcessInfo.processInfo.environment["RONIN_SELFTEST"] != nil }

    struct Failure: Error, CustomStringConvertible {
        let description: String
        init(_ description: String) { self.description = description }
    }

    @MainActor
    static func start(_ app: AppDelegate) {
        // A line at a time, so a run that dies (a crash, not a failure) still shows how far it got.
        setvbuf(stdout, nil, _IOLBF, 0)
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
        // Floor hints are off unless asked for, the panel is Medium until a size is chosen, and gore is on until
        // turned off.
        Settings.defaults.removeObject(forKey: "floorHints")
        Settings.defaults.removeObject(forKey: "size")
        Settings.defaults.removeObject(forKey: "gore")
        guard !Settings.floorHints else { throw Failure("floor hints were on by default") }
        guard Settings.size == .medium else { throw Failure("the panel was not Medium by default") }
        guard Settings.gore else { throw Failure("gore was off by default") }
        try checkOverhead()
        panel.setCompact(false)
        panel.setSize(.medium)

        // From the default corner, Large grows out of the corner, and folding into the pill and back comes back to
        // the same place: the whole panel stays on screen. The header cannot be put under the menu bar.
        if let visible = panel.panel.screen?.visibleFrame ?? NSScreen.main?.visibleFrame {
            let corner = PanelController.defaultFrame(size: panel.panel.frame.size, in: visible)
            panel.move(topLeft: NSPoint(x: corner.minX, y: corner.maxY))
            panel.setSize(.large)
            let large = panel.panel.frame
            guard within(large, visible) else { throw Failure("Large from the default corner went off screen: \(large) in \(visible)") }
            guard abs(large.maxX - corner.maxX) < 1, abs(large.minY - corner.minY) < 1 else { throw Failure("Large did not grow out of the corner: \(large)") }
            panel.setCompact(true)
            guard within(panel.panel.frame, visible) else { throw Failure("the pill went off screen: \(panel.panel.frame)") }
            panel.setCompact(false)
            guard near(panel.panel.frame, large) else { throw Failure("folding and unfolding moved the panel: \(panel.panel.frame), was \(large)") }
            panel.move(topLeft: NSPoint(x: visible.minX + 100, y: visible.maxY + 20))
            guard panel.panel.frame.maxY <= visible.maxY + 0.5 else { throw Failure("the header went under the menu bar") }
        } else {
            print("no screen: the panel's place not checked")
        }
        panel.setSize(.large)
        if let screen = NSScreen.main?.visibleFrame { panel.move(topLeft: NSPoint(x: screen.minX + 60, y: screen.maxY - 60)) }
        panel.show()

        // What a new player first sees: the defaults, a fresh career, the first stage's card.
        scene.loadFight(intro: true)
        try await pause(0.7)
        guard panel.panel.isVisible, panel.gameView.scene === scene else { throw Failure("panel not on screen") }
        guard !scene.isAwayPaused else { throw Failure("the fight did not start with pausing turned off") }
        print("metal device: \(MTLCreateSystemDefaultDevice()?.name ?? "none")")
        try snapshot("0-first-look", panel)

        // Floor hints on, from the menu's own path, to check them; off again after stage 1.
        panel.setFloorHints(true)
        scene.loadFight(intro: true)
        try await pause(0.5)
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
        // The flourish: the blood flicked away, the blade going home, before the card comes up. The last blow's freeze
        // is long over, so the last man cut down is falling or down, not hanging in the air.
        try await pause(0.95)
        try snapshot("4-flourish", panel)
        guard !scene.isFrozen else { throw Failure("the last blow's freeze never ran out: the dead hung in the air") }
        try await until("the banner", timeout: 5) { scene.isShowingBanner }
        try await pause(0.7)
        try snapshot("5-cleared", panel)
        guard session.career.stage == 2, session.career.kills == session.fight.stats.kills else { throw Failure("the win was not booked") }
        guard session.career.run.cleared == 1, session.runScore == session.fight.score else { throw Failure("the run was not tallied") }
        guard scene.bodiesOnLane > 0 else { throw Failure("the dead did not stay where they fell") }
        guard let saved = session.store.load(), saved.career == session.career else { throw Failure("the win was not saved") }
        guard Settings.hintShown else { throw Failure("the button hint stayed up after kills on both sides") }

        // Folding into the pill and back leaves the dead where they fell and the card up; so does turning floor
        // hints off.
        panel.setCompact(true)
        try await pause(0.3)
        panel.setCompact(false)
        try await pause(0.4)
        guard scene.bodiesOnLane > 0 else { throw Failure("folding into the pill swept away the dead") }
        guard scene.isShowingBanner else { throw Failure("folding into the pill took the card down") }
        panel.setFloorHints(false)
        try await pause(0.1)
        guard scene.bodiesOnLane > 0 else { throw Failure("turning floor hints off swept away the dead") }
        // Another size keeps them too (scaled with the lane), and the card with them.
        panel.setSize(.medium)
        try await pause(0.3)
        guard scene.bodiesOnLane > 0 else { throw Failure("changing the size swept away the dead") }
        guard scene.isShowingBanner else { throw Failure("changing the size took the card down") }
        panel.setSize(.large)
        try await pause(0.3)

        // Clicking the banner starts stage 2.
        click(.right, panel)
        guard session.fight.stage == 2, session.fight.outcome == nil, session.fight.time == 0 else { throw Failure("the banner did not advance") }
        try await pause(0.5)

        // A new kind of foe gets a card: stage 4's archer.
        session.jump(to: 4)
        scene.loadFight(intro: true)
        try await pause(0.45)
        try snapshot("6-newcomer", panel)
        // The card follows the panel to another size and back.
        for option in [Settings.Size.medium, .large] {
            panel.setSize(option)
            try await pause(0.25)
            guard let centre = scene.introCardCentre, abs(centre.x - scene.size.width / 2) < 1
            else { throw Failure("the stage's card was left where it was when the panel changed size") }
        }

        // A warlord, at the end of stage 5.
        session.jump(to: 5)
        scene.loadFight(intro: true)
        scene.timeScale = 5
        try await until("the warlord arrived", timeout: 60) { session.fight.boss != nil || session.fight.outcome != nil }
        guard session.fight.outcome == nil else { throw Failure("stage 5 ended (\(session.fight.outcome!.rawValue)) before its warlord came") }
        scene.timeScale = 1
        try await until("the warlord closed in", timeout: 10) { (session.fight.boss?.distance ?? 0) < 0.55 }
        try await pause(0.2)
        try snapshot("7-warlord", panel)
        // His bar is up in the header, never across the fighters.
        guard let bar = scene.bossBar, bar.minY >= scene.laneTop - 0.5 else { throw Failure("the warlord's bar was drawn over the lane") }
        // His blow coming, and the marker over him that times it (not taken if he does not wind up soon).
        let watching = Date()
        while Date().timeIntervalSince(watching) < 3, session.fight.outcome == nil,
              !(session.fight.boss.map { $0.phase == .windup && $0.progress > 0.4 } ?? false) {
            try await pause(0.02)
        }
        if session.fight.boss?.phase == .windup { try snapshot("7b-warlord-windup", panel) } else { print("no warlord wind-up to show") }
        // A cut into his set guard, with the real button: parried, the blades bind where they cross, sparks and all
        // (not taken if his guard is not set in reach within a few seconds; only from far enough out that he does not
        // answer it, so the rest of his fight is as it would have been).
        let parried = session.fight.stats.parried, clashes = scene.clashesDrawn, wounds = session.fight.stats.damage
        var opening: Side?
        let waiting = Date()
        while Date().timeIntervalSince(waiting) < 6, session.fight.outcome == nil, opening == nil {
            let fight = session.fight
            if let boss = fight.boss, boss.guardSet, boss.distance > boss.contact + 0.07, !fight.isStumbling, fight.cooldown == 0,
               fight.target(boss.side) == .foe(boss.id) {
                opening = boss.side
            } else {
                try await pause(0.02)
            }
        }
        if let side = opening {
            click(side, panel)
            guard session.fight.stats.parried == parried + 1, session.fight.isStumbling else { throw Failure("a cut into the warlord's set guard was not parried") }
            let binding = Date()
            while scene.clashesDrawn == clashes, Date().timeIntervalSince(binding) < 1, session.fight.stats.damage == wounds {
                try await pause(0.01)
            }
            if scene.clashesDrawn > clashes {
                try snapshot("7c-warlord-clash", panel)
            } else if session.fight.stats.damage == wounds {
                throw Failure("a parried cut never met the warlord's blade")
            } else {
                print("the ronin was struck before his parried cut met the warlord's blade")
            }
        } else {
            print("no set guard in reach to cut into")
        }
        scene.timeScale = 3
        try await until("stage 5 ended", timeout: 40) { session.fight.outcome != nil }
        guard session.fight.outcome == .victory else { throw Failure("the autopilot lost to the warlord") }
        // The killing swing's follow-through as he comes apart, his impact lines closing in.
        try await pause(0.2)
        try snapshot("8-warlord-slain", panel)

        // Oni: three hearts and its own stage count. Bloodlust in the thick of its stage 7.
        session.choose(.oni)
        guard session.fight.mode == .oni, session.fight.hp == 3, session.fight.stage == 1 else { throw Failure("Oni did not start at stage 1 with 3 hearts") }
        session.jump(to: 7)
        scene.loadFight(intro: true)
        scene.timeScale = 2
        try await until("bloodlust with a crowd", timeout: 60) {
            (session.fight.inBloodlust && session.fight.foes.count >= 3) || session.fight.outcome != nil
        }
        guard session.fight.outcome == nil else { throw Failure("stage 7 ended (\(session.fight.outcome!.rawValue)) before a crowd met bloodlust") }
        scene.timeScale = 1
        try await pause(0.5)
        try snapshot("9-oni-bloodlust", panel)

        // Hands off: the ronin falls, and the campaign starts over from stage 1.
        let stage = session.fight.stage
        session.autopilot = false
        scene.timeScale = 6
        try await until("the ronin fell", timeout: 60) { session.fight.outcome != nil }
        guard session.fight.outcome == .defeat else { throw Failure("stage \(stage) was won with nobody cutting") }
        try await until("the banner", timeout: 5) { scene.isShowingBanner }
        try await pause(0.7)
        try snapshot("10-fallen", panel)
        guard session.career.falls == 1, session.career.stage == 1, session.career.attempt == 2 else { throw Failure("the fall was not booked") }
        guard session.career.unlocked.upperBound >= stage else { throw Failure("stage \(stage) was not left unlocked") }
        guard session.career.lastRun?.stage == stage, session.runScore >= session.fight.score else { throw Failure("the fallen run was not kept") }
        click(.left, panel)
        guard session.fight.stage == 1, session.fight.outcome == nil, session.fight.hp == Mode.oni.hearts
        else { throw Failure("rising again did not start over at stage 1 with full hearts") }

        // Back to Bushidō: its stage is where it was left (stage 5 won, so 6), with the hearts it came out of 5 with.
        session.choose(.bushido)
        guard session.fight.mode == .bushido, session.fight.stage == 6, session.fight.hp == session.career.carried
        else { throw Failure("Bushidō's stage and hearts were not kept") }
        session.autopilot = true

        // Endless from stage 2: a win runs straight on into stage 3, without a card to click through. Stage 2 is fought
        // with Gore off: its dead are all felled whole, and not a drop of blood is spilt.
        let spilt = scene.bloodShed, severed = scene.severings, killed = session.career.kills
        Settings.gore = false
        session.startEndless(at: 2)
        scene.loadFight(intro: true)
        guard session.career.isEndless, session.fight.stage == 2 else { throw Failure("endless did not start at stage 2") }
        scene.timeScale = 5
        try await until("the endless run went on", timeout: 60) { session.fight.stage == 3 || session.fight.outcome == .defeat }
        guard session.fight.stage == 3, session.career.endless?.cleared == 1 else { throw Failure("the endless run did not go on to stage 3") }
        guard session.career.kills > killed else { throw Failure("stage 2 of the endless run was won without a kill") }
        guard scene.severings == severed else { throw Failure("with gore off, \(scene.severings - severed) men were cut apart") }
        guard scene.bloodShed == spilt else { throw Failure("with gore off, blood was spilt (\(scene.bloodShed - spilt) drops, pools and blots)") }
        Settings.gore = true
        scene.timeScale = 1
        try await pause(0.6)
        try snapshot("12-endless", panel)

        // Dragging the window by its header holds the fight still, and letting go lets it run on.
        let held = session.fight.time
        panel.setDragging(true)
        try await pause(0.3)
        guard scene.isAwayPaused, session.fight.time == held else { throw Failure("the fight ran on while the window was dragged") }
        panel.setDragging(false)
        try await pause(0.3)
        guard !scene.isAwayPaused, session.fight.time > held else { throw Failure("letting go of the window did not let the fight run") }

        // A stage won just as the pointer leaves goes on to the next, but does not start it: it waits, its card held,
        // until the pointer comes back.
        scene.timeScale = 5
        try await until("an endless stage ended", timeout: 60) { session.fight.outcome != nil }
        if session.fight.outcome == .victory {
            let next = session.fight.stage + 1
            scene.setAway(true)
            try await until("the next endless stage", timeout: 5) { session.fight.stage == next }
            guard scene.isAwayPaused, !scene.isEngaging, session.fight.time == 0, scene.cardsHeld
            else { throw Failure("an endless stage went on into the next with the pointer away") }
            panel.updatePauseState()
            guard !scene.isAwayPaused else { throw Failure("the next endless stage did not start with the pointer back") }
        } else {
            print("the endless run fell at stage \(session.fight.stage): going on unseen not checked")
        }
        scene.timeScale = 1

        // Leaving the run keeps it as the best from stage 2.
        session.leaveEndless()
        scene.loadFight(intro: false)
        guard !session.career.isEndless, session.fight.stage == 6 else { throw Failure("leaving endless did not go back to the campaign") }
        guard (session.career.bestRun(from: 2)?.cleared ?? 0) >= 1 else { throw Failure("the endless run left was not kept as a best") }

        // The pill and back.
        panel.setCompact(true)
        try await pause(0.4)
        guard panel.panel.frame.size == DuelScene.pillSize, scene.isCompact else { throw Failure("compact did not fold to the pill") }
        try snapshot("11-compact", panel)
        panel.setCompact(false)
        try await pause(0.4)
        guard panel.panel.frame.width == Settings.size.width else { throw Failure("the panel did not unfold") }

        // Leaving pauses at once and gives the keys back to the app you work in; a key typed then does nothing; coming
        // back takes the dwell.
        Settings.pauseWhenAway = true
        scene.timeScale = 1
        panel.panel.makeKey()
        panel.setHovering(false)
        guard !panel.panel.isKeyWindow, panel.panel.isVisible else { throw Failure("leaving kept the keys") }
        let clock = session.fight.time
        try await pause(1.6)
        guard scene.isAwayPaused, panel.gameView.isPaused, session.fight.time == clock else { throw Failure("leaving did not pause") }
        let whiffs = session.fight.stats.whiffs, cuts = session.fight.stats.cuts
        if let typed = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                                        windowNumber: panel.panel.windowNumber, context: nil, characters: "d",
                                        charactersIgnoringModifiers: "d", isARepeat: false, keyCode: 2) {
            panel.gameView.keyDown(with: typed)
        }
        guard scene.isAwayPaused, session.fight.time == clock, session.fight.stats.whiffs == whiffs, session.fight.stats.cuts == cuts
        else { throw Failure("a key typed with the pointer away reached the fight") }
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

    /// Wholly inside `visible`, give or take half a point.
    private static func within(_ frame: NSRect, _ visible: NSRect) -> Bool {
        visible.insetBy(dx: -0.5, dy: -0.5).contains(frame)
    }

    private static func near(_ a: NSRect, _ b: NSRect) -> Bool {
        abs(a.minX - b.minX) < 0.5 && abs(a.minY - b.minY) < 0.5 && abs(a.width - b.width) < 0.5 && abs(a.height - b.height) < 0.5
    }

    /// Over every kind of foe (a gourd-bearer too), at every size: the warning marker of a blow coming stays on the
    /// lane, under the header (which holds the warlord's bar), and still over his head, not down in his face. Over a
    /// gourd-bearer, his pips stay clear of the gourd (and of each other) however it swells and bobs, and so does the
    /// marker's ring.
    @MainActor
    private static func checkOverhead() throws {
        for option in Settings.Size.allCases {
            let lane = DuelScene.lane(in: PanelController.contentSize(option))
            let room = lane.field.maxY - lane.groundY
            for kind in Kind.allCases {
                for gourd in kind == .grunt || kind == .runner ? [false, true] : [false] {
                    let top = FoeSprite.overheadTop(kind: kind, ronin: lane.ronin, headroom: room, gourd: gourd)
                    let marker = FoeSprite.overhead(kind: kind, ronin: lane.ronin, headroom: room, gourd: gourd).marker
                    let height = lane.ronin * Build.of(.foe(kind)).height
                    guard top <= room + 0.01, marker >= height * 1.05 else {
                        throw Failure("the marker over a \(kind.title) at \(option.title) is at \(marker) (his height \(height)), its top at \(top) of \(room)")
                    }
                    guard gourd else { continue }
                    for hp in 2...3 {
                        let marks = FoeSprite.bearerMarks(kind: kind, ronin: lane.ronin, headroom: room, hp: hp)
                        for (k, pip) in marks.pips.enumerated() where pip.intersects(marks.gourd) || marks.pips[..<k].contains(where: { $0.intersects(pip) }) {
                            throw Failure("a pip over a \(kind.title)'s gourd at \(option.title) overlaps it or another pip: \(pip), the gourd \(marks.gourd)")
                        }
                        let ring = marker - FoeSprite.markerRadius(ronin: lane.ronin) * 1.15
                        guard ring >= marks.gourd.maxY else {
                            throw Failure("the marker over a \(kind.title)'s gourd at \(option.title) comes down to \(ring), onto the gourd (its top at \(marks.gourd.maxY))")
                        }
                    }
                }
            }
        }
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

    /// Writes what the scene shows. A shot that cannot be taken fails the run, so a passing run never leaves the
    /// screenshots short of one.
    @MainActor
    private static func snapshot(_ name: String, _ panel: PanelController) throws {
        guard let path = ProcessInfo.processInfo.environment["RONIN_SNAPSHOTS"] else { return }
        let directory = URL(fileURLWithPath: path, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let scene = panel.scene
        guard let texture = panel.gameView.texture(from: scene, crop: CGRect(origin: .zero, size: scene.size)) else {
            throw Failure("snapshot \(name): no texture")
        }
        let image = texture.cgImage()
        guard let data = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else {
            throw Failure("could not encode \(name)")
        }
        try data.write(to: directory.appendingPathComponent(name + ".png"))
        print("snapshot \(name): \(image.width)×\(image.height)")
    }
}
