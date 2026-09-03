import AppKit
import ServiceManagement
import UserNotifications
import WinnowCore

enum AppBundle {
    /// Login items and notifications only work when running from a real `.app` bundle.
    static var isBundled: Bool {
        Bundle.main.bundleURL.pathExtension == "app" && Bundle.main.bundleIdentifier != nil
    }
}

enum Notifier {
    static func requestAuthorization() {
        guard AppBundle.isBundled else { return }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    static func notify(title: String, body: String) {
        guard AppBundle.isBundled else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}

enum LoginItemError: LocalizedError {
    case notBundled

    var errorDescription: String? {
        "Launch at login needs Winnow to run from Winnow.app."
    }
}

enum LoginItem {
    static var isAvailable: Bool { AppBundle.isBundled }

    static var isEnabled: Bool {
        guard isAvailable else { return false }
        return SMAppService.mainApp.status == .enabled
    }

    static func set(_ enabled: Bool) throws {
        guard isAvailable else { throw LoginItemError.notBundled }
        if enabled {
            try SMAppService.mainApp.register()
        } else {
            try SMAppService.mainApp.unregister()
        }
    }
}

/// Finder must be quit before `.DS_Store` files are written (it flushes its own on
/// quit) and relaunched afterwards so it reads the new preferences and files.
enum FinderApplier {
    static let finderID = "com.apple.finder"

    @MainActor
    static func quitFinder() async {
        let running = NSRunningApplication.runningApplications(withBundleIdentifier: finderID)
        guard !running.isEmpty else { return }
        running.forEach { $0.terminate() }
        for _ in 0..<30 where !running.allSatisfy(\.isTerminated) {
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        running.filter { !$0.isTerminated }.forEach { $0.forceTerminate() }
        for _ in 0..<20 where !running.allSatisfy(\.isTerminated) {
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
    }

    @MainActor
    static func launchFinder() async {
        // launchd normally restarts Finder on its own; make sure.
        try? await Task.sleep(nanoseconds: 800_000_000)
        if NSRunningApplication.runningApplications(withBundleIdentifier: finderID).isEmpty {
            let url = URL(fileURLWithPath: "/System/Library/CoreServices/Finder.app")
            _ = try? await NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration())
        }
    }
}

/// Backs the "Clean with Winnow" entry in Finder's Services menu (declared in Info.plist).
final class ServicesProvider: NSObject {
    private let handler: ([URL]) -> Void

    init(handler: @escaping ([URL]) -> Void) {
        self.handler = handler
    }

    @objc func cleanWithWinnow(_ pasteboard: NSPasteboard, userData: String?, error: AutoreleasingUnsafeMutablePointer<NSString?>) {
        let options: [NSPasteboard.ReadingOptionKey: Any] = [.urlReadingFileURLsOnly: true]
        guard let urls = pasteboard.readObjects(forClasses: [NSURL.self], options: options) as? [URL], !urls.isEmpty else {
            error.pointee = "No files were provided."
            return
        }
        handler(urls)
    }
}
