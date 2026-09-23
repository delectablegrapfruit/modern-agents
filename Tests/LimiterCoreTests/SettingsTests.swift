import XCTest
@testable import LimiterCore

final class SettingsTests: XCTestCase {
    func testClamp() {
        XCTAssertEqual(LimiterSettings.clamp(0.001), LimiterSettings.minimumCeiling)
        XCTAssertEqual(LimiterSettings.clamp(1.4), 1)
        XCTAssertEqual(LimiterSettings.clamp(0.504), 0.5)
        XCTAssertEqual(LimiterSettings.clamp(0.996), 1)
        XCTAssertEqual(LimiterSettings.clamp(.nan), 1)
    }

    func testRoundTrip() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = SettingsStore(url: directory.appendingPathComponent("Settings.json"))
        XCTAssertEqual(store.load(), LimiterSettings(), "no file: defaults")

        var settings = LimiterSettings(isEnabled: false)
        settings.setCeiling(0.42, uid: "BuiltInSpeakerDevice", name: "MacBook Pro Speakers")
        try store.save(settings)
        XCTAssertEqual(store.load(), settings)

        try Data("not json".utf8).write(to: store.url)
        XCTAssertEqual(store.load(), LimiterSettings(), "unreadable file: defaults")
    }

    func testMissingKeysTakeDefaults() throws {
        let settings = try JSONDecoder().decode(LimiterSettings.self, from: Data(#"{"devices":{"a":{"name":"A","ceiling":0.3}}}"#.utf8))
        XCTAssertTrue(settings.isEnabled)
        XCTAssertEqual(settings.devices["a"]?.ceiling, 0.3)
    }

    func testCeilingByUID() {
        var settings = LimiterSettings()
        settings.setCeiling(0.4, uid: "usb-1", name: "Scarlett 2i2")
        XCTAssertEqual(settings.ceiling(uid: "usb-1", name: "Scarlett 2i2", connected: ["usb-1"]), 0.4)
        XCTAssertEqual(settings.ceiling(uid: "bt-9", name: "AirPods", connected: ["usb-1", "bt-9"]), 1, "never limited")
    }

    func testDeviceBackUnderANewUIDKeepsItsLimit() {
        var settings = LimiterSettings()
        settings.setCeiling(0.4, uid: "usb-port-1", name: "Scarlett 2i2")
        XCTAssertEqual(settings.ceiling(uid: "usb-port-2", name: "Scarlett 2i2", connected: ["usb-port-2"]), 0.4)
        XCTAssertNil(settings.devices["usb-port-1"])
        XCTAssertEqual(settings.devices["usb-port-2"]?.ceiling, 0.4)
    }

    func testNamesakeThatIsConnectedIsNotTakenOver() {
        var settings = LimiterSettings()
        settings.setCeiling(0.4, uid: "usb-port-1", name: "Scarlett 2i2")
        XCTAssertEqual(settings.ceiling(uid: "usb-port-2", name: "Scarlett 2i2", connected: ["usb-port-1", "usb-port-2"]), 1)
        XCTAssertEqual(settings.devices["usb-port-1"]?.ceiling, 0.4)
    }

    func testAmbiguousNamesakesAreNotTakenOver() {
        var settings = LimiterSettings()
        settings.setCeiling(0.4, uid: "a", name: "USB Audio")
        settings.setCeiling(0.7, uid: "b", name: "USB Audio")
        XCTAssertEqual(settings.ceiling(uid: "c", name: "USB Audio", connected: ["c"]), 1)
        XCTAssertEqual(settings.devices.count, 2)
    }
}
