#if os(WASI)
import WASILibc
#endif
import RoninArt
import RoninCore

// The figures for the page: casts and frames by name, and sketches in a compact binary layout (see API.md).

let cutNames: [(Cut, String)] = [
    (.kesa, "kesa"), (.gyaku, "gyaku"), (.shomen, "shomen"), (.dou, "dou"), (.tsuki, "tsuki"), (.sune, "sune"),
    (.nukitsuke, "nukitsuke"),
]

func cutName(_ cut: Cut) -> String { cutNames.first { $0.0 == cut }?.1 ?? "kesa" }
func parseCut(_ s: String) -> Cut? { cutNames.first { $0.1 == s }?.0 }

let allCasts: [Cast] = [.hero] + Kind.allCases.map { .foe($0) }

func castName(_ cast: Cast) -> String {
    switch cast {
    case .hero: return "hero"
    case .foe(let kind): return kind.rawValue
    }
}

func parseCast(_ s: String) -> Cast? {
    let name = s.hasPrefix("foe:") ? String(s.dropFirst(4)) : s
    if name == "hero" || name == "ronin" { return .hero }
    return Kind(rawValue: name).map { .foe($0) }
}

/// A frame's key: the Swift case and its values, e.g. `idle(0)`, `cut(kesa,2)`, `winded(1,3)`, `aim`.
func frameKey(_ frame: Frame) -> String {
    switch frame {
    case .idle(let k): return "idle(\(k))"
    case .iai(let k): return "iai(\(k))"
    case .walk(let k): return "walk(\(k))"
    case .windup(let k): return "windup(\(k))"
    case .strike(let k): return "strike(\(k))"
    case .stagger(let k): return "stagger(\(k))"
    case .leap: return "leap"
    case .aim: return "aim"
    case .loose: return "loose"
    case .die(let k): return "die(\(k))"
    case .block: return "block"
    case .cut(let c, let k): return "cut(\(cutName(c)),\(k))"
    case .recover(let c, let k): return "recover(\(cutName(c)),\(k))"
    case .chain(let c, let k): return "chain(\(cutName(c)),\(k))"
    case .shuffle(let k): return "shuffle(\(k))"
    case .winded(let a, let b): return "winded(\(a),\(b))"
    case .reel(let a, let b): return "reel(\(a),\(b))"
    case .stumble(let k): return "stumble(\(k))"
    case .repelled(let k): return "repelled(\(k))"
    case .hurt(let k): return "hurt(\(k))"
    case .flourish(let k): return "flourish(\(k))"
    case .fall(let k): return "fall(\(k))"
    case .clash(let k): return "clash(\(k))"
    case .retreat(let k): return "retreat(\(k))"
    }
}

/// Reads a frame key (spaces ignored; `cut(0,2)` may name the cut by number too).
func parseFrame(_ key: String) -> Frame? {
    let s = key.filter { $0 != " " }
    let name: Substring, args: [Substring]
    if let open = s.firstIndex(of: "("), s.hasSuffix(")") {
        name = s[..<open]
        args = s[s.index(after: open)..<s.index(before: s.endIndex)].split(separator: ",", omittingEmptySubsequences: false)
    } else {
        name = Substring(s)
        args = []
    }
    func int(_ i: Int) -> Int? { i < args.count ? Int(args[i]) : nil }
    func cut() -> Cut? {
        guard !args.isEmpty else { return nil }
        if let n = Int(args[0]) { return Cut(rawValue: n) }
        return parseCut(String(args[0]))
    }
    func one(_ make: (Int) -> Frame) -> Frame? { args.count == 1 ? int(0).map(make) : nil }
    func two(_ make: (Int, Int) -> Frame) -> Frame? {
        guard args.count == 2, let a = int(0), let b = int(1) else { return nil }
        return make(a, b)
    }
    func withCut(_ make: (Cut, Int) -> Frame) -> Frame? {
        guard args.count == 2, let c = cut(), let k = int(1) else { return nil }
        return make(c, k)
    }
    switch name {
    case "idle": return one(Frame.idle)
    case "iai": return one(Frame.iai)
    case "walk": return one(Frame.walk)
    case "windup": return one(Frame.windup)
    case "strike": return one(Frame.strike)
    case "stagger": return one(Frame.stagger)
    case "leap": return args.isEmpty ? .leap : nil
    case "aim": return args.isEmpty ? .aim : nil
    case "loose": return args.isEmpty ? .loose : nil
    case "die": return args.isEmpty ? .die(0) : one(Frame.die)
    case "block": return args.isEmpty ? .block : nil
    case "cut": return withCut(Frame.cut)
    case "recover": return withCut(Frame.recover)
    case "chain": return withCut(Frame.chain)
    case "shuffle": return one(Frame.shuffle)
    case "winded": return two(Frame.winded)
    case "reel": return two(Frame.reel)
    case "stumble": return one(Frame.stumble)
    case "repelled": return one(Frame.repelled)
    case "hurt": return one(Frame.hurt)
    case "flourish": return one(Frame.flourish)
    case "fall": return one(Frame.fall)
    case "clash": return one(Frame.clash)
    case "retreat": return one(Frame.retreat)
    default: return nil
    }
}

