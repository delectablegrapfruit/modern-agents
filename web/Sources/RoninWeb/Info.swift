import RoninArt
import RoninCore

// What does not change frame to frame: the constants, the career, a stage's card, a figure's helpers.

/// The tuning, written once.
private var tuningCache: [UInt8]?

func writeTuning(_ w: inout JSONWriter) {
    if let cached = tuningCache { return w.raw(cached) }
    var t = JSONWriter(capacity: 8192)
    t.beginObject()
    t.key("Tuning")
    t.beginObject()
    t.field("step", Tuning.step)
    t.field("edge", Tuning.edge)
    t.field("reach", Tuning.reach)
    t.field("bloodlustReach", Tuning.bloodlustReach)
    t.field("bloodlust", Tuning.bloodlust)
    t.field("body", Tuning.body)
    t.field("figure", Tuning.figure)
    t.field("cooldown", Tuning.cooldown)
    t.field("stumble", Tuning.stumble)
    t.field("archerRange", Tuning.archerRange)
    t.field("arrowSpeed", Tuning.arrowSpeed)
    t.field("deflectSpeed", Tuning.deflectSpeed)
    t.field("leap", Tuning.leap)
    t.field("landing", Tuning.landing)
    t.field("heroHP", Tuning.heroHP)
    t.field("firstSpawn", Tuning.firstSpawn)
    t.field("parried", Tuning.parried)
    t.field("guardRise", Tuning.guardRise)
    t.field("quickBlow", Tuning.quickBlow)
    t.field("dartWindup", Tuning.dartWindup)
    t.field("dartPace", Tuning.dartPace)
    t.field("dartTell", Tuning.dartTell)
    t.field("bearerWait", Tuning.bearerWait)
    t.field("bearerDarts", Tuning.bearerDarts)
    t.field("bearerStay", Tuning.bearerStay)
    t.field("spring", Tuning.spring)
    t.field("gourdFlight", Tuning.gourdFlight)
    t.field("catchWindow", Tuning.catchWindow)
    t.field("gourdLanding", Tuning.gourdLanding)
    t.field("parryWindow", Tuning.parryWindow)
    t.field("bruteStagger", Tuning.bruteStagger)
    t.field("gourdPoints", Tuning.gourdPoints)
    t.field("senNoSen", Tuning.senNoSen)
    t.field("shardsPerHeart", Tuning.shardsPerHeart)
    t.endObject()

    t.key("kinds")
    t.beginObject()
    for kind in Kind.allCases {
        t.key(kind.rawValue)
        t.beginObject()
        t.field("title", kind.title)
        t.field("baseHP", kind.baseHP)
        t.field("speed", kind.speed)
        t.field("windup", kind.windup)
        t.field("damage", kind.damage)
        t.field("range", kind.range)
        t.field("width", kind.width)
        t.field("bounty", kind.bounty)
        t.field("tip", tip(kind, rules: .standard))
        t.endObject()
    }
    t.endObject()
    t.key("kindOrder"); t.beginArray(); for k in Kind.allCases { t.value(k.rawValue) }; t.endArray()

    t.key("modes")
    t.beginObject()
    for mode in Mode.allCases {
        t.key(mode.rawValue)
        t.beginObject()
        t.field("title", mode.title)
        t.field("gist", mode.gist)
        t.field("level", mode.level)
        t.field("hearts", mode.hearts)
        t.field("pace", mode.pace)
        t.field("windup", mode.windup)
        t.field("interval", mode.interval)
        t.field("stumble", mode.stumble)
        t.field("crowd", mode.crowd)
        t.field("reach", mode.reach)
        t.field("score", mode.score)
        t.field("rankWeight", Rank.weight(mode))
        t.endObject()
    }
    t.endObject()
    t.key("modeOrder"); t.beginArray(); for m in Mode.allCases { t.value(m.rawValue) }; t.endArray()

    t.key("settings"); t.beginArray(); for s in Setting.allCases { t.value(s.name) }; t.endArray()
    t.key("ranks")
    t.beginArray()
    for rung in Rank.ladder {
        t.beginObject(); t.field("kills", rung.kills); t.field("title", rung.title); t.endObject()
    }
    t.endArray()
    t.key("cuts"); t.beginArray(); for (_, name) in cutNames { t.value(name) }; t.endArray()

    t.key("Frame")
    t.beginObject()
    t.field("walkFrames", Frame.walkFrames)
    t.field("foeIdleFrames", Frame.foeIdleFrames)
    t.field("heroIdleFrames", Frame.heroIdleFrames)
    t.field("iaiFrames", Frame.iaiFrames)
    t.field("cutFrames", Frame.cutFrames)
    t.field("recoverFrames", Frame.recoverFrames)
    t.field("chainFrames", Frame.chainFrames)
    t.field("shuffleFrames", Frame.shuffleFrames)
    t.field("windedCycles", Frame.windedCycles)
    t.field("windedFrames", Frame.windedFrames)
    t.field("reels", Frame.reels)
    t.field("reelFrames", Frame.reelFrames)
    t.field("flourishFrames", Frame.flourishFrames)
    t.field("windupFrames", Frame.windupFrames)
    t.field("strikeFrames", Frame.strikeFrames)
    t.field("hurtFrames", Frame.hurtFrames)
    t.field("fallFrames", Frame.fallFrames)
    t.field("clashFrames", Frame.clashFrames)
    t.field("retreatFrames", Frame.retreatFrames)
    t.endObject()

    t.key("Figure")
    t.beginObject()
    t.key("canvas"); t.beginObject(); t.field("width", Double(Figure.canvas.width)); t.field("height", Double(Figure.canvas.height)); t.endObject()
    t.key("feet"); t.point(Figure.feet)
    t.key("anchor"); t.point(Figure.anchor)
    t.field("struckVariants", Figure.struckVariants)
    t.field("retreatStep", Double(Figure.retreatStep))
    t.field("clashGap", Double(Figure.clashGap()))
    t.key("casts")
    t.beginObject()
    for cast in allCasts {
        t.key(castName(cast))
        t.beginObject()
        t.field("pixelHeight", Double(Figure.pixelHeight(cast)))
        t.field("height", Double(Build.of(cast).height))
        t.field("unit", Double(unit(cast)))
        t.field("stride", Double(Figure.stride(cast)))
        let probe = Figure.sketch(cast, .idle(0))
        t.field("width", probe.width)
        t.field("canvasHeight", probe.height)
        t.endObject()
    }
    t.endObject()
    t.key("castOrder"); t.beginArray(); for c in allCasts { t.value(castName(c)) }; t.endArray()
    t.endObject()

    t.key("Palette")
    t.beginObject()
    for (name, rgb) in [("background", Palette.background), ("header", Palette.header), ("ink", Palette.ink), ("gold", Palette.gold),
                        ("blood", Palette.blood), ("steel", Palette.steel), ("jade", Palette.jade), ("silhouette", Palette.silhouette),
                        ("shade", Palette.shade)] {
        t.key(name)
        t.beginArray(); t.value(Double(rgb.r)); t.value(Double(rgb.g)); t.value(Double(rgb.b)); t.endArray()
    }
    t.endObject()

    t.key("rules"); t.beginObject()
    t.key("standard"); t.rules(.standard)
    t.key("queue"); t.rules(.queue)
    t.endObject()
    t.field("saveVersion", SaveGame.currentVersion)
    t.endObject()
    tuningCache = t.bytes
    w.raw(t.bytes)
}

