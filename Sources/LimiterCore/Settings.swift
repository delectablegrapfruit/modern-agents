import Foundation

/// The limit set for one output device.
public struct DeviceLimit: Codable, Equatable, Sendable {
    /// The device's name when it was last seen, to recognise it under a new UID.
    public var name: String
    /// The slider position whose loudness becomes the device's new maximum, `LimiterSettings.minimumCeiling`…1;
    /// 1 leaves the device alone.
    public var ceiling: Float

    public init(name: String, ceiling: Float) {
        self.name = name
        self.ceiling = ceiling
    }
}

/// Everything the app remembers: whether it is on, and a ceiling for every output device it has been given one for,
/// keyed by the device's Core Audio UID.
public struct LimiterSettings: Codable, Equatable, Sendable {
    public static let minimumCeiling: Float = 0.05

    public var isEnabled: Bool
    public var devices: [String: DeviceLimit]

    public init(isEnabled: Bool = true, devices: [String: DeviceLimit] = [:]) {
        self.isEnabled = isEnabled
        self.devices = devices
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        isEnabled = try container.decodeIfPresent(Bool.self, forKey: .isEnabled) ?? true
        devices = try container.decodeIfPresent([String: DeviceLimit].self, forKey: .devices) ?? [:]
    }

    /// A ceiling as the app keeps it: in whole percent, from `minimumCeiling` to 1.
    public static func clamp(_ ceiling: Float) -> Float {
        guard ceiling.isFinite else { return 1 }
        return Swift.min(1, Swift.max(minimumCeiling, (ceiling * 100).rounded() / 100))
    }

    /// The ceiling of the device with this UID; 1 for a device never limited. A device without a limit of its own
    /// takes over the limit of the one remembered device of the same name that is not connected — a USB device
    /// plugged into another port comes back under a new UID — and keeps it under its new UID from then on.
    public mutating func ceiling(uid: String, name: String, connected: Set<String>) -> Float {
        if let limit = devices[uid] { return limit.ceiling }
        let namesakes = devices.filter { $0.value.name == name && !connected.contains($0.key) }
        guard namesakes.count == 1, let namesake = namesakes.first else { return 1 }
        devices[namesake.key] = nil
        devices[uid] = namesake.value
        return namesake.value.ceiling
    }

    public mutating func setCeiling(_ ceiling: Float, uid: String, name: String) {
        devices[uid] = DeviceLimit(name: name, ceiling: LimiterSettings.clamp(ceiling))
    }
}

/// The settings file, `~/Library/Application Support/Audio Limiter/Settings.json`.
public struct SettingsStore: Sendable {
    public let url: URL

    public init(url: URL = SettingsStore.defaultURL) {
        self.url = url
    }

    public static var defaultURL: URL {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support")
        return support.appendingPathComponent("Audio Limiter", isDirectory: true).appendingPathComponent("Settings.json")
    }

    /// The saved settings, or the defaults when there are none or they cannot be read.
    public func load() -> LimiterSettings {
        guard let data = try? Data(contentsOf: url),
              let settings = try? JSONDecoder().decode(LimiterSettings.self, from: data)
        else { return LimiterSettings() }
        return settings
    }

    public func save(_ settings: LimiterSettings) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(settings).write(to: url, options: .atomic)
    }
}
