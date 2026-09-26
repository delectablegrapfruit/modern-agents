import AppKit
import SpriteKit
import SkirmishCore

/// The battlefield, its header, and the compact pill it folds into.
///
/// Controls: press on one of your outposts and drag to a target (sweep across more of yours on the way to send
/// from all of them); or click yours, then click the target. Double-click selects everything you hold. 1–4, the
/// wheel, or the pips in the header set the share sent. Right-click or Esc lets go.
@MainActor
final class BattleScene: SKScene {
    enum HeaderHit { case none, drag, compact, close, force }

    static let headerHeight: CGFloat = 24
    static let pillSize = CGSize(width: 156, height: 28)

    let session: GameSession
    /// Simulation seconds per real second (the self-test fast-forwards).
    var timeScale = 1.0
    private(set) var isCompact = false
    private(set) var isAwayPaused = false
    private(set) var force = 0.5

    // Layers, back to front.
    private let backdrop = SKNode()
    private let world = SKNode()
    private let grid = SKShapeNode()
    private let fleetLayer = SKNode()
    private let outpostLayer = SKNode()
    private let fxLayer = SKNode()
    private let aim = SKShapeNode()
    private let aimLabel = Art.label(Art.numberFont, size: 10, color: .white)
    private let overlay = SKNode()
    private let vignette = SKSpriteNode(texture: Art.vignette)
    private let curtain = SKSpriteNode(color: .black, size: .zero)
    private let curtainLabel = Art.label(Art.headingFont, size: 12, color: SKColor(white: 1, alpha: 0.7))
    private let curtainHint = Art.label(Art.textFont, size: 8, color: SKColor(white: 1, alpha: 0.4))
    private let header = SKNode()
    private let headerBar = SKSpriteNode(color: Palette.header.color(), size: .zero)
    private let headerRule = SKSpriteNode(color: SKColor(white: 1, alpha: 0.06), size: .zero)
    private let titleLabel = Art.label(Art.headingFont, size: 11, color: Palette.ink.color(0.95), align: .left)
    private let nameLabel = Art.label(Art.textFont, size: 8.5, color: Palette.ink.color(0.42), align: .left)
    private let compactButton = SKShapeNode()
    private let closeButton = SKShapeNode()
    private var pips: [SKSpriteNode] = []
    private var bars: [SKSpriteNode] = []
    private var shares: [CGFloat] = []
    private let pill = SKNode()
    private let pillDot = SKShapeNode(circleOfRadius: 4)
    private let pillLabel = Art.label(Art.headingFont, size: 11, color: Palette.ink.color(0.95), align: .left)
    private let pillTrack = SKSpriteNode(color: SKColor(white: 1, alpha: 0.12), size: CGSize(width: 46, height: 4))
    private let pillFill = SKSpriteNode(color: Palette.faction(Side.player).color(), size: CGSize(width: 0, height: 4))
    private let pillValue = Art.label(Art.numberFont, size: 10, color: Palette.ink.color(0.8), align: .right)

    private var background = SKSpriteNode(color: Palette.background.color(), size: .zero)
    private var nebulae: [SKSpriteNode] = []
    private var stars: [SKSpriteNode] = []
    private var outposts: [OutpostSprite] = []
    private var fleets: [Int: FleetSprite] = [:]
    private var banner: SKNode?
    private var bannerShownAt: TimeInterval = 0
    private var hint: SKLabelNode?
    private var field = CGRect(x: 0, y: 0, width: 100, height: 100)
    private var built = false