/// The word on beating a kind, as the stage card gives it (`DuelScene.tip`).
func tip(_ kind: Kind, rules: Crowding) -> String {
    switch kind {
    case .grunt: return "ONE CUT"
    case .runner: return "FAST — ONE CUT"
    case .brute: return rules.noBruteKnockback ? "THREE CUTS — CUT AS HIS CLUB GLARES" : "THREE CUTS"
    case .archer: return "CUT THE ARROW BACK"
    case .dancer: return "LEAPS OVER YOU"
    case .warlord: return "A WARLORD — WAIT OUT HIS GUARD"
    }
}

extension WebSession {
    /// Everything the menus, the cards and the HUD read from the career.
    func writeCareer(_ w: inout JSONWriter) {
        let c = career
        w.beginObject()
        w.field("seed", String(c.seed))
        w.field("mode", c.mode.key)
        w.field("modeTitle", c.mode.title)
        w.field("stage", c.stage)
        w.field("current", c.current)
        w.field("cleared", c.cleared)
        w.key("unlocked"); w.beginObject(); w.field("from", c.unlocked.lowerBound); w.field("to", c.unlocked.upperBound); w.endObject()
        w.field("carried", c.carried)
        w.field("carriedShards", c.carriedShards)
        w.field("isEndless", c.isEndless)
        w.key("endless"); w.run(c.endless)
        w.key("run"); w.run(c.run)
        w.field("runScore", runScore)
        w.key("bestCampaignRun"); w.run(c.bestCampaignRun)
        w.key("bestEndlessRun"); w.run(c.endless.flatMap { c.bestRun(from: $0.start) })
        w.field("bestEndless", c.bestEndless[c.mode.rawValue] ?? 0)
        w.field("attempt", c.attempt)
        w.field("kills", c.kills)
        w.field("merit", c.merit)
        w.field("rank", c.rank)
        w.key("nextRank")
        if let next = c.nextRank {
            w.beginObject()
            w.field("kills", next.kills)
            w.field("title", next.title)
            w.field("killsNeeded", Rank.kills(from: c.merit, to: next.kills, on: c.mode))
            w.endObject()
        } else {
            w.null()
        }
        w.field("falls", c.falls)
        w.field("flawless", c.flawless)
        w.field("bestCombo", c.bestCombo)
        w.field("bestScore", c.bestScore)
        w.field("score", c.score)
        w.field("streak", c.streak)
        w.key("lastRun"); w.run(c.lastRun)
        w.field("lastRunIsBest", c.lastRunIsBest)
        w.field("promotion", promotion)
        w.field("autopilot", autopilot)
        // What the menu's "Restart Stage" says, as the fight stands.
        switch fight.outcome {
        case nil: w.field("restartTitle", "Restart Stage · ♥ \(fight.hp)")
        case .victory?: w.field("restartTitle", "Next Stage")
        case .defeat?: w.field("restartTitle", "Start Over · Stage \(c.current)")
        }
        // Each mode's campaign, as the Difficulty menu shows it.
        w.key("modes")
        w.beginArray()
        for mode in Mode.allCases {
            var probe = c
            probe.choose(mode)
            let hearts = mode == c.mode && !c.isEndless && fight.outcome == nil ? fight.hp : probe.carried
            w.beginObject()
            w.field("mode", mode.key)
            w.field("title", mode.title)
            w.field("gist", mode.gist)
            w.field("hearts", hearts)
            w.field("maxHearts", mode.hearts)
            w.field("stage", probe.stage)
            w.field("reached", probe.unlocked.upperBound)
            w.field("cleared", probe.cleared)
            w.key("bestCampaignRun"); w.run(probe.bestCampaignRun)
            w.field("bestEndless", c.bestEndless[mode.rawValue] ?? 0)
            w.field("kills", c.killsByMode[mode.rawValue] ?? 0)
            w.field("selected", mode == c.mode)
            w.endObject()
        }
        w.endArray()
        // The stages an endless run may be played on, as the Endless menu lists them.
        w.key("endlessStages")
        w.beginArray()
        for stage in c.unlocked {
            w.beginObject()
            w.field("stage", stage)
            w.field("warlord", stage % 5 == 0)
            w.key("best"); w.run(c.bestRun(from: stage))
            w.field("selected", c.endless?.start == stage)
            w.endObject()
        }
        w.endArray()
        // The raw books, by mode.
        w.key("byMode")
        w.beginObject()
        for (name, table) in [("stages", c.stages), ("hearts", c.hearts), ("shards", c.shards), ("reached", c.reached),
                              ("highest", c.highest), ("bestEndless", c.bestEndless), ("killsByMode", c.killsByMode)] {
            w.key(name)
            w.beginObject()
            for key in table.keys.sorted() { w.key(key); w.value(table[key]!) }
            w.endObject()
        }
        w.key("runs"); w.beginObject(); for key in c.runs.keys.sorted() { w.key(key); w.run(c.runs[key]) }; w.endObject()
        w.key("bestRuns"); w.beginObject(); for key in c.bestRuns.keys.sorted() { w.key(key); w.run(c.bestRuns[key]) }; w.endObject()
        w.endObject()
        w.key("banner"); writeBanner(&w)
        w.endObject()
    }

