import Foundation
#if canImport(CoreGraphics)
import CoreGraphics
#endif
import RoninCore

/// Who is drawn.
public enum Cast: Hashable, Sendable {
    case hero
    case foe(Kind)
}

/// The ronin's cuts, taken from the classical sword schools, so that no two in a row look alike.
public enum Cut: Int, CaseIterable, Hashable, Sendable {
    /// Kesa-giri: from hassō, the blade upright beside the head, diagonally down through the collarbone.
    case kesa
    /// Gyaku-kesa (kiri-age): from waki-gamae, the blade low behind the hip, rising up across the body.
    case gyaku
    /// Shōmen-uchi: from jōdan, straight down the centre on a stamping lunge (fumikomi), the arms driven out level.
    case shomen
    /// Dō-giri: a level cut through the waist; seen side-on, the blade comes round from behind and shortens as it
    /// passes toward the eye.
    case dou
    /// Morote-zuki: a two-handed thrust at the end of a long lunge.
    case tsuki
    /// Sune-giri: dropping into a deep lunge to cut at the shins.
    case sune
    /// Nukitsuke: the draw and the cut in one motion, one-handed, as the other hand pulls the scabbard back
    /// (saya-biki). It opens every stage.
    case nukitsuke
}

public enum Frame: Hashable, Sendable {
    /// Standing, breathing (the ronin: 8 frames, in chūdan; foes: 6).
    case idle(Int)
    /// The ronin before the first cut of a stage: blade sheathed, hand on the hilt, hips low (iai-goshi). 6 frames.
    case iai(Int)
    /// 12 frames a stride.
    case walk(Int)
    /// Gathering (0, 1), raised (2), coiled to strike (3). The archer: raising the bow, and drawing it open.
    case windup(Int)
    /// The blow (0), its follow-through (1), and recovering (2).
    case strike(Int)
    /// Rocked back by a cut (0) and finding his feet (1).
    case stagger(Int)
    case leap, aim, loose
    /// Cut down: thrown back (0), the knees going (1), toppling (2), and lying dead on his back (3).
    case die(Int)
    /// The warlord behind his raised blade, waiting to turn a cut aside.
    case block
    /// A cut, in seven frames: chambered (furikaburi), the swing with the wrists still cocked, the blade whipping
    /// through, full extension on the lunge, the follow-through, zanshin, and back toward guard.
    case cut(Cut, Int)
    /// Off balance after a cut at nothing (2 frames).
    case stumble(Int)
    /// A cut turned aside by the warlord's guard: the blade thrown back, the ronin rocked onto his heels (2 frames).
    case repelled(Int)
    /// Taking a blow: the impact, reeling, and bracing back into guard.
    case hurt(Int)
    /// After a stage: ō-chiburi, the blood flung from the blade (4 frames), and nōtō, the blade slid home (3).
    case flourish(Int)
    /// Falling: struck, the knees buckling, kneeling over the planted sword, toppling, face down in the dirt.
    case fall(Int)

    public static let walkFrames = 12
    public static let foeIdleFrames = 6
    public static let heroIdleFrames = 8
    public static let iaiFrames = 6
    public static let cutFrames = 10
    public static let flourishFrames = 7
    public static let windupFrames = 4
    public static let strikeFrames = 3
    public static let hurtFrames = 3
    public static let fallFrames = 5
    public static let dieFrames = 4
}

/// A pose, as angles and holds. Limb and blade angles are measured from straight down: +π/2 points forward (the
/// way the figure faces), π straight up, −π/2 back. A hold is where a hand is, from the shoulder, in figure heights
/// (x forward, y up); the arm reaches there with a bent elbow.
public struct Pose: Sendable {
    public enum Grip: Sendable {
        /// Both hands on the hilt (or the shaft): the sword hand at the guard, the other at the pommel.
        case two
        /// One hand; the other free (`arm2`, or `hold2`).
        case one
        /// The sword hand alone, the other at the scabbard's mouth: drawing and sheathing.
        case saya
    }

    /// A blade's sweep drawn as a trailing arc from one angle to another, squashed toward a level plane when `flat`
    /// is below 1; or for a thrust, speed lines along the blade.
    public struct Smear: Sendable {
        public var from: CGFloat
        public var to: CGFloat
        public var strength: CGFloat
        public var flat: CGFloat = 1
        public var thrust = false
    }

    public var lean: CGFloat = 0.08
    public var lift: CGFloat = 0
    public var shift: CGFloat = 0
    public var front: (thigh: CGFloat, shin: CGFloat) = (0.38, 0.1)
    public var back: (thigh: CGFloat, shin: CGFloat) = (-0.38, -0.28)
    public var arm: (upper: CGFloat, fore: CGFloat) = (0.6, 1.3)
    public var arm2: (upper: CGFloat, fore: CGFloat) = (0.4, 1.2)
    public var hold: CGPoint?
    public var hold2: CGPoint?
    public var grip = Grip.one
    public var blade: CGFloat = 2.0
    public var blade2: CGFloat = -2.2
    /// Below 1, the blade swings in a level plane seen side-on: its rise and fall are squashed, so it shortens as it
    /// comes round toward the eye.
    public var flat: CGFloat = 1
    /// The whole body turned about the hips, toward the way he faces (a fall forward) or away (a fall back); and
    /// whether it is then let down to lie on the ground.
    public var roll: CGFloat = 0
    public var grounded = false
    /// Whether the weapon is in hand (a dead man has let go of his).
    public var armed = true
    /// A smear frame: where the arms and weapon were earlier in this motion (oldest first), drawn behind the pose as
    /// fading multiples with a solid sweep of ink between the blades; and how far the body was carried in it (figure
    /// heights; forward is positive), drawn as echoes trailing behind it.
    public var ghosts: [Pose] = []
    public var drag: CGFloat = 0
    /// How much of the ronin's blade is in its scabbard, 0…1.
    public var sheathed: CGFloat = 0
    /// How far the scabbard is pulled back for the draw (saya-biki), 0…1.
    public var saya: CGFloat = 0
    /// How far a bow is drawn, 0…1.
    public var draw: CGFloat = 0
    public var tilt: CGFloat = 0
    /// In the air: the hips stay put instead of the lower foot finding the ground.
    public var airborne = false
    /// Where cloth (ribbons, coat tails, banners) is in its flutter, 0…1.
    public var wave: CGFloat = 0
    /// How hard cloth streams back (0 at rest, 1 in a hard swing).
    public var stream: CGFloat = 0
    public var smear: Smear?

    public init() {}

    static func mix(_ a: Pose, _ b: Pose, _ t: CGFloat) -> Pose {
        func m(_ x: CGFloat, _ y: CGFloat) -> CGFloat { x + (y - x) * t }
        func mp(_ x: CGPoint?, _ y: CGPoint?) -> CGPoint? {
            guard let x, let y else { return y }
            return CGPoint(x: m(x.x, y.x), y: m(x.y, y.y))
        }
        var p = b
        p.lean = m(a.lean, b.lean)
        p.lift = m(a.lift, b.lift)
        p.shift = m(a.shift, b.shift)
        p.front = (m(a.front.thigh, b.front.thigh), m(a.front.shin, b.front.shin))
        p.back = (m(a.back.thigh, b.back.thigh), m(a.back.shin, b.back.shin))
        p.arm = (m(a.arm.upper, b.arm.upper), m(a.arm.fore, b.arm.fore))
        p.arm2 = (m(a.arm2.upper, b.arm2.upper), m(a.arm2.fore, b.arm2.fore))
        p.hold = mp(a.hold, b.hold)
        p.hold2 = mp(a.hold2, b.hold2)
        p.blade = m(a.blade, b.blade)
        p.blade2 = m(a.blade2, b.blade2)
        p.flat = m(a.flat, b.flat)
        p.roll = m(a.roll, b.roll)
        p.sheathed = m(a.sheathed, b.sheathed)
        p.saya = m(a.saya, b.saya)
        p.draw = m(a.draw, b.draw)
        p.tilt = m(a.tilt, b.tilt)
        p.stream = m(a.stream, b.stream)
        p.wave = m(a.wave, b.wave)
        p.smear = nil
        p.ghosts = []
        p.drag = 0
        return p
    }

    /// The in-betweens of a motion from `a` to `b`, oldest first: for a smear frame.
    static func between(_ a: Pose, _ b: Pose, _ fractions: [CGFloat] = [0.2, 0.42, 0.62, 0.8]) -> [Pose] {
        fractions.map { mix(a, b, $0) }
    }
}

/// How a figure is built and dressed.
public struct Build: Sendable {
    public enum Weapon: Sendable { case katana, spear, knife, club, twin, bow, nodachi }
    public enum Gear: Sendable { case topknot, jingasa, hood, horns, ponytail, eboshi, kabuto }
    public enum Legs: Sendable { case hakama, leggings, bare }
    public enum Back: Sendable { case none, quiver, banner, coat }

    /// Height relative to the ronin's.
    public var height: CGFloat
    /// How heavy the limbs are (1 is the ronin).
    public var bulk: CGFloat = 1
    /// Chest depth and waist, as shares of the height.
    public var chest: CGFloat = 0.17
    public var waist: CGFloat = 0.074
    public var head: CGFloat = 0.053
    /// How loose the clothes hang: 0 fitted, 1 the ronin's baggy hakama, great sleeves and full coat.
    public var baggy: CGFloat = 0
    public var legs = Legs.hakama
    public var sleeves = false
    /// A kimono skirt (or armoured tassets) hanging from the waist, as a share of the height.
    public var skirt: CGFloat = 0
    public var plated = false
    public var scabbard = false
    public var weapon: Weapon
    public var gear: Gear
    public var back = Back.none
    public var eyes: RGB?
    public var accent: RGB

    public static func of(_ cast: Cast) -> Build {
        switch cast {
        case .hero:
            return Build(height: 1, baggy: 1, sleeves: true, scabbard: true, weapon: .katana, gear: .topknot, back: .coat, eyes: nil,
                         accent: Palette.blood)
        case .foe(let kind):
            switch kind {
            case .grunt:
                return Build(height: 0.95, bulk: 1.0, legs: .leggings, skirt: 0.14, weapon: .spear, gear: .jingasa,
                             eyes: RGB(1, 0.22, 0.12), accent: RGB(0.75, 0.12, 0.1))
            case .runner:
                return Build(height: 0.9, bulk: 0.94, chest: 0.16, waist: 0.066, legs: .leggings, weapon: .knife, gear: .hood,
                             eyes: RGB(1, 0.6, 0.12), accent: RGB(1, 0.5, 0.1))
            case .brute:
                return Build(height: 1.22, bulk: 1.38, chest: 0.26, waist: 0.12, head: 0.047, legs: .bare, skirt: 0.1,
                             weapon: .club, gear: .horns, eyes: RGB(1, 0.2, 0.1), accent: RGB(0.72, 0.32, 1.0))
            case .dancer:
                return Build(height: 0.97, bulk: 0.92, chest: 0.155, waist: 0.064, weapon: .twin, gear: .ponytail,
                             eyes: RGB(0.3, 0.95, 1.0), accent: RGB(0.25, 0.9, 1.0))
            case .archer:
                return Build(height: 0.96, bulk: 0.96, chest: 0.165, waist: 0.07, sleeves: true, weapon: .bow, gear: .eboshi, back: .quiver,
                             eyes: RGB(0.6, 1.0, 0.3), accent: RGB(0.5, 0.9, 0.3))
            case .warlord:
                return Build(height: 1.3, bulk: 1.15, chest: 0.21, waist: 0.092, head: 0.05, sleeves: true, skirt: 0.18, plated: true,
                             weapon: .nodachi, gear: .kabuto, back: .banner, eyes: RGB(1, 0.78, 0.2), accent: Palette.gold)
            }
        }
    }

    /// For a weapon held in both hands, how far behind the sword hand the other one grips, in figure heights.
    var span: CGFloat? {
        switch weapon {
        case .katana: return 0.085
        case .nodachi: return 0.11
        case .spear: return 0.2
        case .club: return 0.09
        case .knife, .twin, .bow: return nil
        }
    }

    /// How far a weapon reaches from the hand, in figure heights: the radius of the trail its swing leaves.
    var reach: CGFloat {
        switch weapon {
        case .katana: return 0.6
        case .nodachi: return 0.78
        case .spear: return 0.8
        case .club: return 0.62
        case .knife: return 0.26
        case .twin: return 0.42
        case .bow: return 0.5
        }
    }
}

private func v(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x, y: y) }

