import AppKit
import SwiftUI

struct MenuBarLabel: View {
    @EnvironmentObject private var model: Model
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Image(systemName: model.isPaused ? "pause" : "line.3.horizontal.decrease")
            .onAppear {
                WindowOpener.open = {
                    NSApp.activate(ignoringOtherApps: true)
                    openWindow(id: "main")
                }
                model.openWindowIfWanted()
            }
    }
}

/// The menu bar item is the app's one persistent handle: its state, the way to
/// stop it for a while, its window, and quitting. Everything else is in the window.
struct MenuBarMenu: View {
    @EnvironmentObject private var model: Model

    var body: some View {
        Text(model.statusText)
        Divider()
        Button(model.isPaused ? "Resume" : "Pause") { model.togglePause() }
        Button("Open Sift") { WindowOpener.open() }
        Divider()
        Button("Quit Sift") { NSApp.terminate(nil) }.keyboardShortcut("q")
    }
}
