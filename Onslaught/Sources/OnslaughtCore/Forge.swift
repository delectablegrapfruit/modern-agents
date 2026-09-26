import Foundation

/// Makes bosses. The same wave and seed always make the same boss; later waves hit harder, faster and denser, and
/// every fifth is a dreadnought: bigger, tougher, with a barrage running under its attacks.
public enum Forge {
    /// 0 at wave 1, rising towards 1: how hard the patterns press.
    public static func pressure(wave: Int) -> Double { 1 - exp(-Double(max(0, wave - 1)) / 7) }

    public static func hull(wave: Int, heavy: Bool) -> Double {
        170 * pow(1.2, Double(max(0, wave - 1))) * (heavy ? 1.35 : 1)
    }

    static let adjectives = [
        "IRON", "CRIMSON", "HOLLOW", "OBSIDIAN", "VOID", "SCORCHED", "SILENT", "BROKEN", "GILDED", "RAVENOUS",
        "ASHEN", "FERAL", "SOVEREIGN", "BLIGHTED", "SHATTERED", "MOLTEN", "PALE", "SAVAGE", "GRIM", "SUNDERED",
    ]
    static let nouns = [
        "TYRANT", "WARDEN", "HYDRA", "REAPER", "BEHEMOTH", "SENTINEL", "LEVIATHAN", "MONARCH", "COLOSSUS", "HERALD",
        "MAW", "OVERLORD", "JUGGERNAUT", "BASILISK", "WARLORD", "EXECUTIONER", "DEVOURER", "SERAPH", "GOLIATH", "PHALANX",
    ]
    static let classes = ["SKIRMISHER", "GUNSHIP", "BASTION", "RAVAGER", "ARBITER", "CARRIER", "STALKER", "SIEGEBREAKER"]
    /// Hot hues only: the player owns cyan.
    static let hues = [0.0, 0.03, 0.08, 0.12, 0.83, 0.9, 0.95, 0.76]

    public static func design(wave: Int, seed: Int) -> BossDesign {
        var rng = RNG(seed: mixSeed(seed, wave, 0xB055))
        let heavy = wave % 5 == 0
        let p = pressure(wave: wave)
        let hue = rng.pick(hues)
        var accent = hue + rng.range(0.06, 0.12) * rng.sign()
        if accent < 0 { accent += 1 }
        if accent >= 1 { accent -= 1 }
        let sides = rng.int(in: 3...8)
        let name = rng.pick(adjectives) + " " + rng.pick(nouns)
        let rankName = heavy ? "DREADNOUGHT" : rng.pick(classes)

        var phases: [Phase] = []
        var used: Set<Attack.Kind> = []
        for ph in 0..<3 {
            var pool: [Attack.Kind]
            switch ph {
            case 0: pool = wave == 1 ? [.ring, .fan, .flower, .fountain] : [.ring, .spiral, .fan, .stream, .flower, .fountain, .snake]
            case 1: pool = [.ring, .spiral, .fan, .stream, .flower, .fountain, .snake, .gate, .mines, .laser, .sweep]
            default: pool = Attack.Kind.allCases.filter { $0 != .rain }
            }
            if wave == 1 && ph == 1 { pool = [.ring, .spiral, .fan, .stream, .flower, .fountain, .gate] }
            // Fresh attacks each phase where possible.
            let fresh = pool.filter { !used.contains($0) }
            if fresh.count >= 3 { pool = fresh }
            rng.shuffle(&pool)
            var kinds = Array(pool.prefix(ph == 0 ? 2 : 3))
            // Something in every phase makes you move.
            let aimed: Set<Attack.Kind> = [.fan, .stream, .snake, .laser, .mines, .sweep]
            if !kinds.contains(where: aimed.contains) { kinds[kinds.count - 1] = wave == 1 ? .fan : rng.pick([.fan, .stream, .snake]) }
            kinds.forEach { used.insert($0) }
            let attacks = kinds.map { attack($0, phase: ph, pressure: p, wave: wave, rng: &rng) }
            var ambient: Attack?
            if ph == 2 || (heavy && ph == 1) {
                ambient = self.ambient(phase: ph, pressure: p, rng: &rng)
            }
            phases.append(Phase(attacks: attacks, ambient: ambient, agility: 1 + 0.3 * Double(ph) + 0.3 * p))
        }

        return BossDesign(
            name: name,
            rank: rankName,
            hue: hue,
            accentHue: accent,
            sides: sides,
            spikes: rng.chance(0.55) ? sides : 0,
            rings: rng.int(in: 1...2),
            turrets: sides <= 6 ? sides : 4,
            radius: heavy ? 31 : rng.range(22, 27),
            heavy: heavy,
            phases: phases
        )
    }