/// The figures: their frames, their poses, and how each is drawn.
///
/// The figures are cut rather than rounded: faceted muscle along each limb, sharp knees and elbows, a deep chest
/// over a narrow waist, a small head on a long frame (about nine heads tall), slender curved blades, cloth that
/// ends in points. Each kind keeps an outline of its own at 60 points tall. The ronin, who is the show, is drawn at
/// a higher resolution and has the most frames: seven for every cut, a breathing guard, the iai stance with the
/// blade sheathed, and the chiburi and nōtō at the end of a stage.
///
/// The swordsmanship follows the classical schools: two hands on the hilt, the right at the guard and the left at
/// the pommel; each cut from the kamae it is taught from (hassō, waki-gamae, jōdan, chūdan), the hands leading and
/// the blade whipping through after them as the wrists uncock; a stamping lunge under the big cuts; zanshin after.
public enum Figure {
    /// The canvas around a figure, in figure heights, and where its feet stand on it.
    public static let canvas = CGSize(width: 2.5, height: 1.74)
    public static let feet = CGPoint(x: 1.25, y: 0.1)
    public static var anchor: CGPoint { CGPoint(x: feet.x / canvas.width, y: feet.y / canvas.height) }

    /// Texture pixels for a figure one ronin tall: the ronin gets more, since he is the one you watch.
    public static func pixelHeight(_ cast: Cast) -> CGFloat { cast == .hero ? 172 : 118 }

    public static func frames(for cast: Cast) -> [Frame] {
        switch cast {
        case .hero:
            var frames: [Frame] = (0..<Frame.heroIdleFrames).map { .idle($0) }
            frames += (0..<Frame.iaiFrames).map { .iai($0) }
            for cut in Cut.allCases { frames += (0..<Frame.cutFrames).map { .cut(cut, $0) } }
            frames += [.stumble(0), .stumble(1), .repelled(0), .repelled(1)]
            frames += (0..<Frame.hurtFrames).map { .hurt($0) } + (0..<Frame.fallFrames).map { .fall($0) }
            return frames + (0..<Frame.flourishFrames).map { .flourish($0) }
        case .foe(let kind):
            var frames: [Frame] = (0..<Frame.foeIdleFrames).map { .idle($0) }
            frames += (0..<Frame.walkFrames).map { .walk($0) }
            frames += (0..<Frame.windupFrames).map { .windup($0) } + (0..<Frame.strikeFrames).map { .strike($0) }
            frames += [.stagger(0), .stagger(1)] + (0..<Frame.dieFrames).map { .die($0) }
            if kind == .dancer || kind == .warlord { frames.append(.leap) }
            if kind == .warlord { frames.append(.block) }
            if kind == .archer { frames += [.aim, .loose] }
            return frames
        }
    }

    /// Draws one frame (`armed: false` leaves the weapon out).
    public static func sketch(_ cast: Cast, _ frame: Frame, armed: Bool = true) -> Sketch {
        var pose = pose(cast, frame)
        pose.armed = pose.armed && armed
        return sketch(cast, pose: pose)
    }

    /// Draws a figure in any pose.
    public static func sketch(_ cast: Cast, pose: Pose) -> Sketch {
        let build = Build.of(cast)
        let H = pixelHeight(cast) * build.height
        var drawer = Drawer(pose: pose, build: build, H: H)
        drawer.draw()
        var sketch = drawer.pen.sketch
        if pose.roll != 0 {
            // Turned about the hips, then (lying) let down until the lowest point rests on the ground.
            let pivot = drawer.hip, r = pose.roll
            sketch = sketch.mapped { p in
                let x = p.x - pivot.x, y = p.y - pivot.y
                return CGPoint(x: pivot.x + x * cos(r) + y * sin(r), y: pivot.y - x * sin(r) + y * cos(r))
            }
            if pose.grounded {
                let low = sketch.body.flatMap(\.points).map(\.y).min() ?? 0
                let drop = Figure.feet.y * H - 0.006 * H - low
                sketch = sketch.mapped { CGPoint(x: $0.x, y: $0.y + drop) }
            }
        }
        sketch.rimRadius = max(1.1, H * 0.008)
        return sketch
    }

    /// A figure's weapon on its own, lying level (the point toward +x), on the figure's canvas: what it drops.
    public static func weapon(_ cast: Cast) -> Sketch {
        let build = Build.of(cast)
        let H = pixelHeight(cast) * build.height
        var pose = stance(cast)
        pose.blade = .pi / 2
        pose.blade2 = .pi / 2
        pose.draw = 0
        pose.sheathed = 0
        var drawer = Drawer(pose: pose, build: build, H: H)
        let centre = CGPoint(x: Figure.canvas.width * H / 2, y: Figure.canvas.height * H / 2)
        if build.weapon == .bow {
            // A bow lies on its back, the string up.
            pose.blade = .pi
            drawer = Drawer(pose: pose, build: build, H: H)
        }
        drawer.pen = Pen(width: drawer.pen.sketch.width, height: drawer.pen.sketch.height)
        drawer.weapon(centre, CGPoint(x: centre.x - 0.05 * H, y: centre.y - 0.03 * H))
        var sketch = drawer.pen.sketch
        sketch.rimRadius = max(1.1, H * 0.008)
        return sketch
    }

    /// Where the point of a figure's weapon is in a frame, from its feet, in its own heights (x toward the way it
    /// faces, y up); nil for a bow.
    public static func tip(_ cast: Cast, _ frame: Frame) -> CGPoint? {
        let build = Build.of(cast)
        let H = pixelHeight(cast) * build.height
        var drawer = Drawer(pose: pose(cast, frame), build: build, H: H)
        drawer.draw()
        return drawer.tip.map { CGPoint(x: ($0.x - feet.x * H) / H, y: ($0.y - feet.y * H) / H) }
    }

    /// Landmarks on a figure's body in a frame, in its canvas's pixels (y up): where to cut it apart.
    public struct Anatomy: Sendable {
        public var hip: CGPoint
        public var waist: CGPoint
        public var chest: CGPoint
        public var neck: CGPoint
        public var head: CGPoint
        public var headRadius: CGFloat
        public var knee: CGPoint
        /// The figure's height in pixels.
        public var height: CGFloat
    }

    public static func anatomy(_ cast: Cast, _ frame: Frame) -> Anatomy { anatomy(cast, pose: pose(cast, frame)) }

    public static func anatomy(_ cast: Cast, pose: Pose) -> Anatomy {
        let build = Build.of(cast)
        let H = pixelHeight(cast) * build.height
        let drawer = Drawer(pose: pose, build: build, H: H)
        let r = build.head * H
        return Anatomy(hip: drawer.hip, waist: drawer.torsoPoint(0.3, 0), chest: drawer.torsoPoint(0.68, 0), neck: drawer.neck,
                       head: CGPoint(x: drawer.neck.x + drawer.headUp.x * r * 1.25, y: drawer.neck.y + drawer.headUp.y * r * 1.25),
                       headRadius: r, knee: CGPoint(x: drawer.hip.x + sin(pose.front.thigh) * thigh * H, y: drawer.hip.y - cos(pose.front.thigh) * thigh * H),
                       height: H)
    }

    // MARK: Poses

    public static func pose(_ cast: Cast, _ frame: Frame) -> Pose {
        let build = Build.of(cast)
        let base = stance(cast)
        switch frame {
        case .idle(let k):
            let n = cast == .hero ? Frame.heroIdleFrames : Frame.foeIdleFrames
            return breathe(base, k, of: n)
        case .iai(let k):
            return breathe(iai(), k, of: Frame.iaiFrames)
        case .walk(let k):
            return walk(cast, k)
        case .windup(let k) where cast == .foe(.archer):
            // Kyūdō: the bow raised (uchiokoshi), then drawn open as it comes down (hikiwake).
            let raised = key(cast, .windup(0)), drawing = key(cast, .windup(1)), full = key(cast, .aim)
            switch k {
            case 0: return raised
            case 1: return Pose.mix(raised, drawing, 0.6)
            case 2: return drawing
            default: return Pose.mix(drawing, full, 0.6)
            }
        case .windup(let k):
            let raised = key(cast, .windup(1))
            switch k {
            case 0:
                var p = Pose.mix(base, raised, 0.3)
                p.lean -= 0.03
                return p
            case 1: return Pose.mix(base, raised, 0.72)
            case 2: return raised
            default: return key(cast, .windup(2))
            }
        case .strike(let k):
            switch k {
            case 0, 1:
                // Smear frames: the blow drawn as one motion from the coil (or on into the follow-through).
                var p = key(cast, .strike(k))
                guard cast != .foe(.archer) else { return p }
                var from = key(cast, k == 0 ? .windup(2) : .strike(0))
                // The kanabō comes over the top, not up from under.
                if cast == .foe(.brute), from.blade < 0, p.blade > 0 { from.blade += 2 * .pi }
                p.ghosts = Pose.between(from, p, k == 0 ? [0.2, 0.42, 0.62, 0.8] : [0.35, 0.7])
                p.drag = k == 0 ? 0.05 : 0.02
                return p
            default:
                // Recovering: the weapon comes back up the way it went down (the kanabō over the top).
                let blow = key(cast, .strike(1))
                var home = base
                if cast == .foe(.brute), home.blade < 0, blow.blade > 0 { home.blade += 2 * .pi }
                var p = Pose.mix(blow, home, 0.5)
                p.stream = 0.4
                return p
            }
        case .stagger(let k):
            let reel = key(cast, .stagger(0))
            return k == 0 ? reel : Pose.mix(reel, base, 0.5)
        case .die(let k):
            return die(cast, k)
        case .cut(let cut, let phase):
            return swing(cut, phase)
        case .flourish(let k):
            return flourish(k)
        case .stumble(0) where cast == .hero, .repelled(0) where cast == .hero:
            // Carried past the mark, or flung back off a guard: smeared.
            var p = key(cast, frame)
            p.ghosts = Pose.between(stance(.hero), p, [0.35, 0.7])
            p.drag = frame == .stumble(0) ? 0.04 : -0.04
            return p
        case .hurt(0) where cast == .hero:
            var p = key(cast, frame)
            p.drag = -0.04
            return p
        case .leap:
            var p = key(cast, frame)
            p.drag = 0.06
            return p
        default:
            return key(cast, frame)
        }
    }

    /// How a figure walks: how far each thigh swings, how high the knee folds as the leg comes through, how far it
    /// gives under the weight, how much the hips rise and fall (and leave the ground, running), how far the body
    /// leans and rocks, how the free arm swings and the weapon rides.
    struct Gait {
        var swing: CGFloat
        var knee: CGFloat
        var sink: CGFloat
        var bob: CGFloat
        var lean: CGFloat
        var sway: CGFloat
        var rock: CGFloat
        var arms: CGFloat
        var carry: CGFloat
        var flight: CGFloat = 0
    }

    static func gait(_ cast: Cast) -> Gait {
        switch cast {
        case .hero: return Gait(swing: 0.36, knee: 0.9, sink: 0.12, bob: 0.008, lean: 0.03, sway: 0.02, rock: 0.02, arms: 0.3, carry: 0.01)
        case .foe(let kind):
            switch kind {
            // The ashigaru: a drilled march, spear level, knees coming well up.
            case .grunt: return Gait(swing: 0.4, knee: 1.0, sink: 0.14, bob: 0.01, lean: 0.05, sway: 0.02, rock: 0.025, arms: 0.3, carry: 0.014)
            // The shinobi: a low sprint, heels kicking high, both feet off the ground as the legs pass.
            case .runner:
                return Gait(swing: 0.64, knee: 1.6, sink: 0.22, bob: 0.012, lean: 0, sway: 0.03, rock: 0.04, arms: 0.35, carry: 0, flight: 0.03)
            // The oni: a heavy, rolling stomp, sinking deep into each step, the head rocking, the club bouncing.
            case .brute: return Gait(swing: 0.3, knee: 0.75, sink: 0.26, bob: 0.024, lean: 0.05, sway: 0.06, rock: 0.09, arms: 0.2, carry: 0.022)
            // The dancer: long, gliding steps, level hips, the blades trailing and turning with the stride.
            case .dancer: return Gait(swing: 0.52, knee: 1.05, sink: 0.08, bob: 0.004, lean: 0.03, sway: 0.015, rock: 0.02, arms: 0.16, carry: 0)
            // The archer: a wary, bent-kneed stalk, the bow held ready.
            case .archer: return Gait(swing: 0.34, knee: 0.85, sink: 0.2, bob: 0.006, lean: 0.07, sway: 0.015, rock: 0.015, arms: 0.28, carry: 0.01)
            // The warlord: a slow, upright march that hardly moves the blade.
            case .warlord: return Gait(swing: 0.33, knee: 0.66, sink: 0.1, bob: 0.004, lean: 0, sway: 0.01, rock: 0.012, arms: 0, carry: 0.005)
            }
        }
    }

    /// How far a figure travels in one full stride (two steps), in its own heights: so its feet keep to the ground.
    public static func stride(_ cast: Cast) -> CGFloat { 4 * (thigh + shin) * 0.97 * sin(gait(cast).swing) }

