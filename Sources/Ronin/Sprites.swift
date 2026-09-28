import AppKit
import SpriteKit
import RoninArt
import RoninCore

/// A foe on the lane: its silhouette and shadow, in the setting's light (`Ambient`); while its blow is coming, a red
/// flush, a glint and a warning marker above its head whose ring runs down to the blow (its last stretch gold, on a man
/// one cut from falling: cut him down as the ring runs into it, sen-no-sen, for a shard); for an archer drawing, a red
/// sight line to the ronin; pips for the cuts a tough one has left; the gourd over a bearer's head (his pips either
/// side of it), flaring as he gathers himself to dart in; the warlord's guard as a pale ward before him, faint while
/// it comes up and flashing as it sets, a cut that meets it taken braced on his blade and shoved off (`bind`, in step
/// with the ronin), and his fury as a red haze that deepens as he is cut down.
///
/// It moves smoothly: it is drawn where the fight has him as he walks or darts, while a jump the fight makes (a
/// knock-back, a shove) glides; a blow that wounds him holds him as he is until the blade gets there, and the
/// knock-back, leap or spring it sends him into starts then. Walking, his feet keep to the ground, forward or backing
/// off (the stride played backward, still facing the ronin), and he goes from standing to walking and back only once
/// he is really on the move or really stopped, so a man shuffling in a queue never flickers between the two. Each
/// change of pose blends out of the one before behind a dark ghost of it, he leans into his stride and lurches into his
/// blows, squashes as he lands (the heavy ones a little at every step, `update` saying where each foot came down),
/// and fades in quickly as he arrives.
///
/// The gourd-bearer moves as a man keeping his distance: he walks in to his spot and backs off to it with the same
/// stride, crouches over his weapon as he readies himself (the gourd flaring: the tell), darts in at a committed run,
/// low and leaning hard into it, his blade coming up as he gets there and down as the ring runs out, and springs back
/// from a cut in a short hop off his heels, rocked back, landing on his feet.
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
    /// The last `Tuning.senNoSen` of the ring, gold: the moment to cut him down for a shard.
    private let warningGold = SKShapeNode()
    private let sight = SKSpriteNode(color: .white, size: CGSize(width: 1, height: 1))
    private var pips: [SKShapeNode] = []
    private(set) var gourd: SKNode?
    private var gourdHalo: SKSpriteNode?
    /// How far through his stride he is (in frames, forward positive), how fast he is going the way he faces (points
    /// a second, smoothed), and whether he is stepping: begun once he is plainly moving, ended once he has plainly
    /// stopped.
    private var walk: CGFloat = 0
    private var pace: CGFloat = 0
    private var stepping = false
    private var shownX: CGFloat?
    private var shownAir: CGFloat = 0
    /// Where the fight had him on the last update (in points), how many points a lane unit is, and what is left of a
    /// jump the fight made (a knock-back, a shove), still being glided off.
    private var core: CGFloat?
    private var lanePoints: CGFloat?
    private var glide: CGFloat = 0
    private var ronin: CGFloat = 60
    /// How far above his feet the lane ends (the header, or whatever the scene puts along its top).
    private var headroom = CGFloat.greatestFiniteMagnitude
    /// Where the ronin was on the last update.
    private var heroX: CGFloat?
    private var idleClock = Double.random(in: 0...2)
    /// Seconds since the blow landed (or the bow loosed), and left in a stagger.
    private var strikeClock = 1.0
    private var staggerHold = 0.0
    private var hitFlash = 0.0
    private var jolt: CGFloat = 0
    private var lurch: CGFloat = 0
    private var lean: CGFloat = 0
    private var squash: CGFloat = 0
    /// The gourd-bearer gathering himself to dart in (0 to 1): crouched, and his gourd flaring.
    private var gather: CGFloat = 0
    private var wasLeaping = false
    /// Which way he is drawn facing (+1 right, -1 left): the ronin, but in the air where he is going and running off
    /// with the gourd away.
    private(set) var facing: CGFloat = 1
    /// The frame he is drawn in.
    private(set) var shown = Frame.walk(0)
    private var age = 0.0
    /// A wounding blow on its way (`hold`): he is held as he is until it lands, or this long at most; then whether a
    /// leap the blow sent him into has yet to be picked up, and how far through it the fight already had him when it
    /// was, so the leap is drawn from there and still comes down with him.
    private var holding = false
    private var holdLeft = 0.0
    /// The warlord bound in a clash with the ronin's blade (`bind`): the frame he is held in, where he stands.
    private var bound: Frame?
    private var lagged = false
    private var leapStart: Double?
    /// Whether the warlord's guard was set on the last update; how far round the warning ring was drawn; the tint
    /// on him and the cuts his pips show, as last set.
    private var wardSet = false
    private var ringStep = -1
    private var tinted: (color: RGB, amount: CGFloat)?
    private var pipsShown = -1
    /// The setting's light on him (`Ambient`).
    var ambient = Ambient.plain {
        didSet {
            guard ambient != oldValue else { return }
            light()
        }
    }

    /// How high (in ronin heights) the gourd-bearer's spring back out of reach takes him: a short hop.
    static let hop: CGFloat = 0.2

    init(foe: Foe, ronin: CGFloat, headroom: CGFloat? = nil, ambient: Ambient = .plain) {
        id = foe.id
        kind = foe.kind
        cast = .foe(foe.kind)
        self.ambient = ambient
        super.init()
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
        pivot.addChild(echo)
        pivot.addChild(body)
        echo.alpha = 0
        echo.zPosition = -0.1
        light()
        glint.color = (Build.of(cast).eyes ?? Palette.blood).color()
        glint.colorBlendFactor = 1
        glint.blendMode = .add
        glint.alpha = 0
        // Over his head, at his eyes.
        glint.zPosition = 0.1
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
        warningGold.strokeColor = Palette.gold.mix(.white, 0.25).color()
        warningGold.lineCap = .round
        warningGold.lineWidth = 2.2
        warningGold.glowWidth = 1
        warning.addChild(warningRing)
        warning.addChild(warningGold)
        warning.addChild(warningMark)
        warning.isHidden = true
        // Over the HUD (the combo and its haze, the vignette): a blow coming is the one thing that must never be
        // covered. Still under the banners, the curtain and the header.
        warning.zPosition = 38
        addChild(warning)
        if foe.maxHP > 1, foe.kind != .warlord {
            for _ in 0..<foe.maxHP {
                let pip = Icons.heart(FoeSprite.pip)
                pip.strokeColor = SKColor(white: 0, alpha: 0.7)
                // Over a gourd's glow, beside it.
                pip.zPosition = 1.5
                addChild(pip)
                pips.append(pip)
            }
        }
        alpha = 0
        layout(ronin: ronin, headroom: headroom)
    }

    required init?(coder aDecoder: NSCoder) { nil }

    var height: CGFloat { ronin * Build.of(cast).height }

    /// Sizes everything for a ronin `ronin` points tall, with the lane ending `headroom` points above the feet (kept
    /// as it was when nil): the warning marker comes down to stay under it.
    func layout(ronin: CGFloat, headroom: CGFloat? = nil) {
        self.ronin = ronin
        if let headroom { self.headroom = headroom }
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
        ringStep = -1
        for pip in pips { pip.setScale(FoeSprite.pipScale(ronin: ronin)) }
        // A new size draws the lane afresh: he is put straight where the fight has him (and his gourd drawn anew at
        // the new size).
        shownX = nil
        core = nil
        lanePoints = nil
        glide = 0
        if gourd != nil {
            dropGourd()
            showGourd()
        }
        placeOverhead()
    }

    // MARK: Over his head

    /// The warning marker's ring, and how much room it needs above its centre at the height of its pulse (with its
    /// stroke).
    nonisolated static func markerRadius(ronin: CGFloat) -> CGFloat { max(6, ronin * 0.12) }
    nonisolated static func markerClearance(ronin: CGFloat) -> CGFloat { markerRadius(ronin: ronin) * 1.15 + 1.5 }

    /// A pip's height (points, at a 60-point ronin: they grow with a larger lane by `pipScale`), and the gourd's; how
    /// much the gourd swells as its bearer gathers himself to dart, and how far it bobs up.
    nonisolated static let pip: CGFloat = 6
    nonisolated static func pipScale(ronin: CGFloat) -> CGFloat { max(1, ronin / 60) }
    nonisolated static func gourdSize(ronin: CGFloat) -> CGFloat { max(9, ronin * 0.17) }
    nonisolated static let gourdSwell: CGFloat = 1.2
    nonisolated static let gourdBob: CGFloat = 2

    /// Where the marks over a foe go, in points above his feet: the pips for the cuts he has left, the gourd, and the
    /// warning marker. Over his head, the same height for every kind. A bearer carries his gourd there, his pips either
    /// side of it (`pipOffsets`), and the marker goes above the gourd, clear of it however it swells and bobs; the
    /// marker comes down as far as it must to stay under a lane that ends `headroom` above his feet (onto the warlord's
    /// crest, if what tops the lane leaves no more room than that).
    nonisolated static func overhead(kind: Kind, ronin: CGFloat, headroom: CGFloat = .greatestFiniteMagnitude,
                                     gourd: Bool = false) -> (pips: CGFloat, gourd: CGFloat, marker: CGFloat) {
        let height = ronin * Build.of(.foe(kind)).height
        let head = height * 1.12
        guard gourd else { return (height * 1.1, head, min(head, headroom - markerClearance(ronin: ronin))) }
        let carried = head + ronin * 0.05
        let top = carried + gourdSize(ronin: ronin) * 0.48 * gourdSwell + gourdBob
        let marker = min(top + markerRadius(ronin: ronin) * 1.15 + 1, headroom - markerClearance(ronin: ronin))
        return (carried, carried, marker)
    }

    /// How far across from his middle each of `count` pips goes (points): in a row over a man's head, or either side
    /// of a bearer's gourd (the first to the left, the next to the right, and so on outward), clear of its widest.
    nonisolated static func pipOffsets(count: Int, ronin: CGFloat, gourd: Bool) -> [CGFloat] {
        let spacing = max(7, ronin * 0.11)
        guard gourd else { return (0..<count).map { (CGFloat($0) - CGFloat(count - 1) / 2) * spacing } }
        let inner = gourdSize(ronin: ronin) * 0.3 * gourdSwell + max(2.5, ronin * 0.035) + pip * 0.26 * pipScale(ronin: ronin)
        return (0..<count).map { k in (k % 2 == 0 ? -1 : 1) * (inner + CGFloat(k / 2) * spacing) }
    }

    /// What is drawn over a gourd-bearer of `hp` cuts at its largest, in points from his feet: the gourd swollen
    /// anywhere in its bob, and each pip with its stroke. None of them may overlap (the self-test checks it).
    nonisolated static func bearerMarks(kind: Kind, ronin: CGFloat, headroom: CGFloat, hp: Int) -> (gourd: CGRect, pips: [CGRect]) {
        let marks = overhead(kind: kind, ronin: ronin, headroom: headroom, gourd: true)
        let s = gourdSize(ronin: ronin) * gourdSwell
        let gourd = CGRect(x: -0.3 * s, y: marks.gourd - 0.5 * s, width: 0.6 * s, height: 0.98 * s + gourdBob)
        let scale = pipScale(ronin: ronin)
        let w = pip * 0.26 * scale + 0.5, h = pip * 0.5 * scale + 0.5
        let pips = pipOffsets(count: hp, ronin: ronin, gourd: true).map { CGRect(x: $0 - w, y: marks.pips - h, width: 2 * w, height: 2 * h) }
        return (gourd, pips)
    }

    /// The top of a foe's warning marker at the height of its pulse, in points above his feet: what must stay under
    /// the top of the lane (and anything drawn along it).
    nonisolated static func overheadTop(kind: Kind, ronin: CGFloat, headroom: CGFloat = .greatestFiniteMagnitude,
                                        gourd: Bool = false) -> CGFloat {
        overhead(kind: kind, ronin: ronin, headroom: headroom, gourd: gourd).marker + markerClearance(ronin: ronin)
    }

    private func placeOverhead() {
        let marks = FoeSprite.overhead(kind: kind, ronin: ronin, headroom: headroom, gourd: gourd != nil)
        gourd?.position = CGPoint(x: 0, y: marks.gourd)
        warning.position = CGPoint(x: 0, y: marks.marker)
        for (x, pip) in zip(FoeSprite.pipOffsets(count: pips.count, ronin: ronin, gourd: gourd != nil), pips) {
            pip.position = CGPoint(x: x, y: marks.pips)
        }
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
        node.addChild(Icons.gourd(FoeSprite.gourdSize(ronin: ronin), Palette.jade.mix(.white, 0.25).color()))
        let bob = FoeSprite.gourdBob
        node.run(.repeatForever(.sequence([.moveBy(x: 0, y: bob, duration: 0.6), .moveBy(x: 0, y: -bob, duration: 0.6)])))
        // Under his pips (either side of it, over its glow).
        node.zPosition = 1
        addChild(node)
        gourd = node
        gourdHalo = halo
        placeOverhead()
    }

    /// Takes the gourd away: drunk or carried off (the scene shows where it goes).
    func dropGourd() {
        guard let gourd else { return }
        self.gourd = nil
        gourdHalo = nil
        gourd.removeFromParent()
        placeOverhead()
    }


    // MARK: Each frame

    /// Puts the foe where the fight has him and picks his frame. `position` is where the fight has him on the lane,
    /// and `hero` the ronin's x, the middle of the lane: for the archer's sight line, and to measure the lane by.
    /// Returns where a foot of his came down on the ground this time, if one did (its x, in the parent's space).
    @discardableResult
    func update(_ foe: Foe, at position: CGPoint, air: CGFloat, hero: CGFloat, dt: Double) -> CGFloat? {
        age += dt
        heroX = hero
        strikeClock += dt
        staggerHold = max(0, staggerHold - dt)
        hitFlash = max(0, hitFlash - dt)
        idleClock += dt
        jolt *= CGFloat(pow(0.0005, dt))
        lurch *= CGFloat(pow(0.0002, dt))
        squash *= CGFloat(pow(0.0004, dt))
        // Quickly in, and most of the way at once: a half-there figure reads as a pale ghost against the sky.
        if alpha < 1 {
            let t = min(1, CGFloat(age / 0.25))
            alpha = 1 - (1 - t) * (1 - t)
        }
        if foe.bearer, gourd == nil { showGourd() } else if !foe.bearer, gourd != nil { dropGourd() }
        if holding {
            holdLeft -= dt
            if holdLeft <= 0 { holding = false }
        }
        // The lane is drawn about the ronin, so where the fight has him says how many points a lane unit is.
        if abs(foe.x) > 0.05 { lanePoints = abs((position.x - hero) / CGFloat(foe.x)) }
        let leaping = foe.phase == .leaping && !holding
        // Held as he stands: for a blade on its way to him, or bound in a clash with it.
        let held = holding || bound != nil
        if !held {
            // Facing the ronin, except in the air (where he is going) and running off with the gourd (away).
            let facingRight = foe.phase == .leaping ? foe.leapTo < 0 : foe.phase == .fleeing ? foe.x > 0 : foe.x < 0
            facing = facingRight ? 1 : -1
        }

        // A leap is drawn on its arc; one a wounding blow sent him into starts from where the blade caught him, when
        // it did, and catches up with him by the time he comes down.
        var x = position.x, lift = air
        var flight = foe.progress
        if leaping {
            if lagged {
                leapStart = foe.progress
                lagged = false
            }
            if let start = leapStart, start > 0 {
                flight = start >= 1 ? 1 : max(0, (foe.progress - start) / (1 - start))
                x = position.x + CGFloat(flight - foe.progress) * CGFloat(foe.leapTo - foe.leapFrom) * (lanePoints ?? 0)
                let s = sin(foe.progress * .pi)
                lift = s > 1e-3 ? air * CGFloat(sin(flight * .pi) / s) : 0
            }
            glide = 0
        } else {
            if !holding {
                leapStart = nil
                lagged = false
            }
            if held, let stood = shownX {
                // The blade is still on its way, or bound on his: he stays where he stood.
                x = stood
                lift = shownAir
                glide = stood - position.x
            } else if let last = shownX, let was = core, abs(position.x - was) < ronin * 2 {
                // Walking and darting are drawn as they go (with only as much easing as smooths the fight's steps
                // against the frame's); a jump the fight makes, faster than he can move, is glided off instead.
                let d = position.x - was
                let limit = (lanePoints ?? .greatestFiniteMagnitude) * FoeSprite.fastest(foe) * CGFloat(dt * 1.25 + Tuning.step)
                if abs(d) > limit { glide -= d - (d > 0 ? limit : -limit) }
                glide *= CGFloat(pow(1e-6, dt))
                x = last + (position.x + glide - last) * min(1, CGFloat(dt) * 60)
            } else {
                glide = 0
            }
        }
        core = position.x
        let shift = shownX.map { x - $0 } ?? 0
        shownX = x
        shownAir = lift
        self.position = CGPoint(x: x - facing * jolt + facing * lurch, y: position.y + lift)
        shadow.position = CGPoint(x: 0, y: -lift)
        shadow.alpha = 0.6 * max(0.25, 1 - lift / (ronin * 1.2))
        glint.position.x = facing * height * 0.07

        // On his feet, how fast he is going the way he faces (smoothed), and whether that is walking: begun once he
        // is plainly on the move, ended once he has plainly stopped, so a man creeping up in a queue or holding his
        // place never flickers between walking and standing, or between stepping in and backing off.
        // (The gourd-bearer's dart is his wind-up, run in on his feet.)
        let onFoot = !held && (foe.phase == .advancing || foe.phase == .fleeing || foe.darting && foe.phase == .windup)
        var planted: CGFloat?
        if !onFoot {
            pace = 0
            stepping = false
        } else if dt > 0 {
            pace += (shift * facing / CGFloat(dt) - pace) * min(1, CGFloat(dt) * 12)
            stepping = stepping ? abs(pace) > ronin * 0.08 : abs(pace) > ronin * 0.2
            if stepping {
                // A frame for each twelfth of a stride travelled, forward or back, so the feet keep to the ground (a
                // dart's run takes a longer stride); and where a foot comes down.
                let running = foe.darting
                let unit = max(1, height * Figure.stride(cast) * (running ? 1.3 : 1) / CGFloat(Frame.walkFrames))
                let before = Int(floor(walk))
                walk += shift * facing / unit
                planted = landing(from: before, to: Int(floor(walk))).map { x + facing * $0 * height }
            }
        }
        let stride = Frame.walk(FoeSprite.wrap(Int(floor(walk))))

        var frame = shown
        var leanTarget: CGFloat = holding ? lean : 0
        var gathering: CGFloat = 0
        if !holding {
            switch foe.phase {
            case .advancing, .fleeing:
                if foe.readying, !stepping {
                    // Readying himself to go (or poised, waiting for his way in to clear): he crouches over his weapon
                    // and leans in, and the gourd flares.
                    frame = .windup(0)
                    leanTarget = 0.07
                    gathering = 1
                } else if dt == 0 {
                    frame = shown
                } else if stepping {
                    // Leaning into the stride, harder the faster it comes; backing off (the stride played backward,
                    // still facing the ronin), a little back on his heels.
                    frame = stride
                    leanTarget = pace > 0 ? min(0.1, pace / ronin * 0.045) : max(-0.05, pace / ronin * 0.02)
                } else {
                    frame = staggerHold > 0 ? .stagger(staggerHold > 0.15 ? 0 : 1) : .idle(Int(idleClock * 5) % Frame.foeIdleFrames)
                }
            case .windup:
                let t = foe.progress
                if foe.darting, stepping || foe.distance > foe.contact + 0.004 {
                    // The gourd-bearer's dart, committed: in at a run, low and leaning hard into it, the gourd flaring;
                    // his blade comes up as he gets there.
                    frame = stride
                    leanTarget = 0.2
                    gathering = 1
                } else if strikeClock < 0.09 {
                    // Renzoku-waza: the first of a pair of blows has just landed and he is already going up again for
                    // the second. The blow is drawn (its smear from the coil), then the wind-up is picked up where
                    // its ring has got to.
                    frame = .strike(0)
                } else {
                    frame = .windup(t < 0.18 ? 0 : t < 0.42 ? 1 : t < 0.8 ? 2 : 3)
                    leanTarget = -0.04 * CGFloat(t)
                }
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
            case .leaping:
                if foe.bearer {
                    // The gourd-bearer springs back out of reach: a short hop off his heels, rocked back by the cut,
                    // still facing the ronin, finding his feet as he comes down.
                    frame = .stagger(flight < 0.5 ? 0 : 1)
                    leanTarget = -0.1
                } else {
                    // The rest somersault over.
                    frame = .leap
                }
            case .dying:
                // (Never drawn: the scene lets the dead go before they get here.)
                frame = .stagger(0)
            }
        }
        if let bound {
            frame = bound
            leanTarget = 0
        }
        if !has(frame) { frame = .idle(0) }
        if frame != shown { changePose(to: frame) }
        if echo.alpha > 0 { echo.alpha = max(0, echo.alpha - CGFloat(dt) / 0.1 * 0.5) }
        // Crouched to spring, and landing: the gourd-bearer's hop lightly, a leap harder.
        if leaping, !wasLeaping, foe.bearer { squash = max(squash, 0.1) }
        if wasLeaping, !leaping, !holding { squash = foe.bearer ? 0.12 : 0.16 }
        if !holding { wasLeaping = leaping }
        // The heavy ones sink into each step as the foot comes down.
        if planted != nil, kind == .brute || kind == .warlord { squash = max(squash, kind == .brute ? 0.045 : 0.035) }

        // (His blade coming down at the end of his dart, the gourd still aflare.)
        if foe.darting { gathering = 1 }
        gather += (gathering - gather) * min(1, CGFloat(dt) * 18)
        // Crouched as he gathers himself (not as he darts: then he is lunging).
        if gather > 0.01, !foe.darting { squash = max(squash, 0.07 * gather) }
        lean += (leanTarget - lean) * min(1, CGFloat(dt) * (gathering > 0 ? 24 : 10))
        let xScale = facing * (1 + squash * 0.5), yScale = 1 - squash
        body.zRotation = -facing * lean
        body.xScale = xScale
        body.yScale = yScale
        echo.zRotation = body.zRotation
        echo.xScale = xScale
        echo.yScale = yScale
        if let gourd {
            gourd.setScale(1 + 0.2 * gather)
            gourdHalo?.setScale(1 + 0.9 * gather)
        }

        if leaping, !foe.bearer {
            pivot.zRotation = -CGFloat(flight) * 2 * .pi * (foe.leapTo > 0 ? 1 : -1)
        } else if !holding, pivot.zRotation != 0 {
            // Down from a somersault: the rest of the turn eased out, on round the way it was going (never unwound back
            // through a half turn, which drew him upside down for a frame as he landed).
            pivot.zRotation = pivot.zRotation.remainder(dividingBy: 2 * .pi) * 0.5
            if abs(pivot.zRotation) < 0.01 { pivot.zRotation = 0 }
        }

        // The telegraph: a red flush, a swelling glint, and a warning marker whose ring runs out as the blow lands.
        let charging = foe.phase == .windup || foe.phase == .aiming
        let t = charging ? CGFloat(foe.progress) : 0
        if hitFlash > 0 {
            tint(ambient.light, CGFloat(hitFlash / 0.14) * 0.8)
        } else if charging {
            tint(Palette.blood, (0.12 + 0.5 * t * t) * (kind == .archer ? 0.6 : 1))
        } else {
            tint(Palette.blood, 0)
        }
        glint.alpha = charging ? 0.25 + 0.75 * t : 0
        glint.setScale(charging ? 0.6 + 0.5 * t + 0.12 * CGFloat(sin(foe.timer * 40)) : 1)
        warning.isHidden = foe.phase != .windup
        if foe.phase == .windup {
            // The ring redrawn only as it runs down a step (sixtieths of the way round). On a man one cut from falling,
            // the stretch of it that runs out last (the last `Tuning.senNoSen` before the blow) is gold: cut him down
            // as the ring runs into it, for a shard.
            let step = Int(((1 - t) * 60).rounded(.up))
            let late = foe.hp == 1 ? min(1, Tuning.senNoSen / max(foe.span, 1e-3)) : 0
            let gold = min(step, Int((late * 60).rounded()))
            if step * 64 + gold != ringStep {
                ringStep = step * 64 + gold
                let r = FoeSprite.markerRadius(ronin: ronin)
                let ring = CGMutablePath()
                if step > gold {
                    ring.addArc(center: .zero, radius: r, startAngle: .pi / 2 + CGFloat(gold) / 60 * 2 * .pi,
                                endAngle: .pi / 2 + CGFloat(step) / 60 * 2 * .pi, clockwise: false)
                }
                warningRing.path = ring
                let arc = CGMutablePath()
                if gold > 0 {
                    arc.addArc(center: .zero, radius: r, startAngle: .pi / 2, endAngle: .pi / 2 + CGFloat(gold) / 60 * 2 * .pi, clockwise: false)
                }
                warningGold.path = arc
                // Brighter once the ring has run into the gold: now.
                warningGold.alpha = step <= gold ? 1 : 0.7
            }
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
        // The warlord's guard: a pale ward before him, faint while it comes up (a cut now only glances off, the last
        // moment to cut), flashing and ringing as it sets, then steady while it is up (wait for it to drop).
        let guarding = foe.phase == .guarding
        let braced = foe.guardSet
        let rising = CGFloat(min(1, foe.guardAge / Tuning.guardRise))
        if braced, !wardSet {
            ward.alpha = 0.95
            let ring = Art.shockwave(Palette.steel, radius: ronin * 0.08, grow: 3, width: 1.5, duration: 0.25)
            ring.position = CGPoint(x: facing * height * 0.12, y: height * 0.7)
            ring.zPosition = 1
            addChild(ring)
        }
        wardSet = braced
        ward.position = CGPoint(x: facing * height * 0.3, y: -height * 0.02)
        ward.xScale = facing
        let wardTarget: CGFloat = !guarding ? 0 : braced ? 0.45 + 0.12 * CGFloat(sin(age * 14)) : 0.2 * rising
        ward.alpha += (wardTarget - ward.alpha) * min(1, CGFloat(dt) * 16)
        // The blade coming across as the guard rises: the pose before it lingers behind the block until it is set.
        if guarding, !braced { echo.alpha = max(echo.alpha, 0.45 * (1 - rising)) }
        // His fury: a red haze that deepens as he is cut down.
        if kind == .warlord, !holding {
            let rage = 1 - CGFloat(foe.hp) / CGFloat(max(1, foe.maxHP))
            fury.alpha = rage * (0.35 + 0.15 * CGFloat(sin(age * 6)))
        }

        // The cuts he has left (not taken off until the blade lands), out of the way of his marker while he winds up
        // (a gourd-bearer's either side of his gourd, clear of it, and shown just when he has to be caught).
        if !holding {
            if foe.hp != pipsShown {
                pipsShown = foe.hp
                let left = Build.of(cast).accent.mix(.white, 0.35).color(), spent = SKColor(white: 1, alpha: 0.15)
                for (k, pip) in pips.enumerated() { pip.fillColor = k < foe.hp ? left : spent }
            }
            let hidden = leaping || foe.phase == .windup && gourd == nil
            for pip in pips { pip.isHidden = hidden }
        }
        return planted
    }

    /// The fastest the fight moves him along the lane by walking, in lane units a second: the gourd-bearer's dart, a
    /// warlord's fury, a man backing off from one who landed in front of him.
    private static func fastest(_ foe: Foe) -> CGFloat {
        CGFloat(foe.bearer ? foe.speed * Tuning.dartPace : max(foe.speed * 1.5, 0.6))
    }

    private static func wrap(_ k: Int) -> Int { (k % Frame.walkFrames + Frame.walkFrames) % Frame.walkFrames }

    private static var landingCache: [Cast: [Bool: [Int: CGFloat]]] = [:]

    /// The walking frames on which a foot comes down, forward or backing off (the stride played backward), and where
    /// that foot is (figure heights ahead of the point he stands on): the frame it is on the ground again after being
    /// lifted, from the frames' own footing, so they keep in step with however the walk is posed.
    static func landings(_ cast: Cast, forward: Bool) -> [Int: CGFloat] {
        if let known = landingCache[cast]?[forward] { return known }
        let n = Frame.walkFrames
        let feet = (0..<n).map { Figure.footing(cast, .walk($0)) }
        func lifted(_ k: Int, front: Bool) -> Bool {
            let f = feet[wrap(k)]
            return (front ? f.front.y : f.back.y) - min(f.front.y, f.back.y) > 0.0015
        }
        var found: [Int: CGFloat] = [:]
        for k in 0..<n {
            for front in [true, false] where !lifted(k, front: front) && lifted(forward ? k - 1 : k + 1, front: front) {
                found[k] = front ? feet[k].front.x : feet[k].back.x
            }
        }
        landingCache[cast, default: [:]][forward] = found
        return found
    }

    /// Whether a foot came down as his stride went from frame `before` to `after` (counted on, not wrapped: forward
    /// up, backing off down), and where: the last one set down, if more than one was.
    private func landing(from before: Int, to after: Int) -> CGFloat? {
        guard after != before else { return nil }
        let step = after > before ? 1 : -1
        let marks = FoeSprite.landings(cast, forward: step > 0)
        var found: CGFloat?
        var k = before
        while k != after {
            k += step
            if let at = marks[FoeSprite.wrap(k)] { found = at }
        }
        return found
    }

    /// Puts him in the setting's light: his shadow in its darkest tone, the ghost of a pose just left a dark,
    /// see-through silhouette in it, and at rest drawn a little toward it (a flush or a flash goes on top).
    private func light() {
        shadow.color = ambient.ghost.scaled(0.5).color()
        Art.setTint(echo, ambient.ghost, 1)
        let last = tinted ?? (Palette.blood, 0)
        tinted = nil
        tint(last.color, last.amount)
    }

    /// Tints him `amount` of the way to `color` over the setting's light, unless he already is (every tint sets the
    /// shader's attribute afresh).
    private func tint(_ color: RGB, _ amount: CGFloat) {
        if let tinted, tinted.color == color, tinted.amount == amount { return }
        tinted = (color, amount)
        let drawn = ambient.with(color, amount)
        Art.setTint(body, drawn.color, drawn.amount)
    }

    private func has(_ frame: Frame) -> Bool { Figures.has(cast, frame) }

    /// Swaps in a new pose. A jump to a different kind of pose keeps the old one a moment behind it (a dark ghost of
    /// it, in the setting's shadow), so the change reads as movement, not a cut; the frames of one motion (a stride
    /// either way, a breath, a wind-up) follow on cleanly.
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
            echo.alpha = 0.4
        }
        shown = frame
        Figures.apply(body, cast, frame, ronin: ronin)
    }

    // MARK: What happens to him

    /// The blow: a lurch forward behind it (out of any clash he was bound in).
    func showStrike() {
        bound = nil
        strikeClock = 0
        lurch = ronin * (kind == .brute || kind == .warlord ? 0.09 : 0.06)
        if kind == .brute { squash = 0.08 }
    }

    func showStagger() { staggerHold = 0.3 }

    /// A cut that wounds him is on its way (it lands `seconds` from now, when the drawn blade gets there): until it
    /// does (`flashHit`) he is held as he stands, in his pose, with his pips, and the knock-back, leap or spring the
    /// fight has already sent him into starts then.
    func hold(_ seconds: Double) {
        bound = nil
        holding = true
        holdLeft = seconds + 0.05
        lagged = true
    }

    /// The instant of a killing blow: thrown into the pose the blow throws him into (`Figures.struck`, variant 0 his
    /// stagger) and lit white in the setting's light, held there until the blade arrives: upright, unsquashed, whole
    /// (not fading in), turned to the ronin who struck him (even in the air, or running off), with nothing of the pose
    /// before it behind him. The carnage lets him fall from the very same pose (`Carnage.sever` with the same variant,
    /// or `fell` from `Figure.struck(cast, variant:)`), where he stands and facing the ronin, so his body, his head and
    /// his weapon leave the frozen figure without a jump.
    func freezeStruck(variant: Int = 0) {
        freeze(Figures.struck(cast, variant: variant))
    }

    /// The same, in a struck pose drawn for the purpose (`Figures.struck`; nil is variant 0).
    func freezeStruck(_ piece: Figures.Piece?) {
        freeze(piece ?? Figures.struck(cast, variant: 0))
    }

    private func freeze(_ piece: Figures.Piece) {
        holding = false
        bound = nil
        shown = .stagger(0)
        Figures.apply(body, piece, cast, ronin: ronin)
        alpha = 1
        echo.alpha = 0
        lean = 0
        squash = 0
        gather = 0
        pivot.zRotation = 0
        // (Facing the ronin as the scene lays the dead out: toward him from wherever he is now drawn.)
        if let heroX { facing = position.x < heroX ? 1 : -1 }
        body.zRotation = 0
        body.xScale = facing
        body.yScale = 1
        tint(ambient.light, 0.88)
        warning.isHidden = true
        sight.alpha = 0
        glint.alpha = 0
        ward.alpha = 0
    }

    /// The blade lands on him: a flash in the setting's light and a jolt back (and whatever a held blow was keeping
    /// from him starts).
    func flashHit() {
        holding = false
        bound = nil
        hitFlash = 0.14
        jolt = ronin * 0.08
        squash = 0.09
    }

    /// The wound a cut leaves across him, laid along the cut at the height it went in (a share of his height: a
    /// shin cut low, a head cut high), shorter across the legs: raw red, fading; wider and slower to fade the heavier
    /// the `gore` (the scene leaves it off with gore turned off).
    func gash(_ tilt: CGFloat, at level: CGFloat = 0.56, gore: Gore = .full) {
        let cut = SKSpriteNode(texture: Art.streak)
        cut.size = CGSize(width: height * (level < 0.4 ? 0.36 : 0.6), height: max(2, height * 0.04 * gore.size))
        // On the pivot, which is at his middle, so a leap carries it with him.
        cut.position = CGPoint(x: 0, y: height * (level - 0.5))
        cut.xScale = facing
        cut.zRotation = tilt * facing
        cut.color = Palette.blood.mix(.white, 0.1).color()
        cut.colorBlendFactor = 1
        cut.zPosition = 1
        pivot.addChild(cut)
        cut.run(.sequence([.wait(forDuration: 0.3 * Double(gore.span)), .fadeOut(withDuration: 0.45), .removeFromParent()]))
    }

    /// A cut met his guard. Set, the blade rings off it and the warlord rocks but holds; still coming up, it
    /// glances off and the guard goes on up. `glanced` says which (when nil, whether the guard was set when he was
    /// last drawn). Only a tremor goes through him, so the blades stay crossed where they met (`bind`).
    func showParry(glanced: Bool? = nil) {
        if glanced ?? !wardSet {
            jolt = ronin * 0.02
            ward.alpha = max(ward.alpha, 0.55)
        } else {
            jolt = ronin * 0.012
            ward.alpha = 1
        }
    }

    /// Where he is drawn along the lane (in the parent's space), without the jolt of a blow or the lurch into one.
    var standing: CGFloat { shownX ?? position.x }

    /// Holds the warlord in a clash with the ronin's blade, where he stands, the scene keeping it in step with the
    /// ronin's frames: on his guard (`block`) while the cut comes, then taking the blow braced (`clash(0)`) and shoving
    /// the blade off (`clash(1)`). Nil lets him go, and whatever the fight has him doing shows (gliding to wherever it
    /// has him by then). A frame he has none of is ignored.
    func bind(_ frame: Frame?) {
        let frame = frame.flatMap { has($0) ? $0 : nil }
        guard frame != bound else { return }
        bound = frame
        // Shown at once, so the freeze on the blow has the two of them crossed.
        if let frame, frame != shown { changePose(to: frame) }
    }
}

