import Foundation
import BooksCore
#if canImport(Glibc)
import Glibc
#endif

// A closed pipe is an error to handle, not a signal to die by.
signal(SIGPIPE, SIG_IGN)

let usage = """
books-cli — the Books library and its formats from the command line

  books-cli info <file>                 metadata, spine and table of contents of an EPUB, Kindle or text file
  books-cli convert <file> <out.epub>   convert a Kindle (MOBI/AZW3) or text file to EPUB
  books-cli text <file>                 print the plain text of a book, chapter by chapter
  books-cli library [list|stats]        the app's library (~/Library/Application Support/Books)
  books-cli add <file…>                 add files to the app's library
"""

var arguments = Array(CommandLine.arguments.dropFirst())
let command = arguments.isEmpty ? "help" : arguments.removeFirst()

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

func url(_ path: String) -> URL { URL(fileURLWithPath: NSString(string: path).expandingTildeInPath) }

/// Opens any supported file as an EPUB in memory, converting when needed.
func openAsEPUB(_ path: String) throws -> (EPUBBook, Data) {
    let file = url(path)
    let data = try Data(contentsOf: file)
    let ext = file.pathExtension.lowercased()
    let epubData: Data
    if KindleBook.isKindle(data) {
        epubData = try KindleBook.convertToEPUB(data).epub
    } else if data.starts(with: [0x50, 0x4B, 0x03, 0x04]) {
        epubData = data
    } else if ["txt", "text", "md", "markdown"].contains(ext) {
        let text = String(data: data, encoding: .utf8) ?? String(decoding: data, as: UTF8.self)
        epubData = TextBook.epub(fileName: file.lastPathComponent, text: text).data
    } else {
        throw ImportError.unsupportedType(file.lastPathComponent)
    }
    return (try EPUBBook(data: epubData), epubData)
}

switch command {
case "info":
    guard let path = arguments.first else { fail(usage) }
    do {
        let (book, data) = try openAsEPUB(path)
        let m = book.metadata
        print("Title:      \(m.title)")
        print("Author:     \(m.author)")
        print("Language:   \(m.language)")
        print("Identifier: \(m.identifier)")
        if !m.publisher.isEmpty { print("Publisher:  \(m.publisher)") }
        if !m.published.isEmpty { print("Published:  \(m.published)") }
        if !m.subjects.isEmpty { print("Subjects:   \(m.subjects.joined(separator: ", "))") }
        print("Cover:      \(book.coverPath ?? "none")")
        print("Size:       \(Format.bytes(Int64(data.count))) · \(book.spine.count) spine documents · \(book.wordCount()) words")
        print("Contents:")
        for entry in book.toc { print("  " + String(repeating: "  ", count: entry.level) + entry.label + "  → " + entry.href) }
    } catch { fail(error.localizedDescription) }

case "convert":
    guard arguments.count >= 2 else { fail(usage) }
    do {
        let (book, data) = try openAsEPUB(arguments[0])
        try data.write(to: url(arguments[1]))
        print("wrote \(arguments[1]): \(book.metadata.title) by \(book.metadata.author), \(book.spine.count) documents, \(Format.bytes(Int64(data.count)))")
    } catch { fail(error.localizedDescription) }

case "text":
    guard let path = arguments.first else { fail(usage) }
    do {
        let (book, _) = try openAsEPUB(path)
        for i in book.spine.indices {
            let text = book.text(ofSpineItem: i).trimmingCharacters(in: .whitespacesAndNewlines)
            if text.isEmpty { continue }
            print("――― \(book.spine[i]) ―――")
            print(text)
            print()
        }
    } catch { fail(error.localizedDescription) }

case "library":
    let store = LibraryStore()
    switch arguments.first ?? "list" {
    case "list":
        if store.books.isEmpty { print("The library is empty (\(store.directory.path))."); break }
        for book in store.books.sorted(by: { $0.title.lowercased() < $1.title.lowercased() }) {
            let progress = book.isFinished ? "finished" : (book.hasStarted ? "\(Int(book.progress * 100))%" : "new")
            print("\(book.title) — \(book.author) [\(book.kind.label)] \(Format.bytes(book.fileSize)) · \(progress)")
        }
    case "stats":
        print("Books: \(store.books.count) · Finished: \(store.books.filter(\.isFinished).count) · Collections: \(store.collections.count)")
        print("Reading time: \(Format.duration(seconds: store.stats.totalSeconds)) · Today: \(Format.duration(seconds: store.stats.todaySeconds)) · Streak: \(store.stats.streak(goalMinutes: store.settings.goals.dailyMinutes)) days")
    default:
        fail(usage)
    }

case "add":
    guard !arguments.isEmpty else { fail(usage) }
    let store = LibraryStore()
    var failures = 0
    for path in arguments {
        do {
            switch try store.importFile(at: url(path)) {
            case .added(let book): print("added \(book.title) — \(book.author)")
            case .duplicate(let book): print("already in the library: \(book.title)")
            }
        } catch {
            failures += 1
            FileHandle.standardError.write(Data("\(path): \(error.localizedDescription)\n".utf8))
        }
    }
    exit(failures == 0 ? 0 : 1)

default:
    print(usage)
    exit(command == "help" || command == "--help" || command == "-h" ? 0 : 1)
}
