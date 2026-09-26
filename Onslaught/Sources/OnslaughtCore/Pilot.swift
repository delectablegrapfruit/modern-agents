import Foundation

/// A capable autopilot: it looks half a second ahead along every bullet's path, picks the nearby spot least likely
/// to be hit (keeping under the boss to land its shots), and sets off the nova when it is cornered. The self-test and
/// the balance simulator fly with it.
public enum Pilot {
    public struct Decision: Equatable, Sendable {
        public var target: Vec2
        public var nova: Bool
    }

    static let horizon: [Double] = [0.03, 0.08, 0.14, 0.21, 0.29, 0.38, 0.5]
    static let rings: [(radius: Double, turn: Double)] = [(7, 0), (15, .pi / 12), (26, 0), (40, .pi / 12), (60, 0)]

    public static func decide(_ f: Fight) -> Decision {
        let ship = f.ship
        let speed = f.loadout.shipSpeed
        var candidates: [Vec2] = [ship.pos, Vec2(f.boss.pos.x, 45), Vec2(f.boss.pos.x, ship.pos.y)]
        for ring in rings {
            for k in 0..<12 { candidates.append(ship.pos + Vec2.polar(Double(k) * .pi / 6 + ring.turn, ring.radius)) }
        }
        let near = f.bullets.filter { $0.pos.distanceSquared(to: ship.pos) < 130 * 130 }
        var best = ship.pos, bestCost = Double.infinity, bestDanger = 0.0
        for raw in candidates {
            let p = Arena.clampShip(raw)
            let risk = danger(at: p, from: ship.pos, speed: speed, bullets: near, fight: f)
            var cost = risk * 100
            cost += abs(p.x - f.boss.pos.x) * 0.05
            cost += abs(p.y - 50) * 0.02
            if p.x < 18 || p.x > Arena.width - 18 { cost += 1.5 }
            if p.y < 16 { cost += 1.5 }
            cost += p.distance(to: ship.pos) * 0.004
            if cost < bestCost {
                bestCost = cost
                best = p
                bestDanger = risk
            }
        }
        let nova = ship.nova >= 1 && (bestDanger > 0.35 || (ship.hull == 1 && bestDanger > 0.05))
        return Decision(target: best, nova: nova)
    }

    static func danger(at p: Vec2, from start: Vec2, speed: Double, bullets: [Bullet], fight f: Fight) -> Double {
        let delta = p - start
        let dist = delta.length
        var danger = 0.0
        for b in bullets {
            let reach = b.hitRadius + Ship.hitRadius + 3.2
            let reach2 = reach * reach
            for t in horizon {
                let along = dist > 1e-6 ? min(1, t * speed / dist) : 1
                let sp = start + delta * along
                var bp = b.pos + b.vel * t
                if b.gravity != 0 { bp.y -= 0.5 * b.gravity * t * t }
                if sp.distanceSquared(to: bp) < reach2 {
                    danger += 1 / (1 + 4 * t)
                    break
                }
            }
        }
        for laser in f.lasers where laser.isLive || laser.warning < 0.45 {
            let origin = f.laserOrigin(laser)
            for t in [0.0, 0.2, 0.45] {
                let angle = laser.angle + (laser.isLive ? laser.sweep * t : 0)
                if distanceToRay(p, origin: origin, angle: angle) < laser.width / 2 + 7 {
                    danger += 2
                    break
                }
            }
        }
        return danger
    }
}
