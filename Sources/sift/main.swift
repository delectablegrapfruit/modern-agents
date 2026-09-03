import Foundation
import SiftCore
#if canImport(Glibc)
import Glibc
#endif

let usage = """
sift — remove the hidden files macOS leaves on disks

  sift scan [folder…]       list junk without removing anything
  sift sweep [folder…]      remove junk (--dry-run to only list it)
  sift dsstore <folder>     show the records in a folder's .DS_Store

With no folder, scan and sweep cover what the app covers: the startup disk's
user areas and every connected disk. The command line shares the app's settings.
"""

var arguments = Array(CommandLine.arguments.dropFirst())
let command = arguments.isEmpty ? "help" : arguments.removeFirst()
let dryRun = arguments.contains("--dry-run")
arguments.removeAll { $0.hasPrefix("-") }

func absolute(_ path: String) -> String {
    let expanded = NSString(string: path).expandingTildeInPath
    return Path.standardize(expanded.hasPrefix("/") ? expanded : FileManager.default.currentDirectoryPath + "/" + expanded)
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

func bytes(_ n: Int64) -> String { ByteCountFormatter.string(fromByteCount: n, countStyle: .file) }

let engine = Engine()
engine.persistsSettings = false
engine.refreshVolumes()

func roots() -> [Root] {
    if arguments.isEmpty { return engine.roots() }
    return arguments.map(absolute).map { Root(path: $0, label: Path.name(of: $0)) }
}

switch command {
case "scan":
    do {
        let items = try engine.scan(roots: roots())
        for item in items { print("\(item.path)\t\(item.kind.label)\t\(bytes(item.size))") }
        print("\(items.count) item\(items.count == 1 ? "" : "s"), \(bytes(items.reduce(0) { $0 + $1.size }))")
    } catch { fail(error.localizedDescription) }

case "sweep":
    do {
        let outcome = try engine.sweep(roots: roots(), dryRun: dryRun)
        for item in outcome.removed { print("\(item.path)\t\(item.kind.label)\t\(bytes(item.size))") }
        for failure in outcome.failed { FileHandle.standardError.write(Data("failed: \(failure.item.path): \(failure.reason)\n".utf8)) }
        print("\(dryRun ? "Would remove" : "Removed") \(outcome.removed.count) item\(outcome.removed.count == 1 ? "" : "s"), \(bytes(outcome.bytes))"
              + (outcome.failed.isEmpty ? "" : ", \(outcome.failed.count) failed"))
        if !outcome.locked.isEmpty && getuid() != 0 {
            FileHandle.standardError.write(Data("\(outcome.locked.count) belong to the system; the app removes them as administrator, or re-run with sudo.\n".utf8))
        }
        exit(outcome.failed.isEmpty ? 0 : 1)
    } catch { fail(error.localizedDescription) }

case "dsstore":
    guard let folder = arguments.first else { fail("dsstore needs a folder") }
    let url = URL(fileURLWithPath: absolute(folder)).appendingPathComponent(".DS_Store")
    do {
        let file = try DSStore.read(try Data(contentsOf: url))
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
            print("\(record.filename)\t\(record.structID)\t\(value)")
        }
        print("\(file.records.count) record\(file.records.count == 1 ? "" : "s")")
    } catch { fail(error.localizedDescription) }

case "help", "-h", "--help":
    print(usage)

default:
    fail("Unknown command \(command)\n\n" + usage)
}
