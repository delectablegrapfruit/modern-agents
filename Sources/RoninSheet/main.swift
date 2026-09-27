import Foundation
#if canImport(CoreGraphics)
import CoreGraphics
#endif
import RoninArt
import RoninCore

// ronin-sheet: draws figures as an SVG contact sheet, for looking at the art without the app.
//
//   ronin-sheet <out.svg> [hero|grunt|runner|brute|dancer|archer|warlord|all|cuts|ragdoll] [--scale 1]
//
// A cast (or all of them): every frame, each on a strip of dusk sky with the ground line through its feet, labelled
// with its name. FRAMES="idle 0,kesa 3,kesa chain 2" draws only the frames named.
// cuts: each kind as a blow leaves it and as a cut leaves it: the poses it is cut apart from, its head struck off,
// the body left without it, and the two halves of each cut, drawn apart (`dead` is the same sheet).
// ragdoll: each kind's dead falling as the game lets them fall (a frame every tenth of a second, then at rest), and
// a row of them at rest. KINDS="grunt,brute" draws only those kinds.

func fail(_ message: String) -> Never {
    print(message)
    print("usage: ronin-sheet <out.svg> [hero|grunt|runner|brute|dancer|archer|warlord|all|cuts|ragdoll] [--scale 1]")
    print("       FRAMES=\"idle 0,kesa 3\" (a cast's frames by name)   KINDS=\"grunt,brute\" (cuts, ragdoll)")
    exit(2)
}

var arguments = Array(CommandLine.arguments.dropFirst())
guard let out = arguments.first, !out.hasPrefix("--") else { fail("no output file") }
arguments.removeFirst()
var scale: CGFloat = 1
var which: String?
var index = 0
while index < arguments.count {
    let argument = arguments[index]
    if argument == "--scale" {
        guard index + 1 < arguments.count, let value = Double(arguments[index + 1]), value > 0 else { fail("--scale takes a number above 0") }
        scale = CGFloat(value)
        index += 2
        continue
    }
    if argument.hasPrefix("--") { fail("unknown option \(argument)") }
    if which != nil { fail("one sheet at a time (\(which!) or \(argument))") }
    which = argument
    index += 1
}
let sheet = which ?? "all"

/// Writes the sheet, or says why it could not.
func save(_ body: String, width: CGFloat, height: CGFloat) -> Never {
    let svg = """
    <svg xmlns="http://www.w3.org/2000/svg" width="\(width)" height="\(height)" viewBox="0 0 \(width) \(height)">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a0a14"/><stop offset="1" stop-color="#f07030"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="#111"/>
    \(body)
    </svg>
    """
    do {
        try svg.write(toFile: out, atomically: true, encoding: .utf8)
        exit(0)
    } catch {
        print("could not write \(out): \(error)")
        exit(1)
    }
}

/// The kinds named in KINDS (all of them if it is not set).
func kinds() -> [Kind] {
    guard let only = ProcessInfo.processInfo.environment["KINDS"] else { return Kind.allCases }
    var kinds: [Kind] = []
    for name in only.split(separator: ",").map({ $0.trimmingCharacters(in: .whitespaces) }) {
        guard let kind = Kind(rawValue: name) else { fail("unknown kind \(name) in KINDS") }
        kinds.append(kind)
    }
    if kinds.isEmpty { fail("no kind named in KINDS") }
    return kinds
}

/// A row of cells on a strip of sky, the ground drawn at each sketch's feet line.
struct Row {
    var body = ""
    var x: CGFloat = 0
    var height: CGFloat = 0

    /// A sketch in the next cell (its middle `crop` of the canvas's width), labelled; outlined in red if it spills
    /// off its canvas (and `check`s).
    mutating func cell(_ sketch: Sketch, y: CGFloat, crop: CGFloat = 1, label: String = "", check: Bool = true) {
        let w = CGFloat(sketch.width) * scale * crop, h = CGFloat(sketch.height) * scale
        let ground = y + h - Figure.feet.y / Figure.canvas.height * h
        let view = "viewBox=\"\(CGFloat(sketch.width) * (1 - crop) / 2) 0 \(CGFloat(sketch.width) * crop) \(sketch.height)\""
        body += "<svg x=\"\(x)\" y=\"\(y)\" width=\"\(w)\" height=\"\(h)\" \(view)><rect x=\"0\" y=\"0\" width=\"\(sketch.width)\" height=\"\(sketch.height)\" fill=\"url(#sky)\"/></svg>"
        body += "<rect x=\"\(x)\" y=\"\(ground)\" width=\"\(w)\" height=\"\(y + h - ground)\" fill=\"#1a0c0c\"/>"
        body += "<svg x=\"\(x)\" y=\"\(y)\" width=\"\(w)\" height=\"\(h)\" \(view)>" + sketch.svg() + "</svg>"
        if check, !sketch.fits(margin: 1) {
            body += "<rect x=\"\(x)\" y=\"\(y)\" width=\"\(w)\" height=\"\(h)\" fill=\"none\" stroke=\"red\" stroke-width=\"3\"/>"
        }
        if !label.isEmpty { body += "<text x=\"\(x + 4)\" y=\"\(y + 12)\" font-family=\"Helvetica\" font-size=\"10\" fill=\"#fff\">\(label)</text>" }
        x += w + 4
        height = max(height, h)
    }
}

