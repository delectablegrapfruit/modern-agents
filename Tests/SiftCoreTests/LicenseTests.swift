import Foundation
import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import SiftCore

/// The store's side of a license, as Lemon Squeezy answers it.
final class FakeStore {
    var requests: [(action: String, fields: [String: String])] = []
    var replies: [String: (Int, String)] = [:]
    var offline = false

    func transport(_ request: URLRequest, _ done: @escaping (Data?, Int, Error?) -> Void) {
        let action = request.url?.lastPathComponent ?? ""
        let body = String(decoding: request.httpBody ?? Data(), as: UTF8.self)
        var fields: [String: String] = [:]
        for pair in body.split(separator: "&") {
            let parts = pair.split(separator: "=", maxSplits: 1).map { String($0).removingPercentEncoding ?? String($0) }
            fields[parts[0]] = parts.count > 1 ? parts[1] : ""
        }
        requests.append((action, fields))
        if offline { return done(nil, 0, URLError(.notConnectedToInternet)) }
        let (status, json) = replies[action] ?? (404, #"{"error":"not found"}"#)
        done(Data(json.utf8), status, nil)
    }

    static func activated(store: Int = 7, product: Int = 42) -> (Int, String) {
        (200, """
        {"activated":true,"error":null,
         "license_key":{"id":1,"status":"active","key":"KEY-1","activation_limit":3,"activation_usage":1},
         "instance":{"id":"inst-9","name":"Mac"},
         "meta":{"store_id":\(store),"order_id":2,"product_id":\(product),"product_name":"Sift Pro","variant_id":5,
                 "customer_id":6,"customer_name":"Ada","customer_email":"ada@example.com"}}
        """)
    }
}

final class LicenseTests: XCTestCase {
    private var dir: URL!
    private let storefront = Storefront(checkoutURL: URL(string: "https://sift.lemonsqueezy.com/buy/abc"), storeID: 7, productID: 42)

    override func setUpWithError() throws {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent("sift-license-" + UUID().uuidString, isDirectory: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: dir)
    }

    private func make(_ store: FakeStore = FakeStore(), at date: @escaping () -> Date = Date.init) -> Licensing {
        Licensing(storefront: storefront, fileURL: dir.appendingPathComponent("license.json"), transport: store.transport, now: date)
    }

    func testABuildThatSellsNothingIsUnlocked() {
        let licensing = Licensing(storefront: Storefront(info: [:]), fileURL: dir.appendingPathComponent("license.json"))
        XCTAssertEqual(licensing.entitlement, .unsold)
        XCTAssertTrue(licensing.entitlement.isPro)
        // No trial is started, nothing is written.
        XCTAssertFalse(FileManager.default.fileExists(atPath: licensing.fileURL.path))
    }

    func testStorefrontFromInfoPlist() {
        let full = Storefront(info: ["SiftCheckoutURL": " https://sift.lemonsqueezy.com/buy/abc ", "SiftStoreID": "7", "SiftProductID": 42])
        XCTAssertEqual(full, storefront)
        XCTAssertTrue(full.sells)
        XCTAssertFalse(Storefront(info: ["SiftCheckoutURL": "", "SiftStoreID": "", "SiftProductID": ""]).sells)
        XCTAssertFalse(Storefront(info: ["SiftCheckoutURL": "http://insecure.example/buy", "SiftProductID": "42"]).sells)
    }

    func testTrialCountsDownAndEnds() {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
        let day: TimeInterval = 86_400
        XCTAssertEqual(make(at: { now }).entitlement, .trial(daysLeft: 14))
        now += 13 * day + 3600
        // The start is kept on disk, so a new launch counts from the first one.
        XCTAssertEqual(make(at: { now }).entitlement, .trial(daysLeft: 1))
        now += day
        let ended = make(at: { now })
        XCTAssertEqual(ended.entitlement, .expired)
        XCTAssertFalse(ended.entitlement.isPro)
        // Setting the clock back does not start it again.
        now -= 30 * day
        XCTAssertEqual(make(at: { now }).entitlement, .trial(daysLeft: 14))
    }

