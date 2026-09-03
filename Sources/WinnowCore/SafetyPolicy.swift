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

    public init(protectedPrefixes: [String] = SafetyPolicy.defaultProtectedPrefixes,
                neverDeleteNames: Set<String> = [".metadata_never_index", "no_log"],
                volumeRoots: Set<String> = []) {
        self.protectedPrefixes = protectedPrefixes.map { SafetyPolicy.standardize($0) }
        self.neverDeleteNames = neverDeleteNames
        self.volumeRoots = Set(volumeRoots.map { SafetyPolicy.standardize($0) })
    }

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
