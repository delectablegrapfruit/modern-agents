import AppKit
import SpriteKit
import RoninCore

/// The lane, its header, the cards between stages, and the pill it folds into.
///
/// Click left of the ronin to cut left, right of him to cut right (or ←/→, A/D, F/J once the panel has the keys).
/// Leaving the panel pauses at once; coming back takes a short, visible dwell before the fight resumes, so a pointer
/// crossing the panel on its way somewhere else costs nothing. A click resumes at once, without cutting.
@MainActor
final class DuelScene: SKScene {
    enum HeaderHit { case none, drag, compact, close }

    static let headerHeight: CGFloat = 22
    static let pillSize = CGSize(width: 188, height: 28)
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
    private var shownFight: (stage: Int, seed: UInt64)?
    private var shownSetting: Setting?
    private var shownCombo = 0
    private var shownHP = Tuning.heroHP
    private var lightning = 0.0
    private(set) var pointer: CGPoint?

    private var field = CGRect(x: 0, y: 0, width: 420, height: 126)
    private var groundY: CGFloat = 20
    /// The ronin's height in points; everything on the lane scales from it.
    private var ronin: CGFloat = 60
    private var top: CGFloat { size.height - DuelScene.headerHeight }
    private var heroX: CGFloat { field.midX }
    private var look = Look.of(.crimsonDusk)

    // Back to front.
    private let scenery = SKNode()
    private let sky = SKSpriteNode()
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
    private let comboLabel = Art.label(Art.headingFont, size: 24, color: .white)
    private let comboShadow = Art.label(Art.headingFont, size: 24, color: SKColor(white: 0, alpha: 0.55))
    private let comboCaption = Art.label(Art.textFont, size: 7.5, color: SKColor(white: 1, alpha: 0.75))
    private let bossTrack = SKSpriteNode(color: SKColor(white: 0, alpha: 0.5), size: .zero)
    private let bossFill = SKSpriteNode(color: Palette.gold.color(), size: .zero)
    private let bossLabel = Art.label(Art.headingFont, size: 8, color: Palette.gold.color(), align: .left)
    private let overlay = SKNode()
    private var banner: SKNode?
    private var bannerShownAt = 0.0
    private var hint: SKLabelNode?
    private let curtain = SKSpriteNode(color: .black, size: .zero)
    private let curtainLabel = Art.label(Art.headingFont, size: 14, color: SKColor(white: 1, alpha: 0.85))
    private let curtainHint = Art.label(Art.textFont, size: 8, color: SKColor(white: 1, alpha: 0.5))
    private let engageRing = SKShapeNode()

    private let header = SKNode()
    private let headerBar = SKSpriteNode(color: Palette.header.color(), size: .zero)
    private let titleLabel = Art.label(Art.headingFont, size: 11.5, color: Palette.ink.color(0.95), align: .left)
    private let nameLabel = Art.label(Art.textFont, size: 8.5, color: Palette.ink.color(0.45), align: .left)
    private let scoreLabel = Art.label(Art.numberFont, size: 10.5, color: Palette.ink.color(0.85), align: .right)
    private let compactButton = SKShapeNode()
    private let closeButton = SKShapeNode()
    private var hearts: [SKShapeNode] = []
    private let progressTrack = SKSpriteNode(color: SKColor(white: 1, alpha: 0.07), size: .zero)
    private let progressFill = SKSpriteNode(color: .white, size: .zero)

    private let pill = SKNode()
    private let pillDot = SKShapeNode(path: Art.diamond(4.5))
    private let pillLabel = Art.label(Art.headingFont, size: 11, color: Palette.ink.color(0.95), align: .left)
    private var pillHearts: [SKShapeNode] = []
    private let pillValue = Art.label(Art.numberFont, size: 10, color: Palette.ink.color(0.8), align: .right)

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
            mark.lineWidth = 1.5
            mark.lineCap = .round
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
        vignette.alpha = 0.85
        addChild(vignette)

        hud.zPosition = 50
        addChild(hud)
        comboShadow.zPosition = -1
        for node in [comboShadow, comboLabel, comboCaption] as [SKNode] { hud.addChild(node) }
        bossTrack.anchorPoint = CGPoint(x: 0, y: 0.5)
        bossFill.anchorPoint = CGPoint(x: 0, y: 0.5)
        for node in [bossTrack, bossFill, bossLabel] as [SKNode] { hud.addChild(node) }

