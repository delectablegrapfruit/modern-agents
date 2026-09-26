import AppKit
import SpriteKit
import OnslaughtCore

/// The arena, its header, the cards between fights, and the pill it folds into.
///
/// The ship flies to the pointer: no click, no keyboard, so the app you work in keeps its focus. Clicking sets off
/// the nova when it is charged. Leaving the panel pauses at once; coming back takes a short, visible dwell before the
/// fight resumes, so sweeping the pointer across the panel on the way to something else never costs you a hit.
@MainActor
final class ArenaScene: SKScene {
    enum HeaderHit { case none, drag, compact, close }

    static let headerHeight: CGFloat = 22
    static let pillSize = CGSize(width: 176, height: 28)
    /// Seconds the pointer must rest on the panel before the fight resumes.
    static let dwell = 0.35

    let session: GameSession
    /// Simulation seconds per real second (the self-test fast-forwards).
    var timeScale = 1.0
    private(set) var isCompact = false
    private(set) var isAwayPaused = true
    private(set) var isEngaging = false
    private var engageClock = 0.0
    /// Eases the fight back in after a pause: starts slow, reaches full speed in about half a second.
    private var ramp = 1.0
    private var hitStop = 0.0
    private var shakeAmount: CGFloat = 0
    private var clock = 0.0
    private var lastUpdate: TimeInterval?
    private var built = false
    private var unit: CGFloat = 1
    private var worldOrigin = CGPoint.zero
    private var top: CGFloat { size.height - ArenaScene.headerHeight }
    private(set) var pointer: CGPoint?

    // Back to front.
    private let background = SKSpriteNode(color: Palette.background.color(), size: .zero)
    private let backdrop = SKNode()
    private var stars: [(node: SKSpriteNode, speed: CGFloat)] = []
    private let nebulaTop = SKSpriteNode(texture: Art.glow)
    private let nebulaBottom = SKSpriteNode(texture: Art.glow)
    private let world = SKNode()
    private let laserLayer = SKNode()
    private let shotLayer = SKNode()
    private let bossLayer = SKNode()
    private let droneLayer = SKNode()
    private let bulletLayer = SKNode()
    private let fxLayer = SKNode()
    private var bossNode: BossNode?
    private let shipNode = ShipNode()
    private let novaWave = SKSpriteNode(texture: Art.ring)
    private var bulletSprites: [SKSpriteNode] = []
    private var bulletKeys: [Int] = []
    private var shotSprites: [SKSpriteNode] = []
    private var shotKinds: [Int] = []
    private var beams: [(warn: SKSpriteNode, glow: SKSpriteNode, core: SKSpriteNode)] = []

    private let hud = SKNode()
    private let hpTrack = SKSpriteNode(color: SKColor(white: 1, alpha: 0.08), size: .zero)
    private let hpFill = SKSpriteNode(color: .white, size: .zero)
    private var notches: [SKSpriteNode] = []
    private let scoreLabel = Art.label(Art.numberFont, size: 9, color: Palette.ink.color(0.5), align: .left)
    private var shownScore = -1
    private let overlay = SKNode()
    private let flashLayer = SKSpriteNode(color: .white, size: .zero)
    private let vignette = SKSpriteNode(texture: Art.vignette)
    private let curtain = SKSpriteNode(color: SKColor(white: 0, alpha: 1), size: .zero)
    private let curtainTitle = Art.label(Art.headingFont, size: 13, color: SKColor(white: 1, alpha: 0.75))
    private let curtainHint = Art.label(Art.textFont, size: 8, color: SKColor(white: 1, alpha: 0.45))
    private let engageRing = SKShapeNode()

    private let header = SKNode()
    private let headerBar = SKSpriteNode(color: Palette.header.color(), size: .zero)
    private let headerRule = SKSpriteNode(color: SKColor(white: 1, alpha: 0.06), size: .zero)
    private let waveLabel = Art.label(Art.headingFont, size: 11, color: Palette.ink.color(0.95), align: .left)
    private let nameLabel = Art.label(Art.textFont, size: 7.5, color: Palette.ink.color(0.45), align: .left)
    private let compactButton = SKShapeNode()
    private let closeButton = SKShapeNode()
    private var hullPips: [SKShapeNode] = []
    private var shownHull = (-1, -1)

    private let pill = SKNode()
    private let pillDot = SKShapeNode(circleOfRadius: 4)
    private let pillLabel = Art.label(Art.headingFont, size: 11, color: Palette.ink.color(0.95), align: .left)
    private let pillTrack = SKSpriteNode(color: SKColor(white: 1, alpha: 0.12), size: CGSize(width: 56, height: 4))
    private let pillFill = SKSpriteNode(color: Palette.danger.color(), size: CGSize(width: 0, height: 4))
    private let pillValue = Art.label(Art.numberFont, size: 10, color: Palette.ink.color(0.8), align: .right)

