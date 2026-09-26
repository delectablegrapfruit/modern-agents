import AppKit
import SpriteKit
import RoninCore

/// Everyone on the lane is a silhouette posed from a small skeleton and drawn once, frame by frame, into textures.
/// The shapes are built to read at 60 points tall: wide hakama, big hats and crests, long weapons, a banner on the
/// warlord's back, each kind with its own outline, a spot of colour for eyes and cloth, and a faint rim of light so a
/// black figure still reads against dark ground.
enum Cast: Hashable {
    case hero
    case foe(Kind)
}

enum Frame: Hashable {
    /// Standing, breathing (the ronin: 4 frames, with his headband tails streaming; foes: 2).
    case idle(Int)
    /// 6 frames a stride.
    case walk(Int)
    /// Raising the weapon (0), raised (1).
    case windup(Int)
    case strike, stagger, leap, aim, loose
    /// The ronin's cuts: style 0 (level), 1 (rising), 2 (falling); phase 0 is the blur of the swing, 1 the follow-through.
    case cut(Int, Int)
    case stumble, hurt, victory, fallen

    static let walkFrames = 6
}

/// A pose, as angles. Limb angles are measured from straight down: +π/2 points forward (the way the figure faces),
/// π straight up, −π/2 back.
struct Pose {
    var lean: CGFloat = 0.08
    var lift: CGFloat = 0
    var shift: CGFloat = 0
    var front: (thigh: CGFloat, shin: CGFloat) = (0.38, 0.1)
    var back: (thigh: CGFloat, shin: CGFloat) = (-0.38, -0.28)
    var arm: (upper: CGFloat, fore: CGFloat) = (0.6, 1.3)
    var arm2: (upper: CGFloat, fore: CGFloat) = (0.4, 1.2)
    var blade: CGFloat = 2.0
    var blade2: CGFloat = -2.2
    /// How far a bow is drawn, 0…1.
    var draw: CGFloat = 0
    var tilt: CGFloat = 0
    /// In the air: the hips stay put instead of the lower foot finding the ground.
    var airborne = false
    /// Where cloth (headband tails, scarves, banners) is in its flutter, 0…1.
    var wave: CGFloat = 0
    /// A blade's sweep drawn as a blur, from one angle to another.
    var smear: (from: CGFloat, to: CGFloat, strength: CGFloat)?

    static func mix(_ a: Pose, _ b: Pose, _ t: CGFloat) -> Pose {
        func m(_ x: CGFloat, _ y: CGFloat) -> CGFloat { x + (y - x) * t }
        var p = b
        p.lean = m(a.lean, b.lean)
        p.lift = m(a.lift, b.lift)
        p.shift = m(a.shift, b.shift)
        p.front = (m(a.front.thigh, b.front.thigh), m(a.front.shin, b.front.shin))
        p.back = (m(a.back.thigh, b.back.thigh), m(a.back.shin, b.back.shin))
        p.arm = (m(a.arm.upper, b.arm.upper), m(a.arm.fore, b.arm.fore))
        p.arm2 = (m(a.arm2.upper, b.arm2.upper), m(a.arm2.fore, b.arm2.fore))
        p.blade = m(a.blade, b.blade)
        p.blade2 = m(a.blade2, b.blade2)
        p.draw = m(a.draw, b.draw)
        p.tilt = m(a.tilt, b.tilt)
        return p
    }
}

struct Build {
    enum Weapon { case katana, spear, knife, club, twin, bow, nodachi }
    enum Gear { case topknot, jingasa, hood, horns, ponytail, cowl, kabuto }
    enum Legs { case hakama, leggings, bare }
    enum Back { case none, quiver, banner }

    /// Height relative to the ronin's.
    var height: CGFloat
    /// Upper-arm thickness, as a share of the height.
    var limb: CGFloat = 0.058
    var shoulders: CGFloat = 0.2
    var waist: CGFloat = 0.13
    var head: CGFloat = 0.07
    var legs = Legs.hakama
    var sleeves = false
    /// A kimono skirt (or armoured tassets) hanging from the waist, as a share of the height.
    var skirt: CGFloat = 0
    var weapon: Weapon
    var gear: Gear
    var back = Back.none
    var eyes: RGB?
    var accent: RGB
    var stride: CGFloat = 1

    static func of(_ cast: Cast) -> Build {
        switch cast {
        case .hero:
            return Build(height: 1, sleeves: true, weapon: .katana, gear: .topknot, eyes: nil, accent: Palette.blood)
        case .foe(let kind):
            switch kind {
            case .grunt:
                return Build(height: 0.95, legs: .leggings, skirt: 0.16, weapon: .spear, gear: .jingasa,
                             eyes: RGB(1, 0.22, 0.12), accent: RGB(0.75, 0.12, 0.1))
            case .runner:
                return Build(height: 0.86, limb: 0.05, shoulders: 0.17, waist: 0.11, legs: .leggings, weapon: .knife, gear: .hood,
                             eyes: RGB(1, 0.6, 0.12), accent: RGB(1, 0.5, 0.1), stride: 1.3)
            case .brute:
                return Build(height: 1.2, limb: 0.09, shoulders: 0.34, waist: 0.2, head: 0.068, legs: .bare, skirt: 0.1,
                             weapon: .club, gear: .horns, eyes: RGB(1, 0.2, 0.1), accent: RGB(0.72, 0.32, 1.0), stride: 0.8)
            case .dancer:
                return Build(height: 0.95, limb: 0.05, shoulders: 0.17, waist: 0.11, weapon: .twin, gear: .ponytail,
                             eyes: RGB(0.3, 0.95, 1.0), accent: RGB(0.25, 0.9, 1.0), stride: 1.1)
            case .archer:
                return Build(height: 0.94, sleeves: true, weapon: .bow, gear: .cowl, back: .quiver, eyes: RGB(0.6, 1.0, 0.3),
                             accent: RGB(0.5, 0.9, 0.3))
            case .warlord:
                return Build(height: 1.3, limb: 0.07, shoulders: 0.27, waist: 0.17, head: 0.07, sleeves: true, skirt: 0.2,
                             weapon: .nodachi, gear: .kabuto, back: .banner, eyes: RGB(1, 0.78, 0.2), accent: Palette.gold, stride: 0.85)
            }
        }
    }
}

