import AppKit
import ApplicationServices
import SiftCore

/// Runs the window guard: reacts to Finder's window changes through
/// Accessibility when allowed to, and otherwise looks once a second, but only
/// while Finder is the frontmost app, since that is the only time its windows
/// are being browsed. Idle cost is nothing.
///
/// Finder is only ever spoken to from a background queue, one script at a
/// time: a busy Finder can take seconds to answer, and the app's own window
/// and menu bar must never wait on it.
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
    /// Touched on `queue` only.
    private var tracker = WindowGuard.Tracker()
    private let session = WindowGuard.Session()
    private let queue = DispatchQueue(label: "sift.guard", qos: .userInitiated)
    private var observer: AXObserver?
    private var timer: Timer?
    private var checkPending = false
    /// A check is running on the queue; another asked for meanwhile runs after it.
    private var busy = false
    private var again = false
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
        queue.async { [self] in tracker.reset() }
    }

    private var finderIsFrontmost: Bool {
        NSWorkspace.shared.frontmostApplication?.bundleIdentifier == Finder.bundleID
    }

    // MARK: Accessibility

    /// Finder posts app-level notifications for new and focused windows, and each
    /// window posts one when its title changes, which is what moving to another
    /// folder does. Both are watched: a move is then seen within a fraction of a
    /// second, and the look each second is only for a folder named like the last.
    private func attach() {
        detach()
        guard AXIsProcessTrusted(),
              let finder = NSRunningApplication.runningApplications(withBundleIdentifier: Finder.bundleID).first else { return }
        var created: AXObserver?
        let callback: AXObserverCallback = { _, element, notification, refcon in
            guard let refcon else { return }
            let guardian = Unmanaged<Guardian>.fromOpaque(refcon).takeUnretainedValue()
            if notification as String == kAXWindowCreatedNotification { guardian.watch(window: element) }
            guardian.scheduleCheck()
        }
        guard AXObserverCreate(finder.processIdentifier, callback, &created) == .success, let observer = created else { return }
        let app = AXUIElementCreateApplication(finder.processIdentifier)
        // Never wait long on a busy Finder from the main thread.
        AXUIElementSetMessagingTimeout(app, 0.5)
        let refcon = Unmanaged.passUnretained(self).toOpaque()
        for name in [kAXFocusedWindowChangedNotification, kAXMainWindowChangedNotification, kAXWindowCreatedNotification] {
            AXObserverAddNotification(observer, app, name as CFString, refcon)
        }
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .commonModes)
        self.observer = observer
        var windows: CFTypeRef?
        if AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &windows) == .success,
           let list = windows as? [AXUIElement] {
            list.forEach(watch(window:))
        }
        onModeChange?(true)
        scheduleCheck()
    }

    /// A window's title is the folder it shows; a change is a move.
    private func watch(window: AXUIElement) {
        guard let observer else { return }
        AXUIElementSetMessagingTimeout(window, 0.5)
        AXObserverAddNotification(observer, window, kAXTitleChangedNotification as CFString, Unmanaged.passUnretained(self).toOpaque())
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
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            self?.checkPending = false
            self?.check()
        }
    }

    private func tick() {
        if observer == nil && AXIsProcessTrusted() { attach() }
        // With Accessibility nearly every move is seen at once; the look each second
        // covers what posts nothing (a folder named like the last) and the case without it.
        guard finderIsFrontmost else { return }
        check()
    }

    // MARK: Checking

    private struct Problem: LocalizedError {
        let errorDescription: String?
        init(_ message: String) { errorDescription = message }
    }

    private struct Outcome {
        var applied: [(path: String, view: String)] = []
        var errors: [Error] = []
        var notAllowed = false
    }

    /// Main thread. Starts one look at Finder's windows on the queue.
    private func check() {
        guard !isPaused else { return }
        if let since = notAllowedSince {
            // Try again now and then in case permission was granted meanwhile.
            guard Date().timeIntervalSince(since) > 60 else { return }
            notAllowedSince = nil
        }
        guard !NSRunningApplication.runningApplications(withBundleIdentifier: Finder.bundleID).isEmpty else {
            forget()
            return
        }
        guard !busy else {
            again = true
            return
        }
        busy = true
        let settings = views()
        queue.async { [self] in
            let outcome = look(settings)
            DispatchQueue.main.async { self.finish(outcome) }
        }
    }

    /// Queue. One script lists Finder's windows and gives every window that moved
    /// the view of the folder it now shows: its own, the custom folder above it,
    /// or the default. One refusal never skips the rest.
    private func look(_ settings: ViewSettings) -> Outcome {
        var outcome = Outcome()
        let rules = WindowGuard.rules(settings)
        let report: WindowGuard.Report
        do {
            report = try session.look(rules, known: tracker.lines)
        } catch {
            outcome.notAllowed = (error as? WindowGuard.ScriptError) == .notAllowed
            outcome.errors.append(outcome.notAllowed ? error : Problem("Finder's windows could not be read: " + error.localizedDescription))
            if outcome.notAllowed { tracker.reset() }
            return outcome
        }
        tracker.update(with: report)
        for applied in report.applied where rules.indices.contains(applied.rule) {
            outcome.applied.append((applied.window.path, rules[applied.rule].label))
        }
        // A window that closed, or is between folders, has nothing to say; it is
        // looked at again next time either way.
        for failure in report.failures where failure.number != -1728 {
            outcome.errors.append(Problem("Finder did not take the view of \(Paths.display(failure.path)): " + failure.message))
        }
        return outcome
    }

    /// Main thread.
    private func finish(_ outcome: Outcome) {
        busy = false
        for (path, view) in outcome.applied { onApplied?(path, view) }
        for error in outcome.errors { report(error) }
        if !outcome.notAllowed && wasNotAllowed {
            wasNotAllowed = false
            onNotAllowed?(true)
        }
        if again {
            again = false
            check()
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
