// js/minigames/skins/pitch.js — owner: W2-Money. The `pitch` skin of the Timing Ring engine (GDD
// §4.6, §6.5; B-05 hustle.pitch): the Salesperson's (difficulty step 0) and the Executive's (step 1)
// hustle at New Lines Inc. (P1 `hustles`; the Hustle button of nli.work, which passes the step from
// SR.rules.jobs.hustleSkin). Five presses; each lands when the needle is inside the sweet arc
// (min(40 %, 8 % + CHA/40 %) of the ring); m = 0.7 + 0.12 per hit (clamped 0.7-1.3). The engine
// reads every number from SR.tuning; Auto is m = 1.0 exactly (the Auto shift, not a sample).
// This skin names the round (the client for a Salesperson, the quarterly vision for an Executive)
// and draws the client in the ring's centre, warming up with each hit: a portrait whose mood
// follows the round, the hook's stage and the running multiplier.
// Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var CLIENT = 7;              // the client's portrait: pedestrian look 7, the one in a tie (SR.art.portraits)
  var HOOKS = 5;               // mg.pitch.hook.0 … hook.5 (the presses of B-05 hustle.pitch)

  /** The round in progress (the frame's instance; its peek() is the engine's introspection). */
  function peek() {
    var cur = SR.minigame && typeof SR.minigame.current === 'function' ? SR.minigame.current() : null;
    if (!cur || !cur.inst || typeof cur.inst.peek !== 'function') return null;
    try { return cur.inst.peek(); } catch (e) { return null; }
  }

  /** @returns {string} the client's mood: neutral before the first press, then by the last press and the hits. */
  function mood(p) {
    if (!p || !p.presses) return 'neutral';
    if (p.done) return p.hits >= 3 ? 'happy' : 'sad';
    return p.hits >= p.misses ? (p.hits >= 3 ? 'happy' : 'surprised') : 'worried';
  }

  SR.def.skin('pitch', {
    engine: 'timingring',
    music: 'tick_tock_trouble',
    /** Run params: the grade mode and the round's subtitle by rank (the step comes with the run). */
    params: function (state) {
      var rank = state && state.job && state.job.ranks ? state.job.ranks.nli : null;
      return { mode: 'grade', subtitle: 'mg.pitch.subtitle.' + (rank === 'exec' ? 'exec' : 'sales') };
    },
    text: { title: 'mg.pitch.title' },
    art: {
      /**
       * The client in the ring's centre (x, y, the inner radius r): the portrait, the hook's stage
       * and the multiplier. @returns {boolean} true (drawn)
       */
      center: function (ctx, x, y, r, host) {
        var p = peek(), hits = p ? p.hits : 0;
        var size = Math.round(r * 0.95);
        ctx.save();
        ctx.fillStyle = host.color('paper-0');
        ctx.beginPath(); ctx.arc(x, y - r * 0.18, size * 0.56, 0, Math.PI * 2); ctx.fill();
        if (SR.art && SR.art.portraits && typeof SR.art.portraits.draw === 'function') {
          try {
            ctx.save();
            ctx.translate(x - size / 2, y - r * 0.18 - size / 2);
            SR.art.portraits.draw(ctx, CLIENT, size, mood(p));
            ctx.restore();
          } catch (e) { ctx.restore(); }
        }
        ctx.lineWidth = 3;
        ctx.strokeStyle = host.color('ink-900');
        ctx.beginPath(); ctx.arc(x, y - r * 0.18, size * 0.56, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = host.color('ink-900');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = host.font(18, 700);
        ctx.fillText(host.text('mg.pitch.hook.' + Math.min(HOOKS, hits)), x, y + r * 0.5);
        var E = SR.reg.minigame && SR.reg.minigame.timingring;
        var m = E && typeof E.grade === 'function' ? E.grade(host.params || {}, hits) : 1;
        ctx.font = host.font(26, 900, true);
        ctx.fillText('×' + m.toFixed(2), x, y + r * 0.78);
        ctx.restore();
        return true;
      },
    },
  });
})();
