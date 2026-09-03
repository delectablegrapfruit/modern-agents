import XCTest
@testable import WinnowCore

final class SettingsTests: XCTestCase {
    func testEmptyDocumentYieldsDefaults() throws {
        let settings = try JSONDecoder().decode(Settings.self, from: Data("{}".utf8))
        XCTAssertEqual(settings, Settings())
        XCTAssertTrue(settings.general.isWatching)
        XCTAssertEqual(settings.general.deletionMode, .permanent)
        XCTAssertTrue(settings.volumes.cleanExternal)
        XCTAssertFalse(settings.volumes.cleanInternal)
    }

    func testPartialDocument() throws {
        let json = """
        {"general": {"deletionMode": "trash"}, "locations": [{"path": "/Volumes/USB"}],
         "volumes": {"overrides": {"uuid:1": "never"}}, "exclusions": ["Thumbs.db"]}
        """
        let settings = try JSONDecoder().decode(Settings.self, from: Data(json.utf8))
        XCTAssertEqual(settings.general.deletionMode, .trash)
        XCTAssertTrue(settings.general.notify)
        XCTAssertEqual(settings.locations.first?.path, "/Volumes/USB")
        XCTAssertTrue(settings.locations.first?.isEnabled ?? false)
        XCTAssertEqual(settings.volumes.overrides["uuid:1"], .never)
        XCTAssertEqual(settings.exclusions, ["Thumbs.db"])
    }

    func testStoreRoundTrip() throws {
        let box = try TestSandbox()
        defer { box.destroy() }
        let store = SettingsStore(fileURL: box.root.appendingPathComponent("nested/settings.json"))
        XCTAssertEqual(store.load(), Settings())
        var settings = Settings()
        settings.rules.setEnabled(false, ruleID: "ds_store")
        settings.rules.custom = [CustomPattern(pattern: "*.bak", entryKind: .file, scope: .anywhere)]
        settings.locations = [WatchedLocation(path: box.path + "/Photos/", recursive: false)]
        settings.prevention.noDSStoreOnUSB = true
        try store.save(settings)
        let loaded = store.load()
        XCTAssertEqual(loaded, settings)
        XCTAssertEqual(loaded.locations.first?.path, box.path + "/Photos")
    }
}
