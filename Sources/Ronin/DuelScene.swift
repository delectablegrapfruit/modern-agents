import AppKit
import SpriteKit
import RoninArt
import RoninCore

/// The lane, its header, the cards between stages, and the pill it folds into.
///
/// The left mouse button cuts left, the right one cuts right (so do ←/→, A/D and F/J once the panel has the keys).
/// Leaving the panel pauses at once; coming back takes a short, visible dwell before the fight resumes, so a pointer
/// crossing the panel on its way somewhere else costs nothing. A click resumes at once, without cutting.
///
/// The panel is small, so it says as much as it can without words: hearts (carried from stage to stage), the run's
/// score, pictograms for kills, time and combo, a warning marker over a foe about to strike, a sight line from a
/// drawing archer, a gourd over the foe whose medicine gives back a heart, a pale ward before a warlord on guard, his
/// bar in the header, and which mouse button cuts which way (on a new career's first card, after a cut the wrong way,
/// and under the lane if asked for) until you have cut both ways. What text there is is large, heavy, and on a dark
/// plate. A blow coming is never covered: the words slammed onto the lane and the combo go under the warning markers.
///
/// The dead stay where they fell for the whole stage, whatever is done to the panel (folded, resized, its menu used).
///
/// With Reduce Motion (the system's, or the menu's) the lane shakes and flashes far less, never punches in, and a
/// storm's lightning is a slow glow; the blood and the dead are as they always are.
///
/// The blood builds with the stage and is at its heaviest in bloodlust (`Gore`): more of it, thrown harder, pumping
/// longer, pooling wider, reaching the glass more often, and more men cut apart rather than felled whole. With Gore
/// turned off in the menu there is none at all (no blood on the lane, the ronin or the glass, nobody cut apart), and a
/// blow is felt in the freeze, the shake, the cut's mark and its sparks.
///
/// The figures stand in the setting's light (`Ambient`): drawn a little toward its darkest tone, flashed in its own
/// light, and leaving dark, see-through ghosts. The heavy ones (the oni, the warlord) shake the ground a little with
/// each step, a puff of dust where the foot comes down.
@MainActor
final class DuelScene: SKScene {
    enum HeaderHit { case none, drag, compact, close }

    static let headerHeight: CGFloat = 24
    static let pillSize = CGSize(width: 196, height: 28)
    /// Seconds the pointer must rest on the panel before the fight resumes.
    static let dwell = 0.3

    let session: GameSession
    /// Simulation seconds per real second (the self-test fast-forwards).
    var timeScale = 1.0
    private(set) var isCompact = false
    private(set) var isAwayPaused = true
    private(set) var isEngaging = false
    private var engageClock = 0.0
    private var hitStop = 0.0
    /// Multiplies time after a big moment and eases back to 1.
    private var slowmo = 1.0
    private var shakeAmount: CGFloat = 0
    private var clock = 0.0
    private var lastUpdate: TimeInterval?
    private var built = false
    private var shownFight: (stage: Int, seed: UInt64, mode: Mode)?
    private var shownSetting: Setting?
    /// The size and setting the lane was last laid out for: the scenery, the ronin and the dead are laid out afresh
    /// only when one of them changes (folding into the pill and back changes neither).
    private var laidOut: (size: CGSize, setting: Setting?)?
    private var shownCombo = 0
    private var shownHP = Tuning.heroHP
    private var lightning = 0.0
    /// Sides the player has cut down a foe on, until the buttons are learnt.
    private var hintSides = Set<Side>()
    private(set) var pointer: CGPoint?
    /// Calmer effects (`Settings.reduceMotion`), as of this frame.
    private var calm = false
    /// Gore turned on (`Settings.gore`), as of this frame.
    private var goreOn = true
    /// Blood the scene itself has spilt since launch (sprays, blots on the glass): with the carnage's, what the
    /// self-test counts to tell that with gore off there is none.
    private var shed = 0
    /// A heavy foot coming down: the lane bumped down this far (points at a 60-point ronin), springing back.
    private var bump: CGFloat = 0
    /// When (by the scene's clock) the ronin's blade gets to the blow he last swung: his swing carries on through a
    /// freeze until then, with the blow it brings.
    private var swingUntil = 0.0
    /// Foes held for a wounding blade still on its way, until when: whatever the blow sends them into starts then.
    private var heldUntil: [Int: Double] = [:]
    /// A cut bound on the warlord's blade (`followBind`): on whom, which way, whether it was parried (rather than
    /// glancing off a guard still rising), and where the ronin's feet are in the bind (points from his place); and the
    /// ronin's frame when last looked at, for the moments the blades meet and part.
    private struct Bind {
        let foe: Int
        let side: Side
        let parried: Bool
        let spot: CGFloat
    }
    private var bind: Bind?
    private var bindShown: Frame?
    /// How many times the blades have been drawn meeting in a bind (the self-test catches one).
    private(set) var clashesDrawn = 0

    private var field = CGRect(x: 0, y: 0, width: 420, height: 126)
    private var groundY: CGFloat = 20
    /// The ronin's height in points; everything on the lane scales from it.
    private var ronin: CGFloat = 60
    private var top: CGFloat { size.height - DuelScene.headerHeight }
    private var heroX: CGFloat { field.midX }
    /// How far above the ground the lane is clear for what is drawn over a foe's head: up to the header, which holds
    /// everything else (the warlord's bar included).
    private var headroom: CGFloat { top - groundY }
    private var look = Look.of(.crimsonDusk)
    /// How much blood there is now: the stage's, or bloodlust's, or none with gore turned off.
    private var gore: Gore { Gore.of(stage: session.fight.stage, bloodlust: session.fight.inBloodlust, on: goreOn) }
    /// Text scale: 1 on the medium panel.
    private var fs: CGFloat { max(0.85, min(1.25, field.height / 126)) }

    // Back to front.
    private let scenery = SKNode()
    private let flashSky = SKSpriteNode(color: .white, size: .zero)
    private let world = SKNode()
    private let figures = SKNode()
    private let fx = SKNode()
    private let hero = HeroSprite()
    private lazy var carnage = Carnage(trails: fx)
    /// A punch in toward a blow: the lane scaled up about a point, easing back.
    private var zoom: CGFloat = 1
    private var zoomFocus = CGPoint.zero
    private var foeSprites: [Int: FoeSprite] = [:]
    private var arrowSprites: [Int: ArrowSprite] = [:]
    private var reachMarks: [SKShapeNode] = []
    private var weather: SKEmitterNode?
    private var farWeather: SKEmitterNode?
    private let rage = SKSpriteNode(texture: Art.edge)
    private let wound = SKSpriteNode(color: .white, size: .zero)
    /// On the last heart, the dark closing in on each beat of it.
    private let dread = SKSpriteNode(texture: Art.edge)
    private let vignette = SKSpriteNode(texture: Art.vignette)
    /// The words slammed onto the lane (BLOODLUST, 25 HITS, WARLORD, CLEARED): over the fight, under the combo and
    /// every warning marker. One at a time.
    private let slams = SKNode()
    private weak var slamNode: SKNode?
    private let hud = SKNode()
    private let comboBack = SKSpriteNode(texture: Art.glow)
    private let comboLabel = Art.label(Art.headingFont, size: 28, color: .white)
    private let comboShadow = Art.label(Art.headingFont, size: 28, color: SKColor(white: 0, alpha: 0.7))
    private let comboTimes = Art.label(Art.italicFont, size: 13, color: Palette.gold.color(), align: .left)
    private let bossNode = SKNode()
    private let bossTrack = SKShapeNode()
    private let bossFill = SKSpriteNode(color: Palette.gold.color(), size: .zero)
    /// The warlord's bar as last laid out (its length and whether it sits between the hearts and the score), and
    /// whether this fight's has room there: once it has, it keeps it unless the score grows right into it.
    private var bossShape: (width: CGFloat, roomy: Bool)?
    private var bossRoomy: Bool?
    /// Where in the header the warlord's bar may begin: past the last heart, with room for his crest.
    private var bossLeft: CGFloat = 0
    /// Room kept for the score beside the warlord's bar, so it does not jump about as the score grows.
    private lazy var scoreRoom: CGFloat = {
        let probe = Art.label(Art.headingFont, size: 13, color: .white)
        probe.text = "888,888"
        return probe.frame.width
    }()
    private let overlay = SKNode()
    private var banner: SKNode?
    private var bannerShownAt = 0.0
    /// The stage's title card while it is up, and the text scale it was built at (it follows the panel's size).
    private weak var introCard: SKNode?
    private var introFs: CGFloat = 1
    private var hint: SKNode?
    /// The last heart beating in the header.
    private var heartBeating = false
    private let curtain = SKSpriteNode(color: .black, size: .zero)
    private let curtainIcon = Icons.pause(22, SKColor(white: 1, alpha: 0.85))
    private let engageRing = SKShapeNode()

    private let header = SKNode()
    private let headerBar = SKSpriteNode(color: Palette.header.color(), size: .zero)
    private var modeGlyph = SKNode()
    private let titleLabel = Art.label(Art.headingFont, size: 12.5, color: Palette.ink.color(), align: .left)
    private let scoreLabel = Art.label(Art.headingFont, size: 13, color: Palette.gold.mix(.white, 0.35).color(), align: .right)
    private let compactButton = SKShapeNode()
    private let closeButton = SKShapeNode()
    private var hearts: [SKShapeNode] = []
    private var endlessGlyph = SKNode()

    private let pill = SKNode()
    private var pillGlyph = SKNode()
    private let pillLabel = Art.label(Art.headingFont, size: 12, color: Palette.ink.color(), align: .left)
    private var pillHearts: [SKShapeNode] = []
    private let pillValue = Art.label(Art.textFont, size: 11.5, color: Palette.ink.color(0.85), align: .right)

    init(session: GameSession, size: CGSize) {
        self.session = session
        super.init(size: size)
        scaleMode = .resizeFill
        backgroundColor = Palette.background.color()
        anchorPoint = .zero
    }

    required init?(coder aDecoder: NSCoder) { nil }

    // MARK: Building

    override func didMove(to view: SKView) {
        guard !built else { return }
        built = true
        Figures.preload()
        // What the ronin may show before his first draw (a blow taken, a winded breath, the fall), so the first of
        // them in a fight costs nothing.
        HeroSprite.preload()
        calm = Settings.reduceMotion
        goreOn = Settings.gore
        build()
        loadFight(intro: true)
    }

    private func build() {
        scenery.zPosition = -100
        addChild(scenery)
        flashSky.anchorPoint = .zero
        flashSky.alpha = 0
        flashSky.blendMode = .add
        flashSky.zPosition = -40
        addChild(flashSky)

        addChild(world)
        figures.zPosition = 10
        fx.zPosition = 20
        world.addChild(figures)
        world.addChild(fx)
        carnage.stains.zPosition = 3
        carnage.corpses.zPosition = 4
        world.addChild(carnage.stains)
        world.addChild(carnage.corpses)
        hero.zPosition = 5
        figures.addChild(hero)
        for _ in 0..<2 {
            let mark = SKShapeNode()
            mark.lineWidth = 2
            mark.lineCap = .round
            mark.lineJoin = .round
            // Over the carpet of the dead (and the blood), which would otherwise bury them late in a stage; under the
            // ronin himself.
            mark.zPosition = 14.9
            world.addChild(mark)
            reachMarks.append(mark)
        }

        rage.zPosition = 40
        rage.color = Palette.blood.color()
        rage.colorBlendFactor = 1
        rage.alpha = 0
        addChild(rage)
        wound.anchorPoint = .zero
        wound.color = Palette.blood.color()
        wound.alpha = 0
        wound.zPosition = 41
        addChild(wound)
        // A dark, all but black red: danger, not the bright red of bloodlust.
        dread.color = Palette.blood.mix(.black, 0.8).color()
        dread.colorBlendFactor = 1
        dread.alpha = 0
        dread.zPosition = 44
        addChild(dread)
        vignette.zPosition = 45
        vignette.alpha = 0.8
        addChild(vignette)
        slams.zPosition = 46
        addChild(slams)

        hud.zPosition = 50
        addChild(hud)
        comboBack.color = .black
        comboBack.colorBlendFactor = 1
        comboBack.alpha = 0.65
        comboBack.zPosition = -2
        comboShadow.zPosition = -1
        for node in [comboBack, comboShadow, comboLabel, comboTimes] as [SKNode] { hud.addChild(node) }
        bossTrack.fillColor = SKColor(white: 1, alpha: 0.08)
        bossTrack.strokeColor = Palette.gold.color(0.5)
        bossTrack.lineWidth = 1
        bossFill.anchorPoint = CGPoint(x: 0, y: 0.5)
        bossFill.zPosition = 0.1
        bossNode.addChild(bossTrack)
        bossNode.addChild(bossFill)
        let crest = Icons.crest(14)
        crest.name = "crest"
        bossNode.addChild(crest)
        // Where on his bar he calls for help: at three quarters, a half and a quarter.
        for k in 1...3 {
            let tick = SKSpriteNode(color: SKColor(white: 1, alpha: 0.55), size: CGSize(width: 1, height: 9))
            tick.name = "tick\(k)"
            tick.zPosition = 0.2
            bossNode.addChild(tick)
        }
        bossNode.isHidden = true

        overlay.zPosition = 60
        addChild(overlay)
        curtain.zPosition = 70
        curtain.alpha = 0.55
        curtain.anchorPoint = .zero
        curtainIcon.zPosition = 71
        engageRing.zPosition = 72
        engageRing.strokeColor = Palette.ink.color()
        engageRing.lineWidth = 2.5
        engageRing.lineCap = .round
        for node in [curtain, curtainIcon, engageRing] as [SKNode] {
            node.isHidden = true
            addChild(node)
        }

        header.zPosition = 80
        addChild(header)
        headerBar.anchorPoint = .zero
        header.addChild(headerBar)
        for node in [titleLabel, scoreLabel] as [SKNode] { header.addChild(node) }
        for (button, glyph) in [(compactButton, "minus"), (closeButton, "close")] {
            button.path = Art.circle(7)
            button.fillColor = SKColor(white: 1, alpha: 0.1)
            button.strokeColor = .clear
            let mark = SKShapeNode()
            let path = CGMutablePath()
            if glyph == "minus" {
                path.move(to: CGPoint(x: -3, y: 0))
                path.addLine(to: CGPoint(x: 3, y: 0))
            } else {
                path.move(to: CGPoint(x: -2.5, y: -2.5))
                path.addLine(to: CGPoint(x: 2.5, y: 2.5))
                path.move(to: CGPoint(x: -2.5, y: 2.5))
                path.addLine(to: CGPoint(x: 2.5, y: -2.5))
            }
            mark.path = path
            mark.strokeColor = SKColor(white: 1, alpha: 0.7)
            mark.lineWidth = 1.5
            mark.lineCap = .round
            button.addChild(mark)
            header.addChild(button)
        }
        // The warlord's bar lives in the header, out of the fighters' way: over the header's own plate.
        bossNode.zPosition = 1
        header.addChild(bossNode)
        for _ in 0..<(Mode.allCases.map(\.hearts).max() ?? Mode.shoshin.hearts) {
            let heart = Icons.heart(11)
            header.addChild(heart)
            hearts.append(heart)
            let small = Icons.heart(9)
            pill.addChild(small)
            pillHearts.append(small)
        }

        pill.zPosition = 90
        pill.isHidden = true
        addChild(pill)
        for node in [pillLabel, pillValue] as [SKNode] { pill.addChild(node) }
    }

