import AppKit
import SpriteKit
import RoninArt
import RoninCore

/// The figures as SpriteKit textures: each frame drawn once from its `RoninArt` sketch with Core Graphics, and kept.
@MainActor
enum Figures {
    static var anchor: CGPoint { Figure.anchor }

    private static var cache: [Cast: [Frame: SKTexture]] = [:]

    static func texture(_ cast: Cast, _ frame: Frame) -> SKTexture {
        if let texture = cache[cast]?[frame] { return texture }
        let texture = Figure.sketch(cast, frame).image().map { SKTexture(cgImage: $0) } ?? SKTexture()
        cache[cast, default: [:]][frame] = texture
        return texture
    }

    /// Draws every frame now, so the first fight doesn't stutter.
    static func preload() {
        let casts: [Cast] = [.hero] + Kind.allCases.map { .foe($0) }
        for cast in casts {
            for frame in Figure.frames(for: cast) { _ = texture(cast, frame) }
        }
    }

    static func has(_ cast: Cast, _ frame: Frame) -> Bool { Figure.frames(for: cast).contains(frame) }

    /// A figure's size on screen for a ronin `height` points tall.
    static func size(_ cast: Cast, ronin height: CGFloat) -> CGSize {
        let h = height * Build.of(cast).height
        return CGSize(width: Figure.canvas.width * h, height: Figure.canvas.height * h)
    }
}

extension Paint {
    var cg: CGColor { CGColor(red: rgb.r, green: rgb.g, blue: rgb.b, alpha: alpha) }
}

extension Sketch {
    /// Renders the sketch: the figure as one layer with its rim of light, then the overlay.
    func image() -> CGImage? {
        guard let ctx = Art.bitmap(width, height) else { return nil }
        ctx.setShouldAntialias(true)
        ctx.setShadow(offset: .zero, blur: rimRadius * 1.6, color: rim.cg)
        ctx.beginTransparencyLayer(auxiliaryInfo: nil)
        for shape in body { Sketch.draw(shape, in: ctx) }
        ctx.endTransparencyLayer()
        ctx.setShadow(offset: .zero, blur: 0, color: nil)
        for shape in overlay { Sketch.draw(shape, in: ctx) }
        return ctx.makeImage()
    }

    private static func draw(_ shape: Shape, in ctx: CGContext) {
        let path: CGPath
        switch shape.kind {
        case .ellipse(let rect):
            path = CGPath(ellipseIn: rect, transform: nil)
        case .path(let p):
            let built = CGMutablePath()
            for segment in p.segments {
                switch segment {
                case .move(let point): built.move(to: point)
                case .line(let point): built.addLine(to: point)
                case .quad(let point, let control): built.addQuadCurve(to: point, control: control)
                case .close: built.closeSubpath()
                }
            }
            path = built
        }
        if let fill = shape.fill {
            ctx.addPath(path)
            ctx.setFillColor(fill.cg)
            ctx.fillPath()
        }
        if let stroke = shape.stroke {
            ctx.addPath(path)
            ctx.setStrokeColor(stroke.cg)
            ctx.setLineWidth(shape.width)
            ctx.setLineCap(shape.round ? .round : .butt)
            ctx.setLineJoin(shape.round ? .round : .miter)
            ctx.strokePath()
        }
    }
}
