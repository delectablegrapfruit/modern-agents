// swift-tools-version:5.9
import PackageDescription

var products: [Product] = [
    .library(name: "LimiterCore", targets: ["LimiterCore"]),
]

var targets: [Target] = [
    // The volume mapping, the gain applied to the sound, and the settings. Foundation only, so it builds and is
    // tested on Linux as well as macOS.
    .target(name: "LimiterCore", path: "Sources/LimiterCore"),
    .testTarget(name: "LimiterCoreTests", dependencies: ["LimiterCore"], path: "Tests/LimiterCoreTests"),
]

#if os(macOS)
products.append(.executable(name: "AudioLimiter", targets: ["AudioLimiter"]))
targets.append(
    .executableTarget(
        name: "AudioLimiter",
        dependencies: ["LimiterCore"],
        path: "Sources/AudioLimiter",
        linkerSettings: [
            .linkedFramework("AppKit"),
            .linkedFramework("SwiftUI"),
            .linkedFramework("CoreAudio"),
            .linkedFramework("AudioToolbox"),
            .linkedFramework("ServiceManagement"),
        ]
    )
)
#endif

let package = Package(
    name: "AudioLimiter",
    // Core Audio process taps, which the limiter is built on, arrived in macOS 14.2.
    platforms: [.macOS("14.2")],
    products: products,
    targets: targets
)
