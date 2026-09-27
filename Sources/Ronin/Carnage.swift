import AppKit
import SpriteKit
import RoninArt
import RoninCore

/// The dead, and what is left of them. A cut foe comes apart along the line of the cut: the top half is flung away
/// tumbling, trailing blood, while the legs stand a moment with blood pumping from the stump before they go over; a
/// head flies off and the body under it kneels and falls; a foe run through is thrown back and goes down whole.
/// Everything lands, bounces once, and stays where it falls for the rest of the stage, heaped on what fell before:
/// the ground keeps a height at every point, raised by each body that settles there, so the dead pile up and the
/// living climb over them. Blood pools under the bodies and spatters the ground around them.
@MainActor
final class Carnage {
    /// Bodies, living foes' feet stand on them. Drawn behind the living.
    let corpses = SKNode()
    /// Pools and spatter on the ground, under the bodies.
    let stains = SKNode()
    /// Where blood already spilled is left (so a trail stays where it fell as a body flies on).
    private let trails: SKNode

    private final class Body {
        enum State { case falling, standing, flying, resting }
        let node: SKSpriteNode
        let cast: Cast
        var state: State
        var velocity = CGVector.zero
        var spin: CGFloat = 0
        var clock = 0.0
        var standFor = 0.0
        var bounced = false
        /// A body that goes down whole plays its dying frames first.
        var frames: [Frame] = []
        var facing: CGFloat = 1
        var jet: SKEmitterNode?
        /// A weapon: it lies flat and hardly adds to the heap.
        var thin = false
        var jetRate: CGFloat = 0
        var jetFor = 0.0

        init(node: SKSpriteNode, cast: Cast, state: State) {
            self.node = node
            self.cast = cast
            self.state = state
        }
    }

    private var bodies: [Body] = []
    private var heights: [CGFloat] = []
    private let column: CGFloat = 2
    private var field = CGRect.zero
    private var groundY: CGFloat = 0
    private var ronin: CGFloat = 60
    private var heroX: CGFloat = 0
    private var layer: CGFloat = 0
    private var pools: [SKNode] = []
    private var specks: [SKNode] = []
    private var clock = 0.0

    init(trails: SKNode) {
        self.trails = trails
    }

    /// A new stage, or a new size: the lane swept clean.
    func reset(field: CGRect, groundY: CGFloat, ronin: CGFloat, heroX: CGFloat) {
        self.field = field
        self.groundY = groundY
        self.ronin = ronin
        self.heroX = heroX
        bodies.removeAll()
        corpses.removeAllChildren()
        stains.removeAllChildren()
        pools.removeAll()
        specks.removeAll()
        heights = Array(repeating: 0, count: max(1, Int((field.width / column).rounded(.up)) + 1))
        layer = 0
    }

    var count: Int { bodies.count }
    var heaped: CGFloat { heights.max() ?? 0 }

    /// How high the dead are piled under a stretch of the lane `width` wide about `x`.
    func footing(at x: CGFloat, width: CGFloat) -> CGFloat {
        guard !heights.isEmpty else { return 0 }
        let a = max(0, Int((x - width / 2 - field.minX) / column)), b = min(heights.count - 1, Int((x + width / 2 - field.minX) / column))
        guard a <= b else { return 0 }
        return heights[a...b].max() ?? 0
    }

    private var cap: CGFloat { ronin * 0.3 }
    private var gravity: CGFloat { ronin * 9 }

    // MARK: The dying

