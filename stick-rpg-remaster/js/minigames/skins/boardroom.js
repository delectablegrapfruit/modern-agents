// js/minigames/skins/boardroom.js — owner: W2-Money. The `boardroom` skin of the Duel engine (GDD
// §4.6, §6.5; BALANCE B-05, B-30): the Vice President's and the CEO's hustle at New Lines Inc. (P1
// `hustles`; the Hustle button of nli.work) and the CEO takeover (nli.takeover, the run's dScale ×2).
// Cards mode: three decision cards of 2-3 options each; Safe (INT, D 100, +0.05..+0.10 on success,
// -0.05..0 on failure), Bold (CHA, D 250, +0.10..+0.20 / -0.15..-0.05) and Ruthless (STR, D 250, the
// same, and -1 karma, which nli.work applies from the result's picks); m = clamp(1 + the sum,
// 0.7, 1.3); INT ≥ 200 shows each option's expected value. The engine reads every number from
// SR.tuning.duel.boardroom; Auto (a real sample) takes the best expected change and rolls it.
// This skin picks the three situations of a run (from nine, by a hash of the seed and the day, so a
// reload asks the same ones; never the rules stream), which options each card offers, the option
// labels, the board as the opponent, and draws the boardroom behind the pay meter.
// Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  // The nine situations (mg.boardroom.card.1..9) and the options each one offers (2-3, B-30).
  var CARDS = [
    ['safe', 'bold', 'ruthless'],   // 1 flat sales
    ['safe', 'bold', 'ruthless'],   // 2 poached staff
    ['safe', 'bold'],               // 3 trademark a line
    ['safe', 'ruthless'],           // 4 the typo
    ['bold', 'ruthless'],           // 5 the mascot
    ['safe', 'bold', 'ruthless'],   // 6 the merger
    ['safe', 'ruthless'],           // 7 fewer interns
    ['bold', 'ruthless'],           // 8 growth
    ['safe', 'bold'],               // 9 the stuck elevator
  ];
  var PER_RUN = 3;                  // B-30 boardroom: 3 cards (tuning.duel.boardroom.cards)
  var BOARD = [7, 'board', 10];     // the directors round the table (portrait ids: two pedestrians in ties and the Board's own)

  function col(key) { return SR.art.draw.color(key); }

  /** @returns {number[]} this run's situations (indices into CARDS): a hash of the seed and the day. */
  function pick(state, run) {
    var seed = state && state.seed !== undefined ? state.seed : 0;
    var day = state && state.clock ? state.clock.day : 0;
    var rng = SR.rng.create(SR.util.hash(seed, 'boardroom', day, run && run.takeover ? 'takeover' : 'shift'));
    var n = (SR.tuning && SR.tuning.duel && SR.tuning.duel.boardroom && SR.tuning.duel.boardroom.cards) || PER_RUN;
    var pool = CARDS.map(function (c, i) { return i; }), out = [];
    while (out.length < n && pool.length) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
    return out;
  }

  /** The round in progress (the frame's instance; its peek() is the engine's introspection). */
  function peek() {
    var cur = SR.minigame && typeof SR.minigame.current === 'function' ? SR.minigame.current() : null;
    if (!cur || !cur.inst || typeof cur.inst.peek !== 'function') return null;
    try { return cur.inst.peek(); } catch (e) { return null; }
  }

  /** The boardroom behind the pay meter (the left panel, x 24-396): the logo, the table and the board. */
  function backdrop(ctx, w, h, host) {
    var ink = col('inkLine');
    ctx.save();
    ctx.fillStyle = col('int.nli.wallHi');
    ctx.fillRect(24, 56, 372, 480);
    // the window strip over the table: a slice of the sky
    ctx.fillStyle = col('int.nli.accent');
    ctx.globalAlpha = 0.25;
    ctx.fillRect(40, 300, 340, 70);
    ctx.globalAlpha = 1;
    // the stacked-lines logo (ART_AUDIO §5.2: NLI's three stacked lines)
    for (var i = 0; i < 3; i++) {
      ctx.fillStyle = col('bld.nli.trim');
      ctx.fillRect(170 + i * 6, 80 + i * 14, 80 - i * 12, 8);
      ctx.lineWidth = 1.5; ctx.strokeStyle = ink;
      ctx.strokeRect(170 + i * 6, 80 + i * 14, 80 - i * 12, 8);
    }
    // the board, heads above the table (their mood follows the pay)
    var p = peek(), happy = p ? p.sum >= 0 : true;
    BOARD.forEach(function (look, k) {
      var x = 90 + k * 120, y = 390, size = 56;
      if (SR.art && SR.art.portraits && typeof SR.art.portraits.draw === 'function') {
        try { ctx.save(); ctx.translate(x - size / 2, y - size / 2); SR.art.portraits.draw(ctx, look, size, happy ? 'smug' : 'worried'); ctx.restore(); } catch (e) { ctx.restore(); }
      }
    });
    // the long table
    ctx.fillStyle = col('kit.woodDark');
    ctx.fillRect(40, 420, 340, 34);
    ctx.fillStyle = SR.art.draw.tone(col('kit.woodDark'), 1);
    ctx.fillRect(40, 420, 340, 8);
    ctx.lineWidth = 3; ctx.strokeStyle = ink;
    ctx.strokeRect(40, 420, 340, 34);
    ctx.fillStyle = col('kit.woodDark');
    ctx.fillRect(70, 454, 16, 70); ctx.fillRect(334, 454, 16, 70);
    ctx.strokeRect(70, 454, 16, 70); ctx.strokeRect(334, 454, 16, 70);
    // water glasses and a gavel
    [140, 262].forEach(function (x) {
      ctx.fillStyle = SR.art.draw.alpha(col('kit.glass'), 0.7);
      ctx.fillRect(x, 402, 14, 18);
      ctx.lineWidth = 1.5; ctx.strokeRect(x, 402, 14, 18);
    });
    ctx.lineWidth = 2; ctx.strokeStyle = ink;
    ctx.strokeRect(24, 56, 372, 480);
    ctx.restore();
  }

  SR.def.skin('boardroom', {
    engine: 'duel',
    music: 'tick_tock_trouble',
    /**
     * The skin's run params (the run's own dScale and takeover win where they overlap).
     * @returns {{opponent: object, situations: string[], cards: string[][], cardOptions: object, subtitle: string}}
     */
    params: function (state, run) {
      var ids = pick(state, run);
      return {
        opponent: { name: 'mg.boardroom.board', portrait: 'board' },
        situations: ids.map(function (i) { return 'mg.boardroom.card.' + (i + 1); }),
        cards: ids.map(function (i) { return CARDS[i].slice(); }),
        cardOptions: { safe: { label: 'mg.boardroom.safe' }, bold: { label: 'mg.boardroom.bold' }, ruthless: { label: 'mg.boardroom.ruthless' } },
        subtitle: run && run.takeover ? 'mg.boardroom.takeover' : 'mg.boardroom.subtitle',
      };
    },
    text: { title: 'mg.boardroom.title' },
    art: { backdrop: backdrop },
  });
})();
