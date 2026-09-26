import AppKit

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
// No Dock icon and no menu bar: the game lives in its window and in the menu bar item.
app.setActivationPolicy(.accessory)
app.run()
