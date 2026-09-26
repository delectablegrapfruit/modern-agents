import AppKit
import SpriteKit
import SkirmishCore

/// An outpost on screen: a dark disc ringed in its holder's colour, a slow dashed orbit, a mark for its kind,
/// the garrison count, and a halo of light.
@MainActor
final class OutpostSprite: SKNode {
    let index: Int
    let kind: Outpost.Kind
    private(set) var owner: Int
    private(set) var radius: CGFloat = 10

    private let halo = SKSpriteNode(texture: Art.glow)
    private let orbit = SKShapeNode()
    private let body = SKShapeNode()
    private let emblem = SKShapeNode()
    private let label = Art.label(Art.numberFont, size: 10, color: .white)
    private let selectRing = SKShapeNode()
    private let targetRing = SKShapeNode()
    private var shown = -1

    init(outpost: Outpost) {
        index = outpost.id
        kind = outpost.kind
        owner = outpost.owner
        super.init()
        halo.blendMode = .add
        halo.colorBlendFactor = 1
        halo.zPosition = -2
        orbit.zPosition = -1
        orbit.lineWidth = 1
        orbit.lineCap = .round
        body.lineWidth = 1.6
        emblem.lineWidth = 1
        emblem.fillColor = .clear
        label.zPosition = 2
        selectRing.lineWidth = 1.5
        selectRing.fillColor = .clear
        selectRing.strokeColor = SKColor(white: 1, alpha: 0.9)
        selectRing.isHidden = true
        targetRing.lineWidth = 1.5
        targetRing.fillColor = .clear
        targetRing.isHidden = true
        for node in [halo, orbit, body, emblem, label, selectRing, targetRing] as [SKNode] { addChild(node) }
        orbit.run(.repeatForever(.rotate(byAngle: -.pi * 2, duration: kind == .citadel ? 9 : 16)))
        halo.run(.repeatForever(.sequence([
            .fadeAlpha(by: 0.08, duration: 1.4),
            .fadeAlpha(by: -0.08, duration: 1.4),
        ])))
        selectRing.run(.repeatForever(.sequence([.scale(to: 1.08, duration: 0.45), .scale(to: 1, duration: 0.45)])))
        paint(RGB.of(owner), owner: owner)
    }

    required init?(coder aDecoder: NSCoder) { nil }

    func layout(radius r: CGFloat) {
        radius = r
        halo.size = CGSize(width: r * 4.6, height: r * 4.6)
        body.path = Art.circle(r)
        let orbitRadius = r + max(3, r * 0.3)
        orbit.path = Art.circle(orbitRadius).copy(dashingWithPhase: 0, lengths: [orbitRadius * 0.42, orbitRadius * 0.3])
        emblem.path = emblemPath(r)
        label.fontSize = max(9, r * 0.8)
        selectRing.path = Art.circle(orbitRadius + 3)
        let targetRadius = orbitRadius + 4
        targetRing.path = Art.circle(targetRadius).copy(dashingWithPhase: 0, lengths: [targetRadius * 0.25, targetRadius * 0.18])
    }

    private func emblemPath(_ r: CGFloat) -> CGPath {
        switch kind {
        case .relay:
            return Art.circle(r * 0.62).copy(dashingWithPhase: 0, lengths: [r * 0.3, r * 0.35])
        case .outpost:
            return Art.circle(r * 0.72)
        case .stronghold:
            return Art.polygon(sides: 6, radius: r * 0.8, rotation: .pi / 6)
        case .citadel:
            let path = CGMutablePath()
            path.addPath(Art.polygon(sides: 6, radius: r * 0.8, rotation: .pi / 6))
            path.addPath(Art.polygon(sides: 6, radius: r * 0.62))
            // Battlements: six teeth outside the wall.
            for k in 0..<6 {
                let a = CGFloat(k) * .pi / 3
                path.move(to: CGPoint(x: cos(a) * (r + 1), y: sin(a) * (r + 1)))
                path.addLine(to: CGPoint(x: cos(a) * (r + r * 0.3), y: sin(a) * (r + r * 0.3)))
            }
            return path
        }
    }

    private func paint(_ c: RGB, owner: Int) {
        let neutral = owner == Side.neutral
        body.fillColor = c.scaled(neutral ? 0.18 : 0.24).mix(Palette.background, 0.3).color(0.96)
        body.strokeColor = c.color(neutral ? 0.75 : 1)
        orbit.strokeColor = c.color(neutral ? 0.22 : 0.6)
        emblem.strokeColor = c.color(neutral ? 0.3 : 0.5)
        halo.color = c.color()
        halo.alpha = neutral ? 0.1 : 0.34
        label.fontColor = neutral ? Palette.ink.color(0.72) : .white
        targetRing.strokeColor = c.color(0.9)
    }

