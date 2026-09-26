import Foundation

/// SplitMix64: a small, fast generator whose whole state is one number, kept in the save so a campaign's dice are
/// reproducible (and tests can pin them).
public struct SplitMix64: RandomNumberGenerator, Sendable, Equatable {
    public private(set) var state: UInt64

    public init(seed: UInt64) {
        state = seed
    }

    public mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    /// A number in [0, 1).
    public mutating func unit() -> Double {
        Double(next() >> 11) * 0x1.0p-53
    }

    /// True with probability `p`.
    public mutating func chance(_ p: Double) -> Bool {
        unit() < p
    }
}

// Saved as a hexadecimal string: JSON numbers go through doubles in some decoders, which cannot hold 64 bits.
extension SplitMix64: Codable {
    public init(from decoder: Decoder) throws {
        let text = try decoder.singleValueContainer().decode(String.self)
        guard let value = UInt64(text, radix: 16) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "bad generator state \(text)"))
        }
        state = value
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(String(state, radix: 16))
    }
}
