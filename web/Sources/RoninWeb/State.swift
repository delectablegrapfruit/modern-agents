import RoninCore

// The fight as the page sees it: events and the snapshot of everything the app's scene reads each frame.

extension Side {
    var key: StaticString { self == .left ? "left" : "right" }
    static func parse(_ s: String) -> Side? {
        switch s.lowercased() {
        case "left", "l", "-1": return .left
        case "right", "r", "1": return .right
        default: return nil
        }
    }
}

extension Foe.Phase {
    var key: StaticString {
        switch self {
        case .advancing: return "advancing"
        case .windup: return "windup"
        case .recoil: return "recoil"
        case .leaping: return "leaping"
        case .aiming: return "aiming"
        case .dying: return "dying"
        case .guarding: return "guarding"
        case .fleeing: return "fleeing"
        }
    }
}

extension Kind {
    var key: StaticString {
        switch self {
        case .grunt: return "grunt"
        case .runner: return "runner"
        case .brute: return "brute"
        case .dancer: return "dancer"
        case .archer: return "archer"
        case .warlord: return "warlord"
        }
    }
}

extension Mode {
    var key: StaticString {
        switch self {
        case .shoshin: return "shoshin"
        case .bushido: return "bushido"
        case .shura: return "shura"
        case .oni: return "oni"
        }
    }
}

extension Outcome {
    var key: StaticString { self == .victory ? "victory" : "defeat" }
}

extension JSONWriter {
    mutating func target(_ t: Fight.Target?) {
        switch t {
        case nil: null()
        case .foe(let id)?:
            beginObject(); field("type", "foe"); field("id", id); endObject()
        case .arrow(let id)?:
            beginObject(); field("type", "arrow"); field("id", id); endObject()
        case .gourd?:
            beginObject(); field("type", "gourd"); endObject()
        }
    }

    mutating func rules(_ c: Crowding) {
        beginObject()
        field("passThrough", c.passThrough)
        field("slipPast", c.slipPast)
        field("runnersPassAll", c.runnersPassAll)
        field("passBusy", c.passBusy)
        field("shove", c.shove)
        field("noBruteKnockback", c.noBruteKnockback)
        field("isStandard", c.isStandard)
        field("passes", c.passes)
        endObject()
    }

    mutating func stats(_ s: FightStats) {
        beginObject()
        field("kills", s.kills)
        field("cuts", s.cuts)
        field("whiffs", s.whiffs)
        field("deflects", s.deflects)
        field("arrowKills", s.arrowKills)
        field("wounds", s.wounds)
        field("damage", s.damage)
        field("bestCombo", s.bestCombo)
        field("parried", s.parried)
        field("glanced", s.glanced)
        field("turned", s.turned)
        endObject()
    }

    mutating func difficulty(_ d: Difficulty) {
        beginObject()
        field("stage", d.stage)
        field("mode", d.mode.key)
        field("pace", d.pace)
        field("windup", d.windup)
        field("interval", d.interval)
        field("crowd", d.crowd)
        field("pairs", d.pairs)
        field("boss", d.boss)
        field("warlordHP", d.warlordHP)
        field("dancerHP", d.dancerHP)
        endObject()
    }

    /// A foe with every field the scene reads, the derived ones included.
    mutating func foe(_ f: Foe, in fight: Fight) {
        beginObject()
        field("id", f.id)
        field("kind", f.kind.key)
        field("x", f.x)
        field("side", f.side.key)
        field("laneSide", Side.of(f.x).key)
        field("distance", f.distance)
        field("gap", f.gap)
        field("phase", f.phase.key)
        field("timer", f.timer)
        field("span", f.span)
        field("progress", f.progress)
        field("hp", f.hp)
        field("maxHP", f.maxHP)
        field("hits", f.hits)
        field("speed", f.speed)
        field("windup", f.windup)
        field("leapFrom", f.leapFrom)
        field("leapTo", f.leapTo)
        field("bearer", f.bearer)
        field("hover", f.hover)
        field("darting", f.darting)
        field("darts", f.darts)
        field("lingered", f.lingered)
        field("guardRest", f.guardRest)
        field("chained", f.chained)
        field("summons", f.summons)
        field("alive", f.alive)
        field("targetable", f.targetable)
        field("contact", f.contact)
        field("width", f.kind.width)
        field("guardAge", f.guardAge)
        field("guardSet", f.guardSet)
        field("senNoSen", f.senNoSen)
        field("readying", f.readying)
        field("clubGlares", f.clubGlares)
        field("turns", fight.turns(f))
        field("isBoss", fight.bossID == f.id)
        endObject()
    }