    private var card: SKNode?
    private var cardShownAt = 0.0
    private var choices: [(mod: Mod, frame: CGRect, back: SKShapeNode)] = []
    private var hovered: Int?
    private var hint: SKLabelNode?
    private var shownSerial = -1
    private var lastSpark = 0.0
    private var lastGraze = 0.0

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
        build()
        loadFight(intro: session.game.fight.time < 0.5)
    }

    private func build() {
        background.anchorPoint = .zero
        background.zPosition = -100
        addChild(background)
        backdrop.zPosition = -90
        addChild(backdrop)
        for (nebula, alpha) in [(nebulaTop, 0.22), (nebulaBottom, 0.12)] as [(SKSpriteNode, CGFloat)] {
            nebula.colorBlendFactor = 1
            nebula.blendMode = .add
            nebula.alpha = alpha
            backdrop.addChild(nebula)
        }
        nebulaBottom.color = Palette.player.color()
        var seed: UInt64 = 0x0F15
        func next() -> CGFloat {
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            return CGFloat(seed >> 33) / CGFloat(1 << 31)
        }
        for k in 0..<64 {
            let star = SKSpriteNode(texture: Art.spark)
            let layer = CGFloat(k % 3)
            let s = 1.2 + layer * 0.9 + next()
            star.size = CGSize(width: s, height: s * (layer == 2 ? 2.6 : 1))
            star.alpha = 0.18 + layer * 0.16 + next() * 0.2
            star.color = RGB(0.75, 0.85, 1).color()
            star.colorBlendFactor = 1
            star.blendMode = .add
            star.position = CGPoint(x: next() * 400, y: next() * 600)
            backdrop.addChild(star)
            stars.append((star, 14 + layer * 26 + next() * 10))
        }

        addChild(world)
        for (layer, z) in [(laserLayer, 1), (shotLayer, 2), (bossLayer, 3), (droneLayer, 4), (fxLayer, 5), (bulletLayer, 6)] as [(SKNode, CGFloat)] {
            layer.zPosition = z
            world.addChild(layer)
        }
        shipNode.zPosition = 4.5
        world.addChild(shipNode)
        novaWave.color = Palette.gold.color()
        novaWave.colorBlendFactor = 1
        novaWave.blendMode = .add
        novaWave.isHidden = true
        novaWave.zPosition = 7
        world.addChild(novaWave)

        hud.zPosition = 30
        addChild(hud)
        hpTrack.anchorPoint = .zero
        hpFill.anchorPoint = .zero
        hud.addChild(hpTrack)
        hud.addChild(hpFill)
        for _ in 0..<2 {
            let notch = SKSpriteNode(color: Palette.background.color(), size: CGSize(width: 1.5, height: 3))
            notch.anchorPoint = CGPoint(x: 0.5, y: 0)
            hud.addChild(notch)
            notches.append(notch)
        }
        hud.addChild(scoreLabel)

        overlay.zPosition = 40
        addChild(overlay)
        vignette.zPosition = 50
        vignette.alpha = 0.85
        addChild(vignette)
        flashLayer.anchorPoint = .zero
        flashLayer.zPosition = 55
        flashLayer.alpha = 0
        flashLayer.blendMode = .add
        addChild(flashLayer)
        curtain.anchorPoint = .zero
        curtain.zPosition = 60
        curtain.alpha = 0.55
        curtainTitle.text = "PAUSED"
        curtainHint.text = "hover to engage"
        for node in [curtainTitle, curtainHint] as [SKNode] {
            node.zPosition = 61
            addChild(node)
        }
        addChild(curtain)
        engageRing.zPosition = 62
        engageRing.strokeColor = Palette.player.color()
        engageRing.lineWidth = 2
        engageRing.lineCap = .round
        engageRing.isHidden = true
        addChild(engageRing)

        header.zPosition = 80
        addChild(header)
        headerBar.anchorPoint = .zero
        header.addChild(headerBar)
        headerRule.anchorPoint = .zero
        header.addChild(headerRule)
        header.addChild(waveLabel)
        header.addChild(nameLabel)
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

        pill.zPosition = 90
        pill.isHidden = true
        addChild(pill)
        pillDot.fillColor = Palette.danger.color()
        pillDot.strokeColor = .clear
        pillDot.run(.repeatForever(.sequence([.fadeAlpha(to: 0.35, duration: 0.9), .fadeAlpha(to: 1, duration: 0.9)])))
        pillDot.addChild(Art.glowSprite(Palette.danger, size: 22, alpha: 0.6))
        pillTrack.anchorPoint = CGPoint(x: 0, y: 0.5)
        pillFill.anchorPoint = CGPoint(x: 0, y: 0.5)
        for node in [pillDot, pillLabel, pillTrack, pillFill, pillValue] as [SKNode] { pill.addChild(node) }
    }

    /// Replaces the arena's contents with the session's fight, and shows the card for its stage.
    func loadFight(intro: Bool) {
        shownSerial = session.fightSerial
        let game = session.game
        let fight = game.fight
        bossNode?.removeFromParent()
        let boss = BossNode(design: fight.boss.design)
        bossLayer.addChild(boss)
        bossNode = boss
        fxLayer.removeAllActions()
        fxLayer.removeAllChildren()
        for k in bulletKeys.indices { bulletKeys[k] = -1 }
        shipNode.removeDrones()
        card?.removeFromParent()
        card = nil
        choices = []
        hovered = nil
        shownHull = (-1, -1)
        nebulaTop.color = Palette.boss(fight.boss.design).color()
        waveLabel.text = "WAVE \(fight.wave)"
        nameLabel.text = fight.boss.design.name
        layout()
        sync()
        switch game.stage {
        case .fighting:
            if intro { introduce(fight) }
            showHintIfNeeded()
        case .armory: showArmory()
        case .debrief: showDebrief()
        }
    }

    private func introduce(_ fight: Fight) {
        let design = fight.boss.design
        let node = SKNode()
        node.position = CGPoint(x: size.width / 2, y: top * 0.52)
        let band = SKSpriteNode(color: SKColor(white: 0, alpha: 0.5), size: CGSize(width: size.width, height: 52 * unit))
        node.addChild(band)
        let color = design.heavy ? Palette.danger : Palette.boss(design)
        let glow = Art.glowSprite(color, size: size.width * 1.2, alpha: 0.35)
        glow.yScale = 0.35
        node.addChild(glow)
        let small = Art.label(Art.headingFont, size: 8 * unit, color: color.mix(.white, 0.3).color())
        small.text = design.heavy ? "⚠︎  DREADNOUGHT  ⚠︎" : "WAVE \(fight.wave)  ·  \(design.rank)"
        small.position = CGPoint(x: 0, y: 15 * unit)
        node.addChild(small)
        let title = Art.label(Art.headingFont, size: 21 * unit, color: .white)
        title.text = design.name
        title.position = CGPoint(x: 0, y: -2 * unit)
        if title.frame.width > size.width - 16 { title.setScale((size.width - 16) / title.frame.width) }
        node.addChild(title)
        let sub = Art.label(Art.textFont, size: 7.5 * unit, color: Palette.ink.color(0.6))
        sub.text = design.heavy ? "WAVE \(fight.wave)  —  ARMOURED, RELENTLESS" : "ENGAGE"
        sub.position = CGPoint(x: 0, y: -18 * unit)
        node.addChild(sub)
        node.alpha = 0
        node.setScale(1.25)
        overlay.addChild(node)
        node.run(.sequence([
            .group([.fadeIn(withDuration: 0.18), .scale(to: 1, duration: 0.25)]).easedOut(),
            .wait(forDuration: 1.25),
            .group([.fadeOut(withDuration: 0.35), .scale(to: 0.92, duration: 0.35)]),
            .removeFromParent(),
        ]))
    }

    private func showHintIfNeeded() {
        hint?.removeFromParent()
        hint = nil
        guard !Settings.hintShown, session.game.stage == .fighting else { return }
        let label = Art.label(Art.textFont, size: 7.5 * unit, color: Palette.ink.color(0.65))
        label.text = "move to fly  ·  graze to charge  ·  click: nova"
        label.position = CGPoint(x: size.width / 2, y: 8 * unit)
        label.zPosition = 45
        label.run(.repeatForever(.sequence([.fadeAlpha(to: 0.35, duration: 1.2), .fadeAlpha(to: 1, duration: 1.2)])))
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

    /// Arena units to scene points.
    func point(_ v: Vec2) -> CGPoint { CGPoint(x: worldOrigin.x + CGFloat(v.x) * unit, y: worldOrigin.y + CGFloat(v.y) * unit) }

    /// Scene points to arena units.
    func arena(_ p: CGPoint) -> Vec2 { Vec2(Double((p.x - worldOrigin.x) / unit), Double((p.y - worldOrigin.y) / unit)) }

    private func layout() {
        guard built else { return }
        let w = size.width, h = size.height
        background.size = size
        pill.isHidden = !isCompact
        for node in [world, backdrop, hud, overlay, header, vignette] as [SKNode] { node.isHidden = isCompact }
        hint?.isHidden = isCompact
        if isCompact {
            layoutPill()
            refreshCurtain()
            return
        }
        unit = max(0.5, min(w / CGFloat(Arena.width), top / CGFloat(Arena.height)))
        worldOrigin = CGPoint(x: (w - CGFloat(Arena.width) * unit) / 2, y: (top - CGFloat(Arena.height) * unit) / 2)
        world.setScale(unit)
        world.position = worldOrigin

        nebulaTop.size = CGSize(width: w * 1.6, height: w * 1.3)
        nebulaTop.position = CGPoint(x: w / 2, y: top * 0.92)
        nebulaBottom.size = CGSize(width: w * 1.4, height: w)
        nebulaBottom.position = CGPoint(x: w / 2, y: -w * 0.2)
        vignette.size = CGSize(width: w * 1.5, height: h * 1.5)
        vignette.position = CGPoint(x: w / 2, y: top / 2)
        flashLayer.size = size

        hpTrack.size = CGSize(width: w, height: 3)
        hpTrack.position = CGPoint(x: 0, y: top - 3)
        hpFill.position = hpTrack.position
        for (k, notch) in notches.enumerated() { notch.position = CGPoint(x: w * CGFloat(k + 1) / 3, y: top - 3) }
        scoreLabel.position = CGPoint(x: 7, y: top - 11)

        headerBar.size = CGSize(width: w, height: ArenaScene.headerHeight)
        headerBar.position = CGPoint(x: 0, y: top)
        headerRule.size = CGSize(width: w, height: 1)
        headerRule.position = CGPoint(x: 0, y: top)
        let mid = top + ArenaScene.headerHeight / 2
        waveLabel.position = CGPoint(x: 9, y: mid)
        closeButton.position = CGPoint(x: w - 13, y: mid)
        compactButton.position = CGPoint(x: w - 30, y: mid)
        layoutHeaderText()
        refreshHull(force: true)
        refreshCurtain()
        card?.position = CGPoint(x: w / 2, y: top / 2)
        hint?.position = CGPoint(x: w / 2, y: 8 * unit)
    }

    private func layoutHeaderText() {
        nameLabel.position = CGPoint(x: 9 + waveLabel.frame.width + 6, y: top + ArenaScene.headerHeight / 2 - 0.5)
        let room = size.width - 46 - 7 * CGFloat(max(3, session.game.fight.ship.maxHull)) - nameLabel.position.x
        nameLabel.isHidden = room < 30
        nameLabel.xScale = 1
        nameLabel.yScale = 1
        if nameLabel.frame.width > room, room >= 30 { nameLabel.xScale = room / nameLabel.frame.width }
    }

    private func layoutPill() {
        let h = size.height
        pillDot.position = CGPoint(x: 14, y: h / 2)
        pillLabel.position = CGPoint(x: 25, y: h / 2)
        pillTrack.position = CGPoint(x: 64, y: h / 2)
        pillFill.position = CGPoint(x: 64, y: h / 2)
        pillValue.position = CGPoint(x: size.width - 10, y: h / 2)
        refreshPill()
    }

    private func refreshPill() {
        let game = session.game
        pillLabel.text = "W\(game.fight.wave)"
        pillFill.size = CGSize(width: 56 * CGFloat(game.fight.boss.fraction), height: 4)
        switch game.stage {
        case .fighting: pillValue.text = String(repeating: "◆", count: game.fight.ship.hull) + String(repeating: "◇", count: max(0, game.fight.ship.maxHull - game.fight.ship.hull))
        case .armory: pillValue.text = "UPGRADE"
        case .debrief: pillValue.text = "DOWN"
        }
    }

    private func refreshCurtain() {
        let show = isAwayPaused && !isCompact && session.game.stage == .fighting
        curtain.isHidden = !show
        curtainTitle.isHidden = !show
        curtainHint.isHidden = !show
        guard show else {
            engageRing.isHidden = true
            return
        }
        curtain.size = CGSize(width: size.width, height: top)
        curtain.alpha = isEngaging ? 0.3 : 0.55
        curtainTitle.text = isEngaging ? "ENGAGING" : "PAUSED"
        curtainTitle.position = CGPoint(x: size.width / 2, y: top / 2 + 6)
        curtainHint.text = isEngaging ? "hold steady" : "hover to engage  ·  click to jump in"
        curtainHint.position = CGPoint(x: size.width / 2, y: top / 2 - 8)
    }

    private func refreshHull(force: Bool = false) {
        let ship = session.game.fight.ship
        let state = (ship.hull, ship.maxHull)
        guard force || state != shownHull else { return }
        let hurt = !force && state.1 == shownHull.1 && state.0 < shownHull.0
        shownHull = state
        while hullPips.count < ship.maxHull {
            let pip = SKShapeNode(path: Art.polygon(sides: 4, radius: 3.4, rotation: .pi / 2))
            pip.lineWidth = 1
            header.addChild(pip)
            hullPips.append(pip)
        }
        let right = size.width - 44
        for (k, pip) in hullPips.enumerated() {
            pip.isHidden = k >= ship.maxHull
            let lit = k < ship.hull
            pip.fillColor = lit ? Palette.player.color() : .clear
            pip.strokeColor = lit ? Palette.player.color() : SKColor(white: 1, alpha: 0.25)
            pip.position = CGPoint(x: right - CGFloat(ship.maxHull - 1 - k) * 8, y: top + ArenaScene.headerHeight / 2)
            if hurt && k == ship.hull {
                pip.run(.sequence([.scale(to: 1.8, duration: 0.06), .scale(to: 1, duration: 0.25)]))
            }
        }
        layoutHeaderText()
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
            engageRing.isHidden = true
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
        ramp = 0.3
        lastUpdate = nil
        engageRing.isHidden = true
        refreshCurtain()
    }

    // MARK: The loop

    override func update(_ currentTime: TimeInterval) {
        let dt = lastUpdate.map { min(0.1, max(0, currentTime - $0)) } ?? 0
        lastUpdate = currentTime
        clock += dt
        guard !isCompact else { return }
        if session.fightSerial != shownSerial { loadFight(intro: true) }
        let game = session.game
        let running = !isAwayPaused && game.stage == .fighting

        if isEngaging {
            engageClock += dt
            if engageClock >= ArenaScene.dwell { engage() } else { drawEngageRing() }
        }
        scrollBackdrop(running ? dt : dt * 0.15)
        if running {
            if hitStop > 0 {
                hitStop -= dt
            } else {
                ramp = min(1, ramp + dt * 1.4)
                for event in session.advance(dt * timeScale * ramp) { handle(event) }
            }
        }
        shakeWorld(dt)
        sync()
    }

    private func drawEngageRing() {
        guard let pointer else { return }
        let path = CGMutablePath()
        let t = CGFloat(engageClock / ArenaScene.dwell)
        path.addArc(center: pointer, radius: 11, startAngle: .pi / 2, endAngle: .pi / 2 - t * 2 * .pi, clockwise: true)
        engageRing.path = path
        engageRing.isHidden = false
    }

    private func scrollBackdrop(_ dt: Double) {
        let h = size.height, w = size.width
        for star in stars {
            var p = star.node.position
            p.y -= star.speed * CGFloat(dt) * unit
            if p.y < -4 { p.y += h + 8 }
            if p.x > w + 4 { p.x = p.x.truncatingRemainder(dividingBy: max(1, w)) }
            star.node.position = p
        }
    }

    private func shakeWorld(_ dt: Double) {
        guard shakeAmount > 0.05 else {
            if world.position != worldOrigin { world.position = worldOrigin }
            shakeAmount = 0
            return
        }
        let a = shakeAmount * unit
        world.position = CGPoint(x: worldOrigin.x + .random(in: -a...a), y: worldOrigin.y + .random(in: -a...a))
        shakeAmount *= CGFloat(pow(0.0015, dt))
    }

    private func shake(_ amount: CGFloat) { shakeAmount = max(shakeAmount, amount) }

    /// Makes the sprites match the fight.
    private func sync() {
        let fight = session.game.fight
        if isCompact {
            refreshPill()
            return
        }
        bossNode?.update(fight.boss, clock: clock)
        shipNode.update(fight, clock: clock, in: droneLayer)
        syncBullets(fight)
        syncShots(fight)
        syncBeams(fight)
        if fight.novaRadius >= 0 {
            novaWave.isHidden = false
            novaWave.position = CGPoint(x: fight.novaOrigin.x, y: fight.novaOrigin.y)
            let r = CGFloat(fight.novaRadius)
            novaWave.size = CGSize(width: r * 2 + 2, height: r * 2 + 2)
            novaWave.alpha = max(0, 1 - r / 420)
        } else {
            novaWave.isHidden = true
        }
        let fraction = CGFloat(fight.boss.fraction)
        hpFill.size = CGSize(width: size.width * fraction, height: 3)
        hpFill.color = fight.boss.shielded > 0 ? Palette.ink.color() : Palette.boss(fight.boss.design).mix(.white, 0.15).color()
        let score = session.game.score
        if score != shownScore {
            shownScore = score
            scoreLabel.text = grouped(score)
        }
        refreshHull()
    }

    private func syncBullets(_ fight: Fight) {
        let bullets = fight.bullets
        let design = fight.boss.design
        while bulletSprites.count < bullets.count {
            let sprite = SKSpriteNode()
            bulletLayer.addChild(sprite)
            bulletSprites.append(sprite)
            bulletKeys.append(-1)
        }
        for (i, b) in bullets.enumerated() {
            let sprite = bulletSprites[i]
            let key = b.kind.rawValue * 4 + b.tint.rawValue
            if bulletKeys[i] != key {
                sprite.texture = Art.bullet(b.kind, tint: b.tint, design: design)
                bulletKeys[i] = key
            }
            sprite.isHidden = false
            sprite.position = CGPoint(x: b.pos.x, y: b.pos.y)
            let r = CGFloat(b.radius)
            switch b.kind {
            case .needle:
                sprite.size = CGSize(width: r * 2.6, height: r * 7)
                sprite.zRotation = CGFloat(b.vel.angle) - .pi / 2
                sprite.alpha = 1
            case .mine:
                sprite.size = CGSize(width: r * 3, height: r * 3)
                sprite.zRotation = CGFloat(b.age * 2)
                let urgent = b.fuse >= 0 && b.fuse < 0.6
                sprite.alpha = urgent && Int(clock * 20) % 2 == 0 ? 0.55 : 1
            case .pellet, .orb:
                sprite.size = CGSize(width: r * 2.8, height: r * 2.8)
                sprite.zRotation = 0
                sprite.alpha = 1
            }
        }
        if bullets.count < bulletSprites.count {
            for i in bullets.count..<bulletSprites.count where !bulletSprites[i].isHidden { bulletSprites[i].isHidden = true }
        }
    }

    private func syncShots(_ fight: Fight) {
        let shots = fight.shots
        while shotSprites.count < shots.count {
            let sprite = SKSpriteNode()
            sprite.blendMode = .add
            shotLayer.addChild(sprite)
            shotSprites.append(sprite)
            shotKinds.append(-1)
        }
        for (i, s) in shots.enumerated() {
            let sprite = shotSprites[i]
            let kind = s.kind.rawValue
            if shotKinds[i] != kind {
                shotKinds[i] = kind
                switch s.kind {
                case .bolt:
                    sprite.texture = Art.bolt
                    sprite.size = CGSize(width: 3.2, height: 11)
                case .missile:
                    sprite.texture = Art.missile
                    sprite.size = CGSize(width: 7, height: 7)
                case .drone:
                    sprite.texture = Art.droneShot
                    sprite.size = CGSize(width: 4, height: 4)
                }
            }
            sprite.isHidden = false
            sprite.position = CGPoint(x: s.pos.x, y: s.pos.y)
            sprite.zRotation = CGFloat(s.vel.angle) - .pi / 2
        }
        if shots.count < shotSprites.count {
            for i in shots.count..<shotSprites.count where !shotSprites[i].isHidden { shotSprites[i].isHidden = true }
        }
    }

    private func syncBeams(_ fight: Fight) {
        let lasers = fight.lasers
        let color = Palette.boss(fight.boss.design)
        while beams.count < lasers.count {
            let warn = SKSpriteNode(color: .white, size: CGSize(width: 420, height: 0.8))
            let glow = SKSpriteNode(texture: Art.glow)
            let core = SKSpriteNode(color: .white, size: CGSize(width: 420, height: 1))
            for sprite in [warn, glow, core] {
                sprite.anchorPoint = CGPoint(x: 0, y: 0.5)
                sprite.blendMode = .add
                laserLayer.addChild(sprite)
            }
            glow.colorBlendFactor = 1
            beams.append((warn, glow, core))
        }
        for (i, laser) in lasers.enumerated() {
            let beam = beams[i]
            let origin = fight.laserOrigin(laser)
            let p = CGPoint(x: origin.x, y: origin.y)
            let angle = CGFloat(laser.angle)
            for sprite in [beam.warn, beam.glow, beam.core] {
                sprite.position = p
                sprite.zRotation = angle
            }
            let width = CGFloat(laser.width)
            if laser.isLive {
                beam.warn.isHidden = true
                beam.glow.isHidden = false
                beam.core.isHidden = false
                beam.glow.color = color.color()
                beam.glow.size = CGSize(width: 440, height: width * 3.2 * (1 + 0.12 * CGFloat(sin(clock * 50))))
                beam.glow.alpha = 0.9
                beam.core.size = CGSize(width: 420, height: width * 0.5)
                beam.core.alpha = 1
            } else {
                beam.warn.isHidden = false
                beam.glow.isHidden = true
                beam.core.isHidden = true
                beam.warn.color = color.mix(.white, 0.3).color()
                let urgent = laser.warning < 0.3
                beam.warn.alpha = urgent ? (Int(clock * 24) % 2 == 0 ? 0.9 : 0.35) : 0.35 + 0.2 * CGFloat(sin(clock * 12))
                beam.warn.size = CGSize(width: 420, height: urgent ? 1.4 : 0.8)
            }
        }
        if lasers.count < beams.count {
            for i in lasers.count..<beams.count {
                beams[i].warn.isHidden = true
                beams[i].glow.isHidden = true
                beams[i].core.isHidden = true
            }
        }
    }

    // MARK: Events

    private func at<T: SKNode>(_ v: Vec2, _ node: T) -> T {
        node.position = CGPoint(x: v.x, y: v.y)
        return node
    }

    private func screenFlash(_ color: RGB, _ alpha: CGFloat, duration: TimeInterval = 0.3) {
        flashLayer.removeAllActions()
        flashLayer.color = color.color()
        flashLayer.alpha = alpha
        flashLayer.run(.fadeOut(withDuration: duration))
    }

    private func handle(_ event: FightEvent) {
        let fight = session.game.fight
        let bossColor = Palette.boss(fight.boss.design)
        switch event {
        case .bossHit(let p):
            guard clock - lastSpark > 0.035 else { return }
            lastSpark = clock
            fxLayer.addChild(at(p, Art.burst(bossColor.mix(.white, 0.5), count: 5, speed: 60, size: 3, life: 0.25, spread: 1.6, angle: -.pi / 2)))
        case .bossShielded(let p):
            guard clock - lastSpark > 0.07 else { return }
            lastSpark = clock
            fxLayer.addChild(at(p, Art.burst(Palette.ink, count: 3, speed: 40, size: 2.5, life: 0.2, spread: 1.4, angle: -.pi / 2)))
        case .bossPhase(let n):
            shake(5)
            hitStop = 0.08
            bossNode?.punch()
            let r = CGFloat(fight.boss.radius)
            fxLayer.addChild(at(fight.boss.pos, Art.shockwave(bossColor, radius: r * 1.2, grow: 6, duration: 0.6)))
            fxLayer.addChild(at(fight.boss.pos, Art.flash(bossColor.mix(.white, 0.4), size: r * 7, duration: 0.5)))
            screenFlash(bossColor, 0.3)
            banner("PHASE \(roman(n + 1))", color: bossColor.mix(.white, 0.25), y: top * 0.62)
        case .bossDestroyed(let p):
            destroySequence(at: p, radius: CGFloat(fight.boss.radius), color: bossColor, accent: Palette.accent(fight.boss.design))
        case .shipHit(let p, _):
            shake(7)
            hitStop = 0.12
            screenFlash(Palette.danger, 0.45, duration: 0.4)
            fxLayer.addChild(at(p, Art.burst(Palette.danger, count: 30, speed: 90, size: 4, life: 0.5)))
            fxLayer.addChild(at(p, Art.shockwave(Palette.danger, radius: 8, grow: 7, duration: 0.45)))
        case .shieldAbsorbed(let p):
            shake(3)
            fxLayer.addChild(at(p, Art.shockwave(Palette.player, radius: 15, grow: 3.5, duration: 0.45)))
            fxLayer.addChild(at(p, Art.burst(Palette.player, count: 24, speed: 70, size: 3.5, life: 0.4)))
            banner("DEFLECTED", color: Palette.player, y: top * 0.3)
        case .shipDestroyed(let p):
            shake(10)
            hitStop = 0.2
            screenFlash(.white, 0.6, duration: 0.6)
            fxLayer.addChild(at(p, Art.burst(Palette.player, count: 90, speed: 130, size: 5, life: 0.9)))
            fxLayer.addChild(at(p, Art.burst(.white, count: 30, speed: 60, size: 4, life: 0.5)))
            fxLayer.addChild(at(p, Art.shockwave(Palette.player, radius: 10, grow: 9, duration: 0.7)))
            fxLayer.addChild(at(p, Art.flash(Palette.player.mix(.white, 0.4), size: 90, duration: 0.6)))
        case .graze(let p):
            guard clock - lastGraze > 0.03 else { return }
            lastGraze = clock
            fxLayer.addChild(at(p, Art.burst(.white, count: 4, speed: 35, size: 2.5, life: 0.22)))
        case .novaReady:
            fxLayer.addChild(at(fight.ship.pos, Art.shockwave(Palette.gold, radius: 12, grow: 2.2, duration: 0.4)))
            if Settings.novaHints < 3 {
                Settings.novaHints += 1
                banner("NOVA READY — CLICK", color: Palette.gold, y: top * 0.3)
            }
        case .nova(let p):
            shake(4)
            screenFlash(Palette.gold.mix(.white, 0.5), 0.5, duration: 0.45)
            fxLayer.addChild(at(p, Art.flash(Palette.gold, size: 120, duration: 0.5)))
            fxLayer.addChild(at(p, Art.burst(Palette.gold, count: 50, speed: 150, size: 4, life: 0.6)))
            dismissHint()
        case .cleared(let points):
            for v in points.prefix(90) {
                let spark = SKSpriteNode(texture: Art.spark)
                spark.size = CGSize(width: 5, height: 5)
                spark.color = Palette.gold.color()
                spark.colorBlendFactor = 1
                spark.blendMode = .add
                spark.position = CGPoint(x: v.x, y: v.y)
                spark.run(.sequence([
                    .group([.moveBy(x: 0, y: 10, duration: 0.4), .fadeOut(withDuration: 0.4), .scale(to: 0.2, duration: 0.4)]),
                    .removeFromParent(),
                ]))
                fxLayer.addChild(spark)
            }
        case .mineBurst(let p):
            fxLayer.addChild(at(p, Art.flash(Palette.accent(fight.boss.design), size: 26, duration: 0.25)))
        case .mineKilled(let p):
            fxLayer.addChild(at(p, Art.burst(Palette.gold, count: 20, speed: 70, size: 3.5, life: 0.4)))
            fxLayer.addChild(at(p, Art.shockwave(Palette.gold, radius: 6, grow: 3, duration: 0.35)))
        case .laserFired(let p):
            fxLayer.addChild(at(p, Art.flash(bossColor.mix(.white, 0.4), size: 30, duration: 0.25)))
        case .ended(let outcome):
            run(.sequence([.wait(forDuration: 0.25), .run { [weak self] in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    if outcome == .victory { self.showArmory() } else { self.showDebrief() }
                }
            }]))
        }
    }

    /// Chain explosions across the hull, then the big one.
    private func destroySequence(at p: Vec2, radius r: CGFloat, color: RGB, accent: RGB) {
        shake(4)
        hitStop = 0.1
        var steps: [SKAction] = []
        for k in 0..<10 {
            steps.append(.wait(forDuration: 0.13))
            steps.append(.run { [weak self] in
                MainActor.assumeIsolated {
                    guard let self, let boss = self.bossNode else { return }
                    let spot = CGPoint(x: boss.position.x + .random(in: -r...r), y: boss.position.y + .random(in: -r...r))
                    let tint = k % 2 == 0 ? color : accent
                    let burst = Art.burst(tint.mix(.white, 0.3), count: 26, speed: 70, size: 4, life: 0.45)
                    burst.position = spot
                    self.fxLayer.addChild(burst)
                    let flash = Art.flash(tint, size: r * 1.8, duration: 0.3)
                    flash.position = spot
                    self.fxLayer.addChild(flash)
                    self.shake(2 + CGFloat(k) * 0.3)
                }
            })
        }
        steps.append(.run { [weak self] in
            MainActor.assumeIsolated {
                guard let self, let boss = self.bossNode else { return }
                let c = boss.position
                self.shake(11)
                self.hitStop = 0.14
                self.screenFlash(.white, 0.7, duration: 0.7)
                for node in [Art.flash(.white, size: r * 9, duration: 0.8),
                             Art.shockwave(color.mix(.white, 0.3), radius: r, grow: 9, duration: 0.8),
                             Art.shockwave(Palette.gold, radius: r * 0.6, grow: 12, duration: 1.1, alpha: 0.6),
                             Art.burst(color, count: 140, speed: 170, size: 6, life: 1.1),
                             Art.burst(Palette.gold, count: 60, speed: 110, size: 4, life: 0.9)] as [SKNode] {
                    node.position = c
                    self.fxLayer.addChild(node)
                }
            }
        })
        fxLayer.run(.sequence(steps))
    }

    private func banner(_ text: String, color: RGB, y: CGFloat) {
        let label = Art.label(Art.headingFont, size: 13 * unit, color: color.color())
        label.text = text
        label.position = CGPoint(x: size.width / 2, y: y)
        label.alpha = 0
        label.setScale(1.6)
        overlay.addChild(label)
        label.run(.sequence([
            .group([.fadeIn(withDuration: 0.1), .scale(to: 1, duration: 0.18)]).easedOut(),
            .wait(forDuration: 0.9),
            .group([.fadeOut(withDuration: 0.4), .moveBy(x: 0, y: 8, duration: 0.4)]),
            .removeFromParent(),
        ]))
    }

    // MARK: Cards

    private func presentCard(_ node: SKNode) {
        card?.removeFromParent()
        node.position = CGPoint(x: size.width / 2, y: top / 2)
        node.alpha = 0
        node.setScale(0.94)
        node.run(.group([.fadeIn(withDuration: 0.25), .scale(to: 1, duration: 0.3)]).easedOut())
        overlay.addChild(node)
        card = node
        cardShownAt = clock
        refreshCurtain()
    }

    private func dim() -> SKSpriteNode {
        SKSpriteNode(color: SKColor(white: 0, alpha: 0.62), size: CGSize(width: size.width * 2, height: size.height * 2))
    }

    /// Boss down: the bonuses, then three upgrades to pick from.
    func showArmory() {
        let game = session.game
        guard game.stage == .armory else { return }
        let u = unit
        let node = SKNode()
        node.addChild(dim())
        let w = size.width - 22 * u
        let rowHeight = 38 * u, gap = 6 * u
        let rows = CGFloat(game.run.offer.count)
        let stack = rows * rowHeight + max(0, rows - 1) * gap
        let titleY = stack / 2 + 44 * u

        let glow = Art.glowSprite(Palette.gold, size: size.width * 1.2, alpha: 0.3)
        glow.yScale = 0.3
        glow.position = CGPoint(x: 0, y: titleY)
        node.addChild(glow)
        let title = Art.label(Art.headingFont, size: 17 * u, color: Palette.gold.mix(.white, 0.25).color())
        title.text = "TARGET DESTROYED"
        title.position = CGPoint(x: 0, y: titleY)
        node.addChild(title)
        if let bonus = game.fight.bonus {
            var parts = ["+\(grouped(bonus.kill)) kill"]
            if bonus.flawless > 0 { parts.append("+\(grouped(bonus.flawless)) flawless") }
            if bonus.speed > 0 { parts.append("+\(grouped(bonus.speed)) speed") }
            let line = Art.label(Art.textFont, size: 7.5 * u, color: Palette.ink.color(0.7))
            line.text = parts.joined(separator: "  ·  ")
            line.position = CGPoint(x: 0, y: titleY - 16 * u)
            node.addChild(line)
        }
        let prompt = Art.label(Art.headingFont, size: 8 * u, color: Palette.ink.color(0.5))
        prompt.text = "CHOOSE AN UPGRADE"
        prompt.position = CGPoint(x: 0, y: stack / 2 + 12 * u)
        node.addChild(prompt)

        choices = []
        for (k, mod) in game.run.offer.enumerated() {
            let y = stack / 2 - rowHeight / 2 - CGFloat(k) * (rowHeight + gap)
            let rect = CGRect(x: -w / 2, y: -rowHeight / 2, width: w, height: rowHeight)
            let back = SKShapeNode(path: CGPath(roundedRect: rect, cornerWidth: 7 * u, cornerHeight: 7 * u, transform: nil))
            back.position = CGPoint(x: 0, y: y)
            back.fillColor = Palette.header.color(0.95)
            back.strokeColor = Palette.player.color(0.35)
            back.lineWidth = 1
            node.addChild(back)
            if let icon = Art.symbol(mod.symbol, points: 14) {
                let sprite = SKSpriteNode(texture: icon)
                let s = 15 * u
                let aspect = icon.size().width / max(1, icon.size().height)
                sprite.size = CGSize(width: s * aspect, height: s)
                sprite.color = Palette.player.color()
                sprite.colorBlendFactor = 1
                sprite.position = CGPoint(x: -w / 2 + 18 * u, y: 0)
                back.addChild(sprite)
            }
            let name = Art.label(Art.headingFont, size: 10.5 * u, color: .white, align: .left)
            name.text = mod.title
            name.position = CGPoint(x: -w / 2 + 34 * u, y: 6 * u)
            back.addChild(name)
            let blurb = Art.label(Art.textFont, size: 7 * u, color: Palette.ink.color(0.6), align: .left)
            blurb.text = mod.blurb
            blurb.position = CGPoint(x: -w / 2 + 34 * u, y: -7 * u)
            let room = w - 40 * u
            if blurb.frame.width > room { blurb.xScale = room / blurb.frame.width }
            back.addChild(blurb)
            let level = game.run.loadout.level(mod)
            for pip in 0..<mod.maxLevel {
                let dot = SKShapeNode(path: Art.polygon(sides: 4, radius: 2.4 * u, rotation: .pi / 2))
                dot.lineWidth = 0.8
                let lit = pip < level, next = pip == level
                dot.fillColor = lit ? Palette.player.color() : next ? Palette.gold.color() : .clear
                dot.strokeColor = lit ? Palette.player.color() : next ? Palette.gold.color() : SKColor(white: 1, alpha: 0.3)
                dot.position = CGPoint(x: w / 2 - 10 * u - CGFloat(mod.maxLevel - 1 - pip) * 6.5 * u, y: 6 * u)
                back.addChild(dot)
            }
            choices.append((mod, CGRect(x: size.width / 2 - w / 2, y: top / 2 + y - rowHeight / 2, width: w, height: rowHeight), back))
        }
        let footer = Art.label(Art.textFont, size: 7 * u, color: Palette.ink.color(0.45))
        let run = game.run
        footer.text = "hull \(run.hull)/\(run.loadout.maxHull)  ·  wave \(run.wave + 1) next  ·  \(grouped(run.score))"
        footer.position = CGPoint(x: 0, y: -stack / 2 - 14 * u)
        node.addChild(footer)
        presentCard(node)
        hovered = nil
        if let pointer { refreshHover(pointer) }
    }

    /// Shot down: how far the run went, then a new one.
    func showDebrief() {
        let game = session.game
        guard game.stage == .debrief else { return }
        let u = unit
        let node = SKNode()
        node.addChild(dim())
        let glow = Art.glowSprite(Palette.danger, size: size.width * 1.2, alpha: 0.35)
        glow.yScale = 0.3
        glow.position = CGPoint(x: 0, y: 52 * u)
        node.addChild(glow)
        let title = Art.label(Art.headingFont, size: 22 * u, color: Palette.danger.mix(.white, 0.2).color())
        title.text = "SHOT DOWN"
        title.position = CGPoint(x: 0, y: 52 * u)
        node.addChild(title)
        let run = game.run, career = game.career
        let lines: [(String, CGFloat, String, CGFloat)] = [
            ("WAVE \(run.wave)  ·  \(run.cleared) \(run.cleared == 1 ? "BOSS" : "BOSSES") DESTROYED", 9, Art.headingFont, 0.8),
            (grouped(run.score), 20, Art.numberFont, 1),
            ("best: wave \(max(career.bestWave, run.cleared))  ·  \(grouped(career.bestScore))", 7.5, Art.textFont, 0.55),
            (rankLine(career), 7.5, Art.textFont, 0.55),
        ]
        var y = 30 * u
        for (text, fontSize, font, alpha) in lines {
            let label = Art.label(font, size: fontSize * u, color: Palette.ink.color(alpha))
            label.text = text
            y -= (fontSize + 7) * u
            label.position = CGPoint(x: 0, y: y + fontSize * u / 2)
            node.addChild(label)
        }
        let prompt = Art.label(Art.textFont, size: 8 * u, color: Palette.player.color(0.9))
        prompt.text = "click to launch again  ▸"
        prompt.position = CGPoint(x: 0, y: y - 20 * u)
        prompt.run(.repeatForever(.sequence([.fadeAlpha(to: 0.35, duration: 0.8), .fadeAlpha(to: 1, duration: 0.8)])))
        node.addChild(prompt)
        presentCard(node)
    }

    /// Where the upgrade cards are, in scene points (for the self-test's clicks).
    var choiceFrames: [CGRect] { choices.map { $0.frame } }
    var hasCard: Bool { card != nil }

    private func rankLine(_ career: Career) -> String {
        var text = "rank: \(career.rank.uppercased())"
        if let next = career.nextRank {
            let left = next.kills - career.kills
            text += "  ·  \(left) \(left == 1 ? "kill" : "kills") to \(next.title.uppercased())"
        }
        return text
    }

    private func refreshHover(_ p: CGPoint) {
        let index = choices.firstIndex { $0.frame.contains(p) }
        guard index != hovered else { return }
        if let old = hovered, old < choices.count {
            choices[old].back.strokeColor = Palette.player.color(0.35)
            choices[old].back.fillColor = Palette.header.color(0.95)
            choices[old].back.setScale(1)
        }
        if let index {
            choices[index].back.strokeColor = Palette.player.color()
            choices[index].back.fillColor = Palette.player.scaled(0.2).mix(Palette.header, 0.4).color(0.97)
            choices[index].back.run(.scale(to: 1.03, duration: 0.08))
        }
        hovered = index
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
        if isCompact { return }
        if card != nil { refreshHover(p) }
        guard p.y < top else { return }
        session.aim(at: arena(p))
        if isEngaging { drawEngageRing() }
    }

    func pointerDown(at p: CGPoint) {
        pointer = p
        let game = session.game
        switch game.stage {
        case .armory:
            refreshHover(p)
            guard clock - cardShownAt > 0.35, let index = choices.firstIndex(where: { $0.frame.contains(p) }) else { return }
            let pick = choices[index]
            pick.back.run(.sequence([.scale(to: 1.08, duration: 0.06), .scale(to: 1, duration: 0.12)]))
            session.choose(pick.mod)
            engage()
            loadFight(intro: true)
        case .debrief:
            guard clock - cardShownAt > 0.8 else { return }
            session.newRun()
            engage()
            loadFight(intro: true)
        case .fighting:
            if isAwayPaused {
                engage()
                return
            }
            for event in session.detonate() { handle(event) }
        }
    }

    /// Returns false for keys the scene does not use.
    func key(_ event: NSEvent) -> Bool {
        switch event.charactersIgnoringModifiers?.lowercased() {
        case " ":
            if session.game.stage == .fighting && !isAwayPaused {
                for e in session.detonate() { handle(e) }
                return true
            }
            return false
        case "1", "2", "3":
            guard session.game.stage == .armory, let k = Int(event.charactersIgnoringModifiers ?? ""), k - 1 < choices.count else { return false }
            session.choose(choices[k - 1].mod)
            engage()
            loadFight(intro: true)
            return true
        case "\r":
            if session.game.stage == .debrief {
                session.newRun()
                engage()
                loadFight(intro: true)
                return true
            }
            return false
        default:
            return false
        }
    }
}