    /// The banner over a finished fight (`DuelScene.showBanner`), or null while it goes on.
    func writeBanner(_ w: inout JSONWriter) {
        guard let outcome = fight.outcome else { return w.null() }
        let won = outcome == .victory
        w.beginObject()
        w.field("outcome", outcome.key)
        w.field("title", won ? (fight.stats.damage == 0 ? "FLAWLESS" : "CLEARED") : "FALLEN")
        let seconds = Int(fight.time)
        let clock = "\(seconds / 60):" + (seconds % 60 < 10 ? "0" : "") + "\(seconds % 60)"
        var stats: [(StaticString, String)] = [("skull", "\(fight.stats.kills)"), ("swords", "\(fight.stats.bestCombo)"), ("clock", clock)]
        var total = fight.score
        var caption: String?
        var best = false
        if !won {
            if let run = career.lastRun, run.stage == fight.stage {
                stats = [(career.isEndless ? "infinity" : "steps", "\(run.cleared)"), ("skull", "\(run.kills)"), ("swords", "\(run.bestCombo)")]
                total = run.score
                best = career.lastRunIsBest
            }
            caption = "STAGE \(career.current)"
        }
        w.key("stats")
        w.beginArray()
        for (icon, text) in stats {
            w.beginObject(); w.field("icon", icon); w.field("text", text); w.endObject()
        }
        w.endArray()
        w.field("score", total)
        w.field("caption", caption)
        w.field("bestRun", best)
        w.key("marks")
        w.beginArray()
        if let promotion { w.value(promotion.uppercased()) }
        if best { w.value("BEST RUN") }
        w.endArray()
        w.field("action", won ? "play" : "again")
        w.endObject()
    }
}

