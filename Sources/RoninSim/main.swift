import Foundation
import RoninCore

// ronin-sim: plays stages headless with the autopilot and prints how they went.
//
//   ronin-sim [--stages 1-20] [--seeds 12] [--mode bushido|shoshin|shura|oni|all] [--reaction 0.22] [--rate 7]
//             [--slips 0.02] [--rash 0] [--timing 0.05] [--daring 0.8] [--perfect] [--hearts] [--check]
//   ronin-sim --campaign [--seeds 32] [--mode all] [--check]   from stage 1, hearts carried, until the ronin falls
//   ronin-sim --trace <stage> [--mode bushido]                  one fight, second by second
//   ronin-sim --help                                            this, and the bars --check holds the game to
//
// The default pilot is human-like: it sees, decides, and its cut lands `reaction` seconds later, at most `rate` a
// second, and slips the wrong way now and then; `--rash` makes it lose patience with a warlord's set guard that
// often a second and cut into it anyway. A press it times to a moment it sees coming (the gourd coming down, the last
// moment of a wind-up) lands off it by `--timing` seconds or so, and `--daring` is how often, with a heart to win back
// and the lane quiet, it lets a man wind up to cut him down late for a shard. --perfect cuts the instant anything is
// in reach (and catches the gourd the moment it can). --hearts
// prints where hearts came from and went, stage by stage, instead of the usual table. --check fails (exit 1) if
// the early stages stop being winnable, if the pilot is parried by guards it could not have seen, if a perfect pilot
// ever loses, or if fights run too short or too long for a break; with --campaign, if runs stop getting as far as
// they should. Bad arguments exit 2.

/// What a person with these hands should manage in each mode: at least `rate` of the stages up to `through` won.
let stageBars: [Mode: [(through: Int, rate: Double)]] = [
    .shoshin: [(10, 0.9), (14, 0.6)],
    .bushido: [(3, 0.9), (8, 0.5)],
    .shura: [(3, 0.75), (6, 0.4)],
    .oni: [(2, 0.4)],
]
/// The mean stage a campaign run (over 32 seeds) should reach, by mode: a floor that hearts that stopped coming back
/// (neither gourd nor shards: 13.1, 8.8, 5.8, 3.2), or stages that got much harder, would break. Real players can also
/// restart a stage they are losing, which the runs never do.
let campaignBars: [Mode: Double] = [.shoshin: 15, .bushido: 11, .shura: 7, .oni: 3.5]
/// A patient pilot is only parried by a guard it cut into by mistake (a slip): more than this many a fight means
/// guards are turning aside cuts that were on their way before the guard could be seen.
let parryBar = 0.5
/// A perfect pilot's fights, in seconds (the mean over the seeds, per stage).
let lengthBar = 15.0...150.0

/// What to play, and how.
struct Options {
    var stages = 1...20
    /// 12 for the stage table, 32 for a campaign, unless given.
    var seeds = 0
    var reaction = 0.22
    var rate = 7.0
    var slips = 0.02
    var rash = 0.0
    var timing = 0.05
    var daring = 0.8
    var perfect = false
    var hearts = false
    var check = false
    var trace: Int?
    var campaign = false
    var modes: [Mode] = [.bushido]
}

func usage() -> String {
    var text = """
    usage: ronin-sim [--stages 1-20] [--seeds 12] [--mode bushido|shoshin|shura|oni|all] [--reaction 0.22]
                     [--rate 7] [--slips 0.02] [--rash 0] [--timing 0.05] [--daring 0.8] [--perfect] [--hearts]
                     [--check]
           ronin-sim --campaign [--seeds 32] [--mode all] [--check]
           ronin-sim --trace <stage> [--mode bushido]

    --check holds the game to these bars (set for the default human-like pilot, and --seeds 32 on a campaign):
      it wins at least:
    """
    for mode in Mode.allCases {
        let bars = (stageBars[mode] ?? []).map { "\(Int($0.rate * 100))% through stage \($0.through)" }
        text += "\n    \(mode.title): " + bars.joined(separator: ", ")
    }
    text += "\n  and is parried at most \(parryBar) times a fight on any stage (unless --rash);"
    text += "\n  the perfect pilot never loses, and its fights last \(Int(lengthBar.lowerBound))-\(Int(lengthBar.upperBound)) s on average per stage;"
    text += "\n  a campaign run reaches at least this stage on average: "
    text += Mode.allCases.map { "\($0.title) " + String(format: "%g", campaignBars[$0] ?? 1) }.joined(separator: ", ")
    return text
}

func fail(_ message: String) -> Never {
    print(message)
    print(usage())
    exit(2)
}

func number(_ name: String, _ value: String?, _ valid: (Double) -> Bool) -> Double {
    guard let value, let x = Double(value), valid(x) else { fail("\(name) needs a number in range, not \(value ?? "nothing")") }
    return x
}

