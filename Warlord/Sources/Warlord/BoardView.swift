import AppKit
import WarlordCore

/// The whole panel, drawn by hand: a header with your orders, gold and lands; the realm's hex map; and one line
/// of news with a Levy button. Drawn in AppKit rather than SwiftUI so hover and clicks work in a panel that never
/// becomes key and never activates the app — your editor keeps the keyboard while you play.
@MainActor
final class BoardView: NSView {
    let session: Session
    /// Circumradius of a map cell, in points.
    var radius: CGFloat = 15 { didSet { if radius != oldValue { layoutChanged() } } }
    /// Folded to the header strip.
    var compact = false { didSet { if compact != oldValue { layoutChanged() } } }

    var onResize: (() -> Void)?
    var onHover: ((Bool) -> Void)?
    var onMoved: (() -> Void)?

    private(set) var selected: Int?
    private var hovered: Spot = .none
    private var note: (text: String, tone: Tone, until: Date)?
    private var flashes: [Int: (start: Date, color: NSColor)] = [:]
    private var animation: Timer?
    private var drag: (mouse: NSPoint, origin: NSPoint, moved: Bool)?
    private var tracking: NSTrackingArea?

    enum Spot: Equatable {
        case none, header, fold, levy, map, footer
        case territory(Int)
    }

    enum Tone {
        case plain, good, bad, gold
    }

    let headerHeight: CGFloat = 26
    private let footerHeight: CGFloat = 22
    private let pad: CGFloat = 10
    private let minWidth: CGFloat = 236

    init(session: Session) {
        self.session = session
        super.init(frame: .zero)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override var isFlipped: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    private var game: Game { session.game }
    private var realm: Realm { session.game.realm }

    // MARK: Geometry

    private var mapSize: NSSize {
        let size = Hex.mapSize(columns: realm.columns, rows: realm.rows, radius: Double(radius))
        return NSSize(width: ceil(size.width), height: ceil(size.height))
    }

    var preferredSize: NSSize {
        let width = max(minWidth, mapSize.width + pad * 2)
        return NSSize(width: width, height: compact ? headerHeight : headerHeight + 2 + mapSize.height + 4 + footerHeight + 4)
    }

    private var mapRect: NSRect {
        NSRect(x: ((bounds.width - mapSize.width) / 2).rounded(), y: headerHeight + 2, width: mapSize.width, height: mapSize.height)
    }

    private var headerRect: NSRect { NSRect(x: 0, y: 0, width: bounds.width, height: headerHeight) }
    private var footerRect: NSRect { NSRect(x: 0, y: mapRect.maxY + 4, width: bounds.width, height: footerHeight) }
    var foldRect: NSRect { NSRect(x: bounds.width - pad - 14, y: (headerHeight - 14) / 2, width: 14, height: 14) }

    private var levyRect: NSRect? {
        guard !compact, !realm.isConquered, let s = selected, realm.territories[s].owner == .player else { return nil }
        let width: CGFloat = 82
        return NSRect(x: bounds.width - pad - width, y: footerRect.midY - 9, width: width, height: 18)
    }

    func center(of id: Int) -> NSPoint {
        let c = realm.territories[id].hex.center(radius: Double(radius))
        return NSPoint(x: mapRect.minX + radius * sqrt(3) / 2 + CGFloat(c.x), y: mapRect.minY + radius + CGFloat(c.y))
    }

    private func territory(at point: NSPoint) -> Int? {
        var best: (id: Int, distance: CGFloat)?
        for t in realm.territories {
            let c = center(of: t.id)
            let d = hypot(point.x - c.x, point.y - c.y)
            if d <= radius, d < best?.distance ?? .infinity { best = (t.id, d) }
        }
        return best?.id
    }

    private func spot(at point: NSPoint) -> Spot {
        if headerRect.contains(point) { return foldRect.insetBy(dx: -5, dy: -5).contains(point) ? .fold : .header }
        if compact { return .none }
        if let levy = levyRect, levy.contains(point) { return .levy }
        if let id = territory(at: point) { return .territory(id) }
        if mapRect.contains(point) { return .map }
        if footerRect.contains(point) { return .footer }
        return .none
    }

    private func layoutChanged() {
        needsDisplay = true
        onResize?()
    }

    // MARK: Drawing

    override func draw(_ dirtyRect: NSRect) {
        let now = Date()
        let frame = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: 11, yRadius: 11)
        Style.table.setFill()
        frame.fill()
        Style.hairline.setStroke()
        frame.lineWidth = 1
        frame.stroke()

        drawHeader(now)
        guard !compact else { return }
        drawMap(now)
        drawFooter(now)
        if realm.isConquered { drawVictory() }
    }

