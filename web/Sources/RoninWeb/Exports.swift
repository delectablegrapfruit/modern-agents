import RoninArt
import RoninCore

// The functions the page calls (core.js). Data goes through two buffers in linear memory: the page writes its input
// (UTF-8 text) into the one `ronin_buffer` hands it, and every call leaves its output at `ronin_out()`, returning its
// length in bytes: JSON, but for sketches, which are floats (see API.md).

private var inBuffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 1 << 16)
private var inCapacity = 1 << 16
private var outBuffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 1 << 16)
private var outCapacity = 1 << 16

var session = WebSession(seed: nil)

@_cdecl("ronin_buffer")
func ronin_buffer(_ size: Int32) -> UnsafeMutablePointer<UInt8> {
    let n = Int(max(0, size))
    if n > inCapacity {
        inBuffer.deallocate()
        inCapacity = max(n, inCapacity * 2)
        inBuffer = UnsafeMutablePointer<UInt8>.allocate(capacity: inCapacity)
    }
    return inBuffer
}

@_cdecl("ronin_out")
func ronin_out() -> UnsafeMutablePointer<UInt8> { outBuffer }

private func inputBytes(_ length: Int32) -> [UInt8] {
    Array(UnsafeBufferPointer(start: inBuffer, count: Int(max(0, min(Int32(inCapacity), length)))))
}

private func input(_ length: Int32) -> String { String(decoding: inputBytes(length), as: UTF8.self) }

private func emit(_ bytes: [UInt8]) -> Int32 {
    if bytes.count > outCapacity {
        outBuffer.deallocate()
        outCapacity = max(bytes.count, outCapacity * 2)
        outBuffer = UnsafeMutablePointer<UInt8>.allocate(capacity: outCapacity)
    }
    bytes.withUnsafeBufferPointer { src in
        if let base = src.baseAddress { outBuffer.update(from: base, count: bytes.count) }
    }
    return Int32(bytes.count)
}

// MARK: The hot path: a number in, JSON out

/// Steps the fight `dt` seconds (the app's `GameSession.advance`): the events, as a JSON array.
@_cdecl("ronin_advance")
func ronin_advance(_ dt: Double) -> Int32 {
    let before = session.fight.foes
    let promotion = session.promotion
    let events = session.advance(dt)
    return emit(session.eventsJSON(events, before: before, promotionBefore: promotion))
}

/// A cut: -1 left, 1 right (the app's `GameSession.strike`). The events, as a JSON array.
@_cdecl("ronin_strike")
func ronin_strike(_ side: Int32) -> Int32 {
    let before = session.fight.foes
    let promotion = session.promotion
    let events = session.strike(side < 0 ? .left : .right)
    return emit(session.eventsJSON(events, before: before, promotionBefore: promotion))
}

/// The snapshot of the fight and session, as JSON.
@_cdecl("ronin_state")
func ronin_state() -> Int32 { emit(session.stateJSON()) }

/// A sketch: the input is `cast|frame|armed|sheathed` (1 or 0; the last two may be left off: armed, not sheathed).
/// The output is the sketch's floats, or nothing for a cast or frame that does not read.
@_cdecl("ronin_sketch")
func ronin_sketch(_ length: Int32) -> Int32 {
    let parts = input(length).split(separator: "|", omittingEmptySubsequences: false).map(String.init)
    guard parts.count >= 2, let cast = parseCast(parts[0]), let frame = parseFrame(parts[1]) else { return emit([]) }
    let armed = parts.count < 3 || parts[2] != "0"
    let sheathed = parts.count >= 4 && parts[3] == "1"
    var pose = sheathed ? sheathedPose(frame) : Figure.pose(cast, frame)
    let isSmeared = smeared(pose)
    pose.armed = pose.armed && armed
    var encoder = SketchEncoder()
    encoder.encode(Figure.sketch(cast, pose: pose), cast: cast, smeared: isSmeared)
    return emit(encoder.bytes)
}