func parse(_ list: [String]) -> Options {
    var o = Options()
    var arguments = list.makeIterator()
    while let argument = arguments.next() {
        switch argument {
        case "--stages":
            let text = arguments.next() ?? ""
            let parts = text.split(separator: "-", omittingEmptySubsequences: false).map { Int($0) }
            guard (1...2).contains(parts.count), let lo = parts.first ?? nil, let hi = parts.last ?? nil, 1 <= lo, lo <= hi else {
                fail("--stages needs a stage or a range like 1-20, not \(text)")
            }
            o.stages = lo...hi
        case "--seeds": o.seeds = Int(number("--seeds", arguments.next()) { $0 >= 1 && $0 == $0.rounded() })
        case "--reaction": o.reaction = number("--reaction", arguments.next()) { $0 >= 0 }
        case "--rate": o.rate = number("--rate", arguments.next()) { $0 > 0 }
        case "--slips": o.slips = number("--slips", arguments.next()) { (0...1).contains($0) }
        case "--rash": o.rash = number("--rash", arguments.next()) { $0 >= 0 }
        case "--timing": o.timing = number("--timing", arguments.next()) { $0 >= 0 }
        case "--daring": o.daring = number("--daring", arguments.next()) { (0...1).contains($0) }
        case "--hearts": o.hearts = true
        case "--mode":
            let name = arguments.next() ?? ""
            if name == "all" { o.modes = Mode.allCases } else if let mode = Mode(rawValue: name) { o.modes = [mode] } else {
                fail("unknown mode \(name)")
            }
        case "--perfect": o.perfect = true
        case "--check": o.check = true
        case "--trace": o.trace = Int(number("--trace", arguments.next()) { $0 >= 1 && $0 == $0.rounded() })
        case "--campaign": o.campaign = true
        case "--help", "-h":
            print(usage())
            exit(0)
        default: fail("unknown argument \(argument)")
        }
    }
    if o.check, o.trace != nil { fail("--check applies to the stage table and --campaign, not --trace") }
    if o.seeds == 0 { o.seeds = o.campaign ? 32 : 12 }
    return o
}

let options = parse(Array(CommandLine.arguments.dropFirst()))

func pilot(_ seed: Int, _ o: Options) -> Pilot {
    o.perfect ? .perfect : .human(reaction: o.reaction, rate: o.rate, slips: o.slips, rash: o.rash, timing: o.timing,
                                  daring: o.daring, seed: UInt64(seed) &* 7919 &+ 17)
}

func clock(_ t: Double) -> String { String(format: "%6.2f", t) }

/// Where a fight's hearts came from and went: how its gourd went (its bearer met, cut down, and the gourd caught for
/// a heart or points, shattered, or carried off), the hearts its bearer's blows took, the shards earned, the hearts
/// they made (or points), the shards a wound scattered, and the hearts the warlord took.
struct Tally {
    var met = 0, downed = 0, restored = 0, atFull = 0, shattered = 0, fled = 0, bearer = 0
    var shards = 0, mended = 0, mendedFull = 0, scattered = 0
    var boss = 0

    var caught: Int { restored + atFull }
    static func += (a: inout Tally, b: Tally) {
        a.met += b.met
        a.downed += b.downed
        a.restored += b.restored
        a.atFull += b.atFull
        a.shattered += b.shattered
        a.fled += b.fled
        a.bearer += b.bearer
        a.shards += b.shards
        a.mended += b.mended
        a.mendedFull += b.mendedFull
        a.scattered += b.scattered
        a.boss += b.boss
    }
}

