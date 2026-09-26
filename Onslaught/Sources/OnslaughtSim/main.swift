import Foundation
import OnslaughtCore

// Balance check: the autopilot fights each wave with the upgrades a run would have by then, and plays whole runs.
//
//   onslaught-sim [--waves 1-15] [--seeds 10] [--runs 20] [--reaction 0.025] [--check]
//
// --reaction sets seconds between the autopilot's decisions: 0.15 or so flies more like a person.
// --check exits 1 when the opening waves stop being winnable or fights get too short or too long.

var waves = 1...15
var seeds = 10
var runs = 20
var check = false
var reaction = 3 * Fight.tick

var args = CommandLine.arguments.dropFirst().makeIterator()
while let arg = args.next() {
    switch arg {
    case "--waves":
        let parts = (args.next() ?? "").split(separator: "-").compactMap { Int($0) }
        if parts.count == 2 { waves = parts[0]...parts[1] } else if parts.count == 1 { waves = parts[0]...parts[0] }
    case "--seeds": seeds = Int(args.next() ?? "") ?? seeds
    case "--runs": runs = Int(args.next() ?? "") ?? runs
    case "--check": check = true
    case "--reaction": reaction = Double(args.next() ?? "") ?? reaction
    default:
        print("usage: onslaught-sim [--waves A-B] [--seeds N] [--runs N] [--reaction S] [--check]")
        exit(2)
    }
}

/// The upgrades a run would have picked by `wave`: the first of each offer.
func loadout(forWave wave: Int, seed: Int) -> Loadout {
    var loadout = Loadout()
    for w in 1..<max(1, wave) {
        var rng = RNG(seed: mixSeed(seed, w, 0xA2))
        if let mod = Armory.offer(loadout, rng: &rng).first { loadout.add(mod) }
    }
    return loadout
}

struct Tally {
    var wins = 0
    var fights = 0
    var time = 0.0
    var hits = 0
    var grazes = 0
    var peak = 0
    var novas = 0
}

func fmt(_ v: Double, _ digits: Int = 1) -> String { String(format: "%.\(digits)f", v) }
func pad(_ s: String, _ n: Int) -> String { s.count >= n ? s : String(repeating: " ", count: n - s.count) + s }

var failures: [String] = []
let started = Date()

print("wave  win%   time  hits  grazes  novas  peak  boss")
for wave in waves {
    var tally = Tally()
    var name = ""
    for s in 1...seeds {
        let seed = mixSeed(s, 0x51)
        let kit = loadout(forWave: wave, seed: seed)
        var fight = Fight(wave: wave, seed: seed, loadout: kit, hull: kit.maxHull)
        fight.autopilot = true
        fight.pilotReaction = reaction
        if name.isEmpty { name = fight.boss.design.name + (fight.boss.design.heavy ? " (dreadnought)" : "") }
        while fight.outcome == nil && fight.time < 300 { _ = fight.step(0.1) }
        tally.fights += 1
        if fight.outcome == .victory { tally.wins += 1 }
        tally.time += fight.stats.time
        tally.hits += fight.stats.hitsTaken
        tally.grazes += fight.stats.grazes
        tally.peak = max(tally.peak, fight.stats.peakBullets)
        tally.novas += fight.stats.novas
    }
    let n = Double(tally.fights)
    let win = Double(tally.wins) / n
    let time = tally.time / n
    print(pad("\(wave)", 4), pad(fmt(win * 100, 0), 5), pad(fmt(time), 6), pad(fmt(Double(tally.hits) / n), 5),
          pad(fmt(Double(tally.grazes) / n, 0), 7), pad(fmt(Double(tally.novas) / n), 6), pad("\(tally.peak)", 5), " " + name)
    if check {
        if wave <= 3 && win < 0.85 { failures.append("wave \(wave): the autopilot won only \(Int(win * 100))%") }
        if wave <= 10 && (time < 12 || time > 90) { failures.append("wave \(wave): fights average \(Int(time))s") }
        if tally.peak >= Fight.maxBullets { failures.append("wave \(wave): the bullet cap was reached") }
    }
}

if runs > 0 {
    var depths: [Int] = []
    var scores: [Int] = []
    for r in 1...runs {
        var game = Game(seed: mixSeed(r, 0x2B))
        game.autopilot = true
        game.fight.pilotReaction = reaction
        while game.stage != .debrief && game.run.wave <= 40 {
            switch game.stage {
            case .fighting: _ = game.advance(0.1)
            case .armory:
                game.choose(game.run.offer.first)
                game.fight.pilotReaction = reaction
            case .debrief: break
            }
        }
        depths.append(game.run.cleared)
        scores.append(game.run.score + (game.stage == .fighting ? game.fight.score : 0))
    }
    depths.sort()
    let mean = Double(depths.reduce(0, +)) / Double(depths.count)
    print("\nruns: \(runs)  bosses per run: min \(depths.first!)  median \(depths[depths.count / 2])  mean \(fmt(mean))  max \(depths.last!)")
    print("scores: median \(scores.sorted()[scores.count / 2])  best \(scores.max()!)")
    if check && depths[depths.count / 2] < 3 { failures.append("median run cleared only \(depths[depths.count / 2]) bosses") }
}

print("\n(\(fmt(Date().timeIntervalSince(started)))s)")
if !failures.isEmpty {
    for f in failures { print("FAIL: \(f)") }
    exit(1)
}
