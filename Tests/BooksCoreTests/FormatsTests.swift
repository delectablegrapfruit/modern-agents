import XCTest
#if canImport(CoreGraphics)
import CoreGraphics
#endif
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
        XCTAssertEqual(book.toc.dropFirst().first?.href, "content/text/a.html#half")
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

final class XMLTreeTests: XCTestCase {
    func testNamespacesEntitiesAndLookup() throws {
        let xml = """
        <?xml version="1.0" encoding="ISO-8859-1"?>
        <package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" unique-identifier="uid">
          <metadata><dc:title>Tom &amp; Jerry&nbsp;Go &copy; Home &amp; back</dc:title><dc:creator id="a">Ann</dc:creator><meta name="cover" content="c1"/></metadata>
          <manifest><item id="c1" href="img/c.jpg" media-type="image/jpeg"/><item id="x" href="a.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest>
          <nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><ol><li><a href="a.xhtml">One <span>two</span> &unknown; three</a></li></ol></nav>
          <extra><![CDATA[<raw>]]> tail</extra>
        </package>
        """
        let root = try XCTUnwrap(XMLTree.parse(Data(xml.utf8)))
        XCTAssertEqual(root.name, "package")
        XCTAssertEqual(root.attribute("unique-identifier"), "uid")
        let meta = try XCTUnwrap(root.child(named: "metadata"))
        XCTAssertEqual(meta.child(named: "title")?.textContent, "Tom & Jerry\u{00A0}Go © Home & back")
        XCTAssertEqual(meta.children(named: "creator").first?.attribute("id"), "a")
        XCTAssertEqual(meta.children(named: "meta").first?.attribute("content"), "c1")
        let items = root.descendants(named: "item")
        XCTAssertEqual(items.map { $0.attribute("href") ?? "" }, ["img/c.jpg", "a.xhtml"])
        XCTAssertEqual(items[1].attribute("media-type"), "application/xhtml+xml")
        let nav = try XCTUnwrap(root.child(named: "nav"))
        XCTAssertEqual(nav.attribute("type"), "toc", "prefixed attribute found by local name")
        XCTAssertEqual(HTMLText.collapse(nav.descendants(named: "a").first?.textContent ?? ""), "One two &unknown; three")
        XCTAssertEqual(root.child(named: "extra")?.text, "<raw> tail")
        XCTAssertNil(XMLTree.parse(Data("not xml at all".utf8)))
    }

    func testLatin1AndStrayAmpersand() throws {
        let latin1 = Data("<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?><r a=\"x\">caf\u{E9} & cr\u{E8}me</r>".unicodeScalars.map { UInt8($0.value) })
        let root = try XCTUnwrap(XMLTree.parse(latin1))
        XCTAssertEqual(root.text, "café & crème")
        XCTAssertEqual(root.attribute("a"), "x")
    }
}

