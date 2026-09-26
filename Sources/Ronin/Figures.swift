import AppKit
import SpriteKit
import RoninCore

/// Everyone on the lane is a silhouette posed from a small skeleton and drawn once, frame by frame, into textures:
/// black against the sky, with a glint of steel and a spot of colour for the eyes, the headband, the crest.
enum Cast: Hashable {
    case hero
    case foe(Kind)
}

enum Frame: Int, CaseIterable {
    case walk0, walk1, walk2, walk3
    case ready, windup, strike, stagger, leap, aim, loose
    case slash1, slash2, slash3, stumble, hurt, victory, fallen

    static let walk: [Frame] = [.walk0, .walk1, .walk2, .walk3]
}

/// A pose, as angles. Limb angles are measured from straight down: +π/2 points forward (the way the figure
/// faces), π straight up, −π/2 back.
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
}

struct Build {
    enum Weapon { case katana, spear, knife, club, twin, bow, nodachi }
    enum Gear { case topknot, hat, band, horns, scarf, hood, kabuto }

    /// Height relative to the ronin's.
    var height: CGFloat
    var limb: CGFloat = 0.052
    var shoulders: CGFloat = 0.17
    var hips: CGFloat = 0.12
    var head: CGFloat = 0.068
    var weapon: Weapon
    var gear: Gear
    var eyes: RGB?
    var accent: RGB
    var stride: CGFloat = 1

    static func of(_ cast: Cast) -> Build {
        switch cast {
        case .hero:
            return Build(height: 1, weapon: .katana, gear: .topknot, eyes: nil, accent: Palette.blood)
        case .foe(let kind):
            switch kind {
            case .grunt:
                return Build(height: 0.95, weapon: .spear, gear: .hat, eyes: RGB(1, 0.2, 0.12), accent: RGB(0.6, 0.1, 0.1))
            case .runner:
                return Build(height: 0.88, limb: 0.046, shoulders: 0.15, weapon: .knife, gear: .band, eyes: RGB(1, 0.55, 0.1),
                             accent: RGB(1, 0.5, 0.1), stride: 1.3)
            case .brute:
                return Build(height: 1.18, limb: 0.078, shoulders: 0.28, hips: 0.2, head: 0.07, weapon: .club, gear: .horns,
                             eyes: RGB(1, 0.2, 0.1), accent: RGB(0.7, 0.3, 1.0), stride: 0.8)
            case .dancer:
                return Build(height: 0.95, limb: 0.045, shoulders: 0.15, weapon: .twin, gear: .scarf, eyes: RGB(0.3, 0.95, 1.0),
                             accent: RGB(0.25, 0.9, 1.0), stride: 1.1)
            case .archer:
                return Build(height: 0.93, weapon: .bow, gear: .hood, eyes: RGB(0.6, 1.0, 0.3), accent: RGB(0.5, 0.9, 0.3))
            case .warlord:
                return Build(height: 1.3, limb: 0.066, shoulders: 0.25, hips: 0.16, head: 0.072, weapon: .nodachi, gear: .kabuto,
                             eyes: RGB(1, 0.75, 0.2), accent: Palette.gold, stride: 0.85)
            }
        }
    }
}

@MainActor
enum Figures {
    /// Texture pixels for a figure one ronin tall.
    static let pixelHeight: CGFloat = 150
    /// The canvas around a figure, in figure heights, and where its feet stand on it.
    static let canvas = CGSize(width: 2.3, height: 1.5)
    static let feet = CGPoint(x: 1.15, y: 0.12)
    static var anchor: CGPoint { CGPoint(x: feet.x / canvas.width, y: feet.y / canvas.height) }

    private static var cache: [Cast: [Frame: SKTexture]] = [:]

