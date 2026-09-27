import AppKit
import SpriteKit
import RoninArt
import RoninCore

/// A small borderless panel that floats over every app and every Space, and takes clicks without bringing Ronin
/// forward: whatever you were working in stays the active app.
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
        title = "Ronin"
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

/// The SpriteKit view. It routes the pointer: the header drags the window (and holds its buttons); on the lane the
/// left button cuts left and the right button (or a control-click) cuts right. Entering and leaving it is what resumes
/// and pauses the fight; dragging the window pauses it too. A cut takes the keys, so the arrows cut as well, and
/// leaving gives them back to the app you work in.
final class GameView: SKView {
    weak var controller: PanelController?
    private var tracking: NSTrackingArea?
    private var windowDrag: (mouse: NSPoint, origin: NSPoint, moved: Bool)?
    /// Held while frames run: the app is never frontmost, and App Nap would otherwise slow a fight in play.
    private var activity: NSObjectProtocol?

    var duelScene: DuelScene? { scene as? DuelScene }

    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override var isPaused: Bool {
        didSet {
            if isPaused, let activity {
                ProcessInfo.processInfo.endActivity(activity)
                self.activity = nil
            } else if !isPaused, activity == nil {
                activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiatedAllowingIdleSystemSleep, .latencyCritical],
                                                                 reason: "Ronin fight in play")
            }
        }
    }

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
        guard let scene = duelScene, let p = scenePoint(event), let window else { return }
        switch scene.headerHit(at: p) {
        case .drag: windowDrag = (mouse: NSEvent.mouseLocation, origin: window.frame.origin, moved: false)
        case .compact: controller?.setCompact(true)
        case .close: controller?.hide()
        case .none:
            // A cut takes the keys, so the arrows cut too; the app you work in stays the active one. The header and
            // the pill never take them.
            window.makeKey()
            window.makeFirstResponder(self)
            scene.press(event.modifierFlags.contains(.control) ? .right : .left)
        }
    }

    override func rightMouseDown(with event: NSEvent) {
        guard let scene = duelScene, let p = scenePoint(event), scene.headerHit(at: p) == .none else { return }
        window?.makeKey()
        window?.makeFirstResponder(self)
        scene.press(.right)
    }

    /// No context menu: the right button is a sword.
    override func menu(for event: NSEvent) -> NSMenu? { nil }

    override func mouseDragged(with event: NSEvent) {
        if var drag = windowDrag, let window {
            let m = NSEvent.mouseLocation
            let dx = m.x - drag.mouse.x, dy = m.y - drag.mouse.y
            if !drag.moved, abs(dx) + abs(dy) > 3 {
                drag.moved = true
                controller?.setDragging(true)
            }
            if drag.moved {
                var origin = NSPoint(x: drag.origin.x + dx, y: drag.origin.y + dy)
                // Never up under a menu bar, where the header could not be caught again.
                if let top = PanelController.screen(at: m)?.visibleFrame.maxY { origin.y = min(origin.y, top - window.frame.height) }
                window.setFrameOrigin(origin)
            }
            windowDrag = drag
            return
        }
        if let p = scenePoint(event) { duelScene?.pointerMoved(to: p) }
    }

    override func mouseUp(with event: NSEvent) {
        if let drag = windowDrag {
            windowDrag = nil
            if drag.moved { controller?.endDrag() } else if duelScene?.isCompact == true { controller?.setCompact(false) }
        }
        // The pointer may have left while the button was held, when the keys could not be given back.
        controller?.releaseKeysIfAway()
    }

    override func mouseMoved(with event: NSEvent) {
        if let p = scenePoint(event) { duelScene?.pointerMoved(to: p) }
    }

    override func mouseEntered(with event: NSEvent) {
        if let p = scenePoint(event) { duelScene?.pointerMoved(to: p) }
        controller?.setHovering(true)
    }

    override func mouseExited(with event: NSEvent) { controller?.setHovering(false) }

    /// ←/→, A/D, F/J cut (Space or Return goes on, or resumes), C folds, Esc or ⌘W hides. Keys the panel still holds
    /// with the pointer away (while leaving pauses) are dropped, as are keys with ⌘, ⌃ or ⌥ (meant for another app)
    /// and keys the game does not use: nothing typed elsewhere cuts, resumes, folds or beeps.
    override func keyDown(with event: NSEvent) {
        guard let controller, controller.hovering || !Settings.pauseWhenAway else { return }
        let modifiers = event.modifierFlags.intersection([.command, .control, .option])
        let key = event.charactersIgnoringModifiers?.lowercased()
        if modifiers == .command, key == "w" { controller.hide(); return }
        guard modifiers.isEmpty else { return }
        if event.keyCode == 53 { controller.hide(); return }
        if key == "c" {
            controller.setCompact(!(duelScene?.isCompact ?? false))
            return
        }
        _ = duelScene?.key(event)
        // A key may have gone on past a stage's card.
        controller.refreshRunning()
    }
}

