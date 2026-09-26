import Foundation

public enum Outcome: String, Codable, Sendable {
    case victory, defeat
}

public struct FightStats: Codable, Equatable, Sendable {
    public var kills = 0
    /// Cuts that landed on a foe.
    public var cuts = 0
    public var whiffs = 0
    public var deflects = 0
    /// Foes felled by their own side's arrows.
    public var arrowKills = 0
    /// Blows and arrows taken, and the hit points they cost.
    public var wounds = 0
    public var damage = 0
    public var bestCombo = 0

    public init() {}
}

public enum FightEvent: Equatable, Sendable {
    case arrived(foe: Int)
    /// The boss steps onto the lane.
    case warlord(foe: Int)
    case cut(Side, foe: Int, killed: Bool)
    /// A cut at nothing: the ronin stumbles.
    case whiff(Side)
    case deflected(Side, arrow: Int)
    case loosed(archer: Int, arrow: Int)
    /// A deflected arrow found a foe.
    case pierced(foe: Int, arrow: Int, killed: Bool)
    /// A foe raised his weapon (or drew his bow).
    case raised(foe: Int)
    /// The ronin took a blow (from a foe) or an arrow (`foe` nil).
    case wounded(foe: Int?, damage: Int)
    case leapt(foe: Int)
    case landed(foe: Int)
    case bloodlust(Bool)
    /// Every 25th link of a combo.
    case milestone(Int)
    case ended(Outcome)
}

/// One stage: a lane, the ronin in the middle, and the stage's roster coming at him from both sides.
///
/// Cut left or right. A cut hits the nearest foe (or incoming arrow) on that side whose near edge is within reach;
/// with nothing in reach it is a whiff, and the ronin stumbles and can't cut for a moment. Every kill and deflection
/// adds to the combo, which multiplies the score and at 20 brings on bloodlust (longer reach). Any wound or whiff
/// breaks it. Clear the roster to win; lose five hit points and you fall.
public struct Fight: Codable, Equatable, Sendable {
    public enum Target: Codable, Equatable, Sendable {
        case foe(Int)
        case arrow(Int)
    }

    public var stage: Int
    public var seed: UInt64
    public var difficulty: Difficulty
    public var roster: [Kind]
    public var rng: SeededRNG
    public var time = 0.0
    public var hp = Tuning.heroHP
    public var maxHP = Tuning.heroHP
    public var foes: [Foe] = []
    public var arrows: [Arrow] = []
    /// How much of the roster has stepped onto the lane, and how much of it is down.
    public var arrived = 0
    public var defeated = 0
    public var nextID = 1
    public var spawnTimer = Tuning.firstSpawn
    /// Seconds until the ronin can cut again after a cut that landed.
    public var cooldown = 0.0
    /// A cut pressed during the cooldown, made the moment it ends.
    public var held: Side?
    /// Seconds left off balance after a whiff.
    public var stumble = 0.0
    public var facing = Side.right
    public var combo = 0
    public var score = 0
    /// The stage-clear bonus, once won (already in `score`).
    public var bonus = 0
    public var stats = FightStats()
    public var outcome: Outcome?
    public var bossID: Int?
    /// Plays the fight when set (the self-test and the balance runs).
    public var pilot: Pilot?
    var accumulator = 0.0

    public init(stage: Int, seed: UInt64) {
        let difficulty = Difficulty(stage: stage)
        var rng = SeededRNG(seed: seed)
        let roster = difficulty.roster(rng: &rng)
        self.init(stage: stage, seed: seed, roster: roster, rng: rng)
    }

    /// A fight with a given roster (tests use it to stage a situation).
    public init(stage: Int, seed: UInt64, roster: [Kind]) {
        self.init(stage: stage, seed: seed, roster: roster, rng: SeededRNG(seed: seed ^ 0x5EED))
    }

    private init(stage: Int, seed: UInt64, roster: [Kind], rng: SeededRNG) {
        self.stage = max(1, stage)
        self.seed = seed
        difficulty = Difficulty(stage: stage)
        self.roster = roster
        self.rng = rng
    }

    // MARK: Reading the fight

    public var autopilot: Bool {
        get { pilot != nil }
        set { pilot = newValue ? (pilot ?? .perfect) : nil }
    }