@MainActor
enum Figures {
    /// Texture pixels for a figure one ronin tall.
    static let pixelHeight: CGFloat = 150
    /// The canvas around a figure, in figure heights, and where its feet stand on it.
    static let canvas = CGSize(width: 2.4, height: 1.62)
    static let feet = CGPoint(x: 1.2, y: 0.12)
    static var anchor: CGPoint { CGPoint(x: feet.x / canvas.width, y: feet.y / canvas.height) }

    private static var cache: [Cast: [Frame: SKTexture]] = [:]

    static func texture(_ cast: Cast, _ frame: Frame) -> SKTexture {
        if let texture = cache[cast]?[frame] { return texture }
        let texture = render(pose(cast, frame), Build.of(cast))
        cache[cast, default: [:]][frame] = texture
        return texture
    }

    /// Draws every frame now, so the first fight doesn't stutter.
    static func preload() {
        let casts: [Cast] = [.hero] + Kind.allCases.map { .foe($0) }
        for cast in casts {
            for frame in frames(for: cast) { _ = texture(cast, frame) }
        }
    }

    static func frames(for cast: Cast) -> [Frame] {
        switch cast {
        case .hero:
            var frames: [Frame] = (0..<4).map { .idle($0) }
            for style in 0..<3 { frames += [.cut(style, 0), .cut(style, 1)] }
            return frames + [.stumble, .hurt, .victory, .fallen]
        case .foe(let kind):
            var frames: [Frame] = (0..<Frame.walkFrames).map { .walk($0) } + [.idle(0), .idle(1), .windup(0), .windup(1), .strike, .stagger]
            if kind == .dancer || kind == .warlord { frames.append(.leap) }
            if kind == .archer { frames += [.aim, .loose] }
            return frames
        }
    }

    static func has(_ cast: Cast, _ frame: Frame) -> Bool { frames(for: cast).contains(frame) }

    /// A figure's size on screen for a ronin `height` points tall.
    static func size(_ cast: Cast, ronin height: CGFloat) -> CGSize {
        let h = height * Build.of(cast).height
        return CGSize(width: canvas.width * h, height: canvas.height * h)
    }

    // MARK: Poses

    static func pose(_ cast: Cast, _ frame: Frame) -> Pose {
        let build = Build.of(cast)
        let base = stance(cast)
        switch frame {
        case .idle(let k):
            var p = base
            let breath = CGFloat(k % 2)
            p.lean += 0.02 * breath
            p.front.shin += 0.04 * breath
            p.back.shin -= 0.04 * breath
            p.arm.upper += 0.03 * breath
            p.wave = CGFloat(k) / 4
            return p
        case .walk(let k):
            var p = base
            let phase = CGFloat(k) / CGFloat(Frame.walkFrames) * 2 * .pi
            func leg(_ phi: CGFloat) -> (thigh: CGFloat, shin: CGFloat) {
                let thigh = 0.44 * build.stride * sin(phi)
                return (thigh, thigh - 0.62 * build.stride * max(0, -cos(phi)) + 0.08)
            }
            p.front = leg(phase)
            p.back = leg(phase + .pi)
            p.wave = CGFloat(k) / CGFloat(Frame.walkFrames)
            // The free arm swings against the legs.
            if cast == .foe(.dancer) || cast == .foe(.runner) { p.arm2.upper += 0.35 * sin(phase) }
            if cast == .foe(.archer) { p.arm.upper = 0.25 - 0.3 * sin(phase) }
            return p
        case .windup(let k):
            let raised = key(cast, .windup(1))
            return k == 0 ? Pose.mix(base, raised, 0.55) : raised
        case .cut(let style, let phase):
            return cut(style, phase)
        default:
            return key(cast, frame)
        }
    }

    /// The pose each figure stands in.
    private static func stance(_ cast: Cast) -> Pose {
        var p = Pose()
        switch cast {
        case .hero:
            p.lean = 0.1
            p.front = (0.45, 0.12)
            p.back = (-0.45, -0.32)
            p.arm = (0.75, 1.45)
            p.arm2 = (0.55, 1.35)
            p.blade = 2.1
        case .foe(let kind):
            switch kind {
            case .grunt:
                p.arm = (0.95, 1.35)
                p.arm2 = (0.5, 1.25)
                p.blade = 1.5
            case .runner:
                p.lean = 0.4
                p.front = (0.55, 0.2)
                p.back = (-0.5, -0.55)
                p.arm = (0.9, 1.7)
                p.arm2 = (-0.6, -0.2)
                p.blade = 0.9
            case .brute:
                p.lean = 0.14
                p.front = (0.35, 0.12)
                p.back = (-0.35, -0.25)
                p.arm = (0.25, 2.3)
                p.arm2 = (0.55, 1.2)
                p.blade = -2.6
            case .dancer:
                p.lean = 0.16
                p.arm = (1.0, 1.6)
                p.arm2 = (-0.7, -0.3)
                p.blade = 2.3
                p.blade2 = -2.3
            case .archer:
                p.arm = (0.25, 0.35)
                p.arm2 = (0.1, 0.3)
            case .warlord:
                p.lean = 0.1
                p.arm = (0.85, 1.7)
                p.arm2 = (0.65, 1.6)
                p.blade = 2.35
            }
        }
        return p
    }

