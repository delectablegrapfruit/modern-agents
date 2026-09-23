import AudioToolbox
import CoreAudio
import Foundation
import LimiterCore

/// Lowers one output device. A Core Audio process tap takes the sound every other process sends to the device and
/// mutes it there; an aggregate device made of the device and the tap plays that sound back into the device through
/// a gain. The system volume keeps acting on the device itself, on top of the gain.
///
/// The tap mutes the device from the moment it exists, and the aggregate device runs only while something plays
/// (`start`, `stop`), so an idle device costs nothing and keeps no one awake. Should starting lag the first sound
/// by a few milliseconds, that sound begins muted rather than loud.
final class DeviceLimiter {
    static let uidPrefix = "org.modernagents.AudioLimiter.aggregate."

    let deviceID: AudioObjectID
    let uid: String
    let name: String
    private(set) var isRunning = false

    private var tap = AudioObject.unknown
    private var aggregate = AudioObject.unknown
    private var procID: AudioDeviceIOProcID?
    /// The gain the audio thread moves toward, and where it is: plain memory, so the IO block reads them without
    /// touching a reference count. A Float store is a single aligned write, which the audio thread reads whole.
    private let target = UnsafeMutablePointer<Float>.allocate(capacity: 1)
    private let smoother = UnsafeMutablePointer<GainSmoother>.allocate(capacity: 1)

    init(deviceID: AudioObjectID, uid: String, name: String, ignoring ownProcess: AudioObjectID, gain: Float) throws {
        self.deviceID = deviceID
        self.uid = uid
        self.name = name
        target.initialize(to: gain)
        smoother.initialize(to: GainSmoother(gain: gain))
        do {
            try build(ignoring: ownProcess)
        } catch {
            invalidate()
            throw error
        }
    }

    deinit {
        invalidate()
        target.deallocate()
        smoother.deallocate()
    }

    /// The amplitude factor to play at; the audio thread glides to it over a few tens of milliseconds.
    func setGain(_ gain: Float) {
        target.pointee = gain
    }

    func start() throws {
        guard !isRunning, let procID else { return }
        try check(AudioDeviceStart(aggregate, procID), "Starting the limiter on \(name)")
        isRunning = true
    }

    func stop() {
        guard isRunning, let procID else { return }
        AudioDeviceStop(aggregate, procID)
        isRunning = false
    }

    /// Takes everything down; the device plays the other apps' sound directly again.
    func invalidate() {
        if let procID {
            if isRunning { AudioDeviceStop(aggregate, procID) }
            AudioDeviceDestroyIOProcID(aggregate, procID)
            self.procID = nil
        }
        isRunning = false
        if aggregate != AudioObject.unknown {
            AudioHardwareDestroyAggregateDevice(aggregate)
            aggregate = AudioObject.unknown
        }
        if tap != AudioObject.unknown {
            AudioHardwareDestroyProcessTap(tap)
            tap = AudioObject.unknown
        }
    }

