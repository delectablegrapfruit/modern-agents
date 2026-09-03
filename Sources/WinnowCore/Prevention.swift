import Foundation

/// Finder's own switches for not writing `.DS_Store` files in the first place.
/// Finder reads them at launch, so it must be relaunched after a change.
public enum FinderPreferences {
    public static let domain = "com.apple.desktopservices"
    public static let networkKey = "DSDontWriteNetworkStores"
    public static let usbKey = "DSDontWriteUSBStores"

    public static var isSupported: Bool {
        #if os(macOS)
        return true
        #else
        return false
        #endif
    }

    public static func isSuppressed(network: Bool) -> Bool {
        guard isSupported, let defaults = UserDefaults(suiteName: domain) else { return false }
        return defaults.bool(forKey: network ? networkKey : usbKey)
    }

    @discardableResult
    public static func setSuppressed(network: Bool, _ value: Bool) -> Bool {
        guard isSupported, let defaults = UserDefaults(suiteName: domain) else { return false }
        defaults.set(value, forKey: network ? networkKey : usbKey)
        return defaults.synchronize()
    }
}

public enum VolumeMarkers {
    public static let spotlightMarker = ".metadata_never_index"

    /// Creates the marker Spotlight honours to skip a volume. Returns true if it was created.
    @discardableResult
    public static func ensureSpotlightDisabled(at mountPoint: String, fileManager: FileManager = .default) throws -> Bool {
        let path = SafetyPolicy.standardize(mountPoint) + "/" + spotlightMarker
        if fileManager.fileExists(atPath: path) { return false }
        guard fileManager.createFile(atPath: path, contents: Data()) else {
            throw CocoaError(.fileWriteNoPermission, userInfo: [NSFilePathErrorKey: path])
        }
        return true
    }

    public static func isSpotlightDisabled(at mountPoint: String, fileManager: FileManager = .default) -> Bool {
        fileManager.fileExists(atPath: SafetyPolicy.standardize(mountPoint) + "/" + spotlightMarker)
    }
}
