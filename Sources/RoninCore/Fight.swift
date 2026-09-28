#if os(WASI)
import FoundationEssentials
import WASILibc
#else
import Foundation
#endif

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
    /// Cuts the warlord turned aside with his guard set, and cuts that glanced off it while it was still coming up.
    public var parried = 0
    public var glanced = 0
    /// Brutes' blows turned aside by a cut into the glare on the club.
    public var turned = 0

    public init() {}
}

extension FightStats {
    /// Reads a saved fight's stats, filling in counts that saves from before them lack.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kills = try c.decode(Int.self, forKey: .kills)
        cuts = try c.decode(Int.self, forKey: .cuts)
        whiffs = try c.decode(Int.self, forKey: .whiffs)
        deflects = try c.decode(Int.self, forKey: .deflects)
        arrowKills = try c.decode(Int.self, forKey: .arrowKills)
        wounds = try c.decode(Int.self, forKey: .wounds)
        damage = try c.decode(Int.self, forKey: .damage)
        bestCombo = try c.decode(Int.self, forKey: .bestCombo)
        parried = try c.decode(Int.self, forKey: .parried)
        glanced = try c.decodeIfPresent(Int.self, forKey: .glanced) ?? 0
        turned = try c.decodeIfPresent(Int.self, forKey: .turned) ?? 0
    }
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
    /// The gourd-bearer fell, and his gourd is flung into the air (`Fight.gourd`): catch it as it comes down.
    case flung(foe: Int)
    /// The gourd flung from the bearer `foe` was caught: a heart back (`restored`), or `Fight.gourdBonus` points if
    /// none was missing.
    case healed(foe: Int, restored: Bool)
    /// The gourd flung from the bearer `foe` came down uncaught and shattered.
    case shattered(foe: Int)
    /// The gourd-bearer got away with the gourd.
    case fled(foe: Int)
    /// Sen-no-sen: `foe` cut down in the last moment of his wind-up, for a shard. `count` is how many are held now; at
    /// `Tuning.shardsPerHeart` they have made a heart (`mended` follows, and none are held any more).
    case shard(foe: Int, count: Int)
    /// Shards made a heart: a heart back (`restored`), or `Fight.gourdBonus` points if none was missing.
    case mended(restored: Bool)
    /// A wound scattered the shards held (how many).
    case scattered(Int)
    /// The warlord began to raise his guard. It is set `Tuning.guardRise` later (`Foe.guardSet`).
    case guarded(foe: Int)
    /// A cut met the warlord's guard. Set, it turned the cut aside: the ronin is thrown off balance (`isStumbling`),
    /// the combo is gone, and the warlord answers. Still coming up, it glanced the cut off: the ronin is not off
    /// balance, and nothing is lost either side.
    case parried(Side, foe: Int)
    /// The warlord called men in from both ends of the lane.
    case summoned(foe: Int, allies: [Int])
    /// A cut met the brute's club as it glared, at the end of his wind-up (with no knock-back, `Crowding`): his blow is
    /// turned aside and he is thrown off balance for `Tuning.bruteStagger`, where he stands. The cut does not wound
    /// him (steel met steel), but it counts to the combo.
    case turned(Side, foe: Int)
    case ended(Outcome)
}

/// How the men on one side of the lane get past each other, and how a cut moves the brute. The game plays
/// `standard`; the Development menu (and `ronin-sim --crowd`) can turn each rule off or on, to try the game without it.
/// With no passing rule on, each side is a queue: every man waits behind the one in front, and only the man in front
/// strikes.
///
/// Two things hold whatever the rules: nobody walks through the warlord, and nobody cuts in front of the gourd-bearer
/// on his dart (the way in he waited for stays his, so a cut toward him meets him).
public struct Crowding: Codable, Equatable, Sendable {
    /// Every man walks through every other to his own striking distance, and strikes from there.
    public var passThrough = false
    /// The small, quick men (the runner, the blade dancer, the gourd-bearer) slip past a brute or an archer in front.
    public var slipPast = false
    /// Runners pass everyone (spearmen, brutes, archers, dancers, other runners), all but the warlord.
    public var runnersPassAll = false
    /// Anyone may pass a man who is winding up a blow or recovering from one.
    public var passBusy = false
    /// The brute strides through lighter men (anyone but another brute, an archer or the warlord), shoving aside
    /// those he walks into (not a man already bringing his blow down).
    public var shove = false
    /// A cut neither knocks the brute back nor breaks a blow he is winding up: he takes it and keeps coming. His blow
    /// can be turned aside instead: a cut that does not fell him, made as his club glares at the end of his wind-up
    /// (`Tuning.parryWindow`), meets the club and throws him off balance.
    public var noBruteKnockback = false