/// A stage as the app describes it: its setting, what it brings, and its title card (`DuelScene.introduce`).
func writeStage(_ stage: Int, mode: Mode, _ w: inout JSONWriter) {
    let stage = max(1, stage)
    let d = Difficulty(stage: stage, mode: mode)
    let setting = Setting.of(stage: stage)
    let newcomer = Difficulty.introduces(stage)
    let rules = session.rules
    let career = session.career
    let fight = session.fight
    let isCurrent = fight.stage == stage && fight.mode == mode
    w.beginObject()
    w.field("stage", stage)
    w.field("mode", mode.key)
    w.field("modeTitle", mode.title)
    w.field("setting", setting.name)
    w.field("settingIndex", setting.rawValue)
    w.field("boss", d.boss)
    w.key("introduces"); if let newcomer { w.value(newcomer.key) } else { w.null() }
    w.key("difficulty"); w.difficulty(d)
    w.field("rosterSize", min(72, 12 + 4 * stage) + (d.boss ? 1 : 0))
    // The kinds that can come, and how often (relative weights; the warlord closes a boss stage).
    w.key("kinds")
    w.beginObject()
    w.field("grunt", 1.0)
    if stage >= 2 { w.field("runner", min(0.80, 0.30 + 0.02 * Double(stage))) }
    if stage >= 3 { w.field("brute", min(0.40, 0.16 + 0.012 * Double(stage))) }
    if stage >= 4 { w.field("archer", min(0.30, 0.12 + 0.01 * Double(stage))) }
    if stage >= 6 { w.field("dancer", min(0.45, 0.14 + 0.015 * Double(stage))) }
    if d.boss { w.field("warlord", 1.0) }
    w.endObject()
    // The title card.
    w.key("card")
    w.beginObject()
    w.field("title", "STAGE \(stage)")
    w.field("subtitle", mode.title.uppercased() + "   ·   " + setting.name.uppercased())
    w.field("endless", isCurrent && career.isEndless)
    w.field("crest", newcomer == nil && d.boss)
    w.key("lines")
    w.beginArray()
    var count = 0
    if career.kills == 0 {
        // Which mouse button cuts which way: the app shows it on a new career's first card unless the hint was
        // learnt (its `Settings.hintShown`) or floor hints are on — the page's to decide.
        w.beginObject(); w.field("icon", "buttons"); w.field("text", nil as String?); w.field("unlessHintShown", true); w.endObject()
        count += 1
    }
    if let kind = newcomer {
        w.beginObject()
        w.field("icon", kind == .warlord ? "crest" : "figure")
        w.field("kind", kind.key)
        w.field("text", tip(kind, rules: rules))
        w.endObject()
        count += 1
    } else if stage == 1, isCurrent ? fight.bearerIndex != nil : true {
        w.beginObject(); w.field("icon", "gourd"); w.field("text", "CATCH HIM TWICE, THEN CATCH THE GOURD"); w.endObject()
        count += 1
    }
    if isCurrent, let run = career.endless {
        let best = career.bestRun(from: run.start)?.cleared ?? 0
        let text = run.cleared == 0 ? "THE SAME STAGE, AGAIN AND AGAIN"
            : "\(run.cleared) CLEARED IN A ROW" + (best > run.cleared ? " · BEST \(best)" : "")
        w.beginObject(); w.field("icon", "infinity"); w.field("text", text); w.endObject()
        count += 1
    }
    if stage == 2 {
        w.beginObject(); w.field("icon", "shards"); w.field("text", "CUT AS THE RING TURNS GOLD — A SHARD"); w.endObject()
        count += 1
    }
    w.endArray()
    // Seconds it stays up (not counting its 0.22 s coming in and 0.3 s going); a line for the buttons counts.
    w.field("hold", 1.1 + 0.8 * Double(count))
    w.endObject()
    w.key("tips")
    w.beginObject()
    for kind in Kind.allCases { w.key(kind.rawValue); w.value(tip(kind, rules: rules)) }
    w.endObject()
    w.endObject()
}

