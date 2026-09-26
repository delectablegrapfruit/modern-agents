// swift-tools-version:5.9
import PackageDescription

var products: [Product] = [
    .library(name: "RoninCore", targets: ["RoninCore"]),
    .executable(name: "ronin-sim", targets: ["RoninSim"]),
]

var targets: [Target] = [
    // The fight: the lane, the foes, strikes, arrows, stages and the career. Foundation only, a fixed step and a
    // seed, so it builds and is tested on Linux as well as macOS, and a saved fight resumes on the same frame.
    .target(name: "RoninCore", path: "Sources/RoninCore"),
    // Headless stages flown by the autopilot, for balancing.
    .executableTarget(name: "RoninSim", dependencies: ["RoninCore"], path: "Sources/RoninSim"),
    .testTarget(name: "RoninCoreTests", dependencies: ["RoninCore"], path: "Tests/RoninCoreTests"),
]

#if os(macOS)
products.append(.executable(name: "Ronin", targets: ["Ronin"]))
targets.append(
    .executableTarget(
        name: "Ronin",
        dependencies: ["RoninCore"],
        path: "Sources/Ronin",
        linkerSettings: [
            .linkedFramework("AppKit"),
            .linkedFramework("SpriteKit"),
            .linkedFramework("Carbon"),
        ]
    )
)
#endif

let package = Package(
    name: "Ronin",
    platforms: [.macOS(.v14)],
    products: products,
    targets: targets
)
