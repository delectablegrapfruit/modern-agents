import Foundation

/// The lane is one dimension. The ronin stands at 0; foes come from the left (negative) and the right (positive).
/// The panel shows −1…1, and foes enter from just beyond.
public enum Tuning {
    /// The simulation's fixed step, in seconds.
    public static let step = 1.0 / 120
    /// Where foes appear, just off the panel's edge.
    public static let edge = 1.08
    /// How far a cut reaches, from the ronin's centre to a foe's near edge.
    public static let reach = 0.35
    /// Reach while the combo is at or past `bloodlust`.
    public static let bloodlustReach = 0.42
    /// The combo that brings on bloodlust.
    public static let bloodlust = 20
    /// Half the ronin's width: where an arrow meets him.
    public static let body = 0.05
    /// The ronin's height in lane units: the panel draws him this tall, and every weapon's reach is measured
    /// against it, so a blow drawn landing on him lands on him.
    public static let figure = 0.312
    /// After a cut lands, the ronin can cut again this soon (it runs out on the step after, about 0.08 s). A press in
    /// between is held and cut on time, at whatever is in reach then; a second cut on the side just cut that finds
    /// nothing there (the first knocked him back, sent him leaping or felled him) is let go, not a whiff.
    public static let cooldown = 0.075
    /// A cut at nothing leaves him open this long (times the mode's `stumble`), and presses in between are lost.
    public static let stumble = 0.34
    /// Where archers stop to shoot, if nothing in front stops them sooner.
    public static let archerRange = 0.64
    public static let arrowSpeed = 0.78
    public static let deflectSpeed = 2.2
    /// How long a leap over the ronin's head takes, and where the leaper lands.
    public static let leap = 0.42
    public static let landing = 0.23
    /// A stand-in until a fight sets the mode's own hearts (`Mode.hearts`), which it always does.
    public static let heroHP = 5
    /// The first foe waits for the stage's title card to clear.
    public static let firstSpawn = 1.5
    /// A cut the warlord parries leaves the ronin open this long (times the mode's `stumble`).
    public static let parried = 0.3
    /// How long the warlord's guard takes to come up: longer than it takes to see it and stop. A cut that meets it
    /// sooner glances off (nothing lost either side); once it is set, a cut is parried.
    public static let guardRise = 0.24
    /// The shortest wind-up of any warlord blow but his answer to a parried cut (a second blow straight on from the
    /// first, one as he lands from a leap or drops his guard, one in his fury): long enough to meet on sight, however
    /// quick the stage.
    public static let quickBlow = 0.3
    /// The shortest wind-up of the gourd-bearer's blow after he darts in: long enough to catch him on sight.
    public static let dartWindup = 0.3
    /// How long the gourd-bearer takes to spring back out of reach from a cut that doesn't fell him.
    public static let spring = 0.3
    /// The points a gourd is worth when no heart is missing, before the mode's score.
    public static let gourdPoints = 500
}

public enum Side: Int, Codable, Sendable, CaseIterable {
    case left = -1
    case right = 1

    public var sign: Double { Double(rawValue) }
    public var opposite: Side { self == .left ? .right : .left }
    public static func of(_ x: Double) -> Side { x < 0 ? .left : .right }
}

public enum Kind: String, Codable, Sendable, CaseIterable {
    /// A spearman: one cut.
    case grunt
    /// Quick, one cut.
    case runner
    /// Slow and armoured: three cuts, and each knocks him back. His blow costs two.
    case brute
    /// Two cuts (three from stage 12); each cut that doesn't fell him sends him leaping over your head to your other
    /// side.
    case dancer
    /// Stops out of reach and shoots. Cut the arrow when it comes into reach and it flies back.
    case archer
    /// The boss at the end of every fifth stage: many cuts, knocked back or leaping after each, a guard that turns a
    /// cut aside once it is set, and men called in as he weakens. His blow costs two.
    case warlord

    public var title: String {
        switch self {
        case .grunt: return "Ashigaru"
        case .runner: return "Runner"
        case .brute: return "Brute"
        case .dancer: return "Blade Dancer"
        case .archer: return "Archer"
        case .warlord: return "Warlord"
        }
    }

    public var baseHP: Int {
        switch self {
        case .grunt, .runner, .archer: return 1
        case .dancer: return 2
        case .brute: return 3
        case .warlord: return 12
        }
    }

    /// Lane units a second, before the stage's pace.
    public var speed: Double {
        switch self {
        case .grunt: return 0.30
        case .runner: return 0.56
        case .brute: return 0.19
        case .dancer: return 0.34
        case .archer: return 0.26
        case .warlord: return 0.22
        }
    }

    /// Seconds from raising the weapon to the blow (for an archer: from drawing to loosing), before the stage's
    /// wind-up factor (`Difficulty.windup`).
    public var windup: Double {
        switch self {
        case .grunt: return 0.72
        case .runner: return 0.46
        case .brute: return 0.86
        case .dancer: return 0.52
        case .archer: return 0.95
        case .warlord: return 0.72
        }
    }

