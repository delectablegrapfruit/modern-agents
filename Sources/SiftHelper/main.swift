import Foundation
import SiftCore
#if canImport(Glibc)
import Glibc
#endif

// Sift's root helper. Started by launchd for one user; see HelperInstall.

var uid: uid_t?
var socketPath: String?
var arguments = Array(CommandLine.arguments.dropFirst())
while !arguments.isEmpty {
    let flag = arguments.removeFirst()
    guard !arguments.isEmpty else { break }
    switch flag {
    case "--uid": uid = uid_t(arguments.removeFirst())
    case "--socket": socketPath = arguments.removeFirst()
    default: arguments.removeFirst()
    }
}

guard let uid else {
    FileHandle.standardError.write(Data("usage: sift-helper --uid <uid> [--socket <path>]\n".utf8))
    exit(2)
}

signal(SIGPIPE, SIG_IGN)
let server = HelperServer(socketPath: socketPath ?? HelperInstall.socketPath(uid: uid), uid: uid)
guard server.listen() else {
    FileHandle.standardError.write(Data("could not listen on \(server.socketPath)\n".utf8))
    exit(1)
}
server.serve()