    /// Cuts a foe apart where he stood (`feet`, facing +1 right or −1 left), throwing the upper part away from the
    /// ronin (`away`, ±1). `force` scales everything for the big ones.
    func sever(_ cast: Cast, _ severance: Figures.Severance, feet: CGPoint, facing: CGFloat, away: CGFloat, force: CGFloat = 1) {
        let full = Figures.size(cast, ronin: ronin)
        for part in Figures.parts(cast, severance) {
            let node = SKSpriteNode(texture: part.texture)
            node.size = CGSize(width: full.width * part.rect.width, height: full.height * part.rect.height)
            node.xScale = facing
            node.position = CGPoint(x: feet.x + facing * (part.rect.midX - Figure.anchor.x) * full.width,
                                    y: feet.y + (part.rect.midY - Figure.anchor.y) * full.height)
            layer += 0.01
            node.zPosition = layer
            corpses.addChild(node)
            let body = Body(node: node, cast: cast, state: .flying)
            body.facing = facing
            // Blood from the wound: a jet on what stays standing, a trail on what flies.
            let wound = CGPoint(x: (part.wound.x - part.rect.midX) * full.width, y: (part.wound.y - part.rect.midY) * full.height)
            let jet = Art.spurt(Palette.blood.mix(.black, 0.25), rate: 160 * force, speed: ronin * (part.upper ? 0.5 : 1.6),
                                size: ronin * 0.045, angle: part.woundAngle, spread: 0.35, gravity: gravity * 0.8, into: trails)
            jet.position = wound
            node.addChild(jet)
            body.jet = jet
            body.jetRate = 160 * force
            body.jetFor = part.upper ? 0.7 : 1.5
            if part.upper {
                // Flung: up and away, turning over.
                let lift: CGFloat = severance == .head ? 2.6 : severance == .legs ? 0.6 : 1.3
                body.velocity = CGVector(dx: away * ronin * CGFloat.random(in: 1.0...2.0) * force,
                                         dy: ronin * CGFloat.random(in: 0.8...1.3) * lift * force)
                body.spin = -away * CGFloat.random(in: 3...8) * (severance == .head ? 2 : 1)
            } else {
                // Left standing, pumping blood, until the knees go.
                body.state = .standing
                body.standFor = Double.random(in: 0.35...0.7) * (severance == .head ? 1.4 : 1)
            }
            bodies.append(body)
        }
        drop(cast, feet: feet, facing: facing, away: away, force: force)
        spatter(around: feet.x, count: Int(10 * force))
        trim()
    }

    /// His weapon, out of his hand: flung up turning end over end, to clatter down flat on the heap.
    private func drop(_ cast: Cast, feet: CGPoint, facing: CGFloat, away: CGFloat, force: CGFloat) {
        let piece = Figures.weapon(cast)
        let full = Figures.size(cast, ronin: ronin)
        let node = SKSpriteNode(texture: piece.texture)
        node.size = CGSize(width: full.width * piece.rect.width, height: full.height * piece.rect.height)
        node.xScale = facing
        node.zRotation = CGFloat.random(in: -0.8...0.8)
        node.position = CGPoint(x: feet.x, y: feet.y + full.height * 0.35)
        layer += 0.01
        node.zPosition = layer
        corpses.addChild(node)
        let body = Body(node: node, cast: cast, state: .flying)
        body.velocity = CGVector(dx: away * ronin * CGFloat.random(in: 0.3...1.1) * force, dy: ronin * CGFloat.random(in: 1.2...2.2))
        body.spin = CGFloat.random(in: -9...9)
        body.facing = facing
        body.thin = true
        bodies.append(body)
    }

    /// A foe run through or shot: thrown back, the knees going, down on his back.
    func fell(_ cast: Cast, feet: CGPoint, facing: CGFloat, force: CGFloat = 1) {
        let node = SKSpriteNode()
        Figures.apply(node, cast, .die(0), ronin: ronin)
        node.xScale = facing
        node.position = feet
        layer += 0.01
        node.zPosition = layer
        corpses.addChild(node)
        let body = Body(node: node, cast: cast, state: .falling)
        body.facing = facing
        body.frames = (0..<Frame.dieFrames).map { .die($0) }
        let anatomy = Figure.anatomy(cast, .die(0))
        let canvas = Figures.size(cast, ronin: ronin)
        let jet = Art.spurt(Palette.blood.mix(.black, 0.25), rate: 120 * force, speed: ronin * 1.2, size: ronin * 0.04,
                            angle: 0.6, spread: 0.3, gravity: gravity * 0.8, into: trails)
        jet.position = CGPoint(x: (anatomy.chest.x / anatomy.height - Figure.feet.x) * canvas.height / Figure.canvas.height,
                               y: (anatomy.chest.y / anatomy.height - Figure.feet.y) * canvas.height / Figure.canvas.height)
        node.addChild(jet)
        body.jet = jet
        body.jetRate = 120 * force
        body.jetFor = 0.9
        bodies.append(body)
        drop(cast, feet: feet, facing: facing, away: -facing, force: force)
        spatter(around: feet.x, count: Int(6 * force))
        trim()
    }

