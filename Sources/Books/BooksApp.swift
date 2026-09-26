import AppKit
import SwiftUI
import BooksCore

@main
struct BooksApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var model: LibraryModel

    init() {
        // The self-test and the showcase work in a scratch library, so they never touch the person's books.
        let scratch: String? = ProcessInfo.processInfo.environment["BOOKS_SELFTEST"] != nil ? "Books Self-Test " : (Showcase.isRequested ? "Books Showcase " : nil)
        let store = scratch.map { LibraryStore(directory: FileManager.default.temporaryDirectory.appendingPathComponent($0 + UUID().uuidString, isDirectory: true)) } ?? LibraryStore()
        let model = LibraryModel(store: store)
        _model = State(initialValue: model)
        AppDelegate.model = model
    }

    var body: some Scene {
        // One window, as Books has: the library, and the book you are reading in its place. It is never shorter than
        // the tallest sheet (Get Info), so a sheet always lies within it.
        Window("Books", id: "main") {
            RootView()
                .environment(model)
                .frame(minWidth: 760, minHeight: 560)
        }
        .defaultSize(width: 1180, height: 780)
        .commands {
            // Show Sidebar (⌃⌘S) heads the View menu, as in every Mac app with a sidebar; the shelves follow it.
            SidebarCommands()
            BooksCommands(model: model)
        }

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
        guard let model = AppDelegate.model else { return }
        if ProcessInfo.processInfo.environment["BOOKS_SELFTEST"] != nil {
            SelfTest.start(model: model)
        } else if Showcase.isRequested {
            // The showcase lays out a sample library of its own; no library folder is watched meanwhile.
            Showcase.start(model: model)
        } else {
            model.refreshFolderSync(scanNow: true)
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
