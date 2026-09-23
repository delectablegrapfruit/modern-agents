import AppKit
import AudioToolbox
import CoreAudio
import LimiterCore
import Observation
import ServiceManagement

/// The app's state: the output devices, the ceiling set for each, and the limiters that apply them.
///
/// Core Audio notifications are delivered on the main queue, so all of this runs on the main actor.
@MainActor
@Observable
final class LimiterModel {
    enum Status: Equatable {
        /// No limit: the ceiling is 100%, or the app is switched off.
        case off
        /// A limit is set, but macOS has not allowed the app to capture audio.
        case needsPermission
        /// Armed: the limiter starts the moment an app plays to the device.
        case ready
        case limiting
        case failed(String)
    }

    struct Device: Identifiable, Equatable {
        /// The Core Audio UID, the same from one launch to the next.
        let id: String
        let objectID: AudioObjectID
        let name: String
        let symbol: String
        var isDefault: Bool
        /// The system volume, 0…1; nil when the device has no volume control.
        var volume: Float?
        var ceiling: Float
        var curve: VolumeCurve
        var status: Status = .off

        var isLimited: Bool { ceiling < 1 }
    }

    /// How long a limiter keeps running after the last app stops playing to its device.
    static let idleDelay: TimeInterval = 20

    private(set) var devices: [Device] = []
    private(set) var permission: CapturePermission
    private(set) var isEnabled: Bool
    private(set) var launchAtLogin: Bool

    @ObservationIgnored private var settings: LimiterSettings
    private let store: SettingsStore
    @ObservationIgnored private var isStarted = false
    @ObservationIgnored private var ownProcess = AudioObject.unknown
    @ObservationIgnored private var limiters: [String: DeviceLimiter] = [:]
    @ObservationIgnored private var failures: [String: String] = [:]
    @ObservationIgnored private var monitor: ActivityMonitor?
    @ObservationIgnored private var pendingStops: [String: DispatchWorkItem] = [:]
    @ObservationIgnored private var systemListeners: [PropertyListener] = []
    @ObservationIgnored private var deviceListeners: [String: (objectID: AudioObjectID, listeners: [PropertyListener])] = [:]
    @ObservationIgnored private var observers: [NSObjectProtocol] = []
    @ObservationIgnored private var permissionTimer: Timer?
    @ObservationIgnored private var pendingSave: DispatchWorkItem?
    @ObservationIgnored private var isRequestingPermission = false

    init(store: SettingsStore = SettingsStore()) {
        let settings = store.load()
        self.store = store
        self.settings = settings
        isEnabled = settings.isEnabled
        permission = AudioCaptureAccess.status()
        launchAtLogin = SMAppService.mainApp.status == .enabled
        refreshDevices()
    }

    // MARK: What the menu shows

    var needsPermission: Bool {
        isEnabled && !permission.allowsCapture && devices.contains(where: \.isLimited)
    }

    var menuBarSymbol: String {
        let attention = devices.contains { device in
            if case .failed = device.status { return true }
            return device.status == .needsPermission
        }
        if attention { return "exclamationmark.triangle" }
        return devices.contains { $0.status == .ready || $0.status == .limiting } ? "speaker.wave.1" : "speaker"
    }

    // MARK: What the menu does

