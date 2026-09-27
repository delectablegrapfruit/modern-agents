import AppKit
import Carbon.HIToolbox

/// A system-wide shortcut (Carbon's hot keys need no accessibility permission). The action runs on the main thread.
final class HotKey {
    private var reference: EventHotKeyRef?
    private var handler: EventHandlerRef?
    private let action: () -> Void

    /// Nil when the shortcut cannot be had: most often, another app holds it for itself.
    init?(keyCode: Int, modifiers: Int, action: @escaping () -> Void) {
        self.action = action
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let context = Unmanaged.passUnretained(self).toOpaque()
        let installed = InstallEventHandler(GetApplicationEventTarget(), { _, _, context in
            guard let context else { return OSStatus(eventNotHandledErr) }
            Unmanaged<HotKey>.fromOpaque(context).takeUnretainedValue().action()
            return noErr
        }, 1, &spec, context, &handler)
        guard installed == noErr else {
            handler = nil
            return nil
        }
        let id = EventHotKeyID(signature: OSType(0x524F_4E4E), id: 1) // 'RONN'
        let registered = RegisterEventHotKey(UInt32(keyCode), UInt32(modifiers), id, GetApplicationEventTarget(), 0, &reference)
        guard registered == noErr else {
            // A failed init still runs deinit, which removes the handler: it must not be removed twice.
            reference = nil
            NSLog("Ronin: the shortcut could not be registered (status %ld)", Int(registered))
            return nil
        }
    }

    deinit {
        if let reference { UnregisterEventHotKey(reference) }
        if let handler { RemoveEventHandler(handler) }
    }
}

/// A shortcut that shows and hides the panel: the key and modifiers in Carbon's terms, to register it, and in
/// AppKit's, to show it in the menu.
struct Shortcut {
    let keyCode: Int
    let carbonModifiers: Int
    let key: String
    let modifiers: NSEvent.ModifierFlags
    let title: String

    /// The ones on offer, the default first. If the one chosen is taken, the next free one is used.
    static let all = [
        Shortcut(keyCode: kVK_ANSI_R, carbonModifiers: controlKey | optionKey, key: "r", modifiers: [.control, .option], title: "⌃⌥R"),
        Shortcut(keyCode: kVK_ANSI_R, carbonModifiers: controlKey | optionKey | cmdKey, key: "r",
                 modifiers: [.control, .option, .command], title: "⌃⌥⌘R"),
        Shortcut(keyCode: kVK_ANSI_R, carbonModifiers: controlKey | shiftKey, key: "r", modifiers: [.control, .shift], title: "⌃⇧R"),
    ]
}
