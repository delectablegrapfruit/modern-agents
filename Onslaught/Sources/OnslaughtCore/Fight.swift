import Foundation

/// One duel: your interceptor against one boss, stepped at a fixed 120 Hz so it plays the same on every Mac and a
/// saved fight resumes on the same frame.
///
/// The ship flies towards the pointer (`aim(at:)`) and fires on its own. Grazing bullets charges the nova;
/// `detonate()` sets it off. The boss has three phases, broken at two thirds and one third of its hull; each break
/// wipes the field. The fight ends a moment after one side blows up, so the explosion can play.
public struct Fight: Codable, Equatable, Sendable {
    public static let tick = 1.0 / 120
    public static let maxBullets = 700

    public let wave: Int
    public let seed: Int
    public let loadout: Loadout
    public let pressure: Double
    public var rng: RNG
    public var time = 0.0
    public var ship: Ship
    public var boss: Boss
    public var bullets: [Bullet] = []
    public var lasers: [Laser] = []
    public var shots: [Shot] = []
    /// The expanding nova's radius, or negative when there is none.
    public var novaRadius = -1.0
    public var novaOrigin = Vec2.zero
    public var stats = FightStats()
    public var score = 0
    public var bonus: Bonus?
    public var outcome: Outcome?
    /// Seconds left of the closing explosion before `outcome` is set; negative when the fight is on.
    public var ending = -1.0
    public var endingOutcome: Outcome?
    public var accumulator = 0.0
    /// Flies the ship itself (the self-test and the balance simulator).
    public var autopilot = false
    /// Seconds between the autopilot's decisions: longer is a slower pilot (the simulator's stand-in for a person).
    public var pilotReaction = 3 * Fight.tick
    var pilotClock = 0.0

    public init(wave: Int, seed: Int, loadout: Loadout, hull: Int) {
        self.wave = wave
        self.seed = seed
        self.loadout = loadout
        pressure = Forge.pressure(wave: wave)
        rng = RNG(seed: mixSeed(seed, wave, 0xF16))
        let design = Forge.design(wave: wave, seed: seed)
        let hp = Forge.hull(wave: wave, heavy: design.heavy)
        boss = Boss(design: design, pos: Vec2(Arena.width / 2, Arena.height + 45), home: Vec2(Arena.width / 2, 232), hp: hp, maxHP: hp)
        let start = Vec2(Arena.width / 2, 42)
        ship = Ship(pos: start, target: start, hull: max(1, min(hull, loadout.maxHull)), maxHull: loadout.maxHull)
        ship.shield = loadout.hasDeflector
        ship.nova = loadout.novaStart
    }

    public var isOver: Bool { outcome != nil }
    public var isFighting: Bool { outcome == nil && ending < 0 }
    public var novaReady: Bool { ship.nova >= 1 }

    public func laserOrigin(_ laser: Laser) -> Vec2 { boss.pos + laser.offset }

    public func dronePosition(_ k: Int) -> Vec2 {
        ship.pos + Vec2.polar(ship.droneAngle + Double(k) * .pi, 14)
    }

    /// Where the ship should fly to; it is kept below the boss's third of the field.
    public mutating func aim(at p: Vec2) { ship.target = Arena.clampShip(p) }

    /// Sets off a full nova: wipes the bullets in a widening ring, cancels beams, and hurts the boss.
    public mutating func detonate() -> [FightEvent] {
        var ev: [FightEvent] = []
        guard ship.alive, ship.nova >= 1, isFighting, boss.alive else { return ev }
        ship.nova = 0
        novaRadius = 0
        novaOrigin = ship.pos
        ship.invulnerable = max(ship.invulnerable, 1.2)
        stats.novas += 1
        lasers.removeAll()
        ev.append(.nova(ship.pos))
        damageBoss(boss.maxHP * 0.06 * loadout.novaPower, at: boss.pos, charging: false, &ev)
        return ev
    }

    /// Runs the fight forward by `dt` seconds of play (at most a tenth of a second at a time, so a stall never
    /// turns into a leap).
    public mutating func step(_ dt: Double) -> [FightEvent] {
        var ev: [FightEvent] = []
        guard outcome == nil else { return ev }
        accumulator += min(max(0, dt), 0.1)
        while accumulator >= Fight.tick && outcome == nil {
            accumulator -= Fight.tick
            tick(&ev)
        }
        return ev
    }

