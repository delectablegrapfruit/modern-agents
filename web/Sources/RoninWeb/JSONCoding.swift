// JSON for Codable values, without Foundation: the WebAssembly build leaves Foundation out (it is most of the module's
// size), so the save file and the page's requests are read and written here. The output is plain JSON as Foundation's
// JSONEncoder writes it (keys in the order encoded, integers exact, doubles as Swift prints them: shortest round trip),
// and whatever it writes Foundation's JSONDecoder reads back to the same values, and the other way about
// (web/test/native checks it).

/// A parsed JSON value. Numbers are kept as their text, so a 64-bit seed reads back exactly.
indirect enum JSONValue {
    case null
    case bool(Bool)
    case number(String)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue], order: [String])

    var kind: String {
        switch self {
        case .null: return "null"
        case .bool: return "a boolean"
        case .number: return "a number"
        case .string: return "a string"
        case .array: return "an array"
        case .object: return "an object"
        }
    }
}

// MARK: Parsing

struct JSONParser {
    private let bytes: [UInt8]
    private var i = 0

    static func parse(_ bytes: [UInt8]) throws -> JSONValue {
        var parser = JSONParser(bytes: bytes)
        parser.skip()
        let value = try parser.value(depth: 0)
        parser.skip()
        guard parser.i == bytes.count else { throw parser.error("unexpected text after the JSON value") }
        return value
    }

    private init(bytes: [UInt8]) { self.bytes = bytes }

    private func error(_ message: String) -> DecodingError {
        DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "JSON: \(message) (at byte \(i))"))
    }

    private mutating func skip() {
        while i < bytes.count, bytes[i] == 0x20 || bytes[i] == 0x0A || bytes[i] == 0x0D || bytes[i] == 0x09 { i += 1 }
    }

    private mutating func literal(_ word: StaticString, _ value: JSONValue) throws -> JSONValue {
        let n = word.utf8CodeUnitCount
        guard i + n <= bytes.count else { throw error("unexpected end") }
        let matches = word.withUTF8Buffer { w in (0..<n).allSatisfy { bytes[i + $0] == w[$0] } }
        guard matches else { throw error("unexpected character") }
        i += n
        return value
    }

    private mutating func value(depth: Int) throws -> JSONValue {
        guard depth < 512 else { throw error("nested too deeply") }
        guard i < bytes.count else { throw error("unexpected end") }
        switch bytes[i] {
        case 0x7B: // {
            i += 1
            var dict: [String: JSONValue] = [:]
            var order: [String] = []
            skip()
            if i < bytes.count, bytes[i] == 0x7D {
                i += 1
                return .object(dict, order: order)
            }
            while true {
                skip()
                guard i < bytes.count, bytes[i] == 0x22 else { throw error("expected a key") }
                let key = try string()
                skip()
                guard i < bytes.count, bytes[i] == 0x3A else { throw error("expected ':'") }
                i += 1
                skip()
                let v = try value(depth: depth + 1)
                if dict.updateValue(v, forKey: key) == nil { order.append(key) }
                skip()
                guard i < bytes.count else { throw error("unexpected end") }
                if bytes[i] == 0x2C { i += 1; continue }
                if bytes[i] == 0x7D { i += 1; return .object(dict, order: order) }
                throw error("expected ',' or '}'")
            }
        case 0x5B: // [
            i += 1
            var items: [JSONValue] = []
            skip()
            if i < bytes.count, bytes[i] == 0x5D {
                i += 1
                return .array(items)
            }
            while true {
                skip()
                items.append(try value(depth: depth + 1))
                skip()
                guard i < bytes.count else { throw error("unexpected end") }
                if bytes[i] == 0x2C { i += 1; continue }
                if bytes[i] == 0x5D { i += 1; return .array(items) }
                throw error("expected ',' or ']'")
            }
        case 0x22:
            return .string(try string())
        case 0x74: return try literal("true", .bool(true))
        case 0x66: return try literal("false", .bool(false))
        case 0x6E: return try literal("null", .null)
        case 0x2D, 0x30...0x39:
            let start = i
            i += 1
            while i < bytes.count {
                switch bytes[i] {
                case 0x30...0x39, 0x2E, 0x65, 0x45, 0x2B, 0x2D: i += 1
                default: return .number(String(decoding: bytes[start..<i], as: UTF8.self))
                }
            }
            return .number(String(decoding: bytes[start..<i], as: UTF8.self))
        default:
            throw error("unexpected character")
        }
    }

    private mutating func hex4() throws -> UInt32 {
        guard i + 4 <= bytes.count else { throw error("unexpected end in \\u escape") }
        var v: UInt32 = 0
        for _ in 0..<4 {
            let c = bytes[i]
            i += 1
            v <<= 4
            switch c {
            case 0x30...0x39: v |= UInt32(c - 0x30)
            case 0x61...0x66: v |= UInt32(c - 0x61 + 10)
            case 0x41...0x46: v |= UInt32(c - 0x41 + 10)
            default: throw error("bad \\u escape")
            }
        }
        return v
    }

    private mutating func string() throws -> String {
        i += 1 // the opening quote
        let start = i
        // The common case: no escapes.
        while i < bytes.count, bytes[i] != 0x22, bytes[i] != 0x5C { i += 1 }
        guard i < bytes.count else { throw error("unterminated string") }
        if bytes[i] == 0x22 {
            defer { i += 1 }
            return String(decoding: bytes[start..<i], as: UTF8.self)
        }
        var out = Array(bytes[start..<i])
        while i < bytes.count {
            let c = bytes[i]
            if c == 0x22 {
                i += 1
                return String(decoding: out, as: UTF8.self)
            }
            if c != 0x5C {
                out.append(c)
                i += 1
                continue
            }
            i += 1
            guard i < bytes.count else { break }
            let e = bytes[i]
            i += 1
            switch e {
            case 0x22: out.append(0x22)
            case 0x5C: out.append(0x5C)
            case 0x2F: out.append(0x2F)
            case 0x62: out.append(0x08)
            case 0x66: out.append(0x0C)
            case 0x6E: out.append(0x0A)
            case 0x72: out.append(0x0D)
            case 0x74: out.append(0x09)
            case 0x75:
                var scalar = try hex4()
                if (0xD800..<0xDC00).contains(scalar), i + 6 <= bytes.count, bytes[i] == 0x5C, bytes[i + 1] == 0x75 {
                    i += 2
                    let low = try hex4()
                    scalar = 0x10000 + ((scalar - 0xD800) << 10) + (low &- 0xDC00)
                }
                out.append(contentsOf: String(Unicode.Scalar(scalar).map(Character.init) ?? "\u{FFFD}").utf8)
            default: throw error("bad escape")
            }
        }
        throw error("unterminated string")
    }
}