    /// Blood pumping from a point that isn't a body part (the ronin, dying): `seconds` of it.
    func bleed(at point: CGPoint, angle: CGFloat, seconds: Double) {
        let jet = Art.spurt(Palette.blood.mix(.black, 0.2), rate: 180, speed: ronin * 1.3, size: ronin * 0.045, angle: angle,
                            spread: 0.4, gravity: gravity * 0.8, into: trails)
        jet.position = point
        trails.addChild(jet)
        jet.run(.sequence([.wait(forDuration: seconds), .run { [weak jet] in MainActor.assumeIsolated { jet?.particleBirthRate = 0 } },
                           .wait(forDuration: 1), .removeFromParent()]))
    }

    /// A pool spreading on the ground at `x`, `width` across.
    func pool(at x: CGFloat, width: CGFloat, grow: TimeInterval = 1.8) {
        let pool = SKSpriteNode(texture: Art.glow)
        pool.size = CGSize(width: width, height: max(3, width * 0.16))
        pool.position = CGPoint(x: x, y: groundY - ronin * 0.02)
        pool.color = RGB(0.26, 0.0, 0.02).color()
        pool.colorBlendFactor = 1
        pool.alpha = 0.95
        pool.setScale(0.2)
        pool.run(SKAction.scale(to: 1, duration: grow).easedOut())
        stains.addChild(pool)
        pools.append(pool)
        if pools.count > 70 { pools.removeFirst().removeFromParent() }
    }

    /// Drops of blood flecked over the ground about `x`.
    func spatter(around x: CGFloat, count: Int) {
        for _ in 0..<count {
            let speck = SKSpriteNode(texture: Art.dot)
            let r = ronin * CGFloat.random(in: 0.015...0.05)
            speck.size = CGSize(width: r * 2, height: r * 0.9)
            speck.position = CGPoint(x: x + CGFloat.random(in: -1...1) * ronin * 0.9, y: groundY - CGFloat.random(in: 0...0.16) * ronin)
            speck.color = RGB(0.34, 0.0, 0.03).color()
            speck.colorBlendFactor = 1
            speck.alpha = CGFloat.random(in: 0.6...0.95)
            stains.addChild(speck)
            specks.append(speck)
        }
        while specks.count > 220 { specks.removeFirst().removeFromParent() }
    }

    /// Too many dead to keep drawing: the oldest ones under the heap fade (the heap keeps its height).
    private func trim() {
        while bodies.count > 70, let old = bodies.firstIndex(where: { $0.state == .resting }) {
            let body = bodies.remove(at: old)
            body.node.run(.sequence([.fadeOut(withDuration: 0.6), .removeFromParent()]))
        }
    }

    // MARK: The step