    public var damage: Int {
        switch self {
        case .brute, .warlord: return 2
        default: return 1
        }
    }

    /// Where he stands to strike, from the ronin's centre: as far as his weapon reaches. A spearman strikes from
    /// the length of his spear, at the edge of the ronin's own reach; a knife has to come close.
    public var range: Double {
        switch self {
        case .grunt: return 0.28
        case .runner: return 0.13
        case .brute: return 0.2
        case .dancer: return 0.14
        case .archer: return 0.12
        case .warlord: return 0.2
        }
    }

    /// How much of the lane the foe takes up.
    public var width: Double {
        switch self {
        case .runner: return 0.075
        case .brute: return 0.11
        case .warlord: return 0.12
        default: return 0.085
        }
    }

    /// Points for a kill, before the combo multiplier.
    public var bounty: Int {
        switch self {
        case .grunt: return 100
        case .runner: return 120
        case .archer: return 150
        case .dancer: return 200
        case .brute: return 250
        case .warlord: return 2000
        }
    }
}

public struct Foe: Codable, Equatable, Sendable {
    public enum Phase: String, Codable, Sendable {
        /// Walking in, or waiting behind the foe in front.
        case advancing
        /// Weapon raised: the blow lands when the timer runs out, unless he is cut first.
        case windup
        /// Staggered by a cut, or stepping back after his blow.
        case recoil
        /// In the air, over the ronin's head. Nothing can touch him.
        case leaping
        /// An archer drawing his bow.
        case aiming
        /// Cut down: gone at the end of the step.
        case dying
        /// The warlord bringing his blade across his body. For its first `Tuning.guardRise` it is still coming up and
        /// a cut glances off; once it is set (`guardSet`), a cut is parried, and he answers it.
        case guarding
        /// The gourd-bearer making off with the gourd: gone at the lane's edge.
        case fleeing
    }

    public var id: Int
    public var kind: Kind
    public var x: Double
    public var hp: Int
    public var maxHP: Int
    public var speed: Double
    public var windup: Double
    public var phase = Phase.advancing
    /// Seconds left in the current phase.
    public var timer = 0.0
    /// The current phase's full length, so a renderer can show its progress.
    public var span = 0.0
    public var leapFrom = 0.0
    public var leapTo = 0.0
    public var hits = 0
    /// Carries the stage's one gourd of medicine. He keeps just out of reach and darts in to strike, and after his
    /// second blow makes off with it. Cut him down and the ronin gets a heart back, but a cut that doesn't fell him
    /// sends him springing back out of reach: each of his cuts has to catch him on a dart.
    public var bearer = false
    /// The gourd-bearer: seconds before he darts in (counting down only while he waits at his spot), whether he is
    /// darting now, how many blows he has landed, and how long he has been on the lane.
    public var hover = 0.0
    public var darting = false
    public var darts = 0
    public var lingered = 0.0
    /// The warlord: seconds before he may raise his guard again; whether the blow he is winding up may not be followed
    /// straight on by another (the second of a pair, or his answer to a parried cut); and how many times he has
    /// called for help.
    public var guardRest = 0.0
    public var chained = false
    public var summons = 0

    public init(id: Int, kind: Kind, x: Double, hp: Int, speed: Double, windup: Double) {
        self.id = id
        self.kind = kind
        self.x = x
        self.hp = hp
        maxHP = hp
        self.speed = speed
        self.windup = windup
    }

    public var side: Side { Side.of(phase == .leaping ? leapTo : x) }
    public var distance: Double { abs(x) }
    /// The distance from the ronin's centre to this foe's near edge: what a cut must reach.
    public var gap: Double { abs(x) - kind.width / 2 }
    public var alive: Bool { phase != .dying }
    public var targetable: Bool { phase != .dying && phase != .leaping }
    /// 0 at the phase's start, 1 at its end.
    public var progress: Double { span > 0 ? min(1, max(0, 1 - timer / span)) : 1 }
    /// Where the foe stands to strike: as far out as his weapon reaches.
    public var contact: Double { kind.range }
    /// How long the warlord's guard has been coming up (0 when he is not guarding).
    public var guardAge: Double { phase == .guarding ? span - timer : 0 }
    /// The warlord's guard is up and set: a cut now is parried. Before this it is still rising, and a cut glances off.
    public var guardSet: Bool { phase == .guarding && span - timer >= Tuning.guardRise - 1e-9 }

    mutating func enter(_ phase: Phase, for seconds: Double) {
        self.phase = phase
        timer = seconds
        span = seconds
    }
}

