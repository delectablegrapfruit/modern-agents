// js/rules/fight.js — owner: W2-RulesC (W1-C in wave 1). SR.rules.fight: bar fights, the Underground Ring and Red's goons
// (GDD §4.12, §6.3; BALANCE B-13; ARCHITECTURE §6.5, §10), and the Quick-fight Auto policy.
//
// A Fight is a plain JSON object the fight engine (js/minigames/fight.js, W2-Night) plays turn by
// turn with these functions and host.rng (the rules stream):
//   create(s, kind, n, rng) → Fight · playerMove(f, move, rng) · endTurn(f, rng) / enemyTurn(f, rng)
//   · run(f) · autoPlay(s, f, rng) (the Auto: a real sample) · finish(s, f, choice, ctx) → the state.
// kind 'bar' (the ladder: n = 1-12), 'ring' (bout k, P1 `nightlife`), 'goons' (Red's two, P1 `arcs`).
// `rand(x)` is the original's random(floor(x)): an integer 0..floor(x) - 1 (orig); every roll takes
// exactly one draw, so a seed replays a fight exactly. Minimum damage 1 (orig), except a miss.
//
// Named fns for the building data (W2-Night's bar and the arcs): 'fight.start' (effect, args kind:
// the start cost, state.fight.open and Result.open), 'fight.resolve' (effect, args kind: the
// minigame result, the win and lose rules; refused unless today's fight is open, whose identity
// wins over the echoed result), 'fight.canStart' (condition, args kind; the ring's rules).
// Pure: no DOM, browser API or unseeded randomness (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;
  // Built-ins held locally: in Node's vm contexts (the tests and the balance simulator) every global
  // lookup costs ~150 ns, and these functions run millions of times there.
  var Mth = Math;

  var MOVES = ['punch', 'kick', 'fireball', 'inkBeam', 'guard'];
  var ATTACKS = ['punch', 'kick', 'fireball', 'inkBeam'];
  var ICONS = { punch: 'punch', kick: 'kick', fireball: 'fireball', inkBeam: 'inkbeam', guard: 'guard' };
  // Not balance, safety: a fight always ends (every hit does ≥ 1), but a guard against data errors.
  var MAX_TURNS = 500;
  var LOG_MAX = 60;

  function T() { return SR.tuning.fight; }
  function feat(flag) { return !!SR.features[flag]; }
  function perk(s, id) { return !!(SR.rules.perks && SR.rules.perks.has(s, id)); }
  function rng0(rng) { return rng || SR.rng.rules; }

  /** The original's random(floor(x)): an integer 0..floor(x) - 1 (0 when floor(x) < 1); one draw. */
  function rand(rng, x) {
    var m = Mth.floor(x);
    return rng.int(0, Mth.max(0, m - 1));
  }

  // --------------------------------------------------------------------------------------------
  // Opponents

  /** @returns {object[]} the registered fighters matching a filter, in registration order. */
  function fighters(filter) {
    return SR.registry.entries('fighter').map(function (e) { return e.def; }).filter(filter);
  }

  /** @returns {object|null} the ladder regular on rung n (1-12). */
  function regular(n) {
    var list = fighters(function (d) { return d.ladder && d.n === n; });
    return list[0] || null;
  }

  /** @returns {object|null} the masked regular of ring bout k (they take turns in order). */
  function masked(k) {
    var list = fighters(function (d) { return d.ring; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    return list.length ? list[(Mth.max(1, k) - 1) % list.length] : null;
  }

  /**
   * The ladder rung of the next ordinary bar fight: fights won + 1 (orig counter), capped at 12;
   * once you are Sticky's champion (P1) a random regular of rungs 8-12.
   * @returns {number}
   */
  function nextN(s, rng) {
    var L = T().ladder;
    if (s.fight.champion) return rng0(rng).int(T().afterChampion[0], T().afterChampion[1]);
    return Mth.min(L.n, (s.fight.won || 0) + 1);
  }

  /**
   * An opponent's numbers (B-13): ladder n has HP 8 + 12n + rand(0..4n) and power P = 6 + 9n;
   * ring bout k has P = 120 + 0.8 STR + 20k and HP = 150 + 1.1 STR + 30k (floored); the goons fight
   * at rung tuning.fight.goons.n. One draw for the ladder HP; none for the ring.
   * @param {string} kind 'bar' | 'ring' | 'goons'
   * @param {number} n the ladder rung (bar, goons) or the bout number k (ring)
   * @returns {{id: string, name: string, n: number, k: number, hp: number, P: number, quirk: (object|null)}}
   */
  function opponent(s, kind, n, rng) {
    rng = rng0(rng);
    var F = T(), def, hp, P, k = 0;
    if (kind === 'ring') {
      k = Mth.max(1, Mth.floor(n || 1));
      def = masked(k);
      var str = s.stats.str;
      P = Mth.floor(F.ring.power.base + F.ring.power.str * str + F.ring.power.perK * k);
      hp = Mth.floor(F.ring.hp.base + F.ring.hp.str * str + F.ring.hp.perK * k);
      n = 0;
    } else {
      if (kind === 'goons') n = F.goons.n;
      n = SR.util.clamp(Mth.floor(n || 1), 1, F.ladder.n);
      def = kind === 'goons' ? fighters(function (d) { return d.goon; })[0] || regular(n) : regular(n);
      var L = F.ladder;
      hp = L.hp.base + L.hp.perN * n + rng.int(0, L.hp.randPerN * n);
      P = L.power.base + L.power.perN * n;
    }
    if (def && typeof def.hp === 'number') hp = def.hp;
    if (def && typeof def.P === 'number') P = def.P;
    return {
      id: def ? def.id : kind + '.' + (n || k), name: def ? def.name : 'fighter.unknown.name',
      n: n, k: k, hp: hp, P: P, quirk: quirkOf(def),
    };
  }

  /**
   * A fighter's quirk with its sizes: SR.tuning.fight.quirks[quirk.id] (GDD §6.3), under the def's
   * own fields (the move of `always`, or an override).
   * @returns {(object|null)}
   */
  function quirkOf(def) {
    if (!def || !def.quirk) return null;
    var rows = T().quirks || {};
    return Object.assign({}, SR.util.clone(rows[def.quirk.id] || {}), SR.util.clone(def.quirk));
  }

  // --------------------------------------------------------------------------------------------
  // The player's side

  /**
   * AP per turn (B-13): min(floor(STR / 20) + 1, 15) (orig), +1 with Harold as corner man (the
   * barfly branch, P1 `arcs`; B-26: in bar fights and the ring, not when Red's goons jump you in
   * the street), +1 with Brawler (P1 perk).
   * @param {string=} kind 'bar' (default) | 'ring' | 'goons'
   * @returns {number}
   */
  function ap(s, kind) {
    var A = T().ap;
    var n = Mth.min(Mth.floor(s.stats.str / A.strDiv) + A.base, A.max);
    var h = s.npc && s.npc.harold;
    if (feat('arcs') && h && h.branch === 'barfly' && kind !== 'goons') n += A.harold;
    if (perk(s, 'brawler')) n += A.brawler;
    return n;
  }

  /** @returns {object} the player's fight numbers, frozen at the start of the fight. */
  function fighterOf(s, kind) {
    var F = T(), st = s.stats;
    var night = feat('nightlife'), a = ap(s, kind);
    return {
      hp: Mth.max(0, st.hp), hpMax: st.hpMax, str: st.str, cha: st.cha,
      apMax: a, ap: a,
      knife: s.items.knife > 0 ? 1 : 0, knuckles: s.items.knuckles > 0 ? 1 : 0,
      buzz: night ? Mth.min(st.buzz || 0, F.moves.punch.buzzMax) : 0,
      vest: s.items.vest > 0 ? F.vest : 0,
      heavy: perk(s, 'heavyHitter') ? F.heavyHitter : 1,
      critP: st.cha >= F.crit.cha ? F.crit.chanceHighCha : F.crit.chance,
      guard: 0,
    };
  }

  /**
   * The base roll of a move before the crit and the multipliers: { m, add } where the damage is
   * rand(m) + add (B-13; orig formulas).
   */
  function baseRoll(me, move) {
    var M = T().moves;
    switch (move) {
      case 'punch': return { x: (me.str + M.punch.strAdd) / M.punch.div, add: M.punch.knife * me.knife + M.punch.knuckles * me.knuckles + me.buzz };
      case 'kick': return { x: me.str / M.kick.div, add: M.kick.knife * me.knife + M.kick.add };
      case 'fireball': return { x: me.str / M.fireball.div, add: 0 };
      case 'inkBeam': return { x: me.str / M.inkBeam.div, add: 0 };
      default: return null;
    }
  }

  /** @returns {number} a hit after the multipliers: floor(v × crit × heavy × (1 - armor)), minimum 1. */
  function hitOf(v, crit, me, foe) {
    var F = T();
    var x = v * (crit ? F.crit.mult : 1) * me.heavy * (1 - (foe.quirk && foe.quirk.armor ? foe.quirk.armor : 0));
    return Mth.max(F.minDamage, Mth.floor(x + 1e-9));
  }

  /**
   * The damage range of a move for the UI chips (no crit to max crit).
   * @returns {{min: number, max: number}}
   */
  function range(f, move) {
    var r = baseRoll(f.me, move);
    if (!r) return { min: 0, max: 0 };
    var hi = Mth.max(0, Mth.floor(r.x) - 1) + r.add;
    return { min: hitOf(r.add, false, f.me, f.foe), max: hitOf(hi, true, f.me, f.foe) };
  }

  /**
   * The exact expected damage of a move (the uniform roll, the crit chance, the multipliers and
   * the minimum of 1): the Auto policy compares these per AP.
   * @returns {number}
   */
  function expected(f, move) {
    var r = baseRoll(f.me, move);
    if (!r) return 0;
    var m = Mth.max(1, Mth.floor(r.x)), p = f.me.critP, sum = 0;
    for (var v = 0; v < m; v++) {
      sum += (1 - p) * hitOf(v + r.add, false, f.me, f.foe) + p * hitOf(v + r.add, true, f.me, f.foe);
    }
    return sum / m;
  }

  /**
   * The moves for the UI and the Auto: cost, damage range, expected damage, whether it is allowed now.
   * @returns {{id: string, ap: number, icon: string, min: number, max: number, ev: number, ok: boolean}[]}
   */
  function moves(f) {
    var M = T().moves;
    return MOVES.filter(function (m) { return m !== 'guard' || f.guardOk; }).map(function (m) {
      var rg = range(f, m);
      return { id: m, ap: M[m].ap, icon: ICONS[m], min: rg.min, max: rg.max, ev: m === 'guard' ? 0 : expected(f, m),
        ok: f.phase === 'player' && f.me.ap >= M[m].ap };
    });
  }

  // --------------------------------------------------------------------------------------------
  // The fight

  /**
   * Creates a fight (no state change; one draw for a ladder opponent's HP).
   * @param {object} s state (read)
   * @param {string} kind 'bar' | 'ring' | 'goons'
   * @param {number=} n the rung (bar; default nextN, which draws after the champion) or bout k (ring)
   * @param {object=} rng the rules stream (default SR.rng.rules)
   * @returns {object} the Fight
   */
  function create(s, kind, n, rng) {
    rng = rng0(rng);
    kind = kind === 'ring' || kind === 'goons' ? kind : 'bar';
    if (n === undefined || n === null) n = kind === 'ring' ? (s.fight.ringBouts || 0) + 1 : kind === 'goons' ? T().goons.n : nextN(s, rng);
    var o = opponent(s, kind, n, rng);
    return {
      kind: kind, n: o.n, k: o.k, fighter: o.id, name: o.name,
      turn: 1, phase: 'player', outcome: null,
      me: fighterOf(s, kind),
      foe: { hp: o.hp, hpMax: o.hp, P: o.P, quirk: o.quirk },
      guardOk: feat('nightlife'),
      log: [],
    };
  }

  function note(f, e) {
    f.log.push(e);
    if (f.log.length > LOG_MAX) f.log.splice(0, f.log.length - LOG_MAX);
  }

  /**
   * The player's move (B-13): costs its AP; an attack rolls rand(x) + adds (1 draw), then the crit
   * (1 draw: 10 %, 15 % at CHA ≥ 300, ×1.5), Heavy Hitter ×1.25, Iron Irma's armour, minimum 1.
   * Guard (P1 `nightlife`) takes 1 AP: the next enemy hit -50 %, two guards -75 %.
   * @param {string} move 'punch' | 'kick' | 'fireball' | 'inkBeam' | 'guard'
   * @returns {{ok: boolean, reason: (string|undefined), move: string, dmg: number, crit: boolean,
   *   win: boolean, turnOver: boolean}}
   */
  function playerMove(f, move, rng) {
    rng = rng0(rng);
    var M = T().moves;
    if (f.phase !== 'player') return { ok: false, reason: 'reason.notNow', move: move };
    if (MOVES.indexOf(move) < 0 || (move === 'guard' && !f.guardOk)) return { ok: false, reason: 'reason.unavailable', move: move };
    if (f.me.ap < M[move].ap) return { ok: false, reason: 'reason.notNow', move: move };
    f.me.ap -= M[move].ap;
    if (move === 'guard') {
      f.me.guard += 1;
      note(f, { who: 'me', move: move, dmg: 0 });
      return { ok: true, move: move, dmg: 0, crit: false, win: false, turnOver: f.me.ap === 0 };
    }
    var r = baseRoll(f.me, move);
    var v = rand(rng, r.x) + r.add;
    var crit = rng.chance(f.me.critP);
    var dmg = hitOf(v, crit, f.me, f.foe);
    f.foe.hp = Mth.max(0, f.foe.hp - dmg);
    note(f, { who: 'me', move: move, dmg: dmg, crit: crit });
    var win = f.foe.hp <= 0;
    if (win) { f.phase = 'over'; f.outcome = 'win'; }
    return { ok: true, move: move, dmg: dmg, crit: crit, win: win, turnOver: !win && f.me.ap === 0 };
  }

  /**
   * The enemy's turn (B-13): roll = rand(P) + 1 picks the attack (> 40 Ink Beam rand(P/1.5), > 20
   * fireball rand(P/2.5), > 10 kick rand(P/4.5), else punch rand(P/10) + 1; the original's
   * thresholds with P for your STR), 2 draws; quirks: always one move, a wider fireball band, a miss
   * chance (+1 draw). Then the vest (-30 %, P1) and a guard (-50 % / -75 %), minimum 1. A new turn
   * starts with full AP.
   * @returns {{move: string, dmg: number, miss: boolean, lose: boolean}}
   */
  function enemyTurn(f, rng) {
    rng = rng0(rng);
    if (f.phase === 'over') return { move: null, dmg: 0, miss: false, lose: f.outcome === 'lose' };
    var E = T().enemyMove, P = f.foe.P, q = f.foe.quirk || {};
    var roll = rand(rng, P) + 1, move;
    var fbLow = E.fireball.over;
    if (q.fireballOdds) fbLow = Mth.max(0, E.inkBeam.over - (E.inkBeam.over - E.fireball.over) * q.fireballOdds);
    if (roll > E.inkBeam.over) move = 'inkBeam';
    else if (roll > fbLow) move = 'fireball';
    else if (roll > E.kick.over) move = 'kick';
    else move = 'punch';
    if (q.always) move = q.always;
    var v = move === 'punch' ? rand(rng, P / E.punch.div) + E.punch.add : rand(rng, P / E[move].div);
    var miss = !!(q.miss && rng.chance(q.miss));
    var dmg = 0;
    if (!miss) {
      var G = T().moves.guard;
      var x = v * (1 - f.me.vest) * (f.me.guard >= 2 ? 1 - G.two : f.me.guard === 1 ? 1 - G.one : 1);
      dmg = Mth.max(T().minDamage, Mth.floor(x + 1e-9));
    }
    f.me.hp = Mth.max(0, f.me.hp - dmg);
    note(f, { who: 'foe', move: move, dmg: dmg, miss: miss });
    var lose = f.me.hp <= 0;
    if (lose) { f.phase = 'over'; f.outcome = 'lose'; } else {
      f.turn += 1;
      f.phase = 'player';
      f.me.ap = f.me.apMax;
      f.me.guard = 0;
    }
    return { move: move, dmg: dmg, miss: miss, lose: lose };
  }

  /** End Turn: passes the remaining AP (orig) and lets the enemy strike. @returns the enemy turn */
  function endTurn(f, rng) {
    if (f.phase !== 'player') return { move: null, dmg: 0, miss: false, lose: f.outcome === 'lose' };
    f.phase = 'enemy';
    return enemyTurn(f, rng);
  }

  /** Run away (orig: no further cost): the fight ends as 'run'. @returns {boolean} */
  function run(f) {
    if (f.phase !== 'player') return false;
    f.phase = 'over';
    f.outcome = 'run';
    return true;
  }

  /**
   * The Auto move (B-13 `auto`): the affordable attack with the highest expected damage per AP
   * (ties: the cheaper move); never Guard, never Run. @returns {string|null} null: end the turn
   */
  function autoMove(f) {
    var M = T().moves, best = null;
    ATTACKS.forEach(function (m) {
      if (f.me.ap < M[m].ap) return;
      var per = expected(f, m) / M[m].ap;
      if (!best || per > best.per + 1e-12 || (Mth.abs(per - best.per) <= 1e-12 && M[m].ap < M[best.m].ap)) best = { m: m, per: per };
    });
    return best ? best.m : null;
  }

  /**
   * "Quick fight" (ARCHITECTURE §10): plays the fight turn by turn with real rolls from rng and the
   * Auto policy, so it can lose. Mutates and returns the Fight's result.
   * @returns {{outcome: string, hpLeft: number, turns: number, kind: string, n: number, k: number, auto: boolean}}
   */
  function autoPlay(s, f, rng) {
    rng = rng0(rng);
    if (!f) f = create(s, 'bar', undefined, rng);
    var steps = 0;
    while (f.phase !== 'over' && steps++ < MAX_TURNS * 16) {
      if (f.phase === 'enemy') { enemyTurn(f, rng); continue; }
      var m = autoMove(f);
      if (m) playerMove(f, m, rng);
      else endTurn(f, rng);
    }
    if (f.phase !== 'over') { f.phase = 'over'; f.outcome = 'run'; }
    return result(f, true);
  }

  /** @returns {object} the engine's result shape (CONTRACT §13) plus the fight's identity. */
  function result(f, auto) {
    var r = { outcome: f.outcome || 'run', hpLeft: f.me.hp, turns: f.turn, kind: f.kind, n: f.n, k: f.k, fighter: f.fighter };
    if (auto) r.auto = true;
    return r;
  }

  // --------------------------------------------------------------------------------------------
  // Applying a fight to the state

  function partial() { return SR.rules.effects.partial(); }
  function credit(s, n, src) { return SR.rules.effects.credit(s, 'cash', n, src); }

  /**
   * Applies a finished fight to the state (B-13): HP to what is left; a loss by difficulty (Hardcore:
   * HP 0 → SR.rules.health.down through the pipeline, cause 'fight'; Standard: HP 1 and 10 % of your
   * cash on the tab; Relaxed: HP 1); a win: +3 STR (bar and ring), the ladder counter, the wallet
   * (-3 karma) or Buy him a drink (P1), the champion's $1,000 (P1), the ring's purse (P1).
   * @param {object} s state (mutated)
   * @param {{kind: string, n: number, k: number, outcome: string, hpLeft: number}} f a Fight or a result
   * @param {string=} choice 'wallet' (default) | 'drink' (P1 `nightlife`)
   * @param {object=} ctx the pipeline context ({ rng }; ctx.cause is set to 'fight' on a Hardcore loss)
   * @returns {object} a partial Result
   */
  function finish(s, f, choice, ctx) {
    ctx = ctx || { rng: SR.rng.rules };
    var rng = rng0(ctx.rng), F = T(), res = partial(), st = s.stats;
    var kind = f.kind || 'bar', outcome = f.outcome || 'run';
    var n = typeof f.n === 'number' && f.n > 0 ? f.n : kind === 'goons' ? F.goons.n : Mth.min(F.ladder.n, (s.fight.won || 0) + 1);
    var hpLeft = typeof f.hpLeft === 'number' ? f.hpLeft : f.me && typeof f.me.hp === 'number' ? f.me.hp : st.hp;
    hpLeft = SR.util.clamp(Mth.floor(hpLeft), 0, st.hp);
    if (outcome === 'lose') {
      var diff = s.mode.difficulty;
      var L = F.lose[diff] || F.lose.standard;
      if (L.down) {
        st.hp = 0;             // the HP-0 hook takes over (Second Wind or FLATLINED): no lose toast
        ctx.cause = 'fight';
      } else {
        st.hp = Mth.min(st.hp, L.hp);
        if (L.cashPct > 0) {
          var tab = Mth.floor(s.money.cash * L.cashPct);
          if (tab > 0) {
            s.money.cash -= tab;
            res.toasts.push({ key: 'toast.fight.tab', vars: { n: tab, money: SR.text.money(tab) }, kind: 'warning' });
          }
        }
      }
      // The bouncer throws you out of Sticky's (bar, ring); Red's goons leave you in the street.
      if (!L.down) res.toasts.push({ key: kind === 'goons' ? 'toast.fight.goonsLose' : 'toast.fight.lose', vars: { name: nameOf(f) }, kind: 'warning' });
    } else {
      st.hp = hpLeft;
    }
    if (outcome === 'win') {
      if (kind !== 'goons') SR.rules.stats.add(s, 'str', F.win.str, 'train');
      s.records.fightsWon = (s.records.fightsWon || 0) + 1;
      if (kind === 'bar') {
        s.fight.won = (s.fight.won || 0) + 1;
        var pick = choice === 'drink' && feat('nightlife') ? 'drink' : 'wallet';
        if (pick === 'drink' && s.money.cash >= F.drink.cash) {
          s.money.cash -= F.drink.cash;
          SR.rules.stats.add(s, 'cha', F.drink.cha, 'reward');
          SR.rules.stats.karma(s, F.drink.karma);
          res.toasts.push({ key: 'toast.fight.drink', vars: { name: nameOf(f) }, kind: 'reward' });
        } else {
          var W = F.wallet;
          var prize = W.base + W.perN * n + rng.int(0, W.randPerN * n);
          credit(s, prize, 'win');
          SR.rules.stats.karma(s, W.karma);
          res.toasts.push({ key: 'toast.fight.wallet', vars: { n: prize, money: SR.text.money(prize), name: nameOf(f) }, kind: 'reward' });
        }
        if (n >= F.champion.n && !s.fight.champion && feat('nightlife')) {
          s.fight.champion = true;
          credit(s, F.champion.prize, 'prize');
          res.stamps.push({ key: 'stamp.fight.champion', vars: { n: F.champion.prize, money: SR.text.money(F.champion.prize) } });
          res.log.push({ kind: 'champion', vars: {} });
        }
        res.log.push({ kind: 'fightWin', vars: { n: n, name: nameOf(f) } });
      } else if (kind === 'ring') {
        var k = typeof f.k === 'number' && f.k > 0 ? f.k : Mth.max(1, s.fight.ringBouts || 1);
        var purse = F.ring.purse.base + F.ring.purse.perK * k;
        credit(s, purse, 'prize');
        s.records.ringWins = (s.records.ringWins || 0) + 1;
        res.toasts.push({ key: 'toast.fight.purse', vars: { n: purse, money: SR.text.money(purse), k: k }, kind: 'reward' });
        res.log.push({ kind: 'ringWin', vars: { k: k } });
      } else {
        res.toasts.push({ key: 'toast.fight.goons', vars: {}, kind: 'reward' });
      }
    } else if (outcome === 'run') {
      res.toasts.push({ key: 'toast.fight.run', vars: {}, kind: 'info' });
    }
    if (s.fight.open) s.fight.open = null;
    res.events.push({ name: 'fight', payload: { kind: kind, n: kind === 'ring' ? (f.k || s.fight.ringBouts || 1) : n, outcome: outcome } });
    return res;
  }

  function nameOf(f) {
    var key = f.name || (f.fighter && SR.reg.fighter[f.fighter] ? SR.reg.fighter[f.fighter].name : null);
    return key && SR.text.has(key) ? SR.text(key) : '';
  }

  /**
   * The start of a fight (B-13): a bar fight costs -2 karma and +5 Heat (its 3 h are the action's
   * cost.min); a ring bout counts as the k-th bout and today's bout. Draws the opponent and returns
   * Result.open for the fight engine with the Fight in params (stake: the Hardcore pending hook).
   * @param {string} kind 'bar' | 'ring' | 'goons'
   * @returns {object} a partial Result with `open`
   */
  function start(s, kind, ctx) {
    ctx = ctx || { rng: SR.rng.rules };
    var rng = rng0(ctx.rng), F = T(), res = partial();
    kind = kind === 'ring' || kind === 'goons' ? kind : 'bar';
    var n;
    if (kind === 'bar') {
      SR.rules.stats.karma(s, F.startCost.karma);
      SR.rules.stats.heat(s, F.startCost.heat);
      n = nextN(s, rng);
    } else if (kind === 'ring') {
      s.fight.ringBouts = (s.fight.ringBouts || 0) + 1;
      s.daily.ring = (s.daily.ring || 0) + 1;
      n = s.fight.ringBouts;
    } else {
      n = F.goons.n;
    }
    var f = create(s, kind, n, rng);
    s.fight.open = { kind: kind, n: f.n, k: f.k, fighter: f.fighter, day: s.clock.day };
    res.open = { minigame: 'fight', skin: 'fight', params: { kind: kind, n: f.n, k: f.k, fight: f, stake: true },
      resolve: ctx.id ? ctx.id + ':resolve' : null };
    return res;
  }

  /**
   * Resolves a fight from the engine's result (params of '<id>:resolve'): { outcome, hpLeft, n?, k?,
   * choice? }. The fight's identity is state.fight.open's (set by start) when one is open, then the
   * echoed result's, then the data's kind argument.
   * @returns {object} a partial Result
   */
  function resolve(s, kind, r, ctx) {
    r = r || {};
    var open = s.fight.open || {};
    var f = {
      kind: open.kind || r.kind || kind || 'bar',
      n: typeof open.n === 'number' ? open.n : r.n,
      k: typeof open.k === 'number' ? open.k : r.k,
      fighter: open.fighter || r.fighter,
      outcome: r.outcome === 'win' || r.outcome === 'lose' ? r.outcome : 'run',
      hpLeft: r.hpLeft,
    };
    return finish(s, f, r.choice, ctx);
  }

  /**
   * The named fn 'fight.resolve': only today's open fight can be resolved, once (finish closes it),
   * so a stray or repeated '<id>:resolve' never pays a wallet, a purse or STR for a fight that
   * did not happen.
   * @returns {object} a partial Result (ok: false with reason.notNow when no fight is open)
   */
  function resolveOpen(s, kind, r, ctx) {
    var open = s.fight && s.fight.open;
    if (!open || open.day !== s.clock.day) return { ok: false, reason: 'reason.notNow', vars: {} };
    return resolve(s, kind, r, ctx);
  }

  /**
   * Whether a fight can start now (a condition): the ring needs the `nightlife` flag, the champion
   * title, a Saturday and no bout yet today.
   * @returns {{ok: boolean, reason: (string|null), vars: (object|null)}}
   */
  function canStart(s, kind) {
    if (kind === 'ring') {
      var R = T().ring;
      if (!feat('nightlife')) return { ok: false, reason: 'reason.featureOff', vars: {} };
      if (!s.fight.champion) return { ok: false, reason: 'reason.notYet', vars: {} };
      if (SR.rules.time.weekday(s) !== R.weekday) return { ok: false, reason: 'reason.wrongDay', vars: {} };
      if ((s.daily.ring || 0) >= R.perDay) return { ok: false, reason: 'reason.dailyLimit', vars: {} };
    }
    return { ok: true, reason: null, vars: null };
  }

  SR.def.fn('fight.start', function (s, params, ctx, kind) { return start(s, kind || params.kind, ctx); });
  SR.def.fn('fight.resolve', function (s, params, ctx, kind) { return resolveOpen(s, kind, params, ctx); });
  SR.def.fn('fight.canStart', function (s, params, ctx, kind) { return canStart(s, kind || params.kind); });

  SR.rules.fight = {
    MOVES: MOVES.slice(),
    ap: ap,
    nextN: nextN,
    opponent: opponent,
    create: create,
    moves: moves,
    range: range,
    expected: expected,
    playerMove: playerMove,
    endTurn: endTurn,
    enemyTurn: enemyTurn,
    run: run,
    autoMove: autoMove,
    autoPlay: autoPlay,
    result: result,
    finish: finish,
    start: start,
    resolve: resolve,
    canStart: canStart,
  };
})();
