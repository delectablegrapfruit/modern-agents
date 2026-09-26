import AppKit

/// Starts the app by hand (no storyboard, no SwiftUI scene): one floating panel is the whole interface.
@main
struct LullApp {
    @MainActor
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
        _ = delegate
    }
}
