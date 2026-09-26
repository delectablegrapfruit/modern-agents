import Foundation
import RoninCore

// ronin-sim: plays stages headless with the autopilot and prints how they went.
//
//   ronin-sim [--stages 1-20] [--seeds 12] [--reaction 0.22] [--rate 7] [--slips 0.02] [--perfect] [--check]
//   ronin-sim --trace <stage>     one fight, second by second
//
// The default pilot is human-like: it sees, decides, and its cut lands `reaction` seconds later, at most `rate` a
// second, and slips the wrong way now and then. --perfect cuts the instant anything is in reach. --check fails
// (exit 1) if the early stages stop being winnable, if a perfect pilot ever loses, or if fights run too short or too
// long for a break.

var stages = 1...20
var seeds = 12
var reaction = 0.22
var rate = 7.0
var slips = 0.02
var perfect = false
var check = false
var trace: Int?

var arguments = CommandLine.arguments.dropFirst().makeIterator()
while let argument = arguments.next() {
    switch argument {
    case "--stages":
        let parts = (arguments.next() ?? "").split(separator: "-").compactMap { Int($0) }
        if parts.count == 2 { stages = parts[0]...parts[1] } else if parts.count == 1 { stages = parts[0]...parts[0] }
    case "--seeds": seeds = Int(arguments.next() ?? "") ?? seeds
    case "--reaction": reaction = Double(arguments.next() ?? "") ?? reaction
    case "--rate": rate = Double(arguments.next() ?? "") ?? rate
    case "--slips": slips = Double(arguments.next() ?? "") ?? slips
    case "--perfect": perfect = true
    case "--check": check = true
    case "--trace": trace = Int(arguments.next() ?? "")
    default:
        print("unknown argument \(argument)")
        exit(2)
    }
}

func pilot(_ seed: Int) -> Pilot {
    perfect ? .perfect : .human(reaction: reaction, rate: rate, slips: slips, seed: UInt64(seed) &* 7919 &+ 17)
}

func clock(_ t: Double) -> String { String(format: "%6.2f", t) }

func play(stage: Int, seed: Int, log: Bool = false) -> Fight {
    var fight = Fight(stage: stage, seed: mixSeed(0xC0FFEE, UInt64(stage), UInt64(seed)))
    fight.pilot = pilot(seed)
    var next = 1.0
    while fight.outcome == nil, fight.time < 600 {
        let events = fight.step(0.05)
        if log {
            for event in events {
                switch event {
                case .wounded(let foe, let damage):
                    let who = foe.flatMap { id in fight.foes.first { $0.id == id }?.kind.rawValue } ?? "arrow"
                    print("\(clock(fight.time))  wounded by \(who) (-\(damage)) → \(fight.hp) hp")
                case .warlord: print("\(clock(fight.time))  the warlord arrives")
                case .whiff(let side): print("\(clock(fight.time))  whiff \(side == .left ? "left" : "right")")
                case .bloodlust(let on): print("\(clock(fight.time))  bloodlust \(on ? "on" : "off")")
                case .ended(let outcome): print("\(clock(fight.time))  \(outcome.rawValue)")
                default: break
                }
            }
            if fight.time >= next {
                next += 1
                let lane = fight.foes.map { $0.kind.rawValue.prefix(2) + String(format: "%+.2f", $0.x) }.joined(separator: " ")
                print("\(clock(fight.time))  hp \(fight.hp)  combo \(fight.combo)  \(fight.defeated)/\(fight.roster.count)  [\(lane)]")
            }
        }
    }
    return fight
}

if let stage = trace {
    let fight = play(stage: stage, seed: 1, log: true)
    print("stage \(stage): \(fight.outcome?.rawValue ?? "unfinished") in \(Int(fight.time))s, score \(fight.score), best combo \(fight.stats.bestCombo), roster \(fight.roster.count)")
    exit(0)
}

print(perfect ? "perfect pilot" : "pilot: reaction \(reaction)s, \(rate) cuts/s, slips \(slips)")
print("stage  setting          foes  win%   time  wounds  combo  whiffs")
var failures: [String] = []
for stage in stages {
    var wins = 0
    var time = 0.0, wounds = 0.0, combo = 0.0, whiffs = 0.0
    for seed in 0..<seeds {
        let fight = play(stage: stage, seed: seed)
        if fight.outcome == .victory { wins += 1 }
        time += fight.time
        wounds += Double(fight.stats.damage)
        combo += Double(fight.stats.bestCombo)
        whiffs += Double(fight.stats.whiffs)
        if fight.outcome == nil { failures.append("stage \(stage) seed \(seed) never finished") }
    }
    let n = Double(seeds)
    let rate = Double(wins) / n
    let roster = Fight(stage: stage, seed: 1).roster.count
    let name = Setting.of(stage: stage).name.padding(toLength: 16, withPad: " ", startingAt: 0)
    print(String(format: "%5d  ", stage) + name + String(format: " %5d  %4.0f  %5.1f  %6.1f  %5.1f  %6.1f", roster, rate * 100, time / n, wounds / n, combo / n, whiffs / n))
    if check {
        let mean = time / n
        if perfect && wins < seeds { failures.append("stage \(stage): the perfect pilot lost \(seeds - wins) of \(seeds)") }
        if !perfect && stage <= 3 && rate < 0.9 { failures.append("stage \(stage): only \(Int(rate * 100))% won") }
        if !perfect && stage <= 8 && rate < 0.5 { failures.append("stage \(stage): only \(Int(rate * 100))% won") }
        if perfect && (mean < 15 || mean > 150) { failures.append("stage \(stage): fights last \(Int(mean))s") }
    }
}
if !failures.isEmpty {
    for failure in failures { print("FAIL: \(failure)") }
    exit(1)
}
