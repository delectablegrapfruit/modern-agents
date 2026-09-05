import AppKit
import WebKit
import BooksCore

/// Serves the reader page, its scripts and the current book to the web view under `books-reader://app/…`.
/// Everything comes from the app bundle or the library folder; the page never reaches the network.
final class BooksSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "books-reader"
    static let pageURL = URL(string: "books-reader://app/reader.html")!
    static let bookURLString = "books-reader://app/book/current.epub"

    /// The EPUB of the book being read.
    var bookURL: URL?

    /// The folder with reader.html and its scripts. In the app bundle it is Contents/Resources/Reader; when the
    /// executable runs from the build directory (`swift run`) it is inside the package's resource bundle next to it.
    /// Looked up by hand rather than through `Bundle.module`, whose generated accessor traps when the bundle is not
    /// exactly where the build machine had it.
    static let readerDirectory: URL? = {
        let fm = FileManager.default
        var candidates: [URL] = []
        if let resources = Bundle.main.resourceURL {
            candidates.append(resources.appendingPathComponent("Reader", isDirectory: true))
            candidates.append(resources.appendingPathComponent("Books_Books.bundle", isDirectory: true))
        }
        if let executable = Bundle.main.executableURL?.deletingLastPathComponent() {
            candidates.append(executable.appendingPathComponent("Books_Books.bundle", isDirectory: true))
        }
        candidates.append(Bundle.main.bundleURL.appendingPathComponent("Books_Books.bundle", isDirectory: true))
        func hasPage(_ url: URL) -> Bool { fm.fileExists(atPath: url.appendingPathComponent("reader.html").path) }
        for candidate in candidates {
            if hasPage(candidate) { return candidate }
            if let bundle = Bundle(url: candidate), let inside = bundle.resourceURL?.appendingPathComponent("Reader", isDirectory: true), hasPage(inside) {
                return inside
            }
            let flat = candidate.appendingPathComponent("Reader", isDirectory: true)
            if hasPage(flat) { return flat }
        }
        NSLog("Books: reader.html was not found; looked in %@", candidates.map(\.path).joined(separator: ", "))
        return nil
    }()

    private var readerDirectory: URL? { BooksSchemeHandler.readerDirectory }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        if path.hasPrefix("/") { path.removeFirst() }
        let fileURL: URL?
        if path.hasPrefix("book/") {
            fileURL = bookURL
        } else {
            fileURL = readerDirectory?.appendingPathComponent(path)
        }
        guard let fileURL, let data = try? Data(contentsOf: fileURL, options: .mappedIfSafe) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let mime = path.hasPrefix("book/") ? "application/epub+zip" : MediaTypes.forPath(path, fallback: "application/octet-stream")
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": mime + (mime.hasPrefix("text/") || mime.contains("javascript") ? "; charset=utf-8" : ""),
            "Content-Length": String(data.count),
            "Cache-Control": "no-store",
        ])!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

/// Receives the page's messages (PROTOCOL.md) as dictionaries.
final class ReaderMessageHandler: NSObject, WKScriptMessageHandler {
    var onMessage: (([String: Any]) -> Void)?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if let body = message.body as? [String: Any] { onMessage?(body) }
    }
}

/// The web view that typesets the book. It stays first responder so arrow keys and the wheel reach the page.
final class ReaderWebView: WKWebView {
    weak var session: ReaderSession?

    override var acceptsFirstResponder: Bool { true }

    /// Notched mouse wheels are the session's (one notch, one page); trackpads go to the page, which accumulates.
    override func scrollWheel(with event: NSEvent) {
        let handled = MainActor.assumeIsolated { session?.handleWheel(event) ?? false }
        if handled { return }
        super.scrollWheel(with: event)
    }

    /// WebKit's context menu keeps the system's Look Up, Copy, Translate, Search and speech items; Reload, Inspect
    /// Element and the like are not what a book needs.
    override func willOpenMenu(_ menu: NSMenu, with event: NSEvent) {
        let keep: Set<String> = [
            "WKMenuItemIdentifierLookUp", "WKMenuItemIdentifierCopy", "WKMenuItemIdentifierTranslate", "WKMenuItemIdentifierSearchWeb",
            "WKMenuItemIdentifierSpeechMenu", "WKMenuItemIdentifierWritingTools", "WKMenuItemIdentifierShareMenu",
        ]
        for item in menu.items where !item.isSeparatorItem && !keep.contains(item.identifier?.rawValue ?? "") {
            menu.removeItem(item)
        }
        var previousWasSeparator = true
        for item in menu.items {
            if item.isSeparatorItem {
                if previousWasSeparator { menu.removeItem(item) } else { previousWasSeparator = true }
            } else {
                previousWasSeparator = false
            }
        }
        if let last = menu.items.last, last.isSeparatorItem { menu.removeItem(last) }
        super.willOpenMenu(menu, with: event)
    }
}

// MARK: - Reading the page's dictionaries

struct JSON {
    let dict: [String: Any]

    init(_ dict: [String: Any]) { self.dict = dict }

    subscript(key: String) -> Any? { dict[key] }

    func string(_ key: String) -> String? { dict[key] as? String }
    func int(_ key: String) -> Int? {
        if let i = dict[key] as? Int { return i }
        if let d = dict[key] as? Double, d.isFinite, abs(d) < 1e15 { return Int(d) }
        return nil
    }
    /// JavaScript can send NaN and infinities; they are treated as absent so no display math trips over them.
    func double(_ key: String) -> Double? {
        if let d = dict[key] as? Double { return d.isFinite ? d : nil }
        if let i = dict[key] as? Int { return Double(i) }
        return nil
    }
    func bool(_ key: String) -> Bool? {
        if let b = dict[key] as? Bool { return b }
        if let i = dict[key] as? Int { return i != 0 }
        return nil
    }
    func object(_ key: String) -> JSON? { (dict[key] as? [String: Any]).map(JSON.init) }
    func array(_ key: String) -> [JSON] { (dict[key] as? [[String: Any]])?.map(JSON.init) ?? [] }

    func locator(_ key: String) -> Locator? {
        guard let o = object(key), let spine = o.int("spine") else { return nil }
        return Locator(spine: spine, offset: o.int("offset") ?? o.int("start") ?? 0)
    }

    func rect(_ key: String) -> CGRect? {
        guard let o = object(key), let x = o.double("x"), let y = o.double("y") else { return nil }
        return CGRect(x: x, y: y, width: o.double("width") ?? 0, height: o.double("height") ?? 0)
    }

    /// A JavaScript literal for any JSON-serialisable value.
    static func literal(_ value: Any) -> String {
        if let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]), let s = String(data: data, encoding: .utf8) {
            return s
        }
        return "null"
    }
}

/// Reports a reader page that failed to load or a web content process that died, so the session can show it
/// instead of leaving a blank reader.
final class ReaderNavigationDelegate: NSObject, WKNavigationDelegate {
    var onFailure: ((String) -> Void)?

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        onFailure?("The reader page could not be loaded: " + error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        onFailure?("The reader page failed: " + error.localizedDescription)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        onFailure?("The reader stopped unexpectedly. Close the book and open it again.")
    }
}
