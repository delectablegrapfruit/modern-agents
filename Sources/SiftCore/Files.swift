import Foundation
#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

public enum Paths {
    /// Absolute, without trailing slash or `..`.
    public static func standardize(_ path: String) -> String {
        var p = NSString(string: path).standardizingPath
        while p.count > 1 && p.hasSuffix("/") { p.removeLast() }
        return p
    }

    public static func join(_ directory: String, _ name: String) -> String {
        directory == "/" ? "/" + name : directory + "/" + name
    }

    public static func parent(of path: String) -> String {
        standardize(NSString(string: path).deletingLastPathComponent)
    }

    public static func name(of path: String) -> String {
        NSString(string: path).lastPathComponent
    }

    /// Whether `path` is `root` or lies beneath it.
    public static func isInside(_ path: String, _ root: String) -> Bool {
        path == root || path.hasPrefix(root == "/" ? "/" : root + "/")
    }

    /// `~/Documents` for paths in the home folder.
    public static func display(_ path: String, home: String = NSHomeDirectory()) -> String {
        if path == home { return "Home" }
        if path.hasPrefix(home + "/") { return "~" + path.dropFirst(home.count) }
        return path
    }
}

public struct FileInfo {
    public let isDirectory: Bool
    public let isSymlink: Bool
    public let size: Int64
    public let device: UInt64
}

public enum Files {
    /// Names in a directory, in no particular order; nil when it cannot be read.
    /// Straight from `readdir`: Foundation's listing leaves `._` files out on macOS.
    public static func names(in directory: String) -> [String]? {
        guard let dir = opendir(directory) else { return nil }
        defer { closedir(dir) }
        var out: [String] = []
        while let entry = readdir(dir) {
            let name = withUnsafePointer(to: entry.pointee.d_name) { tuple in
                tuple.withMemoryRebound(to: CChar.self, capacity: MemoryLayout.size(ofValue: entry.pointee.d_name)) { String(cString: $0) }
            }
            if name != "." && name != ".." { out.append(name) }
        }
        return out
    }

    /// `lstat`; nil when the path is gone.
    public static func info(_ path: String) -> FileInfo? {
        var st = stat()
        guard lstat(path, &st) == 0 else { return nil }
        let type = UInt32(st.st_mode) & 0o170000
        return FileInfo(isDirectory: type == 0o040000, isSymlink: type == 0o120000,
                        size: Int64(st.st_size), device: UInt64(truncatingIfNeeded: st.st_dev))
    }

    public static func isDirectory(_ path: String) -> Bool {
        guard let i = info(path) else { return false }
        return i.isDirectory && !i.isSymlink
    }

    static let packageExtensions: Set<String> = [
        "app", "bundle", "framework", "plugin", "kext", "appex", "xpc", "prefpane", "qlgenerator",
        "xcodeproj", "xcworkspace", "playground", "photoslibrary", "musiclibrary", "tvlibrary",
        "fcpbundle", "imovielibrary", "logicx", "band", "pkg", "mpkg", "scptd", "rtfd",
        "key", "pages", "numbers", "sparsebundle", "download", "textclipping", "webarchive",
    ]

    /// Bundles are sealed by their signature and never entered.
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

    /// Whether a folder is one Finder shows and Sift walks: visible, not a
    /// dependency tree, not a package, a real directory.
    public static func isBrowsable(path: String, name: String) -> Bool {
        guard !name.hasPrefix("."), name != "node_modules" else { return false }
        return isDirectory(path) && !isPackage(path: path, name: name)
    }

    /// Bytes beneath a directory on the same device.
    public static func size(ofDirectory root: String) -> Int64 {
        var total: Int64 = 0
        var stack = [root]
        let device = info(root)?.device
        while let dir = stack.popLast() {
            guard let names = names(in: dir) else { continue }
            for name in names {
                let path = Paths.join(dir, name)
                guard let st = info(path), !st.isSymlink else { continue }
                if st.isDirectory {
                    if st.device == device { stack.append(path) }
                } else {
                    total += st.size
                }
            }
        }
        return total
    }
}
