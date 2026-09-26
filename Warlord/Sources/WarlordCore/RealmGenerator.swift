import Foundation

/// Draws a new realm: a small hex map with a few lakes, terrain, named territories, your seat on the western edge
/// and the rival houses as far from it, and from each other, as the map allows.
public enum RealmGenerator {
    /// Map size by realm: the first fits in a corner of the screen, later ones grow a little.
    public static func dimensions(level: Int) -> (columns: Int, rows: Int) {
        switch level {
        case ...1: (6, 4)
        case 2: (7, 4)
        case 3: (7, 5)
        default: (8, 5)
        }
    }

    public static func rivalCount(level: Int) -> Int {
        min(max(level, 1), 3)
    }

    public static func make(level: Int, rank: Int, rng: inout SplitMix64) -> Realm {
        let (columns, rows) = dimensions(level: level)
        let land = carveLakes(columns: columns, rows: rows, count: columns * rows / 10, rng: &rng)

        // Your seat: somewhere on the two western columns. Rival seats: each as far as possible from those placed.
        let west = land.filter { $0.col <= 1 && $0.row > 0 && $0.row < rows - 1 }
        let home = (west.isEmpty ? land.filter { $0.col <= 1 } : west).randomElement(using: &rng) ?? land[0]
        var seats = [home]
        for _ in 0..<rivalCount(level: level) {
            let candidates = land.filter { !seats.contains($0) }
            let far = candidates.map { hex in (hex, seats.map { hex.distance(to: $0) }.min() ?? 0) }
            let best = far.map(\.1).max() ?? 0
            if let pick = far.filter({ $0.1 == best }).map(\.0).randomElement(using: &rng) { seats.append(pick) }
        }

        var names = Names.territories.shuffled(using: &rng)
        var territories: [Territory] = []
        for hex in land.sorted(by: { ($0.row, $0.col) < ($1.row, $1.col) }) {
            let isSeat = seats.contains(hex)
            territories.append(Territory(
                id: territories.count, hex: hex, name: names.popLast() ?? "Nowhere",
                terrain: isSeat ? .city : terrain(rng: &rng), owner: .neutral, troops: 0, isCapital: isSeat))
        }
        let id = { (hex: Hex) in territories.first { $0.hex == hex }!.id }
        let homeID = id(home)

        var rivals: [Faction] = []
        for (index, house) in Names.houses.shuffled(using: &rng).prefix(seats.count - 1).enumerated() {
            rivals.append(Faction(id: FactionID(index + 2), name: house.name, banner: house.banner, seat: id(seats[index + 1]), isAlive: true))
        }

        var realm = Realm(level: level, name: Names.realm(rng: &rng), columns: columns, rows: rows,
                          territories: territories, rivals: rivals, home: homeID)
        let nearHome = Set(realm.adjacency[homeID])

        // Garrisons. Unclaimed land grows stubborner realm by realm; the land around your seat stays easy pickings.
        for t in realm.territories.indices {
            var troops = Int(rng.next() % 3) + level
            switch realm.territories[t].terrain {
            case .mountains, .city: troops += 2
            case .hills: troops += 1
            default: break
            }
            realm.territories[t].troops = nearHome.contains(t) ? min(troops, 3) : troops
        }
        realm.territories[homeID].owner = .player
        realm.territories[homeID].troops = 10 + 2 * rank

        // Each house holds its seat and a few lands around it, never any bordering your seat.
        for house in rivals {
            realm.territories[house.seat].owner = house.id
            realm.territories[house.seat].troops = 6 + 4 * level
            let holdings = realm.adjacency[house.seat]
                .filter { realm.territories[$0].owner == .neutral && !nearHome.contains($0) }
                .shuffled(using: &rng)
                .prefix(2 + level / 2)
            for t in holdings {
                realm.territories[t].owner = house.id
                realm.territories[t].troops = 2 + 2 * level
            }
        }
        return realm
    }

    /// The map's cells less `count` lakes, never cutting the land in two.
    static func carveLakes(columns: Int, rows: Int, count: Int, rng: inout SplitMix64) -> [Hex] {
        var land = (0..<rows).flatMap { row in (0..<columns).map { Hex($0, row) } }
        var carved = 0
        for hex in land.shuffled(using: &rng) where carved < count {
            let rest = land.filter { $0 != hex }
            if isConnected(rest) {
                land = rest
                carved += 1
            }
        }
        return land
    }

    static func isConnected(_ cells: [Hex]) -> Bool {
        guard let start = cells.first else { return true }
        let all = Set(cells)
        var seen: Set<Hex> = [start]
        var queue = [start]
        while let hex = queue.popLast() {
            for n in hex.neighbors where all.contains(n) && !seen.contains(n) {
                seen.insert(n)
                queue.append(n)
            }
        }
        return seen.count == all.count
    }

    static func terrain(rng: inout SplitMix64) -> Terrain {
        let roll = rng.unit()
        switch roll {
        case ..<0.40: return .plains
        case ..<0.65: return .forest
        case ..<0.84: return .hills
        case ..<0.93: return .mountains
        default: return .city
        }
    }
}

enum Names {
    static let territories: [String] = {
        let heads = ["Ash", "Black", "Grim", "Iron", "Stone", "Wolf", "Raven", "Storm", "Frost", "Gold", "Red", "Oak",
                     "Thorn", "High", "Dun", "Hald", "Kar", "Mor", "Vel", "Brak", "Elder", "Cold", "Hawk", "Bram"]
        let tails = ["ford", "holt", "moor", "gate", "hold", "fell", "mark", "wick", "crag", "vale", "keep", "barrow",
                     "reach", "stead", "watch", "helm"]
        return heads.flatMap { head in tails.map { head + $0 } }
    }()

    static let houses: [(name: String, banner: Int)] = [
        ("the Crimson Host", 1), ("the Azure Throne", 2), ("the Verdant Oath", 3), ("the Ashen Order", 4),
    ]

    static func realm(rng: inout SplitMix64) -> String {
        let places = ["Varrow", "Kharn", "Dunmere", "Estria", "Valdris", "Orsk", "Thalmere", "Brennmark", "Caldor",
                      "Ymirheim", "Gorvath", "Seldane", "Akhmar", "Norwold"]
        let forms = ["The # Marches", "Kingdom of #", "The # Reach", "Duchy of #", "The Wilds of #", "Principality of #"]
        let form = forms.randomElement(using: &rng)!
        return form.replacingOccurrences(of: "#", with: places.randomElement(using: &rng)!)
    }
}
