import Foundation

/// A move the advisor would make.
public enum Move: Equatable, Sendable {
    case attack(from: Int, to: Int)
    case march(from: Int, to: Int)
    case levy(at: Int)
}

/// A plain, greedy general: spend gold on the front, strike the best-odds border, bring idle troops forward. Plays
/// the campaigns in `warlord-sim` and the app's self-test.
public enum Advisor {
    public static func suggest(_ game: Game) -> Move? {
        let realm = game.realm
        guard !realm.isConquered else { return nil }
        let mine = realm.owned(by: .player)
        let front = mine.filter { t in realm.adjacency[t].contains { realm.territories[$0].owner != .player } }

        // Levy where the army is already massing for its next blow.
        if game.canLevy, let t = front.max(by: { realm.territories[$0].troops < realm.territories[$1].troops }) {
            return .levy(at: t)
        }

        if game.orders > 0 {
            var best: (move: Move, score: Double)?
            for t in front where realm.territories[t].troops >= 2 {
                for n in realm.adjacency[t] where realm.territories[n].owner != .player {
                    guard let odds = game.chance(from: t, to: n), odds >= 0.6 else { continue }
                    let target = realm.territories[n]
                    let seat = realm.rivals.contains { $0.seat == n && $0.isAlive }
                    let score = odds * 2 + (seat ? 3 : 0) + target.income - target.wall / 10
                    if score > best?.score ?? -.infinity { best = (.attack(from: t, to: n), score) }
                }
            }
            if let best { return best.move }
        }

        // Bring troops one step closer to the nearest enemy, from lands with no enemy next door.
        let distance = distancesToEnemy(realm)
        for t in mine.sorted(by: { realm.territories[$0].troops > realm.territories[$1].troops }) where realm.territories[t].troops >= 2 && !front.contains(t) {
            if let step = realm.adjacency[t].filter({ realm.territories[$0].owner == .player && distance[$0] < distance[t] }).min(by: { distance[$0] < distance[$1] }) {
                return .march(from: t, to: step)
            }
        }
        return nil
    }

    /// Steps from each territory to the nearest one not yours.
    static func distancesToEnemy(_ realm: Realm) -> [Int] {
        var distance = realm.territories.map { $0.owner == .player ? Int.max : 0 }
        var queue = realm.territories.filter { $0.owner != .player }.map(\.id)
        var head = 0
        while head < queue.count {
            let t = queue[head]
            head += 1
            for n in realm.adjacency[t] where distance[n] == Int.max {
                distance[n] = distance[t] + 1
                queue.append(n)
            }
        }
        return distance
    }
}

extension Game {
    /// Carries out a move, as the panel would.
    @discardableResult
    public mutating func play(_ move: Move, now: Date) throws -> Turn? {
        switch move {
        case .attack(let from, let to): return try attack(from: from, to: to, now: now)
        case .march(let from, let to): try march(from: from, to: to, now: now)
        case .levy(let at): try levy(at: at, now: now)
        }
        return nil
    }
}
