import XCTest
@testable import WinnowCore

final class GlobTests: XCTestCase {
    func testNameGlobs() {
        XCTAssertTrue(GlobPattern("*.tmp").matches("notes.TMP"))
        XCTAssertTrue(GlobPattern("._*").matches("._photo.jpg"))
        XCTAssertFalse(GlobPattern("._*").matches("photo.jpg"))
        XCTAssertTrue(GlobPattern("file?.txt").matches("file1.txt"))
        XCTAssertFalse(GlobPattern("file?.txt").matches("file10.txt"))
        XCTAssertTrue(GlobPattern("[!a]*").matches("bcd"))
        XCTAssertFalse(GlobPattern("[!a]*").matches("abc"))
        XCTAssertTrue(GlobPattern("a.b").matches("A.B"))
        XCTAssertFalse(GlobPattern("a.b").matches("axb"))
    }

    func testPathGlobs() {
        let single = GlobPattern("/Volumes/*/keep", pathMode: true)
        XCTAssertTrue(single.matches("/Volumes/USB/keep"))
        XCTAssertFalse(single.matches("/Volumes/USB/deeper/keep"))
        let double = GlobPattern("/Volumes/**/keep", pathMode: true)
        XCTAssertTrue(double.matches("/Volumes/USB/deeper/keep"))
    }

    func testWildcardDetection() {
        XCTAssertTrue(GlobPattern.containsWildcards("*.bak"))
        XCTAssertFalse(GlobPattern.containsWildcards(".DS_Store"))
    }

    func testExclusions() {
        let matcher = ExclusionMatcher(["/Volumes/Archive", "Thumbs.db", "/Volumes/*/raw", "# comment", ""])
        XCTAssertTrue(matcher.isExcluded(path: "/Volumes/Archive/a/.DS_Store", name: ".DS_Store"))
        XCTAssertTrue(matcher.isExcluded(path: "/Volumes/Archive", name: "Archive"))
        XCTAssertFalse(matcher.isExcluded(path: "/Volumes/Archive2/.DS_Store", name: ".DS_Store"))
        XCTAssertTrue(matcher.isExcluded(path: "/x/thumbs.DB", name: "thumbs.DB"))
        XCTAssertTrue(matcher.isExcluded(path: "/Volumes/USB/raw", name: "raw"))
        XCTAssertEqual(matcher.patterns.count, 3)
        XCTAssertTrue(ExclusionMatcher.none.isEmpty)
    }
}