    private static func lunge(_ p: inout Pose, _ lean: CGFloat) {
        p.lean = lean
        p.shift = 0.04
        p.front = (0.9, 0.35)
        p.back = (-0.7, -0.9)
    }

    /// Key poses: the raised weapon, the blow, the stagger, the leap, the bow.
    private static func key(_ cast: Cast, _ frame: Frame) -> Pose {
        var p = stance(cast)
        if frame == .stagger || frame == .hurt {
            p.lean = -0.34
            p.shift = -0.03
            p.front = (0.38, 0.1)
            p.back = (-0.22, -0.42)
            p.arm2 = (-0.8, -0.3)
            p.tilt = -0.35
        }
        switch cast {
        case .hero:
            switch frame {
            case .stumble:
                p.lean = 0.58
                p.shift = 0.05
                p.front = (1.0, 0.8)
                p.back = (-0.12, -0.9)
                p.arm = (1.0, 0.7)
                p.arm2 = (-1.7, -1.1)
                p.blade = 0.45
                p.tilt = 0.35
            case .hurt:
                p.arm = (0.4, 1.0)
                p.blade = 1.3
            case .victory:
                p.lean = 0
                p.front = (0.22, 0)
                p.back = (-0.22, -0.05)
                p.arm = (2.95, 3.1)
                p.arm2 = (-0.25, 0.05)
                p.blade = 3.12
                p.tilt = 0.15
                p.wave = 0.5
            case .fallen:
                p.lean = 0.55
                p.front = (1.5, 0.1)
                p.back = (-0.5, -1.55)
                p.arm = (0.5, 0.25)
                p.arm2 = (0.2, 0.35)
                p.blade = 0.1
                p.tilt = 0.55
            default:
                break
            }
        case .foe(let kind):
            switch (kind, frame) {
            case (.grunt, .windup(_)):
                p.lean = -0.06
                p.shift = -0.03
                p.arm = (0.2, 1.0)
                p.arm2 = (-0.45, 0.8)
                p.blade = 1.64
            case (.grunt, .strike):
                lunge(&p, 0.3)
                p.arm = (1.45, 1.55)
                p.arm2 = (1.1, 1.5)
                p.blade = 1.57
            case (.runner, .windup(_)):
                p.lean = 0.2
                p.arm = (2.5, 2.9)
                p.blade = 3.0
            case (.runner, .strike):
                lunge(&p, 0.5)
                p.arm = (1.3, 1.2)
                p.blade = 1.0
            case (.brute, .windup(_)):
                p.lean = -0.12
                p.arm = (2.85, 3.0)
                p.arm2 = (2.6, 2.9)
                p.blade = 3.2
            case (.brute, .strike):
                lunge(&p, 0.38)
                p.arm = (1.4, 1.6)
                p.arm2 = (1.2, 1.5)
                p.blade = 1.75
            case (.brute, .stagger):
                p.arm = (0.3, 2.0)
                p.blade = -2.2
            case (.dancer, .windup(_)):
                p.arm = (2.6, 2.9)
                p.arm2 = (2.2, 2.7)
                p.blade = 2.6
                p.blade2 = 2.9
            case (.dancer, .strike):
                lunge(&p, 0.36)
                p.arm = (1.5, 1.6)
                p.arm2 = (1.1, 1.3)
                p.blade = 1.5
                p.blade2 = 1.2
            case (.dancer, .leap), (.warlord, .leap):
                p.airborne = true
                p.lean = 0.3
                p.front = (1.8, 0.3)
                p.back = (1.3, -0.2)
                p.arm = kind == .dancer ? (1.8, 2.2) : (2.4, 2.8)
                p.arm2 = kind == .dancer ? (-1.8, -2.2) : (2.2, 2.7)
                p.blade = kind == .dancer ? 2.8 : 3.6
                p.blade2 = -2.8
                p.wave = 0.75
            case (.archer, .aim), (.archer, .windup(_)):
                p.front = (0.38, 0.1)
                p.back = (-0.42, -0.3)
                p.lean = 0.02
                p.arm = (1.55, 1.55)
                p.arm2 = (-1.45, 1.6)
                p.draw = 1
            case (.archer, .loose), (.archer, .strike):
                p.front = (0.38, 0.1)
                p.back = (-0.42, -0.3)
                p.lean = 0.02
                p.arm = (1.55, 1.55)
                p.arm2 = (-1.3, -1.0)
            case (.warlord, .windup(_)):
                p.lean = -0.08
                p.arm = (2.9, 3.3)
                p.arm2 = (2.7, 3.2)
                p.blade = 3.9
            case (.warlord, .strike):
                lunge(&p, 0.36)
                p.arm = (1.5, 1.7)
                p.arm2 = (1.3, 1.6)
                p.blade = 1.55
            case (.warlord, .stagger):
                p.arm = (0.6, 1.2)
                p.arm2 = (0.4, 1.1)
                p.blade = 1.9
            case (_, .stagger):
                p.arm = (0.3, 0.7)
                p.blade += 0.6
            default:
                break
            }
        }
        return p
    }

    /// The ronin's three cuts, each a blur of the swing and then its follow-through.
    private static func cut(_ style: Int, _ phase: Int) -> Pose {
        var p = stance(.hero)
        lunge(&p, 0.28)
        p.wave = phase == 0 ? 0.3 : 0.6
        switch (style, phase) {
        case (0, 0):
            p.lean = 0.2
            p.arm = (1.8, 2.0)
            p.arm2 = (1.6, 1.9)
            p.blade = 2.0
            p.smear = (2.75, 1.95, 1)
        case (0, _):
            p.lean = 0.32
            p.arm = (1.55, 1.6)
            p.arm2 = (1.35, 1.55)
            p.blade = 1.68
            p.smear = (2.1, 1.7, 0.45)
        case (1, 0):
            p.lean = 0.24
            p.arm = (1.85, 2.2)
            p.arm2 = (1.7, 2.1)
            p.blade = 2.25
            p.smear = (1.0, 2.2, 1)
        case (1, _):
            p.lean = 0.18
            p.arm = (2.3, 2.6)
            p.arm2 = (2.1, 2.5)
            p.blade = 2.85
            p.smear = (2.3, 2.8, 0.45)
        case (2, 0):
            p.lean = 0.3
            p.arm = (1.75, 1.85)
            p.arm2 = (1.6, 1.8)
            p.blade = 1.7
            p.smear = (3.05, 1.75, 1)
        default:
            p.lean = 0.44
            p.front = (0.95, 0.45)
            p.arm = (1.2, 1.1)
            p.arm2 = (1.0, 1.0)
            p.blade = 0.85
            p.smear = (1.4, 0.9, 0.45)
        }
        return p
    }

