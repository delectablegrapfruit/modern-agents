import AppKit

/// The floating window: borderless, rounded, above other windows on every Space, and non-activating — clicking it
/// takes the keyboard without bringing the app forward, so the app you were working in stays frontmost with its
/// menu bar, and a click back into it hands the keyboard straight back.
final class GamePanel: NSPanel {
    static let sizes = [CGSize(width: 256, height: 160), CGSize(width: 336, height: 210), CGSize(width: 448, height: 280)]
    static let sizeNames = ["Small", "Medium", "Large"]
    static let margin: CGFloat = 14

    init(size: CGSize) {
        super.init(contentRect: NSRect(origin: .zero, size: size), styleMask: [.borderless, .nonactivatingPanel],
                   backing: .buffered, defer: false)
        isFloatingPanel = true
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        hidesOnDeactivate = false
        becomesKeyOnlyIfNeeded = false
        isMovableByWindowBackground = true
        isReleasedWhenClosed = false
        backgroundColor = .clear
        isOpaque = false
        hasShadow = true
        animationBehavior = .utilityWindow
        title = "Sideways"
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    /// The bottom-right corner of the main screen.
    func placeInDefaultCorner() {
        guard let screen = NSScreen.main ?? NSScreen.screens.first else { return }
        let visible = screen.visibleFrame
        setFrameOrigin(NSPoint(x: visible.maxX - frame.width - GamePanel.margin, y: visible.minY + GamePanel.margin))
    }

    /// Resizes keeping the corner nearest a screen corner where it is, so a window tucked into a corner stays tucked.
    func resize(to size: CGSize) {
        let screen = self.screen ?? NSScreen.main
        let visible = screen?.visibleFrame ?? frame
        let old = frame
        var origin = old.origin
        if old.midX > visible.midX { origin.x = old.maxX - size.width }
        if old.midY > visible.midY { origin.y = old.maxY - size.height }
        var next = NSRect(origin: origin, size: size)
        next.origin.x = min(max(next.origin.x, visible.minX), visible.maxX - size.width)
        next.origin.y = min(max(next.origin.y, visible.minY), visible.maxY - size.height)
        setFrame(next, display: true, animate: false)
        invalidateShadow()
    }

    /// Pulled back onto a screen if the display it was on has gone.
    func keepOnScreen() {
        let onScreen = NSScreen.screens.contains { $0.visibleFrame.intersects(frame.insetBy(dx: 40, dy: 40)) }
        if !onScreen { placeInDefaultCorner() }
    }
}
