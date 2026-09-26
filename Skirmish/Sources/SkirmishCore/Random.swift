/// SplitMix64: small, fast, and the same sequence on every platform, so a seed names one map everywhere and a
/// saved battle carries on exactly as it would have.
public struct SeededRNG: RandomNumberGenerator, Codable, Equatable, Sendable {
    public var state: UInt64

    public init(seed: UInt64) { state = seed }

    public mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    /// Uniform in 0..<1.
    public mutating func unit() -> Double { Double(next() >> 11) / Double(UInt64(1) << 53) }

    public mutating func range(_ lo: Double, _ hi: Double) -> Double { lo + (hi - lo) * unit() }

    public mutating func int(_ range: ClosedRange<Int>) -> Int { Int.random(in: range, using: &self) }

    public mutating func chance(_ p: Double) -> Bool { unit() < p }
}

/// Mixes two numbers into a seed: the sector and the attempt at it name the map.
public func mixSeed(_ a: UInt64, _ b: UInt64) -> UInt64 {
    var rng = SeededRNG(seed: a &* 0x2545_F491_4F6C_DD1D ^ (b &+ 0x632B_E59B_D9B4_E019))
    return rng.next()
}
