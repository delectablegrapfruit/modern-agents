import AppKit
import ApplicationServices
import WinnowCore

/// Runs the window guard: reacts to Finder's window changes through Accessibility
/// when Winnow is allowed to, and checks once a second otherwise.
final class FinderGuard {
    var isEnabled = false {
        didSet {
            guard isEnabled != oldValue else { return }
            tracker = FinderWindowGuard.Tracker()
            failure = nil
            if isEnabled { attach() } else { detach() }
        }
    }
    /// Set while Finder is being quit and relaunched.
    var isPaused = false
    var onFailure: ((String) -> Void)?
    /// Reports whether the guard reacts instantly (Accessibility granted) or by polling.
    var onModeChange: ((Bool) -> Void)?
    private(set) var failure: String?

    private let makePlan: () -> FolderViewPlan
    private var cachedPlan: FolderViewPlan?
    private var tracker = FinderWindowGuard.Tracker()
    private let session = FinderWindowGuard.Session()
    private var observer: AXObserver?
    private var timer: Timer?
    private var ticks = 0
    private var checkPending = false
    private var workspaceObservers: [NSObjectProtocol] = []

    init(plan: @escaping () -> FolderViewPlan) {
        makePlan = plan
    }

    static var isAccessibilityTrusted: Bool { AXIsProcessTrusted() }

    /// Asks macOS to show the Accessibility prompt for Winnow.
    static func requestAccessibility() {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
    }

    var isInstant: Bool { observer != nil }

    func start() {
        guard timer == nil else { return }
        let center = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.didLaunchApplicationNotification, NSWorkspace.didTerminateApplicationNotification] {
            workspaceObservers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                      app.bundleIdentifier == FinderApplier.finderID else { return }
                self?.tracker = FinderWindowGuard.Tracker()
                self?.attach()
            })
        }
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in self?.tick() }
        timer.tolerance = 0.2
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
        attach()
    }

    /// Folder views changed: the next window move re-reads them.
    func forgetPlan() {
        cachedPlan = nil
    }

    // MARK: Accessibility

    private func attach() {
        detach()
        guard isEnabled, AXIsProcessTrusted(),
              let finder = NSRunningApplication.runningApplications(withBundleIdentifier: FinderApplier.finderID).first else { return }
        var created: AXObserver?
        let callback: AXObserverCallback = { _, _, _, refcon in
            guard let refcon else { return }
            Unmanaged<FinderGuard>.fromOpaque(refcon).takeUnretainedValue().scheduleCheck()
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
            if isEnabled, AXIsProcessTrusted() { attach() } else { check() }
        } else if ticks % 5 == 0 {
            check()
        }
    }

    private func check() {
        guard isEnabled, !isPaused, failure == nil else { return }
        guard !NSRunningApplication.runningApplications(withBundleIdentifier: FinderApplier.finderID).isEmpty else {
            tracker = FinderWindowGuard.Tracker()
            return
        }
        do {
            let moved = tracker.moved(try session.windows())
            guard !moved.isEmpty else { return }
            let plan = cachedPlan ?? makePlan()
            cachedPlan = plan
            let defaults = FinderDefaults.read()
            for window in moved where plan.view(covering: window.path) == nil {
                try session.setDefaultView(windowID: window.id, defaults: defaults)
            }
        } catch {
            guard FinderWindowGuard.isPermissionError(error) else { return }
            failure = error.localizedDescription
            onFailure?(error.localizedDescription)
        }
    }
}