    /// Puts the session's fight on the lane: fresh sprites, the stage's scenery, and (for a new stage) its title card.
    func loadFight(intro: Bool) {
        let fight = session.fight
        shownFight = (fight.stage, fight.seed, fight.mode)
        // Every foe on the lane, the one struck dead a moment ago and still frozen white for a blade that will now
        // never land included.
        for case let sprite as FoeSprite in figures.children { sprite.removeFromParent() }
        for sprite in arrowSprites.values { sprite.removeFromParent() }
        foeSprites = [:]
        arrowSprites = [:]
        gourdSpots = [:]
        heldUntil = [:]
        bind = nil
        fx.removeAllChildren()
        overlay.removeAllChildren()
        overlay.removeAllActions()
        slams.removeAllChildren()
        slams.removeAllActions()
        impacts.removeAll()
        // A new stage: the only thing that sweeps the lane of the dead.
        carnage.reset(field: field, groundY: groundY, ronin: ronin, heroX: heroX)
        banner = nil
        world.speed = 1
        slowmo = 1
        hitStop = 0
        swingUntil = 0
        bossRoomy = nil
        shownCombo = fight.combo
        shownHP = fight.hp
        let untouched = fight.stats.cuts + fight.stats.whiffs + fight.stats.deflects + fight.stats.parried == 0
        hero.reset(sheathed: untouched && fight.outcome == nil)
        hero.face(fight.facing)
        if fight.setting != shownSetting {
            shownSetting = fight.setting
            look = Look.of(fight.setting)
            // The ronin and the dead in its light (the foes take it up as they arrive).
            hero.ambient = look.ambient
            carnage.ambient = look.ambient
            layout()
        }
        Art.track(titleLabel, "STAGE \(fight.stage)", 1.6)
        modeGlyph.removeFromParent()
        modeGlyph = Icons.seal(fight.mode, 15)
        header.addChild(modeGlyph)
        endlessGlyph.removeFromParent()
        endlessGlyph = session.career.isEndless ? Icons.infinity(13, Palette.gold.color()) : SKNode()
        header.addChild(endlessGlyph)
        pillGlyph.removeFromParent()
        pillGlyph = Icons.seal(fight.mode, 14)
        pill.addChild(pillGlyph)
        layoutHeader()
        layoutPill()
        sync(0)
        if let outcome = fight.outcome {
            hero.finish(victory: outcome == .victory)
            showBanner(outcome)
        } else if intro, fight.time < 1 {
            introduce(fight)
        }
        showHintIfNeeded()
    }

    /// The stage's title card: its number, the mode and the setting, and a line on each thing to learn here: which
    /// mouse button cuts which way (the very first time), any new kind of foe with a word on beating it (the warlord's
    /// guard too), and on the first stage the gourd-bearer. It follows the panel if it is resized while it is up.
    private func introduce(_ fight: Fight) {
        let card = SKNode()
        var lines: [(icon: SKNode, text: String?)] = []
        if session.career.kills == 0, !Settings.hintShown, !Settings.floorHints {
            lines.append((Icons.buttons(15 * fs, Palette.ink.color(), Palette.gold.color()), nil))
        }
        let newcomer = Difficulty.introduces(fight.stage)
        if let kind = newcomer {
            let icon: SKNode
            if kind == .warlord {
                icon = Icons.crest(16 * fs)
            } else {
                // On the dark plate the silhouette is drawn light, in the gold of the tip.
                let figure = SKSpriteNode()
                Figures.apply(figure, .foe(kind), .idle(0), ronin: 20 * fs)
                Art.setTint(figure, Palette.gold, 1)
                figure.position = CGPoint(x: 0, y: -9 * fs)
                let lit = SKNode()
                lit.addChild(figure)
                icon = lit
            }
            lines.append((icon, DuelScene.tip(kind)))
        } else if fight.stage == 1, fight.bearerIndex != nil {
            // Every stage holds a gourd, and this is where it is first met: he keeps out of reach, and each cut must
            // catch him darting in.
            lines.append((Icons.gourd(15 * fs, Palette.jade.mix(.white, 0.25).color()), "CATCH HIM DARTING IN, TWICE — A HEART"))
        }
        let tall: CGFloat = (50 + 18 * CGFloat(lines.count)) * fs
        // (Under everything on it: the panel draws by depth alone.)
        let plate = Icons.band(CGSize(width: min(field.width, 340 * fs), height: tall))
        plate.zPosition = -0.1
        card.addChild(plate)
        let top = tall / 2
        let title = Art.label(Art.headingFont, size: 23 * fs, color: .white)
        Art.track(title, "STAGE \(fight.stage)", 5 * fs)
        title.position = CGPoint(x: 0, y: top - 16 * fs)
        card.addChild(title)
        if session.career.isEndless {
            let glyph = Icons.infinity(18 * fs, Palette.gold.color())
            glyph.position = CGPoint(x: -title.frame.width / 2 - 16 * fs, y: title.position.y)
            card.addChild(glyph)
        }
        let sub = Art.label(Art.textFont, size: 10.5 * fs, color: Palette.ink.color(0.85))
        Art.track(sub, fight.mode.title.uppercased() + "   ·   " + fight.setting.name.uppercased(), 2 * fs)
        sub.position = CGPoint(x: 9 * fs, y: top - 34 * fs)
        card.addChild(sub)
        let glyph = Icons.seal(fight.mode, 13 * fs)
        glyph.position = CGPoint(x: sub.position.x - sub.frame.width / 2 - 12 * fs, y: sub.position.y)
        card.addChild(glyph)
        for (k, line) in lines.enumerated() {
            let row = SKNode()
            row.position = CGPoint(x: 0, y: top - (54 + 18 * CGFloat(k)) * fs)
            if let text = line.text {
                let tip = Art.label(Art.italicFont, size: 11 * fs, color: Palette.gold.color())
                Art.track(tip, text, 1.2 * fs)
                tip.horizontalAlignmentMode = .left
                let width = tip.frame.width + 26 * fs
                line.icon.position = CGPoint(x: -width / 2 + 8 * fs, y: 0)
                tip.position = CGPoint(x: -width / 2 + 22 * fs, y: 0)
                row.addChild(tip)
            }
            row.addChild(line.icon)
            card.addChild(row)
        }
        if newcomer == nil, fight.difficulty.boss {
            let crest = Icons.crest(14 * fs)
            crest.position = CGPoint(x: 0, y: -top - 4 * fs)
            card.addChild(crest)
        }
        // The card animates inside a holder that the layout can move and scale to a new panel size.
        let holder = SKNode()
        holder.position = CGPoint(x: field.midX, y: field.minY + field.height * 0.6)
        holder.addChild(card)
        overlay.addChild(holder)
        introCard = holder
        introFs = fs
        card.alpha = 0
        card.setScale(1.12)
        let hold = 1.1 + 0.8 * Double(lines.count)
        card.run(.sequence([
            .group([.fadeIn(withDuration: 0.18), .scale(to: 1, duration: 0.22)]).easedOut(),
            .wait(forDuration: hold),
            .group([.fadeOut(withDuration: 0.3), .scale(to: 0.96, duration: 0.3)]),
        ]))
        holder.run(.sequence([.wait(forDuration: 0.22 + hold + 0.3), .removeFromParent()]))
    }

    static func tip(_ kind: Kind) -> String {
        switch kind {
        case .grunt: return "ONE CUT"
        case .runner: return "FAST — ONE CUT"
        case .brute: return "THREE CUTS"
        case .archer: return "CUT THE ARROW BACK"
        case .dancer: return "LEAPS OVER YOU"
        case .warlord: return "A WARLORD — WAIT OUT HIS GUARD"
        }
    }

    /// A mouse with the button for `side` lit and an arrow pointing that way, on a dark plate: that button cuts that
    /// way.
    private func mouseHint(_ side: Side) -> SKNode {
        let node = SKNode()
        node.addChild(Icons.band(CGSize(width: 56 * fs, height: 28 * fs), alpha: 0.75))
        let icon = Icons.mouse(20 * fs, lit: side, Palette.ink.color())
        icon.position = CGPoint(x: -side.sign.cg * 7 * fs, y: 0)
        node.addChild(icon)
        let arrow = Icons.play(10 * fs, Palette.gold.color())
        arrow.xScale = side == .left ? -1 : 1
        arrow.position = CGPoint(x: side.sign.cg * 11 * fs, y: 0)
        node.addChild(arrow)
        return node
    }

    /// With Floor Hints on, until you have cut down a foe on each side: a mouse on each side of the lane, the button
    /// for that side lit.
    private func showHintIfNeeded() {
        hint?.removeFromParent()
        hint = nil
        guard Settings.floorHints, !Settings.hintShown, session.fight.outcome == nil else { return }
        hintSides = []
        let node = SKNode()
        node.zPosition = 55
        for side in Side.allCases {
            let mouse = mouseHint(side)
            mouse.name = side == .left ? "left" : "right"
            mouse.position = CGPoint(x: laneX(side.sign * 0.62), y: groundY + ronin * 0.2)
            mouse.run(.repeatForever(.sequence([.fadeAlpha(to: 0.45, duration: 0.8), .fadeAlpha(to: 1, duration: 0.8)])))
            node.addChild(mouse)
        }
        addChild(node)
        hint = node
    }

    /// Floor Hints turned on or off: the mice under the lane come or go at once (the reach marks follow on the next
    /// frame), and the fight and its dead are left as they are.
    func refreshHints() {
        guard built else { return }
        showHintIfNeeded()
        hint?.isHidden = isCompact
        refreshHUD()
    }

    /// A cut the wrong way, with a foe in reach on the other side, before the buttons are learnt (and with no mice on
    /// the floor to show them): the mouse for the other side flashed up under the lane there.
    private func teach(_ side: Side) {
        overlay.childNode(withName: "teach")?.removeFromParent()
        let mouse = mouseHint(side)
        mouse.name = "teach"
        mouse.position = CGPoint(x: laneX(side.sign * 0.62), y: groundY + ronin * 0.2)
        mouse.alpha = 0
        overlay.addChild(mouse)
        mouse.run(.sequence([.fadeIn(withDuration: 0.12), .wait(forDuration: 1.3), .fadeOut(withDuration: 0.3), .removeFromParent()]))
    }

    /// A foe cut down on `side`. Once there has been one each way the buttons are learnt, and the mice (if up) go.
    private func noteKill(_ side: Side) {
        guard !Settings.hintShown else { return }
        hintSides.insert(side)
        hint?.childNode(withName: side == .left ? "left" : "right")?.run(.sequence([.fadeOut(withDuration: 0.3), .removeFromParent()]))
        guard hintSides.count == 2 else { return }
        Settings.hintShown = true
        hint?.run(.sequence([.wait(forDuration: 0.3), .removeFromParent()]))
        hint = nil
    }

    // MARK: Layout

    override func didChangeSize(_ oldSize: CGSize) {
        guard built else { return }
        layout()
    }

    func laneX(_ x: Double) -> CGFloat { field.midX + CGFloat(x) * field.width / 2 }

    /// Where the scene draws a lane position, at the height of a figure's middle.
    func point(lane x: Double) -> CGPoint { CGPoint(x: laneX(x), y: groundY + ronin * 0.5) }

    /// The lane in a scene `size` big: the field under the header, the ground line, and the ronin's height. He is
    /// drawn `Tuning.figure` lane units tall (a lane unit is half the lane's width), the height every weapon's reach
    /// is measured against; the panel's shape makes that 0.52 of the field's height.
    static func lane(in size: CGSize) -> (field: CGRect, groundY: CGFloat, ronin: CGFloat) {
        let field = CGRect(x: 0, y: 0, width: size.width, height: max(40, size.height - headerHeight))
        return (field, field.minY + field.height * 0.16, CGFloat(Tuning.figure) * field.width / 2)
    }

