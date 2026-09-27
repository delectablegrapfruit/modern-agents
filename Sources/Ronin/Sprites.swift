import AppKit
import SpriteKit
import RoninArt
import RoninCore

/// A foe on the lane: its silhouette and shadow; while its blow is coming, a red flush, a glint and a warning marker
/// above its head whose ring runs down to the blow; for an archer drawing, a red sight line to the ronin; pips for
/// the cuts a tough one has left; the gourd over a bearer's head; the warlord's guard as a pale ward before him, and
/// his fury as a red haze that deepens as he is cut down.
///
/// It moves smoothly: its position eases toward the fight's (so knock-backs and shoves glide instead of jumping),
/// each change of pose blends out of the one before, it leans into its stride and lurches into its blows, squashes
/// as it lands, and it fades in as it arrives.
@MainActor
final class FoeSprite: SKNode {
    let id: Int
    let kind: Kind
    let cast: Cast
    /// Turns about the figure's middle (for somersaults); the body hangs from it by the feet.
    let pivot = SKNode()
    let body = SKSpriteNode()
    /// The pose it just left, fading out behind the new one.
    private let echo = SKSpriteNode()
    private var echoFrame = Frame.walk(0)
    private let shadow = SKSpriteNode(texture: Art.glow)
    private let glint = SKSpriteNode(texture: Art.glow)
    private let fury = SKSpriteNode(texture: Art.glow)
    private let ward = SKSpriteNode(texture: Art.crescent)
    private let warning = SKNode()
    private let warningMark = SKShapeNode()
    private let warningRing = SKShapeNode()
    private let sight = SKSpriteNode(color: .white, size: CGSize(width: 1, height: 1))
    private var pips: [SKShapeNode] = []
    private(set) var gourd: SKNode?
    private var walk: CGFloat = 0
    private var shownX: CGFloat?
    private var ronin: CGFloat = 60
    private var idleClock = Double.random(in: 0...2)
    /// Seconds since the blow landed (or the bow loosed), and left in a stagger.
    private var strikeClock = 1.0
    private var staggerHold = 0.0
    private var hitFlash = 0.0
    private var jolt: CGFloat = 0
    private var lurch: CGFloat = 0
    private var lean: CGFloat = 0
    private var squash: CGFloat = 0
    private var wasLeaping = false
    private var facing: CGFloat = 1
    private(set) var shown = Frame.walk(0)
    private var age = 0.0

    init(foe: Foe, ronin: CGFloat) {
        id = foe.id
        kind = foe.kind
        cast = .foe(foe.kind)
        super.init()
        shadow.color = .black
        shadow.colorBlendFactor = 1
        shadow.alpha = 0.6
        shadow.zPosition = -1
        addChild(shadow)
        addChild(pivot)
        fury.color = Palette.blood.color()
        fury.colorBlendFactor = 1
        fury.blendMode = .add
        fury.alpha = 0
        fury.zPosition = -0.3
        pivot.addChild(fury)
        for sprite in [echo, body] { pivot.addChild(sprite) }
        echo.alpha = 0
        echo.zPosition = -0.1
        Art.setTint(body, Palette.blood, 0)
        glint.color = (Build.of(cast).eyes ?? Palette.blood).color()
        glint.colorBlendFactor = 1
        glint.blendMode = .add
        glint.alpha = 0
        pivot.addChild(glint)
        ward.color = Palette.steel.mix(.white, 0.4).color()
        ward.colorBlendFactor = 1
        ward.blendMode = .add
        ward.alpha = 0
        ward.zPosition = 0.5
        pivot.addChild(ward)
        sight.anchorPoint = CGPoint(x: 0, y: 0.5)
        sight.color = Palette.blood.color()
        sight.blendMode = .add
        sight.alpha = 0
        sight.zPosition = -0.5
        addChild(sight)
        warningMark.fillColor = Palette.blood.mix(.white, 0.15).color()
        warningMark.strokeColor = SKColor(white: 0, alpha: 0.6)
        warningMark.lineWidth = 1
        warningRing.strokeColor = Palette.blood.mix(.white, 0.35).color()
        warningRing.lineCap = .round
        warningRing.lineWidth = 1.6
        warning.addChild(warningRing)
        warning.addChild(warningMark)
        warning.isHidden = true
        warning.zPosition = 2
        addChild(warning)
        if foe.maxHP > 1, foe.kind != .warlord {
            for _ in 0..<foe.maxHP {
                let pip = Icons.heart(6)
                pip.strokeColor = SKColor(white: 0, alpha: 0.7)
                addChild(pip)
                pips.append(pip)
            }
        }
        alpha = 0
        layout(ronin: ronin)
    }