    private var selection: Set<Int> = []
    private var press: (origin: CGPoint, outpost: Int?, prior: Set<Int>)?
    private var dragging = false
    private var pointer: CGPoint?
    private var target: Int?
    private var lastUpdate: TimeInterval?
    private var clock: TimeInterval = 0
    private var wheel: CGFloat = 0

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
        loadBattle(intro: true)
    }

    private func build() {
        background.anchorPoint = .zero
        background.zPosition = -100
        addChild(background)
        backdrop.zPosition = -90
        addChild(backdrop)
        for (faction, alpha) in [(Side.player, 0.13), (2, 0.12), (4, 0.06)] as [(Int, CGFloat)] {
            let cloud = SKSpriteNode(texture: Art.glow)
            cloud.color = Palette.faction(faction).color()
            cloud.colorBlendFactor = 1
            cloud.blendMode = .add
            cloud.alpha = alpha
            cloud.run(.repeatForever(.sequence([
                .moveBy(x: 8, y: -6, duration: 9), .moveBy(x: -8, y: 6, duration: 9),
            ])))
            backdrop.addChild(cloud)
            nebulae.append(cloud)
        }
        var rng = SeededRNG(seed: 0x57A25)
        for _ in 0..<70 {
            let star = SKSpriteNode(texture: Art.spark)
            let s = CGFloat(rng.range(1.2, 3.2))
            star.size = CGSize(width: s, height: s)
            star.alpha = CGFloat(rng.range(0.15, 0.7))
            star.color = RGB(0.75, 0.85, 1).color()
            star.colorBlendFactor = 1
            star.blendMode = .add
            let low = star.alpha * 0.3, period = rng.range(1.5, 4.5)
            star.run(.repeatForever(.sequence([
                .fadeAlpha(to: low, duration: period), .fadeAlpha(to: star.alpha, duration: period),
            ])))
            backdrop.addChild(star)
            stars.append(star)
        }

        addChild(world)
        grid.strokeColor = SKColor(white: 1, alpha: 0.045)
        grid.lineWidth = 1
        grid.zPosition = 1
        world.addChild(grid)
        fleetLayer.zPosition = 8
        outpostLayer.zPosition = 10
        fxLayer.zPosition = 20
        world.addChild(fleetLayer)
        world.addChild(outpostLayer)
        world.addChild(fxLayer)
        aim.zPosition = 30
        aim.strokeColor = Palette.faction(Side.player).color(0.85)
        aim.lineWidth = 1.5
        aim.lineCap = .round
        aim.glowWidth = 0
        world.addChild(aim)
        aimLabel.zPosition = 31
        aimLabel.isHidden = true
        world.addChild(aimLabel)

        overlay.zPosition = 40
        addChild(overlay)
        vignette.zPosition = 50
        vignette.alpha = 0.9
        addChild(vignette)
        curtain.zPosition = 60
        curtain.alpha = 0.5
        curtain.anchorPoint = .zero
        curtainLabel.text = "PAUSED"
        curtainHint.text = "hover to resume"
        curtain.isHidden = true
        curtainLabel.zPosition = 61
        curtainHint.zPosition = 61
        curtainLabel.isHidden = true
        curtainHint.isHidden = true
        addChild(curtain)
        addChild(curtainLabel)
        addChild(curtainHint)

        header.zPosition = 80
        addChild(header)
        headerBar.anchorPoint = .zero
        header.addChild(headerBar)
        headerRule.anchorPoint = .zero
        header.addChild(headerRule)
        header.addChild(titleLabel)
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
        for _ in 0..<4 {
            let pip = SKSpriteNode(color: .white, size: CGSize(width: 3, height: 8))
            header.addChild(pip)
            pips.append(pip)
        }

        pill.zPosition = 90
        pill.isHidden = true
        addChild(pill)
        pillDot.fillColor = Palette.faction(Side.player).color()
        pillDot.strokeColor = .clear
        pillDot.run(.repeatForever(.sequence([.fadeAlpha(to: 0.35, duration: 0.9), .fadeAlpha(to: 1, duration: 0.9)])))
        let dotGlow = SKSpriteNode(texture: Art.glow)
        dotGlow.size = CGSize(width: 22, height: 22)
        dotGlow.color = Palette.faction(Side.player).color()
        dotGlow.colorBlendFactor = 1
        dotGlow.blendMode = .add
        dotGlow.alpha = 0.6
        pillDot.addChild(dotGlow)
        pillTrack.anchorPoint = CGPoint(x: 0, y: 0.5)
        pillFill.anchorPoint = CGPoint(x: 0, y: 0.5)
        for node in [pillDot, pillLabel, pillTrack, pillFill, pillValue] as [SKNode] { pill.addChild(node) }
    }

    /// Replaces what is on the field with the session's battle.
    func loadBattle(intro: Bool) {
        outpostLayer.removeAllChildren()
        fleetLayer.removeAllChildren()
        fxLayer.removeAllActions()
        fxLayer.removeAllChildren()
        banner?.removeFromParent()
        banner = nil
        selection = []
        press = nil
        dragging = false
        target = nil
        fleets = [:]
        let battle = session.battle
        outposts = battle.outposts.map { OutpostSprite(outpost: $0) }
        for sprite in outposts { outpostLayer.addChild(sprite) }
        for fleet in battle.fleets { _ = spawn(fleet) }
        bars.forEach { $0.removeFromParent() }
        bars = ([Side.player] + battle.enemies).map { faction in
            let bar = SKSpriteNode(color: Palette.faction(faction).color(), size: CGSize(width: 0, height: 2))
            bar.anchorPoint = .zero
            header.addChild(bar)
            return bar
        }
        shares = Array(repeating: 1 / CGFloat(bars.count), count: bars.count)
        titleLabel.text = "SECTOR \(battle.sector)"
        nameLabel.text = Names.sector(battle.sector).uppercased() + (battle.difficulty.siege ? "  ·  SIEGE" : "")
        layout()
        sync()
        if let outcome = battle.outcome {
            showBanner(outcome)
        } else if intro {
            introduce(battle)
        }
        showHintIfNeeded()
    }

    private func introduce(_ battle: Battle) {
        for (k, sprite) in outposts.enumerated() {
            sprite.setScale(0.01)
            sprite.alpha = 0
            sprite.run(.sequence([
                .wait(forDuration: 0.05 * Double(k)),
                .group([.scale(to: 1, duration: 0.35), .fadeIn(withDuration: 0.25)]).easedOut(),
            ]))
        }
        let card = SKNode()
        card.position = CGPoint(x: field.midX, y: field.midY)
        let glow = SKSpriteNode(texture: Art.glow)
        glow.size = CGSize(width: field.width * 1.1, height: 70)
        glow.color = Palette.faction(battle.difficulty.siege ? 2 : Side.player).color()
        glow.colorBlendFactor = 1
        glow.blendMode = .add
        glow.alpha = 0.35
        card.addChild(glow)
        let title = Art.label(Art.headingFont, size: min(24, field.width / 11), color: .white)
        title.text = "SECTOR \(battle.sector)"
        title.position = CGPoint(x: 0, y: 7)
        card.addChild(title)
        let sub = Art.label(Art.textFont, size: 9, color: Palette.ink.color(0.7))
        let foes = battle.enemies.map { Side.name($0).uppercased() }.joined(separator: " · ")
        sub.text = Names.sector(battle.sector).uppercased() + "  —  " + (battle.difficulty.siege ? "SIEGE OF THE " : "VS ") + foes
        sub.position = CGPoint(x: 0, y: -11)
        card.addChild(sub)
        card.alpha = 0
        card.setScale(1.15)
        overlay.addChild(card)
        card.run(.sequence([
            .group([.fadeIn(withDuration: 0.25), .scale(to: 1, duration: 0.3)]).easedOut(),
            .wait(forDuration: 1.3),
            .group([.fadeOut(withDuration: 0.4), .scale(to: 0.95, duration: 0.4)]),
            .removeFromParent(),
        ]))
    }

    private func showHintIfNeeded() {
        hint?.removeFromParent()
        hint = nil
        guard !Settings.hintShown, session.battle.outcome == nil else { return }
        let label = Art.label(Art.textFont, size: 8.5, color: Palette.ink.color(0.6))
        label.text = "drag from a blue outpost to attack  ·  1–4 sets force"
        label.position = CGPoint(x: field.midX, y: field.minY + 4)
        label.run(.repeatForever(.sequence([.fadeAlpha(to: 0.35, duration: 1.2), .fadeAlpha(to: 1, duration: 1.2)])))
        overlay.addChild(label)
        hint = label
    }

    // MARK: Layout

    override func didChangeSize(_ oldSize: CGSize) {
        guard built else { return }
        layout()
    }

    func point(_ v: Vec2) -> CGPoint { CGPoint(x: field.minX + CGFloat(v.x) * field.width, y: field.minY + CGFloat(v.y) * field.height) }

    func point(ofOutpost index: Int) -> CGPoint { point(session.battle.outposts[index].position) }

    private var unit: CGFloat { field.width / 300 }

    private func layout() {
        guard built else { return }
        let w = size.width, h = size.height
        background.size = size
        pill.isHidden = !isCompact
        for node in [world, backdrop, overlay, header, vignette] as [SKNode] { node.isHidden = isCompact }
        if isCompact {
            layoutPill()
            refreshCurtain()
            return
        }
        let top = h - BattleScene.headerHeight
        let side = max(60, min(w, top - 2) - 14)
        field = CGRect(x: (w - side) / 2, y: (top - 2 - side) / 2, width: side, height: side)

        nebulae[0].size = CGSize(width: w * 1.3, height: w * 1.3)
        nebulae[0].position = CGPoint(x: w * 0.12, y: h * 0.1)
        nebulae[1].size = CGSize(width: w * 1.2, height: w * 1.2)
        nebulae[1].position = CGPoint(x: w * 0.9, y: h * 0.85)
        nebulae[2].size = CGSize(width: w * 0.9, height: w * 0.9)
        nebulae[2].position = CGPoint(x: w * 0.55, y: h * 0.45)
        var rng = SeededRNG(seed: 0x57A25)
        for star in stars { star.position = CGPoint(x: CGFloat(rng.unit()) * w, y: CGFloat(rng.unit()) * h) }
        vignette.size = CGSize(width: w * 1.5, height: h * 1.5)
        vignette.position = CGPoint(x: w / 2, y: h / 2)

        let path = CGMutablePath()
        for k in 1..<8 {
            let x = field.minX + field.width * CGFloat(k) / 8, y = field.minY + field.height * CGFloat(k) / 8
            path.move(to: CGPoint(x: x, y: field.minY))
            path.addLine(to: CGPoint(x: x, y: field.maxY))
            path.move(to: CGPoint(x: field.minX, y: y))
            path.addLine(to: CGPoint(x: field.maxX, y: y))
        }
        // Corner brackets: the edge of the map, as a targeting frame.
        let b = min(14, field.width * 0.06)
        for (cx, cy, sx, sy) in [(field.minX, field.minY, 1, 1), (field.maxX, field.minY, -1, 1),
                                 (field.minX, field.maxY, 1, -1), (field.maxX, field.maxY, -1, -1)] as [(CGFloat, CGFloat, CGFloat, CGFloat)] {
            path.move(to: CGPoint(x: cx + sx * b, y: cy))
            path.addLine(to: CGPoint(x: cx, y: cy))
            path.addLine(to: CGPoint(x: cx, y: cy + sy * b))
        }
        grid.path = path

        for sprite in outposts {
            let o = session.battle.outposts[sprite.index]
            sprite.position = point(o.position)
            sprite.layout(radius: CGFloat(o.radius) * field.width)
        }
        for fleet in session.battle.fleets { fleets[fleet.id]?.place(at: point(fleet.position), heading: CGFloat(fleet.heading)) }
        hint?.position = CGPoint(x: field.midX, y: field.minY + 4)
        banner?.position = CGPoint(x: field.midX, y: field.midY)

        headerBar.size = CGSize(width: w, height: BattleScene.headerHeight)
        headerBar.position = CGPoint(x: 0, y: top)
        headerRule.size = CGSize(width: w, height: 1)
        headerRule.position = CGPoint(x: 0, y: top - 1)
        titleLabel.position = CGPoint(x: 10, y: top + BattleScene.headerHeight / 2)
        nameLabel.position = CGPoint(x: 10 + titleLabel.frame.width + 7, y: top + BattleScene.headerHeight / 2 - 0.5)
        closeButton.position = CGPoint(x: w - 13, y: top + BattleScene.headerHeight / 2)
        compactButton.position = CGPoint(x: w - 30, y: top + BattleScene.headerHeight / 2)
        for (k, pip) in pips.enumerated() {
            pip.position = CGPoint(x: w - 66 + CGFloat(k) * 5.5, y: top + BattleScene.headerHeight / 2)
        }
        refreshPips()
        layoutBars()
        refreshCurtain()
    }

    private func layoutBars() {
        let w = size.width, y = size.height - BattleScene.headerHeight - 2
        var x: CGFloat = 0
        for (k, bar) in bars.enumerated() {
            let width = max(0, shares[k] * w)
            bar.size = CGSize(width: width, height: 2)
            bar.position = CGPoint(x: x, y: y)
            x += width
        }
    }

    private func layoutPill() {
        let h = size.height
        pillDot.position = CGPoint(x: 14, y: h / 2)
        pillLabel.position = CGPoint(x: 25, y: h / 2)
        pillTrack.position = CGPoint(x: 62, y: h / 2)
        pillFill.position = CGPoint(x: 62, y: h / 2)
        pillValue.position = CGPoint(x: size.width - 10, y: h / 2)
        refreshPill()
    }

    private func refreshPill() {
        let battle = session.battle
        pillLabel.text = "S\(battle.sector)"
        let share = CGFloat(battle.playerShare)
        pillFill.size = CGSize(width: 46 * share, height: 4)
        switch battle.outcome {
        case .victory?: pillValue.text = "WON"
        case .defeat?: pillValue.text = "LOST"
        case nil: pillValue.text = "\(Int((share * 100).rounded()))%"
        }
        let danger = battle.outcome == nil && share < 0.25
        pillDot.fillColor = Palette.faction(danger ? 2 : Side.player).color()
    }

    private func refreshPips() {
        let lit = Int((force * 4).rounded())
        for (k, pip) in pips.enumerated() {
            pip.color = k < lit ? Palette.faction(Side.player).color() : SKColor(white: 1, alpha: 0.16)
        }
    }

    private func refreshCurtain() {
        let show = isAwayPaused && !isCompact
        curtain.isHidden = !show
        curtainLabel.isHidden = !show
        curtainHint.isHidden = !show
        guard show else { return }
        let top = size.height - BattleScene.headerHeight
        curtain.size = CGSize(width: size.width, height: top)
        curtain.position = .zero
        curtainLabel.position = CGPoint(x: size.width / 2, y: top / 2 + 5)
        curtainHint.position = CGPoint(x: size.width / 2, y: top / 2 - 9)
    }

    // MARK: Modes

    func setCompact(_ on: Bool) {
        isCompact = on
        if on { cancelSelection() }
        layout()
    }

    func setAwayPaused(_ on: Bool) {
        guard on != isAwayPaused else { return }
        isAwayPaused = on
        if on {
            press = nil
            dragging = false
            refreshAim()
        }
        lastUpdate = nil
        refreshCurtain()
    }

    // MARK: The loop

    override func update(_ currentTime: TimeInterval) {
        let dt = lastUpdate.map { min(0.1, max(0, currentTime - $0)) } ?? 0
        lastUpdate = currentTime
        clock += dt
        guard !isCompact, !isAwayPaused else { return }
        if session.battle.outcome == nil {
            for event in session.advance(dt * timeScale) { handle(event) }
        }
        sync()
        let blend = min(1, CGFloat(dt) * 5)
        let battle = session.battle
        let factions = [Side.player] + battle.enemies
        let strengths = factions.map { CGFloat(battle.strength(of: $0)) }
        let total = strengths.reduce(0, +)
        if total > 0, shares.count == strengths.count {
            for k in shares.indices { shares[k] += (strengths[k] / total - shares[k]) * blend }
            layoutBars()
        }
    }

    /// Makes the sprites match the battle.
    private func sync() {
        let battle = session.battle
        for sprite in outposts {
            let o = battle.outposts[sprite.index]
            if sprite.owner != o.owner { sprite.setOwner(o.owner, animated: true) }
            sprite.setTroops(Int(o.troops))
        }
        var live = Set<Int>()
        for fleet in battle.fleets {
            live.insert(fleet.id)
            let sprite = fleets[fleet.id] ?? spawn(fleet)
            sprite.place(at: point(fleet.position), heading: CGFloat(fleet.heading))
        }
        for (id, sprite) in fleets where !live.contains(id) {
            sprite.land(leavingTrailIn: fxLayer)
            fleets[id] = nil
        }
        let held = selection.filter { battle.outposts[$0].owner == Side.player }
        if held != selection { selection = held; refreshSelection() }
        refreshAim()
        if isCompact { refreshPill() }
    }

    @discardableResult
    private func spawn(_ fleet: Fleet) -> FleetSprite {
        if let existing = fleets[fleet.id] { return existing }
        let sprite = FleetSprite(fleet: fleet, scale: unit, trailTarget: fxLayer)
        sprite.place(at: point(fleet.position), heading: CGFloat(fleet.heading))
        fleetLayer.addChild(sprite)
        fleets[fleet.id] = sprite
        return sprite
    }

    private func handle(_ event: BattleEvent) {
        switch event {
        case .launched(let fleet):
            spawn(fleet)
            launchFlash(fleet)
        case .reinforced(let index, _):
            outposts[index].pulse()
        case .clashed(let index, let attacker, let count):
            let sprite = outposts[index]
            fxLayer.addChild(at(sprite.position, Art.burst(RGB.of(attacker), count: min(40, 8 + count), speed: 55 * unit,
                                                             size: 5 * unit, life: 0.45)))
            fxLayer.addChild(at(sprite.position, Art.flash(RGB.of(attacker), size: sprite.radius * 3, duration: 0.25, alpha: 0.5)))
            sprite.jolt(CGFloat(count) / 6)
            if sprite.owner == Side.player, count >= 10 { shake(1.5) }
        case .captured(let index, let by, let from):
            let sprite = outposts[index]
            sprite.setOwner(by, animated: true)
            let color = RGB.of(by)
            fxLayer.addChild(at(sprite.position, Art.shockwave(color, radius: sprite.radius, grow: 3.4, width: 2, duration: 0.55)))
            fxLayer.addChild(at(sprite.position, Art.shockwave(color.mix(RGB(1, 1, 1), 0.5), radius: sprite.radius * 0.8, grow: 2.2, width: 1, duration: 0.4)))
            fxLayer.addChild(at(sprite.position, Art.flash(color, size: sprite.radius * 6, duration: 0.45)))
            fxLayer.addChild(at(sprite.position, Art.burst(color, count: 46, speed: 90 * unit, size: 6 * unit, life: 0.7)))
            if by == Side.player || from == Side.player {
                shake(by == Side.player ? 2.5 : 3.5)
                if from == Side.player { selection.remove(index); refreshSelection() }
            }
        case .eliminated(let faction):
            toast("\(Side.name(faction).uppercased()) ELIMINATED", color: RGB.of(faction))
            shake(2)
        case .ended(let outcome):
            finish(outcome)
        }
    }

    private func at<T: SKNode>(_ position: CGPoint, _ node: T) -> T {
        node.position = position
        return node
    }

    private func launchFlash(_ fleet: Fleet) {
        let source = outposts[fleet.from]
        let angle = CGFloat(fleet.heading)
        fxLayer.addChild(at(source.position, Art.burst(RGB.of(fleet.owner), count: 10, speed: 40 * unit, size: 4 * unit,
                                                       life: 0.3, spread: 0.7, angle: angle)))
    }

    private func shake(_ amount: CGFloat) {
        world.removeAction(forKey: "shake")
        var steps: [SKAction] = []
        for k in 0..<6 {
            let a = amount * CGFloat(6 - k) / 6
            steps.append(.move(to: CGPoint(x: .random(in: -a...a), y: .random(in: -a...a)), duration: 0.028))
        }
        steps.append(.move(to: .zero, duration: 0.04))
        world.run(.sequence(steps), withKey: "shake")
    }

    private func toast(_ text: String, color: RGB) {
        let label = Art.label(Art.headingFont, size: 10, color: color.mix(RGB(1, 1, 1), 0.35).color())
        label.text = text
        label.position = CGPoint(x: field.midX, y: field.maxY - 12)
        label.alpha = 0
        overlay.addChild(label)
        label.run(.sequence([
            .fadeIn(withDuration: 0.15), .wait(forDuration: 1.4), .group([.fadeOut(withDuration: 0.5), .moveBy(x: 0, y: 6, duration: 0.5)]),
            .removeFromParent(),
        ]))
    }

    // MARK: The end of a battle

    private func finish(_ outcome: Outcome) {
        cancelSelection()
        showBanner(outcome)
        guard outcome == .victory else { shake(4); return }
        let held = outposts.filter { $0.owner == Side.player }
        for (k, sprite) in held.enumerated() {
            let position = sprite.position, radius = sprite.radius
            fxLayer.run(.sequence([
                .wait(forDuration: 0.12 * Double(k)),
                .run { [weak self] in
                    MainActor.assumeIsolated {
                        guard let self else { return }
                        let gold = k % 2 == 0 ? Palette.faction(Side.player) : Palette.gold
                        self.fxLayer.addChild(self.at(position, Art.burst(gold, count: 60, speed: 110 * self.unit, size: 6 * self.unit, life: 0.9)))
                        self.fxLayer.addChild(self.at(position, Art.shockwave(gold, radius: radius, grow: 4, width: 1.5, duration: 0.7)))
                    }
                },
            ]))
        }
    }

    private func showBanner(_ outcome: Outcome) {
        banner?.removeFromParent()
        let battle = session.battle
        let won = outcome == .victory
        let color = won ? Palette.faction(Side.player) : Palette.faction(2)
        let node = SKNode()
        node.position = CGPoint(x: field.midX, y: field.midY)
        let dim = SKSpriteNode(color: SKColor(white: 0, alpha: 0.55), size: CGSize(width: size.width * 2, height: size.height * 2))
        node.addChild(dim)
        let glow = SKSpriteNode(texture: Art.glow)
        glow.size = CGSize(width: field.width * 1.3, height: 90)
        glow.color = color.color()
        glow.colorBlendFactor = 1
        glow.blendMode = .add
        glow.alpha = 0.45
        glow.position = CGPoint(x: 0, y: 14)
        node.addChild(glow)
        let title = Art.label(Art.headingFont, size: min(22, field.width / 12), color: color.mix(RGB(1, 1, 1), 0.3).color())
        title.text = won ? "SECTOR CONQUERED" : "REPELLED"
        title.position = CGPoint(x: 0, y: 22)
        node.addChild(title)
        let minutes = Int(battle.time) / 60, seconds = Int(battle.time) % 60
        let lines = [
            won ? "\(Names.sector(battle.sector)) taken in \(minutes):\(String(format: "%02d", seconds))"
                : "The line broke at \(Names.sector(battle.sector))",
            "\(Int(battle.stats.kills)) destroyed  ·  \(battle.stats.captures) captured",
        ]
        for (k, text) in lines.enumerated() {
            let line = Art.label(Art.textFont, size: 9, color: Palette.ink.color(k == 0 ? 0.8 : 0.55))
            line.text = text
            line.position = CGPoint(x: 0, y: 3 - CGFloat(k) * 13)
            node.addChild(line)
        }
        if let rank = session.promotion {
            let promo = Art.label(Art.headingFont, size: 11, color: Palette.gold.color())
            promo.text = "PROMOTED  —  \(rank.uppercased())"
            promo.position = CGPoint(x: 0, y: -30)
            promo.run(.repeatForever(.sequence([.scale(to: 1.06, duration: 0.5), .scale(to: 1, duration: 0.5)])))
            node.addChild(promo)
        }
        let prompt = Art.label(Art.textFont, size: 8.5, color: Palette.ink.color(0.6))
        prompt.text = won ? "click to advance  ▸" : "click to regroup  ▸"
        prompt.position = CGPoint(x: 0, y: session.promotion == nil ? -34 : -48)
        prompt.run(.repeatForever(.sequence([.fadeAlpha(to: 0.3, duration: 0.8), .fadeAlpha(to: 1, duration: 0.8)])))
        node.addChild(prompt)
        node.alpha = 0
        node.setScale(0.92)
        node.run(.group([.fadeIn(withDuration: 0.3), .scale(to: 1, duration: 0.35)]).easedOut())
        overlay.addChild(node)
        banner = node
        bannerShownAt = clock
        hint?.removeFromParent()
        hint = nil
    }

    /// Past the banner: the next battle.
    func advanceFromBanner() {
        guard session.battle.outcome != nil else { return }
        session.next()
        loadBattle(intro: true)
    }

    // MARK: Input

    func headerHit(at p: CGPoint) -> HeaderHit {
        if isCompact { return .drag }
        let top = size.height - BattleScene.headerHeight
        guard p.y >= top else { return .none }
        if hypot(p.x - closeButton.position.x, p.y - closeButton.position.y) <= 9 { return .close }
        if hypot(p.x - compactButton.position.x, p.y - compactButton.position.y) <= 9 { return .compact }
        if let first = pips.first, let last = pips.last, p.x >= first.position.x - 6, p.x <= last.position.x + 6 { return .force }
        return .drag
    }

    private func outpost(at p: CGPoint) -> Int? {
        var best: (index: Int, distance: CGFloat)?
        for sprite in outposts {
            let d = hypot(p.x - sprite.position.x, p.y - sprite.position.y)
            if d <= sprite.radius + 9, d < best?.distance ?? .infinity { best = (sprite.index, d) }
        }
        return best?.index
    }

    private func isMine(_ index: Int) -> Bool { session.battle.outposts[index].owner == Side.player }

    func pointerDown(at p: CGPoint, clickCount: Int) {
        pointer = p
        if session.battle.outcome != nil {
            if clock - bannerShownAt > 0.6 { advanceFromBanner() }
            return
        }
        guard !isAwayPaused else { return }
        let hit = outpost(at: p)
        if let hit, isMine(hit) {
            if clickCount >= 2 {
                selection = Set(outposts.map { $0.index }.filter { isMine($0) })
                press = nil
            } else {
                press = (origin: p, outpost: hit as Int?, prior: selection)
                if selection.isEmpty || selection == [hit] { selection = [hit] }
            }
        } else if let hit {
            if !selection.isEmpty { launch(from: selection, to: hit) }
            press = nil
        } else {
            selection = []
            press = nil
        }
        refreshSelection()
    }

    func pointerDragged(to p: CGPoint) {
        pointer = p
        guard let press, !isAwayPaused else { return }
        if !dragging, hypot(p.x - press.origin.x, p.y - press.origin.y) > 4 {
            dragging = true
            if let start = press.outpost, !press.prior.isEmpty, press.prior != [start], !press.prior.contains(start) {
                selection = [start]
            }
        }
        if dragging, let over = outpost(at: p), isMine(over), !selection.contains(over), over != target {
            // Sweeping across your own outposts gathers them, unless you stop on one: then it is the target.
            selection.insert(over)
        }
        refreshSelection()
    }

    func pointerUp(at p: CGPoint) {
        pointer = p
        defer {
            self.press = nil
            dragging = false
            refreshSelection()
        }
        guard let pressed = press, let start = pressed.outpost else { return }
        if dragging {
            if let target = outpost(at: p) {
                var sources = selection
                sources.remove(target)
                if !sources.isEmpty { launch(from: sources, to: target) }
            }
            selection = []
        } else if !pressed.prior.isEmpty, !pressed.prior.contains(start) {
            launch(from: pressed.prior, to: start)
            selection = []
        } else if pressed.prior == [start] {
            selection = []
        }
    }

    func pointerMoved(to p: CGPoint) {
        pointer = p
        refreshAim()
    }

    func cancelSelection() {
        selection = []
        press = nil
        dragging = false
        refreshSelection()
    }

    func selectAll() {
        selection = Set(outposts.map { $0.index }.filter { isMine($0) })
        refreshSelection()
    }

    func setForce(_ value: Double) {
        force = min(1, max(0.25, value))
        refreshPips()
        refreshAim()
        toast("FORCE \(Int(force * 100))%", color: Palette.faction(Side.player))
    }

    func cycleForce() { setForce(force >= 1 ? 0.25 : force + 0.25) }

    func scroll(_ delta: CGFloat) {
        wheel += delta
        if abs(wheel) >= 4 {
            setForce(force + (wheel > 0 ? 0.25 : -0.25))
            wheel = 0
        }
    }

    /// Returns false for keys the scene does not use.
    func key(_ event: NSEvent) -> Bool {
        if event.keyCode == 53 { cancelSelection(); return true }
        switch event.charactersIgnoringModifiers?.lowercased() {
        case "1": setForce(0.25)
        case "2": setForce(0.5)
        case "3": setForce(0.75)
        case "4": setForce(1)
        case "a": selectAll()
        case " ", "\r": if session.battle.outcome != nil { advanceFromBanner() } else { return false }
        default: return false
        }
        return true
    }

    private func launch(from sources: Set<Int>, to target: Int) {
        let launched = session.send(from: Array(sources), to: target, fraction: force)
        if launched.isEmpty {
            for index in sources { outposts[index].refuse() }
            return
        }
        for fleet in launched {
            spawn(fleet)
            launchFlash(fleet)
        }
        if !Settings.hintShown {
            Settings.hintShown = true
            hint?.run(.sequence([.fadeOut(withDuration: 0.4), .removeFromParent()]))
            hint = nil
        }
    }

    private func refreshSelection() {
        for sprite in outposts { sprite.setSelected(selection.contains(sprite.index)) }
        refreshAim()
    }

    /// The aiming lines from each selected outpost to the pointer, the target's ring, and how many will go.
    private func refreshAim() {
        let aiming = !selection.isEmpty && !isAwayPaused && session.battle.outcome == nil && (dragging || press == nil)
        var newTarget: Int?
        if aiming, let pointer {
            let over = outpost(at: pointer)
            if let over, !(selection.count == 1 && selection.contains(over)) { newTarget = over }
            let end = newTarget.map { outposts[$0].position } ?? pointer
            let path = CGMutablePath()
            var total = 0
            for index in selection.sorted() {
                let sprite = outposts[index]
                let dx = end.x - sprite.position.x, dy = end.y - sprite.position.y
                let d = max(1, hypot(dx, dy))
                guard d > sprite.radius + 2 else { continue }
                path.move(to: CGPoint(x: sprite.position.x + dx / d * (sprite.radius + 3), y: sprite.position.y + dy / d * (sprite.radius + 3)))
                path.addLine(to: end)
                total += Int(session.battle.outposts[index].troops * force)
            }
            aim.path = path.copy(dashingWithPhase: CGFloat(clock * 30).truncatingRemainder(dividingBy: 10), lengths: [6, 4])
            aim.isHidden = false
            aimLabel.text = "→ \(total)"
            aimLabel.position = CGPoint(x: pointer.x + 14, y: pointer.y + 12)
            aimLabel.isHidden = total == 0
        } else {
            aim.isHidden = true
            aimLabel.isHidden = true
        }
        if newTarget != target {
            if let old = target, old < outposts.count { outposts[old].setTargeted(false) }
            if let new = newTarget { outposts[new].setTargeted(true) }
            target = newTarget
        }
    }
}
