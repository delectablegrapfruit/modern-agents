import Foundation
#if canImport(CoreGraphics)
import CoreGraphics
#endif
import RoninArt
import RoninCore

// ronin-sheet: draws figures as an SVG contact sheet, for looking at the art without the app.
//
//   ronin-sheet <out.svg> [hero|grunt|runner|brute|dancer|archer|warlord|all] [--scale 1] [--ground]
//
// Each frame is drawn on a strip of dusk sky with the ground line through its feet, labelled with its name.

var arguments = Array(CommandLine.arguments.dropFirst())
guard let out = arguments.first else {
    print("usage: ronin-sheet <out.svg> [cast] [--scale 1]")
    exit(2)
}
arguments.removeFirst()
var scale: CGFloat = 1
var which = "all"
var index = 0
while index < arguments.count {
    let argument = arguments[index]
    if argument == "--scale", index + 1 < arguments.count {
        scale = CGFloat(Double(arguments[index + 1]) ?? 1)
        index += 2
        continue
    }
    which = argument
    index += 1
}

// `ronin-sheet out.svg dead` draws each kind's bodies as they fall (six apiece) and the poses they are cut apart from.
if which == "dead" {
    var body = "", y: CGFloat = 0, width: CGFloat = 0
    for kind in Kind.allCases {
        var x: CGFloat = 0, rowHeight: CGFloat = 0
        let sketches = (0..<6).map { Figure.corpse(.foe(kind), seed: UInt64($0)) }
            + (1..<4).map { Figure.sketch(.foe(kind), pose: Figure.struck(.foe(kind), variant: $0)) }
        for sketch in sketches {
            let w = CGFloat(sketch.width) * scale, h = CGFloat(sketch.height) * scale
            body += "<rect x=\"\(x)\" y=\"\(y)\" width=\"\(w)\" height=\"\(h)\" fill=\"url(#sky)\"/>" + sketch.svg(x: x, y: y, scale: scale)
            x += w + 6
            width = max(width, x)
            rowHeight = max(rowHeight, h)
        }
        y += rowHeight + 10
    }
    let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"\(width)\" height=\"\(y)\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#3a0a14\"/><stop offset=\"1\" stop-color=\"#f07030\"/></linearGradient></defs>\(body)</svg>"
    try? svg.write(toFile: out, atomically: true, encoding: .utf8)
    exit(0)
}

