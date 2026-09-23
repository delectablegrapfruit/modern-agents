import AudioToolbox
import CoreAudio
import Foundation
import LimiterCore

/// An output device as the app lists it, and the device properties the limiter reads and sets.
struct OutputDevice: Equatable {
    let id: AudioObjectID
    let uid: String
    let name: String
    let transport: UInt32

    /// Every device that can play sound and could be chosen as the system's output. Hidden devices and aggregate
    /// devices — the app's own among them — are left out.
    static func all() -> [OutputDevice] {
        AudioObject.objects(AudioObject.system, AudioObjectPropertyAddress(kAudioHardwarePropertyDevices)).compactMap { id in
            guard AudioObject.streamCount(id, scope: kAudioObjectPropertyScopeOutput) > 0,
                  AudioObject.get(id, AudioObjectPropertyAddress(kAudioDevicePropertyIsHidden), initial: UInt32(0)) != 1,
                  AudioObject.get(id, AudioObjectPropertyAddress(kAudioDevicePropertyDeviceCanBeDefaultDevice, kAudioObjectPropertyScopeOutput),
                                  initial: UInt32(1)) != 0,
                  let uid = AudioObject.string(id, AudioObjectPropertyAddress(kAudioDevicePropertyDeviceUID)),
                  !uid.hasPrefix(DeviceLimiter.uidPrefix)
            else { return nil }
            let transport = AudioObject.get(id, AudioObjectPropertyAddress(kAudioDevicePropertyTransportType), initial: UInt32(0)) ?? 0
            guard transport != UInt32(kAudioDeviceTransportTypeAggregate),
                  transport != UInt32(kAudioDeviceTransportTypeAutoAggregate)
            else { return nil }
            let name = AudioObject.string(id, AudioObjectPropertyAddress(kAudioObjectPropertyName)) ?? uid
            return OutputDevice(id: id, uid: uid, name: name, transport: transport)
        }
    }

    static func defaultOutput() -> AudioObjectID {
        AudioObject.get(AudioObject.system, AudioObjectPropertyAddress(kAudioHardwarePropertyDefaultOutputDevice),
                        initial: AudioObject.unknown) ?? AudioObject.unknown
    }

    /// The system volume, 0…1 — what the Sound menu, Control Center and the volume keys set. Nil when the device has
    /// no volume control (the system greys its slider out).
    static func volume(of id: AudioObjectID) -> Float? {
        let address = AudioObjectPropertyAddress(kAudioHardwareServiceDeviceProperty_VirtualMainVolume, kAudioObjectPropertyScopeOutput)
        guard AudioObject.has(id, address), AudioObject.isSettable(id, address),
              let volume = AudioObject.get(id, address, initial: Float32(0))
        else { return nil }
        return min(max(volume, 0), 1)
    }

    static func setVolume(_ volume: Float, of id: AudioObjectID) {
        let address = AudioObjectPropertyAddress(kAudioHardwareServiceDeviceProperty_VirtualMainVolume, kAudioObjectPropertyScopeOutput)
        AudioObject.set(id, address, Float32(min(max(volume, 0), 1)))
    }

    /// The device's own volume curve, sampled from Core Audio's conversion of volume positions to decibels, on the
    /// main volume control or else the first channel's; the generic curve when the device has neither.
    static func curve(of id: AudioObjectID) -> VolumeCurve {
        for element in [kAudioObjectPropertyElementMain, AudioObjectPropertyElement(1)] {
            var address = AudioObjectPropertyAddress(kAudioDevicePropertyVolumeScalarToDecibels, kAudioObjectPropertyScopeOutput, element)
            guard AudioObjectHasProperty(id, &address) else { continue }
            let curve = VolumeCurve { position in
                var value = Float32(position)
                var size = UInt32(MemoryLayout<Float32>.size)
                guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, &value) == noErr else { return nil }
                return value
            }
            if let curve { return curve }
        }
        return .generic
    }

    /// An SF Symbol for the kind of device.
    var symbol: String {
        if name.localizedCaseInsensitiveContains("headphone") || name.localizedCaseInsensitiveContains("airpods") { return "headphones" }
        switch transport {
        case UInt32(kAudioDeviceTransportTypeBluetooth), UInt32(kAudioDeviceTransportTypeBluetoothLE): return "headphones"
        case UInt32(kAudioDeviceTransportTypeHDMI), UInt32(kAudioDeviceTransportTypeDisplayPort): return "display"
        case UInt32(kAudioDeviceTransportTypeAirPlay): return "airplayaudio"
        case UInt32(kAudioDeviceTransportTypeUSB), UInt32(kAudioDeviceTransportTypeThunderbolt),
             UInt32(kAudioDeviceTransportTypeFireWire), UInt32(kAudioDeviceTransportTypePCI): return "hifispeaker"
        case UInt32(kAudioDeviceTransportTypeVirtual): return "waveform"
        default: return "speaker.wave.2"
        }
    }
}