/// Several sketches of one figure's canvas drawn as one, each moved by its offset (pixels), and all of them together
/// moved back to the middle of the canvas.
func combined(_ pieces: [(Sketch, CGPoint)]) -> Sketch {
    guard var out = pieces.first?.0 else { return Sketch(width: 1, height: 1) }
    out.underlay = []
    out.body = []
    out.overlay = []
    let middle = pieces.map(\.1.x).reduce(0, +) / CGFloat(pieces.count)
    for (sketch, offset) in pieces {
        let s = sketch.mapped { CGPoint(x: $0.x + offset.x - middle, y: $0.y + offset.y) }
        out.underlay += s.underlay
        out.body += s.body
        out.overlay += s.overlay
    }
    return out
}

// MARK: How the dead fall

/// The ways the game kills a foe, and how it cuts him (as Carnage.sever and Carnage.fell do: the severance table,
/// how long a cut body stands, how hard the big ones are thrown). A warlord always loses his head.
enum Death: String, CaseIterable {
    case felled, kesa, gyaku, dou, sune, shomen

    static func of(_ kind: Kind) -> [Death] { kind == .warlord ? [.shomen] : allCases }

    /// Where the cut goes through the trunk, on what slant, and how hard the upper part is thrown up.
    var cut: (at: CGFloat, slant: CGFloat, lift: CGFloat)? {
        switch self {
        case .kesa: return (0.5, 0.6, 1.3)
        case .gyaku: return (0.5, -0.6, 1.3)
        case .dou: return (0.3, 0.05, 1.3)
        case .sune: return (0.12, 0.08, 0.6)
        case .felled, .shomen: return nil
        }
    }
}

/// A foe's dead as the game makes them: the pieces (each with how long it stands before its knees go, if it stands),
/// a severed head's variant, and how far the pieces stand above the line they will fall to (figure heights).
func remains(_ cast: Cast, _ death: Death, rng: inout SeededRNG) -> (pieces: [(doll: Ragdoll, stand: Double?)], head: Int?, raise: CGFloat) {
    let kind: Kind
    if case .foe(let k) = cast { kind = k } else { kind = .grunt }
    let force: CGFloat = kind == .warlord ? 1.5 : kind == .brute ? 1.25 : 1
    let near = CGFloat(rng.unit())
    let stand = rng.range(0.35, 0.7)
    var pieces: [(doll: Ragdoll, stand: Double?)] = []
    var head: Int?
    switch death {
    case .felled:
        // Thrown back off his feet, or any way a blow throws a man.
        let pose = rng.int(0...2) == 0 ? Figure.thrown(cast) : Figure.struck(cast, variant: rng.int(1...1_000_000))
        pieces = [(Ragdoll.felled(cast, pose: pose, back: -1, force: force, rng: &rng), nil)]
    case .shomen:
        // The head from one of the poses drawn ahead of time, flying on its own; the body stands a moment longer.
        let variant = rng.int(0...(Figure.struckVariants - 1))
        head = variant
        pieces = [(Ragdoll.cut(cast, pose: Figure.struck(cast, variant: variant), .headless, back: -1, force: force, rng: &rng), stand * 1.4)]
    default:
        let (at, slant, lift) = death.cut!
        let pose = Figure.struck(cast, variant: rng.int(1...1_000_000))
        pieces = [(Ragdoll.cut(cast, pose: pose, .above(at: at, slant: slant), back: -1, force: force, lift: lift, rng: &rng), nil),
                  (Ragdoll.cut(cast, pose: pose, .below(at: at, slant: slant), back: -1, force: force, rng: &rng), stand)]
    }
    // Standing on the lane, over the line on the ground it will fall to.
    let raise = 0.12 * near / Build.of(cast).height
    for k in pieces.indices { pieces[k].doll.raise(raise) }
    return (pieces, head, raise)
}