    /// A walking frame. Each leg swings on its own phase: through the stance the foot holds the ground as the body
    /// passes over it, the knee giving a little under the weight; through the swing the knee folds and the foot comes
    /// forward clear of the ground, reaching out straight for the next step.
    static func walk(_ cast: Cast, _ k: Int) -> Pose {
        var p = stance(cast)
        let g = gait(cast)
        let phase = CGFloat(k) / CGFloat(Frame.walkFrames) * 2 * .pi
        func leg(_ phi: CGFloat) -> (thigh: CGFloat, shin: CGFloat) {
            let thigh = g.swing * sin(phi)
            let swinging = max(0, cos(phi)), loaded = max(0, -cos(phi)) * max(0, sin(phi))
            return (thigh, thigh - g.knee * pow(swinging, 1.3) - g.sink * loaded + 0.04)
        }
        p.front = leg(phase)
        p.back = leg(phase + .pi)
        // Up as the legs pass, down as they spread; running, off the ground altogether for a moment.
        p.lift = g.bob * cos(2 * phase) + g.flight * max(0, cos(2 * phase))
        p.lean += g.lean + g.sway * cos(2 * phase)
        p.tilt = g.rock * sin(phase)
        p.wave = CGFloat(k) / CGFloat(Frame.walkFrames)
        p.stream = 0.25 + 3 * g.swing * g.swing
        // The free arm swings against the near leg; a weapon held rides the stride.
        p.arm2.upper -= g.arms * sin(phase)
        p.arm2.fore -= g.arms * 0.6 * sin(phase)
        if let hold = p.hold { p.hold = v(hold.x + g.carry * 0.5 * sin(phase), hold.y + g.carry * cos(2 * phase)) }
        p.blade += g.carry * 3 * sin(phase)
        switch cast {
        case .foe(.runner):
            // Bent low, both arms swept back, pumping.
            p.lean = 0.6 + 0.03 * cos(2 * phase)
            p.hold = nil
            p.arm = (-1.25 + 0.3 * sin(phase), -0.95 + 0.2 * sin(phase))
            p.arm2 = (-1.05 - 0.3 * sin(phase), -0.7 - 0.2 * sin(phase))
            p.blade = -1.75
        case .foe(.brute):
            p.blade += 0.08 * cos(2 * phase)
        case .foe(.dancer):
            // The arms flow with the stride, the blades trailing behind them.
            p.arm.upper += 0.12 * sin(phase)
            p.arm2.upper -= 0.12 * sin(phase)
            p.blade += 0.12 * sin(phase + 0.6)
            p.blade2 -= 0.12 * sin(phase + 0.6)
        default:
            break
        }
        return p
    }

    /// Breathing: the chest rises and settles, the point of the blade drifts, the cloth stirs.
    private static func breathe(_ base: Pose, _ k: Int, of n: Int) -> Pose {
        var p = base
        let t = CGFloat(k) / CGFloat(n) * 2 * .pi
        p.lean += 0.014 * sin(t)
        p.lift = 0.004 * sin(t)
        p.front.shin += 0.025 * sin(t)
        p.back.shin -= 0.025 * sin(t)
        p.arm.upper += 0.025 * cos(t)
        p.arm2.upper += 0.02 * cos(t)
        if let hold = p.hold { p.hold = v(hold.x + 0.004 * cos(t), hold.y + 0.007 * sin(t)) }
        p.blade += 0.03 * cos(t)
        p.wave = CGFloat(k) / CGFloat(n)
        p.stream = 0.12
        return p
    }

    /// The pose each figure stands in.
    static func stance(_ cast: Cast) -> Pose {
        var p = Pose()
        switch cast {
        case .hero:
            // Chūdan-no-kamae: feet a stride apart, knees soft, both hands low on the hilt, the point at the throat
            // of whoever comes.
            p.lean = 0.1
            p.front = (0.48, 0.16)
            p.back = (-0.5, -0.36)
            p.grip = .two
            p.hold = v(0.19, -0.19)
            p.blade = 2.02
        case .foe(let kind):
            switch kind {
            case .grunt:
                // An ashigaru's yari, held low at the hip, the point raised at the ronin's chest.
                p.lean = 0.1
                p.front = (0.42, 0.12)
                p.back = (-0.42, -0.3)
                p.grip = .two
                p.hold = v(0.17, -0.16)
                p.blade = 1.45
            case .runner:
                // Crouched, the knife reversed along the forearm (sakate), the free hand out for balance.
                p.lean = 0.42
                p.front = (0.62, 0.24)
                p.back = (-0.55, -0.62)
                p.hold = v(0.15, -0.12)
                p.arm2 = (-0.7, -0.25)
                p.blade = -0.35
            case .brute:
                // The kanabō over the shoulder.
                p.lean = 0.16
                p.front = (0.38, 0.12)
                p.back = (-0.38, -0.25)
                p.grip = .two
                p.hold = v(0.07, -0.1)
                p.blade = -2.45
            case .dancer:
                p.lean = 0.18
                p.front = (0.5, 0.18)
                p.back = (-0.5, -0.4)
                p.arm = (1.05, 1.65)
                p.arm2 = (-0.75, -0.35)
                p.blade = 2.3
                p.blade2 = 3.98
            case .archer:
                // The bow carried upright at the side, the arrow hand hanging.
                p.hold = v(0.1, -0.3)
                p.arm2 = (0.1, 0.3)
                p.blade = 1.45
            case .warlord:
                // Hassō with the nodachi: the long blade upright beside the helmet.
                p.lean = 0.08
                p.front = (0.45, 0.15)
                p.back = (-0.45, -0.3)
                p.grip = .two
                p.hold = v(0.07, 0.0)
                p.blade = 3.3
            }
        }
        return p
    }

    /// The ronin's iai stance: blade sheathed, the sword hand resting on the hilt, the other at the scabbard's mouth,
    /// hips low and ready to draw.
    static func iai() -> Pose {
        var p = stance(.hero)
        p.lean = 0.16
        p.front = (0.58, 0.3)
        p.back = (-0.52, -0.6)
        p.grip = .saya
        p.hold = nil
        p.sheathed = 1
        p.blade = -0.95
        return p
    }

    /// A long stamping lunge: the front knee driven out over the foot, the back leg thrown out straight behind, the
    /// body laid along the line of it.
    private static func lunge(_ p: inout Pose, _ lean: CGFloat, deep: CGFloat = 1) {
        p.lean = lean
        p.shift = 0.045 * deep
        p.front = (0.98 * deep, 0.36)
        p.back = (-0.8 * deep, -1.0 * deep)
        p.stream = 0.8
    }

    private static func recoil(_ p: inout Pose) {
        p.lean = -0.34
        p.shift = -0.03
        p.front = (0.4, 0.1)
        p.back = (-0.22, -0.42)
        p.arm2 = (-0.8, -0.3)
        p.tilt = -0.35
        p.stream = 0.5
    }

    private static func sweep(_ from: CGFloat, _ to: CGFloat, _ strength: CGFloat, thrust: Bool = false) -> Pose.Smear {
        Pose.Smear(from: from, to: to, strength: strength, thrust: thrust)
    }

    /// Key poses: the raised weapon, the blow, the stagger, the leap, the bow, the guard; the ronin's stumbles,
    /// wounds and fall.
    private static func key(_ cast: Cast, _ frame: Frame) -> Pose {
        var p = stance(cast)
        if frame == .stagger(0) || frame == .hurt(0) || frame == .hurt(1) || frame == .fall(0) { recoil(&p) }
        switch cast {
        case .hero:
            switch frame {
            case .stumble(let k):
                // Overreached: the blade carried down past its mark, the body pitched after it.
                p.lean = k == 0 ? 0.62 : 0.42
                p.shift = 0.05
                p.front = k == 0 ? (1.05, 0.85) : (0.85, 0.55)
                p.back = k == 0 ? (-0.1, -0.95) : (-0.3, -0.8)
                p.hold = k == 0 ? v(0.26, -0.3) : v(0.24, -0.24)
                p.blade = k == 0 ? 0.42 : 0.85
                p.tilt = 0.35
                p.stream = 0.7
            case .repelled(let k):
                // The blade knocked back over the shoulder, the ronin rocked back on his heels.
                p.lean = k == 0 ? -0.3 : -0.12
                p.shift = -0.04
                p.front = k == 0 ? (0.62, 0.05) : (0.55, 0.12)
                p.back = k == 0 ? (-0.18, -0.5) : (-0.35, -0.45)
                p.hold = k == 0 ? v(0.1, 0.16) : v(0.16, 0.0)
                p.blade = k == 0 ? 3.55 : 2.7
                p.tilt = k == 0 ? -0.3 : -0.1
                p.stream = 0.6
            case .hurt(let k):
                if k == 0 {
                    p.hold = v(0.12, -0.14)
                    p.blade = 1.45
                } else if k == 1 {
                    // Reeling, the blow still going through him.
                    p.lean = -0.42
                    p.tilt = -0.5
                    p.back = (-0.12, -0.6)
                    p.hold = v(0.08, -0.1)
                    p.blade = 1.75
                    p.stream = 0.7
                } else {
                    // Bracing back into guard.
                    p = Pose.mix(p, stance(.hero), 0.25)
                    p.lean = -0.05
                    p.front = (0.65, 0.3)
                    p.hold = v(0.17, -0.17)
                    p.blade = 1.9
                }
            case .fall(let k):
                switch k {
                case 0:
                    p.hold = v(0.1, -0.16)
                    p.blade = 1.2
                case 1:
                    // The knees going, the point dropping.
                    p.lean = 0.3
                    p.front = (1.3, 0.3)
                    p.back = (-0.4, -1.3)
                    p.hold = v(0.18, -0.26)
                    p.blade = 0.45
                    p.tilt = 0.3
                case 2:
                    // On one knee, both hands on the hilt of the sword planted before him.
                    p.lean = 0.5
                    p.front = (1.5, 0.1)
                    p.back = (-0.5, -1.55)
                    p.hold = v(0.2, -0.22)
                    p.blade = 0.12
                    p.tilt = 0.55
                    p.stream = 0.05
                default:
                    // The hands slip from the hilt and he goes over, face down beside his sword.
                    p.lean = 0.55
                    p.front = k == 3 ? (1.45, 0.2) : (0.2, 0.3)
                    p.back = k == 3 ? (-0.5, -1.45) : (-0.05, 0.1)
                    // The arms go out ahead of him (over his head, before the turn) and the sword lies beyond them.
                    p.grip = .one
                    p.hold = nil
                    p.arm = k == 3 ? (2.3, 2.2) : (2.95, 3.05)
                    p.arm2 = k == 3 ? (2.1, 2.0) : (2.75, 2.9)
                    p.blade = k == 3 ? 2.5 : 3.25
                    p.tilt = 0.6
                    p.roll = k == 3 ? 0.75 : 1.5
                    p.grounded = true
                    p.stream = 0
                    p.wave = 0.5
                }
            default:
                break
            }
        case .foe(let kind):
            switch (kind, frame) {
            // The spearman: draws the shaft back to his hip, then drives it out on a long step.
            case (.grunt, .windup(1)):
                p.lean = -0.1
                p.shift = -0.02
                p.back = (-0.3, -0.58)
                p.hold = v(-0.03, -0.12)
                p.blade = 1.54
            case (.grunt, .windup(2)):
                // Coiled: the weight sunk on the back leg, the front foot light, the shaft drawn right back.
                p.lean = -0.17
                p.shift = -0.035
                p.front = (0.62, 0.42)
                p.back = (-0.22, -0.72)
                p.hold = v(-0.09, -0.1)
                p.blade = 1.62
            case (.grunt, .strike(let k)):
                lunge(&p, k == 0 ? 0.34 : 0.26, deep: k == 0 ? 1.1 : 0.9)
                p.hold = k == 0 ? v(0.12, -0.1) : v(0.08, -0.12)
                p.blade = k == 0 ? 1.57 : 1.52
                if k == 0 { p.smear = sweep(1.57, 1.57, 0.9, thrust: true) }
            // The shinobi: springs from a crouch and slashes across on the way through.
            case (.runner, .windup(1)):
                p.lean = 0.3
                p.front = (0.8, 0.5)
                p.back = (-0.5, -1.0)
                p.hold = v(0.02, 0.1)
                p.blade = 3.3
                p.arm2 = (0.9, 1.4)
            case (.runner, .windup(2)):
                p.lean = 0.36
                p.front = (0.95, 0.65)
                p.back = (-0.45, -1.15)
                p.hold = v(-0.02, 0.14)
                p.blade = 3.55
                p.arm2 = (1.0, 1.5)
            case (.runner, .strike(let k)):
                lunge(&p, k == 0 ? 0.55 : 0.45, deep: 1.15)
                p.hold = k == 0 ? v(0.28, -0.14) : v(0.2, -0.24)
                p.blade = k == 0 ? 0.95 : 0.5
                p.arm2 = (-1.3, -0.9)
                if k == 0 { p.smear = sweep(3.2, 0.95, 0.9) }
            // The oni: the kanabō raised high behind the head, then brought down into the ground.
            case (.brute, .windup(1)):
                p.lean = -0.1
                p.hold = v(0.02, 0.24)
                p.blade = -2.33
            case (.brute, .windup(2)):
                p.lean = -0.2
                p.lift = 0.02
                p.front = (0.5, 0.25)
                p.hold = v(-0.02, 0.27)
                p.blade = -1.98
            case (.brute, .strike(let k)):
                lunge(&p, k == 0 ? 0.48 : 0.58, deep: 1.05)
                p.hold = k == 0 ? v(0.12, -0.2) : v(0.1, -0.28)
                p.blade = k == 0 ? 0.72 : 0.6
                if k == 0 { p.smear = sweep(3.8, 0.72, 0.8) }
            case (.brute, .stagger(0)):
                p.hold = v(0.08, -0.12)
                p.blade = -2.2
            // The blade dancer: both blades crossed high, then scissored down and out.
            case (.dancer, .windup(1)), (.dancer, .windup(2)):
                let coil: CGFloat = frame == .windup(2) ? 1 : 0
                p.lean = 0.1 - 0.06 * coil
                p.front = (0.55, 0.3 + 0.15 * coil)
                p.back = (-0.5, -0.6 - 0.2 * coil)
                p.arm = (2.6 + 0.1 * coil, 2.95)
                p.arm2 = (2.3 + 0.1 * coil, 2.65)
                p.blade = 2.45 - 0.1 * coil
                p.blade2 = 3.75 + 0.1 * coil
            case (.dancer, .strike(let k)):
                lunge(&p, k == 0 ? 0.42 : 0.36)
                p.arm = k == 0 ? (1.3, 1.1) : (1.05, 0.8)
                p.arm2 = k == 0 ? (0.4, -0.2) : (-0.6, -0.5)
                p.blade = k == 0 ? 0.68 : 0.5
                p.blade2 = k == 0 ? -0.9 : -1.4
                if k == 0 { p.smear = sweep(2.5, 0.68, 0.8) }
            case (.dancer, .leap), (.warlord, .leap):
                p.airborne = true
                p.lean = 0.3
                p.front = (1.8, 0.3)
                p.back = (1.3, -0.2)
                if kind == .dancer {
                    p.arm = (1.8, 2.2)
                    p.arm2 = (-1.8, -2.2)
                    p.blade = 2.8
                    p.blade2 = 3.48
                } else {
                    p.hold = v(0.04, 0.24)
                    p.blade = 3.7
                }
                p.wave = 0.75
                p.stream = 1
            // The archer, after kyūdō: the bow raised over the head (uchiokoshi), drawn open as it comes down
            // (hikiwake), held at full draw (kai), and the release (hanare), the string hand flung back.
            case (.archer, .windup(0)):
                p.lean = 0.02
                p.hold = v(0.1, 0.11)
                p.hold2 = v(0.02, 0.09)
                p.blade = 1.57
                p.draw = 0.05
            case (.archer, .windup(_)):
                p.lean = 0.02
                p.hold = v(0.24, 0.13)
                p.hold2 = v(-0.02, 0.1)
                p.blade = 1.57
                p.draw = 0.5
            case (.archer, .aim):
                p.lean = 0.0
                p.front = (0.4, 0.1)
                p.back = (-0.44, -0.3)
                p.hold = v(0.315, 0.07)
                p.hold2 = v(-0.09, 0.07)
                p.blade = 1.57
                p.draw = 1
            case (.archer, .loose), (.archer, .strike(_)):
                p.lean = 0.0
                p.front = (0.4, 0.1)
                p.back = (-0.44, -0.3)
                p.hold = v(0.315, 0.07)
                p.hold2 = v(-0.28, 0.1)
                p.blade = 1.57
            // The warlord: jōdan with the long blade and a huge stamping cut; a guard like a wall.
            case (.warlord, .windup(1)):
                p.lean = -0.04
                p.hold = v(0.03, 0.26)
                p.blade = 4.0
            case (.warlord, .windup(2)):
                p.lean = -0.2
                p.lift = 0.02
                p.front = (0.62, 0.38)
                p.back = (-0.36, -0.55)
                p.hold = v(-0.04, 0.29)
                p.blade = 4.45
            case (.warlord, .strike(let k)):
                lunge(&p, k == 0 ? 0.42 : 0.5, deep: 1.1)
                p.hold = k == 0 ? v(0.1, -0.12) : v(0.06, -0.24)
                p.blade = k == 0 ? 0.62 : 0.4
                if k == 0 { p.smear = sweep(4.1, 0.8, 0.9) }
            case (.warlord, .block):
                p.lean = 0.02
                p.front = (0.55, 0.3)
                p.back = (-0.5, -0.55)
                p.hold = v(0.19, -0.05)
                p.blade = 2.9
            case (.warlord, .stagger(0)):
                p.hold = v(0.12, 0.02)
                p.blade = 2.6
            case (_, .stagger(0)):
                if let hold = p.hold {
                    p.hold = v(hold.x - 0.02, hold.y + 0.06)
                } else {
                    p.arm = (0.3, 0.7)
                }
                p.blade += 0.6
            default:
                break
            }
        }
        return p
    }