public struct Arrow: Codable, Equatable, Sendable {
    public var id: Int
    /// The archer who loosed it.
    public var from: Int
    public var x: Double
    /// Signed, lane units a second.
    public var velocity: Double
    /// Cut back the way it came: it now hurts foes, not the ronin.
    public var deflected = false

    public var side: Side { Side.of(x) }
}

/// How hard the whole game is, from forgiving to merciless. Each keeps its own stage.
public enum Mode: String, Codable, Sendable, CaseIterable {
    /// Beginner's mind: seven hearts, slower foes, a longer reach.
    case shoshin
    /// The way of the sword: the game as designed.
    case bushido
    /// The realm of carnage: four hearts, faster and more foes.
    case shura
    /// The demon: three hearts, quick blows, a crowded lane, a short reach.
    case oni

    public var title: String {
        switch self {
        case .shoshin: return "Shoshin"
        case .bushido: return "Bushidō"
        case .shura: return "Shura"
        case .oni: return "Oni"
        }
    }

    /// What it means, in a few words.
    public var gist: String {
        switch self {
        case .shoshin: return "easy"
        case .bushido: return "normal"
        case .shura: return "hard"
        case .oni: return "insane"
        }
    }

    public var level: Int { Mode.allCases.firstIndex(of: self) ?? 1 }
    public var hearts: Int { [7, 5, 4, 3][level] }
    /// Multiplies foe speed.
    public var pace: Double { [0.85, 1, 1.2, 1.45][level] }
    /// Multiplies every wind-up (below 1 is quicker).
    public var windup: Double { [1.25, 1, 0.8, 0.62][level] }
    /// Multiplies the time between arrivals.
    public var interval: Double { [1.2, 1, 0.82, 0.66][level] }
    /// Multiplies how long a whiff or a parried cut leaves the ronin off balance.
    public var stumble: Double { [0.75, 1, 1.2, 1.4][level] }
    /// Added to the most foes on the lane at once.
    public var crowd: Int { [-1, 0, 1, 3][level] }
    public var reach: Double { [1.08, 1, 0.97, 0.92][level] }
    /// Multiplies every point scored.
    public var score: Double { [0.5, 1, 1.6, 3][level] }
}

/// Where each stage is fought. The app paints it; the name is the same everywhere.
public enum Setting: Int, Codable, Sendable, CaseIterable {
    case crimsonDusk, bambooGrove, bloodMoon, frozenPass, stormBridge, burningVillage, sakuraTemple, ashFields

    public static func of(stage: Int) -> Setting { allCases[(max(1, stage) - 1) % allCases.count] }

    public var name: String {
        switch self {
        case .crimsonDusk: return "Crimson Dusk"
        case .bambooGrove: return "Bamboo Grove"
        case .bloodMoon: return "Blood Moon"
        case .frozenPass: return "Frozen Pass"
        case .stormBridge: return "Storm Bridge"
        case .burningVillage: return "Burning Village"
        case .sakuraTemple: return "Sakura Temple"
        case .ashFields: return "Ash Fields"
        }
    }
}

/// Ranks count foes cut down over every stage, won, lost or walked away from, so no break is wasted. A kill on a
/// harder mode counts for more (see `weight`); the tally is the career's merit, and the rungs below are in it (on
/// Shoshin and Bushidō, one kill is one). The first ranks come within minutes; Legend takes many hours.
public enum Rank {
    public static let ladder: [(kills: Int, title: String)] = [
        (0, "Wanderer"), (40, "Swordsman"), (120, "Ronin"), (300, "Duelist"), (600, "Blademaster"),
        (1500, "Kensei"), (4000, "Sword Saint"), (10_000, "Demon Blade"), (25_000, "Legend"),
    ]

    /// What one kill counts toward rank on each mode: a quarter more on Shura, half as much again on Oni.
    public static func weight(_ mode: Mode) -> Double { [1, 1, 1.25, 1.5][mode.level] }

    /// Merit: every kill, with those made on the harder modes weighed up. `kills` is the total; `byMode` holds the
    /// kills counted by mode, and any not in it count once.
    public static func merit(kills: Int, byMode: [String: Int]) -> Int {
        let extra = byMode.reduce(0.0) { sum, entry in
            sum + Double(max(0, entry.value)) * ((Mode(rawValue: entry.key).map(weight) ?? 1) - 1)
        }
        return kills + Int(extra)
    }

    /// The title for a merit (on Shoshin and Bushidō, the kills).
    public static func title(kills: Int) -> String { ladder.last { $0.kills <= kills }?.title ?? ladder[0].title }

    /// The next rung above a merit, if there is one.
    public static func next(kills: Int) -> (kills: Int, title: String)? { ladder.first { $0.kills > kills } }

    /// Kills on `mode` still needed to climb from `merit` to `target`.
    public static func kills(from merit: Int, to target: Int, on mode: Mode) -> Int {
        Int((Double(max(0, target - merit)) / weight(mode)).rounded(.up))
    }
}
