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
        let descriptor = NSAppleEventDescriptor(bundleIdentifier: Finder.bundleID)
        // The descriptor owns the AEDesc: it must outlive the call.
        let status: OSStatus = withExtendedLifetime(descriptor) {
            guard let target = descriptor.aeDesc else { return -1 }
            return AEDeterminePermissionToAutomateTarget(target, AEEventClass(typeWildCard), AEEventID(typeWildCard), ask)
        }
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

    /// Installed and answering with the protocol this app speaks. A helper from
    /// an older build keeps serving until the protocol changes; then the window
    /// asks to allow it again.
    static var isReady: Bool { HelperClient.isReady(at: socketPath) }

    /// One administrator password; the helper then starts at every boot. The
    /// caller waits for it to answer, off the main thread.
    static func install() throws {
        guard AppBundle.isBundled, FileManager.default.fileExists(atPath: bundled) else {
            throw HelperError.refused("The helper ships inside Sift.app; run Sift from the app bundle.")
        }
        try Privileged.run(HelperInstall.script(bundledHelper: bundled, uid: getuid()))
    }

    /// One administrator password; the daemon and its definition are gone.
    static func uninstall() throws {
        try Privileged.run(HelperInstall.removeScript(uid: getuid()))
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

    /// The windows open now, front to back, to bring back after a relaunch.
    static func openWindows() async -> [WindowGuard.OpenWindow] {
        let session = WindowGuard.Session()
        return await Task.detached(priority: .userInitiated) { (try? session.openWindows()) ?? [] }.value
    }

    @MainActor
    static func launch() async {
        guard running.isEmpty else { return }
        let url = URL(fileURLWithPath: "/System/Library/CoreServices/Finder.app")
        _ = try? await NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration())
    }

    /// Opens the windows again once Finder answers; it takes a moment after launch.
    static func reopen(_ windows: [WindowGuard.OpenWindow]) async {
        guard !windows.isEmpty else { return }
        let session = WindowGuard.Session()
        for _ in 0..<20 {
            let done = await Task.detached(priority: .userInitiated) { (try? session.reopen(windows)) != nil }.value
            if done { return }
            try? await Task.sleep(nanoseconds: 500_000_000)
        }
    }
}
