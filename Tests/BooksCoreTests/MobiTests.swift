import XCTest
@testable import BooksCore

/// Conversion tests against real Kindle files. The fixtures are the libmobi project's test samples, which between
/// them cover every path the converter has: MOBI 7 with cp1252 text, a dictionary, hybrid MOBI7+KF8 files with an
/// NCX index, multimedia, HUFF/CDIC and uncompressed text, a pure KF8 file with obfuscated fonts, an old
/// TEXtREAd book, and two DRM-protected files.
///
/// They are not checked into the repository, so every test skips cleanly when they are not there. Point
/// `BOOKS_FIXTURES` at a directory of `.mobi` files to run them from somewhere else.
final class MobiTests: XCTestCase {

    // MARK: - Fixtures

    private static let fixtureDirectory: URL? = {
        var candidates: [String] = []
        if let fromEnvironment = ProcessInfo.processInfo.environment["BOOKS_FIXTURES"], !fromEnvironment.isEmpty {
            candidates.append(fromEnvironment)
        }
        candidates.append("/home/user/bfabiszewski/libmobi/tests/samples")
        // <repo>/Tests/BooksCoreTests/MobiTests.swift → <repo>/Tests/Fixtures/mobi
        let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        candidates.append(repo.appendingPathComponent("Tests/Fixtures/mobi").path)
        for path in candidates {
            var isDirectory: ObjCBool = false
            guard FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory), isDirectory.boolValue else { continue }
            let files = (try? FileManager.default.contentsOfDirectory(atPath: path)) ?? []
            if files.contains(where: { $0.hasSuffix(".mobi") || $0.hasSuffix(".azw3") }) {
                return URL(fileURLWithPath: path, isDirectory: true)
            }
        }
        return nil
    }()

    /// The samples that are worth asserting something specific about, and what that something is.
    private struct Expectation {
        var isDRM = false
        var title: String?
        var authors: [String]?
        var language: String?
        var isKF8: Bool?
        /// The cover should be there and should start with these bytes.
        var coverMagic: [UInt8]?
        var minimumTextFiles = 1
        var expectsImages = false
        var expectsFonts = false
        var tocLabels: [String]?
        var tocCount: Int?
        /// Very large sample; run it only when the caller asks for the slow tests.
        var isSlow = false
    }

    private static let expectations: [String: Expectation] = [
        "sample-cp1252.mobi": Expectation(
            title: "Libmobi test sample", authors: ["Bartek Fabiszewski"], language: "en", isKF8: false,
            coverMagic: [0xFF, 0xD8], minimumTextFiles: 4, expectsImages: true),
        "sample-dict-infl2.mobi": Expectation(
            title: "Libmobi sample file", authors: ["Bartek Fabiszewski"], language: "pl", isKF8: false),
        "sample-dict-fileversion4.mobi": Expectation(
            title: "Free Online Computing Dictionary", authors: ["Mobipocket.com"], isKF8: false, isSlow: true),
        "sample-ncx.mobi": Expectation(
            title: "libmobi ncx test", language: "en", isKF8: true, minimumTextFiles: 3,
            tocLabels: ["Test chapter 1", "Test chapter 2", "Test subchapter 2-1", "Test subchapter 2-2"],
            tocCount: 4),
        "sample-multimedia.mobi": Expectation(
            title: "Libmobi test sample", authors: ["Bartek Fabiszewski"], language: "en-us", isKF8: true,
            coverMagic: [0xFF, 0xD8], minimumTextFiles: 2, expectsImages: true),
        "sample-unicode-huffdic.mobi": Expectation(
            title: "Libmobi", authors: ["Bartek Fabiszewski"], language: "en-us", isKF8: true,
            coverMagic: [0xFF, 0xD8], minimumTextFiles: 2, expectsImages: true),
        "sample-unicode-uncompressed.mobi": Expectation(
            title: "Libmobi test sample", authors: ["Bartek Fabiszewski"], language: "en-us", isKF8: true,
            coverMagic: [0xFF, 0xD8], minimumTextFiles: 2, expectsImages: true),
        "sample-obfuscated-fonts.mobi": Expectation(
            title: "font", authors: ["Unknown"], language: "en", isKF8: true, expectsFonts: true),
        "sample-textread.mobi": Expectation(
            title: "Libmobi test sample", isKF8: false, expectsImages: true),
        "sample-drm-v1.mobi": Expectation(isDRM: true),
        "sample-drm_pidLTKULBB^5V-v2.mobi": Expectation(isDRM: true),
    ]

    private func fixture(_ name: String) throws -> Data {
        guard let directory = MobiTests.fixtureDirectory else {
            throw XCTSkip("No Kindle fixtures; set BOOKS_FIXTURES to a directory of .mobi files.")
        }
        let url = directory.appendingPathComponent(name)
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw XCTSkip("Fixture \(name) is not in \(directory.path)")
        }
        return try Data(contentsOf: url)
    }

    private func fixtureNames() throws -> [String] {
        guard let directory = MobiTests.fixtureDirectory else {
            throw XCTSkip("No Kindle fixtures; set BOOKS_FIXTURES to a directory of .mobi files.")
        }
        let files = try FileManager.default.contentsOfDirectory(atPath: directory.path)
        return files.filter { $0.hasSuffix(".mobi") || $0.hasSuffix(".azw3") }.sorted()
    }

    private var runsSlowTests: Bool {
        let value = ProcessInfo.processInfo.environment["BOOKS_SLOW_TESTS"] ?? ""
        return value == "1" || value.lowercased() == "true"
    }

    // MARK: - Helpers

    /// The book's content documents, in archive order. Kindle conversions put them under `OEBPS/text/`; the
    /// plain-text branch hands off to the shared EPUB writer, which puts them straight in `OEBPS/`.
    private func textFiles(_ archive: ZipArchive) -> [String] {
        archive.names.filter { $0.hasPrefix("OEBPS/") && $0.hasSuffix(".xhtml") && !$0.hasSuffix("/nav.xhtml") }
    }

    private func wordCount(_ archive: ZipArchive) throws -> Int {
        var words = 0
        for name in textFiles(archive) {
            let text = try archive.string(name)
            words += MobiTests.plainWords(text).count
        }
        return words
    }

    /// Tags out, entities left alone: we only ever compare one book's count against another's.
    private static func plainWords(_ xhtml: String) -> [String] {
        var stripped = ""
        stripped.reserveCapacity(xhtml.count)
        var inTag = false
        for ch in xhtml {
            if ch == "<" { inTag = true; stripped.append(" ") } else if ch == ">" { inTag = false } else if !inTag {
                stripped.append(ch)
            }
        }
        return stripped.split(whereSeparator: { $0.isWhitespace }).map(String.init)
    }

    private struct NavEntry {
        let href: String
        let label: String
    }

    /// The hrefs and labels of the `<a>` elements inside the navigation document, nested entries included.
    private func navEntries(_ archive: ZipArchive) throws -> [NavEntry] {
        let nav = try archive.string("OEBPS/nav.xhtml")
        var entries: [NavEntry] = []
        var rest = Substring(nav)
        while let open = rest.range(of: "<a href=\"") {
            rest = rest[open.upperBound...]
            guard let closeQuote = rest.firstIndex(of: "\"") else { break }
            let href = String(rest[rest.startIndex..<closeQuote])
            rest = rest[closeQuote...]
            guard let tagEnd = rest.firstIndex(of: ">") else { break }
            rest = rest[rest.index(after: tagEnd)...]
            guard let labelEnd = rest.range(of: "</a>") else { break }
            let label = String(rest[rest.startIndex..<labelEnd.lowerBound])
            rest = rest[labelEnd.upperBound...]
            entries.append(NavEntry(href: href, label: label))
        }
        return entries
    }

    private func assertWellFormedEPUB(_ book: ConvertedBook, name: String, expectation: Expectation) throws {
        let archive = try ZipArchive(data: book.epub)
        // The mimetype entry has to come first for a reader to recognise the file without unzipping it all.
        XCTAssertEqual(archive.entries.first?.name, "mimetype", "\(name): mimetype is not the first entry")
        let mimetype = try archive.string("mimetype")
        XCTAssertEqual(mimetype, "application/epub+zip", "\(name): wrong mimetype")
        XCTAssertTrue(archive.contains("META-INF/container.xml"), "\(name): no container.xml")
        XCTAssertTrue(archive.contains("OEBPS/content.opf"), "\(name): no content.opf")
        XCTAssertTrue(archive.contains("OEBPS/nav.xhtml"), "\(name): no navigation document")
        XCTAssertTrue(archive.contains("OEBPS/toc.ncx"), "\(name): no NCX")

        let container = try archive.string("META-INF/container.xml")
        XCTAssertTrue(container.contains("OEBPS/content.opf"), "\(name): container.xml does not point at the OPF")

        let texts = textFiles(archive)
        XCTAssertGreaterThanOrEqual(texts.count, expectation.minimumTextFiles,
                                    "\(name): expected at least \(expectation.minimumTextFiles) text documents, got \(texts.count)")

        let opf = try archive.string("OEBPS/content.opf")
        XCTAssertTrue(opf.contains("<dc:title>"), "\(name): the OPF has no title")
        XCTAssertTrue(opf.contains("<dc:language>"), "\(name): the OPF has no language")
        // Everything in the manifest must actually be in the archive.
        for href in MobiTests.manifestHrefs(opf) {
            XCTAssertTrue(archive.contains("OEBPS/" + href), "\(name): \(href) is in the manifest but not in the archive")
        }
        // And every spine item must be in the manifest.
        let manifestIDs = Set(MobiTests.manifestIDs(opf))
        for idref in MobiTests.spineIDRefs(opf) {
            XCTAssertTrue(manifestIDs.contains(idref), "\(name): spine references unknown item \(idref)")
        }

        if let title = expectation.title {
            XCTAssertEqual(book.title, title, "\(name): title")
            XCTAssertTrue(opf.contains(">" + XHTML.escape(title) + "<"), "\(name): the OPF title does not match")
        }
        if let authors = expectation.authors { XCTAssertEqual(book.authors, authors, "\(name): authors") }
        if let language = expectation.language { XCTAssertEqual(book.language, language, "\(name): language") }
        if let isKF8 = expectation.isKF8 { XCTAssertEqual(book.isKF8, isKF8, "\(name): KF8 flag") }

        if let magic = expectation.coverMagic {
            let cover = try XCTUnwrap(book.cover, "\(name): expected a cover image")
            XCTAssertGreaterThan(cover.count, 1000, "\(name): the cover is suspiciously small")
            XCTAssertEqual([UInt8](cover.prefix(magic.count)), magic, "\(name): the cover is not the expected format")
            XCTAssertEqual(book.coverMediaType, "image/jpeg", "\(name): cover media type")
            XCTAssertTrue(archive.names.contains(where: { $0.hasPrefix("OEBPS/images/cover.") }),
                          "\(name): no cover in the archive")
            XCTAssertTrue(archive.contains("OEBPS/text/cover.xhtml"), "\(name): no cover page")
            XCTAssertTrue(opf.contains("properties=\"cover-image\""), "\(name): the cover is not marked in the OPF")
        }
        if expectation.expectsImages {
            let images = archive.names.filter { $0.hasPrefix("OEBPS/images/") }
            XCTAssertFalse(images.isEmpty, "\(name): expected embedded images")
        }
        if expectation.expectsFonts {
            let fonts = archive.names.filter { $0.hasPrefix("OEBPS/fonts/") }
            XCTAssertFalse(fonts.isEmpty, "\(name): expected embedded fonts")
            // A de-obfuscated font has to start with a real font magic, not the scrambled bytes.
            for font in fonts {
                let head = try archive.data(font)
                let bytes = [UInt8](head.prefix(4))
                let isOTF = bytes == Array("OTTO".utf8)
                let isTTF = bytes == [0x00, 0x01, 0x00, 0x00] || bytes == Array("true".utf8)
                let isWOFF = bytes == Array("wOFF".utf8)
                XCTAssertTrue(isOTF || isTTF || isWOFF, "\(name): \(font) does not look like a font (\(bytes))")
            }
        }

        if let count = expectation.tocCount {
            let entries = try navEntries(archive)
            XCTAssertEqual(entries.count, count, "\(name): table of contents size")
        }
        if let labels = expectation.tocLabels {
            let found = try navEntries(archive).map(\.label)
            for label in labels {
                XCTAssertTrue(found.contains(label), "\(name): the table of contents is missing \(label): \(found)")
            }
        }

        // Every text document must parse as XML, which is what an EPUB reader will demand of it.
        for file in texts.prefix(40) {
            let xhtml = try archive.string(file)
            XCTAssertTrue(xhtml.hasPrefix("<?xml"), "\(name): \(file) does not start with an XML declaration")
            XCTAssertTrue(xhtml.contains("http://www.w3.org/1999/xhtml"), "\(name): \(file) is not in the XHTML namespace")
            XCTAssertFalse(xhtml.contains("<script"), "\(name): \(file) still contains a script")
        }
    }

    private static func manifestHrefs(_ opf: String) -> [String] {
        attributeValues(opf, tag: "<item ", attribute: "href=\"")
    }

    private static func manifestIDs(_ opf: String) -> [String] {
        attributeValues(opf, tag: "<item ", attribute: "id=\"")
    }

    private static func spineIDRefs(_ opf: String) -> [String] {
        attributeValues(opf, tag: "<itemref ", attribute: "idref=\"")
    }

    private static func attributeValues(_ xml: String, tag: String, attribute: String) -> [String] {
        var out: [String] = []
        var rest = Substring(xml)
        while let start = rest.range(of: tag) {
            rest = rest[start.upperBound...]
            guard let tagEnd = rest.firstIndex(of: ">") else { break }
            let element = rest[rest.startIndex..<tagEnd]
            if let attributeStart = element.range(of: attribute) {
                let value = element[attributeStart.upperBound...]
                if let quote = value.firstIndex(of: "\"") { out.append(String(value[value.startIndex..<quote])) }
            }
            rest = rest[tagEnd...]
        }
        return out
    }

    // MARK: - Tests

    func testIsKindleRecognisesEveryFixture() throws {
        for name in try fixtureNames() {
            let data = try fixture(name)
            XCTAssertTrue(KindleBook.isKindle(data), "\(name) should be recognised as a Kindle file")
        }
    }

    func testIsKindleRejectsOtherFiles() {
        XCTAssertFalse(KindleBook.isKindle(Data()))
        XCTAssertFalse(KindleBook.isKindle(Data(repeating: 0, count: 200)))
        XCTAssertFalse(KindleBook.isKindle(Data("PK\u{03}\u{04}".utf8) + Data(repeating: 0, count: 200)))
        // An EPUB is a ZIP, and must not be mistaken for a Kindle book.
        var zip = ZipWriter()
        zip.add("mimetype", "application/epub+zip")
        XCTAssertFalse(KindleBook.isKindle(zip.finish()))
    }

    /// The heart of the suite: convert every sample and check the EPUB that comes out.
    func testConvertsEveryFixture() throws {
        var converted = 0
        for name in try fixtureNames() {
            let expectation = MobiTests.expectations[name] ?? Expectation()
            if expectation.isSlow && !runsSlowTests { continue }
            let data = try fixture(name)

            if expectation.isDRM {
                XCTAssertThrowsError(try KindleBook.convertToEPUB(data), "\(name) should be refused as DRM-protected") { error in
                    XCTAssertEqual(error as? KindleError, .drm, "\(name): wrong error")
                    let message = (error as? KindleError)?.errorDescription ?? ""
                    XCTAssertTrue(message.contains("DRM"), "\(name): the error should mention DRM")
                }
                converted += 1
                continue
            }

            let book: ConvertedBook
            do {
                book = try KindleBook.convertToEPUB(data)
            } catch {
                XCTFail("\(name) failed to convert: \(error)")
                continue
            }
            try assertWellFormedEPUB(book, name: name, expectation: expectation)
            converted += 1
        }
        XCTAssertGreaterThan(converted, 0, "no fixtures were converted")
    }

    /// The metadata a library shows before anyone opens the book.
    func testMetadataOfTheCP1252Sample() throws {
        let book = try KindleBook.convertToEPUB(try fixture("sample-cp1252.mobi"))
        XCTAssertEqual(book.title, "Libmobi test sample")
        XCTAssertEqual(book.authors, ["Bartek Fabiszewski"])
        XCTAssertEqual(book.language, "en")
        XCTAssertFalse(book.isKF8)
        XCTAssertEqual(book.coverMediaType, "image/jpeg")

        let archive = try ZipArchive(data: book.epub)
        let opf = try archive.string("OEBPS/content.opf")
        XCTAssertTrue(opf.contains("<dc:publisher>Libmobi project</dc:publisher>"), "the publisher should survive")
        XCTAssertTrue(opf.contains("Converted from Kindle MOBI"))

        // Windows-1252 text has to come out as the right characters, not as mojibake.
        var text = ""
        for file in textFiles(archive) { text += try archive.string(file) }
        XCTAssertFalse(text.contains("\u{FFFD}"), "the cp1252 text decoded with replacement characters")
        XCTAssertTrue(text.contains("libmobi"), "the sample text is missing")
    }

    /// The same book stored two ways must produce the same reading matter.
    func testHuffdicAndUncompressedAgree() throws {
        let huffdic = try KindleBook.convertToEPUB(try fixture("sample-unicode-huffdic.mobi"))
        let uncompressed = try KindleBook.convertToEPUB(try fixture("sample-unicode-uncompressed.mobi"))

        let a = try wordCount(ZipArchive(data: huffdic.epub))
        let b = try wordCount(ZipArchive(data: uncompressed.epub))
        XCTAssertGreaterThan(a, 1000, "the HUFF/CDIC book decompressed to almost nothing")
        XCTAssertGreaterThan(b, 1000, "the uncompressed book came out almost empty")
        let difference = Double(abs(a - b)) / Double(max(a, b))
        XCTAssertLessThanOrEqual(difference, 0.01,
                                 "HUFF/CDIC and uncompressed word counts differ by more than 1% (\(a) vs \(b))")

        XCTAssertEqual(huffdic.isKF8, uncompressed.isKF8)
        XCTAssertEqual(huffdic.authors, uncompressed.authors)
    }

    /// A KF8 book with a real NCX index: the table of contents must come out nested and complete.
    func testNCXTableOfContents() throws {
        let book = try KindleBook.convertToEPUB(try fixture("sample-ncx.mobi"))
        XCTAssertTrue(book.isKF8)
        let archive = try ZipArchive(data: book.epub)
        let entries = try navEntries(archive)
        XCTAssertEqual(entries.count, 4, "expected four entries, got \(entries.map(\.label))")
        let labels = entries.map(\.label)
        XCTAssertTrue(labels.contains("Test subchapter 2-1"), "missing 'Test subchapter 2-1' in \(labels)")
        XCTAssertTrue(labels.contains("Test chapter 1"))
        XCTAssertTrue(labels.contains("Test chapter 2"))

        // The nesting is what makes it a table of contents rather than a list.
        let nav = try archive.string("OEBPS/nav.xhtml")
        XCTAssertTrue(nav.contains("<ol><li>"), "the nav document should be a list")
        XCTAssertTrue(nav.contains("</ol></li>"), "the sub-chapters should be nested inside their chapter")

        // Every target must resolve to a document that is in the book, and to an id that is in that document.
        for entry in entries {
            let parts = entry.href.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)
            let file = "OEBPS/" + String(parts[0])
            XCTAssertTrue(archive.contains(file), "the TOC points at \(file), which is not in the book")
            if parts.count > 1, archive.contains(file) {
                let document = try archive.string(file)
                XCTAssertTrue(document.contains("\"\(parts[1])\""), "\(file) has no anchor \(parts[1])")
            }
        }

        let ncx = try archive.string("OEBPS/toc.ncx")
        XCTAssertEqual(ncx.components(separatedBy: "<navPoint").count - 1, 4, "the NCX should mirror the nav document")
    }

    /// The KF8 half of a hybrid file is the one worth reading, and its resources are numbered from the first
    /// header's resource start.
    func testHybridFilesUseTheirKF8Half() throws {
        for name in ["sample-multimedia.mobi", "sample-unicode-huffdic.mobi", "sample-unicode-uncompressed.mobi"] {
            let book = try KindleBook.convertToEPUB(try fixture(name))
            XCTAssertTrue(book.isKF8, "\(name) should convert from its KF8 half")
            let archive = try ZipArchive(data: book.epub)
            XCTAssertTrue(archive.names.contains(where: { $0.hasPrefix("OEBPS/text/part") }),
                          "\(name): KF8 sections should be named part*.xhtml")
            // The cover comes from the resource area the first header describes; if we used the wrong base it
            // would not be a JPEG.
            let cover = try XCTUnwrap(book.cover, "\(name): no cover")
            XCTAssertEqual([UInt8](cover.prefix(2)), [0xFF, 0xD8], "\(name): the cover is not a JPEG")
        }
    }

    /// Multimedia records become real files rather than being dropped.
    func testMultimediaResources() throws {
        let book = try KindleBook.convertToEPUB(try fixture("sample-multimedia.mobi"))
        let archive = try ZipArchive(data: book.epub)
        let resources = archive.names.filter { $0.hasPrefix("OEBPS/images/res") }
        XCTAssertGreaterThanOrEqual(resources.count, 2, "expected the image and the media records: \(resources)")
        let hasMedia = resources.contains(where: { $0.hasSuffix(".mp4") }) || resources.contains(where: { $0.hasSuffix(".mp3") })
        XCTAssertTrue(hasMedia, "expected an audio or video record in \(resources)")
    }

    /// Obfuscated fonts are XOR-scrambled and zlib-compressed; both have to be undone.
    func testObfuscatedFonts() throws {
        let book = try KindleBook.convertToEPUB(try fixture("sample-obfuscated-fonts.mobi"))
        XCTAssertTrue(book.isKF8)
        let archive = try ZipArchive(data: book.epub)
        let fonts = archive.names.filter { $0.hasPrefix("OEBPS/fonts/") }
        XCTAssertFalse(fonts.isEmpty, "no fonts came out of the book")
        for font in fonts {
            let bytes = try archive.data(font)
            XCTAssertGreaterThan(bytes.count, 200, "\(font) is too small to be a font")
            let magic = [UInt8](bytes.prefix(4))
            XCTAssertTrue(magic == Array("OTTO".utf8) || magic == [0x00, 0x01, 0x00, 0x00] || magic == Array("true".utf8)
                          || magic == Array("wOFF".utf8), "\(font) starts with \(magic)")
        }
        // Its flows carry the stylesheets, which should become real CSS files.
        let styles = archive.names.filter { $0.hasPrefix("OEBPS/styles/") }
        XCTAssertFalse(styles.isEmpty, "the KF8 flows should have produced stylesheets")
    }

    /// The old PalmDOC container, which in this sample holds Mobipocket HTML rather than plain text.
    func testTEXtREAdSample() throws {
        let book = try KindleBook.convertToEPUB(try fixture("sample-textread.mobi"))
        XCTAssertFalse(book.isKF8)
        XCTAssertEqual(book.title, "Libmobi test sample")
        let archive = try ZipArchive(data: book.epub)
        XCTAssertEqual(archive.entries.first?.name, "mimetype")
        let words = try wordCount(archive)
        XCTAssertGreaterThan(words, 1000, "the PalmDOC text did not come through")
    }

    /// A DRM file must fail with an explanation a reader can show, not with a corrupt book.
    func testDRMFilesAreRefused() throws {
        for name in ["sample-drm-v1.mobi", "sample-drm_pidLTKULBB^5V-v2.mobi"] {
            let data = try fixture(name)
            XCTAssertTrue(KindleBook.isKindle(data), "\(name) is still a Kindle file")
            XCTAssertThrowsError(try KindleBook.convertToEPUB(data)) { error in
                XCTAssertEqual(error as? KindleError, .drm, "\(name)")
                XCTAssertEqual((error as? KindleError)?.errorDescription,
                               "This book is protected by DRM and can’t be opened. Only DRM-free Kindle files are supported.",
                               "\(name): the message a reader shows")
            }
        }
    }

    /// Truncated and mangled files have to throw rather than crash: a book is untrusted input.
    func testCorruptInputThrows() throws {
        XCTAssertThrowsError(try KindleBook.convertToEPUB(Data()))
        XCTAssertThrowsError(try KindleBook.convertToEPUB(Data(repeating: 0, count: 64)))
        XCTAssertThrowsError(try KindleBook.convertToEPUB(Data("not a book at all, just some text".utf8)))

        // A real book cut short in a few places: each has to end in an error, never a trap.
        let data = try fixture("sample-cp1252.mobi")
        for fraction in [0.02, 0.1, 0.5, 0.9] {
            let truncated = data.prefix(Int(Double(data.count) * fraction))
            _ = try? KindleBook.convertToEPUB(Data(truncated))
        }
        // A valid header with the record table scribbled over.
        var mangled = [UInt8](data)
        for i in 78..<min(mangled.count, 200) { mangled[i] = 0xFF }
        _ = try? KindleBook.convertToEPUB(Data(mangled))
    }

    /// The one file libmobi ships as a known-bad index still has readable text in it.
    func testFileWithInvalidIndex() throws {
        guard let directory = MobiTests.fixtureDirectory else { throw XCTSkip("No Kindle fixtures") }
        let url = directory.appendingPathComponent("sample-invalid-indx.fail")
        guard FileManager.default.fileExists(atPath: url.path) else { throw XCTSkip("no sample-invalid-indx.fail") }
        let data = try Data(contentsOf: url)
        // Either it converts or it throws a KindleError; what it must not do is crash.
        if let book = try? KindleBook.convertToEPUB(data) {
            let archive = try ZipArchive(data: book.epub)
            XCTAssertEqual(archive.entries.first?.name, "mimetype")
            let words = try wordCount(archive)
            XCTAssertGreaterThan(words, 100)
        }
    }
}
