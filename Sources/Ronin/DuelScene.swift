import AppKit
import SpriteKit
import RoninCore

/// The lane, its header, the cards between stages, and the pill it folds into.
///
/// The left mouse button cuts left, the right one cuts right (so do ←/→, A/D and F/J once the panel has the keys).
/// Leaving the panel pauses at once; coming back takes a short, visible dwell before the fight resumes, so a pointer
/// crossing the panel on its way somewhere else costs nothing. A click resumes at once, without cutting.
///
/// The panel is small, so it says as much as it can without words: hearts, a progress bar, pictograms for kills,
/// time and combo, a warning marker over a foe about to strike, a sight line from a drawing archer, mouse buttons
/// under the lane until you have cut both ways. What text there is is large, heavy, and sits on a dark plate.
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
    private var shownCombo = 0
    private var shownHP = Tuning.heroHP
    private var lightning = 0.0
    /// Sides the player has cut down a foe on, while the button hint is up.
    private var hintSides = Set<Side>()
    private(set) var pointer: CGPoint?

    private var field = CGRect(x: 0, y: 0, width: 420, height: 126)
    private var groundY: CGFloat = 20
    /// The ronin's height in points; everything on the lane scales from it.
    private var ronin: CGFloat = 60
    private var top: CGFloat { size.height - DuelScene.headerHeight }
    private var heroX: CGFloat { field.midX }
    private var look = Look.of(.crimsonDusk)
    /// Text scale: 1 on the medium panel.
    private var fs: CGFloat { max(0.85, min(1.25, field.height / 126)) }

    // Back to front.
    private let scenery = SKNode()
    private let flashSky = SKSpriteNode(color: .white, size: .zero)
    private let world = SKNode()
    private let figures = SKNode()
    private let fx = SKNode()
    private let hero = HeroSprite()
    private var foeSprites: [Int: FoeSprite] = [:]
    private var arrowSprites: [Int: ArrowSprite] = [:]
    private var reachMarks: [SKShapeNode] = []
    private var weather: SKEmitterNode?
    private let rage = SKSpriteNode(texture: Art.vignette)
    private let wound = SKSpriteNode(color: .white, size: .zero)
    private let vignette = SKSpriteNode(texture: Art.vignette)
    private let hud = SKNode()
    private let comboBack = SKSpriteNode(texture: Art.glow)
    private let comboLabel = Art.label(Art.headingFont, size: 26, color: .white)
    private let comboShadow = Art.label(Art.headingFont, size: 26, color: SKColor(white: 0, alpha: 0.7))
    private let comboTimes = Art.label(Art.headingFont, size: 13, color: Palette.gold.color(), align: .left)
    private let bossNode = SKNode()
    private let bossTrack = SKShapeNode()
    private let bossFill = SKSpriteNode(color: Palette.gold.color(), size: .zero)
    private let overlay = SKNode()
    private var banner: SKNode?
    private var bannerShownAt = 0.0
    private var hint: SKNode?
    private let curtain = SKSpriteNode(color: .black, size: .zero)
    private let curtainIcon = Icons.pause(22, SKColor(white: 1, alpha: 0.85))
    private let engageRing = SKShapeNode()

    private let header = SKNode()
    private let headerBar = SKSpriteNode(color: Palette.header.color(), size: .zero)
    private var modeGlyph = SKNode()
    private let titleLabel = Art.label(Art.headingFont, size: 13.5, color: Palette.ink.color(), align: .left)
    private let scoreLabel = Art.label(Art.headingFont, size: 13, color: Palette.ink.color(0.9), align: .right)
    private let compactButton = SKShapeNode()
    private let closeButton = SKShapeNode()
    private var hearts: [SKShapeNode] = []
    private let progressTrack = SKSpriteNode(color: SKColor(white: 1, alpha: 0.08), size: .zero)
    private let progressFill = SKSpriteNode(color: .white, size: .zero)

    private let pill = SKNode()
    private var pillGlyph = SKNode()
    private let pillLabel = Art.label(Art.headingFont, size: 12.5, color: Palette.ink.color(), align: .left)
    private var pillHearts: [SKShapeNode] = []
    private let pillValue = Art.label(Art.headingFont, size: 12, color: Palette.ink.color(0.85), align: .right)

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
        hero.zPosition = 5
        figures.addChild(hero)
        for _ in 0..<2 {
            let mark = SKShapeNode()
            mark.lineWidth = 2
            mark.lineCap = .round
            mark.lineJoin = .round
            mark.zPosition = 2
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
        vignette.zPosition = 45
        vignette.alpha = 0.8
        addChild(vignette)

        hud.zPosition = 50
        addChild(hud)
        comboBack.color = .black
        comboBack.colorBlendFactor = 1
        comboBack.alpha = 0.65
        comboBack.zPosition = -2
        comboShadow.zPosition = -1
        for node in [comboBack, comboShadow, comboLabel, comboTimes] as [SKNode] { hud.addChild(node) }
        bossTrack.fillColor = SKColor(white: 0, alpha: 0.6)
        bossTrack.strokeColor = Palette.gold.color(0.5)
        bossTrack.lineWidth = 1
        bossFill.anchorPoint = CGPoint(x: 0, y: 0.5)
        bossNode.addChild(bossTrack)
        bossNode.addChild(bossFill)
        let crest = Icons.crest(14)
        crest.name = "crest"
        bossNode.addChild(crest)
        bossNode.isHidden = true
        hud.addChild(bossNode)

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
        progressTrack.anchorPoint = .zero
        progressFill.anchorPoint = .zero
        for node in [progressTrack, progressFill, titleLabel, scoreLabel] as [SKNode] { header.addChild(node) }
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
        for _ in 0..<Mode.shoshin.hearts {
            let heart = Icons.heart(10)
            header.addChild(heart)
            hearts.append(heart)
            let small = Icons.heart(8)
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
        for sprite in foeSprites.values { sprite.removeFromParent() }
        for sprite in arrowSprites.values { sprite.removeFromParent() }
        foeSprites = [:]
        arrowSprites = [:]
        fx.removeAllChildren()
        overlay.removeAllChildren()
        overlay.removeAllActions()
        banner = nil
        world.speed = 1
        slowmo = 1
        hitStop = 0
        shownCombo = fight.combo
        shownHP = fight.hp
        hero.reset()
        hero.face(fight.facing)
        if fight.setting != shownSetting {
            shownSetting = fight.setting
            look = Look.of(fight.setting)
            layout()
        }
        titleLabel.text = "STAGE \(fight.stage)"
        modeGlyph.removeFromParent()
        modeGlyph = Icons.mode(fight.mode, 13)
        header.addChild(modeGlyph)
        pillGlyph.removeFromParent()
        pillGlyph = Icons.mode(fight.mode, 11)
        pill.addChild(pillGlyph)
        layoutHeader()
        layoutPill()
        progressFill.color = look.accent.color()
        sync(0)
        if let outcome = fight.outcome {
            hero.finish(victory: outcome == .victory)
            showBanner(outcome)
        } else if intro, fight.time < 1 {
            introduce(fight)
        }
        showHintIfNeeded()
    }

    /// The stage's title card: its number, the mode and the setting, and any new kind of foe with a word on beating it.
    private func introduce(_ fight: Fight) {
        let card = SKNode()
        card.position = CGPoint(x: field.midX, y: field.minY + field.height * 0.6)
        let newcomer = Difficulty.introduces(fight.stage)
        let tall: CGFloat = (newcomer != nil ? 68 : 50) * fs
        card.addChild(Icons.plate(CGSize(width: min(field.width - 16, 300 * fs), height: tall)))
        let top = tall / 2
        let title = Art.label(Art.headingFont, size: 24 * fs, color: .white)
        title.text = "STAGE \(fight.stage)"
        title.position = CGPoint(x: 0, y: top - 16 * fs)
        card.addChild(title)
        let sub = Art.label(Art.headingFont, size: 11 * fs, color: Icons.color(of: fight.mode).color())
        sub.text = fight.mode.title.uppercased() + "  ·  " + fight.setting.name.uppercased()
        sub.position = CGPoint(x: 6 * fs, y: top - 34 * fs)
        card.addChild(sub)
        let glyph = Icons.mode(fight.mode, 11 * fs)
        glyph.position = CGPoint(x: sub.position.x - sub.frame.width / 2 - 10 * fs, y: sub.position.y)
        card.addChild(glyph)
        if let kind = newcomer {
            let line = SKNode()
            line.position = CGPoint(x: 0, y: top - 54 * fs)
            let tip = Art.label(Art.headingFont, size: 11 * fs, color: Palette.gold.color())
            tip.text = kind == .warlord ? "A WARLORD AWAITS" : DuelScene.tip(kind)
            tip.horizontalAlignmentMode = .left
            let icon: SKNode
            if kind == .warlord {
                icon = Icons.crest(16 * fs)
            } else {
                // On the dark plate the silhouette is drawn light, in the gold of the tip.
                let figure = SKSpriteNode(texture: Figures.texture(.foe(kind), .idle(0)))
                figure.color = Palette.gold.color()
                figure.colorBlendFactor = 1
                figure.anchorPoint = Figures.anchor
                figure.size = Figures.size(.foe(kind), ronin: 20 * fs)
                figure.position = CGPoint(x: 0, y: -9 * fs)
                let lit = SKNode()
                lit.addChild(figure)
                icon = lit
            }
            let width = tip.frame.width + 26 * fs
            icon.position = CGPoint(x: -width / 2 + 8 * fs, y: 0)
            tip.position = CGPoint(x: -width / 2 + 22 * fs, y: 0)
            line.addChild(icon)
            line.addChild(tip)
            card.addChild(line)
        } else if fight.difficulty.boss {
            let crest = Icons.crest(14 * fs)
            crest.position = CGPoint(x: 0, y: -top - 4 * fs)
            card.addChild(crest)
        }
        card.alpha = 0
        card.setScale(1.12)
        overlay.addChild(card)
        card.run(.sequence([
            .group([.fadeIn(withDuration: 0.18), .scale(to: 1, duration: 0.22)]).easedOut(),
            .wait(forDuration: newcomer != nil ? 1.9 : 1.1),
            .group([.fadeOut(withDuration: 0.3), .scale(to: 0.96, duration: 0.3)]),
            .removeFromParent(),
        ]))
    }

    static func tip(_ kind: Kind) -> String {
        switch kind {
        case .grunt: return "ONE CUT"
        case .runner: return "FAST — ONE CUT"
        case .brute: return "THREE CUTS"
        case .archer: return "CUT THE ARROW BACK"
        case .dancer: return "LEAPS OVER YOU"
        case .warlord: return "MANY CUTS"
        }
    }

    /// Until you have cut down a foe on each side: a mouse on each side of the lane, the button for that side lit.
    private func showHintIfNeeded() {
        hint?.removeFromParent()
        hint = nil
        guard !Settings.hintShown, session.fight.outcome == nil else { return }
        hintSides = []
        let node = SKNode()
        node.zPosition = 55
        for side in Side.allCases {
            let mouse = SKNode()
            mouse.name = side == .left ? "left" : "right"
            mouse.position = CGPoint(x: laneX(side.sign * 0.62), y: groundY + ronin * 0.2)
            mouse.addChild(Icons.plate(CGSize(width: 44 * fs, height: 30 * fs), alpha: 0.7))
            let icon = Icons.mouse(20 * fs, lit: side, Palette.ink.color())
            icon.position = CGPoint(x: -side.sign.cg * 7 * fs, y: 0)
            mouse.addChild(icon)
            let arrow = Icons.play(10 * fs, Palette.gold.color())
            arrow.xScale = side == .left ? -1 : 1
            arrow.position = CGPoint(x: side.sign.cg * 11 * fs, y: 0)
            mouse.addChild(arrow)
            mouse.run(.repeatForever(.sequence([.fadeAlpha(to: 0.45, duration: 0.8), .fadeAlpha(to: 1, duration: 0.8)])))
            node.addChild(mouse)
        }
        addChild(node)
        hint = node
    }

    private func noteKill(_ side: Side) {
        guard let hint else { return }
        hintSides.insert(side)
        hint.childNode(withName: side == .left ? "left" : "right")?.run(.sequence([.fadeOut(withDuration: 0.3), .removeFromParent()]))
        if hintSides.count == 2 {
            Settings.hintShown = true
            hint.run(.sequence([.wait(forDuration: 0.3), .removeFromParent()]))
            self.hint = nil
        }
    }

    // MARK: Layout

    override func didChangeSize(_ oldSize: CGSize) {
        guard built else { return }
        layout()
    }

    func laneX(_ x: Double) -> CGFloat { field.midX + CGFloat(x) * field.width / 2 }

    /// Where the scene draws a lane position, at the height of a figure's middle.
    func point(lane x: Double) -> CGPoint { CGPoint(x: laneX(x), y: groundY + ronin * 0.5) }

    private func layout() {
        guard built else { return }
        let w = size.width
        pill.isHidden = !isCompact
        for node in [scenery, world, hud, overlay, header, vignette, rage, wound, flashSky] as [SKNode] { node.isHidden = isCompact }
        weather?.isHidden = isCompact
        hint?.isHidden = isCompact
        if isCompact {
            layoutPill()
            refreshCurtain()
            return
        }
        field = CGRect(x: 0, y: 0, width: w, height: max(40, top))
        groundY = field.minY + field.height * 0.16
        ronin = field.height * 0.52
        buildScenery()
        hero.layout(ronin: ronin, home: CGPoint(x: heroX, y: groundY))
        for sprite in foeSprites.values { sprite.layout(ronin: ronin) }
        vignette.size = CGSize(width: w * 1.25, height: field.height * 1.6)
        vignette.position = CGPoint(x: field.midX, y: field.midY)
        rage.size = vignette.size
        rage.position = vignette.position
        wound.size = field.size
        flashSky.size = field.size
        banner?.position = CGPoint(x: field.midX, y: field.midY)
        if hint != nil { showHintIfNeeded() }

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
        progressTrack.size = CGSize(width: w, height: 3)
        progressTrack.position = CGPoint(x: 0, y: top)
        progressFill.position = CGPoint(x: 0, y: top)
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
        modeGlyph.position = CGPoint(x: 13, y: mid)
        titleLabel.position = CGPoint(x: 24, y: mid)
        let heartsX = 24 + max(titleLabel.frame.width, 58) + 12
        for (k, heart) in hearts.enumerated() { heart.position = CGPoint(x: heartsX + CGFloat(k) * 12, y: mid) }
        scoreLabel.position = CGPoint(x: size.width - 48, y: mid)
    }

    private func layoutPill() {
        let h = size.height
        pillGlyph.position = CGPoint(x: 13, y: h / 2)
        pillLabel.position = CGPoint(x: 24, y: h / 2)
        for (k, heart) in pillHearts.enumerated() { heart.position = CGPoint(x: 96 + CGFloat(k) * 9, y: h / 2) }
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
                hitStop -= dt
            } else {
                slowmo = min(1, slowmo + dt * 1.8)
                for event in session.advance(dt * timeScale * slowmo) { handle(event) }
                advanced = true
            }
            storm(dt)
        }
        if world.speed < 1 { world.speed = min(1, world.speed + CGFloat(dt) * 0.9) }
        shakeWorld(dt)
        // Between steps (hit-stop, a pause) every figure holds its frame.
        sync(advanced || session.fight.outcome != nil ? dt : 0)
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
            flashSky.run(.sequence([
                .fadeAlpha(to: 0.35, duration: 0.03), .fadeAlpha(to: 0.05, duration: 0.08),
                .fadeAlpha(to: 0.25, duration: 0.03), .fadeOut(withDuration: 0.4),
            ]))
        }
    }

    private func shakeWorld(_ dt: Double) {
        guard shakeAmount > 0.05 else {
            if world.position != .zero { world.position = .zero }
            shakeAmount = 0
            return
        }
        let a = shakeAmount * ronin / 60
        world.position = CGPoint(x: .random(in: -a...a), y: .random(in: -a...a))
        shakeAmount *= CGFloat(pow(0.002, dt))
    }

    private func shake(_ amount: CGFloat) { shakeAmount = max(shakeAmount, amount) }

    /// Makes the sprites match the fight.
    private func sync(_ dt: Double) {
        let fight = session.fight
        var live = Set<Int>()
        for foe in fight.foes where foe.alive {
            live.insert(foe.id)
            let sprite: FoeSprite
            if let existing = foeSprites[foe.id] {
                sprite = existing
            } else {
                sprite = FoeSprite(foe: foe, ronin: ronin)
                sprite.zPosition = foe.kind == .warlord ? 4 : 3
                figures.addChild(sprite)
                foeSprites[foe.id] = sprite
            }
            let air = foe.phase == .leaping ? CGFloat(sin(foe.progress * .pi)) * ronin * 0.95 : 0
            sprite.update(foe, at: CGPoint(x: laneX(foe.x), y: groundY), air: air, hero: heroX, dt: dt)
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
        hero.update(dt: dt, bloodlust: fight.inBloodlust)
        refreshHUD()
    }

    private func refreshHUD(force: Bool = false) {
        let fight = session.fight
        if isCompact {
            refreshPill()
            return
        }
        // The reach marks light up when a cut to that side would land.
        for (k, mark) in reachMarks.enumerated() {
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
        for node in [comboBack, comboLabel, comboShadow, comboTimes] as [SKNode] { node.isHidden = !showCombo }
        let boss = fight.boss
        let comboY = top - (boss != nil ? 34 : 24) * fs
        comboLabel.position = CGPoint(x: field.midX, y: comboY)
        comboShadow.position = CGPoint(x: field.midX + 1.5, y: comboY - 1.5)
        comboTimes.position = CGPoint(x: field.midX + comboLabel.frame.width / 2 + 4, y: comboY - 3 * fs)
        comboBack.size = CGSize(width: 130 * fs, height: 56 * fs)
        comboBack.position = CGPoint(x: field.midX, y: comboY)

        // The warlord's bar, under his crest.
        bossNode.isHidden = boss == nil
        if let boss {
            let width = min(field.width * 0.5, 240)
            bossNode.position = CGPoint(x: field.midX, y: top - 10)
            bossTrack.path = CGPath(roundedRect: CGRect(x: -width / 2, y: -3.5, width: width, height: 7), cornerWidth: 3.5, cornerHeight: 3.5, transform: nil)
            bossFill.size = CGSize(width: max(0, (width - 2) * CGFloat(boss.hp) / CGFloat(max(1, boss.maxHP))), height: 5)
            bossFill.position = CGPoint(x: -width / 2 + 1, y: 0)
            bossNode.childNode(withName: "crest")?.position = CGPoint(x: -width / 2 - 12, y: 1)
        }
        let heartbeat: CGFloat = fight.hp == 1 && fight.outcome == nil ? 0.35 + 0.35 * CGFloat(max(0, sin(clock * 7))) : 0
        let rageTarget: CGFloat = fight.inBloodlust ? 0.5 + 0.15 * CGFloat(sin(clock * 6)) : heartbeat
        rage.alpha += (rageTarget - rage.alpha) * 0.2

        if fight.hp != shownHP || force {
            if fight.hp < shownHP {
                for k in fight.hp..<min(shownHP, hearts.count) {
                    hearts[k].run(.sequence([.scale(to: 1.9, duration: 0.06), .scale(to: 1, duration: 0.2)]))
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
        scoreLabel.text = DuelScene.grouped(fight.score)
        progressFill.size = CGSize(width: size.width * CGFloat(fight.progress), height: 3)
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
        pillLabel.text = "STAGE \(fight.stage)"
        for (k, heart) in pillHearts.enumerated() {
            heart.isHidden = k >= fight.maxHP
            let full = k < fight.hp
            heart.fillColor = full ? Palette.blood.color() : .clear
            heart.strokeColor = full ? .clear : SKColor(white: 1, alpha: 0.35)
        }
        switch fight.outcome {
        case .victory?: pillValue.text = "WON"
        case .defeat?: pillValue.text = "FELL"
        case nil: pillValue.text = "\(fight.remaining) LEFT"
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

    // MARK: Events

    private func handle(_ event: FightEvent) {
        let fight = session.fight
        switch event {
        case .cut(let side, let id, let killed):
            guard let sprite = foeSprites[id] else { return }
            let target = CGPoint(x: sprite.position.x, y: groundY + sprite.height * 0.55)
            hero.cut(side, distance: abs(sprite.position.x - heroX))
            dash(to: sprite.position.x, side: side)
            slash(at: target, side: side, strong: killed)
            if killed {
                sever(sprite, side: side)
                noteKill(side)
            } else {
                sprite.flashHit()
                sprite.showStagger()
                fx.addChild(at(target, Art.burst(Palette.steel, count: 16, speed: ronin * 2.2, size: ronin * 0.08, life: 0.25,
                                                  spread: 1.3, angle: side == .right ? 0 : .pi)))
                hitStop = max(hitStop, 0.035)
                shake(1.2)
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
            // A grey ✕ over his head: nothing was there.
            let miss = Icons.cross(ronin * 0.2, SKColor(white: 0.85, alpha: 1))
            miss.position = CGPoint(x: heroX, y: groundY + ronin * 1.2)
            miss.setScale(0.4)
            overlay.addChild(miss)
            miss.run(.sequence([.scale(to: 1, duration: 0.08), .wait(forDuration: 0.25),
                                .group([.fadeOut(withDuration: 0.25), .moveBy(x: 0, y: 6, duration: 0.25)]), .removeFromParent()]))
        case .deflected(let side, let id):
            let p = arrowSprites[id]?.position ?? CGPoint(x: heroX + side.sign.cg * ronin * 0.5, y: groundY + ronin * 0.6)
            hero.cut(side, distance: abs(p.x - heroX))
            slash(at: p, side: side, strong: false)
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
                sever(sprite, side: side)
                noteKill(side)
            } else {
                sprite.flashHit()
                sprite.showStagger()
            }
        case .raised:
            break
        case .wounded(let foe, let damage):
            hero.hurt()
            if let foe { foeSprites[foe]?.showStrike() }
            wound.removeAllActions()
            wound.alpha = damage > 1 ? 0.55 : 0.42
            wound.run(.fadeOut(withDuration: 0.45))
            let p = CGPoint(x: heroX, y: groundY + ronin * 0.55)
            fx.addChild(at(p, Art.burst(Palette.blood, count: 22, speed: ronin * 1.8, size: ronin * 0.07, life: 0.5,
                                        gravity: ronin * 5, additive: false)))
            shake(3 + CGFloat(damage) * 1.5)
            hitStop = max(hitStop, 0.07)
        case .leapt(let id):
            if let sprite = foeSprites[id] {
                fx.addChild(at(CGPoint(x: sprite.position.x, y: groundY + 2),
                               Art.burst(look.ground.mix(.white, 0.35), count: 12, speed: ronin * 0.8, size: ronin * 0.1, life: 0.35,
                                         spread: 1.2, angle: .pi / 2, additive: false)))
            }
        case .landed(let id):
            if let sprite = foeSprites[id] {
                fx.addChild(at(CGPoint(x: sprite.position.x, y: groundY + 2),
                               Art.burst(look.ground.mix(.white, 0.35), count: 14, speed: ronin * 0.9, size: ronin * 0.1, life: 0.35,
                                         spread: 1.4, angle: .pi / 2, additive: false)))
                if sprite.kind == .warlord { shake(2) }
            }
        case .bloodlust(let on):
            if on {
                slam("BLOODLUST", color: Palette.blood.mix(.white, 0.2))
                fx.addChild(at(CGPoint(x: heroX, y: groundY + ronin * 0.5), Art.shockwave(Palette.blood, radius: ronin * 0.3, grow: 5, width: 3, duration: 0.5)))
                shake(2.5)
            }
        case .milestone(let n):
            slam("\(n) HITS", color: Palette.gold, icon: Icons.swords(18 * fs, Palette.gold.color()))
            slowmo = 0.3
            world.speed = 0.4
            fx.addChild(at(CGPoint(x: heroX, y: groundY + ronin * 0.5), Art.shockwave(Palette.gold, radius: ronin * 0.3, grow: 6, width: 2.5, duration: 0.6)))
        case .warlord:
            slam("WARLORD", color: Palette.gold, icon: Icons.crest(20 * fs))
            shake(4)
            wound.removeAllActions()
            wound.alpha = 0.25
            wound.run(.fadeOut(withDuration: 0.8))
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

    private func slash(at p: CGPoint, side: Side, strong: Bool) {
        let bloodlust = session.fight.inBloodlust
        let s = ronin * (strong ? 1.3 : 1.0)
        for (k, color) in [(0, bloodlust ? Palette.blood : look.accent), (1, RGB.white)] {
            let arc = SKSpriteNode(texture: Art.crescent)
            arc.size = CGSize(width: s * (k == 0 ? 1.12 : 1), height: s * (k == 0 ? 1.12 : 1))
            arc.position = p
            arc.xScale = side == .right ? 1 : -1
            arc.zRotation = CGFloat.random(in: -0.7...0.5)
            arc.color = color.color()
            arc.colorBlendFactor = 1
            arc.blendMode = .add
            arc.alpha = k == 0 ? 0.8 : 1
            arc.run(.sequence([.group([.fadeOut(withDuration: 0.2), .scale(by: 1.15, duration: 0.2)]).easedOut(), .removeFromParent()]))
            fx.addChild(arc)
        }
        let line = SKSpriteNode(texture: Art.streak)
        line.size = CGSize(width: s * 1.6, height: s * 0.1)
        line.position = p
        line.zRotation = CGFloat.random(in: -0.5...0.5)
        line.color = .white
        line.colorBlendFactor = 1
        line.blendMode = .add
        line.run(.sequence([.group([.fadeOut(withDuration: 0.12), .scaleX(to: 1.4, duration: 0.12)]), .removeFromParent()]))
        fx.addChild(line)
    }

    /// A foe cut down: sliced at the waist, the top half thrown back, the legs folding, ink everywhere.
    private func sever(_ sprite: FoeSprite, side: Side) {
        foeSprites[sprite.id] = nil
        let boss = sprite.kind == .warlord
        guard let texture = sprite.body.texture else { sprite.removeFromParent(); return }
        let size = sprite.body.size, flip = sprite.body.xScale
        let anchorY = Figures.anchor.y, cut: CGFloat = 0.41
        let feet = sprite.position
        let seam = feet.y + size.height * (cut - anchorY)
        let away = side.sign.cg

        let upper = SKSpriteNode(texture: SKTexture(rect: CGRect(x: 0, y: cut, width: 1, height: 1 - cut), in: texture))
        upper.size = CGSize(width: size.width, height: size.height * (1 - cut))
        upper.anchorPoint = CGPoint(x: 0.5, y: 0.05)
        upper.xScale = flip
        upper.position = CGPoint(x: feet.x, y: seam + upper.size.height * 0.05)
        upper.zPosition = 4
        let throwX = away * ronin * CGFloat.random(in: 0.5...0.9), throwY = ronin * CGFloat.random(in: 0.25...0.45)
        let fly = SKAction.moveBy(x: throwX, y: throwY, duration: 0.3)
        fly.timingMode = .easeOut
        let drop = SKAction.moveBy(x: throwX * 0.4, y: -throwY - ronin * 0.35, duration: 0.35)
        drop.timingMode = .easeIn
        upper.run(.sequence([
            .group([.sequence([fly, drop]), .rotate(byAngle: -away * CGFloat.random(in: 1.2...2.4), duration: 0.65)]),
            .fadeOut(withDuration: 0.25), .removeFromParent(),
        ]))
        let lower = SKSpriteNode(texture: SKTexture(rect: CGRect(x: 0, y: 0, width: 1, height: cut), in: texture))
        lower.size = CGSize(width: size.width, height: size.height * cut)
        lower.anchorPoint = CGPoint(x: 0.5, y: anchorY / cut)
        lower.xScale = flip
        lower.position = feet
        lower.zPosition = 3
        lower.run(.sequence([
            .wait(forDuration: 0.12),
            .group([.scaleY(to: 0.35, duration: 0.3), .moveBy(x: away * ronin * 0.06, y: 0, duration: 0.3), .fadeOut(withDuration: 0.5)]),
            .removeFromParent(),
        ]))
        fx.addChild(lower)
        fx.addChild(upper)

        let gash = CGPoint(x: feet.x, y: seam)
        let spray: CGFloat = side == .right ? 0.6 : .pi - 0.6
        fx.addChild(at(gash, Art.burst(Palette.blood, count: boss ? 60 : 30, speed: ronin * 2.2, size: ronin * 0.075, life: 0.6,
                                       spread: 1.5, angle: spray, gravity: ronin * 6, additive: false)))
        fx.addChild(at(gash, Art.burst(Palette.blood.mix(.white, 0.2), count: 10, speed: ronin * 3, size: ronin * 0.1, life: 0.2,
                                       spread: 0.8, angle: spray)))
        let stain = SKSpriteNode(texture: Art.glow)
        stain.size = CGSize(width: ronin * 0.9, height: ronin * 0.12)
        stain.position = CGPoint(x: feet.x + away * ronin * 0.2, y: groundY)
        stain.color = RGB(0.35, 0, 0.03).color()
        stain.colorBlendFactor = 1
        stain.alpha = 0.8
        stain.zPosition = -1
        stain.run(.sequence([.wait(forDuration: 1.2), .fadeOut(withDuration: 1.2), .removeFromParent()]))
        fx.addChild(stain)
        sprite.removeFromParent()

        if boss {
            hitStop = max(hitStop, 0.25)
            world.speed = 0.25
            fx.addChild(at(gash, Art.shockwave(Palette.gold, radius: ronin * 0.3, grow: 7, width: 3, duration: 0.8)))
            fx.addChild(at(gash, Art.burst(Palette.gold, count: 70, speed: ronin * 3, size: ronin * 0.1, life: 0.9)))
            shake(6)
        } else {
            hitStop = max(hitStop, sprite.kind == .brute ? 0.07 : 0.04)
            shake(sprite.kind == .brute ? 2.4 : 1.4)
        }
    }

    /// Big text slammed onto the lane, on a dark plate, with an optional pictogram before it.
    private func slam(_ text: String, color: RGB, icon: SKNode? = nil) {
        let node = SKNode()
        node.position = CGPoint(x: field.midX, y: field.minY + field.height * 0.64)
        let label = Art.label(Art.headingFont, size: 21 * fs, color: color.color())
        label.text = text
        let iconWidth: CGFloat = icon == nil ? 0 : 24 * fs
        node.addChild(Icons.plate(CGSize(width: label.frame.width + iconWidth + 24 * fs, height: 32 * fs)))
        let glow = SKSpriteNode(texture: Art.glow)
        glow.size = CGSize(width: label.frame.width * 2, height: 60 * fs)
        glow.color = color.color()
        glow.colorBlendFactor = 1
        glow.blendMode = .add
        glow.alpha = 0.3
        node.addChild(glow)
        label.position = CGPoint(x: iconWidth / 2, y: 0)
        node.addChild(label)
        if let icon {
            icon.position = CGPoint(x: -label.frame.width / 2 - 2 * fs, y: 0)
            node.addChild(icon)
        }
        node.setScale(2.2)
        node.alpha = 0
        overlay.addChild(node)
        node.run(.sequence([
            .group([.scale(to: 1, duration: 0.12), .fadeIn(withDuration: 0.08)]).easedIn(),
            .wait(forDuration: 0.65),
            .group([.fadeOut(withDuration: 0.3), .scale(to: 1.08, duration: 0.3)]),
            .removeFromParent(),
        ]))
    }

    // MARK: The end of a stage

    private func finish(_ outcome: Outcome) {
        hero.finish(victory: outcome == .victory)
        world.speed = min(world.speed, 0.3)
        let delay: TimeInterval = outcome == .victory ? 0.9 : 1.1
        if outcome == .defeat {
            shake(5)
            let fall = SKSpriteNode(color: .black, size: field.size)
            fall.anchorPoint = .zero
            fall.alpha = 0
            fall.zPosition = -1
            overlay.addChild(fall)
            fall.run(.fadeAlpha(to: 0.35, duration: 0.8))
        } else {
            fx.addChild(at(CGPoint(x: heroX, y: groundY + ronin * 0.8), Art.burst(look.accent, count: 50, speed: ronin * 1.5,
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

    /// The end card: a big word, then kills, best combo and time as pictograms with numbers, the score, a rank-up if
    /// there was one, and a ▶ (or ↻ after a fall) to go on.
    private func showBanner(_ outcome: Outcome) {
        banner?.removeFromParent()
        let fight = session.fight
        let won = outcome == .victory
        let color = won ? (fight.stats.damage == 0 ? Palette.gold : look.accent.mix(.white, 0.3)) : Palette.blood.mix(.white, 0.25)
        let node = SKNode()
        node.position = CGPoint(x: field.midX, y: field.midY)
        let dim = SKSpriteNode(color: SKColor(white: 0, alpha: 0.62), size: CGSize(width: size.width * 2, height: size.height * 2))
        node.addChild(dim)
        let glow = SKSpriteNode(texture: Art.glow)
        glow.size = CGSize(width: field.width * 1.1, height: 80 * fs)
        glow.color = color.color()
        glow.colorBlendFactor = 1
        glow.blendMode = .add
        glow.alpha = 0.35
        glow.position = CGPoint(x: 0, y: 26 * fs)
        node.addChild(glow)
        let title = Art.label(Art.headingFont, size: 26 * fs, color: color.color())
        title.text = won ? (fight.stats.damage == 0 ? "FLAWLESS" : "CLEARED") : "FALLEN"
        title.position = CGPoint(x: 0, y: 32 * fs)
        node.addChild(title)

        // The numbers, each behind its pictogram.
        let seconds = Int(fight.time)
        let stats: [(SKNode, String)] = [
            (Icons.skull(13 * fs, Palette.ink.color()), "\(fight.stats.kills)"),
            (Icons.swords(13 * fs, Palette.ink.color()), "\(fight.stats.bestCombo)"),
            (Icons.clock(13 * fs, Palette.ink.color()), "\(seconds / 60):\(String(format: "%02d", seconds % 60))"),
        ]
        let row = SKNode()
        row.position = CGPoint(x: 0, y: 8 * fs)
        var x: CGFloat = 0
        for (icon, value) in stats {
            let label = Art.label(Art.headingFont, size: 15 * fs, color: Palette.ink.color(), align: .left)
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
        score.text = DuelScene.grouped(fight.score)
        score.position = CGPoint(x: 0, y: -12 * fs)
        node.addChild(score)
        var y = -30 * fs
        if let rank = session.promotion {
            let promo = Art.label(Art.headingFont, size: 12 * fs, color: Palette.gold.color())
            promo.text = "▲ " + rank.uppercased()
            promo.position = CGPoint(x: 0, y: y)
            promo.run(.repeatForever(.sequence([.scale(to: 1.08, duration: 0.5), .scale(to: 1, duration: 0.5)])))
            node.addChild(promo)
            y -= 17 * fs
        }
        let go = won ? Icons.play(14 * fs, Palette.ink.color()) : Icons.again(16 * fs, Palette.ink.color())
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

    /// Past the banner: the next stage, or this one again.
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

    /// Returns false for keys the scene does not use.
    func key(_ event: NSEvent) -> Bool {
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
