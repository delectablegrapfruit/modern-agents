import AppKit
import SpriteKit
import OnslaughtCore

/// The boss on screen, built from its design: a glowing hull (a polygon or a star), an inner armour plate, turning
/// dashed rings, turrets riding the rim, and a pulsing core. It runs hotter with every phase.
@MainActor
final class BossNode: SKNode {
    let design: BossDesign
    private let halo: SKSpriteNode
    private let hull = SKShapeNode()
    private let outline = SKShapeNode()
    private let armor = SKShapeNode()
    private let ringHolder = SKNode()
    private var turrets: [SKShapeNode] = []
    private let core = SKShapeNode()
    private let coreGlow: SKSpriteNode
    private let shield: SKSpriteNode
    private var shownPhase = -1
    private var flashing = false
    private var color: RGB
    private var accent: RGB

    init(design: BossDesign) {
        self.design = design
        let hot = Palette.boss(design)
        let cool = Palette.accent(design)
        color = hot
        accent = cool
        let r = CGFloat(design.radius)
        halo = Art.glowSprite(hot, size: r * 5.2, alpha: 0.4)
        coreGlow = Art.glowSprite(hot.mix(.white, 0.4), size: r * 1.6, alpha: 0.9)
        shield = SKSpriteNode(texture: Art.ring)
        super.init()

        halo.zPosition = -3
        addChild(halo)
        halo.run(.repeatForever(.sequence([.fadeAlpha(to: 0.28, duration: 1.1), .fadeAlpha(to: 0.45, duration: 1.1)])))

        ringHolder.zPosition = -2
        addChild(ringHolder)
        for k in 0..<max(1, design.rings) {
            let rr = r * (1.3 + 0.2 * CGFloat(k))
            let ring = SKShapeNode(path: Art.circle(rr).copy(dashingWithPhase: 0, lengths: [rr * 0.35, rr * 0.22]))
            ring.strokeColor = cool.color(0.45 - 0.12 * CGFloat(k))
            ring.lineWidth = 1.2
            ring.fillColor = .clear
            let direction: CGFloat = k % 2 == 0 ? -1 : 1
            ring.run(.repeatForever(.rotate(byAngle: direction * .pi * 2, duration: 7 + 3 * Double(k))))
            ringHolder.addChild(ring)
        }

        let body: CGPath = design.spikes > 0
            ? Art.star(points: design.sides, outer: r * 1.12, inner: r * 0.8, rotation: .pi / 2)
            : Art.polygon(sides: design.sides, radius: r, rotation: .pi / 2)
        hull.path = body
        hull.lineWidth = 1.6
        hull.lineJoin = .round
        addChild(hull)
        if design.heavy {
            outline.path = design.spikes > 0
                ? Art.star(points: design.sides, outer: r * 1.26, inner: r * 0.92, rotation: .pi / 2)
                : Art.polygon(sides: design.sides, radius: r * 1.14, rotation: .pi / 2)
            outline.lineWidth = 1
            outline.fillColor = .clear
            addChild(outline)
        }
        armor.path = Art.polygon(sides: max(3, design.sides), radius: r * 0.62, rotation: .pi / 2 + .pi / CGFloat(max(3, design.sides)))
        armor.lineWidth = 1
        addChild(armor)

        for _ in 0..<max(1, design.turrets) {
            let turret = SKShapeNode(path: Art.circle(r * 0.13))
            turret.lineWidth = 1
            turret.zPosition = 1
            addChild(turret)
            turrets.append(turret)
        }

        core.path = Art.circle(r * 0.24)
        core.strokeColor = .clear
        core.zPosition = 2
        addChild(core)
        coreGlow.zPosition = 3
        coreGlow.blendMode = .add
        addChild(coreGlow)
        coreGlow.run(.repeatForever(.sequence([.scale(to: 1.25, duration: 0.5), .scale(to: 0.9, duration: 0.5)])))

        shield.size = CGSize(width: r * 3.1, height: r * 3.1)
        shield.color = Palette.ink.color()
        shield.colorBlendFactor = 1
        shield.blendMode = .add
        shield.alpha = 0
        shield.zPosition = 4
        addChild(shield)
        paint(phase: 0)
    }

    required init?(coder aDecoder: NSCoder) { nil }

    /// Hotter with every phase: the hull brightens towards white-gold.
    private func paint(phase: Int) {
        shownPhase = phase
        let heat = CGFloat(phase) * 0.22
        color = Palette.boss(design).mix(RGB(1, 0.9, 0.6), heat)
        accent = Palette.accent(design).mix(.white, heat * 0.6)
        hull.fillColor = color.scaled(0.22).mix(Palette.background, 0.25).color(0.97)
        hull.strokeColor = color.color()
        outline.strokeColor = accent.color(0.55)
        armor.strokeColor = accent.color(0.6)
        armor.fillColor = color.scaled(0.12).color(0.9)
        for turret in turrets {
            turret.fillColor = color.scaled(0.4).color()
            turret.strokeColor = accent.color()
        }
        core.fillColor = color.mix(.white, 0.55).color()
        halo.color = color.color()
        coreGlow.color = color.mix(.white, 0.4).color()
        coreGlow.speed = 1 + CGFloat(phase) * 0.8
    }