    // MARK: Drawing

    private static func dir(_ a: CGFloat) -> CGPoint { CGPoint(x: sin(a), y: -cos(a)) }

    private static func at(_ p: CGPoint, _ d: CGPoint, _ length: CGFloat) -> CGPoint {
        CGPoint(x: p.x + d.x * length, y: p.y + d.y * length)
    }

    /// A tapered limb: a quad between two circles.
    private static func capsule(_ ctx: CGContext, _ a: CGPoint, _ b: CGPoint, _ wa: CGFloat, _ wb: CGFloat) {
        let dx = b.x - a.x, dy = b.y - a.y
        let length = max(0.001, hypot(dx, dy))
        let n = CGPoint(x: -dy / length, y: dx / length)
        ctx.move(to: at(a, n, wa / 2))
        ctx.addLine(to: at(b, n, wb / 2))
        ctx.addLine(to: at(b, n, -wb / 2))
        ctx.addLine(to: at(a, n, -wa / 2))
        ctx.closePath()
        ctx.fillPath()
        ctx.fillEllipse(in: CGRect(x: a.x - wa / 2, y: a.y - wa / 2, width: wa, height: wa))
        ctx.fillEllipse(in: CGRect(x: b.x - wb / 2, y: b.y - wb / 2, width: wb, height: wb))
    }

    private static func render(_ pose: Pose, _ build: Build) -> SKTexture {
        let H = pixelHeight * build.height
        let w = Int((canvas.width * H).rounded()), h = Int((canvas.height * H).rounded())
        guard let ctx = Art.bitmap(w, h) else { return SKTexture() }
        ctx.setLineCap(.round)
        ctx.setLineJoin(.round)
        // A faint rim of light around the whole figure: it keeps a black shape readable over dark ground.
        ctx.setShadow(offset: .zero, blur: max(2, H * 0.022), color: CGColor(red: 1, green: 0.9, blue: 0.8, alpha: 0.5))
        ctx.beginTransparencyLayer(auxiliaryInfo: nil)
        draw(ctx, pose, build, H)
        ctx.endTransparencyLayer()
        if let smear = pose.smear { drawSmear(ctx, pose, build, H, smear) }
        return Art.texture(ctx)
    }

    private struct Joints {
        var hip = CGPoint.zero, neck = CGPoint.zero, shoulder = CGPoint.zero, head = CGPoint.zero
        var up = CGPoint.zero, across = CGPoint.zero, face = CGPoint.zero, headUp = CGPoint.zero
    }

    private static func joints(_ pose: Pose, _ H: CGFloat) -> Joints {
        var j = Joints()
        let thigh = 0.25 * H, shin = 0.25 * H, torso = 0.29 * H
        let ground = feet.y * H
        let dropFront = thigh * cos(pose.front.thigh) + shin * cos(pose.front.shin)
        let dropBack = thigh * cos(pose.back.thigh) + shin * cos(pose.back.shin)
        let hipY = pose.airborne ? ground + 0.42 * H : ground + max(dropFront, dropBack) + 0.02 * H + pose.lift * H
        j.hip = CGPoint(x: feet.x * H + pose.shift * H, y: hipY)
        j.up = CGPoint(x: sin(pose.lean), y: cos(pose.lean))
        j.across = CGPoint(x: cos(pose.lean), y: -sin(pose.lean))
        j.neck = at(j.hip, j.up, torso)
        j.shoulder = at(j.neck, j.up, -0.04 * H)
        j.headUp = CGPoint(x: sin(pose.lean + pose.tilt), y: cos(pose.lean + pose.tilt))
        j.face = CGPoint(x: cos(pose.lean + pose.tilt), y: -sin(pose.lean + pose.tilt))
        return j
    }

    private static func armEnds(_ j: Joints, _ angles: (upper: CGFloat, fore: CGFloat), _ H: CGFloat) -> (elbow: CGPoint, hand: CGPoint) {
        let elbow = at(j.shoulder, dir(angles.upper), 0.16 * H)
        return (elbow, at(elbow, dir(angles.fore), 0.15 * H))
    }