    mutating func tick(_ ev: inout [FightEvent]) {
        let t = Fight.tick
        time += t
        if isFighting { stats.time += t }
        if autopilot && ship.alive && isFighting {
            pilotClock -= t
            if pilotClock <= 0 {
                pilotClock = pilotReaction
                let decision = Pilot.decide(self)
                ship.target = decision.target
                if decision.nova { ev += detonate() }
            }
        }
        updateShip(t)
        updateShots(t, &ev)
        updateBoss(t, &ev)
        updateBullets(t, &ev)
        updateLasers(t, &ev)
        updateNova(t, &ev)
        stats.peakBullets = max(stats.peakBullets, bullets.count)
        if ending >= 0 {
            ending -= t
            if ending < 0, let o = endingOutcome { finish(o, &ev) }
        }
    }

    // MARK: The ship

    mutating func updateShip(_ t: Double) {
        guard ship.alive else { return }
        ship.invulnerable = max(0, ship.invulnerable - t)
        let d = ship.target - ship.pos
        let dist = d.length
        let old = ship.pos
        if dist > 1e-9 { ship.pos = ship.pos + d * (min(dist, loadout.shipSpeed * t) / dist) }
        ship.vel = (ship.pos - old) * (1 / t)
        ship.droneAngle += 3.2 * t
        guard boss.alive, isFighting else { return }

        ship.gunClock -= t
        if ship.gunClock <= 0 {
            ship.gunClock += loadout.fireInterval
            let n = loadout.barrels
            for k in 0..<n {
                let c = Double(k) - Double(n - 1) / 2
                shots.append(Shot(kind: .bolt, pos: ship.pos + Vec2(c * 4.5, 7), vel: Vec2.polar(.pi / 2 - c * 0.075, 480),
                                  damage: loadout.boltDamage))
            }
        }
        if loadout.missiles > 0 {
            ship.missileClock -= t
            if ship.missileClock <= 0 {
                ship.missileClock += 1.15
                for k in 0..<loadout.missiles {
                    let side: Double = k % 2 == 0 ? -1 : 1
                    let angle = .pi / 2 + side * (0.9 + 0.3 * Double(k / 2))
                    shots.append(Shot(kind: .missile, pos: ship.pos + Vec2(side * 6, 0), vel: Vec2.polar(angle, 150),
                                      damage: 4 * loadout.damageScale))
                }
            }
        }
        if loadout.drones > 0 {
            ship.droneClock -= t
            if ship.droneClock <= 0 {
                ship.droneClock += 0.16
                for k in 0..<loadout.drones {
                    shots.append(Shot(kind: .drone, pos: dronePosition(k) + Vec2(0, 4), vel: Vec2(0, 460),
                                      damage: 0.55 * loadout.damageScale))
                }
            }
        }
    }

    mutating func updateShots(_ t: Double, _ ev: inout [FightEvent]) {
        var mines: [Int] = []
        if boss.alive { for (k, b) in bullets.enumerated() where b.kind == .mine { mines.append(k) } }
        var killed: [Int] = []
        var i = 0
        while i < shots.count {
            var s = shots[i]
            s.age += t
            if s.kind == .missile {
                let speed = min(340, s.vel.length + 420 * t)
                var heading = s.vel.angle
                if boss.alive {
                    heading += clamp(angleDelta(heading, (boss.pos - s.pos).angle), -6.5 * t, 6.5 * t)
                }
                s.vel = Vec2.polar(heading, speed)
            }
            s.pos += s.vel * t
            var remove = Arena.isGone(s.pos, rising: false) || s.age > 3
            if !remove && boss.alive && isFighting {
                if let m = mines.first(where: { bullets[$0].hp > 0 && bullets[$0].pos.distanceSquared(to: s.pos) < pow(bullets[$0].radius + 2.5, 2) }) {
                    remove = true
                    bullets[m].hp -= s.damage
                    if bullets[m].hp <= 0 {
                        killed.append(m)
                        score += 25
                        ev.append(.mineKilled(bullets[m].pos))
                    }
                } else if s.pos.distanceSquared(to: boss.pos) < pow(boss.radius + 2, 2) {
                    remove = true
                    if boss.shielded > 0 {
                        ev.append(.bossShielded(s.pos))
                    } else {
                        let phase = boss.phase
                        damageBoss(s.damage, at: s.pos, &ev)
                        // A break or a kill wiped the field: the mine indices are stale.
                        if boss.phase != phase || !boss.alive {
                            mines = []
                            killed = []
                        }
                    }
                }
            }
            if remove {
                shots.swapAt(i, shots.count - 1)
                shots.removeLast()
            } else {
                shots[i] = s
                i += 1
            }
        }
        // A phase break may have wiped the field already; only mines still standing need removing.
        for m in killed.sorted(by: >) where m < bullets.count && bullets[m].kind == .mine && bullets[m].hp <= 0 {
            bullets.remove(at: m)
        }
    }

