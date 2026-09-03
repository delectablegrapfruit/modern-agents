import Foundation
#if canImport(Darwin)
import Darwin
#endif

/// Read-only view of a file's extended attributes, for diagnostics.
public enum ExtendedAttributes {
    public struct Attribute {
        public let name: String
        public let data: Data

        /// A property list rendering when the value is one, else a byte count.
        public var summary: String {
            if let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) {
                return "\(plist)"
            }
            if let text = String(data: data, encoding: .utf8), text.allSatisfy({ !$0.isNewline && ($0.isLetter || $0.isNumber || $0.isPunctuation || $0.isWhitespace || $0.isSymbol) }), !text.isEmpty {
                return "\"\(text)\""
            }
            return "<\(data.count) bytes>"
        }
    }

    public static func list(at path: String) -> [Attribute] {
        #if canImport(Darwin)
        let length = listxattr(path, nil, 0, XATTR_NOFOLLOW)
        guard length > 0 else { return [] }
        var buffer = [CChar](repeating: 0, count: length)
        let got = listxattr(path, &buffer, length, XATTR_NOFOLLOW)
        guard got > 0 else { return [] }
        let names = buffer[0..<got].split(separator: 0, omittingEmptySubsequences: true).map { chunk in
            String(decoding: chunk.map { UInt8(bitPattern: $0) }, as: UTF8.self)
        }
        return names.map { name in
            let size = getxattr(path, name, nil, 0, 0, XATTR_NOFOLLOW)
            guard size > 0 else { return Attribute(name: name, data: Data()) }
            var value = [UInt8](repeating: 0, count: size)
            let read = getxattr(path, name, &value, size, 0, XATTR_NOFOLLOW)
            return Attribute(name: name, data: Data(value[0..<max(0, read)]))
        }
        #else
        return []
        #endif
    }
}