// MARK: Decoding

struct JSONKey: CodingKey {
    var stringValue: String
    var intValue: Int?
    init(stringValue: String) { self.stringValue = stringValue }
    init(intValue: Int) {
        stringValue = "\(intValue)"
        self.intValue = intValue
    }
    init(_ string: String) { stringValue = string }
    static let superKey = JSONKey("super")
}

enum JSON {
    static func decode<T: Decodable>(_ type: T.Type, from bytes: [UInt8]) throws -> T {
        try T(from: ValueDecoder(value: try JSONParser.parse(bytes), codingPath: []))
    }

    static func decode<T: Decodable>(_ type: T.Type, from text: String) throws -> T {
        try decode(type, from: Array(text.utf8))
    }

    static func encode<T: Encodable>(_ value: T) throws -> [UInt8] {
        let root = EncodedNode()
        try value.encode(to: ValueEncoder(node: root, codingPath: []))
        var out: [UInt8] = []
        out.reserveCapacity(4096)
        root.write(into: &out)
        return out
    }
}

private func mismatch<T>(_ type: T.Type, _ value: JSONValue, _ path: [CodingKey]) -> DecodingError {
    DecodingError.typeMismatch(type, .init(codingPath: path, debugDescription: "expected \(type), found \(value.kind)"))
}

private func number<T: LosslessStringConvertible & BinaryInteger>(_ type: T.Type, _ value: JSONValue, _ path: [CodingKey]) throws -> T {
    guard case .number(let text) = value else { throw mismatch(type, value, path) }
    if let v = T(text) { return v }
    // Written with a fraction or an exponent, but whole ("3.0", "1e3").
    if let d = Double(text), d.rounded() == d, let v = T(exactly: d) { return v }
    throw DecodingError.dataCorrupted(.init(codingPath: path, debugDescription: "\(text) does not fit in \(type)"))
}