    required init?(coder aDecoder: NSCoder) { nil }

    var height: CGFloat { ronin * Build.of(cast).height }

    func layout(ronin: CGFloat) {
        self.ronin = ronin
        Figures.apply(body, cast, shown, ronin: ronin)
        Figures.apply(echo, cast, echoFrame, ronin: ronin)
        pivot.position = CGPoint(x: 0, y: height * 0.5)
        body.position = CGPoint(x: 0, y: -height * 0.5)
        echo.position = body.position
        shadow.size = CGSize(width: height * 0.8, height: height * 0.12)
        glint.size = CGSize(width: height * 0.5, height: height * 0.5)
        glint.position = CGPoint(x: 0, y: height * 0.38)
        fury.size = CGSize(width: height * 1.5, height: height * 1.5)
        fury.position = CGPoint(x: 0, y: -height * 0.05)
        ward.size = CGSize(width: height * 0.8, height: height * 0.95)
        let s = max(5, ronin * 0.085)
        let mark = CGMutablePath()
        mark.move(to: CGPoint(x: -s * 0.45, y: s * 0.35))
        mark.addLine(to: CGPoint(x: s * 0.45, y: s * 0.35))
        mark.addLine(to: CGPoint(x: 0, y: -s * 0.6))
        mark.closeSubpath()
        warningMark.path = mark
        let spacing = max(7, ronin * 0.11)
        for (k, pip) in pips.enumerated() {
            pip.position = CGPoint(x: (CGFloat(k) - CGFloat(pips.count - 1) / 2) * spacing, y: height * 1.1)
            pip.setScale(max(1, ronin / 60))
        }
        placeOverhead()
    }

    /// The warning marker goes above the gourd when there is one.
    private func placeOverhead() {
        let head = height * (kind == .warlord ? 1.3 : 1.12)
        gourd?.position = CGPoint(x: 0, y: head)
        warning.position = CGPoint(x: 0, y: gourd == nil ? head : head + ronin * 0.2)
    }

    private func showGourd() {
        let node = SKNode()
        let halo = SKSpriteNode(texture: Art.glow)
        halo.size = CGSize(width: ronin * 0.42, height: ronin * 0.42)
        halo.color = Palette.jade.color()
        halo.colorBlendFactor = 1
        halo.blendMode = .add
        halo.alpha = 0.5
        halo.run(.repeatForever(.sequence([.fadeAlpha(to: 0.2, duration: 0.5), .fadeAlpha(to: 0.6, duration: 0.5)])))
        node.addChild(halo)
        node.addChild(Icons.gourd(max(9, ronin * 0.17), Palette.jade.mix(.white, 0.25).color()))
        node.run(.repeatForever(.sequence([.moveBy(x: 0, y: 2, duration: 0.6), .moveBy(x: 0, y: -2, duration: 0.6)])))
        addChild(node)
        gourd = node
        placeOverhead()
    }

    /// Takes the gourd away: drunk (it flies to the ronin, the scene does that) or spilled (it breaks here).
    func dropGourd(broken: Bool) {
        guard let gourd else { return }
        self.gourd = nil
        let at = gourd.position
        gourd.removeFromParent()
        placeOverhead()
        if broken, let parent {
            let shards = Art.burst(Palette.jade.mix(.black, 0.2), count: 14, speed: ronin * 1.3, size: ronin * 0.06, life: 0.5,
                                   spread: 1.4, angle: .pi / 2, gravity: ronin * 5, additive: false)
            shards.position = convert(at, to: parent)
            parent.addChild(shards)
        }
    }