    /// Lays the lane out for the scene's size, or the pill. Only a new size (or setting) paints the scenery afresh
    /// and moves the ronin; the dead, their blood and the fight are kept through any layout, scaled with the lane
    /// when its size changes, so folding into the pill and back, or choosing another size, leaves them lying there.
    private func layout() {
        // A pass at the pill's size while unfolded is the window caught mid-fold: the next, at the real size, lays
        // the lane out.
        guard built, isCompact || size.height > DuelScene.pillSize.height else { return }
        let w = size.width
        pill.isHidden = !isCompact
        for node in [scenery, world, hud, slams, overlay, header, dread, vignette, rage, wound, flashSky] as [SKNode] {
            node.isHidden = isCompact
        }
        weather?.isHidden = isCompact
        farWeather?.isHidden = isCompact
        hint?.isHidden = isCompact
        if isCompact {
            layoutPill()
            refreshCurtain()
            return
        }
        let lane = DuelScene.lane(in: size)
        field = lane.field
        groundY = lane.groundY
        ronin = lane.ronin
        let resized = laidOut?.size != size
        if resized || laidOut?.setting != shownSetting { buildScenery() }
        // (Nothing, unless the lane's size changed: then the dead and their blood are scaled with it.)
        carnage.relayout(field: field, groundY: groundY, ronin: ronin, heroX: heroX)
        if resized {
            hero.layout(ronin: ronin, home: CGPoint(x: heroX, y: groundY))
            for sprite in foeSprites.values { sprite.layout(ronin: ronin, headroom: headroom) }
            // The floor mice (if up) follow the lane.
            for side in Side.allCases {
                hint?.childNode(withName: side == .left ? "left" : "right")?.position = CGPoint(x: laneX(side.sign * 0.62), y: groundY + ronin * 0.2)
            }
        }
        laidOut = (size, shownSetting)
        vignette.size = CGSize(width: w * 1.25, height: field.height * 1.6)
        vignette.position = CGPoint(x: field.midX, y: field.midY)
        rage.size = vignette.size
        rage.position = vignette.position
        // (Sized at rest: a sprite's size is its scaled one, and the heartbeat scales this one.)
        dread.setScale(1)
        dread.size = vignette.size
        dread.position = vignette.position
        wound.size = field.size
        flashSky.size = field.size
        banner?.position = CGPoint(x: field.midX, y: field.midY)
        if let card = introCard, card.parent != nil {
            card.position = CGPoint(x: field.midX, y: field.minY + field.height * 0.6)
            card.setScale(fs / introFs)
        }

        // Reach marks: a tick on the ground with a chevron pointing out along the lane.
        for (k, mark) in reachMarks.enumerated() {
            let s: CGFloat = k == 0 ? -1 : 1
            let path = CGMutablePath()
            path.move(to: CGPoint(x: 0, y: -4))
            path.addLine(to: CGPoint(x: 0, y: 5))
            path.move(to: CGPoint(x: s * 3, y: 3))
            path.addLine(to: CGPoint(x: s * 6, y: 0))
            path.addLine(to: CGPoint(x: s * 3, y: -3))
            mark.path = path
            mark.position = CGPoint(x: laneX(Double(s) * session.fight.reach), y: groundY - 6)
        }

        headerBar.size = CGSize(width: w, height: DuelScene.headerHeight)
        headerBar.position = CGPoint(x: 0, y: top)
        closeButton.position = CGPoint(x: w - 14, y: top + DuelScene.headerHeight / 2 + 1.5)
        compactButton.position = CGPoint(x: w - 33, y: top + DuelScene.headerHeight / 2 + 1.5)
        layoutHeader()

        comboLabel.fontSize = 26 * fs
        comboShadow.fontSize = 26 * fs
        comboTimes.fontSize = 13 * fs
        refreshHUD(force: true)
        refreshCurtain()
    }

    private func layoutHeader() {
        let mid = top + DuelScene.headerHeight / 2 + 1.5
        modeGlyph.position = CGPoint(x: 15, y: mid)
        titleLabel.position = CGPoint(x: 29, y: mid - 0.5)
        var heartsX = 29 + max(titleLabel.frame.width, 62) + 12
        if session.career.isEndless {
            endlessGlyph.position = CGPoint(x: heartsX + 2, y: mid)
            heartsX += 20
        }
        for (k, heart) in hearts.enumerated() { heart.position = CGPoint(x: heartsX + CGFloat(k) * 9, y: mid) }
        scoreLabel.position = CGPoint(x: size.width - 48, y: mid)
        // The warlord's bar begins past the last heart there is, with room for his crest before it.
        let shown = max(1, min(session.fight.maxHP, hearts.count))
        bossLeft = heartsX + CGFloat(shown - 1) * 9 + 6 + 22
        bossShape = nil
        bossRoomy = nil
    }

    private func layoutPill() {
        let h = size.height
        pillGlyph.position = CGPoint(x: 15, y: h / 2)
        pillLabel.position = CGPoint(x: 28, y: h / 2)
        for (k, heart) in pillHearts.enumerated() { heart.position = CGPoint(x: 100 + CGFloat(k) * 7.5, y: h / 2) }
        pillValue.position = CGPoint(x: size.width - 12, y: h / 2)
        refreshPill()
    }

    /// Paints the setting: sky, sun, hills, landmarks, ground, weather. Everything behind the fight stays a step
    /// lighter than the figures, so the figures are always the darkest, sharpest shapes on the panel.
    private func buildScenery() {
        scenery.removeAllChildren()
        weather?.removeFromParent()
        let w = field.width, h = field.height
        let sky = SKSpriteNode(texture: Art.gradient(look.top, look.horizon))
        sky.anchorPoint = .zero
        sky.size = field.size
        scenery.addChild(sky)

        let r = h * look.sunSize
        let sunCentre = CGPoint(x: field.midX, y: groundY + h * look.sunHeight)
        let halo = SKSpriteNode(texture: Art.glow)
        halo.size = CGSize(width: r * 5.5, height: r * 5.5)
        halo.color = look.sun.color()
        halo.colorBlendFactor = 1
        halo.blendMode = .add
        halo.alpha = 0.5
        halo.position = sunCentre
        halo.zPosition = 1
        halo.run(.repeatForever(.sequence([.fadeAlpha(to: 0.38, duration: 2.5), .fadeAlpha(to: 0.55, duration: 2.5)])))
        scenery.addChild(halo)
        let disc = SKSpriteNode(texture: Art.dot)
        disc.size = CGSize(width: r * 2, height: r * 2)
        disc.color = look.sun.color()
        disc.colorBlendFactor = 1
        disc.position = sunCentre
        disc.zPosition = 2
        scenery.addChild(disc)

        let far = SKShapeNode(path: Art.ridge(width: w, base: groundY, low: h * 0.1, high: h * 0.34,
                                              seed: UInt64(shownSetting?.rawValue ?? 0) &+ 11, jag: 6))
        far.fillColor = look.far.mix(look.horizon, 0.35).color()
        far.strokeColor = .clear
        far.zPosition = 3
        scenery.addChild(far)
        let mist = SKSpriteNode(texture: Art.glow)
        mist.size = CGSize(width: w * 1.6, height: h * 0.45)
        mist.position = CGPoint(x: field.midX, y: groundY + h * 0.06)
        mist.color = look.horizon.color()
        mist.colorBlendFactor = 1
        mist.blendMode = .add
        mist.alpha = 0.4
        mist.zPosition = 4
        scenery.addChild(mist)
        let near = SKShapeNode(path: Art.ridge(width: w, base: groundY, low: h * 0.03, high: h * 0.12, seed: 0xFA11 &+ UInt64(w), jag: 10))
        near.fillColor = look.near.mix(look.far, 0.35).color()
        near.strokeColor = .clear
        near.zPosition = 5
        scenery.addChild(near)
        let landmark = SKShapeNode(path: Art.landmark(look.landmark, width: w, height: h, ground: groundY, seed: 0x7EA))
        landmark.fillColor = look.near.mix(look.far, 0.2).color()
        landmark.strokeColor = .clear
        landmark.zPosition = 6
        scenery.addChild(landmark)
        if look.landmark == .village {
            for x in [0.05, 0.16, 0.84, 0.95] as [CGFloat] {
                let fire = SKSpriteNode(texture: Art.glow)
                fire.size = CGSize(width: h * 0.7, height: h * 0.6)
                fire.position = CGPoint(x: w * x, y: groundY + h * 0.35)
                fire.color = RGB(1, 0.45, 0.1).color()
                fire.colorBlendFactor = 1
                fire.blendMode = .add
                fire.alpha = 0.5
                fire.zPosition = 7
                let period = Double.random(in: 0.12...0.25)
                fire.run(.repeatForever(.sequence([.fadeAlpha(to: 0.3, duration: period), .fadeAlpha(to: 0.6, duration: period * 1.3)])))
                scenery.addChild(fire)
            }
        }
        // The ground: lit where it meets the horizon, dark toward the bottom edge.
        let ground = SKSpriteNode(texture: Art.gradient(look.ground.mix(look.horizon, 0.28), look.ground))
        ground.size = CGSize(width: w, height: groundY)
        ground.anchorPoint = .zero
        ground.zPosition = 8
        scenery.addChild(ground)
        let edge = SKSpriteNode(color: look.horizon.color(0.6), size: CGSize(width: w, height: 1))
        edge.anchorPoint = .zero
        edge.position = CGPoint(x: 0, y: groundY)
        edge.zPosition = 9
        scenery.addChild(edge)

        let sky2 = Art.weather(look.weather, size: field.size, tint: look.horizon)
        sky2.zPosition = 30
        addChild(sky2)
        weather = sky2
        // The same weather further off, behind the fighters, and behind the ground and its horizon line too (over the
        // landmarks and the village fires): what falls far off comes down behind the horizon, and far embers rise from
        // behind it, never across the ground at the fighters' feet.
        let distant = Art.weather(look.weather, size: field.size, tint: look.horizon, far: true, horizon: groundY)
        distant.zPosition = 7.5
        distant.isHidden = isCompact
        scenery.addChild(distant)
        farWeather = distant
    }

    // MARK: Modes

    func setCompact(_ on: Bool) {
        isCompact = on
        if on { setAway(true) }
        layout()
    }

    /// Called as the pointer leaves or returns (or the panel hides or folds). Leaving pauses at once; returning starts
    /// the dwell, or resumes at once when `instant`.
    func setAway(_ away: Bool, instant: Bool = false) {
        if away {
            isEngaging = false
            if !isAwayPaused {
                isAwayPaused = true
                session.save()
            }
        } else if isAwayPaused {
            if instant { engage() } else if !isEngaging {
                isEngaging = true
                engageClock = 0
            }
        }
        refreshCurtain()
    }

    private func engage() {
        isEngaging = false
        isAwayPaused = false
        lastUpdate = nil
        refreshCurtain()
    }

    private func refreshCurtain() {
        // What plays over the lane (a stage's card, the words slammed onto it, a blow's marks) holds with the fight:
        // a card that comes up while the pointer is away (from the menu, or at launch) is read in full on coming back.
        // A finished stage's own card and what leads to it run on.
        let still = isAwayPaused && session.fight.outcome == nil
        overlay.speed = still ? 0 : 1
        slams.speed = overlay.speed
        let show = isAwayPaused && !isCompact && session.fight.outcome == nil
        curtain.isHidden = !show
        curtainIcon.isHidden = !show || isEngaging
        if !show || !isEngaging { engageRing.isHidden = true }
        guard show else { return }
        curtain.size = CGSize(width: size.width, height: top)
        curtainIcon.position = CGPoint(x: size.width / 2, y: top / 2)
    }

    // MARK: The loop

    override func update(_ currentTime: TimeInterval) {
        let dt = lastUpdate.map { min(0.1, max(0, currentTime - $0)) } ?? 0
        lastUpdate = currentTime
        clock += dt
        guard !isCompact else { return }
        calm = Settings.reduceMotion
        // Gore taken up at once, by whatever happens next: the dead still bleeding, the blood on the ronin.
        goreOn = Settings.gore
        carnage.gore = gore
        hero.gore = goreOn
        let fight = session.fight
        if let shown = shownFight, shown.stage != fight.stage || shown.seed != fight.seed || shown.mode != fight.mode {
            loadFight(intro: true)
        }
        if isEngaging {
            engageClock += dt
            if engageClock >= DuelScene.dwell { engage() } else { drawEngageRing() }
        }
        var advanced = false
        if !isAwayPaused, session.fight.outcome == nil {
            if hitStop > 0 {
                hitStop = max(0, hitStop - dt)
            } else {
                slowmo = min(1, slowmo + dt * 1.8)
                for event in session.advance(dt * timeScale * slowmo) { handle(event) }
                advanced = true
            }
            storm(dt)
        } else if session.fight.outcome != nil, hitStop > 0 {
            // The fight is over, but the freeze on its last blow (or on the ronin's last wound) still runs out, so the
            // dead fall, the heads and weapons land and the stumps stop pumping under the card. (Before the blows
            // still on their way land, so one landing now keeps its whole freeze.)
            hitStop = max(0, hitStop - dt)
        }
        while let next = impacts.first, clock >= next.at {
            impacts.removeFirst()
            next.run()
        }
        if world.speed < 1 { world.speed = min(1, world.speed + CGFloat(dt) * 0.9) }
        if !isAwayPaused || session.fight.outcome != nil { carnage.update(hitStop > 0 ? 0 : dt * Double(world.speed), real: dt) }
        shakeWorld(dt)
        // Between steps (hit-stop, a pause) every figure holds its frame; but the ronin's swing carries on until its
        // blade gets to the blow (which lands then, by the scene's clock), and only then holds with everything else.
        let step = advanced || session.fight.outcome != nil ? dt : 0
        sync(step, hero: step > 0 ? dt : max(0, min(dt, swingUntil - (clock - dt))))
    }

    private func drawEngageRing() {
        guard let pointer else { return }
        let path = CGMutablePath()
        let t = CGFloat(engageClock / DuelScene.dwell)
        path.addArc(center: pointer, radius: 12, startAngle: .pi / 2, endAngle: .pi / 2 - t * 2 * .pi, clockwise: true)
        engageRing.path = path
        engageRing.isHidden = false
        refreshCurtain()
    }

    private func storm(_ dt: Double) {
        guard look.weather == .rain else { return }
        lightning -= dt
        if lightning <= 0 {
            lightning = Double.random(in: 4...9)
            flashSky.removeAllActions()
            if calm {
                // A slow glow over the sky, not a double strike.
                flashSky.run(.sequence([.fadeAlpha(to: 0.12, duration: 0.25), .fadeOut(withDuration: 0.9)]))
            } else {
                flashSky.run(.sequence([
                    .fadeAlpha(to: 0.35, duration: 0.03), .fadeAlpha(to: 0.05, duration: 0.08),
                    .fadeAlpha(to: 0.25, duration: 0.03), .fadeOut(withDuration: 0.4),
                ]))
            }
        }
    }

    private func shakeWorld(_ dt: Double) {
        var offset = CGPoint.zero
        if shakeAmount > 0.05 {
            let a = shakeAmount * ronin / 60
            offset = CGPoint(x: .random(in: -a...a), y: .random(in: -a...a))
            shakeAmount *= CGFloat(pow(0.002, dt))
        } else {
            shakeAmount = 0
        }
        if bump > 0.02 {
            offset.y -= bump * ronin / 60
            bump *= CGFloat(pow(0.0002, dt))
        } else {
            bump = 0
        }
        zoom = zoom > 1.0005 ? 1 + (zoom - 1) * CGFloat(pow(0.0006, dt)) : 1
        world.setScale(zoom)
        world.position = CGPoint(x: offset.x + (1 - zoom) * zoomFocus.x, y: offset.y + (1 - zoom) * zoomFocus.y)
    }

    /// Shakes the lane (with Reduce Motion, barely).
    private func shake(_ amount: CGFloat) { shakeAmount = max(shakeAmount, calm ? amount * 0.15 : amount) }

