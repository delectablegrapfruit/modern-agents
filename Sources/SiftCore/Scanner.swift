import Foundation

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

    public var name: String { Path.name(of: path) }
    public var parent: String { Path.parent(of: path) }
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
public struct Scanner {
    public let safety: Safety
    let fileManager: FileManager

    public init(safety: Safety, fileManager: FileManager = .default) {
        self.safety = safety
        self.fileManager = fileManager
    }

    /// Junk beneath `root`, deepest paths last.
    public func scan(root: String, progress: ((String) -> Void)? = nil,
                     isCancelled: () -> Bool = { false }) throws -> [Item] {
        let rootPath = Path.standardize(root)
        guard let rootInfo = Files.info(rootPath), rootInfo.isDirectory else { throw ScanError.notADirectory(rootPath) }
        var items: [Item] = []
        var stack = [rootPath]
        while let dir = stack.popLast() {
            if isCancelled() { throw ScanError.cancelled }
            progress?(dir)
            guard let names = try? fileManager.contentsOfDirectory(atPath: dir) else { continue }
            let atVolumeRoot = safety.isMountPoint(dir)
            for name in names.sorted() {
                let path = Path.join(dir, name)
                guard let st = Files.info(path) else { continue }
                if safety.isProtected(path) { continue }
                let isDirectory = st.isDirectory && !st.isSymlink
                if let item = classify(path: path, name: name, info: st, atVolumeRoot: atVolumeRoot) {
                    items.append(item)
                    continue
                }
                guard isDirectory, st.device == rootInfo.device, !safety.isMountPoint(path) else { continue }
                if Files.isBrowsable(path: path, name: name) { stack.append(path) }
            }
        }
        return items.sorted { $0.path < $1.path }
    }

    /// The item at `path` if it is junk that may be removed.
    public func classify(path: String, name: String, info: FileInfo, atVolumeRoot: Bool) -> Item? {
        let isDirectory = info.isDirectory && !info.isSymlink
        guard let kind = Junk.kind(name: name, isDirectory: isDirectory, atVolumeRoot: atVolumeRoot) else { return nil }
        guard safety.validate(path: path).isAllowed else { return nil }
        if kind == .fsevents && Junk.isQuietFSEvents(at: path, fileManager: fileManager) { return nil }
        let size = isDirectory ? Files.size(ofDirectory: path, fileManager: fileManager) : info.size
        return Item(path: path, kind: kind, isDirectory: isDirectory, size: size)
    }

    /// Maps changed paths to junk items, checking each ancestor down from `root`
    /// so a file created inside `.Trashes` flags `.Trashes` itself.
    public func items(fromChangedPaths paths: [String], root: String) -> [Item] {
        let root = Path.standardize(root)
        var seen = Set<String>()
        var out: [Item] = []
        for raw in paths {
            let path = Path.standardize(raw)
            guard path != root, Path.isInside(path, root) else { continue }
            let components = path.dropFirst(root == "/" ? 1 : root.count + 1).split(separator: "/").map(String.init)
            guard components.contains(where: Junk.couldMatch(name:)) else { continue }
            var node = root
            for component in components {
                let parent = node
                node = Path.join(node, component)
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