    private func drawHeader(_ now: Date) {
        let midY = headerHeight / 2
        var x = pad
        // Orders: one pip each, lit while ready, and the wait for the next.
        for i in 0..<Rules.orderCap {
            let pip = NSBezierPath(ovalIn: NSRect(x: x, y: midY - 3.5, width: 7, height: 7))
            (i < game.orders ? Style.gold : Style.faint).setFill()
            pip.fill()
            x += 10
        }
        if let wait = game.nextOrder(now: now) {
            text(Clock.short(wait), at: NSPoint(x: x + 1, y: midY), font: Style.digits(10, .medium), color: Style.dim, anchor: .left)
        }

        // Right to left: fold chevron, lands held, gold.
        symbol(compact ? "chevron.down" : "chevron.up", center: NSPoint(x: foldRect.midX, y: foldRect.midY), size: 10,
               color: hovered == .fold ? Style.text : Style.dim)
        var right = foldRect.minX - 8
        right -= text("\(realm.owned(by: .player).count)/\(realm.territories.count)", at: NSPoint(x: right, y: midY),
                      font: Style.digits(11), color: Style.text, anchor: .right).width + 4
        let hex = hexPath(center: NSPoint(x: right - 5, y: midY), radius: 5.5)
        Style.gold.setFill()
        hex.fill()
        right -= 11 + 10
        right -= text("\(Int(game.gold))", at: NSPoint(x: right, y: midY), font: Style.digits(11), color: Style.text, anchor: .right).width + 4
        let coin = NSRect(x: right - 9, y: midY - 4.5, width: 9, height: 9)
        Style.gold.setFill()
        NSBezierPath(ovalIn: coin).fill()
        Style.ink.withAlphaComponent(0.35).setStroke()
        let rim = NSBezierPath(ovalIn: coin.insetBy(dx: 2, dy: 2))
        rim.lineWidth = 1
        rim.stroke()
    }