/// The ronin, who is the show: the iai stance at the start of a stage with his blade sheathed, and the draw-cut out
/// of it; a breathing chūdan guard with his ribbons and coat stirring, and when he is down to his last hearts, or
/// shaken by a blow, a miss or a parried cut, a guard that heaves, clutches at its wound (only if he has one) and
/// sags at the knees, begun each time on a fresh breath; cuts on a darting lunge that stretches him into the blow,
/// the next cut swung from where the last one planted him, and a step back into guard a foot at a time;
/// afterimages when he closes a long gap; a ghost of his old stance when he turns; a stumble, and a wound taken three
/// ways, turned to face whoever dealt it so it drives him away from them (before the draw, rocked back where he stands
/// with his hand on the hilt); a cut into the warlord's guard carried into a bind on his blade, then, parried, forced
/// off it and backing off in guard a step or two (glancing off a guard still rising, only drawn back out of the bind);
/// and at the end of a stage either the stage's last cut played out into the chiburi and the slow slide of the blade
/// home, or the fall: to one knee over his sword, then pitching forward onto his face (the blade still in its
/// scabbard if he never drew it).
///
/// His feet keep to the ground: he moves along the lane only in the blur of a lunge or a blow, or as a foot is
/// lifted and carried, the other kept where it stands. Well off his place, he steps back to it in guard a foot at a
/// time before the shuffle home.
@MainActor
final class HeroSprite: SKNode {
    let body = SKSpriteNode()
    private let echo = SKSpriteNode()
    private let shadow = SKSpriteNode(texture: Art.glow)
    private let aura = SKSpriteNode(texture: Art.glow)
    private(set) var facing = Side.right
    /// The frame he is drawn in, and whether it is drawn with the blade kept in its scabbard (`sheathedPiece`); the
    /// same for the ghost of the one before.
    private var pose = Frame.iai(0)
    private var poseSheathed = false
    private var echoPose = Frame.iai(0)
    private var echoSheathed = false
    /// The frame he is drawn in (the scene keeps the warlord's clash in step with it).
    var drawnFrame: Frame { pose }
    /// What he is doing, and for how long he has been doing it: standing his ground, playing out a run of frames (a
    /// cut, a stumble, a wound), or the end of the stage.
    private enum Act { case guarding, playing, flourishing, falling }
    private var act = Act.guarding
    /// Whether the blade is in its scabbard: from the end of one stage to the first cut of the next.
    private(set) var sheathed = true
    /// The stage was won on the swing now playing: it plays out, and the flourish follows once he is back in guard.
    private var victorious = false
    private var clock = 0.0
    /// How each frame moves him as it comes up: not at all; one foot kept where it was on the ground (the other
    /// lifted and carried); a foot set down in its place in guard; or thrown along the lane to a spot (a lunge, a
    /// blow), in the blur of the smear frames that follow over the time given.
    private enum Foot { case front, back }
    private enum Footwork { case hold, keep(Foot), home(Foot), thrown(CGFloat, over: Double = HeroSprite.dartTime) }
    private struct Beat {
        var frame: Frame
        var time: Double
        var footwork = Footwork.hold
        var blend = false
        /// Drawn with the blade kept in its scabbard.
        var sheathed = false
    }
    private var beats: [Beat] = []
    private var beat = 0
    /// Where he stands, from home along the lane (in the world); where a lunge or a blow started him from, how long
    /// ago, and how long it takes to get there.
    private var offset: CGFloat = 0
    private var dart: (from: CGFloat, clock: Double, span: Double) = (0, 1, HeroSprite.dartTime)
    private nonisolated static let dartTime = 0.04
    /// How hurt he is (0 whole; 1 down to his last hearts; 2 his last: `HeroSprite.strain(hp:of:)`); how long he is
    /// still shaken by a blow, a parry or a miss, and whether it was a wound (he only clutches at one he has); and the
    /// cycle his winded guard is in.
    var strain = 0
    private var shaken = 0.0
    private var bled = false
    private var gasp = 0.0
    private var gasps = 0
    private var cycle = 0
    private var lastReel = -1
    /// Stretched into a cut (above 0), squashed by a blow (below).
    private var snap: CGFloat = 0
    private var breath = 0.0
    private var flush: CGFloat = 0
    /// How much of the stage's blood is on him; the chiburi throws it off.
    private var stain: CGFloat = 0
    /// Whether blood shows on him (`Settings.gore`): the stage's blood, a wound's red flush (pale without it), the
    /// chiburi's spray, and a hand pressed to a bleeding wound as he fights for breath.
    var gore = true
    /// The setting's light on him (`Ambient`).
    var ambient = Ambient.plain {
        didSet {
            guard ambient != oldValue else { return }
            light()
        }
    }
    /// The tint on him, as last asked for (over the setting's light).
    private var tinted: (color: RGB, amount: CGFloat)?
    private var ronin: CGFloat = 60
    var home = CGPoint.zero