/// Owns the panel: its size, its place on screen, the compact pill, and pausing when the pointer is elsewhere (or the
/// window is being dragged).
@MainActor
final class PanelController: NSObject {
    let panel: FloatingPanel
    let gameView: GameView
    let scene: DuelScene
    let session: GameSession
    private let body: RoundedView
    private(set) var hovering = false
    /// The window is being dragged by its header: the fight holds still until it is let go.
    private(set) var dragging = false
    /// Whether the fight should run, as the pause state was last set, and the watch that notices a change nothing
    /// reports (see `watchForCards`).
    private var running: Bool?
    private var watch: Task<Void, Never>?
    private var screenObserver: NSObjectProtocol?

    init(session: GameSession) {
        self.session = session
        let size = PanelController.contentSize(compact: Settings.compact)
        let frame = PanelController.initialFrame(size: size)
        panel = FloatingPanel(contentRect: frame)
        body = RoundedView(frame: NSRect(origin: .zero, size: size))
        gameView = GameView(frame: body.bounds)
        scene = DuelScene(session: session, size: size)
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
        // A display plugged in or out, or its resolution changed: the panel is kept in view.
        screenObserver = NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification,
                                                                object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.ensureOnScreen() }
        }
    }

    /// A wide, short strip: the lane is three and a third times as wide as it is tall. The scene draws the ronin
    /// `Tuning.figure` (0.312) lane units tall, the height every weapon's reach is measured against; this shape makes
    /// that 0.52 of the lane's height, which is the headroom the figures are drawn for.
    static func contentSize(compact: Bool) -> NSSize {
        compact ? DuelScene.pillSize : contentSize(Settings.size)
    }

    /// The panel unfolded at a size.
    static func contentSize(_ size: Settings.Size) -> NSSize {
        NSSize(width: size.width, height: (size.width * 0.3).rounded() + DuelScene.headerHeight)
    }

    // MARK: Where it sits

    /// The screen that holds most of `frame` (by its full frame, menu bar included); nil if it is on none.
    static func screen(holding frame: NSRect) -> NSScreen? {
        func area(_ r: NSRect) -> CGFloat { r.isNull || r.isEmpty ? 0 : r.width * r.height }
        guard let screen = NSScreen.screens.max(by: { area($0.frame.intersection(frame)) < area($1.frame.intersection(frame)) }),
              area(screen.frame.intersection(frame)) > 0
        else { return nil }
        return screen
    }

    /// The visible frame (menu bar and Dock left out) of the screen that holds most of `frame`.
    static func home(for frame: NSRect) -> NSRect? { screen(holding: frame)?.visibleFrame }

    /// The screen under a point on the desktop, such as the pointer.
    static func screen(at point: NSPoint) -> NSScreen? {
        NSScreen.screens.first { NSMouseInRect(point, $0.frame, false) }
    }

    /// Slides `frame` (keeping its size) wholly inside `visible`; if it cannot fit, its top-left (the header) wins.
    static func constrained(_ frame: NSRect, in visible: NSRect) -> NSRect {
        var f = frame
        f.origin.x = max(visible.minX, min(f.minX, visible.maxX - f.width))
        f.origin.y = min(visible.maxY - f.height, max(f.minY, visible.minY))
        return f
    }

    /// Where the panel sits until it is moved: a screen's bottom-right corner, clear of the edges.
    static func defaultFrame(size: NSSize, in visible: NSRect) -> NSRect {
        constrained(NSRect(x: visible.maxX - size.width - 20, y: visible.minY + 20, width: size.width, height: size.height), in: visible)
    }

    /// Where it was left, pulled wholly back into view on the screen it was on (from under a menu bar, say), or the
    /// default corner if that screen is gone.
    private static func initialFrame(size: NSSize) -> NSRect {
        if let topLeft = Settings.topLeft {
            let frame = NSRect(x: topLeft.x, y: topLeft.y - size.height, width: size.width, height: size.height)
            if let visible = home(for: frame) { return constrained(frame, in: visible) }
        }
        let visible = (NSScreen.main ?? NSScreen.screens.first)?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        return defaultFrame(size: size, in: visible)
    }

    /// Pulls the panel wholly back onto the screen it mostly lies on; if it is on none (its display gone), puts it in
    /// the corner of the pointer's screen. Remembers where it ends up.
    func ensureOnScreen() {
        let f = panel.frame
        let target: NSRect
        if let visible = PanelController.home(for: f) {
            target = PanelController.constrained(f, in: visible)
        } else if let visible = (PanelController.screen(at: NSEvent.mouseLocation) ?? NSScreen.main ?? NSScreen.screens.first)?.visibleFrame {
            target = PanelController.defaultFrame(size: f.size, in: visible)
        } else {
            return
        }
        guard target != f else { return }
        panel.setFrame(target, display: true)
        panel.invalidateShadow()
        rememberPosition()
    }

    /// Moves the panel to another screen, to the same place in it: a corner stays a corner.
    private func move(to screen: NSScreen) {
        let f = panel.frame
        let to = screen.visibleFrame
        let from = PanelController.home(for: f) ?? to
        func place(_ v: CGFloat, _ lo: CGFloat, _ room: CGFloat, _ newLo: CGFloat, _ newRoom: CGFloat) -> CGFloat {
            newLo + (room > 0 ? (v - lo) / room : 0) * max(0, newRoom)
        }
        let x = place(f.minX, from.minX, from.width - f.width, to.minX, to.width - f.width)
        let y = place(f.minY, from.minY, from.height - f.height, to.minY, to.height - f.height)
        panel.setFrame(PanelController.constrained(NSRect(x: x, y: y, width: f.width, height: f.height), in: to), display: true)
        panel.invalidateShadow()
        rememberPosition()
    }

    /// Resizes toward the middle of the screen: the edges nearest the screen's edges stay put, so a panel in a corner
    /// grows out of it (and folds back into it), and the whole panel stays in view. The new top-left is remembered.
    private func resize(to size: NSSize) {
        let old = panel.frame
        let visible = PanelController.home(for: old) ?? PanelController.screen(at: NSEvent.mouseLocation)?.visibleFrame ?? old
        let x = old.midX > visible.midX ? old.maxX - size.width : old.minX
        let y = old.midY < visible.midY ? old.minY : old.maxY - size.height
        panel.setFrame(PanelController.constrained(NSRect(x: x, y: y, width: size.width, height: size.height), in: visible), display: true)
        panel.invalidateShadow()
        rememberPosition()
    }

    func rememberPosition() {
        Settings.topLeft = NSPoint(x: panel.frame.minX, y: panel.frame.maxY)
    }

    /// Puts the top-left corner at a point, keeping the whole panel in view.
    func move(topLeft: NSPoint) {
        let size = panel.frame.size
        var frame = NSRect(x: topLeft.x, y: topLeft.y - size.height, width: size.width, height: size.height)
        if let visible = PanelController.home(for: frame) { frame = PanelController.constrained(frame, in: visible) }
        panel.setFrame(frame, display: true)
        panel.invalidateShadow()
        rememberPosition()
    }

    // MARK: Showing and hiding

    /// The fight runs while the panel is up, unfolded and not being dragged, with the pointer over it. With Pause When
    /// Pointer Leaves off it also runs with the pointer away, until a stage's card comes up: an idle card stops
    /// drawing.
    var isRunning: Bool {
        panel.isVisible && !scene.isCompact && !dragging && (hovering || (!Settings.pauseWhenAway && !scene.isShowingBanner))
    }

    func show() {
        ensureOnScreen()
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

    /// The shortcut: shows the panel on the screen the pointer is on (moving it there, to the same corner, from
    /// another display), or hides it if it is showing there already.
    func summon() {
        let here = PanelController.screen(at: NSEvent.mouseLocation)
        let there = PanelController.screen(holding: panel.frame)
        let elsewhere = here != nil && there != nil && here?.frame != there?.frame
        if panel.isVisible, !elsewhere {
            hide()
            return
        }
        if elsewhere, let here { move(to: here) }
        show()
    }

    func setHovering(_ inside: Bool) {
        hovering = inside
        if !inside, Settings.pauseWhenAway { releaseKeys() }
        updatePauseState()
    }

    /// Dragging by the header holds the fight still; letting go resumes it as the pointer coming back does.
    func setDragging(_ on: Bool) {
        guard on != dragging else { return }
        dragging = on
        // Enter and exit events are not to be trusted across a drag: ask where the pointer is.
        if !on { hovering = panel.frame.contains(NSEvent.mouseLocation) }
        updatePauseState()
    }

    /// A drag let go: the panel settled wholly on the screen it mostly lies on (below the menu bar, clear of the
    /// Dock) and remembered there, and the fight let go too.
    func endDrag() {
        ensureOnScreen()
        rememberPosition()
        setDragging(false)
    }

    /// Hands the keyboard back to the app you work in. A key non-activating panel keeps the keys until it is ordered
    /// out, so it is ordered out and straight back in, unseen. Never mid-press (a drag would end).
    func releaseKeys() {
        guard panel.isVisible, panel.isKeyWindow, NSEvent.pressedMouseButtons == 0 else { return }
        let animation = panel.animationBehavior
        panel.animationBehavior = .none
        panel.orderOut(nil)
        panel.orderFrontRegardless()
        panel.animationBehavior = animation
        panel.invalidateShadow()
    }

    /// Gives the keys back if the pointer is not over the panel (and leaving pauses): after a press let go outside.
    func releaseKeysIfAway() {
        guard Settings.pauseWhenAway, !panel.frame.contains(NSEvent.mouseLocation) else { return }
        releaseKeys()
    }

    func setCompact(_ on: Bool) {
        guard on != scene.isCompact else { return }
        Settings.compact = on
        // Folding, the scene folds first, so the shrinking window never lays the lane out at the pill's size;
        // unfolding, the window grows first, so the lane is laid out once, at its own size. The dead stay.
        if on { scene.setCompact(true) }
        resize(to: PanelController.contentSize(compact: on))
        body.layer?.cornerRadius = on ? DuelScene.pillSize.height / 2 : 12
        if !on { scene.setCompact(false) }
        hovering = panel.frame.contains(NSEvent.mouseLocation)
        updatePauseState()
        if on { session.save() }
    }

    func setSize(_ size: Settings.Size) {
        Settings.size = size
        if !scene.isCompact { resize(to: PanelController.contentSize(compact: false)) }
    }

    /// Floor Hints on or off. The lane is left as it is (the dead stay): the mouse-button hint comes up or goes at
    /// once, and the reach marks follow on the next frame. Turning them on teaches the buttons again.
    func setFloorHints(_ on: Bool) {
        Settings.floorHints = on
        if on { Settings.hintShown = false }
        scene.refreshHints()
    }

    // MARK: Pausing

    /// Runs the fight while the pointer is over the panel (or always, if you turned that off); otherwise pauses on
    /// the spot, dims the panel, and a moment later stops SpriteKit drawing so it costs nothing in the background.
    func updatePauseState() {
        let running = isRunning
        self.running = running
        scene.setAway(!running, instant: !Settings.pauseWhenAway)
        gameView.isPaused = false
        if !running {
            Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: 1_200_000_000)
                guard let self, !self.isRunning, !self.hovering else { return }
                self.gameView.isPaused = true
            }
        }
        watchForCards()
        let dim = Settings.dimWhenAway && !hovering && !scene.isCompact
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.25
            self.panel.animator().alphaValue = dim ? 0.6 : 1
        }
    }

    /// Sets the pause state again if whether the fight should run has changed since it was last set.
    func refreshRunning() {
        if isRunning != running { updatePauseState() }
    }

    /// With Pause When Pointer Leaves off and the pointer away, the fight goes on by itself, and a stage's card can
    /// come up (or be passed with the keys) with nothing to report it. A watch, only then, notices: an idle card stops
    /// drawing, and the next stage starts drawing again.
    private func watchForCards() {
        let needed = panel.isVisible && !scene.isCompact && !hovering && !dragging && !Settings.pauseWhenAway
        guard needed else {
            watch?.cancel()
            watch = nil
            return
        }
        guard watch == nil else { return }
        watch = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 250_000_000)
                guard let self else { return }
                self.refreshRunning()
            }
        }
    }
}