    /// A heavy foot set down at `x`: a puff of dust off the ground there and, but for Reduce Motion, a thump through
    /// the lane (the lane dipped and sprung back), far less than a blow's shake and less still the further off it is.
    private func footfall(_ sprite: FoeSprite, at x: CGFloat) {
        let boss = sprite.kind == .warlord
        let size = ronin * (boss ? 0.09 : 0.08)
        let dust = Art.burst(look.ground.mix(look.horizon, 0.3).mix(.white, 0.25), count: boss ? 10 : 8, speed: ronin * 0.42, size: size,
                             life: 0.42, spread: 2.2, angle: .pi / 2, gravity: ronin * 0.6, additive: false)
        dust.particleAlpha = 0.55
        dust.particleAlphaSpeed = -0.55 / 0.42
        fx.addChild(at(CGPoint(x: x, y: groundY + 1), dust))
        guard !calm else { return }
        let near = 1 - min(1, abs(x - heroX) / (field.width / 2))
        bump = max(bump, (boss ? 0.9 : 0.7) * (0.35 + 0.65 * near))
    }

    /// A flash of the whole lane (a wound, the warlord's arrival) in `color` (blood, unless given), fading over `fade`
    /// seconds; with Reduce Motion, soft and slow.
    private func flashLane(_ alpha: CGFloat, fade: TimeInterval, color: RGB = Palette.blood) {
        wound.removeAllActions()
        wound.color = color.color()
        wound.alpha = calm ? min(alpha, 0.22) : alpha
        wound.run(.fadeOut(withDuration: calm ? max(fade, 0.6) : fade))
    }

    /// An impact frame: focus lines snapping in around a point and gone, with a flash at its heart. The lines reach
    /// about `size` across; `pastEdges` draws them for this one blow instead, crisp, closing in from past every edge
    /// of the lane (the warlord's death). With Reduce Motion they are small and faint.
    private func focus(at point: CGPoint, size: CGFloat, color: RGB, alpha: CGFloat, pastEdges: Bool = false) {
        let across = calm ? min(size, ronin * 4) : size
        let lines: SKNode
        if pastEdges, !calm {
            let corners = [CGPoint(x: field.minX, y: field.minY), CGPoint(x: field.maxX, y: field.minY),
                           CGPoint(x: field.minX, y: field.maxY), CGPoint(x: field.maxX, y: field.maxY)]
            let reach = (corners.map { hypot($0.x - point.x, $0.y - point.y) }.max() ?? field.width) + ronin * 0.4
            lines = Art.focusLines(hole: ronin * 0.5, reach: reach, width: 3, color: color)
        } else {
            let texture = SKSpriteNode(texture: Art.focus)
            texture.size = CGSize(width: across, height: across)
            texture.color = color.color()
            texture.colorBlendFactor = 1
            lines = texture
        }
        lines.position = point
        lines.zRotation = CGFloat.random(in: 0...(2 * .pi))
        lines.alpha = calm ? min(alpha, 0.3) : alpha
        // Over the fight, the vignette and the words slammed onto the lane, under the combo (overlay 60 - 13 = 47).
        lines.zPosition = -13
        lines.setScale(1.25)
        lines.run(.sequence([.scale(to: 1, duration: 0.05), .wait(forDuration: 0.06), .group([.fadeOut(withDuration: 0.12), .scale(to: 0.9, duration: 0.12)]),
                             .removeFromParent()]))
        overlay.addChild(lines)
        fx.addChild(at(point, Art.flash(.white, size: min(across, ronin * 5.5) * 0.35, duration: 0.14, alpha: lines.alpha * 0.8)))
    }

    /// A punch in toward a blow (none with Reduce Motion).
    private func punch(_ amount: CGFloat, at point: CGPoint) {
        guard !calm, 1 + amount >= zoom else { return }
        zoom = 1 + amount
        zoomFocus = point
    }

    /// Blood thrown against the glass: blots that run and fade, `count` of them at full gore (more and bigger as it
    /// builds, and running longer; none with it off). `side` keeps them to that half. Over the whole fight, but under
    /// the combo and the warning markers: blood on the glass never hides a blow coming.
    private func splatter(_ count: Int, side: Side? = nil) {
        let gore = self.gore
        let count = gore.count(count)
        shed += count
        for _ in 0..<count {
            let splat = SKSpriteNode(texture: Art.splats.randomElement())
            let s = ronin * CGFloat.random(in: 0.45...1.0) * gore.size
            splat.size = CGSize(width: s, height: s)
            let x: CGFloat
            switch side {
            case .left?: x = CGFloat.random(in: 0.03...0.42)
            case .right?: x = CGFloat.random(in: 0.58...0.97)
            case nil: x = CGFloat.random(in: 0.04...0.96)
            }
            splat.position = CGPoint(x: x * size.width, y: CGFloat.random(in: 0.3...0.92) * top)
            splat.zRotation = CGFloat.random(in: -0.35...0.35)
            splat.color = Palette.blood.mix(.black, 0.4).color()
            splat.colorBlendFactor = 1
            splat.alpha = 0.88
            splat.setScale(0.55)
            // (Overlay 60 - 12.5 = 47.5: over the impact lines, under the combo's haze at 48.)
            splat.zPosition = -12.5
            overlay.addChild(splat)
            let run = 1.6 * Double(gore.span)
            splat.run(.sequence([
                .scale(to: 1, duration: 0.05),
                .wait(forDuration: 0.6 * Double(gore.span)),
                .group([.moveBy(x: 0, y: -ronin * 0.3 * gore.span, duration: run), .fadeOut(withDuration: run)]),
                .removeFromParent(),
            ]))
        }
    }

    /// Makes the sprites match the fight, `dt` on: the foes and arrows by it, the ronin by `heroDT` (the same, unless
    /// his swing is running on through a freeze).
    private func sync(_ dt: Double, hero heroDT: Double? = nil) {
        let fight = session.fight
        // (A warlord bound on the ronin's blade is kept in step with him before he is drawn, and again once the ronin
        // has moved on a frame, so the two bind and part on the same frame.)
        followBind()
        var live = Set<Int>()
        for foe in fight.foes where foe.alive {
            live.insert(foe.id)
            let sprite: FoeSprite
            if let existing = foeSprites[foe.id] {
                sprite = existing
            } else {
                sprite = FoeSprite(foe: foe, ronin: ronin, headroom: headroom, ambient: look.ambient)
                figures.addChild(sprite)
                foeSprites[foe.id] = sprite
            }
            // The warlord over his men; a gourd-bearer waiting his moment a step behind the line, so the men who pass
            // him walk in front of him.
            sprite.zPosition = foe.kind == .warlord ? 4 : foe.bearer && foe.phase == .advancing && !foe.darting ? 2.5 : 3
            // A leap's arc; the gourd-bearer's spring back out of reach is a short hop off his heels.
            let air = foe.phase == .leaping ? CGFloat(sin(foe.progress * .pi)) * ronin * (foe.bearer ? FoeSprite.hop : 0.95) : 0
            // The heavy ones' steps are felt.
            if let step = sprite.update(foe, at: CGPoint(x: laneX(foe.x), y: groundY), air: air, hero: heroX, dt: dt),
               foe.kind == .brute || foe.kind == .warlord {
                footfall(sprite, at: step)
            }
        }
        for (id, sprite) in foeSprites where !live.contains(id) {
            sprite.removeFromParent()
            foeSprites[id] = nil
        }
        var flying = Set<Int>()
        for arrow in fight.arrows {
            flying.insert(arrow.id)
            let sprite: ArrowSprite
            if let existing = arrowSprites[arrow.id] {
                sprite = existing
            } else {
                sprite = ArrowSprite(arrow: arrow, ronin: ronin)
                sprite.zPosition = 6
                figures.addChild(sprite)
                arrowSprites[arrow.id] = sprite
            }
            sprite.update(arrow, at: CGPoint(x: laneX(arrow.x), y: groundY + ronin * 0.6))
        }
        for (id, sprite) in arrowSprites where !flying.contains(id) {
            sprite.removeFromParent()
            arrowSprites[id] = nil
        }
        // Down to his last hearts, the ronin's guard sags and heaves; on the last, worse.
        hero.strain = HeroSprite.strain(hp: fight.hp, of: fight.maxHP)
        hero.update(dt: heroDT ?? dt, bloodlust: fight.inBloodlust)
        followBind()
        refreshHUD()
    }

    private func refreshHUD(force: Bool = false) {
        let fight = session.fight
        if isCompact {
            refreshPill()
            return
        }
        // The reach marks (a floor hint) light up when a cut to that side would land.
        for (k, mark) in reachMarks.enumerated() {
            mark.isHidden = !Settings.floorHints
            let side: Side = k == 0 ? .left : .right
            mark.position.x = laneX(side.sign * fight.reach)
            let live = fight.outcome == nil && fight.target(side) != nil
            mark.strokeColor = live ? (fight.inBloodlust ? Palette.blood : look.accent).mix(.white, 0.35).color() : SKColor(white: 1, alpha: 0.3)
            mark.glowWidth = live ? 2.5 : 0
        }

        // The combo: a big number and its multiplier, on a dark haze; when it breaks, the old number falls apart.
        if fight.combo != shownCombo || force {
            if fight.combo > shownCombo, fight.combo >= 3 {
                comboLabel.removeAction(forKey: "pop")
                comboLabel.setScale(1.35)
                comboLabel.run(SKAction.scale(to: 1, duration: 0.14).easedOut(), withKey: "pop")
            }
            if fight.combo == 0, shownCombo >= 5, !comboLabel.isHidden { shatterCombo() }
            shownCombo = fight.combo
            comboLabel.text = "\(fight.combo)"
            comboShadow.text = comboLabel.text
            comboLabel.fontColor = fight.inBloodlust ? Palette.blood.mix(.white, 0.3).color() : fight.combo >= 10 ? Palette.gold.color() : .white
            comboTimes.text = "×\(fight.multiplier)"
            comboTimes.fontColor = fight.inBloodlust ? Palette.blood.mix(.white, 0.3).color() : Palette.gold.color()
        }
        let showCombo = fight.combo >= 3 && fight.outcome == nil
        for node in [comboLabel, comboShadow] as [SKNode] { node.isHidden = !showCombo }
        // Over a word slammed onto the lane the number needs no haze of its own (the word's plate is dark), and the
        // haze would darken the word.
        comboBack.isHidden = !showCombo || slamNode != nil
        // The multiplier only once it multiplies.
        comboTimes.isHidden = !showCombo || fight.multiplier < 2
        let boss = fight.boss
        // Lower while the warlord is on the lane, clear of the warning marker over his head.
        let comboY = top - (boss != nil ? 34 : 24) * fs
        comboLabel.position = CGPoint(x: field.midX, y: comboY)
        comboShadow.position = CGPoint(x: field.midX + 1.5, y: comboY - 1.5)
        comboTimes.position = CGPoint(x: field.midX + comboLabel.frame.width / 2 + 4, y: comboY - 3 * fs)
        comboBack.size = CGSize(width: 130 * fs, height: 56 * fs)
        comboBack.position = CGPoint(x: field.midX, y: comboY)

        bossNode.isHidden = boss == nil
        if let boss { layoutBossBar(boss) }

        // Bloodlust turns the lane's edge red. The last heart has a sign of its own, and a darker one: the dark closing
        // in on each beat of it, and the heart itself beating in the header (held steady with Reduce Motion).
        let rageTarget: CGFloat = fight.inBloodlust && fight.outcome == nil ? (calm ? 0.5 : 0.5 + 0.15 * CGFloat(sin(clock * 6))) : 0
        rage.alpha += (rageTarget - rage.alpha) * 0.2
        let lastHeart = fight.hp == 1 && fight.outcome == nil
        var beat: CGFloat = 0
        if lastHeart {
            // Lub-dub.
            let lub = CGFloat(max(0, sin(clock * 7))), dub = CGFloat(max(0, sin(clock * 7 - 0.9)))
            beat = calm ? 0.5 : pow(lub, 6) + 0.6 * pow(dub, 6)
        }
        dread.alpha += ((lastHeart ? 0.25 + 0.5 * beat : 0) - dread.alpha) * 0.3
        dread.setScale(1 - 0.08 * beat)
        if lastHeart, let heart = hearts.first {
            heart.setScale(1 + 0.3 * beat)
        } else if heartBeating {
            hearts.first?.setScale(1)
        }
        heartBeating = lastHeart

        if fight.hp != shownHP || force {
            if fight.hp < shownHP {
                for k in fight.hp..<min(shownHP, hearts.count) {
                    hearts[k].run(.sequence([.scale(to: 1.9, duration: 0.06), .scale(to: 1, duration: 0.2)]))
                }
            } else if fight.hp > shownHP, !force {
                for k in shownHP..<min(fight.hp, hearts.count) {
                    hearts[k].run(.sequence([.wait(forDuration: 0.35), .scale(to: 2.2, duration: 0.08), .scale(to: 1, duration: 0.3)]))
                }
            }
            shownHP = fight.hp
        }
        for (k, heart) in hearts.enumerated() {
            heart.isHidden = k >= fight.maxHP
            let full = k < fight.hp
            heart.fillColor = full ? Palette.blood.color() : .clear
            heart.strokeColor = full ? Palette.blood.mix(.white, 0.35).color() : SKColor(white: 1, alpha: 0.3)
        }
        // The run's score: every stage of it so far, this one included.
        let score = DuelScene.grouped(session.runScore)
        if scoreLabel.text != score { scoreLabel.text = score }
    }

    /// The warlord's bar, in the header, never over the fighters: between the hearts and the score behind his crest,
    /// or where that leaves too little room (a small panel, many hearts, a long score) a fine rule along the header's
    /// foot. Each of his three calls for help is marked on it until he makes it.
    private func layoutBossBar(_ boss: Foe) {
        let right = scoreLabel.position.x - max(scoreLabel.frame.width, scoreRoom) - 10
        let room = right - bossLeft
        let roomy = bossRoomy.map { $0 && room >= 30 } ?? (room >= 60)
        bossRoomy = roomy
        let width = roomy ? min(200, room) : size.width - 24
        let tall: CGFloat = roomy ? 7 : 4
        if bossShape?.width != width || bossShape?.roomy != roomy {
            bossShape = (width, roomy)
            bossNode.position = roomy ? CGPoint(x: bossLeft + room / 2, y: top + DuelScene.headerHeight / 2 + 1.5)
                : CGPoint(x: size.width / 2, y: top + 3)
            bossTrack.path = CGPath(roundedRect: CGRect(x: -width / 2, y: -tall / 2, width: width, height: tall),
                                    cornerWidth: tall / 2, cornerHeight: tall / 2, transform: nil)
            let crest = bossNode.childNode(withName: "crest")
            crest?.isHidden = !roomy
            crest?.position = CGPoint(x: -width / 2 - 12, y: 1)
        }
        let whole = CGFloat(max(1, boss.maxHP))
        bossFill.size = CGSize(width: max(0, (width - 2) * CGFloat(boss.hp) / whole), height: tall - 2)
        bossFill.position = CGPoint(x: -width / 2 + 1, y: 0)
        // (The same thresholds the fight calls them at: three quarters, a half and a quarter of his cuts.)
        let calls = [boss.maxHP * 3 / 4, boss.maxHP / 2, boss.maxHP / 4]
        for (k, call) in calls.enumerated() {
            guard let tick = bossNode.childNode(withName: "tick\(k + 1)") as? SKSpriteNode else { continue }
            tick.size = CGSize(width: 1, height: roomy ? 9 : 6)
            tick.position = CGPoint(x: -width / 2 + 1 + (width - 2) * CGFloat(call) / whole, y: 0)
            tick.isHidden = boss.summons > k
        }
    }