/// A doll drawn on its figure's canvas where it lies, the canvas's ground at the doll's own.
func drawn(_ doll: Ragdoll, _ cast: Cast) -> (Sketch, CGPoint) {
    let framed = doll.framed()
    var pose = framed.pose
    pose.floor = doll.hip.y
    let H = Figure.pixelHeight(cast) * Build.of(cast).height
    return (Figure.sketch(cast, pose: pose), CGPoint(x: framed.anchor.x * H, y: framed.anchor.y * H))
}

if sheet == "ragdoll" {
    var body = "", y: CGFloat = 0, width: CGFloat = 0
    for (i, kind) in kinds().enumerated() {
        let cast = Cast.foe(kind)
        var rng = SeededRNG(seed: 0xDEAD &+ UInt64(Kind.allCases.firstIndex(of: kind) ?? i) &* 0x9E37)
        // How they come down: a frame every tenth of a second, standing pieces standing their time, then at rest.
        for death in Death.of(kind) {
            var row = Row()
            let made = remains(cast, death, rng: &rng)
            var pieces = made.pieces
            let H = Figure.pixelHeight(cast) * Build.of(cast).height
            var t = 0.0
            for shot in 0..<10 {
                var sketches = pieces.map { drawn($0.doll, cast) }
                if shot == 0, let head = made.head {
                    // The head as it leaves the stump (in the game it flies on its own, turning over and over).
                    let lone = Figure.severedHead(cast, pose: Figure.struck(cast, variant: head)).sketch
                    sketches.append((lone, CGPoint(x: 0, y: made.raise * H)))
                }
                row.cell(combined(sketches), y: y, label: shot == 0 ? "\(kind) \(death.rawValue)" : "", check: false)
                for _ in 0..<12 {
                    t += 1.0 / 120
                    for k in pieces.indices {
                        if let stand = pieces[k].stand, t >= stand {
                            pieces[k].doll.collapse(rng: &rng)
                            pieces[k].stand = nil
                        }
                        pieces[k].doll.advance(1.0 / 120)
                    }
                }
            }
            for k in pieces.indices {
                if pieces[k].stand != nil { pieces[k].doll.collapse(rng: &rng) }
                var n = 0
                while !pieces[k].doll.settled, n < 600 {
                    pieces[k].doll.advance(1.0 / 60)
                    n += 1
                }
            }
            row.cell(combined(pieces.map { drawn($0.doll, cast) }), y: y, label: "rest", check: false)
            body += row.body
            width = max(width, row.x)
            y += row.height + 6
        }
        // Where they come to rest, each its own way.
        var row = Row()
        let deaths = Death.of(kind)
        for k in 0..<10 {
            var pieces = remains(cast, deaths[k % deaths.count], rng: &rng).pieces
            for p in pieces.indices {
                if let stand = pieces[p].stand {
                    pieces[p].doll.advance(stand)
                    pieces[p].doll.collapse(rng: &rng)
                }
                var n = 0
                while !pieces[p].doll.settled, n < 600 {
                    pieces[p].doll.advance(1.0 / 60)
                    n += 1
                }
            }
            row.cell(combined(pieces.map { drawn($0.doll, cast) }), y: y, check: false)
        }
        body += row.body
        width = max(width, row.x)
        y += row.height + 14
    }
    save(body, width: width, height: y)
}

// MARK: How a cut leaves them