func play(stage: Int, seed: Int, mode: Mode, hearts: Int? = nil, shards: Int = 0, log: Bool = false,
          _ o: Options) -> (fight: Fight, tally: Tally) {
    var fight = Fight(stage: stage, seed: mixSeed(0xC0FFEE, UInt64(stage), UInt64(seed)), mode: mode, hearts: hearts, shards: shards)
    fight.pilot = pilot(seed, o)
    var tally = Tally()
    var next = 1.0
    var bearer: Int?
    while fight.outcome == nil, fight.time < 600 {
        let events = fight.step(0.05)
        if bearer == nil, let carrier = fight.foes.first(where: \.bearer) {
            bearer = carrier.id
            tally.met += 1
        }
        for event in events {
            switch event {
            case .flung: tally.downed += 1
            case .healed(_, let restored): if restored { tally.restored += 1 } else { tally.atFull += 1 }
            case .shattered: tally.shattered += 1
            case .fled: tally.fled += 1
            case .shard: tally.shards += 1
            case .mended(let restored): if restored { tally.mended += 1 } else { tally.mendedFull += 1 }
            case .scattered(let n): tally.scattered += n
            case .wounded(let foe?, let damage) where foe == fight.bossID: tally.boss += damage
            case .wounded(let foe?, let damage) where foe == bearer: tally.bearer += damage
            default: break
            }
        }
        guard log else { continue }
        for event in events {
            switch event {
            case .wounded(let foe, let damage):
                let who = foe.flatMap { id in fight.foes.first { $0.id == id }?.kind.rawValue } ?? "arrow"
                print("\(clock(fight.time))  wounded by \(who) (-\(damage)) → \(fight.hp) hp")
            case .warlord: print("\(clock(fight.time))  the warlord arrives")
            case .guarded: print("\(clock(fight.time))  the warlord raises his guard")
            case .parried(let side, _):
                let how = fight.isStumbling ? "turned aside" : "glanced off his rising guard"
                print("\(clock(fight.time))  a cut \(side == .left ? "left" : "right") \(how)")
            case .summoned(_, let allies): print("\(clock(fight.time))  the warlord calls \(allies.count) men")
            case .whiff(let side): print("\(clock(fight.time))  whiff \(side == .left ? "left" : "right")")
            case .flung: print("\(clock(fight.time))  the gourd-bearer falls, the gourd in the air")
            case .healed(_, let restored): print("\(clock(fight.time))  the gourd caught: \(restored ? "a heart back" : "points")")
            case .shattered: print("\(clock(fight.time))  the gourd shattered")
            case .fled: print("\(clock(fight.time))  the gourd-bearer got away")
            case .shard(_, let count): print("\(clock(fight.time))  sen-no-sen: shard \(count)")
            case .mended(let restored): print("\(clock(fight.time))  the shards make \(restored ? "a heart" : "points")")
            case .scattered(let n): print("\(clock(fight.time))  \(n) shard\(n == 1 ? "" : "s") scattered")
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
    return (fight, tally)
}

if let stage = options.trace {
    let fight = play(stage: stage, seed: 1, mode: options.modes[0], log: true, options).fight
    print("stage \(stage): \(fight.outcome?.rawValue ?? "unfinished") in \(Int(fight.time))s, score \(fight.score), best combo \(fight.stats.bestCombo), roster \(fight.roster.count)")
    exit(0)
}

print(options.perfect ? "perfect pilot" : "pilot: reaction \(options.reaction)s, \(options.rate) cuts/s, slips \(options.slips)"
      + ", timing ±\(options.timing)s, daring \(options.daring)" + (options.rash > 0 ? ", rash \(options.rash)/s" : ""))
var failures: [String] = []

if options.campaign {
    // How far a run gets from stage 1 with hearts (and shards) carried. The other columns are per run: hearts the
    // gourd gave back, and the shards; gourds caught with no heart missing (points), shattered, and carried off; the
    // gourds caught of those met; and the hearts the bearers' blows took.
    print("mode       hearts  reached (median, mean, best)   minutes  gourd+ shard+   full  broke   fled  caught  bearer-")
    for mode in Mode.allCases where options.modes.contains(mode) {
        var reached: [Int] = [], minutes = 0.0, gourds = Tally()
        for seed in 0..<options.seeds {
            var stage = 1, hearts: Int? = nil, shards = 0
            while stage <= 40 {
                let (fight, tally) = play(stage: stage, seed: seed * 101 + stage, mode: mode, hearts: hearts, shards: shards, options)
                minutes += fight.time / 60
                gourds += tally
                guard fight.outcome == .victory else { break }
                hearts = fight.hp
                shards = fight.shards
                stage += 1
            }
            reached.append(stage)
        }
        reached.sort()
        let n = Double(options.seeds)
        let mean = Double(reached.reduce(0, +)) / n
        let met = gourds.caught + gourds.shattered + gourds.fled
        let caught = met == 0 ? "    -" : String(format: "%5.0f%%", 100 * Double(gourds.caught) / Double(met))
        print(mode.title.padding(toLength: 10, withPad: " ", startingAt: 0)
              + String(format: " %6d  %7d %6.1f %6d            %7.1f  %6.1f %6.1f %6.1f %6.1f %6.1f  ", mode.hearts, reached[reached.count / 2], mean,
                       reached.last ?? 0, minutes / n, Double(gourds.restored) / n, Double(gourds.mended) / n, Double(gourds.atFull) / n,
                       Double(gourds.shattered) / n, Double(gourds.fled) / n)
              + caught + String(format: "  %7.1f", Double(gourds.bearer) / n))
        if options.check, !options.perfect, let bar = campaignBars[mode], mean < bar {
            failures.append("\(mode.title) campaign: runs reach stage \(String(format: "%.1f", mean)) on average, under " + String(format: "%g", bar))
        }
    }
} else if options.hearts {
    // Where hearts came from and went, a fight a stage from full hearts: of the fights that met the gourd-bearer, how
    // often he was cut down, and of those how often the gourd was caught; then, a fight, the hearts the gourd gave back
    // (and the catches worth points, hearts full), the hearts his blows took, the shards earned and the hearts they
    // made (and points), the shards scattered, and every heart lost.
    for mode in options.modes {
        print("\n\(mode.title) (\(mode.gist)): \(mode.hearts) hearts")
        print("stage  win%    met  downed  caught   gourd+  full  bearer-   shards  shard+  full  scattered   wounds")
        var all = Tally(), allWounds = 0.0, fights = 0.0
        for stage in options.stages {
            var t = Tally(), wins = 0, wounds = 0.0
            for seed in 0..<options.seeds {
                let (fight, tally) = play(stage: stage, seed: seed, mode: mode, options)
                t += tally
                if fight.outcome == .victory { wins += 1 }
                wounds += Double(fight.stats.damage)
            }
            all += t
            allWounds += wounds
            fights += Double(options.seeds)
            let n = Double(options.seeds)
            print(heartsRow(String(format: "%5d  %4.0f", stage, 100 * Double(wins) / n), t, wounds, n))
        }
        print(heartsRow("  all      ", all, allWounds, fights))
    }
} else {
    for mode in options.modes {
        print("\n\(mode.title) (\(mode.gist)): \(mode.hearts) hearts")
        print("stage  setting          foes  win%   time  wounds  combo  whiffs  parried  warlord")
        for stage in options.stages {
            var wins = 0
            var time = 0.0, wounds = 0.0, combo = 0.0, whiffs = 0.0, parried = 0.0, boss = 0.0
            for seed in 0..<options.seeds {
                let (fight, tally) = play(stage: stage, seed: seed, mode: mode, options)
                if fight.outcome == .victory { wins += 1 }
                time += fight.time
                wounds += Double(fight.stats.damage)
                combo += Double(fight.stats.bestCombo)
                whiffs += Double(fight.stats.whiffs)
                parried += Double(fight.stats.parried)
                boss += Double(tally.boss)
                if fight.outcome == nil { failures.append("stage \(stage) seed \(seed) never finished") }
            }
            let n = Double(options.seeds)
            let rate = Double(wins) / n
            let roster = Fight(stage: stage, seed: 1, mode: mode).roster.count
            let name = Setting.of(stage: stage).name.padding(toLength: 16, withPad: " ", startingAt: 0)
            // The last column: hearts the warlord took a fight, on the stages he ends.
            let warlord = Difficulty(stage: stage, mode: mode).boss ? String(format: "%7.1f", boss / n) : "      -"
            print(String(format: "%5d  ", stage) + name + String(format: " %5d  %4.0f  %5.1f  %6.1f  %5.1f  %6.1f  %7.2f  ", roster, rate * 100,
                                                                 time / n, wounds / n, combo / n, whiffs / n, parried / n) + warlord)
            guard options.check else { continue }
            let mean = time / n
            if options.perfect {
                if wins < options.seeds {
                    failures.append("\(mode.title) stage \(stage): the perfect pilot lost \(options.seeds - wins) of \(options.seeds)")
                }
                if !lengthBar.contains(mean) { failures.append("\(mode.title) stage \(stage): fights last \(Int(mean))s") }
                continue
            }
            for bar in stageBars[mode] ?? [] where stage <= bar.through && rate < bar.rate {
                failures.append("\(mode.title) stage \(stage): only \(Int(rate * 100))% won")
                break
            }
            if options.rash == 0, parried / n > parryBar {
                failures.append("\(mode.title) stage \(stage): parried \(String(format: "%.2f", parried / n)) times a fight")
            }
        }
    }
}
/// A row of the `--hearts` table: `t` over `n` fights that lost `wounds` hearts in all.
func heartsRow(_ lead: String, _ t: Tally, _ wounds: Double, _ n: Double) -> String {
    func share(_ a: Int, _ b: Int) -> String { b == 0 ? "     -" : String(format: "%5.0f%%", 100 * Double(a) / Double(b)) }
    return lead + String(format: "  %4.0f%%", 100 * Double(t.met) / n) + "  " + share(t.downed, t.met) + "  " + share(t.caught, t.downed)
        + String(format: "   %6.2f %5.2f   %6.2f   %6.2f  %6.2f %5.2f     %6.2f   %6.2f", Double(t.restored) / n, Double(t.atFull) / n,
                 Double(t.bearer) / n, Double(t.shards) / n, Double(t.mended) / n, Double(t.mendedFull) / n, Double(t.scattered) / n,
                 wounds / n)
}

if !failures.isEmpty {
    for failure in failures { print("FAIL: \(failure)") }
    exit(1)
}
