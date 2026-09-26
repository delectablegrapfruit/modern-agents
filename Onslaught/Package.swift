// swift-tools-version:5.9
import PackageDescription

var products: [Product] = [
    .library(name: "OnslaughtCore", targets: ["OnslaughtCore"]),
    .executable(name: "onslaught-sim", targets: ["OnslaughtSim"]),
]

var targets: [Target] = [
    // The game: bosses, bullet patterns, the ship, upgrades, runs and the autopilot. Foundation only, fixed-step and
    // seeded, so it builds and is tested on Linux as well as macOS, and a saved fight resumes on the same frame.
    .target(name: "OnslaughtCore", path: "Sources/OnslaughtCore"),
    // Headless fights flown by the autopilot, for balancing the waves.
    .executableTarget(name: "OnslaughtSim", dependencies: ["OnslaughtCore"], path: "Sources/OnslaughtSim"),
    .testTarget(name: "OnslaughtCoreTests", dependencies: ["OnslaughtCore"], path: "Tests/OnslaughtCoreTests"),
]

#if os(macOS)
products.append(.executable(name: "Onslaught", targets: ["Onslaught"]))
targets.append(
    .executableTarget(
        name: "Onslaught",
        dependencies: ["OnslaughtCore"],
        path: "Sources/Onslaught",
        linkerSettings: [
            .linkedFramework("AppKit"),
            .linkedFramework("SpriteKit"),
            .linkedFramework("Carbon"),
        ]
    )
)
#endif

let package = Package(
    name: "Onslaught",
    platforms: [.macOS(.v14)],
    products: products,
    targets: targets
)