// `ronin-sheet out.svg ragdoll` lets each kind's dead fall: a row of how they come down (a body felled whole, the
// halves of one cut apart, one without its head), and a row of where each comes to rest.
if which == "ragdoll" {
    var body = "", y: CGFloat = 0, width: CGFloat = 0
    func cell(_ sketch: Sketch, _ x: inout CGFloat, _ rowHeight: inout CGFloat, label: String = "") {
        let w = CGFloat(sketch.width) * scale * 0.7, h = CGFloat(sketch.height) * scale
        let ground = y + h - Figure.feet.y / Figure.canvas.height * h
        body += "<svg x=\"\(x)\" y=\"\(y)\" width=\"\(w)\" height=\"\(h)\" viewBox=\"\(CGFloat(sketch.width) * 0.15) 0 \(CGFloat(sketch.width) * 0.7) \(sketch.height)\">"
        body += "<rect x=\"0\" y=\"0\" width=\"\(sketch.width)\" height=\"\(sketch.height)\" fill=\"url(#sky)\"/></svg>"
        body += "<rect x=\"\(x)\" y=\"\(ground)\" width=\"\(w)\" height=\"\(y + h - ground)\" fill=\"#1a0c0c\"/>"
        body += "<svg x=\"\(x)\" y=\"\(y)\" width=\"\(w)\" height=\"\(h)\" viewBox=\"\(CGFloat(sketch.width) * 0.15) 0 \(CGFloat(sketch.width) * 0.7) \(sketch.height)\">" + sketch.svg() + "</svg>"
        if !label.isEmpty { body += "<text x=\"\(x + 4)\" y=\"\(y + 12)\" font-family=\"Helvetica\" font-size=\"10\" fill=\"#fff\">\(label)</text>" }
        x += w + 4
        width = max(width, x)
        rowHeight = max(rowHeight, h)
    }
    func drawn(_ doll: Ragdoll, _ cast: Cast) -> Sketch {
        // The ground drawn at the doll's own ground, not the canvas's.
        let (pose, anchor) = doll.framed()
        let sketch = Figure.sketch(cast, pose: pose)
        let dy = anchor.y * Figure.pixelHeight(cast) * Build.of(cast).height
        return sketch.mapped { CGPoint(x: $0.x, y: $0.y + dy) }
    }
    let kinds = ProcessInfo.processInfo.environment["KINDS"].map { $0.split(separator: ",").compactMap { Kind(rawValue: String($0)) } } ?? Kind.allCases
    for kind in kinds {
        let cast = Cast.foe(kind)
        var rng = SeededRNG(seed: 0xDEAD &+ UInt64(kind.rawValue.count))
        // How they come down.
        let stances = (0..<3).map { Figure.struck(cast, variant: $0 + 1) }
        var sequences: [(String, Ragdoll, Double)] = [
            ("felled", Ragdoll.felled(cast, pose: stances[0], back: -1, rng: &rng), 0),
            ("above", Ragdoll.cut(cast, pose: stances[1], .above(at: 0.5, slant: 0.6), back: -1, rng: &rng), 0),
            ("below", Ragdoll.cut(cast, pose: stances[1], .below(at: 0.5, slant: 0.6), back: -1, rng: &rng), 0.3),
            ("headless", Ragdoll.cut(cast, pose: stances[2], .headless, back: -1, rng: &rng), 0.4),
        ]
        for k in sequences.indices {
            var x: CGFloat = 0, rowHeight: CGFloat = 0
            var doll = sequences[k].1
            var t = 0.0
            // A frame every tenth of a second; standing pieces stand a moment, then go.
            for shot in 0..<9 {
                cell(drawn(doll, cast), &x, &rowHeight, label: shot == 0 ? "\(kind) \(sequences[k].0)" : "")
                for _ in 0..<12 {
                    t += 1.0 / 120
                    if sequences[k].2 > 0, abs(t - sequences[k].2) < 0.5 / 120 { doll.collapse(rng: &rng) }
                    doll.advance(1.0 / 120)
                }
            }
            var n = 0
            while !doll.settled, n < 600 {
                doll.advance(1.0 / 60)
                n += 1
            }
            cell(drawn(doll, cast), &x, &rowHeight, label: "rest")
            sequences[k].1 = doll
            y += rowHeight + 6
        }
        // Where they come to rest.
        var x: CGFloat = 0, rowHeight: CGFloat = 0
        for k in 0..<10 {
            let pose = Figure.struck(cast, variant: k % 6 + 1)
            let slant = CGFloat(rng.range(-0.6, 0.6))
            var doll: Ragdoll
            switch k % 4 {
            case 0: doll = Ragdoll.felled(cast, pose: pose, back: -1, rng: &rng)
            case 1: doll = Ragdoll.cut(cast, pose: pose, .above(at: 0.45, slant: slant), back: -1, rng: &rng)
            case 2:
                doll = Ragdoll.cut(cast, pose: pose, .below(at: 0.45, slant: slant), back: -1, rng: &rng)
                doll.advance(0.4)
                doll.collapse(rng: &rng)
            default:
                doll = Ragdoll.cut(cast, pose: pose, .headless, back: -1, rng: &rng)
                doll.advance(0.5)
                doll.collapse(rng: &rng)
            }
            var n = 0
            while !doll.settled, n < 600 {
                doll.advance(1.0 / 60)
                n += 1
            }
            cell(drawn(doll, cast), &x, &rowHeight)
        }
        y += rowHeight + 14
    }
    let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"\(width)\" height=\"\(y)\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#3a0a14\"/><stop offset=\"1\" stop-color=\"#f07030\"/></linearGradient></defs><rect width=\"100%\" height=\"100%\" fill=\"#111\"/>\(body)</svg>"
    try? svg.write(toFile: out, atomically: true, encoding: .utf8)
    exit(0)
}

let casts: [Cast]
switch which {
case "all": casts = [.hero] + Kind.allCases.map { .foe($0) }
case "hero": casts = [.hero]
default:
    guard let kind = Kind(rawValue: which) else {
        print("unknown cast \(which)")
        exit(2)
    }
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
for cast in casts {
    var frames = Figure.frames(for: cast)
    if let only = ProcessInfo.processInfo.environment["FRAMES"] {
        let wanted = Set(only.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) })
        frames = frames.filter { wanted.contains(name($0)) }
    }
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

let svg = """
<svg xmlns="http://www.w3.org/2000/svg" width="\(width)" height="\(y)" viewBox="0 0 \(width) \(y)">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a0a14"/><stop offset="1" stop-color="#f07030"/></linearGradient></defs>
<rect width="100%" height="100%" fill="#111"/>
\(body)
</svg>
"""
do {
    try svg.write(toFile: out, atomically: true, encoding: .utf8)
} catch {
    print("could not write \(out): \(error)")
    exit(1)
}
