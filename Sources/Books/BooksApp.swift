import AppKit
import SwiftUI
import BooksCore

@main
struct BooksApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var model: LibraryModel

    init() {
        // The self-test works in a scratch library so it never touches the person's books.
        let store = ProcessInfo.processInfo.environment["BOOKS_SELFTEST"] != nil
            ? LibraryStore(directory: FileManager.default.temporaryDirectory.appendingPathComponent("Books Self-Test " + UUID().uuidString, isDirectory: true))
            : LibraryStore()
        let model = LibraryModel(store: store)
        _model = State(initialValue: model)
        AppDelegate.model = model
    }

    var body: some Scene {
        // One window, as Books has: the library, and the book you are reading in its place.
        Window("Books", id: "main") {
            RootView()
                .environment(model)
                .frame(minWidth: 760, minHeight: 480)
        }
        .defaultSize(width: 1180, height: 780)
        .commands { BooksCommands(model: model) }

        Settings {
            SettingsView().environment(model)
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    static var model: LibraryModel?

    func applicationDidFinishLaunching(_ notification: Notification) {
        signal(SIGPIPE, SIG_IGN)
        if ProcessInfo.processInfo.environment["BOOKS_SELFTEST"] != nil, let model = AppDelegate.model {
            SelfTest.start(model: model)
        }
    }

    /// Files opened from the Finder, or dropped on the Dock icon.
    func application(_ application: NSApplication, open urls: [URL]) {
        AppDelegate.model?.importFiles(urls)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { NSApp.windows.first { $0.identifier?.rawValue.contains("main") == true || $0.title == "Books" }?.makeKeyAndOrderFront(nil) }
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        AppDelegate.model?.flush()
    }
}