    private func drawMap(_ now: Date) {
        var targets: [Int: Double] = [:]
        var marches: Set<Int> = []
        if let s = selected, realm.territories[s].troops >= 2, !realm.isConquered {
            for n in realm.adjacency[s] {
                if let chance = game.chance(from: s, to: n) { targets[n] = chance } else if realm.territories[n].owner == .player { marches.insert(n) }
            }
        }

        for t in realm.territories {
            let c = center(of: t.id)
            let cell = hexPath(center: c, radius: radius - 1)
            fill(for: t).setFill()
            cell.fill()
            if let flash = flashes[t.id] {
                let age = now.timeIntervalSince(flash.start)
                if age < 0.7 {
                    flash.color.withAlphaComponent(0.7 * (1 - age / 0.7)).setFill()
                    cell.fill()
                }
            }

            let rim = hexPath(center: c, radius: radius - 1.6)
            if t.id == selected {
                Style.text.setStroke()
                rim.lineWidth = 2
                rim.stroke()
            } else if let chance = targets[t.id] {
                Style.odds(chance).setStroke()
                rim.lineWidth = hovered == .territory(t.id) ? 2.2 : 1.5
                rim.stroke()
            } else if marches.contains(t.id) {
                Style.text.withAlphaComponent(hovered == .territory(t.id) ? 0.8 : 0.35).setStroke()
                rim.lineWidth = 1.2
                rim.setLineDash([2.5, 2], count: 2, phase: 0)
                rim.stroke()
            } else if hovered == .territory(t.id) {
                Style.text.withAlphaComponent(0.55).setStroke()
                rim.lineWidth = 1
                rim.stroke()
            }

            let ink = t.owner == .player ? Style.ink : Style.text
            let glyph = t.isCapital ? "crown.fill" : Style.glyph(t.terrain)
            if let glyph {
                symbol(glyph, center: NSPoint(x: c.x, y: c.y - radius * 0.43), size: max(5, radius * 0.4),
                       color: ink.withAlphaComponent(t.isCapital ? 0.95 : 0.5))
            }
            text("\(t.troops)", at: NSPoint(x: c.x, y: glyph == nil ? c.y : c.y + radius * 0.2),
                 font: Style.digits(max(9, radius * 0.66), .bold), color: ink, anchor: .center)
        }
    }

    private func fill(for t: Territory) -> NSColor {
        let ground = Style.ground(t.terrain)
        let banner: NSColor
        switch t.owner {
        case .neutral: return ground
        case .player: banner = Style.gold
        default: banner = Style.banner(realm.rival(t.owner)?.banner ?? 1)
        }
        // A touch of the ground under the banner, so terrain still reads on held land.
        return banner.blended(withFraction: 0.18, of: ground) ?? banner
    }

    private func drawFooter(_ now: Date) {
        var line = footerRect.insetBy(dx: pad, dy: 0)
        if let levy = levyRect {
            line.size.width = levy.minX - 8 - line.minX
            let enabled = game.canLevy
            let pill = NSBezierPath(roundedRect: levy, xRadius: 9, yRadius: 9)
            (enabled ? Style.gold.withAlphaComponent(hovered == .levy ? 1 : 0.82) : Style.faint).setFill()
            pill.fill()
            let raise = min(Rules.levySize, Int(game.gold / Rules.troopCost))
            let label = enabled ? "Levy +\(raise) · \(raise * Int(Rules.troopCost))g" : "Levy · \(Int(Rules.troopCost))g each"
            text(label, at: NSPoint(x: levy.midX, y: levy.midY), font: Style.digits(10, .semibold),
                 color: enabled ? Style.ink : Style.dim, anchor: .center)
        }
        let (message, tone) = status(now)
        let color: NSColor = switch tone {
        case .plain: Style.dim
        case .good: Style.good
        case .bad: Style.bad
        case .gold: Style.gold
        }
        let style = NSMutableParagraphStyle()
        style.lineBreakMode = .byTruncatingTail
        let string = NSAttributedString(string: message, attributes: [.font: Style.font(10.5, .medium), .foregroundColor: color, .paragraphStyle: style])
        let height = string.size().height
        string.draw(in: NSRect(x: line.minX, y: line.midY - height / 2, width: line.width, height: height))
    }

    private func drawVictory() {
        let area = mapRect.insetBy(dx: -4, dy: -2)
        NSColor.black.withAlphaComponent(0.66).setFill()
        NSBezierPath(roundedRect: area, xRadius: 8, yRadius: 8).fill()
        symbol("crown.fill", center: NSPoint(x: area.midX, y: area.midY - 26), size: 18, color: Style.gold)
        text("REALM CONQUERED", at: NSPoint(x: area.midX, y: area.midY - 4), font: Style.font(13, .heavy), color: Style.gold,
             anchor: .center, kern: 1.6)
        text("Hail, \(game.title).", at: NSPoint(x: area.midX, y: area.midY + 14), font: Style.font(11, .semibold), color: Style.text, anchor: .center)
        text("Click to ride on", at: NSPoint(x: area.midX, y: area.midY + 30), font: Style.font(10), color: Style.dim, anchor: .center)
    }