    private static func build(_ cast: Cast) -> Build { Build.of(cast) }

    /// A foe cut down: thrown back with his arms flung wide and the weapon leaving his hand; the knees going; the
    /// body toppling back; lying dead on his back, limbs loose, the weapon beside him.
    static func die(_ cast: Cast, _ k: Int) -> Pose {
        var p = stance(cast)
        recoil(&p)
        p.grip = .one
        p.hold = nil
        p.hold2 = nil
        p.draw = 0
        p.armed = false
        p.blade2 = p.blade2 + 1.4
        let long = build(cast).weapon == .spear || build(cast).weapon == .nodachi
        switch k {
        case 0:
            p.lean = -0.46
            p.tilt = -0.6
            p.front = (0.55, 0.05)
            p.back = (-0.25, -0.55)
            p.arm = (2.3, 2.7)
            p.arm2 = (-1.9, -1.4)
            p.blade = 2.9
            p.stream = 0.9
            p.drag = -0.05
        case 1:
            p.lean = 0.1
            p.tilt = 0.45
            p.front = (1.1, -0.35)
            p.back = (0.55, -0.95)
            p.arm = (0.25, 0.1)
            p.arm2 = (-0.2, -0.1)
            p.blade = 0.3
            p.stream = 0.4
        case 2:
            p.lean = -0.1
            p.tilt = -0.4
            p.front = (0.9, 0.2)
            p.back = (0.3, -0.5)
            p.arm = (2.1, 2.4)
            p.arm2 = (1.6, 2.0)
            p.blade = 2.6
            p.roll = -0.9
            p.grounded = true
            p.stream = 0.6
        default:
            p.lean = -0.05
            p.tilt = -0.25
            p.front = (0.3, 0.2)
            p.back = (0.05, -0.1)
            p.arm = (2.6, 3.0)
            p.arm2 = (1.3, 1.9)
            p.blade = 3.3
            p.roll = -1.55
            p.grounded = true
            p.stream = 0
            p.wave = 0.5
        }
        // A long weapon falls along the body rather than off the edge of the picture.
        if long { p.blade = [1.9, 1.25, 2.3, 1.9][min(k, 3)] }
        return p
    }

    /// The pose a blow throws a foe into, a little different each time: variant 0 is the stagger itself, the others
    /// thrown back harder or twisted, arms flung their own ways. Cutting him apart starts from one of these.
    public static func struck(_ cast: Cast, variant: Int) -> Pose {
        var p = pose(cast, .stagger(0))
        p.armed = false
        guard variant > 0 else { return p }
        var rng = SeededRNG(seed: UInt64(variant) &* 0x9E37 &+ 17)
        func r(_ a: Double, _ b: Double) -> CGFloat { CGFloat(rng.range(a, b)) }
        p.grip = .one
        p.hold = nil
        p.hold2 = nil
        p.lean = r(-0.55, -0.1)
        p.tilt = r(-0.7, 0.3)
        p.front = (r(0.2, 0.75), r(-0.1, 0.35))
        p.back = (r(-0.6, -0.1), r(-0.9, -0.3))
        p.arm = (r(0.2, 2.9), r(-0.3, 2.6))
        p.arm2 = (r(-2.2, 1.0), r(-2.0, 1.2))
        return p
    }

    /// A body lying where it fell, cut down whole: on its back or face down, arms and legs thrown out as they landed,
    /// no two alike.
    public static func corpse(_ cast: Cast, seed: UInt64) -> Sketch {
        var rng = SeededRNG(seed: seed &* 0x2545F491 &+ 3)
        func r(_ a: Double, _ b: Double) -> CGFloat { CGFloat(rng.range(a, b)) }
        var p = die(cast, 3)
        let faceDown = rng.chance(0.4)
        p.roll = faceDown ? r(1.35, 1.62) : -r(1.4, 1.68)
        p.lean = r(-0.3, 0.3)
        p.tilt = r(-0.7, 0.7)
        p.front = (r(-0.2, 1.1), r(-0.4, 0.4))
        p.back = (r(-0.5, 0.6), r(-1.2, 0.2))
        // Arms: over the head, out to the side, or trapped under him.
        p.arm = (r(0.4, 3.1), r(0.0, 3.2))
        p.arm2 = (r(-1.5, 2.9), r(-1.5, 3.0))
        p.wave = r(0, 1)
        p.stream = 0
        p.drag = 0
        return sketch(cast, pose: p)
    }

    /// Where a cut starts (its kamae) and ends (full extension), and the arc its blade sweeps.
    struct CutKeys {
        var start: Pose
        var end: Pose
        var from: CGFloat
        var to: CGFloat
    }

    static func cutKeys(_ cut: Cut) -> CutKeys {
        var start = stance(.hero), end = stance(.hero)
        switch cut {
        case .kesa:
            // From hassō: hands by the right shoulder, the blade upright and tipped back.
            start.lean = -0.02
            start.front = (0.42, 0.14)
            start.back = (-0.5, -0.42)
            start.hold = v(0.0, 0.1)
            start.blade = 3.5
            lunge(&end, 0.44, deep: 1.1)
            end.hold = v(0.25, -0.26)
            end.blade = 0.78
        case .gyaku:
            // From waki-gamae: the hands at the hip, the blade trailing low behind, hidden by the body.
            start.lean = 0.26
            start.front = (0.72, 0.4)
            start.back = (-0.6, -0.75)
            start.hold = v(-0.05, -0.2)
            start.blade = -0.75
            lunge(&end, 0.1, deep: 0.9)
            end.hold = v(0.2, 0.11)
            end.blade = 2.6
        case .shomen:
            // From jōdan: both hands over the head; then the stamp, and the arms thrown out level.
            start.lean = -0.12
            start.lift = 0.025
            start.front = (0.36, 0.1)
            start.back = (-0.42, -0.28)
            start.hold = v(0.0, 0.3)
            start.blade = 4.08
            lunge(&end, 0.48, deep: 1.22)
            end.hold = v(0.31, 0.0)
            end.blade = 1.62
        case .dou:
            // The blade laid back at the hip, then brought round level through the waist.
            start.lean = 0.06
            start.front = (0.45, 0.15)
            start.back = (-0.5, -0.4)
            start.hold = v(-0.02, -0.12)
            start.blade = -1.75
            start.flat = 0.3
            lunge(&end, 0.4, deep: 1.12)
            end.hold = v(0.26, -0.15)
            end.blade = 1.5
            end.flat = 0.3
        case .tsuki:
            start.lean = -0.04
            start.front = (0.4, 0.22)
            start.back = (-0.5, -0.62)
            start.hold = v(0.04, -0.18)
            start.blade = 1.78
            lunge(&end, 0.5, deep: 1.32)
            end.hold = v(0.32, -0.06)
            end.blade = 1.6
        case .sune:
            // The blade shouldered behind the head (katsugi), then the drop into a deep lunge and a cut at the shins.
            start.lean = -0.02
            start.hold = v(0.03, 0.2)
            start.blade = 3.8
            end.lean = 0.5
            end.shift = 0.05
            end.front = (1.2, 0.3)
            end.back = (-0.75, -1.45)
            end.hold = v(0.25, -0.28)
            end.blade = 1.28
            end.stream = 1
        case .nukitsuke:
            let from = draw(3), to = draw(5)
            return CutKeys(start: from, end: to, from: -0.95, to: to.blade)
        }
        return CutKeys(start: start, end: end, from: start.blade, to: end.blade)
    }

