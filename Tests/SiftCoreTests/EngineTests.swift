import XCTest
@testable import SiftCore

final class EngineTests: XCTestCase {
    var box: Sandbox!
    var volumes: FixedVolumes!
    var engine: Engine!
    var usb: Volume!

    override func setUpWithError() throws {
        box = try Sandbox()
        try box.dir("USB")
        try box.dir("Users/me")
        usb = Volume(id: "uuid:usb", name: "USB", mountPoint: box.path + "/USB", kind: .external)
        volumes = FixedVolumes([Volume(id: "uuid:boot", name: "Macintosh HD", mountPoint: "/", kind: .startup), usb])
        Watchers.pollInterval = 0.3
        engine = Engine(store: SettingsStore(fileURL: box.url("config/settings.json")), volumes: volumes,
                        log: Log(fileURL: box.url("config/activity.jsonl")), userRoots: [box.path + "/Users/me"])
    }

    override func tearDown() {
        engine.stop()
        box.destroy()
    }

    func testRootsAreUserAreasAndCleanableVolumes() throws {
        try box.dir("ReadOnly")
        try box.dir("TimeMachine/Backups.backupdb")
        volumes.volumes += [
            Volume(id: "ro", name: "Disc", mountPoint: box.path + "/ReadOnly", kind: .external, isReadOnly: true),
            Volume(id: "tm", name: "Backups", mountPoint: box.path + "/TimeMachine", kind: .external),
            Volume(id: "nas", name: "NAS", mountPoint: box.path + "/Missing", kind: .network),
        ]
        engine.refreshVolumes()
        let roots = engine.roots()
        XCTAssertEqual(roots.map(\.path), [box.path + "/Users/me", box.path + "/USB", box.path + "/Missing"])
        XCTAssertEqual(roots[0].label, "Startup disk")
        XCTAssertEqual(roots[1].label, "USB")
    }

    func testSweepCoversRootsAndKeepsFolderViews() throws {
        try box.file("USB/.DS_Store")
        try box.file("USB/.Spotlight-V100/x")
        try box.file("USB/Docs/.DS_Store")
        try box.file("USB/Docs/a")
        try box.file("Users/me/Desktop/.DS_Store")
        try box.file("Users/me/Library/Preferences/.DS_Store")
        try box.file("Users/me/.DS_Store")
        try box.dir("Users/me/Pictures")
        try box.file("Elsewhere/.DS_Store")
        var settings = engine.settings
        settings.views.folders = [FolderView(path: box.path + "/Users/me/Pictures", view: FinderView(mode: .gallery))]
        engine.update(settings)
        engine.refreshVolumes()
        XCTAssertEqual(engine.safety.keptStores, [box.path + "/Users/me/.DS_Store", box.path + "/Users/me/Pictures/.DS_Store"])

        let preview = try engine.sweep(roots: engine.roots(), dryRun: true)
        XCTAssertEqual(preview.removed.count, 5)
        XCTAssertTrue(box.exists("USB/.DS_Store"))

        let outcome = try engine.sweep(roots: engine.roots())
        XCTAssertEqual(relative(outcome.removed, from: box.path),
                       ["USB/.DS_Store", "USB/.Spotlight-V100", "USB/Docs/.DS_Store", "Users/me/Desktop/.DS_Store", "Users/me/Library/Preferences/.DS_Store"])
        XCTAssertTrue(box.exists("Users/me/.DS_Store"), "the store carrying Pictures' view stays")
        XCTAssertFalse(box.exists("Users/me/Pictures/.DS_Store"), "a kept store that was never written is not created by a sweep")
        XCTAssertTrue(box.exists("USB/Docs/a"))
        XCTAssertTrue(box.exists("Elsewhere/.DS_Store"))
        XCTAssertEqual(engine.log.statistics.removed, 5)
    }

    func testWatchingReactsToChanges() throws {
        var removed: [Item] = []
        let lock = NSLock()
        engine.onRemoved = { outcome, _ in lock.lock(); removed += outcome.removed; lock.unlock() }
        engine.start()
        XCTAssertEqual(Set(engine.activeRoots.map(\.path)), [box.path + "/Users/me", box.path + "/USB"])

        try box.file("USB/Later/.DS_Store")
        XCTAssertTrue(waitUntil(10) { !self.box.exists("USB/Later/.DS_Store") })
        XCTAssertTrue(box.exists("USB/Later"))
        lock.lock(); let names = removed.map(\.path); lock.unlock()
        XCTAssertEqual(names, [box.path + "/USB/Later/.DS_Store"])

        engine.isPaused = true
        XCTAssertTrue(engine.activeRoots.isEmpty)
        try box.file("USB/Paused/.DS_Store")
        Thread.sleep(forTimeInterval: 1)
        XCTAssertTrue(box.exists("USB/Paused/.DS_Store"))
        engine.isPaused = false
        try box.file("USB/Resumed/.DS_Store")
        XCTAssertTrue(waitUntil(10) { !self.box.exists("USB/Resumed/.DS_Store") })
    }