    private static func draw(_ ctx: CGContext, _ pose: Pose, _ build: Build, _ H: CGFloat) {
        let body = Palette.silhouette.cg(), shade = Palette.shade.cg()
        let j = joints(pose, H)
        let thigh = 0.25 * H, shin = 0.25 * H
        let r = build.head * H

        func leg(_ angles: (thigh: CGFloat, shin: CGFloat), _ color: CGColor) {
            let knee = at(j.hip, dir(angles.thigh), thigh)
            let ankle = at(knee, dir(angles.shin), shin)
            ctx.setFillColor(color)
            switch build.legs {
            case .hakama:
                // Wide pleated trousers, flaring at the hem.
                capsule(ctx, j.hip, knee, 0.15 * H, 0.13 * H)
                capsule(ctx, knee, at(ankle, dir(angles.shin), -0.02 * H), 0.12 * H, 0.155 * H)
            case .leggings:
                capsule(ctx, j.hip, knee, 0.1 * H, 0.075 * H)
                capsule(ctx, knee, ankle, 0.07 * H, 0.052 * H)
            case .bare:
                capsule(ctx, j.hip, knee, 0.14 * H, 0.11 * H)
                capsule(ctx, knee, ankle, 0.11 * H, 0.08 * H)
            }
            // A foot, toes forward.
            ctx.move(to: at(ankle, CGPoint(x: 0, y: 1), 0.02 * H))
            ctx.addLine(to: at(at(ankle, CGPoint(x: 1, y: 0), 0.075 * H), CGPoint(x: 0, y: 1), -0.012 * H))
            ctx.addLine(to: at(at(ankle, CGPoint(x: 1, y: 0), 0.075 * H), CGPoint(x: 0, y: 1), -0.03 * H))
            ctx.addLine(to: at(at(ankle, CGPoint(x: -1, y: 0), 0.025 * H), CGPoint(x: 0, y: 1), -0.03 * H))
            ctx.closePath()
            ctx.fillPath()
        }

        func arm(_ angles: (upper: CGFloat, fore: CGFloat), _ color: CGColor) -> CGPoint {
            let (elbow, hand) = armEnds(j, angles, H)
            ctx.setFillColor(color)
            capsule(ctx, j.shoulder, elbow, build.limb * H, build.limb * H * 0.85)
            capsule(ctx, elbow, hand, build.limb * H * 0.8, build.limb * H * 0.62)
            ctx.fillEllipse(in: CGRect(x: hand.x - 0.028 * H, y: hand.y - 0.028 * H, width: 0.056 * H, height: 0.056 * H))
            if build.sleeves {
                // A kimono sleeve hanging from the upper arm.
                let d = dir(angles.upper)
                let down = CGPoint(x: 0, y: -1)
                ctx.move(to: at(j.shoulder, d, 0.02 * H))
                ctx.addLine(to: at(elbow, d, 0.01 * H))
                ctx.addLine(to: at(at(elbow, d, -0.01 * H), down, 0.07 * H))
                ctx.addLine(to: at(at(j.shoulder, d, 0.07 * H), down, 0.06 * H))
                ctx.closePath()
                ctx.fillPath()
            }
            return hand
        }

        // Behind the body: what's carried on the back.
        backGear(ctx, build, j, pose, H)

        // The far side first, in a lighter shade, so the figure reads in depth.
        leg(pose.back, shade)
        var backHand = CGPoint.zero
        if build.weapon != .bow || pose.draw == 0 { backHand = arm(pose.arm2, shade) }

        // Torso: a broad chest, a narrower waist.
        let hw = build.waist * H / 2, sw = build.shoulders * H / 2
        ctx.setFillColor(body)
        ctx.move(to: at(j.hip, j.across, -hw))
        ctx.addLine(to: at(j.hip, j.across, hw))
        ctx.addLine(to: at(at(j.shoulder, j.across, sw * 0.95), j.up, -0.02 * H))
        ctx.addLine(to: at(at(j.shoulder, j.across, sw * 0.7), j.up, 0.035 * H))
        ctx.addLine(to: at(at(j.shoulder, j.across, -sw * 0.7), j.up, 0.035 * H))
        ctx.addLine(to: at(at(j.shoulder, j.across, -sw * 0.95), j.up, -0.02 * H))
        ctx.closePath()
        ctx.fillPath()
        if build.legs == .hakama {
            // The hakama's seat, joining the two legs under the waist.
            let front = at(j.hip, dir(pose.front.thigh), thigh * 0.55), back = at(j.hip, dir(pose.back.thigh), thigh * 0.55)
            ctx.move(to: at(j.hip, j.across, -hw * 1.1))
            ctx.addLine(to: at(j.hip, j.across, hw * 1.1))
            ctx.addLine(to: at(front, j.across, 0.06 * H))
            ctx.addLine(to: at(back, j.across, -0.06 * H))
            ctx.closePath()
            ctx.fillPath()
        }
        if build.skirt > 0 {
            // A short kimono (or armoured tassets) flaring over the thighs.
            let hem = at(j.hip, CGPoint(x: 0, y: -1), build.skirt * H)
            ctx.move(to: at(at(j.hip, j.up, 0.03 * H), j.across, -hw * 1.1))
            ctx.addLine(to: at(at(j.hip, j.up, 0.03 * H), j.across, hw * 1.1))
            ctx.addLine(to: CGPoint(x: hem.x + hw * 1.9, y: hem.y))
            ctx.addLine(to: CGPoint(x: hem.x - hw * 1.9, y: hem.y))
            ctx.closePath()
            ctx.fillPath()
        }
        // The sash.
        let sash = at(j.hip, j.up, 0.045 * H)
        ctx.setStrokeColor(build.accent.scaled(0.7).cg())
        ctx.setLineWidth(0.035 * H)
        ctx.setLineCap(.butt)
        ctx.move(to: at(sash, j.across, -hw * 1.08))
        ctx.addLine(to: at(sash, j.across, hw * 1.08))
        ctx.strokePath()
        ctx.setLineCap(.round)
        if build.gear == .kabuto {
            // Shoulder plates.
            for s in [CGFloat(1), -1] {
                let plate = at(at(j.shoulder, j.across, s * sw * 0.8), j.up, -0.02 * H)
                ctx.setFillColor(body)
                ctx.fill(CGRect(x: plate.x - 0.07 * H, y: plate.y - 0.08 * H, width: 0.14 * H, height: 0.1 * H))
            }
        }

        // Head.
        let head = at(j.neck, j.headUp, r * 1.08)
        ctx.setFillColor(body)
        capsule(ctx, j.neck, head, 0.055 * H, 0.055 * H)
        ctx.fillEllipse(in: CGRect(x: head.x - r, y: head.y - r, width: 2 * r, height: 2 * r))
        headGear(ctx, build, head, r, j.headUp, j.face, pose.wave, H)
        if let eyes = build.eyes {
            let eye = at(at(head, j.face, r * 0.52), j.headUp, r * 0.1)
            ctx.setFillColor(eyes.cg())
            ctx.fillEllipse(in: CGRect(x: eye.x - r * 0.26, y: eye.y - r * 0.13, width: r * 0.52, height: r * 0.26))
        }

        leg(pose.front, body)
        let hand = arm(pose.arm, body)
        weapon(ctx, build, pose, j, hand, backHand, H, arm: { arm(pose.arm2, body) })
    }

