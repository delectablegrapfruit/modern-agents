import AppKit
import SpriteKit
import RoninArt
import RoninCore

/// A foe on the lane: its silhouette and shadow; while its blow is coming, a red flush, a glint and a warning marker
/// above its head whose ring runs down to the blow; for an archer drawing, a red sight line to the ronin; pips for
/// the cuts a tough one has left; the gourd over a bearer's head, flaring as he gathers himself to dart in; the
/// warlord's guard as a pale ward before him, faint while it comes up and flashing as it sets, and his fury as a red
/// haze that deepens as he is cut down.
///
/// It moves smoothly: it is drawn where the fight has him as he walks or darts, while a jump the fight makes (a
/// knock-back, a shove) glides; a blow that wounds him holds him as he is until the blade gets there, and the
/// knock-back, leap or spring it sends him into starts then. Each change of pose blends out of the one before, it
/// leans into its stride and lurches into its blows, squashes as it lands, and it fades in as it arrives.
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
    private var gourdHalo: SKSpriteNode?
    private var walk: CGFloat = 0
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
    /// with the gourd away; and the frame he is drawn in.
    private(set) var facing: CGFloat = 1
    private(set) var shown = Frame.walk(0)
    private var age = 0.0
    /// A wounding blow on its way (`hold`): he is held as he is until it lands, or this long at most; then whether a
    /// leap the blow sent him into has yet to be picked up, and how far through it the fight already had him when it
    /// was, so the leap is drawn from there and still comes down with him.
    private var holding = false
    private var holdLeft = 0.0
    private var lagged = false
    private var leapStart: Double?
    /// Whether the warlord's guard was set on the last update; how far round the warning ring was drawn; the tint
    /// on him and the cuts his pips show, as last set.
    private var wardSet = false
    private var ringStep = -1
    private var tinted: (color: RGB, amount: CGFloat)?
    private var pipsShown = -1

    init(foe: Foe, ronin: CGFloat, headroom: CGFloat? = nil) {
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
        pivot.addChild(echo)
        pivot.addChild(body)
        echo.alpha = 0
        echo.zPosition = -0.1
        tint(Palette.blood, 0)
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
        // Over the HUD (the combo and its haze, the vignette): a blow coming is the one thing that must never be
        // covered. Still under the banners, the curtain and the header.
        warning.zPosition = 38
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
        for pip in pips { pip.setScale(max(1, ronin / 60)) }
        // A new size draws the lane afresh: he is put straight where the fight has him.
        shownX = nil
        core = nil
        lanePoints = nil
        glide = 0
        placeOverhead()
    }

    // MARK: Over his head

    /// The warning marker's ring, and how much room it needs above its centre at the height of its pulse (with its
    /// stroke).
    nonisolated static func markerRadius(ronin: CGFloat) -> CGFloat { max(6, ronin * 0.12) }
    nonisolated static func markerClearance(ronin: CGFloat) -> CGFloat { markerRadius(ronin: ronin) * 1.15 + 1.5 }

    /// Where the marks over a foe go, in points above his feet: the pips for the cuts he has left, the gourd, and the
    /// warning marker. Over his head, the same height for every kind, the gourd above a bearer's pips and the marker
    /// above the gourd; the marker comes down as far as it must to stay under a lane that ends `headroom` above his
    /// feet (onto the warlord's crest, if what tops the lane leaves no more room than that).
    nonisolated static func overhead(kind: Kind, ronin: CGFloat, headroom: CGFloat = .greatestFiniteMagnitude,
                                     gourd: Bool = false) -> (pips: CGFloat, gourd: CGFloat, marker: CGFloat) {
        let height = ronin * Build.of(.foe(kind)).height
        let head = height * 1.12
        let above = gourd ? head + ronin * 0.08 : head
        let marker = min(gourd ? above + ronin * 0.2 : head, headroom - markerClearance(ronin: ronin))
        return (gourd ? height * 1.02 : height * 1.1, above, marker)
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
        let spacing = max(7, ronin * 0.11)
        for (k, pip) in pips.enumerated() {
            pip.position = CGPoint(x: (CGFloat(k) - CGFloat(pips.count - 1) / 2) * spacing, y: marks.pips)
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
        node.addChild(Icons.gourd(max(9, ronin * 0.17), Palette.jade.mix(.white, 0.25).color()))
        node.run(.repeatForever(.sequence([.moveBy(x: 0, y: 2, duration: 0.6), .moveBy(x: 0, y: -2, duration: 0.6)])))
        // Over his pips, whatever order they were added in.
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

    /// The same, for callers from when a gourd could also be spilled here: it never is now, so `broken` is ignored.
    func dropGourd(broken _: Bool) { dropGourd() }

    // MARK: Each frame

    /// Puts the foe where the fight has him and picks his frame. `position` is where the fight has him on the lane,
    /// and `hero` the ronin's x, the middle of the lane: for the archer's sight line, and to measure the lane by.
    func update(_ foe: Foe, at position: CGPoint, air: CGFloat, hero: CGFloat, dt: Double) {
        age += dt
        heroX = hero
        strikeClock += dt
        staggerHold = max(0, staggerHold - dt)
        hitFlash = max(0, hitFlash - dt)
        idleClock += dt
        jolt *= CGFloat(pow(0.0005, dt))
        lurch *= CGFloat(pow(0.0002, dt))
        squash *= CGFloat(pow(0.0004, dt))
        if alpha < 1 { alpha = min(1, CGFloat(age / 0.35)) }
        if foe.bearer, gourd == nil { showGourd() } else if !foe.bearer, gourd != nil { dropGourd() }
        if holding {
            holdLeft -= dt
            if holdLeft <= 0 { holding = false }
        }
        // The lane is drawn about the ronin, so where the fight has him says how many points a lane unit is.
        if abs(foe.x) > 0.05 { lanePoints = abs((position.x - hero) / CGFloat(foe.x)) }
        let leaping = foe.phase == .leaping && !holding
        if !holding {
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
            if holding, let held = shownX {
                // The blade is still on its way: he stays where he stood.
                x = held
                lift = shownAir
                glide = held - position.x
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
        let moved = shownX.map { abs(x - $0) } ?? 0
        shownX = x
        shownAir = lift
        self.position = CGPoint(x: x - facing * jolt + facing * lurch, y: position.y + lift)
        shadow.position = CGPoint(x: 0, y: -lift)
        shadow.alpha = 0.6 * max(0.25, 1 - lift / (ronin * 1.2))
        glint.position.x = facing * height * 0.07

        var frame = shown
        var leanTarget: CGFloat = holding ? lean : 0
        var gathering: CGFloat = 0
        if !holding {
            switch foe.phase {
            case .advancing, .fleeing:
                let walking = dt > 0 && moved > 0.04
                if foe.bearer, foe.phase == .advancing, foe.darting {
                    // The dart: in at a rush, low over his weapon, gathered to strike.
                    frame = .windup(0)
                    leanTarget = 0.16
                    gathering = 1
                } else if foe.bearer, foe.phase == .advancing, !walking, foe.hover < 0.12 {
                    // About to go (or poised, waiting for his way in to clear): he crouches over his weapon and
                    // leans in, and the gourd flares.
                    frame = .windup(0)
                    leanTarget = 0.07
                    gathering = 1
                } else if dt == 0 {
                    frame = shown
                } else if walking {
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
                if strikeClock < 0.09 {
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
                // The gourd-bearer springs back out of reach, rocked back by the cut; the rest somersault over.
                frame = foe.bearer ? .stagger(flight < 0.55 ? 0 : 1) : .leap
            case .dying:
                // (Never drawn: the scene lets the dead go before they get here.)
                frame = .stagger(0)
            }
        }
        if !has(frame) { frame = .idle(0) }
        if frame != shown { changePose(to: frame) }
        if echo.alpha > 0 { echo.alpha = max(0, echo.alpha - CGFloat(dt) / 0.1 * 0.5) }
        if wasLeaping, !leaping, !holding { squash = 0.16 }
        if !holding { wasLeaping = leaping }

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

        if leaping {
            if foe.bearer {
                pivot.zRotation = facing * 0.4 * CGFloat(sin(flight * .pi))
            } else {
                pivot.zRotation = -CGFloat(flight) * 2 * .pi * (foe.leapTo > 0 ? 1 : -1)
            }
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
            tint(.white, CGFloat(hitFlash / 0.14) * 0.85)
        } else if charging {
            tint(Palette.blood, (0.12 + 0.5 * t * t) * (kind == .archer ? 0.6 : 1))
        } else {
            tint(Palette.blood, 0)
        }
        glint.alpha = charging ? 0.25 + 0.75 * t : 0
        glint.setScale(charging ? 0.6 + 0.5 * t + 0.12 * CGFloat(sin(foe.timer * 40)) : 1)
        warning.isHidden = foe.phase != .windup
        if foe.phase == .windup {
            // The ring redrawn only as it runs down a step (sixtieths of the way round).
            let step = Int(((1 - t) * 60).rounded(.up))
            if step != ringStep {
                ringStep = step
                let ring = CGMutablePath()
                ring.addArc(center: .zero, radius: FoeSprite.markerRadius(ronin: ronin), startAngle: .pi / 2,
                            endAngle: .pi / 2 + CGFloat(step) / 60 * 2 * .pi, clockwise: false)
                warningRing.path = ring
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
        // (a gourd-bearer's sit under his gourd, clear of it, and show just when he has to be caught).
        if !holding {
            if foe.hp != pipsShown {
                pipsShown = foe.hp
                let left = Build.of(cast).accent.mix(.white, 0.35).color(), spent = SKColor(white: 1, alpha: 0.15)
                for (k, pip) in pips.enumerated() { pip.fillColor = k < foe.hp ? left : spent }
            }
            let hidden = leaping || foe.phase == .windup && gourd == nil
            for pip in pips { pip.isHidden = hidden }
        }
    }

    /// The fastest the fight moves him along the lane by walking, in lane units a second: the gourd-bearer's dart, a
    /// warlord's fury, a man backing off from one who landed in front of him.
    private static func fastest(_ foe: Foe) -> CGFloat {
        CGFloat(foe.bearer ? foe.speed * 5 : max(foe.speed * 1.5, 0.6))
    }

    /// Tints him, unless he already is (every tint sets the shader's attribute afresh).
    private func tint(_ color: RGB, _ amount: CGFloat) {
        if let tinted, tinted.color == color, tinted.amount == amount { return }
        tinted = (color, amount)
        Art.setTint(body, color, amount)
    }

    private func has(_ frame: Frame) -> Bool { Figures.has(cast, frame) }

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

    // MARK: What happens to him

    /// The blow: a lurch forward behind it.
    func showStrike() {
        strikeClock = 0
        lurch = ronin * (kind == .brute || kind == .warlord ? 0.09 : 0.06)
        if kind == .brute { squash = 0.08 }
    }

    func showStagger() { staggerHold = 0.3 }

    /// A cut that wounds him is on its way (it lands `seconds` from now, when the drawn blade gets there): until it
    /// does (`flashHit`) he is held as he stands, in his pose, with his pips, and the knock-back, leap or spring the
    /// fight has already sent him into starts then.
    func hold(_ seconds: Double) {
        holding = true
        holdLeft = seconds + 0.05
        lagged = true
    }

    /// The instant of a killing blow: thrown into the pose the blow throws him into (`Figures.struck`, variant 0 his
    /// stagger) and lit white, held there until the blade arrives: upright, unsquashed, whole (not fading in), turned
    /// to the ronin who struck him (even in the air, or running off), with nothing of the pose before it behind him.
    /// The carnage lets him fall from the very same pose (`Carnage.sever` with the same variant, or `fell` from
    /// `Figure.struck(cast, variant:)`), where he stands and facing the ronin, so his body, his head and his weapon
    /// leave the frozen figure without a jump.
    func freezeStruck(variant: Int = 0) {
        freeze(Figures.struck(cast, variant: variant))
    }

    /// The same, in a struck pose drawn for the purpose (`Figures.struck`; nil is variant 0).
    func freezeStruck(_ piece: Figures.Piece?) {
        freeze(piece ?? Figures.struck(cast, variant: 0))
    }

    private func freeze(_ piece: Figures.Piece) {
        holding = false
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
        tint(.white, 0.9)
        warning.isHidden = true
        sight.alpha = 0
        glint.alpha = 0
        ward.alpha = 0
    }

    /// The blade lands on him: a white flash and a jolt back (and whatever a held blow was keeping from him starts).
    func flashHit() {
        holding = false
        hitFlash = 0.14
        jolt = ronin * 0.08
        squash = 0.09
    }

    /// The wound a cut leaves across him, laid along the cut at the height it went in (a share of his height: a
    /// shin cut low, a head cut high), shorter across the legs: raw red, fading.
    func gash(_ tilt: CGFloat, at level: CGFloat = 0.56) {
        let cut = SKSpriteNode(texture: Art.streak)
        cut.size = CGSize(width: height * (level < 0.4 ? 0.36 : 0.6), height: max(2, height * 0.04))
        // On the pivot, which is at his middle, so a leap carries it with him.
        cut.position = CGPoint(x: 0, y: height * (level - 0.5))
        cut.xScale = facing
        cut.zRotation = tilt * facing
        cut.color = Palette.blood.mix(.white, 0.1).color()
        cut.colorBlendFactor = 1
        cut.zPosition = 1
        pivot.addChild(cut)
        cut.run(.sequence([.wait(forDuration: 0.3), .fadeOut(withDuration: 0.45), .removeFromParent()]))
    }

    /// A cut met his guard. Set, the blade rings off it and the warlord rocks but holds; still coming up, it
    /// glances off and the guard goes on up. `glanced` says which (when nil, whether the guard was set when he was
    /// last drawn).
    func showParry(glanced: Bool? = nil) {
        if glanced ?? !wardSet {
            jolt = ronin * 0.045
            ward.alpha = max(ward.alpha, 0.55)
        } else {
            jolt = ronin * 0.03
            ward.alpha = 1
        }
    }
}

/// The ronin, who is the show: the iai stance at the start of a stage with his blade sheathed, and the draw-cut out
/// of it; a breathing chūdan guard with his ribbons and coat stirring, and when he is down to his last hearts, or
/// shaken by a blow, a miss or a parried cut, a guard that heaves, clutches at its wound (only if he has one) and
/// sags at the knees, begun each time on a fresh breath; cuts on a darting lunge that stretches him into the blow,
/// the next cut swung from where the last one planted him, and a step back into guard a foot at a time;
/// afterimages when he closes a long gap; a ghost of his old stance when he turns; a stumble, a parried cut, and a
/// wound taken three ways, turned to face whoever dealt it so it drives him away from them (before the draw, rocked
/// back where he stands with his hand on the hilt); and at the end of a stage either the stage's last cut played out
/// into the chiburi and the slow slide of the blade home, or the fall: to one knee over his sword, then pitching
/// forward onto his face (the blade still in its scabbard if he never drew it).
///
/// His feet keep to the ground: he moves along the lane only in the blur of a lunge or a blow, or as a foot is
/// lifted and carried, the other kept where it stands.
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
    private var gore: CGFloat = 0
    /// The tint on him, as last set.
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
        tint(Palette.blood, 0)
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
        gore = 0
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
        echo.alpha = 0.45
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
        if abs(away) > ronin * 0.01 {
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
        // The flourish's moments: the blood flung off the blade as the chiburi snaps down, the blade home at the end.
        if act == .flourishing {
            if b.frame == .flourish(3), gore > 0 { chiburi() }
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

    func bloodied(_ amount: CGFloat) { gore = min(0.14, gore + amount) }

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
        let spray = Art.burst(Palette.blood.mix(.black, 0.2), count: Int(20 + gore * 60), speed: ronin * 2.2, size: ronin * 0.05, life: 0.45,
                              spread: 0.5, angle: sign > 0 ? -0.35 : .pi + 0.35, gravity: ronin * 7, additive: false)
        spray.position = CGPoint(x: home.x + offset + sign * ronin * 0.45, y: home.y + ronin * 0.42)
        parent.addChild(spray)
        gore = 0
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
    /// the knees giving more often on the last heart, and a hand pressed to his side only when he is bleeding.
    private var stance: (frame: Frame, sheathed: Bool) {
        guard strain > 0 || shaken > 0 else {
            return sheathed ? (.iai(Int(breath * 5) % Frame.iaiFrames), false) : (.idle(Int(breath * 8) % Frame.heroIdleFrames), false)
        }
        let round = Int(gasp) / Frame.windedFrames
        if round != gasps || (strain == 0 && (cycle == 2 || (!bled && cycle != 0))) {
            gasps = round
            let weights: [Double] = strain > 1 ? [0.3, 0.35, cycle == 2 ? 0.1 : 0.35]
                : strain == 1 ? [0.45, 0.4, cycle == 2 ? 0.05 : 0.15] : bled ? [0.6, 0.4, 0] : [1, 0, 0]
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

    /// Tints him, unless he already is (every tint sets the shader's attribute afresh).
    private func tint(_ color: RGB, _ amount: CGFloat) {
        if let tinted, tinted.color == color, tinted.amount == amount { return }
        tinted = (color, amount)
        Art.setTint(body, color, amount)
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
        // A wound flushes him red; the blood of the stage darkens him, a deep wet red rather than a bright one.
        if flush > gore { tint(Palette.blood, flush) } else { tint(Palette.blood.mix(.black, 0.55), gore) }
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
