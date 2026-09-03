import Foundation
#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

public struct FileStat {
    public let isDirectory: Bool
    public let isSymlink: Bool
    public let size: Int64
    public let device: UInt64
    public let modified: Date
}

public enum FileStats {
    /// `lstat` without following symlinks. Returns nil when the path is gone.
    public static func info(_ path: String) -> FileStat? {
        var st = stat()
        guard lstat(path, &st) == 0 else { return nil }
        let type = UInt32(st.st_mode) & 0o170000
        #if os(Linux)
        let ts = st.st_mtim
        #else
        let ts = st.st_mtimespec
        #endif
        let modified = Date(timeIntervalSince1970: TimeInterval(ts.tv_sec) + TimeInterval(ts.tv_nsec) / 1_000_000_000)
        return FileStat(isDirectory: type == 0o040000,
                        isSymlink: type == 0o120000,
                        size: Int64(st.st_size),
                        device: UInt64(truncatingIfNeeded: st.st_dev),
                        modified: modified)
    }
}

public struct JunkItem: Identifiable, Hashable, Codable {
    public var id: String { path }
    public let path: String
    public let name: String
    public let ruleID: String
    public let ruleName: String
    public let isDirectory: Bool
    public let size: Int64
    public let modified: Date

    public init(path: String, name: String, ruleID: String, ruleName: String, isDirectory: Bool, size: Int64, modified: Date) {
        self.path = path
        self.name = name
        self.ruleID = ruleID
        self.ruleName = ruleName
        self.isDirectory = isDirectory
        self.size = size
        self.modified = modified
    }

    public var parentPath: String { NSString(string: path).deletingLastPathComponent }
}

public struct ScanOptions {
    public var rules: [JunkRule]
    public var exclusions: ExclusionMatcher
    public var safety: SafetyPolicy
    public var skipPackages: Bool
    public var recursive: Bool

    public init(rules: [JunkRule], exclusions: ExclusionMatcher = .none, safety: SafetyPolicy = SafetyPolicy(),
                skipPackages: Bool = true, recursive: Bool = true) {
        self.rules = rules
        self.exclusions = exclusions
        self.safety = safety
        self.skipPackages = skipPackages
        self.recursive = recursive
    }

    public func firstMatch(name: String, isDirectory: Bool, atVolumeRoot: Bool) -> JunkRule? {
        rules.first { $0.matches(name: name, isDirectory: isDirectory, atVolumeRoot: atVolumeRoot) }
    }

    /// Whether any rule could match this name regardless of kind or location.
    public func couldMatch(name: String) -> Bool {
        rules.contains { $0.matchesName(name) }
    }
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

/// Walks a directory tree and reports entries matching the active rules.
/// Never follows symlinks, never crosses onto another volume, never enters
/// protected system locations, and does not descend into matched folders.
public final class JunkScanner {
    public let options: ScanOptions
    private let fileManager: FileManager

    public init(options: ScanOptions, fileManager: FileManager = .default) {
        self.options = options
        self.fileManager = fileManager
    }

    public func scan(root: String,
                     progress: ((String) -> Void)? = nil,
                     isCancelled: () -> Bool = { false }) throws -> [JunkItem] {
        let rootPath = SafetyPolicy.standardize(root)
        guard let rootStat = FileStats.info(rootPath), rootStat.isDirectory else {
            throw ScanError.notADirectory(rootPath)
        }
        var results: [JunkItem] = []
        var stack = [rootPath]
        while let dir = stack.popLast() {
            if isCancelled() { throw ScanError.cancelled }
            progress?(dir)
            guard let names = try? fileManager.contentsOfDirectory(atPath: dir) else { continue }
            let dirIsVolumeRoot = options.safety.isVolumeRoot(dir)
            for name in names.sorted() {
                let path = dir == "/" ? "/" + name : dir + "/" + name
                guard let st = FileStats.info(path) else { continue }
                if options.exclusions.isExcluded(path: path, name: name) { continue }
                if options.safety.isProtected(path) { continue }
                let treatAsDirectory = st.isDirectory && !st.isSymlink
                if let rule = options.firstMatch(name: name, isDirectory: treatAsDirectory, atVolumeRoot: dirIsVolumeRoot),
                   options.safety.validate(path: path).isAllowed {
                    results.append(makeItem(path: path, name: name, rule: rule, stat: st))
                    continue
                }
                guard treatAsDirectory, options.recursive else { continue }
                if st.device != rootStat.device { continue }
                if options.safety.isVolumeRoot(path) { continue }
                if options.skipPackages && JunkScanner.isPackage(path: path, name: name) { continue }
                stack.append(path)
            }
        }
        return results.sorted { $0.path < $1.path }
    }

    private func makeItem(path: String, name: String, rule: JunkRule, stat: FileStat) -> JunkItem {
        let size: Int64
        if stat.isDirectory && !stat.isSymlink {
            size = JunkScanner.directorySize(path, device: stat.device, fileManager: fileManager)
        } else {
            size = stat.size
        }
        return JunkItem(path: path, name: name, ruleID: rule.id, ruleName: rule.name,
                        isDirectory: stat.isDirectory && !stat.isSymlink, size: size, modified: stat.modified)
    }

    public static func directorySize(_ root: String, device: UInt64? = nil, fileManager: FileManager = .default) -> Int64 {
        var total: Int64 = 0
        var stack = [root]
        let dev = device ?? FileStats.info(root)?.device
        while let dir = stack.popLast() {
            guard let names = try? fileManager.contentsOfDirectory(atPath: dir) else { continue }
            for name in names {
                let path = dir + "/" + name
                guard let st = FileStats.info(path) else { continue }
                if st.isSymlink { continue }
                if st.isDirectory {
                    if let dev, st.device != dev { continue }
                    stack.append(path)
                } else {
                    total += st.size
                }
            }
        }
        return total
    }

    static let packageExtensions: Set<String> = [
        "app", "bundle", "framework", "plugin", "kext", "appex", "xpc", "prefpane", "qlgenerator",
        "xcodeproj", "xcworkspace", "playground", "photoslibrary", "musiclibrary", "tvlibrary",
        "fcpbundle", "imovielibrary", "logicx", "band", "pkg", "mpkg", "scptd", "rtfd",
        "key", "pages", "numbers", "sparsebundle", "download", "textclipping", "webarchive",
    ]

    public static func isPackage(path: String, name: String) -> Bool {
        let ext = NSString(string: name).pathExtension.lowercased()
        if !ext.isEmpty && packageExtensions.contains(ext) { return true }
        #if os(macOS)
        if let rv = try? URL(fileURLWithPath: path).resourceValues(forKeys: [.isPackageKey]), rv.isPackage == true {
            return true
        }
        #endif
        return false
    }
}
