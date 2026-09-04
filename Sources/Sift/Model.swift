import AppKit
import Combine
import SwiftUI
import SiftCore

/// Cancellation flag plus a light throttle for progress reporting.
final class WorkToken {
    private let lock = NSLock()
    private var cancelled = false
    private var lastReport = Date.distantPast

    var isCancelled: Bool { lock.lock(); defer { lock.unlock() }; return cancelled }
    func cancel() { lock.lock(); cancelled = true; lock.unlock() }

    /// True at most ten times a second.
    func shouldReport() -> Bool {
        lock.lock(); defer { lock.unlock() }
        let now = Date()
        guard now.timeIntervalSince(lastReport) > 0.1 else { return false }
        lastReport = now
        return true
    }
}

@MainActor
final class Model: ObservableObject {
    enum SweepState: Equatable {
        case idle
        case scanning(String)
        case found([Item])
        case removing(done: Int, total: Int)
        case finished(Outcome)

        var showsSheet: Bool {
            switch self {
            case .found, .removing, .finished: return true
            case .idle, .scanning: return false
            }
        }
    }

    let engine: Engine
    private let guardian: Guardian

    @Published private(set) var roots: [Root] = []
    @Published private(set) var locked: [Item] = []
    @Published private(set) var activity: [Entry] = []
    @Published private(set) var statistics = Statistics()
    @Published private(set) var isPaused = false
    @Published private(set) var sweep: SweepState = .idle
    /// Views as edited in the window; `applied` is what Finder has.
    @Published var draft: ViewSettings
    @Published private(set) var applied: ViewSettings
    @Published private(set) var applyPhase: String?
    @Published var editing: FolderView?
    @Published var error: String?
    @Published private(set) var hasFullDiskAccess = true
    @Published private(set) var canControlFinder = true
    @Published private(set) var reactsInstantly = false
    /// The root helper is installed and answering.
    @Published private(set) var helperReady = false
    /// The window shows itself once, the first time the app runs.
    private var wantsWindow: Bool

    private var token = WorkToken()
    private var activityRefresh: Task<Void, Never>?
    private var observers: [NSObjectProtocol] = []

    init(engine: Engine = Engine()) {
        self.engine = engine
        wantsWindow = engine.isFirstLaunch
        let views = engine.settings.views
        draft = views
        applied = views
        guardian = Guardian(views: { engine.settings.views })
        activity = engine.log.recent(60)
        statistics = engine.log.statistics
        locked = engine.lockedItems

        guardian.onNotAllowed = { [weak self] allowed in Task { @MainActor in self?.canControlFinder = allowed } }
        guardian.onModeChange = { [weak self] instant in Task { @MainActor in self?.reactsInstantly = instant } }
        guardian.onProblem = { [weak self] message in self?.engine.log.info(message) }
        guardian.onApplied = { [weak self] path, view in self?.engine.log.info("Finder window set to " + view, path: path) }
        engine.onRootsChanged = { [weak self] list in Task { @MainActor in self?.roots = list } }
        engine.onLockedChanged = { [weak self] list in Task { @MainActor in self?.locked = list } }
        engine.log.onAppend = { [weak self] _ in Task { @MainActor in self?.scheduleActivityRefresh() } }
    }

    func start() {
        let center = NSWorkspace.shared.notificationCenter
        let engine = self.engine
        for name in [NSWorkspace.didMountNotification, NSWorkspace.didUnmountNotification] {
            observers.append(center.addObserver(forName: name, object: nil, queue: nil) { _ in
                Task.detached(priority: .utility) { engine.refreshVolumes() }
            })
        }
        checkPermissions()
        refreshHelper()
        try? FinderPrefs.preventStores()
        guardian.start()
        let settings = engine.settings
        Task.detached(priority: .utility) {
            // The first run writes the settings file, so the window opens by itself only once.
            if engine.isFirstLaunch { engine.update(settings) }
            engine.start()
        }
    }

    /// Called once the menu bar item exists, which is when a window can be opened.
    func openWindowIfWanted() {
        guard wantsWindow else { return }
        wantsWindow = false
        WindowOpener.open()
    }

    func checkPermissions() {
        hasFullDiskAccess = Permissions.hasFullDiskAccess
    }

    func refreshHelper() {
        helperReady = Helper.isReady
        let socket = Helper.socketPath
        engine.privilegedRemove = helperReady ? { HelperClient.remove($0, at: socket) } : nil
    }

    /// Installs the helper (one password), then tries the locked items again.
    func allowAdministrator() {
        do {
            try Helper.install()
        } catch {
            if (error as? Privileged.RunError) != .cancelled { self.error = error.localizedDescription }
            return
        }
        refreshHelper()
        guard helperReady else {
            error = "The helper was installed but is not answering yet. Try again in a moment."
            return
        }
        let engine = self.engine
        Task.detached(priority: .utility) { engine.retryLocked() }
    }

    // MARK: - Status

