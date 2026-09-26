import AppKit
import SpriteKit
import OnslaughtCore

/// A small borderless panel that floats over every app and every Space. Clicking it never brings Onslaught forward
/// and never takes the keyboard: whatever you were typing into keeps the caret.
final class FloatingPanel: NSPanel {
    init(contentRect: NSRect) {
        super.init(contentRect: contentRect, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        isFloatingPanel = true
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        hidesOnDeactivate = false
        becomesKeyOnlyIfNeeded = true
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        isMovableByWindowBackground = false
        isReleasedWhenClosed = false
        acceptsMouseMovedEvents = true
        animationBehavior = .utilityWindow
        title = "Onslaught"
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
        layer?.backgroundColor = Palette.background.cg()
        layer?.borderWidth = 1
        layer?.borderColor = NSColor(white: 1, alpha: 0.09).cgColor
    }

    required init?(coder: NSCoder) { nil }
}

/// The SpriteKit view. It routes the pointer: the header drags the window (and holds its buttons), the rest steers
/// the ship. Entering and leaving it is what resumes and pauses the fight.
final class GameView: SKView {
    weak var controller: PanelController?
    private var tracking: NSTrackingArea?
    private var windowDrag: (mouse: NSPoint, origin: NSPoint, moved: Bool)?

    var arenaScene: ArenaScene? { scene as? ArenaScene }

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
        guard let scene = arenaScene, let p = scenePoint(event), let window else { return }
        switch scene.headerHit(at: p) {
        case .drag: windowDrag = (mouse: NSEvent.mouseLocation, origin: window.frame.origin, moved: false)
        case .compact: controller?.setCompact(true)
        case .close: controller?.hide()
        case .none: scene.pointerDown(at: p)
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
        if let p = scenePoint(event) { arenaScene?.pointerMoved(to: p) }
    }

    override func mouseUp(with event: NSEvent) {
        guard let drag = windowDrag else { return }
        windowDrag = nil
        if drag.moved { controller?.rememberPosition() } else if arenaScene?.isCompact == true { controller?.setCompact(false) }
    }

    override func mouseMoved(with event: NSEvent) {
        if let p = scenePoint(event) { arenaScene?.pointerMoved(to: p) }
    }

    override func mouseEntered(with event: NSEvent) {
        if let p = scenePoint(event) { arenaScene?.pointerMoved(to: p) }
        controller?.setHovering(true)
    }

    override func mouseExited(with event: NSEvent) { controller?.setHovering(false) }

    override func keyDown(with event: NSEvent) {
        if event.modifierFlags.contains(.command) {
            switch event.charactersIgnoringModifiers?.lowercased() {
            case "q": NSApp.terminate(nil); return
            case "w": controller?.hide(); return
            default: break
            }
        }
        if event.keyCode == 53 { controller?.hide(); return }
        if event.charactersIgnoringModifiers?.lowercased() == "c", !event.modifierFlags.contains(.command) {
            controller?.setCompact(!(arenaScene?.isCompact ?? false))
            return
        }
        if arenaScene?.key(event) != true { super.keyDown(with: event) }
    }
}

/// Owns the panel: its size, its place on screen, the compact pill, and pausing when the pointer is elsewhere.
@MainActor
final class PanelController: NSObject {
    let panel: FloatingPanel
    let gameView: GameView
    let scene: ArenaScene
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
        scene = ArenaScene(session: session, size: size)
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
        if compact { return ArenaScene.pillSize }
        let w = Settings.size.width
        return NSSize(width: w, height: (w * 1.25).rounded() + ArenaScene.headerHeight)
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
        body.layer?.cornerRadius = on ? ArenaScene.pillSize.height / 2 : 12
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

    /// Runs the fight while the pointer is over the panel (or always, if you turned that off); otherwise pauses on
    /// the spot, dims the panel, and a moment later stops SpriteKit drawing so it costs nothing in the background.
    func updatePauseState() {
        let running = isRunning
        scene.setAway(!running, instant: !Settings.pauseWhenAway)
        gameView.isPaused = false
        if !running {
            Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: 400_000_000)
                guard let self, !self.isRunning, !self.hovering else { return }
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
