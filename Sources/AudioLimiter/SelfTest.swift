import AppKit
import LimiterCore
import SwiftUI

/// `LIMITER_SELFTEST=1 "Audio Limiter.app/Contents/MacOS/AudioLimiter"`: lists the output devices with their volume
/// curves, checks the mapping on each curve, lays out the menu, and exits 0 on success. With `LIMITER_SELFTEST_TAP=1`
/// it also builds a limiter (process tap and aggregate device) for the first device, without starting it, and takes
/// it down again. Used by CI; prints one line per step.
@MainActor
enum SelfTest {
    nonisolated static var isRequested: Bool { ProcessInfo.processInfo.environment["LIMITER_SELFTEST"] != nil }

    static func start(model: LimiterModel) {
        log("starting Audio Limiter")
        do {
            try run(model: model)
            log("passed")
            exit(0)
        } catch {
            fail("\(error)")
        }
    }

    private static func run(model: LimiterModel) throws {
        log("\(model.devices.count) output device(s)")
        for device in model.devices {
            let volume = device.volume.map { "volume \(Int(($0 * 100).rounded()))%" } ?? "no volume control"
            let curve = device.curve
            log("\(device.name) [\(device.id)] \(volume), curve \(curve.decibels[0]) … \(curve.decibels[curve.decibels.count - 1]) dB, "
                + "50% ceiling = \(curve.attenuation(ceiling: 0.5)) dB")
            try checkMapping(on: curve, name: device.name)
        }
        try checkMapping(on: .generic, name: "the generic curve")

        let host = NSHostingView(rootView: MenuView().environment(model))
        host.frame = NSRect(x: 0, y: 0, width: 320, height: 600)
        host.layoutSubtreeIfNeeded()
        let size = host.fittingSize
        log("menu lays out at \(Int(size.width))×\(Int(size.height))")
        guard size.width >= 300, size.height >= 80 else { throw Failure("the menu has no content") }

        if ProcessInfo.processInfo.environment["LIMITER_SELFTEST_TAP"] != nil {
            guard let device = model.devices.first else {
                log("no output device to build a limiter for")
                return
            }
            let ownProcess = AudioObject.process(pid: getpid())
            log("own process object \(ownProcess)")
            let limiter = try DeviceLimiter(deviceID: device.objectID, uid: device.id, name: device.name, ignoring: ownProcess, gain: 0.5)
            log("built a tap and an aggregate device for \(device.name)")
            limiter.invalidate()
            guard !OutputDevice.all().contains(where: { $0.uid.hasPrefix(DeviceLimiter.uidPrefix) }) else {
                throw Failure("the aggregate device outlived the limiter")
            }
            log("took them down")
        }
    }

    /// A 50% ceiling makes every slider position play as loud as half that position did.
    private static func checkMapping(on curve: VolumeCurve, name: String) throws {
        for position: Float in [0.2, 0.5, 0.9, 1] {
            let played = curve.decibels(at: position) + curve.gain(at: position, ceiling: 0.5)
            let expected = max(curve.decibels(at: position / 2), curve.decibels(at: position) + VolumeCurve.floor)
            guard abs(played - expected) < 0.01 else {
                throw Failure("on \(name), \(position) plays at \(played) dB instead of \(expected) dB")
            }
        }
    }

    struct Failure: Error, CustomStringConvertible {
        let description: String
        init(_ description: String) { self.description = description }
    }

    nonisolated private static func log(_ message: String) {
        print("SELFTEST: " + message)
        fflush(stdout)
    }

    nonisolated private static func fail(_ message: String) -> Never {
        FileHandle.standardError.write(Data(("SELFTEST FAIL: " + message + "\n").utf8))
        exit(1)
    }
}
