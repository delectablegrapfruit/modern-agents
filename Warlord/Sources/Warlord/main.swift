import AppKit

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    // No Dock icon, no app menu: a panel and a menu-bar item.
    app.setActivationPolicy(.accessory)
    withExtendedLifetime(delegate) { app.run() }
}