    mutating func damageBoss(_ amount: Double, at p: Vec2, charging: Bool = true, _ ev: inout [FightEvent]) {
        guard boss.alive, amount > 0 else { return }
        let dealt = min(amount, boss.hp)
        boss.hp -= dealt
        stats.damage += dealt
        score += Int((dealt * 10).rounded())
        boss.flash = 0.06
        if charging { addNova(dealt / boss.maxHP * 0.3, &ev) }
        ev.append(.bossHit(p))
        if boss.hp <= 1e-9 {
            destroyBoss(&ev)
        } else if boss.phase < 2 && boss.fraction <= (boss.phase == 0 ? 2.0 / 3 : 1.0 / 3) {
            breakPhase(&ev)
        }
    }

    mutating func addNova(_ amount: Double, _ ev: inout [FightEvent]) {
        let before = ship.nova
        ship.nova = min(1, ship.nova + amount)
        if before < 1 && ship.nova >= 1 { ev.append(.novaReady) }
    }

    mutating func breakPhase(_ ev: inout [FightEvent]) {
        boss.phase += 1
        boss.shielded = 1.3
        boss.attack = AttackState(resting: 1.5)
        boss.ambient = AttackState(resting: 2.2)
        boss.moveClock = 0
        lasers.removeAll()
        clearBullets(within: nil, of: boss.pos, &ev)
        ev.append(.bossPhase(boss.phase))
    }

    mutating func destroyBoss(_ ev: inout [FightEvent]) {
        boss.hp = 0
        boss.dying = 0
        lasers.removeAll()
        clearBullets(within: nil, of: boss.pos, &ev)
        ev.append(.bossDestroyed(boss.pos))
        ship.invulnerable = 10
        ending = 2.2
        endingOutcome = .victory
    }

    mutating func hurtShip(_ ev: inout [FightEvent]) {
        guard ship.alive, ship.invulnerable <= 0, isFighting else { return }
        if ship.shield {
            ship.shield = false
            ship.invulnerable = 1.2
            ev.append(.shieldAbsorbed(ship.pos))
            clearBullets(within: 45, of: ship.pos, &ev)
            return
        }
        ship.hull -= 1
        stats.hitsTaken += 1
        if ship.hull <= 0 {
            ship.hull = 0
            shots.removeAll()
            ev.append(.shipDestroyed(ship.pos))
            ending = 2.0
            endingOutcome = .defeat
        } else {
            ship.invulnerable = 2.0
            ev.append(.shipHit(ship.pos, hull: ship.hull))
            clearBullets(within: 55, of: ship.pos, &ev)
        }
    }

    /// Wipes bullets (all of them, or those within `radius`) and pays a little for each.
    mutating func clearBullets(within radius: Double?, of center: Vec2, _ ev: inout [FightEvent]) {
        var positions: [Vec2] = []
        let r2 = radius.map { $0 * $0 }
        bullets.removeAll { b in
            if let r2, b.pos.distanceSquared(to: center) >= r2 { return false }
            positions.append(b.pos)
            return true
        }
        guard !positions.isEmpty else { return }
        stats.cleared += positions.count
        score += 5 * positions.count
        ev.append(.cleared(positions))
    }

    mutating func finish(_ o: Outcome, _ ev: inout [FightEvent]) {
        outcome = o
        if o == .victory {
            var b = Bonus()
            b.kill = 250 * wave
            if stats.hitsTaken == 0 { b.flawless = 250 * wave }
            let par = 28 + 2 * Double(wave)
            if stats.time < par { b.speed = Int((par - stats.time) * 15 * Double(wave)) }
            bonus = b
            score += b.total
        }
        ev.append(.ended(o))
    }

    // MARK: The boss