if sheet == "cuts" || sheet == "dead" {
    var body = "", y: CGFloat = 0, width: CGFloat = 0
    for kind in kinds() {
        let cast = Cast.foe(kind)
        let H = Figure.pixelHeight(cast) * Build.of(cast).height
        var row = Row()
        for v in 0..<Figure.struckVariants {
            row.cell(Figure.sketch(cast, pose: Figure.struck(cast, variant: v)), y: y, crop: 0.6, label: v == 0 ? "\(kind) struck" : "")
        }
        for v in 0..<Figure.struckVariants {
            let pose = Figure.struck(cast, variant: v)
            var headless = pose
            headless.severed = .headless
            // The head lifted off the stump a little, as it goes.
            let head = Figure.severedHead(cast, pose: pose).sketch
            row.cell(combined([(Figure.sketch(cast, pose: headless), .zero), (head, CGPoint(x: 0.03 * H, y: 0.08 * H))]), y: y, crop: 0.6,
                     label: v == 0 ? "head" : "")
        }
        for death in [Death.kesa, .gyaku, .dou, .sune] {
            let (at, slant, _) = death.cut!
            var above = Figure.struck(cast, variant: 2), below = above
            above.severed = .above(at: at, slant: slant)
            below.severed = .below(at: at, slant: slant)
            // The upper part lifted clear of the lower, so both faces of the cut show.
            row.cell(combined([(Figure.sketch(cast, pose: below), .zero), (Figure.sketch(cast, pose: above), CGPoint(x: -0.02 * H, y: 0.07 * H))]),
                     y: y, crop: 0.6, label: death.rawValue)
        }
        body += row.body
        width = max(width, row.x)
        y += row.height + 10
    }
    save(body, width: width, height: y)
}

// MARK: The frames

let casts: [Cast]
switch sheet {
case "all": casts = [.hero] + Kind.allCases.map { .foe($0) }
case "hero": casts = [.hero]
default:
    guard let kind = Kind(rawValue: sheet) else { fail("unknown sheet \(sheet)") }
    casts = [.foe(kind)]
}

func name(_ frame: Frame) -> String {
    switch frame {
    case .idle(let k): return "idle \(k)"
    case .iai(let k): return "iai \(k)"
    case .block: return "block"
    case .repelled(let k): return "repelled \(k)"
    case .walk(let k): return "walk \(k)"
    case .windup(let k): return "windup \(k)"
    case .strike(let k): return "strike \(k)"
    case .stagger(let k): return "stagger \(k)"
    case .die(let k): return "die \(k)"
    case .leap: return "leap"
    case .aim: return "aim"
    case .loose: return "loose"
    case .cut(let cut, let k): return "\(cut) \(k)"
    case .chain(let cut, let k): return "\(cut) chain \(k)"
    case .recover(let cut, let k): return "\(cut) recover \(k)"
    case .shuffle(let k): return "shuffle \(k)"
    case .winded(let v, let k): return "winded \(v) \(k)"
    case .reel(let v, let k): return "reel \(v) \(k)"
    case .stumble(let k): return "stumble \(k)"
    case .hurt(let k): return "hurt \(k)"
    case .flourish(let k): return "flourish \(k)"
    case .fall(let k): return "fall \(k)"
    }
}

let columns = scale > 1.2 ? 3 : 6
var body = ""
var y: CGFloat = 0
var width: CGFloat = 0
let wanted = ProcessInfo.processInfo.environment["FRAMES"].map {
    Set($0.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) })
}
var drawnAny = false
for cast in casts {
    var frames = Figure.frames(for: cast)
    if let wanted { frames = frames.filter { wanted.contains(name($0)) } }
    guard !frames.isEmpty else { continue }
    drawnAny = true
    var x: CGFloat = 0
    var rowHeight: CGFloat = 0
    for (i, frame) in frames.enumerated() {
        let sketch = Figure.sketch(cast, frame)
        let w = CGFloat(sketch.width) * scale, h = CGFloat(sketch.height) * scale
        if i > 0, i % columns == 0 {
            y += rowHeight + 18
            x = 0
            rowHeight = 0
        }
        let ground = y + h - Figure.feet.y / Figure.canvas.height * h
        body += "<rect x=\"\(x)\" y=\"\(y)\" width=\"\(w)\" height=\"\(h)\" fill=\"url(#sky)\"/>"
        body += "<rect x=\"\(x)\" y=\"\(ground)\" width=\"\(w)\" height=\"\(y + h - ground)\" fill=\"#1a0c0c\"/>"
        body += sketch.svg(x: x, y: y, scale: scale)
        body += "<text x=\"\(x + 6)\" y=\"\(y + 14)\" font-family=\"Helvetica\" font-size=\"12\" fill=\"#fff\">\(name(frame))</text>"
        if !sketch.fits(margin: 1) {
            body += "<rect x=\"\(x)\" y=\"\(y)\" width=\"\(w)\" height=\"\(h)\" fill=\"none\" stroke=\"red\" stroke-width=\"3\"/>"
        }
        x += w + 6
        width = max(width, x)
        rowHeight = max(rowHeight, h)
    }
    y += rowHeight + 30
}
if !drawnAny { fail("no frame matched FRAMES") }
save(body, width: width, height: y)