    public init(passThrough: Bool = false, slipPast: Bool = false, runnersPassAll: Bool = false, passBusy: Bool = false,
                shove: Bool = false, noBruteKnockback: Bool = false) {
        self.passThrough = passThrough
        self.slipPast = slipPast
        self.runnersPassAll = runnersPassAll
        self.passBusy = passBusy
        self.shove = shove
        self.noBruteKnockback = noBruteKnockback
    }

    /// The game as it plays: the quick slip past the heavy, runners pass everyone, anyone passes a man busy with a
    /// blow, the brute shoves through, and a cut does not knock him back (his blow is turned aside at the glare).
    public static let standard = Crowding(slipPast: true, runnersPassAll: true, passBusy: true, shove: true, noBruteKnockback: true)
    /// Every side a queue, and a cut knocks the brute back and breaks his blow: the game before these rules.
    public static let queue = Crowding()
    public var isStandard: Bool { self == .standard }
    /// Whether any rule lets a man get past another (with none, each side is a queue).
    public var passes: Bool { passThrough || slipPast || runnersPassAll || passBusy || shove }

    /// Whether `man`, nearer the ronin on his side, stands in the way of `follower`.
    public func blocks(_ man: Foe, _ follower: Foe) -> Bool {
        // Nobody cuts in front of the gourd-bearer on his dart, and nobody walks through the warlord.
        if man.bearer, man.darting { return true }
        if man.kind == .warlord { return true }
        if passThrough { return false }
        if runnersPassAll, follower.kind == .runner { return false }
        if passBusy, man.phase == .windup || man.phase == .recoil { return false }
        if slipPast, follower.kind == .runner || follower.kind == .dancer || follower.bearer, man.kind == .brute || man.kind == .archer {
            return false
        }
        if shove, follower.kind == .brute, shoves(man) { return false }
        return true
    }

    /// Whether the brute, shoving through, pushes `man` aside.
    func shoves(_ man: Foe) -> Bool { man.kind != .brute && man.kind != .archer && man.kind != .warlord }
}

extension Crowding {
    /// Reads saved rules, a rule the save lacks (it is older) taking the default of the rules it was saved under
    /// (none on).
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        passThrough = try c.decodeIfPresent(Bool.self, forKey: .passThrough) ?? false
        slipPast = try c.decodeIfPresent(Bool.self, forKey: .slipPast) ?? false
        runnersPassAll = try c.decodeIfPresent(Bool.self, forKey: .runnersPassAll) ?? false
        passBusy = try c.decodeIfPresent(Bool.self, forKey: .passBusy) ?? false
        shove = try c.decodeIfPresent(Bool.self, forKey: .shove) ?? false
        noBruteKnockback = try c.decodeIfPresent(Bool.self, forKey: .noBruteKnockback) ?? false
    }
}

/// One stage: a lane, the ronin in the middle, and the stage's roster coming at him from both sides.
///
/// Cut left or right. A cut hits the nearest foe (or incoming arrow) on that side whose near edge is within reach, or
/// the falling gourd if it is low enough to catch there; with nothing in reach it is a whiff, and the ronin stumbles
/// and can't cut for a moment. Every kill, deflection and turned blow adds to the combo, which multiplies the score and
/// at 20 brings on bloodlust (longer reach). Any wound, whiff or parried cut breaks it. Clear the roster to win; lose
/// all your hearts (the mode's `hearts`) and you fall.
///
/// Hearts come back two ways, both earned. The stage's gourd: its bearer has to be caught on two of his darts, and the
/// gourd he flings as he falls caught as it comes down; played right, every step of it can be counted on. And shards:
/// a man cut down in the last moment of his wind-up (sen-no-sen, `Tuning.senNoSen`) gives a shard, and three make a
/// heart, but a wound scatters them. The crowd on the lane follows `crowding` (`Crowding.standard` in play).
public struct Fight: Codable, Equatable, Sendable {
    public enum Target: Codable, Equatable, Sendable {
        case foe(Int)
        case arrow(Int)
        /// The flung gourd, low enough to catch.
        case gourd
    }

    public var stage: Int
    public var seed: UInt64
    public var mode: Mode
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
    /// A cut pressed during the cooldown, made the moment it ends at whatever is in reach then. If that is nothing on
    /// the side just cut, or a guard there, it is let go.
    public var held: Side?
    /// Seconds left off balance after a whiff or a parried cut.
    public var stumble = 0.0
    public var facing = Side.right
    public var combo = 0
    public var score = 0
    /// The stage-clear bonus, once won (already in `score`).
    public var bonus = 0
    public var stats = FightStats()
    public var outcome: Outcome?
    public var bossID: Int?
    /// Which of the roster carries the gourd, and whether its chance is spent: its bearer cut down (the gourd flung,
    /// to be caught or to shatter) or gone off with it. It does not mean a heart came back (`FightEvent.healed` says
    /// that).
    public var bearerIndex: Int?
    public var healed = false
    /// The gourd in the air, flung from its fallen bearer, until it is caught or shatters. The stage is not won while
    /// it is up.
    public var gourd: Gourd?
    /// Shards of a heart held (fewer than `Tuning.shardsPerHeart`): carried from stage to stage with the hearts, and
    /// scattered by a wound.
    public var shards = 0
    /// Plays the fight when set (the self-test and the balance runs).
    public var pilot: Pilot?
    /// Development rules for the crowd on the lane (`Crowding.standard` in play).
    public var crowding = Crowding.standard
    var accumulator = 0.0

