import AppKit
import SpriteKit
import RoninArt
import RoninCore

/// The dead, and what is left of them. A cut foe comes apart along the line of the cut: the top half is flung away
/// tumbling, arms flying, trailing blood, while the legs stand a moment with blood pumping from the stump before the
/// knees go; a head flies off and the body under it stands, then crumples; a man cut across the shins drops onto his
/// knees and pitches onto his face; a foe run through is thrown back off his feet, or folds where he stands. Every
/// body is a jointed thing let fall under its own weight (a `Ragdoll`), from the very pose his figure froze in at the
/// blow, so nothing jumps as it takes over; each piece reaches for a pose of its own as it goes, so each collapses and
/// comes to rest its own way. His weapon leaves his hand and clatters down on its own.
///
/// Everything lands, bounces once, and stays where it falls for the rest of the stage, at ground level: scattered a
/// little nearer or further on the ground (the nearer drawn over the further, all of them under the living) and lying
/// across whatever fell there before, so the lane fills with a low, overlapping carpet of bodies and parts of bodies
/// that never rises into a heap. It is scenery: the living walk on the ground through it. Blood pools under the dead
/// and flecks the ground; what jets from a wound falls to the ground, not through it.
@MainActor
final class Carnage {
    /// The dead, drawn behind the living (their drawing order kept in a band under the figures' own).
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
        /// How long since it was last drawn, by the clock (not the fight's time, which slows).
        var sinceDrawn = 0.0
        var velocity = CGVector.zero
        var spin: CGFloat = 0
        var clock = 0.0
        var standFor = 0.0
        /// Standing, the pose it reaches for as its knees go.
        var reach: Pose?
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
        /// The blood pooled under it once it lies still (it goes with it, if it is ever cleared away).
        var pool: SKNode?

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
    /// When the last step was taken, by the clock.
    private var stepped: TimeInterval?

    /// How many pieces of the dead are kept (more than the fullest stage leaves: 72 foes, a warlord and his men, three
    /// pieces each); how many pools of blood, and how many flecks.
    private static let most = 260, mostPools = 180, mostSpecks = 600
    /// How much of the drawing order the dead take, over their node's own place: nearer over further, and all of them
    /// under the figures (the living, and the shadows at their feet).
    private static let band: CGFloat = 0.4
    /// How far (points) a falling body may be drawn off from where it really is before it is drawn again; and how far
    /// off it must be to be drawn again the next frame, rather than after a frame's rest (a body moving fast is
    /// redrawn every frame, a slow one every other, a still one not at all).
    private static let blur: CGFloat = 0.6, fast: CGFloat = 2
    /// Redrawing the falling: how long between redraws of a body moving slowly (seconds, by the clock), how many
    /// bodies a step may always redraw, and how long it may spend on more (seconds).
    private static let lull = 1.0 / 40, fewest = 4, spend = 0.003

    init(trails: SKNode) {
        self.trails = trails
    }

    /// A new stage: the lane swept clean.
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

    /// A new size mid-stage: the dead, their blood and whatever is still falling kept, scaled with the lane about the
    /// ronin's spot on the ground (the lane keeps its shape, so everything lands where it would have).
    func relayout(field: CGRect, groundY: CGFloat, ronin: CGFloat, heroX: CGFloat) {
        guard field != self.field || groundY != self.groundY || ronin != self.ronin || heroX != self.heroX else { return }
        let k = self.ronin > 0 ? ronin / self.ronin : 1
        let x0 = self.heroX, y0 = self.groundY
        func map(_ p: CGPoint) -> CGPoint { CGPoint(x: heroX + (p.x - x0) * k, y: groundY + (p.y - y0) * k) }
        func line(_ y: CGFloat) -> CGFloat { groundY + (y - y0) * k }
        // Every piece of the dead (those fading out too), every pool and fleck: moved, and sized rather than scaled
        // (the dead carry their facing in their scale, and a pool is still spreading by its own).
        for node in corpses.children + stains.children {
            node.position = map(node.position)
            if let sprite = node as? SKSpriteNode { sprite.size = CGSize(width: sprite.size.width * k, height: sprite.size.height * k) }
        }
        for body in bodies {
            body.origin = map(body.origin)
            body.floor = line(body.floor)
            body.restY = line(body.restY)
            body.scale *= k
            body.velocity = CGVector(dx: body.velocity.dx * k, dy: body.velocity.dy * k)
            if let jet = body.jet {
                Carnage.rescale(jet, by: k)
                // A rigid piece's jet stays on its wound (a doll's is put back on it below).
                if body.doll == nil { jet.position = CGPoint(x: jet.position.x * k, y: jet.position.y * k) }
            }
        }
        self.field = field
        self.groundY = groundY
        self.ronin = ronin
        self.heroX = heroX
        for body in bodies where body.doll != nil { aim(body) }
    }

