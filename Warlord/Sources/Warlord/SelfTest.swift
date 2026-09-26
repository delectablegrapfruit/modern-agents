import AppKit
import WarlordCore

/// `WARLORD_SELFTEST=1`: plays the panel the way a player would — pick a land, strike, levy, march, fold and
/// unfold — through the same click handling the mouse uses, checks the campaign after every step, saves a picture
/// of the panel to `$WARLORD_SNAPSHOT` if set, and exits 0 or 1. The campaign lives in a scratch folder.
@MainActor
enum SelfTest {
    private static var failures: [String] = []

    private static func check(_ ok: Bool, _ what: String) {
        print((ok ? "ok    " : "FAIL  ") + what)
        if !ok { failures.append(what) }
    }

    static func start(board: BoardView, panel: NSPanel, session: Session) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            MainActor.assumeIsolated { run(board: board, panel: panel, session: session) }
        }
    }

    private static func run(board: BoardView, panel: NSPanel, session: Session) {
        check(panel.isVisible, "the panel is on screen")
        check(panel.level == .floating, "the panel floats above other windows")
        check(!panel.canBecomeKey && !panel.canBecomeMain, "the panel never takes the keyboard")
        check(board.frame.size == board.preferredSize && panel.frame.size == board.preferredSize, "the panel fits the board")

        // Strike from your seat at its weakest neighbour.
        let realm = session.game.realm
        let home = realm.home
        guard let target = realm.adjacency[home].min(by: { realm.territories[$0].wall < realm.territories[$1].wall }) else {
            return finish(board: board, session: session)
        }
        let orders = session.game.orders
        board.click(at: board.center(of: home))
        check(board.selected == home, "clicking your seat selects it")
        board.click(at: board.center(of: target))
        check(session.game.orders == orders - 1, "clicking a bordering land attacks it and spends an order")
        check(session.game.stats.battlesWon + session.game.stats.battlesLost == 1, "the battle is on the record")
        let won = session.game.realm.territories[target].owner == .player
        check(won == (session.game.stats.battlesWon == 1), "a victory raises your banner there")

        // Levy at home, then march the new troops forward.
        let gold = session.game.gold, troops = session.game.realm.territories[home].troops
        board.levy(at: home)
        check(session.game.gold < gold && session.game.realm.territories[home].troops > troops, "a levy turns gold into troops")
        if won {
            let before = session.game.realm.territories[target].troops
            let moving = session.game.realm.territories[home].troops - 1
            board.click(at: board.center(of: target))
            check(session.game.realm.territories[target].troops == before + moving && session.game.realm.territories[home].troops == 1,
                  "clicking a neighbouring land of yours marches there")
        }

        // Fold to the header strip and back.
        board.click(at: NSPoint(x: board.foldRect.midX, y: board.foldRect.midY))
        check(board.compact && panel.frame.height == board.headerHeight, "the fold button folds the panel to its header")
        board.click(at: NSPoint(x: board.foldRect.midX, y: board.foldRect.midY))
        check(!board.compact && panel.frame.size == board.preferredSize, "and unfolds it")

        let saved = session.store.load()
        check(saved?.realm.territories == session.game.realm.territories && saved?.orders == session.game.orders, "every order is saved")

        finish(board: board, session: session)
    }

    private static func finish(board: BoardView, session: Session) {
        // Leave a lively board for the picture: the advisor spends the orders left, then an army is picked.
        session.apply { game in
            var moves = 0
            while moves < 100, game.orders > 0, let move = Advisor.suggest(game) {
                moves += 1
                do { try game.play(move, now: Date()) } catch { break }
            }
        }
        let realm = session.game.realm
        if let front = realm.owned(by: .player).filter({ t in realm.adjacency[t].contains { realm.territories[$0].owner != .player } })
            .max(by: { realm.territories[$0].troops < realm.territories[$1].troops }) {
            board.click(at: board.center(of: front))
        }
        board.display()
        if let path = ProcessInfo.processInfo.environment["WARLORD_SNAPSHOT"], !path.isEmpty {
            check(snapshot(board, to: URL(fileURLWithPath: path)), "a picture of the panel is saved")
        }

        print(failures.isEmpty ? "SELF-TEST PASSED" : "SELF-TEST FAILED: \(failures.count) check(s)")
        let code: Int32 = failures.isEmpty ? 0 : 1
        // Stay up a moment so a screenshot can catch the panel.
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { exit(code) }
    }

    /// Renders the board at twice its size into a PNG, on a dark ground standing in for the HUD material behind it.
    private static func snapshot(_ view: NSView, to url: URL) -> Bool {
        let size = view.bounds.size, width = Int(size.width * 2), height = Int(size.height * 2)
        func canvas() -> NSBitmapImageRep? {
            NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4,
                             hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)
        }
        guard let board = canvas(), let rep = canvas(), let context = NSGraphicsContext(bitmapImageRep: rep) else { return false }
        board.size = size
        view.cacheDisplay(in: view.bounds, to: board)
        // The second canvas is drawn in pixels.
        let pixels = NSRect(x: 0, y: 0, width: width, height: height)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        Style.rgb(0x1E2026).setFill()
        NSBezierPath(roundedRect: pixels, xRadius: 22, yRadius: 22).fill()
        board.draw(in: pixels, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: false, hints: nil)
        NSGraphicsContext.restoreGraphicsState()
        guard let png = rep.representation(using: .png, properties: [:]) else { return false }
        return (try? png.write(to: url)) != nil
    }
}