final class CoverLayoutTests: XCTestCase {
    func testFitFillStretchAndCustom() {
        let box = CGSize(width: 200, height: 300)
        let wide = CGSize(width: 400, height: 200)
        let fit = CoverLayout.rect(image: wide, box: box, style: CoverStyle(fit: .fit))
        XCTAssertEqual(fit, CGRect(x: 0, y: 100, width: 200, height: 100), "a wide picture fitted is centred in the box")
        let tall = CoverLayout.rect(image: CGSize(width: 100, height: 400), box: box, style: CoverStyle(fit: .fit))
        XCTAssertEqual(tall, CGRect(x: 62.5, y: 0, width: 75, height: 300), "a tall picture fitted is centred across")
        XCTAssertEqual(CoverLayout.rect(image: CGSize(width: 0, height: 0), box: box, style: CoverStyle()), CGRect(x: 0, y: 0, width: 200, height: 300))
        let fill = CoverLayout.rect(image: wide, box: box, style: CoverStyle(fit: .fill))
        XCTAssertEqual(fill.height, 300, accuracy: 0.001)
        XCTAssertEqual(fill.width, 600, accuracy: 0.001)
        XCTAssertEqual(fill.midX, 100, accuracy: 0.001, "filling is centred")
        XCTAssertEqual(CoverLayout.rect(image: wide, box: box, style: CoverStyle(fit: .stretch)), CGRect(x: 0, y: 0, width: 200, height: 300))
        let custom = CoverLayout.rect(image: wide, box: box, style: CoverStyle(fit: .custom, frame: CoverFrame(x: -0.5, y: 0.25, width: 2, height: 0.5)))
        XCTAssertEqual(custom, CGRect(x: -100, y: 75, width: 400, height: 150))
        XCTAssertEqual(CoverLayout.rect(image: wide, box: box, style: CoverStyle(fit: .custom)), fill, "a custom placement starts as filling")
        XCTAssertEqual(CoverLayout.naturalHeight(image: CGSize(width: 100, height: 160), width: 100, style: CoverStyle()), 160)
        XCTAssertEqual(CoverLayout.naturalHeight(image: wide, width: 100, style: CoverStyle()), 120, "a fitted box is never flatter than 1.2")
        XCTAssertEqual(CoverLayout.naturalHeight(image: wide, width: 100, style: CoverStyle(fit: .fill)), 150)
        let clamped = CoverLayout.clamped(CoverFrame(x: 5, y: -9, width: 0.01, height: 40))
        XCTAssertEqual(clamped.width, 0.1)
        XCTAssertEqual(clamped.height, 20)
        XCTAssertEqual(clamped.x, 0.95)
        XCTAssertEqual(clamped.y, -9, "a placement inside the allowed range is left alone")
        let far = CoverLayout.clamped(CoverFrame(x: 0, y: -30, width: 1, height: 1))
        XCTAssertEqual(far.y, -0.95, accuracy: 0.0001, "a picture cannot be dragged wholly out of the box")
    }

