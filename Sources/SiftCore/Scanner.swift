import Foundation
#if canImport(Darwin)
import Darwin
#endif

public struct Item: Identifiable, Hashable, Codable {
    public var id: String { path }
    public let path: String
    public let kind: Junk
    public let isDirectory: Bool
    public let size: Int64

    public init(path: String, kind: Junk, isDirectory: Bool, size: Int64) {
        self.path = path
        self.kind = kind
        self.isDirectory = isDirectory
        self.size = size
    }

    public var name: String { Paths.name(of: path) }
    public var parent: String { Paths.parent(of: path) }
}

public enum ScanError: Error, LocalizedError, Equatable {
    case notADirectory(String)
    case cancelled

    public var errorDescription: String? {
        switch self {
        case .notADirectory(let p): return "\(p) is not a folder"
        case .cancelled: return "Cancelled"
        }
    }
}

/// Walks a tree and reports junk. Never follows symlinks, never crosses onto
/// another volume, never enters protected locations, hidden folders, dependency
/// trees or packages, and does not descend into matched folders.
public struct JunkScanner {
    public let safety: Safety

    public init(safety: Safety) {
        self.safety = safety
    }

    /// Junk beneath `root`, at most `depth` levels down (1 = the folder itself).
    /// The walk runs with the kernel's lowest disk priority, so it yields to
    /// everything else and never makes the machine feel slow.
    public func scan(root: String, depth: Int = Int.max, progress: ((String) -> Void)? = nil,
                     isCancelled: () -> Bool = { false }) throws -> [Item] {
        let rootPath = Paths.standardize(root)
        guard let rootInfo = Files.info(rootPath), rootInfo.isDirectory else { throw ScanError.notADirectory(rootPath) }
        let restore = JunkScanner.throttleDiskIO()
        defer { restore() }
        var items: [Item] = []
        var stack = [(rootPath, 1)]
        while let (dir, level) = stack.popLast() {
            if isCancelled() { throw ScanError.cancelled }
            progress?(dir)
            guard let names = Files.names(in: dir) else { continue }
            let atVolumeRoot = safety.isMountPoint(dir)
            for name in names.sorted() {
                let path = Paths.join(dir, name)
                guard let st = Files.info(path) else { continue }
                if safety.isProtected(path) { continue }
                let isDirectory = st.isDirectory && !st.isSymlink
                if let item = classify(path: path, name: name, info: st, atVolumeRoot: atVolumeRoot) {
                    items.append(item)
                    continue
                }
                guard level < depth, isDirectory, st.device == rootInfo.device, !safety.isMountPoint(path) else { continue }
                if Files.isBrowsable(path: path, name: name) { stack.append((path, level + 1)) }
            }
        }
        return items.sorted { $0.path < $1.path }
    }

    /// Puts this thread's disk I/O in the background tier for the duration of a
    /// walk. Returns the call that restores the previous policy.
    static func throttleDiskIO() -> () -> Void {
        #if canImport(Darwin)
        let previous = getiopolicy_np(IOPOL_TYPE_DISK, IOPOL_SCOPE_THREAD)
        guard previous >= 0, setiopolicy_np(IOPOL_TYPE_DISK, IOPOL_SCOPE_THREAD, IOPOL_THROTTLE) == 0 else { return {} }
        return { _ = setiopolicy_np(IOPOL_TYPE_DISK, IOPOL_SCOPE_THREAD, previous) }
        #else
        return {}
        #endif
    }

    /// The item at `path` if it is junk that may be removed.
    public func classify(path: String, name: String, info: FileInfo, atVolumeRoot: Bool) -> Item? {
        let isDirectory = info.isDirectory && !info.isSymlink
        guard let kind = Junk.kind(name: name, isDirectory: isDirectory, atVolumeRoot: atVolumeRoot) else { return nil }
        guard safety.validate(path: path).isAllowed else { return nil }
        if kind == .fsevents && Junk.isQuietFSEvents(at: path) { return nil }
        let size = isDirectory ? Files.size(ofDirectory: path) : info.size
        return Item(path: path, kind: kind, isDirectory: isDirectory, size: size)
    }

    /// Maps changed paths to junk items, checking each ancestor down from `root`
    /// so a file created inside `.Trashes` flags `.Trashes` itself.
    public func items(fromChangedPaths paths: [String], root: String) -> [Item] {
        let root = Paths.standardize(root)
        var seen = Set<String>()
        var out: [Item] = []
        for raw in paths {
            let path = Paths.standardize(raw)
            guard path != root, Paths.isInside(path, root) else { continue }
            let components = path.dropFirst(root == "/" ? 1 : root.count + 1).split(separator: "/").map(String.init)
            guard components.contains(where: Junk.couldMatch(name:)) else { continue }
            var node = root
            for component in components {
                let parent = node
                node = Paths.join(node, component)
                if seen.contains(node) { break }
                if safety.isProtected(node) { break }
                guard let st = Files.info(node) else { break }
                if let item = classify(path: node, name: component, info: st, atVolumeRoot: safety.isMountPoint(parent)) {
                    seen.insert(node)
                    out.append(item)
                    break
                }
                let isDirectory = st.isDirectory && !st.isSymlink
                guard isDirectory, !safety.isMountPoint(node), Files.isBrowsable(path: node, name: component) else { break }
            }
        }
        return out
    }
}