        overlay.zPosition = 60
        addChild(overlay)
        curtain.zPosition = 70
        curtain.alpha = 0.55
        curtain.anchorPoint = .zero
        curtainLabel.text = "PAUSED"
        curtainLabel.zPosition = 71
        curtainHint.zPosition = 71
        engageRing.zPosition = 72
        engageRing.strokeColor = Palette.ink.color()
        engageRing.lineWidth = 2
        engageRing.lineCap = .round
        for node in [curtain, curtainLabel, curtainHint, engageRing] as [SKNode] {
            node.isHidden = true
            addChild(node)
        }

        header.zPosition = 80
        addChild(header)
        headerBar.anchorPoint = .zero
        header.addChild(headerBar)
        progressTrack.anchorPoint = .zero
        progressFill.anchorPoint = .zero
        for node in [progressTrack, progressFill, titleLabel, nameLabel, scoreLabel] as [SKNode] { header.addChild(node) }
        for (button, glyph) in [(compactButton, "minus"), (closeButton, "close")] {
            button.path = Art.circle(6)
            button.fillColor = SKColor(white: 1, alpha: 0.08)
            button.strokeColor = .clear
            let mark = SKShapeNode()
            let path = CGMutablePath()
            if glyph == "minus" {
                path.move(to: CGPoint(x: -2.8, y: 0))
                path.addLine(to: CGPoint(x: 2.8, y: 0))
            } else {
                path.move(to: CGPoint(x: -2.2, y: -2.2))
                path.addLine(to: CGPoint(x: 2.2, y: 2.2))
                path.move(to: CGPoint(x: -2.2, y: 2.2))
                path.addLine(to: CGPoint(x: 2.2, y: -2.2))
            }
            mark.path = path
            mark.strokeColor = SKColor(white: 1, alpha: 0.55)
            mark.lineWidth = 1.2
            mark.lineCap = .round
            button.addChild(mark)
            header.addChild(button)
        }
        for _ in 0..<Tuning.heroHP {
            let heart = SKShapeNode(path: Art.diamond(3.6))
            heart.lineWidth = 1
            header.addChild(heart)
            hearts.append(heart)
            let small = SKShapeNode(path: Art.diamond(3))
            small.lineWidth = 1
            pill.addChild(small)
            pillHearts.append(small)
        }

