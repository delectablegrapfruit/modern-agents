import XCTest
@testable import BooksCore

final class InflateTests: XCTestCase {
    // zlib.compress(text, 9) of ("The quick brown fox jumps over the lazy dog. " * 40 + "\n") * 5
    static let text = String(repeating: String(repeating: "The quick brown fox jumps over the lazy dog. ", count: 40) + "\n", count: 5)
    static let zlibStream = Data(base64Encoded: "eNrt1bcBg0AURMGcKn4FVEMDMiCvg0OHUfVQhzTxTrTJa65tDOV2esQxp/kdXVriXl79GGlqc3z2+Xn4rnFOlzoaGIZhGP4tXLkDhmEYFkJ3wDAMw0LoDhiGYVgIfQfDMAz/Vwg3I8ufXw==")!
    static let deflateStream = Data(base64Encoded: "7dW3AYNAFETBnCp+BVRDAzIgr4NDh1H1UIc08U60yWuubQzldnrEMaf5HV1a4l5e/RhpanN89vl5+K5xTpc6GhiGYRj+LVy5A4ZhGBZCd8AwDMNC6A4YhmFYCH0HwzAM/1cINw==")!

    func testZlibStream() throws {
        let out = try Inflate.zlib(InflateTests.zlibStream)
        XCTAssertEqual(String(decoding: out, as: UTF8.self), InflateTests.text)
        XCTAssertEqual(out.count, 9005)
    }

    func testRawDeflate() throws {
        let out = try Inflate.raw(InflateTests.deflateStream)
        XCTAssertEqual(String(decoding: out, as: UTF8.self), InflateTests.text)
        XCTAssertEqual(CRC32.checksum(out), 3_800_740_418)
    }

    func testTruncatedStreamThrows() {
        XCTAssertThrowsError(try Inflate.raw(InflateTests.deflateStream.prefix(20)))
    }

    func testStoredBlock() throws {
        // A single stored block: BFINAL=1, BTYPE=00, LEN=5, NLEN=~5, "hello".
        let bytes: [UInt8] = [0x01, 0x05, 0x00, 0xFA, 0xFF] + Array("hello".utf8)
        XCTAssertEqual(String(decoding: try Inflate.raw(Data(bytes)), as: UTF8.self), "hello")
    }
}

final class ZipTests: XCTestCase {
    func testWriteAndReadBack() throws {
        var w = ZipWriter()
        w.add("mimetype", "application/epub+zip")
        w.add("dir/ünïcode.txt", "héllo wörld")
        w.add("bin.dat", Data([0, 1, 2, 3, 255]))
        let archive = try ZipArchive(data: w.finish())
        XCTAssertEqual(archive.names, ["mimetype", "dir/ünïcode.txt", "bin.dat"])
        XCTAssertEqual(try archive.string("mimetype"), "application/epub+zip")
        XCTAssertEqual(try archive.string("dir/ünïcode.txt"), "héllo wörld")
        XCTAssertEqual(try archive.data("bin.dat"), Data([0, 1, 2, 3, 255]))
        XCTAssertTrue(archive.contains("./bin.dat"))
        XCTAssertThrowsError(try archive.data("missing"))
    }

    func testDeflatedEntry() throws {
        // Hand-assembled archive with one deflated entry, built from the known raw deflate stream.
        let payload = InflateTests.deflateStream
        let name = Data("fox.txt".utf8)
        var zip = Data()
        func le16(_ v: Int) { zip.append(UInt8(v & 0xFF)); zip.append(UInt8((v >> 8) & 0xFF)) }
        func le32(_ v: UInt32) { for shift in stride(from: 0, to: 32, by: 8) { zip.append(UInt8((v >> UInt32(shift)) & 0xFF)) } }
        le32(0x0403_4B50); le16(20); le16(0); le16(8); le16(0); le16(0); le32(3_800_740_418); le32(UInt32(payload.count)); le32(9005); le16(name.count); le16(0)
        zip.append(name); zip.append(payload)
        let cd = zip.count
        le32(0x0201_4B50); le16(20); le16(20); le16(0); le16(8); le16(0); le16(0); le32(3_800_740_418); le32(UInt32(payload.count)); le32(9005)
        le16(name.count); le16(0); le16(0); le16(0); le16(0); le32(0); le32(0); zip.append(name)
        let cdSize = zip.count - cd
        le32(0x0605_4B50); le16(0); le16(0); le16(1); le16(1); le32(UInt32(cdSize)); le32(UInt32(cd)); le16(0)
        let archive = try ZipArchive(data: zip)
        XCTAssertEqual(try archive.string("fox.txt"), InflateTests.text)
    }

