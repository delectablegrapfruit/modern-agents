import Foundation

/// Whether the app may capture the sound other apps play — the permission a process tap needs, which System Settings
/// lists under Privacy & Security ▸ Screen & System Audio Recording.
enum CapturePermission: Equatable {
    case authorized
    case denied
    case undetermined
    /// The system offers no way to ask ahead; macOS asks by itself when the first tap starts.
    case unavailable

    var allowsCapture: Bool { self == .authorized || self == .unavailable }
}

/// macOS has no public call to check or request the audio-capture permission before using a tap, so this uses the
/// TCC framework's own entry points, looked up at run time, as open-source tap apps do. Checking first matters
/// here: a tap mutes the device, and a tap that may not capture would leave it silent.
enum AudioCaptureAccess {
    private typealias Preflight = @convention(c) (CFString, CFDictionary?) -> Int
    private typealias Request = @convention(c) (CFString, CFDictionary?, @escaping @convention(block) (Bool) -> Void) -> Void

    private static let service = "kTCCServiceAudioCapture" as CFString
    private static let framework = dlopen("/System/Library/PrivateFrameworks/TCC.framework/Versions/A/TCC", RTLD_NOW)

    static func status() -> CapturePermission {
        guard let framework, let symbol = dlsym(framework, "TCCAccessPreflight") else { return .unavailable }
        switch unsafeBitCast(symbol, to: Preflight.self)(service, nil) {
        case 0: return .authorized
        case 1: return .denied
        default: return .undetermined
        }
    }

    /// Shows the system's permission prompt; `completion` runs on the main queue with the answer.
    static func request(_ completion: @escaping (Bool) -> Void) {
        guard let framework, let symbol = dlsym(framework, "TCCAccessRequest") else {
            completion(true)
            return
        }
        unsafeBitCast(symbol, to: Request.self)(service, nil) { granted in
            DispatchQueue.main.async { completion(granted) }
        }
    }
}