    private static func blade(_ ctx: CGContext, from hand: CGPoint, angle: CGFloat, length: CGFloat, width: CGFloat, gleam: CGFloat, H: CGFloat) {
        let d = dir(angle), n = CGPoint(x: -d.y, y: d.x)
        let tip = at(hand, d, length)
        ctx.setStrokeColor(Palette.silhouette.cg())
        ctx.setLineWidth(width)
        ctx.move(to: at(hand, d, -0.11 * H))
        ctx.addLine(to: tip)
        ctx.strokePath()
        ctx.setStrokeColor(Palette.steel.cg(gleam))
        ctx.setLineWidth(max(1.2, width * 0.5))
        ctx.move(to: at(hand, d, 0.05 * H))
        ctx.addLine(to: tip)
        ctx.strokePath()
        ctx.setStrokeColor(Palette.silhouette.cg())
        ctx.setLineWidth(width * 1.6)
        ctx.move(to: at(hand, n, -0.035 * H))
        ctx.addLine(to: at(hand, n, 0.035 * H))
        ctx.strokePath()
    }

    private static func weapon(_ ctx: CGContext, _ build: Build, _ pose: Pose, _ j: Joints, _ hand: CGPoint, _ backHand: CGPoint,
                               _ H: CGFloat, arm: () -> CGPoint) {
        let body = Palette.silhouette.cg()
        switch build.weapon {
        case .katana:
            blade(ctx, from: hand, angle: pose.blade, length: 0.56 * H, width: 0.028 * H, gleam: 1, H: H)
        case .nodachi:
            blade(ctx, from: hand, angle: pose.blade, length: 0.74 * H, width: 0.034 * H, gleam: 0.8, H: H)
        case .knife:
            blade(ctx, from: hand, angle: pose.blade, length: 0.24 * H, width: 0.028 * H, gleam: 0.7, H: H)
        case .twin:
            blade(ctx, from: hand, angle: pose.blade, length: 0.38 * H, width: 0.026 * H, gleam: 0.75, H: H)
            blade(ctx, from: backHand, angle: pose.blade2, length: 0.36 * H, width: 0.024 * H, gleam: 0.45, H: H)
        case .spear:
            let d = dir(pose.blade), n = CGPoint(x: -d.y, y: d.x)
            let tip = at(hand, d, 0.64 * H)
            ctx.setStrokeColor(body)
            ctx.setLineWidth(0.024 * H)
            ctx.move(to: at(hand, d, -0.36 * H))
            ctx.addLine(to: tip)
            ctx.strokePath()
            ctx.setFillColor(body)
            ctx.move(to: at(tip, d, 0.11 * H))
            ctx.addLine(to: at(tip, n, 0.032 * H))
            ctx.addLine(to: at(tip, n, -0.032 * H))
            ctx.closePath()
            ctx.fillPath()
            ctx.setStrokeColor(Palette.steel.cg(0.75))
            ctx.setLineWidth(max(1, 0.01 * H))
            ctx.move(to: tip)
            ctx.addLine(to: at(tip, d, 0.1 * H))
            ctx.strokePath()
            // A red tassel below the head.
            ctx.setFillColor(build.accent.cg())
            let tassel = at(at(tip, d, -0.02 * H), CGPoint(x: 0, y: -1), 0.03 * H)
            ctx.fillEllipse(in: CGRect(x: tassel.x - 0.028 * H, y: tassel.y - 0.04 * H, width: 0.056 * H, height: 0.07 * H))
        case .club:
            let d = dir(pose.blade), n = CGPoint(x: -d.y, y: d.x)
            let end = at(hand, d, 0.58 * H)
            ctx.setFillColor(body)
            ctx.move(to: at(at(hand, d, -0.09 * H), n, 0.024 * H))
            ctx.addLine(to: at(end, n, 0.055 * H))
            ctx.addLine(to: at(at(end, d, 0.04 * H), n, 0))
            ctx.addLine(to: at(end, n, -0.055 * H))
            ctx.addLine(to: at(at(hand, d, -0.09 * H), n, -0.024 * H))
            ctx.closePath()
            ctx.fillPath()
            for k in 0..<5 {
                let p = at(hand, d, (0.22 + 0.075 * CGFloat(k)) * H)
                for s in [CGFloat(1), -1] {
                    let stud = at(p, n, s * (0.038 + 0.004 * CGFloat(k)) * H)
                    ctx.fillEllipse(in: CGRect(x: stud.x - 0.018 * H, y: stud.y - 0.018 * H, width: 0.036 * H, height: 0.036 * H))
                }
            }
        case .bow:
            // The yumi: taller than the archer, gripped low, so its top sweeps far above his head.
            let d = dir(pose.draw > 0 || pose.arm.fore > 1 ? pose.arm.fore : 1.45)
            let n = CGPoint(x: -d.y, y: d.x)
            let top = at(at(hand, n, 0.62 * H), d, -0.08 * H), bottom = at(at(hand, n, -0.32 * H), d, -0.05 * H)
            ctx.setStrokeColor(body)
            ctx.setLineWidth(0.03 * H)
            ctx.move(to: top)
            ctx.addQuadCurve(to: bottom, control: at(at(hand, n, 0.12 * H), d, 0.2 * H))
            ctx.strokePath()
            var nock = at(hand, d, -0.07 * H)
            if pose.draw > 0 {
                nock = arm()
                ctx.setStrokeColor(body)
                ctx.setLineWidth(0.014 * H)
                ctx.move(to: nock)
                ctx.addLine(to: at(hand, d, 0.1 * H))
                ctx.strokePath()
                ctx.setStrokeColor(Palette.steel.cg(0.85))
                ctx.move(to: at(hand, d, 0.05 * H))
                ctx.addLine(to: at(hand, d, 0.1 * H))
                ctx.strokePath()
            }
            ctx.setStrokeColor(CGColor(gray: 0.4, alpha: 0.9))
            ctx.setLineWidth(max(1, 0.007 * H))
            ctx.move(to: top)
            ctx.addLine(to: nock)
            ctx.addLine(to: bottom)
            ctx.strokePath()
        }
    }

