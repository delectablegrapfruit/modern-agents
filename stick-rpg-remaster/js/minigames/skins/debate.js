// js/minigames/skins/debate.js — owner: W2-Civic. The Duel skin `debate` (P0; GDD §4.17, §6.5;
// BALANCE B-17 debate, B-30): City Hall's campaign-day-4 debate against Mayor Doodle (the President
// race) or General Crayon (the Dictator race). Stance mode, 3 questions, D 500; Facts (INT), Charm
// (CHA) and Pressure (STR) against the rival's hinted stance. The engine reads its numbers from
// SR.tuning.duel.debate and the run params SR.rules.election.debateParams gives (D, beats, check,
// mode, path, rival); this skin adds the opponent (name and portrait), the questions (three of the
// mg.debate.q.* pool, chosen by a hash of the seed and the run so a reload asks the same ones), the
// subtitle, and a stage backdrop drawn from palette keys. Auto is the engine's (the best shown odds
// given the hint, rolled). The result { beats, wins, losses } goes to cityhall.debate:resolve.
// No song of its own: the frame ducks the one below (ART_AUDIO §13.4: minigames duck the song; only
// the casino and fights switch), which is the Election Office's campaign march with the Dictator's
// variant; a skin song would drop the variant and hand the building's lobby song back on close.
// Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var POOL = 9;                                          // mg.debate.q.1 … q.9
  var RIVALS = { president: 'doodle', dictator: 'crayon' };

  /** @returns {number} B-30's debate beats (tuning.duel.debate.beats; B-17 debate.questions). */
  function tunedBeats() {
    var d = SR.tuning.duel && SR.tuning.duel.debate;
    if (d && d.beats > 0) return d.beats;
    return SR.tuning.election.debate.questions;
  }

  /** Three different questions for this run: a hash of the seed and the run count, never the rules stream. */
  function questions(state, n) {
    var seed = state && state.seed !== undefined ? state.seed : 0;
    var runs = state && state.election ? state.election.runs || 0 : 0;
    var rng = SR.rng.create(SR.util.hash(seed, 'debate', runs));
    var pool = [];
    for (var i = 1; i <= POOL; i++) pool.push('mg.debate.q.' + i);
    var out = [];
    while (out.length < n && pool.length) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
    return out;
  }

  // ---- the stage (ART_AUDIO §9 City Hall: flags, bunting, the podium) ---------------------------
  function col(key) { return SR.art.draw.color(key); }

  function backdrop(ctx, w, h, host) {
    if (!SR.art || !SR.art.draw) return;
    var ink = host.color('ink-900');
    var floorY = 470;
    // the hall and the stage
    ctx.fillStyle = col('int.cityhall.wall');
    ctx.fillRect(0, 0, w, floorY);
    ctx.fillStyle = col('int.cityhall.floorB');
    ctx.fillRect(0, floorY, w, h - floorY);
    ctx.fillStyle = SR.art.draw.tone(col('int.cityhall.floorB'), 1);
    ctx.fillRect(0, floorY, w, 10);
    ctx.lineWidth = 3;
    ctx.strokeStyle = ink;
    ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(w, floorY); ctx.stroke();
    // the spotlight on the rival
    ctx.fillStyle = SR.art.draw.alpha(col('kit.bulb'), 0.22);
    ctx.beginPath(); ctx.moveTo(170, 0); ctx.lineTo(250, 0); ctx.lineTo(360, floorY); ctx.lineTo(60, floorY); ctx.closePath(); ctx.fill();
    // curtains: a scalloped valance and two side drapes
    var red = col('kit.rug');
    ctx.fillStyle = red;
    ctx.fillRect(0, 0, 34, floorY);
    ctx.fillRect(w - 34, 0, 34, floorY);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, 22);
    for (var x = w; x > 0; x -= 80) ctx.quadraticCurveTo(x - 40, 58, x - 80, 22);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = SR.art.draw.tone(red, -1);
    for (var f = 10; f < 34; f += 12) {
      ctx.beginPath(); ctx.moveTo(f, 40); ctx.lineTo(f, floorY - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w - f, 40); ctx.lineTo(w - f, floorY - 4); ctx.stroke();
    }
    // bunting under the valance, in the flag colours
    var flags = ['kit.flagA', 'kit.flagB', 'kit.flagC'];
    for (var i = 0, bx = 44; bx < w - 60; i++, bx += 40) {
      ctx.fillStyle = col(flags[i % 3]);
      ctx.beginPath(); ctx.moveTo(bx, 62); ctx.lineTo(bx + 32, 62); ctx.lineTo(bx + 16, 86); ctx.closePath();
      ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = ink; ctx.stroke();
    }
    // the rival's podium with the city seal
    var px = 140, pw = 140, top = 490;
    ctx.fillStyle = col('kit.wood');
    ctx.fillRect(px, top, pw, h - top);
    ctx.fillStyle = SR.art.draw.tone(col('kit.wood'), 1);
    ctx.fillRect(px - 10, top - 12, pw + 20, 14);
    ctx.lineWidth = 3; ctx.strokeStyle = ink;
    ctx.strokeRect(px, top, pw, h - top);
    ctx.strokeRect(px - 10, top - 12, pw + 20, 14);
    ctx.fillStyle = col('kit.gold');
    ctx.beginPath(); ctx.arc(px + pw / 2, top + 40, 20, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.stroke();
    // "LIVE FROM CITY HALL" on the stage lip, right of the podium
    ctx.fillStyle = ink;
    ctx.font = host.font(18, 900, true);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(host.text('mg.debate.banner'), 440, 530);
  }

  SR.def.skin('debate', {
    engine: 'duel',
    /**
     * The skin's run params (the rules' debateParams win where they overlap).
     * @returns {{opponent: {name: string, portrait: string}, situations: string[], subtitle: string}}
     */
    params: function (state, run) {
      run = run || {};
      var path = run.path || (state && state.election && state.election.path) || 'president';
      var rival = run.rival || RIVALS[path] || RIVALS.president;
      var n = typeof run.beats === 'number' && run.beats > 0 ? run.beats : tunedBeats();
      return {
        opponent: { name: 'mg.debate.' + rival, portrait: rival },
        situations: questions(state, n),
        subtitle: 'mg.debate.vs.' + rival,
      };
    },
    text: { title: 'mg.debate.title' },
    art: { backdrop: backdrop },
  });
})();
