import Foundation
#if os(macOS)
import CoreServices
#endif

public enum Change {
    /// These paths changed.
    case paths([String])
    /// Something changed somewhere beneath this folder; the system could not say what.
    case subtree(String)
}

public protocol Watcher: AnyObject {
    var onChange: ((Change) -> Void)? { get set }
    func start()
    func stop()
}

#if os(macOS)
/// File-level FSEvents stream for one root. Events are batched a second at a
/// time, so the stream wakes the app at most once a second per root.
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
        // Sift's own removals and writes are not news.
        let flags = kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagIgnoreSelf
        guard let created = FSEventStreamCreate(kCFAllocatorDefault, fsEventsCallback, &context, [root] as CFArray,
                                                FSEventStreamEventId(kFSEventStreamEventIdSinceNow), 1.0,
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
        // A callback still running on the queue finishes before the stream goes.
        queue.sync {}
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
    let vague = FSEventStreamEventFlags(kFSEventStreamEventFlagMustScanSubDirs)
        | FSEventStreamEventFlags(kFSEventStreamEventFlagKernelDropped)
        | FSEventStreamEventFlags(kFSEventStreamEventFlagUserDropped)
    var exact: [String] = []
    for i in 0..<count {
        if eventFlags[i] & vague != 0 {
            watcher.emit(.subtree(paths[i]))
        } else {
            exact.append(paths[i])
        }
    }
    if !exact.isEmpty { watcher.emit(.paths(exact)) }
}
#else
/// Periodic look at a root, for hosts without file events (development and tests).
public final class PollingWatcher: Watcher {
    public var onChange: ((Change) -> Void)?
    public let root: String
    public let interval: TimeInterval
    private var timer: DispatchSourceTimer?
    private let queue = DispatchQueue(label: "sift.polling", qos: .utility)

    public init(root: String, interval: TimeInterval) {
        self.root = root
        self.interval = max(0.2, interval)
    }

    public func start() {
        stop()
        let t = DispatchSource.makeTimerSource(queue: queue)
        t.schedule(deadline: .now() + interval, repeating: interval)
        t.setEventHandler { [weak self] in
            guard let self else { return }
            self.onChange?(.subtree(self.root))
        }
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
        return PollingWatcher(root: root, interval: pollInterval)
        #endif
    }

    /// How far a vague change is followed: the folder itself on macOS, where the
    /// kernel names the folder; the whole tree where polling is the only signal.
    public static var subtreeDepth: Int {
        #if os(macOS)
        return 1
        #else
        return Int.max
        #endif
    }
}
