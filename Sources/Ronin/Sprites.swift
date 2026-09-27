import AppKit
import SpriteKit
import RoninArt
import RoninCore

/// A foe on the lane: its silhouette and shadow; while its blow is coming, a red flush, a glint and a warning marker
/// above its head whose ring runs down to the blow; for an archer drawing, a red sight line to the ronin; and pips
/// for the cuts a tough one has left.
///
/// It moves smoothly: its position eases toward the fight's (so knock-backs and shoves glide instead of jumping),
/// each change of pose blends out of the one before, and it fades in as it arrives.
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
    private let shadow = SKSpriteNode(texture: Art.glow)
    private let glint = SKSpriteNode(texture: Art.glow)
    private let warning = SKNode()
    private let warningMark = SKShapeNode()
    private let warningRing = SKShapeNode()
    private let sight = SKSpriteNode(color: .white, size: CGSize(width: 1, height: 1))
    private var pips: [SKShapeNode] = []
    private var walk: CGFloat = 0
    private var shownX: CGFloat?
    private var ronin: CGFloat = 60
    private var idleClock = Double.random(in: 0...2)
    /// Seconds since the blow landed (or the bow loosed), and left in a stagger.
    private var strikeClock = 1.0
    private var staggerHold = 0.0
    private var hitFlash = 0.0
    private var jolt: CGFloat = 0
    private var shown = Frame.walk(0)
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
        for sprite in [echo, body] {
            sprite.anchorPoint = Figures.anchor
            sprite.texture = Figures.texture(cast, .walk(0))
            pivot.addChild(sprite)
        }
        echo.alpha = 0
        echo.zPosition = -0.1
        Art.setTint(body, Palette.blood, 0)
        glint.color = (Build.of(cast).eyes ?? Palette.blood).color()
        glint.colorBlendFactor = 1
        glint.blendMode = .add
        glint.alpha = 0
        pivot.addChild(glint)
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
        body.size = Figures.size(cast, ronin: ronin)
        echo.size = body.size
        pivot.position = CGPoint(x: 0, y: height * 0.5)
        body.position = CGPoint(x: 0, y: -height * 0.5)
        echo.position = body.position
        shadow.size = CGSize(width: height * 0.8, height: height * 0.12)
        glint.size = CGSize(width: height * 0.5, height: height * 0.5)
        glint.position = CGPoint(x: 0, y: height * 0.38)
        let s = max(5, ronin * 0.085)
        let mark = CGMutablePath()
        mark.move(to: CGPoint(x: -s * 0.45, y: s * 0.35))
        mark.addLine(to: CGPoint(x: s * 0.45, y: s * 0.35))
        mark.addLine(to: CGPoint(x: 0, y: -s * 0.6))
        mark.closeSubpath()
        warningMark.path = mark
        warning.position = CGPoint(x: 0, y: height * (kind == .warlord ? 1.3 : 1.12))
        let spacing = max(7, ronin * 0.11)
        for (k, pip) in pips.enumerated() {
            pip.position = CGPoint(x: (CGFloat(k) - CGFloat(pips.count - 1) / 2) * spacing, y: height * 1.1)
            pip.setScale(max(1, ronin / 60))
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
        if alpha < 1 { alpha = min(1, CGFloat(age / 0.35)) }
        let facingRight = foe.phase == .leaping ? foe.leapTo < 0 : foe.x < 0
        let facing: CGFloat = facingRight ? 1 : -1

        // Ease toward where the fight has it; a leap follows its arc exactly.
        var x = position.x
        if let last = shownX, foe.phase != .leaping, abs(position.x - last) < ronin * 2 {
            x = last + (position.x - last) * min(1, CGFloat(dt) * 14)
        }
        let moved = shownX.map { abs(x - $0) } ?? 0
        shownX = x
        self.position = CGPoint(x: x - facing * jolt, y: position.y + air)
        shadow.position = CGPoint(x: 0, y: -air)
        shadow.alpha = 0.6 * max(0.25, 1 - air / (ronin * 1.2))
        body.xScale = facing
        echo.xScale = facing
        glint.position.x = facing * height * 0.07

        var frame: Frame
        switch foe.phase {
        case .advancing:
            if dt == 0 {
                frame = shown
            } else if moved > 0.04 {
                walk += moved / max(3, height * 0.085 * Build.of(cast).stride)
                frame = .walk(Int(walk) % Frame.walkFrames)
            } else {
                frame = staggerHold > 0 ? .stagger : .idle(Int(idleClock * 3) % Frame.foeIdleFrames)
            }
        case .windup:
            frame = .windup(foe.progress < 0.3 ? 0 : foe.progress < 0.78 ? 1 : 2)
        case .aiming: frame = .aim
        case .recoil:
            if strikeClock < 0.24 {
                frame = kind == .archer ? .loose : .strike(strikeClock < 0.09 ? 0 : 1)
            } else if staggerHold > 0 {
                frame = .stagger
            } else {
                frame = kind == .archer ? .loose : .idle(Int(idleClock * 3) % Frame.foeIdleFrames)
            }
        case .leaping: frame = .leap
        case .dying: frame = .stagger
        }
        if !Figures.has(cast, frame) { frame = .idle(0) }
        if frame != shown { changePose(to: frame) }
        if echo.alpha > 0 { echo.alpha = max(0, echo.alpha - CGFloat(dt) / 0.1 * 0.5) }

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

        for (k, pip) in pips.enumerated() {
            pip.fillColor = k < foe.hp ? Build.of(cast).accent.mix(.white, 0.35).color() : SKColor(white: 1, alpha: 0.15)
            pip.isHidden = foe.phase == .leaping
        }
    }

    /// Swaps in a new pose, keeping the old one a moment behind it so the change reads as movement, not a cut.
    private func changePose(to frame: Frame) {
        let walking: (Frame) -> Bool = { if case .walk = $0 { return true } else { return false } }
        if !(walking(frame) && walking(shown)) {
            echo.texture = body.texture
            echo.alpha = 0.5
        }
        shown = frame
        body.texture = Figures.texture(cast, frame)
    }

    func showStrike() { strikeClock = 0 }
    func showStagger() { staggerHold = 0.3 }

    func flashHit() {
        hitFlash = 0.14
        jolt = ronin * 0.06
    }
}

