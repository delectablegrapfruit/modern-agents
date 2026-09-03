import Foundation
#if os(macOS)
import CoreServices
#endif

public enum WatchEvent {
    /// Specific paths changed.
    case paths([String])
    /// Too much changed to enumerate; re-scan the whole root.
    case rescan
}

public protocol ChangeWatcher: AnyObject {
    var onEvent: ((WatchEvent) -> Void)? { get set }
    func start()
    func stop()
}

/// Periodic full re-scan. Used where file events are unavailable (network
/// volumes, non-macOS hosts).
public final class PollingWatcher: ChangeWatcher {
    public var onEvent: ((WatchEvent) -> Void)?
    public let root: String
    public let interval: TimeInterval
    private var timer: DispatchSourceTimer?
    private let queue = DispatchQueue(label: "winnow.polling", qos: .utility)

    public init(root: String, interval: TimeInterval) {
        self.root = root
        self.interval = max(1, interval)
    }

    public func start() {
        stop()
        let t = DispatchSource.makeTimerSource(queue: queue)
        t.schedule(deadline: .now() + interval, repeating: interval, leeway: .seconds(1))
        t.setEventHandler { [weak self] in self?.onEvent?(.rescan) }
        t.resume()
        timer = t
    }

    public func stop() {
        timer?.cancel()
        timer = nil
    }

    deinit { stop() }
}

#if os(macOS)
/// File-level FSEvents stream for one or more roots.
public final class FSEventsWatcher: ChangeWatcher {
    public var onEvent: ((WatchEvent) -> Void)?
    public let paths: [String]
    public let latency: TimeInterval
    private var stream: FSEventStreamRef?
    private let queue = DispatchQueue(label: "winnow.fsevents", qos: .utility)

    public init(paths: [String], latency: TimeInterval = 2.0) {
        self.paths = paths
        self.latency = latency
    }

    public func start() {
        stop()
        var context = FSEventStreamContext()
        context.info = Unmanaged.passUnretained(self).toOpaque()
        let flags = kFSEventStreamCreateFlagUseCFTypes
            | kFSEventStreamCreateFlagFileEvents
            | kFSEventStreamCreateFlagNoDefer
            | kFSEventStreamCreateFlagIgnoreSelf
        guard let created = FSEventStreamCreate(kCFAllocatorDefault,
                                                fsEventsCallback,
                                                &context,
                                                paths as CFArray,
                                                FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
                                                latency,
                                                FSEventStreamCreateFlags(flags)) else { return }
        FSEventStreamSetDispatchQueue(created, queue)
        FSEventStreamStart(created)
        stream = created
    }

    public func stop() {
        guard let stream else { return }
        FSEventStreamStop(stream)
        FSEventStreamInvalidate(stream)
        FSEventStreamRelease(stream)
        self.stream = nil
    }

    fileprivate func emit(_ event: WatchEvent) {
        onEvent?(event)
    }

    deinit { stop() }
}

private let fsEventsCallback: FSEventStreamCallback = { _, info, count, eventPaths, eventFlags, _ in
    guard let info else { return }
    let watcher = Unmanaged<FSEventsWatcher>.fromOpaque(info).takeUnretainedValue()
    let cfArray = Unmanaged<CFArray>.fromOpaque(eventPaths).takeUnretainedValue()
    guard let paths = (cfArray as NSArray) as? [String] else { return }
    let mustRescan = FSEventStreamEventFlags(kFSEventStreamEventFlagMustScanSubDirs)
        | FSEventStreamEventFlags(kFSEventStreamEventFlagRootChanged)
    for i in 0..<count where eventFlags[i] & mustRescan != 0 {
        watcher.emit(.rescan)
        return
    }
    watcher.emit(.paths(paths))
}
#endif

public enum Watchers {
    /// Best watcher for a root: FSEvents on macOS local volumes, polling elsewhere.
    public static func make(root: String, preferPolling: Bool, pollInterval: TimeInterval) -> ChangeWatcher {
        #if os(macOS)
        if !preferPolling { return FSEventsWatcher(paths: [root]) }
        #endif
        return PollingWatcher(root: root, interval: pollInterval)
    }
}
