import AppKit
import WinnowCore

/// Polls Finder's windows twice a second while Finder runs and gives every window
/// that moved to a folder without its own view the default view.
final class FinderGuard {
    var isEnabled = false {
        didSet {
            guard isEnabled != oldValue else { return }
            tracker = FinderWindowGuard.Tracker()
            failure = nil
        }
    }
    /// Set while Finder is being quit and relaunched.
    var isPaused = false
    var onFailure: ((String) -> Void)?
    private(set) var failure: String?

    private let makePlan: () -> FolderViewPlan
    private var cachedPlan: FolderViewPlan?
    private var tracker = FinderWindowGuard.Tracker()
    private var timer: Timer?

    init(plan: @escaping () -> FolderViewPlan) {
        makePlan = plan
    }

    func start() {
        guard timer == nil else { return }
        let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in self?.tick() }
        timer.tolerance = 0.1
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    /// Folder views changed: the next window move re-reads them.
    func forgetPlan() {
        cachedPlan = nil
    }

    private func tick() {
        guard isEnabled, !isPaused, failure == nil else { return }
        guard !NSRunningApplication.runningApplications(withBundleIdentifier: FinderApplier.finderID).isEmpty else {
            tracker = FinderWindowGuard.Tracker()
            return
        }
        do {
            let moved = tracker.moved(try FinderWindowGuard.windows())
            guard !moved.isEmpty else { return }
            let plan = cachedPlan ?? makePlan()
            cachedPlan = plan
            let defaults = FinderDefaults.read()
            for window in moved where plan.view(covering: window.path) == nil {
                try FinderWindowGuard.setDefaultView(windowID: window.id, defaults: defaults)
            }
        } catch {
            guard FinderWindowGuard.isPermissionError(error) else { return }
            failure = error.localizedDescription
            onFailure?(error.localizedDescription)
        }
    }
}