    /// Puts the foe where the fight has it and picks its frame. `hero` is the ronin's x, for the archer's sight line.
    func update(_ foe: Foe, at position: CGPoint, air: CGFloat, hero: CGFloat, dt: Double) {
        age += dt
        strikeClock += dt
        staggerHold = max(0, staggerHold - dt)
        hitFlash = max(0, hitFlash - dt)
        idleClock += dt
        jolt *= CGFloat(pow(0.0005, dt))
        lurch *= CGFloat(pow(0.0002, dt))
        squash *= CGFloat(pow(0.0004, dt))
        if alpha < 1 { alpha = min(1, CGFloat(age / 0.35)) }
        if foe.bearer, gourd == nil { showGourd() } else if !foe.bearer, gourd != nil { dropGourd(broken: false) }
        // Facing the ronin, except in the air (where he is going) and running off with the gourd (away).
        let facingRight = foe.phase == .leaping ? foe.leapTo < 0 : foe.phase == .fleeing ? foe.x > 0 : foe.x < 0
        facing = facingRight ? 1 : -1

        // Ease toward where the fight has it; a leap follows its arc exactly.
        var x = position.x
        if let last = shownX, foe.phase != .leaping, abs(position.x - last) < ronin * 2 {
            x = last + (position.x - last) * min(1, CGFloat(dt) * 14)
        }
        let moved = shownX.map { abs(x - $0) } ?? 0
        shownX = x
        self.position = CGPoint(x: x - facing * jolt + facing * lurch, y: position.y + air)
        shadow.position = CGPoint(x: 0, y: -air)
        shadow.alpha = 0.6 * max(0.25, 1 - air / (ronin * 1.2))
        glint.position.x = facing * height * 0.07

        var frame: Frame
        var leanTarget: CGFloat = 0
        switch foe.phase {
        case .advancing, .fleeing:
            if dt == 0 {
                frame = shown
            } else if moved > 0.04 {
                // A frame for each twelfth of a stride travelled, so the feet keep to the ground.
                walk += moved / max(1, height * Figure.stride(cast) / CGFloat(Frame.walkFrames))
                frame = .walk(Int(walk) % Frame.walkFrames)
                // Leaning into the stride, harder the faster it comes.
                leanTarget = min(0.1, CGFloat(Double(moved) / dt) / ronin * 0.045)
            } else {
                frame = staggerHold > 0 ? .stagger(staggerHold > 0.15 ? 0 : 1) : .idle(Int(idleClock * 5) % Frame.foeIdleFrames)
            }
        case .windup:
            let t = foe.progress
            frame = .windup(t < 0.18 ? 0 : t < 0.42 ? 1 : t < 0.8 ? 2 : 3)
            leanTarget = -0.04 * CGFloat(t)
        case .aiming:
            // Kyūdō: the bow raised, drawn open as it comes down, then held at full draw.
            let t = foe.progress
            frame = t < 0.18 ? .windup(0) : t < 0.32 ? .windup(1) : t < 0.46 ? .windup(2) : t < 0.58 ? .windup(3) : .aim
        case .guarding:
            frame = .block
        case .recoil:
            if strikeClock < 0.3 {
                frame = kind == .archer ? .loose : .strike(strikeClock < 0.09 ? 0 : strikeClock < 0.19 ? 1 : 2)
            } else if staggerHold > 0 {
                frame = .stagger(staggerHold > 0.15 ? 0 : 1)
                leanTarget = -0.1
            } else {
                frame = kind == .archer ? .loose : .idle(Int(idleClock * 5) % Frame.foeIdleFrames)
            }
        case .leaping: frame = .leap
        case .dying: frame = .stagger(0)
        }
        if !Figures.has(cast, frame) { frame = .idle(0) }
        if frame != shown { changePose(to: frame) }
        if echo.alpha > 0 { echo.alpha = max(0, echo.alpha - CGFloat(dt) / 0.1 * 0.5) }
        if wasLeaping, foe.phase != .leaping { squash = 0.16 }
        wasLeaping = foe.phase == .leaping

        lean += (leanTarget - lean) * min(1, CGFloat(dt) * 10)
        for sprite in [body, echo] {
            sprite.zRotation = -facing * lean
            sprite.xScale = facing * (1 + squash * 0.5)
            sprite.yScale = 1 - squash
        }

        if foe.phase == .leaping {
            pivot.zRotation = -CGFloat(foe.progress) * 2 * .pi * (foe.leapTo > 0 ? 1 : -1)
        } else if pivot.zRotation != 0 {
            pivot.zRotation *= 0.5
            if abs(pivot.zRotation) < 0.01 { pivot.zRotation = 0 }
        }

        // The telegraph: a red flush, a swelling glint, and a warning marker whose ring runs out as the blow lands.
        let charging = foe.phase == .windup || foe.phase == .aiming
        let t = charging ? CGFloat(foe.progress) : 0
        if hitFlash > 0 {
            Art.setTint(body, .white, CGFloat(hitFlash / 0.14) * 0.85)
        } else if charging {
            Art.setTint(body, Palette.blood, (0.12 + 0.5 * t * t) * (kind == .archer ? 0.6 : 1))
        } else {
            Art.setTint(body, Palette.blood, 0)
        }
        glint.alpha = charging ? 0.25 + 0.75 * t : 0
        glint.setScale(charging ? 0.6 + 0.5 * t + 0.12 * CGFloat(sin(foe.timer * 40)) : 1)
        warning.isHidden = foe.phase != .windup
        if foe.phase == .windup {
            let r = max(6, ronin * 0.12)
            let ring = CGMutablePath()
            ring.addArc(center: .zero, radius: r, startAngle: .pi / 2, endAngle: .pi / 2 + (1 - t) * 2 * .pi, clockwise: false)
            warningRing.path = ring
            warning.setScale(1 + 0.15 * CGFloat(max(0, sin(foe.timer * 30))) * t)
        }
        // An archer's sight line: from his bow to the ronin, brightening as he draws.
        if foe.phase == .aiming {
            let reach = abs(hero - x) - ronin * 0.2
            sight.isHidden = reach <= 0
            sight.size = CGSize(width: max(0, reach), height: max(1, ronin * 0.015))
            sight.xScale = facing
            sight.position = CGPoint(x: facing * ronin * 0.2, y: height * 0.6)
            sight.alpha = 0.08 + 0.5 * t * t
        } else {
            sight.alpha = 0
        }
        // The warlord's guard: a pale ward before him, steady while it is up.
        let guarding = foe.phase == .guarding
        ward.position = CGPoint(x: facing * height * 0.3, y: -height * 0.02)
        ward.xScale = facing
        let wardTarget: CGFloat = guarding ? 0.45 + 0.12 * CGFloat(sin(age * 14)) : 0
        ward.alpha += (wardTarget - ward.alpha) * min(1, CGFloat(dt) * 16)
        // His fury: a red haze that deepens as he is cut down.
        if kind == .warlord {
            let rage = 1 - CGFloat(foe.hp) / CGFloat(max(1, foe.maxHP))
            fury.alpha = rage * (0.35 + 0.15 * CGFloat(sin(age * 6)))
        }

        for (k, pip) in pips.enumerated() {
            pip.fillColor = k < foe.hp ? Build.of(cast).accent.mix(.white, 0.35).color() : SKColor(white: 1, alpha: 0.15)
            pip.isHidden = foe.phase == .leaping
        }
        gourd?.isHidden = foe.phase == .leaping
    }

