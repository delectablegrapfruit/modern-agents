import Foundation
#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

// A root helper for what the app itself may not delete: root-owned volume
// folders on disks that enforce ownership. Installed once with an administrator
// password as a launchd daemon, it answers on a socket that only the installing
// user can use, and removes only what the catalog calls junk, where the catalog
// says it may live. One JSON line in, one JSON line out.

public struct HelperRequest: Codable {
    public var version = false
    public var remove: [Item]?

    public init(version: Bool = false, remove: [Item]? = nil) {
        self.version = version
        self.remove = remove
    }
}

public struct HelperResponse: Codable {
    public var version: String?
    public var outcome: Outcome?
    public var error: String?

    public init(version: String? = nil, outcome: Outcome? = nil, error: String? = nil) {
        self.version = version
        self.outcome = outcome
        self.error = error
    }
}

public enum HelperError: Error, LocalizedError, Equatable {
    case unreachable(String)
    case refused(String)

    public var errorDescription: String? {
        switch self {
        case .unreachable(let why): return "Sift's helper is not running (\(why))"
        case .refused(let why): return why
        }
    }
}

/// Where the helper lives and how it is installed.
public enum HelperInstall {
    /// Bumped when what the helper does or accepts changes; the app reinstalls then.
    public static let protocolVersion = "2"
    public static let binary = "/Library/PrivilegedHelperTools/dev.sift.helper"

    public static func label(uid: uid_t) -> String { "dev.sift.helper.\(uid)" }
    public static func socketPath(uid: uid_t) -> String { "/var/run/sift-\(uid).sock" }
    public static func plistPath(uid: uid_t) -> String { "/Library/LaunchDaemons/\(label(uid: uid)).plist" }

    public static func plist(uid: uid_t) -> String {
        """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
        <dict>
        \t<key>Label</key>
        \t<string>\(label(uid: uid))</string>
        \t<key>ProgramArguments</key>
        \t<array>
        \t\t<string>\(binary)</string>
        \t\t<string>--uid</string>
        \t\t<string>\(uid)</string>
        \t\t<string>--socket</string>
        \t\t<string>\(socketPath(uid: uid))</string>
        \t</array>
        \t<key>RunAtLoad</key>
        \t<true/>
        \t<key>KeepAlive</key>
        \t<true/>
        \t<key>ProcessType</key>
        \t<string>Background</string>
        </dict>
        </plist>
        """
    }

    /// Shell run once as root: stops a running helper, copies the new one out
    /// of the app bundle (the app may move) into place by rename, so a running
    /// copy is never overwritten under itself, writes the daemon definition and
    /// starts it.
    public static func script(bundledHelper: String, uid: uid_t) -> String {
        let plist = plistPath(uid: uid)
        let staged = binary + ".new"
        return [
            "set -e",
            "/bin/launchctl bootout system/\(label(uid: uid)) 2>/dev/null || true",
            "/bin/mkdir -p /Library/PrivilegedHelperTools",
            "/bin/cp -f \(quote(bundledHelper)) \(quote(staged))",
            "/usr/sbin/chown root:wheel \(quote(staged))",
            "/bin/chmod 755 \(quote(staged))",
            "/bin/mv -f \(quote(staged)) \(quote(binary))",
            "/usr/bin/printf '%s' \(quote(self.plist(uid: uid))) > \(quote(plist))",
            "/usr/sbin/chown root:wheel \(quote(plist))",
            "/bin/chmod 644 \(quote(plist))",
            "/bin/launchctl bootstrap system \(quote(plist))",
        ].joined(separator: "; ")
    }

    /// Shell run as root to undo `script`: stops the daemon and removes its
    /// definition; the binary goes too unless another user's daemon still uses it.
    public static func removeScript(uid: uid_t) -> String {
        [
            "/bin/launchctl bootout system/\(label(uid: uid)) 2>/dev/null || true",
            "/bin/rm -f \(quote(plistPath(uid: uid)))",
            "/bin/rm -f \(quote(socketPath(uid: uid)))",
            "/bin/ls /Library/LaunchDaemons/dev.sift.helper.*.plist >/dev/null 2>&1 || /bin/rm -f \(quote(binary))",
        ].joined(separator: "; ")
    }

