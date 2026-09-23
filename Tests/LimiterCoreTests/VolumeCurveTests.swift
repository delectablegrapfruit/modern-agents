import XCTest
@testable import LimiterCore

final class VolumeCurveTests: XCTestCase {
    /// A device whose slider is linear in decibels over 64 dB, as many USB and Bluetooth devices report.
    let linear = VolumeCurve(decibels: (0...64).map { Float($0) - 64 })

    func testGenericCurveIsACubicTaper() {
        XCTAssertEqual(VolumeCurve.generic.decibels(at: 1), 0, accuracy: 1e-4)
        XCTAssertEqual(VolumeCurve.generic.decibels(at: 0.5), Float(60 * log10(0.5)), accuracy: 1e-3)
        XCTAssertEqual(VolumeCurve.generic.decibels(at: 0), VolumeCurve.floor)
    }

    func testFullSliderPlaysAsTheCeiling() {
        for curve in [linear, VolumeCurve.generic] {
            for ceiling: Float in [0.25, 0.5, 0.8] {
                let played = curve.decibels(at: 1) + curve.gain(at: 1, ceiling: ceiling)
                XCTAssertEqual(played, curve.decibels(at: ceiling), accuracy: 1e-3)
            }
        }
    }

    func testEveryPositionPlaysAsItsScaledPosition() {
        for position: Float in [0.1, 0.33, 0.5, 0.72, 1] {
            let played = linear.decibels(at: position) + linear.gain(at: position, ceiling: 0.5)
            XCTAssertEqual(played, linear.decibels(at: position * 0.5), accuracy: 1e-3)
        }
    }

    func testSliderBecomesLessSensitive() {
        // On a linear-in-decibels device a 10% slider step is 6.4 dB; under a 50% ceiling it is 3.2 dB.
        func played(_ position: Float) -> Float { linear.decibels(at: position) + linear.gain(at: position, ceiling: 0.5) }
        XCTAssertEqual(linear.decibels(at: 0.6) - linear.decibels(at: 0.5), 6.4, accuracy: 1e-3)
        XCTAssertEqual(played(0.6) - played(0.5), 3.2, accuracy: 1e-3)
    }

    func testCubicTaperGetsAConstantGain() {
        // Scaling the position of a power-law taper is a fixed gain: 60·log10(0.5) ≈ −18 dB at every position.
        for position: Float in [0.25, 0.5, 1] {
            XCTAssertEqual(VolumeCurve.generic.gain(at: position, ceiling: 0.5), Float(60 * log10(0.5)), accuracy: 0.05)
        }
    }

    func testNoCeilingNoGain() {
        XCTAssertEqual(linear.gain(at: 0.7, ceiling: 1), 0)
        XCTAssertEqual(linear.gain(at: 0, ceiling: 0.3), 0)
        XCTAssertEqual(linear.gain(at: .nan, ceiling: 0.3), 0)
    }

    func testGainIsNeverPositive() {
        let bumpy = VolumeCurve(decibels: [-60, -30, -40, -10, -20, 0])
        for step in 0...20 {
            XCTAssertLessThanOrEqual(bumpy.gain(at: Float(step) / 20, ceiling: 0.6), 0)
        }
    }

    func testAttenuation() {
        XCTAssertEqual(linear.attenuation(ceiling: 0.5), -32, accuracy: 1e-3)
        XCTAssertEqual(VolumeCurve.generic.attenuation(ceiling: 0.5), Float(60 * log10(0.5)), accuracy: 1e-3)
        XCTAssertEqual(linear.attenuation(ceiling: 1), 0)
    }

    func testSamplesAreCleaned() {
        let curve = VolumeCurve(decibels: [-.infinity, .nan, -200, -40, -50, 0])
        XCTAssertEqual(curve.decibels, [VolumeCurve.floor, VolumeCurve.floor, VolumeCurve.floor, -40, -40, 0])
        XCTAssertEqual(VolumeCurve(decibels: []).decibels.count, 2)
        XCTAssertEqual(VolumeCurve(decibels: [-6]).decibels, [-6, -6])
    }

    func testSampling() throws {
        let sampled = try XCTUnwrap(VolumeCurve(samples: 65) { position in 64 * position - 64 })
        XCTAssertEqual(sampled, linear)
        XCTAssertNil(VolumeCurve { _ in -12 }, "a control that changes nothing is no volume control")
        XCTAssertNil(VolumeCurve { position in position < 0.5 ? -40 : nil }, "a sample that cannot be read")
    }

    func testAmplitude() {
        XCTAssertEqual(Decibels.amplitude(0), 1)
        XCTAssertEqual(Decibels.amplitude(-20), 0.1, accuracy: 1e-6)
        XCTAssertEqual(Decibels.amplitude(-6.0206), 0.5, accuracy: 1e-4)
        XCTAssertEqual(Decibels.amplitude(VolumeCurve.floor), 0)
    }
}