    /// Swaps in a new pose. A jump to a different kind of pose keeps the old one a moment behind it, so the change
    /// reads as movement, not a cut; the frames of one motion (a stride, a breath, a wind-up) follow on cleanly.
    private func changePose(to frame: Frame) {
        func family(_ f: Frame) -> Int {
            switch f {
            case .walk: return 0
            case .idle: return 1
            case .windup, .aim: return 2
            case .strike: return 3
            case .stagger: return 4
            default: return 5
            }
        }
        if family(frame) != family(shown) {
            echoFrame = shown
            Figures.apply(echo, cast, echoFrame, ronin: ronin)
            echo.alpha = 0.45
        }
        shown = frame
        Figures.apply(body, cast, frame, ronin: ronin)
    }

    /// The blow: a lurch forward behind it.
    func showStrike() {
        strikeClock = 0
        lurch = ronin * (kind == .brute || kind == .warlord ? 0.09 : 0.06)
        if kind == .brute { squash = 0.08 }
    }

    func showStagger() { staggerHold = 0.3 }

    /// The instant of a killing blow: thrown into his struck pose and lit white, held there until the blade arrives.
    func freezeStruck() {
        changePose(to: .stagger(0))
        Art.setTint(body, .white, 0.9)
        warning.isHidden = true
        sight.alpha = 0
        glint.alpha = 0
    }