    private func build(ignoring ownProcess: AudioObjectID) throws {
        // Without its own process left out, the tap would take in the limiter's output and mute it.
        guard ownProcess != AudioObject.unknown else { throw LimiterFailure("Audio Limiter is missing from Core Audio's process list") }

        // Every process but this one, on the device's first output stream, in the stream's own channel layout.
        let description = CATapDescription(excludingProcesses: [NSNumber(value: ownProcess)], deviceUID: uid, stream: 0)
        description.name = "Audio Limiter: \(name)"
        description.uuid = UUID()
        description.isPrivate = true
        description.muteBehavior = .muted
        try check(AudioHardwareCreateProcessTap(description, &tap), "Creating the audio tap for \(name)")

        guard let format = AudioObject.get(tap, AudioObjectPropertyAddress(kAudioTapPropertyFormat), initial: AudioStreamBasicDescription()),
              format.mFormatID == kAudioFormatLinearPCM,
              format.mFormatFlags & kAudioFormatFlagIsFloat != 0,
              format.mBitsPerChannel == 32
        else { throw LimiterFailure("The audio tap for \(name) does not deliver 32-bit float samples") }
        let tapBuffers = format.mFormatFlags & kAudioFormatFlagIsNonInterleaved != 0 ? Int(format.mChannelsPerFrame) : 1

        let composition: [String: Any] = [
            kAudioAggregateDeviceNameKey: "Audio Limiter: \(name)",
            kAudioAggregateDeviceUIDKey: DeviceLimiter.uidPrefix + UUID().uuidString,
            kAudioAggregateDeviceMainSubDeviceKey: uid,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceIsStackedKey: false,
            kAudioAggregateDeviceTapAutoStartKey: true,
            kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: uid]],
            kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: description.uuid.uuidString, kAudioSubTapDriftCompensationKey: true]],
        ]
        try check(AudioHardwareCreateAggregateDevice(composition as CFDictionary, &aggregate), "Creating the aggregate device for \(name)")

        let sampleRate = AudioObject.get(aggregate, AudioObjectPropertyAddress(kAudioDevicePropertyNominalSampleRate), initial: Float64(0))
            .flatMap { $0 > 0 ? $0 : nil } ?? 48_000
        let target = self.target, smoother = self.smoother
        // The aggregate device's input is the device's own input streams, if it has any, then the tap's.
        let block: AudioDeviceIOBlock = { _, input, _, output, _ in
            let inputs = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input))
            let outputs = UnsafeMutableAudioBufferListPointer(output)
            guard let first = outputs.first else { return }
            let ramp = smoother.pointee.advance(toward: target.pointee, frames: SampleBuffer(first).frames, sampleRate: sampleRate)
            Mixer.render(
                inputs.suffix(tapBuffers).lazy.map { SampleBuffer($0) },
                into: outputs.lazy.map { SampleBuffer($0) },
                gainFrom: ramp.start, to: ramp.end
            )
        }
        var procID: AudioDeviceIOProcID?
        try check(AudioDeviceCreateIOProcIDWithBlock(&procID, aggregate, nil, block), "Creating the audio callback for \(name)")
        self.procID = procID

        // A device with inputs of its own (an audio interface, a headset) brings them into the aggregate device.
        // The callback declares it does not use them, so they are not recorded.
        let deviceInputs = AudioObject.streamCount(deviceID, scope: kAudioObjectPropertyScopeInput)
        if deviceInputs > 0, let procID {
            useOnlyLastInputs(total: AudioObject.streamCount(aggregate, scope: kAudioObjectPropertyScopeInput), skipping: deviceInputs, procID: procID)
        }
    }

    /// Marks the first `skipping` input streams of the aggregate device unused by the callback.
    private func useOnlyLastInputs(total: Int, skipping: Int, procID: AudioDeviceIOProcID) {
        guard total > skipping else { return }
        // AudioHardwareIOProcStreamUsage ends in a variable-length array: the callback, a count, a flag per stream.
        typealias Usage = AudioHardwareIOProcStreamUsage
        let procOffset = MemoryLayout<Usage>.offset(of: \Usage.mIOProc) ?? 0
        let countOffset = MemoryLayout<Usage>.offset(of: \Usage.mNumberStreams) ?? MemoryLayout<UnsafeMutableRawPointer>.size
        let flagsOffset = MemoryLayout<Usage>.offset(of: \Usage.mStreamIsOn) ?? countOffset + MemoryLayout<UInt32>.size
        let size = max(flagsOffset + total * MemoryLayout<UInt32>.stride, MemoryLayout<Usage>.size)
        let raw = UnsafeMutableRawPointer.allocate(byteCount: size, alignment: MemoryLayout<Usage>.alignment)
        defer { raw.deallocate() }
        raw.initializeMemory(as: UInt8.self, repeating: 0, count: size)
        raw.storeBytes(of: unsafeBitCast(procID, to: UnsafeMutableRawPointer.self), toByteOffset: procOffset, as: UnsafeMutableRawPointer.self)
        raw.storeBytes(of: UInt32(total), toByteOffset: countOffset, as: UInt32.self)
        for stream in 0..<total {
            raw.storeBytes(of: stream < skipping ? 0 : 1, toByteOffset: flagsOffset + stream * MemoryLayout<UInt32>.stride, as: UInt32.self)
        }
        var address = AudioObjectPropertyAddress(kAudioDevicePropertyIOProcStreamUsage, kAudioObjectPropertyScopeInput)
        AudioObjectSetPropertyData(aggregate, &address, 0, nil, UInt32(size), raw)
    }
}
