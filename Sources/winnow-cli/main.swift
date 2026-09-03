import Foundation
import WinnowCore
#if canImport(Glibc)
import Glibc
#endif

let usage = """
winnow-cli — remove Mac-specific metadata files from folders and volumes

USAGE
  winnow-cli scan <folder>...            list junk without deleting anything
  winnow-cli sweep <folder>...           remove junk beneath the given folders
  winnow-cli full-sweep                  clean every configured location and eligible volume
  winnow-cli watch [<folder>...]         watch and clean continuously (Ctrl-C to stop)
  winnow-cli rules                       list rules and whether they are active
  winnow-cli volumes                     list mounted volumes and whether they would be cleaned
  winnow-cli finder                      show Finder defaults, folder views and enforcement state
  winnow-cli dsstore <folder>            show the records in a folder's .DS_Store
  winnow-cli set-view <folder> <mode>    give a folder its own view: icons | list | columns | gallery
                                         (--sort=name|dateModified|dateCreated|dateAdded|size|kind  --icon-size=N  --recursive)

OPTIONS
  --dry-run        report what would be removed, remove nothing
  --shallow        do not descend into subfolders
  --trash          move to Trash instead of deleting (macOS)
  --permanent      delete outright
  --quiet          only print the summary
"""

struct Arguments {
    var command = ""
    var paths: [String] = []
    var dryRun = false
    var shallow = false
    var mode: DeletionMode?
    var quiet = false
    var sort: String?
    var iconSize: Double?
    var recursive = false

    init(_ argv: [String]) {
        var rest = argv.dropFirst()
        if let first = rest.first { command = first; rest = rest.dropFirst() }
        for arg in rest {
            switch arg {
            case "--dry-run", "-n": dryRun = true
            case "--shallow": shallow = true
            case "--trash": mode = .trash
            case "--permanent": mode = .permanent
            case "--quiet", "-q": quiet = true
            case "-h", "--help": command = "help"
            case _ where arg.hasPrefix("--sort="): sort = String(arg.dropFirst("--sort=".count))
            case _ where arg.hasPrefix("--icon-size="): iconSize = Double(arg.dropFirst("--icon-size=".count))
            case "--recursive", "-r": recursive = true
            default:
                if arg.hasPrefix("-") {
                    fail("Unknown option \(arg)")
                }
                paths.append(NSString(string: arg).expandingTildeInPath)
            }
        }
    }
}

func fail(_ message: String, code: Int32 = 2) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(code)
}

func bytes(_ n: Int64) -> String {
    ByteCountFormatter.string(fromByteCount: n, countStyle: .file)
}

func absolute(_ path: String) -> String {
    if path.hasPrefix("/") { return SafetyPolicy.standardize(path) }
    return SafetyPolicy.standardize(FileManager.default.currentDirectoryPath + "/" + path)
}

let args = Arguments(CommandLine.arguments)
let engine = Engine()
if let mode = args.mode {
    engine.persistsSettings = false
    var settings = engine.settings
    settings.general.deletionMode = mode
    engine.update(settings)
}

func printItems(_ items: [JunkItem]) {
    for item in items {
        print("\(item.path)\t\(item.ruleName)\t\(bytes(item.size))")
    }
}

func printSummary(_ result: SweepResult) {
    let verb = result.dryRun ? "Would remove" : "Removed"
    print("\(verb) \(result.removedCount) item\(result.removedCount == 1 ? "" : "s"), \(bytes(result.bytesFreed))"
          + (result.failed.isEmpty ? "" : ", \(result.failed.count) failed")
          + (result.skipped.isEmpty ? "" : ", \(result.skipped.count) skipped"))
    for failure in result.failed {
        FileHandle.standardError.write(Data("failed: \(failure.item.path): \(failure.reason)\n".utf8))
    }
    if !result.lockedItems.isEmpty && getuid() != 0 {
        FileHandle.standardError.write(Data("\(result.lockedItems.count) item(s) belong to the system; re-run with sudo to remove them.\n".utf8))
    }
}