/// A figure's helpers for one frame (or pose): footing, weapon tip, contact, anatomy, whether it is smeared.
func writeFigure(_ r: Request, _ w: inout JSONWriter) throws {
    let cast = try requireCast(r.cast)
    let frame = try requireFrame(r.frame)
    let pose = Figure.pose(cast, frame)
    let footing = Figure.footing(cast, frame)
    let a = Figure.anatomy(cast, frame)
    w.beginObject()
    w.field("cast", castName(cast))
    w.field("frame", frameKey(frame))
    w.key("footing"); w.beginObject(); w.key("front"); w.point(footing.front); w.key("back"); w.point(footing.back); w.endObject()
    w.key("tip"); w.point(Figure.tip(cast, frame))
    w.key("contact"); w.point(Figure.contact(cast, frame))
    w.key("club")
    if let line = club(cast, frame) {
        w.beginObject(); w.key("grip"); w.point(line.grip); w.key("head"); w.point(line.head); w.endObject()
    } else {
        w.null()
    }
    w.field("smeared", smeared(pose))
    w.field("armed", pose.armed)
    w.field("airborne", pose.airborne)
    w.field("roll", Double(pose.roll))
    w.field("blade", Double(pose.blade))
    w.field("blade2", Double(pose.blade2))
    w.field("lean", Double(pose.lean))
    w.field("clutch", pose.clutch)
    w.field("sheathed", Double(pose.sheathed))
    w.key("anatomy")
    w.beginObject()
    w.key("hip"); w.point(a.hip)
    w.key("waist"); w.point(a.waist)
    w.key("chest"); w.point(a.chest)
    w.key("neck"); w.point(a.neck)
    w.key("head"); w.point(a.head)
    w.field("headRadius", Double(a.headRadius))
    w.key("knee"); w.point(a.knee)
    w.field("height", Double(a.height))
    w.endObject()
    w.endObject()
}