    func flashHit() {
        hitFlash = 0.14
        jolt = ronin * 0.08
        squash = 0.09
    }

    /// The wound a cut leaves across him, laid along the cut: raw red, fading.
    func gash(_ tilt: CGFloat) {
        let cut = SKSpriteNode(texture: Art.streak)
        cut.size = CGSize(width: height * 0.6, height: max(2, height * 0.04))
        cut.position = CGPoint(x: 0, y: height * 0.06)
        cut.zRotation = tilt * facing
        cut.color = Palette.blood.mix(.white, 0.1).color()
        cut.colorBlendFactor = 1
        cut.zPosition = 1
        pivot.addChild(cut)
        cut.run(.sequence([.wait(forDuration: 0.3), .fadeOut(withDuration: 0.45), .removeFromParent()]))
    }

    /// A cut turned aside: the blade rings, the warlord rocks but holds.
    func showParry() {
        jolt = ronin * 0.03
        ward.alpha = 1
    }
}

/// The ronin, who is the show: the iai stance at the start of a stage with his blade sheathed, and the draw-cut out
/// of it; a breathing chūdan guard with his ribbons and coat stirring; seven-frame cuts (chambered, the swing with the
/// wrists cocked, the whip through, full extension, follow-through, zanshin, back to guard) on a darting lunge that
/// stretches him into the cut; afterimages when he closes a long gap; a ghost of his old stance when he turns; a
/// stumble, a parried cut and a wound in two beats each; and at the end of a stage either the chiburi and the slow
/// slide of the blade home, or the fall to one knee.
@MainActor
final class HeroSprite: SKNode {
    let body = SKSpriteNode()
    private let echo = SKSpriteNode()
    private let shadow = SKSpriteNode(texture: Art.glow)
    private let aura = SKSpriteNode(texture: Art.glow)
    private(set) var facing = Side.right
    private var pose = Frame.iai(0)
    private var echoPose = Frame.iai(0)
    /// What he is doing, and for how long he has been doing it.
    private enum Act { case guarding, cutting(Cut), stumbling, repelled, hurting, flourishing, falling }
    private var act = Act.guarding
    /// Whether the blade is in its scabbard: from the end of one stage to the first cut of the next.
    private(set) var sheathed = true
    private var clock = 0.0
    private var hold = 0.0
    private var lungeTo: CGFloat = 0
    private var lungeClock = 1.0
    /// Stretched into a cut (above 0), squashed by a blow (below).
    private var snap: CGFloat = 0
    private var breath = 0.0
    private var flush: CGFloat = 0
    /// How much of the stage's blood is on him; the chiburi throws it off.
    private var gore: CGFloat = 0
    private var ronin: CGFloat = 60
    var home = CGPoint.zero

    /// How long after the press the drawn blade reaches its mark: the chamber and the first four frames of the swing.
    static func impact(_ style: Cut) -> Double {
        (style == .nukitsuke ? drawTiming : cutTiming).prefix(4).reduce(0, +)
    }

