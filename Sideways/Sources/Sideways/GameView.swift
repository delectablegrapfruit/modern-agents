import AppKit
import QuartzCore
import SidewaysCore

/// The window's only view: keys in, frames out. A display link drives the game while anything moves and is paused
/// the rest of the time, so a parked game costs nothing. Losing the keyboard pauses the game; a driving key resumes it.
final class GameView: NSView {
    let game: Game
    private(set) var art: TrackArt
    /// The menu for a right click (the same as the menu bar item's).
    var menuProvider: (() -> NSMenu?)?
    /// ⌘W: tuck the window away.
    var onHide: (() -> Void)?
    /// Something the menus show changed (track, ghost, paint…).
    var onChange: (() -> Void)?
    private var link: CADisplayLink?
    private var lastTimestamp: CFTimeInterval = 0
    private(set) var isHovering = false
    private var observers: [NSObjectProtocol] = []

    init(game: Game, size: CGSize) {
        self.game = game
        art = TrackArt(track: game.track)
        super.init(frame: NSRect(origin: .zero, size: size))
        wantsLayer = true
        layer?.cornerRadius = 12
        layer?.masksToBounds = true
        layer?.cornerCurve = .continuous
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    deinit { observers.forEach { NotificationCenter.default.removeObserver($0) } }

    override var isFlipped: Bool { false }
    override var isOpaque: Bool { false }
    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override var mouseDownCanMoveWindow: Bool { true }

    var isFocused: Bool { window?.isKeyWindow ?? false }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers = []
        guard let window else { return }
        if link == nil {
            let link = displayLink(target: self, selector: #selector(step(_:)))
            link.add(to: .main, forMode: .common)
            link.isPaused = true
            self.link = link
        }
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: NSWindow.didBecomeKeyNotification, object: window, queue: .main) { [weak self] _ in
            self?.focusChanged()
        })
        observers.append(center.addObserver(forName: NSWindow.didResignKeyNotification, object: window, queue: .main) { [weak self] _ in
            self?.game.pause()
            self?.focusChanged()
        })
        updateAlpha(animated: false)
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach { removeTrackingArea($0) }
        addTrackingArea(NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self))
    }

    override func mouseEntered(with event: NSEvent) {
        isHovering = true
        updateAlpha(animated: true)
        needsDisplay = true
    }

    override func mouseExited(with event: NSEvent) {
        isHovering = false
        updateAlpha(animated: true)
        needsDisplay = true
    }

    override func menu(for event: NSEvent) -> NSMenu? { menuProvider?() }

    private func focusChanged() {
        updateAlpha(animated: true)
        wake()
    }

    /// Full strength while playing; faded into the background while parked, unless the pointer is over it.
    func updateAlpha(animated: Bool) {
        guard let window else { return }
        let alpha: CGFloat = isFocused ? 1 : isHovering ? 0.94 : game.records.fadeWhenIdle ? 0.6 : 1
        if animated {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = 0.2
                window.animator().alphaValue = alpha
            }
        } else {
            window.alphaValue = alpha
        }
    }

    /// Redraws now, and runs frames for as long as the game is moving.
    func wake() {
        if game.track.info.id != art.id { art = TrackArt(track: game.track) }
        needsDisplay = true
        guard let link, game.isAnimating, link.isPaused else { return }
        lastTimestamp = 0
        link.isPaused = false
    }

    @objc private func step(_ link: CADisplayLink) {
        let now = link.timestamp
        let dt = lastTimestamp > 0 ? now - lastTimestamp : 1.0 / 60
        lastTimestamp = now
        game.advance(by: dt)
        needsDisplay = true
        if !game.isAnimating {
            link.isPaused = true
            lastTimestamp = 0
        }
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        if game.track.info.id != art.id { art = TrackArt(track: game.track) }
        Renderer(game: game, art: art, size: bounds.size, focused: isFocused, hovering: isHovering).draw(in: ctx)
    }

    // MARK: Keys

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        guard event.modifierFlags.contains(.command) else { return super.performKeyEquivalent(with: event) }
        switch event.charactersIgnoringModifiers?.lowercased() {
        case "q":
            NSApp.terminate(nil)
            return true
        case "w", "h":
            onHide?()
            return true
        default:
            return super.performKeyEquivalent(with: event)
        }
    }

    override func keyDown(with event: NSEvent) {
        // Every plain key is the game's: an unhandled one would only beep.
        handleKey(event.keyCode, down: true, isRepeat: event.isARepeat)
    }

    override func keyUp(with event: NSEvent) {
        handleKey(event.keyCode, down: false, isRepeat: false)
    }

    /// Virtual key codes, so WASD is where it is on any keyboard layout.
    func handleKey(_ code: UInt16, down: Bool, isRepeat: Bool) {
        var driving = true
        switch code {
        case 123, 0: game.keys.left = down      // ← A
        case 124, 2: game.keys.right = down     // → D
        case 126, 13: game.keys.up = down       // ↑ W
        case 125, 1: game.keys.down = down      // ↓ S
        case 49: game.keys.handbrake = down     // space
        default: driving = false
        }
        if driving {
            if down && game.isPaused { game.resume() }
            wake()
            return
        }
        guard down, !isRepeat else { return }
        switch code {
        case 15:                                // R
            game.reset()
        case 53, 35:                            // esc, P
            if game.isPaused {
                game.showHelp = false
            } else {
                game.pause()
            }
        case 5:                                 // G
            game.setShowGhost(!game.records.showGhost)
            onChange?()
        case 33:                                // [
            game.cycleTrack(-1)
            onChange?()
        case 30:                                // ]
            game.cycleTrack(1)
            onChange?()
        case 4, 44:                             // H, /
            if game.showHelp { game.dismissHelp() } else { game.showHelp = true; game.pause() }
        default:
            return
        }
        wake()
    }
}