    mutating func updateBoss(_ t: Double, _ ev: inout [FightEvent]) {
        boss.flash = max(0, boss.flash - t)
        if !boss.alive {
            boss.dying += t
            boss.pos.y += 6 * t
            return
        }
        boss.shielded = max(0, boss.shielded - t)
        let phase = boss.currentPhase
        boss.spin += t * (0.7 + 0.35 * Double(boss.phase))
        boss.moveClock -= t
        if boss.moveClock <= 0 {
            boss.moveClock = rng.range(1.6, 3.2) / phase.agility
            boss.home = Vec2(rng.range(48, Arena.width - 48), rng.range(214, 250))
        }
        boss.pos = boss.pos + (boss.home - boss.pos) * min(1, t * 1.7 * phase.agility)
        guard isFighting, ship.alive, boss.shielded <= 0 else { return }

        var state = boss.attack
        if state.resting > 0 {
            state.resting -= t
        } else if !phase.attacks.isEmpty {
            if state.index >= phase.attacks.count { state.index = 0 }
            let attack = phase.attacks[state.index]
            state.clock += t
            perform(attack, &state, t, &ev)
            if state.clock >= attack.duration {
                let next = (state.index + 1) % phase.attacks.count
                state = AttackState(resting: max(0.35, 0.9 - 0.3 * pressure))
                state.index = next
            }
        }
        boss.attack = state

        if let ambient = phase.ambient {
            var s = boss.ambient
            if s.resting > 0 {
                s.resting -= t
            } else {
                s.clock += t
                perform(ambient, &s, t, &ev)
            }
            boss.ambient = s
        }
    }

    mutating func spawn(_ b: Bullet) {
        if bullets.count < Fight.maxBullets { bullets.append(b) }
    }

