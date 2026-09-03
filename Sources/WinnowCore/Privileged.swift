#if os(macOS)
import Foundation

public enum PrivilegedRemovalError: Error, LocalizedError, Equatable {
    case cancelled
    case nothingToDo
    case failed(String)

    public var errorDescription: String? {
        switch self {
        case .cancelled: return "Cancelled"
        case .nothingToDo: return "Nothing to remove"
        case .failed(let message): return message
        }
    }
}

/// Deletes paths as root after the user enters an administrator password.
/// Uses AppleScript's `do shell script … with administrator privileges`, which
/// shows the standard system authentication dialog and needs no helper tool.
public enum PrivilegedRemover {
    /// Must be called on the main thread (NSAppleScript requirement).
    public static func remove(paths: [String], disableIndexingAt mounts: [String] = []) throws {
        guard !paths.isEmpty else { throw PrivilegedRemovalError.nothingToDo }
        let source = "do shell script \"\(escapeForAppleScript(shellScript(paths: paths, mounts: mounts)))\" with administrator privileges"
        guard let script = NSAppleScript(source: source) else { throw PrivilegedRemovalError.failed("Could not build removal script") }
        var errorInfo: NSDictionary?
        script.executeAndReturnError(&errorInfo)
        if let info = errorInfo {
            let number = info[NSAppleScript.errorNumber] as? Int ?? 0
            if number == -128 { throw PrivilegedRemovalError.cancelled }
            throw PrivilegedRemovalError.failed(info[NSAppleScript.errorMessage] as? String ?? "AppleScript error \(number)")
        }
    }

    static func shellScript(paths: [String], mounts: [String]) -> String {
        var commands: [String] = []
        for mount in mounts {
            commands.append("/usr/bin/mdutil -i off \(shellQuote(mount)) >/dev/null 2>&1 || true")
            commands.append("/usr/bin/touch \(shellQuote(mount + "/" + VolumeMarkers.spotlightMarker)) 2>/dev/null || true")
        }
        for path in paths {
            let quoted = shellQuote(path)
            commands.append("/usr/bin/chflags -R nouchg,noschg \(quoted) 2>/dev/null || true")
            commands.append("/bin/rm -rf -- \(quoted)")
        }
        return commands.joined(separator: "; ")
    }

    static func shellQuote(_ s: String) -> String {
        "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    static func escapeForAppleScript(_ s: String) -> String {
        s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
    }
}
#endif
