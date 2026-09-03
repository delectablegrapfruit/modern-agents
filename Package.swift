// swift-tools-version:5.9
import PackageDescription

var products: [Product] = [
    .library(name: "SiftCore", targets: ["SiftCore"]),
    .executable(name: "sift", targets: ["SiftCLI"]),
]

var targets: [Target] = [
    // Platform-neutral engine: catalog, scanning, removal, views, `.DS_Store`, settings. Also builds on Linux.
    .target(name: "SiftCore", path: "Sources/SiftCore"),
    .executableTarget(name: "SiftCLI", dependencies: ["SiftCore"], path: "Sources/SiftCLI"),
    .testTarget(name: "SiftCoreTests", dependencies: ["SiftCore"], path: "Tests/SiftCoreTests"),
]

#if os(macOS)
products.append(.executable(name: "Sift", targets: ["Sift"]))
targets.append(
    .executableTarget(
        name: "Sift",
        dependencies: ["SiftCore"],
        path: "Sources/Sift",
        linkerSettings: [
            .linkedFramework("AppKit"),
            .linkedFramework("SwiftUI"),
            .linkedFramework("ServiceManagement"),
            .linkedFramework("CoreServices"),
            .linkedFramework("ApplicationServices"),
        ]
    )
)
#endif

let package = Package(
    name: "Sift",
    platforms: [.macOS(.v13)],
    products: products,
    targets: targets
)
