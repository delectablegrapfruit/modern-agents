// swift-tools-version:5.9
import PackageDescription

var products: [Product] = [
    .library(name: "RoninCore", targets: ["RoninCore"]),
    .library(name: "RoninArt", targets: ["RoninArt"]),
    .executable(name: "ronin-sim", targets: ["RoninSim"]),
    .executable(name: "ronin-sheet", targets: ["RoninSheet"]),
]

var targets: [Target] = [
    // The fight: the lane, the foes, strikes, arrows, stages and the career. Foundation only, a fixed step and a
    // seed, so it builds and is tested on Linux as well as macOS, and a saved fight resumes on the same frame.
    .target(name: "RoninCore", path: "Sources/RoninCore"),
    // Headless stages flown by the autopilot, for balancing.
    .executableTarget(name: "RoninSim", dependencies: ["RoninCore"], path: "Sources/RoninSim"),
    .testTarget(name: "RoninCoreTests", dependencies: ["RoninCore"], path: "Tests/RoninCoreTests"),
    // The figures: poses, frames, and how each is drawn, as shapes. Foundation only, so the art can be checked and
    // previewed (as SVG contact sheets) anywhere; the app renders the same shapes with Core Graphics.
    .target(name: "RoninArt", dependencies: ["RoninCore"], path: "Sources/RoninArt"),
    .executableTarget(name: "RoninSheet", dependencies: ["RoninArt", "RoninCore"], path: "Sources/RoninSheet"),
    .testTarget(name: "RoninArtTests", dependencies: ["RoninArt", "RoninCore"], path: "Tests/RoninArtTests"),
]

#if os(macOS)
products.append(.executable(name: "Ronin", targets: ["Ronin"]))
targets.append(
    .executableTarget(
        name: "Ronin",
        dependencies: ["RoninCore", "RoninArt"],
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