    /// A stage, entered with `hearts` (full when nil: hearts carry from stage to stage) and `shards` of a heart.
    public init(stage: Int, seed: UInt64, mode: Mode = .bushido, hearts: Int? = nil, shards: Int = 0) {
        let difficulty = Difficulty(stage: stage, mode: mode)
        var rng = SeededRNG(seed: seed)
        let roster = difficulty.roster(rng: &rng)
        let bearer = difficulty.bearer(in: roster, rng: &rng)
        self.init(stage: stage, seed: seed, mode: mode, roster: roster, rng: rng)
        bearerIndex = bearer
        if let hearts { hp = max(1, min(maxHP, hearts)) }
        self.shards = max(0, min(Tuning.shardsPerHeart - 1, shards))
    }

    /// A fight with a given roster (tests use it to stage a situation).
    public init(stage: Int, seed: UInt64, mode: Mode = .bushido, roster: [Kind]) {
        self.init(stage: stage, seed: seed, mode: mode, roster: roster, rng: SeededRNG(seed: seed ^ 0x5EED))
    }

    private init(stage: Int, seed: UInt64, mode: Mode, roster: [Kind], rng: SeededRNG) {
        self.stage = max(1, stage)
        self.seed = seed
        self.mode = mode
        difficulty = Difficulty(stage: stage, mode: mode)
        self.roster = roster
        self.rng = rng
        hp = mode.hearts
        maxHP = mode.hearts
    }

    // MARK: Reading the fight

    public var autopilot: Bool {
        get { pilot != nil }
        set { pilot = newValue ? (pilot ?? .perfect) : nil }
    }

    public var inBloodlust: Bool { combo >= Tuning.bloodlust }
    public var reach: Double { (inBloodlust ? Tuning.bloodlustReach : Tuning.reach) * mode.reach }
    /// The combo's score multiplier: ×1, then one more for every ten links, at most ×8.
    public var multiplier: Int { min(8, 1 + combo / 10) }
    public var remaining: Int { roster.count - defeated }
    public var progress: Double { roster.isEmpty ? 1 : Double(defeated) / Double(roster.count) }
    public var isStumbling: Bool { stumble > 0 }
    public var boss: Foe? { bossID.flatMap { foe($0) } }
    public var setting: Setting { Setting.of(stage: stage) }
    /// What catching the gourd, or making a heart of shards, scores when no heart is missing.
    public var gourdBonus: Int { points(Tuning.gourdPoints) }

    public func foe(_ id: Int) -> Foe? { foes.first { $0.id == id } }

    /// Whether a cut at `foe` now would turn his blow aside rather than wound him: a brute with no knock-back
    /// (`Crowding.noBruteKnockback`) whose club glares (`Foe.clubGlares`), with more than one cut left in him. A cut
    /// that can fell him fells him instead (in the last `Tuning.senNoSen`, for a shard).
    public func turns(_ foe: Foe) -> Bool { crowding.noBruteKnockback && foe.clubGlares && foe.hp > 1 }

