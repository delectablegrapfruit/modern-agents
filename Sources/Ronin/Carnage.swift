import AppKit
import SpriteKit
import RoninArt
import RoninCore

/// The dead, and what is left of them. A cut foe comes apart along the line of the cut: the top half is flung away
/// tumbling, arms flying, trailing blood, while the legs stand a moment with blood pumping from the stump before the
/// knees go; a head flies off and the body under it stands, then crumples; a foe run through is thrown back off his
/// feet, or folds where he stands. Every body is a jointed thing let fall under its own weight (a `Ragdoll`), so each
/// collapses and comes to rest its own way. His weapon leaves his hand and clatters down on its own.
///
/// Everything lands, bounces once, and stays where it falls for the rest of the stage, at ground level: scattered a
/// little nearer or further on the ground (the nearer drawn over the further) and lying across whatever fell there
/// before, so the lane fills with a low, overlapping carpet of bodies and parts of bodies that never rises into a
/// heap. It is scenery: the living walk on the ground through it. Blood pools under the dead and flecks the ground.
@MainActor
final class Carnage {
    /// The dead, drawn behind the living.
    let corpses = SKNode()
    /// Pools and spatter on the ground, under the dead.
    let stains = SKNode()
    /// Where blood already spilled is left (so a trail stays where it fell as a body flies on).
    private let trails: SKNode

    private final class Body {
        /// A jointed body standing on its planted feet, or falling as it will; a rigid piece (a head, a weapon)
        /// flying, or skidding to a stop; or at rest.
        enum State { case standing, limp, flying, sliding, resting }
        let node: SKSpriteNode
        let cast: Cast
        var state: State
        var doll: Ragdoll?
        /// Where the doll's ground point is in the world (the spot he stood on, at his line on the ground), how many
        /// points a figure height is, and where the sprite's own ground point was, in the doll's terms, when it was
        /// last drawn.
        var origin = CGPoint.zero
        var scale: CGFloat = 1
        var anchor = CGPoint.zero
        var drawn: [CGPoint] = []
        var sinceDrawn = 0.0
        var velocity = CGVector.zero
        var spin: CGFloat = 0
        var clock = 0.0
        var standFor = 0.0
        var bounced = false
        var facing: CGFloat = 1
        var jet: SKEmitterNode?
        var jetRate: CGFloat = 0
        var jetFor = 0.0
        /// A weapon: it lies flat and bleeds no pool.
        var thin = false
        /// The line on the ground it comes to rest on: at the lane, or a little nearer the eye.
        var floor: CGFloat = 0
        /// Sliding to a stop: the angle it settles at and how deep it lies.
        var restAngle: CGFloat = 0
        var restY: CGFloat = 0

        init(node: SKSpriteNode, cast: Cast, state: State) {
            self.node = node
            self.cast = cast
            self.state = state
        }
    }

