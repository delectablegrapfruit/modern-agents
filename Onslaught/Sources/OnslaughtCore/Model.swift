import Foundation

/// An enemy projectile.
public struct Bullet: Codable, Equatable, Sendable {
    public enum Kind: Int, Codable, Sendable {
        /// The common round.
        case pellet
        /// Big and slow.
        case orb
        /// Thin and fast; drawn along its heading.
        case needle
        /// Drifts, then bursts into a ring. Can be shot down first.
        case mine
    }

    /// Which of the boss's colours it wears: 0 primary, 1 accent, 2 white-hot.
    public enum Tint: Int, Codable, Sendable { case primary, accent, hot }

    public var kind: Kind
    public var tint: Tint
    public var pos: Vec2
    public var vel: Vec2
    public var radius: Double
    /// Change of speed per second along the heading, kept between `minSpeed` and `maxSpeed`.
    public var accel = 0.0
    public var minSpeed = 0.0
    public var maxSpeed = 400.0
    /// Steady turn (radians per second) and a swing of the heading back and forth.
    public var turn = 0.0
    /// Seconds the steady turn lasts; after that it flies straight (so curling bullets don't orbit forever).
    public var turnFor = 1e9
    public var wiggle = 0.0
    public var gravity = 0.0
    /// Seconds until it bursts into `splits` pellets; negative for never.
    public var fuse = -1.0
    public var splits = 0
    public var hp = 0.0
    public var age = 0.0
    public var grazed = false

    public init(_ kind: Kind, tint: Tint = .primary, pos: Vec2, vel: Vec2) {
        self.kind = kind
        self.tint = tint
        self.pos = pos
        self.vel = vel
        switch kind {
        case .pellet: radius = 2.6
        case .orb: radius = 4.6
        case .needle: radius = 2.0
        case .mine: radius = 5.5
        }
    }

    /// The hit circle is smaller than the drawing: grazes that look like hits are part of the thrill.
    public var hitRadius: Double { radius * 0.72 }
}

/// A beam from one of the boss's turrets: a telegraph line first, then the beam itself.
public struct Laser: Codable, Equatable, Sendable {
    /// From the boss's centre, so the beam travels with it.
    public var offset: Vec2
    public var angle: Double
    /// Radians per second while it fires.
    public var sweep: Double
    public var warning: Double
    public var firing: Double
    public var width: Double
    /// Turns towards the ship while it warns, then holds on the spot where the ship was when it locked.
    public var tracks: Bool
    public var lock: Vec2?
    public var age = 0.0

    public var isLive: Bool { warning <= 0 && firing > 0 }
}

/// One of the player's projectiles.
public struct Shot: Codable, Equatable, Sendable {
    public enum Kind: Int, Codable, Sendable { case bolt, missile, drone }
    public var kind: Kind
    public var pos: Vec2
    public var vel: Vec2
    public var damage: Double
    public var age = 0.0
}

/// The player's interceptor. It flies towards the pointer as fast as its engines allow and fires on its own.
public struct Ship: Codable, Equatable, Sendable {
    public static let hitRadius = 2.2

    public var pos: Vec2
    public var target: Vec2
    public var vel = Vec2.zero
    public var hull: Int
    public var maxHull: Int
    public var invulnerable = 0.0
    /// The deflector's charge: it absorbs the next hit.
    public var shield = false
    /// The nova charge, 0…1. Full means a click detonates it.
    public var nova = 0.0
    public var gunClock = 0.0
    public var missileClock = 0.6
    public var droneClock = 0.0
    public var droneAngle = 0.0
    public var alive: Bool { hull > 0 }
}

// MARK: The boss