    /// Seconds each frame of a cut shows: chambered, five through the swing to the blow, two of follow-through,
    /// zanshin, and the return. The blow lands a tenth of a second after the press.
    static let cutTiming: [Double] = [0.016, 0.017, 0.018, 0.02, 0.024, 0.04, 0.045, 0.05, 0.08, 0.06]
    /// The draw-cut is a hair slower out of the scabbard.
    static let drawTiming: [Double] = [0.028, 0.024, 0.024, 0.022, 0.022, 0.04, 0.045, 0.05, 0.085, 0.07]
    static let flourishTiming: [Double] = [0.12, 0.16, 0.05, 0.12, 0.26, 0.26]
    /// When each frame of the fall begins: struck, the knees going, kneeling on the sword, going over, face down.
    static let fallTiming: [Double] = [0, 0.14, 0.34, 1.05, 1.22]

    override init() {
        super.init()
        shadow.color = .black
        shadow.colorBlendFactor = 1
        shadow.alpha = 0.65
        shadow.zPosition = -2
        addChild(shadow)
        aura.color = Palette.blood.color()
        aura.colorBlendFactor = 1
        aura.blendMode = .add
        aura.alpha = 0
        aura.zPosition = -1
        addChild(aura)
        for sprite in [echo, body] { addChild(sprite) }
        echo.alpha = 0
        echo.zPosition = -0.5
        Art.setTint(body, Palette.blood, 0)
    }

    required init?(coder aDecoder: NSCoder) { nil }

    func layout(ronin: CGFloat, home: CGPoint) {
        self.ronin = ronin
        self.home = home
        Figures.apply(body, .hero, pose, ronin: ronin)
        Figures.apply(echo, .hero, echoPose, ronin: ronin)
        shadow.size = CGSize(width: ronin * 0.9, height: ronin * 0.13)
        aura.size = CGSize(width: ronin * 1.7, height: ronin * 1.7)
        aura.position = CGPoint(x: 0, y: ronin * 0.5)
        position = home
    }

    /// A new stage: in the iai stance with the blade sheathed, or (a fight picked up partway) in guard.
    func reset(sheathed: Bool) {
        act = .guarding
        self.sheathed = sheathed
        clock = 0
        lungeTo = 0
        flush = 0
        gore = 0
        snap = 0
        show(sheathed ? .iai(0) : .idle(0), blend: false)
        Art.setTint(body, Palette.blood, 0)
    }

    func face(_ side: Side) {
        guard side != facing else { return }
        // A ghost of the old stance, turned away, fading as he comes round.
        echoPose = pose
        Figures.apply(echo, .hero, echoPose, ronin: ronin)
        echo.xScale = body.xScale
        echo.alpha = 0.45
        facing = side
    }

    private var ended: Bool {
        switch act {
        case .flourishing, .falling: return true
        default: return false
        }
    }

    /// A cut that landed (or was aimed) `distance` points away: he darts out along the lane into it and back. A
    /// long reach leaves afterimages along the lunge.
    func cut(_ side: Side, _ style: Cut, distance: CGFloat) {
        guard !ended else { return }
        face(side)
        act = .cutting(style)
        sheathed = false
        clock = 0
        lungeTo = side.sign.cg * min(ronin * 0.22, max(0, distance - ronin * 0.3) * 0.34)
        lungeClock = 0
        snap = 1
        show(.cut(style, 0), blend: false)
        if distance > ronin * 0.95 { afterimages(side, style, distance) }
    }

    /// Faint copies of the ronin in the cut's own pose, strung out toward the foe across the gap he closed, gone
    /// in a blink.
    private func afterimages(_ side: Side, _ style: Cut, _ distance: CGFloat) {
        guard let parent else { return }
        let span = distance - ronin * 0.35
        for k in 1...2 {
            let ghost = SKSpriteNode()
            Figures.apply(ghost, .hero, .cut(style, 5), ronin: ronin)
            ghost.xScale = side == .right ? 1 : -1
            ghost.position = CGPoint(x: home.x + side.sign.cg * span * CGFloat(k) / 3, y: home.y)
            ghost.zPosition = zPosition - 0.5
            Art.setTint(ghost, Palette.steel.mix(Palette.silhouette, 0.4), 0.35)
            ghost.alpha = 0.26 - 0.08 * CGFloat(k)
            ghost.run(.sequence([.fadeOut(withDuration: 0.14), .removeFromParent()]))
            parent.addChild(ghost)
        }
    }