private func scalar(_ value: JSONValue, _ path: [CodingKey], as type: Any.Type) throws -> Any {
    switch type {
    case is Bool.Type:
        guard case .bool(let b) = value else { throw mismatch(Bool.self, value, path) }
        return b
    case is String.Type:
        guard case .string(let s) = value else { throw mismatch(String.self, value, path) }
        return s
    case is Double.Type, is Float.Type:
        guard case .number(let text) = value, let d = Double(text) else { throw mismatch(Double.self, value, path) }
        return type == Float.self ? Float(d) : d
    case is Int.Type: return try number(Int.self, value, path)
    case is Int8.Type: return try number(Int8.self, value, path)
    case is Int16.Type: return try number(Int16.self, value, path)
    case is Int32.Type: return try number(Int32.self, value, path)
    case is Int64.Type: return try number(Int64.self, value, path)
    case is UInt.Type: return try number(UInt.self, value, path)
    case is UInt8.Type: return try number(UInt8.self, value, path)
    case is UInt16.Type: return try number(UInt16.self, value, path)
    case is UInt32.Type: return try number(UInt32.self, value, path)
    case is UInt64.Type: return try number(UInt64.self, value, path)
    default: fatalError("not a JSON scalar: \(type)")
    }
}

private struct ValueDecoder: Decoder {
    let value: JSONValue
    var codingPath: [CodingKey]
    var userInfo: [CodingUserInfoKey: Any] { [:] }

    func container<Key: CodingKey>(keyedBy type: Key.Type) throws -> KeyedDecodingContainer<Key> {
        guard case .object(let dict, let order) = value else { throw mismatch([String: Any].self, value, codingPath) }
        return KeyedDecodingContainer(Keyed<Key>(dict: dict, order: order, codingPath: codingPath))
    }

    func unkeyedContainer() throws -> UnkeyedDecodingContainer {
        guard case .array(let items) = value else { throw mismatch([Any].self, value, codingPath) }
        return Unkeyed(items: items, codingPath: codingPath)
    }

    func singleValueContainer() throws -> SingleValueDecodingContainer { Single(value: value, codingPath: codingPath) }
}

private struct Single: SingleValueDecodingContainer {
    let value: JSONValue
    var codingPath: [CodingKey]

    func decodeNil() -> Bool { if case .null = value { return true } else { return false } }
    func decode(_ type: Bool.Type) throws -> Bool { try scalar(value, codingPath, as: type) as! Bool }
    func decode(_ type: String.Type) throws -> String { try scalar(value, codingPath, as: type) as! String }
    func decode(_ type: Double.Type) throws -> Double { try scalar(value, codingPath, as: type) as! Double }
    func decode(_ type: Float.Type) throws -> Float { try scalar(value, codingPath, as: type) as! Float }
    func decode(_ type: Int.Type) throws -> Int { try number(type, value, codingPath) }
    func decode(_ type: Int8.Type) throws -> Int8 { try number(type, value, codingPath) }
    func decode(_ type: Int16.Type) throws -> Int16 { try number(type, value, codingPath) }
    func decode(_ type: Int32.Type) throws -> Int32 { try number(type, value, codingPath) }
    func decode(_ type: Int64.Type) throws -> Int64 { try number(type, value, codingPath) }
    func decode(_ type: UInt.Type) throws -> UInt { try number(type, value, codingPath) }
    func decode(_ type: UInt8.Type) throws -> UInt8 { try number(type, value, codingPath) }
    func decode(_ type: UInt16.Type) throws -> UInt16 { try number(type, value, codingPath) }
    func decode(_ type: UInt32.Type) throws -> UInt32 { try number(type, value, codingPath) }
    func decode(_ type: UInt64.Type) throws -> UInt64 { try number(type, value, codingPath) }
    func decode<T: Decodable>(_ type: T.Type) throws -> T { try T(from: ValueDecoder(value: value, codingPath: codingPath)) }
}

private struct Keyed<Key: CodingKey>: KeyedDecodingContainerProtocol {
    let dict: [String: JSONValue]
    let order: [String]
    var codingPath: [CodingKey]

    var allKeys: [Key] { order.compactMap { Key(stringValue: $0) } }
    func contains(_ key: Key) -> Bool { dict[key.stringValue] != nil }

