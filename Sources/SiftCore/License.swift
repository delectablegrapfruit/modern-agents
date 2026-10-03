import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Where a build of Sift sells Sift Pro: a Lemon Squeezy product. The build fills these into the app's Info.plist
/// (`SiftCheckoutURL`, `SiftStoreID`, `SiftProductID`); a build without a product sells nothing and has every
/// feature unlocked, as development builds and forks do.
public struct Storefront: Hashable {
    public var checkoutURL: URL?
    public var storeID: Int?
    public var productID: Int?

    public init(checkoutURL: URL? = nil, storeID: Int? = nil, productID: Int? = nil) {
        self.checkoutURL = checkoutURL
        self.storeID = storeID
        self.productID = productID
    }

    public init(info: [String: Any]?) {
        func value(_ key: String) -> String? {
            let raw = info?[key]
            let text = (raw as? String) ?? (raw as? Int).map { String($0) }
            let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return trimmed.isEmpty ? nil : trimmed
        }
        self.init(checkoutURL: value("SiftCheckoutURL").flatMap { URL(string: $0) }.flatMap { $0.scheme == "https" ? $0 : nil },
                  storeID: value("SiftStoreID").flatMap { Int($0) },
                  productID: value("SiftProductID").flatMap { Int($0) })
    }

    public var sells: Bool { checkoutURL != nil && productID != nil }

    /// A key bought for this product, in this store; a key for anything else sold through Lemon Squeezy is not one.
    func accepts(storeID: Int?, productID: Int?) -> Bool {
        if let expected = self.productID, productID != expected { return false }
        if let expected = self.storeID, storeID != expected { return false }
        return true
    }
}

/// A license activated on this Mac.
public struct License: Codable, Hashable {
    public var key: String
    /// The store's name for this Mac's activation, needed to give the activation back.
    public var instanceID: String
    public var customerName: String
    public var customerEmail: String
    public var activatedAt: Date

    public var holder: String { customerName.isEmpty ? customerEmail : customerName }
}

/// What this copy may do now. Sweeping by hand is always free; cleaning by itself and keeping Finder's views are
/// Sift Pro, free for the trial.
public enum Entitlement: Hashable {
    /// The build sells nothing: everything is unlocked.
    case unsold
    case licensed(License)
    case trial(daysLeft: Int)
    case expired

    public var isPro: Bool {
        if case .expired = self { return false }
        return true
    }
}

public enum LicenseError: Error, LocalizedError, Equatable {
    case empty
    /// The store turned the key down, in its own words.
    case refused(String)
    case otherProduct
    case unreachable(String)
    case unexpectedReply(Int)

    public var errorDescription: String? {
        switch self {
        case .empty: return "Enter the license key from your receipt."
        case .refused(let message): return "The store did not accept this key: " + message
        case .otherProduct: return "This key is for another product, not Sift Pro."
        case .unreachable(let message): return "The store could not be reached: " + message + " Check the connection and try again."
        case .unexpectedReply(let status): return "The store answered in a way Sift does not understand (\(status)). Try again later."
        }
    }
}

extension AppPaths {
    public static func licenseFile(in directory: URL? = nil) -> URL {
        (directory ?? supportDirectory()).appendingPathComponent("license.json")
    }
}

/// The trial and the license, kept in `license.json`. A key is checked with the store once, when it is entered,
/// and when it is deactivated; Sift sends nothing at any other time. Thread-safe.
public final class Licensing {
    public static let trialDays = 14

    /// Sends a request and answers with the body, the HTTP status and any transport error.
    public typealias Transport = (URLRequest, @escaping (Data?, Int, Error?) -> Void) -> Void

    struct State: Codable {
        var trialStarted: Date?
        var license: License?
    }

    public let storefront: Storefront
    public let fileURL: URL
    private let transport: Transport
    private let now: () -> Date
    private let lock = NSLock()
    private var state: State

    public init(storefront: Storefront, fileURL: URL = AppPaths.licenseFile(), transport: Transport? = nil, now: @escaping () -> Date = Date.init) {
        self.storefront = storefront
        self.fileURL = fileURL
        self.now = now
        self.transport = transport ?? Licensing.urlSession
        state = Licensing.read(fileURL) ?? State()
        // The trial runs from the first launch of a build that sells Sift Pro.
        if storefront.sells, state.trialStarted == nil {
            state.trialStarted = now()
            try? write()
        }
    }