/// A sketch of a piece of the dead: the input is a JSON `PieceRequest` (Ragdolls.swift), the output floats, or nothing
/// if it does not read.
@_cdecl("ronin_piece")
func ronin_piece(_ length: Int32) -> Int32 {
    guard let request = try? JSON.decode(PieceRequest.self, from: inputBytes(length)),
          let bytes = try? pieceSketch(request) else { return emit([]) }
    return emit(bytes)
}

/// Every ragdoll stepped `dt` seconds (the page's frame): their states, as JSON (`RagdollAPI.step` with no ids).
@_cdecl("ronin_dolls_step")
func ronin_dolls_step(_ dt: Double) -> Int32 {
    var w = JSONWriter(capacity: 1024)
    stepDolls(dt, ids: nil, points: false, &w)
    return emit(w.bytes)
}

/// A ragdoll drawn as it now lies: sketch floats, then where its anchor goes (two floats); nothing if there is no such
/// doll.
@_cdecl("ronin_doll_draw")
func ronin_doll_draw(_ id: Int32) -> Int32 {
    guard let bytes = try? pieceSketch(PieceRequest(kind: "doll", id: Int(id))) else { return emit([]) }
    return emit(bytes)
}

// MARK: Everything else: JSON in, JSON out

struct BridgeError: Error {
    let message: String
    init(_ message: String) { self.message = message }
}

struct RulesInput: Decodable {
    var passThrough: Bool?
    var slipPast: Bool?
    var runnersPassAll: Bool?
    var passBusy: Bool?
    var shove: Bool?
    var noBruteKnockback: Bool?

    func applied(to c: Crowding) -> Crowding {
        var c = c
        if let passThrough { c.passThrough = passThrough }
        if let slipPast { c.slipPast = slipPast }
        if let runnersPassAll { c.runnersPassAll = runnersPassAll }
        if let passBusy { c.passBusy = passBusy }
        if let shove { c.shove = shove }
        if let noBruteKnockback { c.noBruteKnockback = noBruteKnockback }
        return c
    }
}

struct Request: Decodable {
    var op: String
    var seed: String?
    var mode: String?
    var stage: Int?
    var endless: Bool?
    var on: Bool?
    var rules: RulesInput?
    var json: String?
    var cast: String?
    var frame: String?
    var warlordFrame: String?
    var side: String?
    var id: Int?
    var dt: Double?
    var options: RagdollOptions?
}

func parseMode(_ s: String?) throws -> Mode? {
    guard let s else { return nil }
    let key = String(s.lowercased().map { $0 == "ō" ? "o" : $0 })
    if let mode = Mode(rawValue: key) { return mode }
    if let n = Int(key), Mode.allCases.indices.contains(n) { return Mode.allCases[n] }
    throw BridgeError("unknown mode '\(s)' (shoshin, bushido, shura or oni)")
}

func parseSeed(_ s: String?) throws -> UInt64? {
    guard let s, !s.isEmpty else { return nil }
    guard let seed = UInt64(s) else { throw BridgeError("seed '\(s)' is not an unsigned 64-bit integer") }
    return seed
}

func requireCast(_ s: String?) throws -> Cast {
    guard let s, let cast = parseCast(s) else { throw BridgeError("unknown cast '\(s ?? "")'") }
    return cast
}

func requireFrame(_ s: String?) throws -> Frame {
    guard let s, let frame = parseFrame(s) else { throw BridgeError("unknown frame '\(s ?? "")'") }
    return frame
}

@_cdecl("ronin_rpc")
func ronin_rpc(_ length: Int32) -> Int32 {
    var w = JSONWriter(capacity: 1024)
    w.beginObject()
    do {
        let request = try JSON.decode(Request.self, from: inputBytes(length))
        var result = JSONWriter(capacity: 1024)
        try handle(request, &result)
        w.field("ok", true)
        w.key("result")
        w.raw(result.bytes.isEmpty ? Array("null".utf8) : result.bytes)
    } catch let error as BridgeError {
        w.field("ok", false)
        w.field("error", error.message)
    } catch {
        w.field("ok", false)
        w.field("error", String(describing: error))
    }
    w.endObject()
    return emit(w.bytes)
}