    private func value(_ key: Key) throws -> JSONValue {
        guard let v = dict[key.stringValue] else {
            throw DecodingError.keyNotFound(key, .init(codingPath: codingPath, debugDescription: "no value for \(key.stringValue)"))
        }
        return v
    }

    private func path(_ key: Key) -> [CodingKey] { codingPath + [key] }

    func decodeNil(forKey key: Key) throws -> Bool { if case .null = try value(key) { return true } else { return false } }
    func decode(_ type: Bool.Type, forKey key: Key) throws -> Bool { try scalar(value(key), path(key), as: type) as! Bool }
    func decode(_ type: String.Type, forKey key: Key) throws -> String { try scalar(value(key), path(key), as: type) as! String }
    func decode(_ type: Double.Type, forKey key: Key) throws -> Double { try scalar(value(key), path(key), as: type) as! Double }
    func decode(_ type: Float.Type, forKey key: Key) throws -> Float { try scalar(value(key), path(key), as: type) as! Float }
    func decode(_ type: Int.Type, forKey key: Key) throws -> Int { try number(type, value(key), path(key)) }
    func decode(_ type: Int8.Type, forKey key: Key) throws -> Int8 { try number(type, value(key), path(key)) }
    func decode(_ type: Int16.Type, forKey key: Key) throws -> Int16 { try number(type, value(key), path(key)) }
    func decode(_ type: Int32.Type, forKey key: Key) throws -> Int32 { try number(type, value(key), path(key)) }
    func decode(_ type: Int64.Type, forKey key: Key) throws -> Int64 { try number(type, value(key), path(key)) }
    func decode(_ type: UInt.Type, forKey key: Key) throws -> UInt { try number(type, value(key), path(key)) }
    func decode(_ type: UInt8.Type, forKey key: Key) throws -> UInt8 { try number(type, value(key), path(key)) }
    func decode(_ type: UInt16.Type, forKey key: Key) throws -> UInt16 { try number(type, value(key), path(key)) }
    func decode(_ type: UInt32.Type, forKey key: Key) throws -> UInt32 { try number(type, value(key), path(key)) }
    func decode(_ type: UInt64.Type, forKey key: Key) throws -> UInt64 { try number(type, value(key), path(key)) }
    func decode<T: Decodable>(_ type: T.Type, forKey key: Key) throws -> T {
        try T(from: ValueDecoder(value: value(key), codingPath: path(key)))
    }

    func nestedContainer<NestedKey: CodingKey>(keyedBy type: NestedKey.Type, forKey key: Key) throws -> KeyedDecodingContainer<NestedKey> {
        try ValueDecoder(value: value(key), codingPath: path(key)).container(keyedBy: type)
    }

    func nestedUnkeyedContainer(forKey key: Key) throws -> UnkeyedDecodingContainer {
        try ValueDecoder(value: value(key), codingPath: path(key)).unkeyedContainer()
    }

    func superDecoder() throws -> Decoder {
        ValueDecoder(value: dict["super"] ?? .null, codingPath: codingPath + [JSONKey.superKey])
    }

    func superDecoder(forKey key: Key) throws -> Decoder {
        ValueDecoder(value: dict[key.stringValue] ?? .null, codingPath: path(key))
    }
}

private struct Unkeyed: UnkeyedDecodingContainer {
    let items: [JSONValue]
    var codingPath: [CodingKey]
    var currentIndex = 0

    init(items: [JSONValue], codingPath: [CodingKey]) {
        self.items = items
        self.codingPath = codingPath
    }

    var count: Int? { items.count }
    var isAtEnd: Bool { currentIndex >= items.count }

    private mutating func next<T>(_ type: T.Type) throws -> (JSONValue, [CodingKey]) {
        guard !isAtEnd else {
            throw DecodingError.valueNotFound(type, .init(codingPath: codingPath, debugDescription: "the array has no more values"))
        }
        let path = codingPath + [JSONKey(intValue: currentIndex)]
        defer { currentIndex += 1 }
        return (items[currentIndex], path)
    }

    mutating func decodeNil() throws -> Bool {
        guard !isAtEnd else { return false }
        if case .null = items[currentIndex] {
            currentIndex += 1
            return true
        }
        return false
    }

