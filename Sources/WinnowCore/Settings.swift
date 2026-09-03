import Foundation

public enum DeletionMode: String, Codable, CaseIterable, Hashable {
    case permanent
    case trash

    public var label: String {
        switch self {
        case .permanent: return "Delete immediately"
        case .trash: return "Move to Trash"
        }
    }
}

public struct WatchedLocation: Codable, Identifiable, Hashable {
    public var id: UUID
    public var path: String
    public var isEnabled: Bool
    public var recursive: Bool

    public init(id: UUID = UUID(), path: String, isEnabled: Bool = true, recursive: Bool = true) {
        self.id = id
        self.path = NSString(string: path).standardizingPath
        self.isEnabled = isEnabled
        self.recursive = recursive
    }

    public var displayName: String {
        let home = NSHomeDirectory()
        if path == home { return "Home" }
        if path.hasPrefix(home + "/") { return "~" + path.dropFirst(home.count) }
        return path
    }

    enum CodingKeys: String, CodingKey { case id, path, isEnabled, recursive }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        path = try c.decode(String.self, forKey: .path)
        isEnabled = try c.decodeIfPresent(Bool.self, forKey: .isEnabled) ?? true
        recursive = try c.decodeIfPresent(Bool.self, forKey: .recursive) ?? true
    }
}

public struct CustomPattern: Codable, Identifiable, Hashable {
    public var id: UUID
    public var pattern: String
    public var entryKind: EntryKind
    public var scope: RuleScope

    public init(id: UUID = UUID(), pattern: String, entryKind: EntryKind = .any, scope: RuleScope = .anywhere) {
        self.id = id
        self.pattern = pattern
        self.entryKind = entryKind
        self.scope = scope
    }

    enum CodingKeys: String, CodingKey { case id, pattern, entryKind, scope }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        pattern = try c.decode(String.self, forKey: .pattern)
        entryKind = try c.decodeIfPresent(EntryKind.self, forKey: .entryKind) ?? .any
        scope = try c.decodeIfPresent(RuleScope.self, forKey: .scope) ?? .anywhere
    }

    public var rule: JunkRule {
        JunkRule(id: "custom:" + id.uuidString, name: pattern, pattern: pattern,
                 matchKind: GlobPattern.containsWildcards(pattern) ? .glob : .exact,
                 entryKind: entryKind, scope: scope, category: .custom,
                 summary: "Custom pattern", enabledByDefault: true, isBuiltIn: false)
    }
}

public struct RuleSettings: Codable, Hashable {
    /// Built-in rule IDs the user switched on or off relative to the default.
    public var disabledBuiltIn: Set<String> = []
    public var enabledBuiltIn: Set<String> = []
    public var custom: [CustomPattern] = []

    public init() {}

    enum CodingKeys: String, CodingKey { case disabledBuiltIn, enabledBuiltIn, custom }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        disabledBuiltIn = try c.decodeIfPresent(Set<String>.self, forKey: .disabledBuiltIn) ?? []
        enabledBuiltIn = try c.decodeIfPresent(Set<String>.self, forKey: .enabledBuiltIn) ?? []
        custom = try c.decodeIfPresent([CustomPattern].self, forKey: .custom) ?? []
    }

    public func isEnabled(_ rule: JunkRule) -> Bool {
        if !rule.isBuiltIn { return true }
        if disabledBuiltIn.contains(rule.id) { return false }
        if enabledBuiltIn.contains(rule.id) { return true }
        return rule.enabledByDefault
    }

    public mutating func setEnabled(_ enabled: Bool, ruleID: String) {
        disabledBuiltIn.remove(ruleID)
        enabledBuiltIn.remove(ruleID)
        guard let rule = JunkCatalog.builtIn(id: ruleID) else { return }
        if enabled != rule.enabledByDefault {
            if enabled { enabledBuiltIn.insert(ruleID) } else { disabledBuiltIn.insert(ruleID) }
        }
    }

    /// Every rule that should currently be applied.
    public var activeRules: [JunkRule] {
        JunkCatalog.builtIn.filter(isEnabled) + custom.map(\.rule)
    }
}