    static func attack(_ kind: Attack.Kind, phase ph: Int, pressure p: Double, wave: Int, rng: inout RNG) -> Attack {
        let fp = Double(ph)
        let dens = (1 + 0.8 * p) * (1 + 0.15 * fp) * (wave == 1 ? 0.85 : 1)
        let spd = (1 + 0.4 * p) * (1 + 0.07 * fp)
        let pace = (1 - 0.3 * p) * (1 - 0.06 * fp)
        switch kind {
        case .ring:
            let variant = rng.int(3)
            let n = Int(10 * dens) + rng.int(3)
            return Attack(kind: kind, duration: 4.2, interval: 1.0 * pace, count: variant == 1 ? max(6, n * 7 / 10) : n,
                          speed: 72 * spd * (variant == 1 ? 0.75 : 1), spinRate: .pi / Double(n), variant: variant)
        case .spiral:
            let arms = 3 + (dens > 1.4 ? 1 : 0) + (ph == 2 ? 1 : 0)
            return Attack(kind: kind, duration: 4.5, interval: 0.13 * pace, count: arms, speed: 68 * spd,
                          spinRate: rng.sign() * rng.range(1.5, 2.2), variant: ph >= 1 && rng.chance(0.5) ? 1 : 0)
        case .fan:
            var n = 5 + Int(3 * p) + ph
            if n % 2 == 0 { n += 1 }
            return Attack(kind: kind, duration: 4, interval: 0.85 * pace, count: n, speed: 100 * spd,
                          spread: 0.55 + 0.25 * p, variant: rng.int(3))
        case .stream:
            return Attack(kind: kind, duration: 4, interval: 0.75 * pace, count: 6 + Int(4 * p) + ph, speed: 150 * spd,
                          variant: ph >= 1 && rng.chance(0.5) ? 1 : 0)
        case .fountain:
            return Attack(kind: kind, duration: 4.5, interval: 0.075 * pace / (dens > 1.5 ? 1.5 : 1), count: 1,
                          speed: 105 * spd, spread: 1.05, spinRate: 75 * spd)
        case .laser:
            let variant = rng.int(2)
            return Attack(kind: kind, duration: variant == 0 ? 3.4 : 4.5, interval: 1.0 * pace, count: 2 + (ph == 2 ? 1 : 0),
                          speed: 0, spinRate: 0.55 * spd * rng.sign(), variant: variant)
        case .mines:
            return Attack(kind: kind, duration: 4.5, interval: 1.35 * pace, count: 9 + Int(5 * p) + ph, speed: 75 * spd)
        case .gate:
            return Attack(kind: kind, duration: 5, interval: 1.3 * pace, count: 0, speed: 58 * spd,
                          spread: 44 - 8 * p, variant: rng.int(2))
        case .flower:
            return Attack(kind: kind, duration: 4.2, interval: 0.75 * pace, count: 9 + Int(5 * p) + ph, speed: 66 * spd,
                          spinRate: 0.85)
        case .rain:
            return Attack(kind: kind, duration: 4, interval: 0.13 * pace, count: 1, speed: 85 * spd)
        case .snake:
            return Attack(kind: kind, duration: 4.2, interval: 0.7 * pace, count: 5, speed: 88 * spd, spinRate: 2.4,
                          variant: rng.int(2))
        case .sweep:
            return Attack(kind: kind, duration: 3.8, interval: 0.055 * pace, count: 1, speed: 112 * spd, spread: 1.0,
                          spinRate: 2.2)
        }
    }

    static func ambient(phase ph: Int, pressure p: Double, rng: inout RNG) -> Attack {
        let spd = 1 + 0.3 * p
        switch rng.int(3) {
        case 0: return Attack(kind: .rain, duration: 1e9, interval: 0.42 * (1 - 0.3 * p), count: 1, speed: 70 * spd)
        case 1: return Attack(kind: .spiral, duration: 1e9, interval: 0.3 * (1 - 0.25 * p), count: 2, speed: 52 * spd,
                              spinRate: rng.sign() * 1.1)
        default: return Attack(kind: .ring, duration: 1e9, interval: 1.9 * (1 - 0.3 * p), count: 8 + Int(4 * p),
                               speed: 48 * spd, spinRate: .pi / 8, variant: 0)
        }
    }
}
