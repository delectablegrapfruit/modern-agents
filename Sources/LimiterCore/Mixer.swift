import Foundation

/// One buffer of interleaved 32-bit float samples, as a Core Audio `AudioBuffer` holds them.
public struct SampleBuffer {
    public var samples: UnsafeMutablePointer<Float>?
    public var channels: Int
    public var frames: Int

    @inlinable
    public init(samples: UnsafeMutablePointer<Float>?, channels: Int, frames: Int) {
        self.samples = samples
        self.channels = channels
        self.frames = frames
    }

    /// A buffer as Core Audio describes one: a data pointer (nil for a stream the callback does not use), a channel
    /// count and a size in bytes.
    @inlinable
    public init(data: UnsafeMutableRawPointer?, channels: Int, byteSize: Int) {
        self.init(
            samples: data?.assumingMemoryBound(to: Float.self),
            channels: channels,
            frames: channels > 0 ? byteSize / (channels * MemoryLayout<Float>.size) : 0
        )
    }
}

/// Follows a target gain without clicks. Each audio cycle moves the gain toward the target by a step set by a time
/// constant, and the cycle's samples ramp linearly between the gain at its start and at its end.
public struct GainSmoother: Sendable {
    public private(set) var current: Float
    /// Seconds to cover about two thirds of the way to a new target.
    public var timeConstant: Double

    public init(gain: Float, timeConstant: Double = 0.03) {
        current = gain
        self.timeConstant = timeConstant
    }

    /// Advances one cycle of `frames` frames toward `target`, returning the gains at the cycle's start and end.
    public mutating func advance(toward target: Float, frames: Int, sampleRate: Double) -> (start: Float, end: Float) {
        let start = current
        guard frames > 0, sampleRate > 0, timeConstant > 0 else {
            current = target
            return (start, target)
        }
        let remaining = Float(exp(-Double(frames) / (timeConstant * sampleRate)))
        var end = target + (start - target) * remaining
        if abs(end - target) < 1e-6 { end = target }
        current = end
        return (start, end)
    }
}

/// Plays the tapped sound into the device: a copy with a gain, channel for channel. Runs on the audio thread, so it
/// allocates nothing, takes no locks and touches no reference counts.
public enum Mixer {
    /// Writes every output channel. Channels are counted across buffers, so interleaved and one-buffer-per-channel
    /// layouts meet: output channel k gets input channel k times a gain ramping from `start` to `end` over the
    /// cycle. Output channels without an input channel, and frames past the end of a shorter input, are silent.
    @inlinable
    public static func render<Inputs: Collection, Outputs: Collection>(
        _ inputs: Inputs, into outputs: Outputs, gainFrom start: Float, to end: Float
    ) where Inputs.Element == SampleBuffer, Outputs.Element == SampleBuffer {
        var firstChannel = 0
        for output in outputs {
            if let destination = output.samples {
                for channel in 0..<output.channels {
                    let target = destination + channel
                    if let source = locate(firstChannel + channel, in: inputs), let samples = source.buffer.samples {
                        let frames = Swift.min(source.buffer.frames, output.frames)
                        scale(samples + source.channel, stride: source.buffer.channels, into: target, stride: output.channels,
                              frames: frames, rampLength: output.frames, from: start, to: end)
                        silence(target + frames * output.channels, stride: output.channels, frames: output.frames - frames)
                    } else {
                        silence(target, stride: output.channels, frames: output.frames)
                    }
                }
            }
            firstChannel += output.channels
        }
    }

    /// The buffer holding the input channel with this number, counted across buffers, and its place in the buffer.
    @inlinable
    static func locate<Inputs: Collection>(_ channel: Int, in inputs: Inputs) -> (buffer: SampleBuffer, channel: Int)?
    where Inputs.Element == SampleBuffer {
        var firstChannel = 0
        for input in inputs {
            if channel < firstChannel + input.channels { return (input, channel - firstChannel) }
            firstChannel += input.channels
        }
        return nil
    }

    @inlinable
    static func scale(
        _ source: UnsafeMutablePointer<Float>, stride sourceStride: Int,
        into destination: UnsafeMutablePointer<Float>, stride destinationStride: Int,
        frames: Int, rampLength: Int, from start: Float, to end: Float
    ) {
        guard frames > 0 else { return }
        let step = (end - start) / Float(Swift.max(rampLength, 1))
        var gain = start
        for frame in 0..<frames {
            gain += step
            destination[frame * destinationStride] = source[frame * sourceStride] * gain
        }
    }

    @inlinable
    static func silence(_ destination: UnsafeMutablePointer<Float>, stride: Int, frames: Int) {
        guard frames > 0 else { return }
        for frame in 0..<frames { destination[frame * stride] = 0 }
    }
}
