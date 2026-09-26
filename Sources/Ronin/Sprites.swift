import AppKit
import SpriteKit
import RoninCore

/// A foe on the lane: its silhouette and shadow; while its blow is coming, a red flush, a glint and a warning marker
/// above its head whose ring runs down to the blow; for an archer drawing, a red sight line to the ronin; and pips
/// for the cuts a tough one has left.
@MainActor
final class FoeSprite: SKNode {
    let id: Int
    let kind: Kind
    let cast: Cast
    /// Turns about the figure's middle (for somersaults); the body hangs from it by the feet.
    let pivot = SKNode()
    let body = SKSpriteNode()
    private let shadow = SKSpriteNode(texture: Art.glow)
    private let glint = SKSpriteNode(texture: Art.glow)
    private let warning = SKNode()
    private let warningMark = SKShapeNode()
    private let warningRing = SKShapeNode()
    private let sight = SKSpriteNode(color: .white, size: CGSize(width: 1, height: 1))
    private var pips: [SKShapeNode] = []
    private var walk: CGFloat = 0
    private var lastX: CGFloat?
    private var ronin: CGFloat = 60
    private var idleClock = Double.random(in: 0...1)
    /// Seconds left showing the blow just landed, the loosed bow, or a stagger.
    private var strikeHold = 0.0
    private var staggerHold = 0.0
    private var hitFlash = 0.0
    private var jolt: CGFloat = 0
    private var shown = Frame.walk(0)

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
        body.anchorPoint = Figures.anchor
        body.texture = Figures.texture(cast, .walk(0))
        pivot.addChild(body)
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
        warningRing.lineWidth = 2
        warning.addChild(warningRing)
        warning.addChild(warningMark)
        warning.isHidden = true
        warning.zPosition = 2
        addChild(warning)
        if foe.maxHP > 1, foe.kind != .warlord {
            for _ in 0..<foe.maxHP {
                let pip = SKShapeNode(path: Art.diamond(3.2))
                pip.strokeColor = SKColor(white: 0, alpha: 0.7)
                pip.lineWidth = 1
                addChild(pip)
                pips.append(pip)
            }
        }
        layout(ronin: ronin)
    }

    required init?(coder aDecoder: NSCoder) { nil }

    var height: CGFloat { ronin * Build.of(cast).height }

    func layout(ronin: CGFloat) {
        self.ronin = ronin
        body.size = Figures.size(cast, ronin: ronin)
        pivot.position = CGPoint(x: 0, y: height * 0.5)
        body.position = CGPoint(x: 0, y: -height * 0.5)
        shadow.size = CGSize(width: height * 0.8, height: height * 0.13)
        glint.size = CGSize(width: height * 0.55, height: height * 0.55)
        glint.position = CGPoint(x: 0, y: height * 0.36)
        let s = max(5, ronin * 0.09)
        let mark = CGMutablePath()
        mark.move(to: CGPoint(x: -s * 0.6, y: s * 0.35))
        mark.addLine(to: CGPoint(x: s * 0.6, y: s * 0.35))
        mark.addLine(to: CGPoint(x: 0, y: -s * 0.55))
        mark.closeSubpath()
        warningMark.path = mark
        warning.position = CGPoint(x: 0, y: height * (kind == .warlord ? 1.28 : 1.12))
        let spacing = max(7, ronin * 0.12)
        for (k, pip) in pips.enumerated() {
            pip.position = CGPoint(x: (CGFloat(k) - CGFloat(pips.count - 1) / 2) * spacing, y: height * 1.1)
            pip.setScale(max(1, ronin / 60))
        }
    }

    /// Puts the foe where the fight has it and picks its frame. `hero` is the ronin's x, for the archer's sight line.
    func update(_ foe: Foe, at position: CGPoint, air: CGFloat, hero: CGFloat, dt: Double) {
        strikeHold = max(0, strikeHold - dt)
        staggerHold = max(0, staggerHold - dt)
        hitFlash = max(0, hitFlash - dt)
        idleClock += dt
        jolt *= CGFloat(pow(0.0005, dt))
        let facingRight = foe.phase == .leaping ? foe.leapTo < 0 : foe.x < 0
        let facing: CGFloat = facingRight ? 1 : -1
        self.position = CGPoint(x: position.x - facing * jolt, y: position.y + air)
        shadow.position = CGPoint(x: 0, y: -air)
        shadow.alpha = 0.6 * max(0.25, 1 - air / (ronin * 1.2))
        body.xScale = facing
        glint.position.x = facing * height * 0.07

        let moved = lastX.map { abs(position.x - $0) } ?? 0
        lastX = position.x
        var frame: Frame
        switch foe.phase {
        case .advancing:
            if dt == 0 {
                frame = shown
            } else if moved > 0.02 {
                walk += moved / max(3, height * 0.11 * Build.of(cast).stride)
                frame = .walk(Int(walk) % Frame.walkFrames)
            } else {
                frame = staggerHold > 0 ? .stagger : .idle(Int(idleClock * 2.2) % 2)
            }
        case .windup: frame = .windup(foe.progress < 0.4 ? 0 : 1)
        case .aiming: frame = .aim
        case .recoil:
            if strikeHold > 0 { frame = kind == .archer ? .loose : .strike }
            else if staggerHold > 0 { frame = .stagger }
            else { frame = kind == .archer ? .loose : .idle(0) }
        case .leaping: frame = .leap
        case .dying: frame = .stagger
        }
        if !Figures.has(cast, frame) { frame = .idle(0) }
        shown = frame
        let texture = Figures.texture(cast, frame)
        if body.texture !== texture { body.texture = texture }

        if foe.phase == .leaping {
            pivot.zRotation = -CGFloat(foe.progress) * 2 * .pi * (foe.leapTo > 0 ? 1 : -1)
        } else if pivot.zRotation != 0 {
            pivot.zRotation = 0
        }

        // The telegraph: a red flush, a swelling glint, and a warning marker whose ring runs out as the blow lands.
        let charging = foe.phase == .windup || foe.phase == .aiming
        let t = charging ? CGFloat(foe.progress) : 0
        if hitFlash > 0 {
            body.color = .white
            body.colorBlendFactor = CGFloat(hitFlash / 0.14) * 0.85
        } else if charging {
            body.color = Palette.blood.color()
            body.colorBlendFactor = (0.1 + 0.4 * t * t) * (kind == .archer ? 0.6 : 1)
        } else {
            body.colorBlendFactor = 0
        }
        glint.alpha = charging ? 0.25 + 0.75 * t : 0
        glint.setScale(charging ? 0.6 + 0.5 * t + 0.12 * CGFloat(sin(foe.timer * 40)) : 1)
        warning.isHidden = foe.phase != .windup
        if foe.phase == .windup {
            let r = max(6, ronin * 0.13)
            let ring = CGMutablePath()
            ring.addArc(center: .zero, radius: r, startAngle: .pi / 2, endAngle: .pi / 2 + (1 - t) * 2 * .pi, clockwise: false)
            warningRing.path = ring
            let pulse = 1 + 0.15 * CGFloat(max(0, sin(foe.timer * 30))) * t
            warning.setScale(pulse)
        }
        // An archer's sight line: from his bow to the ronin, brightening as he draws.
        if foe.phase == .aiming {
            let reach = abs(hero - position.x) - ronin * 0.2
            sight.isHidden = reach <= 0
            sight.size = CGSize(width: max(0, reach), height: max(1, ronin * 0.02))
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

    func showStrike() { strikeHold = 0.2 }
    func showStagger() { staggerHold = 0.28 }

    func flashHit() {
        hitFlash = 0.14
        jolt = ronin * 0.06
    }
}

/// The ronin: his stance and breathing, his cuts (a blur of the swing, then the follow-through), and the red aura
/// of bloodlust.
@MainActor
final class HeroSprite: SKNode {
    let body = SKSpriteNode()
    private let shadow = SKSpriteNode(texture: Art.glow)
    private let aura = SKSpriteNode(texture: Art.glow)
    private(set) var facing = Side.right
    private var pose = Frame.idle(0)
    /// A cut in progress: its style and how long it has run.
    private var cutting: (style: Int, clock: Double)?
    private var hold = 0.0
    private var slash = 0
    private var lunge: CGFloat = 0
    private var ended = false
    private var breath = 0.0
    private var ronin: CGFloat = 60
    var home = CGPoint.zero

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
        body.anchorPoint = Figures.anchor
        body.texture = Figures.texture(.hero, .idle(0))
        addChild(body)
    }

    required init?(coder aDecoder: NSCoder) { nil }

    func layout(ronin: CGFloat, home: CGPoint) {
        self.ronin = ronin
        self.home = home
        body.size = Figures.size(.hero, ronin: ronin)
        shadow.size = CGSize(width: ronin * 0.9, height: ronin * 0.14)
        aura.size = CGSize(width: ronin * 1.7, height: ronin * 1.7)
        aura.position = CGPoint(x: 0, y: ronin * 0.5)
        position = home
    }

    func reset() {
        ended = false
        hold = 0
        cutting = nil
        lunge = 0
        pose = .idle(0)
        body.texture = Figures.texture(.hero, pose)
        body.colorBlendFactor = 0
    }

    func face(_ side: Side) {
        facing = side
        body.xScale = side == .right ? 1 : -1
    }

    /// A cut that landed `distance` points away.
    func cut(_ side: Side, distance: CGFloat) {
        guard !ended else { return }
        face(side)
        slash = (slash + 1) % 3
        cutting = (slash, 0)
        hold = 0
        lunge = side.sign.cg * min(ronin * 0.18, max(0, distance - ronin * 0.3) * 0.3)
    }

    func whiff(_ side: Side, for seconds: Double) {
        guard !ended else { return }
        face(side)
        cutting = nil
        pose = .stumble
        hold = seconds
        lunge = side.sign.cg * ronin * 0.12
    }

    func hurt() {
        guard !ended else { return }
        cutting = nil
        pose = .hurt
        hold = 0.24
        lunge = -facing.sign.cg * ronin * 0.07
        body.color = Palette.blood.color()
        body.colorBlendFactor = 0.8
    }

    func finish(victory: Bool) {
        ended = true
        cutting = nil
        pose = victory ? .victory : .fallen
        hold = 0
        lunge = 0
        body.colorBlendFactor = 0
    }

    func update(dt: Double, bloodlust: Bool) {
        breath += dt
        if !ended {
            if var cut = cutting {
                cut.clock += dt
                cutting = cut
                // A few hundredths of a second of blur, then the follow-through, then back on guard.
                if cut.clock < 0.05 { pose = .cut(cut.style, 0) }
                else if cut.clock < 0.17 { pose = .cut(cut.style, 1) }
                else { cutting = nil }
            }
            if cutting == nil {
                if hold > 0 {
                    hold -= dt
                } else {
                    pose = .idle(Int(breath * 5) % 4)
                }
            }
        }
        lunge *= CGFloat(pow(0.00002, dt))
        position = CGPoint(x: home.x + lunge, y: home.y)
        let texture = Figures.texture(.hero, pose)
        if body.texture !== texture { body.texture = texture }
        if body.colorBlendFactor > 0 { body.colorBlendFactor = max(0, body.colorBlendFactor - CGFloat(dt) * 4) }
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
        super.init(texture: Art.arrow, color: Palette.silhouette.color(), size: CGSize(width: ronin * 0.42, height: ronin * 0.1))
        colorBlendFactor = 1
        trail.anchorPoint = CGPoint(x: 1, y: 0.5)
        trail.size = CGSize(width: ronin * 0.7, height: ronin * 0.16)
        trail.position = CGPoint(x: -size.width * 0.4, y: 0)
        trail.color = RGB(1, 0.85, 0.75).color()
        trail.colorBlendFactor = 1
        trail.alpha = 0.45
        trail.blendMode = .add
        addChild(trail)
        tip.size = CGSize(width: ronin * 0.3, height: ronin * 0.3)
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