    public var inBloodlust: Bool { combo >= Tuning.bloodlust }
    public var reach: Double { inBloodlust ? Tuning.bloodlustReach : Tuning.reach }
    /// The combo's score multiplier: ×1, then one more for every ten links, at most ×8.
    public var multiplier: Int { min(8, 1 + combo / 10) }
    public var remaining: Int { roster.count - defeated }
    public var progress: Double { roster.isEmpty ? 1 : Double(defeated) / Double(roster.count) }
    public var isStumbling: Bool { stumble > 0 }
    public var boss: Foe? { bossID.flatMap { foe($0) } }
    public var setting: Setting { Setting.of(stage: stage) }

    public func foe(_ id: Int) -> Foe? { foes.first { $0.id == id } }

    /// What a cut to `side` would hit now: the nearest foe or incoming arrow within reach.
    public func target(_ side: Side) -> Target? {
        let reach = self.reach
        var best: (target: Target, distance: Double)?
        for foe in foes where foe.targetable && Side.of(foe.x) == side && foe.gap <= reach {
            if foe.gap < best?.distance ?? .infinity { best = (.foe(foe.id), foe.gap) }
        }
        for arrow in arrows where !arrow.deflected && arrow.side == side && abs(arrow.x) <= reach {
            if abs(arrow.x) < best?.distance ?? .infinity { best = (.arrow(arrow.id), abs(arrow.x)) }
        }
        return best?.target
    }

    // MARK: Playing

    /// Runs the fight forward in fixed steps; whatever is left over carries to the next call.
    public mutating func step(_ dt: Double) -> [FightEvent] {
        var events: [FightEvent] = []
        guard outcome == nil else { return events }
        accumulator += max(0, dt)
        while accumulator >= Tuning.step, outcome == nil {
            accumulator -= Tuning.step
            tick(&events)
        }
        return events
    }

    /// A cut to one side.
    @discardableResult
    public mutating func strike(_ side: Side) -> [FightEvent] {
        var events: [FightEvent] = []
        strike(side, into: &events)
        foes.removeAll { $0.phase == .dying }
        settle(&events)
        return events
    }

    mutating func strike(_ side: Side, into events: inout [FightEvent]) {
        guard outcome == nil, stumble <= 0 else { return }
        if cooldown > 0 {
            held = side
            return
        }
        facing = side
        switch target(side) {
        case .arrow(let id)?:
            guard let i = arrows.firstIndex(where: { $0.id == id }) else { return }
            arrows[i].deflected = true
            arrows[i].velocity = side.sign * Tuning.deflectSpeed
            cooldown = Tuning.cooldown
            stats.deflects += 1
            score += 50 * multiplier
            events.append(.deflected(side, arrow: id))
            raiseCombo(&events)
        case .foe(let id)?:
            guard let i = foes.firstIndex(where: { $0.id == id }) else { return }
            cooldown = Tuning.cooldown
            stats.cuts += 1
            var after: [FightEvent] = []
            let killed = wound(i, byArrow: false, &after)
            events.append(.cut(side, foe: id, killed: killed))
            events += after
        case nil:
            stumble = Tuning.stumble
            stats.whiffs += 1
            breakCombo(&events)
            events.append(.whiff(side))
        }
    }

    /// Puts a foe on the lane (tests and the self-test use it to stage a situation). Returns its id.
    @discardableResult
    public mutating func place(_ kind: Kind, at x: Double, hp: Int? = nil) -> Int {
        let foe = Foe(id: nextID, kind: kind, x: x, hp: hp ?? kind.baseHP, speed: kind.speed * difficulty.pace,
                      windup: kind.windup * difficulty.windup)
        nextID += 1
        foes.append(foe)
        if kind == .warlord { bossID = foe.id }
        return foe.id
    }

    // MARK: The step

    mutating func tick(_ events: inout [FightEvent]) {
        let h = Tuning.step
        time += h
        if var pilot {
            self.pilot = nil
            pilot.act(on: &self, events: &events)
            self.pilot = pilot
        }
        if stumble > 0 { stumble = max(0, stumble - h) }
        if cooldown > 0 {
            cooldown = max(0, cooldown - h)
            if cooldown == 0, let side = held {
                held = nil
                strike(side, into: &events)
            }
        }
        arrive(&events)
        march(&events)
        fly(&events)
        foes.removeAll { $0.phase == .dying }
        settle(&events)
    }