    /// What a cut to `side` would hit now: the falling gourd if it is low enough to catch there (it is caught whoever
    /// stands on that side), or else the nearest foe or incoming arrow within reach.
    public func target(_ side: Side) -> Target? {
        let reach = self.reach
        if let gourd, gourd.catchable, gourd.side == side, abs(gourd.x) <= reach { return .gourd }
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
            score += points(50 * multiplier)
            events.append(.deflected(side, arrow: id))
            raiseCombo(&events)
        case .gourd?:
            // Caught as it comes down: drunk for a heart, or worth points with none missing.
            guard let caught = gourd else { return }
            gourd = nil
            cooldown = Tuning.cooldown
            let restored = hp < maxHP
            if restored { hp += 1 } else { score += gourdBonus }
            events.append(.healed(foe: caught.from, restored: restored))
        case .foe(let id)? where foes.first(where: { $0.id == id })?.phase == .guarding:
            guard let i = foes.firstIndex(where: { $0.id == id }) else { return }
            guard foes[i].guardSet else {
                // The guard is still coming up, and the cut was on its way before it could be seen: it glances off.
                // Nothing is lost either side, and the guard goes on up.
                cooldown = Tuning.cooldown
                stats.glanced += 1
                events.append(.parried(side, foe: id))
                return
            }
            // Turned aside: the ronin is thrown off balance and the warlord answers, a single blow (never the first
            // of a pair), stepping in to land it.
            stumble = Tuning.parried * mode.stumble
            stats.parried += 1
            breakCombo(&events)
            events.append(.parried(side, foe: id))
            let riposte = foes[i].distance <= foes[i].contact + 0.06
            foes[i].enter(riposte ? .windup : .advancing, for: riposte ? foes[i].windup * 0.45 : 0)
            foes[i].chained = riposte
            foes[i].guardRest = rng.range(0.9, 1.6)
            if riposte { events.append(.raised(foe: id)) }
        case .foe(let id)? where foe(id).map(turns) == true:
            // The brute's club met as it glares: his blow is turned aside, and he is thrown off balance where he
            // stands. Steel meets steel, so he is not wounded.
            guard let i = foes.firstIndex(where: { $0.id == id }) else { return }
            cooldown = Tuning.cooldown
            stats.turned += 1
            foes[i].enter(.recoil, for: Tuning.bruteStagger)
            foes[i].chained = false
            score += points(50 * multiplier)
            events.append(.turned(side, foe: id))
            raiseCombo(&events)
        case .foe(let id)?:
            guard let i = foes.firstIndex(where: { $0.id == id }) else { return }
            cooldown = Tuning.cooldown
            stats.cuts += 1
            let late = foes[i].senNoSen
            var after: [FightEvent] = []
            let killed = wound(i, byArrow: false, &after)
            events.append(.cut(side, foe: id, killed: killed))
            events += after
            if killed, late { earnShard(from: id, &events) }
        case nil:
            stumble = Tuning.stumble * mode.stumble
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
                if heldCutLands(side) { strike(side, into: &events) }
            }
        }
        arrive(&events)
        march(&events)
        fly(&events)
        toss(&events)
        foes.removeAll { $0.phase == .dying }
        settle(&events)
    }

    /// Whether a press held through the cooldown is made. One on the side just cut is a second cut at the man just
    /// struck, pressed before the first could be seen to land: if he is no longer there to cut (knocked back, in the
    /// air, felled) or has his guard coming up, it is let go rather than whiffed or thrown against the guard. A press
    /// to the other side is made whatever it finds, so pressing both ways at once still whiffs.
    private func heldCutLands(_ side: Side) -> Bool {
        guard side == facing else { return true }
        switch target(side) {
        case .foe(let id)?: return foe(id)?.phase != .guarding
        case .arrow?, .gourd?: return true
        case nil: return false
        }
    }

    private mutating func settle(_ events: inout [FightEvent]) {
        guard outcome == nil else { return }
        if hp <= 0 {
            hp = 0
            outcome = .defeat
            events.append(.ended(.defeat))
        } else if defeated >= roster.count, gourd == nil {
            // (A gourd still in the air is caught or shatters first.)
            outcome = .victory
            bonus = points(250 * stage + 150 * hp + (stats.damage == 0 ? 500 * stage : 0))
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
        var foe = Foe(id: nextID, kind: kind, x: side.sign * Tuning.edge, hp: hp,
                      speed: kind.speed * difficulty.pace * rng.range(0.92, 1.08), windup: kind.windup * difficulty.windup)
        if arrived == bearerIndex {
            foe.bearer = true
            foe.hp = max(foe.hp, 2)
            foe.maxHP = foe.hp
            foe.hover = Tuning.bearerWait
        }
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
                events.append(.landed(foe: foes[i].id))
                let lander = foes[i]
                let ahead = foes.contains {
                    $0.id != lander.id && $0.targetable && Side.of($0.x) == Side.of(lander.x) && $0.distance < lander.distance
                }
                if lander.kind == .warlord, !ahead, rng.chance(0.5) {
                    // Half the time the warlord comes down cutting, if nobody stands between: his blade is up as he
                    // lands, and he steps in to bring it down.
                    foes[i].enter(.windup, for: max(Tuning.quickBlow, foes[i].windup * 0.8))
                    events.append(.raised(foe: foes[i].id))
                } else {
                    foes[i].enter(.recoil, for: 0.12)
                }
            }
        }
        for side in Side.allCases {
            let order = foes.indices
                .filter { foes[$0].targetable && Side.of(foes[$0].x) == side }
                .sorted { foes[$0].distance < foes[$1].distance }
            // The men already moved this step, nearest the ronin first; the man in `f`'s way is the nearest of them
            // to him that blocks him (in a queue, simply the man in front).
            var ahead: [Foe] = []
            for i in order {
                var f = foes[i]
                let front = ahead.last { crowding.blocks($0, f) }
                if f.bearer, f.kind != .warlord {
                    // The gourd-bearer keeps his own distance and nobody queues behind him, but he never walks
                    // through the man in front.
                    bear(&f, side: side, front: front, &events)
                    foes[i] = f
                    ahead.append(f)
                    continue
                }
                var stop = f.contact
                if let front { stop = max(stop, front.distance + (front.kind.width + f.kind.width) / 2 + 0.01) }
                if f.kind == .archer { stop = max(stop, Tuning.archerRange) }
                // Shoved closer than he may stand (a leaper landed in front, a knock-back): he backs off.
                if f.distance < stop - 0.002, f.phase != .windup {
                    f.x = side.sign * min(stop, f.distance + 0.6 * h)
                }
                let boss = f.kind == .warlord
                // A wounded warlord comes faster and strikes sooner.
                let fury = boss ? 1 - Double(f.hp) / Double(max(1, f.maxHP)) : 0
                if boss, f.guardRest > 0 { f.guardRest -= h }
                switch f.phase {
                case .advancing:
                    let pace = f.speed * (1 + 0.5 * fury)
                    if f.distance > stop { f.x = side.sign * max(stop, f.distance - pace * h) }
                    // Close to the ronin, the warlord raises his guard and walks in behind it.
                    if boss, f.guardRest <= 0, f.gap < reach + 0.12, rng.chance(2.0 * h) {
                        f.enter(.guarding, for: Tuning.guardRise + rng.range(0.6, 1.05))
                        events.append(.guarded(foe: f.id))
                        break
                    }
                    if f.distance <= stop + 0.0005 {
                        if f.kind == .archer {
                            if f.distance < 0.97 {
                                f.enter(.aiming, for: f.windup)
                                events.append(.raised(foe: f.id))
                            }
                        } else if f.distance <= f.contact + 0.0005, front == nil, !landing(on: side, before: f) {
                            // Only the man in front strikes; the rest wait their turn, and nobody raises his weapon
                            // with a comrade about to come down in front of him.
                            let quick = f.windup * (1 - 0.45 * fury)
                            f.enter(.windup, for: boss ? max(Tuning.quickBlow, quick) : quick)
                            events.append(.raised(foe: f.id))
                        }
                    }
                case .guarding:
                    f.timer -= h
                    if f.distance > stop { f.x = side.sign * max(stop, f.distance - f.speed * 0.35 * h) }
                    if f.timer <= 0 {
                        f.phase = .advancing
                        f.span = 0
                        f.guardRest = rng.range(0.8, 1.6) * (1 - 0.4 * fury)
                        // Brought in close behind it, he strikes the moment it drops.
                        if f.distance <= f.contact + 0.01, front == nil {
                            f.enter(.windup, for: max(Tuning.quickBlow, f.windup * 0.75 * (1 - 0.45 * fury)))
                            events.append(.raised(foe: f.id))
                        }
                    }
                case .windup:
                    // Winding up from a little way out (answering a parried cut, or down from a leap), the warlord
                    // steps in to land it.
                    if boss, f.distance > f.contact {
                        f.x = side.sign * (f.distance - (f.distance - f.contact) * min(1, h / max(h, f.timer)))
                    }
                    f.timer -= h
                    if f.timer <= 0 {
                        hurt(f.kind.damage, by: f.id, &events)
                        if boss, !f.chained, hp > 0, rng.chance(0.35 + 0.5 * fury) {
                            // Renzoku-waza: a second blow straight on from the first, the likelier the more he is hurt.
                            f.chained = true
                            f.enter(.windup, for: max(Tuning.quickBlow, f.windup * 0.5))
                            events.append(.raised(foe: f.id))
                        } else {
                            f.chained = false
                            f.x = side.sign * (f.distance + 0.05)
                            f.enter(.recoil, for: 0.45)
                        }
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
                        if boss, f.guardRest <= 0, rng.chance(0.5) {
                            f.enter(.guarding, for: Tuning.guardRise + rng.range(0.5, 0.85))
                            events.append(.guarded(foe: f.id))
                        } else {
                            f.phase = .advancing
                            f.timer = 0
                            f.span = 0
                        }
                    }
                case .leaping, .dying, .fleeing:
                    break
                }
                foes[i] = f
                if crowding.shove, f.kind == .brute { shove(from: i, side: side) }
                ahead.append(f)
            }
        }
    }

    /// The brute striding through lighter men (`Crowding.shove`): anyone he walks into who is not bringing his blow
    /// down is pushed aside, to stand just behind him.
    private mutating func shove(from i: Int, side: Side) {
        let brute = foes[i]
        for j in foes.indices where j != i && foes[j].targetable && Side.of(foes[j].x) == side && crowding.shoves(foes[j]) {
            guard foes[j].phase != .windup, foes[j].phase != .leaping, !foes[j].bearer else { continue }
            let room = (brute.kind.width + foes[j].kind.width) / 2 + 0.01
            if abs(foes[j].distance - brute.distance) < room {
                foes[j].x = side.sign * min(Tuning.edge, brute.distance + room)
            }
        }
    }

    /// Whether a foe in the air over the ronin will come down on `side` nearer to him than `foe` stands.
    private func landing(on side: Side, before foe: Foe) -> Bool {
        foes.contains { $0.phase == .leaping && $0.side == side && abs($0.leapTo) < foe.distance }
    }

    /// The gourd-bearer: he waits just out of reach (and behind the man in front, if one stands in his way), crouches
    /// to ready himself (`Tuning.dartTell`), darts in and strikes, backs off, and after his third dart makes off with
    /// the gourd. His dart is his wind-up: he runs in to his striking distance with his blade coming down, and the blow
    /// lands as he gets there (`Tuning.dartWindup` after he goes). He can only be cut while he is close, and a cut that
    /// doesn't fell him sends him springing back out of reach (see `wound`), so each of his two cuts has to catch him on
    /// a dart of his own.
    ///
    /// Nothing about it is left to chance. He goes only with nobody between him and the ronin (nor anyone coming down
    /// there from a leap), so a cut toward him meets him, and nobody cuts in front of him on his way in (`Crowding`).
    /// He waits the same `Tuning.bearerWait` at his spot before every dart, counted only while his way in is clear, and
    /// the tell always runs its whole length; he never leaves before his darts are spent. `hover` counts down that
    /// wait, so it says how soon he will go.
    private mutating func bear(_ f: inout Foe, side: Side, front: Foe?, _ events: inout [FightEvent]) {
        let h = Tuning.step
        // Where the man in front leaves him room to stand, as anyone queueing would.
        let behind = front.map { $0.distance + ($0.kind.width + f.kind.width) / 2 + 0.01 } ?? 0
        let hover = max(reach + f.kind.width / 2 + 0.09, behind)
        switch f.phase {
        case .advancing:
            // (A dart is his wind-up; on his feet, he is not darting, whatever a save from before that says.)
            f.darting = false
            if f.darts >= Tuning.bearerDarts || f.lingered > Tuning.bearerStay {
                f.enter(.fleeing, for: 0)
                break
            }
            if f.distance > hover + 0.0005 {
                f.x = side.sign * max(hover, f.distance - f.speed * h)
            } else if f.distance < hover - 0.0005 {
                f.x = side.sign * min(hover, f.distance + f.speed * 2.5 * h)
            }
            guard abs(f.distance - hover) < 0.01 else { break }
            guard clear(for: f, on: side) else {
                // Someone between him and the ronin: he waits, standing, and when his way clears the whole tell comes
                // before he goes.
                f.hover = max(f.hover, Tuning.dartTell)
                break
            }
            f.hover = max(0, f.hover - h)
            f.lingered += h
            // However quick the stage, his blow comes late enough to be met by a cut made on seeing him go.
            if f.hover <= 0 {
                f.darting = true
                f.darts += 1
                f.hover = Tuning.bearerWait
                f.enter(.windup, for: max(Tuning.dartWindup, f.windup * 0.45))
                events.append(.raised(foe: f.id))
            }
        case .windup:
            // The dart: in at a run to where his weapon reaches (never through the man in front), the blade coming
            // down as he gets there.
            let stop = max(f.contact, behind)
            if f.distance > stop { f.x = side.sign * max(stop, f.distance - f.speed * Tuning.dartPace * h) }
            f.timer -= h
            if f.timer <= 0 {
                // A blow lands only from where his weapon reaches: one brought up short by a man in front of him is
                // pulled.
                if f.distance <= f.contact + 0.02 { hurt(f.kind.damage, by: f.id, &events) }
                f.darting = false
                f.enter(.recoil, for: 0.3)
            }
        case .recoil:
            f.timer -= h
            if f.timer <= 0 {
                f.phase = .advancing
                f.span = 0
            }
        case .fleeing:
            f.x = side.sign * min(Tuning.edge + 0.1, f.distance + f.speed * 1.8 * h)
            if f.distance >= Tuning.edge + 0.1 {
                f.phase = .dying
                healed = true
                defeated += 1
                events.append(.fled(foe: f.id))
            }
        case .aiming, .leaping, .guarding, .dying:
            break
        }
    }

    /// Nobody stands between the gourd-bearer `f` and the ronin on `side`, nor is anyone in the air coming down there.
    private func clear(for f: Foe, on side: Side) -> Bool {
        !foes.contains { other in
            guard other.id != f.id, other.alive, other.side == side else { return false }
            return (other.phase == .leaping ? abs(other.leapTo) : other.distance) < f.distance
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

    /// The flung gourd comes down; if it reaches the ground uncaught, it shatters.
    private mutating func toss(_ events: inout [FightEvent]) {
        guard var flying = gourd else { return }
        flying.timer -= Tuning.step
        if flying.timer <= 0 {
            gourd = nil
            events.append(.shattered(foe: flying.from))
        } else {
            gourd = flying
        }
    }

    /// The gourd flung up out of its fallen bearer's hands (at `x`): it comes down on his side or over the ronin's head
    /// on the other, always `Tuning.gourdLanding` from the ronin and `Tuning.gourdFlight` later. Only the side is
    /// rolled, and it shows at once (where it will land is marked as it goes up).
    private mutating func fling(from bearer: Int, at x: Double, _ events: inout [FightEvent]) {
        let side = rng.chance(0.5) ? Side.of(x) : Side.of(x).opposite
        gourd = Gourd(from: bearer, start: x, land: side.sign * Tuning.gourdLanding, flight: Tuning.gourdFlight)
        events.append(.flung(foe: bearer))
    }

    /// Sen-no-sen: a shard for a man cut down as his blow came, and a heart (or its worth in points, with none missing)
    /// for every `Tuning.shardsPerHeart` of them.
    private mutating func earnShard(from foe: Int, _ events: inout [FightEvent]) {
        shards += 1
        events.append(.shard(foe: foe, count: shards))
        guard shards >= Tuning.shardsPerHeart else { return }
        shards = 0
        let restored = hp < maxHP
        if restored { hp += 1 } else { score += gourdBonus }
        events.append(.mended(restored: restored))
    }

    // MARK: Blows

    /// Takes a point off a foe. A foe who survives staggers back, or (a dancer, sometimes the warlord) leaps over the
    /// ronin to his other side, or (the gourd-bearer, cut by the ronin) springs back out of reach. Returns whether
    /// the foe fell.
    private mutating func wound(_ i: Int, byArrow: Bool, _ events: inout [FightEvent]) -> Bool {
        foes[i].hp -= 1
        foes[i].hits += 1
        if foes[i].hp <= 0 {
            score += points(foes[i].kind.bounty * multiplier)
            foes[i].enter(.dying, for: 0)
            defeated += 1
            stats.kills += 1
            raiseCombo(&events)
            if foes[i].bearer, !healed {
                // Cut down, he lets the gourd fly: it still has to be caught.
                healed = true
                fling(from: foes[i].id, at: foes[i].x, &events)
            }
            return true
        }
        if foes[i].kind == .warlord {
            // At three quarters, a half and a quarter of his cuts, he calls for help.
            let thresholds = [foes[i].maxHP * 3 / 4, foes[i].maxHP / 2, foes[i].maxHP / 4]
            if foes[i].summons < thresholds.count, foes[i].hp <= thresholds[foes[i].summons] {
                foes[i].summons += 1
                summon(by: i, &events)
            }
        }
        // A cut breaks whatever he was about: a dart, or a pair of blows.
        foes[i].darting = false
        foes[i].chained = false
        let leaps: Bool
        switch foes[i].kind {
        case .dancer: leaps = !byArrow
        case .warlord: leaps = !byArrow && rng.chance(0.55)
        default: leaps = false
        }
        if foes[i].bearer, !byArrow {
            // The gourd-bearer, cut and not felled, springs back out of reach to where he waits, and will have to be
            // caught on another dart.
            let side = Side.of(foes[i].x)
            foes[i].leapFrom = foes[i].x
            foes[i].leapTo = side.sign * max(foes[i].distance, reach + foes[i].kind.width / 2 + 0.09)
            foes[i].enter(.leaping, for: Tuning.spring)
            events.append(.leapt(foe: foes[i].id))
        } else if leaps {
            let from = foes[i].x
            let far = Side.of(from).opposite
            // He comes down at his striking distance, or behind a man already bringing his blow down there (behind
            // wherever a gourd-bearer's dart is taking him: nobody comes down in front of him on it).
            var land = max(Tuning.landing, foes[i].contact)
            for j in foes.indices where j != i && foes[j].phase == .windup && Side.of(foes[j].x) == far {
                let room = (foes[i].kind.width + foes[j].kind.width) / 2 + 0.01
                if foes[j].darting {
                    land = max(land, foes[j].contact + room)
                } else if abs(foes[j].distance - land) < room {
                    land = max(land, foes[j].distance + room)
                }
            }
            foes[i].leapFrom = from
            foes[i].leapTo = far.sign * land
            foes[i].enter(.leaping, for: Tuning.leap)
            events.append(.leapt(foe: foes[i].id))
        } else if crowding.noBruteKnockback, foes[i].kind == .brute {
            // Unmoved (`Crowding.noBruteKnockback`): he takes the cut where he stands, and a blow he was winding up
            // comes on regardless (turned aside only at the glare, `turns`); thrown off balance, he stays so.
            if foes[i].phase == .recoil, foes[i].timer >= 0.3 {
            } else if foes[i].phase != .windup {
                foes[i].enter(.recoil, for: 0.3)
            }
        } else {
            let sign = Side.of(foes[i].x).sign
            foes[i].x = sign * min(Tuning.edge, foes[i].distance + (foes[i].kind == .warlord ? 0.06 : 0.07))
            foes[i].enter(.recoil, for: 0.3)
        }
        return false
    }

    /// The warlord's call for help: a man from each end of the lane (from stage 10 a runner at the right), and from
    /// stage 10 more behind them, a brute or a blade dancer, one more for each warlord after, up to two.
    private mutating func summon(by i: Int, _ events: inout [FightEvent]) {
        let call = foes[i].summons
        var men: [(kind: Kind, side: Side)] = [(.grunt, .left), (stage >= 10 ? .runner : .grunt, .right)]
        for k in 0..<min(2, max(0, stage / 5 - 1)) {
            let odd = (call + k) % 2 == 1
            men.append((odd ? .brute : .dancer, odd ? .right : .left))
        }
        var allies: [Int] = []
        var queued: [Side: Double] = [:]
        for man in men {
            // Those behind the first come on a step further back.
            let back = queued[man.side, default: 0]
            queued[man.side] = back + 0.15
            roster.append(man.kind)
            arrived += 1
            let ally = Foe(id: nextID, kind: man.kind, x: man.side.sign * (Tuning.edge + back),
                           hp: man.kind == .dancer ? difficulty.dancerHP : man.kind.baseHP,
                           speed: man.kind.speed * difficulty.pace, windup: man.kind.windup * difficulty.windup)
            nextID += 1
            foes.append(ally)
            allies.append(ally.id)
        }
        events.append(.summoned(foe: foes[i].id, allies: allies))
    }

    /// Points, scaled by the mode.
    private func points(_ base: Int) -> Int { Int((Double(base) * mode.score).rounded()) }

    private mutating func hurt(_ damage: Int, by foe: Int?, _ events: inout [FightEvent]) {
        guard outcome == nil else { return }
        hp -= damage
        stats.wounds += 1
        stats.damage += damage
        breakCombo(&events)
        events.append(.wounded(foe: foe, damage: damage))
        if shards > 0 {
            events.append(.scattered(shards))
            shards = 0
        }
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

extension Fight {
    /// Reads a saved fight, taking one saved before gourds were flung and shards were kept as having neither in hand.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(stage: try c.decode(Int.self, forKey: .stage), seed: try c.decode(UInt64.self, forKey: .seed),
                  mode: try c.decode(Mode.self, forKey: .mode), roster: try c.decode([Kind].self, forKey: .roster),
                  rng: try c.decode(SeededRNG.self, forKey: .rng))
        difficulty = try c.decode(Difficulty.self, forKey: .difficulty)
        time = try c.decode(Double.self, forKey: .time)
        hp = try c.decode(Int.self, forKey: .hp)
        maxHP = try c.decode(Int.self, forKey: .maxHP)
        foes = try c.decode([Foe].self, forKey: .foes)
        arrows = try c.decode([Arrow].self, forKey: .arrows)
        arrived = try c.decode(Int.self, forKey: .arrived)
        defeated = try c.decode(Int.self, forKey: .defeated)
        nextID = try c.decode(Int.self, forKey: .nextID)
        spawnTimer = try c.decode(Double.self, forKey: .spawnTimer)
        cooldown = try c.decode(Double.self, forKey: .cooldown)
        held = try c.decodeIfPresent(Side.self, forKey: .held)
        stumble = try c.decode(Double.self, forKey: .stumble)
        facing = try c.decode(Side.self, forKey: .facing)
        combo = try c.decode(Int.self, forKey: .combo)
        score = try c.decode(Int.self, forKey: .score)
        bonus = try c.decode(Int.self, forKey: .bonus)
        stats = try c.decode(FightStats.self, forKey: .stats)
        outcome = try c.decodeIfPresent(Outcome.self, forKey: .outcome)
        bossID = try c.decodeIfPresent(Int.self, forKey: .bossID)
        bearerIndex = try c.decodeIfPresent(Int.self, forKey: .bearerIndex)
        healed = try c.decode(Bool.self, forKey: .healed)
        gourd = try c.decodeIfPresent(Gourd.self, forKey: .gourd)
        shards = try c.decodeIfPresent(Int.self, forKey: .shards) ?? 0
        pilot = try c.decodeIfPresent(Pilot.self, forKey: .pilot)
        crowding = try c.decodeIfPresent(Crowding.self, forKey: .crowding) ?? .standard
        accumulator = try c.decode(Double.self, forKey: .accumulator)
    }
}
