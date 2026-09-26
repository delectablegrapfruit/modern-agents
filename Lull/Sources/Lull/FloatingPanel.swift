import AppKit

/// A borderless panel that floats over other apps, joins every Space, and can still take the keyboard.
final class FloatingPanel: NSPanel {
    init(contentRect: NSRect) {
        super.init(contentRect: contentRect, styleMask: [.borderless, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        isFloatingPanel = true
        level = .floating
        hidesOnDeactivate = false
        becomesKeyOnlyIfNeeded = false
        isMovableByWindowBackground = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        minSize = NSSize(width: 340, height: 420)
        isReleasedWhenClosed = false
        title = "Lull"
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

/// The panel's content: a rounded, clipped box holding the blur (for the Glass background) and the game.
/// It claims the mouse along the edges (resizing) and over the page's title bar (dragging); everything else goes to
/// the web view.
final class ChromeView: NSView {
    static let radius: CGFloat = 14
    let effect = NSVisualEffectView()
    /// Rectangles in page coordinates (points from the top left) where a press drags the window.
    var dragRects: [NSRect] = []
    var noDragRects: [NSRect] = []

    private struct Edges: OptionSet {
        let rawValue: Int
        static let left = Edges(rawValue: 1), right = Edges(rawValue: 2), top = Edges(rawValue: 4), bottom = Edges(rawValue: 8)
    }
    private var resizing: (edges: Edges, frame: NSRect, mouse: NSPoint)?

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.cornerRadius = ChromeView.radius
        layer?.masksToBounds = true
        effect.frame = bounds
        effect.autoresizingMask = [.width, .height]
        effect.blendingMode = .behindWindow
        effect.state = .active
        effect.material = .hudWindow
        effect.maskImage = ChromeView.maskImage(radius: ChromeView.radius)
        addSubview(effect)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override var isFlipped: Bool { true }

    static func maskImage(radius: CGFloat) -> NSImage {
        let edge = 2 * radius + 1
        let image = NSImage(size: NSSize(width: edge, height: edge), flipped: false) { rect in
            NSColor.black.setFill()
            NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
            return true
        }
        image.capInsets = NSEdgeInsets(top: radius, left: radius, bottom: radius, right: radius)
        image.resizingMode = .stretch
        return image
    }

    private func edges(at p: NSPoint) -> Edges {
        let band: CGFloat = 5, corner: CGFloat = 16
        var e: Edges = []
        if p.x < band { e.insert(.left) }
        if p.x > bounds.width - band { e.insert(.right) }
        if p.y < 3 { e.insert(.top) }
        if p.y > bounds.height - band { e.insert(.bottom) }
        // The grip in the bottom-right corner, and generous corners generally.
        if p.x > bounds.width - corner && p.y > bounds.height - corner { e = [.right, .bottom] }
        if p.x < corner && p.y > bounds.height - corner && (p.x < band || p.y > bounds.height - band) { e = [.left, .bottom] }
        return e
    }

    private func inDragRegion(_ p: NSPoint) -> Bool {
        if noDragRects.contains(where: { $0.contains(p) }) { return false }
        return dragRects.contains(where: { $0.contains(p) })
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        let p = convert(point, from: superview)
        guard bounds.contains(p) else { return super.hitTest(point) }
        if !edges(at: p).isEmpty || inDragRegion(p) { return self }
        if let event = NSApp.currentEvent, event.type == .leftMouseDown, event.modifierFlags.contains(.command) { return self }
        return super.hitTest(point)
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func mouseDown(with event: NSEvent) {
        guard let window else { return }
        let p = convert(event.locationInWindow, from: nil)
        let e = edges(at: p)
        if !e.isEmpty {
            resizing = (e, window.frame, NSEvent.mouseLocation)
            return
        }
        window.performDrag(with: event)
    }

    override func mouseDragged(with event: NSEvent) {
        guard let window, let r = resizing else { return }
        let m = NSEvent.mouseLocation
        let dx = m.x - r.mouse.x, dy = m.y - r.mouse.y
        let minSize = window.minSize
        var f = r.frame
        if r.edges.contains(.right) { f.size.width = max(minSize.width, r.frame.width + dx) }
        if r.edges.contains(.left) {
            let w = max(minSize.width, r.frame.width - dx)
            f.origin.x = r.frame.maxX - w
            f.size.width = w
        }
        if r.edges.contains(.bottom) {
            let h = max(minSize.height, r.frame.height - dy)
            f.origin.y = r.frame.maxY - h
            f.size.height = h
        }
        if r.edges.contains(.top) { f.size.height = max(minSize.height, r.frame.height + dy) }
        window.setFrame(f, display: true)
    }

    override func mouseUp(with event: NSEvent) { resizing = nil }

    override func resetCursorRects() {
        let band: CGFloat = 5
        addCursorRect(NSRect(x: 0, y: 0, width: band, height: bounds.height), cursor: .resizeLeftRight)
        addCursorRect(NSRect(x: bounds.width - band, y: 0, width: band, height: bounds.height), cursor: .resizeLeftRight)
        addCursorRect(NSRect(x: 0, y: bounds.height - band, width: bounds.width, height: band), cursor: .resizeUpDown)
    }

    override func layout() {
        super.layout()
        window?.invalidateCursorRects(for: self)
    }
}
