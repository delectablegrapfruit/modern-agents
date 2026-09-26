import AppKit

/// A small borderless panel that floats over every app and every Space, on a dark HUD material. It never becomes
/// key or main and clicking it never activates the app, so the window you were working in keeps the keyboard.
final class FloatingPanel: NSPanel {
    init(board: BoardView) {
        let size = board.preferredSize
        super.init(contentRect: NSRect(origin: .zero, size: size), styleMask: [.borderless, .nonactivatingPanel],
                   backing: .buffered, defer: false)
        isFloatingPanel = true
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        hidesOnDeactivate = false
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        isMovableByWindowBackground = false
        isReleasedWhenClosed = false
        acceptsMouseMovedEvents = true
        animationBehavior = .utilityWindow
        appearance = NSAppearance(named: .darkAqua)

        let material = NSVisualEffectView(frame: NSRect(origin: .zero, size: size))
        material.material = .hudWindow
        material.blendingMode = .behindWindow
        // Always active: the app is never frontmost, and an inactive material turns flat grey.
        material.state = .active
        material.maskImage = FloatingPanel.roundedMask(radius: 11)
        material.autoresizingMask = [.width, .height]
        board.frame = material.bounds
        board.autoresizingMask = [.width, .height]
        material.addSubview(board)
        contentView = material
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }

    static func roundedMask(radius: CGFloat) -> NSImage {
        let edge = radius * 2 + 1
        let image = NSImage(size: NSSize(width: edge, height: edge), flipped: false) { rect in
            NSColor.black.setFill()
            NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
            return true
        }
        image.capInsets = NSEdgeInsets(top: radius, left: radius, bottom: radius, right: radius)
        image.resizingMode = .stretch
        return image
    }
}
