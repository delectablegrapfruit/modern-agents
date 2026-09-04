// swift-tools-version:5.9
import PackageDescription

var products: [Product] = [
    .library(name: "BooksCore", targets: ["BooksCore"]),
    .executable(name: "books-cli", targets: ["BooksCLI"]),
]

var targets: [Target] = [
    // Formats and the library: ZIP/inflate, EPUB, Kindle → EPUB, plain text → EPUB, catalog, settings, reading
    // statistics. Foundation only, so it builds and is tested on Linux as well as macOS.
    .target(name: "BooksCore", path: "Sources/BooksCore"),
    .executableTarget(name: "BooksCLI", dependencies: ["BooksCore"], path: "Sources/BooksCLI"),
    .testTarget(name: "BooksCoreTests", dependencies: ["BooksCore"], path: "Tests/BooksCoreTests"),
]

#if os(macOS)
products.append(.executable(name: "Books", targets: ["Books"]))
targets.append(
    .executableTarget(
        name: "Books",
        dependencies: ["BooksCore"],
        path: "Sources/Books",
        // The typesetting engine: a small web page WebKit lays the book out with, served to WKWebView from the bundle.
        resources: [.copy("Resources/Reader")],
        linkerSettings: [
            .linkedFramework("AppKit"),
            .linkedFramework("SwiftUI"),
            .linkedFramework("WebKit"),
            .linkedFramework("PDFKit"),
            .linkedFramework("UniformTypeIdentifiers"),
        ]
    )
)
#endif

let package = Package(
    name: "Books",
    platforms: [.macOS(.v14)],
    products: products,
    targets: targets
)
