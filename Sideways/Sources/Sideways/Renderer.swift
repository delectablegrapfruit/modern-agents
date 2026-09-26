import AppKit
import QuartzCore
import SidewaysCore

/// Draws one frame with Core Graphics: the night road seen from above, then the heads-up display, then whichever
/// card is up (paused, help). The world is y-up like an unflipped view, so it maps with a scale and a translation.
/// Everything is vector, so the window is sharp at any of its sizes; nothing is cached but the track's paths.
struct Renderer {
    let game: Game
    let art: TrackArt
    let size: CGSize
    let focused: Bool
    let hovering: Bool

    static let night = NSColor(srgbRed: 0.027, green: 0.031, blue: 0.051, alpha: 1)
    static let asphalt = NSColor(srgbRed: 0.078, green: 0.083, blue: 0.118, alpha: 1)
    static let gold = NSColor(srgbRed: 1, green: 0.82, blue: 0.32, alpha: 1)
    static let green = NSColor(srgbRed: 0.38, green: 1, blue: 0.58, alpha: 1)
    static let red = NSColor(srgbRed: 1, green: 0.33, blue: 0.40, alpha: 1)

    /// HUD scale: 1 at the medium window.
    var ui: CGFloat { size.width / 336 }

    func draw(in ctx: CGContext) {
        ctx.setFillColor(Renderer.night.cgColor)
        ctx.fill(CGRect(origin: .zero, size: size))
        drawWorld(ctx)
        drawVignette(ctx)
        if game.isPaused {
            drawPausedCard(ctx)
        } else {
            drawHUD(ctx)
        }
        if game.effects.pulse > 0 {
            ctx.setStrokeColor(art.leftNeon.withAlphaComponent(0.55 * game.effects.pulse).cgColor)
            ctx.setLineWidth(3 * ui)
            ctx.stroke(CGRect(origin: .zero, size: size).insetBy(dx: 1.5 * ui, dy: 1.5 * ui))
        }
    }

    // MARK: World

    private func drawWorld(_ ctx: CGContext) {
        let camera = game.camera
        let scale = size.width / CGFloat(camera.worldWidth)
        var shake = CGPoint.zero
        if game.effects.shake > 0 {
            let t = game.session.clock * 60, amount = 5 * game.effects.shake
            shake = CGPoint(x: sin(t * 1.7) * amount, y: cos(t * 2.3) * amount)
        }
        let halfW = size.width / 2 / scale, halfH = size.height / 2 / scale
        let center = CGPoint(camera.center)
        let visible = CGRect(x: center.x - halfW - 60, y: center.y - halfH - 60, width: halfW * 2 + 120, height: halfH * 2 + 120)

        ctx.saveGState()
        ctx.translateBy(x: size.width / 2 + shake.x, y: size.height / 2 + shake.y)
        ctx.scaleBy(x: scale, y: scale)
        ctx.translateBy(x: -center.x, y: -center.y)
        ctx.setLineCap(.round)
        ctx.setLineJoin(.round)

        drawGround(ctx, visible)
        ctx.addPath(art.surface)
        ctx.setFillColor(Renderer.asphalt.cgColor)
        ctx.fillPath(using: .evenOdd)
        ctx.addPath(art.kerbs)
        ctx.setFillColor(NSColor.white.withAlphaComponent(0.16).cgColor)
        ctx.fillPath()
        drawStartLine(ctx)
        drawTrails(ctx)
        drawWalls(ctx)
        drawLamps(ctx, visible)
        if game.records.showGhost, let ghost = game.session.ghostPose, !game.session.isOnGrid {
            drawCar(ctx, at: ghost.position, heading: ghost.heading, ghost: true)
        }
        drawParticles(ctx, kind: .smoke)
        let car = game.session.car
        drawCar(ctx, at: car.position, heading: car.heading, ghost: false)
        drawParticles(ctx, kind: .spark)
        ctx.restoreGState()
    }

    /// Faint dots on a grid fixed to the world, so speed reads even on a plain stretch.
    private func drawGround(_ ctx: CGContext, _ visible: CGRect) {
        let step: CGFloat = 48
        ctx.setFillColor(NSColor.white.withAlphaComponent(0.05).cgColor)
        var x = (visible.minX / step).rounded(.down) * step
        while x < visible.maxX {
            var y = (visible.minY / step).rounded(.down) * step
            while y < visible.maxY {
                ctx.fillEllipse(in: CGRect(x: x - 1.2, y: y - 1.2, width: 2.4, height: 2.4))
                y += step
            }
            x += step
        }
    }

