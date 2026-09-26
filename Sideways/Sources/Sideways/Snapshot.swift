import AppKit
import SidewaysCore

/// `SIDEWAYS_SNAPSHOT=<directory>`: renders a few moments of play offscreen as PNGs — on the grid, mid-drift,
/// racing a ghost, parked, the help card — at each window size, and exits. CI keeps them for a look at every build.
enum Snapshot {
    enum Moment { case grid, help, drift, racing, parked }

    static func render(into directory: URL) -> Bool {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let shots: [(name: String, moment: Moment, circuit: Int, size: Int, paint: Int)] = [
            ("1-grid", .grid, 0, 1, 0),
            ("2-drift", .drift, 2, 1, 4),
            ("3-racing", .racing, 5, 1, 1),
            ("4-parked", .parked, 6, 1, 3),
            ("5-help", .help, 1, 1, 0),
            ("6-small", .drift, 7, 0, 2),
            ("7-large", .racing, 3, 2, 5),
        ]
        var ok = true
        let specimen = Game(records: Records())
        if let rep = image(of: specimen, size: GamePanel.size(2), focused: true, specimen: true),
           let data = rep.representation(using: .png, properties: [:]) {
            try? data.write(to: directory.appendingPathComponent("8-specimen.png"))
            print("SNAPSHOT 8-specimen")
        }
        for shot in shots {
            var records = Records()
            records.seenHelp = shot.moment != .help
            records.paint = shot.paint
            records.careerPoints = 180_000
            records.trackID = TrackCatalog.circuits[shot.circuit].id
            let game = Game(records: records)
            play(game, until: shot.moment)
            let size = GamePanel.size(shot.size)
            guard let data = image(of: game, size: size, focused: shot.moment != .parked)?.representation(using: .png, properties: [:]) else {
                ok = false
                continue
            }
            do {
                try data.write(to: directory.appendingPathComponent(shot.name + ".png"))
                print("SNAPSHOT \(shot.name) \(game.info.name) lap \(game.session.lapNumber) chain \(Int(game.session.scorer.chain))")
            } catch {
                ok = false
            }
        }
        return ok
    }

    /// Drives with the autopilot, in keys, at 60 frames a second until the moment comes.
    private static func play(_ game: Game, until moment: Moment) {
        switch moment {
        case .grid:
            game.resume()
            return
        case .help:
            return
        default:
            break
        }
        game.resume()
        var pilot = Autopilot(style: .drift)
        let frame = 1.0 / 60
        func drive(_ seconds: Double, until done: () -> Bool = { false }) {
            var t = 0.0
            while t < seconds && !done() {
                game.keys = pilot.keys(for: game.session, dt: frame)
                game.advance(by: frame)
                t += frame
            }
        }
        switch moment {
        case .drift:
            drive(6)
            drive(40) { game.session.scorer.isSliding && game.session.scorer.chain > 600 }
        case .racing:
            // A lap for the ghost, then into the next until a slide.
            drive(80) { game.session.lapNumber >= 2 && game.session.lapTime ?? 0 > 6 }
            drive(20) { game.session.scorer.isSliding && game.session.scorer.chain > 200 }
        case .parked:
            drive(80) { game.session.lapNumber >= 2 && game.session.lapTime ?? 0 > 3 }
            game.pause()
        case .grid, .help:
            break
        }
    }

    static func image(of game: Game, size: CGSize, focused: Bool, scale: CGFloat = 2, specimen: Bool = false) -> NSBitmapImageRep? {
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let cg = CGContext(data: nil, width: Int(size.width * scale), height: Int(size.height * scale), bitsPerComponent: 8,
                                 bytesPerRow: 0, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        cg.scaleBy(x: scale, y: scale)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: cg, flipped: false)
        let renderer = Renderer(game: game, art: TrackArt(track: game.track), size: size, focused: focused, hovering: false)
        if specimen { renderer.drawSpecimen(log: false) } else { renderer.draw(in: cg) }
        NSGraphicsContext.restoreGraphicsState()
        return cg.makeImage().map(NSBitmapImageRep.init(cgImage:))
    }
}
