import Foundation
#if canImport(Darwin)
import Darwin
#endif

public struct Volume: Identifiable, Hashable, Codable {
    public enum Kind: String, Codable, Hashable {
        case startup, internalDisk, external, network
    }

    public var id: String
    public var name: String
    public var mountPoint: String
    public var kind: Kind
    public var isReadOnly: Bool
    /// A Time Machine destination (told by `tmutil`); never cleaned or watched.
    public var isTimeMachine: Bool

    public init(id: String, name: String, mountPoint: String, kind: Kind, isReadOnly: Bool = false, isTimeMachine: Bool = false) {
        self.id = id
        self.name = name
        self.mountPoint = Paths.standardize(mountPoint)
        self.kind = kind
        self.isReadOnly = isReadOnly
        self.isTimeMachine = isTimeMachine
    }

    /// Every writable disk that is not the startup disk and not a Time Machine
    /// store is cleaned. The startup disk is cleaned through its user areas.
    public func isCleanable(fileManager: FileManager = .default) -> Bool {
        guard kind != .startup, !isReadOnly, !isTimeMachine else { return false }
        return !fileManager.fileExists(atPath: mountPoint + "/Backups.backupdb")
    }
}

public protocol VolumeSource: AnyObject {
    func mounted() -> [Volume]
}

/// Fixed list, for tests and non-macOS hosts.
public final class FixedVolumes: VolumeSource {
    private let lock = NSLock()
    private var list: [Volume]

    public init(_ volumes: [Volume] = []) { list = volumes }

    public var volumes: [Volume] {
        get { lock.lock(); defer { lock.unlock() }; return list }
        set { lock.lock(); list = newValue; lock.unlock() }
    }

    public func mounted() -> [Volume] { volumes }
}

#if os(macOS)
public final class SystemVolumes: VolumeSource {
    private let keys: Set<URLResourceKey> = [
        .volumeNameKey, .volumeUUIDStringKey, .volumeIsInternalKey, .volumeIsRemovableKey, .volumeIsEjectableKey,
        .volumeIsLocalKey, .volumeIsRootFileSystemKey, .volumeIsReadOnlyKey,
    ]

    public init() {}

    /// Mount points `tmutil` lists as Time Machine destinations (APFS backup
    /// disks have no `Backups.backupdb` to recognise them by).
    static func timeMachineMountPoints() -> Set<String> {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/tmutil")
        process.arguments = ["destinationinfo", "-X"]
        let output = Pipe()
        process.standardOutput = output
        process.standardError = FileHandle.nullDevice
        guard (try? process.run()) != nil else { return [] }
        let data = output.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        guard process.terminationStatus == 0,
              let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any],
              let destinations = plist["Destinations"] as? [[String: Any]] else { return [] }
        return Set(destinations.compactMap { ($0["MountPoint"] as? String).map(Paths.standardize) })
    }

    public func mounted() -> [Volume] {
        guard let urls = FileManager.default.mountedVolumeURLs(includingResourceValuesForKeys: Array(keys),
                                                               options: [.skipHiddenVolumes]) else { return [] }
        let backups = SystemVolumes.timeMachineMountPoints()
        return urls.compactMap { url in
            guard let rv = try? url.resourceValues(forKeys: keys) else { return nil }
            let mountPoint = url.path
            let isSystem = rv.volumeIsRootFileSystem ?? (mountPoint == "/") || mountPoint.hasPrefix("/System/Volumes/")
            let kind: Volume.Kind
            if isSystem {
                kind = .startup
            } else if rv.volumeIsLocal == false {
                kind = .network
            } else if rv.volumeIsInternal == true && rv.volumeIsRemovable != true && rv.volumeIsEjectable != true {
                kind = .internalDisk
            } else {
                kind = .external
            }
            let name = rv.volumeName ?? url.lastPathComponent
            return Volume(id: rv.volumeUUIDString.map { "uuid:" + $0 } ?? "path:" + mountPoint,
                          name: name, mountPoint: mountPoint, kind: kind, isReadOnly: rv.volumeIsReadOnly ?? false,
                          isTimeMachine: backups.contains(Paths.standardize(mountPoint)))
        }
    }
}
#endif

public enum Volumes {
    public static func system() -> VolumeSource {
        #if os(macOS)
        return SystemVolumes()
        #else
        return FixedVolumes()
        #endif
    }
}
