import AppKit
import SwiftUI
import WinnowCore

@main
struct WinnowApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model: AppModel

    init() {
        let model = AppModel()
        _model = StateObject(wrappedValue: model)
        AppDelegate.sharedModel = model
    }

    var body: some Scene {
        Window("Winnow", id: "main") {
            MainView()
                .environmentObject(model)
        }
        .defaultSize(width: 540, height: 720)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }

        MenuBarExtra {
            MenuBarView()
                .environmentObject(model)
        } label: {
            MenuBarLabel()
                .environmentObject(model)
        }
    }
}

/// Opens the main window from places that have no SwiftUI environment
/// (the app delegate, the Services handler).
enum WindowOpener {
    @MainActor static var open: () -> Void = {
        NSApp.activate(ignoringOtherApps: true)
        NSApp.windows.first { $0.title == "Winnow" }?.makeKeyAndOrderFront(nil)
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    static var sharedModel: AppModel?
    private var services: ServicesProvider?

    func applicationWillFinishLaunching(_ notification: Notification) {
        services = ServicesProvider { urls in
            Task { @MainActor in
                WindowOpener.open()
                AppDelegate.sharedModel?.sweep(urls: urls)
            }
        }
        NSApp.servicesProvider = services
        NSUpdateDynamicServices()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        AppDelegate.sharedModel?.start()
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        WindowOpener.open()
        AppDelegate.sharedModel?.sweep(urls: urls)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { WindowOpener.open() }
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationWillTerminate(_ notification: Notification) {
        AppDelegate.sharedModel?.engine.stop()
    }
}
