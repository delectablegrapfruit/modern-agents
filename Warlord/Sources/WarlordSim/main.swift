import Foundation
import WarlordCore

// Plays campaigns with the advisor, taking a break of play every so often, and prints how long each realm held out.
//   warlord-sim [--realms N] [--break MINUTES] [--seed S] [--campaigns C]

var realms = 5, breakMinutes = 30.0, seed: UInt64 = 1, campaigns = 20
var args = CommandLine.arguments.dropFirst()
while let flag = args.popFirst() {
    let value = args.popFirst() ?? ""
    switch flag {
    case "--realms": realms = Int(value) ?? realms
    case "--break": breakMinutes = Double(value) ?? breakMinutes
    case "--seed": seed = UInt64(value) ?? seed
    case "--campaigns": campaigns = Int(value) ?? campaigns
    default:
        FileHandle.standardError.write(Data("usage: warlord-sim [--realms N] [--break MINUTES] [--seed S] [--campaigns C]\n".utf8))
        exit(2)
    }
}

struct Tally {
    var breaks = 0, orders = 0, won = 0, lost = 0, lands = 0, minutes = 0.0, gold = 0.0
}

var tallies = Array(repeating: Tally(), count: realms)
var losses = 0
for campaign in 0..<campaigns {
    var now = Date(timeIntervalSinceReferenceDate: 0)
    var game = Game(seed: seed &+ UInt64(campaign) &* 7919, now: now)
    for level in 0..<realms {
        var tally = Tally()
        tally.lands = game.realm.territories.count
        let start = now
        var breaks = 0
        while !game.realm.isConquered && breaks < 500 {
            breaks += 1
            now += breakMinutes * 60
            _ = game.checkIn(now: now)
            var moves = 0
            while moves < 200, let move = Advisor.suggest(game) {
                moves += 1
                do {
                    guard let turn = try game.play(move, now: now) else { continue }
                    tally.orders += 1
                    if turn.battle.won { tally.won += 1 } else { tally.lost += 1 }
                    losses += turn.rivalBattles.filter { $0.won && $0.defender == .player }.count
                    if turn.conquered { break }
                } catch {
                    break
                }
            }
        }
        tally.breaks = breaks
        tally.minutes = now.timeIntervalSince(start) / 60
        tally.gold = game.gold
        tallies[level].breaks += tally.breaks
        tallies[level].orders += tally.orders
        tallies[level].won += tally.won
        tallies[level].lost += tally.lost
        tallies[level].lands += tally.lands
        tallies[level].minutes += tally.minutes
        tallies[level].gold += tally.gold
        guard game.realm.isConquered else { print("campaign \(campaign): stuck in realm \(level + 1)"); break }
        try? game.advance(now: now)
    }
}

let n = Double(campaigns)
func column(_ value: Double, _ width: Int) -> String {
    let text = String(format: "%.1f", value / n)
    return String(repeating: " ", count: max(0, width - text.count)) + text
}
print("\(campaigns) campaigns, a break of play every \(Int(breakMinutes)) min; averages per realm")
print("realm  lands  breaks  hours  orders   won  lost  gold-left")
for (i, t) in tallies.enumerated() {
    let cells = [column(Double(t.lands), 5), column(Double(t.breaks), 7), column(t.minutes / 60, 6), column(Double(t.orders), 7),
                 column(Double(t.won), 5), column(Double(t.lost), 5), column(t.gold, 10)]
    print("\(i + 1)".padding(toLength: 5, withPad: " ", startingAt: 0) + cells.joined(separator: " "))
}
print("lands lost to rivals across all campaigns: \(losses)")
