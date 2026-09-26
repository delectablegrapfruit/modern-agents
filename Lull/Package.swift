// swift-tools-version:5.9
import PackageDescription

// Lull: a floating window of low-stakes blocks. The game is a web page (Game/) that runs in any browser; this
// package is the macOS shell that floats it above your work in a borderless, resizable, see-through panel.
let package = Package(
    name: "Lull",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "Lull", targets: ["Lull"]),
    ],
    targets: [
        .executableTarget(
            name: "Lull",
            path: "Sources/Lull",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("WebKit"),
                .linkedFramework("Carbon"),
            ]
        ),
    ]
)
