import AppKit
import SwiftUI
import SiftCore

@main
struct SiftApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model: Model

    init() {
        let model = Model()
        _model = StateObject(wrappedValue: model)
        AppDelegate.model = model
    }

    var body: some Scene {
        Window("Sift", id: "main") {
            MainWindow().environmentObject(model)
        }
        .defaultSize(width: 560, height: 720)
        .commands { CommandGroup(replacing: .newItem) {} }

        MenuBarExtra {
            MenuBarMenu().environmentObject(model)
        } label: {
            MenuBarLabel().environmentObject(model)
        }
    }
}

/// Opens the main window from places without a SwiftUI environment.
enum WindowOpener {
    @MainActor static var open: () -> Void = {
        NSApp.activate(ignoringOtherApps: true)
        NSApp.windows.first { $0.title == "Sift" }?.makeKeyAndOrderFront(nil)
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    static var model: Model?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        LoginItem.registerOnFirstLaunch()
        AppDelegate.model?.start()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { WindowOpener.open() }
        return true
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        AppDelegate.model?.checkPermissions()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationWillTerminate(_ notification: Notification) {
        AppDelegate.model?.engine.stop()
    }
}
