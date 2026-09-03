import AppKit
import SwiftUI

struct MenuBarLabel: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Image(systemName: model.isWatching ? "wind" : "pause")
            .onAppear {
                WindowOpener.open = {
                    NSApp.activate(ignoringOtherApps: true)
                    openWindow(id: "main")
                }
            }
    }
}

struct MenuBarView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Text(model.statusText)
        Divider()
        Button("Sweep Now") {
            WindowOpener.open()
            model.sweepEverything()
        }
        Button(model.isWatching ? "Pause" : "Resume") { model.toggleWatching() }
        Divider()
        Button("Open Winnow…") { WindowOpener.open() }
        Divider()
        Button("Quit Winnow") { NSApp.terminate(nil) }
            .keyboardShortcut("q")
    }
}