    mutating func arrow(_ a: Arrow) {
        beginObject()
        field("id", a.id)
        field("from", a.from)
        field("x", a.x)
        field("velocity", a.velocity)
        field("deflected", a.deflected)
        field("side", a.side.key)
        endObject()
    }

    mutating func gourd(_ g: Gourd?) {
        guard let g else { return null() }
        beginObject()
        field("from", g.from)
        field("start", g.start)
        field("land", g.land)
        field("timer", g.timer)
        field("span", g.span)
        field("progress", g.progress)
        field("x", g.x)
        field("catchable", g.catchable)
        field("side", g.side.key)
        endObject()
    }

    mutating func run(_ r: Run?) {
        guard let r else { return null() }
        beginObject()
        field("start", r.start)
        field("stage", r.stage)
        field("hearts", r.hearts)
        field("shards", r.shards)
        field("cleared", r.cleared)
        field("score", r.score)
        field("kills", r.kills)
        field("bestCombo", r.bestCombo)
        endObject()
    }

    /// One event as a plain object: `type` is the case's name, and its values are named as in `FightEvent`. Events
    /// about a foe carry `kind` and `x` too, as he was when it happened (a foe cut down is gone from the next
    /// snapshot).
    mutating func event(_ e: FightEvent, foes: [Int: Foe]) {
        beginObject()
        func foe(_ id: Int, key: StaticString = "foe", detail: Bool = true) {
            field(key, id)
            if detail, let f = foes[id] {
                field("kind", f.kind.key)
                field("x", f.x)
                field("bearer", f.bearer)
            }
        }
        switch e {
        case .arrived(let id): field("type", "arrived"); foe(id)
        case .warlord(let id): field("type", "warlord"); foe(id)
        case .cut(let side, let id, let killed): field("type", "cut"); field("side", side.key); foe(id); field("killed", killed)
        case .whiff(let side): field("type", "whiff"); field("side", side.key)
        case .deflected(let side, let arrow): field("type", "deflected"); field("side", side.key); field("arrow", arrow)
        case .loosed(let archer, let arrow): field("type", "loosed"); foe(archer, key: "archer", detail: false); field("arrow", arrow)
        case .pierced(let id, let arrow, let killed): field("type", "pierced"); foe(id); field("arrow", arrow); field("killed", killed)
        case .raised(let id): field("type", "raised"); foe(id)
        case .wounded(let id, let damage):
            field("type", "wounded")
            if let id { foe(id) } else { field("foe", nil as Int?) }
            field("damage", damage)
            field("arrow", id == nil)
        case .leapt(let id): field("type", "leapt"); foe(id)
        case .landed(let id): field("type", "landed"); foe(id)
        case .bloodlust(let on): field("type", "bloodlust"); field("on", on)
        case .milestone(let n): field("type", "milestone"); field("combo", n)
        case .flung(let id): field("type", "flung"); foe(id)
        case .healed(let id, let restored): field("type", "healed"); foe(id); field("restored", restored)
        case .shattered(let id): field("type", "shattered"); foe(id)
        case .fled(let id): field("type", "fled"); foe(id)
        case .shard(let id, let count): field("type", "shard"); foe(id); field("count", count)
        case .mended(let restored): field("type", "mended"); field("restored", restored)
        case .scattered(let n): field("type", "scattered"); field("count", n)
        case .guarded(let id): field("type", "guarded"); foe(id)
        case .parried(let side, let id): field("type", "parried"); field("side", side.key); foe(id)
        case .summoned(let id, let allies):
            field("type", "summoned"); foe(id)
            key("allies"); beginArray(); for a in allies { value(a) }; endArray()
        case .turned(let side, let id): field("type", "turned"); field("side", side.key); foe(id)
        case .ended(let outcome): field("type", "ended"); field("outcome", outcome.key)
        }
        endObject()
    }
}