    func testSubtreeChangesAreFollowedToTheDepthTheSystemNames() throws {
        try box.file("USB/Docs/.DS_Store")
        try box.file("USB/Docs/Deep/.DS_Store")
        engine.refreshVolumes()
        let scanner = JunkScanner(safety: engine.safety)
        XCTAssertEqual(relative(try scanner.scan(root: box.path + "/USB/Docs", depth: 1), from: box.path), ["USB/Docs/.DS_Store"])
        XCTAssertEqual(relative(try scanner.scan(root: box.path + "/USB/Docs"), from: box.path), ["USB/Docs/.DS_Store", "USB/Docs/Deep/.DS_Store"])
    }

    func testFolderViewStoresAreWrittenAndKept() throws {
        try box.dir("Users/me/Pictures")
        var settings = engine.settings
        settings.views.folders = [FolderView(path: box.path + "/Users/me/Pictures", view: FinderView(mode: .gallery))]
        engine.update(settings)
        try engine.applyStores(previous: StorePlan(settings: ViewSettings()))
        let store = box.url("Users/me/.DS_Store")
        XCTAssertTrue(box.exists("Users/me/.DS_Store"))
        let expected = try box.records("Users/me/.DS_Store")

        engine.start()
        var file = DSStore(records: expected)
        file.records += try StorePlan.records(for: FinderView(mode: .columns), as: "Documents")
        try file.encoded().write(to: store)
        XCTAssertTrue(waitUntil(10) {
            guard let now = try? self.box.records("Users/me/.DS_Store") else { return false }
            return DSRecord.equivalent(now, expected)
        }, "a view Finder adds is dropped again")

        try FileManager.default.removeItem(at: store)
        XCTAssertTrue(waitUntil(10) { self.box.exists("Users/me/.DS_Store") }, "a deleted store comes back")

        settings.views.folders = []
        let previous = engine.plan
        engine.update(settings)
        try engine.applyStores(previous: previous)
        XCTAssertFalse(box.exists("Users/me/.DS_Store"), "a retired view takes its store with it")
        XCTAssertFalse(box.exists("Users/me/Pictures/.DS_Store"))
    }

    func testLockedItemsGoThroughTheHelperWhenThereIsOne() throws {
        try XCTSkipIf(getuid() == 0, "root can delete anything")
        try box.file("USB/Locked/.DS_Store")
        XCTAssertEqual(chmod(box.path + "/USB/Locked", 0o500), 0)
        defer { chmod(box.path + "/USB/Locked", 0o700) }
        engine.refreshVolumes()
        var asked: [Item] = []
        let mount = box.path + "/USB"
        engine.privilegedRemove = { items in
            asked = items
            chmod(mount + "/Locked", 0o700)
            return Remover(safety: Safety(mountPoints: [mount])).remove(items)
        }
        let outcome = try engine.sweep(roots: engine.roots())
        XCTAssertEqual(asked.map(\.name), [".DS_Store"], "what the user could not delete is handed to the helper")
        XCTAssertEqual(relative(outcome.removed, from: box.path), ["USB/Locked/.DS_Store"])
        XCTAssertTrue(outcome.locked.isEmpty)
        XCTAssertTrue(engine.lockedItems.isEmpty)
    }

    func testUnmountedVolumesDropOut() throws {
        engine.start()
        XCTAssertEqual(engine.activeRoots.count, 2)
        volumes.volumes = volumes.volumes.filter { $0.kind == .startup }
        engine.refreshVolumes()
        XCTAssertEqual(engine.roots().map(\.path), [box.path + "/Users/me"])
        XCTAssertEqual(engine.activeRoots.count, 1)
    }