    static func quote(_ s: String) -> String {
        "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
}

/// Mount points of the running system, so volume-level junk is recognised only
/// directly inside one.
public enum Mounts {
    public static func current() -> Set<String> {
        #if canImport(Darwin)
        var list: UnsafeMutablePointer<statfs>?
        let count = getmntinfo(&list, MNT_NOWAIT)
        guard count > 0, let list else { return ["/"] }
        var out: Set<String> = ["/"]
        for i in 0..<Int(count) {
            let name = withUnsafePointer(to: list[i].f_mntonname) { tuple in
                tuple.withMemoryRebound(to: CChar.self, capacity: MemoryLayout.size(ofValue: list[i].f_mntonname)) { String(cString: $0) }
            }
            out.insert(Paths.standardize(name))
        }
        return out
        #else
        guard let text = try? String(contentsOfFile: "/proc/self/mounts", encoding: .utf8) else { return ["/"] }
        var out: Set<String> = ["/"]
        for line in text.split(separator: "\n") {
            let fields = line.split(separator: " ")
            if fields.count > 1 { out.insert(String(fields[1])) }
        }
        return out
        #endif
    }
}

// MARK: - Sockets

enum UnixSocket {
    #if canImport(Darwin)
    static let stream = SOCK_STREAM
    #else
    static let stream = Int32(SOCK_STREAM.rawValue)
    #endif

    static func address(_ path: String) -> sockaddr_un {
        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        let capacity = MemoryLayout.size(ofValue: addr.sun_path)
        withUnsafeMutablePointer(to: &addr.sun_path) { tuple in
            tuple.withMemoryRebound(to: CChar.self, capacity: capacity) { dest in
                path.withCString { src in
                    let n = min(strlen(src), capacity - 1)
                    memcpy(dest, src, n)
                    dest[n] = 0
                }
            }
        }
        return addr
    }

    static func readLine(_ fd: Int32, limit: Int = 4 << 20) -> Data? {
        var out = Data()
        var byte = [UInt8](repeating: 0, count: 4096)
        while out.count < limit {
            let n = read(fd, &byte, byte.count)
            if n <= 0 { return out.isEmpty ? nil : out }
            out.append(byte, count: n)
            if let end = out.firstIndex(of: 0x0A) { return out.prefix(end) }
        }
        return nil
    }

    /// A peer that hangs up makes `write` fail instead of raising SIGPIPE.
    static func quietOnClose(_ fd: Int32) {
        #if canImport(Darwin)
        var on: Int32 = 1
        _ = setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))
        #endif
    }

    static func writeAll(_ fd: Int32, _ data: Data) -> Bool {
        var offset = 0
        let bytes = [UInt8](data) + [0x0A]
        while offset < bytes.count {
            #if canImport(Darwin)
            let n = bytes.withUnsafeBufferPointer { write(fd, $0.baseAddress! + offset, bytes.count - offset) }
            #else
            let n = bytes.withUnsafeBufferPointer { send(fd, $0.baseAddress! + offset, bytes.count - offset, Int32(MSG_NOSIGNAL)) }
            #endif
            if n <= 0 { return false }
            offset += n
        }
        return true
    }

    /// Reads and writes on the socket give up after `seconds`; 0 means never.
    static func setTimeouts(_ fd: Int32, seconds: Int) {
        guard seconds > 0 else { return }
        var tv = timeval(tv_sec: seconds, tv_usec: 0)
        _ = setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
        _ = setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
    }

    static func peerUID(_ fd: Int32) -> uid_t? {
        #if canImport(Darwin)
        var uid: uid_t = 0
        var gid: gid_t = 0
        return getpeereid(fd, &uid, &gid) == 0 ? uid : nil
        #else
        // Linux's `struct ucred`, which Glibc's Swift module leaves out.
        struct Credentials { var pid: pid_t = 0; var uid: uid_t = 0; var gid: gid_t = 0 }
        var cred = Credentials()
        var size = socklen_t(MemoryLayout<Credentials>.size)
        return getsockopt(fd, SOL_SOCKET, SO_PEERCRED, &cred, &size) == 0 ? cred.uid : nil
        #endif
    }
}

/// The app's side: one request, one reply.
public enum HelperClient {
    public static func send(_ request: HelperRequest, to path: String, timeoutSeconds: Int = 60) throws -> HelperResponse {
        let fd = socket(AF_UNIX, UnixSocket.stream, 0)
        guard fd >= 0 else { throw HelperError.unreachable("no socket") }
        defer { close(fd) }
        UnixSocket.quietOnClose(fd)
        UnixSocket.setTimeouts(fd, seconds: timeoutSeconds)
        var addr = UnixSocket.address(path)
        let connected = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) }
        }
        guard connected == 0 else { throw HelperError.unreachable(String(cString: strerror(errno))) }
        guard UnixSocket.writeAll(fd, try JSONEncoder().encode(request)),
              let line = UnixSocket.readLine(fd) else { throw HelperError.unreachable("no reply") }
        let response = try JSONDecoder().decode(HelperResponse.self, from: line)
        if let error = response.error { throw HelperError.refused(error) }
        return response
    }

    /// Whether a helper speaking this protocol answers at `path`.
    public static func isReady(at path: String) -> Bool {
        (try? send(HelperRequest(version: true), to: path, timeoutSeconds: 5))?.version == HelperInstall.protocolVersion
    }

    /// Asks the helper to remove `items`; what it cannot is reported as failed.
    public static func remove(_ items: [Item], at path: String) -> Outcome {
        do {
            // A large Trash or index on a slow disk takes as long as it takes.
            if let outcome = try send(HelperRequest(remove: items), to: path, timeoutSeconds: 3600).outcome { return outcome }
            throw HelperError.unreachable("empty reply")
        } catch {
            var outcome = Outcome()
            outcome.failed = items.map { Failure(item: $0, reason: error.localizedDescription, needsAdministrator: true) }
            return outcome
        }
    }
}