    /// A jet of blood made `k` times the size: its drops, their speed and their fall.
    private static func rescale(_ jet: SKEmitterNode, by k: CGFloat) {
        jet.particleSpeed *= k
        jet.particleSpeedRange *= k
        jet.yAcceleration *= k
        jet.particleScale *= k
        jet.particleScaleRange *= k
        jet.particleScaleSpeed *= k
    }

    var count: Int { bodies.count }

    private var gravity: CGFloat { ronin * 9 }

    /// How much nearer the eye than the lane itself the dead may lie.
    private var depth: CGFloat { ronin * 0.12 }

    /// Places a body in the carpet of the dead, `near` (0…1) toward the eye: its resting line, and its place in the
    /// drawing order (nearer over further; among equals, later over earlier), always under the living.
    private func place(_ body: Body, near: CGFloat) {
        let near = min(1, max(0, near))
        body.floor = groundY - depth * near
        layer += 0.0005
        body.node.zPosition = (near * 10 + layer) * Carnage.band
    }

    // MARK: The dying

    /// Cuts a foe apart where he stood (`feet`, facing +1 right or −1 left), throwing the upper part away from the
    /// ronin (`away`, ±1). `force` scales everything for the big ones.
    ///
    /// He comes apart from the pose the blow threw him into, `Figure.struck(cast, variant:)`: variant 0, the stagger
    /// his figure freezes in at a killing blow, unless it froze in another (`Figures.struck`). Each piece then reaches
    /// for a pose of its own, so no two come apart alike. Returns where he parts, on the lane (the wound of the upper
    /// part, the neck, or the shin), for the blood and the flash.
    @discardableResult
    func sever(_ cast: Cast, _ severance: Figures.Severance, feet: CGPoint, facing: CGFloat, away: CGFloat, force: CGFloat = 1,
               variant: Int = 0) -> CGPoint {
        let near = CGFloat.random(in: 0...1)
        let back = away * facing
        let pose = Figure.struck(cast, variant: variant)
        let stand = Double.random(in: 0.35...0.7)
        let parted: Body
        switch severance {
        case .head:
            // The head flies, turning over and over; the body stands a moment longer, pumping blood, and crumples.
            let part = Figures.head(cast, variant: variant)
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
            let body = add(Ragdoll.cut(cast, pose: pose, .headless, back: back, force: force, rng: &rng), cast, feet: feet, facing: facing,
                           near: near + CGFloat.random(in: -0.1...0.1), state: .standing)
            body.standFor = stand * 1.4
            body.reach = Carnage.wild(cast)
            bleed(body, rate: 160 * force, speed: ronin * 1.6, seconds: 1.8)
            parted = body
        case .legs:
            // The legs cut from under him: the feet knocked back, down onto his knees, over onto his face, the
            // blood pumping from his shin.
            var doll = Ragdoll.hamstrung(cast, pose: pose, back: back, force: force, rng: &rng)
            steer(&doll, to: Carnage.wild(cast))
            let body = add(doll, cast, feet: feet, facing: facing, near: near, state: .limp)
            bleed(body, rate: 160 * force, speed: ronin * 1.3, seconds: 1.2)
            parted = body
        default:
            let at: CGFloat, slant: CGFloat
            switch severance {
            case .falling: (at, slant) = (0.5, 0.6)
            case .rising: (at, slant) = (0.5, -0.6)
            default: (at, slant) = (0.3, 0.05)
            }
            var cut = Ragdoll.cut(cast, pose: pose, .above(at: at, slant: slant), back: back, force: force, lift: 1.3, rng: &rng)
            steer(&cut, to: Carnage.wild(cast))
            let upper = add(cut, cast, feet: feet, facing: facing, near: near + CGFloat.random(in: -0.15...0.15), state: .limp)
            bleed(upper, rate: 160 * force, speed: ronin * 0.5, seconds: 0.7)
            let lower = add(Ragdoll.cut(cast, pose: pose, .below(at: at, slant: slant), back: back, force: force, rng: &rng),
                            cast, feet: feet, facing: facing, near: near + CGFloat.random(in: -0.15...0.15), state: .standing)
            lower.standFor = stand
            lower.reach = Carnage.wild(cast)
            bleed(lower, rate: 160 * force, speed: ronin * 1.6, seconds: 1.5)
            parted = upper
        }
        drop(cast, pose: pose, feet: feet, facing: facing, away: away, force: force, near: near)
        spatter(around: feet.x, count: Int(10 * force))
        trim()
        return wound(of: parted)
    }