    func testActivationUnlocksAndIsKept() async throws {
        let store = FakeStore()
        store.replies["activate"] = FakeStore.activated()
        var now = Date(timeIntervalSince1970: 1_800_000_000)
        let first = make(store, at: { now })
        now += 60 * 86_400
        XCTAssertEqual(first.entitlement, .expired)

        let license = try await first.activate("  KEY-1\n", instanceName: "Ada’s Mac")
        XCTAssertEqual(license.key, "KEY-1")
        XCTAssertEqual(license.instanceID, "inst-9")
        XCTAssertEqual(license.holder, "Ada")
        XCTAssertEqual(store.requests.first?.action, "activate")
        XCTAssertEqual(store.requests.first?.fields, ["license_key": "KEY-1", "instance_name": "Ada’s Mac"])
        XCTAssertEqual(first.entitlement, .licensed(license))
        // Kept across launches, with nothing asked of the store.
        let again = make(store, at: { now })
        XCTAssertEqual(again.entitlement, .licensed(license))
        XCTAssertEqual(store.requests.count, 1)
    }

    func testARefusedKeyReportsTheStoresReason() async {
        let store = FakeStore()
        store.replies["activate"] = (400, #"{"activated":false,"error":"This license key has reached the activation limit.","license_key":null,"meta":null}"#)
        let licensing = make(store)
        do {
            try await licensing.activate("KEY-1", instanceName: "Mac")
            XCTFail("activated")
        } catch {
            XCTAssertEqual(error as? LicenseError, .refused("This license key has reached the activation limit."))
        }
        XCTAssertNil(licensing.license)
    }

    func testAKeyForAnotherProductIsGivenBack() async {
        let store = FakeStore()
        store.replies["activate"] = FakeStore.activated(product: 99)
        store.replies["deactivate"] = (200, #"{"deactivated":true,"error":null}"#)
        let licensing = make(store)
        do {
            try await licensing.activate("KEY-1", instanceName: "Mac")
            XCTFail("activated")
        } catch {
            XCTAssertEqual(error as? LicenseError, .otherProduct)
        }
        XCTAssertEqual(store.requests.map { $0.action }, ["activate", "deactivate"])
        XCTAssertEqual(store.requests.last?.fields["instance_id"], "inst-9")
        XCTAssertNil(licensing.license)
    }

    func testOfflineAndEmptyKeys() async {
        let store = FakeStore()
        store.offline = true
        let licensing = make(store)
        do { try await licensing.activate("   ", instanceName: "Mac"); XCTFail("activated") } catch {
            XCTAssertEqual(error as? LicenseError, .empty)
        }
        XCTAssertTrue(store.requests.isEmpty)
        do { try await licensing.activate("KEY-1", instanceName: "Mac"); XCTFail("activated") } catch {
            guard case .unreachable = error as? LicenseError else { return XCTFail("\(error)") }
        }
        store.offline = false
        store.replies["activate"] = (502, "<html>Bad gateway</html>")
        do { try await licensing.activate("KEY-1", instanceName: "Mac"); XCTFail("activated") } catch {
            XCTAssertEqual(error as? LicenseError, .unexpectedReply(502))
        }
    }

    func testDeactivationFreesTheKey() async throws {
        let store = FakeStore()
        store.replies["activate"] = FakeStore.activated()
        let licensing = make(store)
        try await licensing.activate("KEY-1", instanceName: "Mac")

        store.replies["deactivate"] = (400, #"{"deactivated":false,"error":"Something went wrong."}"#)
        do { try await licensing.deactivate(); XCTFail("deactivated") } catch {
            XCTAssertEqual(error as? LicenseError, .refused("Something went wrong."))
        }
        XCTAssertNotNil(licensing.license)

        store.replies["deactivate"] = (200, #"{"deactivated":true,"error":null}"#)
        try await licensing.deactivate()
        XCTAssertEqual(store.requests.last?.fields, ["license_key": "KEY-1", "instance_id": "inst-9"])
        XCTAssertNil(licensing.license)
        guard case .trial = licensing.entitlement else { return XCTFail("\(licensing.entitlement)") }
    }

    func testFormEncoding() {
        XCTAssertEqual(Licensing.form([("license_key", "a+b c&d=é"), ("x", "-._~")]), "license_key=a%2Bb%20c%26d%3D%C3%A9&x=-._~")
    }
}