    // MARK: News

    private func status(_ now: Date) -> (String, Tone) {
        switch hovered {
        case .territory(let id) where !realm.isConquered:
            return describe(id)
        case .header, .fold:
            return ("\(game.title) · \(realm.name) · +\(Self.decimal(game.incomePerMinute)) gold/min", .plain)
        case .levy:
            return ("\(Int(Rules.troopCost)) gold a soldier. Right-click any land of yours to levy there.", .plain)
        default:
            break
        }
        if let note, note.until > now { return (note.text, note.tone) }
        if realm.isConquered { return ("Every banner in \(realm.name) is yours.", .gold) }
        if game.orders == 0, let wait = game.nextOrder(now: now) { return ("Orders spent. Next in \(Clock.short(wait)) — back to work.", .plain) }
        if selected != nil { return ("Strike a bordering land, or march to your own.", .plain) }
        return ("Choose a land to command.", .plain)
    }

    private func describe(_ id: Int) -> (String, Tone) {
        let t = realm.territories[id]
        if let s = selected, s != id {
            if let chance = game.chance(from: s, to: id) {
                let walls = t.defense > 1.001 ? " ×\(Self.decimal(t.defense))" : ""
                return ("Attack \(t.name): \(realm.territories[s].troops - 1) vs \(t.troops)\(walls) — \(Int((chance * 100).rounded()))%",
                        chance >= 0.75 ? .good : chance >= 0.4 ? .gold : .bad)
            }
            if t.owner == .player, realm.borders(s, id), realm.territories[s].troops >= 2 {
                return ("March \(realm.territories[s].troops - 1) to \(t.name)", .plain)
            }
        }
        let kind = t.isCapital ? (t.id == realm.home ? "your seat" : "a seat") : t.terrain.name.lowercased()
        let holder = t.owner == .player ? "yours" : realm.name(of: t.owner)
        return ("\(t.name), \(kind) · \(holder) · \(t.troops) troops", .plain)
    }

    func say(_ text: String, _ tone: Tone = .plain, seconds: TimeInterval = 7) {
        note = (text, tone, Date().addingTimeInterval(seconds))
        needsDisplay = true
    }

    // MARK: Orders

    /// A click at a point in the view; the mouse handlers and the self-test come through here.
    func click(at point: NSPoint) {
        switch spot(at: point) {
        case .fold:
            compact.toggle()
        case .levy:
            if let s = selected { levy(at: s) }
        case .territory(let id):
            if realm.isConquered { advance() } else { choose(id) }
        case .map:
            if realm.isConquered { advance() } else { selected = nil }
        default:
            break
        }
        needsDisplay = true
    }

    private func choose(_ id: Int) {
        let t = realm.territories[id]
        if t.owner == .player {
            if let s = selected, s != id, realm.borders(s, id), realm.territories[s].troops >= 2 {
                march(from: s, to: id)
            } else {
                selected = selected == id ? nil : id
            }
            return
        }
        if let s = selected, realm.borders(s, id) {
            attack(from: s, to: id)
            return
        }
        // Clicking a target first picks the strongest army of yours on its border; the next click strikes.
        let bases = realm.adjacency[id].filter { realm.territories[$0].owner == .player }
        if let base = bases.max(by: { realm.territories[$0].troops < realm.territories[$1].troops }), realm.territories[base].troops >= 2 {
            selected = base
            say("Army at \(realm.territories[base].name) stands ready. Click \(t.name) again to strike.")
        } else {
            say(bases.isEmpty ? "No land of yours borders \(t.name)." : "Too few troops on that border — levy first.")
        }
    }

    private func attack(from: Int, to: Int) {
        do {
            let turn = try session.apply { try $0.attack(from: from, to: to, now: Date()) }
            report(turn)
        } catch let refusal as Refusal {
            say(refusal.message, .bad)
        } catch {}
    }