    private var bodies: [Body] = []
    private var field = CGRect.zero
    private var groundY: CGFloat = 0
    private var ronin: CGFloat = 60
    private var heroX: CGFloat = 0
    private var layer: CGFloat = 0
    private var pools: [SKNode] = []
    private var specks: [SKNode] = []
    private var rng = SeededRNG(seed: UInt64.random(in: 0...UInt64.max))
    /// How many bodies may be redrawn in one step (each is drawn afresh as it falls).
    private var budget = 0

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
        layer = 0
    }

    var count: Int { bodies.count }

    private var gravity: CGFloat { ronin * 9 }

    /// How much nearer the eye than the lane itself the dead may lie.
    private var depth: CGFloat { ronin * 0.12 }

    /// Places a body in the carpet of the dead, `near` (0…1) toward the eye: its resting line, and its place in the
    /// drawing order (nearer over further; among equals, later over earlier).
    private func place(_ body: Body, near: CGFloat) {
        let near = min(1, max(0, near))
        body.floor = groundY - depth * near
        layer += 0.0005
        body.node.zPosition = near * 10 + layer
    }

    // MARK: The dying

    /// Cuts a foe apart where he stood (`feet`, facing +1 right or −1 left), throwing the upper part away from the
    /// ronin (`away`, ±1). `force` scales everything for the big ones.
    func sever(_ cast: Cast, _ severance: Figures.Severance, feet: CGPoint, facing: CGFloat, away: CGFloat, force: CGFloat = 1) {
        let near = CGFloat.random(in: 0...1)
        let back = away * facing
        // Cut from one of the several ways a blow throws a man, so no two come apart alike.
        let variant = Int.random(in: 0..<Figures.variants)
        let pose = Figure.struck(cast, variant: variant)
        let stand = Double.random(in: 0.35...0.7)
        switch severance {
        case .head:
            // The head flies, turning over and over; the body stands a moment longer, pumping blood, and crumples.
            if let part = Figures.parts(cast, .head, variant: variant).first(where: \.upper) {
                let full = Figures.size(cast, ronin: ronin)
                let node = SKSpriteNode(texture: part.texture)
                node.size = CGSize(width: full.width * part.rect.width, height: full.height * part.rect.height)
                node.xScale = facing
                node.position = CGPoint(x: feet.x + facing * (part.rect.midX - Figure.anchor.x) * full.width,
                                        y: feet.y + (part.rect.midY - Figure.anchor.y) * full.height)
                corpses.addChild(node)
                let head = Body(node: node, cast: cast, state: .flying)
                head.facing = facing
                place(head, near: near + CGFloat.random(in: -0.15...0.15))
                let wound = CGPoint(x: (part.wound.x - part.rect.midX) * full.width, y: (part.wound.y - part.rect.midY) * full.height)
                bleed(head, from: wound, angle: part.woundAngle, rate: 160 * force, speed: ronin * 0.5, seconds: 0.7)
                head.velocity = CGVector(dx: away * ronin * CGFloat.random(in: 1.0...2.0) * force, dy: ronin * CGFloat.random(in: 0.8...1.3) * 2.6 * force)
                head.spin = -away * CGFloat.random(in: 6...16)
                bodies.append(head)
            }
            let body = add(Ragdoll.cut(cast, pose: pose, .headless, back: back, force: force, rng: &rng), cast, feet: feet, facing: facing,
                           near: near + CGFloat.random(in: -0.1...0.1), state: .standing)
            body.standFor = stand * 1.4
            bleed(body, rate: 160 * force, speed: ronin * 1.6, seconds: 1.8)
        default:
            let at: CGFloat, slant: CGFloat, lift: CGFloat
            switch severance {
            case .falling: (at, slant, lift) = (0.5, 0.6, 1.3)
            case .rising: (at, slant, lift) = (0.5, -0.6, 1.3)
            case .level: (at, slant, lift) = (0.3, 0.05, 1.3)
            default: (at, slant, lift) = (0.12, 0.08, 0.6)
            }
            let upper = add(Ragdoll.cut(cast, pose: pose, .above(at: at, slant: slant), back: back, force: force, lift: lift, rng: &rng),
                            cast, feet: feet, facing: facing, near: near + CGFloat.random(in: -0.15...0.15), state: .limp)
            bleed(upper, rate: 160 * force, speed: ronin * 0.5, seconds: 0.7)
            let lower = add(Ragdoll.cut(cast, pose: pose, .below(at: at, slant: slant), back: back, force: force, rng: &rng),
                            cast, feet: feet, facing: facing, near: near + CGFloat.random(in: -0.15...0.15), state: .standing)
            lower.standFor = stand
            bleed(lower, rate: 160 * force, speed: ronin * 1.6, seconds: 1.5)
        }
        drop(cast, feet: feet, facing: facing, away: away, force: force, near: near)
        spatter(around: feet.x, count: Int(10 * force))
        trim()
    }

    /// A jointed body (or part of one) standing where the foe stood, drawn as it is now.
    private func add(_ doll: Ragdoll, _ cast: Cast, feet: CGPoint, facing: CGFloat, near: CGFloat, state: Body.State) -> Body {
        let node = SKSpriteNode()
        node.xScale = facing
        corpses.addChild(node)
        let body = Body(node: node, cast: cast, state: state)
        body.facing = facing
        place(body, near: near)
        body.scale = ronin * Build.of(cast).height
        body.origin = CGPoint(x: feet.x, y: body.floor)
        var doll = doll
        // Standing on the lane, over the line on the ground he will fall to.
        doll.raise((feet.y - body.floor) / body.scale)
        body.doll = doll
        draw(body)
        bodies.append(body)
        return body
    }

    /// Blood pumping from a body: from a doll's wound (or its chest), or from a point on a rigid piece.
    private func bleed(_ body: Body, from point: CGPoint = .zero, angle: CGFloat = 0, rate: CGFloat, speed: CGFloat, seconds: Double) {
        let jet = Art.spurt(Palette.blood.mix(.black, 0.25), rate: rate, speed: speed, size: ronin * 0.045, angle: angle, spread: 0.35,
                            gravity: gravity * 0.8, into: trails)
        jet.position = point
        body.node.addChild(jet)
        body.jet = jet
        body.jetRate = rate
        body.jetFor = seconds
        aim(body)
    }

    /// Keeps a doll's jet of blood on its wound, pointing out of it.
    private func aim(_ body: Body) {
        guard let doll = body.doll, let jet = body.jet else { return }
        let at: CGPoint, angle: CGFloat
        if let wound = doll.wound {
            (at, angle) = (wound.at, wound.angle)
        } else {
            // Run through: from the chest, out of the front of it and up.
            let a = doll.points[Ragdoll.low], b = doll.points[Ragdoll.high]
            let up = atan2(b.y - a.y, b.x - a.x)
            (at, angle) = (CGPoint(x: a.x + (b.x - a.x) * 0.68, y: a.y + (b.y - a.y) * 0.68), up - 0.7)
        }
        jet.position = CGPoint(x: (at.x - body.anchor.x) * body.scale, y: (at.y - body.anchor.y) * body.scale)
        jet.emissionAngle = angle
    }

    /// Draws a doll as it now lies, the sprite moved with its hips.
    private func draw(_ body: Body) {
        guard let doll = body.doll else { return }
        let (pose, anchor) = doll.framed()
        Figures.apply(body.node, Figures.render(Figure.sketch(body.cast, pose: pose)), body.cast, ronin: ronin)
        body.anchor = anchor
        body.node.position = CGPoint(x: body.origin.x + body.facing * anchor.x * body.scale, y: body.origin.y + anchor.y * body.scale)
        body.drawn = doll.points
        body.sinceDrawn = 0
        aim(body)
    }

    /// His weapon, out of his hand: flung up turning end over end, to clatter down flat among the dead.
    private func drop(_ cast: Cast, feet: CGPoint, facing: CGFloat, away: CGFloat, force: CGFloat, near: CGFloat) {
        let piece = Figures.weapon(cast)
        let full = Figures.size(cast, ronin: ronin)
        let node = SKSpriteNode(texture: piece.texture)
        node.size = CGSize(width: full.width * piece.rect.width, height: full.height * piece.rect.height)
        node.xScale = facing
        node.zRotation = CGFloat.random(in: -0.8...0.8)
        node.position = CGPoint(x: feet.x, y: feet.y + full.height * 0.35)
        corpses.addChild(node)
        let body = Body(node: node, cast: cast, state: .flying)
        place(body, near: near + 0.1)
        body.velocity = CGVector(dx: away * ronin * CGFloat.random(in: 0.3...1.1) * force, dy: ronin * CGFloat.random(in: 1.2...2.2))
        body.spin = CGFloat.random(in: -9...9)
        body.facing = facing
        body.thin = true
        bodies.append(body)
    }

    /// A foe run through or shot: thrown back off his feet, or folding where he stands.
    func fell(_ cast: Cast, feet: CGPoint, facing: CGFloat, force: CGFloat = 1) {
        let near = CGFloat.random(in: 0...1)
        let pose = Figure.pose(cast, [Frame.die(0), .stagger(0)][Int.random(in: 0...1)])
        let body = add(Ragdoll.felled(cast, pose: pose, back: -1, force: force, rng: &rng), cast, feet: feet, facing: facing, near: near, state: .limp)
        bleed(body, rate: 120 * force, speed: ronin * 1.2, seconds: 0.9)
        drop(cast, feet: feet, facing: facing, away: -facing, force: force, near: near)
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

    /// A pool spreading on the ground at `x`, `width` across, on the line `floor` (the lane's, if not given).
    func pool(at x: CGFloat, width: CGFloat, grow: TimeInterval = 1.8, floor: CGFloat? = nil) {
        let pool = SKSpriteNode(texture: Art.glow)
        pool.size = CGSize(width: width, height: max(3, width * 0.16))
        pool.position = CGPoint(x: x, y: (floor ?? groundY) - ronin * 0.02)
        pool.color = RGB(0.26, 0.0, 0.02).color()
        pool.colorBlendFactor = 1
        pool.alpha = 0.95
        pool.setScale(0.2)
        pool.run(SKAction.scale(to: 1, duration: grow).easedOut())
        stains.addChild(pool)
        pools.append(pool)
        if pools.count > 70 { pools.removeFirst().removeFromParent() }
    }

    /// Drops of blood flecked over the ground about `x` (about the line `floor`, if given).
    func spatter(around x: CGFloat, count: Int, floor: CGFloat? = nil) {
        for _ in 0..<count {
            let speck = SKSpriteNode(texture: Art.dot)
            let r = ronin * CGFloat.random(in: 0.015...0.05)
            speck.size = CGSize(width: r * 2, height: r * 0.9)
            let line = floor ?? groundY - CGFloat.random(in: 0...1) * depth
            speck.position = CGPoint(x: x + CGFloat.random(in: -1...1) * ronin * 0.9, y: line - CGFloat.random(in: -0.02...0.03) * ronin)
            speck.color = RGB(0.34, 0.0, 0.03).color()
            speck.colorBlendFactor = 1
            speck.alpha = CGFloat.random(in: 0.6...0.95)
            stains.addChild(speck)
            specks.append(speck)
        }
        while specks.count > 220 { specks.removeFirst().removeFromParent() }
    }

    /// Too many dead to keep drawing: the oldest fade away.
    private func trim() {
        while bodies.count > 70, let old = bodies.firstIndex(where: { $0.state == .resting }) {
            let body = bodies.remove(at: old)
            body.node.run(.sequence([.fadeOut(withDuration: 0.6), .removeFromParent()]))
        }
    }

    // MARK: The step

    func update(_ dt: Double) {
        guard dt > 0 else { return }
        let h = CGFloat(dt)
        budget = 4
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
            case .standing, .limp:
                // On its feet a moment longer, holding its last pose, until the knees go; then falling as it will.
                body.doll?.advance(dt)
                body.sinceDrawn += dt
                if body.state == .standing {
                    body.standFor -= dt
                    if body.standFor <= 0 {
                        body.doll?.collapse(rng: &rng)
                        body.state = .limp
                    }
                }
                guard let doll = body.doll else { continue }
                let x = body.origin.x + body.facing * doll.hip.x * body.scale
                if x < field.minX - ronin * 1.5 || x > field.maxX + ronin * 1.5 {
                    gone.append(i)
                    continue
                }
                if body.state == .limp, doll.settled {
                    draw(body)
                    rest(body)
                } else if body.sinceDrawn >= 1.0 / 40, budget > 0, doll.moved(since: body.drawn) > 0.004 {
                    // Drawn afresh as it falls, a few bodies a step.
                    budget -= 1
                    draw(body)
                } else {
                    aim(body)
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
                // The ground is the ground: bodies land on it, not on each other.
                if node.position.y - ey * 0.6 <= body.floor, body.velocity.dy < 0 {
                    if !body.bounced, body.velocity.dy < -ronin * 2 {
                        // One hard bounce, a splash where it struck.
                        body.bounced = true
                        node.position.y = body.floor + ey * 0.6
                        body.velocity.dy *= -0.28
                        body.velocity.dx *= 0.5
                        body.spin *= 0.45
                        spatter(around: node.position.x, count: 4, floor: body.floor)
                    } else {
                        land(body)
                    }
                }
            case .sliding:
                // Skidding to a stop across the ground, turning over to lie as it will.
                node.position.x += body.velocity.dx * h
                body.velocity.dx *= CGFloat(pow(0.003, dt))
                let ease = min(1, h * 12)
                node.zRotation += (body.restAngle - node.zRotation) * ease
                node.position.y += (body.restY - node.position.y) * ease
                if abs(body.velocity.dx) < ronin * 0.06, abs(body.restAngle - node.zRotation) < 0.02 {
                    rest(body)
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

    /// Where a flying body meets the ground: it keeps some of its way and skids, turning over toward however it will
    /// lie: a long piece on its side, a weapon flat, never quite square, a few degrees one way or the other.
    private func land(_ body: Body) {
        let node = body.node
        let size = node.size
        let tall = size.height > size.width * 1.25, wide = size.width > size.height * 1.25
        let quarter = CGFloat.pi / 2
        var k = (node.zRotation / quarter).rounded()
        let odd = abs(Int(k)) % 2 == 1
        if (tall && !odd) || (wide && odd) { k += node.zRotation - k * quarter >= 0 ? 1 : -1 }
        body.restAngle = k * quarter + CGFloat.random(in: -0.3...0.3) * (body.thin ? 0.4 : 1)
        let (_, y) = extents(node, body.restAngle)
        // A silhouette fills little of its box: sunk until the body, not the box, is on the ground; sometimes a little
        // proud of it, lying across what fell before.
        body.restY = body.floor + y * CGFloat.random(in: 0.34...0.56) * (body.thin ? 0.7 : 1)
        body.velocity.dx *= 0.55
        body.state = .sliding
    }

    /// Leaves a body where it came to rest, clear of the ronin's own ground, with blood pooling under it.
    private func rest(_ body: Body) {
        let node = body.node
        body.state = .resting
        // Nothing comes to rest on the ronin's own ground: it slides off to one side.
        if abs(node.position.x - heroX) < ronin * 0.34 {
            let x = heroX + (node.position.x < heroX ? -1 : 1) * ronin * 0.34
            node.run(.moveTo(x: x, duration: 0.1))
        }
        let width = extents(node, node.zRotation).0 * 2 * (body.doll == nil ? 1 : 0.8)
        if !body.thin { pool(at: node.position.x, width: width * 1.2, floor: body.floor) }
    }
}