    func whiff(_ side: Side, for seconds: Double) {
        guard !ended else { return }
        face(side)
        act = .stumbling
        sheathed = false
        clock = 0
        hold = max(0.3, seconds)
        lungeTo = side.sign.cg * ronin * 0.12
        lungeClock = 0
        show(.stumble(0), blend: true)
    }

    /// A cut turned aside by the warlord's guard: the blade flung back, a step back on his heels.
    func repel(_ side: Side, for seconds: Double) {
        guard !ended else { return }
        face(side)
        act = .repelled
        sheathed = false
        clock = 0
        hold = max(0.3, seconds)
        lungeTo = -side.sign.cg * ronin * 0.1
        lungeClock = 0.04
        snap = -0.8
        show(.repelled(0), blend: true)
    }

    func hurt() {
        guard !ended else { return }
        act = .hurting
        clock = 0
        lungeTo = -facing.sign.cg * ronin * 0.07
        lungeClock = 0.04
        flush = 0.85
        snap = -1
        show(sheathed ? .iai(0) : .hurt(0), blend: true)
    }

    func bloodied(_ amount: CGFloat) { gore = min(0.14, gore + amount) }

    func finish(victory: Bool) {
        act = victory ? .flourishing : .falling
        clock = 0
        lungeTo = 0
        flush = 0
        show(victory ? .flourish(0) : .fall(0), blend: true)
    }

    private func show(_ frame: Frame, blend: Bool) {
        guard frame != pose else { return }
        if blend {
            echoPose = pose
            Figures.apply(echo, .hero, echoPose, ronin: ronin)
            echo.xScale = body.xScale
            echo.alpha = 0.4
        }
        pose = frame
        Figures.apply(body, .hero, frame, ronin: ronin)
    }

    /// The snap of the chiburi: the blood on the blade flung off in a spray onto the ground.
    private func chiburi() {
        guard let parent else { return }
        let sign: CGFloat = facing == .right ? 1 : -1
        let spray = Art.burst(Palette.blood.mix(.black, 0.2), count: Int(20 + gore * 60), speed: ronin * 2.2, size: ronin * 0.05, life: 0.45,
                              spread: 0.5, angle: sign > 0 ? -0.35 : .pi + 0.35, gravity: ronin * 7, additive: false)
        spray.position = CGPoint(x: home.x + sign * ronin * 0.45, y: home.y + ronin * 0.42)
        parent.addChild(spray)
        gore = 0
    }

    private func settle() {
        act = .guarding
        show(sheathed ? .iai(0) : .idle(Int(breath * 7) % Frame.heroIdleFrames), blend: true)
    }