extension WebSession {
    /// Events as a JSON array. `before` holds the foes as they were before the step (for the ones it removed), and
    /// a booked fight's promotion follows as `{type: "promotion", rank}`.
    func eventsJSON(_ events: [FightEvent], before: [Foe], promotionBefore: String?) -> [UInt8] {
        var w = JSONWriter(capacity: 256)
        w.beginArray()
        if !events.isEmpty {
            var foes: [Int: Foe] = [:]
            for f in before { foes[f.id] = f }
            for f in fight.foes { foes[f.id] = f }
            for e in events { w.event(e, foes: foes) }
            if let promotion, promotion != promotionBefore, events.contains(where: { if case .ended = $0 { return true } else { return false } }) {
                w.beginObject(); w.field("type", "promotion"); w.field("rank", promotion); w.endObject()
            }
        }
        w.endArray()
        return w.bytes
    }

    /// Everything the scene, its sprites and its HUD read from the fight and the session each frame.
    func stateJSON() -> [UInt8] {
        let f = fight
        var w = JSONWriter(capacity: 4096)
        w.beginObject()
        w.field("stage", f.stage)
        w.field("mode", f.mode.key)
        w.field("endless", career.isEndless)
        w.field("seed", String(f.seed))
        w.field("setting", f.setting.name)
        w.field("settingIndex", f.setting.rawValue)
        w.field("time", f.time)
        w.key("outcome"); if let o = f.outcome { w.value(o.key) } else { w.null() }
        w.field("hp", f.hp)
        w.field("maxHP", f.maxHP)
        w.field("shards", f.shards)
        w.field("score", f.score)
        w.field("bonus", f.bonus)
        w.field("runScore", runScore)
        w.field("combo", f.combo)
        w.field("multiplier", f.multiplier)
        w.field("bloodlust", f.inBloodlust)
        w.field("reach", f.reach)
        w.field("gourdBonus", f.gourdBonus)
        w.field("remaining", f.remaining)
        w.field("progress", f.progress)
        w.field("arrived", f.arrived)
        w.field("defeated", f.defeated)
        w.field("rosterCount", f.roster.count)
        w.field("bearerIndex", f.bearerIndex)
        w.field("healed", f.healed)
        w.field("bossID", f.bossID)
        w.field("spawnTimer", f.spawnTimer)
        w.field("autopilot", f.autopilot)
        w.field("promotion", promotion)
        w.field("saveDue", saveDue)
        w.field("attempt", career.attempt)
        // The ronin.
        w.key("hero")
        w.beginObject()
        w.field("facing", f.facing.key)
        w.field("stumble", f.stumble)
        w.field("isStumbling", f.isStumbling)
        w.field("cooldown", f.cooldown)
        w.key("held"); if let h = f.held { w.value(h.key) } else { w.null() }
        w.endObject()
        // What a cut each way would hit now.
        w.key("target")
        w.beginObject()
        w.key("left"); w.target(f.target(.left))
        w.key("right"); w.target(f.target(.right))
        w.endObject()
        w.key("foes")
        w.beginArray()
        for foe in f.foes { w.foe(foe, in: f) }
        w.endArray()
        w.key("arrows")
        w.beginArray()
        for a in f.arrows { w.arrow(a) }
        w.endArray()
        w.key("gourd"); w.gourd(f.gourd)
        w.key("stats"); w.stats(f.stats)
        w.key("rules"); w.rules(rules)
        w.key("difficulty"); w.difficulty(f.difficulty)
        w.key("roster")
        w.beginArray()
        for k in f.roster { w.value(k.key) }
        w.endArray()
        w.endObject()
        return w.bytes
    }
}
