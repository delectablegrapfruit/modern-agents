import Foundation

/// SplitMix64: small, fast, and the same on every platform, so a seed always makes the same boss and a saved fight
/// resumes exactly. Its state is saved as hex text, which no JSON reader rounds.
public struct RNG: Codable, Equatable, Sendable {
    private(set) var state: UInt64

    public init(seed: Int) {
        state = UInt64(bitPattern: Int64(seed)) &* 0x9E37_79B9_7F4A_7C15 &+ 0xD1B5_4A32_D192_ED03
    }

    public mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    /// In [0, 1).
    public mutating func unit() -> Double { Double(next() >> 11) / Double(UInt64(1) << 53) }
    public mutating func range(_ a: Double, _ b: Double) -> Double { a + (b - a) * unit() }
    public mutating func int(_ n: Int) -> Int { n <= 1 ? 0 : Int(next() % UInt64(n)) }
    public mutating func int(in r: ClosedRange<Int>) -> Int { r.lowerBound + int(r.count) }
    public mutating func chance(_ p: Double) -> Bool { unit() < p }
    public mutating func sign() -> Double { chance(0.5) ? 1 : -1 }
    public mutating func pick<T>(_ items: [T]) -> T { items[int(items.count)] }

    public mutating func shuffle<T>(_ items: inout [T]) {
        guard items.count > 1 else { return }
        for i in stride(from: items.count - 1, to: 0, by: -1) { items.swapAt(i, int(i + 1)) }
    }

    public init(from decoder: Decoder) throws {
        let text = try decoder.singleValueContainer().decode(String.self)
        guard let value = UInt64(text, radix: 16) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "bad RNG state"))
        }
        state = value
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(String(state, radix: 16))
    }
}

/// Folds numbers into a positive seed (48 bits, so it survives any JSON reader).
public func mixSeed(_ values: Int...) -> Int {
    var h: UInt64 = 0xCBF2_9CE4_8422_2325
    for v in values {
        h ^= UInt64(bitPattern: Int64(v))
        h = h &* 0x100_0000_01B3
        h ^= h >> 29
    }
    return Int(h & 0xFFFF_FFFF_FFFF)
}