/// The ronin, who is the show: a breathing guard with his ribbons and coat stirring; six-frame cuts (the blade drawn
/// back, the swing, full extension, the follow-through, two frames settling into guard); afterimages when he closes
/// a long gap; a ghost of his old stance when he turns; a stumble and a wound in two beats each; and at the end of a
/// stage either the flick of blood from the blade and the slow slide of the blade home, or the fall to one knee.
@MainActor
final class HeroSprite: SKNode {
    let body = SKSpriteNode()
    private let echo = SKSpriteNode()
    private let shadow = SKSpriteNode(texture: Art.glow)
    private let aura = SKSpriteNode(texture: Art.glow)
    private(set) var facing = Side.right
    private var pose = Frame.idle(0)
    /// What he is doing, and for how long he has been doing it.
    private enum Act { case guarding, cutting(Cut), stumbling, hurting, flourishing, falling }
    private var act = Act.guarding
    private var clock = 0.0
    private var lunge: CGFloat = 0
    private var breath = 0.0
    private var flush: CGFloat = 0
    private var ronin: CGFloat = 60
    var home = CGPoint.zero

    /// Seconds each frame of a cut shows: drawn back, swing, extension, follow-through, settle, settle.
    static let cutTiming: [Double] = [0.022, 0.035, 0.045, 0.07, 0.075, 0.075]
    static let flourishTiming: [Double] = [0.22, 0.16, 0.3, 0.3]

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
        for sprite in [echo, body] {
            sprite.anchorPoint = Figures.anchor
            sprite.texture = Figures.texture(.hero, .idle(0))
            addChild(sprite)
        }
        echo.alpha = 0
        echo.zPosition = -0.5
        Art.setTint(body, Palette.blood, 0)
    }

    required init?(coder aDecoder: NSCoder) { nil }

    func layout(ronin: CGFloat, home: CGPoint) {
        self.ronin = ronin
        self.home = home
        body.size = Figures.size(.hero, ronin: ronin)
        echo.size = body.size
        shadow.size = CGSize(width: ronin * 0.9, height: ronin * 0.13)
        aura.size = CGSize(width: ronin * 1.7, height: ronin * 1.7)
        aura.position = CGPoint(x: 0, y: ronin * 0.5)
        position = home
    }

    func reset() {
        act = .guarding
        clock = 0
        lunge = 0
        flush = 0
        show(.idle(0), blend: false)
        Art.setTint(body, Palette.blood, 0)
    }

    func face(_ side: Side) {
        guard side != facing else { return }
        // A ghost of the old stance, turned away, fading as he comes round.
        echo.texture = body.texture
        echo.xScale = body.xScale
        echo.alpha = 0.45
        facing = side
        body.xScale = side == .right ? 1 : -1
    }

    private var ended: Bool {
        switch act {
        case .flourishing, .falling: return true
        default: return false
        }
    }

    /// A cut that landed (or was aimed) `distance` points away. A long reach leaves afterimages along the lunge.
    func cut(_ side: Side, _ style: Cut, distance: CGFloat) {
        guard !ended else { return }
        face(side)
        act = .cutting(style)
        clock = 0
        let reach = min(ronin * 0.2, max(0, distance - ronin * 0.3) * 0.32)
        lunge = side.sign.cg * reach
        show(.cut(style, 0), blend: false)
        if distance > ronin * 0.7 { afterimages(side, distance) }
    }

    /// Pale copies of the ronin strung along the gap he just crossed, gone in a blink.
    private func afterimages(_ side: Side, _ distance: CGFloat) {
        guard let parent else { return }
        for k in 1...3 {
            let ghost = SKSpriteNode(texture: Figures.texture(.hero, k == 3 ? .cut(.thrust, 1) : .cut(.level, 1)))
            ghost.anchorPoint = Figures.anchor
            ghost.size = body.size
            ghost.xScale = body.xScale
            ghost.position = CGPoint(x: home.x + side.sign.cg * distance * CGFloat(k) * 0.2, y: home.y)
            ghost.zPosition = zPosition - 0.5
            Art.setTint(ghost, Palette.steel, 0.8)
            ghost.alpha = 0.32 - 0.07 * CGFloat(k)
            ghost.run(.sequence([.fadeOut(withDuration: 0.16), .removeFromParent()]))
            parent.addChild(ghost)
        }
    }

    func whiff(_ side: Side, for seconds: Double) {
        guard !ended else { return }
        face(side)
        act = .stumbling
        clock = -max(0, seconds - 0.3)
        lunge = side.sign.cg * ronin * 0.12
        show(.stumble(0), blend: true)
    }

    func hurt() {
        guard !ended else { return }
        act = .hurting
        clock = 0
        lunge = -facing.sign.cg * ronin * 0.07
        flush = 0.85
        show(.hurt(0), blend: true)
    }

    func finish(victory: Bool) {
        act = victory ? .flourishing : .falling
        clock = 0
        lunge = 0
        flush = 0
        show(victory ? .flourish(0) : .fall(0), blend: true)
    }

    private func show(_ frame: Frame, blend: Bool) {
        guard frame != pose else { return }
        if blend {
            echo.texture = body.texture
            echo.xScale = body.xScale
            echo.alpha = 0.4
        }
        pose = frame
        body.texture = Figures.texture(.hero, frame)
    }

    func update(dt: Double, bloodlust: Bool) {
        breath += dt
        clock += dt
        switch act {
        case .guarding:
            show(.idle(Int(breath * 7) % Frame.heroIdleFrames), blend: false)
        case .cutting(let style):
            var t = clock, phase = 0
            while phase < HeroSprite.cutTiming.count, t >= HeroSprite.cutTiming[phase] {
                t -= HeroSprite.cutTiming[phase]
                phase += 1
            }
            if phase < Frame.cutFrames {
                show(.cut(style, phase), blend: false)
            } else {
                act = .guarding
                show(.idle(Int(breath * 7) % Frame.heroIdleFrames), blend: true)
            }
        case .stumbling:
            if clock < 0.15 { show(.stumble(0), blend: false) }
            else if clock < 0.3 { show(.stumble(1), blend: true) }
            else {
                act = .guarding
                show(.idle(0), blend: true)
            }
        case .hurting:
            if clock < 0.12 { show(.hurt(0), blend: false) }
            else if clock < 0.28 { show(.hurt(1), blend: true) }
            else {
                act = .guarding
                show(.idle(0), blend: true)
            }
        case .flourishing:
            // A beat of stillness after the last kill, then the flick, then the blade slid home.
            var t = clock - 0.25, k = 0
            while k < HeroSprite.flourishTiming.count, t >= HeroSprite.flourishTiming[k] {
                t -= HeroSprite.flourishTiming[k]
                k += 1
            }
            show(.flourish(min(k, Frame.flourishFrames - 1)), blend: true)
        case .falling:
            show(.fall(clock < 0.14 ? 0 : clock < 0.36 ? 1 : 2), blend: true)
        }
        if echo.alpha > 0 { echo.alpha = max(0, echo.alpha - CGFloat(dt) / 0.12 * 0.45) }
        lunge *= CGFloat(pow(0.00002, dt))
        position = CGPoint(x: home.x + lunge, y: home.y)
        if flush > 0 { flush = max(0, flush - CGFloat(dt) * 4) }
        Art.setTint(body, Palette.blood, flush)
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