/// The helper's side: serves one user, removes only catalog junk in catalog places.
public final class HelperServer {
    public let socketPath: String
    public let uid: uid_t
    private let mountPoints: () -> Set<String>
    private var listener: Int32 = -1

    public init(socketPath: String, uid: uid_t, mountPoints: @escaping () -> Set<String> = Mounts.current) {
        self.socketPath = socketPath
        self.uid = uid
        self.mountPoints = mountPoints
    }

    /// Binds the socket. Returns false when that fails.
    public func listen() -> Bool {
        unlink(socketPath)
        let fd = socket(AF_UNIX, UnixSocket.stream, 0)
        guard fd >= 0 else { return false }
        var addr = UnixSocket.address(socketPath)
        let bound = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) }
        }
        #if canImport(Darwin)
        guard bound == 0, Darwin.listen(fd, 8) == 0 else { close(fd); return false }
        #else
        guard bound == 0, Glibc.listen(fd, 8) == 0 else { close(fd); return false }
        #endif
        chmod(socketPath, 0o666)
        listener = fd
        return true
    }

    /// Serves until the socket is closed.
    public func serve() {
        while listener >= 0 {
            let client = accept(listener, nil, nil)
            if client < 0 { if errno == EINTR { continue } else { break } }
            UnixSocket.quietOnClose(client)
            // A client that connects and says nothing must not park the daemon.
            UnixSocket.setTimeouts(client, seconds: 10)
            handle(client)
            close(client)
        }
    }

    public func stop() {
        let fd = listener
        listener = -1
        if fd >= 0 { shutdown(fd, Int32(SHUT_RDWR)); close(fd) }
        unlink(socketPath)
    }

    private func handle(_ client: Int32) {
        let reply: HelperResponse
        if let peer = UnixSocket.peerUID(client), peer == uid || peer == 0 {
            if let line = UnixSocket.readLine(client), let request = try? JSONDecoder().decode(HelperRequest.self, from: line) {
                reply = respond(to: request)
            } else {
                reply = HelperResponse(error: "Unreadable request")
            }
        } else {
            reply = HelperResponse(error: "Not the user this helper serves")
        }
        if let data = try? JSONEncoder().encode(reply) { _ = UnixSocket.writeAll(client, data) }
    }

    /// The served user's home: the daemon runs as root, whose own home is not it.
    static func home(of uid: uid_t) -> String? {
        guard let entry = getpwuid(uid), let dir = entry.pointee.pw_dir else { return nil }
        return String(cString: dir)
    }

    /// Where the served user's junk may be: the same places the app cleans.
    func roots() -> [String] {
        var out = [Self.home(of: uid) ?? "", "/Users/Shared", "/Applications"].filter { !$0.isEmpty }
        out += mountPoints().filter { $0 != "/" && !$0.hasPrefix("/System/Volumes/") && !$0.hasPrefix("/private/") && !$0.hasPrefix("/dev") }
        return out
    }

    /// Only items the catalog would find at that very place, in a place the
    /// app cleans, are removed.
    public func respond(to request: HelperRequest) -> HelperResponse {
        if request.version { return HelperResponse(version: HelperInstall.protocolVersion) }
        guard let items = request.remove else { return HelperResponse(error: "Nothing asked") }
        let home = Self.home(of: uid) ?? ""
        let safety = Safety(protectedPrefixes: Safety.systemPrefixes(home: home), mountPoints: mountPoints(),
                            exceptions: Safety.cloudFolders(home: home))
        let scanner = JunkScanner(safety: safety)
        var outcome = Outcome()
        var allowed: [Item] = []
        for item in items {
            let path = Paths.standardize(item.path)
            guard let info = Files.info(path),
                  let found = scanner.classify(path: path, name: Paths.name(of: path), info: info,
                                               atVolumeRoot: safety.isMountPoint(Paths.parent(of: path))),
                  found.kind == item.kind else {
                outcome.skipped.append(Failure(item: item, reason: "Not junk where it stands"))
                continue
            }
            allowed.append(found)
        }
        let removed = Remover(safety: safety).remove(allowed, within: roots())
        outcome.removed = removed.removed
        outcome.failed = removed.failed
        outcome.skipped += removed.skipped
        return HelperResponse(outcome: outcome)
    }
}