public struct Attack: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, CaseIterable, Sendable {
        /// Rings of pellets, each turned half a step from the last.
        case ring
        /// Arms of bullets from a turning turret.
        case spiral
        /// A spread aimed at the ship.
        case fan
        /// Rapid bursts aimed where the ship was.
        case stream
        /// Bullets thrown up that arc and fall.
        case fountain
        /// Telegraphed beams that sweep or snipe.
        case laser
        /// Drifting mines that burst into rings.
        case mines
        /// Rows falling with a gap to slip through.
        case gate
        /// Rings of curving bullets.
        case flower
        /// Needles from the top edge.
        case rain
        /// Wriggling chains aimed at the ship.
        case snake
        /// A machine gun swinging across the field.
        case sweep
    }

    public var kind: Kind
    public var duration: Double
    public var interval: Double
    public var count: Int
    public var speed: Double
    public var spread = 0.0
    public var spinRate = 0.0
    public var variant = 0
}

public struct Phase: Codable, Equatable, Sendable {
    public var attacks: [Attack]
    /// Runs underneath the others the whole phase.
    public var ambient: Attack?
    /// How briskly the boss moves about.
    public var agility: Double
}

/// What a boss is: its look, its name, and its three phases of attacks. Made from a seed by `Forge`.
public struct BossDesign: Codable, Equatable, Sendable {
    public var name: String
    /// "DREADNOUGHT" for every fifth wave, otherwise a class name.
    public var rank: String
    public var hue: Double
    public var accentHue: Double
    public var sides: Int
    public var spikes: Int
    public var rings: Int
    public var turrets: Int
    public var radius: Double
    public var heavy: Bool
    public var phases: [Phase]
}

/// Where the boss is in its current attack.
public struct AttackState: Codable, Equatable, Sendable {
    public var index = 0
    public var clock = 0.0
    public var fireClock = 0.0
    public var count = 0
    public var angle = 0.0
    public var aim = Vec2.zero
    public var resting = 0.0

    public init(resting: Double = 0) { self.resting = resting }
}

public struct Boss: Codable, Equatable, Sendable {
    public var design: BossDesign
    public var pos: Vec2
    public var home: Vec2
    public var hp: Double
    public var maxHP: Double
    /// 0, 1, 2: the third begins at a third of the hull.
    public var phase = 0
    /// The turret ring's angle; spirals fire from it and the renderer turns it.
    public var spin = 0.0
    /// Seconds of hit flash (for the renderer).
    public var flash = 0.0
    /// Seconds of invulnerability after a phase break.
    public var shielded = 0.0
    public var moveClock = 1.5
    public var attack = AttackState(resting: 1.6)
    public var ambient = AttackState(resting: 2.4)
    /// Seconds since the hull gave out; negative while it fights.
    public var dying = -1.0

    public var radius: Double { design.radius }
    public var alive: Bool { dying < 0 }
    public var fraction: Double { maxHP > 0 ? max(0, hp / maxHP) : 0 }
    public var currentPhase: Phase { design.phases[min(phase, design.phases.count - 1)] }

    /// Where its turrets sit, turning with it.
    public func turret(_ k: Int) -> Vec2 {
        let n = max(1, design.turrets)
        return pos + Vec2.polar(spin + Double(k) * 2 * .pi / Double(n), radius * 0.92)
    }
}

// MARK: Events

public enum Outcome: String, Codable, Sendable { case victory, defeat }

/// What happened during a step, for the renderer's effects.
public enum FightEvent: Equatable, Sendable {
    case bossHit(Vec2)
    case bossShielded(Vec2)
    case bossPhase(Int)
    case bossDestroyed(Vec2)
    case shipHit(Vec2, hull: Int)
    case shieldAbsorbed(Vec2)
    case shipDestroyed(Vec2)
    case graze(Vec2)
    case novaReady
    case nova(Vec2)
    /// Bullets wiped out (by a phase break, a nova or a hit), where they were.
    case cleared([Vec2])
    case mineBurst(Vec2)
    case mineKilled(Vec2)
    case laserFired(Vec2)
    case ended(Outcome)
}

public struct FightStats: Codable, Equatable, Sendable {
    public var damage = 0.0
    public var grazes = 0
    public var hitsTaken = 0
    public var novas = 0
    public var cleared = 0
    public var time = 0.0
    public var peakBullets = 0
}

/// The bonuses a victory paid, for the debrief.
public struct Bonus: Codable, Equatable, Sendable {
    public var kill = 0
    public var flawless = 0
    public var speed = 0
    public var total: Int { kill + flawless + speed }
}
