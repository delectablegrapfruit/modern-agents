import Carbon

/// One system-wide shortcut (⌥⌘L) that shows and hides Lull from any app. Carbon's hot keys need no
/// accessibility permission.
final class HotKey {
    private static var onPress: (() -> Void)?
    private var hotKeyRef: EventHotKeyRef?
    private var handlerRef: EventHandlerRef?

    init?(keyCode: UInt32, modifiers: UInt32, action: @escaping () -> Void) {
        HotKey.onPress = action
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let installed = InstallEventHandler(GetApplicationEventTarget(), { (_, _, _) -> OSStatus in
            DispatchQueue.main.async { HotKey.onPress?() }
            return OSStatus(noErr)
        }, 1, &spec, nil, &handlerRef)
        guard installed == OSStatus(noErr) else { return nil }
        let id = EventHotKeyID(signature: OSType(0x4C55_4C4C), id: 1) // 'LULL'
        let registered = RegisterEventHotKey(keyCode, modifiers, id, GetApplicationEventTarget(), 0, &hotKeyRef)
        guard registered == OSStatus(noErr) else { return nil }
    }

    deinit {
        if let hotKeyRef { UnregisterEventHotKey(hotKeyRef) }
        if let handlerRef { RemoveEventHandler(handlerRef) }
    }

    static var defaultKeyCode: UInt32 { UInt32(kVK_ANSI_L) }
    static var defaultModifiers: UInt32 { UInt32(cmdKey | optionKey) }
}
