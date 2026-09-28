// swift-tools-version:5.9
import PackageDescription

// The game compiled to WebAssembly for the web page: RoninCore and RoninArt as they are, and a thin bridge that the
// page's JavaScript (core.js) calls. Built by build.sh (in Docker, with the SwiftWasm SDK); the root package and its
// CI know nothing of it.
let exports = [
    "ronin_buffer", "ronin_out", "ronin_rpc", "ronin_advance", "ronin_strike", "ronin_state", "ronin_sketch", "ronin_piece",
    "ronin_dolls_step", "ronin_doll_draw",
]

let package = Package(
    name: "RoninWeb",
    dependencies: [.package(name: "Ronin", path: "..")],
    targets: [
        .executableTarget(
            name: "RoninWeb",
            dependencies: [
                .product(name: "RoninCore", package: "Ronin"),
                .product(name: "RoninArt", package: "Ronin"),
            ],
            path: "Sources/RoninWeb",
            linkerSettings: [
                .unsafeFlags(["-Xclang-linker", "-mexec-model=reactor"] + exports.flatMap { ["-Xlinker", "--export=\($0)"] },
                             .when(platforms: [.wasi])),
            ]
        ),
    ]
)