    mutating func decode(_ type: Bool.Type) throws -> Bool { let (v, p) = try next(type); return try scalar(v, p, as: type) as! Bool }
    mutating func decode(_ type: String.Type) throws -> String { let (v, p) = try next(type); return try scalar(v, p, as: type) as! String }
    mutating func decode(_ type: Double.Type) throws -> Double { let (v, p) = try next(type); return try scalar(v, p, as: type) as! Double }
    mutating func decode(_ type: Float.Type) throws -> Float { let (v, p) = try next(type); return try scalar(v, p, as: type) as! Float }
    mutating func decode(_ type: Int.Type) throws -> Int { let (v, p) = try next(type); return try number(type, v, p) }
    mutating func decode(_ type: Int8.Type) throws -> Int8 { let (v, p) = try next(type); return try number(type, v, p) }
    mutating func decode(_ type: Int16.Type) throws -> Int16 { let (v, p) = try next(type); return try number(type, v, p) }
    mutating func decode(_ type: Int32.Type) throws -> Int32 { let (v, p) = try next(type); return try number(type, v, p) }
    mutating func decode(_ type: Int64.Type) throws -> Int64 { let (v, p) = try next(type); return try number(type, v, p) }
    mutating func decode(_ type: UInt.Type) throws -> UInt { let (v, p) = try next(type); return try number(type, v, p) }
    mutating func decode(_ type: UInt8.Type) throws -> UInt8 { let (v, p) = try next(type); return try number(type, v, p) }
    mutating func decode(_ type: UInt16.Type) throws -> UInt16 { let (v, p) = try next(type); return try number(type, v, p) }
    mutating func decode(_ type: UInt32.Type) throws -> UInt32 { let (v, p) = try next(type); return try number(type, v, p) }
    mutating func decode(_ type: UInt64.Type) throws -> UInt64 { let (v, p) = try next(type); return try number(type, v, p) }
    mutating func decode<T: Decodable>(_ type: T.Type) throws -> T {
        let (v, p) = try next(type)
        return try T(from: ValueDecoder(value: v, codingPath: p))
    }

    mutating func nestedContainer<NestedKey: CodingKey>(keyedBy type: NestedKey.Type) throws -> KeyedDecodingContainer<NestedKey> {
        let (v, p) = try next([String: Any].self)
        return try ValueDecoder(value: v, codingPath: p).container(keyedBy: type)
    }

    mutating func nestedUnkeyedContainer() throws -> UnkeyedDecodingContainer {
        let (v, p) = try next([Any].self)
        return try ValueDecoder(value: v, codingPath: p).unkeyedContainer()
    }

    mutating func superDecoder() throws -> Decoder {
        let (v, p) = try next(Any.self)
        return ValueDecoder(value: v, codingPath: p)
    }
}

// MARK: Encoding

/// A value being encoded: a scalar's JSON text, or an array or object of nodes (filled in as the encoder goes).
final class EncodedNode {
    var text: [UInt8]?
    var items: [EncodedNode]?
    var keys: [String]?
    var members: [String: EncodedNode]?

    func write(into out: inout [UInt8]) {
        if let items {
            out.append(0x5B)
            for (k, item) in items.enumerated() {
                if k > 0 { out.append(0x2C) }
                item.write(into: &out)
            }
            out.append(0x5D)
        } else if let keys, let members {
            out.append(0x7B)
            for (k, key) in keys.enumerated() {
                if k > 0 { out.append(0x2C) }
                EncodedNode.quote(key, into: &out)
                out.append(0x3A)
                members[key]!.write(into: &out)
            }
            out.append(0x7D)
        } else if let text {
            out.append(contentsOf: text)
        } else {
            // Nothing was encoded (an empty container is written as one): JSONEncoder writes an empty object.
            out.append(contentsOf: [0x7B, 0x7D])
        }
    }

    static func quote(_ s: String, into out: inout [UInt8]) {
        out.append(0x22)
        for b in s.utf8 {
            switch b {
            case 0x22: out.append(0x5C); out.append(0x22)
            case 0x5C: out.append(0x5C); out.append(0x5C)
            case 0x0A: out.append(0x5C); out.append(0x6E)
            case 0x0D: out.append(0x5C); out.append(0x72)
            case 0x09: out.append(0x5C); out.append(0x74)
            case 0x08: out.append(0x5C); out.append(0x62)
            case 0x0C: out.append(0x5C); out.append(0x66)
            case 0..<0x20:
                let hex = Array("0123456789abcdef".utf8)
                out.append(contentsOf: [0x5C, 0x75, 0x30, 0x30, hex[Int(b >> 4)], hex[Int(b & 15)]])
            default: out.append(b)
            }
        }
        out.append(0x22)
    }