        pill.zPosition = 90
        pill.isHidden = true
        addChild(pill)
        pillDot.fillColor = Palette.blood.color()
        pillDot.strokeColor = .clear
        pillDot.run(.repeatForever(.sequence([.fadeAlpha(to: 0.35, duration: 0.7), .fadeAlpha(to: 1, duration: 0.7)])))
        for node in [pillDot, pillLabel, pillValue] as [SKNode] { pill.addChild(node) }
    }

    /// Puts the session's fight on the lane: fresh sprites, the stage's scenery, and (for a new stage) its title card.
    func loadFight(intro: Bool) {
        let fight = session.fight
        shownFight = (fight.stage, fight.seed)
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
        nameLabel.text = fight.setting.name.uppercased()
        layoutHeaderText()
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

    private func introduce(_ fight: Fight) {
        let card = SKNode()
        card.position = CGPoint(x: field.midX, y: field.minY + field.height * 0.58)
        let band = SKSpriteNode(color: SKColor(white: 0, alpha: 0.5), size: CGSize(width: size.width, height: 40 * fontScale))
        card.addChild(band)
        let glow = SKSpriteNode(texture: Art.glow)
        glow.size = CGSize(width: field.width, height: 70 * fontScale)
        glow.color = look.accent.color()
        glow.colorBlendFactor = 1
        glow.blendMode = .add
        glow.alpha = 0.35
        card.addChild(glow)
        let title = Art.label(Art.headingFont, size: 21 * fontScale, color: .white)
        title.text = "STAGE \(fight.stage)"
        title.position = CGPoint(x: 0, y: 6 * fontScale)
        card.addChild(title)
        let sub = Art.label(Art.textFont, size: 8.5 * fontScale, color: Palette.ink.color(0.8))
        var line = fight.setting.name.uppercased() + "  ·  \(fight.roster.count) FOES"
        if let kind = Difficulty.introduces(fight.stage) {
            line = kind == .warlord ? "A WARLORD AWAITS" : "NEW: " + kind.title.uppercased() + "  —  " + DuelScene.tip(kind)
        } else if fight.difficulty.boss {
            line += "  ·  A WARLORD AWAITS"
        }
        sub.text = line
        sub.position = CGPoint(x: 0, y: -10 * fontScale)
        card.addChild(sub)
        card.alpha = 0
        card.setScale(1.15)
        overlay.addChild(card)
        card.run(.sequence([
            .group([.fadeIn(withDuration: 0.2), .scale(to: 1, duration: 0.25)]).easedOut(),
            .wait(forDuration: 1.1),
            .group([.fadeOut(withDuration: 0.35), .scale(to: 0.96, duration: 0.35)]),
            .removeFromParent(),
        ]))
    }

    static func tip(_ kind: Kind) -> String {
        switch kind {
        case .grunt: return "ONE CUT"
        case .runner: return "FAST"
        case .brute: return "THREE CUTS, EACH KNOCKS HIM BACK"
        case .archer: return "CUT HIS ARROW BACK AT HIM"
        case .dancer: return "LEAPS TO YOUR OTHER SIDE"
        case .warlord: return "MANY CUTS"
        }
    }

    private func showHintIfNeeded() {
        hint?.removeFromParent()
        hint = nil
        guard !Settings.hintShown, session.fight.outcome == nil else { return }
        let label = Art.label(Art.textFont, size: 8, color: Palette.ink.color(0.7))
        label.text = "click left or right of him to cut that way  ·  ← →"
        label.position = CGPoint(x: field.midX, y: groundY * 0.45)
        label.zPosition = 55
        label.run(.repeatForever(.sequence([.fadeAlpha(to: 0.35, duration: 1.1), .fadeAlpha(to: 1, duration: 1.1)])))
        addChild(label)
        hint = label
    }

    private func dismissHint() {
        guard let hint else { return }
        Settings.hintShown = true
        hint.run(.sequence([.fadeOut(withDuration: 0.4), .removeFromParent()]))
        self.hint = nil
    }

    // MARK: Layout

    override func didChangeSize(_ oldSize: CGSize) {
        guard built else { return }
        layout()
    }

    func laneX(_ x: Double) -> CGFloat { field.midX + CGFloat(x) * field.width / 2 }

    /// Where the scene draws a lane position, at the height of a figure's middle.
    func point(lane x: Double) -> CGPoint { CGPoint(x: laneX(x), y: groundY + ronin * 0.5) }

    private var fontScale: CGFloat { max(0.8, min(1.25, field.height / 126)) }

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
        groundY = field.minY + field.height * 0.17
        ronin = field.height * 0.5
        buildScenery()
        hero.layout(ronin: ronin, home: CGPoint(x: heroX, y: groundY))
        for sprite in foeSprites.values { sprite.layout(ronin: ronin) }
        vignette.size = CGSize(width: w * 1.25, height: field.height * 1.6)
        vignette.position = CGPoint(x: field.midX, y: field.midY)
        rage.size = vignette.size
        rage.position = vignette.position
        wound.size = field.size
        flashSky.size = field.size
        hint?.position = CGPoint(x: field.midX, y: groundY * 0.45)
        banner?.position = CGPoint(x: field.midX, y: field.midY)

        for (k, mark) in reachMarks.enumerated() {
            let path = CGMutablePath()
            path.move(to: CGPoint(x: 0, y: -3))
            path.addLine(to: CGPoint(x: 0, y: 3))
            path.move(to: CGPoint(x: -2.5, y: 0))
            path.addLine(to: CGPoint(x: 2.5, y: 0))
            mark.path = path
            mark.position = CGPoint(x: laneX((k == 0 ? -1 : 1) * session.fight.reach), y: groundY - 5)
        }

        headerBar.size = CGSize(width: w, height: DuelScene.headerHeight)
        headerBar.position = CGPoint(x: 0, y: top)
        progressTrack.size = CGSize(width: w, height: 2)
        progressTrack.position = CGPoint(x: 0, y: top)
        progressFill.position = CGPoint(x: 0, y: top)
        closeButton.position = CGPoint(x: w - 13, y: top + DuelScene.headerHeight / 2 + 1)
        compactButton.position = CGPoint(x: w - 30, y: top + DuelScene.headerHeight / 2 + 1)
        for (k, heart) in hearts.enumerated() {
            heart.position = CGPoint(x: w - 48 - CGFloat(Tuning.heroHP - 1 - k) * 9, y: top + DuelScene.headerHeight / 2 + 1)
        }
        layoutHeaderText()

        let fs = fontScale
        comboLabel.fontSize = 24 * fs
        comboShadow.fontSize = 24 * fs
        comboCaption.fontSize = 7.5 * fs
        bossLabel.text = "WARLORD"
        refreshHUD(force: true)
        refreshCurtain()
    }

    private func layoutHeaderText() {
        let mid = top + DuelScene.headerHeight / 2 + 1
        titleLabel.position = CGPoint(x: 10, y: mid)
        nameLabel.position = CGPoint(x: 10 + titleLabel.frame.width + 7, y: mid - 0.5)
        scoreLabel.position = CGPoint(x: (hearts.first?.position.x ?? size.width - 90) - 10, y: mid)
    }

    private func layoutPill() {
        let h = size.height
        pillDot.position = CGPoint(x: 14, y: h / 2)
        pillLabel.position = CGPoint(x: 25, y: h / 2)
        for (k, heart) in pillHearts.enumerated() { heart.position = CGPoint(x: 92 + CGFloat(k) * 7.5, y: h / 2) }
        pillValue.position = CGPoint(x: size.width - 11, y: h / 2)
        refreshPill()
    }

    /// Paints the setting: sky, sun, hills, landmarks, ground, weather.
    private func buildScenery() {
        scenery.removeAllChildren()
        weather?.removeFromParent()
        let w = field.width, h = field.height
        sky.texture = Art.gradient(look.top, look.horizon)
        sky.anchorPoint = .zero
        sky.size = field.size
        sky.position = .zero
        sky.zPosition = 0
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

        let far = SKShapeNode(path: Art.ridge(width: w, base: groundY, low: h * 0.1, high: h * 0.36, seed: UInt64(shownSetting?.rawValue ?? 0) &+ 11, jag: 6))
        far.fillColor = look.far.mix(look.horizon, 0.25).color()
        far.strokeColor = .clear
        far.zPosition = 3
        scenery.addChild(far)
        let mist = SKSpriteNode(texture: Art.glow)
        mist.size = CGSize(width: w * 1.6, height: h * 0.45)
        mist.position = CGPoint(x: field.midX, y: groundY + h * 0.06)
        mist.color = look.horizon.color()
        mist.colorBlendFactor = 1
        mist.blendMode = .add
        mist.alpha = 0.35
        mist.zPosition = 4
        scenery.addChild(mist)
        let near = SKShapeNode(path: Art.ridge(width: w, base: groundY, low: h * 0.03, high: h * 0.14, seed: 0xFA11 &+ UInt64(w), jag: 10))
        near.fillColor = look.near.color()
        near.strokeColor = .clear
        near.zPosition = 5
        scenery.addChild(near)
        let landmark = SKShapeNode(path: Art.landmark(look.landmark, width: w, height: h, ground: groundY, seed: 0x7EA))
        landmark.fillColor = look.near.scaled(0.55).color()
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
        let ground = SKSpriteNode(color: look.ground.color(), size: CGSize(width: w, height: groundY))
        ground.anchorPoint = .zero
        ground.zPosition = 8
        scenery.addChild(ground)
        let edge = SKSpriteNode(color: look.horizon.color(0.45), size: CGSize(width: w, height: 1))
        edge.anchorPoint = .zero
        edge.position = CGPoint(x: 0, y: groundY)
        edge.zPosition = 9
        scenery.addChild(edge)

        let rain = Art.weather(look.weather, size: field.size, tint: look.horizon)
        rain.zPosition = 30
        addChild(rain)
        weather = rain
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
        for node in [curtain, curtainLabel, curtainHint] as [SKNode] { node.isHidden = !show }
        if !show || !isEngaging { engageRing.isHidden = true }
        guard show else { return }
        curtain.size = CGSize(width: size.width, height: top)
        curtainLabel.position = CGPoint(x: size.width / 2, y: top / 2 + 6)
        curtainHint.position = CGPoint(x: size.width / 2, y: top / 2 - 9)
        curtainHint.text = isEngaging ? "steady…" : "hover to resume  ·  click to jump in"
    }

    // MARK: The loop

    override func update(_ currentTime: TimeInterval) {
        let dt = lastUpdate.map { min(0.1, max(0, currentTime - $0)) } ?? 0
        lastUpdate = currentTime
        clock += dt
        guard !isCompact else { return }
        let fight = session.fight
        if let shown = shownFight, shown.stage != fight.stage || shown.seed != fight.seed { loadFight(intro: true) }

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
        path.addArc(center: pointer, radius: 11, startAngle: .pi / 2, endAngle: .pi / 2 - t * 2 * .pi, clockwise: true)
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
            sprite.update(foe, at: CGPoint(x: laneX(foe.x), y: groundY), air: air, dt: dt)
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
            sprite.update(arrow, at: CGPoint(x: laneX(arrow.x), y: groundY + ronin * 0.62))
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
            mark.strokeColor = live ? (fight.inBloodlust ? Palette.blood : look.accent).mix(.white, 0.3).color() : SKColor(white: 1, alpha: 0.22)
            mark.glowWidth = live ? 2 : 0
        }
        if fight.combo != shownCombo || force {
            if fight.combo > shownCombo, fight.combo >= 3 {
                comboLabel.removeAction(forKey: "pop")
                comboLabel.setScale(1.35)
                comboLabel.run(SKAction.scale(to: 1, duration: 0.14).easedOut(), withKey: "pop")
            }
            shownCombo = fight.combo
            let show = fight.combo >= 3
            comboLabel.isHidden = !show
            comboShadow.isHidden = !show
            comboCaption.isHidden = !show
            comboLabel.text = "\(fight.combo)"
            comboShadow.text = comboLabel.text
            comboLabel.fontColor = fight.inBloodlust ? Palette.blood.mix(.white, 0.25).color() : fight.combo >= 10 ? Palette.gold.color() : .white
            comboCaption.text = fight.inBloodlust ? "BLOODLUST  ·  ×\(fight.multiplier)" : "COMBO  ·  ×\(fight.multiplier)"
        }
        let bossAlive = fight.boss != nil
        let comboY = top - (bossAlive ? 30 : 22) * fontScale
        comboLabel.position = CGPoint(x: field.midX, y: comboY)
        comboShadow.position = CGPoint(x: field.midX + 1.5, y: comboY - 1.5)
        comboCaption.position = CGPoint(x: field.midX, y: comboY - 16 * fontScale)
        bossTrack.isHidden = !bossAlive
        bossFill.isHidden = !bossAlive
        bossLabel.isHidden = !bossAlive
        if let boss = fight.boss {
            let width = field.width * 0.5
            bossTrack.size = CGSize(width: width, height: 4)
            bossTrack.position = CGPoint(x: field.midX - width / 2, y: top - 9)
            bossFill.size = CGSize(width: width * CGFloat(boss.hp) / CGFloat(max(1, boss.maxHP)), height: 4)
            bossFill.position = bossTrack.position
            bossLabel.position = CGPoint(x: bossTrack.position.x - 46, y: top - 9)
        }
        let rageTarget: CGFloat = fight.inBloodlust ? 0.5 + 0.15 * CGFloat(sin(clock * 6)) : fight.hp == 1 && fight.outcome == nil ? 0.35 + 0.35 * CGFloat(max(0, sin(clock * 7))) : 0
        rage.alpha += (rageTarget - rage.alpha) * 0.2

        if fight.hp != shownHP || force {
            if fight.hp < shownHP {
                for k in fight.hp..<min(shownHP, hearts.count) {
                    hearts[k].run(.sequence([.scale(to: 1.8, duration: 0.06), .scale(to: 1, duration: 0.2)]))
                }
            }
            shownHP = fight.hp
        }
        for (k, heart) in hearts.enumerated() {
            let full = k < fight.hp
            heart.fillColor = full ? Palette.blood.color() : .clear
            heart.strokeColor = full ? Palette.blood.mix(.white, 0.3).color() : SKColor(white: 1, alpha: 0.25)
        }
        scoreLabel.text = DuelScene.grouped(fight.score)
        progressFill.size = CGSize(width: size.width * CGFloat(fight.progress), height: 2)
    }

    private func refreshPill() {
        let fight = session.fight
        pillLabel.text = "STAGE \(fight.stage)"
        for (k, heart) in pillHearts.enumerated() {
            let full = k < fight.hp
            heart.fillColor = full ? Palette.blood.color() : .clear
            heart.strokeColor = full ? .clear : SKColor(white: 1, alpha: 0.3)
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
                dismissHint()
            } else {
                sprite.flashHit()
                sprite.showStagger()
                fx.addChild(at(target, Art.burst(Palette.steel, count: 16, speed: ronin * 2.2, size: ronin * 0.08, life: 0.25,
                                                  spread: 1.3, angle: side == .right ? 0 : .pi)))
                hitStop = max(hitStop, 0.035)
                shake(1.2)
            }
        case .whiff(let side):
            hero.whiff(side)
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
            toast("MISS", color: RGB(0.75, 0.75, 0.75), at: CGPoint(x: heroX, y: groundY + ronin * 1.15))
        case .deflected(let side, let id):
            let p = arrowSprites[id]?.position ?? CGPoint(x: heroX + side.sign.cg * ronin * 0.5, y: groundY + ronin * 0.6)
            hero.cut(side, distance: abs(p.x - heroX))
            slash(at: p, side: side, strong: false)
            fx.addChild(at(p, Art.burst(Palette.gold, count: 24, speed: ronin * 2.6, size: ronin * 0.09, life: 0.35)))
            fx.addChild(at(p, Art.shockwave(Palette.gold, radius: ronin * 0.12, grow: 3, width: 1.5, duration: 0.3)))
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
            if let p { fx.addChild(at(p, Art.burst(Palette.gold, count: 18, speed: ronin * 2, size: ronin * 0.08, life: 0.3))) }
            if killed {
                sever(sprite, side: side)
                toast("RETURNED", color: Palette.gold, at: CGPoint(x: sprite.position.x, y: groundY + sprite.height * 1.25))
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
            wound.alpha = damage > 1 ? 0.55 : 0.4
            wound.run(.fadeOut(withDuration: 0.45))
            let p = CGPoint(x: heroX, y: groundY + ronin * 0.55)
            fx.addChild(at(p, Art.burst(Palette.blood, count: 22, speed: ronin * 1.8, size: ronin * 0.07, life: 0.5,
                                        gravity: ronin * 5, additive: false)))
            shake(3 + CGFloat(damage) * 1.5)
            hitStop = max(hitStop, 0.07)
            if fight.combo == 0, shownCombo >= 10 { toast("COMBO BROKEN", color: RGB(0.8, 0.8, 0.8), at: CGPoint(x: field.midX, y: top - 50 * fontScale)) }
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
                slam("BLOODLUST", color: Palette.blood.mix(.white, 0.15), size: 22)
                fx.addChild(at(CGPoint(x: heroX, y: groundY + ronin * 0.5), Art.shockwave(Palette.blood, radius: ronin * 0.3, grow: 5, width: 2.5, duration: 0.5)))
                shake(2.5)
            }
        case .milestone(let n):
            slam("\(n) HITS", color: Palette.gold, size: 20)
            slowmo = 0.3
            world.speed = 0.4
            fx.addChild(at(CGPoint(x: heroX, y: groundY + ronin * 0.5), Art.shockwave(Palette.gold, radius: ronin * 0.3, grow: 6, width: 2, duration: 0.6)))
        case .warlord:
            slam("THE WARLORD", color: Palette.gold, size: 20)
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
        let anchorY = Figures.anchor.y, cut: CGFloat = 0.43
        let feet = CGPoint(x: sprite.position.x, y: sprite.position.y)
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

    private func toast(_ text: String, color: RGB, at p: CGPoint) {
        let label = Art.label(Art.headingFont, size: 9 * fontScale, color: color.color())
        label.text = text
        label.position = p
        label.alpha = 0
        overlay.addChild(label)
        label.run(.sequence([
            .fadeIn(withDuration: 0.08), .wait(forDuration: 0.4),
            .group([.fadeOut(withDuration: 0.35), .moveBy(x: 0, y: 8, duration: 0.35)]), .removeFromParent(),
        ]))
    }

    /// Big text slammed onto the middle of the lane.
    private func slam(_ text: String, color: RGB, size: CGFloat) {
        let node = SKNode()
        node.position = CGPoint(x: field.midX, y: field.minY + field.height * 0.62)
        let glow = SKSpriteNode(texture: Art.glow)
        glow.size = CGSize(width: field.width * 0.8, height: 60 * fontScale)
        glow.color = color.color()
        glow.colorBlendFactor = 1
        glow.blendMode = .add
        glow.alpha = 0.4
        node.addChild(glow)
        let shadow = Art.label(Art.headingFont, size: size * fontScale, color: SKColor(white: 0, alpha: 0.6))
        shadow.text = text
        shadow.position = CGPoint(x: 1.5, y: -1.5)
        node.addChild(shadow)
        let label = Art.label(Art.headingFont, size: size * fontScale, color: color.color())
        label.text = text
        node.addChild(label)
        node.setScale(2.2)
        node.alpha = 0
        overlay.addChild(node)
        node.run(.sequence([
            .group([.scale(to: 1, duration: 0.12), .fadeIn(withDuration: 0.08)]).easedIn(),
            .wait(forDuration: 0.6),
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

    private func showBanner(_ outcome: Outcome) {
        banner?.removeFromParent()
        let fight = session.fight
        let won = outcome == .victory
        let color = won ? look.accent.mix(.white, 0.25) : Palette.blood.mix(.white, 0.2)
        let fs = fontScale
        let node = SKNode()
        node.position = CGPoint(x: field.midX, y: field.midY)
        let dim = SKSpriteNode(color: SKColor(white: 0, alpha: 0.6), size: CGSize(width: size.width * 2, height: size.height * 2))
        node.addChild(dim)
        let glow = SKSpriteNode(texture: Art.glow)
        glow.size = CGSize(width: field.width * 1.1, height: 80 * fs)
        glow.color = color.color()
        glow.colorBlendFactor = 1
        glow.blendMode = .add
        glow.alpha = 0.4
        glow.position = CGPoint(x: 0, y: 22 * fs)
        node.addChild(glow)
        let title = Art.label(Art.headingFont, size: 20 * fs, color: color.color())
        title.text = won ? (fight.stats.damage == 0 ? "FLAWLESS" : "STAGE CLEARED") : "FALLEN"
        title.position = CGPoint(x: 0, y: 30 * fs)
        node.addChild(title)
        let seconds = Int(fight.time)
        let lines = [
            won ? "Stage \(fight.stage) · \(fight.setting.name) · \(seconds / 60):\(String(format: "%02d", seconds % 60))"
                : "Stage \(fight.stage) · \(fight.defeated) of \(fight.roster.count) cut down",
            "\(fight.stats.kills) kills  ·  best combo \(fight.stats.bestCombo)  ·  \(DuelScene.grouped(fight.score)) pts",
        ]
        for (k, text) in lines.enumerated() {
            let line = Art.label(Art.textFont, size: 8.5 * fs, color: Palette.ink.color(k == 0 ? 0.85 : 0.6))
            line.text = text
            line.position = CGPoint(x: 0, y: (11 - CGFloat(k) * 13) * fs)
            node.addChild(line)
        }
        var y = -20 * fs
        if let rank = session.promotion {
            let promo = Art.label(Art.headingFont, size: 10.5 * fs, color: Palette.gold.color())
            promo.text = "RANK UP  —  \(rank.uppercased())"
            promo.position = CGPoint(x: 0, y: y)
            promo.run(.repeatForever(.sequence([.scale(to: 1.06, duration: 0.5), .scale(to: 1, duration: 0.5)])))
            node.addChild(promo)
            y -= 14 * fs
        }
        let prompt = Art.label(Art.textFont, size: 8 * fs, color: Palette.ink.color(0.65))
        prompt.text = won ? "click for stage \(fight.stage + 1)  ▸" : "click to rise again  ▸"
        prompt.position = CGPoint(x: 0, y: y - 2 * fs)
        prompt.run(.repeatForever(.sequence([.fadeAlpha(to: 0.3, duration: 0.7), .fadeAlpha(to: 1, duration: 0.7)])))
        node.addChild(prompt)
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
        if hypot(p.x - closeButton.position.x, p.y - closeButton.position.y) <= 9 { return .close }
        if hypot(p.x - compactButton.position.x, p.y - compactButton.position.y) <= 9 { return .compact }
        return .drag
    }

    func pointerMoved(to p: CGPoint) {
        pointer = p
        if isEngaging { drawEngageRing() }
    }

    func pointerDown(at p: CGPoint) {
        pointer = p
        guard !isCompact else { return }
        if session.fight.outcome != nil {
            if banner != nil, clock - bannerShownAt > 0.5 { advanceFromBanner() }
            return
        }
        if isAwayPaused {
            engage()
            return
        }
        strike(p.x < heroX ? .left : .right)
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
        if isAwayPaused, session.fight.outcome == nil { engage(); return true }
        strike(side)
        return true
    }
}