    /// Starts watching the devices and limiting them. Called once the app has finished launching.
    func start() {
        guard !isStarted else { return }
        isStarted = true
        ownProcess = AudioObject.process(pid: getpid())
        systemListeners = [
            PropertyListener(AudioObject.system, AudioObjectPropertyAddress(kAudioHardwarePropertyDevices)) { [weak self] in
                MainActor.assumeIsolated { self?.devicesChanged() }
            },
            PropertyListener(AudioObject.system, AudioObjectPropertyAddress(kAudioHardwarePropertyDefaultOutputDevice)) { [weak self] in
                MainActor.assumeIsolated { self?.defaultDeviceChanged() }
            },
            PropertyListener(AudioObject.system, AudioObjectPropertyAddress(kAudioHardwarePropertyServiceRestarted)) { [weak self] in
                MainActor.assumeIsolated { self?.rebuildAll() }
            },
        ]
        observers.append(NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.rebuildAll() }
        })
        // Permission changes in System Settings send no notification.
        permissionTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.checkPermission() }
        }
        refreshDevices()
        reconcile(compensating: true)
    }

    /// Stops limiting before the app quits, lowering each limited device's system volume so that it plays exactly as
    /// loud without the limiter as it did with it.
    func shutdown() {
        guard isStarted else { return }
        for (uid, limiter) in limiters {
            if let device = devices.first(where: { $0.id == uid }), let volume = device.volume {
                OutputDevice.setVolume(volume * device.ceiling, of: device.objectID)
            }
            limiter.invalidate()
        }
        limiters.removeAll()
        pendingStops.values.forEach { $0.cancel() }
        pendingStops.removeAll()
        monitor?.stop()
        monitor = nil
        saveNow()
    }

    func setEnabled(_ enabled: Bool) {
        guard enabled != isEnabled else { return }
        isEnabled = enabled
        settings.isEnabled = enabled
        failures.removeAll()
        scheduleSave()
        reconcile(compensating: true)
        updateStatuses()
    }

    func setCeiling(_ value: Float, for uid: String) {
        let ceiling = LimiterSettings.clamp(value)
        guard let index = devices.firstIndex(where: { $0.id == uid }), devices[index].ceiling != ceiling else { return }
        devices[index].ceiling = ceiling
        settings.setCeiling(ceiling, uid: uid, name: devices[index].name)
        failures[uid] = nil
        limiters[uid]?.setGain(gain(for: devices[index]))
        scheduleSave()
        reconcile()
        updateStatuses()
    }

    func requestPermission() {
        guard !isRequestingPermission else { return }
        isRequestingPermission = true
        AudioCaptureAccess.request { [weak self] granted in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.isRequestingPermission = false
                let status = AudioCaptureAccess.status()
                self.permission = status == .undetermined ? (granted ? .authorized : .denied) : status
                self.reconcile(compensating: true)
                self.updateStatuses()
            }
        }
    }

    func checkPermission() {
        guard !isRequestingPermission else { return }
        let status = AudioCaptureAccess.status()
        guard status != permission else { return }
        permission = status
        reconcile(compensating: true)
        updateStatuses()
    }

    func openPrivacySettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") {
            NSWorkspace.shared.open(url)
        }
    }

    func setLaunchAtLogin(_ launch: Bool) {
        do {
            if launch { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {
            NSLog("Audio Limiter: could not change the login item: \(error)")
        }
        launchAtLogin = SMAppService.mainApp.status == .enabled
    }

    // MARK: Devices

    private func refreshDevices() {
        let found = OutputDevice.all()
        let defaultID = OutputDevice.defaultOutput()
        let connected = Set(found.map(\.uid))
        let remembered = settings
        var list: [Device] = []
        for device in found {
            let previous = devices.first { $0.id == device.uid && $0.objectID == device.id }
            list.append(Device(
                id: device.uid, objectID: device.id, name: device.name, symbol: device.symbol,
                isDefault: device.id == defaultID,
                volume: OutputDevice.volume(of: device.id),
                ceiling: settings.ceiling(uid: device.uid, name: device.name, connected: connected),
                curve: previous?.curve ?? OutputDevice.curve(of: device.id),
                status: previous?.status ?? .off
            ))
        }
        if settings != remembered { scheduleSave() }
        devices = list.sorted(by: LimiterModel.menuOrder)

        guard isStarted else { return }
        deviceListeners = deviceListeners.filter { entry in list.contains { $0.id == entry.key && $0.objectID == entry.value.objectID } }
        for device in list where deviceListeners[device.id] == nil {
            deviceListeners[device.id] = (device.objectID, listeners(for: device))
        }
    }

    /// The default output first, then by name.
    nonisolated private static func menuOrder(_ a: Device, _ b: Device) -> Bool {
        if a.isDefault != b.isDefault { return a.isDefault }
        return a.name.localizedStandardCompare(b.name) == .orderedAscending
    }

    private func listeners(for device: Device) -> [PropertyListener] {
        let uid = device.id, id = device.objectID
        let volume: () -> Void = { [weak self] in MainActor.assumeIsolated { self?.volumeChanged(uid) } }
        let format: () -> Void = { [weak self] in MainActor.assumeIsolated { self?.formatChanged(uid) } }
        var listeners = [
            PropertyListener(id, AudioObjectPropertyAddress(kAudioHardwareServiceDeviceProperty_VirtualMainVolume, kAudioObjectPropertyScopeOutput), handler: volume),
            PropertyListener(id, AudioObjectPropertyAddress(kAudioDevicePropertyNominalSampleRate), handler: format),
            PropertyListener(id, AudioObjectPropertyAddress(kAudioDevicePropertyStreams, kAudioObjectPropertyScopeOutput), handler: format),
        ]
        // The volume controls themselves too, in case a device reports changes there only.
        for element in [kAudioObjectPropertyElementMain, AudioObjectPropertyElement(1), AudioObjectPropertyElement(2)] {
            let address = AudioObjectPropertyAddress(kAudioDevicePropertyVolumeScalar, kAudioObjectPropertyScopeOutput, element)
            if AudioObject.has(id, address) { listeners.append(PropertyListener(id, address, handler: volume)) }
        }
        return listeners
    }

    private func devicesChanged() {
        failures.removeAll()
        refreshDevices()
        reconcile()
        updateStatuses()
    }

    private func defaultDeviceChanged() {
        let defaultID = OutputDevice.defaultOutput()
        var list = devices
        for index in list.indices { list[index].isDefault = list[index].objectID == defaultID }
        list.sort(by: LimiterModel.menuOrder)
        if list != devices { devices = list }
    }

    private func volumeChanged(_ uid: String) {
        guard let index = devices.firstIndex(where: { $0.id == uid }) else { return }
        let volume = OutputDevice.volume(of: devices[index].objectID)
        if devices[index].volume != volume { devices[index].volume = volume }
        limiters[uid]?.setGain(gain(for: devices[index]))
    }

    /// A new sample rate or stream layout: a fresh limiter is built while the old one still mutes the device, then
    /// the old one goes.
    private func formatChanged(_ uid: String) {
        guard let old = limiters.removeValue(forKey: uid) else { return }
        pendingStops.removeValue(forKey: uid)?.cancel()
        reconcile()
        old.invalidate()
        evaluateActivity()
    }

    /// Core Audio restarted, or the Mac woke: every tap and aggregate device is built again.
    private func rebuildAll() {
        for limiter in limiters.values { limiter.invalidate() }
        limiters.removeAll()
        pendingStops.values.forEach { $0.cancel() }
        pendingStops.removeAll()
        monitor?.stop()
        monitor = nil
        failures.removeAll()
        deviceListeners.removeAll()
        ownProcess = AudioObject.process(pid: getpid())
        refreshDevices()
        reconcile()
        updateStatuses()
    }

    // MARK: Limiting

    /// The amplitude factor that makes the device at its current system volume play as loud as it would at that
    /// volume times the ceiling.
    private func gain(for device: Device) -> Float {
        Decibels.amplitude(device.curve.gain(at: device.volume ?? 1, ceiling: device.ceiling))
    }

    /// Brings the limiters in line with the settings: one for every connected device with a ceiling below 100%,
    /// while the app is on and allowed to capture audio.
    ///
    /// `compensating` is for the app itself starting or stopping to limit (launch, the switch, the permission,
    /// quitting), not for a ceiling being moved: the system volume is then raised (or lowered) by the ceiling so that
    /// nothing gets louder or quieter at that moment — only what the slider means changes.
    private func reconcile(compensating: Bool = false) {
        guard isStarted else { return }
        if isEnabled, permission == .undetermined, devices.contains(where: \.isLimited) { requestPermission() }
        let allowed = isEnabled && permission.allowsCapture

        for (uid, limiter) in limiters where !devices.contains(where: { $0.id == uid && $0.objectID == limiter.deviceID }) {
            limiters[uid] = nil
            pendingStops.removeValue(forKey: uid)?.cancel()
            limiter.invalidate()
        }
        for index in devices.indices {
            let device = devices[index]
            let wanted = allowed && device.isLimited && failures[device.id] == nil
            if wanted, limiters[device.id] == nil {
                var raised = device
                if compensating, let volume = device.volume { raised.volume = min(1, volume / device.ceiling) }
                do {
                    limiters[device.id] = try DeviceLimiter(
                        deviceID: device.objectID, uid: device.id, name: device.name, ignoring: ownProcess, gain: gain(for: raised)
                    )
                    if let volume = raised.volume, volume != device.volume {
                        OutputDevice.setVolume(volume, of: device.objectID)
                        devices[index].volume = volume
                    }
                } catch {
                    failures[device.id] = "\(error)"
                }
            } else if !wanted, let limiter = limiters.removeValue(forKey: device.id) {
                pendingStops.removeValue(forKey: device.id)?.cancel()
                if compensating, let volume = device.volume {
                    OutputDevice.setVolume(volume * device.ceiling, of: device.objectID)
                    devices[index].volume = volume * device.ceiling
                }
                limiter.invalidate()
            }
        }

        if limiters.isEmpty {
            monitor?.stop()
            monitor = nil
        } else if monitor == nil {
            let monitor = ActivityMonitor(ignoring: ownProcess)
            monitor.onChange = { [weak self] in MainActor.assumeIsolated { self?.evaluateActivity() } }
            self.monitor = monitor
            monitor.start()
        }
        evaluateActivity()
    }

    /// Runs the limiters of the devices other apps are playing to, and stops the others once they have been idle
    /// for `idleDelay`.
    private func evaluateActivity() {
        let busy = monitor?.busyDevices() ?? []
        for (uid, limiter) in limiters {
            if busy.contains(limiter.deviceID) {
                pendingStops.removeValue(forKey: uid)?.cancel()
                do { try limiter.start() } catch { fail(uid, error) }
            } else if limiter.isRunning, pendingStops[uid] == nil {
                let stop = DispatchWorkItem { [weak self] in MainActor.assumeIsolated { self?.stopIfIdle(uid) } }
                pendingStops[uid] = stop
                DispatchQueue.main.asyncAfter(deadline: .now() + LimiterModel.idleDelay, execute: stop)
            }
        }
        updateStatuses()
    }

    private func stopIfIdle(_ uid: String) {
        pendingStops[uid] = nil
        guard let limiter = limiters[uid], !(monitor?.busyDevices() ?? []).contains(limiter.deviceID) else { return }
        limiter.stop()
        updateStatuses()
    }

    /// A limiter that cannot run is taken down, and the system volume lowered so the device does not jump in
    /// loudness when its tap lets go.
    private func fail(_ uid: String, _ error: Error) {
        failures[uid] = "\(error)"
        pendingStops.removeValue(forKey: uid)?.cancel()
        if let limiter = limiters.removeValue(forKey: uid) {
            if let device = devices.first(where: { $0.id == uid }), let volume = device.volume {
                OutputDevice.setVolume(volume * device.ceiling, of: device.objectID)
            }
            limiter.invalidate()
        }
        updateStatuses()
    }

    private func updateStatuses() {
        for index in devices.indices {
            let device = devices[index]
            let status: Status
            if let failure = failures[device.id] {
                status = .failed(failure)
            } else if !isEnabled || !device.isLimited {
                status = .off
            } else if let limiter = limiters[device.id] {
                status = limiter.isRunning ? .limiting : .ready
            } else if !permission.allowsCapture {
                status = .needsPermission
            } else {
                status = .off
            }
            if device.status != status { devices[index].status = status }
        }
    }

    // MARK: Saving

    private func scheduleSave() {
        pendingSave?.cancel()
        let save = DispatchWorkItem { [weak self] in MainActor.assumeIsolated { self?.saveNow() } }
        pendingSave = save
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: save)
    }

    private func saveNow() {
        pendingSave?.cancel()
        pendingSave = nil
        do {
            try store.save(settings)
        } catch {
            NSLog("Audio Limiter: could not save the settings: \(error)")
        }
    }
}
