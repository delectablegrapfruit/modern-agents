import Carbon.HIToolbox

/// A system-wide shortcut, registered with the Carbon event manager: unlike a global key monitor it needs no
/// accessibility permission, and it only ever sees its own key combination.
final class HotKey {
    private var hotKey: EventHotKeyRef?
    private var handler: EventHandlerRef?
    private let id: UInt32
    private static var actions: [UInt32: () -> Void] = [:]
    private static var nextID: UInt32 = 1

    init?(keyCode: Int, modifiers: Int, action: @escaping () -> Void) {
        id = HotKey.nextID
        HotKey.nextID += 1
        var pressed = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let installed = InstallEventHandler(GetApplicationEventTarget(), { _, event, _ -> OSStatus in
            var key = EventHotKeyID()
            let status = GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                                           nil, MemoryLayout<EventHotKeyID>.size, nil, &key)
            guard status == noErr, let action = HotKey.actions[key.id] else { return OSStatus(eventNotHandledErr) }
            action()
            return noErr
        }, 1, &pressed, nil, &handler)
        guard installed == noErr else { return nil }
        let signature = OSType(0x5741_524C) // 'WARL'
        guard RegisterEventHotKey(UInt32(keyCode), UInt32(modifiers), EventHotKeyID(signature: signature, id: id),
                                  GetApplicationEventTarget(), 0, &hotKey) == noErr else { return nil }
        HotKey.actions[id] = action
    }

    deinit {
        HotKey.actions[id] = nil
        if let hotKey { UnregisterEventHotKey(hotKey) }
        if let handler { RemoveEventHandler(handler) }
    }

    /// ⌃⌥W: show or hide the panel from anywhere.
    static func controlOptionW(_ action: @escaping () -> Void) -> HotKey? {
        HotKey(keyCode: kVK_ANSI_W, modifiers: controlKey | optionKey, action: action)
    }
}