    /// A cut's ten frames. The hands lead and the blade lags behind them, then whips through as the wrists
    /// uncock, so the point travels fastest at the end; after the blow, the follow-through, zanshin, and back.
    static func swing(_ cut: Cut, _ phase: Int) -> Pose {
        if cut == .nukitsuke { return draw(phase) }
        let keys = cutKeys(cut)
        let arc = keys.to - keys.from
        let flat = keys.start.flat
        let thrust = cut == .tsuki
        func moment(_ t: CGFloat, whip: CGFloat) -> Pose {
            var p = Pose.mix(keys.start, keys.end, t)
            p.blade = keys.from + arc * whip
            return p
        }
        func trail(_ from: CGFloat, _ to: CGFloat, _ strength: CGFloat) -> Pose.Smear {
            Pose.Smear(from: from, to: to, strength: strength, flat: flat, thrust: thrust)
        }
        // Through the swing: how far the hands have come, how far the blade, and how bright its trail.
        let swing: [(t: CGFloat, whip: CGFloat, tail: CGFloat, strength: CGFloat)] = [
            (0.18, 0.07, 0, 0.3), (0.42, 0.24, 0, 0.6), (0.66, 0.5, 0.05, 0.85), (0.86, 0.8, 0.2, 1), (1, 1, 0.45, 0.8),
        ]
        switch phase {
        case 0:
            // Chambered, the weight gathering over the back foot.
            var p = keys.start
            p.lean -= 0.03
            p.stream = 0.35
            p.wave = 0.1
            return p
        case 1...5:
            let s = swing[phase - 1]
            var p = moment(s.t, whip: s.whip)
            p.smear = trail(keys.from + arc * s.tail, p.blade, s.strength)
            p.stream = 0.5 + 0.5 * s.t
            p.wave = 0.1 + 0.35 * s.t
            // A smear frame: the arms and blade along the path since the last frame, the body dragged after them.
            let before = phase == 1 ? (t: CGFloat(0), whip: CGFloat(0)) : (t: swing[phase - 2].t, whip: swing[phase - 2].whip)
            p.ghosts = [0.18, 0.4, 0.62, 0.82].map { f in
                moment(before.t + (s.t - before.t) * f, whip: before.whip + (s.whip - before.whip) * f)
            }
            p.drag = (s.t - before.t) * 0.16
            return p
        case 6, 7:
            // The follow-through: the blade carries past its mark and the body settles lower after it.
            var p = keys.end
            if !thrust { p.blade += (arc > 0 ? 1 : -1) * (phase == 6 ? 0.3 : 0.2) }
            p.lean += phase == 6 ? 0.05 : 0.035
            if phase == 6 {
                p.smear = trail(keys.to - arc * 0.2, p.blade, 0.3)
                p.ghosts = Pose.between(moment(1, whip: 1), p, [0.35, 0.7])
            }
            p.stream = phase == 6 ? 0.9 : 0.75
            p.wave = phase == 6 ? 0.55 : 0.65
            return p
        case 8:
            // Zanshin: held, the point coming back up onto the line, eyes on the foe.
            var p = Pose.mix(keys.end, stance(.hero), 0.2)
            p.blade = keys.end.blade + (stance(.hero).blade - keys.end.blade) * 0.15
            p.stream = 0.55
            p.wave = 0.78
            return p
        default:
            var p = Pose.mix(keys.end, stance(.hero), 0.65)
            p.stream = 0.4
            p.wave = 0.9
            return p
        }
    }

    /// Nukitsuke, from the iai stance: the hilt pushed forward as the scabbard is pulled back; the blade clearing
    /// the mouth; one hand whipping it up and out at the foe's chest, the other still drawing the scabbard back;
    /// the follow-through, zanshin, and the second hand joining the hilt.
    static func draw(_ phase: Int) -> Pose {
        var p = iai()
        switch phase {
        case 0, 1, 2:
            // The hilt pushed out and the scabbard drawn back until the point is at the mouth.
            let t = CGFloat(phase) / 2
            p.lean = 0.2 + 0.1 * t
            p.shift = 0.02 * t
            p.front = (0.66 + 0.2 * t, 0.32)
            p.back = (-0.53 - 0.15 * t, -0.62 - 0.26 * t)
            p.sheathed = 0.62 - 0.48 * t
            p.saya = 0.4 + 0.6 * t
            p.stream = 0.35 + 0.45 * t
        case 3:
            // Out: one hand whipping the blade up from under, the other still pulling the scabbard back.
            lunge(&p, 0.3, deep: 0.9)
            p.sheathed = 0
            p.saya = 1
            p.hold = v(0.2, -0.2)
            p.blade = 0.1
            p.smear = sweep(-0.95, 0.1, 0.7)
            p.stream = 0.9
        case 4:
            lunge(&p, 0.34)
            p.sheathed = 0
            p.saya = 1
            p.hold = v(0.26, -0.13)
            p.blade = 0.95
            p.smear = sweep(-0.8, 0.95, 1)
            p.stream = 1
        case 5:
            lunge(&p, 0.38, deep: 1.12)
            p.sheathed = 0
            p.saya = 1
            p.hold = v(0.315, 0.03)
            p.blade = 1.8
            p.smear = sweep(0.55, 1.8, 0.85)
            p.stream = 1
        case 6, 7:
            lunge(&p, 0.4, deep: 1.1)
            p.sheathed = 0
            p.saya = phase == 6 ? 0.85 : 0.7
            p.hold = phase == 6 ? v(0.3, 0.09) : v(0.3, 0.07)
            p.blade = phase == 6 ? 2.12 : 2.02
            if phase == 6 { p.smear = sweep(1.55, 2.12, 0.3) }
            p.stream = phase == 6 ? 0.9 : 0.75
        case 8:
            lunge(&p, 0.34, deep: 1.0)
            p.sheathed = 0
            p.saya = 0.5
            p.hold = v(0.29, 0.05)
            p.blade = 1.9
            p.stream = 0.6
            p.wave = 0.7
        default:
            var end = p
            lunge(&end, 0.3)
            end.sheathed = 0
            end.saya = 0
            end.hold = v(0.26, -0.05)
            end.blade = 1.95
            end.grip = .two
            p = Pose.mix(end, stance(.hero), 0.6)
            p.stream = 0.4
            p.wave = 0.9
        }
        // Out of the scabbard and through the cut: smear frames.
        if (1...6).contains(phase) {
            p.ghosts = Pose.between(draw(phase - 1), p)
            p.drag = phase == 4 || phase == 5 ? 0.035 : 0.02
        }
        return p
    }

    /// The end of a stage: ō-chiburi, the blade swung up beside the head and snapped down to throw the blood off;
    /// then nōtō, the back of the blade laid in the scabbard's mouth and slid home, the hand resting on the hilt.
    static func flourish(_ k: Int) -> Pose {
        var p = stance(.hero)
        p.front = (0.34, 0.06)
        p.back = (-0.34, -0.14)
        p.lean = 0.04
        p.grip = .saya
        switch k {
        case 0:
            // The left hand to the scabbard's mouth, the blade coming up.
            p.hold = v(0.2, 0.02)
            p.blade = 2.6
            p.stream = 0.3
        case 1:
            p.hold = v(0.08, 0.22)
            p.blade = 3.75
            p.stream = 0.5
        case 2:
            p.front = (0.42, 0.15)
            p.back = (-0.4, -0.32)
            p.hold = v(0.2, 0.08)
            p.blade = 2.3
            p.smear = Pose.Smear(from: 3.6, to: 2.3, strength: 0.7)
            p.stream = 0.8
            p.wave = 0.2
        case 3:
            p.front = (0.5, 0.25)
            p.back = (-0.45, -0.5)
            p.hold = v(0.27, -0.12)
            p.blade = 0.9
            p.smear = Pose.Smear(from: 2.4, to: 0.9, strength: 0.55)
            p.stream = 0.8
            p.wave = 0.35
        case 4:
            p.hold = nil
            p.blade = -0.95
            p.sheathed = 0.28
            p.wave = 0.5
        case 5:
            p.hold = nil
            p.blade = -0.95
            p.sheathed = 0.66
            p.wave = 0.7
        default:
            // Home: upright, the hand on the hilt.
            p.hold = nil
            p.lean = 0.02
            p.blade = -0.95
            p.sheathed = 1
            p.wave = 0.9
        }
        // The snap of the chiburi, smeared.
        if k == 2 || k == 3 { p.ghosts = Pose.between(flourish(k - 1), p) }
        return p
    }
}

// MARK: Drawing

private func dir(_ a: CGFloat) -> CGPoint { CGPoint(x: sin(a), y: -cos(a)) }

private func at(_ p: CGPoint, _ d: CGPoint, _ length: CGFloat) -> CGPoint {
    CGPoint(x: p.x + d.x * length, y: p.y + d.y * length)
}

private func mid(_ a: CGPoint, _ b: CGPoint) -> CGPoint { CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2) }

private func unit(_ a: CGPoint, _ b: CGPoint) -> CGPoint {
    let length = max(0.0001, hypot(b.x - a.x, b.y - a.y))
    return CGPoint(x: (b.x - a.x) / length, y: (b.y - a.y) / length)
}

// A fighting man's build, about eight and a half heads tall: broad in the shoulders, chest and thighs, fine at the
// waist, the wrists, the knees and the ankles, the muscle of each limb swelling between its joints.
private let thigh: CGFloat = 0.28, shin: CGFloat = 0.285, torso: CGFloat = 0.295
private let upperArm: CGFloat = 0.178, forearm: CGFloat = 0.168

/// Two-bone reach from `root`: the hand lands on `target` (or as near as the arm allows), the elbow bent below the
/// line to it (for a figure facing right).
private func twoBone(_ root: CGPoint, _ target: CGPoint, _ a: CGFloat, _ b: CGFloat) -> (elbow: CGPoint, hand: CGPoint) {
    let dx = target.x - root.x, dy = target.y - root.y
    let distance = min(a + b - 0.001, max(abs(a - b) + 0.001, hypot(dx, dy)))
    let toward = atan2(dy, dx)
    let bend = acos(max(-1, min(1, (a * a + distance * distance - b * b) / (2 * a * distance))))
    let elbow = CGPoint(x: root.x + cos(toward - bend) * a, y: root.y + sin(toward - bend) * a)
    return (elbow, CGPoint(x: root.x + cos(toward) * distance, y: root.y + sin(toward) * distance))
}

/// Which way a blade at `angle` points, and how long it looks, when its swing is squashed toward a level plane.
private func bladeVector(_ angle: CGFloat, flat: CGFloat) -> (d: CGPoint, scale: CGFloat) {
    let x = sin(angle), y = -cos(angle) * flat
    let m = max(0.0001, hypot(x, y))
    return (CGPoint(x: x / m, y: y / m), m)
}

/// Draws one pose of one figure into a pen.
private struct Drawer {
    let pose: Pose
    let build: Build
    let H: CGFloat
    var pen: Pen
    // The skeleton.
    let hip: CGPoint, neck: CGPoint, shoulder: CGPoint
    let up: CGPoint, across: CGPoint, face: CGPoint, headUp: CGPoint
    /// The sword arm and the other arm.
    var main: (elbow: CGPoint, hand: CGPoint) = (.zero, .zero)
    /// Where the weapon's point ended up.
    var tip: CGPoint?
    var other: (elbow: CGPoint, hand: CGPoint) = (.zero, .zero)

    let body = Paint(Palette.silhouette)
    let shade = Paint(Palette.shade)

