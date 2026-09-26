import Foundation

/// The camera, in world terms: where it looks and how much road fits across the view. The renderer scales that
/// width to whatever size the window is, so a small window shows the same road, only smaller.
public struct Camera: Equatable, Sendable {
    public var center = Vec2.zero
    public var worldWidth = 430.0

    public init() {}

    public mutating func snap(to car: Car) {
        center = car.position
        worldWidth = Camera.width(for: car)
    }

    /// Leads the car by a third of a second of travel and pulls back as it gets quicker.
    public mutating func follow(_ car: Car, dt: Double) {
        var lead = car.velocity * 0.35
        if lead.length > 110 { lead = lead.normalized * 110 }
        center += (car.position + lead - center) * (1 - exp(-6 * dt))
        worldWidth += (Camera.width(for: car) - worldWidth) * (1 - exp(-1.8 * dt))
    }

    static func width(for car: Car) -> Double { 430 + min(car.speed, 260) * 0.55 }
}

public struct Particle: Equatable, Sendable {
    public enum Kind: Sendable { case smoke, spark }
    public var kind: Kind
    public var position: Vec2
    public var velocity: Vec2
    public var age = 0.0
    public var life: Double
    public var size: Double
    public var growth: Double

    /// 1 when fresh, 0 when gone.
    public var fade: Double { max(0, 1 - age / life) }
}

/// A pair of rear-wheel points: light trails are drawn between consecutive marks that are `connected`.
public struct TrailMark: Equatable, Sendable {
    public var left: Vec2
    public var right: Vec2
    public var age = 0.0
    public var strength: Double
    public var connected: Bool
}

public struct Toast: Equatable, Sendable {
    public enum Tone: Sendable { case gold, good, bad, plain }
    public var title: String
    public var detail: String?
    public var tone: Tone
    public var age = 0.0
    public var life: Double

    public var fade: Double { age < life - 0.4 ? 1 : max(0, (life - age) / 0.4) }
    /// 0→1 over the first fifth of a second: for a small pop on arrival.
    public var arrival: Double { min(1, age / 0.2) }
}

/// Everything that is only for show: tyre smoke, sparks, light trails, toasts, screen shake.
public struct Effects: Sendable {
    public static let trailLife = 3.2
    public private(set) var particles: [Particle] = []
    public private(set) var trail: [TrailMark] = []
    public private(set) var toasts: [Toast] = []
    public private(set) var shake = 0.0
    /// A flash when the multiplier steps up, 1 → 0.
    public private(set) var pulse = 0.0
    private var rng = SeededRandom(seed: 7)
    private var smokeDebt = 0.0
    private var sinceMark = 0.0
    private var wasSliding = false

    public init() {}

    public var isActive: Bool { !particles.isEmpty || !trail.isEmpty || !toasts.isEmpty || shake > 0.01 || pulse > 0 }

    public mutating func update(dt: Double) {
        for i in particles.indices {
            particles[i].age += dt
            particles[i].position += particles[i].velocity * dt
            particles[i].velocity *= exp(-(particles[i].kind == .smoke ? 2.5 : 4) * dt)
            particles[i].size += particles[i].growth * dt
        }
        particles.removeAll { $0.age >= $0.life }
        for i in trail.indices { trail[i].age += dt }
        if let expired = trail.firstIndex(where: { $0.age < Effects.trailLife }) {
            if expired > 0 { trail.removeFirst(expired) }
        } else {
            trail.removeAll()
        }
        for i in toasts.indices { toasts[i].age += dt }
        toasts.removeAll { $0.age >= $0.life }
        shake *= exp(-9 * dt)
        if shake < 0.01 { shake = 0 }
        pulse = max(0, pulse - dt * 2.5)
    }

    /// Smoke and trails from the rear wheels while the car slides.
    public mutating func emit(from car: Car, sliding: Bool, dt: Double) {
        let f = car.forward, l = f.perp
        let rearLeft = car.position - f * 6 + l * 4, rearRight = car.position - f * 6 - l * 4
        sinceMark += dt
        if sliding && sinceMark >= 1.0 / 60 {
            sinceMark = 0
            let strength = min(1, abs(car.slip) / (40 * .pi / 180))
            trail.append(TrailMark(left: rearLeft, right: rearRight, strength: strength, connected: wasSliding))
            if trail.count > 600 { trail.removeFirst(trail.count - 600) }
        }
        wasSliding = sliding
        guard sliding else { smokeDebt = 0; return }
        smokeDebt += dt * 36
        while smokeDebt >= 1 {
            smokeDebt -= 1
            let wheel = rng.next() & 1 == 0 ? rearLeft : rearRight
            let drift = Vec2(rng.double(-12...12), rng.double(-12...12))
            particles.append(Particle(kind: .smoke, position: wheel, velocity: car.velocity * 0.12 + drift,
                                      life: rng.double(0.7...1.2), size: rng.double(3...5), growth: rng.double(9...14)))
        }
        if particles.count > 160 { particles.removeFirst(particles.count - 160) }
    }

    public mutating func sparks(at point: Vec2, away normal: Vec2, impact: Double) {
        let count = min(18, 4 + Int(impact / 12))
        for _ in 0..<count {
            let dir = (normal + normal.perp * rng.double(-1.4...1.4)).normalized
            particles.append(Particle(kind: .spark, position: point, velocity: dir * rng.double(80...220),
                                      life: rng.double(0.18...0.4), size: rng.double(3...6), growth: 0))
        }
        shake = min(1, shake + impact / 160)
    }

    public mutating func flash() { pulse = 1 }

    public mutating func toast(_ title: String, _ detail: String? = nil, tone: Toast.Tone, life: Double = 1.8) {
        // Two at most: the newest stacks over the one before it.
        if toasts.count >= 2 { toasts.removeFirst(toasts.count - 1) }
        toasts.append(Toast(title: title, detail: detail, tone: tone, life: life))
    }

    public mutating func clear() {
        particles.removeAll()
        trail.removeAll()
        toasts.removeAll()
        shake = 0
        pulse = 0
        wasSliding = false
    }
}
