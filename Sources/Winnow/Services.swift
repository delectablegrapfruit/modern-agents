import AppKit
import ServiceManagement
import UserNotifications

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

enum Finder {
    static func relaunch() {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/killall")
        process.arguments = ["Finder"]
        try? process.run()
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