    init(pose: Pose, build: Build, H: CGFloat) {
        self.pose = pose
        self.build = build
        self.H = H
        pen = Pen(width: Int((Figure.canvas.width * H).rounded()), height: Int((Figure.canvas.height * H).rounded()))
        let ground = Figure.feet.y * H
        let dropFront = thigh * H * cos(pose.front.thigh) + shin * H * cos(pose.front.shin)
        let dropBack = thigh * H * cos(pose.back.thigh) + shin * H * cos(pose.back.shin)
        let hipY = pose.airborne ? ground + 0.42 * H : ground + max(dropFront, dropBack) + 0.025 * H + pose.lift * H
        hip = CGPoint(x: Figure.feet.x * H + pose.shift * H, y: hipY)
        up = CGPoint(x: sin(pose.lean), y: cos(pose.lean))
        across = CGPoint(x: cos(pose.lean), y: -sin(pose.lean))
        neck = at(hip, up, torso * H)
        shoulder = at(neck, up, -0.045 * H)
        headUp = CGPoint(x: sin(pose.lean + pose.tilt), y: cos(pose.lean + pose.tilt))
        face = CGPoint(x: cos(pose.lean + pose.tilt), y: -sin(pose.lean + pose.tilt))

        // The sword hand: on the hilt as it rides the scabbard, at its hold, or where the arm's angles put it.
        let a = upperArm * H, b = forearm * H
        if let grip = sheathGrip {
            main = twoBone(shoulder, grip, a, b)
        } else if let hold = pose.hold {
            main = twoBone(shoulder, CGPoint(x: shoulder.x + hold.x * H, y: shoulder.y + hold.y * H), a, b)
        } else {
            main = forward(pose.arm)
        }
        // The other hand: on the hilt behind the first, at the scabbard's mouth, at its hold, or free.
        if pose.grip == .two, let span = build.span, pose.sheathed == 0 {
            let d = bladeVector(pose.blade, flat: pose.flat).d
            other = twoBone(shoulder, at(main.hand, d, -span * H), a, b)
        } else if pose.grip == .saya, build.scabbard {
            other = twoBone(shoulder, at(scabbardMouth, dir(scabbardAngle), 0.012 * H), a, b)
        } else if let hold = pose.hold2 {
            other = twoBone(shoulder, CGPoint(x: shoulder.x + hold.x * H, y: shoulder.y + hold.y * H), a, b)
        } else {
            other = forward(pose.arm2)
        }
    }

    /// An arm set by its angles.
    func forward(_ angles: (upper: CGFloat, fore: CGFloat)) -> (elbow: CGPoint, hand: CGPoint) {
        let elbow = at(shoulder, dir(angles.upper), upperArm * H)
        return (elbow, at(elbow, dir(angles.fore), forearm * H))
    }

    /// A point on the torso: `along` its length from the hip, `out` toward the chest (negative: the back).
    func torsoPoint(_ along: CGFloat, _ out: CGFloat) -> CGPoint { at(at(hip, up, along * torso * H), across, out) }

    /// The scabbard's mouth, and the way it points (back and down from the front of the sash). For the draw it is
    /// pulled back along its line and turned flatter.
    var scabbardMouth: CGPoint { at(torsoPoint(0.12, build.waist * H * 0.55), dir(scabbardAngle), 0.1 * H * pose.saya) }
    var scabbardAngle: CGFloat { -0.95 - 0.3 * pose.saya }

    /// While the blade goes in or out, the sword hand rides the hilt along the scabbard's line: as far out from the
    /// mouth as the blade shows.
    var sheathGrip: CGPoint? {
        guard build.scabbard, pose.sheathed > 0 else { return nil }
        return at(scabbardMouth, dir(scabbardAngle), -(0.6 * H * (1 - pose.sheathed) + 0.035 * H))
    }

    mutating func fill(_ points: [CGPoint], _ paint: Paint) { pen.fill(points, paint) }

    /// A limb segment cut like muscle: widest a little past its root, bulging more on one side, tapering to a sharp
    /// joint. The ends run a touch past the joints so the next segment overlaps cleanly.
    mutating func segment(_ a: CGPoint, _ b: CGPoint, _ w0: CGFloat, _ w1: CGFloat, _ w2: CGFloat, _ paint: Paint,
                          bulge: CGFloat = 0.2, at t: CGFloat = 0.38) {
        let dx = b.x - a.x, dy = b.y - a.y
        let length = max(0.001, hypot(dx, dy))
        let d = CGPoint(x: dx / length, y: dy / length), n = CGPoint(x: -d.y, y: d.x)
        let a0 = RoninArt.at(a, d, -w0 * 0.3), b0 = RoninArt.at(b, d, w2 * 0.35)
        let m = RoninArt.at(a, d, length * t)
        fill([
            RoninArt.at(a0, n, w0 / 2), RoninArt.at(m, n, w1 / 2 * (1 + bulge)), RoninArt.at(b0, n, w2 / 2), RoninArt.at(b0, d, w2 * 0.25),
            RoninArt.at(b0, n, -w2 / 2), RoninArt.at(m, n, -w1 / 2 * (1 - bulge)), RoninArt.at(a0, n, -w0 / 2), RoninArt.at(a0, d, -w0 * 0.2),
        ], paint)
    }

    mutating func draw() {
        backGear()
        if build.scabbard { scabbard(behind: true) }
        // The far side first, in a lighter shade, so the figure reads in depth.
        leg(pose.back, shade)
        let drawingBow = pose.armed && build.weapon == .bow && (pose.draw > 0 || pose.hold2 != nil)
        if !drawingBow { arm(other, shade) }
        trunk()
        head()
        leg(pose.front, body)
        if build.scabbard { scabbard(behind: false) }
        arm(main, body)
        if pose.armed { weapon(main.hand, other.hand) }
        if drawingBow { arm(other, body) }
        if let smear = pose.smear {
            let (origin, radius, flat) = (main.hand, build.reach * H, pose.flat)
            let blade = bladeVector(pose.blade, flat: flat).d
            pen.overlay { pen in Drawer.smear(&pen, origin: origin, radius: radius, blade: blade, H: H, smear) }
        }
        if !pose.ghosts.isEmpty || pose.drag != 0 { smearFrame() }
    }

    /// A smear frame, laid under the figure: the body's echoes trailing behind it, the arms and weapon repeated back
    /// along the motion as fading multiples, and between the blades a solid sweep of ink, dense at the blade and
    /// thinning to nothing at the start of the swing, split into strands like a dry brush.
    mutating func smearFrame() {
        let ink = Palette.silhouette
        var under: [Shape] = []
        // The body carried along: two echoes behind it, fainter as they go.
        if pose.drag != 0 {
            let body = pen.sketch.body
            for (k, alpha) in [(CGFloat(2), CGFloat(0.12)), (1, 0.24)] {
                let dx = -face.x * pose.drag * H * k
                under += body.map { $0.mapped { CGPoint(x: $0.x + dx, y: $0.y) }.inked(Paint(ink, alpha)) }
            }
        }
        // The arms and weapon along the swing, and where each blade was.
        var blades: [(hand: CGPoint, tip: CGPoint)] = []
        let count = CGFloat(pose.ghosts.count)
        for (i, ghost) in pose.ghosts.enumerated() {
            var g = ghost
            g.ghosts = []
            g.drag = 0
            g.smear = nil
            var d = Drawer(pose: g, build: build, H: H)
            d.arm(d.other, d.shade)
            d.arm(d.main, d.body)
            if g.armed, build.weapon != .bow { d.weapon(d.main.hand, d.other.hand) }
            if let tip = d.tip { blades.append((d.main.hand, tip)) }
            let alpha = 0.1 + 0.28 * CGFloat(i + 1) / (count + 1)
            under += d.pen.sketch.body.map { $0.inked(Paint(ink, alpha)) }
        }
        if let tip, !blades.isEmpty { blades.append((main.hand, tip)) }
        // The sweep: each band between two blades, from a third of the way out to the point, darker toward the blade;
        // each band split lengthways into strands with gaps.
        if blades.count > 1 {
            for i in 0..<(blades.count - 1) {
                let a = blades[i], b = blades[i + 1]
                let alpha = 0.22 + 0.62 * CGFloat(i + 1) / CGFloat(blades.count - 1)
                for (from, to) in [(CGFloat(0.28), CGFloat(0.5)), (0.53, 0.76), (0.79, 1.0)] {
                    func along(_ p: (hand: CGPoint, tip: CGPoint), _ t: CGFloat) -> CGPoint {
                        CGPoint(x: p.hand.x + (p.tip.x - p.hand.x) * t, y: p.hand.y + (p.tip.y - p.hand.y) * t)
                    }
                    let ground = Figure.feet.y * H
                    let quad = [along(a, from), along(a, to), along(b, to), along(b, from)].map { CGPoint(x: $0.x, y: max(ground, $0.y)) }
                    under.append(Shape(kind: .path(Path(polygon: quad)), fill: Paint(ink, alpha * (from > 0.7 ? 1 : 0.8))))
                }
            }
        }
        pen.underlay(under)
    }

    mutating func leg(_ angles: (thigh: CGFloat, shin: CGFloat), _ paint: Paint) {
        let knee = at(hip, dir(angles.thigh), thigh * H)
        let ankle = at(knee, dir(angles.shin), shin * H)
        let k = build.bulk
        switch build.legs {
        case .hakama:
            // Pleated trousers, flaring below the knee to a hem cut on the slant that trails behind the stride. The
            // ronin's are cut full: they billow at the thigh and knee and sweep out wide at the hem.
            let b = build.baggy
            segment(hip, knee, (0.082 + 0.06 * b) * H, (0.09 + 0.075 * b) * H, (0.066 + 0.05 * b) * H, paint, bulge: 0.12 * b, at: 0.5)
            let hem = at(ankle, dir(angles.shin), 0.012 * H)
            let d = dir(angles.shin), n = CGPoint(x: -d.y, y: d.x)
            let trail = CGPoint(x: -face.x * pose.stream * (0.025 + 0.035 * b) * H, y: pose.stream * (0.01 + 0.012 * b) * H)
            let front = at(at(hem, n, (0.054 + 0.045 * b) * H), d, -0.024 * H), back = at(at(hem, n, -(0.06 + 0.055 * b) * H), d, 0.01 * H)
            let billow = at(at(knee, d, shin * H * 0.45), n, -(0.05 + 0.05 * b) * H)
            fill([at(knee, n, (0.036 + 0.03 * b) * H), front, CGPoint(x: back.x + trail.x, y: back.y + trail.y),
                  CGPoint(x: billow.x + trail.x * 0.5, y: billow.y), at(knee, n, -(0.036 + 0.034 * b) * H)], paint)
        case .leggings:
            // A full thigh narrowing hard to the knee; a calf swelling behind the shin and down to a fine ankle.
            segment(hip, knee, 0.074 * H * k, 0.088 * H * k, 0.036 * H * k, paint, bulge: 0.22, at: 0.34)
            segment(knee, ankle, 0.038 * H * k, 0.058 * H * k, 0.02 * H * k, paint, bulge: -0.45, at: 0.3)
        case .bare:
            segment(hip, knee, 0.08 * H * k, 0.096 * H * k, 0.038 * H * k, paint, bulge: 0.25, at: 0.34)
            segment(knee, ankle, 0.042 * H * k, 0.064 * H * k, 0.021 * H * k, paint, bulge: -0.5, at: 0.3)
        }
        // A foot: long and narrow, drawn to a point.
        fill([at(ankle, CGPoint(x: -1, y: 0), 0.018 * H), at(ankle, CGPoint(x: 0, y: 1), 0.014 * H),
              CGPoint(x: ankle.x + 0.09 * H, y: ankle.y - 0.022 * H), CGPoint(x: ankle.x + 0.075 * H, y: ankle.y - 0.027 * H),
              CGPoint(x: ankle.x - 0.024 * H, y: ankle.y - 0.027 * H)], paint)
    }

    mutating func arm(_ ends: (elbow: CGPoint, hand: CGPoint), _ paint: Paint) {
        let (elbow, hand) = ends
        let k = build.bulk
        // A round shoulder, a full upper arm pinching in to the elbow, a forearm thick below the elbow and fine at the
        // wrist.
        segment(shoulder, elbow, 0.058 * H * k, 0.068 * H * k, 0.03 * H * k, paint, bulge: 0.3, at: 0.36)
        segment(elbow, hand, 0.034 * H * k, 0.048 * H * k, 0.02 * H * k, paint, bulge: 0.25, at: 0.24)
        let r = 0.04 * H * k
        pen.ellipse(CGRect(x: shoulder.x - r, y: shoulder.y - r * 0.9, width: r * 2, height: r * 1.9), paint)
        // The fist.
        let d = unit(elbow, hand), n = CGPoint(x: -d.y, y: d.x)
        fill([at(hand, n, 0.016 * H), at(hand, d, 0.03 * H), at(hand, n, -0.016 * H), at(hand, d, -0.008 * H)], paint)
        if build.sleeves {
            // A kimono sleeve: a deep, square-cut panel hanging from the upper arm, swinging back as the arm moves.
            let du = unit(shoulder, elbow)
            let hang = CGPoint(x: -face.x * (0.25 + pose.stream * 0.55), y: -1 + pose.stream * 0.3)
            let length = hypot(hang.x, hang.y)
            let down = CGPoint(x: hang.x / length, y: hang.y / length)
            let b = build.baggy
            fill([at(shoulder, du, -0.01 * H * b), at(elbow, du, (-0.012 + 0.02 * b) * H), at(at(elbow, du, -0.024 * H), down, (0.075 + 0.08 * b) * H),
                  at(at(shoulder, du, 0.06 * H), down, (0.08 + 0.1 * b) * H)], paint)
        }
    }