    func testLockedItemsAreTracked() throws {
        try XCTSkipIf(getuid() == 0, "root can delete anything")
        try box.file("USB/Locked/.DS_Store")
        XCTAssertEqual(chmod(box.path + "/USB/Locked", 0o500), 0)
        defer { chmod(box.path + "/USB/Locked", 0o700) }
        var reported: [Item] = []
        engine.onLockedChanged = { reported = $0 }
        engine.refreshVolumes()
        let outcome = try engine.sweep(roots: engine.roots())
        XCTAssertEqual(outcome.locked.map(\.name), [".DS_Store"])
        XCTAssertEqual(engine.lockedItems.count, 1)
        XCTAssertEqual(reported.count, 1)
        chmod(box.path + "/USB/Locked", 0o700)
        _ = try engine.sweep(roots: engine.roots())
        XCTAssertTrue(engine.lockedItems.isEmpty)
        XCTAssertTrue(reported.isEmpty)
    }
}

final class HelperTests: XCTestCase {
    var box: Sandbox!
    var server: HelperServer!
    var thread: Thread!

    override func setUpWithError() throws {
        box = try Sandbox()
        try box.dir("USB")
        // Socket paths are short; the sandbox path may not be.
        let socket = "/tmp/sift-test-\(getpid())-\(Int.random(in: 0..<100000)).sock"
        let mount = box.path + "/USB"
        server = HelperServer(socketPath: socket, uid: getuid(), mountPoints: { [mount] })
        XCTAssertTrue(server.listen())
        let server = self.server!
        thread = Thread { server.serve() }
        thread.start()
    }

    override func tearDown() {
        server.stop()
        box.destroy()
    }

    func testRemovesOnlyCatalogJunkWhereItBelongs() throws {
        try box.file("USB/.Spotlight-V100/index", "x")
        try box.file("USB/.fseventsd/000001", "x")
        try box.file("USB/Docs/.Trashes/501/a", "x")
        try box.file("USB/Docs/real.txt", "keep")
        XCTAssertTrue(HelperClient.isReady(at: server.socketPath))

        let items = [
            Item(path: box.path + "/USB/.Spotlight-V100", kind: .spotlight, isDirectory: true, size: 0),
            Item(path: box.path + "/USB/.fseventsd", kind: .fsevents, isDirectory: true, size: 0),
            Item(path: box.path + "/USB/Docs/.Trashes", kind: .trashes, isDirectory: true, size: 0),
            Item(path: box.path + "/USB/Docs/real.txt", kind: .dsStore, isDirectory: false, size: 0),
            Item(path: "/System/Library/.DS_Store", kind: .dsStore, isDirectory: false, size: 0),
        ]
        let outcome = HelperClient.remove(items, at: server.socketPath)
        XCTAssertEqual(relative(outcome.removed, from: box.path), ["USB/.Spotlight-V100", "USB/.fseventsd"])
        XCTAssertEqual(outcome.skipped.count, 3, "a Trash below the volume root, a real file and a system path are refused")
        XCTAssertTrue(outcome.failed.isEmpty)
        XCTAssertTrue(box.exists("USB/Docs/.Trashes/501/a"))
        XCTAssertTrue(box.exists("USB/Docs/real.txt"))
        XCTAssertTrue(box.exists("USB/.fseventsd/no_log"))
        XCTAssertTrue(box.exists("USB/.metadata_never_index"))
    }

    func testUnreachableHelperReportsEveryItemAsStillLocked() {
        let item = Item(path: box.path + "/USB/.Trashes", kind: .trashes, isDirectory: true, size: 0)
        let outcome = HelperClient.remove([item], at: "/tmp/sift-nobody-\(getpid()).sock")
        XCTAssertEqual(outcome.failed.count, 1)
        XCTAssertTrue(outcome.failed[0].needsAdministrator)
        XCTAssertFalse(HelperClient.isReady(at: "/tmp/sift-nobody-\(getpid()).sock"))
    }

    func testInstallScriptAndPlist() {
        let plist = HelperInstall.plist(uid: 501)
        XCTAssertTrue(plist.contains("<string>dev.sift.helper.501</string>"))
        XCTAssertTrue(plist.contains("<string>/var/run/sift-501.sock</string>"))
        let script = HelperInstall.script(bundledHelper: "/Applications/Sift.app/Contents/MacOS/sift-helper", uid: 501)
        XCTAssertTrue(script.contains("/bin/cp -f '/Applications/Sift.app/Contents/MacOS/sift-helper' '/Library/PrivilegedHelperTools/dev.sift.helper'"))
        XCTAssertTrue(script.contains("launchctl bootstrap system '/Library/LaunchDaemons/dev.sift.helper.501.plist'"))
        XCTAssertFalse(plist.contains("'"), "the plist is passed through single quotes")
    }
}
