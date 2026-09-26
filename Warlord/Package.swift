// swift-tools-version:5.9
import PackageDescription

var products: [Product] = [
    .library(name: "WarlordCore", targets: ["WarlordCore"]),
    .executable(name: "warlord-sim", targets: ["WarlordSim"]),
]

var targets: [Target] = [
    // The game itself: map, rules, battles, rivals, the clock that refills orders and gold, saving. Foundation only,
    // so it builds and is tested on Linux as well as macOS.
    .target(name: "WarlordCore", path: "Sources/WarlordCore"),
    // Plays whole campaigns with the advisor to check the pacing: how many breaks a realm takes.
    .executableTarget(name: "WarlordSim", dependencies: ["WarlordCore"], path: "Sources/WarlordSim"),
    .testTarget(name: "WarlordCoreTests", dependencies: ["WarlordCore"], path: "Tests/WarlordCoreTests"),
]

#if os(macOS)
products.append(.executable(name: "Warlord", targets: ["Warlord"]))
targets.append(
    .executableTarget(
        name: "Warlord",
        dependencies: ["WarlordCore"],
        path: "Sources/Warlord",
        linkerSettings: [
            .linkedFramework("AppKit"),
            .linkedFramework("Carbon"),
            .linkedFramework("ServiceManagement"),
        ]
    )
)
#endif

let package = Package(
    name: "Warlord",
    platforms: [.macOS(.v14)],
    products: products,
    targets: targets
)
