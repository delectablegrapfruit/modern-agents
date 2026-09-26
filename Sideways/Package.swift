// swift-tools-version:5.9
import PackageDescription

var products: [Product] = [
    .library(name: "SidewaysCore", targets: ["SidewaysCore"]),
    .executable(name: "sideways-sim", targets: ["SidewaysSim"]),
]

var targets: [Target] = [
    // The game itself — tracks, car physics, drift scoring, laps, ghosts, records. Foundation only, so it builds and
    // is tested on Linux as well as macOS.
    .target(name: "SidewaysCore", path: "Sources/SidewaysCore"),
    // Headless laps driven by the autopilot: track stats and lap times without a window.
    .executableTarget(name: "SidewaysSim", dependencies: ["SidewaysCore"], path: "Sources/SidewaysSim"),
    .testTarget(name: "SidewaysCoreTests", dependencies: ["SidewaysCore"], path: "Tests/SidewaysCoreTests"),
]

#if os(macOS)
products.append(.executable(name: "Sideways", targets: ["Sideways"]))
targets.append(
    .executableTarget(
        name: "Sideways",
        dependencies: ["SidewaysCore"],
        path: "Sources/Sideways",
        linkerSettings: [
            .linkedFramework("AppKit"),
            .linkedFramework("Carbon"),
            .linkedFramework("QuartzCore"),
        ]
    )
)
#endif

let package = Package(
    name: "Sideways",
    platforms: [.macOS(.v14)],
    products: products,
    targets: targets
)