    private func march(from: Int, to: Int) {
        do {
            let moved = try session.apply { try $0.march(from: from, to: to, now: Date()) }
            selected = to
            say("\(moved) troops march to \(realm.territories[to].name).")
        } catch let refusal as Refusal {
            say(refusal.message, .bad)
        } catch {}
    }

    func levy(at id: Int) {
        do {
            let raised = try session.apply { try $0.levy(at: id, now: Date()) }
            selected = id
            flash(id, Style.gold)
            say("\(raised) fresh troops muster at \(realm.territories[id].name).", .good)
        } catch let refusal as Refusal {
            say(refusal.message, .bad)
        } catch {}
    }

    private func advance() {
        _ = try? session.apply { try $0.advance(now: Date()) }
        selected = nil
        say("You ride into \(realm.name). \(realm.rivals.count == 1 ? "One house stands" : "\(realm.rivals.count) houses stand") against you.", .gold)
        onResize?()
    }

    /// Forgets the selection after the realm changed underneath.
    func reset() {
        selected = nil
        note = nil
        flashes = [:]
        needsDisplay = true
    }

    private func report(_ turn: Turn) {
        let b = turn.battle
        let target = realm.territories[b.to]
        var lines: [String] = []
        var tone: Tone
        if b.won {
            flash(b.to, Style.gold)
            selected = target.troops >= 2 ? b.to : nil
            if let broke = b.broke, let house = realm.rival(broke) {
                for t in b.subjugated { flash(t, Style.gold) }
                lines.append("\(Self.capitalized(house.name)) is broken! \(b.subjugated.count) lands bend the knee.")
                tone = .gold
            } else {
                lines.append("\(target.name) taken" + (b.attackerLosses > 0 ? ", \(b.attackerLosses) fell." : " without a loss."))
                tone = .good
            }
        } else {
            flash(b.to, Style.bad)
            selected = nil
            lines.append("Repulsed at \(target.name): lost \(b.attackerLosses), slew \(b.defenderLosses).")
            tone = .bad
        }
        for r in turn.rivalBattles where r.won {
            let house = realm.rival(r.attacker)
            flash(r.to, Style.banner(house?.banner ?? 1))
            if r.defender == .player {
                lines.append("\(Self.capitalized(house?.name ?? "A rival")) seized \(realm.territories[r.to].name).")
                if selected == r.to { selected = nil }
            } else if let broke = r.broke, let fallen = realm.rival(broke) {
                lines.append("\(Self.capitalized(house?.name ?? "A rival")) broke \(fallen.name).")
            }
        }
        if turn.conquered {
            selected = nil
            lines = ["\(realm.name) is yours."]
            tone = .gold
        }
        say(lines.joined(separator: " "), tone, seconds: 8)
    }

    private func flash(_ id: Int, _ color: NSColor) {
        flashes[id] = (Date(), color)
        guard animation == nil else { return }
        animation = Timer.scheduledTimer(withTimeInterval: 1.0 / 30, repeats: true) { [weak self] timer in
            MainActor.assumeIsolated {
                guard let self else { return timer.invalidate() }
                let now = Date()
                self.flashes = self.flashes.filter { now.timeIntervalSince($0.value.start) < 0.7 }
                self.needsDisplay = true
                if self.flashes.isEmpty {
                    timer.invalidate()
                    self.animation = nil
                }
            }
        }
    }

