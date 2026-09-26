import Foundation

/// The lane is one dimension. The ronin stands at 0; foes come from the left (negative) and the right (positive).
/// The panel shows −1…1, and foes enter from just beyond.
public enum Tuning {
    /// The simulation's fixed step, in seconds.
    public static let step = 1.0 / 120
    /// Where foes appear, just off the panel's edge.
    public static let edge = 1.08
    /// How far a cut reaches, from the ronin's centre to a foe's near edge.
    public static let reach = 0.30
    /// Reach while the combo is at or past `bloodlust`.
    public static let bloodlustReach = 0.37
    /// The combo that brings on bloodlust.
    public static let bloodlust = 20
    /// Half the ronin's width: where a foe's reach meets him.
    public static let body = 0.05
    /// After a cut lands, the ronin can cut again this soon. Presses in between are held and cut on time.
    public static let cooldown = 0.075
    /// A cut at nothing leaves him open this long, and presses in between are lost.
    public static let stumble = 0.34
    /// Where archers stop to shoot, if nothing in front stops them sooner.
    public static let archerRange = 0.64
    public static let arrowSpeed = 0.78
    public static let deflectSpeed = 2.2
    /// How long a leap over the ronin's head takes, and where the leaper lands.
    public static let leap = 0.42
    public static let landing = 0.23
    public static let heroHP = 5
    /// The first foe waits for the stage's title card to clear.
    public static let firstSpawn = 1.5
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
    /// Two cuts; the first sends him leaping over your head to your other side.
    case dancer
    /// Stops out of reach and shoots. Cut the arrow when it comes into reach and it flies back.
    case archer
    /// The boss at the end of every fifth stage: many cuts, knocked back or leaping after each. His blow costs two.
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
        case .warlord: return 7
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

    /// Seconds from raising the weapon to the blow (for an archer: from drawing to loosing), before the stage's pace.
    public var windup: Double {
        switch self {
        case .grunt: return 0.62
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
    /// Where the foe stands to strike: his near edge against the ronin.
    public var contact: Double { Tuning.body + kind.width / 2 + 0.015 }

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

/// Ranks count foes cut down over every stage, won or lost, so no break is wasted.
public enum Rank {
    public static let ladder: [(kills: Int, title: String)] = [
        (0, "Wanderer"), (40, "Swordsman"), (120, "Ronin"), (300, "Duelist"), (600, "Blademaster"),
        (1000, "Kensei"), (1600, "Sword Saint"), (2500, "Demon Blade"), (4000, "Legend"),
    ]

    public static func title(kills: Int) -> String { ladder.last { $0.kills <= kills }?.title ?? ladder[0].title }

    public static func next(kills: Int) -> (kills: Int, title: String)? { ladder.first { $0.kills > kills } }
}
