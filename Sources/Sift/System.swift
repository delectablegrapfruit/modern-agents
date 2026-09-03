import AppKit
import ApplicationServices
import ServiceManagement
import SiftCore

enum AppBundle {
    /// Login items only work when running from a real `.app` bundle.
    static var isBundled: Bool {
        Bundle.main.bundleURL.pathExtension == "app" && Bundle.main.bundleIdentifier != nil
    }
}

enum LoginItem {
    static var isAvailable: Bool { AppBundle.isBundled }

    static var isEnabled: Bool {
        guard isAvailable else { return false }
        return SMAppService.mainApp.status == .enabled
    }

    static func set(_ enabled: Bool) throws {
        guard isAvailable else { return }
        if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
    }

    /// A background utility has to be running to do its job: it registers itself
    /// once, and macOS tells the person, who can turn it off in the menu.
    static func registerOnFirstLaunch() {
        let key = "registeredLoginItem"
        guard isAvailable, !UserDefaults.standard.bool(forKey: key) else { return }
        UserDefaults.standard.set(true, forKey: key)
        try? set(true)
    }
}

enum Permissions {
    /// Full Disk Access shows as the ability to read a privacy-protected file.
    static var hasFullDiskAccess: Bool {
        let probe = NSHomeDirectory() + "/Library/Application Support/com.apple.TCC/TCC.db"
        return FileManager.default.isReadableFile(atPath: probe)
    }

    static func openFullDiskAccess() {
        open("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
    }

    static func openAutomation() {
        open("x-apple.systempreferences:com.apple.preference.security?Privacy_Automation")
    }

    static func requestAccessibility() {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
    }

    private static func open(_ string: String) {
        if let url = URL(string: string) { NSWorkspace.shared.open(url) }
    }
}

/// Finder reads its preferences at launch and flushes `.DS_Store` on the way
/// out, so it is stopped before anything is written and started again after.
enum Finder {
    static let bundleID = "com.apple.finder"

    @MainActor
    static func quit() async {
        let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID)
        guard !running.isEmpty else { return }
        for app in running { kill(app.processIdentifier, SIGTERM) }
        for _ in 0..<30 where !running.allSatisfy(\.isTerminated) {
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        running.filter { !$0.isTerminated }.forEach { $0.forceTerminate() }
        for _ in 0..<20 where !running.allSatisfy(\.isTerminated) {
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
    }

    @MainActor
    static func relaunch() async {
        // launchd normally brings Finder back on its own; make sure.
        try? await Task.sleep(nanoseconds: 800_000_000)
        if NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).isEmpty {
            let url = URL(fileURLWithPath: "/System/Library/CoreServices/Finder.app")
            _ = try? await NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration())
        }
    }
}