    private func shatterCombo() {
        let text = comboLabel.text ?? ""
        for (k, piece) in text.enumerated() {
            let shard = Art.label(Art.headingFont, size: comboLabel.fontSize, color: SKColor(white: 0.7, alpha: 1))
            shard.text = String(piece)
            let offset = (CGFloat(k) - CGFloat(text.count - 1) / 2) * comboLabel.fontSize * 0.5
            shard.position = CGPoint(x: comboLabel.position.x + offset, y: comboLabel.position.y)
            overlay.addChild(shard)
            let drift = offset * 0.6 + .random(in: -6...6)
            let fall = SKAction.moveBy(x: drift, y: -ronin * 0.7, duration: 0.55)
            fall.timingMode = .easeIn
            shard.run(.sequence([
                .group([fall, .rotate(byAngle: .random(in: -1.2...1.2), duration: 0.55), .fadeOut(withDuration: 0.55)]),
                .removeFromParent(),
            ]))
        }
    }

    private func refreshPill() {
        let fight = session.fight
        Art.track(pillLabel, (session.career.isEndless ? "∞ " : "STAGE ") + "\(fight.stage)", 1.2)
        for (k, heart) in pillHearts.enumerated() {
            heart.isHidden = k >= fight.maxHP
            let full = k < fight.hp
            heart.fillColor = full ? Palette.blood.color() : .clear
            heart.strokeColor = full ? .clear : SKColor(white: 1, alpha: 0.35)
        }
        switch fight.outcome {
        case .victory?: pillValue.text = "WON"
        case .defeat?: pillValue.text = "FELL"
        case nil: pillValue.text = DuelScene.brief(session.runScore)
        }
    }

    static func grouped(_ n: Int) -> String {
        let digits = String(n)
        var out = ""
        for (k, c) in digits.enumerated() {
            if k > 0, (digits.count - k) % 3 == 0 { out.append(",") }
            out.append(c)
        }
        return out
    }

    /// A score short enough for the pill beside seven hearts: 12,345, then 123K, then 1.2M.
    static func brief(_ n: Int) -> String {
        if n < 100_000 { return grouped(n) }
        if n < 10_000_000 { return "\(n / 1000)K" }
        return String(format: "%.1fM", Double(n) / 1_000_000)
    }

    // MARK: Events

    private func handle(_ event: FightEvent) {
        let fight = session.fight
        // Whatever the ronin does next (another cut, a blow taken) ends a clash he was bound in.
        switch event {
        case .cut, .whiff, .deflected, .parried, .wounded: letGoOfBind()
        default: break
        }
        switch event {
        case .cut(let side, let id, let killed):
            guard let sprite = foeSprites[id] else { return }
            let distance = abs(sprite.position.x - heroX)
            let style = chooseCut(sprite.kind, distance: distance)
            let target = CGPoint(x: sprite.position.x, y: groundY + sprite.height * DuelScene.height(of: style))
            if style == .nukitsuke { drawFlash(side) }
            hero.cut(side, style, distance: distance)
            dash(to: sprite.position.x, side: side)
            // The blow lands when the drawn blade gets there, a few frames on: the hit, the gore and the freeze wait
            // for it, and so does he.
            let delay = HeroSprite.impact(style)
            swingUntil = clock + delay
            if killed {
                // Struck dead where he stands: the lane forgets him, his figure holds, frozen white in one of the poses
                // a blow throws a man into (the very pose his body falls from), until the blade arrives and he comes
                // apart.
                foeSprites[id] = nil
                if sprite.gourd != nil {
                    gourdSpots[id] = CGPoint(x: sprite.position.x, y: sprite.position.y + sprite.height * 1.12)
                    sprite.dropGourd()
                }
                let variant = Int.random(in: 0..<Figures.variants)
                sprite.freezeStruck(Figures.struck(sprite.cast, variant: variant))
                noteKill(side)
                later(delay) { [self] in
                    // He parts where the cut goes through him, and the cut's mark is drawn across him there.
                    let gash = sever(sprite, side: side, style: style, variant: variant)
                    slash(at: CGPoint(x: target.x, y: gash.y), side: side, style: style, strong: true)
                    // The draw that opens a stage gets its own impact frame.
                    if style == .nukitsuke { focus(at: gash, size: ronin * 2.8, color: .white, alpha: 0.5) }
                }
            } else {
                // A wound: he is held as he stands until the blade gets there, and only then sent reeling (or leaping,
                // or springing back out of reach) as the fight already has him.
                sprite.hold(delay)
                heldUntil[id] = clock + delay
                later(delay) { [self] in
                    // A wound, not a kill: he reels, opened up along the cut, blood spraying out the far side (with
                    // gore off, sparks off the blade instead).
                    slash(at: target, side: side, style: style, strong: false)
                    sprite.flashHit()
                    sprite.showStagger()
                    let gore = self.gore
                    carnage.gore = gore
                    let away: CGFloat = side == .right ? 0.35 : .pi - 0.35
                    if gore.on {
                        sprite.gash(DuelScene.slope(of: style), at: DuelScene.height(of: style), gore: gore)
                        spray(Palette.blood, at: target, count: 22, speed: 2.2, size: 0.07, life: 0.45, spread: 1.0, angle: away, gravity: 5)
                        carnage.spatter(around: sprite.position.x, count: 4)
                    }
                    if sprite.kind == .brute || sprite.kind == .warlord || !gore.on {
                        fx.addChild(at(target, Art.burst(Palette.steel, count: 12, speed: ronin * 2.4, size: ronin * 0.07, life: 0.22,
                                                          spread: 1.3, angle: side == .right ? 0 : .pi)))
                    }
                    hitStop = max(hitStop, 0.05)
                    shake(1.8)
                    punch(0.018, at: target)
                }
            }
        case .whiff(let side):
            hero.whiff(side, for: fight.stumble)
            let arc = SKSpriteNode(texture: Art.crescent)
            arc.size = CGSize(width: ronin * 0.8, height: ronin * 0.8)
            arc.position = CGPoint(x: heroX + side.sign.cg * ronin * 0.42, y: groundY + ronin * 0.5)
            arc.xScale = side == .right ? 1 : -1
            arc.alpha = 0.35
            arc.color = SKColor(white: 0.7, alpha: 1)
            arc.colorBlendFactor = 1
            arc.run(.sequence([.group([.fadeOut(withDuration: 0.25), .scale(by: 1.1, duration: 0.25)]), .removeFromParent()]))
            fx.addChild(arc)
            fx.addChild(at(CGPoint(x: heroX + side.sign.cg * ronin * 0.2, y: groundY + 2),
                           Art.burst(look.ground.mix(.white, 0.4), count: 10, speed: ronin * 0.5, size: ronin * 0.1, life: 0.4,
                                     spread: 0.8, angle: .pi / 2, additive: false)))
            // A grey ✕ over his head: nothing was there (wait for him to close).
            let miss = Icons.cross(ronin * 0.2, SKColor(white: 0.85, alpha: 1))
            miss.position = CGPoint(x: heroX, y: groundY + ronin * 1.2)
            miss.setScale(0.4)
            overlay.addChild(miss)
            miss.run(.sequence([.scale(to: 1, duration: 0.08), .wait(forDuration: 0.25),
                                .group([.fadeOut(withDuration: 0.25), .moveBy(x: 0, y: 6, duration: 0.25)]), .removeFromParent()]))
            // The wrong way, with a foe in reach the other way: which button cuts that way.
            if !Settings.floorHints, !Settings.hintShown, fight.target(side.opposite) != nil { teach(side.opposite) }
        case .deflected(let side, let id):
            let p = arrowSprites[id]?.position ?? CGPoint(x: heroX + side.sign.cg * ronin * 0.5, y: groundY + ronin * 0.6)
            let style = chooseCut(nil, distance: abs(p.x - heroX))
            if style == .nukitsuke { drawFlash(side) }
            // The arrow is met the instant it is cut: the swing starts with the blade at its mark, where the arrow
            // bursts gold.
            hero.cut(side, style, distance: abs(p.x - heroX), from: 4)
            swingUntil = clock
            slash(at: p, side: side, style: style, strong: false)
            fx.addChild(at(p, Art.burst(Palette.gold, count: 24, speed: ronin * 2.6, size: ronin * 0.09, life: 0.35)))
            fx.addChild(at(p, Art.shockwave(Palette.gold, radius: ronin * 0.12, grow: 3, width: 2, duration: 0.3)))
            hitStop = max(hitStop, 0.05)
            shake(1)
            if let sprite = arrowSprites[id], let arrow = fight.arrows.first(where: { $0.id == id }) { sprite.update(arrow, at: p) }
        case .loosed(let archer, _):
            foeSprites[archer]?.showStrike()
        case .pierced(let id, let arrowID, let killed):
            let p = arrowSprites[arrowID]?.position
            arrowSprites[arrowID]?.removeFromParent()
            arrowSprites[arrowID] = nil
            guard let sprite = foeSprites[id] else { return }
            let side: Side = sprite.position.x < heroX ? .left : .right
            if let p {
                fx.addChild(at(p, Art.burst(Palette.gold, count: 22, speed: ronin * 2, size: ronin * 0.09, life: 0.3)))
                fx.addChild(at(p, Art.shockwave(Palette.gold, radius: ronin * 0.1, grow: 3.5, width: 2, duration: 0.3)))
            }
            if killed {
                sever(sprite, side: side, style: nil)
                noteKill(side)
            } else {
                sprite.flashHit()
                sprite.showStagger()
            }
        case .raised:
            break
        case .guarded:
            // The warlord starts to raise his guard: his figure shows it coming up, faint (a cut now only glances off),
            // and rings as it sets.
            break
        case .parried(let side, let id):
            let parried = fight.isStumbling
            guard let sprite = foeSprites[id] else {
                if parried { hero.repel(side, for: fight.stumble) }
                return
            }
            // The cut is carried on into his blade and stops dead on it in the bind, the ronin stood where the two
            // blades meet (`Figure.clashGap` from him), the warlord holding his guard for it. Parried (the guard was
            // set), the ronin is then forced off the blade and backs off out of reach, the warlord shoving it off on
            // the same beat; glancing off a guard still rising, the clash is lighter and the ronin only draws back out
            // of it. The moments the blades meet and part are drawn as the ronin's frames reach them (`followBind`).
            let x = sprite.standing
            let style = chooseCut(sprite.kind, distance: abs(x - heroX), guarded: true)
            if style == .nukitsuke { drawFlash(side) }
            let spot = x - side.sign.cg * Figure.clashGap() * ronin - heroX
            let timing = hero.clash(side, style, at: spot, for: fight.stumble, forced: parried)
            // His swing carries on through the freeze on the bind until his feet are set in it.
            swingUntil = clock + timing.impact + timing.settle
            bind = Bind(foe: id, side: side, parried: parried, spot: spot)
            bindShown = hero.drawnFrame
            sprite.bind(.block)
            if let mine = Figure.contact(.hero, .clash(0)) { dash(to: heroX + spot + side.sign.cg * mine.x * ronin, side: side) }
        case .summoned(let id, _):
            // A roar, and men come running in from both ends of the lane.
            if let sprite = foeSprites[id] {
                fx.addChild(at(CGPoint(x: sprite.position.x, y: groundY + sprite.height * 0.6),
                               Art.shockwave(Palette.blood, radius: ronin * 0.2, grow: 6, width: 3, duration: 0.5)))
            }
            for x in [field.minX, field.maxX] {
                let edge = SKSpriteNode(texture: Art.glow)
                edge.size = CGSize(width: ronin * 1.4, height: field.height * 1.4)
                edge.position = CGPoint(x: x, y: field.midY)
                edge.color = Palette.blood.color()
                edge.colorBlendFactor = 1
                edge.blendMode = .add
                edge.alpha = 0
                edge.run(.sequence([.fadeAlpha(to: calm ? 0.22 : 0.6, duration: calm ? 0.25 : 0.08), .fadeOut(withDuration: 0.7),
                                    .removeFromParent()]))
                fx.addChild(edge)
            }
            shake(3)
        case .healed(let id, let restored):
            heal(id, restored: restored)
        case .fled(let id):
            // He got away with it: the gourd, crossed out, where he left the lane.
            if let sprite = foeSprites[id] {
                let x = min(max(sprite.position.x, field.minX + ronin * 0.3), field.maxX - ronin * 0.3)
                let lost = SKNode()
                lost.addChild(Icons.gourd(max(10, ronin * 0.2), Palette.jade.mix(.black, 0.3).color()))
                lost.addChild(Icons.cross(max(12, ronin * 0.26), Palette.blood.mix(.white, 0.2).color()))
                lost.position = CGPoint(x: x, y: groundY + ronin * 1.05)
                overlay.addChild(lost)
                lost.run(.sequence([.wait(forDuration: 0.6), .group([.fadeOut(withDuration: 0.5), .moveBy(x: 0, y: 8, duration: 0.5)]),
                                    .removeFromParent()]))
            }
        case .wounded(let foe, let damage):
            // Who dealt it: the foe, or the arrow that has just left the lane (its sprite not yet swept away, and used
            // up here, so a second arrow in the same moment finds its own).
            var fromX = foe.flatMap { foeSprites[$0]?.position.x }
            if fromX == nil, let hit = arrowSprites.values.first(where: { sprite in
                !sprite.deflected && !fight.arrows.contains { $0.id == sprite.id }
            }) {
                fromX = hit.position.x
                hit.removeFromParent()
                arrowSprites[hit.id] = nil
            }
            let attacker: Side? = fromX.map { $0 < heroX ? .left : .right }
            // Where he was struck, before the blow drives him back from it.
            let p = CGPoint(x: hero.standing, y: groundY + ronin * 0.55)
            // How hurt he is now, so the reel is chosen for the hearts he has left; turned to face the blow, so it
            // drives him away from whoever dealt it.
            hero.strain = HeroSprite.strain(hp: fight.hp, of: fight.maxHP)
            hero.hurt(from: attacker)
            if let foe { foeSprites[foe]?.showStrike() }
            let gore = self.gore
            carnage.gore = gore
            // The blood sprays away from the blow, and the lane flashes red with it; with gore off, sparks off the
            // blade that struck him, and a pale flash.
            let from: CGFloat = attacker == .left ? 0.2 : .pi - 0.2
            if gore.on {
                flashLane(damage > 1 ? 0.55 : 0.42, fade: 0.45)
                spray(Palette.blood, at: p, count: 30 + 12 * damage, speed: 2.2, size: 0.08, life: 0.55, spread: 1.6, angle: from, gravity: 5)
                carnage.spatter(around: p.x, count: 8)
                splatter(damage > 1 ? 3 : 2)
            } else {
                flashLane(damage > 1 ? 0.26 : 0.2, fade: 0.35, color: Palette.ink)
                fx.addChild(at(p, Art.burst(Palette.steel, count: 14 + 6 * damage, speed: ronin * 2.4, size: ronin * 0.07, life: 0.24,
                                            spread: 1.4, angle: from)))
            }
            focus(at: p, size: ronin * 3, color: gore.on ? Palette.blood.mix(.white, 0.2) : .white, alpha: 0.55)
            shake(3.5 + CGFloat(damage) * 1.5)
            punch(0.05, at: p)
            hitStop = max(hitStop, 0.08)
            slowmo = min(slowmo, 0.4)
        case .leapt(let id):
            // Off the ground in a cloud of dust; sent leaping by a wound, not until the blade lands (he is held till
            // then).
            let dust: @MainActor () -> Void = { [self] in
                guard let sprite = foeSprites[id] else { return }
                fx.addChild(at(CGPoint(x: sprite.position.x, y: groundY + 2),
                               Art.burst(look.ground.mix(.white, 0.35), count: 12, speed: ronin * 0.8, size: ronin * 0.1, life: 0.35,
                                         spread: 1.2, angle: .pi / 2, additive: false)))
            }
            let wait = (heldUntil[id] ?? 0) - clock
            if wait > 0 { later(wait, dust) } else { dust() }
        case .landed(let id):
            if let sprite = foeSprites[id] {
                fx.addChild(at(CGPoint(x: sprite.position.x, y: groundY + 2),
                               Art.burst(look.ground.mix(.white, 0.35), count: 14, speed: ronin * 0.9, size: ronin * 0.1, life: 0.35,
                                         spread: 1.4, angle: .pi / 2, additive: false)))
                if sprite.kind == .warlord { shake(2) }
            }
        case .bloodlust(let on):
            if on {
                // (A red light enough to read on its dark plate.)
                slam("BLOODLUST", color: Palette.blood.mix(.white, 0.45), hold: 0.5)
                fx.addChild(at(CGPoint(x: hero.standing, y: groundY + ronin * 0.5),
                               Art.shockwave(Palette.blood, radius: ronin * 0.3, grow: 5, width: 3, duration: 0.5)))
                shake(2.5)
            }
        case .milestone(let n):
            slam("\(n) HITS", color: Palette.gold, icon: Icons.swords(18 * fs, Palette.gold.color()), hold: 0.5)
            slowmo = 0.3
            world.speed = 0.4
            fx.addChild(at(CGPoint(x: hero.standing, y: groundY + ronin * 0.5),
                           Art.shockwave(Palette.gold, radius: ronin * 0.3, grow: 6, width: 2.5, duration: 0.6)))
        case .warlord:
            slam("WARLORD", color: Palette.gold, icon: Icons.crest(20 * fs))
            shake(4)
            flashLane(0.25, fade: 0.8)
        case .arrived:
            break
        case .ended(let outcome):
            finish(outcome)
        }
    }