    /// Fires whatever the attack fires this tick.
    mutating func perform(_ a: Attack, _ s: inout AttackState, _ t: Double, _ ev: inout [FightEvent]) {
        s.fireClock -= t
        guard s.fireClock <= 0 else { return }
        let r = boss.radius
        let center = boss.pos
        switch a.kind {
        case .ring:
            let n = max(1, a.count)
            for k in 0..<n {
                let angle = s.angle + Double(k) * 2 * .pi / Double(n)
                var b = Bullet(a.variant == 1 ? .orb : .pellet, tint: a.variant == 1 ? .accent : .primary,
                               pos: center + Vec2.polar(angle, r * 0.7), vel: Vec2.polar(angle, a.variant == 2 ? a.speed * 0.35 : a.speed))
                if a.variant == 2 {
                    b.accel = a.speed * 0.9
                    b.maxSpeed = a.speed * 1.3
                }
                spawn(b)
            }
            s.angle += a.spinRate
            s.fireClock += a.interval

        case .spiral:
            let arms = max(1, a.variant == 1 ? a.count - 1 : a.count)
            for k in 0..<arms {
                let angle = s.angle + Double(k) * 2 * .pi / Double(arms)
                spawn(Bullet(.pellet, pos: center + Vec2.polar(angle, r * 0.8), vel: Vec2.polar(angle, a.speed)))
                if a.variant == 1 {
                    let mirror = -s.angle + Double(k) * 2 * .pi / Double(arms)
                    spawn(Bullet(.pellet, tint: .accent, pos: center + Vec2.polar(mirror, r * 0.8), vel: Vec2.polar(mirror, a.speed * 0.9)))
                }
            }
            s.angle += a.spinRate * a.interval
            s.fireClock += a.interval

        case .fan:
            let origin = center + Vec2(0, -r * 0.6)
            let aim = (ship.pos - origin).angle
            let n = max(1, a.count)
            for layer in 0..<(a.variant == 2 ? 2 : 1) {
                for k in 0..<n {
                    let c = n > 1 ? Double(k) / Double(n - 1) - 0.5 : 0
                    let speed = a.speed * (a.variant == 1 ? 1.35 : 1) * (layer == 1 ? 0.72 : 1)
                    spawn(Bullet(a.variant == 1 ? .needle : .pellet, tint: .accent, pos: origin,
                                 vel: Vec2.polar(aim + c * a.spread, speed)))
                }
            }
            s.fireClock += a.interval

        case .stream:
            if s.count == 0 { s.aim = ship.pos }
            let origins = a.variant == 1
                ? [center + Vec2(-r, -4), center + Vec2(r, -4)]
                : [center + Vec2(0, -r * 0.6)]
            for o in origins {
                spawn(Bullet(.needle, tint: .hot, pos: o, vel: Vec2.polar((s.aim - o).angle, a.speed)))
            }
            s.count += 1
            if s.count >= a.count {
                s.count = 0
                s.fireClock += a.interval
            } else {
                s.fireClock += 0.06
            }

        case .fountain:
            for _ in 0..<max(1, a.count) {
                let angle = .pi / 2 + rng.range(-a.spread, a.spread)
                var b = Bullet(.pellet, tint: rng.chance(0.3) ? .accent : .primary, pos: center + Vec2.polar(angle, r * 0.6),
                               vel: Vec2.polar(angle, a.speed * rng.range(0.7, 1.15)))
                b.gravity = a.spinRate
                b.maxSpeed = 125
                spawn(b)
            }
            s.fireClock += a.interval

        case .laser:
            if a.variant == 0 {
                // Beams that start wide and close in: stand in the middle while they warn.
                let n = max(1, a.count)
                for k in 0..<n {
                    let c = n > 1 ? Double(k) / Double(n - 1) - 0.5 : 0
                    let firing = max(0.8, a.duration - 1.0)
                    // From a radian off vertical to within 0.18 of it: lanes stay open between the beams.
                    let sweep = 0.82 / firing * (c < 0 ? 1 : c > 0 ? -1 : 0)
                    lasers.append(Laser(offset: Vec2(c * r * 1.4, -r * 0.4), angle: -.pi / 2 + c * 2.0, sweep: sweep, warning: 1.0,
                                        firing: firing, width: 7, tracks: false))
                }
                s.fireClock = 1e9
            } else {
                let k = s.count % max(1, boss.design.turrets)
                let offset = boss.turret(k) - center
                lasers.append(Laser(offset: Vec2(offset.x, min(offset.y, -r * 0.3)), angle: (ship.pos - center).angle, sweep: 0,
                                    warning: 0.8, firing: 0.35, width: 5, tracks: true))
                s.count += 1
                s.fireClock += a.interval
            }

        case .mines:
            let target = ship.pos + Vec2(rng.range(-40, 40), rng.range(10, 60))
            let d = target - center
            var m = Bullet(.mine, tint: .accent, pos: center, vel: d.normalized * min(150, d.length * 1.1))
            m.accel = -m.vel.length * 0.7
            m.minSpeed = 8
            m.fuse = 1.9
            m.splits = a.count
            m.hp = 3 + 0.6 * Double(wave)
            spawn(m)
            s.fireClock += a.interval

        case .gate:
            if s.count == 0 {
                s.aim = Vec2(rng.range(50, Arena.width - 50), 0)
            } else {
                s.aim.x = clamp(s.aim.x + rng.range(-50, 50), 40, Arena.width - 40)
            }
            var x = 4.0
            while x < Arena.width - 2 {
                if abs(x - s.aim.x) > a.spread / 2 {
                    spawn(Bullet(a.variant == 1 ? .needle : .pellet, tint: .accent, pos: Vec2(x, Arena.height - 4), vel: Vec2(0, -a.speed)))
                }
                x += 11
            }
            s.count += 1
            s.fireClock += a.interval

        case .flower:
            let n = max(1, a.count)
            let sign: Double = s.count % 2 == 0 ? 1 : -1
            for k in 0..<n {
                let angle = s.angle + Double(k) * 2 * .pi / Double(n)
                var b = Bullet(.pellet, tint: sign > 0 ? .primary : .accent, pos: center + Vec2.polar(angle, r * 0.7),
                               vel: Vec2.polar(angle, a.speed))
                b.turn = sign * a.spinRate
                b.turnFor = 1.4
                spawn(b)
            }
            s.angle += 0.23
            s.count += 1
            s.fireClock += a.interval

        case .rain:
            spawn(Bullet(.needle, pos: Vec2(rng.range(6, Arena.width - 6), Arena.height + 6),
                         vel: Vec2(rng.range(-12, 12), -a.speed * rng.range(0.85, 1.15))))
            s.fireClock += a.interval

        case .snake:
            let origin = center + Vec2(0, -r * 0.5)
            if s.count == 0 { s.angle = (ship.pos - origin).angle }
            let headings = a.variant == 1 ? [s.angle - 0.45, s.angle, s.angle + 0.45] : [s.angle]
            for h in headings {
                var b = Bullet(.pellet, tint: .hot, pos: origin, vel: Vec2.polar(h, a.speed))
                b.wiggle = a.spinRate
                spawn(b)
            }
            s.count += 1
            if s.count >= a.count {
                s.count = 0
                s.fireClock += a.interval
            } else {
                s.fireClock += 0.06
            }

        case .sweep:
            if s.count == 0 {
                s.aim.x = clamp(angleDelta(-.pi / 2, (ship.pos - center).angle), -0.5, 0.5)
            }
            let angle = -.pi / 2 + s.aim.x + sin(s.clock * a.spinRate) * a.spread
            spawn(Bullet(.pellet, tint: .hot, pos: center + Vec2.polar(angle, r * 0.8), vel: Vec2.polar(angle, a.speed)))
            s.count += 1
            s.fireClock += a.interval
        }
        // Never fall behind by more than one volley (a long stall is not a barrage).
        if s.fireClock < 0 { s.fireClock = 0 }
    }

