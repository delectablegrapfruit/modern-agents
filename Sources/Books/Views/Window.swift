import AppKit
import SwiftUI

/// Finds the window a SwiftUI view ends up in and hands it over once.
struct WindowAccessor: NSViewRepresentable {
    let onWindow: (NSWindow) -> Void

    func makeNSView(context: Context) -> WindowFinder { WindowFinder(onWindow: onWindow) }
    func updateNSView(_ nsView: WindowFinder, context: Context) {}

    final class WindowFinder: NSView {
        let onWindow: (NSWindow) -> Void
        private var delivered = false

        init(onWindow: @escaping (NSWindow) -> Void) {
            self.onWindow = onWindow
            super.init(frame: .zero)
        }

        required init?(coder: NSCoder) { return nil }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            guard !delivered, let window else { return }
            delivered = true
            onWindow(window)
        }
    }
}

/// In full screen the toolbar leaves with the menu bar and both slide back when the pointer reaches the top edge,
/// as in Preview and Safari. Everything else the window asks its delegate is passed on to the delegate SwiftUI
/// installed.
final class FullScreenChrome: NSObject, NSWindowDelegate {
    private static var installed: [ObjectIdentifier: FullScreenChrome] = [:]
    private weak var original: NSWindowDelegate?

    static func install(on window: NSWindow) {
        if window.delegate is FullScreenChrome { return }
        let proxy = FullScreenChrome()
        proxy.original = window.delegate
        window.delegate = proxy
        installed[ObjectIdentifier(window)] = proxy
    }

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (original?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if let original, original.responds(to: aSelector) { return original }
        return super.forwardingTarget(for: aSelector)
    }

    func window(_ window: NSWindow, willUseFullScreenPresentationOptions proposedOptions: NSApplication.PresentationOptions = []) -> NSApplication.PresentationOptions {
        [.fullScreen, .autoHideMenuBar, .autoHideToolbar]
    }
}