    private func at<T: SKNode>(_ position: CGPoint, _ node: T) -> T {
        node.position = position
        return node
    }

    /// Blood thrown from `p`, as the gore makes it (none with it off): at full gore, `count` drops `size` across,
    /// thrown `speed` and pulled down by `gravity` (both in ronin heights a second), gone in about `life` seconds; as the
    /// gore builds, more of them, bigger, thrown harder and hanging longer.
    private func spray(_ color: RGB, at p: CGPoint, count: Int, speed: CGFloat, size: CGFloat, life: CGFloat, spread: CGFloat = .pi * 2,
                       angle: CGFloat = 0, gravity: CGFloat = 0, additive: Bool = false, texture: SKTexture? = nil) {
        let gore = self.gore
        guard gore.on else { return }
        let n = gore.count(count)
        shed += n
        fx.addChild(at(p, Art.burst(color, count: n, speed: ronin * speed * gore.force, size: ronin * size * gore.size, life: life * gore.span,
                                    spread: spread, angle: angle, gravity: ronin * gravity, additive: additive, texture: texture)))
    }

    // MARK: A clash with the warlord

    /// How long of the warlord's wind-up to a parried cut's answer must be left for it to wait out the clash: an answer
    /// coming sooner lets go of the bind as soon as the freeze on it is over, so the blade going up is seen.
    private static let answerSeen = 0.12

    /// Keeps a warlord bound on the ronin's blade in step with the ronin: his guard held where he stands while the cut
    /// comes, then the frame of the clash the ronin is in, so the two bind and part on the same beats (and the freeze on
    /// the bind has them crossed); let go once the ronin is out of it, or once the freeze on the bind is over if his
    /// answer to a parried cut is coming too fast to wait. The blades meeting and parting are drawn as the ronin's
    /// frames reach them.
    private func followBind() {
        guard let b = bind else { return }
        let frame = hero.drawnFrame
        if frame != bindShown {
            bindShown = frame
            if frame == .clash(0) { bladesMeet(b) }
            if frame == .clash(1), b.parried { bladesPart(b) }
        }
        guard let sprite = foeSprites[b.foe] else {
            bind = nil
            return
        }
        var held: Frame?
        switch frame {
        case .cut: held = .block
        case .clash(let k): held = .clash(k)
        default: held = nil
        }
        if case .clash? = held, hitStop <= 0, let foe = session.fight.foe(b.foe), foe.phase == .windup, foe.timer < DuelScene.answerSeen {
            held = nil
        }
        sprite.bind(held)
        if held == nil { bind = nil }
    }

    /// Ends a clash, letting go of the warlord (whatever the fight has him doing shows).
    private func letGoOfBind() {
        if let b = bind { foeSprites[b.foe]?.bind(nil) }
        bind = nil
    }

    /// Which way (radians, on the lane) a figure's blade runs from where it meets another's to its point, the figure
    /// facing `facing` (+1 right), and how far that is (points).
    private func bladeRun(_ cast: Cast, _ frame: Frame, facing: CGFloat) -> (angle: CGFloat, length: CGFloat) {
        guard let c = Figure.contact(cast, frame), let t = Figure.tip(cast, frame) else { return (facing > 0 ? 0.7 : .pi - 0.7, ronin * 0.4) }
        return (atan2(t.y - c.y, facing * (t.x - c.x)), hypot(t.x - c.x, t.y - c.y) * ronin * Build.of(cast).height)
    }

    /// The blades meeting in the bind, where they cross (`Figure.contact`). Parried: steel on steel, a white-hot flash
    /// and a glint running out along each blade, sparks sprayed off along both and showering down, the blade's ring
    /// spreading from it, the lane flashing pale and pushed in toward it and shaken, the warlord's ward flaring, a
    /// freeze on it, and a gold ⊗ over the ronin (the guard turned it: wait for it to drop). Glancing off a guard still
    /// rising: a lighter clash, a few sparks, a small ring, a short freeze, nothing lost. With Reduce Motion the freeze
    /// is shorter, the flashes fainter, and the lane barely moves.
    private func bladesMeet(_ b: Bind) {
        clashesDrawn += 1
        let sign = b.side.sign.cg, strong = b.parried
        let cast = foeSprites[b.foe]?.cast ?? .foe(.warlord)
        let mine = Figure.contact(.hero, .clash(0)) ?? CGPoint(x: 0.47, y: 1)
        let p = CGPoint(x: heroX + b.spot + sign * mine.x * ronin, y: groundY + mine.y * ronin)
        let hot = Palette.gold.mix(.white, 0.35)
        fx.addChild(at(p, Art.flash(.white, size: ronin * (strong ? 1.6 : 0.9), duration: strong ? 0.18 : 0.1, alpha: calm ? 0.55 : 1)))
        // Along the ronin's blade and the warlord's (facing him), out from where they cross toward the points.
        for (angle, length) in [bladeRun(.hero, .clash(0), facing: sign), bladeRun(cast, .clash(0), facing: -sign)] {
            // (Brightest four fifths of the way along: run out to the point as it grows.)
            let glint = SKSpriteNode(texture: Art.streak)
            glint.anchorPoint = CGPoint(x: 0, y: 0.5)
            glint.size = CGSize(width: length * (strong ? 1.1 : 0.8), height: max(5, ronin * 0.09))
            glint.position = p
            glint.zRotation = angle
            glint.color = Palette.steel.mix(.white, 0.6).color()
            glint.colorBlendFactor = 1
            glint.blendMode = .add
            glint.xScale = 0.3
            glint.run(.sequence([.group([.scaleX(to: 1.2, duration: 0.1), .fadeOut(withDuration: strong ? 0.18 : 0.1)]), .removeFromParent()]))
            fx.addChild(glint)
            for k in 0..<(strong ? 3 : 1) {
                let out = ronin * 0.09 * CGFloat(k)
                fx.addChild(at(CGPoint(x: p.x + cos(angle) * out, y: p.y + sin(angle) * out),
                               Art.burst(hot, count: strong ? 10 - 2 * k : 6, speed: ronin * (strong ? 2.6 : 1.7), size: ronin * (strong ? 0.05 : 0.04),
                                         life: strong ? 0.34 : 0.2, spread: 0.45, angle: angle, gravity: ronin * 5)))
            }
        }
        // Hot fragments every way, and the blade's ring.
        fx.addChild(at(p, Art.burst(.white, count: strong ? 14 : 5, speed: ronin * (strong ? 3.4 : 2.4), size: ronin * 0.055, life: strong ? 0.16 : 0.12)))
        fx.addChild(at(p, Art.shockwave(Palette.steel, radius: ronin * 0.05, grow: strong ? 6 : 3.5, width: strong ? 2.2 : 1.3,
                                        duration: strong ? 0.3 : 0.2)))
        guard strong else {
            // Slid off a guard still coming up: it goes on up, and nothing is lost either side.
            foeSprites[b.foe]?.showParry(glanced: true)
            hitStop = max(hitStop, calm ? 0.02 : 0.03)
            shake(0.8)
            return
        }
        fx.addChild(at(p, Art.shockwave(hot, radius: ronin * 0.05, grow: 10, width: 1, duration: 0.5)))
        fx.addChild(at(p, Art.burst(Palette.gold, count: 16, speed: ronin * 0.9, size: ronin * 0.04, life: 0.6, spread: 1.4, angle: -.pi / 2,
                                    gravity: ronin * 7)))
        focus(at: p, size: ronin * 2.6, color: .white, alpha: 0.4)
        flashLane(0.1, fade: 0.2, color: Palette.steel)
        foeSprites[b.foe]?.showParry(glanced: false)
        let blocked = Icons.blocked(ronin * 0.24, Palette.gold.mix(.white, 0.2).color())
        blocked.position = CGPoint(x: heroX + b.spot, y: groundY + ronin * 1.25)
        blocked.setScale(0.4)
        overlay.addChild(blocked)
        blocked.run(.sequence([.scale(to: 1, duration: 0.08), .wait(forDuration: 0.3),
                               .group([.fadeOut(withDuration: 0.25), .moveBy(x: 0, y: 6, duration: 0.25)]), .removeFromParent()]))
        hitStop = max(hitStop, calm ? 0.04 : 0.065)
        shake(2.4)
        punch(0.035, at: p)
    }

    /// The parried ronin forced off the warlord's blade, his own scraped up along it and off: sparks running out along
    /// the warlord's blade toward its point, a flash and a ring where they part, and the lane jolted.
    private func bladesPart(_ b: Bind) {
        let sign = b.side.sign.cg
        let cast = foeSprites[b.foe]?.cast ?? .foe(.warlord)
        let mine = Figure.contact(.hero, .clash(1)) ?? CGPoint(x: 0.12, y: 1.24)
        let p = CGPoint(x: heroX + b.spot + sign * mine.x * ronin, y: groundY + mine.y * ronin)
        let angle = bladeRun(cast, .clash(1), facing: -sign).angle
        fx.addChild(at(p, Art.flash(Palette.steel, size: ronin * 0.8, duration: 0.1, alpha: calm ? 0.45 : 0.8)))
        for k in 0..<3 {
            let out = ronin * 0.07 * CGFloat(k)
            fx.addChild(at(CGPoint(x: p.x + cos(angle) * out, y: p.y + sin(angle) * out),
                           Art.burst(Palette.gold.mix(.white, 0.25), count: 7 - k, speed: ronin * 2.2, size: ronin * 0.045, life: 0.28,
                                     spread: 0.5, angle: angle, gravity: ronin * 5)))
        }
        fx.addChild(at(p, Art.shockwave(Palette.steel, radius: ronin * 0.04, grow: 3.5, width: 1.2, duration: 0.2)))
        shake(1.4)
    }

    /// The ronin's blade crossing the gap to a foe: a hot streak along the ground line.
    private func dash(to x: CGFloat, side: Side) {
        let distance = abs(x - heroX)
        guard distance > ronin * 0.45 else { return }
        let streak = SKSpriteNode(texture: Art.streak)
        streak.anchorPoint = CGPoint(x: 0, y: 0.5)
        streak.size = CGSize(width: distance, height: ronin * 0.3)
        streak.xScale = side == .right ? 1 : -1
        streak.position = CGPoint(x: heroX, y: groundY + ronin * 0.52)
        streak.color = session.fight.inBloodlust ? Palette.blood.color() : .white
        streak.colorBlendFactor = 1
        streak.blendMode = .add
        streak.alpha = 0.55
        streak.run(.sequence([.fadeOut(withDuration: 0.14), .removeFromParent()]))
        fx.addChild(streak)
    }