public enum VolumeOverride: String, Codable, Hashable {
    case always, never
}

public struct VolumePolicy: Codable, Hashable {
    public var cleanExternal = true
    public var cleanNetwork = true
    public var cleanInternal = false
    /// Skip APFS/HFS+ volumes, which store this metadata natively and do not need it removed.
    public var onlyNonMacFormatted = false
    public var cleanOnMount = true
    public var cleanOnEject = true
    /// Per-volume decisions keyed by `VolumeInfo.id`.
    public var overrides: [String: VolumeOverride] = [:]

    public init() {}

    enum CodingKeys: String, CodingKey {
        case cleanExternal, cleanNetwork, cleanInternal, onlyNonMacFormatted, cleanOnMount, cleanOnEject, overrides
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        cleanExternal = try c.decodeIfPresent(Bool.self, forKey: .cleanExternal) ?? true
        cleanNetwork = try c.decodeIfPresent(Bool.self, forKey: .cleanNetwork) ?? true
        cleanInternal = try c.decodeIfPresent(Bool.self, forKey: .cleanInternal) ?? false
        onlyNonMacFormatted = try c.decodeIfPresent(Bool.self, forKey: .onlyNonMacFormatted) ?? false
        cleanOnMount = try c.decodeIfPresent(Bool.self, forKey: .cleanOnMount) ?? true
        cleanOnEject = try c.decodeIfPresent(Bool.self, forKey: .cleanOnEject) ?? true
        overrides = try c.decodeIfPresent([String: VolumeOverride].self, forKey: .overrides) ?? [:]
    }
}

public struct PreventionSettings: Codable, Hashable {
    /// Drop a `.metadata_never_index` marker on cleaned volumes so Spotlight leaves them alone.
    public var noSpotlightOnCleanedVolumes = false

    public init() {}

    enum CodingKeys: String, CodingKey { case noSpotlightOnCleanedVolumes }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        noSpotlightOnCleanedVolumes = try c.decodeIfPresent(Bool.self, forKey: .noSpotlightOnCleanedVolumes) ?? false
    }
}

/// Opt-in cleaning of `.DS_Store` on the startup disk (user areas only), with an optional time limit.
public struct StartupDiskSettings: Codable, Hashable {
    public var isEnabled = false
    /// nil = stay enabled indefinitely.
    public var durationSeconds: Double?
    public var expiresAt: Date?

    public init() {}

    enum CodingKeys: String, CodingKey { case isEnabled, durationSeconds, expiresAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        isEnabled = try c.decodeIfPresent(Bool.self, forKey: .isEnabled) ?? false
        durationSeconds = try c.decodeIfPresent(Double.self, forKey: .durationSeconds)
        expiresAt = try c.decodeIfPresent(Date.self, forKey: .expiresAt)
    }

    public func isActive(at date: Date = Date()) -> Bool {
        guard isEnabled else { return false }
        if let expiresAt { return expiresAt > date }
        return true
    }

    public func hasExpired(at date: Date = Date()) -> Bool {
        guard isEnabled, let expiresAt else { return false }
        return expiresAt <= date
    }

    /// Turns cleaning on now, computing the expiry from `durationSeconds`.
    public mutating func enable(from date: Date = Date()) {
        isEnabled = true
        expiresAt = durationSeconds.map { date.addingTimeInterval($0) }
    }

    public mutating func disable() {
        isEnabled = false
        expiresAt = nil
    }
}

public struct GeneralSettings: Codable, Hashable {
    /// Master switch for background watching.
    public var isWatching = true
    public var deletionMode: DeletionMode = .permanent
    public var notify = true
    public var launchAtLogin = false
    public var skipPackages = true
    /// Seconds between full re-scans of network volumes (which do not deliver file events).
    public var pollIntervalSeconds: Double = 60
    /// Set the default view whenever a Finder window moves to a folder without its own.
    public var resetViewOnNavigation = true

    public init() {}