    private mutating func settle(_ events: inout [FightEvent]) {
        guard outcome == nil else { return }
        if hp <= 0 {
            hp = 0
            outcome = .defeat
            events.append(.ended(.defeat))
        } else if defeated >= roster.count {
            outcome = .victory
            bonus = 250 * stage + 150 * hp + (stats.damage == 0 ? 500 * stage : 0)
            score += bonus
            arrows.removeAll()
            events.append(.ended(.victory))
        }
    }

    /// Sends in the next of the roster when it is time and there is room.
    private mutating func arrive(_ events: inout [FightEvent]) {
        guard arrived < roster.count else { return }
        spawnTimer -= Tuning.step
        guard spawnTimer <= 0 else { return }
        let kind = roster[arrived]
        let standing = foes.filter { $0.alive }.count
        if kind == .warlord {
            // The warlord waits until he has the lane to himself.
            guard standing == 0 else { spawnTimer = 0.25; return }
        } else if standing >= difficulty.crowd {
            spawnTimer = 0.2
            return
        }
        func blocked(_ side: Side) -> Bool {
            foes.contains { foe in
                guard foe.alive, Side.of(foe.x) == side else { return false }
                if foe.phase != .leaping, foe.distance > Tuning.edge - 0.13 { return true }
                return kind == .archer && foe.kind == .archer
            }
        }
        var side: Side = rng.chance(0.5) ? .left : .right
        if blocked(side) { side = side.opposite }
        if blocked(side) {
            spawnTimer = 0.15
            return
        }
        let hp: Int
        switch kind {
        case .warlord: hp = difficulty.warlordHP
        case .dancer: hp = difficulty.dancerHP
        default: hp = kind.baseHP
        }
        let foe = Foe(id: nextID, kind: kind, x: side.sign * Tuning.edge, hp: hp,
                      speed: kind.speed * difficulty.pace * rng.range(0.92, 1.08), windup: kind.windup * difficulty.windup)
        nextID += 1
        foes.append(foe)
        arrived += 1
        if kind == .warlord {
            bossID = foe.id
            events.append(.warlord(foe: foe.id))
        } else {
            events.append(.arrived(foe: foe.id))
        }
        spawnTimer = difficulty.interval * rng.range(0.55, 1.45)
        if rng.chance(difficulty.pairs) { spawnTimer = min(spawnTimer, 0.2) }
    }

    /// Moves each side's queue in, winds up whoever reaches the ronin, and lands their blows.
    private mutating func march(_ events: inout [FightEvent]) {
        let h = Tuning.step
        for i in foes.indices where foes[i].phase == .leaping {
            foes[i].timer -= h
            let t = foes[i].progress
            foes[i].x = foes[i].leapFrom + (foes[i].leapTo - foes[i].leapFrom) * t
            if foes[i].timer <= 0 {
                foes[i].x = foes[i].leapTo
                foes[i].enter(.recoil, for: 0.12)
                events.append(.landed(foe: foes[i].id))
            }
        }
        for side in Side.allCases {
            let order = foes.indices
                .filter { foes[$0].targetable && Side.of(foes[$0].x) == side }
                .sorted { foes[$0].distance < foes[$1].distance }
            var front: Foe?
            for i in order {
                var f = foes[i]
                var stop = f.contact
                if let front { stop = max(stop, front.distance + (front.kind.width + f.kind.width) / 2 + 0.01) }
                if f.kind == .archer { stop = max(stop, Tuning.archerRange) }
                // Shoved closer than he may stand (a leaper landed in front, a knock-back): he backs off.
                if f.distance < stop - 0.002, f.phase != .windup {
                    f.x = side.sign * min(stop, f.distance + 0.6 * h)
                }
                switch f.phase {
                case .advancing:
                    if f.distance > stop { f.x = side.sign * max(stop, f.distance - f.speed * h) }
                    if f.distance <= stop + 0.0005 {
                        if f.kind == .archer {
                            if f.distance < 0.97 {
                                f.enter(.aiming, for: f.windup)
                                events.append(.raised(foe: f.id))
                            }
                        } else if f.distance <= f.contact + 0.0005 {
                            f.enter(.windup, for: f.windup)
                            events.append(.raised(foe: f.id))
                        }
                    }
                case .windup:
                    f.timer -= h
                    if f.timer <= 0 {
                        hurt(f.kind.damage, by: f.id, &events)
                        f.x = side.sign * (f.distance + 0.05)
                        f.enter(.recoil, for: 0.45)
                    }
                case .aiming:
                    f.timer -= h
                    if f.timer <= 0 {
                        let arrow = Arrow(id: nextID, from: f.id, x: side.sign * f.gap, velocity: -side.sign * Tuning.arrowSpeed)
                        nextID += 1
                        arrows.append(arrow)
                        events.append(.loosed(archer: f.id, arrow: arrow.id))
                        f.enter(.recoil, for: 1.2 * difficulty.windup + rng.range(0, 0.7))
                    }
                case .recoil:
                    f.timer -= h
                    if f.timer <= 0 {
                        f.phase = .advancing
                        f.timer = 0
                        f.span = 0
                    }
                case .leaping, .dying:
                    break
                }
                foes[i] = f
                front = f
            }
        }
    }

