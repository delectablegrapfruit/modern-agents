import XCTest
@testable import WinnowCore

final class RuleTests: XCTestCase {
    func testCatalogHasUniqueIDs() {
        let ids = JunkCatalog.builtIn.map(\.id)
        XCTAssertEqual(ids.count, Set(ids).count)
        XCTAssertTrue(JunkCatalog.builtIn.allSatisfy(\.isBuiltIn))
    }

    func testDSStore() {
        let rule = JunkCatalog.builtIn(id: "ds_store")!
        XCTAssertTrue(rule.matches(name: ".DS_Store", isDirectory: false, atVolumeRoot: false))
        XCTAssertTrue(rule.matches(name: ".ds_store", isDirectory: false, atVolumeRoot: true))
        XCTAssertFalse(rule.matches(name: ".DS_Store", isDirectory: true, atVolumeRoot: false))
        XCTAssertFalse(rule.matches(name: ".DS_Store.bak", isDirectory: false, atVolumeRoot: false))
    }

    func testAppleDoublePrefixNeedsABaseName() {
        let rule = JunkCatalog.builtIn(id: "apple_double")!
        XCTAssertTrue(rule.matches(name: "._photo.jpg", isDirectory: false, atVolumeRoot: false))
        XCTAssertFalse(rule.matches(name: "._", isDirectory: false, atVolumeRoot: false))
        XCTAssertFalse(rule.matches(name: "._photo.jpg", isDirectory: true, atVolumeRoot: false))
    }

    func testVolumeRootRulesOnlyMatchAtRoot() {
        let rule = JunkCatalog.builtIn(id: "spotlight")!
        XCTAssertTrue(rule.matches(name: ".Spotlight-V100", isDirectory: true, atVolumeRoot: true))
        XCTAssertFalse(rule.matches(name: ".Spotlight-V100", isDirectory: true, atVolumeRoot: false))
        XCTAssertFalse(rule.matches(name: ".Spotlight-V100", isDirectory: false, atVolumeRoot: true))
    }

    func testCustomPatternRule() {
        let glob = CustomPattern(pattern: "*.bak").rule
        XCTAssertEqual(glob.matchKind, .glob)
        XCTAssertTrue(glob.matches(name: "old.BAK", isDirectory: false, atVolumeRoot: false))
        let exact = CustomPattern(pattern: "Thumbs.db", entryKind: .file).rule
        XCTAssertEqual(exact.matchKind, .exact)
        XCTAssertTrue(exact.matches(name: "thumbs.db", isDirectory: false, atVolumeRoot: false))
        XCTAssertFalse(exact.matches(name: "thumbs.db", isDirectory: true, atVolumeRoot: false))
        XCTAssertFalse(exact.isBuiltIn)
    }

    func testRuleSettingsToggles() {
        var settings = RuleSettings()
        let dsStore = JunkCatalog.builtIn(id: "ds_store")!
        let volumeIcon = JunkCatalog.builtIn(id: "volume_icon")!
        XCTAssertTrue(settings.isEnabled(dsStore))
        XCTAssertFalse(settings.isEnabled(volumeIcon))
        settings.setEnabled(false, ruleID: "ds_store")
        settings.setEnabled(true, ruleID: "volume_icon")
        XCTAssertFalse(settings.isEnabled(dsStore))
        XCTAssertTrue(settings.isEnabled(volumeIcon))
        settings.setEnabled(true, ruleID: "ds_store")
        XCTAssertTrue(settings.disabledBuiltIn.isEmpty)
        settings.custom = [CustomPattern(pattern: "*.bak")]
        XCTAssertTrue(settings.activeRules.contains { $0.category == .custom })
    }
}
