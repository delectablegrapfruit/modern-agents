import AppKit
import SpriteKit
import SkirmishCore

/// A small borderless panel that floats over every app and every Space, and takes clicks without bringing
/// Skirmish forward: whatever you were working in stays the active app.
final class FloatingPanel: NSPanel {
    init(contentRect: NSRect) {
        super.init(contentRect: contentRect, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        isFloatingPanel = true
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        hidesOnDeactivate = false
        becomesKeyOnlyIfNeeded = false
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        isMovableByWindowBackground = false
        isReleasedWhenClosed = false
        acceptsMouseMovedEvents = true
        animationBehavior = .utilityWindow
        title = "Skirmish"
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

/// The panel's rounded, dark body.
final class RoundedView: NSView {
    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.cornerRadius = 12
        layer?.cornerCurve = .continuous
        layer?.masksToBounds = true
        layer?.backgroundColor = Palette.background.color().cgColor
        layer?.borderWidth = 1
        layer?.borderColor = NSColor(white: 1, alpha: 0.09).cgColor
    }

    required init?(coder: NSCoder) { nil }
}

/// The SpriteKit view. It routes the pointer: the header drags the window (and holds its buttons), the rest goes to
/// the battle. Entering and leaving it is what pauses and resumes the game.
final class GameView: SKView {
    weak var controller: PanelController?
    private var tracking: NSTrackingArea?
    private var windowDrag: (mouse: NSPoint, origin: NSPoint, moved: Bool)?

    var battleScene: BattleScene? { scene as? BattleScene }

    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let tracking { removeTrackingArea(tracking) }
        let area = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .mouseMoved, .activeAlways, .inVisibleRect],
                                  owner: self, userInfo: nil)
        addTrackingArea(area)
        tracking = area
    }

    private func scenePoint(_ event: NSEvent) -> CGPoint? {
        guard let scene else { return nil }
        return scene.convertPoint(fromView: convert(event.locationInWindow, from: nil))
    }

    override func mouseDown(with event: NSEvent) {
        window?.makeKey()
        window?.makeFirstResponder(self)
        guard let scene = battleScene, let p = scenePoint(event), let window else { return }
        switch scene.headerHit(at: p) {
        case .drag: windowDrag = (mouse: NSEvent.mouseLocation, origin: window.frame.origin, moved: false)
        case .compact: controller?.setCompact(true)
        case .close: controller?.hide()
        case .force: scene.cycleForce()
        case .none: scene.pointerDown(at: p, clickCount: event.clickCount)
        }
    }

    override func mouseDragged(with event: NSEvent) {
        if var drag = windowDrag, let window {
            let m = NSEvent.mouseLocation
            let dx = m.x - drag.mouse.x, dy = m.y - drag.mouse.y
            if abs(dx) + abs(dy) > 3 { drag.moved = true }
            if drag.moved { window.setFrameOrigin(NSPoint(x: drag.origin.x + dx, y: drag.origin.y + dy)) }
            windowDrag = drag
            return
        }
        if let p = scenePoint(event) { battleScene?.pointerDragged(to: p) }
    }

    override func mouseUp(with event: NSEvent) {
        if let drag = windowDrag {
            windowDrag = nil
            if drag.moved { controller?.rememberPosition() }
            else if battleScene?.isCompact == true { controller?.setCompact(false) }
            return
        }
        if let p = scenePoint(event) { battleScene?.pointerUp(at: p) }
    }

    override func mouseMoved(with event: NSEvent) {
        if let p = scenePoint(event) { battleScene?.pointerMoved(to: p) }
    }

    override func rightMouseDown(with event: NSEvent) { battleScene?.cancelSelection() }

    override func mouseEntered(with event: NSEvent) { controller?.setHovering(true) }

    override func mouseExited(with event: NSEvent) { controller?.setHovering(false) }

    override func scrollWheel(with event: NSEvent) {
        let delta = event.hasPreciseScrollingDeltas ? event.scrollingDeltaY / 6 : event.scrollingDeltaY * 4
        battleScene?.scroll(delta)
    }

    override func keyDown(with event: NSEvent) {
        if event.modifierFlags.contains(.command) {
            switch event.charactersIgnoringModifiers?.lowercased() {
            case "q": NSApp.terminate(nil); return
            case "w": controller?.hide(); return
            default: break
            }
        }
        if event.charactersIgnoringModifiers?.lowercased() == "c", !event.modifierFlags.contains(.command) {
            controller?.setCompact(!(battleScene?.isCompact ?? false))
            return
        }
        if battleScene?.key(event) != true { super.keyDown(with: event) }
    }
}