    /// How long after the press the drawn blade reaches its mark: the chamber and the first three frames of the
    /// swing (about 0.07 s; the draw 0.1 s).
    static func impact(_ style: Cut) -> Double {
        (style == .nukitsuke ? drawTiming : cutTiming).prefix(4).reduce(0, +)
    }

    /// Seconds each frame of a cut shows: chambered, five through the swing (the blade at its mark as the fourth
    /// comes up: `impact`), two of follow-through, zanshin, and the two steps back into guard (from a long lunge, a
    /// push-off before them and the first shortened to make room for it).
    static let cutTiming: [Double] = [0.016, 0.017, 0.018, 0.02, 0.024, 0.04, 0.045, 0.05, 0.08, 0.065, 0.065]
    /// The draw-cut is a hair slower out of the scabbard.
    static let drawTiming: [Double] = [0.028, 0.024, 0.024, 0.022, 0.022, 0.04, 0.045, 0.05, 0.085, 0.07, 0.07]
    /// Seconds each frame of the flourish shows, after a beat of stillness (the last holds): the blade raised, the
    /// chiburi snapping down, and the nōtō.
    static let flourishTiming: [Double] = [0.12, 0.16, 0.05, 0.12, 0.26, 0.26]
    /// When each frame of the fall begins: struck, the knees going, kneeling on the sword, pitching forward off the
    /// knee, face down.
    static let fallTiming: [Double] = [0, 0.14, 0.34, 1.05, 1.22]

