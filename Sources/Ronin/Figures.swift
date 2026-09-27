import AppKit
import SpriteKit
import RoninArt
import RoninCore

/// The figures as SpriteKit textures: each frame drawn once from its `RoninArt` sketch with Core Graphics, and kept.
///
/// Each texture is cut down to what the frame actually draws (a figure fills a small part of its canvas), with its
/// place on the canvas kept so the sprite can be sized and anchored as if it were whole: the feet stay put from
/// frame to frame and the textures take a third of the memory.
@MainActor
enum Figures {
    static var anchor: CGPoint { Figure.anchor }

    /// A frame's texture, and the part of the canvas it covers (as fractions of the canvas).
    struct Piece {
        let texture: SKTexture
        let rect: CGRect
    }

    private static var cache: [Cast: [Frame: Piece]] = [:]

    static func piece(_ cast: Cast, _ frame: Frame) -> Piece {
        if let piece = cache[cast]?[frame] { return piece }
        let sketch = Figure.sketch(cast, frame)
        let bounds = sketch.bounds(margin: sketch.rimRadius * 3 + 2)
        let w = CGFloat(sketch.width), h = CGFloat(sketch.height)
        let piece = Piece(texture: sketch.image(in: bounds).map { SKTexture(cgImage: $0) } ?? SKTexture(),
                          rect: CGRect(x: bounds.minX / w, y: bounds.minY / h, width: bounds.width / w, height: bounds.height / h))
        cache[cast, default: [:]][frame] = piece
        return piece
    }

    /// Puts a frame on a sprite for a ronin `ronin` points tall: its texture, and the size and anchor that keep the
    /// feet where the whole canvas would have them.
    static func apply(_ sprite: SKSpriteNode, _ cast: Cast, _ frame: Frame, ronin: CGFloat) {
        let piece = piece(cast, frame)
        let full = size(cast, ronin: ronin)
        sprite.texture = piece.texture
        sprite.size = CGSize(width: full.width * piece.rect.width, height: full.height * piece.rect.height)
        sprite.anchorPoint = CGPoint(x: (anchor.x - piece.rect.minX) / piece.rect.width, y: (anchor.y - piece.rect.minY) / piece.rect.height)
    }

    /// Draws every frame now, so the first fight doesn't stutter.
    static func preload() {
        let casts: [Cast] = [.hero] + Kind.allCases.map { .foe($0) }
        for cast in casts {
            for frame in Figure.frames(for: cast) { _ = piece(cast, frame) }
        }
    }

    static func has(_ cast: Cast, _ frame: Frame) -> Bool { Figure.frames(for: cast).contains(frame) }

    /// A figure's whole canvas on screen for a ronin `height` points tall.
    static func size(_ cast: Cast, ronin height: CGFloat) -> CGSize {
        let h = height * Build.of(cast).height
        return CGSize(width: Figure.canvas.width * h, height: Figure.canvas.height * h)
    }
}

extension Paint {
    var cg: CGColor { CGColor(red: rgb.r, green: rgb.g, blue: rgb.b, alpha: alpha) }
}

extension Sketch {
    /// Renders the part of the sketch inside `rect`: the figure as one layer with its rim of light, then the overlay.
    @MainActor
    func image(in rect: CGRect) -> CGImage? {
        guard let ctx = Art.bitmap(Int(rect.width), Int(rect.height)) else { return nil }
        ctx.translateBy(x: -rect.minX, y: -rect.minY)
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