    public var license: License? { lock.lock(); defer { lock.unlock() }; return state.license }

    public var entitlement: Entitlement {
        guard storefront.sells else { return .unsold }
        lock.lock(); defer { lock.unlock() }
        if let license = state.license { return .licensed(license) }
        let started = state.trialStarted ?? now()
        // A clock set back never lengthens the trial past its full length.
        let used = max(0, Int(now().timeIntervalSince(started) / 86_400))
        let left = Licensing.trialDays - used
        return left > 0 ? .trial(daysLeft: left) : .expired
    }

    /// Activates the key for this Mac with the store and keeps it.
    @discardableResult
    public func activate(_ key: String, instanceName: String) async throws -> License {
        let key = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { throw LicenseError.empty }
        let (reply, _) = try await post("activate", [("license_key", key), ("instance_name", instanceName)])
        guard reply.activated == true, let instance = reply.instance?.id else {
            throw LicenseError.refused(reply.error ?? "it is not a valid key.")
        }
        guard storefront.accepts(storeID: reply.meta?.storeId, productID: reply.meta?.productId) else {
            // The activation is given back so the other product's key loses nothing.
            _ = try? await post("deactivate", [("license_key", key), ("instance_id", instance)])
            throw LicenseError.otherProduct
        }
        let license = License(key: key, instanceID: instance, customerName: reply.meta?.customerName ?? "",
                              customerEmail: reply.meta?.customerEmail ?? "", activatedAt: now())
        try change { $0.license = license }
        return license
    }

    /// Gives this Mac's activation back to the store, so the key can be used on another Mac.
    public func deactivate() async throws {
        guard let license else { return }
        let (reply, status) = try await post("deactivate", [("license_key", license.key), ("instance_id", license.instanceID)])
        // A key or activation the store no longer knows (refunded, removed) is let go here too.
        guard reply.deactivated == true || status == 404 else {
            throw LicenseError.refused(reply.error ?? "the activation could not be given back.")
        }
        try change { $0.license = nil }
    }

    // MARK: - Store

    struct Reply: Decodable {
        struct Instance: Decodable { var id: String? }
        struct Meta: Decodable {
            var storeId: Int?
            var productId: Int?
            var customerName: String?
            var customerEmail: String?
        }

        var activated: Bool?
        var deactivated: Bool?
        var error: String?
        var instance: Instance?
        var meta: Meta?
    }

    static let api = URL(string: "https://api.lemonsqueezy.com/v1/licenses/")!

    private func post(_ action: String, _ fields: [(String, String)]) async throws -> (Reply, Int) {
        var request = URLRequest(url: Licensing.api.appendingPathComponent(action))
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data(Licensing.form(fields).utf8)
        let transport = self.transport
        let (data, status): (Data, Int) = try await withCheckedThrowingContinuation { continuation in
            transport(request) { data, status, error in
                if let error {
                    continuation.resume(throwing: LicenseError.unreachable(error.localizedDescription))
                } else {
                    continuation.resume(returning: (data ?? Data(), status))
                }
            }
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        guard let reply = try? decoder.decode(Reply.self, from: data) else { throw LicenseError.unexpectedReply(status) }
        return (reply, status)
    }

    static func form(_ fields: [(String, String)]) -> String {
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        func encode(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s }
        return fields.map { encode($0.0) + "=" + encode($0.1) }.joined(separator: "&")
    }

    private static func urlSession(_ request: URLRequest, _ done: @escaping (Data?, Int, Error?) -> Void) {
        URLSession.shared.dataTask(with: request) { data, response, error in
            done(data, (response as? HTTPURLResponse)?.statusCode ?? 0, error)
        }.resume()
    }

    // MARK: - File

    private func change(_ edit: (inout State) -> Void) throws {
        lock.lock(); defer { lock.unlock() }
        edit(&state)
        try write()
    }

    /// Called with the lock held, or from `init`.
    private func write() throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try encoder.encode(state).write(to: fileURL, options: .atomic)
    }

    private static func read(_ url: URL) -> State? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(State.self, from: data)
    }
}