    func update(dt: Double, bloodlust: Bool) {
        breath += dt
        clock += dt
        lungeClock += dt
        switch act {
        case .guarding:
            show(sheathed ? .iai(Int(breath * 5) % Frame.iaiFrames) : .idle(Int(breath * 8) % Frame.heroIdleFrames), blend: false)
        case .cutting(let style):
            let timing = style == .nukitsuke ? HeroSprite.drawTiming : HeroSprite.cutTiming
            var t = clock, phase = 0
            while phase < timing.count, t >= timing[phase] {
                t -= timing[phase]
                phase += 1
            }
            if phase < Frame.cutFrames { show(.cut(style, phase), blend: false) } else { settle() }
        case .stumbling:
            if clock < 0.15 { show(.stumble(0), blend: false) }
            else if clock < hold { show(.stumble(1), blend: true) }
            else { settle() }
        case .repelled:
            if clock < 0.14 { show(.repelled(0), blend: false) }
            else if clock < hold { show(.repelled(1), blend: true) }
            else { settle() }
        case .hurting:
            if sheathed {
                if clock >= 0.32 { settle() }
            } else if clock < 0.07 { show(.hurt(0), blend: false) }
            else if clock < 0.17 { show(.hurt(1), blend: false) }
            else if clock < 0.32 { show(.hurt(2), blend: true) }
            else { settle() }
        case .flourishing:
            // A beat of stillness after the last kill, then the chiburi, then the blade slid home.
            var t = clock - 0.25, k = 0
            while k < HeroSprite.flourishTiming.count, t >= HeroSprite.flourishTiming[k] {
                t -= HeroSprite.flourishTiming[k]
                k += 1
            }
            let frame = Frame.flourish(min(k, Frame.flourishFrames - 1))
            if frame == .flourish(3), pose != frame, gore > 0 { chiburi() }
            show(frame, blend: k != 3 && k != 2)
            if k >= Frame.flourishFrames - 1 { sheathed = true }
        case .falling:
            let k = HeroSprite.fallTiming.lastIndex { clock >= $0 } ?? 0
            show(.fall(k), blend: true)
        }
        if echo.alpha > 0 { echo.alpha = max(0, echo.alpha - CGFloat(dt) / 0.12 * 0.45) }
        // The lunge: out fast (eased) and home again more slowly.
        let dart = 0.04
        let out = lungeClock < dart ? 1 - pow(1 - CGFloat(lungeClock / dart), 2) : CGFloat(exp(-(lungeClock - dart) * 11))
        position = CGPoint(x: home.x + lungeTo * out, y: home.y)
        snap *= CGFloat(exp(-dt * 16))
        let sign: CGFloat = facing == .right ? 1 : -1
        body.xScale = sign * (1 + 0.05 * snap)
        body.yScale = 1 - 0.035 * snap
        if flush > 0 { flush = max(0, flush - CGFloat(dt) * 4) }
        // A wound flushes him red; the blood of the stage darkens him, a deep wet red rather than a bright one.
        if flush > gore { Art.setTint(body, Palette.blood, flush) } else { Art.setTint(body, Palette.blood.mix(.black, 0.55), gore) }
        let target: CGFloat = bloodlust && !ended ? 0.55 + 0.2 * CGFloat(sin(breath * 9)) : 0
        aura.alpha += (target - aura.alpha) * min(1, CGFloat(dt) * 8)
    }
}

/// An arrow in flight: dark with a hot red tip and a pale trail coming in, gold once cut back.
@MainActor
final class ArrowSprite: SKSpriteNode {
    let id: Int
    private(set) var deflected = false
    private let trail = SKSpriteNode(texture: Art.streak)
    private let tip = SKSpriteNode(texture: Art.glow)

    init(arrow: Arrow, ronin: CGFloat) {
        id = arrow.id
        super.init(texture: Art.arrow, color: Palette.silhouette.color(), size: CGSize(width: ronin * 0.42, height: ronin * 0.09))
        colorBlendFactor = 1
        trail.anchorPoint = CGPoint(x: 1, y: 0.5)
        trail.size = CGSize(width: ronin * 0.7, height: ronin * 0.14)
        trail.position = CGPoint(x: -size.width * 0.4, y: 0)
        trail.color = RGB(1, 0.85, 0.75).color()
        trail.colorBlendFactor = 1
        trail.alpha = 0.45
        trail.blendMode = .add
        addChild(trail)
        tip.size = CGSize(width: ronin * 0.28, height: ronin * 0.28)
        tip.position = CGPoint(x: size.width * 0.45, y: 0)
        tip.color = Palette.blood.color()
        tip.colorBlendFactor = 1
        tip.blendMode = .add
        tip.alpha = 0.9
        addChild(tip)
    }

    required init?(coder aDecoder: NSCoder) { nil }

    func update(_ arrow: Arrow, at p: CGPoint) {
        position = p
        xScale = arrow.velocity > 0 ? 1 : -1
        if arrow.deflected, !deflected {
            deflected = true
            color = Palette.gold.color()
            blendMode = .add
            trail.color = Palette.gold.color()
            trail.alpha = 0.9
            trail.size.width *= 2
            tip.color = Palette.gold.color()
        }
    }
}

extension Double {
    var cg: CGFloat { CGFloat(self) }
}