    private var cuts = 0
    private var lastCut = Cut.kesa
    /// Blows struck but not yet drawn landing, by the scene clock.
    private var impacts: [(at: Double, run: @MainActor () -> Void)] = []

    private func later(_ seconds: Double, _ run: @escaping @MainActor () -> Void) {
        impacts.append((clock + seconds, run))
        impacts.sort { $0.at < $1.at }
    }
    /// Where a gourd-bearer's gourd was when he was cut down, for the gourd to fly from.
    private var gourdSpots: [Int: CGPoint] = [:]

    /// A cut to suit what is in front of him, never the same one twice running. The first of a stage is drawn from the
    /// scabbard (nukitsuke); then a thrust or a stamping shōmen to close a long gap, shōmen and kesa-giri for the big
    /// ones, shin cuts and rising cuts for the quick and low, level and diagonal cuts to meet an arrow. Into a guard
    /// (`guarded`), one that comes down onto the blade held up across him, to bind on it: shōmen or kesa-giri.
    private func chooseCut(_ kind: Kind?, distance: CGFloat, guarded: Bool = false) -> Cut {
        if hero.sheathed {
            lastCut = .nukitsuke
            return .nukitsuke
        }
        let options: [Cut]
        if guarded { options = [.shomen, .kesa] }
        else if kind == nil { options = [.dou, .kesa, .gyaku] }
        else if distance > ronin * 0.9 { options = [.tsuki, .shomen] }
        else if kind == .brute || kind == .warlord { options = [.shomen, .kesa, .dou] }
        else if kind == .runner || kind == .dancer { options = [.sune, .gyaku, .dou] }
        else { options = [.kesa, .gyaku, .dou, .sune, .shomen] }
        cuts += 1
        let fresh = options.filter { $0 != lastCut }
        let pick = fresh.isEmpty ? options[0] : fresh[cuts % fresh.count]
        lastCut = pick
        return pick
    }

    /// How high on a foe each cut lands, as a share of his height.
    static func height(of cut: Cut) -> CGFloat {
        switch cut {
        case .sune: return 0.3
        case .dou: return 0.48
        case .shomen: return 0.72
        default: return 0.58
        }
    }

    /// The draw: a flash off the blade as it clears the scabbard.
    private func drawFlash(_ side: Side) {
        let p = CGPoint(x: heroX + side.sign.cg * ronin * 0.12, y: groundY + ronin * 0.52)
        fx.addChild(at(p, Art.burst(.white, count: 12, speed: ronin * 2.6, size: ronin * 0.05, life: 0.14, spread: 0.5,
                                    angle: side == .right ? 0.4 : .pi - 0.4)))
        let glint = SKSpriteNode(texture: Art.glow)
        glint.size = CGSize(width: ronin * 0.7, height: ronin * 0.7)
        glint.position = p
        glint.color = Palette.steel.color()
        glint.colorBlendFactor = 1
        glint.blendMode = .add
        glint.run(.sequence([.group([.fadeOut(withDuration: 0.18), .scale(to: 1.6, duration: 0.18)]), .removeFromParent()]))
        fx.addChild(glint)
    }

