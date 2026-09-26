/// Lays out a battlefield: homes in the corners, unclaimed ground between. A one-on-one map is point-symmetric
/// about the centre, so neither side starts with the better ground; with more factions it is scattered.
public enum MapGenerator {
    struct Site {
        var position: Vec2
        var kind: Outpost.Kind
        var owner: Int
        var troops: Double
        var armor: Double = 1
    }

    public static func make(sector: Int, seed: UInt64, difficulty: Difficulty) -> [Outpost] {
        var rng = SeededRNG(seed: seed)
        let s = max(1, sector)
        var sites: [Site] = []

        // Homes.
        let player = Vec2(0.14 + rng.range(-0.03, 0.03), 0.14 + rng.range(-0.03, 0.03))
        sites.append(Site(position: player, kind: .stronghold, owner: Side.player, troops: 30))
        let rival = difficulty.enemies == 1
            ? Vec2(1 - player.x, 1 - player.y)
            : Vec2(0.86 + rng.range(-0.03, 0.03), 0.86 + rng.range(-0.03, 0.03))
        if difficulty.siege {
            sites.append(Site(position: rival, kind: .citadel, owner: 2, troops: difficulty.homeTroops * 0.7, armor: 1.25))
        } else {
            sites.append(Site(position: rival, kind: .stronghold, owner: 2, troops: difficulty.homeTroops))
        }
        var corners = [Vec2(0.14, 0.86), Vec2(0.86, 0.14)]
        if rng.chance(0.5) { corners.swapAt(0, 1) }
        for k in 0..<max(0, min(2, difficulty.enemies - 1)) {
            let corner = Vec2(corners[k].x + rng.range(-0.03, 0.03), corners[k].y + rng.range(-0.03, 0.03))
            sites.append(Site(position: corner, kind: .stronghold, owner: 3 + k, troops: difficulty.homeTroops * 0.7))
        }

        func randomKind() -> Outpost.Kind {
            let r = rng.unit()
            return r < 0.4 ? .relay : r < 0.8 ? .outpost : .stronghold
        }
        let extra = Double(min(10, s / 4))
        func garrison(_ kind: Outpost.Kind) -> Double {
            switch kind {
            case .relay: return Double(rng.int(3...8)) + extra * 0.5
            case .outpost: return Double(rng.int(7...14)) + extra * 0.8
            default: return Double(rng.int(12...22)) + extra
            }
        }

        var minimum = 0.19
        var failures = 0
        func fits(_ p: Vec2) -> Bool {
            guard (0.08...0.92).contains(p.x), (0.08...0.92).contains(p.y) else { return false }
            return sites.allSatisfy { $0.position.distance(to: p) >= minimum }
        }

        if difficulty.enemies == 1 {
            // A contested prize in the middle, then pairs mirrored through it.
            let centre = Double(min(40, 16 + s / 2))
            sites.append(Site(position: Vec2(0.5, 0.5), kind: .stronghold, owner: Side.neutral, troops: centre))
            let pairs = 4 + min(2, s / 5)
            var placed = 0
            while placed < pairs, failures < 4000 {
                let p = Vec2(rng.range(0.08, 0.92), rng.range(0.08, 0.92))
                let q = Vec2(1 - p.x, 1 - p.y)
                if p.x + p.y < 0.92, fits(p), fits(q), p.distance(to: q) >= minimum {
                    let kind = randomKind()
                    let troops = garrison(kind)
                    sites.append(Site(position: p, kind: kind, owner: Side.neutral, troops: troops))
                    sites.append(Site(position: q, kind: kind, owner: Side.neutral, troops: troops))
                    placed += 1
                } else {
                    failures += 1
                    if failures % 400 == 0 { minimum *= 0.92 }
                }
            }
        } else {
            let count = 7 + min(4, s / 4) + difficulty.enemies
            var placed = 0
            while placed < count, failures < 4000 {
                let p = Vec2(rng.range(0.08, 0.92), rng.range(0.08, 0.92))
                if fits(p) {
                    let kind = randomKind()
                    sites.append(Site(position: p, kind: kind, owner: Side.neutral, troops: garrison(kind)))
                    placed += 1
                } else {
                    failures += 1
                    if failures % 400 == 0 { minimum *= 0.92 }
                }
            }
        }

        if difficulty.siege {
            // The citadel's guard: the two unclaimed positions nearest it start in enemy hands.
            let guards = sites.indices
                .filter { sites[$0].owner == Side.neutral }
                .sorted { sites[$0].position.distance(to: rival) < sites[$1].position.distance(to: rival) }
                .prefix(2)
            for i in guards {
                sites[i].owner = 2
                sites[i].troops = 3 + Double(s) / 10
            }
        }

        return sites.enumerated().map { index, site in
            Outpost(id: index, position: site.position, kind: site.kind, owner: site.owner, troops: site.troops, armor: site.armor)
        }
    }
}