    func makeObject() {
        if keys == nil {
            keys = []
            members = [:]
        }
    }

    func makeArray() { if items == nil { items = [] } }

    func member(_ key: String) -> EncodedNode {
        makeObject()
        if let existing = members![key] { return existing }
        let node = EncodedNode()
        keys!.append(key)
        members![key] = node
        return node
    }

    func append() -> EncodedNode {
        makeArray()
        let node = EncodedNode()
        items!.append(node)
        return node
    }

    func set(_ v: Bool) { text = Array((v ? "true" : "false").utf8) }
    func set(_ v: String) {
        var out: [UInt8] = []
        EncodedNode.quote(v, into: &out)
        text = out
    }
    func setNull() { text = Array("null".utf8) }
    func set<T: BinaryInteger>(integer v: T) { text = Array(String(v).utf8) }
    func set(_ v: Double, _ path: [CodingKey]) throws {
        guard v.isFinite else {
            throw EncodingError.invalidValue(v, .init(codingPath: path, debugDescription: "\(v) is not valid JSON"))
        }
        // As JSONEncoder writes it: a whole number without a fraction, the rest as Swift prints it.
        var s = v.description
        if s.hasSuffix(".0") { s.removeLast(2) }
        text = Array(s.utf8)
    }
}

private struct ValueEncoder: Encoder {
    let node: EncodedNode
    var codingPath: [CodingKey]
    var userInfo: [CodingUserInfoKey: Any] { [:] }

    func container<Key: CodingKey>(keyedBy type: Key.Type) -> KeyedEncodingContainer<Key> {
        node.makeObject()
        return KeyedEncodingContainer(KeyedEncoder<Key>(node: node, codingPath: codingPath))
    }

    func unkeyedContainer() -> UnkeyedEncodingContainer {
        node.makeArray()
        return UnkeyedEncoder(node: node, codingPath: codingPath)
    }

    func singleValueContainer() -> SingleValueEncodingContainer { SingleEncoder(node: node, codingPath: codingPath) }
}

private struct SingleEncoder: SingleValueEncodingContainer {
    let node: EncodedNode
    var codingPath: [CodingKey]

    mutating func encodeNil() throws { node.setNull() }
    mutating func encode(_ value: Bool) throws { node.set(value) }
    mutating func encode(_ value: String) throws { node.set(value) }
    mutating func encode(_ value: Double) throws { try node.set(value, codingPath) }
    mutating func encode(_ value: Float) throws { try node.set(Double(value), codingPath) }
    mutating func encode(_ value: Int) throws { node.set(integer: value) }
    mutating func encode(_ value: Int8) throws { node.set(integer: value) }
    mutating func encode(_ value: Int16) throws { node.set(integer: value) }
    mutating func encode(_ value: Int32) throws { node.set(integer: value) }
    mutating func encode(_ value: Int64) throws { node.set(integer: value) }
    mutating func encode(_ value: UInt) throws { node.set(integer: value) }
    mutating func encode(_ value: UInt8) throws { node.set(integer: value) }
    mutating func encode(_ value: UInt16) throws { node.set(integer: value) }
    mutating func encode(_ value: UInt32) throws { node.set(integer: value) }
    mutating func encode(_ value: UInt64) throws { node.set(integer: value) }
    mutating func encode<T: Encodable>(_ value: T) throws { try value.encode(to: ValueEncoder(node: node, codingPath: codingPath)) }
}

private struct KeyedEncoder<Key: CodingKey>: KeyedEncodingContainerProtocol {
    let node: EncodedNode
    var codingPath: [CodingKey]

    private func child(_ key: Key) -> EncodedNode { node.member(key.stringValue) }

