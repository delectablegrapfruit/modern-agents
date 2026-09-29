// js/minigames/fight.js — owner: W2-Night. The Fight engine (GDD §4.12, §6.3, §6.5; BALANCE B-13;
// UI §5.8): bar fights on Sticky's ladder, the Underground Ring (P1) and Red's goons (P1).
// params (Result.open.params of fight.start): { kind, n, k, fight, stake: true } where `fight` is the
// Fight SR.rules.fight.create made when the row ran (the opponent's HP is already rolled). The
// engine plays it turn by turn with SR.rules.fight.{playerMove, endTurn, run} and host.rng (the rules
// stream), so every roll is the rules' and a seed replays a fight exactly; this file only animates.
//   Side view: you left, the opponent right, 280 u rigs (SR.art.stick fight clips), HP bars, AP
//   pips, a taunt bubble (taunt.<fighter>.1..3), move buttons with their AP and damage range, the
//   "(it froze)" joke link (a fake 2 s freeze, a wink, then the fight resumes). Hits have a 60 ms
//   hit stop, a 6 u shake (off with Reduced Motion or the screen-shake setting) and sparks; a KO
//   is an ink blot growing over the fight for 0.4 s before the result (ART_AUDIO §12).
//   Win: +3 STR and the wallet (P0; -3 karma), or "Buy them a drink" (P1 `nightlife`; B-13 `drink`).
//   Auto = the Quick fight: SR.rules.fight.autoPlay from the current position (real rolls, the best
//   expected damage per AP, never Guard or Run), shown as a 2 s fast-forwarded log.
// Result (CONTRACT §13): { outcome: 'win' | 'lose' | 'run', hpLeft, choice? } plus the fight's
// identity (kind, n, k, fighter); fight.resolve applies it (the open record wins over the echo).
// Input: the `fight` context (move1-move7 = the buttons in order), left / right and confirm pick a
// button, the pointer clicks one. Accessible state: host.label('hp', ...) and #aria per exchange.
(function () {
  'use strict';
  var SR = window.SR;

  // Presentation constants (UI §5.8, ART_AUDIO §12; not balance).
  var RIG_H = 280;             // UI §5.8: both rigs 280 u tall
  var SIDE_H = 182;            // SR.art.stick side view: 52 u × 3.5
  var ME_X = 380, FOE_X = 900, FEET_Y = 462;
  var LUNGE = 90;              // u the attacker steps in on a melee move
  var HIT_STOP = 0.06;         // s (ART_AUDIO §12: 60 ms hit stop)
  var SHAKE_U = 6, SHAKE_S = 0.25;
  var RECOVER = 0.28;          // s after a clip before the next beat
  var TAUNT_S = 2.6;
  var FREEZE_S = 2, WINK_S = 0.9;   // GDD §4.12: a fake 2 s freeze, then a wink
  var REPLAY_S = 2;            // ARCHITECTURE §10: the Quick fight's fast-forwarded log (2 s)
  var KO_S = 0.4, KO_HOLD_S = 0.25;   // ART_AUDIO §12 KO: an ink blot covers the screen in 400 ms, then the result
  var KO_SPLATS = 10;          // the blot's ragged rim: satellite drops around its edge
  var TAUNT_LOW = 0.3;         // taunt 3, "nearly down" (GDD §6.3): at or under 30 % of the fighter's HP (flavour, not balance)
  var BTN_Y = 478, BTN_H = 90;
  var AREA_H = 576;            // the play area's height (CONTRACT §13.1: 1280 × 576)
  var FROZE_GAP = 18;          // u between the move bar and the "(it froze)" link above it
  var CLIPS = { punch: 'punch', kick: 'kick', fireball: 'fireball', inkBeam: 'inkbeam', guard: 'guard' };
  var IMPACT = { punch: 0.55, kick: 0.55, fireball: 0.68, inkBeam: 0.78, guard: 0.5 };
  var DUR = { punch: 0.35, kick: 0.5, fireball: 0.7, inkBeam: 0.9, guard: 0.45 };
  var SFX = { punch: 'punch', kick: 'kick', fireball: 'fireball', inkBeam: 'ink_beam', guard: 'guard' };

  function F() { return SR.rules.fight; }
  /** A disabled control in the design system's way (UI §2.3): ink-500 on paper-2, no shadow, never faded by opacity. */
  function dim(b) {
    b.style.background = 'var(--paper-2)';
    b.style.color = 'var(--ink-500)';
    b.style.boxShadow = 'none';
    b.setAttribute('data-shadow', 'none');
  }
  function fast() { try { return !!(SR.debug && typeof SR.debug.fast === 'function' && SR.debug.fast() === true); } catch (e) { return false; } }
  function pal(k) { return SR.art && SR.art.draw ? SR.art.draw.color(k) : ''; }
  function clone(v) { return SR.util.clone(v); }
  /** @returns {string} a stat change with its sign ("+1", "-3") for a chip-like line. */
  function signed(n) { n = Number(n) || 0; return (n > 0 ? '+' : '') + n; }
  function fighterDef(f) { return f && f.fighter && SR.reg.fighter ? SR.reg.fighter[f.fighter] || null : null; }
  function foeName(f) {
    var key = f && f.name || (fighterDef(f) && fighterDef(f).name);
    return key && SR.text.has(key) ? SR.text(key) : SR.text('fighter.unknown.name');
  }

  /** The Fight to play: the one the rules made at the start, else a fresh one (sheets, tests). */
  function fightOf(state, params, rng) {
    if (params && params.fight && params.fight.me && params.fight.foe) return clone(params.fight);
    return F().create(state || SR.state, params && params.kind || 'bar', params && params.n, rng || SR.rng.rules);
  }

  /** @returns {object} the engine's result (CONTRACT §13) with the fight's identity. */
  function resultOf(f, choice, auto) {
    var r = F().result(f, !!auto);
    if (r.outcome === 'win' && f.kind === 'bar') r.choice = choice === 'drink' && SR.features.nightlife ? 'drink' : 'wallet';
    return r;
  }

  function create(host, params) {
    var T = host.text;
    var f = fightOf(host.state, params, host.rng);
    var fdef = fighterDef(f);
    var name = foeName(f);
    var nightlife = !!SR.features.nightlife;

    var disp = { me: f.me.hp, foe: f.foe.hp };          // HP as drawn (lags the rules during a beat)
    var queue = [];                                       // beats still to animate
    var beat = null;                                      // { who, move, dmg, crit, miss, t, dur, impact, hit, after }
    var phase = 'player';                                 // player | busy | win | over
    var sel = 0, stopT = 0, shake = 0, t = 0;
    var floats = [], sparks = [];
    var taunt = null;                                     // { key, t }
    var tauntedHurt = false, tauntedLow = false;
    var frozen = null;                                    // { t } during the "(it froze)" gag
    var ko = null;                                        // { t } while the KO ink blot grows (you lost)
    var replay = null;                                    // the Quick fight's fast-forward
    var pose = { me: 'guard', foe: 'guard', meT: 0, foeT: 0 };
    var winPick = 0;
    var ended = false;
    // Hardcore (ARCHITECTURE §10, §15): the frame saved { resolve, worst: the loss } in
    // state.pending just before this fight opened (a stake). Once the fight is decided it is no
    // longer a live stake, so decided() puts the decided result in its place.
    var pend0 = SR.state && SR.state.pending && SR.state.pending.resolve ? SR.state.pending : null;

    // ---- DOM: the move bar, the "(it froze)" link and the win panel ----------------------------
    // The bar sits on the bottom edge and grows upward when its buttons need more room than BTN_H
    // (150 % text with the seven P1 moves wraps "Ink Beam" and the damage chips; UI §8 "no
    // clipping at 150 %"); the "(it froze)" link keeps its place just above it (placeFroze).
    var BAR_BOTTOM = AREA_H - BTN_Y - BTN_H;
    var bar = host.el('div', { 'data-id': 'mg-fight-moves', style: {
      position: 'absolute', left: '16px', bottom: BAR_BOTTOM + 'px', width: '1248px', minHeight: BTN_H + 'px', display: 'flex', gap: '8px',
      alignItems: 'stretch', pointerEvents: 'none' } });
    host.ui.appendChild(bar);
    var frozeBtn = host.button({ id: 'mg-fight-froze', label: T('mg.fight.froze'), variant: 'ghost', onPress: function () { froze(); } });
    frozeBtn.style.position = 'absolute';
    frozeBtn.style.right = '12px';
    frozeBtn.style.bottom = (BAR_BOTTOM + BTN_H + FROZE_GAP) + 'px';
    frozeBtn.style.font = '600 calc(14px * var(--ui-scale, 1)) var(--font-ui)';
    frozeBtn.style.color = 'var(--ink-700)';
    frozeBtn.style.background = 'var(--paper-0)';
    frozeBtn.style.border = 'var(--line-thin)';
    frozeBtn.style.borderRadius = 'var(--r-pill)';
    frozeBtn.style.height = '32px';
    frozeBtn.style.padding = '0 12px';
    host.ui.appendChild(frozeBtn);
    var panel = host.el('div', { 'data-id': 'mg-fight-win', role: 'group', 'aria-label': T('mg.fight.winTitle'), style: {
      position: 'absolute', left: '390px', top: '96px', width: '500px', boxSizing: 'border-box', padding: '20px 24px',
      background: 'var(--paper-0)', border: 'var(--line)', borderRadius: 'var(--r-l)', boxShadow: 'var(--e-3)', display: 'none',
      flexDirection: 'column', gap: '10px', pointerEvents: 'auto' } });
    host.ui.appendChild(panel);

    /** The buttons in order: the moves the rules allow here (Guard only with `nightlife`), End turn, Run. */
    function entries() {
      var list = F().moves(f).map(function (m) { return { id: m.id, ap: m.ap, min: m.min, max: m.max, ok: m.ok, icon: m.icon, move: true }; });
      list.push({ id: 'endTurn', ok: f.phase === 'player', icon: 'endturn' });
      list.push({ id: 'run', ok: f.phase === 'player', icon: 'run' });
      return list;
    }
    function label(id) { return T('mg.fight.' + id); }
    /** @returns {string} why a move is out of reach on your turn ("Needs 4 AP. 2 left this turn."), else ''. */
    function shortAp(e) {
      return e && e.move && f.phase === 'player' && f.me.ap < e.ap ? T('mg.fight.needAp', { n: e.ap, ap: f.me.ap }) : '';
    }
    function interactive() { return phase === 'player' && !beat && !queue.length && !frozen && !replay && host.interactive(); }

    function renderButtons() {
      while (bar.firstChild) bar.removeChild(bar.firstChild);
      var list = entries();
      if (sel >= list.length) sel = list.length - 1;
      list.forEach(function (e, i) {
        var chips = [];
        if (e.move) {
          chips.push({ text: T('mg.fight.ap', { n: e.ap }), kind: 'time' });
          if (e.id !== 'guard') chips.push({ text: T('mg.fight.dmg', { min: e.min, max: e.max }), kind: 'hp' });
        }
        var b = host.button({
          id: 'mg-fight-' + e.id, label: label(e.id), badge: String(i + 1), chips: chips, tall: true, width: '100%',
          aria: e.move && e.id !== 'guard' ? T('mg.fight.moveAria', { move: label(e.id), ap: e.ap, min: e.min, max: e.max }) : label(e.id),
          onPress: function () { sel = i; use(e.id); },
        });
        b.style.flex = '1 1 0';
        b.style.minWidth = '0';
        b.style.minHeight = BTN_H + 'px';
        var off = !e.ok || !interactive();
        b.setAttribute('aria-disabled', off ? 'true' : 'false');
        // A move you cannot afford this turn says why (UI §2.3: a disabled control carries its reason).
        var why = shortAp(e);
        if (why) b.setAttribute('aria-description', why);
        if (off) dim(b);
        host.ring(b, i === sel && interactive() && (host.device === 'kb' || host.device === 'pad'));
        bar.appendChild(b);
      });
      placeFroze();
    }

    /** Keeps the "(it froze)" link FROZE_GAP above the move bar, however tall large text made it. */
    function placeFroze() {
      var h = bar.offsetHeight || BTN_H;
      frozeBtn.style.bottom = (BAR_BOTTOM + Math.max(BTN_H, h) + FROZE_GAP) + 'px';
    }

    function mirror() {
      host.label('hp', T('mg.fight.mirror', { hp: f.me.hp, name: name, foe: f.foe.hp, ap: f.me.ap }));
      if (phase === 'player') host.label('status', T('mg.fight.status', { turn: f.turn, ap: f.me.ap }));
      else if (phase === 'busy' && beat && beat.who === 'foe') host.label('status', T('mg.fight.statusEnemy', { turn: f.turn, name: name }));
    }

    function say(which) {
      if (!fdef || !fdef.taunts || !fdef.taunts[which - 1]) return;
      var key = fdef.taunts[which - 1];
      if (!SR.text.has(key)) return;
      taunt = { key: key, t: 0 };
      host.aria(name + ': ' + T(key));
    }

    // ---- turns ---------------------------------------------------------------------------------
    function push(b) {
      b.t = 0;
      b.dur = fast() ? 0.02 : (DUR[b.move] || 0.4) + RECOVER;
      b.impact = fast() ? 0.01 : (DUR[b.move] || 0.4) * (IMPACT[b.move] || 0.5);
      queue.push(b);
      if (phase === 'player') phase = 'busy';
    }

    function enemyTurn() {
      var e = F().endTurn(f, host.rng);
      if (!e.move) return;
      push({ who: 'foe', move: e.move, dmg: e.dmg, miss: e.miss, after: { me: f.me.hp }, lose: e.lose });
    }

    /** A button: a move (its AP), End turn (the enemy strikes) or Run (the fight ends). */
    function use(id) {
      if (!interactive()) return;
      if (id === 'run') {
        if (!F().run(f)) return;
        host.audio.sfx('close');
        end(resultOf(f));
        return;
      }
      if (id === 'endTurn') {
        host.audio.sfx('click');
        enemyTurn();
        renderButtons();
        return;
      }
      var short = shortAp(entries().filter(function (e) { return e.id === id; })[0]);
      if (short) { host.audio.sfx('error'); host.aria(short); return; }
      var r = F().playerMove(f, id, host.rng);
      if (!r.ok) {
        host.audio.sfx('error');
        host.aria(T(r.reason || 'reason.notNow'));
        return;
      }
      push({ who: 'me', move: id, dmg: r.dmg, crit: r.crit, after: { foe: f.foe.hp }, win: r.win });
      if (!r.win && r.turnOver) enemyTurn();
      renderButtons();
    }

    function impact(b) {
      if (b.hit) return;
      b.hit = true;
      if (b.move === 'guard') {
        host.audio.sfx('guard');
        host.aria(T('mg.fight.guardUp'));
        return;
      }
      var target = b.who === 'me' ? 'foe' : 'me';
      var x = target === 'me' ? ME_X : FOE_X;
      if (b.miss) {
        host.audio.sfx('mg_miss');
        floats.push({ text: T('mg.fight.miss'), x: x, y: FEET_Y - RIG_H - 10, t: 0, col: 'ui.ink-700' });
        host.aria(T('mg.fight.missThem', { name: name }));
        return;
      }
      disp[target] = b.after[target];
      stopT = fast() ? 0 : HIT_STOP;
      shake = fast() ? 0 : SHAKE_S;
      host.audio.sfx(SFX[b.move] || 'punch');
      if (host.haptic) host.haptic(30);
      floats.push({ text: '-' + b.dmg, x: x + (b.crit ? -20 : 0), y: FEET_Y - RIG_H + 10, t: 0, col: target === 'me' ? 'ui.hp' : 'ui.str' });
      if (b.crit) floats.push({ text: T('mg.fight.crit'), x: x + 30, y: FEET_Y - RIG_H - 24, t: 0, col: 'ui.gold' });
      for (var i = 0; i < 12; i++) {
        var a = host.fx.float(0, Math.PI * 2), v = host.fx.float(120, 320);
        sparks.push({ x: x + (target === 'me' ? 30 : -30), y: FEET_Y - RIG_H * 0.62, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 });
      }
      if (target === 'me') { pose.me = 'hurt'; pose.meT = 0; } else { pose.foe = 'hurt'; pose.foeT = 0; }
      var line = b.who === 'me' ? T('mg.fight.hitYou', { move: label(b.move).toLowerCase(), dmg: b.dmg })
        : T('mg.fight.hitThem', { name: name, move: label(b.move).toLowerCase(), dmg: b.dmg });
      if (b.crit) line = T('mg.fight.crit') + ' ' + line;
      host.aria(line + ' ' + T('mg.fight.mirror', { hp: disp.me, name: name, foe: disp.foe, ap: f.me.ap }));
      if (b.who === 'foe' && !tauntedHurt && f.me.hp > 0) { tauntedHurt = true; say(2); }
      if (b.who === 'me' && !tauntedLow && f.foe.hp > 0 && f.foe.hp <= f.foe.hpMax * TAUNT_LOW) { tauntedLow = true; say(3); }
    }

    /** After the last queued beat: the next turn, the win panel, or the end. */
    function settle() {
      if (f.outcome === 'win') { showWin(); return; }
      if (f.outcome === 'lose') {
        pose.me = 'lose';
        host.aria(T('mg.fight.ko'));
        if (fast()) { end(resultOf(f)); return; }
        // ART_AUDIO §12 "KO": the ink blot covers the fight first; the result follows (update).
        ko = { t: 0 };
        phase = 'over';
        renderButtons();
        bar.style.visibility = 'hidden';        // the blot covers the whole fight, its buttons too
        frozeBtn.style.visibility = 'hidden';
        return;
      }
      phase = 'player';
      host.aria(T('mg.fight.status', { turn: f.turn, ap: f.me.ap }));
      renderButtons();
      mirror();
    }

    /**
     * Hardcore: the fight is decided (won at the wallet panel, or played out by the Quick fight),
     * so the decided result replaces the pending loss in the ironman slot, as the frame does when a
     * round finishes (js/scenes/minigame.js settlePending). Without it, closing the tab while the
     * wallet panel waits for your pick, or during the Quick fight's replay, reloaded as a KO: HP 0,
     * death unless Second Wind. The wallet is the default pick (B-13).
     */
    function decided(r) {
      var s = SR.state;
      if (!pend0 || !s || s.pending !== pend0 || !s.mode || s.mode.difficulty !== 'hardcore') return;
      pend0.worst = clone(r);
      if (SR.save && typeof SR.save.write === 'function') {
        try { SR.save.write('ironman'); } catch (e) { SR.util.warnOnce('fight-ironman', 'fight: ironman write failed (' + e.message + ')'); }
      }
    }

    function showWin() {
      phase = 'win';
      pose.me = 'win';
      pose.foe = 'lose';
      host.audio.sfx('cheer');
      if (f.kind !== 'bar') { end(resultOf(f)); return; }
      decided(resultOf(f, 'wallet'));
      while (panel.firstChild) panel.removeChild(panel.firstChild);
      panel.appendChild(host.el('h3', { style: { margin: '0', font: '900 calc(28px * var(--ui-scale, 1)) var(--font-display)', textTransform: 'uppercase' } }, [T('mg.fight.winTitle')]));
      var str = SR.tuning.fight.win.str;
      var row = host.el('div', { style: { display: 'flex', gap: '8px' } }, [host.chip(T('mg.fight.winStr', { n: str }), 'str')]);
      panel.appendChild(row);
      // B-13 `wallet` (-3 karma, orig) and `drink` (P1: -$5, +1 CHA, +1 karma): the numbers are tuning's.
      var W = SR.tuning.fight.wallet, Dk = SR.tuning.fight.drink;
      var picks = [{ id: 'wallet', label: T('mg.fight.wallet'), sub: T('mg.fight.walletDesc', { karma: signed(W.karma) }) }];
      if (nightlife) picks.push({ id: 'drink', label: T('mg.fight.drink'), sub: T('mg.fight.drinkDesc', { money: SR.text.money(Dk.cash), cha: signed(Dk.cha), karma: signed(Dk.karma) }) });
      winPick = 0;
      picks.forEach(function (p, i) {
        var b = host.button({ id: 'mg-fight-pick-' + p.id, label: p.label, sub: p.sub, badge: String(i + 1), tall: true, width: '100%',
          onPress: function () { choose(p.id); } });
        if (p.id === 'drink' && !canTreat()) {
          // Without the price of a drink the rules would pay the wallet instead (B-13 `drink`), so
          // the kind option is shown refused rather than quietly turned into the unkind one.
          b.setAttribute('aria-disabled', 'true');
          b.setAttribute('aria-description', T('reason.needCash', { n: Dk.cash, money: SR.text.money(Dk.cash) }));
          dim(b);
        }
        panel.appendChild(b);
      });
      panel.style.display = 'flex';
      renderPicks();
      host.aria(T(nightlife ? 'mg.fight.pickAria' : 'mg.fight.pickAriaWallet'));
      renderButtons();
    }
    function renderPicks() {
      var nodes = panel.querySelectorAll('button');
      Array.prototype.forEach.call(nodes, function (b, i) { host.ring(b, i === winPick && host.device !== 'touch'); });
    }
    function picksCount() { return nightlife ? 2 : 1; }
    /** @returns {boolean} the drink is affordable (B-13 `drink`: -$5); SR.state is the live cash. */
    function canTreat() { var s = SR.state; return !!(s && s.money && s.money.cash >= SR.tuning.fight.drink.cash); }

    function choose(choice) {
      if (phase !== 'win' || ended) return;
      if (choice === 'drink' && !canTreat()) {
        host.audio.sfx('error');
        host.aria(T('reason.needCash', { n: SR.tuning.fight.drink.cash, money: SR.text.money(SR.tuning.fight.drink.cash) }));
        return;
      }
      host.audio.sfx(choice === 'drink' ? 'glass_clink' : 'coin');
      end(resultOf(f, choice));
    }

    function end(r) {
      if (ended) return;
      ended = true;
      phase = 'over';
      panel.style.display = 'none';
      renderButtons();
      host.finish(r);
    }

    // ---- the "(it froze)" joke (GDD §4.12) -------------------------------------------------------
    function froze() {
      if (frozen || ended || replay || ko) return;
      frozen = { t: 0 };
      host.aria(T('mg.fight.frozeAria'));
      renderButtons();
    }

    // ---- per frame ---------------------------------------------------------------------------------
    function update(dt) {
      t += dt;
      if (ko && !ended) {
        ko.t += dt;
        if (ko.t >= KO_S + KO_HOLD_S) end(resultOf(f));
      }
      if (frozen) {
        frozen.t += dt;
        if (frozen.t >= FREEZE_S && !frozen.winked) { frozen.winked = true; host.aria(T('mg.fight.wink')); }
        if (frozen.t >= FREEZE_S + WINK_S) { frozen = null; renderButtons(); }
        return;   // the whole scene holds still while "frozen"
      }
      if (replay) {
        replay.t += dt;
        var k = Math.min(1, replay.t / replay.dur);
        disp.me = Math.round(replay.from.me + (replay.to.me - replay.from.me) * k);
        disp.foe = Math.round(replay.from.foe + (replay.to.foe - replay.from.foe) * k);
        var idx = Math.min(replay.log.length - 1, Math.floor(k * replay.log.length));
        if (idx >= 0 && idx !== replay.shown) {
          replay.shown = idx;
          var e = replay.log[idx];
          pose[e.who === 'me' ? 'me' : 'foe'] = e.move ? CLIPS[e.move] || 'punch' : 'guard';
          pose.meT = 0; pose.foeT = 0;
        }
      }
      if (stopT > 0) { stopT -= dt; return; }
      if (shake > 0) shake = Math.max(0, shake - dt);
      pose.meT += dt; pose.foeT += dt;
      if (taunt) { taunt.t += dt; if (taunt.t > TAUNT_S) taunt = null; }
      for (var i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; if (floats[i].t > 0.9) floats.splice(i, 1); }
      for (var j = sparks.length - 1; j >= 0; j--) {
        var s = sparks[j];
        s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 700 * dt;
        if (s.life <= 0) sparks.splice(j, 1);
      }
      if (!beat && queue.length) {
        beat = queue.shift();
        if (beat.who === 'me') { pose.me = CLIPS[beat.move]; pose.meT = 0; } else { pose.foe = CLIPS[beat.move]; pose.foeT = 0; }
        mirror();
      }
      if (beat) {
        beat.t += dt;
        if (beat.t >= beat.impact) impact(beat);
        if (beat.t >= beat.dur) {
          if (!beat.hit) impact(beat);
          if (beat.who === 'me' && pose.me !== 'lose') pose.me = 'guard';
          if (beat.who === 'foe' && pose.foe !== 'lose') pose.foe = 'guard';
          beat = null;
          if (!queue.length) settle();
        }
      }
      if (pose.me === 'hurt' && pose.meT > 0.4) pose.me = 'guard';
      if (pose.foe === 'hurt' && pose.foeT > 0.4) pose.foe = 'guard';
    }

    // ---- drawing -----------------------------------------------------------------------------------
    var stickOpts = {};
    function drawRig(ctx, who, x) {
      var me = who === 'me';
      var clip = pose[who], tt = me ? pose.meT : pose.foeT;
      var lunge = 0;
      if (beat && beat.who === who && (beat.move === 'punch' || beat.move === 'kick')) {
        var k = Math.min(1, beat.t / Math.max(0.01, beat.dur - RECOVER));
        lunge = Math.sin(k * Math.PI) * LUNGE;
      }
      for (var key in stickOpts) delete stickOpts[key];
      stickOpts.view = 'side';
      stickOpts.x = x + (me ? lunge : -lunge);
      stickOpts.y = FEET_Y;
      stickOpts.scale = RIG_H / SIDE_H;
      stickOpts.facing = me ? 'right' : 'left';
      stickOpts.t = tt;
      if (me) stickOpts.player = true; else stickOpts.look = f.fighter || 'stranger';
      if (!me && frozen && frozen.t >= FREEZE_S) stickOpts.mood = 'blink';
      else if (clip === 'hurt') stickOpts.mood = 'hurt';
      else if (clip === 'win') stickOpts.mood = 'happy';
      else if (clip === 'lose') stickOpts.mood = 'sad';
      else stickOpts.mood = 'angry';
      if (SR.art && SR.art.stick) SR.art.stick.draw(ctx, clip, stickOpts);
    }

    function drawBackdrop(ctx) {
      var ring = f.kind === 'ring';
      ctx.fillStyle = pal(ring ? 'int.bar.wallShade' : f.kind === 'goons' ? 'int.default.wall' : 'int.bar.wall');
      ctx.fillRect(-20, -20, 1320, FEET_Y + 20);
      ctx.fillStyle = pal(ring ? 'kit.linen' : f.kind === 'goons' ? 'int.default.floorB' : 'int.bar.floorA');
      ctx.fillRect(-20, FEET_Y, 1320, 140);
      ctx.strokeStyle = pal('inkLine');
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-20, FEET_Y); ctx.lineTo(1300, FEET_Y); ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = pal(ring ? 'kit.metal' : 'int.bar.floorB');
      ctx.beginPath();
      for (var x = -40; x < 1320; x += 80) { ctx.moveTo(x, FEET_Y); ctx.lineTo(640 + (x - 640) * 1.6, FEET_Y + 140); }
      ctx.stroke();
      if (ring) {
        ctx.strokeStyle = pal('kit.rope');
        ctx.lineWidth = 5;
        for (var r = 1; r <= 3; r++) { ctx.beginPath(); ctx.moveTo(-20, FEET_Y - r * 52); ctx.lineTo(1300, FEET_Y - r * 52); ctx.stroke(); }
      } else {
        // the crowd: a row of ink-silhouette heads along the back wall
        ctx.fillStyle = pal('int.bar.wallShade');
        for (var c = 0; c < 18; c++) {
          var cx = 20 + c * 72 + (c % 2) * 18, bob = Math.sin(t * 2 + c) * 3;
          ctx.beginPath(); ctx.arc(cx, 318 + bob, 20, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(cx - 24, 336 + bob, 48, 80);
        }
      }
    }

    function drawBar(ctx, x, y, w, hp, max, color, title, alignRight) {
      var k = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
      SR.art.draw.roundRect(ctx, x, y, w, 24, 8);
      ctx.fillStyle = host.color('paper-0'); ctx.fill();
      ctx.save();
      SR.art.draw.roundRect(ctx, x, y, w, 24, 8); ctx.clip();
      ctx.fillStyle = color;
      if (alignRight) ctx.fillRect(x + w * (1 - k), y, w * k, 24); else ctx.fillRect(x, y, w * k, 24);
      ctx.restore();
      SR.art.draw.roundRect(ctx, x, y, w, 24, 8);
      ctx.lineWidth = 2; ctx.strokeStyle = host.color('ink-900'); ctx.stroke();
      ctx.font = host.font(18, 900, true);
      ctx.fillStyle = host.color('ink-900');
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = alignRight ? 'right' : 'left';
      ctx.fillText(title, alignRight ? x + w : x, y - 8);
      ctx.textAlign = alignRight ? 'left' : 'right';
      ctx.font = host.font(16, 700);
      ctx.fillText(T('mg.fight.hp', { hp: hp, max: max }), alignRight ? x : x + w, y - 8);
    }

    function drawAP(ctx) {
      var n = f.me.apMax, x0 = 60, y = 78, gap = Math.min(28, 440 / Math.max(1, n));
      for (var i = 0; i < n; i++) {
        ctx.beginPath(); ctx.arc(x0 + i * gap + 10, y, 9, 0, Math.PI * 2);
        ctx.fillStyle = i < f.me.ap && phase === 'player' ? host.color('time') : host.color('paper-2');
        ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = host.color('ink-900'); ctx.stroke();
      }
      ctx.font = host.font(14, 700);
      ctx.fillStyle = host.color('ink-700');
      ctx.textAlign = 'left';
      ctx.fillText(T('mg.fight.apLeft', { ap: f.me.ap, max: n }), x0 + n * gap + 18, y + 5);
    }

    function drawProjectile(ctx) {
      if (!beat || (beat.move !== 'fireball' && beat.move !== 'inkBeam')) return;
      var from = beat.who === 'me' ? ME_X + 70 : FOE_X - 70, to = beat.who === 'me' ? FOE_X - 30 : ME_X + 30;
      var y = FEET_Y - RIG_H * 0.62;
      var d = DUR[beat.move], a = beat.t / d;
      if (beat.move === 'fireball') {
        var k = (a - 0.4) / 0.3;
        if (k < 0 || k > 1) return;
        var x = from + (to - from) * k;
        ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fillStyle = pal('light.neonRed'); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fillStyle = pal('light.neonYellow'); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = pal('inkLine'); ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.stroke();
      } else {
        if (a < 0.62 || a > 0.9) return;
        ctx.lineCap = 'round';
        ctx.lineWidth = 18; ctx.strokeStyle = pal('inkLine');
        ctx.beginPath(); ctx.moveTo(from, y); ctx.lineTo(to, y); ctx.stroke();
        ctx.lineWidth = 6; ctx.strokeStyle = pal('light.neonBlue');
        ctx.beginPath(); ctx.moveTo(from, y); ctx.lineTo(to, y); ctx.stroke();
      }
    }

    function drawTaunt(ctx) {
      if (!taunt) return;
      var s = T(taunt.key), x = 700, y = 104, w = 470;
      ctx.font = host.font(17, 600);
      var lines = wrap(ctx, s, w - 32), h = 24 + lines.length * 22;
      SR.art.draw.roundRect(ctx, x, y, w, h, 16);
      ctx.fillStyle = host.color('paper-0'); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = host.color('ink-900'); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(FOE_X - 10, y + h); ctx.lineTo(FOE_X + 14, y + h + 22); ctx.lineTo(FOE_X + 26, y + h); ctx.closePath();
      ctx.fillStyle = host.color('paper-0'); ctx.fill(); ctx.stroke();
      ctx.fillStyle = host.color('ink-900'); ctx.textAlign = 'left';
      lines.forEach(function (l, i) { ctx.fillText(l, x + 16, y + 30 + i * 22); });
    }

    function wrap(ctx, s, w) {
      var words = String(s).split(' '), lines = [], cur = '';
      words.forEach(function (wd) {
        var next = cur ? cur + ' ' + wd : wd;
        if (ctx.measureText(next).width > w && cur) { lines.push(cur); cur = wd; } else cur = next;
      });
      if (cur) lines.push(cur);
      return lines;
    }

    function render(ctx) {
      ctx.save();
      if (shake > 0 && shakeOk()) {
        var a = SHAKE_U * (shake / SHAKE_S);
        ctx.translate(host.fx.float(-a, a), host.fx.float(-a, a));
      }
      drawBackdrop(ctx);
      drawRig(ctx, 'foe', FOE_X);
      drawRig(ctx, 'me', ME_X);
      drawProjectile(ctx);
      ctx.restore();
      sparks.forEach(function (s) {
        ctx.globalAlpha = Math.max(0, s.life / 0.35);
        ctx.strokeStyle = pal('ui.gold'); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03); ctx.stroke();
      });
      ctx.globalAlpha = 1;
      floats.forEach(function (fl) { SR.art.draw.floatText(ctx, fl.text, fl.x, fl.y, fl.col, fl.t); });
      drawBar(ctx, 60, 40, 460, disp.me, f.me.hpMax, host.color('hp'), T('mg.fight.you'), false);
      drawBar(ctx, 760, 40, 460, disp.foe, f.foe.hpMax, host.color('str'), name, true);
      drawAP(ctx);
      var q = fdef && fdef.quirkText && SR.text.has(fdef.quirkText) ? T(fdef.quirkText) : '';
      if (q) {
        ctx.font = host.font(14, 600); ctx.fillStyle = host.color('ink-700'); ctx.textAlign = 'right';
        ctx.fillText(q, 1220, 84);
      }
      drawTaunt(ctx);
      if (frozen && frozen.t < FREEZE_S) {
        // A frozen frame: the picture holds and greys over, like a program that stopped answering.
        ctx.fillStyle = host.color('scrim');
        ctx.globalAlpha = Math.min(0.35, frozen.t * 0.6);
        ctx.fillRect(0, 0, 1280, 576);
        ctx.globalAlpha = 1;
      } else if (frozen) {
        ctx.font = host.font(28, 900, true); ctx.fillStyle = host.color('ink-900'); ctx.textAlign = 'center';
        ctx.fillText(T('mg.fight.wink'), FOE_X, 200);
      }
      if (ko) drawBlot(ctx, Math.min(1, ko.t / KO_S));
    }

    /**
     * The KO ink blot (ART_AUDIO §12): grows from the centre of the play area until it covers it,
     * with a ragged rim of drops; with Reduced Motion it fades in instead of growing.
     */
    function drawBlot(ctx, k) {
      var cx = 640, cy = 288, full = Math.sqrt(cx * cx + cy * cy) * 1.08;
      var still = !motionOk();
      ctx.save();
      ctx.fillStyle = pal('fx.blot');
      if (still) {
        ctx.globalAlpha = k;
        ctx.fillRect(0, 0, 1280, 576);
      } else {
        var e = SR.util.easeOut ? SR.util.easeOut(k) : k, R = full * e;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
        for (var i = 0; i < KO_SPLATS; i++) {
          var a = i * Math.PI * 2 / KO_SPLATS + 0.35 * (i % 3);
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 1.02, cy + Math.sin(a) * R * 1.02, R * (0.12 + 0.05 * (i % 4)), 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }

    function safeGet(k) { try { return SR.settings.get(k); } catch (e) { return null; } }
    /**
     * The hit shake plays unless Reduced Motion is on (the setting, or the system preference while
     * it says 'system': SR.render.lib.reducedMotion) or Settings › Display turns screen shake off.
     */
    function shakeOk() {
      return motionOk() && !(SR.settings && safeGet('display.screenShake') === false);
    }
    /** @returns {boolean} motion is allowed: Reduced Motion is off (the setting, or 'system' and the OS). */
    function motionOk() {
      var L = SR.render && SR.render.lib;
      try { if (L && typeof L.reducedMotion === 'function' && L.reducedMotion()) return false; } catch (e) { /* no render core: motion */ }
      return true;
    }

    host.label('info', f.kind === 'ring' ? T('mg.fight.titleRing') + ' · ' + T('mg.fight.bout', { k: f.k })
      : f.kind === 'bar' ? T('mg.fight.rung', { n: f.n, max: SR.tuning.fight.ladder.n }) : T('mg.fight.titleGoons'));
    host.hints([
      { range: ['move1', 'move' + entries().length], label: 'mg.fight.hintMoves', only: 'kb' },   // 1-6, or 1-7 with Guard (P1)
      { actions: ['left', 'right'], label: 'mg.fight.hintPick', only: 'pad' },
      { action: 'confirm', label: 'mg.fight.hintUse', only: 'pad' },
      { label: 'mg.fight.hintTap', only: 'touch' },
    ]);
    renderButtons();
    mirror();
    host.aria(T('mg.fight.vs', { you: T('mg.fight.you'), name: name }));
    if (f.kind === 'bar') host.aria(T('bark.sticky.fight'));
    say(1);

    return {
      update: update,
      render: render,
      onAction: function (a, ev) {
        if (ev && ev.repeat && a !== 'left' && a !== 'right') return;
        if (phase === 'win') {
          var n = picksCount();
          if (a === 'left' || a === 'up') { winPick = (winPick + n - 1) % n; renderPicks(); return; }
          if (a === 'right' || a === 'down') { winPick = (winPick + 1) % n; renderPicks(); return; }
          if (a === 'move1' || a === 'row1') { choose('wallet'); return; }
          if ((a === 'move2' || a === 'row2') && nightlife) { choose('drink'); return; }
          if (a === 'confirm') choose(winPick === 1 ? 'drink' : 'wallet');
          return;
        }
        var m = /^move(\d)$/.exec(a);
        var list = entries();
        if (m) {
          var k = +m[1] - 1;
          if (k < list.length) { sel = k; use(list[k].id); }
          return;
        }
        if (a === 'left' || a === 'up') { sel = (sel + list.length - 1) % list.length; renderButtons(); return; }
        if (a === 'right' || a === 'down') { sel = (sel + 1) % list.length; renderButtons(); return; }
        if (a === 'confirm' && list[sel]) use(list[sel].id);
      },
      pointer: function () {},
      /** The Quick fight from here: SR.rules.fight.autoPlay with real rolls (ARCHITECTURE §10). */
      auto: function (rng) {
        if (phase === 'win') { panel.style.display = 'none'; return resultOf(f, 'wallet', true); }
        queue.length = 0;
        beat = null;
        var from = { me: disp.me, foe: disp.foe }, before = f.log.length;
        var r = F().autoPlay(host.state, f, rng);
        if (r.outcome === 'win' && f.kind === 'bar') r.choice = 'wallet';
        decided(r);   // Hardcore: the 2 s replay shows a fight already decided
        replay = { from: from, to: { me: f.me.hp, foe: f.foe.hp }, t: 0, dur: fast() ? 0.01 : REPLAY_S, log: f.log.slice(before), shown: -1 };
        phase = 'over';
        ended = true;
        renderButtons();
        // The bottom bar and the mirror follow the Quick fight (the turn's "n AP left" no longer holds).
        host.label('status', T('mg.fight.quick'));
        host.label('hp', T('mg.fight.mirror', { hp: f.me.hp, name: name, foe: f.foe.hp, ap: 0 }));
        host.aria(T('mg.fight.quick') + '. ' + T('mg.fight.mirror', { hp: f.me.hp, name: name, foe: f.foe.hp, ap: 0 }));
        return r;
      },
      replay: function () { if (replay) replay.t = 0; },
      progress: function () { return { hp: f.me.hp, outcome: f.outcome, phase: phase }; },
      peek: function () {
        return { phase: phase, fight: clone(f), disp: { me: disp.me, foe: disp.foe }, queue: queue.length, beat: beat ? beat.move : null,
          sel: sel, entries: entries().map(function (e) { return { id: e.id, ok: e.ok, ap: e.ap, min: e.min, max: e.max }; }),
          frozen: !!frozen, taunt: taunt ? taunt.key : null, winOpen: panel.style.display !== 'none', picks: picksCount(), shakeOk: shakeOk(), ko: ko ? ko.t : null };
      },
      destroy: function () {},
    };
  }

  SR.minigame.register('fight', {
    title: 'mg.fight.title',
    music: 'brawl_hall',
    keys: { move1: ['Digit1'], move2: ['Digit2'], move3: ['Digit3'], move4: ['Digit4'], move5: ['Digit5'], move6: ['Digit6'], move7: ['Digit7'] },
    stake: true,
    assist: false,
    replay: REPLAY_S,
    create: create,
    /** @returns {object} the Quick fight: SR.rules.fight.autoPlay on the fight (a real sample). */
    auto: function (state, params, rng) {
      var f = fightOf(state, params, rng);
      var r = F().autoPlay(state, f, rng);
      if (r.outcome === 'win' && f.kind === 'bar') r.choice = 'wallet';
      return r;
    },
    /** @returns {object} the loss (Hardcore's pending worst: closing the tab mid-fight). */
    worst: function (params) {
      var f = params && params.fight || {};
      return { outcome: 'lose', hpLeft: 0, kind: f.kind || params.kind || 'bar', n: f.n, k: f.k, fighter: f.fighter };
    },
    /** @returns {object} walking away mid-fight is running away (orig: no further cost). */
    forfeit: function (params, progress) {
      var f = params && params.fight || {};
      var p = progress || {};
      if (p.outcome === 'win') return { outcome: 'win', hpLeft: p.hp, choice: 'wallet', kind: f.kind, n: f.n, k: f.k, fighter: f.fighter, exited: true };
      if (p.outcome === 'lose') return { outcome: 'lose', hpLeft: 0, kind: f.kind, n: f.n, k: f.k, fighter: f.fighter, exited: true };
      var hp = typeof p.hp === 'number' ? p.hp : f.me ? f.me.hp : 1;
      return { outcome: 'run', hpLeft: hp, kind: f.kind, n: f.n, k: f.k, fighter: f.fighter, exited: true };
    },
    /** @returns {string} the banner line. */
    summary: function (r, text, skin, params) {
      var f = params && params.fight;
      var nm = foeName(f || { fighter: r.fighter });
      return text(r.outcome === 'win' ? 'mg.fight.sumWin' : r.outcome === 'lose' ? 'mg.fight.sumLose' : 'mg.fight.sumRun', { name: nm });
    },
  });
})();
