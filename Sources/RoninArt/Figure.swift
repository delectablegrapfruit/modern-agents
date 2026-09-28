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
    /// Cut down: thrown back off his feet, arms flung wide and the weapon leaving his hand (`Figure.thrown`, whatever
    /// the number). Not a frame shown: a body felled whole starts from it and falls as a `Ragdoll`.
    case die(Int)
    /// The warlord behind his raised blade, waiting to turn a cut aside.
    case block
    /// A cut, in nine frames: chambered (furikaburi), five through the swing with the wrists cocked and the blade
    /// whipping through to full extension on the lunge, two of follow-through, and zanshin.
    case cut(Cut, Int)
    /// Back into guard after a cut a foot at a time, so that neither slides: the front foot lifted back (0) and set
    /// down as the back foot follows (1); or, from a short lunge, the back foot drawn up (2) and then the front foot
    /// stepping back (3). Before the long way back, a push-off with both feet still where the lunge put them and the
    /// hips going back between them (4); and for a middling lunge, in place of (0), the front foot lifted back from a
    /// back foot that has less far to come (5).
    case recover(Cut, Int)
    /// A cut swung again from the lunge of the one before: the chamber and the first four frames of the swing with
    /// the feet held where the lunge put them (from frame 5 on it is the cut's own), so the planted front foot never
    /// slides back. Not for the draw, which only ever opens a stage.
    case chain(Cut, Int)
    /// A step in guard, to find his place again. Back: the front foot lifted back (0) and set down as the back foot
    /// follows (2). Forward, out of the wide stance a blow leaves him in: the back foot drawn up under him first (1),
    /// then the front foot stepped out into guard (3). Each foot only ever moves the way he is going.
    case shuffle(Int)
    /// Hurt and short of breath: cycles of eight frames. Heaving over a sagging guard (0); a hand pressed to the
    /// bleeding wound in his side, hunched over it, the blade held low in the other (1); the knees giving and caught
    /// again (2).
    case winded(Int, Int)
    /// Reeling from a blow, two more ways than `hurt` (four frames each): staggered back a step at a time (0);
    /// dropped to a knee and pushed back up (1).
    case reel(Int, Int)
    /// Off balance after a cut at nothing (2 frames).
    case stumble(Int)
    /// A cut turned aside by the warlord's guard: the blade thrown back, the ronin rocked onto his heels (2 frames).
    case repelled(Int)
    /// Taking a blow: the impact, reeling, and bracing back into guard.
    case hurt(Int)
    /// After a stage: ō-chiburi, the blood flung from the blade (4 frames), and nōtō, the blade slid home (3).
    case flourish(Int)
    /// Falling: struck, the knees buckling, kneeling over the planted sword, pitching forward off the knee onto his
    /// hands, and face down in the dirt.
    case fall(Int)
    /// Blades crossed with the warlord's. The ronin (2 frames): his cut met by the warlord's raised blade and bound
    /// on it at the moment of impact, in a lunge (0); then his blade driven back up off it and forced away, the
    /// weight thrown back onto the back foot and the front foot coming off the ground (1). The warlord (2 frames): the
    /// blow taken on his blade, braced and driven forward into it (0); then shoving the ronin's blade off (1), his
    /// feet where his guard (`block`) has them. `Figure.contact` gives where the blades meet on each, and
    /// `Figure.clashGap` how far apart they stand for them to.
    case clash(Int)
    /// The ronin backing off in guard with the guard up, a foot at a time so that neither slides (4 frames): the back
    /// foot lifted back (0) and set down behind (1), the front one planted; then the front foot drawn back after it
    /// (2) and set down, his feet as they are in guard (3), the back one planted. Played 0, 1, 2, 3 for each step.
    case retreat(Int)

    public static let walkFrames = 12
    public static let foeIdleFrames = 6
    public static let heroIdleFrames = 8
    public static let iaiFrames = 6
    public static let cutFrames = 9
    public static let recoverFrames = 6
    public static let chainFrames = 5
    public static let shuffleFrames = 4
    public static let windedCycles = 3
    public static let windedFrames = 8
    public static let reels = 2
    public static let reelFrames = 4
    public static let flourishFrames = 7
    public static let windupFrames = 4
    public static let strikeFrames = 3
    public static let hurtFrames = 3
    public static let fallFrames = 5
    public static let clashFrames = 2
    public static let retreatFrames = 4
}

/// A part of a man cut apart.
public enum Severed: Hashable, Sendable {
    /// What is above a cut through the trunk, `at` a fraction of the way up it from the hips, on a `slant` (radians,
    /// rising toward the front): the chest, the arms and the head.
    case above(at: CGFloat, slant: CGFloat)
    /// What is below it: the hips and the legs.
    case below(at: CGFloat, slant: CGFloat)
    /// All of him but his head.
    case headless

    var hasLegs: Bool { if case .above = self { return false } else { return true } }
    var hasArms: Bool { if case .below = self { return false } else { return true } }
    var hasHead: Bool { if case .above = self { return true } else { return false } }
    /// How far up the trunk what is left of it runs, from and to (fractions from the hips to the neck).
    var trunk: (low: CGFloat, high: CGFloat) {
        switch self {
        case .above(let at, _): return (at, 1)
        case .below(let at, _): return (0, at)
        case .headless: return (0, 1)
        }
    }
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

