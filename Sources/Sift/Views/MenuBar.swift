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
            }
    }
}

struct MenuBarMenu: View {
    @EnvironmentObject private var model: Model

    var body: some View {
        Text(model.statusText)
        Divider()
        Button("Sweep Now") {
            WindowOpener.open()
            model.sweepNow()
        }
        Button(model.isPaused ? "Resume" : "Pause") { model.togglePause() }
        Divider()
        Button("Open Sift…") { WindowOpener.open() }
        if LoginItem.isAvailable {
            Toggle("Launch at Login", isOn: Binding(get: { LoginItem.isEnabled }, set: { try? LoginItem.set($0) }))
        }
        Divider()
        Button("Quit Sift") { NSApp.terminate(nil) }.keyboardShortcut("q")
    }
}
