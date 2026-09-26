// swift-tools-version:5.9
import PackageDescription

var products: [Product] = [
    .library(name: "SkirmishCore", targets: ["SkirmishCore"]),
    .executable(name: "skirmish-sim", targets: ["SkirmishSim"]),
]

var targets: [Target] = [
    // The rules: maps, fleets, combat, the enemy commanders and the campaign. Foundation only, deterministic from a
    // seed, so it builds and is tested on Linux as well as macOS, and a saved battle resumes exactly.
    .target(name: "SkirmishCore", path: "Sources/SkirmishCore"),
    // Headless battles, bot against bot, for balancing the sectors.
    .executableTarget(name: "SkirmishSim", dependencies: ["SkirmishCore"], path: "Sources/SkirmishSim"),
    .testTarget(name: "SkirmishCoreTests", dependencies: ["SkirmishCore"], path: "Tests/SkirmishCoreTests"),
]

#if os(macOS)
products.append(.executable(name: "Skirmish", targets: ["Skirmish"]))
targets.append(
    .executableTarget(
        name: "Skirmish",
        dependencies: ["SkirmishCore"],
        path: "Sources/Skirmish",
        linkerSettings: [
            .linkedFramework("AppKit"),
            .linkedFramework("SpriteKit"),
            .linkedFramework("Carbon"),
        ]
    )
)
#endif

let package = Package(
    name: "Skirmish",
    platforms: [.macOS(.v14)],
    products: products,
    targets: targets
)