    mutating func encodeNil(forKey key: Key) throws { child(key).setNull() }
    mutating func encode(_ value: Bool, forKey key: Key) throws { child(key).set(value) }
    mutating func encode(_ value: String, forKey key: Key) throws { child(key).set(value) }
    mutating func encode(_ value: Double, forKey key: Key) throws { try child(key).set(value, codingPath + [key]) }
    mutating func encode(_ value: Float, forKey key: Key) throws { try child(key).set(Double(value), codingPath + [key]) }
    mutating func encode(_ value: Int, forKey key: Key) throws { child(key).set(integer: value) }
    mutating func encode(_ value: Int8, forKey key: Key) throws { child(key).set(integer: value) }
    mutating func encode(_ value: Int16, forKey key: Key) throws { child(key).set(integer: value) }
    mutating func encode(_ value: Int32, forKey key: Key) throws { child(key).set(integer: value) }
    mutating func encode(_ value: Int64, forKey key: Key) throws { child(key).set(integer: value) }
    mutating func encode(_ value: UInt, forKey key: Key) throws { child(key).set(integer: value) }
    mutating func encode(_ value: UInt8, forKey key: Key) throws { child(key).set(integer: value) }
    mutating func encode(_ value: UInt16, forKey key: Key) throws { child(key).set(integer: value) }
    mutating func encode(_ value: UInt32, forKey key: Key) throws { child(key).set(integer: value) }
    mutating func encode(_ value: UInt64, forKey key: Key) throws { child(key).set(integer: value) }
    mutating func encode<T: Encodable>(_ value: T, forKey key: Key) throws {
        try value.encode(to: ValueEncoder(node: child(key), codingPath: codingPath + [key]))
    }

    mutating func nestedContainer<NestedKey: CodingKey>(keyedBy keyType: NestedKey.Type, forKey key: Key) -> KeyedEncodingContainer<NestedKey> {
        ValueEncoder(node: child(key), codingPath: codingPath + [key]).container(keyedBy: keyType)
    }

    mutating func nestedUnkeyedContainer(forKey key: Key) -> UnkeyedEncodingContainer {
        ValueEncoder(node: child(key), codingPath: codingPath + [key]).unkeyedContainer()
    }

    mutating func superEncoder() -> Encoder { ValueEncoder(node: node.member("super"), codingPath: codingPath + [JSONKey.superKey]) }
    mutating func superEncoder(forKey key: Key) -> Encoder { ValueEncoder(node: child(key), codingPath: codingPath + [key]) }
}

private struct UnkeyedEncoder: UnkeyedEncodingContainer {
    let node: EncodedNode
    var codingPath: [CodingKey]
    var count: Int { node.items?.count ?? 0 }

    private func next() -> EncodedNode { node.append() }
    private var path: [CodingKey] { codingPath + [JSONKey(intValue: count)] }

    mutating func encodeNil() throws { next().setNull() }
    mutating func encode(_ value: Bool) throws { next().set(value) }
    mutating func encode(_ value: String) throws { next().set(value) }
    mutating func encode(_ value: Double) throws { let p = path; try next().set(value, p) }
    mutating func encode(_ value: Float) throws { let p = path; try next().set(Double(value), p) }
    mutating func encode(_ value: Int) throws { next().set(integer: value) }
    mutating func encode(_ value: Int8) throws { next().set(integer: value) }
    mutating func encode(_ value: Int16) throws { next().set(integer: value) }
    mutating func encode(_ value: Int32) throws { next().set(integer: value) }
    mutating func encode(_ value: Int64) throws { next().set(integer: value) }
    mutating func encode(_ value: UInt) throws { next().set(integer: value) }
    mutating func encode(_ value: UInt8) throws { next().set(integer: value) }
    mutating func encode(_ value: UInt16) throws { next().set(integer: value) }
    mutating func encode(_ value: UInt32) throws { next().set(integer: value) }
    mutating func encode(_ value: UInt64) throws { next().set(integer: value) }
    mutating func encode<T: Encodable>(_ value: T) throws {
        let p = path
        try value.encode(to: ValueEncoder(node: next(), codingPath: p))
    }

    mutating func nestedContainer<NestedKey: CodingKey>(keyedBy keyType: NestedKey.Type) -> KeyedEncodingContainer<NestedKey> {
        let p = path
        return ValueEncoder(node: next(), codingPath: p).container(keyedBy: keyType)
    }

    mutating func nestedUnkeyedContainer() -> UnkeyedEncodingContainer {
        let p = path
        return ValueEncoder(node: next(), codingPath: p).unkeyedContainer()
    }

    mutating func superEncoder() -> Encoder {
        let p = path
        return ValueEncoder(node: next(), codingPath: p)
    }
}
