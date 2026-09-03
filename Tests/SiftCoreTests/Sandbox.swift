import Foundation
import XCTest
@testable import SiftCore

/// A scratch tree under the home directory (temp dirs live under protected
/// system prefixes on macOS and would be skipped by the safety policy).
final class Sandbox {
    let root: URL
    let fm = FileManager.default

    init() throws {
        root = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".sift-tests-" + UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
    }

    var path: String { root.path }

    func url(_ relative: String) -> URL { root.appendingPathComponent(relative) }

    @discardableResult
    func file(_ relative: String, _ contents: String = "x") throws -> String {
        let url = url(relative)
        try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try contents.data(using: .utf8)!.write(to: url)
        return url.path
    }

    @discardableResult
    func dir(_ relative: String) throws -> String {
        let url = url(relative)
        try fm.createDirectory(at: url, withIntermediateDirectories: true)
        return url.path
    }

    func exists(_ relative: String) -> Bool { fm.fileExists(atPath: url(relative).path) }

    func records(_ relative: String) throws -> [DSRecord] {
        try DSStore.read(try Data(contentsOf: url(relative))).records
    }

    func destroy() { try? fm.removeItem(at: root) }
}

func relative(_ items: [Item], from root: String) -> Set<String> {
    Set(items.map { String($0.path.dropFirst(root.count + 1)) })
}

func waitUntil(_ seconds: TimeInterval, _ condition: () -> Bool) -> Bool {
    let deadline = Date().addingTimeInterval(seconds)
    while Date() < deadline {
        if condition() { return true }
        Thread.sleep(forTimeInterval: 0.1)
    }
    return condition()
}