    private func drawStartLine(_ ctx: CGContext) {
        let track = art.track
        let p = track.points[0], t = track.tangents[0]
        ctx.saveGState()
        ctx.translateBy(x: p.x, y: p.y)
        ctx.rotate(by: t.angle)
        let cell: CGFloat = 6
        let cells = Int((CGFloat(track.halfWidth) * 2 / cell).rounded(.down))
        let start = -CGFloat(cells) * cell / 2
        for i in 0..<cells {
            for row in 0..<2 {
                let light = (i + row) % 2 == 0
                ctx.setFillColor(NSColor.white.withAlphaComponent(light ? 0.55 : 0.08).cgColor)
                ctx.fill(CGRect(x: CGFloat(row - 1) * cell, y: start + CGFloat(i) * cell, width: cell, height: cell))
            }
        }
        ctx.restoreGState()
    }

    /// Neon walls: a wide faint stroke, a narrower one and a bright core, which reads as glow without a blur.
    private func drawWalls(_ ctx: CGContext) {
        for (path, color) in [(art.leftWall, art.leftNeon), (art.rightWall, art.rightNeon)] {
            for (width, alpha) in [(9.0, 0.07), (4.0, 0.22), (1.6, 1.0)] {
                ctx.addPath(path)
                ctx.setStrokeColor(color.withAlphaComponent(alpha).cgColor)
                ctx.setLineWidth(width)
                ctx.strokePath()
            }
        }
    }

    private func drawLamps(_ ctx: CGContext, _ visible: CGRect) {
        let warm = NSColor(srgbRed: 1, green: 0.78, blue: 0.45, alpha: 1)
        for lamp in art.lamps where visible.contains(lamp) {
            ctx.setFillColor(warm.withAlphaComponent(0.06).cgColor)
            ctx.fillEllipse(in: CGRect(x: lamp.x - 22, y: lamp.y - 22, width: 44, height: 44))
            ctx.setFillColor(warm.withAlphaComponent(0.12).cgColor)
            ctx.fillEllipse(in: CGRect(x: lamp.x - 9, y: lamp.y - 9, width: 18, height: 18))
            ctx.setFillColor(warm.withAlphaComponent(0.9).cgColor)
            ctx.fillEllipse(in: CGRect(x: lamp.x - 1.8, y: lamp.y - 1.8, width: 3.6, height: 3.6))
        }
    }

    /// Light trails from the rear wheels, bucketed by brightness so a few strokes draw hundreds of segments.
    private func drawTrails(_ ctx: CGContext) {
        let trail = game.effects.trail
        guard trail.count > 1 else { return }
        let buckets = 6
        var paths = (0..<buckets).map { _ in CGMutablePath() }
        for i in 1..<trail.count where trail[i].connected {
            let mark = trail[i], previous = trail[i - 1]
            let alpha = mark.strength * max(0, 1 - mark.age / Effects.trailLife)
            guard alpha > 0.03 else { continue }
            let path = paths[min(buckets - 1, Int(alpha * Double(buckets)))]
            path.move(to: CGPoint(previous.left))
            path.addLine(to: CGPoint(mark.left))
            path.move(to: CGPoint(previous.right))
            path.addLine(to: CGPoint(mark.right))
        }
        let color = NSColor(game.paint)
        for (index, path) in paths.enumerated() where !path.isEmpty {
            let alpha = (CGFloat(index) + 0.5) / CGFloat(buckets)
            ctx.addPath(path)
            ctx.setStrokeColor(color.withAlphaComponent(alpha * 0.18).cgColor)
            ctx.setLineWidth(5)
            ctx.strokePath()
            ctx.addPath(path)
            ctx.setStrokeColor(color.withAlphaComponent(alpha * 0.7).cgColor)
            ctx.setLineWidth(1.4)
            ctx.strokePath()
        }
    }