/// One of the ronin's frames with the blade kept in its scabbard, for what befalls him before the stage's draw (the
/// app's `HeroSprite.sheathedPiece`): on his feet (the blow that fells him included) he stands as the iai does, the
/// sword hand on the hilt and the other at the scabbard's mouth (unless pressed to his wound); going over, the other
/// hand is thrown out to break his fall.
func sheathedPose(_ frame: Frame) -> Pose {
    var p = Figure.pose(.hero, frame)
    let afoot: Bool
    if case .fall(let k) = frame { afoot = k == 0 } else { afoot = true }
    if afoot {
        let iai = Figure.pose(.hero, .iai(0))
        p.front = iai.front
        p.back = iai.back
        p.shift = iai.shift
        p.lift = iai.lift
        p.airborne = false
        if !p.clutch { p.grip = .saya }
    } else if case .fall(let k) = frame, k < 3 {
        p.grip = .saya
    }
    p.sheathed = 1
    p.saya = 0
    p.ghosts = []
    p.drag = 0
    p.smear = nil
    return p
}

/// How long the brute's club is, in his heights (`FoeSprite.clubLength`), and where it runs in a frame, grip to head
/// (`FoeSprite.club`): back from the head (`Figure.tip`) along the club's line.
let clubLength: CGFloat = 0.6

func club(_ cast: Cast, _ frame: Frame) -> (grip: CGPoint, head: CGPoint)? {
    guard cast == .foe(.brute), let head = Figure.tip(cast, frame) else { return nil }
    let angle = Figure.pose(cast, frame).blade
    return (CGPoint(x: head.x - sin(angle) * clubLength, y: head.y + cos(angle) * clubLength), head)
}

/// Pixels a figure-height of this cast is drawn at on its sketch's canvas.
func unit(_ cast: Cast) -> CGFloat { Figure.pixelHeight(cast) * Build.of(cast).height }

/// Whether a frame carries its own smear (the app's `Figures.smeared`): leave no ghost of the pose before behind it.
func smeared(_ pose: Pose) -> Bool { !pose.ghosts.isEmpty || pose.drag != 0 }

/// Sketches as floats (see API.md, "Sketch binary layout").
struct SketchEncoder {
    static let version: Float = 1
    static let header = 20
    var out: [Float] = []

    init() { out.reserveCapacity(4096) }

    mutating func encode(_ s: Sketch, cast: Cast, smeared: Bool) {
        let H = unit(cast)
        let bounds = s.bounds(margin: s.rimRadius * 3 + 2)
        put(Double(SketchEncoder.version), Double(s.width), Double(s.height))
        put(s.rim.rgb.r, s.rim.rgb.g, s.rim.rgb.b, s.rim.alpha, s.rimRadius)
        put(Double(s.underlay.count), Double(s.body.count), Double(s.overlay.count))
        put(bounds.minX, bounds.minY, bounds.width, bounds.height)
        put(smeared ? 1 : 0, H, Figure.feet.x * H, Figure.feet.y * H, Figure.pixelHeight(cast))
        for shape in s.underlay { encode(shape) }
        for shape in s.body { encode(shape) }
        for shape in s.overlay { encode(shape) }
    }

    mutating func encode(_ shape: Shape) {
        var flags: Float = 0
        if shape.fill != nil { flags += 1 }
        if shape.stroke != nil { flags += 2 }
        if shape.round { flags += 4 }
        let fill = shape.fill ?? Paint(RGB(0, 0, 0), 0)
        let stroke = shape.stroke ?? Paint(RGB(0, 0, 0), 0)
        let isEllipse: Bool
        if case .ellipse = shape.kind { isEllipse = true } else { isEllipse = false }
        put(isEllipse ? 1 : 0, Double(flags))
        put(fill.rgb.r, fill.rgb.g, fill.rgb.b, fill.alpha)
        put(stroke.rgb.r, stroke.rgb.g, stroke.rgb.b, stroke.alpha)
        put(shape.width, 0)
        let countAt = out.count - 1
        let start = out.count
        switch shape.kind {
        case .ellipse(let r):
            put(r.minX, r.minY, r.width, r.height)
        case .path(let path):
            for segment in path.segments {
                switch segment {
                case .move(let p): put(0, p.x, p.y)
                case .line(let p): put(1, p.x, p.y)
                case .quad(let p, let c): put(2, c.x, c.y, p.x, p.y)
                case .close: out.append(3)
                }
            }
        }
        out[countAt] = Float(out.count - start)
    }

    private mutating func put(_ values: CGFloat...) {
        for v in values { out.append(Float(v)) }
    }

    var bytes: [UInt8] {
        out.withUnsafeBytes { Array($0) }
    }
}
