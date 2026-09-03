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

case "help", "", "-h", "--help":
    print(usage)

default:
    fail("Unknown command \(args.command)\n\n" + usage)
}