    // MARK: Bullets, beams and the nova

    mutating func updateBullets(_ t: Double, _ ev: inout [FightEvent]) {
        let canHit = ship.alive && ship.invulnerable <= 0 && isFighting
        let grazeReach = loadout.grazeRadius
        let burstSpeed = 68 * (1 + 0.4 * pressure)
        var hit = false
        var bursts: [Bullet] = []
        var i = 0
        while i < bullets.count {
            var b = bullets[i]
            b.age += t
            if b.accel != 0 {
                let speed = b.vel.length
                let next = clamp(speed + b.accel * t, b.minSpeed, b.maxSpeed)
                if speed > 1e-9 { b.vel = b.vel * (next / speed) }
            }
            let turning = b.age < b.turnFor ? b.turn : 0
            if turning != 0 || b.wiggle != 0 {
                b.vel = b.vel.rotated((turning + b.wiggle * cos(b.age * 7)) * t)
            }
            if b.gravity != 0 {
                b.vel.y -= b.gravity * t
                let speed = b.vel.length
                if speed > b.maxSpeed { b.vel = b.vel * (b.maxSpeed / speed) }
            }
            b.pos += b.vel * t
            var remove = Arena.isGone(b.pos, rising: b.gravity > 0) || b.age > 14
            if !remove && b.fuse >= 0 {
                b.fuse -= t
                if b.fuse < 0 {
                    remove = true
                    ev.append(.mineBurst(b.pos))
                    let n = max(1, b.splits)
                    let offset = rng.range(0, 2 * .pi)
                    for k in 0..<n {
                        let angle = offset + Double(k) * 2 * .pi / Double(n)
                        bursts.append(Bullet(.pellet, tint: .accent, pos: b.pos + Vec2.polar(angle, 3), vel: Vec2.polar(angle, burstSpeed)))
                    }
                }
            }
            if !remove && canHit && !hit {
                let d2 = b.pos.distanceSquared(to: ship.pos)
                let reach = b.hitRadius + Ship.hitRadius
                if d2 < reach * reach {
                    remove = true
                    hit = true
                } else if !b.grazed && d2 < pow(grazeReach + b.radius, 2) {
                    b.grazed = true
                    stats.grazes += 1
                    score += 10
                    addNova(0.028 * loadout.grazeGain, &ev)
                    ev.append(.graze(b.pos))
                }
            }
            if remove {
                bullets.swapAt(i, bullets.count - 1)
                bullets.removeLast()
            } else {
                bullets[i] = b
                i += 1
            }
        }
        for b in bursts { spawn(b) }
        if hit { hurtShip(&ev) }
    }

    mutating func updateLasers(_ t: Double, _ ev: inout [FightEvent]) {
        var hit = false
        var i = 0
        while i < lasers.count {
            var l = lasers[i]
            l.age += t
            let origin = boss.pos + l.offset
            if l.tracks {
                if l.warning > 0.3 {
                    l.angle += clamp(angleDelta(l.angle, (ship.pos - origin).angle), -3 * t, 3 * t)
                } else {
                    if l.lock == nil { l.lock = ship.pos }
                    if let lock = l.lock { l.angle = (lock - origin).angle }
                }
            }
            if l.warning > 0 {
                l.warning -= t
                if l.warning <= 0 { ev.append(.laserFired(origin)) }
            } else {
                l.firing -= t
                l.angle += l.sweep * t
                if ship.alive && ship.invulnerable <= 0 && isFighting
                    && distanceToRay(ship.pos, origin: origin, angle: l.angle) < l.width / 2 + 1 {
                    hit = true
                }
            }
            if l.firing <= 0 || !boss.alive {
                lasers.remove(at: i)
            } else {
                lasers[i] = l
                i += 1
            }
        }
        if hit { hurtShip(&ev) }
    }

    mutating func updateNova(_ t: Double, _ ev: inout [FightEvent]) {
        guard novaRadius >= 0 else { return }
        novaRadius += 460 * t
        clearBullets(within: novaRadius, of: novaOrigin, &ev)
        if novaRadius > 420 { novaRadius = -1 }
    }
}