    /// The bright trail a blade leaves: a steel edge along the path its point took, brightest at the blade and thinning
    /// to nothing back along the swing, as strong as `strength`. On a smear frame (one with `ghosts`) it follows them,
    /// and on back along the arc about the hand (squashed toward a level plane when `flat` is below 1) as far as the
    /// angle `from`; on its own (a blade just stopped dead, or just out of its scabbard) it is the arc from `from` to
    /// `to` about the hand. For a thrust, speed lines along the blade.
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
    /// Where the hips are, from the spot the figure stands on (figure heights, x toward the way it faces, y up),
    /// in place of wherever the legs would put them: for a body thrown about as it will.
    public var hipAt: CGPoint?
    /// For a body lying where it fell (a `Ragdoll`'s, or the ronin face down at the end of his fall): how far below
    /// its hips the ground is, in figure heights, so that its cloth and gear hang toward the ground and lie on it
    /// instead of passing through. Nil for a figure on its feet.
    public var floor: CGFloat?
    /// The free hand pressed to a wound in his side, drawn over the body with the blood coming through the fingers.
    public var clutch = false
    /// What is left of a man cut apart: the part drawn.
    public var severed: Severed?
    /// Whether the weapon is in hand (a dead man has let go of his).
    public var armed = true
    /// A smear frame (every frame of a fast motion: each frame of a swing, a blow and its follow-through, a stumble, a
    /// blade flung back): the in-betweens since the frame before, oldest first, which are never drawn as poses but give
    /// the path the arms and the weapon took. Along it, under the pose, the arms dissolve back along their path and a
    /// fan of ink sweeps between the blades, dense and full just behind the blade and fading smoothly back toward
    /// where the swing came from. `drag`: how far the body itself was carried in the frame (figure heights; forward is
    /// positive), drawn as a soft blur of the silhouette back the way it came.
    public var ghosts: [Pose] = []
    public var drag: CGFloat = 0
    /// How much of the ronin's blade is in its scabbard, 0…1.
    public var sheathed: CGFloat = 0
    /// How far the scabbard is pulled back for the draw (saya-biki), 0…1.
    public var saya: CGFloat = 0
    /// How far a bow is drawn, 0…1.
    public var draw: CGFloat = 0
    public var tilt: CGFloat = 0
    /// The shoulders turned about the spine: how far the near shoulder (the sword arm's) is carried forward of the
    /// trunk's line, and the far one back, in figure heights. A heavy man's shoulders roll as he walks.
    public var twist: CGFloat = 0
    /// In the air: the hips stay put instead of the lower foot finding the ground.
    public var airborne = false
    /// On the balls of his feet: how far a foot on the ground is pointed, the heel raised off it (radians).
    public var heels: CGFloat = 0
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
        p.twist = m(a.twist, b.twist)
        p.heels = m(a.heels, b.heels)
        p.stream = m(a.stream, b.stream)
        p.wave = m(a.wave, b.wave)
        p.smear = nil
        p.ghosts = []
        p.drag = 0
        return p
    }

    /// The in-betweens of a motion from `a` (included) up to `b` (not), evenly spaced and oldest first: the path a
    /// smear frame follows.
    static func between(_ a: Pose, _ b: Pose, count: Int = Pose.smearSteps) -> [Pose] {
        (0..<count).map { mix(a, b, CGFloat($0) / CGFloat(count)) }
    }

    /// How many in-betweens a smear frame's path is sampled at.
    static let smearSteps = 10
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
    /// How far the muscle swells between the joints beyond `bulk` (1 is the ronin): the shoulders and the back, the
    /// upper arms and forearms, the thighs (the calves a little less), the neck. The joints themselves (wrists, elbows,
    /// knees, ankles) stay as fine as `bulk` has them, so a man built heavy is thick with muscle, not swollen.
    public var brawn: CGFloat = 1
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
            // Every foe is built to be feared: broad in the back and the shoulders, deep in the chest, heavy in the
            // thigh and the forearm, fine at the joints and the waist, and a head a little small for the body on it.
            case .grunt:
                return Build(height: 0.95, bulk: 1.04, brawn: 1.2, chest: 0.19, waist: 0.07, head: 0.048, legs: .leggings, skirt: 0.14,
                             weapon: .spear, gear: .jingasa, eyes: RGB(1, 0.22, 0.12), accent: RGB(0.75, 0.12, 0.1))
            // The shinobi, built for speed: the lightest of them, wiry and long in the leg, the muscle lean and hard
            // rather than heavy, nothing on him to catch the wind.
            case .runner:
                return Build(height: 0.9, bulk: 0.93, brawn: 1.08, chest: 0.165, waist: 0.057, head: 0.048, legs: .leggings, weapon: .knife,
                             gear: .hood, eyes: RGB(1, 0.6, 0.12), accent: RGB(1, 0.5, 0.1))
            case .brute:
                return Build(height: 1.22, bulk: 1.4, brawn: 1.26, chest: 0.29, waist: 0.106, head: 0.042, legs: .bare, skirt: 0.1,
                             weapon: .club, gear: .horns, eyes: RGB(1, 0.2, 0.1), accent: RGB(0.72, 0.32, 1.0))
            case .dancer:
                return Build(height: 0.97, bulk: 0.94, brawn: 1.12, chest: 0.17, waist: 0.06, head: 0.049, weapon: .twin, gear: .ponytail,
                             eyes: RGB(0.3, 0.95, 1.0), accent: RGB(0.25, 0.9, 1.0))
            case .archer:
                return Build(height: 0.96, bulk: 1.0, brawn: 1.14, chest: 0.18, waist: 0.066, head: 0.048, sleeves: true, weapon: .bow,
                             gear: .eboshi, back: .quiver, eyes: RGB(0.6, 1.0, 0.3), accent: RGB(0.5, 0.9, 0.3))
            case .warlord:
                return Build(height: 1.3, bulk: 1.2, brawn: 1.22, chest: 0.235, waist: 0.086, head: 0.046, sleeves: true, skirt: 0.18,
                             plated: true, weapon: .nodachi, gear: .kabuto, back: .banner, eyes: RGB(1, 0.78, 0.2), accent: Palette.gold)
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
/// over a narrow waist, a small head on a long frame (about eight and a half heads tall), slender curved blades,
/// cloth that ends in points. Each kind keeps an outline of its own at 60 points tall. The ronin, who is the show, is
/// drawn at a higher resolution and has the most frames: nine for every cut, five more to swing it again from the
/// lunge and six to step back into guard, a breathing guard and three ways of fighting for breath, the iai stance
/// with the blade sheathed, and the chiburi and nōtō at the end of a stage.
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
            for cut in Cut.allCases {
                frames += (0..<Frame.cutFrames).map { .cut(cut, $0) } + (0..<Frame.recoverFrames).map { .recover(cut, $0) }
                if cut != .nukitsuke { frames += (0..<Frame.chainFrames).map { .chain(cut, $0) } }
            }
            frames += (0..<Frame.shuffleFrames).map { .shuffle($0) }
            frames += [.stumble(0), .stumble(1), .repelled(0), .repelled(1)]
            frames += (0..<Frame.clashFrames).map { .clash($0) } + (0..<Frame.retreatFrames).map { .retreat($0) }
            frames += (0..<Frame.hurtFrames).map { .hurt($0) } + (0..<Frame.fallFrames).map { .fall($0) }
            for v in 0..<Frame.windedCycles { frames += (0..<Frame.windedFrames).map { .winded(v, $0) } }
            for v in 0..<Frame.reels { frames += (0..<Frame.reelFrames).map { .reel(v, $0) } }
            return frames + (0..<Frame.flourishFrames).map { .flourish($0) }
        case .foe(let kind):
            // (The dead are not frames: they fall as a `Ragdoll`, from `struck` or `thrown`.)
            var frames: [Frame] = (0..<Frame.foeIdleFrames).map { .idle($0) }
            frames += (0..<Frame.walkFrames).map { .walk($0) }
            frames += (0..<Frame.windupFrames).map { .windup($0) }
            // The archer's blow is the release (`loose`).
            if kind != .archer { frames += (0..<Frame.strikeFrames).map { .strike($0) } }
            frames += [.stagger(0), .stagger(1)]
            if kind == .dancer || kind == .warlord { frames.append(.leap) }
            if kind == .warlord { frames += [.block] + (0..<Frame.clashFrames).map { .clash($0) } }
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

    /// A head struck off a figure in `pose`, on the figure's canvas where it was: the head and all it wears, on a
    /// short length of neck cut off flat with the face of the cut on its end, and nothing else of him (the body left
    /// standing is `Severed.headless` in the same pose, its stump overlapping the neck for the instant they part).
    /// With the wound's place on the canvas (pixels, y up) and the way blood leaves it (radians from +x).
    public static func severedHead(_ cast: Cast, pose: Pose) -> (sketch: Sketch, wound: CGPoint, angle: CGFloat) {
        let build = Build.of(cast)
        let H = pixelHeight(cast) * build.height
        var drawer = Drawer(pose: pose, build: build, H: H)
        drawer.head(severed: true)
        var sketch = drawer.pen.sketch
        var wound = at(drawer.neck, drawer.headUp, build.head * H * Drawer.headCut)
        var angle = atan2(-drawer.headUp.y, -drawer.headUp.x)
        if pose.roll != 0 {
            // Turned about the hips with the rest of him.
            let pivot = drawer.hip, r = pose.roll
            let turn = { (p: CGPoint) -> CGPoint in
                let x = p.x - pivot.x, y = p.y - pivot.y
                return CGPoint(x: pivot.x + x * cos(r) + y * sin(r), y: pivot.y - x * sin(r) + y * cos(r))
            }
            sketch = sketch.mapped(turn)
            wound = turn(wound)
            angle -= r
        }
        sketch.rimRadius = max(1.1, H * 0.008)
        return (sketch, wound, angle)
    }

    /// Where the point of a figure's weapon is in a frame, from its feet, in its own heights (x toward the way it
    /// faces, y up); nil for a bow.
    public static func tip(_ cast: Cast, _ frame: Frame) -> CGPoint? { tip(cast, pose: pose(cast, frame)) }

    static func tip(_ cast: Cast, pose: Pose) -> CGPoint? {
        let build = Build.of(cast)
        let H = pixelHeight(cast) * build.height
        var drawer = Drawer(pose: pose, build: build, H: H)
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

    /// A figure's joints in a pose, from the spot it stands on, in its own heights (x toward the way it faces, y up),
    /// turned with the pose's roll (but not let down to the ground): the hips, the neck, the middle of the head,
    /// the knees and ankles (the near leg's, then the far's), and the elbows and hands (the near arm's, then the far's).
    static func skeleton(_ cast: Cast, _ pose: Pose) -> [CGPoint] {
        let build = Build.of(cast)
        let H = pixelHeight(cast) * build.height
        let d = Drawer(pose: pose, build: build, H: H)
        let head = at(d.neck, d.headUp, build.head * H * 1.25)
        let fk = at(d.hip, dir(pose.front.thigh), thigh * H), bk = at(d.hip, dir(pose.back.thigh), thigh * H)
        let joints = [d.hip, d.neck, head, fk, at(fk, dir(pose.front.shin), shin * H), bk, at(bk, dir(pose.back.shin), shin * H),
                      d.main.elbow, d.main.hand, d.other.elbow, d.other.hand]
        let pivot = d.hip, r = pose.roll
        return joints.map { p in
            let x = p.x - pivot.x, y = p.y - pivot.y
            let turned = CGPoint(x: pivot.x + x * cos(r) + y * sin(r), y: pivot.y - x * sin(r) + y * cos(r))
            return CGPoint(x: turned.x / H - feet.x, y: turned.y / H - feet.y)
        }
    }

    /// How far up the neck (in head radii from its root) a headless body's stump stands: clear of the shoulders, so
    /// its wound shows (and a `Ragdoll`'s blood leaves from there).
    static let neckCut: CGFloat = 0.8

    /// Limb lengths, in figure heights: thigh, shin, trunk (hips to neck), upper arm, forearm; and how far the
    /// shoulder sits below the neck.
    static var limbs: (thigh: CGFloat, shin: CGFloat, torso: CGFloat, upperArm: CGFloat, forearm: CGFloat, shoulder: CGFloat) {
        (thigh, shin, torso, upperArm, forearm, 0.045)
    }

    /// The trunk in profile, as it is drawn: a deep chest and a broad back over a narrow waist, the trapezius sloping
    /// up to the neck. Each point is how far up the trunk it is (a share of it, from the hips) and how far out from the
    /// trunk's line toward the chest (figure heights; negative, the back).
    static func trunkProfile(_ build: Build) -> [(along: CGFloat, out: CGFloat)] {
        let c = build.chest, w = build.waist
        // A brawny man's back swells out behind the shoulder blades and his trapezius stands up in a hump behind the
        // neck (1 for the ronin: his own lines).
        let m = build.brawn - 1, lats = 1 + 1.3 * m
        return [(0, -w * 0.6), (0, w * 0.5), (0.28, w * 0.46), (0.52, c * 0.5), (0.7, c * 0.64), (0.86, c * (0.56 + 0.2 * m)), (0.98, c * (0.24 + 0.2 * m)),
                (1.06 + 0.1 * m, c * 0.02), (1.07 + 0.12 * m, -c * (0.16 + 0.3 * m)), (0.94, -c * 0.52 * lats), (0.7, -c * 0.55 * lats),
                (0.46, -c * 0.38 * (1 + 0.6 * m)), (0.26, -w * 0.56)]
    }

    /// The outline of what is drawn of a figure's trunk, or of the part of it a cut leaves: x up the trunk's line from
    /// the hips, y out from it toward the chest, both in figure heights. What a `Ragdoll`'s trunk lies on.
    static func trunkOutline(_ cast: Cast, severed: Severed? = nil) -> [CGPoint] {
        let points = trunkProfile(Build.of(cast)).map { CGPoint(x: $0.along * torso, y: $0.out) }
        let at: CGFloat, slant: CGFloat, upper: Bool
        switch severed {
        case .above(let a, let s)?: (at, slant, upper) = (a, s, true)
        case .below(let a, let s)?: (at, slant, upper) = (a, s, false)
        default: return points
        }
        // The cut as `Drawer.cut` runs it, in these terms: through the trunk's line `at` of the way up, rising toward
        // the chest by `slant`.
        let normal = CGPoint(x: cos(slant), y: -sin(slant))
        return Drawer.clip(points, CGPoint(x: at * torso, y: 0), upper ? normal : CGPoint(x: -normal.x, y: -normal.y))
    }

    /// Where a figure's ankles are in a frame, from the point it stands on, in its own heights: x toward the way it
    /// faces, y how far each is lifted off the ground. (Before any roll: for figures on their feet.)
    public static func footing(_ cast: Cast, _ frame: Frame) -> (front: CGPoint, back: CGPoint) { footing(pose(cast, frame)) }

    static func footing(_ p: Pose) -> (front: CGPoint, back: CGPoint) {
        let df = thigh * cos(p.front.thigh) + shin * cos(p.front.shin)
        let db = thigh * cos(p.back.thigh) + shin * cos(p.back.shin)
        let h = hipHeight(p)
        return (CGPoint(x: p.shift + thigh * sin(p.front.thigh) + shin * sin(p.front.shin), y: h - df),
                CGPoint(x: p.shift + thigh * sin(p.back.thigh) + shin * sin(p.back.shin), y: h - db))
    }

    /// How high a figure on its feet carries its hips over the lower ankle, in its own heights.
    static func hipHeight(_ p: Pose) -> CGFloat {
        guard !p.airborne else { return 0.42 - 0.025 }
        return max(thigh * cos(p.front.thigh) + shin * cos(p.front.shin), thigh * cos(p.back.thigh) + shin * cos(p.back.shin)) + p.lift
    }

    /// A leg reaching from the hip to a foot (in figure heights from the hip, y up), the knee bent forward.
    private static func leg(to foot: CGPoint) -> (thigh: CGFloat, shin: CGFloat) {
        let l = min(thigh + shin - 0.0005, max(0.02, hypot(foot.x, foot.y)))
        let toward = atan2(foot.x, -foot.y)
        let a = acos(max(-1, min(1, (thigh * thigh + l * l - shin * shin) / (2 * thigh * l))))
        let b = acos(max(-1, min(1, (shin * shin + l * l - thigh * thigh) / (2 * shin * l))))
        return (toward + a, toward - b)
    }

    /// Stands a pose on its feet: the hips `hip.y` over the ankles and `hip.x` forward, each foot at its x along
    /// the ground and lifted by its y (one of them on the ground).
    private static func plant(_ p: inout Pose, hip: CGPoint, front: CGPoint, back: CGPoint) {
        p.shift = hip.x
        p.lift = 0
        p.airborne = false
        p.front = leg(to: CGPoint(x: front.x - hip.x, y: front.y - hip.y))
        p.back = leg(to: CGPoint(x: back.x - hip.x, y: back.y - hip.y))
    }

    // MARK: Poses

    public static func pose(_ cast: Cast, _ frame: Frame) -> Pose {
        let base = stance(cast)
        switch frame {
        case .idle(let k):
            if cast == .foe(.runner) { return twitch(k) }
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
                // Smear frames: the whole blow in one stroke from the coil, the body flung into it; then on into the
                // follow-through, the last of the blow.
                var p = key(cast, .strike(k))
                guard cast != .foe(.archer) else { return p }
                var from = key(cast, k == 0 ? .windup(2) : .strike(0))
                // The kanabō comes over the top, not up from under.
                if cast == .foe(.brute), from.blade < 0, p.blade > 0 { from.blade += 2 * .pi }
                p.ghosts = Pose.between(from, p)
                p.drag = k == 0 ? (cast == .foe(.runner) ? 0.06 : 0.05) : 0.02
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
        case .die:
            return thrown(cast)
        case .cut(let cut, let phase):
            return swing(cut, phase)
        case .chain(let cut, let phase):
            return swing(cut, phase, held: true)
        case .recover(let cut, let k):
            return recover(cut, k)
        case .shuffle(let k):
            return shuffle(k)
        case .winded(let v, let k):
            return winded(v, k)
        case .reel(let v, let k):
            return reel(v, k)
        case .flourish(let k):
            return flourish(k)
        case .clash(let k):
            return clash(cast, k)
        case .retreat(let k):
            return retreat(k)
        case .stumble(0) where cast == .hero, .repelled(0) where cast == .hero:
            // Carried past the mark, or flung back off a guard: smeared from his guard, the blade's trail with it.
            var p = key(cast, frame)
            let home = stance(.hero)
            p.ghosts = Pose.between(home, p)
            p.smear = sweep(home.blade, p.blade, 0.5)
            p.drag = frame == .stumble(0) ? 0.04 : -0.04
            return p
        case .hurt(0) where cast == .hero:
            // Struck: the body blurred back with the blow.
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

    /// How a figure walks. Every foe comes on low and bent-kneed, his knees never straightening: the hips carried in a
    /// crouch, the body pitched forward over them, the shoulders squared, the head steady, the weapon held ready.
    struct Gait {
        /// How far a full stride (two steps) carries him, in his heights.
        var stride: CGFloat
        /// Of a stride's twelve frames, how many each foot is on the ground: more than six, walking (both down
        /// together as a foot lands, for a frame, or two for a heavy tread); fewer, running (neither, for a moment).
        var planted: Int
        /// How high the hips ride over the ankles at the top of a step: the crouch he comes on in.
        var hips: CGFloat
        /// How far the hips sink under his weight through a step: `give`, times a share for each of the step's six
        /// frames from the one a foot lands in (negative: rising, a runner leaving the ground).
        var give: CGFloat
        var sink: [CGFloat]
        /// How high the swinging foot is lifted, and how soon in the swing it is highest (a share of it: early, a foot
        /// picked up deliberately and brought down hard).
        var lift: CGFloat
        var peak: CGFloat
        /// How far the body is pitched forward over the stride, and how far it rocks on after each footfall as the
        /// legs brake under it.
        var lean: CGFloat
        var rock: CGFloat
        /// How far the hips lag behind the legs as a foot lands, and surge on after it (figure heights).
        var lag: CGFloat
        /// How far the shoulders roll against the legs (figure heights).
        var roll: CGFloat
        /// The head's angle from upright, held whatever the body does.
        var head: CGFloat
        /// How far the free arm swings; how far the weapon drops after each footfall before it settles (figure
        /// heights), and how far its point swings with it (radians).
        var arms: CGFloat
        var carry: CGFloat
        var droop: CGFloat
        /// A sprinter's leg recovery, in place of the eased swing: where the swinging foot goes between leaving the
        /// ground behind him and coming down ahead of him, from the spot he stands on (figure heights, y up), at even
        /// shares of its time in the air: the heel flicked up behind, the knee driven through with the foot tucked
        /// under the hips, the shin unfolding ahead and clawing back down onto the ground.
        var recovery: [CGPoint]? = nil
        /// How far back the feet are on the ground, from under the hips to behind them (figure heights): a sprinter's
        /// foot comes down under him and drives off well behind.
        var behind: CGFloat = 0
        /// How far the heels are raised (the feet pointed, radians): running on the balls of the feet.
        var heels: CGFloat = 0

        /// A walker's hips: lowest as a foot lands, highest as the body passes over it.
        static let walking: [CGFloat] = [1, 0.75, 0.25, 0, 0.25, 0.75]
        /// A heavy tread's: the body sinks after the foot comes down, the knee giving under it, and is pushed up again.
        static let heavy: [CGFloat] = [0.55, 1, 0.7, 0.25, 0, 0.2]
        /// A runner's: down onto the foot, and up off it into the air.
        static let running: [CGFloat] = [0.4, 1, 0.45, -0.3, -0.9, -0.5]
    }

    static func gait(_ cast: Cast) -> Gait {
        switch cast {
        case .hero:
            return Gait(stride: 0.8, planted: 7, hips: 0.535, give: 0.012, sink: Gait.walking, lift: 0.06, peak: 0.5, lean: 0.12, rock: 0.02,
                        lag: 0.005, roll: 0, head: 0.1, arms: 0.3, carry: 0.01, droop: 0.02)
        case .foe(let kind):
            switch kind {
            // The ashigaru: a drilled advance behind the levelled spear, crouched over it, the knees well bent.
            case .grunt:
                return Gait(stride: 0.86, planted: 7, hips: 0.535, give: 0.018, sink: Gait.walking, lift: 0.07, peak: 0.45, lean: 0.3,
                            rock: 0.03, lag: 0.008, roll: 0.005, head: 0.15, arms: 0.25, carry: 0.01, droop: -0.04)
            // The shinobi: a low, driving sprint, pitched hard forward over it, on the balls of his feet: each foot down
            // for a quarter of the stride and snatched up again, the heel flicked up behind and the knee driven
            // through, so that half his time he is in the air. All of it in the legs: the shoulders held square and the
            // arms still, the knife up and ready.
            case .runner:
                return Gait(stride: 1.4, planted: 3, hips: 0.5, give: 0.03, sink: Gait.running, lift: 0.2, peak: 0.35, lean: 0.86,
                            rock: 0.05, lag: 0.012, roll: 0.004, head: 0.45, arms: 0, carry: 0, droop: 0,
                            recovery: [v(-0.42, 0.26), v(-0.08, 0.31), v(0.28, 0.17)], behind: 0.085, heels: 0.4)
            // The oni: a slow, ponderous tread, each foot picked up and stamped down, sinking deep into it and
            // heaving up out of it, the shoulders rolling, the kanabō bouncing on the shoulder.
            case .brute:
                return Gait(stride: 0.8, planted: 8, hips: 0.525, give: 0.045, sink: Gait.heavy, lift: 0.1, peak: 0.6, lean: 0.3,
                            rock: 0.05, lag: 0.02, roll: 0.014, head: 0.1, arms: 0.1, carry: 0.02, droop: 0.12)
            // The dancer: long, low, gliding steps, the hips level, both blades held out ready.
            case .dancer:
                return Gait(stride: 0.95, planted: 7, hips: 0.515, give: 0.006, sink: Gait.walking, lift: 0.05, peak: 0.55, lean: 0.3,
                            rock: 0.015, lag: 0.004, roll: 0.006, head: 0.15, arms: 0.12, carry: 0, droop: 0)
            // The archer: a wary, bent-kneed stalk, an arrow on the string.
            case .archer:
                return Gait(stride: 0.74, planted: 7, hips: 0.525, give: 0.012, sink: Gait.walking, lift: 0.06, peak: 0.45, lean: 0.28,
                            rock: 0.02, lag: 0.005, roll: 0.004, head: 0.14, arms: 0, carry: 0.006, droop: 0)
            // The warlord: a slow, heavy march, each footfall taking his weight and the body sinking into it, the
            // armour and the shouldered nodachi settling after it; the head steady.
            case .warlord:
                return Gait(stride: 0.84, planted: 8, hips: 0.53, give: 0.04, sink: Gait.heavy, lift: 0.09, peak: 0.6, lean: 0.2,
                            rock: 0.04, lag: 0.018, roll: 0.012, head: 0.04, arms: 0.05, carry: 0.016, droop: 0.07)
            }
        }
    }

    /// How far a figure travels in one full stride (two steps), in its own heights: so its feet keep to the ground.
    /// (Each foot on the ground goes back a twelfth of it a frame, so a walk frame for each twelfth travelled holds it
    /// where it is.)
    public static func stride(_ cast: Cast) -> CGFloat { gait(cast).stride }

    /// The least a knee on the ground is bent as a foe walks (radians).
    static let walkingKnee: CGFloat = 0.32

    /// How far a leg reaches from the hip to the ankle with the knee bent `knee` radians.
    static func reach(bent knee: CGFloat) -> CGFloat { (thigh * thigh + shin * shin + 2 * thigh * shin * cos(knee)).squareRoot() }

    /// A walking frame. Each foot, on the ground, stays where it is as the body passes over it (going back a twelfth of
    /// a stride a frame under a body that goes on a twelfth a frame), the knee bent under the weight; then is picked up,
    /// carried forward clear of the ground and set down a stride on. The hips ride over it in a crouch, sinking under
    /// each footfall; the legs reach from them to the feet, so no knee straightens.
    static func walk(_ cast: Cast, _ k: Int) -> Pose {
        var p = stance(cast)
        let g = gait(cast)
        let n = Frame.walkFrames, half = n / 2
        let frame = (k % n + n) % n
        let beat = g.stride / CGFloat(n)
        // Where a foot is `j` frames after it came down, from the spot he stands on (y: how far it is lifted).
        let reach = CGFloat(g.planted - 1) * beat / 2 - g.behind
        let rise = log(0.5) / log(max(0.05, min(0.95, g.peak)))
        func foot(_ j: Int) -> CGPoint {
            if j < g.planted { return v(reach - CGFloat(j) * beat, 0) }
            let frames = CGFloat(n - g.planted + 1), t = CGFloat(j - g.planted + 1) / frames
            let off = reach - CGFloat(g.planted - 1) * beat
            if let recovery = g.recovery {
                // A sprinter's recovery: through its points from where the foot left the ground to where it comes down
                // (a smooth curve through them, at even shares of the time).
                return curve([v(off, 0)] + recovery + [v(reach, 0)], t)
            }
            // In the air: eased off the ground and down onto it again a stride on, as the body goes on at its pace.
            let ease = t * t * (3 - 2 * t)
            return v(off + g.stride * ease - frames * beat * t, g.lift * sin(.pi * pow(t, rise)))
        }
        // The near foot comes down on the first frame, the far one half a stride on.
        let near = foot(frame), far = foot((frame + half) % n)
        // The hips: lagging behind the legs as a foot lands and surging on over it; sinking under each footfall and
        // pushed up again; never so high that a leg on the ground straightens (or a lifted foot is out of reach).
        let u = frame % half
        let x = -g.lag * cos(2 * .pi * CGFloat(u) / CGFloat(half))
        var y = g.hips - g.give * g.sink[u]
        let bent = Figure.reach(bent: walkingKnee), full = thigh + shin - 0.002
        for f in [near, far] {
            let dx = f.x - x
            y = min(y, f.y + ((f.y == 0 ? bent * bent : full * full) - dx * dx).squareRoot())
        }
        plant(&p, hip: v(x, y), front: near, back: far)
        // (Running, both feet may be off the ground: the hips stay where they are, over the ground, not the feet.)
        p.lift = min(near.y, far.y)
        // The body pitched forward, rocking on a frame after each footfall as the legs brake under it; the head held
        // steady on it; the shoulders rolling against the legs, the near one back as the near foot goes forward.
        let after = CGFloat((u + half - 1) % half) / CGFloat(half) * 2 * .pi
        let phase = CGFloat(frame) / CGFloat(n) * 2 * .pi
        p.lean = g.lean + g.rock * cos(after)
        p.tilt = g.head - p.lean
        p.twist = -g.roll * cos(phase)
        p.wave = CGFloat(frame) / CGFloat(n)
        p.stream = 0.2 + 0.4 * g.stride
        // The free arm swings with the near leg (against the far one); the weapon's weight rides the stride,
        // dropping a frame after each footfall and settling again.
        let settle = g.sink[(u + half - 1) % half]
        p.arm2.upper += g.arms * cos(phase)
        p.arm2.fore += g.arms * 0.6 * cos(phase)
        if let hold = p.hold { p.hold = v(hold.x, hold.y - g.carry * settle) }
        p.blade += g.droop * settle
        switch cast {
        case .foe(.grunt):
            // The yari levelled at the ronin's chest, the hands driving it on at the hip.
            p.hold = v(0.2 - 0.012 * cos(phase), -0.12 - g.carry * settle)
            p.blade = 1.66 + g.droop * settle
        case .foe(.runner):
            // Sprinting on his legs alone, the arms held still: the knife hand up before his chin, the knife reversed
            // along the forearm (sakate) and ready, as he holds it on guard; the free arm swept back along his side.
            // Both are carried with the body as it rocks over the stride, never swung.
            let rock = p.lean - g.lean
            p.grip = .one
            p.hold = nil
            p.arm = (Figure.sprintArms.knife.upper - rock, Figure.sprintArms.knife.fore - rock)
            p.arm2 = (Figure.sprintArms.free.upper - rock, Figure.sprintArms.free.fore - rock)
            p.blade = tucked(p, cast)
            p.heels = g.heels
            p.stream = 1
        case .foe(.brute):
            // The kanabō shouldered, both fists on it, its weight bouncing on the shoulder with each footfall.
            p.hold = v(0.09, -0.07 - g.carry * settle)
            p.blade = -2.38 + g.droop * settle
        case .foe(.dancer):
            // The lead blade held out low at the ronin, the other raised behind, both turning with the stride.
            p.arm = (0.95 + 0.06 * cos(phase), 1.5 + 0.06 * cos(phase))
            p.blade = 1.9 + 0.08 * cos(phase + 0.6)
            p.arm2 = (3.5 - 0.08 * cos(phase), 4.3 - 0.08 * cos(phase))
            p.blade2 = 2.05 - 0.08 * cos(phase + 0.6)
        case .foe(.archer):
            // The bow held out low before him, an arrow on the string, the string hand at the nock.
            p.hold = v(0.19, -0.2 - g.carry * settle)
            p.hold2 = v(0.07, -0.14 - g.carry * settle)
            p.draw = 0.12
            p.blade = 1.1
        case .foe(.warlord):
            // The nodachi shouldered, laid back behind the helmet, settling on the shoulder after each footfall.
            p.hold = v(0.08, -0.08 - g.carry * settle)
            p.blade = 4.12 + g.droop * settle
        default:
            break
        }
        return p
    }

    /// A point `t` of the way along a smooth curve through `points` (at even shares of `t`).
    static func curve(_ points: [CGPoint], _ t: CGFloat) -> CGPoint {
        guard points.count > 1 else { return points.first ?? .zero }
        let s = max(0, min(1, t)) * CGFloat(points.count - 1)
        let i = min(points.count - 2, Int(s)), f = s - CGFloat(i)
        let p1 = points[i], p2 = points[i + 1]
        let p0 = i > 0 ? points[i - 1] : v(2 * p1.x - p2.x, 2 * p1.y - p2.y)
        let p3 = i + 2 < points.count ? points[i + 2] : v(2 * p2.x - p1.x, 2 * p2.y - p1.y)
        func c(_ a: CGFloat, _ b: CGFloat, _ c: CGFloat, _ d: CGFloat) -> CGFloat {
            0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f)
        }
        return v(c(p0.x, p1.x, p2.x, p3.x), c(p0.y, p1.y, p2.y, p3.y))
    }

    /// How the runner carries his arms as he sprints, at his gait's lean (each turned with the body as it rocks): the
    /// knife arm's upper arm down along his side and the forearm raised before him, the fist before his chin; the free
    /// arm swept back behind the hip, the elbow a little bent.
    static let sprintArms = (knife: (upper: CGFloat(0.72), fore: CGFloat(2.78)), free: (upper: CGFloat(-1.45), fore: CGFloat(-1.0)))

    /// The runner's knife held reversed (sakate): its blade laid back along the forearm from the fist, the point out
    /// past the elbow; the angle it lies at in pose `p`.
    static func tucked(_ p: Pose, _ cast: Cast) -> CGFloat {
        let build = Build.of(cast), H = pixelHeight(cast) * build.height
        let arm = Drawer(pose: p, build: build, H: H).main
        return atan2(arm.elbow.x - arm.hand.x, -(arm.elbow.y - arm.hand.y)) - 0.22
    }

    /// The runner's guard, never still: bouncing on the balls of his feet (twice through the six frames, the second
    /// time lighter), his weight rocking forward, a twitch of the head and a flick of the knife hand; his feet where his
    /// stance has them.
    static func twitch(_ k: Int) -> Pose {
        let cast = Cast.foe(.runner)
        var p = stance(cast)
        let n = Frame.foeIdleFrames, i = (k % n + n) % n
        let feet = footing(p), hips = hipHeight(p)
        let drop: [CGFloat] = [0, 0.024, 0.008, -0.004, 0.016, 0.003]
        let sway: [CGFloat] = [0, 0.008, 0.016, 0.006, -0.004, -0.003]
        let pitch: [CGFloat] = [0, 0.05, 0.08, 0.02, 0.04, -0.01]
        let glance: [CGFloat] = [0, 0.04, -0.16, -0.1, 0.05, 0.02]
        let flick: [CGFloat] = [0, -0.08, 0.22, 0.1, -0.06, 0]
        plant(&p, hip: v(p.shift + sway[i], hips - drop[i]), front: feet.front, back: feet.back)
        p.lean += pitch[i]
        p.tilt += glance[i] - pitch[i]
        p.arm = (p.arm.upper + flick[i], p.arm.fore + flick[i] * 1.5)
        p.arm2 = (p.arm2.upper - flick[i] * 0.4, p.arm2.fore - flick[i] * 0.3)
        p.blade = tucked(p, cast)
        p.wave = CGFloat(i) / CGFloat(n)
        p.stream = 0.25
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
            // Every foe stands his ground crouched and pitched forward over it, the knees well bent, the weapon ready.
            case .grunt:
                // An ashigaru's yari, levelled low at the hip, the point raised at the ronin's chest.
                p.lean = 0.26
                p.front = (0.42, 0.12)
                p.back = (-0.42, -0.3)
                p.grip = .two
                p.hold = v(0.19, -0.13)
                p.blade = 1.6
            case .runner:
                // Low and wide on the balls of his feet, pitched forward over the front knee and ready to go: the knife
                // reversed along the forearm (sakate) and held up close before his chin, the free hand reaching out low
                // ahead of him.
                plant(&p, hip: v(0.01, 0.41), front: v(0.24, 0), back: v(-0.29, 0))
                p.lean = 0.7
                p.arm = (0.35, 2.55)
                p.arm2 = (1.2, 1.55)
                p.heels = 0.4
            case .brute:
                // The kanabō over the shoulder, hunched under it.
                p.lean = 0.28
                p.front = (0.38, 0.12)
                p.back = (-0.38, -0.25)
                p.grip = .two
                p.hold = v(0.09, -0.08)
                p.blade = -2.4
            case .dancer:
                // One blade held out low at the ronin, the other raised high behind the head, its point over it.
                p.lean = 0.26
                p.front = (0.5, 0.18)
                p.back = (-0.5, -0.4)
                p.arm = (0.95, 1.5)
                p.arm2 = (3.5, 4.3)
                p.blade = 1.95
                p.blade2 = 2.05
            case .archer:
                // The bow held out low before him, an arrow on the string.
                p.lean = 0.2
                p.hold = v(0.19, -0.2)
                p.hold2 = v(0.07, -0.14)
                p.draw = 0.12
                p.blade = 1.1
            case .warlord:
                // Katsugi with the nodachi: the long blade shouldered, laid back over the shoulder behind the
                // helmet, the hands low before the chest (and under the top of the lane).
                p.lean = 0.14
                p.front = (0.45, 0.15)
                p.back = (-0.45, -0.3)
                p.grip = .two
                p.hold = v(0.08, -0.08)
                p.blade = 4.12
            }
        }
        p.back = braced(p.back)
        if case .foe(let kind) = cast {
            // Down into a crouch over the same footing, the head held up out of it.
            let sink: CGFloat
            switch kind {
            case .grunt, .warlord: sink = 0.035
            case .brute: sink = 0.04
            case .dancer, .archer: sink = 0.03
            case .runner: sink = 0
            }
            let feet = footing(p)
            plant(&p, hip: v(p.shift, hipHeight(p) - sink), front: feet.front, back: feet.back)
            p.tilt = min(0, 0.14 - p.lean)
            if kind == .runner { p.blade = tucked(p, cast) }
        }
        return p
    }

    /// A back leg braced straight behind him, the foot where it was, if it is drawn bowed back at the knee (a knee
    /// only ever bends forward).
    static func braced(_ leg: (thigh: CGFloat, shin: CGFloat)) -> (thigh: CGFloat, shin: CGFloat) {
        guard leg.thigh < leg.shin else { return leg }
        let a = asin((thigh * sin(leg.thigh) + shin * sin(leg.shin)) / (thigh + shin))
        return (a, a)
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
                // The blade knocked back over the shoulder, the ronin rocked back on his heels; then down off them,
                // the feet where they were.
                p.lean = k == 0 ? -0.3 : -0.12
                p.shift = -0.04
                p.front = (0.62, 0.05)
                p.back = (-0.2, -0.53)
                if k > 0 {
                    let rocked = footing(p)
                    plant(&p, hip: v(-0.04, 0.52), front: v(rocked.front.x, 0), back: v(rocked.back.x, 0))
                }
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
                    // Struck where he stands, rocked back over his guard's footing.
                    let home = footing(stance(.hero))
                    plant(&p, hip: v(-0.03, 0.515), front: home.front, back: home.back)
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
                case 3:
                    // The hands slip from the hilt and he pitches forward off the knee, the back knee still on the
                    // ground, the front foot sliding out ahead, the hands going down to break the fall; the sword
                    // goes down with them, flat along the ground ahead of him.
                    p.lean = 1.2
                    p.tilt = 0.35
                    p.front = (1.65, 0.75)
                    p.back = (-0.55, -1.5)
                    p.grip = .one
                    p.hold = nil
                    p.arm = (0.35, 0.55)
                    p.arm2 = (0.5, 0.75)
                    p.blade = 1.6
                    p.stream = 0
                    p.wave = 0.5
                default:
                    // Face down in the dirt, laid out flat, the arms flung out ahead of him (over his head, before the
                    // turn) and the sword fallen flat beside them, one heel lifted; lying as the dead do (hips set, and the
                    // ground under them), so that his cloth, his ribbons and his scabbard lie on it with him.
                    p.lean = 0.12
                    p.tilt = 0.5
                    p.front = (-0.1, -0.14)
                    p.back = (-0.16, -0.48)
                    p.grip = .one
                    p.hold = nil
                    p.arm = (2.95, 3.05)
                    p.arm2 = (2.75, 2.9)
                    p.blade = 2.82
                    p.roll = 1.42
                    p.hipAt = v(0, Figure.prone)
                    p.floor = Figure.prone
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
                // Coiled: the weight sunk on the back leg, the front foot lifted light for the step in, the shaft
                // drawn right back.
                p.lean = -0.17
                p.front = (0.62, 0.42)
                p.back = (-0.22, -0.72)
                p.shift = -0.035
                let feet = footing(p)
                plant(&p, hip: v(-0.035, hipHeight(p)), front: v(feet.front.x, 0.035), back: v(feet.back.x, 0))
                p.hold = v(-0.09, -0.1)
                p.blade = 1.62
            case (.grunt, .strike(let k)):
                lunge(&p, k == 0 ? 0.34 : 0.26, deep: k == 0 ? 1.1 : 0.9)
                p.hold = k == 0 ? v(0.12, -0.1) : v(0.08, -0.12)
                p.blade = k == 0 ? 1.57 : 1.52
                if k == 0 { p.smear = sweep(1.57, 1.57, 0.9, thrust: true) }
            // The shinobi: drops into a sprinter's crouch with the knife drawn back, and bursts out of it in one long
            // lunge, the knife whipped out of its tuck and through at the end of his reach, the free arm flung back.
            case (.runner, .windup(1)):
                // Gathering: the back foot stepped back and the hips dropped between the feet, the knife hand drawn
                // back past the hip, the free hand reaching ahead.
                plant(&p, hip: v(-0.02, 0.4), front: v(0.24, 0), back: v(-0.4, 0))
                p.lean = 0.8
                p.tilt = 0.3 - p.lean
                p.arm = (-1.0, -0.45)
                p.arm2 = (0.8, 1.3)
            case (.runner, .windup(2)):
                // Coiled: sunk deeper over the same feet, pitched right over the front knee like a sprinter set to go,
                // the knife hand drawn right back and up behind him.
                plant(&p, hip: v(0.01, 0.35), front: v(0.24, 0), back: v(-0.4, 0))
                p.lean = 1.0
                p.tilt = 0.3 - p.lean
                p.arm = (-1.75, -1.2)
                p.arm2 = (0.55, 1.05)
            case (.runner, .strike(let k)):
                // Stretched out long and low along the lunge, from the back heel to the point of the knife; then the
                // knife carried on up through the follow-through.
                lunge(&p, k == 0 ? 0.62 : 0.5, deep: 1.22)
                p.tilt = 0.32 - p.lean
                p.arm = k == 0 ? (1.3, 1.75) : (1.95, 2.55)
                p.arm2 = k == 0 ? (-1.55, -1.25) : (-1.2, -0.8)
                p.blade = k == 0 ? 0.8 : 1.55
                p.stream = 1
                if k == 0 { p.smear = sweep(2, 0.8, 1) }
            // The oni: the kanabō cocked back behind the head (kept under the top of the lane), then brought down
            // into the ground.
            case (.brute, .windup(1)):
                p.lean = -0.1
                p.hold = v(0.02, 0.16)
                p.blade = -2.05
            case (.brute, .windup(2)):
                // Rising to it, the front foot lifted light (the back one stays down).
                p.lean = -0.2
                let home = footing(p)
                plant(&p, hip: v(0, hipHeight(p) + 0.015), front: v(home.front.x + 0.03, 0.035), back: home.back)
                p.hold = v(-0.02, 0.18)
                p.blade = -1.8
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
                p.front = (0.55, 0.3)
                p.back = (-0.5, -0.6)
                if coil > 0 {
                    // Coiled lower over the same footing.
                    let feet = footing(p)
                    plant(&p, hip: v(0, hipHeight(p) - 0.03), front: v(feet.front.x, 0), back: feet.back)
                }
                p.arm = (2.6 + 0.1 * coil, 2.95)
                p.arm2 = (2.3 + 0.1 * coil, 2.65)
                p.blade = 2.45 - 0.1 * coil
                p.blade2 = 3.75 + 0.1 * coil
            case (.dancer, .strike(let k)):
                lunge(&p, k == 0 ? 0.42 : 0.36)
                p.arm = k == 0 ? (1.1, 1.3) : (0.8, 1.05)
                p.arm2 = k == 0 ? (-0.2, 0.4) : (-0.6, -0.5)
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
                    p.arm2 = (-2.2, -1.8)
                    p.blade = 2.8
                    p.blade2 = 3.48
                } else {
                    // The nodachi carried back over the shoulder through the leap.
                    p.hold = v(0.04, 0.12)
                    p.blade = 4.3
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
                p.back = braced((-0.44, -0.3))
                p.hold = v(0.315, 0.07)
                p.hold2 = v(-0.09, 0.07)
                p.blade = 1.57
                p.draw = 1
            case (.archer, .loose), (.archer, .strike(_)):
                p.lean = 0.0
                p.front = (0.4, 0.1)
                p.back = braced((-0.44, -0.3))
                p.hold = v(0.315, 0.07)
                p.hold2 = v(-0.28, 0.1)
                p.blade = 1.57
            // The warlord: the long blade hauled back over the shoulder and a huge stamping cut; a guard like a wall.
            // Everything he does on his feet stays under the top of the lane.
            case (.warlord, .windup(1)):
                p.lean = -0.04
                p.hold = v(0.03, 0.14)
                p.blade = 4.45
            case (.warlord, .windup(2)):
                // The front foot lifted light for the stamp, the back one where it stood.
                p.lean = -0.2
                p.front = (0.62, 0.38)
                p.back = (-0.36, -0.55)
                let feet = footing(p), home = footing(stance(cast))
                plant(&p, hip: v(0, hipHeight(p)), front: v(feet.front.x, 0.03), back: v(home.back.x, 0))
                p.hold = v(-0.04, 0.17)
                p.blade = 4.65
            case (.warlord, .strike(let k)):
                lunge(&p, k == 0 ? 0.42 : 0.5, deep: 1.1)
                p.hold = k == 0 ? v(0.1, -0.12) : v(0.06, -0.24)
                p.blade = k == 0 ? 0.62 : 0.4
                if k == 0 { p.smear = sweep(4.1, 0.8, 0.9) }
            case (.warlord, .block):
                // The blade angled up across the front of him.
                p.lean = 0.02
                p.front = (0.55, 0.3)
                p.back = (-0.5, -0.55)
                p.hold = v(0.14, -0.2)
                p.blade = 2.5
            case (.warlord, .stagger(0)):
                // The blade flung back over his shoulder: back, not up, so that finding his feet (half way from
                // this to his guard) never brings it upright.
                p.hold = v(0.11, -0.02)
                p.blade = 4.5
            case (_, .stagger(0)):
                if kind == .archer {
                    // The arrow gone from the string, the string hand flung out.
                    p.hold2 = nil
                    p.draw = 0
                    p.arm2 = (-0.6, -0.2)
                }
                if let hold = p.hold {
                    p.hold = v(hold.x - 0.02, hold.y + 0.06)
                } else {
                    p.arm = (0.3, 0.7)
                }
                p.blade += 0.6
            default:
                break
            }
            if kind == .runner, frame != .strike(0), frame != .strike(1) { p.blade = tucked(p, cast) }
            if frame == .stagger(0) {
                // Rocked back where he stands, on his own stance's footing (so a blow taken in his stance, or the
                // freeze of a killing one, leaves his feet where they were), the hips thrown back over the back foot.
                let feet = footing(stance(cast)), hip = v(p.shift, 0)
                let reach = thigh + shin - 0.012
                func highest(_ f: CGPoint) -> CGFloat { f.y + (reach * reach - (f.x - hip.x) * (f.x - hip.x)).squareRoot() }
                plant(&p, hip: v(hip.x, min(hipHeight(p), highest(feet.front), highest(feet.back))), front: v(feet.front.x, 0), back: feet.back)
                // Knocked back onto his heels.
                p.heels = 0
            }
        }
        return p
    }

    /// How high the ronin's hips lie off the ground when he lies face down (`fall`'s last frame), in his heights.
    static let prone: CGFloat = 0.11

    /// A foe cut down whole: thrown back off his feet, his arms flung wide and the weapon leaving his hand. A body
    /// felled whole starts from this (or from `struck`) and falls as a `Ragdoll`.
    public static func thrown(_ cast: Cast) -> Pose {
        var p = stance(cast)
        recoil(&p)
        p.grip = .one
        p.hold = nil
        p.hold2 = nil
        p.draw = 0
        p.armed = false
        p.heels = 0
        p.lean = -0.46
        p.tilt = -0.6
        p.front = (0.55, 0.05)
        // (The back hip swung back as far as it goes, no further.)
        p.back = (-0.22, -0.52)
        p.arm = (2.3, 2.7)
        p.arm2 = (-1.9, -1.4)
        p.blade2 += 1.4
        // A long weapon goes along the body rather than off the edge of the picture.
        let weapon = Build.of(cast).weapon
        p.blade = weapon == .spear || weapon == .nodachi ? 1.9 : 2.9
        p.stream = 0.9
        return p
    }

    /// How many of the `struck` poses (variants 0 up to this) a foe's severed head is drawn ahead of time for.
    public static let struckVariants = 4

    /// The pose a blow throws a foe into, a little different each time: variant 0 is the stagger itself, the others
    /// (any positive number) thrown back harder or twisted, arms flung their own ways, and no two kinds of foe thrown
    /// the same way by the same number. Cutting him apart starts from one of these. Every joint is bent the way it
    /// bends and no further than it goes, as a `Ragdoll` holds it, so a body falling from it takes it up smoothly.
    public static func struck(_ cast: Cast, variant: Int) -> Pose {
        var p = pose(cast, .stagger(0))
        p.armed = false
        guard variant > 0 else { return p }
        let kin: UInt64
        switch cast {
        case .hero: kin = 0
        case .foe(let kind): kin = UInt64((Kind.allCases.firstIndex(of: kind) ?? 0) + 1)
        }
        var rng = SeededRNG(seed: mixSeed(UInt64(variant), kin, 0x5EED))
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
        // An elbow flexes forward, never back; a knee back, never forward; a hip swings back only so far (the shin
        // carried with the thigh). Each variant keeps its own bend, flexed the right way.
        func arm(_ a: (upper: CGFloat, fore: CGFloat)) -> (upper: CGFloat, fore: CGFloat) {
            (a.upper, a.upper + min(2.4, abs(a.fore - a.upper)))
        }
        func leg(_ l: (thigh: CGFloat, shin: CGFloat), lean: CGFloat) -> (thigh: CGFloat, shin: CGFloat) {
            let forward = max(0, -0.66 - (l.thigh + lean))
            let thigh = l.thigh + forward
            return (thigh, thigh + min(Ragdoll.kneeLimit, l.shin + forward - thigh))
        }
        p.arm = arm(p.arm)
        p.arm2 = arm(p.arm2)
        p.front = leg(p.front, lean: p.lean)
        p.back = leg(p.back, lean: p.lean)
        return p
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
        start.back = braced(start.back)
        return CutKeys(start: start, end: end, from: start.blade, to: end.blade)
    }

    /// A cut's nine frames. The hands lead and the blade lags behind them, then whips through as the wrists
    /// uncock, so the point travels fastest at the end; after the blow, the follow-through and zanshin. `held`: a
    /// cut swung again from the lunge of the one before, the feet (and the hips over them) kept where the lunge put
    /// them through the chamber and the swing, so only the body, the arms and the blade come round again.
    static func swing(_ cut: Cut, _ phase: Int, held: Bool = false) -> Pose {
        if cut == .nukitsuke { return draw(phase) }
        let keys = cutKeys(cut)
        let arc = keys.to - keys.from
        let flat = keys.start.flat
        let thrust = cut == .tsuki
        func legs(_ q: Pose) -> Pose {
            var q = q
            q.shift = keys.end.shift
            q.lift = keys.end.lift
            q.front = keys.end.front
            q.back = keys.end.back
            q.airborne = keys.end.airborne
            return q
        }
        func moment(_ t: CGFloat, whip: CGFloat) -> Pose {
            var p = Pose.mix(keys.start, keys.end, t)
            if held { p = legs(p) }
            p.blade = keys.from + arc * whip
            return p
        }
        // Through the swing: how far the hands have come, how far the blade, where along the arc its bright trail
        // starts, and how bright it is: faint as the swing gets going, brightest where the blade whips through.
        let swing: [(t: CGFloat, whip: CGFloat, tail: CGFloat, strength: CGFloat)] = [
            (0.18, 0.07, 0, 0.3), (0.42, 0.24, 0, 0.6), (0.66, 0.5, 0.05, 0.85), (0.86, 0.8, 0.2, 1), (1, 1, 0.45, 0.8),
        ]
        switch phase {
        case 0:
            // Chambered, the weight gathering over the back foot (or, swung again, the blade brought back up over
            // the planted lunge).
            var p = held ? legs(keys.start) : keys.start
            p.lean -= 0.03
            p.stream = 0.35
            p.wave = 0.1
            return p
        case 1...5:
            let s = swing[phase - 1]
            var p = moment(s.t, whip: s.whip)
            p.stream = 0.5 + 0.5 * s.t
            p.wave = 0.1 + 0.35 * s.t
            // Every frame of the swing is a smear frame: the path since the frame before (the arms, the blade), and
            // the bright edge of the trail back along the arc; the body blurred after it as far as the lunge carried
            // it in the frame (not when he is already planted in one).
            let before = phase == 1 ? (t: CGFloat(0), whip: CGFloat(0)) : (t: swing[phase - 2].t, whip: swing[phase - 2].whip)
            p.ghosts = (0..<Pose.smearSteps).map { i in
                let f = CGFloat(i) / CGFloat(Pose.smearSteps)
                return moment(before.t + (s.t - before.t) * f, whip: before.whip + (s.whip - before.whip) * f)
            }
            p.smear = Pose.Smear(from: keys.from + arc * s.tail, to: p.blade, strength: s.strength, flat: flat, thrust: thrust)
            p.drag = held ? 0 : (s.t - before.t) * 0.16
            return p
        case 6, 7:
            // The follow-through: the blade carries past its mark and the body settles lower after it (the last of the
            // smear on the first of them).
            var p = keys.end
            if !thrust { p.blade += (arc > 0 ? 1 : -1) * (phase == 6 ? 0.3 : 0.2) }
            p.lean += phase == 6 ? 0.05 : 0.035
            p.stream = phase == 6 ? 0.9 : 0.75
            p.wave = phase == 6 ? 0.55 : 0.65
            if phase == 6 {
                p.smear = Pose.Smear(from: keys.to - arc * 0.2, to: p.blade, strength: 0.3, flat: flat, thrust: thrust)
                p.ghosts = Pose.between(moment(1, whip: 1), p)
            }
            return p
        default:
            // Zanshin: held, the point coming back up onto the line, eyes on the foe; the feet where the lunge put
            // them.
            var p = legs(Pose.mix(keys.end, stance(.hero), 0.2))
            p.blade = keys.end.blade + (stance(.hero).blade - keys.end.blade) * 0.15
            p.stream = 0.55
            p.wave = 0.78
            return p
        }
    }

    /// Back into guard from zanshin, a foot at a time: the blade coming back onto the line as the feet come under
    /// him.
    static func recover(_ cut: Cut, _ k: Int) -> Pose {
        let end = swing(cut, Frame.cutFrames - 1)
        let guardPose = stance(.hero)
        var p = Pose.mix(end, guardPose, k == 4 ? 0.25 : k % 2 == 0 ? 0.5 : 0.82)
        let home = footing(guardPose), from = footing(end)
        switch k {
        case 0:
            // Pushing off the front foot, the weight going back onto the back one, the front foot drawn back clear
            // of the ground.
            plant(&p, hip: v(-0.02, 0.5), front: v(0.14, 0.08), back: v(-0.27, 0))
            p.lean -= 0.04
        case 1:
            // The front foot set down in its place, the back foot drawn after it.
            plant(&p, hip: v(0.01, 0.515), front: v(home.front.x, 0), back: v(home.back.x + 0.05, 0.04))
        case 2:
            // From a short lunge: the back foot drawn up to its place in guard first (hikitsuke), allowing for the
            // reach of a short lunge (about 0.05) and the front foot set back a touch; the hips between the feet,
            // the front knee still bent.
            let front = v(from.front.x - 0.02, 0), back = v(home.back.x - 0.07, 0.06)
            plant(&p, hip: v((front.x + back.x) / 2 + 0.03, 0.45), front: front, back: back)
        case 3:
            // Then the front foot lifted back into guard.
            plant(&p, hip: v(-0.01, 0.51), front: v(home.front.x + 0.04, 0.075), back: v(home.back.x, 0))
            p.lean -= 0.03
        case 4:
            // The push-off before the long way back: both feet where the lunge put them (the back one set down),
            // the weight sinking back off the front knee as far as the front foot still reaches.
            let y = hipHeight(end) - 0.03, reach = thigh + shin - 0.012
            let x = min(end.shift, from.front.x - (reach * reach - y * y).squareRoot())
            plant(&p, hip: v(x, y), front: v(from.front.x, 0), back: v(from.back.x, 0))
            p.lean -= 0.06
        default:
            // From a middling lunge, in place of (0): the back foot has less far to come, so the front foot is lifted
            // back not as far, to over its place in guard for a lunge of about 0.14 (kept on the back foot: the back
            // foot at -0.27, as in (0)).
            let x = home.front.x - (0.14 + from.back.x + 0.27)
            plant(&p, hip: v((x - 0.27) / 2 + 0.03, 0.485), front: v(x, 0.08), back: v(-0.27, 0))
            p.lean -= 0.04
        }
        let step = min(max(k, 0), 5)
        p.stream = [0.45, 0.3, 0.5, 0.35, 0.5, 0.45][step]
        p.wave = [0.82, 0.88, 0.82, 0.88, 0.8, 0.82][step]
        return p
    }

    /// A step in guard: back, the front foot lifted and the back one following; or forward, the back foot drawn up
    /// and the front one stepping out. Every foot's target is within the leg's reach.
    static func shuffle(_ k: Int) -> Pose {
        var p = stance(.hero)
        let home = footing(p)
        switch k {
        case 0:
            // Back: the front foot lifted back over the planted back one.
            plant(&p, hip: v(-0.03, 0.51), front: v(home.front.x - 0.03, 0.07), back: v(home.back.x + 0.02, 0))
            p.lean -= 0.04
        case 1:
            // Forward, out of a wide stance: the back foot drawn up under him first (hikitsuke), the front one where
            // it stands.
            plant(&p, hip: v(0.0, 0.5), front: v(home.front.x, 0), back: v(home.back.x + 0.06, 0.07))
            p.lean += 0.05
        case 2:
            // Back: the front foot set down in its place, the back one carried after it.
            plant(&p, hip: v(0.02, 0.515), front: v(home.front.x, 0), back: v(home.back.x + 0.04, 0.06))
            p.lean += 0.02
        default:
            // Forward: the front foot stepped out into guard over the planted back one.
            plant(&p, hip: v(0.0, 0.51), front: v(home.front.x, 0.07), back: v(home.back.x, 0))
            p.lean += 0.03
        }
        p.stream = 0.3
        p.wave = 0.3 + 0.2 * CGFloat(k)
        return p
    }

    /// Hurt and short of breath, the guard on the same footing as ever but the body failing over it.
    static func winded(_ cycle: Int, _ k: Int) -> Pose {
        var p = stance(.hero)
        let home = footing(p)
        let t = CGFloat(k) / CGFloat(Frame.windedFrames) * 2 * .pi
        // The breath: in (s rising to 1) and out.
        let s = sin(t)
        p.wave = CGFloat(k) / CGFloat(Frame.windedFrames)
        p.stream = 0.1
        switch cycle {
        case 0:
            // Heaving: the chest lifting on the breath in and sagging as it goes out, the head dropping with it,
            // the point of the guard sinking and lifting.
            p.lean = 0.25 - 0.08 * s
            p.tilt = 0.18 - 0.18 * s
            plant(&p, hip: v(0.01, 0.49 + 0.012 * s), front: v(home.front.x, 0), back: v(home.back.x, 0))
            p.hold = v(0.16 + 0.01 * s, -0.25 + 0.03 * s)
            p.blade = 1.7 + 0.12 * s
        case 1:
            // A hand pressed to the wound in his side, the blood coming through the fingers, hunched over it; the
            // blade held low in the other, its point toward the ground ahead.
            p.grip = .one
            p.lean = 0.32 - 0.05 * s
            p.tilt = 0.28 - 0.1 * s
            plant(&p, hip: v(0.0, 0.47 + 0.01 * s), front: v(home.front.x, 0), back: v(home.back.x, 0))
            p.hold = v(0.18, -0.3 + 0.012 * s)
            p.blade = 0.95 + 0.07 * s
            p.hold2 = v(0.09, -0.19 + 0.008 * s)
            p.clutch = true
        default:
            // The knees giving: sagging, dropping, the point dipping to the ground to catch him, and pushed back up.
            let depth: [CGFloat] = [0, 0.02, 0.06, 0.13, 0.15, 0.1, 0.05, 0.015]
            let d = depth[k % depth.count]
            p.lean = 0.24 + d * 1.6
            p.tilt = 0.12 + d * 1.8
            plant(&p, hip: v(0.01 - d * 0.1, 0.49 - d), front: v(home.front.x, 0), back: v(home.back.x, 0))
            p.hold = v(0.16 + d * 0.3, -0.25 - d * 0.35)
            p.blade = 1.7 - d * 6.5
        }
        return p
    }

    /// Reeling from a blow.
    static func reel(_ way: Int, _ k: Int) -> Pose {
        var p = stance(.hero)
        let home = footing(p)
        switch (way, k) {
        case (0, 0):
            // Struck: thrown back onto the back foot, the front one coming off the ground.
            recoil(&p)
            plant(&p, hip: v(-0.06, 0.5), front: v(home.front.x - 0.04, 0.04), back: v(home.back.x, 0))
            p.hold = v(0.1, -0.1)
            p.blade = 1.55
            p.drag = -0.04
        case (0, 1):
            // The back foot thrown out behind to catch him, the blade flung up.
            p.lean = -0.44
            p.tilt = -0.4
            plant(&p, hip: v(-0.13, 0.49), front: v(home.front.x - 0.06, 0), back: v(-0.48, 0.05))
            p.hold = v(0.05, -0.03)
            p.blade = 2.55
            p.stream = 0.7
        case (0, 2):
            // Onto it, the front foot dragged back after him.
            p.lean = -0.2
            p.tilt = -0.2
            plant(&p, hip: v(-0.2, 0.47), front: v(0.0, 0.035), back: v(-0.46, 0))
            p.hold = v(0.12, -0.12)
            p.blade = 2.15
            p.stream = 0.5
        case (0, _):
            // Braced low, the guard back on the line.
            p.lean = 0.16
            p.tilt = 0.06
            plant(&p, hip: v(-0.1, 0.46), front: v(0.12, 0), back: v(-0.4, 0))
            p.hold = v(0.18, -0.2)
            p.blade = 1.95
            p.stream = 0.3
        case (_, 0):
            // Struck, rocked, the knees already going.
            recoil(&p)
            p.lean = -0.22
            plant(&p, hip: v(-0.04, 0.48), front: v(home.front.x - 0.02, 0), back: v(home.back.x, 0.03))
            p.hold = v(0.1, -0.12)
            p.blade = 1.5
            p.drag = -0.03
        case (_, 1):
            // Folding at the knees, the head going down.
            p.lean = 0.3
            p.tilt = 0.3
            plant(&p, hip: v(-0.02, 0.36), front: v(home.front.x, 0), back: v(-0.3, 0.1))
            p.hold = v(0.17, -0.25)
            p.blade = 1.0
            p.stream = 0.4
        case (_, 2):
            // Down on the back knee, leaning on the hilt, the point in the dirt before him.
            p.lean = 0.42
            p.tilt = 0.42
            p.shift = -0.03
            p.lift = 0
            p.front = leg(to: v(home.front.x + 0.03 + 0.03, -0.27))
            p.back = (-0.2, -1.62)
            p.hold = v(0.22, -0.2)
            p.blade = 0.34
            p.stream = 0.1
        default:
            // Pushing back up off the front foot.
            p.lean = 0.3
            p.tilt = 0.1
            plant(&p, hip: v(-0.02, 0.4), front: v(home.front.x + 0.03, 0), back: v(-0.34, 0.05))
            p.hold = v(0.18, -0.2)
            p.blade = 1.4
            p.stream = 0.3
        }
        return p
    }

    /// Nukitsuke, from the iai stance: the hilt pushed forward as the scabbard is pulled back; the blade clearing
    /// the mouth; one hand whipping it up and out at the foe's chest, the other still drawing the scabbard back;
    /// the follow-through and zanshin. (The second hand joins the hilt on the way back to guard.)
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
            lunge(&p, 0.4, deep: 1.12)
            p.sheathed = 0
            p.saya = phase == 6 ? 0.85 : 0.7
            p.hold = phase == 6 ? v(0.3, 0.09) : v(0.3, 0.07)
            p.blade = phase == 6 ? 2.12 : 2.02
            if phase == 6 { p.smear = sweep(1.55, 2.12, 0.3) }
            p.stream = phase == 6 ? 0.9 : 0.75
        default:
            lunge(&p, 0.34, deep: 1.12)
            p.sheathed = 0
            p.saya = 0.5
            p.hold = v(0.29, 0.05)
            p.blade = 1.9
            p.stream = 0.6
            p.wave = 0.7
        }
        // Out of the scabbard and through the cut, the lunge carrying him: smear frames, the blade whipping up
        // through the middle of it fastest.
        if (1...6).contains(phase) {
            p.ghosts = Pose.between(draw(phase - 1), p)
            p.drag = phase == 4 || phase == 5 ? 0.035 : 0.02
        }
        return p
    }

    /// The end of a stage: ō-chiburi, the blade swung up beside the head and snapped down to throw the blood off, the
    /// body sinking into the snap; then nōtō, the back of the blade laid in the scabbard's mouth and slid home as he
    /// rises, the hand resting on the hilt. His feet stay where they stood in guard throughout.
    static func flourish(_ k: Int) -> Pose {
        var p = stance(.hero)
        let home = footing(p), standing = hipHeight(p)
        // How far the hips are below his height in guard: level as the blade goes up, dropping into the snap, and
        // rising again as the blade goes home.
        let sink: [CGFloat] = [0.004, 0, 0.026, 0.045, 0.024, 0.012, 0.004]
        let hip = v(k == 2 || k == 3 ? 0.01 : 0, standing - sink[min(max(k, 0), sink.count - 1)])
        plant(&p, hip: hip, front: home.front, back: home.back)
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
            p.hold = v(0.2, 0.08)
            p.blade = 2.3
            p.smear = Pose.Smear(from: 3.75, to: 2.3, strength: 0.8)
            p.stream = 0.8
            p.wave = 0.2
        case 3:
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
        // The snap of the chiburi, smeared on its way down and into the stop at the bottom as the blood flies.
        if k == 2 || k == 3 { p.ghosts = Pose.between(flourish(k - 1), p) }
        return p
    }

    // MARK: Blades crossed

    /// A clash with the warlord. The ronin: the bind, his cut struck home on the raised blade in a lunge, the arms
    /// thrust up and out and the blade crossed on the other's (0); then forced off it, the blade driven back up and
    /// away and the body thrown back over the planted back foot, the front foot dragged back off the ground (1). The
    /// warlord, from his guard and on its footing: the blow taken on the blade, braced, the hips driven forward over
    /// the bent front knee (0); then shoving the ronin's blade off, the arms thrust out (1).
    static func clash(_ cast: Cast, _ k: Int) -> Pose {
        guard cast == .hero else {
            var p = key(cast, .block)
            let feet = footing(p), standing = hipHeight(p)
            if k <= 0 {
                plant(&p, hip: v(0.035, standing - 0.02), front: feet.front, back: feet.back)
                p.lean = 0.12
                p.tilt = -0.08
                p.hold = v(0.14, -0.22)
                p.blade = 2.58
                p.stream = 0.6
                p.wave = 0.3
            } else {
                plant(&p, hip: v(0.045, standing - 0.04), front: feet.front, back: feet.back)
                p.lean = 0.22
                p.tilt = -0.14
                p.hold = v(0.22, -0.17)
                p.blade = 2.48
                p.stream = 0.8
                p.wave = 0.45
            }
            return p
        }
        // The bind: braced in a lunge, both feet down.
        var p = stance(.hero)
        plant(&p, hip: v(0, 0.43), front: v(0.32, 0), back: v(-0.35, 0))
        p.lean = 0.3
        p.tilt = -0.1
        p.hold = v(0.2, 0.15)
        p.blade = 2.25
        p.stream = 0.9
        p.wave = 0.5
        guard k > 0 else {
            // The last of the cut's trail behind the blade, stopped dead on the other.
            p.smear = sweep(3.3, 2.25, 0.35)
            return p
        }
        // Forced off, the back foot where it was: the blade still on the warlord's as it goes, where he shoves it off.
        let bind = p, feet = footing(p)
        plant(&p, hip: v(-0.1, 0.45), front: v(feet.front.x - 0.14, 0.05), back: feet.back)
        p.lean = -0.18
        p.tilt = -0.2
        p.hold = v(0.12, 0.17)
        let build = Build.of(.hero), H = pixelHeight(.hero) * build.height
        let hand = Drawer(pose: p, build: build, H: H).main.hand
        let theirs = contact(.foe(.warlord), .clash(1)) ?? .zero, tall = Build.of(.foe(.warlord)).height
        let parting = v(clashGap() - theirs.x * tall - (hand.x / H - Figure.feet.x), theirs.y * tall - (hand.y / H - Figure.feet.y))
        p.blade = atan2(parting.x, -parting.y)
        p.stream = 0.7
        p.wave = 0.65
        // Thrown back, the blade flung up off the other: smeared, the body blurred back with it.
        p.ghosts = Pose.between(bind, p)
        p.smear = sweep(bind.blade, p.blade, 0.5)
        p.drag = -0.03
        return p
    }

    /// Backing off in guard, the guard up (the hands higher, the point at the face): the back foot lifted back over
    /// the planted front one (0) and set down a step behind (1); the front foot drawn back after it over the planted
    /// back one (2) and set down, the feet as they are in guard (3).
    static func retreat(_ k: Int) -> Pose {
        var p = stance(.hero)
        let home = footing(p), standing = hipHeight(p)
        let step = Figure.retreatStep
        switch k {
        case 0:
            plant(&p, hip: v(-0.02, 0.51), front: home.front, back: v(home.back.x - step * 0.45, 0.06))
            p.lean = 0.04
        case 1:
            plant(&p, hip: v(-0.08, 0.48), front: home.front, back: v(home.back.x - step, 0))
            p.lean = 0.0
        case 2:
            plant(&p, hip: v(-0.1, 0.485), front: v(home.front.x - step * 0.5, 0.06), back: v(home.back.x - step, 0))
            p.lean = 0.04
        default:
            plant(&p, hip: v(0, standing - 0.008), front: home.front, back: home.back)
            p.lean = 0.07
        }
        let bob = CGFloat([0.01, -0.005, 0.01, 0][min(max(k, 0), 3)])
        p.hold = v(0.2, -0.12 + bob)
        p.blade = 2.3 - bob * 3
        p.stream = [0.35, 0.3, 0.35, 0.25][min(max(k, 0), 3)]
        p.wave = 0.2 + 0.2 * CGFloat(k)
        return p
    }

    /// How far each step of `retreat` takes him back, in his heights.
    public static let retreatStep: CGFloat = 0.14

    /// Where a figure's blade meets another's as they clash (the ronin's and the warlord's `clash` frames, and the
    /// warlord's `block`), on the figure's canvas as `tip` gives the point of its weapon: from its feet, in its own
    /// heights (x toward the way it faces, y up); nil for any other frame. The warlord's is a set way along his blade;
    /// the ronin's is where his blade crosses the height of the warlord's in the same clash frame (the pair stand
    /// `clashGap` apart for the two to meet).
    public static func contact(_ cast: Cast, _ frame: Frame) -> CGPoint? {
        switch (cast, frame) {
        case (.foe(.warlord), .clash(let k)): return along(cast, frame, k <= 0 ? 0.34 : 0.62)
        case (.foe(.warlord), .block): return along(cast, frame, 0.42)
        case (.hero, .clash(let k)):
            guard let theirs = contact(.foe(.warlord), .clash(k)) else { return nil }
            let height = theirs.y * Build.of(.foe(.warlord)).height
            let hand = along(.hero, frame, 0), tip = along(.hero, frame, 1)
            guard tip.y > hand.y + 0.001 else { return tip }
            let t = max(0.15, min(1, (height - hand.y) / (tip.y - hand.y)))
            return CGPoint(x: hand.x + (tip.x - hand.x) * t, y: hand.y + (tip.y - hand.y) * t)
        default:
            return nil
        }
    }

    /// How far apart the ronin and the warlord stand, feet to feet and facing each other, in the ronin's heights,
    /// for their blades to meet where `contact` has them: in the bind (`clash(0)` of each) by default.
    public static func clashGap(hero: Frame = .clash(0), warlord: Frame = .clash(0)) -> CGFloat {
        guard let mine = contact(.hero, hero), let theirs = contact(.foe(.warlord), warlord) else { return 0 }
        return mine.x + theirs.x * Build.of(.foe(.warlord)).height
    }

    /// A point `share` of the way along a figure's blade from the hand, from its feet in its own heights.
    private static func along(_ cast: Cast, _ frame: Frame, _ share: CGFloat) -> CGPoint {
        let build = Build.of(cast)
        let H = pixelHeight(cast) * build.height
        let p = pose(cast, frame)
        let hand = Drawer(pose: p, build: build, H: H).main.hand
        let (d, scale) = bladeVector(p.blade, flat: p.flat)
        let point = at(hand, d, build.reach * H * scale * share)
        return CGPoint(x: point.x / H - feet.x, y: point.y / H - feet.y)
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

/// A line (a weapon's, from the hand to the point) through a smear frame's motion, sampled at evenly spaced moments,
/// oldest first, and read back at any `age` (0 the pose drawn, 1 the start of the motion): between the moments the
/// hand goes straight on and the line turns, so the point follows an arc rather than a chain of straight cuts.
private struct Track {
    var hands: [CGPoint]
    var angles: [CGFloat]
    var lengths: [CGFloat]

    init(_ lines: [(hand: CGPoint, tip: CGPoint)]) {
        hands = lines.map(\.hand)
        var angles: [CGFloat] = []
        for l in lines {
            var a = atan2(l.tip.y - l.hand.y, l.tip.x - l.hand.x)
            if let b = angles.last {
                while a - b > .pi { a -= 2 * .pi }
                while a - b < -.pi { a += 2 * .pi }
            }
            angles.append(a)
        }
        self.angles = angles
        lengths = lines.map { hypot($0.tip.x - $0.hand.x, $0.tip.y - $0.hand.y) }
    }

    private func sample(_ age: CGFloat) -> (i: Int, f: CGFloat) {
        guard hands.count > 1 else { return (0, 0) }
        let s = max(0, min(1, 1 - age)) * CGFloat(hands.count - 1)
        let i = min(hands.count - 2, Int(s))
        return (i, s - CGFloat(i))
    }

    func hand(_ age: CGFloat) -> CGPoint {
        guard hands.count > 1 else { return hands.first ?? .zero }
        let (i, f) = sample(age)
        return CGPoint(x: hands[i].x + (hands[i + 1].x - hands[i].x) * f, y: hands[i].y + (hands[i + 1].y - hands[i].y) * f)
    }

    func length(_ age: CGFloat) -> CGFloat {
        guard lengths.count > 1 else { return lengths.first ?? 0 }
        let (i, f) = sample(age)
        return lengths[i] + (lengths[i + 1] - lengths[i]) * f
    }

    /// Whether the line, from `share` of the way out to its point, anywhere sweeps back over where it has just been:
    /// part of it going one way while the rest goes the other, as a blade whips round against the hand driving it.
    func folds(from share: CGFloat) -> Bool {
        var sense: CGFloat = 0
        for i in 0..<16 {
            let age = CGFloat(i) / 16, later = CGFloat(i + 1) / 16
            for r in [share, (share + 1) / 2, 1] {
                let p = point(age, r), q = point(later, r), out = point(age, min(1, r + 0.05)), inn = point(age, max(0, r - 0.05))
                let d = CGPoint(x: q.x - p.x, y: q.y - p.y), e = CGPoint(x: out.x - inn.x, y: out.y - inn.y)
                let turn = d.x * e.y - d.y * e.x
                guard abs(turn) > 0.05 * hypot(d.x, d.y) * hypot(e.x, e.y) + 1e-9 else { continue }
                if sense == 0 { sense = turn } else if sense * turn < 0 { return true }
            }
        }
        return false
    }

    /// The point `share` of the way along the line from the hand, at `age`.
    func point(_ age: CGFloat, _ share: CGFloat) -> CGPoint {
        let h = hand(age)
        var a = angles.first ?? 0
        if angles.count > 1 {
            let (i, f) = sample(age)
            a = angles[i] + (angles[i + 1] - angles[i]) * f
        }
        let l = length(age) * share
        return CGPoint(x: h.x + cos(a) * l, y: h.y + sin(a) * l)
    }
}

/// Draws one pose of one figure into a pen.
private struct Drawer {
    let pose: Pose
    let build: Build
    let H: CGFloat
    var pen: Pen
    // The skeleton.
    let hip: CGPoint, neck: CGPoint, shoulder: CGPoint
    /// Where each arm hangs from: the near (sword) arm and the far one, the shoulders turned by the pose's twist.
    let nearShoulder: CGPoint, farShoulder: CGPoint
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
        if let at = pose.hipAt {
            hip = CGPoint(x: (Figure.feet.x + at.x) * H, y: (Figure.feet.y + at.y) * H)
        } else {
            hip = CGPoint(x: Figure.feet.x * H + pose.shift * H, y: hipY)
        }
        up = CGPoint(x: sin(pose.lean), y: cos(pose.lean))
        across = CGPoint(x: cos(pose.lean), y: -sin(pose.lean))
        neck = at(hip, up, torso * H)
        shoulder = at(neck, up, -0.045 * H)
        nearShoulder = at(shoulder, across, pose.twist * H)
        farShoulder = at(shoulder, across, -pose.twist * H)
        headUp = CGPoint(x: sin(pose.lean + pose.tilt), y: cos(pose.lean + pose.tilt))
        face = CGPoint(x: cos(pose.lean + pose.tilt), y: -sin(pose.lean + pose.tilt))

        // The sword hand: on the hilt as it rides the scabbard, at its hold, or where the arm's angles put it.
        let a = upperArm * H, b = forearm * H
        let near = nearShoulder, far = farShoulder
        if let grip = sheathGrip {
            main = twoBone(near, grip, a, b)
        } else if let hold = pose.hold {
            main = twoBone(near, CGPoint(x: near.x + hold.x * H, y: near.y + hold.y * H), a, b)
        } else {
            main = forward(pose.arm, from: near)
        }
        // The other hand: on the hilt behind the first, at the scabbard's mouth, at its hold, or free.
        if pose.grip == .two, let span = build.span, pose.sheathed == 0 {
            let d = bladeVector(pose.blade, flat: pose.flat).d
            other = twoBone(far, at(main.hand, d, -span * H), a, b)
        } else if pose.grip == .saya, build.scabbard {
            other = twoBone(far, at(scabbardMouth, dir(scabbardAngle), 0.012 * H), a, b)
        } else if let hold = pose.hold2 {
            other = twoBone(far, CGPoint(x: far.x + hold.x * H, y: far.y + hold.y * H), a, b)
        } else {
            other = forward(pose.arm2, from: far)
        }
    }

    /// An arm set by its angles.
    func forward(_ angles: (upper: CGFloat, fore: CGFloat), from root: CGPoint) -> (elbow: CGPoint, hand: CGPoint) {
        let elbow = at(root, dir(angles.upper), upperArm * H)
        return (elbow, at(elbow, dir(angles.fore), forearm * H))
    }

    /// A point on the torso: `along` its length from the hip, `out` toward the chest (negative: the back).
    func torsoPoint(_ along: CGFloat, _ out: CGFloat) -> CGPoint { at(at(hip, up, along * torso * H), across, out) }

    /// The scabbard's mouth, and the way it points (back and down from the front of the sash). For the draw it is
    /// pulled back along its line and turned flatter; on a body lying down, it lies along his legs.
    var scabbardMouth: CGPoint { at(torsoPoint(0.12, build.waist * H * 0.55), dir(scabbardAngle), 0.1 * H * pose.saya) }
    var scabbardAngle: CGFloat { -0.95 - 0.3 * pose.saya + 0.75 * fallen }

    /// While the blade goes in or out, the sword hand rides the hilt along the scabbard's line: as far out from the
    /// mouth as the blade shows.
    var sheathGrip: CGPoint? {
        guard build.scabbard, pose.sheathed > 0 else { return nil }
        return at(scabbardMouth, dir(scabbardAngle), -(0.6 * H * (1 - pose.sheathed) + 0.035 * H))
    }

    mutating func fill(_ points: [CGPoint], _ paint: Paint) { pen.fill(points, paint) }

    /// A straight band `width` wide from `a` to `b`, as a polygon.
    func band(_ a: CGPoint, _ b: CGPoint, _ width: CGFloat) -> [CGPoint] {
        let d = unit(a, b), n = CGPoint(x: -d.y * width / 2, y: d.x * width / 2)
        return [CGPoint(x: a.x + n.x, y: a.y + n.y), CGPoint(x: b.x + n.x, y: b.y + n.y), CGPoint(x: b.x - n.x, y: b.y - n.y),
                CGPoint(x: a.x - n.x, y: a.y - n.y)]
    }

    /// An ellipse about `c` turned to lie along `n` (its half-width `rx`) and `d` (its half-height `ry`), as a polygon.
    func oval(_ c: CGPoint, _ n: CGPoint, _ d: CGPoint, _ rx: CGFloat, _ ry: CGFloat) -> [CGPoint] {
        (0..<16).map { i in
            let t = CGFloat(i) / 16 * 2 * .pi
            return CGPoint(x: c.x + n.x * rx * cos(t) + d.x * ry * sin(t), y: c.y + n.y * rx * cos(t) + d.y * ry * sin(t))
        }
    }

    // MARK: Gravity, for a body thrown about

    /// Which way the world's down is in the figure's own frame (the drawing is turned by the roll afterwards).
    var gravity: CGPoint { dir(pose.roll) }
    /// How far a body thrown about (one with a `floor`) has gone over: 0 upright, 1 down (always 0 for a figure on
    /// its feet).
    var fallen: CGFloat { pose.floor == nil ? 0 : min(1, abs(pose.roll) / 1.2) }

    /// A point of cloth or gear on a body thrown about (one with a `floor`), let down no further than the ground:
    /// whatever would pass through it lies on it instead. A figure on its feet's are left where they are.
    func grounded(_ p: CGPoint) -> CGPoint {
        guard let floor = pose.floor else { return p }
        let g = gravity
        let below = (p.x - hip.x) * g.x + (p.y - hip.y) * g.y - floor * H
        return below > 0 ? CGPoint(x: p.x - g.x * below, y: p.y - g.y * below) : p
    }

    /// A limb segment cut like muscle: widest a little past its root, bulging more on one side, tapering to a sharp
    /// joint. The ends run a touch past the joints so the next segment overlaps cleanly. Given a `floor` (a figure on
    /// its feet), nothing of it goes below that: a knee brought down onto the ground rests on it. `lies`: gear, which
    /// on a body thrown about lies on the ground rather than through it.
    mutating func segment(_ a: CGPoint, _ b: CGPoint, _ w0: CGFloat, _ w1: CGFloat, _ w2: CGFloat, _ paint: Paint,
                          bulge: CGFloat = 0.2, at t: CGFloat = 0.38, floor: CGFloat? = nil, lies: Bool = false) {
        let dx = b.x - a.x, dy = b.y - a.y
        let length = max(0.001, hypot(dx, dy))
        let d = CGPoint(x: dx / length, y: dy / length), n = CGPoint(x: -d.y, y: d.x)
        let a0 = RoninArt.at(a, d, -w0 * 0.3), b0 = RoninArt.at(b, d, w2 * 0.35)
        let m = RoninArt.at(a, d, length * t)
        var points = [
            RoninArt.at(a0, n, w0 / 2), RoninArt.at(m, n, w1 / 2 * (1 + bulge)), RoninArt.at(b0, n, w2 / 2), RoninArt.at(b0, d, w2 * 0.25),
            RoninArt.at(b0, n, -w2 / 2), RoninArt.at(m, n, -w1 / 2 * (1 - bulge)), RoninArt.at(a0, n, -w0 / 2), RoninArt.at(a0, d, -w0 * 0.2),
        ]
        if let floor { points = points.map { CGPoint(x: $0.x, y: max(floor, $0.y)) } }
        if lies { points = points.map(grounded) }
        fill(points, paint)
    }

    /// Cloth hanging from a limb on a body lying down: what stands up off the limb's line (from `root` along `d`)
    /// falls onto it, and what hangs below lies on the ground. On a figure on its feet, as it is.
    func slumped(_ p: CGPoint, from root: CGPoint, along d: CGPoint) -> CGPoint {
        let k = fallen
        guard k > 0 else { return p }
        let g = gravity
        let t = (p.x - root.x) * d.x + (p.y - root.y) * d.y
        let off = CGPoint(x: p.x - root.x - d.x * t, y: p.y - root.y - d.y * t)
        let rise = -(off.x * g.x + off.y * g.y)
        let q = rise > 0 ? CGPoint(x: p.x + g.x * rise * 0.8 * k, y: p.y + g.y * rise * 0.8 * k) : p
        return grounded(q)
    }

    mutating func draw() {
        let legs = pose.severed?.hasLegs ?? true, arms = pose.severed?.hasArms ?? true
        if arms { backGear() }
        if build.scabbard { scabbard(behind: true) }
        // The far side first, in a lighter shade, so the figure reads in depth.
        if legs { leg(pose.back, shade) }
        let drawingBow = pose.armed && build.weapon == .bow && (pose.draw > 0 || pose.hold2 != nil)
        // (What is drawn of the body itself, without the arms and the weapon: what a smear frame's body blur is made of.)
        let farArm = pen.sketch.body.count
        if !drawingBow, arms { arm(other, shade, from: farShoulder) }
        let trunkFrom = pen.sketch.body.count
        // The face of a cut goes over everything on its own side that meets it: the trunk and its cloth (the sash,
        // the collar, the hakama's seat, the skirt), and below the cut the near thigh as well.
        let outline = trunk()
        if !legs { cutFace(outline) }
        if pose.severed == .headless { stump() } else if arms { head() }
        if legs {
            leg(pose.front, body)
            cutFace(outline)
        }
        if build.scabbard { scabbard(behind: false) }
        let nearArm = pen.sketch.body.count
        if arms { arm(main, body, from: nearShoulder) }
        // A hand pressed to a wound is drawn over the body (and the near arm), or it is lost inside the silhouette.
        if pose.clutch, arms, pose.severed == nil { clutchingHand() }
        if pose.armed { weapon(main.hand, other.hand) }
        if drawingBow, arms { arm(other, body, from: farShoulder) }
        if pose.smear != nil || !pose.ghosts.isEmpty || pose.drag != 0 {
            let shapes = pen.sketch.body
            smearFrame(body: Array(shapes[..<farArm] + shapes[trunkFrom..<nearArm]))
        }
    }

    // MARK: Smear frames

    /// Where the weapon runs in this pose, from the hand to the point, as it is drawn (a blade stopping at the
    /// ground): one line for each blade (the twin blades' two); none for a bow, or a blade in its scabbard.
    var weaponLines: [(hand: CGPoint, tip: CGPoint)] {
        guard pose.armed else { return [] }
        let ground = Figure.feet.y * H + 0.004 * H
        func line(_ hand: CGPoint, _ angle: CGFloat, _ length: CGFloat, flat: CGFloat = 1) -> (hand: CGPoint, tip: CGPoint) {
            let (d, scale) = bladeVector(angle, flat: flat)
            var shown = length * scale
            if pose.roll == 0, d.y < 0, hand.y + d.y * shown < ground { shown = max(0, (ground - hand.y) / d.y) }
            return (hand, at(hand, d, shown))
        }
        switch build.weapon {
        case .katana: return pose.sheathed > 0 ? [] : [line(main.hand, pose.blade, 0.6 * H, flat: pose.flat)]
        case .nodachi: return [line(main.hand, pose.blade, 0.78 * H)]
        case .knife: return [line(main.hand, pose.blade, 0.25 * H)]
        case .twin: return [line(main.hand, pose.blade, 0.4 * H), line(other.hand, pose.blade2, 0.38 * H)]
        case .spear: return [line(main.hand, pose.blade, (Drawer.spear + 0.15) * H)]
        case .club: return [line(main.hand, pose.blade, 0.6 * H)]
        case .bow: return []
        }
    }

    /// The arms as they are drawn in this pose, the near (sword) arm's and the far one's: each its shoulder, elbow and
    /// hand.
    var armJoints: [[CGPoint]] { [[nearShoulder, main.elbow, main.hand], [farShoulder, other.elbow, other.hand]] }

    /// A smear frame, painted the way an animator paints one: not the limbs, the blade and the body drawn again back
    /// along the motion, but the motion itself, soft-edged, in the figure's own ink, carrying the eye along the path
    /// they took since the frame before and running on into this one. Under the figure:
    ///
    /// - the body blurred back the way it was carried (`drag`): its silhouette smeared out behind itself, densest at
    ///   its own edge and fading to nothing, never a second body standing behind it;
    /// - the arms dissolving back along their path: in-betweens packed so close that they run together, each older
    ///   one thinner and fainter than the one after it, so the arm stretches back into its own smear;
    /// - between the blades, the sweep: a fan of ink over the whole path the weapon took, nearly as dark as the
    ///   figure just behind the blade and fading smoothly back along the swing, its inner edge soft, a few finer
    ///   strands running through it along the swing like the bristles of a dry brush.
    ///
    /// Over it, the bright steel edge along the path the point took (and on back along the arc it came round, as far
    /// as the trail's `from`), brightest at the blade. A blade with no path of its own (stopped dead, or only now out
    /// of its scabbard) sweeps the arc its trail gives about the hand (a blade stopped dead leaves only the edge); a
    /// thrust leaves the weapon's line streaked back along itself and speed lines.
    mutating func smearFrame(body carried: [Shape]) {
        let ink = Palette.silhouette
        let ground = Figure.feet.y * H
        var under: [Shape] = []
        var over: [Shape] = []
        func grounded(_ points: [CGPoint]) -> [CGPoint] { points.map { CGPoint(x: $0.x, y: max(ground, $0.y)) } }
        func polygon(_ points: [CGPoint], _ paint: Paint) -> Shape { Shape(kind: .path(Path(polygon: grounded(points))), fill: paint) }
        let thrust = pose.smear?.thrust ?? false

        // The body carried along: copies of its silhouette packed close behind it (a pixel or two apart, out to twice
        // the way it came in the frame), each fainter than the last, so that only its trailing edges blur back.
        if pose.drag != 0 {
            let dx = -2 * pose.drag * H
            let copies = max(4, min(10, Int((abs(dx) / (0.009 * H)).rounded(.up))))
            for k in (1...copies).reversed() {
                let f = CGFloat(k) / CGFloat(copies)
                let alpha = 0.3 * pow(1 - f + 0.5 / CGFloat(copies), 1.6)
                under += carried.map { $0.mapped { CGPoint(x: $0.x + dx * f, y: $0.y) }.inked(Paint(ink, alpha)) }
            }
        }

        // The moments the smear runs through: the in-betweens, oldest first, and this pose.
        let moments = pose.ghosts.map { ghost -> Drawer in
            var g = ghost
            g.ghosts = []
            g.drag = 0
            g.smear = nil
            return Drawer(pose: g, build: build, H: H)
        }

        // The arms dissolving back along their path.
        if !moments.isEmpty {
            let path = moments.map(\.armJoints) + [armJoints]
            let m = build.bulk * build.brawn, k = build.bulk
            for (side, weight) in [(0, CGFloat(1)), (1, 0.8)] {
                let arm = path.map { $0[side] }
                func travel(_ j: Int) -> CGFloat {
                    zip(arm, arm.dropFirst()).map { hypot($1[j].x - $0[j].x, $1[j].y - $0[j].y) }.reduce(0, +)
                }
                let moved = max(travel(1), travel(2))
                guard moved > 0.012 * H else { continue }
                // How much of the hand's way went across the forearm rather than along it: an arm drawn back or thrust
                // out along its own line would pile its in-betweens up into a second arm, so they are fainter the less
                // it sweeps sideways.
                var across: CGFloat = 0, along: CGFloat = 0
                for (a, b) in zip(arm, arm.dropFirst()) {
                    let d = unit(a[1], a[2]), step = CGPoint(x: b[2].x - a[2].x, y: b[2].y - a[2].y)
                    across += abs(step.x * d.y - step.y * d.x)
                    along += abs(step.x * d.x + step.y * d.y)
                }
                let sweep = across / max(0.0001, across + along)
                // In-betweens packed so close (a third of the hand's width apart) that their edges run together into one
                // soft shape; the fainter each, the more of them there are.
                let copies = max(8, min(64, Int((moved / (0.006 * H)).rounded(.up))))
                let each = min(1, moved / CGFloat(copies) / (0.012 * H))
                for c in (1...copies).reversed() {
                    let age = CGFloat(c) / CGFloat(copies)
                    let joints = Drawer.sample(arm, age)
                    let thin = 1 - 0.5 * age
                    let spine = [(joints[0], 0.03 * m * thin), (Drawer.lerp(joints[0], joints[1], 0.4), 0.034 * m * thin),
                                 (joints[1], 0.018 * k * thin), (Drawer.lerp(joints[1], joints[2], 0.3), 0.024 * m * thin),
                                 (joints[2], 0.02 * k * thin), (at(joints[2], unit(joints[1], joints[2]), 0.022 * H), 0.018 * thin)]
                    let alpha = 0.17 * each * weight * pow(sweep, 1.5) * pow(1 - age, 1.3)
                    under.append(polygon(Drawer.outline(spine.map { ($0.0, $0.1 * H) }), Paint(ink, alpha)))
                }
            }
        }

        // The weapon's path: each weapon line through the in-betweens and on to the pose drawn.
        var tracks: [Track] = []
        var arced = false
        let lines = weaponLines
        if !moments.isEmpty {
            let samples = moments.map(\.weaponLines).filter { $0.count == lines.count && !$0.isEmpty } + [lines]
            if samples.count > 1 { tracks = lines.indices.map { k in Track(samples.map { $0[k] }) } }
        }
        if tracks.isEmpty, let smear = pose.smear, !smear.thrust, let line = lines.first {
            // A blade stopped dead, or just out of its scabbard (so that it had no path of its own until now): its arc
            // about the hand, as far as the blade reaches.
            tracks = [Drawer.arc(about: line.hand, length: hypot(line.tip.x - line.hand.x, line.tip.y - line.hand.y)
                / max(0.0001, bladeVector(pose.blade, flat: pose.flat).scale), from: smear.from, to: smear.to, flat: smear.flat)]
            arced = true
        }

        let steps = 24
        for (k, track) in tracks.enumerated() {
            // The far blade of a pair a little fainter than the near.
            let weight: CGFloat = k == 0 ? 1 : 0.7
            if !moments.isEmpty, !thrust {
                // The fan: many faint layers of ink laid one over another, each from the blade as drawn back along the
                // path to where it gives out, so that where they all overlap (just behind the blade) the ink is nearly as
                // dark as the figure, and it thins smoothly back along the swing, in steps too fine to see. The later
                // layers start further out along the blade, so the inner edge is soft, and each gives out sooner toward
                // the hand than at the point, so the fan narrows back along the swing to the path of the point.
                //
                // Where the blade turns back on its own sweep (the hand driving one way as the point whips the other),
                // one outline would fold over itself and leave a hole where the folds cancel; there each layer is laid
                // in pieces along the path instead, their joins staggered from layer to layer so that none shows.
                let layers = 30
                let pieces = track.folds(from: 0.12) ? 6 : 1
                for j in 0..<layers {
                    let u = (CGFloat(j) + 0.5) / CGFloat(layers)
                    let inner = 0.12 + 0.32 * u
                    let reach = pow(1 - u, 1.4)
                    func back(_ r: CGFloat) -> CGFloat { min(1, reach * (0.45 + 0.55 * Drawer.smooth((r - 0.12) / 0.7))) }
                    let radii = (0...16).map { inner + (1 - inner) * CGFloat($0) / 16 }
                    var joins: [CGFloat] = [0]
                    if pieces > 1 {
                        let offset = (CGFloat(j) * 0.618).truncatingRemainder(dividingBy: 1)
                        for c in 0..<pieces {
                            let join: CGFloat = (CGFloat(c) + offset) / CGFloat(pieces)
                            if join > 0.02, join < 0.98 { joins.append(join) }
                        }
                    }
                    joins.append(1)
                    for (f0, f1) in zip(joins, joins.dropFirst()) {
                        let n = max(2, Int((CGFloat(steps) * (f1 - f0)).rounded(.up)))
                        func ages(_ r: CGFloat) -> [CGFloat] { (0...n).map { back(r) * (f0 + (f1 - f0) * CGFloat($0) / CGFloat(n)) } }
                        var outline: [CGPoint] = []
                        outline += ages(inner).reversed().map { track.point($0, inner) }
                        outline += radii.map { track.point(back($0) * f0, $0) }
                        outline += ages(1).map { track.point($0, 1) }
                        outline += radii.reversed().map { track.point(back($0) * f1, $0) }
                        under.append(polygon(outline, Paint(ink, 0.07 * weight)))
                    }
                }
                // Through it, running along the swing, the strands of a dry brush: fine streaks of ink at their own
                // distances along the blade, each tapering away to nothing at its own length back along the path.
                for (r, length, width, alpha) in [(CGFloat(0.94), CGFloat(0.9), CGFloat(0.05), CGFloat(0.13)), (0.79, 0.7, 0.06, 0.09),
                                                  (0.63, 0.55, 0.055, 0.08), (0.47, 0.4, 0.05, 0.07)] {
                    let spine = (0...steps).map { i -> (CGPoint, CGFloat) in
                        let f = CGFloat(i) / CGFloat(steps)
                        return (track.point(length * f, r), width * track.length(length * f) * pow(1 - f, 0.9))
                    }
                    under.append(polygon(Drawer.outline(spine), Paint(ink, alpha * weight)))
                }
            }
        }

        // The steel edge along the path the point took: the track, then on back along the arc it came round about the
        // oldest hand to the trail's start.
        if let smear = pose.smear, !thrust, let track = tracks.first {
            var path = (0...steps).map { i -> (hand: CGPoint, tip: CGPoint) in
                let age = CGFloat(i) / CGFloat(steps)
                return (track.hand(age), track.point(age, 1))
            }
            if !arced, let oldest = moments.first?.pose, let first = path.last {
                let start = oldest.blade
                if (start - smear.from) * (smear.to - start) > 0, abs(start - smear.from) > 0.05 {
                    let length = hypot(first.tip.x - first.hand.x, first.tip.y - first.hand.y) / max(0.0001, bladeVector(start, flat: smear.flat).scale)
                    let arc = Drawer.arc(about: first.hand, length: length, from: smear.from, to: start, flat: smear.flat)
                    let more = max(2, Int((CGFloat(steps) * abs(start - smear.from) / max(0.3, abs(smear.to - start))).rounded()))
                    path += (1...more).map { i in
                        let age = CGFloat(i) / CGFloat(more)
                        return (arc.hand(age), arc.point(age, 1))
                    }
                }
            }
            over += Drawer.edge(path, H: H, strength: smear.strength, polygon: polygon)
        }

        if thrust, let line = lines.first {
            // The weapon's line streaked back along itself, and the steel's speed lines.
            if let track = tracks.first {
                let tail = (0...steps).map { track.point(0.9 * CGFloat($0) / CGFloat(steps), 1) }
                let root = (0...steps).map { track.point(0.9 * CGFloat($0) / CGFloat(steps), 0.35) }
                if hypot(tail[0].x - tail[steps].x, tail[0].y - tail[steps].y) > 0.02 * H {
                    for (width, alpha) in [(CGFloat(0.03), CGFloat(0.22)), (0.016, 0.3)] {
                        under.append(polygon(Drawer.outline(zip(tail, (0...steps)).map { p, i in (p, width * H * (1 - CGFloat(i) / CGFloat(steps))) }),
                                             Paint(ink, alpha)))
                        under.append(polygon(Drawer.outline(zip(root, (0...steps)).map { p, i in (p, width * H * (1 - CGFloat(i) / CGFloat(steps))) }),
                                             Paint(ink, alpha * 0.8)))
                    }
                }
            }
            if let smear = pose.smear { over += Drawer.speedLines(origin: line.hand, tip: line.tip, H: H, strength: smear.strength) }
        }
        pen.underlay(under)
        pen.overlay(over)
    }

    /// Where the joints of a limb were `age` back along a path of them (oldest first, 0 the last, 1 the first),
    /// between the moments sampled.
    static func sample(_ path: [[CGPoint]], _ age: CGFloat) -> [CGPoint] {
        guard path.count > 1 else { return path.first ?? [] }
        let s = max(0, min(1, 1 - age)) * CGFloat(path.count - 1)
        let i = min(path.count - 2, Int(s)), f = s - CGFloat(i)
        return zip(path[i], path[i + 1]).map { lerp($0, $1, f) }
    }

    static func lerp(_ a: CGPoint, _ b: CGPoint, _ t: CGFloat) -> CGPoint { CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t) }

    /// 0 below 0, 1 above 1, and an easy S between.
    static func smooth(_ x: CGFloat) -> CGFloat {
        let t = max(0, min(1, x))
        return t * t * (3 - 2 * t)
    }

    /// One outline around a line through `spine`, as wide at each point as it says: a limb (or a streak) as one shape,
    /// so that nothing of it doubles up where its parts would overlap.
    static func outline(_ spine: [(CGPoint, CGFloat)]) -> [CGPoint] {
        guard spine.count > 1 else { return [] }
        var left: [CGPoint] = [], right: [CGPoint] = []
        for (i, (p, w)) in spine.enumerated() {
            let d = unit(spine[max(0, i - 1)].0, spine[min(spine.count - 1, i + 1)].0), n = CGPoint(x: -d.y, y: d.x)
            left.append(at(p, n, w / 2))
            right.append(at(p, n, -w / 2))
        }
        return left + right.reversed()
    }

    /// A blade's line swung about a hand held still, from one angle to another (squashed toward a level plane when
    /// `flat` is below 1), as a track (age 0 at `to`).
    static func arc(about hand: CGPoint, length: CGFloat, from: CGFloat, to: CGFloat, flat: CGFloat) -> Track {
        Track((0...Pose.smearSteps).map { i -> (hand: CGPoint, tip: CGPoint) in
            let a = from + (to - from) * CGFloat(i) / CGFloat(Pose.smearSteps)
            let (d, scale) = bladeVector(a, flat: flat)
            return (hand, at(hand, d, length * scale))
        })
    }

    /// The steel edge of a trail along a path of the weapon's line (newest first): tapering to a hair back along it,
    /// brightest at the blade, a faint sheen just inside it.
    static func edge(_ path: [(hand: CGPoint, tip: CGPoint)], H: CGFloat, strength: CGFloat, polygon: ([CGPoint], Paint) -> Shape) -> [Shape] {
        guard path.count > 1 else { return [] }
        // How far along the path each point is, as a share of all of it.
        var run: [CGFloat] = [0]
        for (a, b) in zip(path, path.dropFirst()) { run.append(run[run.count - 1] + hypot(b.tip.x - a.tip.x, b.tip.y - a.tip.y)) }
        let total = max(0.001, run[run.count - 1])
        guard total > 0.01 * H else { return [] }
        var out: [Shape] = []
        for (span, width, alpha) in [(CGFloat(1), CGFloat(0.06), CGFloat(0.07)), (0.55, 0.045, 0.08),
                                     (0.95, 0.02, 0.3), (0.6, 0.017, 0.3), (0.3, 0.014, 0.35)] {
            var outer: [CGPoint] = [], inner: [CGPoint] = []
            for (i, line) in path.enumerated() {
                let f = run[i] / total
                guard f <= span else { break }
                let w = width * H * pow(1 - f / span, 1.2)
                let length = max(0.001, hypot(line.tip.x - line.hand.x, line.tip.y - line.hand.y))
                outer.append(line.tip)
                inner.append(lerp(line.tip, line.hand, min(1, w / length)))
            }
            guard outer.count > 1 else { continue }
            out.append(polygon(outer.reversed() + inner, Paint(Palette.steel, alpha * strength)))
        }
        return out
    }

    mutating func leg(_ angles: (thigh: CGFloat, shin: CGFloat), _ paint: Paint) {
        let knee = at(hip, dir(angles.thigh), thigh * H)
        let ankle = at(knee, dir(angles.shin), shin * H)
        // The knee and the ankle as heavy as the man; the thigh as brawny, the calf a little less.
        let k = build.bulk, m = build.bulk * build.brawn, calf = build.bulk * build.brawn.squareRoot()
        // On its feet, nothing goes through the ground: a knee or a hem brought down onto it rests on it.
        let standing = pose.roll == 0 && pose.hipAt == nil && !pose.airborne
        let floor: CGFloat? = standing ? Figure.feet.y * H - 0.006 * H : nil
        switch build.legs {
        case .hakama:
            // Pleated trousers, flaring below the knee to a hem cut on the slant that trails behind the stride. The
            // ronin's are cut full: they billow at the thigh and knee and sweep out wide at the hem.
            let b = build.baggy, t = build.brawn
            segment(hip, knee, (0.082 + 0.06 * b) * H * t, (0.09 + 0.075 * b) * H * t, (0.066 + 0.05 * b) * H, paint, bulge: 0.12 * b, at: 0.5,
                    floor: floor)
            let hem = at(ankle, dir(angles.shin), 0.012 * H)
            let d = dir(angles.shin), n = CGPoint(x: -d.y, y: d.x)
            // Down on a knee, the shin laid back along the ground, the hem folds in narrow over the heel instead of
            // standing up off it like a board (a lunge's back leg, the knee well up, keeps its full flare).
            var narrow: CGFloat = 1
            if standing {
                let kneeling = max(0, min(1, (0.2 * H - (knee.y - Figure.feet.y * H)) / (0.15 * H)))
                let lying = min(1, abs(sin(angles.shin)))
                narrow = 1 - 0.55 * kneeling * max(0, (lying - 0.5) / 0.5)
            }
            let trail = CGPoint(x: -face.x * pose.stream * (0.025 + 0.035 * b) * H, y: pose.stream * (0.01 + 0.012 * b) * H)
            let front = at(at(hem, n, (0.054 + 0.045 * b) * H * narrow), d, -0.024 * H)
            let back = at(at(hem, n, -(0.06 + 0.055 * b) * H * narrow), d, 0.01 * H)
            let billow = at(at(knee, d, shin * H * 0.45), n, -(0.05 + 0.05 * b) * H)
            let cloth = [at(knee, n, (0.036 + 0.03 * b) * H), front, CGPoint(x: back.x + trail.x, y: back.y + trail.y),
                         CGPoint(x: billow.x + trail.x * 0.5, y: billow.y), at(knee, n, -(0.036 + 0.034 * b) * H)]
            // Lying, the flare of the hem falls onto the leg and the ground rather than standing up off it.
            fill(floor.map { f in cloth.map { CGPoint(x: $0.x, y: max(f, $0.y)) } } ?? cloth.map { slumped($0, from: knee, along: d) }, paint)
        case .leggings:
            // A full thigh narrowing hard to the knee; a calf swelling behind the shin and down to a fine ankle.
            segment(hip, knee, 0.074 * H * m, 0.088 * H * m, 0.036 * H * k, paint, bulge: 0.22, at: 0.34, floor: floor)
            segment(knee, ankle, 0.038 * H * k, 0.058 * H * calf, 0.02 * H * k, paint, bulge: -0.45, at: 0.3, floor: floor)
        case .bare:
            segment(hip, knee, 0.08 * H * m, 0.096 * H * m, 0.038 * H * k, paint, bulge: 0.25, at: 0.34, floor: floor)
            segment(knee, ankle, 0.042 * H * k, 0.064 * H * calf, 0.021 * H * k, paint, bulge: -0.5, at: 0.3, floor: floor)
        }
        // A foot: long and narrow, drawn to a point, flat along the ground for a figure on its feet. On a body thrown
        // about, turned with the shin only as far as an ankle must (no more than about 55° pointed or 50° flexed),
        // and lying on the ground rather than through it.
        var toe = CGFloat.pi / 2
        if pose.hipAt != nil {
            var square = -angles.shin
            while square > .pi { square -= 2 * .pi }
            while square < -.pi { square += 2 * .pi }
            toe = angles.shin + .pi / 2 + max(-0.95, min(0.9, square))
        }
        let t = dir(toe), u = CGPoint(x: -t.y, y: t.x)
        // On the balls of his feet, a foot on the ground (or just off it) turned up about the ball of the foot, the
        // heel lifted.
        var raise: CGFloat = 0
        if standing, pose.heels > 0 {
            let off = (ankle.y - (Figure.feet.y + 0.025) * H) / H
            raise = pose.heels * max(0, min(1, 1 - off / 0.06))
        }
        let ball = CGPoint(x: ankle.x + (t.x * 0.07 - u.x * 0.027) * H, y: ankle.y + (t.y * 0.07 - u.y * 0.027) * H)
        func f(_ a: CGFloat, _ b: CGFloat) -> CGPoint {
            var p = CGPoint(x: ankle.x + (t.x * a + u.x * b) * H, y: ankle.y + (t.y * a + u.y * b) * H)
            if raise > 0 {
                let x = p.x - ball.x, y = p.y - ball.y
                p = CGPoint(x: ball.x + x * cos(raise) + y * sin(raise), y: ball.y - x * sin(raise) + y * cos(raise))
                if let floor { p.y = max(floor, p.y) }
            }
            return grounded(p)
        }
        fill([f(-0.018, 0), f(0, 0.014), f(0.09, -0.022), f(0.075, -0.027), f(-0.024, -0.027)], paint)
    }

    mutating func arm(_ ends: (elbow: CGPoint, hand: CGPoint), _ paint: Paint, from shoulder: CGPoint) {
        let (elbow, hand) = ends
        // The joints as heavy as the man; the muscle between them as brawny.
        let k = build.bulk, m = build.bulk * build.brawn
        // A round shoulder, a full upper arm pinching in to the elbow, a forearm thick below the elbow and fine at the
        // wrist.
        segment(shoulder, elbow, 0.058 * H * m, 0.068 * H * m, 0.03 * H * k, paint, bulge: 0.3, at: 0.36)
        segment(elbow, hand, 0.034 * H * k, 0.048 * H * m * build.brawn, 0.02 * H * k, paint, bulge: 0.25, at: 0.24)
        let r = 0.04 * H * m
        pen.ellipse(CGRect(x: shoulder.x - r, y: shoulder.y - r * 0.9, width: r * 2, height: r * 1.9), paint)
        // The fist.
        let d = unit(elbow, hand), n = CGPoint(x: -d.y, y: d.x)
        fill([at(hand, n, 0.016 * H), at(hand, d, 0.03 * H), at(hand, n, -0.016 * H), at(hand, d, -0.008 * H)], paint)
        if build.sleeves {
            // A kimono sleeve: a deep, square-cut panel hanging from the upper arm, swinging back as the arm moves; on
            // a body lying down, hanging toward the ground and lying on it.
            let du = unit(shoulder, elbow)
            let k = fallen, g = gravity
            let hang = CGPoint(x: -face.x * (0.25 + pose.stream * 0.55) * (1 - k) + g.x * k, y: (-1 + pose.stream * 0.3) * (1 - k) + g.y * k)
            let length = max(0.0001, hypot(hang.x, hang.y))
            let down = CGPoint(x: hang.x / length, y: hang.y / length)
            let b = build.baggy
            fill([at(shoulder, du, -0.01 * H * b), at(elbow, du, (-0.012 + 0.02 * b) * H), at(at(elbow, du, -0.024 * H), down, (0.075 + 0.08 * b) * H),
                  at(at(shoulder, du, 0.06 * H), down, (0.08 + 0.1 * b) * H)].map(grounded), paint)
        }
    }

    /// Where a cut through the trunk runs (a point on it and the way across), and which side of it is kept (the
    /// normal points into what is drawn); nil for a whole trunk.
    var cut: (point: CGPoint, along: CGPoint, keep: CGPoint)? {
        let at: CGFloat, slant: CGFloat, upper: Bool
        switch pose.severed {
        case .above(let a, let s)?: (at, slant, upper) = (a, s, true)
        case .below(let a, let s)?: (at, slant, upper) = (a, s, false)
        default: return nil
        }
        let along = CGPoint(x: across.x * cos(slant) + up.x * sin(slant), y: across.y * cos(slant) + up.y * sin(slant))
        let normal = CGPoint(x: up.x * cos(slant) - across.x * sin(slant), y: up.y * cos(slant) - across.y * sin(slant))
        return (torsoPoint(at, 0), along, upper ? normal : CGPoint(x: -normal.x, y: -normal.y))
    }

    /// A polygon cut down to the side of a line it keeps (the side `keep` points into), within `depth` of the line
    /// if given: the face of the cut.
    static func clip(_ points: [CGPoint], _ point: CGPoint, _ keep: CGPoint, depth: CGFloat? = nil) -> [CGPoint] {
        func side(_ q: CGPoint) -> CGFloat { (q.x - point.x) * keep.x + (q.y - point.y) * keep.y }
        func halve(_ points: [CGPoint], _ inside: (CGPoint) -> CGFloat) -> [CGPoint] {
            guard !points.isEmpty else { return [] }
            var out: [CGPoint] = []
            for (i, a) in points.enumerated() {
                let b = points[(i + 1) % points.count]
                let fa = inside(a), fb = inside(b)
                if fa >= 0 { out.append(a) }
                if (fa >= 0) != (fb >= 0) {
                    let t = fa / (fa - fb)
                    out.append(CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t))
                }
            }
            return out
        }
        var out = halve(points, side)
        if let depth { out = halve(out) { depth - side($0) } }
        return out
    }

    /// Fills a part of the trunk, cut down to what is left of it.
    mutating func trunkFill(_ points: [CGPoint], _ paint: Paint) {
        guard let cut else { return fill(points, paint) }
        let kept = Drawer.clip(points, cut.point, cut.keep)
        if kept.count >= 3 { fill(kept, paint) }
    }

    /// The face of a cut through the trunk: dark meat, a wet red edge, a white knot of bone at the spine.
    mutating func cutFace(_ outline: [[CGPoint]]) {
        guard let cut else { return }
        for (depth, paint) in [(0.042 * H, Paint(RGB(0.38, 0.0, 0.03))), (0.016 * H, Paint(RGB(0.86, 0.1, 0.12)))] {
            for points in outline {
                let face = Drawer.clip(points, cut.point, cut.keep, depth: depth)
                if face.count >= 3 { fill(face, paint) }
            }
        }
        let bone = at(at(cut.point, cut.along, -build.waist * H * 0.35), cut.keep, 0.012 * H)
        pen.ellipse(CGRect(x: bone.x - 0.017 * H, y: bone.y - 0.013 * H, width: 0.034 * H, height: 0.026 * H), Paint(RGB(0.93, 0.88, 0.8)))
    }

    /// Where a struck-off head's own length of neck begins (in head radii): lower than the stump's end, so the two
    /// overlap for the instant they part, and low enough that the wound shows under the jaw.
    static let headCut: CGFloat = 0.15

    /// The face of a neck cut through, seen a little end-on: a wet red rim, dark meat, and the white of the spine
    /// toward the back of the neck.
    mutating func neckWound(_ end: CGPoint, _ w: CGFloat) {
        let d = headUp, n = CGPoint(x: -headUp.y, y: headUp.x)
        fill(oval(end, n, d, 0.56 * w, 0.24 * w), Paint(RGB(0.86, 0.1, 0.12)))
        fill(oval(end, n, d, 0.46 * w, 0.17 * w), Paint(RGB(0.38, 0.0, 0.03)))
        let spine: CGFloat = n.x * face.x + n.y * face.y > 0 ? -1 : 1
        fill(oval(at(end, n, spine * 0.18 * w), n, d, 0.14 * w, 0.09 * w), Paint(RGB(0.93, 0.88, 0.8)))
    }

    /// The neck of a man whose head is gone: standing clear of the shoulders and cut off flat, the face of the cut on
    /// its end and blood running down from it.
    mutating func stump() {
        let r = build.head * H, w = 0.044 * H * build.bulk * build.brawn
        let d = headUp, n = CGPoint(x: -headUp.y, y: headUp.x)
        let root = at(neck, d, -0.01 * H), end = at(neck, d, r * Figure.neckCut)
        let thick = 0.021 * H * build.bulk * build.brawn
        fill([at(root, n, thick), at(end, n, w / 2), at(end, n, -w / 2), at(root, n, -thick)], body)
        for (s, length) in [(CGFloat(0.34), CGFloat(0.03)), (-0.12, 0.017), (-0.4, 0.024)] {
            let top = at(end, n, s * w)
            fill([at(top, n, 0.006 * H), at(top, d, -length * H), at(top, n, -0.006 * H)], Paint(RGB(0.62, 0.02, 0.06)))
        }
        neckWound(end, w)
    }

    /// The torso in profile: a deep chest and a flat back over a narrow waist; skirt or tassets; the sash; plates.
    /// Everything on the trunk is cut down to what a cut leaves of it; it returns the trunk's outlines, for the face
    /// of the cut (drawn by `draw` over whatever else meets it).
    @discardableResult
    mutating func trunk() -> [[CGPoint]] {
        let c = build.chest * H, wst = build.waist * H, b = build.baggy
        let legs = pose.severed?.hasLegs ?? true, arms = pose.severed?.hasArms ?? true
        var outline: [[CGPoint]] = []
        // A V: a deep chest and a broad back over a narrow waist, the trapezius sloping up to the neck.
        let v = Figure.trunkProfile(build).map { torsoPoint($0.along, $0.out * H) }
        trunkFill(v, body)
        outline.append(v)
        if b > 0 {
            // A loose kimono over it: bloused out over the sash front and back, the collar standing off the neck, the
            // cloth hanging slack from the shoulder blades.
            let sag = pose.stream * 0.02 * H
            let kimono = [
                torsoPoint(0.12, -wst * 0.75 * (1 + b * 0.35)), torsoPoint(0.12, wst * 0.72 * (1 + b * 0.35)),
                torsoPoint(0.3, wst * (0.75 + 0.45 * b)), torsoPoint(0.55, c * (0.66 + 0.1 * b)), torsoPoint(0.8, c * 0.6),
                torsoPoint(0.99, c * 0.28), torsoPoint(1.04, -c * 0.2), torsoPoint(0.84, -c * (0.5 + 0.1 * b)),
                at(torsoPoint(0.5, -c * (0.46 + 0.12 * b)), across, -sag), at(torsoPoint(0.26, -wst * (0.78 + 0.45 * b)), across, -sag),
            ]
            trunkFill(kimono, body)
            outline.append(kimono)
        }
        if legs, build.legs == .hakama {
            // The hakama's seat, joining the two legs under the sash.
            let b = build.baggy
            let front = at(hip, dir(pose.front.thigh), thigh * H * (0.3 + 0.2 * b)), back = at(hip, dir(pose.back.thigh), thigh * H * (0.3 + 0.2 * b))
            trunkFill([torsoPoint(0.08, -wst * (0.62 + 0.2 * b)), torsoPoint(0.08, wst * (0.6 + 0.2 * b)), at(front, across, (0.04 + 0.04 * b) * H),
                       at(back, across, -(0.04 + 0.04 * b) * H)], body)
        }
        if legs, build.skirt > 0 {
            // Hanging from the waist; on a body going down, coming to lie along the thighs, and on the ground rather
            // than through it.
            var down = CGPoint(x: 0, y: -1)
            if pose.floor != nil {
                let f = dir(pose.front.thigh), t = dir(pose.back.thigh)
                let sum = CGPoint(x: f.x + t.x, y: f.y + t.y), l = hypot(sum.x, sum.y)
                let thighs = l > 0.2 ? CGPoint(x: sum.x / l, y: sum.y / l) : gravity
                let k = fallen
                let way = CGPoint(x: thighs.x * k, y: -(1 - k) + thighs.y * k), m = max(0.0001, hypot(way.x, way.y))
                down = CGPoint(x: way.x / m, y: way.y / m)
            }
            let hem = at(hip, down, build.skirt * H), side = CGPoint(x: -down.y, y: down.x)
            let lying = pose.floor != nil
            func edge(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
                lying ? grounded(at(at(hem, side, x), down, -y)) : CGPoint(x: hem.x + x, y: hem.y + y)
            }
            let spread = wst * 1.25
            if build.plated {
                for s in [CGFloat(-1), 0, 1] {
                    let top = torsoPoint(0.06, s * wst * 0.5)
                    trunkFill([at(top, across, -wst * 0.42), at(top, across, wst * 0.42), edge(s * spread * 0.8 + wst * 0.5, abs(s) * 0.02 * H),
                               edge(s * spread * 0.8 - wst * 0.5, abs(s) * 0.02 * H)], body)
                }
            } else {
                trunkFill([torsoPoint(0.1, -wst * 0.6), torsoPoint(0.1, wst * 0.6), edge(spread, 0.01 * H), edge(spread * 0.2, -0.015 * H),
                           edge(-spread, 0.01 * H)], body)
            }
        }
        // The sash, and a fine collar line crossing the chest: bands, so that a cut takes each where it runs.
        if legs {
            trunkFill(band(torsoPoint(0.14, -wst * 0.62), torsoPoint(0.14, wst * 0.58), 0.026 * H), Paint(build.accent.scaled(0.75)))
        }
        if arms {
            trunkFill(band(torsoPoint(0.98, c * 0.12), torsoPoint(0.6, c * 0.5), max(1, 0.007 * H)), Paint(Palette.shade.mix(.white, 0.14)))
        }
        if arms, build.plated {
            for s in [CGFloat(1), -1] {
                // The shoulder plates (sode), as broad as the shoulders under them.
                let root = torsoPoint(0.92, s * c * 0.45), w = build.brawn
                let down = at(root, up, -0.1 * H * w)
                fill([at(root, across, -0.05 * H * w), at(root, across, 0.055 * H * w), at(down, across, 0.075 * H * w), at(down, across, -0.07 * H * w)]
                        .map(grounded), body)
            }
        }
        return outline
    }

    /// The free hand pressed to the wound in his side, over the body: the blood welling out round it and running
    /// down over the sash, then the forearm and the fist on it, a shade lighter than the body so they read against it.
    mutating func clutchingHand() {
        let (elbow, hand) = other
        let k = build.bulk, swell = 1 + 0.12 * sin(pose.wave * 2 * .pi)
        let wound = at(hand, CGPoint(x: 0, y: -1), 0.01 * H)
        let blood = Paint(Palette.blood, 0.95), dark = Paint(Palette.blood.mix(.black, 0.35), 0.95)
        fill(oval(wound, CGPoint(x: 1, y: 0), CGPoint(x: 0, y: 1), 0.03 * H * swell, 0.036 * H * swell), dark)
        fill(oval(at(wound, CGPoint(x: 0, y: 1), 0.004 * H), CGPoint(x: 1, y: 0), CGPoint(x: 0, y: 1), 0.022 * H * swell, 0.026 * H * swell), blood)
        // Running down in two streams, the longer as he breathes out.
        for (dx, length) in [(CGFloat(-0.012), 0.11 - 0.015 * swell), (0.01, 0.07 + 0.01 * swell)] {
            let top = at(wound, face, dx * H)
            fill([at(top, face, 0.006 * H), at(top, face, -0.006 * H), CGPoint(x: top.x - face.x * 0.004 * H, y: top.y - length * H)], blood)
        }
        let paint = Paint(Palette.shade.mix(.white, 0.07))
        segment(elbow, hand, 0.034 * H * k, 0.048 * H * k, 0.02 * H * k, paint, bulge: 0.25, at: 0.24)
        let d = unit(elbow, hand), n = CGPoint(x: -d.y, y: d.x)
        fill([at(hand, n, 0.016 * H), at(hand, d, 0.03 * H), at(hand, n, -0.016 * H), at(hand, d, -0.008 * H)], paint)
    }

    /// The head: a cranium, a hard jaw, a straight brow; headgear; eyes. `severed`: struck off, on a short length of
    /// neck cut off flat, the face of the cut on its end.
    mutating func head(severed: Bool = false) {
        let r = build.head * H
        let c = at(neck, headUp, r * 1.25)
        let root = at(neck, headUp, r * Drawer.headCut), w = 0.044 * H * build.bulk * build.brawn
        if severed {
            let n = CGPoint(x: -headUp.y, y: headUp.x)
            fill([at(root, n, w / 2), at(c, n, 0.018 * H), at(c, n, -0.018 * H), at(root, n, -w / 2)], body)
        } else {
            // A strong neck carrying the head (a bull's neck on a brawny man).
            let m = build.bulk * build.brawn
            segment(neck, c, 0.042 * H * m * build.brawn, 0.046 * H * m, 0.036 * H, body, bulge: 0, at: 0.5)
        }
        let skull = CGRect(x: c.x - r, y: c.y - r * 0.95, width: 2 * r, height: 2 * r)
        pen.ellipse(skull, body)
        func p(_ f: CGFloat, _ u: CGFloat) -> CGPoint { at(at(c, face, f * r), headUp, u * r) }
        fill([p(-0.5, -0.6), p(0.72, -1.02), p(1.08, -0.35), p(1.02, 0.2), p(0.8, 0.5)], body)
        gear(c, r)
        if let eyes = build.eyes {
            let eye = p(0.62, 0.05)
            fill([at(eye, face, -r * 0.28), at(eye, headUp, r * 0.12), at(eye, face, r * 0.3), at(eye, headUp, -r * 0.1)], Paint(eyes))
        }
        // Last, over the jaw, or it is lost under it.
        if severed { neckWound(root, w) }
    }

    /// Which way what is tied to the head trails (off the back of it) and which way is up for it; and how far both
    /// are turned (`hang`) to the world's: on a body thrown about, or a head bowed down past level (pitching forward
    /// onto his face), they trail level and hang toward the ground rather than streaming off the back of the head.
    var trailing: (back: CGPoint, rise: CGPoint, hang: CGFloat) {
        var back = CGPoint(x: -face.x, y: -face.y), rise = headUp
        let bowed = max(0, min(1, (pose.lean + pose.tilt - 1.0) / 0.4))
        let k = pose.floor != nil ? fallen : pose.roll == 0 ? bowed : 0
        guard k > 0 else { return (back, rise, 0) }
        let g = gravity
        func level(_ q: CGPoint) -> CGPoint {
            let along = q.x * g.x + q.y * g.y
            return CGPoint(x: q.x - g.x * along, y: q.y - g.y * along)
        }
        var flat = level(back)
        if hypot(flat.x, flat.y) < 0.2 { flat = level(CGPoint(x: -headUp.x, y: -headUp.y)) }
        let l = max(0.0001, hypot(flat.x, flat.y))
        back = unit(.zero, CGPoint(x: back.x + (flat.x / l - back.x) * k, y: back.y + (flat.y / l - back.y) * k))
        rise = unit(.zero, CGPoint(x: headUp.x + (-g.x - headUp.x) * k, y: headUp.y + (-g.y - headUp.y) * k))
        return (back, rise, k)
    }

    /// A ribbon streaming back from `root`: thin, tapering to a point, lifting as the figure moves. On a body thrown
    /// about it trails level from the head and hangs toward the ground, whichever way the head lies, and lies on the
    /// ground rather than through it.
    mutating func ribbon(_ root: CGPoint, length: CGFloat, width: CGFloat, droop: CGFloat, phase: CGFloat, _ paint: Paint) {
        let r = build.head * H
        let (back, rise, k) = trailing
        let lift = (pose.stream - 0.5) * r * 1.4 * (1 - 0.85 * k)
        let sway = r * 0.6 * sin((pose.wave + phase) * 2 * .pi)
        let reach = length * (0.8 + 0.3 * pose.stream)
        let tip = at(at(root, back, reach), rise, -droop * r * (1.2 - pose.stream) + lift + sway)
        let m = at(at(root, back, reach * 0.5), rise, -droop * r * 0.3 + lift * 0.5 - sway * 0.6)
        var path = Path()
        path.move(grounded(at(root, rise, width / 2)))
        path.quad(grounded(tip), control: grounded(at(m, rise, width / 2)))
        path.quad(grounded(at(root, rise, -width / 2)), control: grounded(at(m, rise, -width / 2)))
        path.close()
        pen.fill(path, paint)
    }

    /// What a figure wears on its head (on a body thrown about, lying on the ground rather than through it). A head
    /// struck off keeps all of it, just as it was.
    mutating func gear(_ c: CGPoint, _ r: CGFloat) {
        func p(_ f: CGFloat, _ u: CGFloat) -> CGPoint { grounded(at(at(c, face, f * r), headUp, u * r)) }
        let flutter = sin(pose.wave * 2 * .pi)
        switch build.gear {
        case .topknot:
            // The chonmage, swept back; the headband; two long ribbons.
            fill([p(-0.1, 0.9), p(-0.9, 1.3), p(-0.62, 0.72)], body)
            fill([p(-1.0, 0.2), p(0.95, 0.35), p(0.93, 0.62), p(-0.98, 0.52)], Paint(build.accent))
            ribbon(p(-0.95, 0.4), length: r * 4.4, width: r * 0.3, droop: 0.8, phase: 0, Paint(build.accent))
            ribbon(p(-0.95, 0.3), length: r * 3.5, width: r * 0.24, droop: 1.6, phase: 0.3, Paint(build.accent.scaled(0.78)))
        case .jingasa:
            // On a body lying down the wide hat is knocked flat, its brim along the ground, not stood on its edge.
            let k = fallen, g = gravity
            let hu = unit(.zero, CGPoint(x: headUp.x * (1 - k) - g.x * k, y: headUp.y * (1 - k) - g.y * k))
            var hf = CGPoint(x: hu.y, y: -hu.x)
            if hf.x * face.x + hf.y * face.y < 0 { hf = CGPoint(x: -hf.x, y: -hf.y) }
            func q(_ f: CGFloat, _ u: CGFloat) -> CGPoint { grounded(at(at(c, hf, f * r), hu, u * r)) }
            fill([q(-2.6, 0.35), q(2.6, 0.35), q(0.1, 1.25)], body)
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
            let (back, rise, hang) = trailing
            let tuft = at(at(c, back, 2.6 * r), rise, (-0.4 + 0.4 * flutter * (1 - hang)) * r)
            fill([p(-0.4, 0.8), grounded(tuft), p(-0.8, 0.2)], body)
            // Tied on at the nape, above where a blade through the neck goes, so a head struck off keeps it as it was.
            let neckPoint = at(c, headUp, -r * 0.95)
            ribbon(at(neckPoint, face, -r * 0.4), length: r * 5.2, width: r * 0.42, droop: 1.2, phase: 0.2, Paint(build.accent, 0.95))
        case .eboshi:
            fill([p(-0.9, 0.45), p(0.8, 0.55), p(0.1, 2.3), p(-0.5, 1.9)], body)
        case .kabuto:
            fill([p(-1.2, 0.2), p(-0.9, 1.05), p(0.2, 1.3), p(1.1, 0.75), p(1.15, 0.3)], body)
            fill([p(-0.9, 0.35), p(-2.2, -0.75), p(-1.6, -1.1), p(-0.5, -0.4)], body)
            fill([p(0.4, -0.2), p(1.15, -0.05), p(1.0, -0.9), p(0.3, -1.05)], body)
            let root = at(at(c, face, 0.55 * r), headUp, 1.05 * r)
            func q(_ f: CGFloat, _ u: CGFloat) -> CGPoint { grounded(at(at(root, face, f * r), headUp, u * r)) }
            var crest = Path()
            crest.move(grounded(root))
            crest.quad(q(1.5, 1.9), control: q(1.3, 0.2))
            crest.quad(q(0, 0.25), control: q(0.7, 0.5))
            crest.quad(q(-1.3, 1.9), control: q(-0.5, 0.5))
            crest.quad(grounded(root), control: q(-1.1, 0.2))
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
            path.move(grounded(at(mouth, n, 0.013 * H)))
            path.quad(grounded(at(at(mouth, d, length), n, 0.004 * H)), control: grounded(at(at(mouth, d, length * 0.55), n, -0.01 * H)))
            path.line(grounded(at(at(mouth, d, length), n, -0.01 * H)))
            path.quad(grounded(at(mouth, n, -0.013 * H)), control: grounded(at(at(mouth, d, length * 0.55), n, -0.03 * H)))
            path.close()
            pen.fill(path, shade)
        } else {
            // The mouth, bound in the sash's colour.
            fill([at(mouth, n, 0.016 * H), at(at(mouth, d, 0.05 * H), n, 0.015 * H), at(at(mouth, d, 0.05 * H), n, -0.015 * H),
                  at(mouth, n, -0.016 * H)], Paint(build.accent.scaled(0.6)))
        }
    }

    /// A slender, slightly curved blade: black spine, a bright cutting edge, a small guard and a wrapped grip.
    /// `visible` shortens it from the tip (a blade going into its scabbard); `grip`, how far the hilt shows behind the hand.
    mutating func blade(from hand: CGPoint, angle: CGFloat, length: CGFloat, width: CGFloat, gleam: CGFloat, visible: CGFloat = 1,
                        grip: CGFloat = 0.11, flat: CGFloat = 1) {
        let (d, scale) = bladeVector(angle, flat: flat)
        let n = CGPoint(x: -d.y, y: d.x)
        // Grip and guard.
        fill([at(hand, n, width * 0.55), at(at(hand, d, -grip * H), n, width * 0.45), at(at(hand, d, -grip * H), n, -width * 0.45),
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
            blade(from: hand, angle: pose.blade, length: 0.25 * H, width: 0.024 * H, gleam: 0.75, grip: 0.04)
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
            pen.stroke(string, Paint(RGB(0.38, 0.38, 0.42), 0.9), width: max(1, 0.006 * H))
        }
    }

    /// How tall the warlord's sashimono stands from its socket on his back, in figure heights: its flag clears his
    /// helmet but stays under the top of the lane.
    static let pole: CGFloat = 0.44

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
            // Slung across his back, standing off it; on a body lying down, it lies along his back and on the ground.
            let base = at(at(shoulder, across, -0.07 * H), up, -0.2 * H)
            let k = min(1, fallen * 1.5)
            let d = unit(.zero, CGPoint(x: -0.45 * (1 - k) + up.x * k, y: 0.9 * (1 - k) + up.y * k))
            let top = at(base, d, 0.26 * H)
            segment(base, top, 0.05 * H, 0.06 * H, 0.06 * H, body, bulge: 0, at: 0.5, lies: true)
            let side = CGPoint(x: -d.y, y: d.x)
            for i in 0..<3 {
                let root = at(top, side, (CGFloat(i) - 1) * 0.018 * H)
                pen.line(grounded(root), grounded(at(root, d, 0.06 * H)), Paint(RGB(0.85, 0.85, 0.8), 0.9), width: max(1, 0.01 * H))
            }
        case .banner:
            let base = at(at(shoulder, across, -0.08 * H), up, -0.1 * H)
            if pose.floor != nil {
                fallenBanner(base, flutter)
                break
            }
            let top = CGPoint(x: base.x - 0.03 * H, y: base.y + Drawer.pole * H)
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

    /// The sashimono on a body thrown about: the pole swinging from upright on his back to lying with its end on the
    /// ground as he goes down, never driven into it, and the flag furling (seen edge-on) as it comes to lie on the
    /// side away from the ground. Upright (as he stands the instant he is cut down), it is the banner he stood with.
    mutating func fallenBanner(_ base: CGPoint, _ flutter: CGFloat) {
        let k = fallen, g = gravity
        // As `backGear` stands it: the top a little behind the socket, the flag hanging plumb from it.
        let stood = CGPoint(x: -0.03, y: Drawer.pole), L = hypot(stood.x, stood.y) * H
        let upright = unit(.zero, stood)
        var level = CGPoint(x: up.x - g.x * (up.x * g.x + up.y * g.y), y: up.y - g.y * (up.x * g.x + up.y * g.y))
        let n = hypot(level.x, level.y)
        level = n > 0.05 ? CGPoint(x: level.x / n, y: level.y / n) : CGPoint(x: -face.x, y: -face.y)
        let height = max(0, min(L * 0.95, (pose.floor ?? 0) * H - ((base.x - hip.x) * g.x + (base.y - hip.y) * g.y)))
        let run = (L * L - height * height).squareRoot()
        let rest = CGPoint(x: (level.x * run + g.x * height) / L, y: (level.y * run + g.y * height) / L)
        let along = unit(.zero, CGPoint(x: upright.x * (1 - k) + rest.x * k, y: upright.y * (1 - k) + rest.y * k))
        let top = at(base, along, L)
        // The flag hangs plumb from the top of the pole while he stands, and comes to lie along the pole as he goes.
        let hang = unit(.zero, CGPoint(x: along.x * k, y: (1 - k) + along.y * k))
        var behind = CGPoint(x: -hang.y, y: hang.x)
        if k >= 1, behind.x * g.x + behind.y * g.y > 0 { behind = CGPoint(x: -behind.x, y: -behind.y) }
        let w = 1 - 0.8 * k
        func p(_ back: CGFloat, _ rise: CGFloat) -> CGPoint { grounded(at(at(top, behind, back * w * H), hang, rise * H)) }
        fill([grounded(at(base, behind, -0.008 * H)), grounded(at(top, behind, -0.006 * H)), grounded(at(top, behind, 0.006 * H)),
              grounded(at(base, behind, 0.008 * H))], body)
        let f = flutter * 0.025 * (1 - k)
        var flag = Path()
        flag.move(p(0, -0.02))
        flag.quad(p(0.18, -0.03 + f), control: p(0.09, -0.02 - f))
        flag.line(p(0.17, -0.36 + f))
        flag.line(p(0.085, -0.3))
        flag.line(p(0, -0.34))
        flag.close()
        pen.fill(flag, Paint(RGB(0.55, 0.05, 0.06)))
        let c = -0.16 + f * 0.5
        fill([p(0.09, c + 0.045), p(0.055, c), p(0.09, c - 0.045), p(0.125, c)], Paint(build.accent))
        fill([p(0.2, -0.008), p(-0.01, -0.008), p(-0.01, -0.022), p(0.2, -0.022)], body)
    }

    /// How far a yari's shaft runs ahead of the lead hand, before its head.
    static let spear: CGFloat = 0.52

    /// A thrust's trail: fine lines of steel streaming back past the blade above and below it, and a spark of light
    /// at the point.
    static func speedLines(origin: CGPoint, tip: CGPoint, H: CGFloat, strength: CGFloat) -> [Shape] {
        let blade = unit(origin, tip), n = CGPoint(x: -blade.y, y: blade.x)
        var out: [Shape] = []
        for (offset, back, length, alpha) in [(CGFloat(0.04), CGFloat(0.03), CGFloat(0.46), CGFloat(0.6)), (-0.045, 0.09, 0.36, 0.45),
                                              (0.085, 0.16, 0.24, 0.3)] {
            let head = at(at(tip, n, offset * H), blade, -back * H), tail = at(head, blade, -length * H)
            let w = 0.01 * H
            out.append(Shape(kind: .path(Path(polygon: [at(head, n, w / 2), at(head, blade, w * 1.5), at(head, n, -w / 2), tail])),
                             fill: Paint(Palette.steel, alpha * strength)))
        }
        let r = 0.03 * H
        out.append(Shape(kind: .path(Path(polygon: [at(tip, blade, r * 1.6), at(tip, n, r * 0.4), at(tip, blade, -r * 0.8), at(tip, n, -r * 0.4)])),
                         fill: Paint(.white, 0.85 * strength)))
        return out
    }
}
