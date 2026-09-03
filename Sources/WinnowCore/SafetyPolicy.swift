import Foundation

public enum SafetyVerdict: Equatable {
    case allowed
    case denied(String)

    public var isAllowed: Bool { self == .allowed }
}

/// Hard limits on what may ever be deleted, independent of rules and settings.
public struct SafetyPolicy {
    /// Nothing beneath these paths is touched, and the scanner never descends into them.
    public var protectedPrefixes: [String]
    /// Names that are never deleted (markers Winnow itself relies on).
    public var neverDeleteNames: Set<String>
    /// Mount points. A mount point itself is never deleted.
    public var volumeRoots: Set<String>
    /// Folders with their own Finder view: their `.DS_Store` (and, when they include
    /// subfolders, every `.DS_Store` beneath them) is kept. The deepest root decides.
    public struct ExemptRoot: Hashable {
        public let path: String
        public let includesSubfolders: Bool

        public init(path: String, includesSubfolders: Bool) {
            self.path = SafetyPolicy.standardize(path)
            self.includesSubfolders = includesSubfolders
        }
    }

    public var exemptRoots: [ExemptRoot]

    public init(protectedPrefixes: [String] = SafetyPolicy.defaultProtectedPrefixes,
                neverDeleteNames: Set<String> = [".metadata_never_index", "no_log"],
                volumeRoots: Set<String> = [],
                exemptRoots: [ExemptRoot] = []) {
        self.protectedPrefixes = protectedPrefixes.map { SafetyPolicy.standardize($0) }
        self.neverDeleteNames = neverDeleteNames
        self.volumeRoots = Set(volumeRoots.map { SafetyPolicy.standardize($0) })
        self.exemptRoots = exemptRoots
    }

    /// Whether `path` is a `.DS_Store` that belongs to a folder view.
    public func isExemptFolderStore(_ path: String) -> Bool {
        let p = SafetyPolicy.standardize(path)
        guard NSString(string: p).lastPathComponent == ".DS_Store" else { return false }
        let directory = NSString(string: p).deletingLastPathComponent
        let owner = exemptRoots
            .filter { directory == $0.path || directory.hasPrefix($0.path == "/" ? "/" : $0.path + "/") }
            .max { $0.path.count < $1.path.count }
        guard let owner else { return false }
        return directory == owner.path || owner.includesSubfolders
    }

    /// System locations plus the home Library, which is never touched.
    public static var defaultProtectedPrefixes: [String] {
        var list = ["/System", "/Library", "/usr", "/bin", "/sbin", "/private", "/etc", "/var", "/dev", "/cores", "/opt"]
        let home = NSHomeDirectory()
        if !home.isEmpty && home != "/" {
            list.append(home + "/Library")
        }
        return list
    }

    public static func standardize(_ path: String) -> String {
        var p = NSString(string: path).standardizingPath
        while p.count > 1 && p.hasSuffix("/") { p.removeLast() }
        return p
    }

    public func isProtected(_ path: String) -> Bool {
        let p = SafetyPolicy.standardize(path)
        for prefix in protectedPrefixes where p == prefix || p.hasPrefix(prefix + "/") {
            return true
        }
        return false
    }

    public func isVolumeRoot(_ path: String) -> Bool {
        volumeRoots.contains(SafetyPolicy.standardize(path))
    }

    /// Whether `path` sits directly inside a mount point.
    public func isAtVolumeRoot(_ path: String) -> Bool {
        let parent = NSString(string: SafetyPolicy.standardize(path)).deletingLastPathComponent
        return volumeRoots.contains(parent)
    }

    public func validate(path: String, within roots: [String]? = nil) -> SafetyVerdict {
        let p = SafetyPolicy.standardize(path)
        guard p.hasPrefix("/") else { return .denied("Path is not absolute") }
        guard p != "/" else { return .denied("Refusing to delete the root directory") }
        guard !p.contains("/../") && !p.hasSuffix("/..") else { return .denied("Path contains parent references") }
        if volumeRoots.contains(p) { return .denied("Path is a mount point") }
        if isProtected(p) { return .denied("Path is inside a protected system location") }
        let name = NSString(string: p).lastPathComponent
        if neverDeleteNames.contains(name) { return .denied("\(name) is a protected marker") }
        if isExemptFolderStore(p) { return .denied("Kept for the folder's own view settings") }
        if let roots {
            let inside = roots.contains { root in
                let r = SafetyPolicy.standardize(root)
                return p == r ? false : p.hasPrefix(r == "/" ? "/" : r + "/")
            }
            if !inside { return .denied("Path is outside the area being cleaned") }
        }
        return .allowed
    }
}