    /// Arrows in flight: incoming ones hurt the ronin; deflected ones hit the first foe on their way out.
    private mutating func fly(_ events: inout [FightEvent]) {
        var spent = Set<Int>()
        for i in arrows.indices {
            let old = arrows[i].x
            arrows[i].x += arrows[i].velocity * Tuning.step
            let arrow = arrows[i]
            if !arrow.deflected {
                if abs(arrow.x) <= Tuning.body || Side.of(arrow.x) != Side.of(old) {
                    spent.insert(arrow.id)
                    hurt(1, by: nil, &events)
                }
                continue
            }
            let near = abs(old), far = abs(arrow.x)
            var hit: Int?
            for j in foes.indices where foes[j].targetable && Side.of(foes[j].x) == arrow.side {
                let foe = foes[j]
                guard foe.gap <= far, foe.gap + foe.kind.width >= near else { continue }
                if hit == nil || foe.gap < foes[hit!].gap { hit = j }
            }
            if let j = hit {
                spent.insert(arrow.id)
                let id = foes[j].id
                var after: [FightEvent] = []
                let killed = wound(j, byArrow: true, &after)
                if killed { stats.arrowKills += 1 }
                events.append(.pierced(foe: id, arrow: arrow.id, killed: killed))
                events += after
            } else if far > Tuning.edge + 0.1 {
                spent.insert(arrow.id)
            }
        }
        if !spent.isEmpty { arrows.removeAll { spent.contains($0.id) } }
    }

    // MARK: Blows

    /// Takes a point off a foe. A foe who survives staggers back, or (a dancer, sometimes the warlord) leaps over the
    /// ronin to his other side. Returns whether the foe fell.
    private mutating func wound(_ i: Int, byArrow: Bool, _ events: inout [FightEvent]) -> Bool {
        foes[i].hp -= 1
        foes[i].hits += 1
        if foes[i].hp <= 0 {
            score += foes[i].kind.bounty * multiplier
            foes[i].enter(.dying, for: 0)
            defeated += 1
            stats.kills += 1
            raiseCombo(&events)
            return true
        }
        let leaps: Bool
        switch foes[i].kind {
        case .dancer: leaps = !byArrow
        case .warlord: leaps = !byArrow && rng.chance(0.45)
        default: leaps = false
        }
        if leaps {
            let from = foes[i].x
            foes[i].leapFrom = from
            foes[i].leapTo = Side.of(from).opposite.sign * max(Tuning.landing, foes[i].contact)
            foes[i].enter(.leaping, for: Tuning.leap)
            events.append(.leapt(foe: foes[i].id))
        } else {
            let sign = Side.of(foes[i].x).sign
            foes[i].x = sign * min(Tuning.edge, foes[i].distance + (foes[i].kind == .warlord ? 0.09 : 0.07))
            foes[i].enter(.recoil, for: 0.3)
        }
        return false
    }

    private mutating func hurt(_ damage: Int, by foe: Int?, _ events: inout [FightEvent]) {
        guard outcome == nil else { return }
        hp -= damage
        stats.wounds += 1
        stats.damage += damage
        breakCombo(&events)
        events.append(.wounded(foe: foe, damage: damage))
    }

    private mutating func raiseCombo(_ events: inout [FightEvent]) {
        combo += 1
        stats.bestCombo = max(stats.bestCombo, combo)
        if combo == Tuning.bloodlust { events.append(.bloodlust(true)) }
        if combo % 25 == 0 { events.append(.milestone(combo)) }
    }

    private mutating func breakCombo(_ events: inout [FightEvent]) {
        if combo >= Tuning.bloodlust { events.append(.bloodlust(false)) }
        combo = 0
    }
}
