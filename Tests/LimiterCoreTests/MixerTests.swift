import XCTest
@testable import LimiterCore

final class MixerTests: XCTestCase {
    /// Renders from inputs given as arrays of interleaved samples (nil: a stream the callback does not use) into
    /// outputs of the given sizes, and returns what the outputs hold.
    private func render(
        inputs: [(samples: [Float]?, channels: Int)], outputs: [(frames: Int, channels: Int)], from start: Float, to end: Float
    ) -> [[Float]] {
        let inputPointers = inputs.map { input -> (UnsafeMutablePointer<Float>?, Int, Int) in
            guard let samples = input.samples else { return (nil, input.channels, 0) }
            let pointer = UnsafeMutablePointer<Float>.allocate(capacity: samples.count)
            pointer.initialize(from: samples, count: samples.count)
            return (pointer, input.channels, samples.count / input.channels)
        }
        let outputPointers = outputs.map { output -> (UnsafeMutablePointer<Float>, Int, Int) in
            let pointer = UnsafeMutablePointer<Float>.allocate(capacity: output.frames * output.channels)
            pointer.initialize(repeating: .nan, count: output.frames * output.channels)
            return (pointer, output.channels, output.frames)
        }
        defer {
            inputPointers.forEach { $0.0?.deallocate() }
            outputPointers.forEach { $0.0.deallocate() }
        }
        Mixer.render(
            inputPointers.map { SampleBuffer(samples: $0.0, channels: $0.1, frames: $0.2) },
            into: outputPointers.map { SampleBuffer(samples: $0.0, channels: $0.1, frames: $0.2) },
            gainFrom: start, to: end
        )
        return outputPointers.map { Array(UnsafeBufferPointer(start: $0.0, count: $0.1 * $0.2)) }
    }

    func testInterleavedStereoWithAFixedGain() {
        let out = render(inputs: [([1, -1, 0.5, -0.5], 2)], outputs: [(2, 2)], from: 0.5, to: 0.5)
        XCTAssertEqual(out, [[0.5, -0.5, 0.25, -0.25]])
    }

    func testRampAcrossTheCycle() {
        let out = render(inputs: [([1, 1, 1, 1], 1)], outputs: [(4, 1)], from: 0, to: 1)
        XCTAssertEqual(out, [[0.25, 0.5, 0.75, 1]])
    }

    func testChannelsCountAcrossBuffers() {
        // Two mono buffers (left, right) into one interleaved stereo buffer.
        let out = render(inputs: [([1, 2], 1), ([10, 20], 1)], outputs: [(2, 2)], from: 1, to: 1)
        XCTAssertEqual(out, [[1, 10, 2, 20]])
        // And back.
        let split = render(inputs: [([1, 10, 2, 20], 2)], outputs: [(2, 1), (2, 1)], from: 1, to: 1)
        XCTAssertEqual(split, [[1, 2], [10, 20]])
    }

    func testOutputChannelsWithoutInputAreSilent() {
        let out = render(inputs: [([1, 2, 3, 4], 2)], outputs: [(2, 4)], from: 1, to: 1)
        XCTAssertEqual(out, [[1, 2, 0, 0, 3, 4, 0, 0]])
    }

    func testUnusedInputStreamIsSilent() {
        let out = render(inputs: [(nil, 2)], outputs: [(2, 2)], from: 1, to: 1)
        XCTAssertEqual(out, [[0, 0, 0, 0]])
    }

    func testShortInputLeavesTheTailSilent() {
        let out = render(inputs: [([1, 1], 2)], outputs: [(3, 2)], from: 1, to: 1)
        XCTAssertEqual(out, [[1, 1, 0, 0, 0, 0]])
    }

    func testSmootherMovesTowardTheTarget() {
        var smoother = GainSmoother(gain: 1, timeConstant: 0.01)
        // One time constant (480 frames at 48 kHz) covers 1 − 1/e of the way.
        let first = smoother.advance(toward: 0, frames: 480, sampleRate: 48_000)
        XCTAssertEqual(first.start, 1)
        XCTAssertEqual(first.end, Float(exp(-1.0)), accuracy: 1e-5)
        let second = smoother.advance(toward: 0, frames: 480, sampleRate: 48_000)
        XCTAssertEqual(second.start, first.end)
        for _ in 0..<40 { _ = smoother.advance(toward: 0, frames: 480, sampleRate: 48_000) }
        XCTAssertEqual(smoother.current, 0, "settles exactly on the target")
    }

    func testSmootherWithoutTimeJumps() {
        var smoother = GainSmoother(gain: 1)
        let step = smoother.advance(toward: 0.25, frames: 0, sampleRate: 48_000)
        XCTAssertEqual(step.end, 0.25)
        XCTAssertEqual(smoother.current, 0.25)
    }
}
