// js/scenes/results.js — owner: W2-Front. The `results` scene (UI §5.14; GDD §4.19; ARCHITECTURE §5)
// and the game:over listener that brings it.
// The scene (params { reason, result }; result defaults to state.result, else the rules' results for
// the reason): the Final Edition (js/ui/screens/results.js). The net worth counts up over 2.5 s with
// ticks (orig), then the rank stamp thumps on (orig motif) and the song lifts (final_edition's
// `stamp` variant; its `minor` variant below $1,500); a press skips to the end. The run is filed in
// the profile once (the Hall of Fame by length, lifetime totals). Keep playing (a timed game's
// results) continues it unranked in the city; Title leaves the game; Copy summary copies the text.
// The listener (ARCHITECTURE §5 deferred changes; docs/requests/W2-Transit.md 1): on game:over it
// queues the results unless another scene presents the end first: the report scene (a night's paper
// comes first and queues the results itself), the death, hospital and jail scenes (FLATLINED, the
// Stick General edition, the Jail Day card go to the results themselves), or a player:down or an
// arrest in the same action (their scenes are queued already). A Retire is never one of those (it
// comes from the pause menu, also over the cell or the ward), so its results always come. It decides
// once the action is done.
// Load-time rule: registers the scene and a boot hook only.
(function () {
  'use strict';
  var SR = window.SR;

  var COUNT_SEC = 2.5;                    // UI §5.14: the net worth counts up over 2.5 s (orig)
  var TICK_SEC = 0.09;                    // a tick every so often while it counts
  var STAMP_SEC = 0.35;                   // after the count, the stamp lands
  var MINOR_BELOW = 1500;                 // ART_AUDIO §13.4: the minor variant below $1,500
  var SONG = 'final_edition';
  var PRESENTERS = { report: 1, death: 1, hospital: 1, jail: 1, results: 1 };

  var R = null;                           // the scene's state

  function D() { return SR.ui.dom; }
  function text(k, v) { return SR.text(k, v); }

  function song(variant) {
    if (!SR.audio || typeof SR.audio.music !== 'function' || !SR.reg.song || !SR.reg.song[SONG]) return;
    var def = SR.reg.song[SONG];
    var v = variant && def.variants && def.variants[variant] ? variant : undefined;
    SR.audio.music(SONG, v ? { variant: v } : {});
  }

  function resultFor(params) {
    var s = SR.state;
    if (params.result) return params.result;
    if (s && s.result) return s.result;
    if (s && SR.rules.endgame) return SR.rules.endgame.results(s, params.reason || 'time');
    return null;
  }

  function finishCount() {
    if (!R || !R.result || R.phase === 'done') return;
    R.phase = 'done';
    R.shown = R.result.netWorth;
    if (R.page) {
      R.page.setNetWorth(R.shown);
      R.page.showStamp(true);
    }
    // The Stamp's thud, the stinger and the 4 px paper jolt (UI §2.3), and the key change.
    if (!D().sfx('stamp')) D().sfx('confirm');
    if (SR.audio && typeof SR.audio.stinger === 'function' && SR.reg.song && SR.reg.song['stingers.stamp']) { try { SR.audio.stinger('stamp'); } catch (e) { /* locked */ } }
    if (SR.render && SR.render.fx && typeof SR.render.fx.jolt === 'function' && !D().reduced()) { try { SR.render.fx.jolt(); } catch (e) { /* no render core */ } }
    if (R.result.netWorth >= MINOR_BELOW) song('stamp');
    D().announce(text('front.res.announce', { money: SR.text.money(R.result.netWorth), rank: SR.ui.results.rankText(R.result) }));
    var first = R.page && R.page.buttons.querySelector('[data-nav]');
    if (first) SR.ui.focus.focus(first);
  }

  function keepPlaying() {
    var s = SR.state;
    if (!s) return;
    var r = SR.rules.endgame.keepPlaying(s);
    if (!r.ok) { SR.ui.toast({ key: r.reason || 'ui.refused', kind: 'warning' }); return; }
    // A game that ended during a jail night goes back to the cell (docs/requests/W2-Transit.md 5).
    if (s.jail && SR.reg.scene.jail) { SR.scenes.go('jail', { resume: true }); return; }
    if (SR.world && SR.world.ready && typeof SR.world.place === 'function') { try { SR.world.place('homeDoor', s); } catch (e) { /* no map */ } }
    SR.scenes.go(SR.reg.scene.city ? 'city' : 'title');
  }

  function toTitle() { SR.ui.saveload.quit(); }

  function copy() {
    var str = SR.ui.results.summary(R.result);
    R.copied = str;
    SR.ui.saveload.copyText(str, 'front.res.copyTitle', 'results-summary').then(function (r) {
      if (r && r.copied) SR.ui.toast({ key: 'front.res.copied', kind: 'info' });
    });
  }

  SR.scenes.register('results', {
    kind: 'base',
    enter: function (params) {
      params = params || {};
      var r = resultFor(params);
      if (r && !r.reason) r.reason = params.reason || 'time';
      R = { params: params, result: r, t: 0, phase: 'count', shown: 0, tick: 0, page: null, place: null, copied: null, scope: null };
      if (r) R.place = SR.ui.results.file(r, SR.state);
      song(r && r.netWorth < MINOR_BELOW ? 'minor' : null);
    },
    exit: function () { R = null; },
    update: function (dt) {
      if (!R || !R.result || R.phase === 'done') return;
      if (D().fast() || D().reduced()) { finishCount(); return; }
      R.t += dt;
      var k = Math.min(1, R.t / COUNT_SEC);
      R.shown = R.result.netWorth * SR.util.easeOut(k);
      if (R.page) R.page.setNetWorth(R.shown);
      R.tick += dt;
      if (k < 1 && R.tick >= TICK_SEC) { R.tick = 0; D().sfx('click', { gain: 0.5, pitch: 1 + k * 0.5 }); }
      if (R.t >= COUNT_SEC + STAMP_SEC) finishCount();
    },
    render: function (ctx) {
      if (!ctx) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = SR.art.draw.color('ui.paper-2');
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    },
    ui: {
      mount: function (root) {
        if (!R) return;
        if (!R.result) {
          // Nothing to print (no game and no result): say so, with the way back to the title.
          var none = D().h('div', { class: 'res-none', 'data-id': 'results-none' }, D().h('p', null, text('front.res.none')),
            SR.ui.button({ id: 'results-title', label: 'front.res.title', variant: 'primary', onClick: toTitle }));
          root.appendChild(none);
          R.scope = SR.ui.focus.push(none, { id: 'results' });
          return;
        }
        var s = SR.state;
        var r = R.result;
        var canKeep = !!(s && s.over && r.reason === 'time' && r.length > 0 && !s.mode.keepPlaying && s.result === r);
        R.page = SR.ui.results.build(r, { state: s, place: R.place, canKeep: canKeep, onKeep: keepPlaying, onTitle: toTitle, onCopy: copy });
        root.classList.add('res-root');
        root.appendChild(R.page);
        R.scope = SR.ui.focus.push(R.page, { id: 'results', autofocus: false });
        D().announce(SR.ui.results.headline(r));
        if (D().fast()) finishCount();            // tests and goldens: the finished page at once
      },
      unmount: function () { if (R && R.scope) SR.ui.focus.pop(R.scope); },
    },
    onAction: function (action, ev) {
      if (!R || (ev && (ev.consumed || ev.down === false))) return false;
      if (action === 'pocket' && ev && ev.code === 'Tab') return false;
      if (!R.result) {                                  // nothing to print: Back also leaves for the title
        if (SR.ui.focus.handle(action, ev)) return true;
        if (action === 'back' && !(ev && ev.repeat)) toTitle();
        return true;
      }
      if (R.phase !== 'done') {                         // a press skips the count-up and lands the stamp
        // UI scenes ignore `interact` (CONTRACT §15.5): Enter, Space, E and A fire it and then
        // `confirm`, so skipping on it would let that `confirm` press the button just focused.
        if (action === 'confirm' || action === 'back' || action === 'pause') { finishCount(); if (ev) ev.consumed = true; }
        return true;
      }
      return SR.ui.focus.handle(action, ev);
    },
    /** @returns {object|null} the page's state (tests). */
    info: function () {
      return R ? { phase: R.phase, shown: Math.round(R.shown), result: R.result, place: R.place, copied: R.copied } : null;
    },
  });

  // ------------------------------------------------------------------------------------------------
  // game:over → the results, unless another scene presents the end
  // ------------------------------------------------------------------------------------------------
  var presented = false;     // a player:down or an arrest in this turn queued its own scene

  function decide(p) {
    if (!SR.reg.scene.results) return;
    // Retire (the pause menu, GDD §5) is never presented by another scene: it is no night, no arrest
    // and no fall, so over the cell, the ward or a trip the results still come (else the run would
    // sit in the cell with the game over and no way out).
    if (p.reason === 'retire') { SR.scenes.queue('results', { reason: p.reason, result: p.result || (SR.state && SR.state.result) }, { transition: 'fade' }); return; }
    if (p.took) return;
    if (p.reason === 'death' && SR.reg.scene.death) return;
    var st = SR.scenes.stack();
    for (var i = 0; i < st.length; i++) if (PRESENTERS[st[i]]) return;
    SR.scenes.queue('results', { reason: p.reason, result: p.result || (SR.state && SR.state.result) }, { transition: 'fade' });
  }

  /** Marks this turn as presented by another scene (cleared once the turn's microtasks run). */
  function mark() {
    presented = true;
    Promise.resolve().then(function () { presented = false; });
  }

  SR.onBoot(50, function () {
    if (!SR.events) return;
    SR.events.on('player:down', function (p) { if (p && p.outcome && p.outcome !== 'secondWind') mark(); });
    SR.events.on('jail', mark);
    SR.events.on('game:over', function (p) {
      var ev = { reason: (p && p.reason) || 'time', result: p && p.result, took: presented };
      // SR.act emits game:over before action:done, and the report scene opens on action:done: decide
      // once the action (and whatever it queued) is done.
      Promise.resolve().then(function () { decide(ev); });
    });
  });
})();
