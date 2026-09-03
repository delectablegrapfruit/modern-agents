import Foundation
#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

public struct Failure: Hashable, Codable {
    public let item: Item
    public let reason: String
    /// The item exists but this process may not remove it (root-owned, sticky
    /// parent, privacy-protected). An administrator can.
    public let needsAdministrator: Bool

    public init(item: Item, reason: String, needsAdministrator: Bool = false) {
        self.item = item
        self.reason = reason
        self.needsAdministrator = needsAdministrator
    }
}

public struct Outcome: Hashable, Codable {
    public var removed: [Item] = []
    public var failed: [Failure] = []
    public var skipped: [Failure] = []
    public var dryRun = false

    public init() {}

    public var bytes: Int64 { removed.reduce(0) { $0 + $1.size } }
    public var locked: [Item] { failed.filter(\.needsAdministrator).map(\.item) }
    public var isEmpty: Bool { removed.isEmpty && failed.isEmpty && skipped.isEmpty }
}

public enum Errors {
    /// EPERM/EACCES anywhere in the error chain.
    public static func isPermission(_ error: Error) -> Bool {
        var current: NSError? = error as NSError
        while let err = current {
            if err.domain == NSPOSIXErrorDomain, err.code == Int(EPERM) || err.code == Int(EACCES) { return true }
            if err.domain == NSCocoaErrorDomain,
               err.code == CocoaError.Code.fileWriteNoPermission.rawValue || err.code == CocoaError.Code.fileReadNoPermission.rawValue {
                return true
            }
            current = err.userInfo[NSUnderlyingErrorKey] as? NSError
        }
        return false
    }
}

/// Deletes identified items, re-checking safety for each one.
public struct Remover {
    public let safety: Safety
    public let dryRun: Bool
    let fileManager: FileManager

    public init(safety: Safety, dryRun: Bool = false, fileManager: FileManager = .default) {
        self.safety = safety
        self.dryRun = dryRun
        self.fileManager = fileManager
    }

    public func remove(_ items: [Item], within roots: [String]? = nil,
                       progress: ((Int, Int) -> Void)? = nil,
                       isCancelled: () -> Bool = { false }) -> Outcome {
        var outcome = Outcome()
        outcome.dryRun = dryRun
        for (index, item) in items.enumerated() {
            if isCancelled() { break }
            progress?(index, items.count)
            if case .refused(let reason) = safety.validate(path: item.path, within: roots) {
                outcome.skipped.append(Failure(item: item, reason: reason))
                continue
            }
            guard Files.info(item.path) != nil else {
                outcome.skipped.append(Failure(item: item, reason: "Already gone"))
                continue
            }
            if dryRun {
                outcome.removed.append(item)
                continue
            }
            do {
                try delete(item.path)
                outcome.removed.append(item)
            } catch {
                outcome.failed.append(Failure(item: item, reason: error.localizedDescription,
                                              needsAdministrator: Errors.isPermission(error)))
            }
        }
        return outcome
    }

    private func delete(_ path: String) throws {
        do {
            try fileManager.removeItem(atPath: path)
        } catch {
            #if os(macOS)
            // Locked (uchg) items refuse deletion until the flag is cleared.
            if chflags(path, 0) == 0 {
                try fileManager.removeItem(atPath: path)
                return
            }
            #endif
            throw error
        }
    }
}

/// The shell script that removes items as root: Spotlight is switched off on the
/// disk before its index goes, and the event journal is left in its quiet form,
/// so neither grows back.
public enum Privileged {
    public static func script(for items: [Item]) -> String {
        var commands: [String] = []
        for item in items {
            let quoted = quote(item.path)
            switch item.kind {
            case .spotlight:
                let mount = quote(item.parent)
                commands.append("/usr/bin/mdutil -i off \(mount) >/dev/null 2>&1 || true")
                commands.append("/usr/bin/touch \(quote(item.parent + "/.metadata_never_index")) 2>/dev/null || true")
                commands.append("/bin/rm -rf -- \(quoted)")
            case .fsevents:
                commands.append("/bin/rm -rf -- \(quoted)")
                commands.append("/bin/mkdir -p \(quoted) && /usr/bin/touch \(quote(item.path + "/no_log"))")
            default:
                commands.append("/usr/bin/chflags -R nouchg,noschg \(quoted) 2>/dev/null || true")
                commands.append("/bin/rm -rf -- \(quoted)")
            }
        }
        return commands.joined(separator: "; ")
    }

    static func quote(_ s: String) -> String {
        "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    #if os(macOS)
    public enum RunError: Error, LocalizedError, Equatable {
        case cancelled
        case failed(String)

        public var errorDescription: String? {
            switch self {
            case .cancelled: return "Cancelled"
            case .failed(let message): return message
            }
        }
    }

    /// Asks for an administrator password through the system dialog and runs the
    /// script as root. Main thread only.
    public static func run(_ shell: String) throws {
        let escaped = shell.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        guard let script = NSAppleScript(source: "do shell script \"\(escaped)\" with administrator privileges") else {
            throw RunError.failed("Could not build the removal script")
        }
        var info: NSDictionary?
        script.executeAndReturnError(&info)
        if let info {
            let number = info[NSAppleScript.errorNumber] as? Int ?? 0
            if number == -128 { throw RunError.cancelled }
            throw RunError.failed(info[NSAppleScript.errorMessage] as? String ?? "AppleScript error \(number)")
        }
    }
    #endif
}
