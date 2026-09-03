import AppKit
import ApplicationServices
import SiftCore

/// Runs the window guard: reacts to Finder's window changes through
/// Accessibility when allowed to, and otherwise looks once a second, but only
/// while Finder is the frontmost app, since that is the only time its windows
/// are being browsed. Idle cost is nothing.
final class Guardian {
    /// Set while Finder is being quit and relaunched.
    var isPaused = false
    /// Whether Sift may control Finder (Automation permission).
    var onNotAllowed: ((Bool) -> Void)?
    /// Whether the guard reacts instantly (Accessibility granted) or by looking once a second.
    var onModeChange: ((Bool) -> Void)?
    /// Finder refused a view; reported once per distinct message.
    var onProblem: ((String) -> Void)?
    /// A window was given a view: the folder and what it was set to.
    var onApplied: ((String, String) -> Void)?
    private var lastProblem: String?

    private let views: () -> ViewSettings
    private var tracker = WindowGuard.Tracker()
    private let session = WindowGuard.Session()
    private var observer: AXObserver?
    private var timer: Timer?
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
        // Finder coming to the front is the moment browsing can start.
        workspaceObservers.append(center.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] note in
            guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                  app.bundleIdentifier == Finder.bundleID else { return }
            self?.scheduleCheck()
        })
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in self?.tick() }
        timer.tolerance = 0.3
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
        attach()
    }

    /// Windows will be looked at afresh (after Finder relaunches, or views change).
    func forget() {
        tracker.reset()
    }

    private var finderIsFrontmost: Bool {
        NSWorkspace.shared.frontmostApplication?.bundleIdentifier == Finder.bundleID
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
        if observer == nil && AXIsProcessTrusted() { attach() }
        // Event-driven when Accessibility is granted; otherwise a look each second, and only while browsing.
        guard observer == nil, finderIsFrontmost else { return }
        check()
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
        let moved: [WindowGuard.Window]
        do {
            moved = tracker.moved(try session.windows())
        } catch {
            report(error)
            return
        }
        guard !moved.isEmpty else { return }
        let settings = views()
        // Every window that moved gets the view of the folder it now shows: its own,
        // the custom folder above it, or the default. One refusal never skips the rest.
        for window in moved {
            let (view, owner) = settings.view(for: window.path)
            do {
                try session.apply(view, to: window.id)
                onApplied?(window.path, view.mode.label + (owner == nil ? " (default)" : ""))
            } catch {
                report(error)
                if (error as? WindowGuard.ScriptError) == .notAllowed { return }
            }
        }
        if wasNotAllowed {
            wasNotAllowed = false
            onNotAllowed?(true)
        }
    }

    private func report(_ error: Error) {
        guard (error as? WindowGuard.ScriptError) == .notAllowed else {
            let message = error.localizedDescription
            if message != lastProblem {
                lastProblem = message
                onProblem?(message)
            }
            return
        }
        notAllowedSince = Date()
        wasNotAllowed = true
        onNotAllowed?(false)
    }
}