    func testCoverStyleAndReadingCountsRoundTrip() throws {
        var book = Book(title: "T", author: "A", kind: .epub, fileName: "t.epub", fileSize: 1)
        book.coverStyle = CoverStyle(fit: .custom, frame: CoverFrame(x: 0.1, y: 0.2, width: 1.5, height: 1.2))
        book.secondsRead = 90
        book.pagesRead = 4
        let data = try JSONEncoder().encode(book)
        let back = try JSONDecoder().decode(Book.self, from: data)
        XCTAssertEqual(back.coverStyle, book.coverStyle)
        XCTAssertEqual(back.secondsRead, 90)
        XCTAssertEqual(back.pagesRead, 4)
        XCTAssertEqual(back.lengthInWords, 0)
        var pdf = book
        pdf.words = 0
        pdf.pageCount = 10
        XCTAssertEqual(pdf.lengthInWords, 3000, "a PDF's length counts 300 words a page")
        XCTAssertTrue(LibrarySort.title.ascendingByDefault)
        XCTAssertFalse(LibrarySort.timeRead.ascendingByDefault)
        XCTAssertEqual(LibrarySort.allCases.count, 7)
        XCTAssertEqual(Settings.clampedGridScale(9), 1.6)
        XCTAssertEqual(Settings.clampedGridScale(.nan), 1)
        let settings = try JSONDecoder().decode(Settings.self, from: Data("{}".utf8))
        XCTAssertEqual(settings.shelfGrouping, .collection)
        XCTAssertNil(settings.sortAscending)
        XCTAssertEqual(settings.gridScale, 1)
        XCTAssertEqual(settings.goals.monthlyBooks, 1)
        XCTAssertEqual(settings.goals.pages, 250)
        XCTAssertEqual(settings.goals.period, .week)
        XCTAssertEqual(settings.home.visible, HomeElement.allCases)
        XCTAssertTrue(settings.shelves.isEmpty)
        let legacy = try JSONDecoder().decode(Settings.self, from: Data(#"{"groupAllByCollection": false, "showGoals": false, "goals": {"dailyMinutes": 10, "yearlyBooks": 5}}"#.utf8))
        XCTAssertEqual(legacy.shelfGrouping, .none, "the grouping choice made under its earliest name is kept")
        XCTAssertFalse(legacy.home.isShown(.goals), "the old Home switch is kept")
        XCTAssertTrue(legacy.home.isShown(.statistics))
        XCTAssertEqual(legacy.goals.dailyMinutes, 10)
        XCTAssertEqual(legacy.goals.monthlyBooks, 1, "goals saved without a monthly one get the default")
        XCTAssertEqual(legacy.goals.chapters, 7)
        let later = try JSONDecoder().decode(Settings.self, from: Data(#"{"groupByCollection": false}"#.utf8))
        XCTAssertEqual(later.shelfGrouping, .none)
        let goals = try JSONDecoder().decode(ReadingGoals.self, from: JSONEncoder().encode(ReadingGoals(dailyMinutes: 7, yearlyBooks: 20, monthlyBooks: 3, pages: 100, chapters: 2, period: .quarter)))
        XCTAssertEqual(goals.monthlyBooks, 3)
        XCTAssertEqual(goals.period, .quarter)
        // A shelf's own choices travel with the settings; a version that knows other Home pieces keeps unknown names out.
        var chosen = Settings()
        chosen.shelves["collection:abc"] = ShelfSettings(view: .list, sort: .length, sortAscending: true, grouping: .genre)
        chosen.home = HomeSettings(order: [.statistics, .goals], hidden: [.activity])
        let back = try JSONDecoder().decode(Settings.self, from: JSONEncoder().encode(chosen))
        XCTAssertEqual(back.shelves["collection:abc"]?.sort, .length)
        XCTAssertEqual(back.shelves["collection:abc"]?.grouping, .genre)
        XCTAssertEqual(back.home.elements.prefix(3), [.statistics, .goals, .continueReading])
        XCTAssertEqual(back.home.hidden, [.activity])
        let odd = try JSONDecoder().decode(HomeSettings.self, from: Data(#"{"order": ["goals", "somethingNew"], "hidden": ["gone"]}"#.utf8))
        XCTAssertEqual(odd.order, [.goals])
        XCTAssertTrue(odd.hidden.isEmpty)
    }
}

final class CoverSwapTests: XCTestCase {
    func testReplaceAndRestoreCoverAndReadingCounts() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("books-cover-tests-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = LibraryStore(directory: dir.appendingPathComponent("Library"))
        let epubURL = dir.appendingPathComponent("test.epub")
        try EPUBWriter.build(EPUBTests.sampleSpec()).write(to: epubURL)
        guard case .added(let book) = try store.importFile(at: epubURL) else { return XCTFail("not added") }
        XCTAssertEqual(book.coverFile, "cover.svg")

        try store.replaceCover(with: Data([0xFF, 0xD8, 0xFF, 0xD9]), ext: "jpg", for: book.id)
        var swapped = store.book(book.id)!
        XCTAssertTrue(swapped.coverReplaced)
        XCTAssertEqual(swapped.originalCoverFile, "cover.svg")
        XCTAssertTrue(swapped.coverFile!.hasPrefix("cover-custom-"))
        XCTAssertTrue(FileManager.default.fileExists(atPath: store.coverURL(for: swapped)!.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: store.folder(for: book.id).appendingPathComponent("cover.svg").path), "the book's own cover stays on disk")

        // Another picture replaces the first; the original is still remembered.
        let firstFile = swapped.coverFile!
        try store.replaceCover(with: Data([0x89, 0x50, 0x4E, 0x47]), ext: "png", for: book.id)
        swapped = store.book(book.id)!
        XCTAssertEqual(swapped.originalCoverFile, "cover.svg")
        XCTAssertTrue(swapped.coverFile!.hasSuffix(".png"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: store.folder(for: book.id).appendingPathComponent(firstFile).path), "the picture replaced is removed")

        store.restoreCover(for: book.id)
        let restored = store.book(book.id)!
        XCTAssertFalse(restored.coverReplaced)
        XCTAssertEqual(restored.coverFile, "cover.svg")
        XCTAssertFalse(FileManager.default.fileExists(atPath: store.folder(for: book.id).appendingPathComponent(swapped.coverFile!).path))

        // Finishing a book counts for the month and the year it was finished in.
        let now = Date(), calendar = Calendar.current
        let month = calendar.component(.month, from: now), year = calendar.component(.year, from: now)
        XCTAssertEqual(store.booksFinished(inMonth: month, year: year), 0)
        store.setFinished(book.id, true)
        XCTAssertEqual(store.booksFinished(inMonth: month, year: year), 1)
        XCTAssertEqual(store.booksFinished(inYear: year), 1)
        XCTAssertEqual(store.booksFinished(inMonth: month == 1 ? 12 : month - 1, year: month == 1 ? year - 1 : year), 0)
        store.setFinished(book.id, false)

        // Reading counts land on the book as well as in the statistics, and survive a reload.
        store.recordReading(seconds: 60, pages: 2, chapters: 1, in: book.id)
        store.recordReading(seconds: 30, in: book.id)
        XCTAssertEqual(store.book(book.id)?.secondsRead, 90)
        XCTAssertEqual(store.book(book.id)?.pagesRead, 2)
        XCTAssertEqual(store.book(book.id)?.chaptersRead, 1)
        XCTAssertEqual(store.stats.totalSeconds, 90)
        XCTAssertEqual(store.stats.totalChapters, 1)
        let again = LibraryStore(directory: dir.appendingPathComponent("Library"))
        XCTAssertEqual(again.book(book.id)?.secondsRead, 90)
        XCTAssertEqual(again.book(book.id)?.coverFile, "cover.svg")
        XCTAssertEqual(again.stats.totalChapters, 1)

        // The title and author the file came with come back after a rename.
        var renamed = store.book(book.id)!
        renamed.title = "Something Else"
        renamed.author = "Nobody"
        store.update(renamed)
        let original = store.originalDetails(for: store.book(book.id)!)
        XCTAssertEqual(original.title, "A Test Book")
        XCTAssertEqual(original.author, book.author)
    }
}

final class HomeDataTests: XCTestCase {
    func testGenresFromSubjects() {
        XCTAssertEqual(Genres.genres(for: ["Science Fiction"]), ["Science Fiction"])
        XCTAssertEqual(Genres.genres(for: ["FICTION / Science Fiction / Space Opera"]), ["Science Fiction"], "the generic Fiction gives way to the particular")
        XCTAssertEqual(Genres.genres(for: ["sci-fi", "Adventure stories"]), ["Science Fiction", "Adventure"])
        XCTAssertEqual(Genres.genres(for: ["Detective and mystery stories"]), ["Mystery & Crime"])
        XCTAssertEqual(Genres.genres(for: ["Fiction"]), ["Fiction"])
        XCTAssertEqual(Genres.genres(for: ["Cooking -- Italian"]), ["Cooking & Food"])
        XCTAssertEqual(Genres.genres(for: ["Martial arts"]), [], "a word inside another word is not a match")
        XCTAssertEqual(Genres.genres(for: ["Art"]), ["Art & Design"])
        XCTAssertEqual(Genres.genres(for: ["Biography & Autobiography / Personal Memoirs", "History / Europe"]), ["Biography & Memoir", "History"])
        XCTAssertEqual(Genres.genres(for: []), [])
        XCTAssertEqual(Genres.genres(for: ["Something nobody classifies"]), [])
        XCTAssertEqual(Set(Genres.all).count, Genres.all.count, "genre names are distinct")
    }

    func testGoalPeriodsAndTotals() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        calendar.firstWeekday = 2
        var c = DateComponents()
        c.year = 2026; c.month = 9; c.day = 8; c.hour = 12
        let date = calendar.date(from: c)!
        let week = GoalPeriod.week.interval(containing: date, calendar: calendar)
        XCTAssertEqual(calendar.component(.day, from: week.start), 7, "the week starts on Monday the 7th")
        XCTAssertEqual(calendar.dateComponents([.day], from: week.start, to: week.end).day, 7)
        let month = GoalPeriod.month.interval(containing: date, calendar: calendar)
        XCTAssertEqual(calendar.component(.day, from: month.start), 1)
        XCTAssertEqual(calendar.component(.month, from: month.end), 10)
        let quarter = GoalPeriod.quarter.interval(containing: date, calendar: calendar)
        XCTAssertEqual(calendar.component(.month, from: quarter.start), 7)
        XCTAssertEqual(calendar.component(.month, from: quarter.end), 10)
        XCTAssertEqual(GoalPeriod.year.days(containing: date, calendar: calendar), 365)

        var stats = ReadingStats()
        stats.add(seconds: 600, pages: 10, chapters: 1, on: date)
        stats.add(seconds: 300, pages: 5, on: calendar.date(byAdding: .day, value: -1, to: date)!)
        stats.add(seconds: 1200, pages: 20, chapters: 2, on: calendar.date(byAdding: .day, value: -10, to: date)!)
        XCTAssertEqual(ReadingStats.date(fromKey: "2026-09-08", calendar: calendar), calendar.startOfDay(for: date))
        let thisWeek = stats.totals(in: .week, containing: date, calendar: calendar)
        XCTAssertEqual(thisWeek.pages, 15)
        XCTAssertEqual(thisWeek.chapters, 1)
        XCTAssertEqual(stats.totals(in: .month, containing: date, calendar: calendar).seconds, 1500, "the 29th of August is not this month")
        XCTAssertEqual(stats.totals(in: .quarter, containing: date, calendar: calendar).pages, 35)
        XCTAssertEqual(stats.totalChapters, 3)
        XCTAssertEqual(stats.activeDays, 3)
        XCTAssertEqual(stats.bestDay?.seconds, 1200)
        XCTAssertEqual(stats.longestStreak(goalMinutes: 5, calendar: calendar), 2)
        XCTAssertEqual(stats.longestStreak(goalMinutes: 15, calendar: calendar), 1)
        let days = stats.month(containing: date, calendar: calendar)
        XCTAssertEqual(days.count, 30)
        XCTAssertEqual(days.first?.day, "2026-09-01")
        XCTAssertEqual(days[7].pages, 10)
        let weeks = stats.weeks(3, ending: date, calendar: calendar)
        XCTAssertEqual(weeks.count, 3)
        XCTAssertEqual(weeks.last?.count, 7)
        XCTAssertEqual(weeks.last?.first?.day, "2026-09-07")
        XCTAssertEqual(weeks.last?[1].pages, 10)

        // Days saved before chapters were counted still load.
        let old = try JSONDecoder().decode(DailyReading.self, from: Data(#"{"day": "2026-01-01", "seconds": 5, "pages": 1}"#.utf8))
        XCTAssertEqual(old.chapters, 0)
    }

    func testHomeSettingsMoves() {
        var home = HomeSettings()
        home.move(fromOffsets: IndexSet(integer: 0), toOffset: 3)
        XCTAssertEqual(home.elements.prefix(3), [.pickUpAgain, .goals, .continueReading])
        home.setShown(.calendar, false)
        home.setShown(.calendar, false)
        XCTAssertEqual(home.hidden, [.calendar], "hiding twice hides once")
        XCTAssertFalse(home.visible.contains(.calendar))
        home.setShown(.calendar, true)
        XCTAssertTrue(home.hidden.isEmpty)
        let partial = HomeSettings(order: [.statistics])
        XCTAssertEqual(partial.elements.first, .statistics)
        XCTAssertEqual(partial.elements.count, HomeElement.allCases.count, "pieces the order does not name follow it")
    }
}
