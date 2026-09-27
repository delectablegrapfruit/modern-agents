import Foundation
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
    case .walk(let k): return "walk \(k)"
    case .windup(let k): return "windup \(k)"
    case .strike(let k): return "strike \(k)"
    case .stagger: return "stagger"
    case .leap: return "leap"
    case .aim: return "aim"
    case .loose: return "loose"
    case .cut(let cut, let k): return "\(cut) \(k)"
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
