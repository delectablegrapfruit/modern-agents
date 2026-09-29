// js/art/portraits.js — owner: W1-A. SR.art.portraits: head-and-shoulders portraits of any person
// for the UI Portrait component (UI.md §2.3: 32 / 56 / 96 / 176 px), dialogs, the card header, the
// Daily Fold and the NLI billboard. A portrait is the side-view rig (ART_AUDIO §7) facing the viewer,
// cropped to a square, so every accessory and mood matches the figure in the world.
//
// Public: draw(ctx, personId, size, mood, opts), toCanvas(personId, size, mood, opts), SIZES.
(function () {
  'use strict';
  var SR = window.SR;
  var SIZES = [32, 56, 96, 176];
  // Arms relaxed a little away from the body so the shoulders read at 32 px.
  var POSE = null;
  var OPTS = { view: 'side', facing: 'down', anchor: 'hip', upper: true, shadow: false, x: 0, y: 0, scale: 1,
    look: null, mood: 'neutral', player: false, karma: undefined, head: undefined, splay: 1.9 };

  /**
   * Draws a portrait into the square (0, 0)-(size, size) of ctx's current transform.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string|number|object} personId a person id ('harold', 'mel', 'fighter.3', 'player'), a
   *   pedestrian number, or a look object (SR.art.stick.look)
   * @param {number} size edge in ctx units
   * @param {string=} mood 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'hurt' | 'sleep' |
   *   'smug' | 'worried'
   * @param {{blink: boolean, bg: string, karma: number, frame: boolean}=} opts blink: eyes closed (the
   *   component blinks every 4-7 s); bg: a palette key to fill the square first; karma: for 'player';
   *   frame: a 2 px ink border
   */
  function draw(ctx, personId, size, mood, opts) {
    opts = opts || {};
    var st = SR.art.stick;
    if (!st || typeof st.draw !== 'function') { plainHead(ctx, size, opts); return; }
    if (!POSE) POSE = [0, 0, -16 * Math.PI / 180, 8 * Math.PI / 180, 16 * Math.PI / 180, 8 * Math.PI / 180, 0, 0, 0, 0, 0, 0];
    var m = st.metrics('side', false);
    var L = st.look(personId);
    var isPlayer = personId === 'player' || personId === 'you' || L.player;
    // Head radius 0.25 × size, head centre at 43 % of the height; the side-view head sits
    // (torso + neck) above the hips.
    var k = (size * 0.25) / m.head;
    if (L.child) k *= 1.05;
    var cm = st.metrics('side', !!L.child);
    var headX = size / 2, headY = size * 0.43;
    var hipY = headY + (cm.torso + cm.neck) * k;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.clip();
    if (opts.bg) { ctx.fillStyle = SR.art.draw.color(opts.bg); ctx.fillRect(0, 0, size, size); }
    OPTS.x = headX; OPTS.y = hipY; OPTS.scale = k; OPTS.look = L;
    OPTS.mood = opts.blink ? 'blink' : (mood || 'neutral');
    OPTS.player = isPlayer;
    OPTS.karma = opts.karma;
    st.draw(ctx, POSE, OPTS);
    ctx.restore();
    if (opts.frame) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = SR.art.draw.color('ui.ink-900');
      ctx.strokeRect(1, 1, size - 2, size - 2);
      ctx.restore();
    }
  }

  // A page that loads portraits.js without the rig (stick.js) still gets a head and shoulders.
  function plainHead(ctx, size, opts) {
    var D = SR.art.draw;
    var c = function (k) { return D ? D.color(k) : k; };
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.clip();
    if (opts.bg) { ctx.fillStyle = c(opts.bg); ctx.fillRect(0, 0, size, size); }
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.5, size * 0.05);
    ctx.strokeStyle = c('ink');
    ctx.beginPath(); ctx.moveTo(size * 0.5, size * 0.6); ctx.lineTo(size * 0.5, size);
    ctx.moveTo(size * 0.18, size * 0.95); ctx.lineTo(size * 0.5, size * 0.72); ctx.lineTo(size * 0.82, size * 0.95); ctx.stroke();
    ctx.beginPath(); ctx.arc(size * 0.5, size * 0.42, size * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = c('npc.stone'); ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.03); ctx.stroke();
    ctx.restore();
  }

  /**
   * A new canvas holding one portrait at device resolution (for DOM use).
   * @param {*} personId
   * @param {number} size CSS px
   * @param {string=} mood
   * @param {{dpr: number}=} opts plus draw()'s opts
   * @returns {HTMLCanvasElement}
   */
  function toCanvas(personId, size, mood, opts) {
    opts = opts || {};
    var dpr = opts.dpr || (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    var c = document.createElement('canvas');
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    c.style.width = size + 'px';
    c.style.height = size + 'px';
    var g = c.getContext('2d');
    g.scale(dpr, dpr);
    draw(g, personId, size, mood, opts);
    return c;
  }

  SR.art.portraits = { draw: draw, toCanvas: toCanvas, SIZES: SIZES };
})();