    enum CodingKeys: String, CodingKey {
        case isWatching, deletionMode, notify, launchAtLogin, skipPackages, pollIntervalSeconds, resetViewOnNavigation
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        isWatching = try c.decodeIfPresent(Bool.self, forKey: .isWatching) ?? true
        deletionMode = try c.decodeIfPresent(DeletionMode.self, forKey: .deletionMode) ?? .permanent
        notify = try c.decodeIfPresent(Bool.self, forKey: .notify) ?? true
        launchAtLogin = try c.decodeIfPresent(Bool.self, forKey: .launchAtLogin) ?? false
        skipPackages = try c.decodeIfPresent(Bool.self, forKey: .skipPackages) ?? true
        pollIntervalSeconds = try c.decodeIfPresent(Double.self, forKey: .pollIntervalSeconds) ?? 60
        resetViewOnNavigation = try c.decodeIfPresent(Bool.self, forKey: .resetViewOnNavigation) ?? true
    }
}

public struct Settings: Codable, Hashable {
    public static let currentSchema = 1

    public var schema = Settings.currentSchema
    public var general = GeneralSettings()
    public var rules = RuleSettings()
    public var locations: [WatchedLocation] = []
    public var volumes = VolumePolicy()
    public var prevention = PreventionSettings()
    public var startupDisk = StartupDiskSettings()
    /// Folders that keep their own Finder view (their `.DS_Store` is never swept).
    public var folderViews: [FolderView] = FolderView.seeded()
    public var exclusions: [String] = []

    public init() {}

    enum CodingKeys: String, CodingKey { case schema, general, rules, locations, volumes, prevention, startupDisk, folderViews, exclusions }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schema = try c.decodeIfPresent(Int.self, forKey: .schema) ?? Settings.currentSchema
        general = try c.decodeIfPresent(GeneralSettings.self, forKey: .general) ?? GeneralSettings()
        rules = try c.decodeIfPresent(RuleSettings.self, forKey: .rules) ?? RuleSettings()
        locations = try c.decodeIfPresent([WatchedLocation].self, forKey: .locations) ?? []
        volumes = try c.decodeIfPresent(VolumePolicy.self, forKey: .volumes) ?? VolumePolicy()
        prevention = try c.decodeIfPresent(PreventionSettings.self, forKey: .prevention) ?? PreventionSettings()
        startupDisk = try c.decodeIfPresent(StartupDiskSettings.self, forKey: .startupDisk) ?? StartupDiskSettings()
        folderViews = try c.decodeIfPresent([FolderView].self, forKey: .folderViews) ?? FolderView.seeded()
        exclusions = try c.decodeIfPresent([String].self, forKey: .exclusions) ?? []
    }

    public var exclusionMatcher: ExclusionMatcher { ExclusionMatcher(exclusions) }
}

// MARK: - Storage

public enum AppPaths {
    public static let appName = "Winnow"

    /// `~/Library/Application Support/Winnow` on macOS, `~/.config/winnow` elsewhere.
    public static func supportDirectory(fileManager: FileManager = .default) -> URL {
        #if os(macOS)
        let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        return base.appendingPathComponent(appName, isDirectory: true)
        #else
        if let xdg = ProcessInfo.processInfo.environment["XDG_CONFIG_HOME"], !xdg.isEmpty {
            return URL(fileURLWithPath: xdg).appendingPathComponent("winnow", isDirectory: true)
        }
        return URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".config/winnow", isDirectory: true)
        #endif
    }

    public static func settingsFile(in directory: URL? = nil) -> URL {
        (directory ?? supportDirectory()).appendingPathComponent("settings.json")
    }

    public static func activityFile(in directory: URL? = nil) -> URL {
        (directory ?? supportDirectory()).appendingPathComponent("activity.jsonl")
    }
}

public final class SettingsStore {
    public let fileURL: URL
    private let fileManager: FileManager

    public init(fileURL: URL = AppPaths.settingsFile(), fileManager: FileManager = .default) {
        self.fileURL = fileURL
        self.fileManager = fileManager
    }

    public func load() -> Settings {
        guard let data = try? Data(contentsOf: fileURL) else { return Settings() }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode(Settings.self, from: data)) ?? Settings()
    }

    public func save(_ settings: Settings) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(settings)
        try fileManager.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: fileURL, options: .atomic)
    }
}
