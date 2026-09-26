import Foundation
import SidewaysCore

// sideways-sim [laps] [track-id…]
//   Drives every circuit (or the named tracks, e.g. daily-20260926) with the autopilot in both styles and prints
//   the road and the laps: length, width, tightest bend, lap times, drift points, wall hits.
// sideways-sim --svg <track-id> > track.svg
//   The road as an SVG, to look at a seed.
// sideways-sim --scan <count>
//   Seeds 1…count with how much they twist and how many tight bends they have, to pick circuits from.

let args = Array(CommandLine.arguments.dropFirst())

if args.first == "--scan", args.count > 1, let count = Int(args[1]) {
    for seed in 1...UInt64(count) {
        let track = TrackGenerator.make(TrackInfo(id: "scan", seed: seed, name: "", subtitle: ""))
        print(String(format: "seed %4d  length %4.0f  twist %.2f  tight %d  hairpins %d", Int(seed), track.length,
                     track.twist, track.corners(tighterThan: 130), track.corners(tighterThan: 80)))
    }
    exit(0)
}

if args.first == "--svg", args.count > 1, let info = TrackCatalog.info(id: args[1]) {
    let track = TrackGenerator.make(info)
    let b = track.bounds
    func path(_ points: [Vec2]) -> String {
        "M" + points.map { String(format: "%.1f,%.1f", $0.x - b.min.x, b.max.y - $0.y) }.joined(separator: " L") + " Z"
    }
    print("""
    <svg xmlns="http://www.w3.org/2000/svg" width="\(Int(b.size.x))" height="\(Int(b.size.y))" style="background:#0b0c12">
    <path d="\(path(track.leftEdge))" fill="none" stroke="#ff3fa4" stroke-width="3"/>
    <path d="\(path(track.rightEdge))" fill="none" stroke="#35e0ff" stroke-width="3"/>
    <path d="\(path(track.points))" fill="none" stroke="#444" stroke-dasharray="8 8"/>
    <circle cx="\(track.points[0].x - b.min.x)" cy="\(b.max.y - track.points[0].y)" r="8" fill="#fff"/>
    </svg>
    """)
    exit(0)
}

let laps = args.first.flatMap { Int($0) } ?? 3
let ids = args.dropFirst(args.first.flatMap { Int($0) } == nil ? 0 : 1)
let infos = ids.isEmpty ? TrackCatalog.circuits + [TrackCatalog.daily(on: Date())] : ids.compactMap { TrackCatalog.info(id: $0) }

for info in infos {
    let track = TrackGenerator.make(info)
    let tightest = 1 / (track.curvature.map(abs).max() ?? 1)
    print(String(format: "%@  %@ · %@  length %.0f  width %.0f  tightest r %.0f  points %d",
                 info.id, info.name, info.subtitle, track.length, track.halfWidth * 2, tightest, track.count))
    // grip and drift steer with an analogue wheel; keys drives drift style with on/off keys, as a person must.
    for (label, style, keyboard) in [("grip ", Autopilot.Style.grip, false), ("drift", .drift, false), ("keys ", .drift, true)] {
        let session = Session(track: track)
        var pilot = Autopilot(style: style)
        var times: [String] = [], points: [Int] = [], hits = 0, spins = 0, chains = 0
        let dt = 1.0 / 120
        var t = 0.0
        while session.lapNumber <= laps && t < Double(laps + 1) * 90 {
            let input = keyboard ? pilot.keys(for: session, dt: dt).input : pilot.input(for: session, dt: dt)
            for event in session.step(input, dt: dt) {
                switch event {
                case .lapCompleted(let lap):
                    times.append(Format.lap(lap.time))
                    points.append(lap.points)
                case .wallHit: hits += 1
                case .spin: spins += 1
                case .chainBanked: chains += 1
                default: break
                }
            }
            t += dt
        }
        print("  \(label)  laps \(times.joined(separator: " "))  points \(points.map(Format.points).joined(separator: " "))  chains \(chains)  hits \(hits)  spins \(spins)")
    }
}