    var statusText: String {
        if isPaused { return "Paused" }
        var labels: [String] = []
        for root in roots where !labels.contains(root.label) { labels.append(root.label) }
        return labels.isEmpty ? "Nothing to watch" : "Watching " + labels.joined(separator: ", ")
    }

    var statisticsText: String? {
        guard statistics.removed > 0 else { return nil }
        return "\(statistics.removed.formatted()) item\(statistics.removed == 1 ? "" : "s") removed · \(Format.bytes(statistics.bytes))"
    }

    func togglePause() {
        isPaused.toggle()
        engine.isPaused = isPaused
    }

    // MARK: - Sweeping

    func sweepNow() {
        guard sweep == .idle else { return }
        let roots = engine.roots()
        guard !roots.isEmpty else {
            error = "Nothing to sweep: no disk is connected and no user folder could be read."
            return
        }
        let token = WorkToken()
        self.token = token
        sweep = .scanning("")
        let engine = self.engine
        Task.detached(priority: .userInitiated) { [weak self] in
            do {
                let items = try engine.scan(roots: roots, progress: { phase in
                    guard case .scanning(let directory) = phase, token.shouldReport() else { return }
                    Task { @MainActor in
                        guard let self, !token.isCancelled, case .scanning = self.sweep else { return }
                        self.sweep = .scanning(directory)
                    }
                }, isCancelled: { token.isCancelled })
                await MainActor.run { [weak self] in
                    guard let self, !token.isCancelled else { return }
                    self.sweep = .found(items)
                }
            } catch {
                await MainActor.run { [weak self] in
                    guard let self else { return }
                    self.sweep = .idle
                    if !token.isCancelled { self.error = error.localizedDescription }
                }
            }
        }
    }

    func removeFound() {
        guard case .found(let items) = sweep, !items.isEmpty else { return }
        let token = WorkToken()
        self.token = token
        sweep = .removing(done: 0, total: items.count)
        let engine = self.engine
        let roots = engine.roots().map(\.path)
        Task.detached(priority: .userInitiated) { [weak self] in
            let outcome = engine.remove(items, within: roots, source: "sweep", progress: { phase in
                guard case .removing(let done, let total) = phase, token.shouldReport() else { return }
                Task { @MainActor in
                    guard let self, case .removing = self.sweep else { return }
                    self.sweep = .removing(done: done, total: total)
                }
            }, isCancelled: { token.isCancelled })
            await MainActor.run { [weak self] in self?.sweep = .finished(outcome) }
        }
    }

    func cancelSweep() {
        token.cancel()
        sweep = .idle
    }

    func dismissSweep() {
        if case .removing = sweep { return }
        sweep = .idle
    }

    // MARK: - Views

    var hasChanges: Bool { draft != applied }

    /// Quits Finder, writes its defaults and every folder view, starts it again.
    func apply() {
        guard hasChanges, applyPhase == nil else { return }
        applyPhase = "Applying…"
        guardian.isPaused = true
        let views = draft
        let previous = engine.plan
        var settings = engine.settings
        settings.views = views
        let engine = self.engine
        Task { @MainActor in
            var problems: [String] = []
            if !(await Finder.quit()) {
                problems.append("Finder would not quit; it may show the previous views until it is restarted.")
            }
            do { try FinderPrefs.write(views) } catch { problems.append(error.localizedDescription) }
            await Task.detached(priority: .userInitiated) { engine.update(settings) }.value
            do {
                try await Task.detached(priority: .userInitiated) { try engine.applyStores(previous: previous) }.value
            } catch {
                problems.append(error.localizedDescription)
            }
            await Finder.launch()
            applied = engine.settings.views
            if !problems.isEmpty { error = problems.joined(separator: "\n") }
            applyPhase = nil
            guardian.forget()
            guardian.isPaused = false
        }
    }

    func revert() {
        draft = applied
    }

    func addFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose"
        panel.message = "Choose a folder that should have its own view."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        let path = Paths.standardize(url.path)
        if let existing = draft.folders.first(where: { $0.path == path }) {
            editing = existing
            return
        }
        editing = FolderView(path: path, view: draft.default)
    }

    func removeFolder(_ id: UUID) {
        draft.folders.removeAll { $0.id == id }
    }

    func saveFolder(_ folder: FolderView) {
        if let index = draft.folders.firstIndex(where: { $0.id == folder.id }) {
            draft.folders[index] = folder
        } else {
            draft.folders.append(folder)
            draft.folders.sort { $0.path < $1.path }
        }
        editing = nil
    }

    func requestAccessibility() { Permissions.requestAccessibility() }
    func openFullDiskAccess() { Permissions.openFullDiskAccess() }
    func openAutomation() { Permissions.openAutomation() }

    // MARK: - Activity

    private func scheduleActivityRefresh() {
        guard activityRefresh == nil else { return }
        activityRefresh = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard let self else { return }
            self.activity = self.engine.log.recent(60)
            self.statistics = self.engine.log.statistics
            self.activityRefresh = nil
        }
    }
}

enum Format {
    static func bytes(_ count: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: count, countStyle: .file)
    }
}
