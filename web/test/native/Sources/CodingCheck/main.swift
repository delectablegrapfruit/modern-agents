import Foundation
import RoninCore

// Careers and fights at every kind of moment, each saved both ways and read both ways: Foundation's JSONEncoder and
// JSONDecoder (the app), and the WebAssembly build's own coder (JSONCoding.swift, SaveFile.swift). Every one must read
// back to the very same value, whoever wrote it.

var checked = 0, identical = 0
var failures: [String] = []

func check(_ game: SaveGame, _ label: String) {
    checked += 1
    let foundation = try! JSONEncoder().encode(game)
    let ours = saveFile(game)
    if Array(foundation) == ours { identical += 1 }
    if loadSave(Array(foundation)) != game { failures.append("\(label): ours does not read Foundation's save back") }
    if SaveGame.load(Data(ours)) != game { failures.append("\(label): Foundation does not read our save back") }
    if loadSave(ours) != game { failures.append("\(label): ours does not read its own save back") }
    // The same JSON, as values.
    let a = try! JSONSerialization.jsonObject(with: foundation) as! NSDictionary
    let b = try! JSONSerialization.jsonObject(with: Data(ours)) as! NSDictionary
    if a != b { failures.append("\(label): the two saves differ as JSON") }
}

/// Reads the same bytes both ways: the app's `SaveGame.load` and ours must agree (both nil, or equal).
func agree(_ text: String, _ label: String) {
    checked += 1
    let theirs = SaveGame.load(Data(text.utf8)), ours = loadSave(Array(text.utf8))
    if theirs != ours { failures.append("\(label): SaveGame.load and ours disagree on \(text.prefix(80))") }
}

for seed in 1...12 {
    var career = Career(seed: UInt64(seed) &* 0x9E37_79B9_7F4A_7C15)
    career.choose(Mode.allCases[seed % 4])
    var rng = SeededRNG(seed: UInt64(seed))
    for round in 0..<10 {
        if round == 6 { career.startEndless(at: career.unlocked.upperBound) }
        if round == 9 { career.leaveEndless() }
        var fight = career.makeFight()
        fight.pilot = seed % 3 == 0 ? .perfect : .human(reaction: 0.3, rate: 5, slips: 0.05, seed: UInt64(seed * 100 + round))
        if round % 4 == 1 { fight.crowding = .queue }
        var t = 0.0
        while fight.outcome == nil, t < 600 {
            let dt = rng.range(0.2, 9)
            t += dt
            _ = fight.step(dt)
            if rng.chance(0.3) { _ = fight.strike(rng.chance(0.5) ? .left : .right) }
            check(SaveGame(career: career, fight: fight), "seed \(seed) round \(round) t \(Int(t))")
        }
        if fight.outcome != nil { career.record(fight) } else { career.abandon(fight) }
        check(SaveGame(career: career, fight: career.makeFight()), "seed \(seed) round \(round) booked")
    }
}

// Older and broken saves.
var career = Career(seed: UInt64.max - 7)
career.stage = 12
let current = String(decoding: try! JSONEncoder().encode(SaveGame(career: career, fight: career.makeFight())), as: UTF8.self)
agree(current, "current")
agree(current.replacingOccurrences(of: "\"version\":3", with: "\"version\":2"), "older version")
agree(#"{"career":{"seed":18446744073709551615,"mode":"oni","stages":{"oni":7}},"fight":{}}"#, "old career, no fight")
agree(#"{"career":{"seed":5,"mode":"nonsense","kills":"lots"}}"#, "unreadable fields")
agree(#"{"career":{}}"#, "no seed")
agree("not json", "garbage")
agree("", "empty")
agree(#"{"career":{"seed":1.0e3,"streak":2.0}}"#, "numbers written as doubles")
agree(#"{"career":{"seed":5,"lastRun":{"start":3,"stage":"x"}},"version":3}"#, "a run that half reads")

// (Few are byte for byte the same: Foundation on Linux writes an object's keys in hash order, ours in the order encoded.)
print("checked \(checked) saves: \(identical) byte-identical to Foundation's, \(failures.count) failures")
for failure in failures.prefix(20) { print("  " + failure) }
exit(failures.isEmpty ? 0 : 1)
