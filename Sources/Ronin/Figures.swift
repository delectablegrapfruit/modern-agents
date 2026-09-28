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
        let piece = render(Figure.sketch(cast, frame))
        cache[cast, default: [:]][frame] = piece
        return piece
    }

    private static var smears: [Cast: [Frame: Bool]] = [:]

    /// Whether a frame carries its own smear (in-betweens back along the motion, or the body blurred): no ghost of
    /// the pose before should be left behind it, it would read as a second figure.
    static func smeared(_ cast: Cast, _ frame: Frame) -> Bool {
        if let known = smears[cast]?[frame] { return known }
        let pose = Figure.pose(cast, frame)
        let smeared = !pose.ghosts.isEmpty || pose.drag != 0
        smears[cast, default: [:]][frame] = smeared
        return smeared
    }

    /// A sketch as a texture cut down to what it draws.
    static func render(_ sketch: Sketch) -> Piece {
        let bounds = sketch.bounds(margin: sketch.rimRadius * 3 + 2)
        let w = CGFloat(sketch.width), h = CGFloat(sketch.height)
        return Piece(texture: sketch.image(in: bounds).map { SKTexture(cgImage: $0) } ?? SKTexture(),
                     rect: CGRect(x: bounds.minX / w, y: bounds.minY / h, width: bounds.width / w, height: bounds.height / h))
    }

    /// Puts a frame on a sprite for a ronin `ronin` points tall: its texture, and the size and anchor that keep the
    /// feet where the whole canvas would have them.
    static func apply(_ sprite: SKSpriteNode, _ cast: Cast, _ frame: Frame, ronin: CGFloat) {
        apply(sprite, piece(cast, frame), cast, ronin: ronin)
    }

    /// Puts any drawn piece of a figure's canvas on a sprite, anchored at the feet.
    static func apply(_ sprite: SKSpriteNode, _ piece: Piece, _ cast: Cast, ronin: CGFloat) {
        let full = size(cast, ronin: ronin)
        sprite.texture = piece.texture
        sprite.size = CGSize(width: full.width * piece.rect.width, height: full.height * piece.rect.height)
        sprite.anchorPoint = CGPoint(x: (anchor.x - piece.rect.minX) / piece.rect.width, y: (anchor.y - piece.rect.minY) / piece.rect.height)
    }

    // MARK: Struck down

    /// Where a killing cut goes through a foe. The carnage makes each into a way his body comes apart (a `Ragdoll`
    /// cut, or his legs taken from under him).
    enum Severance: Hashable {
        /// On a slant, falling from the shoulder he leads with (kesa-giri), or rising to it (gyaku-kesa).
        case falling, rising
        /// Level through the waist (dō).
        case level
        /// Across the shins (sune-giri): the legs cut from under him, he drops onto his knees and pitches onto his
        /// face.
        case legs
        /// Through the neck.
        case head
    }

    /// How many of the poses a blow throws a foe into (`Figure.struck`, variants 0 up to this) are drawn ahead of
    /// time: his figure frozen in one at a killing blow, and his head struck off from it.
    static let variants = Figure.struckVariants

    private static var struckPieces: [Cast: [Int: Piece]] = [:]

    /// A foe in the pose a blow throws him into (`Figure.struck(cast, variant:)`; variant 0 is his stagger), his
    /// weapon still in his hand and his cloth at rest: what his figure freezes in at a killing blow, exactly as the
    /// carnage lets him fall from it (`Carnage.sever` with the same variant, or `fell` from the same pose), less the
    /// weapon, which leaves his hand as he falls.
    static func struck(_ cast: Cast, variant: Int) -> Piece {
        if let piece = struckPieces[cast]?[variant] { return piece }
        var pose = frozen(cast, variant: variant)
        pose.armed = true
        let piece = render(Figure.sketch(cast, pose: pose))
        struckPieces[cast, default: [:]][variant] = piece
        return piece
    }

    /// The pose a foe's figure freezes in at a killing blow, and the dead start from: `Figure.struck`, with his cloth
    /// at rest, as a falling body's is drawn (so the first frame of the fall, and the head struck off, are this one).
    private static func frozen(_ cast: Cast, variant: Int) -> Pose {
        var pose = Figure.struck(cast, variant: variant)
        pose.stream = 0
        return pose
    }

    /// A head struck off: its texture, the part of the whole canvas it covers, and its wound: where on the canvas
    /// the neck was cut (both as fractions of the canvas) and which way blood leaves it (radians).
    struct Part {
        let texture: SKTexture
        let rect: CGRect
        let wound: CGPoint
        let woundAngle: CGFloat
    }

    private static var heads: [Cast: [Int: Part]] = [:]

    /// A foe's head struck off as a blow throws him (`Figure.struck(cast, variant:)`), where it was on his canvas:
    /// the head and all it wears (crest, brim, ribbons) on a short length of cut neck, and nothing else of him; just
    /// as it was on the figure frozen at the blow (`struck`), so it leaves him without a jump.
    static func head(_ cast: Cast, variant: Int) -> Part {
        if let part = heads[cast]?[variant] { return part }
        let (sketch, wound, angle) = Figure.severedHead(cast, pose: frozen(cast, variant: variant))
        let piece = render(sketch)
        let part = Part(texture: piece.texture, rect: piece.rect,
                        wound: CGPoint(x: wound.x / CGFloat(sketch.width), y: wound.y / CGFloat(sketch.height)), woundAngle: angle)
        heads[cast, default: [:]][variant] = part
        return part
    }

    private static var weapons: [Cast: Piece] = [:]

    /// A foe's weapon on its own, lying level (the grip at the middle of the canvas): what falls from his hand when
    /// he dies.
    static func weapon(_ cast: Cast) -> Piece {
        if let piece = weapons[cast] { return piece }
        let piece = render(Figure.weapon(cast))
        weapons[cast] = piece
        return piece
    }

    /// Draws every frame now, so the first fight doesn't stutter: every frame of every figure, and for each foe the
    /// poses he may freeze in at a killing blow, the heads struck off from them, and his weapon. (A body falls as a
    /// jointed thing, drawn as it goes.)
    static func preload() {
        let casts: [Cast] = [.hero] + Kind.allCases.map { .foe($0) }
        for cast in casts {
            for frame in Figure.frames(for: cast) { _ = piece(cast, frame) }
            guard cast != .hero else { continue }
            for variant in 0..<variants {
                _ = struck(cast, variant: variant)
                _ = head(cast, variant: variant)
            }
            _ = weapon(cast)
        }
    }

    private static var frameSets: [Cast: Set<Frame>] = [:]

    /// Whether a figure has a frame drawn for it (asked for every figure every frame, so the list is kept).
    static func has(_ cast: Cast, _ frame: Frame) -> Bool {
        if let frames = frameSets[cast] { return frames.contains(frame) }
        let frames = Set(Figure.frames(for: cast))
        frameSets[cast] = frames
        return frames.contains(frame)
    }

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
