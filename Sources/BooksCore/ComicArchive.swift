import Foundation

/// A comic archive — CBZ, CBR, CB7 or CBT: page images in a zip, RAR, 7-Zip or tar archive, read in file-name
/// order — opened for import. Zips are read here; the other archives are unpacked by a tool on the Mac: `unrar` or
/// 7-Zip when installed, else the system's `tar`, which reads RAR and 7-Zip archives too.
public struct ComicArchive {
    public struct Info {
        public var title: String?
        public var author: String?
    }

    /// The pages' image files, in reading order.
    public let images: [Data]
    public let info: Info

    public static let extensions: Set<String> = ["cbz", "cbr", "cb7", "cbt"]
    public static let imageExtensions: Set<String> = ["jpg", "jpeg", "jpe", "png", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif", "avif", "jp2"]

    /// Whether a zip holds a comic: page images and no EPUB container.
    public static func isComic(_ zip: ZipArchive) -> Bool {
        !zip.contains("META-INF/container.xml") && zip.entries.contains { !$0.isDirectory && isPageImage($0.name) }
    }

    public static func isRAR(_ data: Data) -> Bool { data.starts(with: Array("Rar!".utf8)) }
    public static func is7Zip(_ data: Data) -> Bool { data.starts(with: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]) }

    static func isPageImage(_ path: String) -> Bool {
        let parts = path.split(separator: "/")
        guard let last = parts.last, !last.hasPrefix("."), !parts.contains("__MACOSX") else { return false }
        return imageExtensions.contains(URL(fileURLWithPath: String(last)).pathExtension.lowercased())
    }

    public init(data: Data, fileExtension: String) throws {
        let ext = fileExtension.lowercased()
        if data.starts(with: [0x50, 0x4B, 0x03, 0x04]) || ext == "cbz" {
            let zip: ZipArchive
            do { zip = try ZipArchive(data: data) } catch { throw ImportError.comic("the archive could not be read (\(error))") }
            let names = zip.entries.filter { !$0.isDirectory && ComicArchive.isPageImage($0.name) }.map(\.name).sorted(by: ComicArchive.naturalOrder)
            guard !names.isEmpty else { throw ImportError.comic("it has no page images") }
            do { images = try names.map { try zip.data($0) } } catch { throw ImportError.comic("a page could not be read (\(error))") }
            let infoName = zip.names.first { $0.lowercased().hasSuffix("comicinfo.xml") }
            info = ComicArchive.info(from: infoName.flatMap { try? zip.data($0) })
        } else {
            let folder = try ComicArchive.unpack(data: data, fileExtension: ext)
            defer { try? FileManager.default.removeItem(at: folder) }
            var files: [(path: String, url: URL)] = []
            var infoURL: URL?
            if let walk = FileManager.default.enumerator(at: folder, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles]) {
                for case let url as URL in walk {
                    guard (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true else { continue }
                    let relative = url.path.dropFirst(folder.path.count + 1)
                    if ComicArchive.isPageImage(String(relative)) { files.append((String(relative), url)) }
                    if url.lastPathComponent.lowercased() == "comicinfo.xml" { infoURL = url }
                }
            }
            files.sort { ComicArchive.naturalOrder($0.path, $1.path) }
            guard !files.isEmpty else { throw ImportError.comic("it has no page images") }
            do { images = try files.map { try Data(contentsOf: $0.url) } } catch { throw ImportError.comic("a page could not be read (\(error))") }
            info = ComicArchive.info(from: infoURL.flatMap { try? Data(contentsOf: $0) })
        }
    }

    /// Title and writer from a ComicInfo.xml, when the archive carries one.
    static func info(from data: Data?) -> Info {
        var info = Info()
        guard let data, let root = XMLTree.parse(data) else { return info }
        func value(_ name: String) -> String? {
            let text = root.child(named: name)?.text.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return text.isEmpty ? nil : text
        }
        let series = value("Series"), number = value("Number"), title = value("Title")
        if let series {
            var name = series
            if let number { name += " #\(number)" }
            if let title, title != series { name += ": \(title)" }
            info.title = name
        } else {
            info.title = title
        }
        info.author = value("Writer") ?? value("Penciller")
        return info
    }

    /// File names in the order a person would put them: digits compare as numbers, the rest case-insensitively.
    public static func naturalOrder(_ a: String, _ b: String) -> Bool {
        func chunks(_ s: String) -> [(digits: Bool, text: Substring)] {
            var out: [(Bool, Substring)] = []
            var start = s.startIndex
            var i = s.startIndex
            while i < s.endIndex {
                let digit = s[i].isNumber
                var j = i
                while j < s.endIndex, s[j].isNumber == digit { j = s.index(after: j) }
                out.append((digit, s[start..<j]))
                start = j
                i = j
            }
            return out
        }
        let ca = chunks(a.lowercased()), cb = chunks(b.lowercased())
        for (x, y) in zip(ca, cb) {
            if x.digits, y.digits {
                let dx = x.text.drop { $0 == "0" }, dy = y.text.drop { $0 == "0" }
                if dx.count != dy.count { return dx.count < dy.count }
                if dx != dy { return dx < dy }
            } else if x.text != y.text {
                return x.text < y.text
            }
        }
        return ca.count < cb.count
    }

    /// Unpacks a RAR, 7-Zip or tar archive into a new temporary folder with the first tool that manages it.
    static func unpack(data: Data, fileExtension ext: String) throws -> URL {
        let fm = FileManager.default
        let work = fm.temporaryDirectory.appendingPathComponent("comic-\(UUID().uuidString)", isDirectory: true)
        let out = work.appendingPathComponent("pages", isDirectory: true)
        try fm.createDirectory(at: out, withIntermediateDirectories: true)
        let kind = isRAR(data) ? "cbr" : is7Zip(data) ? "cb7" : ext
        let archive = work.appendingPathComponent("archive.\(kind)")
        try data.write(to: archive)
        func tool(_ names: [String]) -> String? {
            for dir in ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin", "/usr/bin"] {
                for name in names where fm.isExecutableFile(atPath: "\(dir)/\(name)") { return "\(dir)/\(name)" }
            }
            return nil
        }
        var attempts: [(String, [String])] = []
        if kind == "cbr", let unrar = tool(["unrar"]) { attempts.append((unrar, ["x", "-o+", "-y", "-idq", archive.path, out.path + "/"])) }
        if kind == "cbr" || kind == "cb7", let sevenZip = tool(["7zz", "7z"]) { attempts.append((sevenZip, ["x", "-y", "-bso0", "-bsp0", "-o" + out.path, archive.path])) }
        attempts.append(("/usr/bin/tar", ["-xf", archive.path, "-C", out.path]))
        var lastError = "no tool could unpack it"
        for (path, arguments) in attempts {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: path)
            process.arguments = arguments
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
            do {
                try process.run()
                process.waitUntilExit()
            } catch {
                lastError = "\(URL(fileURLWithPath: path).lastPathComponent) could not run"
                continue
            }
            if process.terminationStatus == 0, let listed = try? fm.contentsOfDirectory(atPath: out.path), !listed.isEmpty { return out }
            lastError = "\(URL(fileURLWithPath: path).lastPathComponent) could not unpack it"
        }
        try? fm.removeItem(at: work)
        let hint = kind == "cbr" ? " CBR archives open with unrar or 7-Zip installed (brew install unrar)." : kind == "cb7" ? " CB7 archives open with 7-Zip installed (brew install sevenzip)." : ""
        throw ImportError.comic(lastError + "." + hint)
    }
}