    func update(_ dt: Double) {
        guard dt > 0 else { return }
        clock += dt
        let h = CGFloat(dt)
        var gone: [Int] = []
        for (i, body) in bodies.enumerated() {
            let node = body.node
            body.clock += dt
            if let jet = body.jet {
                // The heart still pumping, weaker as it goes.
                body.jetFor -= dt
                let beat = CGFloat(max(0, sin(body.clock * 15)))
                jet.particleBirthRate = body.jetFor > 0 ? body.jetRate * (0.25 + 0.75 * beat) * CGFloat(min(1, body.jetFor)) : 0
                if body.jetFor < -1 {
                    jet.removeFromParent()
                    body.jet = nil
                }
            }
            switch body.state {
            case .resting:
                continue
            case .falling:
                // Dying frames: thrown back, the knees going, toppling; then down, on the heap.
                let k = min(body.frames.count - 1, Int(body.clock / 0.13))
                Figures.apply(node, body.cast, body.frames[k], ronin: ronin)
                node.position.y = groundY + footing(at: node.position.x, width: node.size.width * 0.5)
                if k == body.frames.count - 1 { rest(body, lying: true) }
            case .standing:
                node.position.y = max(node.position.y, groundY + footing(at: node.position.x, width: node.size.width * 0.4) + node.size.height / 2)
                body.standFor -= dt
                if body.standFor <= 0 {
                    body.state = .flying
                    body.velocity = CGVector(dx: -body.facing * ronin * CGFloat.random(in: 0.1...0.35), dy: ronin * 0.2)
                    body.spin = body.facing * CGFloat.random(in: 2.2...3.4)
                }
            case .flying:
                body.velocity.dy -= gravity * h
                node.position.x += body.velocity.dx * h
                node.position.y += body.velocity.dy * h
                node.zRotation += body.spin * h
                let (ex, ey) = extents(node, node.zRotation)
                if node.position.x < field.minX - ex || node.position.x > field.maxX + ex {
                    gone.append(i)
                    continue
                }
                let floor = groundY + footing(at: node.position.x, width: ex * 1.4)
                if node.position.y - ey <= floor, body.velocity.dy < 0 {
                    if !body.bounced, body.velocity.dy < -ronin * 2 {
                        // One hard bounce, a splash where it struck.
                        body.bounced = true
                        node.position.y = floor + ey
                        body.velocity.dy *= -0.28
                        body.velocity.dx *= 0.5
                        body.spin *= 0.45
                        spatter(around: node.position.x, count: 4)
                    } else {
                        rest(body, lying: false)
                    }
                }
            }
        }
        for i in gone.reversed() {
            bodies[i].node.removeFromParent()
            bodies.remove(at: i)
        }
    }

    /// How far a turned sprite reaches from its middle, across and up.
    private func extents(_ node: SKSpriteNode, _ angle: CGFloat) -> (CGFloat, CGFloat) {
        let w = node.size.width / 2, h = node.size.height / 2
        return (abs(w * cos(angle)) + abs(h * sin(angle)), abs(w * sin(angle)) + abs(h * cos(angle)))
    }

    /// Lays a body to rest on the heap: turned to lie flat (a long piece on its side), settled into what is under it,
    /// and adding to the heap's height. Blood pools under it.
    private func rest(_ body: Body, lying: Bool) {
        let node = body.node
        body.state = .resting
        // Nothing comes to rest on the ronin's own ground: it slides off to one side.
        if abs(node.position.x - heroX) < ronin * 0.34 {
            node.position.x = heroX + (node.position.x < heroX ? -1 : 1) * ronin * 0.34
        }
        let size = node.size
        let top: CGFloat
        let ex: CGFloat
        if lying {
            // A whole body already on its back, anchored at the feet.
            let base = footing(at: node.position.x, width: size.width * 0.5)
            node.position.y = groundY + base
            top = groundY + base + size.height * 0.4
            ex = size.width * 0.42
        } else {
            // Whatever is long lies along the ground: a tall piece on its side, a wide one (a weapon) flat.
            let tall = size.height > size.width * 1.25, wide = size.width > size.height * 1.25
            let quarter = CGFloat.pi / 2
            var k = (node.zRotation / quarter).rounded()
            let odd = abs(Int(k)) % 2 == 1
            if (tall && !odd) || (wide && odd) { k += node.zRotation - k * quarter >= 0 ? 1 : -1 }
            let angle = k * quarter
            let (x, y) = extents(node, angle)
            ex = x
            let base = footing(at: node.position.x, width: x * 1.4)
            // Settle into the bodies beneath rather than balance on their highest point (a silhouette fills little
            // of its box).
            let y0 = groundY + base + y * (body.thin ? 0.5 : 0.62)
            node.run(.group([.rotate(toAngle: angle, duration: 0.12, shortestUnitArc: true), .moveTo(y: y0, duration: 0.12)]))
            top = body.thin ? groundY + base : y0 + y * 0.35
        }
        // Raise the heap under it.
        let a = max(0, Int((node.position.x - ex * 0.85 - field.minX) / column))
        let b = min(heights.count - 1, Int((node.position.x + ex * 0.85 - field.minX) / column))
        if a <= b {
            for c in a...b { heights[c] = min(cap, max(heights[c], top - groundY)) }
        }
        if !body.thin { pool(at: node.position.x, width: ex * 2.4) }
    }
}
