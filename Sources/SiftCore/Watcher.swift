import Foundation
#if os(macOS)
import CoreServices
#endif

public enum Change {
    /// These paths changed.
    case paths([String])
    /// Too much changed to say; look at the whole root again.
    case rescan
}

public protocol Watcher: AnyObject {
    var onChange: ((Change) -> Void)? { get set }
    func start()
    func stop()
}

#if os(macOS)
/// File-level FSEvents stream for one root.
public final class FSEventsWatcher: Watcher {
    public var onChange: ((Change) -> Void)?
    public let root: String
    /// Subtrees the kernel should not report at all (at most eight).
    public let excluded: [String]
    private var stream: FSEventStreamRef?
    private let queue = DispatchQueue(label: "sift.fsevents", qos: .utility)

    public init(root: String, excluding excluded: [String] = []) {
        self.root = root
        self.excluded = Array(excluded.prefix(8))
    }

    public func start() {
        stop()
        var context = FSEventStreamContext()
        context.info = Unmanaged.passUnretained(self).toOpaque()
        let flags = kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagNoDefer
        guard let created = FSEventStreamCreate(kCFAllocatorDefault, fsEventsCallback, &context, [root] as CFArray,
                                                FSEventStreamEventId(kFSEventStreamEventIdSinceNow), 0.5,
                                                FSEventStreamCreateFlags(flags)) else { return }
        if !excluded.isEmpty { FSEventStreamSetExclusionPaths(created, excluded as CFArray) }
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

    fileprivate func emit(_ change: Change) { onChange?(change) }

    deinit { stop() }
}

private let fsEventsCallback: FSEventStreamCallback = { _, info, count, eventPaths, eventFlags, _ in
    guard let info else { return }
    let watcher = Unmanaged<FSEventsWatcher>.fromOpaque(info).takeUnretainedValue()
    guard let paths = (Unmanaged<CFArray>.fromOpaque(eventPaths).takeUnretainedValue() as NSArray) as? [String] else { return }
    let mustRescan = FSEventStreamEventFlags(kFSEventStreamEventFlagMustScanSubDirs)
        | FSEventStreamEventFlags(kFSEventStreamEventFlagRootChanged)
        | FSEventStreamEventFlags(kFSEventStreamEventFlagKernelDropped)
        | FSEventStreamEventFlags(kFSEventStreamEventFlagUserDropped)
    for i in 0..<count where eventFlags[i] & mustRescan != 0 {
        watcher.emit(.rescan)
        return
    }
    watcher.emit(.paths(paths))
}
#else
/// Periodic rescan, for hosts without file events (development and tests).
public final class PollingWatcher: Watcher {
    public var onChange: ((Change) -> Void)?
    public let interval: TimeInterval
    private var timer: DispatchSourceTimer?
    private let queue = DispatchQueue(label: "sift.polling", qos: .utility)

    public init(interval: TimeInterval) { self.interval = max(0.2, interval) }

    public func start() {
        stop()
        let t = DispatchSource.makeTimerSource(queue: queue)
        t.schedule(deadline: .now() + interval, repeating: interval)
        t.setEventHandler { [weak self] in self?.onChange?(.rescan) }
        t.resume()
        timer = t
    }

    public func stop() {
        timer?.cancel()
        timer = nil
    }

    deinit { stop() }
}
#endif

public enum Watchers {
    public static var pollInterval: TimeInterval = 1

    public static func make(root: String, excluding: [String]) -> Watcher {
        #if os(macOS)
        return FSEventsWatcher(root: root, excluding: excluding)
        #else
        return PollingWatcher(interval: pollInterval)
        #endif
    }
}
