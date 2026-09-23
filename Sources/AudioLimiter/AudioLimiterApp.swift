import AppKit
import LimiterCore
import SwiftUI

@main
struct AudioLimiterApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var model: LimiterModel

    init() {
        // The self-test works with scratch settings so it never touches the person's own.
        let store = SelfTest.isRequested
            ? SettingsStore(url: FileManager.default.temporaryDirectory.appendingPathComponent("Audio Limiter Self-Test \(UUID().uuidString).json"))
            : SettingsStore()
        let model = LimiterModel(store: store)
        _model = State(initialValue: model)
        AppDelegate.model = model
    }

    var body: some Scene {
        // A menu bar extra, like the system's own Sound menu: no Dock icon, no windows.
        MenuBarExtra {
            MenuView().environment(model)
        } label: {
            Image(systemName: model.menuBarSymbol)
                .accessibilityLabel("Audio Limiter")
        }
        .menuBarExtraStyle(.window)
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    static var model: LimiterModel?
    private var activity: NSObjectProtocol?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        guard let model = AppDelegate.model else { return }
        if SelfTest.isRequested {
            SelfTest.start(model: model)
            return
        }
        // A second copy would tap the first one's sound, and the first the second's: everything lowered twice.
        if let identifier = Bundle.main.bundleIdentifier,
           NSRunningApplication.runningApplications(withBundleIdentifier: identifier).contains(where: { $0 != NSRunningApplication.current }) {
            NSApp.terminate(nil)
            return
        }
        // Without App Nap the limiter starts the moment an app begins to play, however long it has been idle.
        activity = ProcessInfo.processInfo.beginActivity(
            options: [.userInitiatedAllowingIdleSystemSleep], reason: "Limiting the volume of output devices"
        )
        model.start()
    }

    func applicationWillTerminate(_ notification: Notification) {
        AppDelegate.model?.shutdown()
    }
}