    /// A foe run through or shot, going down whole from `pose` (the stagger his figure freezes in at a killing blow,
    /// if not given the pose he was in): thrown back off his feet, or folding where he stands, his arms flung as he
    /// goes toward another pose (thrown back, or any a blow throws a man into). Returns the middle of his chest on the
    /// lane, where the blood leaves him.
    @discardableResult
    func fell(_ cast: Cast, feet: CGPoint, facing: CGFloat, force: CGFloat = 1, pose: Pose? = nil) -> CGPoint {
        let near = CGFloat.random(in: 0...1)
        let from = pose ?? Figure.struck(cast, variant: 0)
        var doll = Ragdoll.felled(cast, pose: from, back: -1, force: force, rng: &rng)
        steer(&doll, to: Int.random(in: 0...2) == 0 ? Figure.thrown(cast) : Carnage.wild(cast), fling: true)
        let body = add(doll, cast, feet: feet, facing: facing, near: near, state: .limp)
        bleed(body, rate: 120 * force, speed: ronin * 1.2, seconds: 0.9)
        drop(cast, pose: from, feet: feet, facing: facing, away: -facing, force: force, near: near)
        spatter(around: feet.x, count: Int(6 * force))
        trim()
        return wound(of: body)
    }

    /// A pose a blow may throw a man into, any of a million: what a falling piece reaches for.
    private static func wild(_ cast: Cast) -> Pose { Figure.struck(cast, variant: Int.random(in: 1...1_000_000)) }

