// swift-tools-version:5.9
import PackageDescription

// Checks, natively, that the WebAssembly build's JSON coder (web/Sources/RoninWeb/JSONCoding.swift, linked here) reads
// and writes saves exactly as Foundation's JSONEncoder and JSONDecoder do, so a save made in the browser opens in the
// app and the other way about:
//   docker run --rm -v "$PWD":/work -w /work/web/test/native swift:6.0 swift run -c release --scratch-path /tmp/b
let package = Package(
    name: "CodingCheck",
    dependencies: [.package(name: "Ronin", path: "../../..")],
    targets: [
        .executableTarget(name: "CodingCheck", dependencies: [.product(name: "RoninCore", package: "Ronin")],
                          path: "Sources/CodingCheck"),
    ]
)