    static func texture(_ cast: Cast, _ frame: Frame) -> SKTexture {
        if let frames = cache[cast], let texture = frames[frame] { return texture }
        let build = Build.of(cast)
        let texture = render(pose(cast, frame), build)
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
        case .hero: return [.ready, .slash1, .slash2, .slash3, .stumble, .hurt, .victory, .fallen]
        case .foe(let kind):
            var frames = Frame.walk + [.ready, .windup, .strike, .stagger]
            if kind == .dancer || kind == .warlord { frames.append(.leap) }
            if kind == .archer { frames += [.aim, .loose] }
            return frames
        }
    }

    /// A figure's size on screen for a ronin `height` points tall.
    static func size(_ cast: Cast, ronin height: CGFloat) -> CGSize {
        let h = height * Build.of(cast).height
        return CGSize(width: canvas.width * h, height: canvas.height * h)
    }

    // MARK: Poses

    static func pose(_ cast: Cast, _ frame: Frame) -> Pose {
        var p = Pose()
        let stride = Build.of(cast).stride
        switch frame {
        case .walk0, .walk1, .walk2, .walk3:
            let legs: [((CGFloat, CGFloat), (CGFloat, CGFloat), CGFloat)] = [
                ((0.42, 0.22), (-0.38, -0.55), 0), ((0.08, -0.2), (-0.05, -0.6), 0.02),
                ((-0.38, -0.55), (0.42, 0.22), 0), ((-0.05, -0.6), (0.08, -0.2), 0.02),
            ]
            let (f, b, lift) = legs[frame.rawValue]
            p.front = (f.0 * stride, f.1 * stride)
            p.back = (b.0 * stride, b.1 * stride)
            p.lift = lift
        default:
            break
        }
        switch cast {
        case .hero: hero(&p, frame)
        case .foe(let kind):
            switch kind {
            case .grunt: grunt(&p, frame)
            case .runner: runner(&p, frame)
            case .brute: brute(&p, frame)
            case .dancer: dancer(&p, frame)
            case .archer: archer(&p, frame)
            case .warlord: warlord(&p, frame)
            }
        }
        return p
    }

    private static func lunge(_ p: inout Pose, _ lean: CGFloat) {
        p.lean = lean
        p.shift = 0.04
        p.front = (0.85, 0.32)
        p.back = (-0.65, -0.85)
    }

    private static func stagger(_ p: inout Pose) {
        p.lean = -0.32
        p.shift = -0.03
        p.front = (0.35, 0.1)
        p.back = (-0.22, -0.4)
        p.arm = (0.2, 0.6)
        p.arm2 = (-0.7, -0.2)
        p.tilt = -0.35
    }

    private static func tuck(_ p: inout Pose) {
        p.airborne = true
        p.lean = 0.3
        p.front = (1.8, 0.3)
        p.back = (1.3, -0.2)
    }

    private static func hero(_ p: inout Pose, _ frame: Frame) {
        p.lean = 0.1
        p.front = (0.42, 0.1)
        p.back = (-0.42, -0.3)
        p.arm = (0.75, 1.45)
        p.arm2 = (0.55, 1.35)
        p.blade = 2.05
        switch frame {
        case .slash1:
            lunge(&p, 0.32)
            p.arm = (1.55, 1.6)
            p.arm2 = (1.35, 1.55)
            p.blade = 1.72
        case .slash2:
            lunge(&p, 0.2)
            p.arm = (2.3, 2.6)
            p.arm2 = (2.1, 2.5)
            p.blade = 2.8
        case .slash3:
            lunge(&p, 0.42)
            p.front = (0.9, 0.42)
            p.arm = (1.2, 1.1)
            p.arm2 = (1.0, 1.0)
            p.blade = 0.85
        case .stumble:
            p.lean = 0.55
            p.shift = 0.04
            p.front = (0.95, 0.75)
            p.back = (-0.15, -0.9)
            p.arm = (1.0, 0.7)
            p.arm2 = (-1.6, -1.1)
            p.blade = 0.5
            p.tilt = 0.3
        case .hurt:
            stagger(&p)
            p.arm = (0.4, 1.0)
            p.arm2 = (-0.6, -0.2)
            p.blade = 1.3
        case .victory:
            p.lean = 0
            p.front = (0.2, 0)
            p.back = (-0.2, -0.05)
            p.arm = (2.9, 3.05)
            p.arm2 = (-0.2, 0.1)
            p.blade = 3.1
            p.tilt = 0.15
        case .fallen:
            p.lean = 0.5
            p.front = (1.45, 0.1)
            p.back = (-0.5, -1.55)
            p.arm = (0.5, 0.25)
            p.arm2 = (0.2, 0.35)
            p.blade = 0.12
            p.tilt = 0.5
        default:
            break
        }
    }

    private static func grunt(_ p: inout Pose, _ frame: Frame) {
        p.arm = (0.95, 1.35)
        p.arm2 = (0.5, 1.25)
        p.blade = 1.5
        switch frame {
        case .windup:
            p.lean = -0.05
            p.shift = -0.03
            p.arm = (0.2, 1.0)
            p.arm2 = (-0.4, 0.8)
            p.blade = 1.62
        case .strike:
            lunge(&p, 0.3)
            p.arm = (1.45, 1.55)
            p.arm2 = (1.1, 1.5)
            p.blade = 1.57
        case .stagger:
            stagger(&p)
            p.blade = 2.4
        default:
            break
        }
    }

    private static func runner(_ p: inout Pose, _ frame: Frame) {
        p.lean = 0.38
        p.arm = (0.9, 1.6)
        p.arm2 = (-0.6, -0.2)
        p.blade = 1.9
        switch frame {
        case .ready:
            p.front = (0.5, 0.2)
            p.back = (-0.5, -0.5)
        case .windup:
            p.lean = 0.2
            p.front = (0.5, 0.2)
            p.back = (-0.5, -0.5)
            p.arm = (2.5, 2.9)
            p.blade = 3.0
        case .strike:
            lunge(&p, 0.5)
            p.arm = (1.3, 1.2)
            p.blade = 1.0
        case .stagger:
            stagger(&p)
            p.blade = 2.2
        default:
            break
        }
    }

    private static func brute(_ p: inout Pose, _ frame: Frame) {
        p.lean = 0.12
        p.arm = (0.25, 2.3)
        p.arm2 = (0.6, 1.5)
        p.blade = -2.6
        switch frame {
        case .windup:
            p.lean = -0.1
            p.arm = (2.8, 3.0)
            p.arm2 = (2.6, 2.9)
            p.blade = 3.2
        case .strike:
            lunge(&p, 0.35)
            p.arm = (1.4, 1.6)
            p.arm2 = (1.2, 1.5)
            p.blade = 1.75
        case .stagger:
            stagger(&p)
            p.arm = (0.3, 2.0)
            p.blade = -2.2
        default:
            break
        }
    }

    private static func dancer(_ p: inout Pose, _ frame: Frame) {
        p.lean = 0.15
        p.arm = (1.0, 1.6)
        p.arm2 = (-0.7, -0.3)
        p.blade = 2.3
        p.blade2 = -2.3
        switch frame {
        case .windup:
            p.arm = (2.6, 2.9)
            p.arm2 = (2.2, 2.7)
            p.blade = 2.6
            p.blade2 = 2.9
        case .strike:
            lunge(&p, 0.35)
            p.arm = (1.5, 1.6)
            p.arm2 = (1.1, 1.3)
            p.blade = 1.5
            p.blade2 = 1.2
        case .leap:
            tuck(&p)
            p.arm = (1.8, 2.2)
            p.arm2 = (-1.8, -2.2)
            p.blade = 2.8
            p.blade2 = -2.8
        case .stagger:
            stagger(&p)
            p.blade = 2.0
            p.blade2 = -1.6
        default:
            break
        }
    }

    private static func archer(_ p: inout Pose, _ frame: Frame) {
        p.arm = (0.25, 0.35)
        p.arm2 = (0.1, 0.3)
        switch frame {
        case .aim:
            p.front = (0.35, 0.1)
            p.back = (-0.4, -0.3)
            p.lean = 0.02
            p.arm = (1.55, 1.55)
            p.arm2 = (-1.45, 1.6)
            p.draw = 1
        case .loose:
            p.front = (0.35, 0.1)
            p.back = (-0.4, -0.3)
            p.lean = 0.02
            p.arm = (1.55, 1.55)
            p.arm2 = (-1.3, -1.0)
        case .windup, .strike:
            p.arm = (1.2, 1.4)
        case .stagger:
            stagger(&p)
        default:
            break
        }
    }

    private static func warlord(_ p: inout Pose, _ frame: Frame) {
        p.lean = 0.1
        p.arm = (0.85, 1.7)
        p.arm2 = (0.65, 1.6)
        p.blade = 2.35
        switch frame {
        case .windup:
            p.lean = -0.08
            p.arm = (2.9, 3.3)
            p.arm2 = (2.7, 3.2)
            p.blade = 3.9
        case .strike:
            lunge(&p, 0.35)
            p.arm = (1.5, 1.7)
            p.arm2 = (1.3, 1.6)
            p.blade = 1.55
        case .leap:
            tuck(&p)
            p.arm = (2.4, 2.8)
            p.arm2 = (2.2, 2.7)
            p.blade = 3.6
        case .stagger:
            stagger(&p)
            p.arm = (0.6, 1.2)
            p.arm2 = (0.4, 1.1)
            p.blade = 1.9
        default:
            break
        }
    }

    // MARK: Drawing

    private static func dir(_ a: CGFloat) -> CGPoint { CGPoint(x: sin(a), y: -cos(a)) }

    private static func render(_ pose: Pose, _ build: Build) -> SKTexture {
        let unit = pixelHeight * build.height
        let w = Int((canvas.width * unit).rounded()), h = Int((canvas.height * unit).rounded())
        guard let ctx = Art.bitmap(w, h) else { return SKTexture() }
        ctx.setLineCap(.round)
        ctx.setLineJoin(.round)
        let H = unit
        func at(_ p: CGPoint, _ d: CGPoint, _ length: CGFloat) -> CGPoint { CGPoint(x: p.x + d.x * length, y: p.y + d.y * length) }
        func line(_ a: CGPoint, _ b: CGPoint, _ width: CGFloat, _ color: CGColor) {
            ctx.setStrokeColor(color)
            ctx.setLineWidth(width)
            ctx.move(to: a)
            ctx.addLine(to: b)
            ctx.strokePath()
        }

        let body = Palette.silhouette.cg(), shade = Palette.shade.cg()
        let thigh = 0.25 * H, shin = 0.25 * H, torso = 0.29 * H, upper = 0.16 * H, fore = 0.15 * H
        let limb = build.limb * H
        let ground = feet.y * H
        let dropFront = thigh * cos(pose.front.thigh) + shin * cos(pose.front.shin)
        let dropBack = thigh * cos(pose.back.thigh) + shin * cos(pose.back.shin)
        let hipY = pose.airborne ? ground + 0.42 * H : ground + max(dropFront, dropBack) + pose.lift * H
        let hip = CGPoint(x: feet.x * H + pose.shift * H, y: hipY)
        let up = CGPoint(x: sin(pose.lean), y: cos(pose.lean))
        let across = CGPoint(x: cos(pose.lean), y: -sin(pose.lean))
        let neck = at(hip, up, torso)
        let shoulder = at(neck, up, -0.035 * H)

        func leg(_ angles: (thigh: CGFloat, shin: CGFloat), _ color: CGColor, _ width: CGFloat) {
            let knee = at(hip, dir(angles.thigh), thigh)
            let foot = at(knee, dir(angles.shin), shin)
            ctx.setStrokeColor(color)
            ctx.setLineWidth(width)
            ctx.move(to: hip)
            ctx.addLine(to: knee)
            ctx.addLine(to: foot)
            ctx.strokePath()
            line(foot, at(foot, CGPoint(x: 1, y: 0), 0.05 * H), width * 0.8, color)
        }
        func arm(_ angles: (upper: CGFloat, fore: CGFloat), _ color: CGColor, _ width: CGFloat) -> CGPoint {
            let elbow = at(shoulder, dir(angles.upper), upper)
            let hand = at(elbow, dir(angles.fore), fore)
            ctx.setStrokeColor(color)
            ctx.setLineWidth(width)
            ctx.move(to: shoulder)
            ctx.addLine(to: elbow)
            ctx.addLine(to: hand)
            ctx.strokePath()
            return hand
        }
        func blade(from hand: CGPoint, angle: CGFloat, length: CGFloat, width: CGFloat, gleam: CGFloat) {
            let d = dir(angle)
            let tip = at(hand, d, length)
            line(at(hand, d, -0.1 * H), tip, width, body)
            line(at(hand, d, 0.04 * H), tip, max(1, width * 0.45), Palette.steel.cg(gleam))
            let n = CGPoint(x: -d.y, y: d.x)
            line(at(hand, n, -0.03 * H), at(hand, n, 0.03 * H), width * 1.4, body)
        }

        // The far side first, in a lighter shade, so the figure reads in depth.
        leg(pose.back, shade, limb)
        var backHand = CGPoint.zero
        if build.weapon != .bow || pose.draw == 0 { backHand = arm(pose.arm2, shade, limb * 0.9) }

        // Torso.
        let hw = build.hips * H / 2, sw = build.shoulders * H / 2
        ctx.setFillColor(body)
        ctx.move(to: at(hip, across, -hw))
        ctx.addLine(to: at(hip, across, hw))
        ctx.addLine(to: at(shoulder, across, sw))
        ctx.addLine(to: at(at(shoulder, across, sw * 0.6), up, 0.03 * H))
        ctx.addLine(to: at(at(shoulder, across, -sw * 0.6), up, 0.03 * H))
        ctx.addLine(to: at(shoulder, across, -sw))
        ctx.closePath()
        ctx.fillPath()
        // A sash at the waist.
        line(at(at(hip, up, 0.05 * H), across, -hw * 1.05), at(at(hip, up, 0.05 * H), across, hw * 1.05), 0.03 * H, build.accent.scaled(0.55).cg())

        // Head.
        let r = build.head * H
        let headUp = CGPoint(x: sin(pose.lean + pose.tilt), y: cos(pose.lean + pose.tilt))
        let headCentre = at(neck, headUp, r * 1.05)
        line(neck, headCentre, limb * 0.9, body)
        ctx.setFillColor(body)
        ctx.fillEllipse(in: CGRect(x: headCentre.x - r, y: headCentre.y - r, width: 2 * r, height: 2 * r))
        let face = CGPoint(x: cos(pose.lean + pose.tilt), y: -sin(pose.lean + pose.tilt))
        gear(build, ctx: ctx, centre: headCentre, r: r, up: headUp, face: face, H: H)
        if let eyes = build.eyes {
            let eye = at(at(headCentre, face, r * 0.5), headUp, r * 0.12)
            ctx.setFillColor(eyes.cg())
            ctx.fillEllipse(in: CGRect(x: eye.x - r * 0.2, y: eye.y - r * 0.11, width: r * 0.4, height: r * 0.22))
        }

        leg(pose.front, body, limb)
        let hand = arm(pose.arm, body, limb * 0.9)

        switch build.weapon {
        case .katana:
            blade(from: hand, angle: pose.blade, length: 0.55 * H, width: 0.024 * H, gleam: 0.95)
        case .nodachi:
            blade(from: hand, angle: pose.blade, length: 0.72 * H, width: 0.03 * H, gleam: 0.7)
        case .knife:
            blade(from: hand, angle: pose.blade, length: 0.22 * H, width: 0.024 * H, gleam: 0.55)
        case .twin:
            blade(from: hand, angle: pose.blade, length: 0.36 * H, width: 0.022 * H, gleam: 0.6)
            blade(from: backHand, angle: pose.blade2, length: 0.34 * H, width: 0.02 * H, gleam: 0.35)
        case .spear:
            let d = dir(pose.blade)
            let tip = at(hand, d, 0.62 * H)
            line(at(hand, d, -0.34 * H), tip, 0.02 * H, body)
            ctx.setFillColor(body)
            let n = CGPoint(x: -d.y, y: d.x)
            ctx.move(to: at(tip, d, 0.09 * H))
            ctx.addLine(to: at(tip, n, 0.025 * H))
            ctx.addLine(to: at(tip, n, -0.025 * H))
            ctx.closePath()
            ctx.fillPath()
            line(tip, at(tip, d, 0.08 * H), 0.008 * H, Palette.steel.cg(0.6))
        case .club:
            let d = dir(pose.blade), n = CGPoint(x: -d.y, y: d.x)
            let end = at(hand, d, 0.56 * H)
            ctx.setFillColor(body)
            ctx.move(to: at(at(hand, d, -0.08 * H), n, 0.02 * H))
            ctx.addLine(to: at(end, n, 0.045 * H))
            ctx.addLine(to: at(at(end, d, 0.03 * H), n, 0))
            ctx.addLine(to: at(end, n, -0.045 * H))
            ctx.addLine(to: at(at(hand, d, -0.08 * H), n, -0.02 * H))
            ctx.closePath()
            ctx.fillPath()
            for k in 0..<5 {
                let p = at(hand, d, (0.22 + 0.075 * CGFloat(k)) * H)
                for s in [CGFloat(1), -1] {
                    let stud = at(p, n, s * (0.03 + 0.003 * CGFloat(k)) * H)
                    ctx.fillEllipse(in: CGRect(x: stud.x - 0.014 * H, y: stud.y - 0.014 * H, width: 0.028 * H, height: 0.028 * H))
                }
            }
        case .bow:
            let d = dir(pose.draw > 0 || pose.arm.fore > 1 ? pose.arm.fore : 1.45)
            let n = CGPoint(x: -d.y, y: d.x)
            let top = at(at(hand, n, 0.3 * H), d, -0.06 * H), bottom = at(at(hand, n, -0.3 * H), d, -0.06 * H)
            ctx.setStrokeColor(body)
            ctx.setLineWidth(0.026 * H)
            ctx.move(to: top)
            ctx.addQuadCurve(to: bottom, control: at(hand, d, 0.14 * H))
            ctx.strokePath()
            var nock = at(hand, d, -0.06 * H)
            if pose.draw > 0 {
                backHand = arm(pose.arm2, body, limb * 0.9)
                nock = backHand
                line(nock, at(hand, d, 0.1 * H), 0.012 * H, body)
                line(at(hand, d, 0.06 * H), at(hand, d, 0.1 * H), 0.012 * H, Palette.steel.cg(0.8))
            }
            ctx.setStrokeColor(CGColor(gray: 0.35, alpha: 0.9))
            ctx.setLineWidth(max(1, 0.006 * H))
            ctx.move(to: top)
            ctx.addLine(to: nock)
            ctx.addLine(to: bottom)
            ctx.strokePath()
        }
        return Art.texture(ctx)
    }

    private static func gear(_ build: Build, ctx: CGContext, centre c: CGPoint, r: CGFloat, up: CGPoint, face: CGPoint, H: CGFloat) {
        func at(_ p: CGPoint, _ d: CGPoint, _ l: CGFloat) -> CGPoint { CGPoint(x: p.x + d.x * l, y: p.y + d.y * l) }
        let body = Palette.silhouette.cg()
        ctx.setFillColor(body)
        switch build.gear {
        case .topknot:
            let knot = at(at(c, up, r * 0.95), face, -r * 0.45)
            ctx.fillEllipse(in: CGRect(x: knot.x - r * 0.38, y: knot.y - r * 0.3, width: r * 0.76, height: r * 0.6))
            // The red headband and its two tails streaming back.
            let band = at(c, up, r * 0.28)
            ctx.setStrokeColor(build.accent.cg())
            ctx.setLineWidth(r * 0.34)
            ctx.setLineCap(.butt)
            ctx.move(to: at(band, face, -r * 0.98))
            ctx.addLine(to: at(band, face, r * 0.98))
            ctx.strokePath()
            ctx.setLineCap(.round)
            let root = at(band, face, -r * 0.95)
            for (k, droop) in [(0, CGFloat(0.25)), (1, 0.7)] {
                ctx.setLineWidth(r * (k == 0 ? 0.28 : 0.22))
                ctx.move(to: root)
                let end = at(at(root, face, -r * (3.2 - CGFloat(k) * 0.6)), up, -r * droop * 2)
                ctx.addQuadCurve(to: end, control: at(at(root, face, -r * 1.6), up, r * (0.6 - droop)))
                ctx.strokePath()
            }
        case .hat:
            let brim = at(c, up, r * 0.55)
            ctx.move(to: at(brim, face, -r * 2.3))
            ctx.addLine(to: at(brim, face, r * 2.3))
            ctx.addLine(to: at(brim, up, r * 1.15))
            ctx.closePath()
            ctx.fillPath()
        case .band:
            let band = at(c, up, r * 0.3)
            ctx.setStrokeColor(build.accent.cg())
            ctx.setLineWidth(r * 0.28)
            ctx.move(to: at(band, face, -r))
            ctx.addLine(to: at(band, face, r))
            ctx.move(to: at(band, face, -r))
            ctx.addLine(to: at(at(band, face, -r * 2.2), up, -r * 0.4))
            ctx.strokePath()
        case .horns:
            for s in [CGFloat(1), -0.4] {
                let root = at(at(c, up, r * 0.6), face, s * r * 0.5)
                ctx.setStrokeColor(body)
                ctx.setLineWidth(r * 0.36)
                ctx.move(to: root)
                ctx.addQuadCurve(to: at(at(root, up, r * 1.3), face, s * r * 0.9), control: at(at(root, up, r * 0.2), face, s * r * 1.2))
                ctx.strokePath()
            }
        case .scarf:
            let neck = at(c, up, -r * 1.1)
            ctx.setStrokeColor(build.accent.cg(0.95))
            ctx.setLineWidth(r * 0.42)
            ctx.move(to: at(neck, face, r * 0.4))
            ctx.addLine(to: at(neck, face, -r * 0.6))
            ctx.addQuadCurve(to: at(at(neck, face, -r * 4.2), up, r * 0.2), control: at(at(neck, face, -r * 2.2), up, -r * 1.4))
            ctx.strokePath()
        case .hood:
            ctx.move(to: at(at(c, up, r * 1.15), face, r * 0.2))
            ctx.addLine(to: at(at(c, up, r * 0.3), face, -r * 1.9))
            ctx.addLine(to: at(at(c, up, -r * 0.6), face, -r * 0.8))
            ctx.closePath()
            ctx.fillPath()
        case .kabuto:
            // The helmet's bowl, its flared neck guard, and a golden crescent crest.
            ctx.fillEllipse(in: CGRect(x: c.x - r * 1.15, y: c.y - r * 0.6, width: r * 2.3, height: r * 1.95))
            ctx.move(to: at(at(c, up, r * 0.2), face, -r * 1.1))
            ctx.addLine(to: at(at(c, up, -r * 0.75), face, -r * 2.1))
            ctx.addLine(to: at(at(c, up, -r * 1.05), face, -r * 1.5))
            ctx.addLine(to: at(at(c, up, -r * 0.4), face, -r * 0.4))
            ctx.closePath()
            ctx.fillPath()
            let root = at(at(c, up, r * 0.95), face, r * 0.35)
            ctx.setStrokeColor(build.accent.cg())
            ctx.setLineWidth(r * 0.26)
            ctx.move(to: at(at(root, face, r * 1.2), up, r * 1.5))
            ctx.addQuadCurve(to: at(at(root, face, -r * 1.2), up, r * 1.6), control: at(root, up, -r * 0.4))
            ctx.strokePath()
            // Shoulder plates.
            let plate = at(c, up, -r * 2.2)
            ctx.setFillColor(body)
            ctx.fill(CGRect(x: plate.x - r * 1.6, y: plate.y - r * 0.9, width: r * 3.2, height: r * 0.9))
        }
    }
}