private func handle(_ r: Request, _ w: inout JSONWriter) throws {
    switch r.op {
    case "newGame":
        let rules = session.rules
        let autopilot = session.autopilot
        session = WebSession(seed: try parseSeed(r.seed))
        session.rules = rules
        session.autopilot = autopilot
        if let mode = try parseMode(r.mode) {
            session.career.choose(mode)
            session.next()
        }
        session.saveDue = true
        w.value(true)
    case "loadSave":
        guard let json = r.json, let save = loadSave(Array(json.utf8)) else { return w.value(false) }
        let rules = session.rules
        session = WebSession(save: save)
        session.rules = rules
        w.value(true)
    case "saveJSON":
        w.value(session.saveJSON())
    case "career":
        session.writeCareer(&w)
    case "begin":
        let mode = try parseMode(r.mode)
        var changed = false
        if let mode, mode != session.career.mode {
            session.choose(mode)
            changed = true
        }
        if r.endless == true {
            session.startEndless(at: r.stage ?? session.career.current)
            changed = true
        } else {
            if r.endless == false, session.career.isEndless {
                session.leaveEndless()
                changed = true
            }
            if let stage = r.stage, stage != session.fight.stage || session.career.isEndless {
                if session.career.isEndless { session.leaveEndless() }
                session.jump(to: stage)
                changed = true
            }
        }
        w.value(changed)
    case "next":
        session.next()
        w.value(true)
    case "restart":
        session.restart()
        w.value(true)
    case "choose":
        guard let mode = try parseMode(r.mode) else { throw BridgeError("choose needs a mode") }
        session.choose(mode)
        w.value(true)
    case "reset":
        session.reset(seed: try parseSeed(r.seed))
        w.value(true)
    case "startEndless":
        session.startEndless(at: r.stage ?? session.career.current)
        w.value(true)
    case "leaveEndless":
        session.leaveEndless()
        w.value(true)
    case "jump":
        guard let stage = r.stage else { throw BridgeError("jump needs a stage") }
        session.jump(to: stage)
        w.value(true)
    case "setRules":
        if let rules = r.rules { session.rules = rules.applied(to: session.rules) }
        session.fight.crowding = session.rules
        w.rules(session.rules)
    case "rules":
        w.rules(session.rules)
    case "standardRules":
        w.rules(.standard)
    case "queueRules":
        w.rules(.queue)
    case "setAutopilot":
        session.autopilot = r.on ?? true
        w.value(session.autopilot)
    case "tuning":
        writeTuning(&w)
    case "frames":
        let cast = try requireCast(r.cast)
        w.beginArray()
        for frame in Figure.frames(for: cast) { w.value(frameKey(frame)) }
        w.endArray()
    case "footing":
        let footing = Figure.footing(try requireCast(r.cast), try requireFrame(r.frame))
        w.beginObject()
        w.key("front"); w.point(footing.front)
        w.key("back"); w.point(footing.back)
        w.endObject()
    case "figure":
        try writeFigure(r, &w)
    case "clashGap":
        let hero = try r.frame.map { try requireFrame($0) } ?? .clash(0)
        let warlord = try r.warlordFrame.map { try requireFrame($0) } ?? .clash(0)
        w.value(Double(Figure.clashGap(hero: hero, warlord: warlord)))
    case "stage":
        let mode = try parseMode(r.mode) ?? session.career.mode
        writeStage(r.stage ?? session.fight.stage, mode: mode, &w)
    case "raiseBruteClub":
        w.value(session.raiseBruteClub(on: r.side.flatMap(Side.parse) ?? .right))
    case "setWarlordGuard":
        session.setWarlordGuard()
        w.value(true)
    case "ragdoll":
        try ragdollOp(r, &w)
    default:
        throw BridgeError("unknown op '\(r.op)'")
    }
}

extension JSONWriter {
    mutating func point(_ p: CGPoint?) {
        guard let p else { return null() }
        beginObject()
        field("x", Double(p.x))
        field("y", Double(p.y))
        endObject()
    }
}
