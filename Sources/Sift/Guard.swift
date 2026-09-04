import AppKit
import ApplicationServices
import SiftCore

/// Runs the window guard. While Finder is the frontmost app it looks once a
/// second; with Accessibility access each window also says when it moves, and
/// a look only costs a script when something about the windows changed. While
/// another app is in front nothing runs at all.
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
    /// Finder is gone (quit, or crashed): its stores are on disk, unguarded.
    var onFinderQuit: (() -> Void)?
    private var lastProblem: String?

    private let views: () -> ViewSettings
    /// Touched on `queue` only.
    private var tracker = WindowGuard.Tracker()
    private let session = WindowGuard.Session()
    private let queue = DispatchQueue(label: "sift.guard", qos: .userInitiated)
    private var observer: AXObserver?
    private var app: AXUIElement?
    private var timer: Timer?
    private var checkPending = false
    /// A check is running on the queue; another asked for meanwhile runs after it.
    private var busy = false
    private var again = false
    /// The next look runs the script whatever the windows say (queue only).
    private var force = true
    private var lastSignature: [String] = []
    private var lastFullLook = Date.distantPast
    private var notAllowedSince: Date?
    private var wasNotAllowed = false
    private var workspaceObservers: [NSObjectProtocol] = []

    init(views: @escaping () -> ViewSettings) {
        self.views = views
    }

    func start() {
        guard workspaceObservers.isEmpty else { return }
        let center = NSWorkspace.shared.notificationCenter
        func finder(_ note: Notification) -> Bool {
            (note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication)?.bundleIdentifier == Finder.bundleID
        }
        workspaceObservers.append(center.addObserver(forName: NSWorkspace.didLaunchApplicationNotification, object: nil, queue: .main) { [weak self] note in
            guard finder(note) else { return }
            self?.forget()
            self?.attach()
        })
        workspaceObservers.append(center.addObserver(forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main) { [weak self] note in
            guard finder(note) else { return }
            self?.detach()
            self?.forget()
            self?.onFinderQuit?()
        })
        // Finder in front is the only time its windows are being browsed.
        workspaceObservers.append(center.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] note in
            guard let self else { return }
            if finder(note) {
                if observer == nil { attach() }
                startTimer()
                scheduleCheck()
            } else {
                stopTimer()
            }
        })
        // Ask to control Finder now, in context, rather than the first time a
        // window moves while the person is doing something else.
        queue.async { [weak self] in
            let allowed = Permissions.automation(ask: true)
            DispatchQueue.main.async { [weak self] in
                guard let self, allowed == false else { return }
                report(WindowGuard.ScriptError.notAllowed)
            }
        }
        if Finder.isFrontmost { startTimer() }
        attach()
    }

    /// Windows will be looked at afresh (after Finder relaunches, or views change).
    func forget() {
        queue.async { [self] in
            tracker.reset()
            force = true
        }
    }

    /// Stops looking, once the look under way (if any) is done.
    @MainActor
    func pause() async {
        isPaused = true
        while busy { try? await Task.sleep(nanoseconds: 50_000_000) }
    }

    func resume() {
        isPaused = false
        forget()
        scheduleCheck()
    }

    private func startTimer() {
        guard timer == nil else { return }
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in self?.check() }
        timer.tolerance = 0.3
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
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
        var registered = 0
        for name in [kAXFocusedWindowChangedNotification, kAXMainWindowChangedNotification, kAXWindowCreatedNotification]
        where AXObserverAddNotification(observer, app, name as CFString, refcon) == .success {
            registered += 1
        }
        // Finder not serving Accessibility yet (it just launched): try again next time.
        guard registered > 0 else { return }
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .commonModes)
        self.observer = observer
        self.app = app
        windows(of: app).forEach(watch(window:))
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
        app = nil
        onModeChange?(false)
    }

    private func windows(of app: AXUIElement) -> [AXUIElement] {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &value) == .success else { return [] }
        return value as? [AXUIElement] ?? []
    }

    /// The windows' titles, in order: the same list means nothing moved (or a
    /// folder named like the last one), so a look can be skipped. Any thread.
    private func signature(of app: AXUIElement) -> [String]? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &value) == .success,
              let list = value as? [AXUIElement] else { return nil }
        return list.map { window in
            var title: CFTypeRef?
            AXUIElementCopyAttributeValue(window, kAXTitleAttribute as CFString, &title)
            return (title as? String) ?? "?"
        }
    }

    /// Finder posts several notifications per navigation; one check shortly after covers them all.
    private func scheduleCheck() {
        guard !checkPending else { return }
        checkPending = true
        queue.async { [self] in force = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            self?.checkPending = false
            self?.check()
        }
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
        let app = self.app
        queue.async { [self] in
            let outcome = look(settings, app: app)
            DispatchQueue.main.async { self.finish(outcome) }
        }
    }

    /// Queue. One script lists Finder's windows and gives every window that moved
    /// the view of the folder it now shows: its own, the custom folder above it,
    /// or the default. One refusal never skips the rest. With Accessibility the
    /// windows' titles are read first (no script, no process): unchanged titles
    /// mean no move, except once in a while, for a folder named like the last.
    private func look(_ settings: ViewSettings, app: AXUIElement?) -> Outcome {
        var outcome = Outcome()
        if !force, let app, let now = signature(of: app) {
            let stale = Date().timeIntervalSince(lastFullLook) > 10
            if now == lastSignature && !stale { return outcome }
            lastSignature = now
        }
        force = false
        lastFullLook = Date()
        let rules = WindowGuard.rules(settings)
        let report: WindowGuard.Report
        do {
            report = try session.look(rules, known: tracker.lines)
        } catch {
            outcome.notAllowed = (error as? WindowGuard.ScriptError) == .notAllowed
            outcome.errors.append(outcome.notAllowed ? error : Problem("Finder's windows could not be read: " + error.localizedDescription))
            if outcome.notAllowed { tracker.reset() }
            force = true
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
        if !report.failures.isEmpty { force = true }
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
