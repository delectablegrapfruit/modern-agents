import Foundation
import SkirmishCore

// skirmish-sim [--sectors 1-20] [--seeds 16] [--trace SECTOR]
//
// Plays every sector with your side on autopilot (the enemy's own commander, thinking faster) and prints how often
// it wins and how long it takes. Exits non-zero when the first sectors stop being winnable or a battle never ends.

var sectors = 1...20
var seeds = 16
var trace: Int?
var arguments = Array(CommandLine.arguments.dropFirst())
while !arguments.isEmpty {
    let flag = arguments.removeFirst()
    let value = arguments.isEmpty ? "" : arguments.removeFirst()
    switch flag {
    case "--sectors":
        let parts = value.split(separator: "-").compactMap { Int($0) }
        if parts.count == 2, parts[0] >= 1, parts[0] <= parts[1] { sectors = parts[0]...parts[1] }
        else if parts.count == 1, parts[0] >= 1 { sectors = parts[0]...parts[0] }
    case "--seeds": seeds = max(1, Int(value) ?? seeds)
    case "--trace": trace = Int(value)
    default:
        FileHandle.standardError.write("usage: skirmish-sim [--sectors A-B] [--seeds N] [--trace SECTOR]\n".data(using: .utf8)!)
        exit(2)
    }
}

func pad(_ text: String, _ width: Int) -> String { text.count >= width ? text : text + String(repeating: " ", count: width - text.count) }

func play(_ battle: inout Battle, log: Bool) {
    battle.autopilot = true
    while battle.outcome == nil, battle.time < 900 {
        for event in battle.step(0.25) where log {
            let t = String(format: "%6.1f", battle.time)
            switch event {
            case .launched(let f): print("\(t)  \(Side.name(f.owner)) sends \(f.count) from #\(f.from) to #\(f.to)")
            case .captured(let o, let by, let from): print("\(t)  \(Side.name(by)) takes #\(o) from \(Side.name(from))")
            case .clashed(let o, let attacker, let count): print("\(t)  \(Side.name(attacker)) loses \(count) against #\(o)")
            case .eliminated(let f): print("\(t)  \(Side.name(f)) eliminated")
            case .ended(let outcome): print("\(t)  \(outcome.rawValue.uppercased())")
            case .reinforced: break
            }
        }
    }
}

if let sector = trace {
    var battle = Battle(sector: sector, seed: mixSeed(UInt64(sector), 0))
    print("Sector \(sector) · \(Names.sector(sector)) · \(battle.outposts.count) positions · \(battle.difficulty)")
    for o in battle.outposts {
        let at = String(format: "(%.2f, %.2f) %5.1f", o.position.x, o.position.y, o.troops)
        print("  #\(pad(String(o.id), 3)) \(pad(Side.name(o.owner), 15)) \(pad("\(o.kind)", 11)) \(at)")
    }
    play(&battle, log: true)
    exit(0)
}

print("sector  enemies  siege  win%   avg time  avg kills")
var failed = false
for sector in sectors {
    var wins = 0, stalls = 0, time = 0.0, kills = 0.0
    for k in 0..<seeds {
        var battle = Battle(sector: sector, seed: mixSeed(UInt64(sector), UInt64(k)))
        play(&battle, log: false)
        switch battle.outcome {
        case .victory?: wins += 1
        case .defeat?: break
        case nil: stalls += 1
        }
        time += battle.time
        kills += battle.stats.kills
    }
    let d = Difficulty.forSector(sector)
    let rate = Double(wins) / Double(seeds)
    let row = String(format: "%6d  %7d  %5d  %4.0f%%  %7.0fs  %9.0f", sector, d.enemies, d.siege ? 1 : 0, rate * 100,
                     time / Double(seeds), kills / Double(seeds))
    print(row + (stalls > 0 ? "  (\(stalls) unfinished)" : ""))
    if sector <= 3, rate < 0.6 { failed = true }
    if stalls * 4 > seeds { failed = true }
}
exit(failed ? 1 : 0)
