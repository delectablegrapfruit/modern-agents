import AppKit
import ApplicationServices
import SiftCore

/// Runs the window guard: reacts to Finder's window changes through
/// Accessibility when allowed to, and looks once a second otherwise.
final class Guardian {
    /// Set while Finder is being quit and relaunched.
    var isPaused = false
    /// Whether Sift may control Finder (Automation permission).
    var onNotAllowed: ((Bool) -> Void)?
    /// Whether the guard reacts instantly (Accessibility granted) or by looking once a second.
    var onModeChange: ((Bool) -> Void)?

    private let views: () -> ViewSettings
    private var tracker = WindowGuard.Tracker()
    private let session = WindowGuard.Session()
    private var observer: AXObserver?
    private var timer: Timer?
    private var ticks = 0
    private var checkPending = false
    private var notAllowedSince: Date?
    private var wasNotAllowed = false
    private var workspaceObservers: [NSObjectProtocol] = []

    init(views: @escaping () -> ViewSettings) {
        self.views = views
    }

    func start() {
        guard timer == nil else { return }
        let center = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.didLaunchApplicationNotification, NSWorkspace.didTerminateApplicationNotification] {
            workspaceObservers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                      app.bundleIdentifier == Finder.bundleID else { return }
                self?.forget()
                self?.attach()
            })
        }
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in self?.tick() }
        timer.tolerance = 0.2
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
        attach()
    }

    /// Windows will be looked at afresh (after Finder relaunches, or views change).
    func forget() {
        tracker.reset()
    }

    // MARK: Accessibility

    private func attach() {
        detach()
        guard AXIsProcessTrusted(),
              let finder = NSRunningApplication.runningApplications(withBundleIdentifier: Finder.bundleID).first else { return }
        var created: AXObserver?
        let callback: AXObserverCallback = { _, _, _, refcon in
            guard let refcon else { return }
            Unmanaged<Guardian>.fromOpaque(refcon).takeUnretainedValue().scheduleCheck()
        }
        guard AXObserverCreate(finder.processIdentifier, callback, &created) == .success, let observer = created else { return }
        let app = AXUIElementCreateApplication(finder.processIdentifier)
        let refcon = Unmanaged.passUnretained(self).toOpaque()
        for name in [kAXFocusedWindowChangedNotification, kAXMainWindowChangedNotification,
                     kAXWindowCreatedNotification, kAXTitleChangedNotification] {
            AXObserverAddNotification(observer, app, name as CFString, refcon)
        }
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .commonModes)
        self.observer = observer
        onModeChange?(true)
        scheduleCheck()
    }

    private func detach() {
        guard let observer else { return }
        CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .commonModes)
        self.observer = nil
        onModeChange?(false)
    }

    /// Finder posts several notifications per navigation; one check shortly after covers them all.
    private func scheduleCheck() {
        guard !checkPending else { return }
        checkPending = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            self?.checkPending = false
            self?.check()
        }
    }

    private func tick() {
        ticks += 1
        if observer == nil {
            if AXIsProcessTrusted() { attach() } else { check() }
        } else if ticks % 5 == 0 {
            check()
        }
    }

    private func check() {
        guard !isPaused else { return }
        if let since = notAllowedSince {
            // Try again now and then in case permission was granted meanwhile.
            guard Date().timeIntervalSince(since) > 60 else { return }
            notAllowedSince = nil
        }
        guard !NSRunningApplication.runningApplications(withBundleIdentifier: Finder.bundleID).isEmpty else {
            tracker.reset()
            return
        }
        do {
            let moved = tracker.moved(try session.windows())
            guard !moved.isEmpty else { return }
            let settings = views()
            for window in moved {
                try session.apply(settings.view(for: window.path).view, to: window.id)
            }
            if wasNotAllowed {
                wasNotAllowed = false
                onNotAllowed?(true)
            }
        } catch {
            guard (error as? WindowGuard.ScriptError) == .notAllowed else { return }
            notAllowedSince = Date()
            wasNotAllowed = true
            onNotAllowed?(false)
        }
    }
}