    /// Has a piece reach for another pose than the one it was struck in as it goes (its last tone pulling that way),
    /// unsettled a little, so bodies struck alike still come down their own ways; `fling`ing its head and arms toward
    /// it too.
    private func steer(_ doll: inout Ragdoll, to pose: Pose, fling: Bool = false) {
        let from = doll.points
        doll.aim(at: pose)
        let amount = CGFloat(rng.range(0.3, 1))
        doll.stir(&rng, by: amount)
        guard fling else { return }
        let to = Ragdoll(cast: doll.cast, pose: pose).points
        for j in [Ragdoll.head, Ragdoll.frontElbow, Ragdoll.frontHand, Ragdoll.backElbow, Ragdoll.backHand] where doll.has(j) {
            doll.push(j, CGPoint(x: (to[j].x - from[j].x) / 0.12, y: (to[j].y - from[j].y) / 0.12))
        }
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

    /// Where a body bleeds from, on the lane.
    private func wound(of body: Body) -> CGPoint {
        guard let doll = body.doll else { return body.node.position }
        let at = Carnage.bleeding(doll).at
        return CGPoint(x: body.origin.x + body.facing * at.x * body.scale, y: body.origin.y + at.y * body.scale)
    }

    /// Where a doll bleeds from and the way the blood leaves it (its own terms): its wound, or, run through, the front
    /// of its chest, out and up.
    private static func bleeding(_ doll: Ragdoll) -> (at: CGPoint, angle: CGFloat) {
        if let wound = doll.wound { return wound }
        let a = doll.points[Ragdoll.low], b = doll.points[Ragdoll.high]
        let up = atan2(b.y - a.y, b.x - a.x)
        return (CGPoint(x: a.x + (b.x - a.x) * 0.68, y: a.y + (b.y - a.y) * 0.68), up - 0.7)
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
        if body.doll == nil { aimRigid(body) } else { aim(body) }
    }

    /// Keeps a doll's jet of blood on its wound, pointing out of it.
    private func aim(_ body: Body) {
        guard let doll = body.doll, let jet = body.jet else { return }
        let (at, angle) = Carnage.bleeding(doll)
        jet.position = CGPoint(x: (at.x - body.anchor.x) * body.scale, y: (at.y - body.anchor.y) * body.scale)
        jet.emissionAngle = angle
        // (The doll's ground is the line it lies on; turned to face either way, a drop still rises or falls alike.)
        ground(jet, from: at.y * body.scale, rising: sin(angle))
    }

    /// Keeps a rigid piece's jet from pouring through the ground as it turns over.
    private func aimRigid(_ body: Body) {
        guard let jet = body.jet else { return }
        let node = body.node
        let height = corpses.convert(jet.position, from: node).y - body.floor
        let a = jet.emissionAngle, turn = node.zRotation
        // Out of the wound as the world sees it: mirrored with the piece's facing, turned with it.
        ground(jet, from: height, rising: body.facing * cos(a) * sin(turn) + sin(a) * cos(turn))
    }

    /// Makes a jet's drops live no longer than they take to come down from `height` (points above the line the body
    /// lies on) to the ground just in front of it, thrown `rising` (the sine of their way out, up positive): they
    /// splash down there rather than fall on through the ground and out of the window.
    private func ground(_ jet: SKEmitterNode, from height: CGFloat, rising: CGFloat) {
        let g = max(1, -jet.yAcceleration)
        let v = jet.particleSpeed * rising
        let t = (v + (v * v + 2 * g * (max(0, height) + ronin * 0.04)).squareRoot()) / g
        jet.particleLifetime = min(0.5, 0.85 * t)
        jet.particleLifetimeRange = min(0.3, 0.3 * t)
    }

    /// Draws a doll as it now lies, the sprite moved with its hips.
    private func draw(_ body: Body) {
        guard let doll = body.doll else { return }
        let framed = doll.framed()
        var pose = framed.pose
        // Going down, cloth and gear hang toward the ground and lie on it rather than through it (on its feet, a
        // body is drawn as it stood).
        if body.state != .standing { pose.floor = doll.hip.y }
        Figures.apply(body.node, Figures.render(Figure.sketch(body.cast, pose: pose)), body.cast, ronin: ronin)
        body.anchor = framed.anchor
        body.node.position = CGPoint(x: body.origin.x + body.facing * framed.anchor.x * body.scale, y: body.origin.y + framed.anchor.y * body.scale)
        body.drawn = doll.points
        body.sinceDrawn = 0
        aim(body)
    }

    /// His weapon, out of his hand: leaving it as he held it in `pose`, flung up turning end over end, to clatter
    /// down flat among the dead.
    private func drop(_ cast: Cast, pose: Pose, feet: CGPoint, facing: CGFloat, away: CGFloat, force: CGFloat, near: CGFloat) {
        let piece = Figures.weapon(cast)
        let full = Figures.size(cast, ronin: ronin)
        let node = SKSpriteNode(texture: piece.texture)
        node.size = CGSize(width: full.width * piece.rect.width, height: full.height * piece.rect.height)
        node.xScale = facing
        // Its grip (the middle of its canvas) in his hand, turned the way he held it (the weapon lies along +x, a bow
        // along +y), the sprite's middle put where that leaves it.
        let unit = ronin * Build.of(cast).height
        let hand = Ragdoll(cast: cast, pose: pose).points[Ragdoll.frontHand]
        let turn = facing * (pose.blade - (Build.of(cast).weapon == .bow ? .pi : .pi / 2))
        let ox = (piece.rect.midX - 0.5) * full.width, oy = (piece.rect.midY - 0.5) * full.height
        node.zRotation = turn
        node.position = CGPoint(x: feet.x + facing * hand.x * unit + facing * ox * cos(turn) - oy * sin(turn),
                                y: feet.y + hand.y * unit + facing * ox * sin(turn) + oy * cos(turn))
        corpses.addChild(node)
        let body = Body(node: node, cast: cast, state: .flying)
        place(body, near: near + 0.1)
        body.velocity = CGVector(dx: away * ronin * CGFloat.random(in: 0.3...1.1) * force, dy: ronin * CGFloat.random(in: 1.2...2.2))
        body.spin = CGFloat.random(in: -9...9)
        body.facing = facing
        body.thin = true
        bodies.append(body)
    }

    /// Blood pumping from a point that isn't a body part (the ronin, dying): `seconds` of it, falling to the lane.
    func bleed(at point: CGPoint, angle: CGFloat, seconds: Double) {
        let jet = Art.spurt(Palette.blood.mix(.black, 0.2), rate: 180, speed: ronin * 1.3, size: ronin * 0.045, angle: angle,
                            spread: 0.4, gravity: gravity * 0.8, into: trails)
        jet.position = point
        ground(jet, from: point.y - groundY, rising: sin(angle))
        trails.addChild(jet)
        jet.run(.sequence([.wait(forDuration: seconds), .run { [weak jet] in MainActor.assumeIsolated { jet?.particleBirthRate = 0 } },
                           .wait(forDuration: 1), .removeFromParent()]))
    }

    /// A pool spreading on the ground at `x`, `width` across, on the line `floor` (the lane's, if not given).
    @discardableResult
    func pool(at x: CGFloat, width: CGFloat, grow: TimeInterval = 1.8, floor: CGFloat? = nil) -> SKNode {
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
        if pools.count > Carnage.mostPools { Carnage.fade(pools.removeFirst()) }
        return pool
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
        while specks.count > Carnage.mostSpecks { Carnage.fade(specks.removeFirst()) }
    }

    /// More dead than a stage leaves: the oldest pieces fade away, their weapons first, then the heads, then the
    /// bodies, each with its pool.
    private func trim() {
        while bodies.count > Carnage.most {
            guard let old = bodies.firstIndex(where: { $0.state == .resting && $0.thin })
                ?? bodies.firstIndex(where: { $0.state == .resting && $0.doll == nil })
                ?? bodies.firstIndex(where: { $0.state == .resting })
            else { break }
            let body = bodies.remove(at: old)
            Carnage.fade(body.node)
            if let pool = body.pool {
                Carnage.fade(pool)
                pools.removeAll { $0 === pool }
            }
        }
    }

    private static func fade(_ node: SKNode) {
        node.run(.sequence([.fadeOut(withDuration: 0.6), .removeFromParent()]))
    }

    // MARK: The step

    /// Lets the dead fall for `dt` seconds of the fight's time (0 holds everything still, as a hit-stop does), `real`
    /// seconds having gone by on the clock (measured, if not given).
    ///
    /// A falling body is drawn afresh whenever it has moved far enough from how it was last drawn to show: every
    /// frame while it moves fast, every other while it moves slowly, never while it is still, by the clock (so it
    /// stays smooth in slow motion). When many fall at once, those drawn furthest from where they really are go first,
    /// as many as a few milliseconds allow, the rest keeping their blood on their wounds until their turn.
    func update(_ dt: Double, real: Double? = nil) {
        let now = ProcessInfo.processInfo.systemUptime
        let elapsed = real ?? stepped.map { min(0.1, max(0, now - $0)) } ?? dt
        stepped = now
        guard dt > 0 else { return }
        let h = CGFloat(dt)
        var gone: [Int] = []
        var due: [(body: Body, off: CGFloat)] = []
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
                // On its feet a moment longer, holding its last pose, until the knees go; then falling as it will,
                // reaching for a pose of its own.
                body.doll?.advance(dt)
                body.sinceDrawn += elapsed
                if body.state == .standing {
                    body.standFor -= dt
                    if body.standFor <= 0 {
                        body.doll?.collapse(rng: &rng)
                        if let reach = body.reach {
                            body.doll?.aim(at: reach)
                            let amount = CGFloat(rng.range(0.3, 1))
                            body.doll?.stir(&rng, by: amount)
                        }
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
                    continue
                }
                let off = doll.moved(since: body.drawn) * body.scale
                if off >= Carnage.blur, off >= Carnage.fast || body.sinceDrawn >= Carnage.lull {
                    due.append((body: body, off: off))
                } else {
                    aim(body)
                }
            case .flying:
                body.velocity.dy -= gravity * h
                node.position.x += body.velocity.dx * h
                node.position.y += body.velocity.dy * h
                node.zRotation += body.spin * h
                aimRigid(body)
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
                aimRigid(body)
                if abs(body.velocity.dx) < ronin * 0.06, abs(body.restAngle - node.zRotation) < 0.02 {
                    rest(body)
                }
            }
        }
        // The falling drawn afresh, those furthest off first, a few always and more while time allows.
        due.sort { $0.off > $1.off }
        let start = ProcessInfo.processInfo.systemUptime
        for (k, entry) in due.enumerated() {
            if k < Carnage.fewest || ProcessInfo.processInfo.systemUptime - start < Carnage.spend {
                draw(entry.body)
            } else {
                aim(entry.body)
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
        // Nothing comes to rest on the ronin's own ground: it slides off to one side, and its blood pools where it
        // ends up.
        var x = node.position.x
        if abs(x - heroX) < ronin * 0.34 {
            x = heroX + (x < heroX ? -1 : 1) * ronin * 0.34
            node.run(.moveBy(x: x - node.position.x, y: 0, duration: 0.1))
        }
        let width = extents(node, node.zRotation).0 * 2 * (body.doll == nil ? 1 : 0.8)
        if !body.thin { body.pool = pool(at: x, width: width * 1.2, floor: body.floor) }
    }
}