    // MARK: Mouse

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let tracking { removeTrackingArea(tracking) }
        let area = NSTrackingArea(rect: .zero, options: [.activeAlways, .mouseMoved, .mouseEnteredAndExited, .inVisibleRect],
                                  owner: self, userInfo: nil)
        addTrackingArea(area)
        tracking = area
    }

    override func mouseEntered(with event: NSEvent) {
        onHover?(true)
        if let back = session.apply({ $0.checkIn(now: Date()) }) {
            var parts: [String] = []
            if back.gold > 0 { parts.append("+\(back.gold) gold") }
            if back.orders > 0 { parts.append("\(back.orders) order\(back.orders == 1 ? "" : "s") ready") }
            say("Welcome back, \(game.title). " + (parts.isEmpty ? "The realm held while you were away." : parts.joined(separator: ", ") + "."), .gold, seconds: 9)
        }
    }

    override func mouseExited(with event: NSEvent) {
        hovered = .none
        needsDisplay = true
        onHover?(false)
    }

    override func mouseMoved(with event: NSEvent) {
        let now = spot(at: convert(event.locationInWindow, from: nil))
        if now != hovered {
            hovered = now
            needsDisplay = true
        }
    }

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        let where_ = spot(at: point)
        if where_ == .header || (compact && where_ != .fold) {
            // The header is the handle: drag to move, double-click to fold.
            if event.clickCount == 2 {
                compact.toggle()
            } else {
                drag = (NSEvent.mouseLocation, window?.frame.origin ?? .zero, false)
            }
            return
        }
        click(at: point)
    }

    override func mouseDragged(with event: NSEvent) {
        guard var d = drag, let window else { return }
        let mouse = NSEvent.mouseLocation
        let dx = mouse.x - d.mouse.x, dy = mouse.y - d.mouse.y
        if !d.moved && hypot(dx, dy) < 2 { return }
        d.moved = true
        drag = d
        window.setFrameOrigin(NSPoint(x: d.origin.x + dx, y: d.origin.y + dy))
    }

    override func mouseUp(with event: NSEvent) {
        if drag?.moved == true { onMoved?() }
        drag = nil
    }

    override func rightMouseDown(with event: NSEvent) {
        if case .territory(let id) = spot(at: convert(event.locationInWindow, from: nil)), realm.territories[id].owner == .player, !realm.isConquered {
            levy(at: id)
        }
    }

    // MARK: Primitives

    enum Anchor { case left, center, right }

    @discardableResult
    private func text(_ string: String, at point: NSPoint, font: NSFont, color: NSColor, anchor: Anchor, kern: CGFloat = 0) -> NSSize {
        var attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
        if kern != 0 { attributes[.kern] = kern }
        let text = NSAttributedString(string: string, attributes: attributes)
        let size = text.size()
        let x: CGFloat = switch anchor {
        case .left: point.x
        case .center: point.x - size.width / 2
        case .right: point.x - size.width
        }
        text.draw(at: NSPoint(x: x, y: point.y - size.height / 2))
        return size
    }

    private func symbol(_ name: String, center: NSPoint, size: CGFloat, color: NSColor) {
        guard let image = Style.symbol(name, size: size, color: color) else { return }
        let s = image.size
        image.draw(in: NSRect(x: center.x - s.width / 2, y: center.y - s.height / 2, width: s.width, height: s.height),
                   from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
    }

    private func hexPath(center: NSPoint, radius: CGFloat) -> NSBezierPath {
        let path = NSBezierPath()
        for i in 0..<6 {
            let angle = (CGFloat(i) * 60 - 90) * .pi / 180
            let p = NSPoint(x: center.x + radius * cos(angle), y: center.y + radius * sin(angle))
            if i == 0 { path.move(to: p) } else { path.line(to: p) }
        }
        path.close()
        path.lineJoinStyle = .round
        return path
    }

    static func decimal(_ value: Double) -> String {
        let text = String(format: "%.2f", value)
        var trimmed = text
        while trimmed.hasSuffix("0") { trimmed.removeLast() }
        if trimmed.hasSuffix(".") { trimmed.removeLast() }
        return trimmed
    }

    static func capitalized(_ text: String) -> String {
        text.prefix(1).uppercased() + text.dropFirst()
    }
}