    /// The torso in profile: a deep chest and a flat back over a narrow waist; skirt or tassets; the sash; plates.
    mutating func trunk() {
        let c = build.chest * H, wst = build.waist * H, b = build.baggy
        // A V: a deep chest and a broad back over a narrow waist, the trapezius sloping up to the neck.
        fill([
            torsoPoint(0, -wst * 0.6), torsoPoint(0, wst * 0.5), torsoPoint(0.28, wst * 0.46), torsoPoint(0.52, c * 0.5),
            torsoPoint(0.7, c * 0.64), torsoPoint(0.86, c * 0.56), torsoPoint(0.98, c * 0.24), torsoPoint(1.06, c * 0.02),
            torsoPoint(1.07, -c * 0.16), torsoPoint(0.94, -c * 0.52), torsoPoint(0.7, -c * 0.55), torsoPoint(0.46, -c * 0.38),
            torsoPoint(0.26, -wst * 0.56),
        ], body)
        if b > 0 {
            // A loose kimono over it: bloused out over the sash front and back, the collar standing off the neck, the
            // cloth hanging slack from the shoulder blades.
            let sag = pose.stream * 0.02 * H
            fill([
                torsoPoint(0.12, -wst * 0.75 * (1 + b * 0.35)), torsoPoint(0.12, wst * 0.72 * (1 + b * 0.35)),
                torsoPoint(0.3, wst * (0.75 + 0.45 * b)), torsoPoint(0.55, c * (0.66 + 0.1 * b)), torsoPoint(0.8, c * 0.6),
                torsoPoint(0.99, c * 0.28), torsoPoint(1.04, -c * 0.2), torsoPoint(0.84, -c * (0.5 + 0.1 * b)),
                at(torsoPoint(0.5, -c * (0.46 + 0.12 * b)), across, -sag), at(torsoPoint(0.26, -wst * (0.78 + 0.45 * b)), across, -sag),
            ], body)
        }
        if build.legs == .hakama {
            // The hakama's seat, joining the two legs under the sash.
            let b = build.baggy
            let front = at(hip, dir(pose.front.thigh), thigh * H * (0.3 + 0.2 * b)), back = at(hip, dir(pose.back.thigh), thigh * H * (0.3 + 0.2 * b))
            fill([torsoPoint(0.08, -wst * (0.62 + 0.2 * b)), torsoPoint(0.08, wst * (0.6 + 0.2 * b)), at(front, across, (0.04 + 0.04 * b) * H),
                  at(back, across, -(0.04 + 0.04 * b) * H)], body)
        }
        if build.skirt > 0 {
            let hem = at(hip, CGPoint(x: 0, y: -1), build.skirt * H)
            let spread = wst * 1.25
            if build.plated {
                for s in [CGFloat(-1), 0, 1] {
                    let top = torsoPoint(0.06, s * wst * 0.5)
                    fill([at(top, across, -wst * 0.42), at(top, across, wst * 0.42),
                          CGPoint(x: hem.x + s * spread * 0.8 + wst * 0.5, y: hem.y + abs(s) * 0.02 * H),
                          CGPoint(x: hem.x + s * spread * 0.8 - wst * 0.5, y: hem.y + abs(s) * 0.02 * H)], body)
                }
            } else {
                fill([torsoPoint(0.1, -wst * 0.6), torsoPoint(0.1, wst * 0.6), CGPoint(x: hem.x + spread, y: hem.y + 0.01 * H),
                      CGPoint(x: hem.x + spread * 0.2, y: hem.y - 0.015 * H), CGPoint(x: hem.x - spread, y: hem.y + 0.01 * H)], body)
            }
        }
        // The sash, and a fine collar line crossing the chest.
        pen.line(torsoPoint(0.14, -wst * 0.62), torsoPoint(0.14, wst * 0.58), Paint(build.accent.scaled(0.75)), width: 0.026 * H)
        pen.line(torsoPoint(0.98, c * 0.12), torsoPoint(0.6, c * 0.5), Paint(Palette.shade.mix(.white, 0.14)), width: max(1, 0.007 * H))
        if build.plated {
            for s in [CGFloat(1), -1] {
                let root = torsoPoint(0.92, s * c * 0.45)
                let down = at(root, up, -0.1 * H)
                fill([at(root, across, -0.05 * H), at(root, across, 0.055 * H), at(down, across, 0.075 * H), at(down, across, -0.07 * H)], body)
            }
        }
    }

    /// The head: a cranium, a hard jaw, a straight brow; headgear; eyes.
    mutating func head() {
        let r = build.head * H
        // A strong neck carrying the head.
        let c = at(neck, headUp, r * 1.25)
        segment(neck, c, 0.042 * H * build.bulk, 0.046 * H * build.bulk, 0.036 * H, body, bulge: 0, at: 0.5)
        let skull = CGRect(x: c.x - r, y: c.y - r * 0.95, width: 2 * r, height: 2 * r)
        pen.ellipse(skull, body)
        func p(_ f: CGFloat, _ u: CGFloat) -> CGPoint { at(at(c, face, f * r), headUp, u * r) }
        fill([p(-0.5, -0.6), p(0.72, -1.02), p(1.08, -0.35), p(1.02, 0.2), p(0.8, 0.5)], body)
        gear(c, r)
        if let eyes = build.eyes {
            let eye = p(0.62, 0.05)
            fill([at(eye, face, -r * 0.28), at(eye, headUp, r * 0.12), at(eye, face, r * 0.3), at(eye, headUp, -r * 0.1)], Paint(eyes))
        }
    }

    /// A ribbon streaming back from `root`: thin, tapering to a point, lifting as the figure moves.
    mutating func ribbon(_ root: CGPoint, length: CGFloat, width: CGFloat, droop: CGFloat, phase: CGFloat, _ paint: Paint) {
        let r = build.head * H
        let back = CGPoint(x: -face.x, y: -face.y)
        let lift = (pose.stream - 0.5) * r * 1.4
        let sway = r * 0.6 * sin((pose.wave + phase) * 2 * .pi)
        let reach = length * (0.8 + 0.3 * pose.stream)
        let tip = at(at(root, back, reach), headUp, -droop * r * (1.2 - pose.stream) + lift + sway)
        let m = at(at(root, back, reach * 0.5), headUp, -droop * r * 0.3 + lift * 0.5 - sway * 0.6)
        var path = Path()
        path.move(at(root, headUp, width / 2))
        path.quad(tip, control: at(m, headUp, width / 2))
        path.quad(at(root, headUp, -width / 2), control: at(m, headUp, -width / 2))
        path.close()
        pen.fill(path, paint)
    }

    mutating func gear(_ c: CGPoint, _ r: CGFloat) {
        func p(_ f: CGFloat, _ u: CGFloat) -> CGPoint { at(at(c, face, f * r), headUp, u * r) }
        let flutter = sin(pose.wave * 2 * .pi)
        switch build.gear {
        case .topknot:
            // The chonmage, swept back; the headband; two long ribbons.
            fill([p(-0.1, 0.9), p(-0.9, 1.3), p(-0.62, 0.72)], body)
            fill([p(-1.0, 0.2), p(0.95, 0.35), p(0.93, 0.62), p(-0.98, 0.52)], Paint(build.accent))
            ribbon(p(-0.95, 0.4), length: r * 4.4, width: r * 0.3, droop: 0.8, phase: 0, Paint(build.accent))
            ribbon(p(-0.95, 0.3), length: r * 3.5, width: r * 0.24, droop: 1.6, phase: 0.3, Paint(build.accent.scaled(0.78)))
        case .jingasa:
            fill([p(-2.6, 0.35), p(2.6, 0.35), p(0.1, 1.25)], body)
        case .hood:
            fill([p(1.05, 0.2), p(0.85, 0.95), p(-0.3, 1.2), p(-1.1, 0.5), p(-0.9, -0.9), p(0.4, -1.0)], body)
            ribbon(p(-0.9, 0.2), length: r * 3.4, width: r * 0.34, droop: 1.0, phase: 0.1, Paint(build.accent, 0.95))
        case .horns:
            for (s, len) in [(CGFloat(0.35), CGFloat(1.6)), (-0.25, 1.3)] {
                fill([p(s + 0.25, 0.6), p(s + 0.9, 0.6 + len), p(s - 0.2, 0.65)], body)
            }
            for i in 0..<4 {
                let f = -0.3 - 0.28 * CGFloat(i), u = 0.75 - 0.35 * CGFloat(i)
                fill([p(f + 0.2, u), p(f - 0.9, u + 0.25), p(f - 0.05, u - 0.35)], body)
            }
        case .ponytail:
            fill([p(-0.4, 0.8), p(-2.6, -0.4 + 0.4 * flutter), p(-0.8, 0.2)], body)
            let neckPoint = at(c, headUp, -r * 1.2)
            ribbon(at(neckPoint, face, -r * 0.4), length: r * 5.2, width: r * 0.42, droop: 1.2, phase: 0.2, Paint(build.accent, 0.95))
        case .eboshi:
            fill([p(-0.9, 0.45), p(0.8, 0.55), p(0.1, 2.3), p(-0.5, 1.9)], body)
        case .kabuto:
            fill([p(-1.2, 0.2), p(-0.9, 1.05), p(0.2, 1.3), p(1.1, 0.75), p(1.15, 0.3)], body)
            fill([p(-0.9, 0.35), p(-2.2, -0.75), p(-1.6, -1.1), p(-0.5, -0.4)], body)
            fill([p(0.4, -0.2), p(1.15, -0.05), p(1.0, -0.9), p(0.3, -1.05)], body)
            let root = p(0.55, 1.05)
            var crest = Path()
            crest.move(root)
            crest.quad(at(at(root, face, r * 1.5), headUp, r * 1.9), control: at(at(root, face, r * 1.3), headUp, r * 0.2))
            crest.quad(at(root, headUp, r * 0.25), control: at(at(root, face, r * 0.7), headUp, r * 0.5))
            crest.quad(at(at(root, face, -r * 1.3), headUp, r * 1.9), control: at(at(root, face, -r * 0.5), headUp, r * 0.5))
            crest.quad(root, control: at(at(root, face, -r * 1.1), headUp, r * 0.2))
            crest.close()
            pen.fill(crest, Paint(build.accent))
        }
    }

    /// The scabbard at the ronin's hip: its mouth at the front of the sash, sweeping back and down. The far half is
    /// drawn behind the body, the mouth (and a sheathed hilt) in front.
    mutating func scabbard(behind: Bool) {
        let mouth = scabbardMouth
        let d = dir(scabbardAngle)
        let n = CGPoint(x: -d.y, y: d.x)
        let length = 0.46 * H
        if behind {
            var path = Path()
            path.move(at(mouth, n, 0.013 * H))
            path.quad(at(at(mouth, d, length), n, 0.004 * H), control: at(at(mouth, d, length * 0.55), n, -0.01 * H))
            path.line(at(at(mouth, d, length), n, -0.01 * H))
            path.quad(at(mouth, n, -0.013 * H), control: at(at(mouth, d, length * 0.55), n, -0.03 * H))
            path.close()
            pen.fill(path, shade)
        } else {
            // The mouth, bound in the sash's colour.
            fill([at(mouth, n, 0.016 * H), at(at(mouth, d, 0.05 * H), n, 0.015 * H), at(at(mouth, d, 0.05 * H), n, -0.015 * H),
                  at(mouth, n, -0.016 * H)], Paint(build.accent.scaled(0.6)))
        }
    }

    /// A slender, slightly curved blade: black spine, a bright cutting edge, a small guard and a wrapped grip.
    /// `visible` shortens it from the tip (a blade going into its scabbard).
    mutating func blade(from hand: CGPoint, angle: CGFloat, length: CGFloat, width: CGFloat, gleam: CGFloat, visible: CGFloat = 1,
                        flat: CGFloat = 1) {
        let (d, scale) = bladeVector(angle, flat: flat)
        let n = CGPoint(x: -d.y, y: d.x)
        // Grip and guard.
        fill([at(hand, n, width * 0.55), at(at(hand, d, -0.11 * H), n, width * 0.45), at(at(hand, d, -0.11 * H), n, -width * 0.45),
              at(hand, n, -width * 0.55)], body)
        fill([at(hand, n, 0.03 * H), at(hand, d, 0.012 * H), at(hand, n, -0.03 * H), at(hand, d, -0.012 * H)], body)
        var shown = length * scale * max(0, min(1, visible))
        let ground = Figure.feet.y * H + 0.004 * H
        if pose.roll == 0, d.y < 0, hand.y + d.y * shown < ground { shown = max(0, (ground - hand.y) / d.y) }
        guard shown > 0.02 * H else { return }
        let tip = at(hand, d, shown)
        if self.tip == nil { self.tip = tip }
        let curve = at(at(hand, d, shown * 0.55), n, -shown * 0.045)
        var path = Path()
        path.move(at(hand, n, width / 2))
        if visible < 1 {
            path.line(at(tip, n, width / 2))
            path.line(at(tip, n, -width / 2))
        } else {
            path.quad(tip, control: at(curve, n, width * 0.4))
        }
        path.quad(at(hand, n, -width / 2), control: at(curve, n, -width * 0.6))
        path.close()
        pen.fill(path, body)
        var edge = Path()
        edge.move(at(at(hand, d, min(0.04 * H, shown * 0.5)), n, -width * 0.45))
        edge.quad(tip, control: at(curve, n, -width * 0.55))
        pen.stroke(edge, Paint(Palette.steel, gleam), width: max(1, width * 0.4), round: true)
    }

