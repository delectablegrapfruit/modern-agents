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

    // MARK: Cut apart

    /// Where a cut goes through a foe.
    enum Severance: Hashable {
        /// On a slant, falling from the shoulder he leads with (kesa-giri), or rising to it (gyaku-kesa).
        case falling, rising
        /// Level through the waist (dō).
        case level
        /// Through the thighs: the legs taken from under him.
        case legs
        /// Through the neck.
        case head
    }

    /// A severed part: its texture, the part of the whole canvas it covers (fractions), and the wound: where on
    /// the canvas it is and which way it faces (radians), so blood can pour from it.
    struct Part {
        let texture: SKTexture
        let rect: CGRect
        let wound: CGPoint
        let woundAngle: CGFloat
        let upper: Bool
    }

    private static var partCache: [Cast: [Severance: [Part]]] = [:]

    /// A foe cut in two along a severance, from the pose he is struck in, each part with the raw red face of the
    /// cut across it and the white of the bone.
    static func parts(_ cast: Cast, _ severance: Severance) -> [Part] {
        if let parts = partCache[cast]?[severance] { return parts }
        // Cut from the pose a blow throws him into, his weapon already leaving his hand (it falls on its own).
        let frame = Frame.stagger(0)
        let sketch = Figure.sketch(cast, frame, armed: false)
        let body = Figure.anatomy(cast, frame)
        let w = CGFloat(sketch.width), h = CGFloat(sketch.height), far = (w + h) * 2
        func mid(_ a: CGPoint, _ b: CGPoint) -> CGPoint { CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2) }
        let through: CGPoint, angle: CGFloat
        switch severance {
        case .falling: (through, angle) = (mid(body.chest, body.waist), 0.55)
        case .rising: (through, angle) = (mid(body.chest, body.waist), -0.55)
        case .level: (through, angle) = (body.waist, 0.04)
        case .legs: (through, angle) = (mid(body.hip, body.knee), 0.1)
        case .head: (through, angle) = (CGPoint(x: body.neck.x, y: body.neck.y + body.headRadius * 0.15), -0.1)
        }
        let d = CGPoint(x: cos(angle), y: sin(angle)), n = CGPoint(x: -sin(angle), y: cos(angle))
        func point(_ a: CGFloat, _ b: CGFloat) -> CGPoint { CGPoint(x: through.x + d.x * a + n.x * b, y: through.y + d.y * a + n.y * b) }
        let seam = (point(-far, 0), point(far, 0))
        var regions: [(path: CGPath, evenOdd: Bool, upper: Bool)] = []
        if severance == .head {
            // The head and whatever it wears: a disc about it, above the neck.
            let r = body.headRadius * 2.6
            var ring: [CGPoint] = []
            for i in 0..<32 {
                let t = CGFloat(i) / 32 * 2 * .pi
                var p = CGPoint(x: body.head.x + cos(t) * r, y: body.head.y + sin(t) * r)
                let side = (p.x - through.x) * n.x + (p.y - through.y) * n.y
                if side < 0 { p = CGPoint(x: p.x - n.x * side, y: p.y - n.y * side) }
                ring.append(p)
            }
            let head = CGMutablePath()
            head.addLines(between: ring)
            head.closeSubpath()
            let rest = CGMutablePath()
            rest.addRect(CGRect(x: 0, y: 0, width: w, height: h))
            rest.addPath(head)
            regions = [(head, false, true), (rest, true, false)]
        } else {
            for upper in [true, false] {
                let side: CGFloat = upper ? far : -far
                let half = CGMutablePath()
                half.addLines(between: [point(-far, 0), point(far, 0), point(far, side), point(-far, side)])
                half.closeSubpath()
                regions.append((half, false, upper))
            }
        }
        let parts = regions.compactMap { region -> Part? in
            guard let drawn = render(sketch, clip: region.path, evenOdd: region.evenOdd, seam: seam, bone: through, H: body.height)
            else { return nil }
            let out = region.upper ? CGPoint(x: -n.x, y: -n.y) : n
            return Part(texture: drawn.texture, rect: drawn.rect, wound: CGPoint(x: through.x / w, y: through.y / h),
                        woundAngle: atan2(out.y, out.x), upper: region.upper)
        }
        partCache[cast, default: [:]][severance] = parts
        return parts
    }

    private static func render(_ sketch: Sketch, clip: CGPath, evenOdd: Bool, seam: (CGPoint, CGPoint), bone: CGPoint,
                               H: CGFloat) -> (texture: SKTexture, rect: CGRect)? {
        let w = sketch.width, h = sketch.height
        guard let ctx = Art.bitmap(w, h) else { return nil }
        ctx.addPath(clip)
        ctx.clip(using: evenOdd ? .evenOdd : .winding)
        ctx.setShouldAntialias(true)
        ctx.setShadow(offset: .zero, blur: sketch.rimRadius * 1.6, color: sketch.rim.cg)
        ctx.beginTransparencyLayer(auxiliaryInfo: nil)
        for shape in sketch.body { Sketch.draw(shape, in: ctx) }
        // The face of the cut, painted only where there is body: dark meat, a wet red edge, a white knot of bone.
        ctx.setShadow(offset: .zero, blur: 0, color: nil)
        ctx.setBlendMode(.sourceAtop)
        ctx.setLineCap(.butt)
        for (width, red) in [(0.075 * H, CGColor(red: 0.38, green: 0.0, blue: 0.03, alpha: 1)),
                             (0.03 * H, CGColor(red: 0.86, green: 0.1, blue: 0.12, alpha: 1))] {
            ctx.setStrokeColor(red)
            ctx.setLineWidth(width)
            ctx.move(to: seam.0)
            ctx.addLine(to: seam.1)
            ctx.strokePath()
        }
        ctx.setFillColor(CGColor(red: 0.93, green: 0.88, blue: 0.8, alpha: 1))
        ctx.fillEllipse(in: CGRect(x: bone.x - 0.016 * H, y: bone.y - 0.012 * H, width: 0.032 * H, height: 0.024 * H))
        ctx.setBlendMode(.normal)
        ctx.endTransparencyLayer()
        // Cut down to what was drawn.
        guard let image = ctx.makeImage(), let data = ctx.data else { return nil }
        let bytes = data.bindMemory(to: UInt8.self, capacity: ctx.bytesPerRow * h)
        var minX = w, maxX = -1, minRow = h, maxRow = -1
        for row in 0..<h {
            let base = row * ctx.bytesPerRow
            for x in 0..<w where bytes[base + x * 4 + 3] > 12 {
                minX = min(minX, x)
                maxX = max(maxX, x)
                minRow = min(minRow, row)
                maxRow = max(maxRow, row)
            }
        }
        guard maxX >= minX, maxRow >= minRow,
              let cropped = image.cropping(to: CGRect(x: minX, y: minRow, width: maxX - minX + 1, height: maxRow - minRow + 1))
        else { return nil }
        let rect = CGRect(x: CGFloat(minX) / CGFloat(w), y: CGFloat(h - 1 - maxRow) / CGFloat(h),
                          width: CGFloat(maxX - minX + 1) / CGFloat(w), height: CGFloat(maxRow - minRow + 1) / CGFloat(h))
        return (SKTexture(cgImage: cropped), rect)
    }

    private static var weapons: [Cast: Piece] = [:]

    /// A foe's weapon on its own, lying level: what falls from his hand when he dies.
    static func weapon(_ cast: Cast) -> Piece {
        if let piece = weapons[cast] { return piece }
        let sketch = Figure.weapon(cast)
        let bounds = sketch.bounds(margin: sketch.rimRadius * 3 + 2)
        let w = CGFloat(sketch.width), h = CGFloat(sketch.height)
        let piece = Piece(texture: sketch.image(in: bounds).map { SKTexture(cgImage: $0) } ?? SKTexture(),
                          rect: CGRect(x: bounds.minX / w, y: bounds.minY / h, width: bounds.width / w, height: bounds.height / h))
        weapons[cast] = piece
        return piece
    }

    /// Draws every frame now, so the first fight doesn't stutter.
    static func preload() {
        let casts: [Cast] = [.hero] + Kind.allCases.map { .foe($0) }
        for cast in casts {
            for frame in Figure.frames(for: cast) { _ = piece(cast, frame) }
            guard cast != .hero else { continue }
            for severance in [Severance.falling, .rising, .level, .legs, .head] { _ = parts(cast, severance) }
            _ = weapon(cast)
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
        // The smear first, under the figure and outside its rim.
        for shape in underlay { Sketch.draw(shape, in: ctx) }
        ctx.setShadow(offset: .zero, blur: rimRadius * 1.6, color: rim.cg)
        ctx.beginTransparencyLayer(auxiliaryInfo: nil)
        for shape in body { Sketch.draw(shape, in: ctx) }
        ctx.endTransparencyLayer()
        ctx.setShadow(offset: .zero, blur: 0, color: nil)
        for shape in overlay { Sketch.draw(shape, in: ctx) }
        return ctx.makeImage()
    }

    fileprivate static func draw(_ shape: Shape, in ctx: CGContext) {
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