    private func drawParticles(_ ctx: CGContext, kind: Particle.Kind) {
        let spark = NSColor(srgbRed: 1, green: 0.75, blue: 0.3, alpha: 1)
        for p in game.effects.particles where p.kind == kind {
            switch kind {
            case .smoke:
                ctx.setFillColor(NSColor(srgbRed: 0.8, green: 0.8, blue: 0.9, alpha: 0.11 * p.fade).cgColor)
                ctx.fillEllipse(in: CGRect(x: p.position.x - p.size, y: p.position.y - p.size, width: p.size * 2, height: p.size * 2))
            case .spark:
                let tail = p.position - p.velocity * 0.03
                ctx.setStrokeColor(spark.withAlphaComponent(p.fade).cgColor)
                ctx.setLineWidth(1.3)
                ctx.move(to: CGPoint(tail))
                ctx.addLine(to: CGPoint(p.position))
                ctx.strokePath()
            }
        }
    }

    /// The car, pointing along +x in its own frame: 18 long, 9 wide.
    private func drawCar(_ ctx: CGContext, at position: Vec2, heading: Double, ghost: Bool) {
        let car = game.session.car
        let paint = NSColor(game.paint)
        ctx.saveGState()
        ctx.translateBy(x: position.x, y: position.y)
        ctx.rotate(by: heading)
        let body = CGPath(roundedRect: CGRect(x: -9, y: -4.5, width: 18, height: 9), cornerWidth: 2.6, cornerHeight: 2.6, transform: nil)
        if ghost {
            ctx.addPath(body)
            ctx.setFillColor(NSColor.white.withAlphaComponent(0.07).cgColor)
            ctx.fillPath()
            ctx.addPath(body)
            ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.38).cgColor)
            ctx.setLineWidth(1)
            ctx.strokePath()
            ctx.restoreGState()
            return
        }
        // Underglow and headlight beams first, under the body.
        ctx.setFillColor(paint.withAlphaComponent(0.2).cgColor)
        ctx.fillEllipse(in: CGRect(x: -15, y: -9, width: 30, height: 18))
        for (spread, reach, alpha) in [(26.0, 78.0, 0.045), (14.0, 60.0, 0.07)] {
            ctx.move(to: CGPoint(x: 8, y: 3.5))
            ctx.addLine(to: CGPoint(x: 8 + reach, y: spread))
            ctx.addLine(to: CGPoint(x: 8 + reach, y: -spread))
            ctx.addLine(to: CGPoint(x: 8, y: -3.5))
            ctx.closePath()
            ctx.setFillColor(NSColor(srgbRed: 1, green: 0.95, blue: 0.82, alpha: alpha).cgColor)
            ctx.fillPath()
        }
        ctx.addPath(body)
        ctx.setFillColor(paint.cgColor)
        ctx.fillPath()
        // Cabin, windscreen, lights.
        ctx.setFillColor(NSColor.black.withAlphaComponent(0.42).cgColor)
        ctx.addPath(CGPath(roundedRect: CGRect(x: -4.8, y: -3.4, width: 8.6, height: 6.8), cornerWidth: 1.6, cornerHeight: 1.6, transform: nil))
        ctx.fillPath()
        ctx.setFillColor(NSColor(srgbRed: 0.55, green: 0.8, blue: 1, alpha: 0.55).cgColor)
        ctx.fill(CGRect(x: 2.4, y: -3.0, width: 1.4, height: 6.0))
        ctx.setFillColor(NSColor.white.cgColor)
        ctx.fill(CGRect(x: 7.8, y: 2.2, width: 1.2, height: 1.8))
        ctx.fill(CGRect(x: 7.8, y: -4.0, width: 1.2, height: 1.8))
        let tail = NSColor(srgbRed: 1, green: 0.12, blue: 0.2, alpha: 1)
        if car.braking || car.handbrake {
            ctx.setFillColor(tail.withAlphaComponent(0.35).cgColor)
            ctx.fillEllipse(in: CGRect(x: -14, y: -7, width: 9, height: 14))
        }
        ctx.setFillColor(tail.cgColor)
        ctx.fill(CGRect(x: -9, y: 2.2, width: 1.2, height: 1.8))
        ctx.fill(CGRect(x: -9, y: -4.0, width: 1.2, height: 1.8))
        ctx.restoreGState()
    }

    private func drawVignette(_ ctx: CGContext) {
        let colors = [NSColor.black.withAlphaComponent(0).cgColor, NSColor.black.withAlphaComponent(0.45).cgColor] as CFArray
        guard let gradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: colors, locations: [0.55, 1]) else { return }
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        ctx.drawRadialGradient(gradient, startCenter: center, startRadius: 0, endCenter: center,
                               endRadius: hypot(size.width, size.height) / 2, options: [])
    }

    // MARK: HUD

    private func mono(_ size: CGFloat, _ weight: NSFont.Weight = .regular) -> NSFont {
        NSFont.monospacedSystemFont(ofSize: size * ui, weight: weight)
    }

    private func sans(_ size: CGFloat, _ weight: NSFont.Weight = .regular) -> NSFont {
        NSFont.systemFont(ofSize: size * ui, weight: weight)
    }

    enum Align { case left, center, right }

    @discardableResult
    private func text(_ string: String, _ font: NSFont, _ color: NSColor, at point: CGPoint, _ align: Align = .left,
                      glow: NSColor? = nil, kern: CGFloat = 0) -> CGSize {
        var attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
        if kern != 0 { attributes[.kern] = kern * ui }
        if let glow {
            let shadow = NSShadow()
            shadow.shadowColor = glow
            shadow.shadowBlurRadius = 7 * ui
            shadow.shadowOffset = .zero
            attributes[.shadow] = shadow
        }
        let string = NSAttributedString(string: string, attributes: attributes)
        let measured = string.size()
        var origin = point
        switch align {
        case .left: break
        case .center: origin.x -= measured.width / 2
        case .right: origin.x -= measured.width
        }
        string.draw(at: origin)
        return measured
    }

    private func drawHUD(_ ctx: CGContext) {
        let session = game.session, pad = 10 * ui
        let top = size.height - pad

        // Lap time, and the gap to the best lap under it.
        let lap = session.lapTime.map(Format.lap) ?? "0.00"
        text(lap, mono(15, .semibold), .white, at: CGPoint(x: pad, y: top - 18 * ui))
        if let gap = session.gap {
            text(Format.gap(gap), mono(10, .medium), gap <= 0 ? Renderer.green : Renderer.red,
                 at: CGPoint(x: pad, y: top - 18 * ui - 13 * ui))
        } else if session.lapNumber > 0 {
            text("LAP \(session.lapNumber)", mono(8.5), NSColor.white.withAlphaComponent(0.45),
                 at: CGPoint(x: pad, y: top - 18 * ui - 12 * ui))
        }

        let best = session.bestLap.map { "BEST " + Format.lap($0) } ?? "BEST \u{2014}"
        text(best, mono(9, .medium), NSColor.white.withAlphaComponent(0.6), at: CGPoint(x: size.width - pad, y: top - 11 * ui), .right)
        text(game.info.name.uppercased(), sans(7.5, .semibold), NSColor.white.withAlphaComponent(0.32),
             at: CGPoint(x: size.width - pad, y: top - 22 * ui), .right, kern: 0.8)

        drawChain(ctx)
        drawSpeed()
        drawMinimap(ctx)
        drawToasts()

        if session.isWrongWay && Int(session.clock * 3) % 2 == 0 {
            text("WRONG WAY", mono(12, .bold), Renderer.red, at: CGPoint(x: size.width / 2, y: size.height * 0.5), .center, glow: Renderer.red)
        }
        if session.isOnGrid {
            if game.showHelp {
                drawHelp(ctx)
            } else {
                let pulse = 0.55 + 0.45 * sin(CACurrentMediaTime() * 4)
                text("\u{2191}  GO", mono(11, .bold), art.leftNeon.withAlphaComponent(CGFloat(pulse)),
                     at: CGPoint(x: size.width / 2, y: 16 * ui), .center, glow: art.leftNeon)
            }
        }
    }

    private func drawChain(_ ctx: CGContext) {
        let scorer = game.session.scorer
        guard scorer.hasChain else { return }
        let alpha = scorer.isSliding ? 1 : CGFloat(0.35 + 0.65 * scorer.graceLeft / DriftScorer.grace)
        let baseY = 20 * ui, cx = size.width / 2
        let neon = art.leftNeon
        let points = "+" + Format.points(Int(scorer.chain.rounded()))
        let measured = text(points, mono(15, .bold), neon.withAlphaComponent(alpha), at: CGPoint(x: cx, y: baseY), .center, glow: neon.withAlphaComponent(0.8 * alpha))
        text("\u{00D7}\(scorer.multiplier)", mono(10, .bold), NSColor.white.withAlphaComponent(alpha),
             at: CGPoint(x: cx + measured.width / 2 + 4 * ui, y: baseY + 2 * ui))
        if scorer.isClose {
            text("CLOSE", mono(8, .bold), Renderer.gold, at: CGPoint(x: cx, y: baseY + measured.height), .center, glow: Renderer.gold)
        }
        // Multiplier progress, and the grace running out once the slide ends.
        let barWidth = 64 * ui, barY = baseY - 5 * ui
        ctx.setFillColor(NSColor.white.withAlphaComponent(0.12 * alpha).cgColor)
        ctx.fill(CGRect(x: cx - barWidth / 2, y: barY, width: barWidth, height: 2 * ui))
        let fraction = scorer.isSliding ? scorer.multiplierProgress : scorer.graceLeft / DriftScorer.grace
        ctx.setFillColor((scorer.isSliding ? neon : NSColor.white).withAlphaComponent(0.85 * alpha).cgColor)
        ctx.fill(CGRect(x: cx - barWidth / 2, y: barY, width: barWidth * CGFloat(fraction), height: 2 * ui))
    }

    private func drawSpeed() {
        // Four world units to the metre.
        let kmh = Int((game.session.car.speed / 4 * 3.6).rounded())
        let pad = 10 * ui
        let measured = text("\(kmh)", mono(11, .semibold), NSColor.white.withAlphaComponent(0.8), at: CGPoint(x: pad, y: pad - 2 * ui))
        text("KM/H", mono(6.5, .medium), NSColor.white.withAlphaComponent(0.4), at: CGPoint(x: pad + measured.width + 3 * ui, y: pad))
    }

    private func drawMinimap(_ ctx: CGContext) {
        let pad = 10 * ui
        let b = art.track.bounds
        let width = CGFloat(b.size.x), height = CGFloat(b.size.y)
        let scale = min(56 * ui / width, 40 * ui / height)
        let origin = CGPoint(x: size.width - pad - width * scale, y: pad)
        func map(_ p: Vec2) -> CGPoint {
            CGPoint(x: origin.x + CGFloat(p.x - b.min.x) * scale, y: origin.y + CGFloat(p.y - b.min.y) * scale)
        }
        // The minimap path is in units of the longer side.
        let span = max(width, height) * scale
        var transform = CGAffineTransform(translationX: origin.x, y: origin.y).scaledBy(x: span, y: span)
        if let path = art.minimap.copy(using: &transform) {
            ctx.addPath(path)
            ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.3).cgColor)
            ctx.setLineWidth(1.2 * ui)
            ctx.strokePath()
        }
        if game.records.showGhost, let ghost = game.session.ghostPose {
            let g = map(ghost.position)
            ctx.setFillColor(NSColor.white.withAlphaComponent(0.5).cgColor)
            ctx.fillEllipse(in: CGRect(x: g.x - 1.6 * ui, y: g.y - 1.6 * ui, width: 3.2 * ui, height: 3.2 * ui))
        }
        let c = map(game.session.car.position)
        ctx.setFillColor(NSColor(game.paint).cgColor)
        ctx.fillEllipse(in: CGRect(x: c.x - 2.2 * ui, y: c.y - 2.2 * ui, width: 4.4 * ui, height: 4.4 * ui))
    }

    /// The newest toast on top, the one before it just below, each fading out at the end of its life.
    private func drawToasts() {
        var y = size.height * 0.64
        for toast in game.effects.toasts.reversed() {
            let color: NSColor
            switch toast.tone {
            case .gold: color = Renderer.gold
            case .good: color = Renderer.green
            case .bad: color = Renderer.red
            case .plain: color = .white
            }
            let alpha = CGFloat(toast.fade)
            let rise = CGFloat(1 - toast.arrival) * -6 * ui
            let title = text(toast.title, mono(12, .bold), color.withAlphaComponent(alpha), at: CGPoint(x: size.width / 2, y: y + rise),
                             .center, glow: color.withAlphaComponent(0.7 * alpha))
            if let detail = toast.detail {
                text(detail, mono(8.5, .medium), NSColor.white.withAlphaComponent(0.75 * alpha),
                     at: CGPoint(x: size.width / 2, y: y + rise - 11 * ui), .center)
            }
            y -= title.height + (toast.detail == nil ? 4 : 15) * ui
        }
    }

    // MARK: Cards

    private func dim(_ ctx: CGContext, _ alpha: CGFloat) {
        ctx.setFillColor(NSColor.black.withAlphaComponent(alpha).cgColor)
        ctx.fill(CGRect(origin: .zero, size: size))
    }

    private func drawHelp(_ ctx: CGContext) {
        dim(ctx, 0.45)
        let lines: [(String, String)] = [
            ("\u{2190} \u{2192}", "steer"), ("\u{2191}", "throttle"), ("\u{2193}", "brake"), ("space", "handbrake — flick it into a bend"),
            ("R", "back to the line"), ("[  ]", "change track"), ("esc", "pause"),
        ]
        var y = size.height - 30 * ui
        text("SIDEWAYS", mono(12, .heavy), art.leftNeon, at: CGPoint(x: size.width / 2, y: y), .center, glow: art.leftNeon, kern: 3)
        y -= 18 * ui
        for (key, action) in lines {
            text(key, mono(8.5, .bold), .white, at: CGPoint(x: size.width * 0.36, y: y), .right)
            text(action, sans(8.5), NSColor.white.withAlphaComponent(0.7), at: CGPoint(x: size.width * 0.36 + 8 * ui, y: y))
            y -= 12.5 * ui
        }
        text("slide to score · link slides to multiply · walls cost the chain", sans(7.5), NSColor.white.withAlphaComponent(0.5),
             at: CGPoint(x: size.width / 2, y: y - 2 * ui), .center)
    }

    private func drawPausedCard(_ ctx: CGContext) {
        if game.showHelp && focused {
            drawHelp(ctx)
            return
        }
        dim(ctx, focused ? 0.45 : 0.55)
        let cx = size.width / 2
        var y = size.height / 2 + 24 * ui
        text(game.info.subtitle.uppercased(), sans(7.5, .semibold), NSColor.white.withAlphaComponent(0.45), at: CGPoint(x: cx, y: y), .center, kern: 1.2)
        y -= 17 * ui
        text(game.info.name, sans(14, .bold), .white, at: CGPoint(x: cx, y: y), .center, glow: art.leftNeon.withAlphaComponent(0.8))
        y -= 15 * ui
        let record = game.records[track: game.info.id]
        var facts = [record.bestLap.map { "BEST " + Format.lap($0) } ?? "NO LAP YET"]
        if record.bestLapPoints > 0 { facts.append(Format.points(record.bestLapPoints) + " PTS") }
        text(facts.joined(separator: "  \u{00B7}  "), mono(9, .medium), Renderer.gold.withAlphaComponent(0.9), at: CGPoint(x: cx, y: y), .center)
        y -= 20 * ui
        let hint = focused ? "\u{2191} to drive" : "click to drive  \u{00B7}  \u{2303}\u{2325}D"
        let pulse = focused ? CGFloat(0.6 + 0.4 * sin(CACurrentMediaTime() * 3)) : 0.7
        text(hint, sans(9, .medium), NSColor.white.withAlphaComponent(pulse), at: CGPoint(x: cx, y: y), .center)

        // Rank along the bottom, with the way to the next one.
        let rank = game.rank, points = game.records.careerPoints
        let barWidth = 90 * ui, barY = 12 * ui
        text(rank.title.uppercased() + "  " + Format.points(points), mono(7.5, .semibold), NSColor.white.withAlphaComponent(0.55),
             at: CGPoint(x: cx, y: barY + 5 * ui), .center, kern: 0.6)
        ctx.setFillColor(NSColor.white.withAlphaComponent(0.12).cgColor)
        ctx.fill(CGRect(x: cx - barWidth / 2, y: barY, width: barWidth, height: 2 * ui))
        ctx.setFillColor(NSColor(game.paint).withAlphaComponent(0.9).cgColor)
        ctx.fill(CGRect(x: cx - barWidth / 2, y: barY, width: barWidth * CGFloat(rank.progress(points: points)), height: 2 * ui))
        if hovering && !focused {
            ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.25).cgColor)
            ctx.setLineWidth(1)
            ctx.stroke(CGRect(origin: .zero, size: size).insetBy(dx: 0.5, dy: 0.5))
        }
    }
}
