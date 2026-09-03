import XCTest
@testable import WinnowCore

final class EngineTests: XCTestCase {
    var box: TestSandbox!
    var inspector: StaticVolumeInspector!
    var engine: Engine!
    var usb: VolumeInfo!

    override func setUpWithError() throws {
        box = try TestSandbox()
        try box.dir("USB")
        usb = VolumeInfo(id: "uuid:usb", name: "USB", mountPoint: box.path + "/USB", kind: .external, fileSystem: "exfat")
        inspector = StaticVolumeInspector([
            VolumeInfo(id: "uuid:boot", name: "Macintosh HD", mountPoint: "/", kind: .boot, fileSystem: "apfs"),
            usb,
        ])
        let store = SettingsStore(fileURL: box.root.appendingPathComponent("config/settings.json"))
        engine = Engine(store: store, inspector: inspector, log: ActivityLog(fileURL: box.root.appendingPathComponent("config/activity.jsonl")))
        var settings = engine.settings
        settings.general.pollIntervalSeconds = 1
        engine.update(settings)
    }

    override func tearDown() {
        engine.stop()
        box.destroy()
    }

    func testVolumeDecisions() {
        var policy = VolumePolicy()
        let network = VolumeInfo(id: "n", name: "NAS", mountPoint: "/Volumes/NAS", kind: .network, fileSystem: "smbfs")
        let internalAPFS = VolumeInfo(id: "i", name: "Data", mountPoint: "/Volumes/Data", kind: .internalDisk, fileSystem: "apfs")
        let boot = VolumeInfo(id: "b", name: "Boot", mountPoint: "/", kind: .boot, fileSystem: "apfs")
        let readOnly = VolumeInfo(id: "r", name: "DVD", mountPoint: "/Volumes/DVD", kind: .external, fileSystem: "udf", isReadOnly: true)

        XCTAssertTrue(Engine.decide(usb, policy: policy).isEligible)
        XCTAssertTrue(Engine.decide(network, policy: policy).isEligible)
        XCTAssertFalse(Engine.decide(internalAPFS, policy: policy).isEligible)
        XCTAssertFalse(Engine.decide(boot, policy: policy).isEligible)
        XCTAssertFalse(Engine.decide(readOnly, policy: policy).isEligible)

        policy.cleanInternal = true
        XCTAssertTrue(Engine.decide(internalAPFS, policy: policy).isEligible)
        policy.onlyNonMacFormatted = true
        XCTAssertFalse(Engine.decide(internalAPFS, policy: policy).isEligible)
        XCTAssertTrue(Engine.decide(usb, policy: policy).isEligible)

        policy.overrides[usb.id] = .never
        XCTAssertFalse(Engine.decide(usb, policy: policy).isEligible)
        policy.overrides[internalAPFS.id] = .always
        XCTAssertTrue(Engine.decide(internalAPFS, policy: policy).isEligible)
        policy.overrides[boot.id] = .always
        XCTAssertFalse(Engine.decide(boot, policy: policy).isEligible)
    }

    func testFullSweepCoversLocationsAndVolumes() throws {
        try box.file("USB/.DS_Store")
        try box.file("USB/.Spotlight-V100/x")
        try box.file("USB/Docs/._a")
        try box.file("USB/Docs/a")
        try box.file("Folder/.DS_Store")
        try box.file("Folder/Sub/.DS_Store")
        try box.file("Elsewhere/.DS_Store")

        var settings = engine.settings
        settings.locations = [WatchedLocation(path: box.path + "/Folder", recursive: false)]
        engine.update(settings)
        engine.refreshVolumes()

        let targets = engine.fullSweepTargets()
        XCTAssertEqual(Set(targets.map(\.path)), [box.path + "/USB", box.path + "/Folder"])

        let preview = try engine.fullSweep(dryRun: true)
        XCTAssertEqual(preview.removedCount, 4)
        XCTAssertTrue(box.exists("USB/.DS_Store"))

        let result = try engine.fullSweep()
        XCTAssertEqual(relativePaths(result.removed, from: box.path),
                       ["USB/.DS_Store", "USB/.Spotlight-V100", "USB/Docs/._a", "Folder/.DS_Store"])
        XCTAssertFalse(box.exists("USB/.Spotlight-V100"))
        XCTAssertTrue(box.exists("USB/Docs/a"))
        XCTAssertTrue(box.exists("Folder/Sub/.DS_Store"))
        XCTAssertTrue(box.exists("Elsewhere/.DS_Store"))
        XCTAssertEqual(engine.log.statistics.itemsRemoved, 4)
        XCTAssertTrue(engine.log.entries.contains { $0.kind == .sweep })
    }