    private static func backGear(_ ctx: CGContext, _ build: Build, _ j: Joints, _ pose: Pose, _ H: CGFloat) {
        let body = Palette.silhouette.cg()
        switch build.back {
        case .none:
            break
        case .quiver:
            let base = at(at(j.shoulder, j.across, -0.07 * H), j.up, -0.2 * H)
            let d = CGPoint(x: -0.45, y: 0.9)
            let top = at(base, d, 0.26 * H)
            ctx.setFillColor(body)
            capsule(ctx, base, top, 0.06 * H, 0.07 * H)
            ctx.setStrokeColor(RGB(0.85, 0.85, 0.8).cg(0.9))
            ctx.setLineWidth(max(1, 0.012 * H))
            for k in 0..<3 {
                let root = at(top, CGPoint(x: 1, y: 0), (CGFloat(k) - 1) * 0.02 * H)
                ctx.move(to: root)
                ctx.addLine(to: at(root, d, 0.06 * H))
            }
            ctx.strokePath()
        case .banner:
            // A sashimono: a tall pole on the back, and the warlord's flag snapping in the wind.
            let base = at(at(j.shoulder, j.across, -0.08 * H), j.up, -0.1 * H)
            let top = CGPoint(x: base.x - 0.03 * H, y: base.y + 0.62 * H)
            ctx.setStrokeColor(body)
            ctx.setLineWidth(0.022 * H)
            ctx.move(to: base)
            ctx.addLine(to: top)
            ctx.strokePath()
            let flutter = sin(pose.wave * 2 * .pi) * 0.025 * H
            let flag = CGMutablePath()
            flag.move(to: CGPoint(x: top.x, y: top.y - 0.02 * H))
            flag.addQuadCurve(to: CGPoint(x: top.x - 0.2 * H, y: top.y - 0.03 * H + flutter),
                              control: CGPoint(x: top.x - 0.1 * H, y: top.y - 0.02 * H - flutter))
            flag.addLine(to: CGPoint(x: top.x - 0.19 * H, y: top.y - 0.34 * H + flutter))
            flag.addQuadCurve(to: CGPoint(x: top.x, y: top.y - 0.32 * H),
                              control: CGPoint(x: top.x - 0.1 * H, y: top.y - 0.34 * H - flutter))
            flag.closeSubpath()
            ctx.addPath(flag)
            ctx.setFillColor(RGB(0.55, 0.05, 0.06).cg())
            ctx.fillPath()
            // Its crest: a gold disc.
            ctx.setFillColor(build.accent.cg())
            let c = CGPoint(x: top.x - 0.1 * H, y: top.y - 0.17 * H + flutter * 0.5)
            ctx.fillEllipse(in: CGRect(x: c.x - 0.045 * H, y: c.y - 0.045 * H, width: 0.09 * H, height: 0.09 * H))
            ctx.setStrokeColor(body)
            ctx.setLineWidth(0.018 * H)
            ctx.move(to: CGPoint(x: top.x - 0.21 * H, y: top.y - 0.015 * H))
            ctx.addLine(to: CGPoint(x: top.x + 0.01 * H, y: top.y - 0.015 * H))
            ctx.strokePath()
        }
    }

