import Foundation

/// How loud a device plays at each position of its volume slider: decibels at evenly spaced positions from 0 to 1.
///
/// Core Audio converts any volume position of a device with a volume control to decibels, so the app samples each
/// device's own curve; devices without one get `generic`. The limiter states everything in slider positions and
/// measures it on this curve, so the mapping holds whatever taper a device has.
public struct VolumeCurve: Equatable, Sendable {
    /// Anything quieter counts as silence.
    public static let floor: Float = -120

    /// Decibels at positions 0, 1/(n−1), …, 1: finite, at or above `floor`, never decreasing, at least two of them.
    public let decibels: [Float]

    /// A curve from decibels sampled at evenly spaced positions. Values that are not finite or lie below `floor` are
    /// read as `floor`, and dips are flattened, so the curve never gets quieter as the slider goes up.
    public init(decibels samples: [Float]) {
        var cleaned: [Float] = []
        cleaned.reserveCapacity(Swift.max(samples.count, 2))
        var loudest = VolumeCurve.floor
        for sample in samples {
            loudest = Swift.max(loudest, sample.isFinite ? sample : VolumeCurve.floor)
            cleaned.append(loudest)
        }
        while cleaned.count < 2 { cleaned.append(cleaned.last ?? 0) }
        decibels = cleaned
    }

    /// Samples a curve at `count` evenly spaced positions. Nil when a sample cannot be read, or when the curve spans
    /// less than a decibel — a volume control that does nothing.
    public init?(samples count: Int = 65, _ decibels: (Float) -> Float?) {
        let count = Swift.max(count, 2)
        var values: [Float] = []
        values.reserveCapacity(count)
        for index in 0..<count {
            guard let value = decibels(Float(index) / Float(count - 1)) else { return nil }
            values.append(value)
        }
        self.init(decibels: values)
        guard self.decibels[self.decibels.count - 1] - self.decibels[0] >= 1 else { return nil }
    }

    /// For devices that report no curve: amplitude follows the cube of the slider position (60 dB per decade of
    /// position), a common taper that spreads perceived loudness evenly along a slider.
    public static let generic = VolumeCurve(decibels: (0...64).map { index in
        index == 0 ? VolumeCurve.floor : Float(60 * log10(Double(index) / 64))
    })

    /// Decibels at a slider position, interpolated between the samples.
    public func decibels(at position: Float) -> Float {
        let last = decibels.count - 1
        let x = VolumeCurve.unit(position) * Float(last)
        let index = Swift.min(Int(x), last - 1)
        let fraction = x - Float(index)
        return decibels[index] + (decibels[index + 1] - decibels[index]) * fraction
    }

    /// The gain, in decibels, that makes the device at slider `position` play as loud as it would at
    /// `position × ceiling`: the whole slider then covers what its first `ceiling` used to, and every movement of it
    /// changes the loudness `ceiling` times as much as before. Never positive; 0 when the ceiling is 1.
    public func gain(at position: Float, ceiling: Float) -> Float {
        let position = VolumeCurve.unit(position), ceiling = VolumeCurve.unit(ceiling)
        guard ceiling < 1, position > 0 else { return 0 }
        let gain = decibels(at: position * ceiling) - decibels(at: position)
        return Swift.min(0, Swift.max(gain, VolumeCurve.floor))
    }

    /// How far the device's loudest setting drops under a ceiling, in decibels (negative).
    public func attenuation(ceiling: Float) -> Float {
        decibels(at: ceiling) - decibels(at: 1)
    }

    static func unit(_ value: Float) -> Float {
        value.isFinite ? Swift.min(Swift.max(value, 0), 1) : 0
    }
}

public enum Decibels {
    /// The amplitude factor of a gain in decibels; silence at or below `VolumeCurve.floor`.
    public static func amplitude(_ decibels: Float) -> Float {
        decibels <= VolumeCurve.floor ? 0 : Float(pow(10, Double(decibels) / 20))
    }
}