    func update(_ boss: Boss, clock: Double) {
        position = CGPoint(x: boss.pos.x, y: boss.pos.y)
        if boss.phase != shownPhase { paint(phase: boss.phase) }
        let spin = CGFloat(boss.spin)
        let r = CGFloat(design.radius)
        for (k, turret) in turrets.enumerated() {
            let a = spin + CGFloat(k) * 2 * .pi / CGFloat(turrets.count)
            turret.position = CGPoint(x: cos(a) * r * 0.92, y: sin(a) * r * 0.92)
        }
        hull.zRotation = spin * 0.18
        outline.zRotation = -spin * 0.1
        armor.zRotation = -spin * 0.35
        let flash = boss.flash > 0
        if flash != flashing {
            flashing = flash
            hull.fillColor = flash ? color.mix(.white, 0.55).color(0.97) : color.scaled(0.22).mix(Palette.background, 0.25).color(0.97)
        }
        shield.alpha = boss.shielded > 0 ? 0.35 + 0.25 * CGFloat(sin(clock * 30)) : 0
        if !boss.alive {
            let t = CGFloat(boss.dying)
            let jitter = min(3, t * 2.5)
            position.x += CGFloat.random(in: -jitter...jitter)
            position.y += CGFloat.random(in: -jitter...jitter)
            alpha = max(0, 1 - max(0, t - 1.2) * 2.5)
            setScale(1 + t * 0.06)
        } else {
            alpha = 1
            setScale(1)
        }
    }

    /// A phase break: the boss swells and snaps back.
    func punch() {
        run(.sequence([.scale(to: 1.18, duration: 0.07), .scale(to: 1, duration: 0.3)]))
    }
}

/// The player's interceptor, its engine, the nova gauge around it, its drones and the deflector bubble.
@MainActor
final class ShipNode: SKNode {
    private let body = SKSpriteNode(texture: Art.ship)
    private let glow = Art.glowSprite(Palette.player, size: 42, alpha: 0.45)
    private let flame = SKSpriteNode(texture: Art.spark)
    private let core = SKShapeNode(circleOfRadius: 1.6)
    private let gauge = SKShapeNode()
    private let gaugeTrack = SKShapeNode(circleOfRadius: 12)
    private let bubble = SKSpriteNode(texture: Art.ring)
    private var drones: [SKSpriteNode] = []
    private var shownNova = -1.0

    override init() {
        super.init()
        glow.zPosition = -2
        addChild(glow)
        flame.size = CGSize(width: 7, height: 12)
        flame.position = CGPoint(x: 0, y: -8)
        flame.color = Palette.player.mix(.white, 0.3).color()
        flame.colorBlendFactor = 1
        flame.blendMode = .add
        flame.zPosition = -1
        addChild(flame)
        flame.run(.repeatForever(.sequence([
            .group([.scaleY(to: 1.25, duration: 0.05), .fadeAlpha(to: 1, duration: 0.05)]),
            .group([.scaleY(to: 0.8, duration: 0.06), .fadeAlpha(to: 0.7, duration: 0.06)]),
        ])))
        body.size = CGSize(width: 14, height: 16)
        addChild(body)
        core.fillColor = .white
        core.strokeColor = Palette.player.color()
        core.lineWidth = 0.6
        core.zPosition = 2
        addChild(core)
        gaugeTrack.strokeColor = SKColor(white: 1, alpha: 0.08)
        gaugeTrack.lineWidth = 1.2
        gaugeTrack.fillColor = .clear
        addChild(gaugeTrack)
        gauge.lineWidth = 1.6
        gauge.lineCap = .round
        gauge.fillColor = .clear
        gauge.strokeColor = Palette.gold.color()
        addChild(gauge)
        bubble.size = CGSize(width: 30, height: 30)
        bubble.color = Palette.player.color()
        bubble.colorBlendFactor = 1
        bubble.blendMode = .add
        bubble.alpha = 0
        addChild(bubble)
    }

    required init?(coder aDecoder: NSCoder) { nil }

    func update(_ fight: Fight, clock: Double, in layer: SKNode) {
        let ship = fight.ship
        isHidden = !ship.alive
        position = CGPoint(x: ship.pos.x, y: ship.pos.y)
        // Bank into turns: the delta narrows as it slides sideways.
        let bank = CGFloat(max(-1, min(1, ship.vel.x / 300)))
        body.xScale = 1 - abs(bank) * 0.35
        body.zRotation = -bank * 0.12
        let blink = ship.invulnerable > 0 && fight.isFighting && Int(clock * 16) % 2 == 0
        body.alpha = blink ? 0.25 : 1
        bubble.alpha = ship.shield ? 0.5 + 0.15 * CGFloat(sin(clock * 4)) : 0

        let nova = (ship.nova * 40).rounded() / 40
        if nova != shownNova {
            shownNova = nova
            if nova >= 1 {
                gauge.path = Art.circle(12)
            } else if nova > 0 {
                let path = CGMutablePath()
                path.addArc(center: .zero, radius: 12, startAngle: .pi / 2, endAngle: .pi / 2 - CGFloat(nova) * 2 * .pi, clockwise: true)
                gauge.path = path
            } else {
                gauge.path = nil
            }
        }
        if nova >= 1 {
            gauge.alpha = 0.6 + 0.4 * CGFloat(sin(clock * 9))
            gauge.glowWidth = 0
        } else {
            gauge.alpha = 0.75
        }

        while drones.count < fight.loadout.drones {
            let drone = SKSpriteNode(texture: Art.drone)
            drone.size = CGSize(width: 7, height: 7)
            let light = Art.glowSprite(Palette.player, size: 18, alpha: 0.5)
            light.zPosition = -1
            drone.addChild(light)
            layer.addChild(drone)
            drones.append(drone)
        }
        for (k, drone) in drones.enumerated() {
            let p = fight.dronePosition(k)
            drone.position = CGPoint(x: p.x, y: p.y)
            drone.isHidden = !ship.alive || k >= fight.loadout.drones
        }
    }

    func removeDrones() {
        drones.forEach { $0.removeFromParent() }
        drones = []
    }
}