/// Owns the panel: its size, its place on screen, the compact pill, and pausing when the pointer is elsewhere.
@MainActor
final class PanelController: NSObject {
    let panel: FloatingPanel
    let gameView: GameView
    let scene: BattleScene
    let session: GameSession
    private let body: RoundedView
    private(set) var hovering = false

    init(session: GameSession) {
        self.session = session
        let size = PanelController.contentSize(compact: Settings.compact)
        let frame = PanelController.initialFrame(size: size)
        panel = FloatingPanel(contentRect: frame)
        body = RoundedView(frame: NSRect(origin: .zero, size: size))
        gameView = GameView(frame: body.bounds)
        scene = BattleScene(session: session, size: size)
        super.init()
        gameView.autoresizingMask = [.width, .height]
        gameView.ignoresSiblingOrder = true
        gameView.preferredFramesPerSecond = 60
        gameView.controller = self
        body.addSubview(gameView)
        panel.contentView = body
        if Settings.compact {
            scene.setCompact(true)
            body.layer?.cornerRadius = size.height / 2
        }
        gameView.presentScene(scene)
    }

    static func contentSize(compact: Bool) -> NSSize {
        if compact { return BattleScene.pillSize }
        let side = Settings.size.side
        return NSSize(width: side, height: side + BattleScene.headerHeight + 2)
    }

    private static func initialFrame(size: NSSize) -> NSRect {
        let screens = NSScreen.screens
        if let topLeft = Settings.topLeft {
            let frame = NSRect(x: topLeft.x, y: topLeft.y - size.height, width: size.width, height: size.height)
            if screens.contains(where: { $0.visibleFrame.intersects(frame.insetBy(dx: 20, dy: 20)) }) { return frame }
        }
        let visible = (NSScreen.main ?? screens.first)?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        return NSRect(x: visible.maxX - size.width - 20, y: visible.maxY - size.height - 20, width: size.width, height: size.height)
    }

    var isRunning: Bool {
        panel.isVisible && !scene.isCompact && (hovering || !Settings.pauseWhenAway)
    }

    func show() {
        panel.orderFrontRegardless()
        Settings.visible = true
        hovering = panel.frame.contains(NSEvent.mouseLocation)
        updatePauseState()
        panel.invalidateShadow()
    }

    func hide() {
        panel.orderOut(nil)
        Settings.visible = false
        hovering = false
        updatePauseState()
        session.save()
    }

    func toggle() {
        if panel.isVisible { hide() } else { show() }
    }

    func setHovering(_ inside: Bool) {
        hovering = inside
        updatePauseState()
    }

    func setCompact(_ on: Bool) {
        guard on != scene.isCompact else { return }
        Settings.compact = on
        resize(to: PanelController.contentSize(compact: on))
        body.layer?.cornerRadius = on ? BattleScene.pillSize.height / 2 : 12
        scene.setCompact(on)
        hovering = panel.frame.contains(NSEvent.mouseLocation)
        updatePauseState()
        if on { session.save() }
    }

    func setSize(_ size: Settings.Size) {
        Settings.size = size
        if !scene.isCompact { resize(to: PanelController.contentSize(compact: false)) }
    }

    /// Resizes about the top-left corner, which is where the window is remembered from.
    private func resize(to size: NSSize) {
        let old = panel.frame
        panel.setFrame(NSRect(x: old.minX, y: old.maxY - size.height, width: size.width, height: size.height), display: true)
        panel.invalidateShadow()
    }

    func rememberPosition() {
        Settings.topLeft = NSPoint(x: panel.frame.minX, y: panel.frame.maxY)
    }

    func move(topLeft: NSPoint) {
        panel.setFrameTopLeftPoint(topLeft)
        rememberPosition()
    }

    /// Runs the game while the pointer is over it (or always, if you turned that off); otherwise shows the pause
    /// curtain, dims the panel, and stops SpriteKit drawing altogether so it costs nothing in the background.
    func updatePauseState() {
        let running = isRunning
        scene.setAwayPaused(!running)
        if running {
            gameView.isPaused = false
        } else {
            gameView.isPaused = false
            Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: 300_000_000)
                guard let self, !self.isRunning else { return }
                self.gameView.isPaused = true
            }
        }
        let dim = Settings.dimWhenAway && !hovering && !scene.isCompact
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.25
            self.panel.animator().alphaValue = dim ? 0.6 : 1
        }
    }
}