    /// The gourd-bearer cut down: the gourd flies to the ronin and a heart lights up in the header (or, hearts full,
    /// its worth in points).
    private func heal(_ id: Int, restored: Bool) {
        let sprite = foeSprites[id]
        let start = gourdSpots.removeValue(forKey: id)
            ?? sprite.map { CGPoint(x: $0.position.x, y: groundY + $0.height * 1.12) } ?? CGPoint(x: heroX, y: groundY + ronin)
        sprite?.dropGourd()
        let gourd = Icons.gourd(max(10, ronin * 0.2), Palette.jade.mix(.white, 0.25).color())
        gourd.position = start
        overlay.addChild(gourd)
        let chest = CGPoint(x: hero.standing, y: groundY + ronin * 0.6)
        let fly = SKAction.move(to: chest, duration: 0.3)
        fly.timingMode = .easeIn
        gourd.run(.sequence([.group([fly, .rotate(byAngle: 3, duration: 0.3)]), .removeFromParent()]))
        overlay.run(.sequence([.wait(forDuration: 0.3), .run { [weak self] in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.fx.addChild(self.at(chest, Art.burst(Palette.jade, count: 30, speed: self.ronin * 1.6, size: self.ronin * 0.08, life: 0.6)))
                self.fx.addChild(self.at(chest, Art.shockwave(Palette.jade, radius: self.ronin * 0.2, grow: 4, width: 2.5, duration: 0.45)))
                if !restored {
                    let bonus = Art.label(Art.headingFont, size: 13 * self.fs, color: Palette.gold.color())
                    bonus.text = "+" + DuelScene.grouped(self.session.fight.gourdBonus)
                    bonus.position = CGPoint(x: self.heroX, y: self.groundY + self.ronin * 1.15)
                    self.overlay.addChild(bonus)
                    bonus.run(.sequence([.group([.moveBy(x: 0, y: 10, duration: 0.7), .fadeOut(withDuration: 0.7)]), .removeFromParent()]))
                }
            }
        }]))
    }

    /// The cut's mark in the air: a fine crescent laid along the line of the cut (diagonal down or up, straight down,
    /// flattened for a level cut, low for a shin cut), or for a thrust a single bright line.
    private func slash(at p: CGPoint, side: Side, style: Cut, strong: Bool) {
        let bloodlust = session.fight.inBloodlust
        let s = ronin * (strong ? 1.25 : 1.0)
        let tilt: CGFloat
        switch style {
        case .kesa: tilt = -0.8
        case .gyaku, .nukitsuke: tilt = 0.75
        case .shomen: tilt = -1.3
        case .dou: tilt = -0.05
        case .sune: tilt = 0.2
        case .tsuki: tilt = 0
        }
        if style == .tsuki {
            for (k, color) in [(0, bloodlust ? Palette.blood : look.accent), (1, RGB.white)] {
                let line = SKSpriteNode(texture: Art.streak)
                line.anchorPoint = CGPoint(x: 1, y: 0.5)
                line.size = CGSize(width: s * 1.5, height: s * (k == 0 ? 0.16 : 0.07))
                line.position = CGPoint(x: p.x + side.sign.cg * s * 0.35, y: p.y + s * 0.08)
                line.xScale = side == .right ? 1 : -1
                line.color = color.color()
                line.colorBlendFactor = 1
                line.blendMode = .add
                line.run(.sequence([.group([.fadeOut(withDuration: 0.16), .scaleX(to: 1.3 * line.xScale, duration: 0.16)]), .removeFromParent()]))
                fx.addChild(line)
            }
            fx.addChild(at(CGPoint(x: p.x + side.sign.cg * s * 0.35, y: p.y + s * 0.08),
                           Art.shockwave(.white, radius: s * 0.05, grow: 4, width: 1.2, duration: 0.2)))
            return
        }
        let squash: CGFloat = style == .dou ? 0.45 : 1
        for (k, color) in [(0, bloodlust ? Palette.blood : look.accent), (1, RGB.white)] {
            let arc = SKSpriteNode(texture: Art.crescent)
            arc.size = CGSize(width: s * (k == 0 ? 1.1 : 1), height: s * (k == 0 ? 1.1 : 1) * squash)
            arc.position = p
            arc.xScale = side == .right ? 1 : -1
            arc.zRotation = (side == .right ? tilt : -tilt) + CGFloat.random(in: -0.12...0.12)
            arc.color = color.color()
            arc.colorBlendFactor = 1
            arc.blendMode = .add
            arc.alpha = k == 0 ? 0.65 : 1
            arc.run(.sequence([.group([.fadeOut(withDuration: 0.22), .scale(by: 1.12, duration: 0.22)]).easedOut(), .removeFromParent()]))
            fx.addChild(arc)
        }
        let line = SKSpriteNode(texture: Art.streak)
        line.size = CGSize(width: s * 1.5, height: s * 0.06)
        line.position = p
        line.zRotation = side == .right ? tilt + .pi / 2 * 0.6 : -(tilt + .pi / 2 * 0.6)
        line.color = .white
        line.colorBlendFactor = 1
        line.blendMode = .add
        line.run(.sequence([.group([.fadeOut(withDuration: 0.12), .scaleX(to: 1.4, duration: 0.12)]), .removeFromParent()]))
        fx.addChild(line)
    }

    /// Which way a cut's wound runs across a foe (radians from level, rising toward the ronin).
    static func slope(of cut: Cut) -> CGFloat {
        switch cut {
        case .kesa: return -0.7
        case .gyaku, .nukitsuke: return 0.7
        case .dou: return 0
        case .sune: return 0.1
        case .shomen: return -1.35
        case .tsuki: return 0
        }
    }

    /// A foe cut down. What becomes of him depends on the cut: halved on the slant or through the waist, his legs cut
    /// from under him at the shins, his head taken (a warlord always loses his); run through or shot, he goes down
    /// whole. The gore decides how often a cut takes him apart like that (`Gore.severs`: now and then it only fells
    /// him, early on; heavier, a thrust may tear him open through the waist too), and with gore off nobody comes
    /// apart: every man is felled whole. He falls from the pose his figure froze in at the blow (`Figures.struck` with
    /// `variant`), or, shot, from the one he was in. The pieces fly, land and stay, and the blood goes everywhere from
    /// where he parts (with gore off, sparks), which is returned (for the cut's mark).
    @discardableResult
    private func sever(_ sprite: FoeSprite, side: Side, style: Cut?, variant: Int? = nil) -> CGPoint {
        foeSprites[sprite.id] = nil
        if sprite.gourd != nil { gourdSpots[sprite.id] = CGPoint(x: sprite.position.x, y: sprite.position.y + sprite.height * 1.12) }
        let boss = sprite.kind == .warlord, heavy = boss || sprite.kind == .brute
        let facing: CGFloat = sprite.position.x < heroX ? 1 : -1
        let away = side.sign.cg
        let feet = sprite.position
        let force: CGFloat = boss ? 1.5 : heavy ? 1.25 : 1
        let gore = self.gore
        carnage.gore = gore
        let severance: Figures.Severance?
        if !gore.on {
            severance = nil
        } else if boss {
            severance = .head
        } else {
            let cut: Figures.Severance?
            switch style {
            case .kesa?: cut = .falling
            case .gyaku?, .nukitsuke?: cut = .rising
            case .dou?: cut = .level
            case .sune?: cut = .legs
            case .shomen?: cut = .head
            case .tsuki?: cut = Double.random(in: 0..<1) < gore.tears ? .level : nil
            case nil: cut = nil
            }
            severance = Double.random(in: 0..<1) < gore.severs ? cut : nil
        }
        // Where he parts: the upper piece's cut, the neck, the shin; felled whole, his chest.
        let gash: CGPoint
        if let severance {
            gash = carnage.sever(sprite.cast, severance, feet: feet, facing: facing, away: away, force: force,
                                 variant: variant ?? Int.random(in: 0..<Figures.variants))
        } else {
            let pose = variant.map { Figure.struck(sprite.cast, variant: $0) } ?? Figure.pose(sprite.cast, sprite.shown)
            gash = carnage.fell(sprite.cast, feet: feet, facing: facing, force: force, pose: pose)
        }
        let thrown: CGFloat = side == .right ? 0.6 : .pi - 0.6
        if gore.on {
            spray(Palette.blood, at: gash, count: boss ? 90 : heavy ? 56 : 36, speed: 2.4, size: 0.08, life: 0.7, spread: 1.6, angle: thrown, gravity: 6)
            spray(Palette.blood.mix(.white, 0.2), at: gash, count: 12, speed: 3.2, size: 0.1, life: 0.2, spread: 0.8, angle: thrown, additive: true)
            // Gobbets: dark, heavy, thrown up and dropping fast.
            spray(RGB(0.28, 0, 0.02), at: gash, count: heavy ? 18 : 9, speed: 1.9, size: 0.11, life: 0.8, spread: 1.3, angle: .pi / 2, gravity: 9,
                  texture: Art.dot)
            // The stage's blood on him, darker the heavier the gore.
            hero.bloodied((heavy ? 0.06 : 0.025) * gore.level, upTo: 0.1 + 0.03 * gore.level)
        } else {
            // No blood: the blade's sparks where it went through, and the cut's mark does the rest.
            fx.addChild(at(gash, Art.burst(Palette.steel, count: boss ? 30 : heavy ? 22 : 14, speed: ronin * 2.6, size: ronin * 0.07, life: 0.24,
                                           spread: 1.2, angle: thrown)))
        }
        sprite.removeFromParent()

        // A big man's death gets an impact frame; the warlord's has its lines closing in from past every edge.
        if heavy { focus(at: gash, size: ronin * (boss ? 5.5 : 4.2), color: .white, alpha: boss ? 0.9 : 0.65, pastEdges: boss) }
        if boss {
            hitStop = max(hitStop, 0.25)
            world.speed = 0.25
            fx.addChild(at(gash, Art.shockwave(Palette.gold, radius: ronin * 0.3, grow: 7, width: 3, duration: 0.8)))
            fx.addChild(at(gash, Art.burst(Palette.gold, count: 70, speed: ronin * 3, size: ronin * 0.1, life: 0.9)))
            shake(6)
            punch(0.07, at: gash)
            splatter(4)
        } else {
            hitStop = max(hitStop, heavy ? 0.08 : 0.05)
            shake(heavy ? 2.8 : 1.6)
            punch(heavy ? 0.035 : 0.02, at: gash)
            // Now and then, close in, it reaches the glass (more often the heavier the gore).
            if heavy || abs(feet.x - heroX) < ronin * 0.6 && Double.random(in: 0...1) < gore.chance(0.15) { splatter(heavy ? 2 : 1, side: side) }
        }
        return gash
    }

    /// Big text slammed onto the lane, on a dark plate, with an optional pictogram before it, held `hold` seconds.
    /// It goes under the combo and every warning marker (a blow coming is never covered), its glow behind its plate;
    /// a new one takes the place of the last. With Reduce Motion it drops in from nearer.
    private func slam(_ text: String, color: RGB, icon: SKNode? = nil, hold: TimeInterval = 0.65) {
        if let old = slamNode {
            old.removeAllActions()
            old.run(.sequence([.fadeOut(withDuration: 0.08), .removeFromParent()]))
        }
        let node = SKNode()
        node.position = CGPoint(x: field.midX, y: field.minY + field.height * 0.64)
        let label = Art.label(Art.headingFont, size: 20 * fs, color: color.color())
        Art.track(label, text, 4 * fs)
        let iconWidth: CGFloat = icon == nil ? 0 : 24 * fs
        let plate = Icons.band(CGSize(width: label.frame.width + iconWidth + 90 * fs, height: 32 * fs))
        plate.zPosition = -0.2
        node.addChild(plate)
        let glow = SKSpriteNode(texture: Art.glow)
        glow.size = CGSize(width: label.frame.width * 2, height: 60 * fs)
        glow.color = color.color()
        glow.colorBlendFactor = 1
        glow.blendMode = .add
        glow.alpha = 0.3
        glow.zPosition = -0.4
        node.addChild(glow)
        label.position = CGPoint(x: iconWidth / 2, y: 0)
        label.zPosition = 0.2
        node.addChild(label)
        if let icon {
            icon.position = CGPoint(x: -label.frame.width / 2 - 2 * fs, y: 0)
            icon.zPosition = 0.2
            node.addChild(icon)
        }
        node.setScale(calm ? 1.15 : 2.2)
        node.alpha = 0
        slams.addChild(node)
        slamNode = node
        node.run(.sequence([
            .group([.scale(to: 1, duration: 0.12), .fadeIn(withDuration: 0.08)]).easedIn(),
            .wait(forDuration: hold),
            .group([.fadeOut(withDuration: 0.3), .scale(to: 1.08, duration: 0.3)]),
            .removeFromParent(),
        ]))
    }

    // MARK: The end of a stage

    private func finish(_ outcome: Outcome) {
        // Won on a cut, the cut plays out before the flourish; fallen, he goes down now.
        hero.finish(victory: outcome == .victory)
        world.speed = min(world.speed, 0.3)
        if outcome == .victory, session.career.isEndless {
            // An endless run goes straight on: a word, the blade home, a rank if the stage earned one, and the next
            // stage's card.
            let fight = session.fight
            slam(fight.stats.damage == 0 ? "FLAWLESS" : "CLEARED", color: fight.stats.damage == 0 ? Palette.gold : look.accent.mix(.white, 0.3),
                 icon: Icons.infinity(18 * fs, Palette.gold.color()))
            fx.addChild(at(CGPoint(x: hero.standing, y: groundY + ronin * 0.8), Art.burst(look.accent, count: 40, speed: ronin * 1.5,
                                                                                         size: ronin * 0.08, life: 1.1, spread: 1.4, angle: .pi / 2)))
            let rank = session.promotion
            if let rank {
                slams.run(.sequence([.wait(forDuration: 1.0), .run { [weak self] in
                    MainActor.assumeIsolated { self?.slam("▲ " + rank.uppercased(), color: Palette.gold) }
                }]))
            }
            overlay.run(.sequence([.wait(forDuration: rank == nil ? 1.7 : 2.6), .run { [weak self] in
                MainActor.assumeIsolated {
                    guard let self, self.session.fight.outcome == .victory, self.session.career.isEndless else { return }
                    // On to the next stage, but not into it behind the player's back: if the pointer left meanwhile,
                    // it waits under the curtain, and coming back takes the dwell, as it does for any fight.
                    self.session.next()
                    self.loadFight(intro: true)
                    self.refreshCurtain()
                }
            }]))
            refreshCurtain()
            return
        }
        // Long enough for the blade to go home, or for him to go down on his face, before the card.
        let delay: TimeInterval = outcome == .victory ? 1.5 : (HeroSprite.fallTiming.last ?? 1.2) + 0.3
        if outcome == .defeat {
            // He is opened up where he stands: blood pumping from him as he goes down, pooling wide under him, on the
            // glass; and once he is down on his face, running out of him along the ground. (As much as the gore
            // makes of it; with gore off, none: he only falls.)
            carnage.gore = gore
            let x = hero.standing
            let chest = CGPoint(x: x + hero.facing.sign.cg * ronin * 0.06, y: groundY + ronin * 0.55)
            carnage.bleed(at: chest, angle: hero.facing == .right ? 0.7 : .pi - 0.7, seconds: 1.0)
            later(HeroSprite.fallTiming.last ?? 1.2) { [self] in
                let x = hero.standing
                carnage.bleed(at: CGPoint(x: x + hero.facing.sign.cg * ronin * 0.2, y: groundY + ronin * 0.12),
                              angle: hero.facing == .right ? 0.3 : .pi - 0.3, seconds: 0.8)
            }
            spray(Palette.blood, at: chest, count: 70, speed: 2.4, size: 0.09, life: 0.8, gravity: 6)
            carnage.pool(at: x, width: ronin * 2.4, grow: 3.5)
            carnage.spatter(around: x, count: 16)
            splatter(4)
            punch(0.07, at: chest)
            shake(5)
            let fall = SKSpriteNode(color: .black, size: field.size)
            fall.anchorPoint = .zero
            fall.alpha = 0
            fall.zPosition = -1
            overlay.addChild(fall)
            fall.run(.fadeAlpha(to: 0.35, duration: 0.8))
        } else {
            fx.addChild(at(CGPoint(x: hero.standing, y: groundY + ronin * 0.8), Art.burst(look.accent, count: 50, speed: ronin * 1.5,
                                                                                         size: ronin * 0.08, life: 1.1, spread: 1.4, angle: .pi / 2)))
        }
        overlay.run(.sequence([.wait(forDuration: delay), .run { [weak self] in
            MainActor.assumeIsolated {
                guard let self, self.session.fight.outcome == outcome, self.banner == nil else { return }
                self.showBanner(outcome)
            }
        }]))
        refreshCurtain()
    }

    /// The end card: a big word, then the stage's kills, best combo and time as pictograms with numbers and its score;
    /// after a fall, the run's instead (stages cleared, kills, best combo, score); a rank earned, and a record run, if
    /// either; and a ▶ to go on, or ↻ and the stage a fall sends him back to.
    private func showBanner(_ outcome: Outcome) {
        banner?.removeFromParent()
        let fight = session.fight
        let won = outcome == .victory
        let color = won ? (fight.stats.damage == 0 ? Palette.gold : look.accent.mix(.white, 0.3)) : Palette.blood.mix(.white, 0.25)
        let node = SKNode()
        node.position = CGPoint(x: field.midX, y: field.midY)
        // The shade over the lane, and the glow behind the word, under everything else on the card (the panel draws by
        // depth alone).
        let dim = SKSpriteNode(color: SKColor(white: 0, alpha: 0.62), size: CGSize(width: size.width * 2, height: size.height * 2))
        dim.zPosition = -0.2
        node.addChild(dim)
        let glow = SKSpriteNode(texture: Art.glow)
        glow.size = CGSize(width: field.width * 1.1, height: 80 * fs)
        glow.color = color.color()
        glow.colorBlendFactor = 1
        glow.blendMode = .add
        glow.alpha = 0.35
        glow.position = CGPoint(x: 0, y: 26 * fs)
        glow.zPosition = -0.1
        node.addChild(glow)
        let title = Art.label(Art.headingFont, size: 24 * fs, color: color.color())
        Art.track(title, won ? (fight.stats.damage == 0 ? "FLAWLESS" : "CLEARED") : "FALLEN", 7 * fs)
        title.position = CGPoint(x: 3.5 * fs, y: 34 * fs)
        node.addChild(title)
        let rule = Icons.rule(min(field.width * 0.5, 220 * fs), color.color(0.8))
        rule.position = CGPoint(x: 0, y: 21 * fs)
        node.addChild(rule)

        // The numbers, each behind its pictogram: the stage's, or after a fall the whole run's (every stage of it since
        // the last fall, or since the endless run's start), the stages it cleared first.
        let career = session.career
        let ink = Palette.ink.color()
        let seconds = Int(fight.time)
        var stats: [(SKNode, String)] = [
            (Icons.skull(13 * fs, ink), "\(fight.stats.kills)"),
            (Icons.swords(13 * fs, ink), "\(fight.stats.bestCombo)"),
            (Icons.clock(13 * fs, ink), "\(seconds / 60):\(String(format: "%02d", seconds % 60))"),
        ]
        var total = fight.score
        var caption: String?
        var best = false
        if !won {
            // (Only the run this fight ended: a save from before runs were kept has none.)
            if let run = career.lastRun, run.stage == fight.stage {
                stats = [
                    (career.isEndless ? Icons.infinity(13 * fs, ink) : Icons.steps(13 * fs, ink), "\(run.cleared)"),
                    (Icons.skull(13 * fs, ink), "\(run.kills)"),
                    (Icons.swords(13 * fs, ink), "\(run.bestCombo)"),
                ]
                total = run.score
                best = career.lastRunIsBest
            }
            // Where a fall sends him: the campaign's first stage, or the endless run's.
            caption = "STAGE \(career.current)"
        }
        let row = SKNode()
        row.position = CGPoint(x: 0, y: 6 * fs)
        var x: CGFloat = 0
        for (icon, value) in stats {
            let label = Art.label(Art.headingFont, size: 14 * fs, color: Palette.ink.color(), align: .left)
            label.text = value
            icon.position = CGPoint(x: x + 7 * fs, y: 0)
            label.position = CGPoint(x: x + 17 * fs, y: 0)
            row.addChild(icon)
            row.addChild(label)
            x += 17 * fs + label.frame.width + 16 * fs
        }
        for child in row.children { child.position.x -= (x - 16 * fs) / 2 }
        node.addChild(row)
        let score = Art.label(Art.headingFont, size: 14 * fs, color: Palette.gold.color())
        score.text = DuelScene.grouped(total)
        score.position = CGPoint(x: 0, y: -12 * fs)
        node.addChild(score)
        var y = -30 * fs
        // A rank earned and a record run (a better one, not a tie) share the one line.
        let marks = [session.promotion?.uppercased(), best ? "BEST RUN" : nil].compactMap { $0 }
        if !marks.isEmpty {
            let promo = Art.label(Art.italicFont, size: 12 * fs, color: Palette.gold.color())
            Art.track(promo, "▲ " + marks.joined(separator: " · "), 2 * fs)
            promo.position = CGPoint(x: 0, y: y)
            promo.run(.repeatForever(.sequence([.scale(to: 1.08, duration: 0.5), .scale(to: 1, duration: 0.5)])))
            node.addChild(promo)
            y -= 17 * fs
        }
        let go = SKNode()
        let icon = won ? Icons.play(14 * fs, Palette.ink.color()) : Icons.again(16 * fs, Palette.ink.color())
        go.addChild(icon)
        if let caption {
            let label = Art.label(Art.headingFont, size: 11 * fs, color: Palette.ink.color(), align: .left)
            Art.track(label, caption, 2 * fs)
            label.position = CGPoint(x: 12 * fs, y: 0)
            go.addChild(label)
            icon.position.x = -label.frame.width / 2
            label.position.x = icon.position.x + 12 * fs
        }
        go.position = CGPoint(x: 0, y: y - 2 * fs)
        go.run(.repeatForever(.sequence([.fadeAlpha(to: 0.35, duration: 0.6), .fadeAlpha(to: 1, duration: 0.6)])))
        node.addChild(go)
        node.alpha = 0
        node.setScale(0.94)
        node.run(.group([.fadeIn(withDuration: 0.25), .scale(to: 1, duration: 0.3)]).easedOut())
        overlay.addChild(node)
        banner = node
        bannerShownAt = clock
        hint?.removeFromParent()
        hint = nil
    }

    var isShowingBanner: Bool { banner != nil }
    /// Bodies and parts of bodies lying on the lane.
    var bodiesOnLane: Int { carnage.count }
    /// Blood spilt since launch (drops thrown, wounds opened, pools, flecks, blots on the glass), and men taken apart.
    var bloodShed: Int { shed + carnage.shed }
    var severings: Int { carnage.severings }
    /// A blow's impact frame is holding the lane (and the dead) still.
    var isFrozen: Bool { hitStop > 0 }
    /// What plays over the lane (a stage's card, the words slammed onto it) is holding with the fight.
    var cardsHeld: Bool { overlay.speed == 0 }
    /// Where the stage's title card is centred, while it is up.
    var introCardCentre: CGPoint? { introCard?.parent == nil ? nil : introCard?.position }
    /// Where the warlord's bar is drawn, while he is on the lane (in the scene's coordinates).
    var bossBar: CGRect? { bossNode.isHidden ? nil : bossTrack.frame.offsetBy(dx: bossNode.position.x, dy: bossNode.position.y) }
    /// The top of the lane: the header starts there.
    var laneTop: CGFloat { top }

    /// Past the banner: the next stage; after a fall, the first stage again (or the endless run's first).
    func advanceFromBanner() {
        guard session.fight.outcome != nil else { return }
        session.next()
        loadFight(intro: true)
        engage()
    }

    // MARK: Input

    func headerHit(at p: CGPoint) -> HeaderHit {
        if isCompact { return .drag }
        guard p.y >= top else { return .none }
        if hypot(p.x - closeButton.position.x, p.y - closeButton.position.y) <= 10 { return .close }
        if hypot(p.x - compactButton.position.x, p.y - compactButton.position.y) <= 10 { return .compact }
        return .drag
    }

    func pointerMoved(to p: CGPoint) {
        pointer = p
        if isEngaging { drawEngageRing() }
    }

    /// A mouse button (or key) for one side: a cut that way. Past a finished stage it goes on; while paused it
    /// resumes without cutting.
    func press(_ side: Side) {
        guard !isCompact else { return }
        if session.fight.outcome != nil {
            if banner != nil, clock - bannerShownAt > 0.5 { advanceFromBanner() }
            return
        }
        if isAwayPaused {
            engage()
            return
        }
        strike(side)
    }

    func strike(_ side: Side) {
        guard !isAwayPaused, !isCompact, session.fight.outcome == nil else { return }
        for event in session.strike(side) { handle(event) }
        sync(0)
    }

    /// Returns false for keys the scene does not use, a key held with ⌘, ⌃ or ⌥ among them (meant for another app).
    func key(_ event: NSEvent) -> Bool {
        guard event.modifierFlags.intersection([.command, .control, .option]).isEmpty else { return false }
        var side: Side?
        switch event.keyCode {
        case 123: side = .left
        case 124: side = .right
        default:
            switch event.charactersIgnoringModifiers?.lowercased() {
            case "a", "f": side = .left
            case "d", "j": side = .right
            case " ", "\r":
                if session.fight.outcome != nil {
                    if banner != nil { advanceFromBanner() }
                } else if isAwayPaused {
                    engage()
                }
                return true
            default: return false
            }
        }
        guard let side else { return false }
        if event.isARepeat { return true }
        press(side)
        return true
    }
}