    func testNotAZip() {
        XCTAssertThrowsError(try ZipArchive(data: Data("not a zip file at all, just text".utf8)))
    }
}

final class EPUBTests: XCTestCase {
    static func sampleSpec() -> EPUBSpec {
        let chapters = (1...3).map { i in
            EPUBChapter(label: "Chapter \(i)", title: "Title \(i)", html: "<p>" + String(repeating: "Words in chapter \(i) go here. ", count: 30) + "</p>")
        }
        return EPUBSpec(title: "A Test Book", author: "Ada Author", language: "en", identifier: "urn:isbn:9780000000001", publisher: "Press", description: "About it", subjects: ["Fiction"], chapters: chapters, coverSVG: CoverArt.svg(title: "A Test Book", author: "Ada Author"))
    }

    func testBuildAndParse() throws {
        let data = EPUBWriter.build(EPUBTests.sampleSpec())
        let archive = try ZipArchive(data: data)
        XCTAssertEqual(archive.names.first, "mimetype", "mimetype must be the first entry")
        XCTAssertEqual(archive.entries.first?.method, 0, "mimetype must be stored")
        let book = try EPUBBook(data: data)
        XCTAssertEqual(book.metadata.title, "A Test Book")
        XCTAssertEqual(book.metadata.authors, ["Ada Author"])
        XCTAssertEqual(book.metadata.identifier, "urn:isbn:9780000000001")
        XCTAssertEqual(book.metadata.publisher, "Press")
        XCTAssertEqual(book.metadata.subjects, ["Fiction"])
        XCTAssertEqual(book.spine.count, 5, "cover, title page and three chapters")
        XCTAssertEqual(book.toc.map(\.label), ["Chapter 1: Title 1", "Chapter 2: Title 2", "Chapter 3: Title 3"])
        XCTAssertEqual(book.toc.first?.href, "OEBPS/ch001.xhtml")
        XCTAssertEqual(book.coverPath, "OEBPS/cover.svg")
        XCTAssertEqual(book.coverImage()?.mediaType, "image/svg+xml")
        let words = book.wordCount()
        XCTAssertGreaterThan(words, 3 * 30 * 5, "\(words) words")
        XCTAssertTrue(book.text(ofSpineItem: 2).contains("Words in chapter 1 go here."))
    }

    func testNCXFallbackAndEPUB2Cover() throws {
        var w = ZipWriter()
        w.add("mimetype", "application/epub+zip")
        w.add("META-INF/container.xml", "<?xml version=\"1.0\"?><container xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\" version=\"1.0\"><rootfiles><rootfile full-path=\"content/book.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles></container>")
        w.add("content/book.opf", """
        <?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Old Book</dc:title><dc:creator>Someone</dc:creator><dc:creator>Else</dc:creator><dc:language>fr</dc:language><dc:identifier id="id">x-1</dc:identifier><meta name="cover" content="img"/></metadata>
        <manifest><item id="img" href="img/c.jpg" media-type="image/jpeg"/><item id="a" href="text/a.html" media-type="application/xhtml+xml"/><item id="b" href="text/b.html" media-type="application/xhtml+xml"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest>
        <spine toc="ncx"><itemref idref="a"/><itemref idref="b"/></spine></package>
        """)
        w.add("content/toc.ncx", "<?xml version=\"1.0\"?><ncx xmlns=\"http://www.daisy.org/z3986/2005/ncx/\"><navMap><navPoint id=\"n1\"><navLabel><text>One</text></navLabel><content src=\"text/a.html\"/><navPoint id=\"n2\"><navLabel><text>One &amp; a half</text></navLabel><content src=\"text/a.html#half\"/></navPoint></navPoint><navPoint id=\"n3\"><navLabel><text>Two</text></navLabel><content src=\"text/b.html\"/></navPoint></navMap></ncx>")
        w.add("content/text/a.html", "<html><body><h1>One</h1><p>alpha beta</p></body></html>")
        w.add("content/text/b.html", "<html><body><h1>Two</h1><p>gamma</p></body></html>")
        w.add("content/img/c.jpg", Data([0xFF, 0xD8, 0xFF, 0xE0]))
        let book = try EPUBBook(data: w.finish())
        XCTAssertEqual(book.metadata.author, "Someone, Else")
        XCTAssertEqual(book.metadata.language, "fr")
        XCTAssertEqual(book.spine, ["content/text/a.html", "content/text/b.html"])
        XCTAssertEqual(book.toc.map { "\($0.level):\($0.label)" }, ["0:One", "1:One & a half", "0:Two"])
        XCTAssertEqual(book.toc[1].href, "content/text/a.html#half")
        XCTAssertEqual(book.coverPath, "content/img/c.jpg")
        XCTAssertEqual(book.wordCount(), 5)
    }