    /// How hurt the ronin is, for the struggle drawn over his guard and his reels: 2 on his last heart, 1 down to his
    /// last third or so, else 0.
    static func strain(hp: Int, of maxHP: Int) -> Int { hp <= 1 ? 2 : hp * 3 <= maxHP + 1 ? 1 : 0 }

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
        addChild(echo)
        addChild(body)
        echo.alpha = 0
        echo.zPosition = -0.5
        light()
    }

    required init?(coder aDecoder: NSCoder) { nil }

    func layout(ronin: CGFloat, home: CGPoint) {
        self.ronin = ronin
        self.home = home
        draw(body, pose, sheathed: poseSheathed)
        draw(echo, echoPose, sheathed: echoSheathed)
        shadow.size = CGSize(width: ronin * 0.9, height: ronin * 0.13)
        aura.size = CGSize(width: ronin * 1.7, height: ronin * 1.7)
        aura.position = CGPoint(x: 0, y: ronin * 0.5)
        offset = 0
        dart.clock = dart.span
        position = home
    }

    /// A new stage: in the iai stance with the blade sheathed, or (a fight picked up partway) in guard. Nothing of
    /// the stage before (a shock, a pending flourish) carries into it.
    func reset(sheathed: Bool) {
        act = .guarding
        self.sheathed = sheathed
        victorious = false
        clock = 0
        beats = []
        offset = 0
        dart.clock = dart.span
        flush = 0
        stain = 0
        snap = 0
        shaken = 0
        bled = false
        lastReel = -1
        show(sheathed ? .iai(0) : .idle(0), blend: false)
        tint(Palette.blood, 0)
    }

    func face(_ side: Side) {
        guard side != facing else { return }
        // A ghost of the old stance, turned away, fading as he comes round.
        echoPose = pose
        echoSheathed = poseSheathed
        draw(echo, echoPose, sheathed: echoSheathed)
        echo.xScale = body.xScale
        echo.alpha = 0.4
        facing = side
    }

    /// Where he stands along the lane (the middle of his stance), his lunge, knock-back or fall included: for what
    /// is put on him or where he lies (the chiburi's spray, the blood of his fall). Not where he is drawn in the
    /// blur of a lunge.
    var standing: CGFloat { home.x + offset }

    private var ended: Bool {
        switch act {
        case .flourishing, .falling: return true
        default: return victorious
        }
    }

    /// Plays out a run of frames, then back into guard (stepping home first if they left him off his place).
    private func play(_ run: [Beat]) {
        act = .playing
        beats = run
        beat = -1
        clock = 0
        advance()
    }

    /// Brings up every beat the clock has reached, in order, so the footwork adds up even over a slow tick. At the
    /// end of a run he steps home and settles into guard (or, the stage won, flourishes); the flourish and the fall
    /// hold their last frame.
    private func advance() {
        var t = clock, k = 0
        while k < beats.count, t >= beats[k].time {
            t -= beats[k].time
            k += 1
        }
        while beat < min(k, beats.count - 1) {
            beat += 1
            enter(beats[beat])
        }
        guard k >= beats.count, act == .playing else { return }
        let away = offset * facing.sign.cg
        if abs(away) > ronin * HeroSprite.shuffleReach {
            // Well off his place (driven back into a bind and backing off from it, or struck there, or lunged far
            // out into one): a step toward it in guard, a foot at a time, back or forward; then again, until the
            // shuffle can take him the rest of the way.
            play(away > 0 ? HeroSprite.backing(HeroSprite.homingTime, blend: true) : HeroSprite.advancing(HeroSprite.homingTime))
        } else if abs(away) > ronin * 0.01 {
            // Off his place: stepping back, the front foot lifted back and set down as the back one follows;
            // stepping forward out of the wide stance a blow leaves him in, the back foot drawn up first and the front
            // stepped out into guard.
            let time = 0.06 + Double(min(abs(away) / ronin, 0.4)) * 0.2
            if away > 0 {
                play([Beat(frame: .shuffle(0), time: time, footwork: .keep(.back)),
                      Beat(frame: .shuffle(2), time: time, footwork: .home(.front))])
            } else {
                play([Beat(frame: .shuffle(1), time: time, footwork: .keep(.front)),
                      Beat(frame: .shuffle(3), time: time, footwork: .home(.back))])
            }
        } else if victorious {
            // The stage's last cut has played out and he is back in guard: zanshin was the pause, so straight into
            // the chiburi.
            conclude(true, at: 0.25)
        } else {
            settle()
        }
    }

    private func enter(_ b: Beat) {
        let sign = facing.sign.cg
        switch b.footwork {
        case .hold:
            break
        case .keep(let foot):
            let before = HeroSprite.footing(pose, sheathed: poseSheathed), after = HeroSprite.footing(b.frame, sheathed: b.sheathed)
            let step = sign * ronin * (foot == .front ? before.front.x - after.front.x : before.back.x - after.back.x)
            offset += step
            // A lunge still under way carries on, from a start moved with him.
            dart.from += step
        case .home(let foot):
            let home = Figure.footing(.hero, .idle(0)), after = HeroSprite.footing(b.frame, sheathed: b.sheathed)
            let to = sign * ronin * (foot == .front ? home.front.x - after.front.x : home.back.x - after.back.x)
            dart.from += to - offset
            offset = to
        case .thrown(let to, let span):
            dart = (shown, 0, span)
            offset = to
        }
        show(b.frame, blend: b.blend, sheathed: b.sheathed)
        // Forced off the warlord's blade: thrown back, squashed into it.
        if b.frame == .clash(1) { snap = -0.8 }
        // The flourish's moments: the blood flung off the blade as the chiburi snaps down (if there is any, and gore
        // is on), the blade home at the end.
        if act == .flourishing {
            if b.frame == .flourish(3), stain > 0 {
                if gore { chiburi() }
                stain = 0
            }
            if b.frame == .flourish(Frame.flourishFrames - 1) { sheathed = true }
        }
    }

    /// Where he is drawn along the lane from home: the offset, or on his way there in a lunge.
    private var shown: CGFloat {
        guard dart.clock < dart.span else { return offset }
        let t = CGFloat(dart.clock / dart.span)
        return dart.from + (offset - dart.from) * (1 - (1 - t) * (1 - t))
    }

    /// Whether a frame has him planted in a lunge's footing: the swing and after it, a cut swung again, a short
    /// recovery with the front foot still down, the push-off.
    private static func lunging(_ f: Frame) -> Bool {
        switch f {
        case .cut(_, let k): return k >= 3
        case .chain: return true
        case .recover(_, 2), .recover(_, 4): return true
        default: return false
        }
    }

    /// A cut that landed (or was aimed) `distance` points away: he darts out along the lane into it, and steps back
    /// into guard: from a long lunge he pushes off and lifts the front foot back first, from a short one he draws the
    /// back foot up first. Swung again on the same side while still planted in the last one's lunge, the new cut
    /// keeps that footing, the front foot where it is. A long reach leaves afterimages along the lunge. `start`
    /// skips the first frames, for a blade that must already be at its mark (an arrow met the instant it is cut).
    func cut(_ side: Side, _ style: Cut, distance: CGFloat, from start: Int = 0) {
        guard !ended else { return }
        let chained = act == .playing && side == facing && style != .nukitsuke && HeroSprite.lunging(pose)
        face(side)
        sheathed = false
        snap = 1
        let reach = min(ronin * 0.22, max(0, distance - ronin * 0.3) * 0.34)
        let timing = style == .nukitsuke ? HeroSprite.drawTiming : HeroSprite.cutTiming
        // (RoninArtTests.testTheLungeAndTheStepsHomeNeverSlideAPlantedFoot replays these beats with the frames'
        // footing: keep the two in step.)
        let first = min(max(0, start), Frame.cutFrames - 1)
        var run = (first..<Frame.cutFrames).map { k in
            Beat(frame: chained && k < Frame.chainFrames ? .chain(style, k) : .cut(style, k), time: timing[k])
        }
        var out = side.sign.cg * reach
        if chained {
            // Still in the lunge: the front foot stays planted, or (the new cut reaching further) he hops on in it.
            let kept = offset + side.sign.cg * ronin * (Figure.footing(.hero, pose).front.x - Figure.footing(.hero, run[0].frame).front.x)
            if side.sign.cg * (out - kept) > ronin * 0.05 {
                run[0].footwork = .thrown(out)
            } else {
                run[0].footwork = .keep(.front)
                out = kept
            }
        } else {
            // The lunge carries him on through the swing until the front foot is out at its full reach (frame 5
            // on), so it is never left sliding out along the ground behind a body already there.
            let lunge = timing[first..<max(first, Frame.chainFrames)].reduce(0, +)
            run[0].footwork = .thrown(out, over: max(HeroSprite.dartTime, lunge))
        }
        let away = side.sign.cg * out / ronin
        if away > 0.1 {
            // A middling lunge leaves the back foot behind its place in guard, and the front foot comes back less far.
            let zanshin = Figure.footing(.hero, .cut(style, Frame.cutFrames - 1)), guardFeet = Figure.footing(.hero, .idle(0))
            let middling = away + zanshin.back.x < guardFeet.back.x
            run += [Beat(frame: .recover(style, 4), time: 0.03),
                    Beat(frame: .recover(style, middling ? 5 : 0), time: timing[Frame.cutFrames] - 0.02, footwork: .keep(.back), blend: true),
                    Beat(frame: .recover(style, 1), time: timing[Frame.cutFrames + 1], footwork: .home(.front))]
        } else {
            run += [Beat(frame: .recover(style, 2), time: timing[Frame.cutFrames], footwork: .keep(.front)),
                    Beat(frame: .recover(style, 3), time: timing[Frame.cutFrames + 1], footwork: .home(.back))]
        }
        play(run)
        if distance > ronin * 0.95 { afterimages(side, style, distance) }
    }

    /// Faint copies of the ronin in the cut's own pose, strung out toward the foe across the gap he closed, gone
    /// in a blink: dark, see-through silhouettes in the setting's shadow, like ink left behind by the brush.
    private func afterimages(_ side: Side, _ style: Cut, _ distance: CGFloat) {
        guard let parent else { return }
        let span = distance - ronin * 0.35
        for k in 1...2 {
            let ghost = SKSpriteNode()
            Figures.apply(ghost, .hero, .cut(style, 5), ronin: ronin)
            ghost.xScale = side == .right ? 1 : -1
            ghost.position = CGPoint(x: home.x + side.sign.cg * span * CGFloat(k) / 3, y: home.y)
            ghost.zPosition = zPosition - 0.5
            Art.setTint(ghost, ambient.ghost, 1)
            ghost.alpha = 0.36 - 0.12 * CGFloat(k)
            ghost.run(.sequence([.fadeOut(withDuration: 0.14), .removeFromParent()]))
            parent.addChild(ghost)
        }
    }

    /// A cut at nothing: carried past the mark on the planted back foot, the front one coming down after it; and a
    /// breath or two to find himself again.
    func whiff(_ side: Side, for seconds: Double) {
        guard !ended else { return }
        face(side)
        sheathed = false
        shaken = max(shaken, 0.6)
        play([Beat(frame: .stumble(0), time: 0.15, footwork: .thrown(side.sign.cg * ronin * 0.12), blend: true),
              Beat(frame: .stumble(1), time: max(0.15, seconds - 0.15), footwork: .keep(.back), blend: true)])
    }

    /// A cut into the warlord's guard, met by his blade: the swing carried on into the bind (`clash(0)`), the ronin's
    /// feet `spot` from his place (along the lane, where the blades meet: `Figure.clashGap` from the warlord's),
    /// lunging out to it through the swing or, the warlord standing closer than that, driven back into it as the blades
    /// meet. Parried (`forced`), he is forced off the blade (`clash(1)`) on his planted back foot, finds his guard, and
    /// backs off in it a foot at a time, a step or two (whichever leaves him nearer his place), paced to `seconds` (his
    /// stumble); glanced off a guard still rising, he only draws back out of the bind into guard, with one quick step
    /// back at most. Then he steps home. Returns how long until the blades meet, and how much longer after that his
    /// feet take to settle in the bind (his swing carries on through the freeze on it that long).
    @discardableResult
    func clash(_ side: Side, _ style: Cut, at spot: CGFloat, for seconds: Double, forced: Bool) -> (impact: Double, settle: Double) {
        guard !ended else { return (0, 0) }
        face(side)
        sheathed = false
        snap = 1
        let sign = side.sign.cg
        let timing = style == .nukitsuke ? HeroSprite.drawTiming : HeroSprite.cutTiming
        // (RoninArtTests.testTheRoninBacksOffAFootAtATime replays the parry's beats with the frames' footing.)
        // The chamber and the swing to its mark, then the blade stopped dead on his.
        var run = (0..<HeroSprite.swing).map { Beat(frame: .cut(style, $0), time: timing[$0]) }
        let impact = timing.prefix(HeroSprite.swing).reduce(0, +)
        let lunging = sign * (spot - offset) > ronin * 0.01
        if lunging { run[0].footwork = .thrown(spot, over: impact) }
        run.append(Beat(frame: .clash(0), time: forced ? HeroSprite.bindTime : HeroSprite.glanceBind, footwork: .thrown(spot)))
        // Where he stands once he has his guard again: the back foot kept where it was in the bind.
        let bound = Figure.footing(.hero, .clash(0)), guarded = Figure.footing(.hero, .retreat(3))
        let away = (sign * spot + ronin * (bound.back.x - guarded.back.x)) / ronin
        let step = Figure.retreatStep
        if forced {
            // Thrown off the blade over the planted back foot, the front one dragged back off the ground; the guard
            // found on the same back foot; then backing off in it, a step or two, slower the longer he is off balance.
            let slow = min(1.25, max(0.85, seconds / Tuning.parried))
            run += [Beat(frame: .clash(1), time: HeroSprite.forcedTime * slow, footwork: .keep(.back), blend: true),
                    Beat(frame: .retreat(3), time: HeroSprite.guardTime * slow, footwork: .keep(.back), blend: true)]
            let steps = abs(away - 2 * step) < abs(away - step) ? 2 : 1
            for _ in 0..<steps { run += HeroSprite.backing(HeroSprite.backingTime * slow) }
            shaken = max(shaken, 1.2)
        } else {
            // Slid off a guard still coming up: the front foot drawn back out of the bind into guard, the back one
            // planted, and a quick step back only if it takes him nearer his place.
            run += [Beat(frame: .retreat(2), time: HeroSprite.glanceDraw, footwork: .keep(.back), blend: true),
                    Beat(frame: .retreat(3), time: HeroSprite.glanceDraw, footwork: .keep(.back))]
            if abs(away - step) < abs(away) { run += HeroSprite.backing(HeroSprite.glanceStep) }
        }
        play(run)
        return (impact, lunging ? 0 : HeroSprite.dartTime)
    }

    /// The frames of a cut up to its blade reaching the mark (`impact`).
    private nonisolated static let swing = 4
    /// Seconds the blades stay bound (`clash(0)`): parried, and glancing; the parried ronin forced off the blade
    /// (`clash(1)`) and finding his guard again, and each frame of a step back in it (all stretched for a longer
    /// stumble: `clash`); the glancing one drawing back into guard, a frame at a time, and each frame of his quick step.
    private nonisolated static let bindTime = 0.07
    private nonisolated static let glanceBind = 0.055
    private nonisolated static let forcedTime = 0.08
    private nonisolated static let guardTime = 0.05
    private nonisolated static let backingTime = 0.05
    private nonisolated static let glanceDraw = 0.045
    private nonisolated static let glanceStep = 0.04
    /// How far off his place (in his heights) the shuffle takes him home from; further, he steps toward it in guard
    /// first, and each frame of such a step.
    private nonisolated static let shuffleReach: CGFloat = 0.25
    private nonisolated static let homingTime = 0.055

    /// A step back in guard, a foot at a time: the back foot lifted back over the planted front one and set down a
    /// step behind, then the front one drawn back after it over the planted back one, into his guard's footing
    /// (`Figure.retreatStep`).
    private static func backing(_ time: Double, blend: Bool = false) -> [Beat] {
        [Beat(frame: .retreat(0), time: time, footwork: .keep(.front), blend: blend), Beat(frame: .retreat(1), time: time, footwork: .keep(.front)),
         Beat(frame: .retreat(2), time: time, footwork: .keep(.back)), Beat(frame: .retreat(3), time: time, footwork: .keep(.back))]
    }

    /// A step forward in guard, the same steps the other way round: the front foot lifted forward over the planted
    /// back one and set down a step ahead, then the back one drawn up after it into his guard's footing.
    private static func advancing(_ time: Double) -> [Beat] {
        [Beat(frame: .retreat(2), time: time, footwork: .keep(.back), blend: true), Beat(frame: .retreat(1), time: time, footwork: .keep(.back)),
         Beat(frame: .retreat(0), time: time, footwork: .keep(.front)), Beat(frame: .retreat(3), time: time, footwork: .keep(.front))]
    }

    /// A cut turned aside by the warlord's guard: the blade flung back, a step back on his heels.
    func repel(_ side: Side, for seconds: Double) {
        guard !ended else { return }
        face(side)
        sheathed = false
        snap = -0.8
        shaken = max(shaken, 1.2)
        play([Beat(frame: .repelled(0), time: 0.14, footwork: .thrown(offset - side.sign.cg * ronin * 0.1), blend: true),
              Beat(frame: .repelled(1), time: max(0.16, seconds - 0.14), footwork: .keep(.front), blend: true)])
    }

    /// Struck (from `attacker`'s side, when it is known: he wheels to face it, so the blow drives him back away from
    /// whoever dealt it): rocked back and bracing, staggered back a step at a time, or dropped to a knee and pushed
    /// back up; more often the last, and slower, the worse he is hurt. Before the draw, rocked back on his heels
    /// where he stands, his hand on the hilt.
    func hurt(from attacker: Side? = nil) {
        guard !ended else { return }
        if let attacker { face(attacker) }
        flush = 0.85
        snap = -1
        shaken = 2.2
        bled = true
        let slow = strain == 0 ? 1.0 : strain == 1 ? 1.15 : 1.3
        guard !sheathed else {
            play([Beat(frame: .hurt(0), time: 0.07, blend: true, sheathed: true),
                  Beat(frame: .hurt(1), time: 0.1 * slow, sheathed: true),
                  Beat(frame: .hurt(2), time: 0.15 * slow, blend: true, sheathed: true)])
            return
        }
        let knock = offset - facing.sign.cg * ronin * 0.07
        let weights: [Double] = strain == 0 ? [0.45, 0.4, 0.15] : strain == 1 ? [0.3, 0.35, 0.35] : [0.2, 0.3, 0.5]
        var way = 0, roll = Double.random(in: 0..<weights.reduce(0, +))
        while way < weights.count - 1, roll >= weights[way] {
            roll -= weights[way]
            way += 1
        }
        if way == lastReel, Double.random(in: 0..<1) < 0.6 { way = (way + 1 + Int.random(in: 0...1)) % 3 }
        lastReel = way
        var run: [Beat]
        switch way {
        case 0:
            run = [Beat(frame: .hurt(0), time: 0.07, footwork: .thrown(knock), blend: true),
                   Beat(frame: .hurt(1), time: 0.1, footwork: .keep(.front)),
                   Beat(frame: .hurt(2), time: 0.15, footwork: .keep(.front), blend: true)]
        case 1:
            run = [Beat(frame: .reel(0, 0), time: 0.07, footwork: .thrown(knock), blend: true),
                   Beat(frame: .reel(0, 1), time: 0.1, footwork: .keep(.front)),
                   Beat(frame: .reel(0, 2), time: 0.11, footwork: .keep(.back)),
                   Beat(frame: .reel(0, 3), time: 0.16, footwork: .keep(.back), blend: true)]
        default:
            run = [Beat(frame: .reel(1, 0), time: 0.07, footwork: .thrown(offset - facing.sign.cg * ronin * 0.04), blend: true),
                   Beat(frame: .reel(1, 1), time: 0.1, footwork: .keep(.front)),
                   Beat(frame: .reel(1, 2), time: 0.24, footwork: .keep(.front)),
                   Beat(frame: .reel(1, 3), time: 0.12, footwork: .keep(.front), blend: true)]
        }
        for k in run.indices.dropFirst() { run[k].time *= slow }
        play(run)
    }

    /// Blood thrown on him by a kill: darker by `amount`, up to `most` (the heavier the gore, the more of it).
    func bloodied(_ amount: CGFloat, upTo most: CGFloat = 0.14) { stain = max(stain, min(most, stain + amount)) }

    /// The end of the stage. Won on a cut, the cut plays out first (the swing, zanshin and the steps home), and the
    /// flourish follows; otherwise the flourish or the fall begins now, from where he stands.
    func finish(victory: Bool) {
        flush = 0
        if victory, act == .playing, let first = beats.first?.frame, HeroSprite.swinging(first) {
            victorious = true
            return
        }
        conclude(victory, at: 0)
    }

    private static func swinging(_ f: Frame) -> Bool {
        switch f {
        case .cut, .chain: return true
        default: return false
        }
    }

    /// Into the flourish or the fall, `time` into it.
    private func conclude(_ victory: Bool, at time: Double) {
        victorious = false
        flush = 0
        let feet = HeroSprite.footing(pose, sheathed: poseSheathed)
        if victory {
            // A beat of stillness after the last kill, then the blade raised, the chiburi (the body sinking into its
            // snap) and the blade slid home, all on his guard's footing: the front foot where it stands throughout
            // (or, if it is off the ground, the back one to begin with), the other set down in its place once.
            act = .flourishing
            let planted: Foot = feet.front.y <= feet.back.y ? .front : .back
            let timing = HeroSprite.flourishTiming
            beats = (0..<Frame.flourishFrames).map { k in
                Beat(frame: .flourish(k), time: k == 0 ? 0.25 + timing[0] : k < timing.count ? timing[k] : .greatestFiniteMagnitude,
                     footwork: .keep(k == 0 ? planted : .front), blend: k != 2 && k != 3)
            }
        } else {
            // Struck, taking it on the back foot (unless it is off the ground), the back foot stepping back to catch
            // him as the knees go, down on one knee over the sword, then pitching forward off it (the front foot
            // sliding out ahead) onto his face. Cut down before he could draw, the blade stays in its scabbard.
            act = .falling
            let braced: Foot = feet.back.y < 0.04 ? .back : .front
            let starts = HeroSprite.fallTiming
            let footwork: [Footwork] = [.keep(braced), .keep(.front), .keep(.back), .keep(.back), .hold]
            beats = (0..<Frame.fallFrames).map { k in
                Beat(frame: .fall(k), time: k + 1 < starts.count ? starts[k + 1] - starts[k] : .greatestFiniteMagnitude,
                     footwork: footwork[min(k, footwork.count - 1)], blend: true, sheathed: sheathed)
            }
        }
        beat = -1
        clock = time
        advance()
    }

    /// The snap of the chiburi: the blood on the blade flung off in a spray onto the ground.
    private func chiburi() {
        guard let parent else { return }
        let sign: CGFloat = facing == .right ? 1 : -1
        let spray = Art.burst(Palette.blood.mix(.black, 0.2), count: Int(20 + stain * 60), speed: ronin * 2.2, size: ronin * 0.05, life: 0.45,
                              spread: 0.5, angle: sign > 0 ? -0.35 : .pi + 0.35, gravity: ronin * 7, additive: false)
        spray.position = CGPoint(x: home.x + offset + sign * ronin * 0.45, y: home.y + ronin * 0.42)
        parent.addChild(spray)
    }

    private func settle() {
        act = .guarding
        beats = []
        offset = 0
        dart.clock = dart.span
        // Into a winded guard from a pose on his feet: the heaving starts on the in-breath, not partway through it.
        if strain > 0 || shaken > 0 { freshBreath() }
        let look = stance
        show(look.frame, blend: true, sheathed: look.sheathed)
    }

    /// The breath begun afresh: the winded cycle starts from its first frame (the nearest to standing), chosen anew.
    private func freshBreath() {
        gasp = Double((Int(gasp) / Frame.windedFrames + 1) * Frame.windedFrames)
    }

    /// His guard: the iai stance before the first cut, chūdan, or, badly hurt or just shaken, one of the winded
    /// cycles (heaving over the iai stance, with the blade still sheathed), another chosen each time one runs out:
    /// the knees giving more often on the last heart, and a hand pressed to his side only when he is bleeding (and
    /// never with gore off).
    private var stance: (frame: Frame, sheathed: Bool) {
        guard strain > 0 || shaken > 0 else {
            return sheathed ? (.iai(Int(breath * 5) % Frame.iaiFrames), false) : (.idle(Int(breath * 8) % Frame.heroIdleFrames), false)
        }
        let round = Int(gasp) / Frame.windedFrames
        if round != gasps || (strain == 0 && (cycle == 2 || (!bled && cycle != 0))) || (!gore && cycle == 1) {
            gasps = round
            var weights: [Double] = strain > 1 ? [0.3, 0.35, cycle == 2 ? 0.1 : 0.35]
                : strain == 1 ? [0.45, 0.4, cycle == 2 ? 0.05 : 0.15] : bled ? [0.6, 0.4, 0] : [1, 0, 0]
            // (The hand pressed to the wound shows the blood coming through it: only with gore on.)
            if !gore { weights[1] = 0 }
            var next = 0, roll = Double.random(in: 0..<weights.reduce(0, +))
            while next < weights.count - 1, roll >= weights[next] {
                roll -= weights[next]
                next += 1
            }
            cycle = next
        }
        return (.winded(cycle, Int(gasp) % Frame.windedFrames), sheathed)
    }

    private static func winded(_ f: Frame) -> Bool {
        if case .winded = f { return true }
        return false
    }

    // MARK: Drawing

    /// Tints him `amount` of the way to `color` over the setting's light, unless he already is (every tint sets the
    /// shader's attribute afresh).
    private func tint(_ color: RGB, _ amount: CGFloat) {
        if let tinted, tinted.color == color, tinted.amount == amount { return }
        tinted = (color, amount)
        let drawn = ambient.with(color, amount)
        Art.setTint(body, drawn.color, drawn.amount)
    }

    /// Puts him in the setting's light: drawn a little toward its darkest tone (a flush or the stage's blood on top),
    /// his shadow in it, and the ghost of the pose he has just left a dark, see-through silhouette in it.
    private func light() {
        shadow.color = ambient.ghost.scaled(0.5).color()
        Art.setTint(echo, ambient.ghost, 1)
        let last = tinted ?? (Palette.blood, 0)
        tinted = nil
        tint(last.color, last.amount)
    }

    private func show(_ frame: Frame, blend: Bool, sheathed look: Bool = false) {
        guard frame != pose || look != poseSheathed else { return }
        if blend {
            echoPose = pose
            echoSheathed = poseSheathed
            draw(echo, echoPose, sheathed: echoSheathed)
            echo.xScale = body.xScale
            echo.alpha = 0.4
        }
        pose = frame
        poseSheathed = look
        draw(body, frame, sheathed: look)
    }

    private func draw(_ sprite: SKSpriteNode, _ frame: Frame, sheathed look: Bool) {
        if look {
            Figures.apply(sprite, HeroSprite.sheathedPiece(frame), .hero, ronin: ronin)
        } else {
            Figures.apply(sprite, .hero, frame, ronin: ronin)
        }
    }

    /// Where his feet are in a frame (`Figure.footing`). Drawn sheathed, on his feet he stands as the iai does.
    private static func footing(_ frame: Frame, sheathed look: Bool) -> (front: CGPoint, back: CGPoint) {
        if look, afoot(frame) { return Figure.footing(.hero, .iai(0)) }
        return Figure.footing(.hero, frame)
    }

    /// Whether a frame has him on his feet: all but the fall once his knees go (its first frame, the blow that fells
    /// him, is taken where he stands).
    private static func afoot(_ f: Frame) -> Bool {
        if case .fall(let k) = f { return k == 0 }
        return true
    }

    private static var sheathedPieces: [Frame: Figures.Piece] = [:]

    /// One of his frames drawn with the blade kept in its scabbard, for what befalls him before the draw (a blow, a
    /// winded breath, the fall): the sword hand on the hilt and the other at the scabbard's mouth (or pressed to his
    /// wound, or, going over, thrown out to break his fall). On his feet (the blow that fells him included) he stands
    /// as the iai does, the feet planted, and only his body reels or heaves as the frame's does.
    private static func sheathedPiece(_ frame: Frame) -> Figures.Piece {
        if let piece = sheathedPieces[frame] { return piece }
        var p = Figure.pose(.hero, frame)
        if afoot(frame) {
            let iai = Figure.pose(.hero, .iai(0))
            p.front = iai.front
            p.back = iai.back
            p.shift = iai.shift
            p.lift = iai.lift
            p.airborne = false
            if !p.clutch { p.grip = .saya }
        } else if case .fall(let k) = frame, k < 3 {
            p.grip = .saya
        }
        p.sheathed = 1
        p.saya = 0
        p.ghosts = []
        p.drag = 0
        p.smear = nil
        let piece = Figures.render(Figure.sketch(.hero, pose: p))
        sheathedPieces[frame] = piece
        return piece
    }

    /// Draws now what he may show with the blade still sheathed (otherwise drawn the first time it is needed).
    static func preload() {
        for k in 0..<Frame.hurtFrames { _ = sheathedPiece(.hurt(k)) }
        for v in 0..<Frame.windedCycles {
            for k in 0..<Frame.windedFrames { _ = sheathedPiece(.winded(v, k)) }
        }
        for k in 0..<Frame.fallFrames { _ = sheathedPiece(.fall(k)) }
    }

    // MARK: Each frame

    func update(dt: Double, bloodlust: Bool) {
        breath += dt
        clock += dt
        dart.clock += dt
        gasp += dt * (strain > 1 ? 10.5 : 8.5)
        if shaken > 0, act == .guarding { shaken -= dt }
        if shaken <= 0 { bled = false }
        switch act {
        case .guarding:
            if strain > 0 || shaken > 0, !HeroSprite.winded(pose) { freshBreath() }
            let look = stance
            // Into or out of a winded cycle, or from one to another: blended.
            var blend = false
            switch (pose, look.frame) {
            case (.winded(let a, _), .winded(let b, _)): blend = a != b || poseSheathed != look.sheathed
            case (.winded, _), (_, .winded): blend = true
            default: break
            }
            show(look.frame, blend: blend, sheathed: look.sheathed)
        case .playing, .flourishing, .falling:
            advance()
        }
        if echo.alpha > 0 { echo.alpha = max(0, echo.alpha - CGFloat(dt) / 0.12 * 0.45) }
        position = CGPoint(x: home.x + shown, y: home.y)
        snap *= CGFloat(exp(-dt * 16))
        let sign: CGFloat = facing == .right ? 1 : -1
        body.xScale = sign * (1 + 0.05 * snap)
        body.yScale = 1 - 0.035 * snap
        if flush > 0 { flush = max(0, flush - CGFloat(dt) * 4) }
        // A wound flushes him red (with gore off, a pale flash: no blood); the blood of the stage darkens him, a deep
        // wet red rather than a bright one.
        let blood = gore ? stain : 0
        if flush > blood {
            if gore { tint(Palette.blood, flush) } else { tint(ambient.light, flush * 0.6) }
        } else {
            tint(Palette.blood.mix(.black, 0.55), blood)
        }
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

/// The gourd flung up from its fallen bearer: it sails in an arc from where he held it over his head, up and down to
/// where it comes down, turning end over end in its jade glow with a glint off it. Where it will come down is marked on
/// the ground from the moment it is flung (`mark`, which the scene lays on the ground), and in the last moments of its
/// fall, when a cut toward it catches it, it flares and glints and its mark lights up. With Reduce Motion it turns
/// slowly and its flare holds steady.
@MainActor
final class GourdSprite: SKNode {
    /// The bearer it was flung from, and where it left his hands (the scene's coordinates).
    let from: Int
    let start: CGPoint
    /// Its height, and the mark on the ground where it comes down.
    let size: CGFloat
    let mark = SKShapeNode()
    private let turning = SKNode()
    private let halo = SKSpriteNode(texture: Art.glow)
    private let glint = SKSpriteNode(texture: Art.glow)
    private let spin: CGFloat
    private var age = 0.0

    /// How high over the line from his hands to the ground the arc rises (in ronin heights).
    static let rise: CGFloat = 0.85

    init(from: Int, start: CGPoint, toward side: Side, ronin: CGFloat) {
        self.from = from
        self.start = start
        size = max(10, ronin * 0.22)
        // End over end the way it is thrown.
        spin = side == .right ? -7 : 7
        super.init()
        halo.size = CGSize(width: size * 2.6, height: size * 2.6)
        halo.color = Palette.jade.color()
        halo.colorBlendFactor = 1
        halo.blendMode = .add
        halo.alpha = 0.45
        addChild(halo)
        turning.addChild(Icons.gourd(size, Palette.jade.mix(.white, 0.25).color()))
        addChild(turning)
        glint.size = CGSize(width: size * 1.2, height: size * 1.2)
        glint.color = .white
        glint.colorBlendFactor = 1
        glint.blendMode = .add
        glint.alpha = 0
        glint.position = CGPoint(x: size * 0.12, y: size * 0.18)
        glint.zPosition = 1
        addChild(glint)
        let ring = CGPath(ellipseIn: CGRect(x: -size * 0.8, y: -size * 0.16, width: size * 1.6, height: size * 0.32), transform: nil)
        mark.path = ring
        mark.lineWidth = 1.2
        mark.strokeColor = Palette.jade.mix(.white, 0.2).color()
        mark.fillColor = Palette.jade.color(0.15)
        mark.alpha = 0
        position = start
    }

    required init?(coder aDecoder: NSCoder) { nil }

    /// Puts it where the fight has it: `gourd` in the air, coming down at `land` along the lane on the ground at
    /// `ground` (points), the arc kept under `ceiling`. `dt` runs its flare.
    func update(_ gourd: Gourd, land: CGFloat, ground: CGFloat, ronin: CGFloat, ceiling: CGFloat, calm: Bool, dt: Double) {
        age += dt
        let p = CGFloat(gourd.progress)
        // On the ground it rests on its bottom; the arc runs from his hands to there, and rises over that line.
        let rest = ground + size * 0.5
        let y = rest + (start.y - rest) * (1 - p) + ronin * GourdSprite.rise * 4 * p * (1 - p)
        position = CGPoint(x: start.x + (land - start.x) * p, y: min(y, ceiling - size * 0.6))
        turning.zRotation = (calm ? 0.35 : 1) * spin * p * CGFloat(gourd.span)
        mark.position = CGPoint(x: land, y: ground)
        let pulse = calm ? 0.5 : 0.5 + 0.5 * CGFloat(sin(age * 26))
        if gourd.catchable {
            // Low enough to catch: it flares and glints, and the spot it will land on lights up.
            halo.alpha = 0.95
            halo.setScale(1.5 + 0.2 * pulse)
            glint.alpha = 0.4 + 0.6 * pulse
            mark.alpha = 1
            mark.fillColor = Palette.jade.color(0.2 + 0.25 * pulse)
        } else {
            halo.alpha = 0.45
            halo.setScale(1)
            glint.alpha = 0.15 * p
            mark.alpha = 0.2 + 0.5 * p
            mark.fillColor = Palette.jade.color(0.15)
        }
    }
}

extension Double {
    var cg: CGFloat { CGFloat(self) }
}
