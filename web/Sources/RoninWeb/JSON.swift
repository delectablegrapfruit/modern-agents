/// A small, fast JSON writer: what the bridge hands the page is written straight into bytes, without Codable, so a
/// snapshot of the fight every frame costs next to nothing.
struct JSONWriter {
    private(set) var bytes: [UInt8] = []
    /// Whether the next item in the open container is its first (no comma before it), for each container open.
    private var first = true
    private var stack: [Bool] = []
    private var afterKey = false

    init(capacity: Int = 4096) { bytes.reserveCapacity(capacity) }

    private mutating func separate() {
        if afterKey {
            afterKey = false
            return
        }
        if !first { bytes.append(0x2C) }
        first = false
    }

    mutating func beginObject() {
        separate()
        bytes.append(0x7B)
        stack.append(first)
        first = true
    }

    mutating func endObject() {
        bytes.append(0x7D)
        first = stack.removeLast()
    }

    mutating func beginArray() {
        separate()
        bytes.append(0x5B)
        stack.append(first)
        first = true
    }

    mutating func endArray() {
        bytes.append(0x5D)
        first = stack.removeLast()
    }

    /// An object key (keys are plain ASCII names: never escaped).
    mutating func key(_ k: StaticString) {
        separate()
        bytes.append(0x22)
        k.withUTF8Buffer { bytes.append(contentsOf: $0) }
        bytes.append(0x22)
        bytes.append(0x3A)
        afterKey = true
    }

    /// An object key from a string (escaped).
    mutating func key(_ k: String) {
        separate()
        writeString(k)
        bytes.append(0x3A)
        afterKey = true
    }

    mutating func null() {
        separate()
        bytes.append(contentsOf: [0x6E, 0x75, 0x6C, 0x6C])
    }

    mutating func value(_ v: Bool) {
        separate()
        if v { bytes.append(contentsOf: [0x74, 0x72, 0x75, 0x65]) } else { bytes.append(contentsOf: [0x66, 0x61, 0x6C, 0x73, 0x65]) }
    }

    mutating func value(_ v: Int) {
        separate()
        writeInt(v)
    }

    mutating func value(_ v: Double) {
        separate()
        guard v.isFinite else {
            bytes.append(contentsOf: [0x6E, 0x75, 0x6C, 0x6C])
            return
        }
        if v == v.rounded(.towardZero), abs(v) < 1e15 {
            writeInt(Int(v))
        } else {
            bytes.append(contentsOf: v.description.utf8)
        }
    }

    mutating func value(_ v: String) {
        separate()
        writeString(v)
    }

    mutating func value(_ v: StaticString) {
        separate()
        bytes.append(0x22)
        v.withUTF8Buffer { bytes.append(contentsOf: $0) }
        bytes.append(0x22)
    }

    /// Already written JSON, spliced in as one value.
    mutating func raw(_ json: [UInt8]) {
        separate()
        bytes.append(contentsOf: json)
    }

    mutating func value(_ v: Int?) { if let v { value(v) } else { null() } }
    mutating func value(_ v: Double?) { if let v { value(v) } else { null() } }
    mutating func value(_ v: String?) { if let v { value(v) } else { null() } }
    mutating func value(_ v: Bool?) { if let v { value(v) } else { null() } }

    // Key and value in one.
    mutating func field(_ k: StaticString, _ v: Int) { key(k); value(v) }
    mutating func field(_ k: StaticString, _ v: Double) { key(k); value(v) }
    mutating func field(_ k: StaticString, _ v: Bool) { key(k); value(v) }
    mutating func field(_ k: StaticString, _ v: String) { key(k); value(v) }
    mutating func field(_ k: StaticString, _ v: StaticString) { key(k); value(v) }
    mutating func field(_ k: StaticString, _ v: Int?) { key(k); value(v) }
    mutating func field(_ k: StaticString, _ v: Double?) { key(k); value(v) }
    mutating func field(_ k: StaticString, _ v: String?) { key(k); value(v) }
    mutating func field(_ k: StaticString, _ v: Bool?) { key(k); value(v) }

    private mutating func writeInt(_ v: Int) {
        if v == 0 {
            bytes.append(0x30)
            return
        }
        var n = v.magnitude
        if v < 0 { bytes.append(0x2D) }
        var digits: (UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
                     UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8) =
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
        var count = 0
        withUnsafeMutableBytes(of: &digits) { buffer in
            while n > 0 {
                buffer[count] = UInt8(0x30 + n % 10)
                n /= 10
                count += 1
            }
            for i in stride(from: count - 1, through: 0, by: -1) { bytes.append(buffer[i]) }
        }
    }

    private mutating func writeString(_ s: String) {
        bytes.append(0x22)
        for b in s.utf8 {
            switch b {
            case 0x22: bytes.append(0x5C); bytes.append(0x22)
            case 0x5C: bytes.append(0x5C); bytes.append(0x5C)
            case 0x0A: bytes.append(0x5C); bytes.append(0x6E)
            case 0x0D: bytes.append(0x5C); bytes.append(0x72)
            case 0x09: bytes.append(0x5C); bytes.append(0x74)
            case 0..<0x20:
                let hex: [UInt8] = Array("0123456789abcdef".utf8)
                bytes.append(contentsOf: [0x5C, 0x75, 0x30, 0x30, hex[Int(b >> 4)], hex[Int(b & 15)]])
            default: bytes.append(b)
            }
        }
        bytes.append(0x22)
    }
}