    func testPaths() {
        XCTAssertEqual(Paths.resolve("OEBPS/text/", "../images/a%20b.png"), "OEBPS/images/a b.png")
        XCTAssertEqual(Paths.resolve("", "/abs/x.html#frag"), "abs/x.html")
        XCTAssertEqual(Paths.directory(of: "a/b/c.txt"), "a/b/")
        XCTAssertEqual(Paths.fileExtension("x/y.XHTML"), "xhtml")
        XCTAssertEqual(HTMLText.plainText("<p>Hello&nbsp;<b>world</b> &amp; more</p><script>x<y</script>"), "Hello\u{00A0}world & more\n")
    }
}

final class TextBookTests: XCTestCase {
    func testChaptersAndHeadings() {
        let text = """
        Title: The Test
        Author: Tess Ter

        CHAPTER I

        It was a bright cold day in April, and the clocks were striking thirteen.
        Winston Smith slipped quickly through the glass doors.

           Roses are red,
           violets are blue,
           this is a verse block.

        Chapter Two

        # Third heading in markdown

        Text with _emphasis_ and **strength** and a lone * star.
        """
        let chapters = TextBook.chapters(from: text)
        // A heading with nothing under it labels the chapter that follows ("Chapter Two" over the markdown heading).
        XCTAssertEqual(chapters.map { $0.title ?? "" }, ["CHAPTER I", "Third heading in markdown"])
        XCTAssertEqual(chapters.map { $0.label ?? "" }, ["", "Chapter Two"])
        guard chapters.count == 2 else { return XCTFail("expected two chapters") }
        XCTAssertTrue(chapters[0].html.contains("<p class=\"verse\">Roses are red,<br/>violets are blue,<br/>this is a verse block.</p>"), chapters[0].html)
        XCTAssertTrue(chapters[0].html.contains("<p>It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith slipped quickly through the glass doors.</p>"), chapters[0].html)
        XCTAssertTrue(chapters[1].html.contains("<em>emphasis</em>"), chapters[1].html)
        XCTAssertTrue(chapters[1].html.contains("<strong>strength</strong>"), chapters[1].html)
        XCTAssertTrue(chapters[1].html.contains("lone * star"), chapters[1].html)
        let guess = TextBook.guessTitleAuthor(fileName: "whatever.txt", text: text)
        XCTAssertEqual(guess.title, "The Test")
        XCTAssertEqual(guess.author, "Tess Ter")
    }

    func testFileNameGuess() {
        XCTAssertEqual(TextBook.guessTitleAuthor(fileName: "A Christmas Carol - Charles Dickens.txt", text: ""), TextBook.Guess(title: "A Christmas Carol", author: "Charles Dickens"))
        XCTAssertEqual(TextBook.guessTitleAuthor(fileName: "Jane Austen - Pride and Prejudice.txt", text: "").author, "Jane Austen")
        XCTAssertEqual(TextBook.guessTitleAuthor(fileName: "notes.md", text: ""), TextBook.Guess(title: "notes", author: "Unknown Author"))
    }

    func testWholeBookRoundTrip() throws {
        let built = TextBook.epub(fileName: "Sample - Some Author.txt", text: "CHAPTER 1\n\nHello there.\n\nCHAPTER 2\n\nGoodbye.\n")
        let book = try EPUBBook(data: built.data)
        XCTAssertEqual(book.metadata.title, "Sample")
        XCTAssertEqual(book.metadata.author, "Some Author")
        XCTAssertEqual(book.toc.map(\.label), ["CHAPTER 1", "CHAPTER 2"])
        XCTAssertNotNil(book.coverImage())
    }
}

final class LibraryStoreTests: XCTestCase {
    var dir: URL!