    mutating func weapon(_ hand: CGPoint, _ backHand: CGPoint) {
        switch build.weapon {
        case .katana:
            if pose.sheathed > 0 {
                // Going home: from the hand the blade runs back along the scabbard's line and into its mouth.
                let mouth = scabbardMouth
                let showing = hypot(mouth.x - hand.x, mouth.y - hand.y)
                blade(from: hand, angle: scabbardAngle, length: 0.6 * H, width: 0.024 * H, gleam: 0.8,
                      visible: min(0.999, showing / (0.6 * H)))
            } else {
                blade(from: hand, angle: pose.blade, length: 0.6 * H, width: 0.024 * H, gleam: 1, flat: pose.flat)
            }
        case .nodachi:
            blade(from: hand, angle: pose.blade, length: 0.78 * H, width: 0.03 * H, gleam: 0.85)
        case .knife:
            blade(from: hand, angle: pose.blade, length: 0.25 * H, width: 0.024 * H, gleam: 0.75)
        case .twin:
            blade(from: hand, angle: pose.blade, length: 0.4 * H, width: 0.022 * H, gleam: 0.8)
            blade(from: backHand, angle: pose.blade2, length: 0.38 * H, width: 0.02 * H, gleam: 0.5)
        case .spear:
            let d = dir(pose.blade), n = CGPoint(x: -d.y, y: d.x)
            let tip = at(hand, d, Drawer.spear * H)
            self.tip = at(tip, d, 0.15 * H)
            fill([at(at(hand, d, -0.38 * H), n, 0.009 * H), at(tip, n, 0.009 * H), at(tip, n, -0.009 * H),
                  at(at(hand, d, -0.38 * H), n, -0.009 * H)], body)
            fill([at(tip, n, 0.012 * H), at(at(tip, d, 0.05 * H), n, 0.026 * H), at(tip, d, 0.15 * H),
                  at(at(tip, d, 0.05 * H), n, -0.026 * H), at(tip, n, -0.012 * H)], body)
            pen.line(at(tip, d, 0.02 * H), at(tip, d, 0.14 * H), Paint(Palette.steel, 0.8), width: max(1, 0.008 * H))
            let t = at(tip, d, -0.015 * H)
            fill([at(t, n, 0.012 * H), at(t, n, -0.012 * H), CGPoint(x: t.x - 0.01 * H, y: t.y - 0.07 * H)], Paint(build.accent))
        case .club:
            let d = dir(pose.blade), n = CGPoint(x: -d.y, y: d.x)
            // Brought down into the ground, it stops there.
            var length = 0.6 * H
            let ground = Figure.feet.y * H + 0.03 * H
            if pose.roll == 0, d.y < 0, hand.y + d.y * length < ground { length = max(0.2 * H, (ground - hand.y) / d.y) }
            let end = at(hand, d, length)
            tip = end
            fill([at(at(hand, d, -0.1 * H), n, 0.018 * H), at(at(hand, d, 0.12 * H), n, 0.03 * H), at(end, n, 0.052 * H),
                  at(at(end, d, 0.04 * H), n, 0.02 * H), at(at(end, d, 0.04 * H), n, -0.02 * H), at(end, n, -0.052 * H),
                  at(at(hand, d, 0.12 * H), n, -0.03 * H), at(at(hand, d, -0.1 * H), n, -0.018 * H)], body)
            for i in 0..<5 where (0.22 + 0.08 * CGFloat(i)) * H < length {
                let p = at(hand, d, (0.22 + 0.08 * CGFloat(i)) * H)
                let w = (0.034 + 0.004 * CGFloat(i)) * H
                for s in [CGFloat(1), -1] {
                    let base = at(p, n, s * w)
                    fill([at(base, d, -0.012 * H), at(base, n, s * 0.022 * H), at(base, d, 0.012 * H)], body)
                }
            }
        case .bow:
            let d = dir(pose.blade)
            let n = CGPoint(x: -d.y, y: d.x)
            let top = at(at(hand, n, 0.66 * H), d, -0.06 * H), bottom = at(at(hand, n, -0.34 * H), d, -0.04 * H)
            var limb = Path()
            limb.move(at(top, d, -0.03 * H))
            limb.quad(top, control: at(top, n, -0.03 * H))
            limb.quad(bottom, control: at(at(hand, n, 0.14 * H), d, 0.22 * H))
            limb.quad(at(bottom, d, -0.025 * H), control: at(bottom, n, 0.025 * H))
            pen.stroke(limb, body, width: 0.022 * H, round: true)
            var nock = at(hand, d, -0.07 * H)
            if pose.draw > 0 {
                nock = backHand
                pen.line(nock, at(hand, d, 0.1 * H), body, width: 0.011 * H)
                pen.line(at(hand, d, 0.05 * H), at(hand, d, 0.1 * H), Paint(Palette.steel, 0.9), width: 0.011 * H)
            }
            var string = Path()
            string.move(top)
            string.line(nock)
            string.line(bottom)
            pen.stroke(string, Paint(RGB(0.5, 0.5, 0.5), 0.9), width: max(1, 0.006 * H))
        }
    }

    mutating func backGear() {
        let flutter = sin(pose.wave * 2 * .pi)
        switch build.back {
        case .none:
            break
        case .coat:
            // The haori's split tails: two long, narrow blades of cloth from the small of the back to the calf, close
            // at rest, streaming out behind him in a hard move, the near one ahead of the far.
            let back = CGPoint(x: -face.x, y: 0)
            let root = torsoPoint(0.62, -build.chest * H * 0.45), waistBack = torsoPoint(0.02, -build.waist * H * 0.7)
            for (i, lag) in [(0, CGFloat(0.3)), (1, 0.0)] {
                let reach = (0.38 + 0.08 * pose.stream) * H
                let lift = (-0.62 + 0.52 * pose.stream + 0.04 * flutter * (1 + lag)) * reach
                let out = (0.18 + 0.72 * pose.stream) * reach + flutter * 0.02 * H * (1 + lag)
                let tip = CGPoint(x: waistBack.x + back.x * (out + CGFloat(i) * 0.015 * H), y: waistBack.y + lift - CGFloat(i) * 0.02 * H)
                let bend = CGPoint(x: mid(root, tip).x + back.x * 0.02 * H, y: mid(root, tip).y - (0.04 - 0.03 * pose.stream) * H)
                var tail = Path()
                tail.move(root)
                tail.quad(tip, control: bend)
                tail.quad(waistBack, control: CGPoint(x: mid(waistBack, tip).x, y: mid(waistBack, tip).y - 0.02 * H))
                tail.close()
                pen.fill(tail, i == 0 ? shade : body)
            }
        case .quiver:
            let base = at(at(shoulder, across, -0.07 * H), up, -0.2 * H)
            let d = CGPoint(x: -0.45, y: 0.9)
            let top = at(base, d, 0.26 * H)
            segment(base, top, 0.05 * H, 0.06 * H, 0.06 * H, body, bulge: 0, at: 0.5)
            for i in 0..<3 {
                let root = at(top, CGPoint(x: 1, y: 0), (CGFloat(i) - 1) * 0.018 * H)
                pen.line(root, at(root, d, 0.06 * H), Paint(RGB(0.85, 0.85, 0.8), 0.9), width: max(1, 0.01 * H))
            }
        case .banner:
            let base = at(at(shoulder, across, -0.08 * H), up, -0.1 * H)
            let top = CGPoint(x: base.x - 0.03 * H, y: base.y + 0.62 * H)
            fill([at(base, CGPoint(x: 1, y: 0), 0.008 * H), at(top, CGPoint(x: 1, y: 0), 0.006 * H),
                  at(top, CGPoint(x: -1, y: 0), 0.006 * H), at(base, CGPoint(x: -1, y: 0), 0.008 * H)], body)
            let f = flutter * 0.025 * H
            var flag = Path()
            flag.move(CGPoint(x: top.x, y: top.y - 0.02 * H))
            flag.quad(CGPoint(x: top.x - 0.18 * H, y: top.y - 0.03 * H + f), control: CGPoint(x: top.x - 0.09 * H, y: top.y - 0.02 * H - f))
            flag.line(CGPoint(x: top.x - 0.17 * H, y: top.y - 0.36 * H + f))
            flag.line(CGPoint(x: top.x - 0.085 * H, y: top.y - 0.3 * H))
            flag.line(CGPoint(x: top.x, y: top.y - 0.34 * H))
            flag.close()
            pen.fill(flag, Paint(RGB(0.55, 0.05, 0.06)))
            let c = CGPoint(x: top.x - 0.09 * H, y: top.y - 0.16 * H + f * 0.5)
            fill([CGPoint(x: c.x, y: c.y + 0.045 * H), CGPoint(x: c.x + 0.035 * H, y: c.y), CGPoint(x: c.x, y: c.y - 0.045 * H),
                  CGPoint(x: c.x - 0.035 * H, y: c.y)], Paint(build.accent))
            fill([CGPoint(x: top.x - 0.2 * H, y: top.y - 0.008 * H), CGPoint(x: top.x + 0.01 * H, y: top.y - 0.008 * H),
                  CGPoint(x: top.x + 0.01 * H, y: top.y - 0.022 * H), CGPoint(x: top.x - 0.2 * H, y: top.y - 0.022 * H)], body)
        }
    }

    /// The trail of a swing: a thin crescent swept by the blade tip, faint where the swing began and brightest at
    /// the blade, with a hairline edge; squashed into a shallow ellipse for a level cut. A thrust leaves speed lines
    /// streaming back along the blade instead.
    /// How far a yari's shaft runs ahead of the lead hand, before its head.
    static let spear: CGFloat = 0.52

    static func smear(_ pen: inout Pen, origin: CGPoint, radius outer: CGFloat, blade: CGPoint, H: CGFloat, _ smear: Pose.Smear) {
        if smear.thrust {
            let n = CGPoint(x: -blade.y, y: blade.x)
            let tip = at(origin, blade, outer)
            // A spark of light at the point, and lines streaming back past the blade above and below it.
            for (offset, back, length, alpha) in [(CGFloat(0.045), CGFloat(0.02), CGFloat(0.5), CGFloat(0.75)), (-0.05, 0.08, 0.42, 0.6),
                                                  (0.1, 0.12, 0.3, 0.4), (-0.1, 0.18, 0.24, 0.3)] {
                let head = at(at(tip, n, offset * H), blade, -back * H), tail = at(head, blade, -length * H)
                let w = 0.012 * H
                pen.fill([at(head, n, w / 2), at(head, blade, w * 1.5), at(head, n, -w / 2), tail], Paint(.white, alpha * smear.strength))
            }
            let r = 0.035 * H
            pen.fill([at(tip, blade, r * 1.6), at(tip, n, r * 0.45), at(tip, blade, -r * 0.8), at(tip, n, -r * 0.45)], Paint(.white, 0.9 * smear.strength))
            return
        }
        let scale = outer / (0.6 * H)
        // A trail never goes below the ground.
        let ground = Figure.feet.y * H
        func point(_ a: CGFloat, _ r: CGFloat) -> CGPoint {
            CGPoint(x: origin.x + sin(a) * r, y: max(ground, origin.y - cos(a) * r * smear.flat))
        }
        let steps = 18
        for i in 0..<steps {
            let t0 = CGFloat(i) / CGFloat(steps), t1 = CGFloat(i + 1) / CGFloat(steps)
            let a0 = smear.from + (smear.to - smear.from) * t0, a1 = smear.from + (smear.to - smear.from) * t1
            let w0 = (0.02 * H + 0.2 * H * t0 * t0) * scale, w1 = (0.02 * H + 0.2 * H * t1 * t1) * scale
            pen.fill([point(a0, outer), point(a1, outer), point(a1, outer - w1), point(a0, outer - w0)],
                     Paint(.white, (0.05 + 0.35 * t1) * smear.strength))
        }
        var edge = Path()
        for i in 0...steps {
            let p = point(smear.from + (smear.to - smear.from) * CGFloat(i) / CGFloat(steps), outer)
            if i == 0 { edge.move(p) } else { edge.line(p) }
        }
        pen.stroke(edge, Paint(.white, 0.9 * smear.strength), width: max(1, 0.012 * H), round: true)
    }
}
