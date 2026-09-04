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
        let fd = Darwin.open(probe, O_RDONLY)
        guard fd >= 0 else { return false }
        close(fd)
        return true
    }

    static func openFullDiskAccess() {
        show("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
    }

    static func openAutomation() {
        show("x-apple.systempreferences:com.apple.preference.security?Privacy_Automation")
    }

    /// Whether Sift may control Finder; nil when that cannot be told (Finder
    /// not running). With `ask`, macOS puts the consent dialog up now.
    static func automation(ask: Bool) -> Bool? {
        guard let target = NSAppleEventDescriptor(bundleIdentifier: Finder.bundleID).aeDesc else { return nil }
        let status = AEDeterminePermissionToAutomateTarget(target, AEEventClass(typeWildCard), AEEventID(typeWildCard), ask)
        switch status {
        case 0: return true
        case -1743: return false  // errAEEventNotPermitted
        default: return nil
        }
    }

    static func requestAccessibility() {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
    }

    private static func show(_ string: String) {
        if let url = URL(string: string) { NSWorkspace.shared.open(url) }
    }
}

/// Sift's root helper: installed once with an administrator password, then
/// used for anything the app itself may not delete.
enum Helper {
    static var bundled: String { Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/sift-helper").path }
    static var socketPath: String { HelperInstall.socketPath(uid: getuid()) }

    /// Installed, current, and answering.
    static var isReady: Bool {
        guard let installed = FileManager.default.contents(atPath: HelperInstall.binary),
              let ours = FileManager.default.contents(atPath: bundled), installed == ours else { return false }
        return HelperClient.isReady(at: socketPath)
    }

    /// One administrator password; the helper then starts at every boot.
    static func install() throws {
        guard AppBundle.isBundled, FileManager.default.fileExists(atPath: bundled) else {
            throw HelperError.refused("The helper ships inside Sift.app; run Sift from the app bundle.")
        }
        try Privileged.run(HelperInstall.script(bundledHelper: bundled, uid: getuid()))
        let deadline = Date().addingTimeInterval(5)
        while !HelperClient.isReady(at: socketPath) && Date() < deadline { Thread.sleep(forTimeInterval: 0.2) }
    }
}

/// Finder reads its preferences at launch and flushes `.DS_Store` on the way
/// out, so it is stopped before anything is written and started again after.
/// It is asked to quit the way its Quit menu item would: after that launchd
/// leaves it down (a signal would have it back within seconds, before the
/// writes, reading the old files), so it is started again by Sift.
enum Finder {
    static let bundleID = "com.apple.finder"

    private static var running: [NSRunningApplication] {
        NSRunningApplication.runningApplications(withBundleIdentifier: bundleID)
    }

    static var isFrontmost: Bool {
        NSWorkspace.shared.frontmostApplication?.bundleIdentifier == bundleID
    }

    /// True once Finder is gone.
    @MainActor
    static func quit() async -> Bool {
        let apps = running
        guard !apps.isEmpty else { return true }
        let session = WindowGuard.Session()
        let asked = await Task.detached(priority: .userInitiated) { (try? session.quitFinder()) != nil }.value
        if asked, await gone(apps, within: 10) { return true }
        // Not scriptable (permission refused): the same request through AppKit.
        apps.forEach { $0.terminate() }
        return await gone(apps, within: 5)
    }

    @MainActor
    private static func gone(_ apps: [NSRunningApplication], within seconds: Int) async -> Bool {
        for _ in 0..<(seconds * 10) {
            if apps.allSatisfy(\.isTerminated) { return true }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        return apps.allSatisfy(\.isTerminated)
    }

    @MainActor
    static func launch() async {
        guard running.isEmpty else { return }
        let url = URL(fileURLWithPath: "/System/Library/CoreServices/Finder.app")
        _ = try? await NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration())
    }
}
