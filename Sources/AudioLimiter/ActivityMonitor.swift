import AudioToolbox
import CoreAudio
import Foundation

/// Which output devices other apps are playing to right now. Core Audio lists every process that uses audio
/// (macOS 14), and each reports whether its output is running and which devices it is using; the monitor listens to
/// all of it and calls `onChange` whenever any of it changes.
final class ActivityMonitor {
    var onChange: () -> Void = {}

    private let ownProcess: AudioObjectID
    private var listListener: PropertyListener?
    private var processListeners: [AudioObjectID: [PropertyListener]] = [:]

    init(ignoring ownProcess: AudioObjectID) {
        self.ownProcess = ownProcess
    }

    func start() {
        guard listListener == nil else { return }
        listListener = PropertyListener(AudioObject.system, AudioObjectPropertyAddress(kAudioHardwarePropertyProcessObjectList)) { [weak self] in
            self?.refresh()
        }
        refresh()
    }

    func stop() {
        listListener = nil
        processListeners.removeAll()
    }

    /// The devices some other process is sending sound to.
    func busyDevices() -> Set<AudioObjectID> {
        var busy = Set<AudioObjectID>()
        for process in processListeners.keys
        where AudioObject.get(process, AudioObjectPropertyAddress(kAudioProcessPropertyIsRunningOutput), initial: UInt32(0)) == 1 {
            let output = AudioObject.objects(process, AudioObjectPropertyAddress(kAudioProcessPropertyDevices, kAudioObjectPropertyScopeOutput))
            busy.formUnion(output.isEmpty ? AudioObject.objects(process, AudioObjectPropertyAddress(kAudioProcessPropertyDevices)) : output)
        }
        return busy
    }

    private func refresh() {
        let processes = Set(AudioObject.objects(AudioObject.system, AudioObjectPropertyAddress(kAudioHardwarePropertyProcessObjectList)))
            .subtracting([ownProcess])
        processListeners = processListeners.filter { processes.contains($0.key) }
        for process in processes where processListeners[process] == nil {
            let changed: () -> Void = { [weak self] in self?.onChange() }
            processListeners[process] = [
                PropertyListener(process, AudioObjectPropertyAddress(kAudioProcessPropertyIsRunningOutput), handler: changed),
                PropertyListener(process, AudioObjectPropertyAddress(kAudioProcessPropertyDevices, kAudioObjectPropertyScopeOutput), handler: changed),
            ]
        }
        onChange()
    }
}
