import AppKit
import PDFKit
import BooksCore

/// Any book read as a comic: the page images of an EPUB (or a Kindle or text book, which are EPUBs once added), in
/// spine order, as a PDF made once beside the book, with the book's contents as the PDF's outline. The comics
/// layout then finds the panels in it as in any PDF.
enum ComicPages {
    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /// The PDF of the book's page images, made when it is missing or older than the book.
    static func pdfURL(for book: Book, store: LibraryStore) throws -> URL {
        let source = store.fileURL(for: book)
        let cache = store.folder(for: book.id).appendingPathComponent("comic.pdf")
        let cachedDate = try? cache.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
        let sourceDate = try? source.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
        if let cachedDate, let sourceDate, cachedDate >= sourceDate, PDFDocument(url: cache)?.pageCount ?? 0 > 0 { return cache }
        let epub: EPUBBook
        do { epub = try EPUBBook(url: source) } catch { throw Failure(message: "This book could not be opened as a comic: \(error)") }
        var images: [CGImage] = []
        var firstPage: [String: Int] = [:]
        var seen = Set<String>()
        for path in epub.spine {
            guard let html = try? epub.archive.string(path) else { continue }
            let directory = Paths.directory(of: path)
            for href in imageReferences(in: html) {
                let resolved = Paths.normalize(Paths.resolve(directory, Paths.stripFragment(href)))
                // The same image used twice on one page (a thumbnail and its picture) is one page.
                guard !seen.contains(path + "|" + resolved), let data = try? epub.archive.data(resolved), let image = ComicPDF.decode(data) else { continue }
                seen.insert(path + "|" + resolved)
                if firstPage[path] == nil { firstPage[path] = images.count }
                images.append(image)
            }
        }
        guard !images.isEmpty else { throw Failure(message: "“\(book.title)” has no page images to read as a comic.") }
        guard var pdf = ComicPDF.make(images: images) else { throw Failure(message: "The pages of “\(book.title)” could not be drawn.") }
        // The book's contents, as far as they point at pages with images.
        var entries: [(label: String, page: Int)] = []
        for entry in epub.toc where entry.level == 0 {
            let path = Paths.normalize(Paths.stripFragment(entry.href))
            guard let page = firstPage[path], !entry.label.isEmpty, entries.last?.page != page else { continue }
            entries.append((entry.label, page))
        }
        if !entries.isEmpty, let document = PDFDocument(data: pdf) {
            let root = PDFOutline()
            for entry in entries {
                guard let page = document.page(at: entry.page) else { continue }
                let item = PDFOutline()
                item.label = entry.label
                item.destination = PDFDestination(page: page, at: CGPoint(x: 0, y: page.bounds(for: .mediaBox).height))
                root.insertChild(item, at: root.numberOfChildren)
            }
            document.outlineRoot = root
            if let withOutline = document.dataRepresentation() { pdf = withOutline }
        }
        try pdf.write(to: cache, options: .atomic)
        return cache
    }

    /// The images a page refers to, in order: `<img src>` and SVG `<image href>` (or `xlink:href`), data URLs left out.
    static func imageReferences(in html: String) -> [String] {
        var found: [(Range<String.Index>, String)] = []
        let patterns = ["<img\\b[^>]*?\\bsrc\\s*=\\s*[\"']([^\"']+)[\"']", "<image\\b[^>]*?\\b(?:xlink:)?href\\s*=\\s*[\"']([^\"']+)[\"']"]
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { continue }
            for match in regex.matches(in: html, range: NSRange(html.startIndex..., in: html)) {
                guard let whole = Range(match.range, in: html), let group = Range(match.range(at: 1), in: html) else { continue }
                let href = String(html[group])
                if href.lowercased().hasPrefix("data:") { continue }
                found.append((whole, href))
            }
        }
        return found.sorted { $0.0.lowerBound < $1.0.lowerBound }.map { $0.1 }
    }
}