    func testEventPathsResolveToHighestJunkAncestor() throws {
        try box.file("USB/.Trashes/501/deep/file")
        try box.file("USB/Photos/.DS_Store")
        try box.file("USB/Photos/real.jpg")
        engine.refreshVolumes()
        let target = SweepTarget(volume: usb)
        let items = engine.junkItems(fromEventPaths: [
            box.path + "/USB/.Trashes/501/deep/file",
            box.path + "/USB/Photos/.DS_Store",
            box.path + "/USB/Photos/real.jpg",
            box.path + "/USB/Photos/missing",
            box.path + "/Elsewhere/.DS_Store",
        ], target: target, settings: engine.settings)
        XCTAssertEqual(relativePaths(items, from: box.path), ["USB/.Trashes", "USB/Photos/.DS_Store"])
    }

    func testWatcherCleansOnStartAndAfterChanges() throws {
        try box.file("USB/.DS_Store")
        var settings = engine.settings
        settings.volumes.cleanOnMount = true
        engine.update(settings)

        let cleaned = expectation(description: "auto clean")
        cleaned.assertForOverFulfill = false
        engine.onAutoClean = { _, _ in cleaned.fulfill() }
        engine.start()
        XCTAssertEqual(engine.activeWatches.map(\.path), [box.path + "/USB"])
        wait(for: [cleaned], timeout: 10)
        XCTAssertFalse(box.exists("USB/.DS_Store"))

        let again = expectation(description: "second clean")
        again.assertForOverFulfill = false
        engine.onAutoClean = { _, _ in again.fulfill() }
        try box.file("USB/Later/.DS_Store")
        wait(for: [again], timeout: 10)
        XCTAssertFalse(box.exists("USB/Later/.DS_Store"))
        XCTAssertTrue(box.exists("USB/Later"))
    }

    func testPausingStopsWatching() throws {
        engine.start()
        XCTAssertEqual(engine.activeWatches.count, 1)
        var settings = engine.settings
        settings.general.isWatching = false
        engine.update(settings)
        XCTAssertTrue(engine.activeWatches.isEmpty)
        settings.general.isWatching = true
        engine.update(settings)
        XCTAssertEqual(engine.activeWatches.count, 1)
    }

    func testUnmountedVolumesDropOut() throws {
        engine.start()
        XCTAssertEqual(engine.activeWatches.count, 1)
        inspector.volumes = inspector.volumes.filter { $0.kind == .boot }
        engine.refreshVolumes()
        XCTAssertTrue(engine.activeWatches.isEmpty)
        XCTAssertTrue(engine.fullSweepTargets().isEmpty)
    }

    func testCleanBeforeEject() throws {
        try box.file("USB/.DS_Store")
        engine.start()
        engine.handleVolumeWillUnmount(mountPoint: box.path + "/USB")
        XCTAssertFalse(box.exists("USB/.DS_Store"))
        XCTAssertTrue(engine.activeWatches.isEmpty)
    }

    func testSpotlightMarkerPrevention() throws {
        var settings = engine.settings
        settings.prevention.noSpotlightOnCleanedVolumes = true
        engine.update(settings)
        engine.refreshVolumes()
        engine.applyPreventionToMountedVolumes()
        XCTAssertTrue(box.exists("USB/.metadata_never_index"))
        XCTAssertTrue(engine.log.entries.contains { $0.kind == .prevention })
        // The marker is never treated as junk.
        let result = try engine.fullSweep()
        XCTAssertTrue(box.exists("USB/.metadata_never_index"))
        XCTAssertEqual(result.removedCount, 0)
    }
}
