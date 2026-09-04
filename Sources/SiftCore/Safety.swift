import Foundation

public enum Verdict: Equatable {
    case allowed
    case refused(String)

    public var isAllowed: Bool { self == .allowed }
}

/// Hard limits on what may ever be deleted, independent of everything else.
public struct Safety: Hashable {
    /// Nothing beneath these is touched and the scanner never enters them.
    public var protectedPrefixes: [String]
    /// A mount point itself is never deleted, and volume-level junk is only
    /// recognised directly inside one.
    public var mountPoints: Set<String>
    /// `.DS_Store` files that carry a folder's chosen view. Kept.
    public var keptStores: Set<String>
    /// Places inside a protected prefix that Finder browses all the same, and
    /// whose junk travels to other devices: iCloud Drive and the cloud folders.
    public var exceptions: [String]

    public init(protectedPrefixes: [String] = Safety.systemPrefixes(),
                mountPoints: Set<String> = [],
                keptStores: Set<String> = [],
                exceptions: [String] = Safety.cloudFolders()) {
        self.protectedPrefixes = protectedPrefixes.map(Paths.standardize)
        self.mountPoints = Set(mountPoints.map(Paths.standardize)).union(["/"])
        self.keptStores = Set(keptStores.map(Paths.standardize))
        self.exceptions = exceptions.map(Paths.standardize)
    }

    /// System locations plus the home Library.
    public static func systemPrefixes(home: String = NSHomeDirectory()) -> [String] {
        var list = ["/System", "/Library", "/usr", "/bin", "/sbin", "/private", "/etc", "/var", "/dev", "/cores", "/opt"]
        if !home.isEmpty && home != "/" { list.append(home + "/Library") }
        return list
    }

    /// iCloud Drive and the File Provider clouds (Dropbox, OneDrive, Google
    /// Drive…) live under the home Library but are browsed like any folder.
    public static func cloudFolders(home: String = NSHomeDirectory()) -> [String] {
        guard !home.isEmpty && home != "/" else { return [] }
        return [home + "/Library/Mobile Documents/com~apple~CloudDocs", home + "/Library/CloudStorage"]
    }

    public func isProtected(_ path: String) -> Bool {
        let p = Paths.standardize(path)
        if exceptions.contains(where: { Paths.isInside(p, $0) }) { return false }
        return protectedPrefixes.contains { Paths.isInside(p, $0) }
    }

    public func isMountPoint(_ path: String) -> Bool {
        mountPoints.contains(Paths.standardize(path))
    }

    public func validate(path: String, within roots: [String]? = nil) -> Verdict {
        let p = Paths.standardize(path)
        guard p.hasPrefix("/") else { return .refused("Not an absolute path") }
        guard p != "/" else { return .refused("Refusing to delete the root directory") }
        if mountPoints.contains(p) { return .refused("A mount point") }
        if isProtected(p) { return .refused("Inside a protected system location") }
        let name = Paths.name(of: p)
        if Junk.markers.contains(name) { return .refused("A marker Sift relies on") }
        if keptStores.contains(p) { return .refused("Carries a folder's chosen view") }
        if let roots, !roots.contains(where: { p != Paths.standardize($0) && Paths.isInside(p, Paths.standardize($0)) }) {
            return .refused("Outside the area being cleaned")
        }
        return .allowed
    }
}
