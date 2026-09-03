import Foundation
import XCTest
@testable import WinnowCore

/// A scratch tree under the home directory (temp dirs live under protected
/// system prefixes on macOS and would be skipped by the safety policy).
final class TestSandbox {
    let root: URL
    let fm = FileManager.default

    init() throws {
        root = URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent(".winnow-tests-" + UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
    }

    var path: String { root.path }

    @discardableResult
    func file(_ relative: String, _ contents: String = "x") throws -> String {
        let url = root.appendingPathComponent(relative)
        try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try contents.data(using: .utf8)!.write(to: url)
        return url.path
    }

    @discardableResult
    func dir(_ relative: String) throws -> String {
        let url = root.appendingPathComponent(relative, isDirectory: true)
        try fm.createDirectory(at: url, withIntermediateDirectories: true)
        return url.path
    }

    func exists(_ relative: String) -> Bool {
        fm.fileExists(atPath: root.appendingPathComponent(relative).path)
    }

    func destroy() {
        try? fm.removeItem(at: root)
    }
}

func relativePaths(_ items: [JunkItem], from root: String) -> Set<String> {
    Set(items.map { String($0.path.dropFirst(root.count + 1)) })
}
