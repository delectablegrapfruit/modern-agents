import AppKit
import SpriteKit
import RoninCore

/// A foe on the lane: its silhouette, its shadow, the red glint and flush of a raised weapon, and pips for the cuts
/// it has left.
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
    private var pips: [SKShapeNode] = []
    private var walk: CGFloat = 0
    private var lastX: CGFloat?
    private var ronin: CGFloat = 60
    /// Seconds left showing the blow just landed, the loosed bow, or a stagger.
    private var strikeHold = 0.0
    private var staggerHold = 0.0
    private var hitFlash = 0.0
    private var shown = Frame.walk0

    init(foe: Foe, ronin: CGFloat) {
        id = foe.id
        kind = foe.kind
        cast = .foe(foe.kind)
        super.init()
        shadow.color = .black
        shadow.colorBlendFactor = 1
        shadow.alpha = 0.55
        shadow.zPosition = -1
        addChild(shadow)
        addChild(pivot)
        body.anchorPoint = Figures.anchor
        body.texture = Figures.texture(cast, .walk0)
        pivot.addChild(body)
        glint.color = (Build.of(cast).eyes ?? Palette.blood).color()
        glint.colorBlendFactor = 1
        glint.blendMode = .add
        glint.alpha = 0
        pivot.addChild(glint)
        if foe.maxHP > 1, foe.kind != .warlord {
            for _ in 0..<foe.maxHP {
                let pip = SKShapeNode(path: Art.diamond(2.4))
                pip.strokeColor = .clear
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
        shadow.size = CGSize(width: height * 0.7, height: height * 0.12)
        glint.size = CGSize(width: height * 0.5, height: height * 0.5)
        glint.position = CGPoint(x: 0, y: height * 0.34)
        let spacing = max(5, ronin * 0.085)
        for (k, pip) in pips.enumerated() {
            pip.position = CGPoint(x: (CGFloat(k) - CGFloat(pips.count - 1) / 2) * spacing, y: height * 1.08)
            pip.setScale(ronin / 60)
        }
    }

    /// Puts the foe where the fight has it and picks its frame.
    func update(_ foe: Foe, at position: CGPoint, air: CGFloat, dt: Double) {
        self.position = CGPoint(x: position.x, y: position.y + air)
        shadow.position = CGPoint(x: 0, y: -air)
        shadow.alpha = 0.55 * max(0.25, 1 - air / (ronin * 1.2))
        strikeHold = max(0, strikeHold - dt)
        staggerHold = max(0, staggerHold - dt)
        hitFlash = max(0, hitFlash - dt)
        let facingRight = foe.phase == .leaping ? foe.leapTo < 0 : foe.x < 0
        body.xScale = facingRight ? 1 : -1
        glint.position.x = (facingRight ? 1 : -1) * height * 0.06

        let moved = lastX.map { abs(position.x - $0) } ?? 0
        lastX = position.x
        var frame: Frame
        switch foe.phase {
        case .advancing:
            if dt == 0 {
                frame = shown
            } else if moved > 0.02 {
                walk += moved / max(4, height * 0.16 * Build.of(cast).stride)
                frame = Frame.walk[Int(walk) % 4]
            } else {
                frame = staggerHold > 0 ? .stagger : .ready
            }
        case .windup: frame = .windup
        case .aiming: frame = .aim
        case .recoil:
            if strikeHold > 0 { frame = kind == .archer ? .loose : .strike }
            else if staggerHold > 0 { frame = .stagger }
            else { frame = kind == .archer ? .loose : .ready }
        case .leaping: frame = .leap
        case .dying: frame = .stagger
        }
        if !Figures.frames(for: cast).contains(frame) { frame = .ready }
        shown = frame
        let texture = Figures.texture(cast, frame)
        if body.texture !== texture { body.texture = texture }

        if foe.phase == .leaping {
            pivot.zRotation = -CGFloat(foe.progress) * 2 * .pi * (foe.leapTo > 0 ? 1 : -1)
        } else if pivot.zRotation != 0 {
            pivot.zRotation = 0
        }

        // The telegraph: the figure flushes red and a glint swells as the blow (or the arrow) comes.
        let charging = foe.phase == .windup || foe.phase == .aiming
        let t = charging ? CGFloat(foe.progress) : 0
        if hitFlash > 0 {
            body.color = .white
            body.colorBlendFactor = CGFloat(hitFlash / 0.14) * 0.85
        } else if charging {
            body.color = Palette.blood.color()
            body.colorBlendFactor = (0.12 + 0.55 * t * t) * (kind == .archer ? 0.5 : 1)
        } else {
            body.colorBlendFactor = 0
        }
        glint.alpha = charging ? 0.25 + 0.75 * t : 0
        glint.setScale(charging ? 0.6 + 0.5 * t + 0.12 * CGFloat(sin(foe.timer * 40)) : 1)

        for (k, pip) in pips.enumerated() {
            pip.fillColor = k < foe.hp ? Build.of(cast).accent.mix(.white, 0.3).color() : SKColor(white: 1, alpha: 0.18)
            pip.isHidden = foe.phase == .leaping
        }
    }

    func showStrike() { strikeHold = 0.2 }
    func showStagger() { staggerHold = 0.28 }
    func flashHit() { hitFlash = 0.14 }
}

/// The ronin: his stance, his cuts, and the red aura of bloodlust.
@MainActor
final class HeroSprite: SKNode {
    let body = SKSpriteNode()
    private let shadow = SKSpriteNode(texture: Art.glow)
    private let aura = SKSpriteNode(texture: Art.glow)
    private(set) var facing = Side.right
    private var pose = Frame.ready
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
        shadow.alpha = 0.6
        shadow.zPosition = -2
        addChild(shadow)
        aura.color = Palette.blood.color()
        aura.colorBlendFactor = 1
        aura.blendMode = .add
        aura.alpha = 0
        aura.zPosition = -1
        addChild(aura)
        body.anchorPoint = Figures.anchor
        body.texture = Figures.texture(.hero, .ready)
        addChild(body)
    }

    required init?(coder aDecoder: NSCoder) { nil }

    func layout(ronin: CGFloat, home: CGPoint) {
        self.ronin = ronin
        self.home = home
        body.size = Figures.size(.hero, ronin: ronin)
        shadow.size = CGSize(width: ronin * 0.8, height: ronin * 0.13)
        aura.size = CGSize(width: ronin * 1.6, height: ronin * 1.6)
        aura.position = CGPoint(x: 0, y: ronin * 0.5)
        position = home
    }

    func reset() {
        ended = false
        hold = 0
        lunge = 0
        pose = .ready
        body.texture = Figures.texture(.hero, .ready)
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
        pose = [.slash1, .slash2, .slash3][slash]
        hold = 0.16
        lunge = side.sign.cg * min(ronin * 0.16, max(0, distance - ronin * 0.3) * 0.3)
    }

    func whiff(_ side: Side) {
        guard !ended else { return }
        face(side)
        pose = .stumble
        hold = Tuning.stumble
        lunge = side.sign.cg * ronin * 0.1
    }

    func hurt() {
        guard !ended else { return }
        pose = .hurt
        hold = 0.24
        lunge = -facing.sign.cg * ronin * 0.06
        body.color = Palette.blood.color()
        body.colorBlendFactor = 0.8
    }

    func finish(victory: Bool) {
        ended = true
        pose = victory ? .victory : .fallen
        hold = 0
        lunge = 0
        body.colorBlendFactor = 0
    }

    func update(dt: Double, bloodlust: Bool) {
        breath += dt
        if !ended, hold > 0 {
            hold -= dt
            if hold <= 0 { pose = .ready }
        }
        lunge *= CGFloat(pow(0.00002, dt))
        position = CGPoint(x: home.x + lunge, y: home.y)
        let texture = Figures.texture(.hero, pose)
        if body.texture !== texture { body.texture = texture }
        if body.colorBlendFactor > 0 { body.colorBlendFactor = max(0, body.colorBlendFactor - CGFloat(dt) * 4) }
        body.yScale = pose == .ready ? 1 + 0.012 * CGFloat(sin(breath * 3)) : 1
        let target: CGFloat = bloodlust && !ended ? 0.55 + 0.2 * CGFloat(sin(breath * 9)) : 0
        aura.alpha += (target - aura.alpha) * min(1, CGFloat(dt) * 8)
    }
}

/// An arrow in flight: dark coming in, gold once cut back.
@MainActor
final class ArrowSprite: SKSpriteNode {
    let id: Int
    private(set) var deflected = false
    private let trail = SKSpriteNode(texture: Art.streak)

    init(arrow: Arrow, ronin: CGFloat) {
        id = arrow.id
        super.init(texture: Art.arrow, color: Palette.silhouette.color(), size: CGSize(width: ronin * 0.36, height: ronin * 0.08))
        colorBlendFactor = 1
        trail.anchorPoint = CGPoint(x: 1, y: 0.5)
        trail.size = CGSize(width: ronin * 0.5, height: ronin * 0.12)
        trail.position = CGPoint(x: -size.width * 0.4, y: 0)
        trail.color = SKColor(white: 1, alpha: 1)
        trail.colorBlendFactor = 1
        trail.alpha = 0.25
        trail.blendMode = .add
        addChild(trail)
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
            trail.size.width *= 2.2
        }
    }
}

extension Double {
    var cg: CGFloat { CGFloat(self) }
}
