import Foundation
#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

public enum VolumeKind: String, Codable, Hashable, CaseIterable {
    case boot
    case internalDisk
    case external
    case network
    case unknown

    public var label: String {
        switch self {
        case .boot: return "Startup disk"
        case .internalDisk: return "Internal"
        case .external: return "External"
        case .network: return "Network"
        case .unknown: return "Unknown"
        }
    }
}

public struct VolumeInfo: Identifiable, Hashable, Codable {
    public var id: String
    public var name: String
    public var mountPoint: String
    public var kind: VolumeKind
    public var fileSystem: String
    public var isReadOnly: Bool
    public var totalCapacity: Int64?
    public var availableCapacity: Int64?

    public init(id: String? = nil, name: String, mountPoint: String, kind: VolumeKind, fileSystem: String,
                isReadOnly: Bool = false, totalCapacity: Int64? = nil, availableCapacity: Int64? = nil) {
        self.name = name
        self.mountPoint = SafetyPolicy.standardize(mountPoint)
        self.kind = kind
        self.fileSystem = fileSystem.lowercased()
        self.isReadOnly = isReadOnly
        self.totalCapacity = totalCapacity
        self.availableCapacity = availableCapacity
        self.id = id ?? "name:" + name
    }

    /// APFS and HFS+ keep Finder/Spotlight metadata in the file system itself.
    public var isMacNative: Bool {
        fileSystem == "apfs" || fileSystem == "hfs"
    }

    public var fileSystemLabel: String {
        switch fileSystem {
        case "apfs": return "APFS"
        case "hfs": return "Mac OS Extended"
        case "msdos": return "FAT"
        case "exfat": return "ExFAT"
        case "ntfs": return "NTFS"
        case "smbfs": return "SMB"
        case "afpfs": return "AFP"
        case "nfs": return "NFS"
        case "webdav": return "WebDAV"
        case "cd9660": return "CD"
        case "udf": return "UDF"
        default: return fileSystem.uppercased()
        }
    }
}

public protocol VolumeInspecting: AnyObject {
    func mountedVolumes() -> [VolumeInfo]
    func volume(containing path: String) -> VolumeInfo?
}

/// Fixed list of volumes, for tests and non-macOS hosts.
public final class StaticVolumeInspector: VolumeInspecting {
    private let lock = NSLock()
    private var _volumes: [VolumeInfo]

    public init(_ volumes: [VolumeInfo] = []) {
        _volumes = volumes
    }

    public var volumes: [VolumeInfo] {
        get { lock.lock(); defer { lock.unlock() }; return _volumes }
        set { lock.lock(); _volumes = newValue; lock.unlock() }
    }

    public func mountedVolumes() -> [VolumeInfo] { volumes }

    public func volume(containing path: String) -> VolumeInfo? {
        let p = SafetyPolicy.standardize(path)
        return volumes
            .filter { p == $0.mountPoint || p.hasPrefix($0.mountPoint == "/" ? "/" : $0.mountPoint + "/") }
            .max { $0.mountPoint.count < $1.mountPoint.count }
    }
}

public enum FileSystemProbe {
    /// The file system type name (`apfs`, `msdos`, `smbfs`, ...) reported by `statfs`.
    public static func fileSystemType(at path: String) -> String {
        #if canImport(Darwin)
        var st = statfs()
        guard statfs(path, &st) == 0 else { return "unknown" }
        return withUnsafePointer(to: &st.f_fstypename) { ptr in
            ptr.withMemoryRebound(to: CChar.self, capacity: Int(MFSTYPENAMELEN)) { String(cString: $0) }
        }
        #else
        return "unknown"
        #endif
    }
}

#if os(macOS)
/// Reads volume facts from the running system.
public final class SystemVolumeInspector: VolumeInspecting {
    private let keys: Set<URLResourceKey> = [
        .volumeNameKey, .volumeUUIDStringKey, .volumeIsInternalKey, .volumeIsRemovableKey,
        .volumeIsEjectableKey, .volumeIsLocalKey, .volumeIsRootFileSystemKey, .volumeIsReadOnlyKey,
        .volumeTotalCapacityKey, .volumeAvailableCapacityKey,
    ]

    public init() {}

    public func mountedVolumes() -> [VolumeInfo] {
        guard let urls = FileManager.default.mountedVolumeURLs(includingResourceValuesForKeys: Array(keys),
                                                               options: [.skipHiddenVolumes]) else { return [] }
        return urls.compactMap(info(for:))
    }

    public func volume(containing path: String) -> VolumeInfo? {
        let url = URL(fileURLWithPath: path)
        guard let volumeURL = (try? url.resourceValues(forKeys: [.volumeURLKey]))?.volume else { return nil }
        return info(for: volumeURL)
    }

    private func info(for url: URL) -> VolumeInfo? {
        guard let rv = try? url.resourceValues(forKeys: keys) else { return nil }
        let mountPoint = url.path
        let isRoot = rv.volumeIsRootFileSystem ?? (mountPoint == "/")
        let isSystem = isRoot || mountPoint.hasPrefix("/System/Volumes/")
        let isLocal = rv.volumeIsLocal ?? true
        let removable = rv.volumeIsRemovable ?? false
        let ejectable = rv.volumeIsEjectable ?? false
        let kind: VolumeKind
        if isSystem {
            kind = .boot
        } else if !isLocal {
            kind = .network
        } else if rv.volumeIsInternal == true && !removable && !ejectable {
            kind = .internalDisk
        } else {
            kind = .external
        }
        let name = rv.volumeName ?? url.lastPathComponent
        let id = rv.volumeUUIDString.map { "uuid:" + $0 } ?? "name:" + name
        return VolumeInfo(id: id, name: name, mountPoint: mountPoint, kind: kind,
                          fileSystem: FileSystemProbe.fileSystemType(at: mountPoint),
                          isReadOnly: rv.volumeIsReadOnly ?? false,
                          totalCapacity: rv.volumeTotalCapacity.map(Int64.init),
                          availableCapacity: rv.volumeAvailableCapacity.map(Int64.init))
    }
}
#endif

public enum VolumeInspectors {
    public static func system() -> VolumeInspecting {
        #if os(macOS)
        return SystemVolumeInspector()
        #else
        return StaticVolumeInspector()
        #endif
    }
}