switch args.command {
case "scan":
    guard !args.paths.isEmpty else { fail("scan needs at least one folder") }
    engine.refreshVolumes(announceNew: false)
    do {
        let items = try engine.scan(paths: args.paths.map(absolute), recursive: !args.shallow)
        printItems(items)
        print("\(items.count) item\(items.count == 1 ? "" : "s"), \(bytes(items.reduce(0) { $0 + $1.size }))")
    } catch {
        fail(error.localizedDescription, code: 1)
    }

case "sweep":
    guard !args.paths.isEmpty else { fail("sweep needs at least one folder") }
    engine.refreshVolumes(announceNew: false)
    do {
        let result = try engine.sweep(paths: args.paths.map(absolute), recursive: !args.shallow, dryRun: args.dryRun)
        if !args.quiet { printItems(result.removed) }
        printSummary(result)
        exit(result.failed.isEmpty ? 0 : 1)
    } catch {
        fail(error.localizedDescription, code: 1)
    }

case "full-sweep":
    engine.refreshVolumes(announceNew: false)
    let targets = engine.fullSweepTargets()
    if targets.isEmpty { fail("Nothing to sweep: no enabled locations and no eligible volumes", code: 1) }
    if !args.quiet {
        for target in targets { print("→ \(target.path)") }
    }
    do {
        let result = try engine.fullSweep(dryRun: args.dryRun)
        if !args.quiet { printItems(result.removed) }
        printSummary(result)
        exit(result.failed.isEmpty ? 0 : 1)
    } catch {
        fail(error.localizedDescription, code: 1)
    }

case "watch":
    if !args.paths.isEmpty {
        engine.persistsSettings = false
        var settings = engine.settings
        settings.general.isWatching = true
        settings.locations = args.paths.map { WatchedLocation(path: absolute($0), recursive: !args.shallow) }
        engine.update(settings)
    }
    engine.log.onAppend = { entry in
        guard entry.kind != .sweep else { return }
        let stamp = ISO8601DateFormatter().string(from: entry.date)
        print("\(stamp)  \(entry.message)" + (entry.path.map { "  \($0)" } ?? ""))
        fflush(stdout)
    }
    engine.start()
    let watches = engine.activeWatches
    if watches.isEmpty { fail("Nothing to watch: add folders or connect an eligible volume", code: 1) }
    print("Watching:")
    for watch in watches { print("  \(watch.path)") }
    signal(SIGINT, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
    source.setEventHandler {
        engine.stop()
        exit(0)
    }
    source.resume()
    dispatchMain()

case "rules":
    for rule in JunkCatalog.builtIn {
        let on = engine.settings.rules.isEnabled(rule) ? "on " : "off"
        print("[\(on)] \(rule.name.padding(toLength: 38, withPad: " ", startingAt: 0)) \(rule.scope.label.lowercased()) · \(rule.summary)")
    }
    for custom in engine.settings.rules.custom {
        print("[on ] \(custom.pattern.padding(toLength: 38, withPad: " ", startingAt: 0)) custom · \(custom.entryKind.label.lowercased())")
    }

case "volumes":
    for volume in engine.refreshVolumes(announceNew: false) {
        let verdict = engine.decision(for: volume)
        print("\(verdict.isEligible ? "clean " : "skip  ") \(volume.name.padding(toLength: 24, withPad: " ", startingAt: 0)) \(volume.kind.label) · \(volume.fileSystemLabel) · \(volume.mountPoint) · \(verdict.reason)")
    }

case "finder":
    let d = FinderDefaults.read()
    print("Finder defaults: view=\(d.viewStyle.rawValue) sort=\(d.sortKey.rawValue) \(d.ascending ? "asc" : "desc") group=\(d.groupBy.rawValue) foldersFirst=\(d.foldersFirst) icon=\(Int(d.options.icon.iconSize))px")
    print("Settings: \(engine.store.fileURL.path)")
    let s = engine.settings
    print("Enforce defaults: \(s.startupDisk.isEnabled ? (s.startupDisk.expiresAt.map { "on until \($0)" } ?? "on") : "off")")
    print("Folder views:")
    func describe(_ file: String, name: String) -> String {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: file)) else { return "missing" }
        guard let store = try? DSStoreFile.read(data) else { return "\(data.count) bytes · unreadable" }
        let ids = store.records.filter { $0.filename == name }.map(\.structID).sorted().joined(separator: " ")
        return "\(data.count) bytes · \(store.records.count) records · \(name) [\(ids)]"
    }
    for view in s.folderViews {
        let name = NSString(string: view.path).lastPathComponent
        let parent = NSString(string: view.path).deletingLastPathComponent + "/.DS_Store"
        print("  \(view.isEnabled ? "on " : "off") \(view.displayName)  \(view.summary)")
        print("       own:    \(describe(view.dsStorePath, name: "."))")
        print("       parent: \(describe(parent, name: name))")
    }

case "dsstore":
    guard let folder = args.paths.first else { fail("dsstore needs a folder") }
    let url = URL(fileURLWithPath: absolute(folder)).appendingPathComponent(".DS_Store")
    do {
        let file = try DSStoreFile.read(try Data(contentsOf: url))
        for record in file.records {
            let value: String
            switch record.value {
            case .long(let v): value = "\(v)"
            case .shor(let v): value = "\(v)"
            case .bool(let v): value = "\(v)"
            case .type(let v): value = "'\(v)'"
            case .ustr(let v): value = "\"\(v)\""
            case .comp(let v), .dutc(let v): value = "\(v)"
            case .blob(let d):
                if let plist = try? PropertyListSerialization.propertyList(from: d, options: [], format: nil) {
                    value = "\(plist)"
                } else {
                    value = "<\(d.count) bytes>"
                }
            }
            print("\(record.filename)\t\(record.structID)\t\(record.value.typeCode)\t\(value)")
        }
        print("\(file.records.count) record\(file.records.count == 1 ? "" : "s")")
    } catch {
        FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
    }
    let folderPath = absolute(folder)
    print("xattrs on \(folderPath):")
    let attributes = ExtendedAttributes.list(at: folderPath)
    if attributes.isEmpty { print("  (none)") }
    for attribute in attributes {
        print("  \(attribute.name)  \(attribute.summary)")
    }

case "set-view":
    guard args.paths.count == 2 else { fail("set-view needs a folder and a mode") }
    let styles: [String: FinderViewStyle] = ["icons": .icons, "list": .list, "columns": .columns, "gallery": .gallery]
    guard let style = styles[args.paths[1].lowercased()] else { fail("mode must be icons, list, columns or gallery") }
    let key = args.sort.flatMap(FinderSortKey.init(rawValue:)) ?? .name
    var view = FolderView(path: absolute(args.paths[0]), viewStyle: style, sortKey: key, includeSubfolders: args.recursive)
    if let size = args.iconSize {
        view.options.icon.iconSize = size
        view.options.gallery.thumbnailSize = size
    }
    do {
        let count = try FolderViewWriter.apply(FolderViewPlan(views: [view]))
        print("wrote \(count) folder\(count == 1 ? "" : "s") under \(view.path) · \(view.summary)")
    } catch {
        fail(error.localizedDescription, code: 1)
    }

case "help", "", "-h", "--help":
    print(usage)

default:
    fail("Unknown command \(args.command)\n\n" + usage)
}
