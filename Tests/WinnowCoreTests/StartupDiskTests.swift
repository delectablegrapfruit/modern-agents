import XCTest
@testable import WinnowCore

final class StartupDiskTests: XCTestCase {
    var box: TestSandbox!
    var engine: Engine!

    override func setUpWithError() throws {
        box = try TestSandbox()
        try box.file("Users/me/Desktop/.DS_Store")
        try box.file("Users/me/Desktop/.Spotlight-V100/x")
        try box.file("Users/me/Desktop/photo.jpg")
        try box.file("Applications/.DS_Store")
        try box.file("Other/.DS_Store")
        let store = SettingsStore(fileURL: box.root.appendingPathComponent("config/settings.json"))
        engine = Engine(store: store, inspector: StaticVolumeInspector([]),
                        log: ActivityLog(fileURL: box.root.appendingPathComponent("config/activity.jsonl")))
        engine.startupDiskRoots = [box.path + "/Users", box.path + "/Applications", box.path + "/Missing"]
    }

    override func tearDown() {
        engine.stop()
        box.destroy()
    }

    func testOffByDefaultAndOnlyDSStoreWhenOn() throws {
        XCTAssertFalse(Settings().startupDisk.isEnabled)
        XCTAssertTrue(engine.fullSweepTargets().isEmpty)

        var settings = engine.settings
        settings.startupDisk.enable()
        engine.update(settings)
        XCTAssertEqual(Set(engine.fullSweepTargets().map(\.path)), [box.path + "/Users", box.path + "/Applications"])

        let result = try engine.fullSweep()
        XCTAssertEqual(relativePaths(result.removed, from: box.path), ["Users/me/Desktop/.DS_Store", "Applications/.DS_Store"])
        XCTAssertTrue(box.exists("Users/me/Desktop/.Spotlight-V100"))
        XCTAssertTrue(box.exists("Other/.DS_Store"))
    }

    func testUserFolderKeepsFullRulesAlongsideStartupDisk() throws {
        var settings = engine.settings
        settings.startupDisk.enable()
        settings.locations = [WatchedLocation(path: box.path + "/Users/me/Desktop")]
        engine.update(settings)
        let targets = engine.fullSweepTargets()
        XCTAssertEqual(targets.count, 3)
        let desktop = targets.first { $0.path.hasSuffix("/Desktop") }!
        XCTAssertGreaterThan(engine.rules(for: desktop, settings: engine.settings).count, 1)
        let users = targets.first { $0.path.hasSuffix("/Users") }!
        XCTAssertEqual(engine.rules(for: users, settings: engine.settings).map(\.id), ["ds_store"])
    }

    func testTimeLimitExpires() throws {
        var settings = engine.settings
        settings.startupDisk.durationSeconds = 3600
        settings.startupDisk.enable(from: Date(timeIntervalSinceNow: -7200))
        engine.update(settings)
        XCTAssertTrue(engine.settings.startupDisk.isEnabled)
        XCTAssertFalse(engine.settings.startupDisk.isActive())
        XCTAssertTrue(engine.fullSweepTargets().isEmpty)

        var notified: Settings?
        engine.onSettingsChanged = { notified = $0 }
        XCTAssertTrue(engine.expireStartupDiskIfNeeded())
        XCTAssertFalse(engine.settings.startupDisk.isEnabled)
        XCTAssertNil(engine.settings.startupDisk.expiresAt)
        XCTAssertEqual(notified?.startupDisk.isEnabled, false)
        XCTAssertFalse(engine.expireStartupDiskIfNeeded())
        XCTAssertTrue(engine.log.entries.contains { $0.message.contains("time limit") })
    }

    func testIndefiniteNeverExpires() {
        var s = StartupDiskSettings()
        s.durationSeconds = nil
        s.enable()
        XCTAssertNil(s.expiresAt)
        XCTAssertTrue(s.isActive(at: Date(timeIntervalSinceNow: 1e9)))
        XCTAssertFalse(s.hasExpired(at: Date(timeIntervalSinceNow: 1e9)))
        s.disable()
        XCTAssertFalse(s.isEnabled)
    }

    func testSettingsRoundTripKeepsExpiry() throws {
        let store = SettingsStore(fileURL: box.root.appendingPathComponent("rt/settings.json"))
        var settings = Settings()
        settings.startupDisk.durationSeconds = 60
        settings.startupDisk.enable()
        try store.save(settings)
        let loaded = store.load()
        XCTAssertTrue(loaded.startupDisk.isEnabled)
        XCTAssertNotNil(loaded.startupDisk.expiresAt)
        XCTAssertEqual(loaded.startupDisk.durationSeconds, 60)
    }

    func testEventPrefilterSkipsUnrelatedNames() {
        let options = ScanOptions(rules: RuleSettings().activeRules)
        XCTAssertTrue(options.couldMatch(name: ".DS_Store"))
        XCTAssertTrue(options.couldMatch(name: "._sidecar"))
        XCTAssertTrue(options.couldMatch(name: ".spotlight-v100"))
        XCTAssertFalse(options.couldMatch(name: "report.pdf"))
        XCTAssertFalse(options.couldMatch(name: "Library"))
    }
}
