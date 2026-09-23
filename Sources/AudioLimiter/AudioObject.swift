import AudioToolbox
import CoreAudio
import Foundation
import LimiterCore

/// A Core Audio call that did not succeed.
struct AudioFailure: Error, CustomStringConvertible {
    let action: String
    let status: OSStatus

    var description: String { "\(action) failed (\(AudioFailure.code(status)))" }

    /// Core Audio's errors are mostly four-character codes ('!obj', 'nope'); anything else is printed as a number.
    static func code(_ status: OSStatus) -> String {
        let value = UInt32(bitPattern: status)
        let bytes = [24, 16, 8, 0].map { UInt8((value >> UInt32($0)) & 0xFF) }
        guard bytes.allSatisfy({ (0x20...0x7E).contains($0) }) else { return String(status) }
        return "'" + String(decoding: bytes, as: UTF8.self) + "'"
    }
}

/// Something the limiter cannot work with, in words.
struct LimiterFailure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

func check(_ status: OSStatus, _ action: @autoclosure () -> String) throws {
    guard status == noErr else { throw AudioFailure(action: action(), status: status) }
}

extension AudioObjectPropertyAddress {
    init(
        _ selector: AudioObjectPropertySelector,
        _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal,
        _ element: AudioObjectPropertyElement = kAudioObjectPropertyElementMain
    ) {
        self.init(mSelector: selector, mScope: scope, mElement: element)
    }
}

extension SampleBuffer {
    init(_ buffer: AudioBuffer) {
        self.init(data: buffer.mData, channels: Int(buffer.mNumberChannels), byteSize: Int(buffer.mDataByteSize))
    }
}

/// Reading Core Audio objects: the system, devices, streams, taps and processes.
enum AudioObject {
    static let system = AudioObjectID(kAudioObjectSystemObject)
    static let unknown = AudioObjectID(kAudioObjectUnknown)

    static func has(_ object: AudioObjectID, _ address: AudioObjectPropertyAddress) -> Bool {
        var address = address
        return AudioObjectHasProperty(object, &address)
    }

    static func isSettable(_ object: AudioObjectID, _ address: AudioObjectPropertyAddress) -> Bool {
        var address = address
        var settable: DarwinBoolean = false
        return AudioObjectIsPropertySettable(object, &address, &settable) == noErr && settable.boolValue
    }

    /// A fixed-size value: a number, a format, an object.
    static func get<Value>(_ object: AudioObjectID, _ address: AudioObjectPropertyAddress, initial: Value) -> Value? {
        var address = address
        var value = initial
        var size = UInt32(MemoryLayout<Value>.size)
        let status = withUnsafeMutablePointer(to: &value) { AudioObjectGetPropertyData(object, &address, 0, nil, &size, $0) }
        return status == noErr ? value : nil
    }

    @discardableResult
    static func set<Value>(_ object: AudioObjectID, _ address: AudioObjectPropertyAddress, _ value: Value) -> Bool {
        var address = address
        var value = value
        let status = withUnsafePointer(to: &value) { AudioObjectSetPropertyData(object, &address, 0, nil, UInt32(MemoryLayout<Value>.size), $0) }
        return status == noErr
    }

    static func string(_ object: AudioObjectID, _ address: AudioObjectPropertyAddress) -> String? {
        var address = address
        var value: Unmanaged<CFString>?
        var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        guard AudioObjectGetPropertyData(object, &address, 0, nil, &size, &value) == noErr, let value else { return nil }
        return value.takeRetainedValue() as String
    }

    /// A list of objects: devices, streams, processes.
    static func objects(_ object: AudioObjectID, _ address: AudioObjectPropertyAddress) -> [AudioObjectID] {
        var address = address
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(object, &address, 0, nil, &size) == noErr, size > 0 else { return [] }
        var objects = [AudioObjectID](repeating: unknown, count: Int(size) / MemoryLayout<AudioObjectID>.size)
        guard AudioObjectGetPropertyData(object, &address, 0, nil, &size, &objects) == noErr else { return [] }
        return Array(objects.prefix(Int(size) / MemoryLayout<AudioObjectID>.size))
    }

    /// The Core Audio object standing for a process (macOS 14); `unknown` if it has none.
    static func process(pid: pid_t) -> AudioObjectID {
        var address = AudioObjectPropertyAddress(kAudioHardwarePropertyTranslatePIDToProcessObject)
        var pid = pid
        var object = unknown
        var size = UInt32(MemoryLayout<AudioObjectID>.size)
        let status = AudioObjectGetPropertyData(system, &address, UInt32(MemoryLayout<pid_t>.size), &pid, &size, &object)
        return status == noErr ? object : unknown
    }

    static func streamCount(_ device: AudioObjectID, scope: AudioObjectPropertyScope) -> Int {
        objects(device, AudioObjectPropertyAddress(kAudioDevicePropertyStreams, scope)).count
    }
}

/// A property listener that stays registered for as long as it lives. The handler runs on the main queue.
final class PropertyListener {
    private let object: AudioObjectID
    private var address: AudioObjectPropertyAddress
    private let block: AudioObjectPropertyListenerBlock
    private let isRegistered: Bool

    init(_ object: AudioObjectID, _ address: AudioObjectPropertyAddress, handler: @escaping () -> Void) {
        self.object = object
        self.address = address
        let block: AudioObjectPropertyListenerBlock = { _, _ in handler() }
        self.block = block
        var registered = address
        isRegistered = AudioObjectAddPropertyListenerBlock(object, &registered, DispatchQueue.main, block) == noErr
    }

    deinit {
        if isRegistered { AudioObjectRemovePropertyListenerBlock(object, &address, DispatchQueue.main, block) }
    }
}
