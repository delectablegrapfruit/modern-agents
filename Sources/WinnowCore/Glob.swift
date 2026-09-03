import Foundation

/// Shell-style wildcard matching (`*`, `?`, `[...]`), case-insensitive.
///
/// In name mode `*` matches anything. In path mode `*` and `?` stop at `/`
/// and `**` crosses directory boundaries.
public struct GlobPattern {
    public let pattern: String
    public let pathMode: Bool
    private let regex: NSRegularExpression?

    public init(_ pattern: String, pathMode: Bool = false) {
        self.pattern = pattern
        self.pathMode = pathMode
        let source = GlobPattern.regexSource(for: pattern, pathMode: pathMode)
        self.regex = try? NSRegularExpression(pattern: source, options: [.caseInsensitive])
    }

    public var isValid: Bool { regex != nil }

    public func matches(_ subject: String) -> Bool {
        guard let regex else { return false }
        let range = NSRange(subject.startIndex..<subject.endIndex, in: subject)
        return regex.firstMatch(in: subject, options: [], range: range) != nil
    }

    public static func containsWildcards(_ s: String) -> Bool {
        s.contains("*") || s.contains("?") || s.contains("[")
    }

    static func regexSource(for glob: String, pathMode: Bool) -> String {
        var out = "^"
        var i = glob.startIndex
        while i < glob.endIndex {
            let c = glob[i]
            switch c {
            case "*":
                let next = glob.index(after: i)
                if pathMode, next < glob.endIndex, glob[next] == "*" {
                    out += ".*"
                    i = next
                } else {
                    out += pathMode ? "[^/]*" : ".*"
                }
            case "?":
                out += pathMode ? "[^/]" : "."
            case "[":
                let start = glob.index(after: i)
                if start < glob.endIndex, let close = glob[start...].firstIndex(of: "]"), close > start {
                    var body = String(glob[start..<close])
                    if body.hasPrefix("!") { body = "^" + body.dropFirst() }
                    body = body.replacingOccurrences(of: "\\", with: "\\\\")
                    out += "[" + body + "]"
                    i = close
                } else {
                    out += "\\["
                }
            default:
                out += NSRegularExpression.escapedPattern(for: String(c))
            }
            i = glob.index(after: i)
        }
        out += "$"
        return out
    }

    // MARK: Cache

    private static let cacheLock = NSLock()
    private static var cache: [String: GlobPattern] = [:]

    public static func cached(_ pattern: String, pathMode: Bool = false) -> GlobPattern {
        let key = (pathMode ? "p:" : "n:") + pattern
        cacheLock.lock()
        defer { cacheLock.unlock() }
        if let hit = cache[key] { return hit }
        let made = GlobPattern(pattern, pathMode: pathMode)
        if cache.count > 512 { cache.removeAll() }
        cache[key] = made
        return made
    }
}

/// User-supplied exclusions. Each line is either an absolute path (everything
/// beneath it is left alone), a path glob (contains `/`), or a name glob.
public struct ExclusionMatcher {
    enum Entry {
        case pathPrefix(String)
        case pathGlob(GlobPattern)
        case nameGlob(GlobPattern)
    }

    private let entries: [Entry]
    public let patterns: [String]

    public init(_ patterns: [String]) {
        var out: [Entry] = []
        var kept: [String] = []
        for raw in patterns {
            var p = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !p.isEmpty, !p.hasPrefix("#") else { continue }
            kept.append(p)
            if p.hasPrefix("~") { p = NSString(string: p).expandingTildeInPath }
            if p.contains("/") {
                if GlobPattern.containsWildcards(p) {
                    out.append(.pathGlob(GlobPattern(p, pathMode: true)))
                } else {
                    var std = NSString(string: p).standardizingPath
                    while std.count > 1 && std.hasSuffix("/") { std.removeLast() }
                    out.append(.pathPrefix(std.lowercased()))
                }
            } else {
                out.append(.nameGlob(GlobPattern(p)))
            }
        }
        entries = out
        self.patterns = kept
    }

    public static let none = ExclusionMatcher([])

    public var isEmpty: Bool { entries.isEmpty }

    public func isExcluded(path: String, name: String) -> Bool {
        guard !entries.isEmpty else { return false }
        let lowerPath = path.lowercased()
        for entry in entries {
            switch entry {
            case .pathPrefix(let prefix):
                if lowerPath == prefix || lowerPath.hasPrefix(prefix + "/") { return true }
            case .pathGlob(let glob):
                if glob.matches(path) { return true }
            case .nameGlob(let glob):
                if glob.matches(name) { return true }
            }
        }
        return false
    }
}
