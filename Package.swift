// swift-tools-version:5.9
import PackageDescription

var products: [Product] = [
    .library(name: "WinnowCore", targets: ["WinnowCore"]),
    .executable(name: "winnow-cli", targets: ["winnow-cli"]),
]

var targets: [Target] = [
    // Platform-neutral engine: rules, scanning, deletion, settings, watching, logging.
    .target(name: "WinnowCore", path: "Sources/WinnowCore"),
    // Command-line front end (also runs on Linux for development/testing).
    .executableTarget(name: "winnow-cli", dependencies: ["WinnowCore"], path: "Sources/winnow-cli"),
    .testTarget(name: "WinnowCoreTests", dependencies: ["WinnowCore"], path: "Tests/WinnowCoreTests"),
]

#if os(macOS)
// The SwiftUI/AppKit application only builds on macOS hosts.
products.append(.executable(name: "Winnow", targets: ["Winnow"]))
targets.append(
    .executableTarget(
        name: "Winnow",
        dependencies: ["WinnowCore"],
        path: "Sources/Winnow",
        linkerSettings: [
            .linkedFramework("AppKit"),
            .linkedFramework("SwiftUI"),
            .linkedFramework("ServiceManagement"),
            .linkedFramework("UserNotifications"),
            .linkedFramework("CoreServices"),
        ]
    )
)
#endif

let package = Package(
    name: "Winnow",
    platforms: [.macOS(.v13)],
    products: products,
    targets: targets
)