    func setOwner(_ newOwner: Int, animated: Bool) {
        guard newOwner != owner else { return }
        let from = RGB.of(owner), to = RGB.of(newOwner)
        owner = newOwner
        removeAction(forKey: "paint")
        guard animated else { paint(to, owner: newOwner); return }
        run(tween(0.4) { [weak self] t in self?.paint(from.mix(to, t), owner: newOwner) }, withKey: "paint")
        label.run(.sequence([.scale(to: 1.5, duration: 0.08), .scale(to: 1, duration: 0.3)]))
    }

    func setTroops(_ n: Int) {
        guard n != shown else { return }
        shown = n
        label.text = "\(n)"
    }

    func setSelected(_ on: Bool) { selectRing.isHidden = !on }

    func setTargeted(_ on: Bool) { targetRing.isHidden = !on }

    /// A reinforcement landing: the halo breathes in.
    func pulse() {
        halo.run(.sequence([.scale(to: 1.25, duration: 0.1), .scale(to: 1, duration: 0.25)]))
    }

    /// A blow that did not break it.
    func jolt(_ strength: CGFloat) {
        body.removeAction(forKey: "jolt")
        let d = min(3, strength)
        body.run(.sequence([
            .moveBy(x: d, y: 0, duration: 0.03), .moveBy(x: -2 * d, y: 0, duration: 0.05),
            .moveBy(x: d, y: 0, duration: 0.03),
        ]), withKey: "jolt")
    }

    /// Nothing to send: a quick shake no.
    func refuse() {
        run(.sequence([.moveBy(x: 3, y: 0, duration: 0.04), .moveBy(x: -6, y: 0, duration: 0.06), .moveBy(x: 3, y: 0, duration: 0.04)]))
    }
}

/// A fleet on screen: a V of chevrons with an exhaust trail and its strength beside it.
@MainActor
final class FleetSprite: SKNode {
    let id: Int
    let owner: Int
    private let formation = SKNode()
    private let label: SKLabelNode
    private let trail: SKEmitterNode
    private let scale: CGFloat

    init(fleet: Fleet, scale: CGFloat, trailTarget: SKNode) {
        id = fleet.id
        owner = fleet.owner
        self.scale = scale
        let color = RGB.of(fleet.owner)
        label = Art.label(Art.numberFont, size: max(7, 8 * scale), color: color.mix(RGB(1, 1, 1), 0.45).color(0.95))
        trail = Art.trail(color, scale: scale, target: trailTarget)
        super.init()
        addChild(formation)
        addChild(label)
        formation.addChild(trail)
        let glow = SKSpriteNode(texture: Art.glow)
        glow.size = CGSize(width: 22 * scale, height: 22 * scale)
        glow.color = color.color()
        glow.colorBlendFactor = 1
        glow.blendMode = .add
        glow.alpha = 0.55
        formation.addChild(glow)
        let ships = min(12, max(1, Int((Double(fleet.count) / 4).rounded(.up))))
        var jitter = SeededRNG(seed: UInt64(fleet.id) &+ 17)
        for k in 0..<ships {
            let ship = SKSpriteNode(texture: Art.ship)
            ship.size = CGSize(width: 11 * scale, height: 7.5 * scale)
            ship.color = color.mix(RGB(1, 1, 1), 0.25).color()
            ship.colorBlendFactor = 1
            let row = CGFloat((k + 1) / 2)
            let side: CGFloat = k == 0 ? 0 : (k % 2 == 0 ? 1 : -1)
            ship.position = CGPoint(x: -row * 6.5 * scale + CGFloat(jitter.range(-1, 1)) * scale,
                                    y: side * row * 4 * scale + CGFloat(jitter.range(-0.8, 0.8)) * scale)
            formation.addChild(ship)
        }
        label.text = "\(fleet.count)"
        label.position = CGPoint(x: 0, y: 10 * scale)
    }

    required init?(coder aDecoder: NSCoder) { nil }

    func place(at point: CGPoint, heading: CGFloat) {
        position = point
        formation.zRotation = heading
    }

    /// Lands: the ships go, the exhaust lingers and fades where it was.
    func land(leavingTrailIn layer: SKNode) {
        trail.particleBirthRate = 0
        trail.move(toParent: layer)
        trail.run(.sequence([.wait(forDuration: 0.6), .removeFromParent()]))
        removeFromParent()
    }
}

extension RGB {
    static func of(_ faction: Int) -> RGB { Palette.faction(faction) }
}