    override func setUpWithError() throws {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent("books-tests-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: dir)
    }

    func testImportEPUBTextAndCollections() throws {
        let store = LibraryStore(directory: dir.appendingPathComponent("Library"))
        let epubURL = dir.appendingPathComponent("test.epub")
        try EPUBWriter.build(EPUBTests.sampleSpec()).write(to: epubURL)
        guard case .added(let book) = try store.importFile(at: epubURL) else { return XCTFail("not added") }
        XCTAssertEqual(book.title, "A Test Book")
        XCTAssertEqual(book.kind, .epub)
        XCTAssertGreaterThan(book.words, 400)
        XCTAssertEqual(book.coverFile, "cover.svg")
        XCTAssertTrue(FileManager.default.fileExists(atPath: store.fileURL(for: book).path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: store.coverURL(for: book)!.path))
        guard case .duplicate(let same) = try store.importFile(at: epubURL) else { return XCTFail("duplicate not detected") }
        XCTAssertEqual(same.id, book.id)

        let textURL = dir.appendingPathComponent("Plain - Writer.txt")
        try "CHAPTER 1\n\nSome words here.\n".write(to: textURL, atomically: true, encoding: .utf8)
        guard case .added(let textBook) = try store.importFile(at: textURL) else { return XCTFail("text not added") }
        XCTAssertEqual(textBook.author, "Writer")
        XCTAssertEqual(textBook.kind, .epub)

        let collection = store.addCollection(named: "Favourites")
        store.add([book.id, textBook.id], to: collection.id)
        store.savePosition(ReadingPosition(locator: Locator(spine: 2, offset: 10), percent: 42), for: book.id)
        store.saveAnnotations([Annotation(kind: .highlight, locator: Locator(spine: 2, offset: 5), endOffset: 20, color: .yellow, text: "Words in", chapter: "Chapter 1")], for: book.id)
        store.recordReading(seconds: 600, pages: 3)

        // A second store on the same folder sees everything.
        let again = LibraryStore(directory: dir.appendingPathComponent("Library"))
        XCTAssertEqual(again.books.count, 2)
        XCTAssertEqual(again.collections.first?.bookIDs.count, 2)
        XCTAssertEqual(again.book(book.id)?.position?.percent, 42)
        XCTAssertEqual(again.annotations(for: book.id).first?.text, "Words in")
        XCTAssertEqual(again.stats.todaySeconds, 600)
        XCTAssertTrue(again.annotationsMarkdown().contains("> Words in"))

        again.remove([book.id])
        XCTAssertEqual(again.books.count, 1)
        XCTAssertFalse(FileManager.default.fileExists(atPath: again.folder(for: book.id).path))
        XCTAssertEqual(again.collections.first?.bookIDs, [textBook.id])
    }

    func testUnsupportedFile() throws {
        let store = LibraryStore(directory: dir.appendingPathComponent("Library"))
        let url = dir.appendingPathComponent("image.png")
        try Data([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0]).write(to: url)
        XCTAssertThrowsError(try store.importFile(at: url)) { error in
            XCTAssertTrue((error as? ImportError).map { if case .unsupportedType = $0 { return true } else { return false } } ?? false)
        }
    }

    func testStreak() {
        var stats = ReadingStats()
        let cal = Calendar.current
        let today = Date()
        for back in 0..<3 { stats.add(seconds: 600, on: cal.date(byAdding: .day, value: -back, to: today)!) }
        XCTAssertEqual(stats.streak(goalMinutes: 5), 3)
        XCTAssertEqual(stats.streak(goalMinutes: 15), 0)
        var gap = ReadingStats()
        gap.add(seconds: 600, on: cal.date(byAdding: .day, value: -1, to: today)!)
        gap.add(seconds: 600, on: cal.date(byAdding: .day, value: -2, to: today)!)
        XCTAssertEqual(gap.streak(goalMinutes: 5), 2, "a streak survives until the end of today")
        XCTAssertEqual(stats.recent(7).count, 7)
    }

    func testSettingsTolerateOldFiles() throws {
        let data = Data("{\"sort\":\"title\",\"unknown\":1,\"reader\":{\"theme\":\"paper\"}}".utf8)
        let settings = try JSONDecoder().decode(Settings.self, from: data)
        XCTAssertEqual(settings.sort, .title)
        XCTAssertEqual(settings.reader.theme, .paper)
        XCTAssertEqual(settings.reader.fontSize, 100)
        XCTAssertEqual(settings.reader.effectiveTheme(systemIsDark: true), .calm)
        XCTAssertEqual(ReaderSettings().effectiveTheme(systemIsDark: true), .focus)
    }
}
