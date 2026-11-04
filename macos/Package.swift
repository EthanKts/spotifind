// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Spotifind",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "Spotifind", path: "Sources/Spotifind")
    ]
)