    private static func headGear(_ ctx: CGContext, _ build: Build, _ c: CGPoint, _ r: CGFloat, _ up: CGPoint, _ face: CGPoint,
                                 _ wave: CGFloat, _ H: CGFloat) {
        let body = Palette.silhouette.cg()
        ctx.setFillColor(body)
        let flutter = sin(wave * 2 * .pi)
        func tails(from root: CGPoint, length: CGFloat, width: CGFloat, color: CGColor) {
            ctx.setStrokeColor(color)
            for (k, droop) in [(0, CGFloat(0.2)), (1, 0.62)] {
                let sway = r * 0.5 * (k == 0 ? flutter : -flutter)
                ctx.setLineWidth(width * (k == 0 ? 1 : 0.8))
                ctx.move(to: root)
                let end = at(at(root, face, -length * (1 - CGFloat(k) * 0.18)), up, -r * droop * 2 + sway)
                ctx.addQuadCurve(to: end, control: at(at(root, face, -length * 0.5), up, r * (0.55 - droop) - sway))
                ctx.strokePath()
            }
        }
        switch build.gear {
        case .topknot:
            let knot = at(at(c, up, r * 0.95), face, -r * 0.4)
            ctx.fillEllipse(in: CGRect(x: knot.x - r * 0.42, y: knot.y - r * 0.32, width: r * 0.84, height: r * 0.64))
            // The red headband and its two long tails streaming back.
            let band = at(c, up, r * 0.28)
            ctx.setStrokeColor(build.accent.cg())
            ctx.setLineWidth(r * 0.36)
            ctx.setLineCap(.butt)
            ctx.move(to: at(band, face, -r))
            ctx.addLine(to: at(band, face, r))
            ctx.strokePath()
            ctx.setLineCap(.round)
            tails(from: at(band, face, -r * 0.95), length: r * 3.6, width: r * 0.3, color: build.accent.cg())
        case .jingasa:
            // The ashigaru's wide conical hat.
            let brim = at(c, up, r * 0.45)
            ctx.move(to: at(brim, face, -r * 2.5))
            ctx.addLine(to: at(brim, face, r * 2.5))
            ctx.addLine(to: at(brim, up, r * 1.2))
            ctx.closePath()
            ctx.fillPath()
        case .hood:
            // A shinobi hood with a trailing tail of cloth.
            ctx.fillEllipse(in: CGRect(x: c.x - r * 1.12, y: c.y - r * 1.05, width: r * 2.24, height: r * 2.2))
            tails(from: at(at(c, face, -r * 0.9), up, r * 0.1), length: r * 3, width: r * 0.34, color: build.accent.cg(0.95))
        case .horns:
            // An oni: two curved horns and a wild mane.
            for s in [CGFloat(1), -0.35] {
                let root = at(at(c, up, r * 0.6), face, s * r * 0.5)
                ctx.setStrokeColor(body)
                ctx.setLineWidth(r * 0.42)
                ctx.move(to: root)
                ctx.addQuadCurve(to: at(at(root, up, r * 1.4), face, s * r), control: at(at(root, up, r * 0.2), face, s * r * 1.3))
                ctx.strokePath()
            }
            for k in 0..<4 {
                let spike = at(at(c, face, -r * (0.4 + 0.25 * CGFloat(k))), up, r * (0.7 - 0.25 * CGFloat(k)))
                ctx.move(to: at(spike, face, r * 0.3))
                ctx.addLine(to: at(at(spike, face, -r * 0.7), up, r * 0.3))
                ctx.addLine(to: at(spike, up, -r * 0.3))
                ctx.closePath()
                ctx.fillPath()
            }
        case .ponytail:
            let root = at(at(c, up, r * 0.7), face, -r * 0.6)
            ctx.setStrokeColor(body)
            ctx.setLineWidth(r * 0.45)
            ctx.move(to: root)
            ctx.addQuadCurve(to: at(at(root, face, -r * 2), up, -r * 0.9 + r * 0.4 * flutter), control: at(root, face, -r * 1.3))
            ctx.strokePath()
            // A long scarf at the neck.
            let neck = at(c, up, -r * 1.15)
            tails(from: at(neck, face, -r * 0.4), length: r * 4.4, width: r * 0.42, color: build.accent.cg(0.95))
        case .cowl:
            ctx.move(to: at(at(c, up, r * 1.2), face, r * 0.25))
            ctx.addLine(to: at(at(c, up, r * 0.2), face, -r * 1.9))
            ctx.addLine(to: at(at(c, up, -r * 0.7), face, -r * 0.8))
            ctx.closePath()
            ctx.fillPath()
            ctx.fillEllipse(in: CGRect(x: c.x - r * 1.1, y: c.y - r * 0.95, width: r * 2.2, height: r * 2.1))
        case .kabuto:
            // The helmet's bowl, its flared neck guard, and a golden crescent crest.
            ctx.fillEllipse(in: CGRect(x: c.x - r * 1.18, y: c.y - r * 0.55, width: r * 2.36, height: r * 1.95))
            ctx.move(to: at(at(c, up, r * 0.25), face, -r * 1.1))
            ctx.addLine(to: at(at(c, up, -r * 0.8), face, -r * 2.2))
            ctx.addLine(to: at(at(c, up, -r * 1.1), face, -r * 1.55))
            ctx.addLine(to: at(at(c, up, -r * 0.4), face, -r * 0.4))
            ctx.closePath()
            ctx.fillPath()
            let root = at(at(c, up, r * 0.95), face, r * 0.35)
            ctx.setStrokeColor(build.accent.cg())
            ctx.setLineWidth(r * 0.3)
            ctx.move(to: at(at(root, face, r * 1.35), up, r * 1.6))
            ctx.addQuadCurve(to: at(at(root, face, -r * 1.35), up, r * 1.7), control: at(root, up, -r * 0.5))
            ctx.strokePath()
        }
    }

    /// The blur of a swing: a pale fan swept by the blade, brightest at its edge.
    private static func drawSmear(_ ctx: CGContext, _ pose: Pose, _ build: Build, _ H: CGFloat,
                                  _ smear: (from: CGFloat, to: CGFloat, strength: CGFloat)) {
        let j = joints(pose, H)
        let hand = armEnds(j, pose.arm, H).hand
        let inner = 0.14 * H, outer = 0.62 * H
        let a0 = smear.from, a1 = smear.to
        let steps = 14
        let fan = CGMutablePath()
        for k in 0...steps {
            let a = a0 + (a1 - a0) * CGFloat(k) / CGFloat(steps)
            let p = at(hand, dir(a), outer)
            if k == 0 { fan.move(to: p) } else { fan.addLine(to: p) }
        }
        for k in stride(from: steps, through: 0, by: -1) {
            let a = a0 + (a1 - a0) * CGFloat(k) / CGFloat(steps)
            fan.addLine(to: at(hand, dir(a), inner))
        }
        fan.closeSubpath()
        ctx.setShadow(offset: .zero, blur: 0, color: nil)
        ctx.addPath(fan)
        ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.26 * smear.strength))
        ctx.fillPath()
        let edge = CGMutablePath()
        for k in 0...steps {
            let a = a0 + (a1 - a0) * CGFloat(k) / CGFloat(steps)
            let p = at(hand, dir(a), outer * 0.97)
            if k == 0 { edge.move(to: p) } else { edge.addLine(to: p) }
        }
        ctx.addPath(edge)
        ctx.setStrokeColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.85 * smear.strength))
        ctx.setLineWidth(max(1.5, 0.022 * H))
        ctx.setLineCap(.round)
        ctx.strokePath()
        _ = build
    }
}
