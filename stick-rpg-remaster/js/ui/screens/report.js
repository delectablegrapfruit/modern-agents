// js/ui/screens/report.js — owner: W2-Home. The Daily Fold's page (UI §5.11; ART_AUDIO §11): the
// layout the report scene (js/scenes/report.js) shows for a night's Report (ARCHITECTURE §6.6).
//   SR.ui.report.build(report, opts) → the page element (editions: Morning, Stick General after a
//     hospital night, the one-page Jail strip, and the Election-night front page first whenever
//     report.election is set); lines are laid out by their `section`: Overnight · Your money ·
//     Markets · Weather columns, then the "Today in the city" strip (a section with no lines
//     collapses); the headline (report.headline, B-29) over a halftone photo of your stick.
//   SR.ui.report.newsVars(vars) → a news template's vars plus display values ({player}, {money},
//     {city}, {pathName}, {howText}, {causeText}, {decreeName}, {move}); the TV news uses it too.
//   SR.ui.report.headline(report) → the headline's text.
// The page shows the Report's lines and nothing else: never today's tip nor tomorrow's forecast
// (GDD §3.12, UI §5.11). Colours: tokens only (inline var(--…)); the photo's ink comes from
// SR.art.palette (fx.halftone, fx.newsprint). Load-time rule: defines functions only.
(function () {
  'use strict';
  var SR = window.SR;

  var COLUMNS = ['overnight', 'money', 'markets', 'weather'];       // UI §5.11, left to right
  var STRIPS = ['today'];                                          // under the columns
  var BLOCKS = { hospital: 'hospital', jail: 'jail' };             // over the columns on their edition
  var PHOTO_W = 150, PHOTO_H = 112;                                // the halftone "photo" (CSS px)
  var DOT = 3;                                                     // ART_AUDIO §11: a 3 px dot screen
  var PHOTO_SCALE = 0.6, PHOTO_CROP = 20;                          // head and body; the feet stand below the frame, a raised arm fits
  var NEEDLE_MS = 1600;                                            // the ±5 swing's animation
  var SCROLL_STEP = 48;                                            // ↑ / ↓ scroll the page when it overflows (CSS px)
  var POSITIVE = { electionWon: 1, promotedCeo: 1, promoted: 1, degree: 1, homeBought: 1, castleBought: 1, champion: 1,
    jackpot: 1, casinoBig: 1, ringWin: 1, fightWin: 1, tour: 1, haroldRepaid: 1, kidGood: 1, nominated: 1, decree: 1 };
  var NEGATIVE = { jailed: 1, hospital: 1, fall: 1, fallMilestone: 1, carHit: 1, removed: 1, electionLost: 1, busted: 1,
    storm: 1, kidDied: 1 };

  function D() { return SR.ui.dom; }
  function t(k, v) { return D().t(k, v); }
  function has(k) { return SR.text.has(k); }
  function hasSong(id) { return !!(SR.reg.song && SR.reg.song[id]); }

  // ---------------------------------------------------------------------------------------------
  // Text

  /**
   * A news template's vars plus display values: the player's name, money from `n`, a city's name,
   * the office's name, how it ended, the HP-0 cause, the decree's name and a signed stock move.
   * @param {object} vars a log entry's vars (plus `variant`)
   * @returns {object} a new object
   */
  function newsVars(vars) {
    var v = {}, k;
    vars = vars || {};
    for (k in vars) if (Object.prototype.hasOwnProperty.call(vars, k)) v[k] = vars[k];
    var s = SR.state;
    if (v.player === undefined) v.player = s && s.player ? s.player.name : '';
    if (typeof v.n === 'number' && v.money === undefined) v.money = SR.text.money(v.n);
    if (v.city && has('city.' + v.city + '.name')) v.city = SR.text('city.' + v.city + '.name');
    if (v.path) v.pathName = has('news.path.' + v.path) ? SR.text('news.path.' + v.path) : v.path;
    else if (s && s.job && s.job.office) v.pathName = SR.text('news.path.' + s.job.office);
    if (v.how) v.howText = has('news.how.' + v.how) ? SR.text('news.how.' + v.how) : v.how;
    if (v.cause) v.causeText = SR.text(has('news.cause.' + v.cause) ? 'news.cause.' + v.cause : 'news.cause.other');
    if (v.id && has('decree.' + v.id + '.name')) v.decreeName = SR.text('decree.' + v.id + '.name');
    if (typeof v.pct === 'number') v.move = (v.pct > 0 ? '+' : '') + v.pct + ' %';
    return v;
  }

  /** @returns {string} the headline text of a Report (B-29: yesterday's heaviest entry, else an absurdity). */
  function headline(rep) {
    var hd = rep && rep.headline;
    if (!hd || !hd.key) return t('news.quiet');
    return SR.text(hd.key, newsVars(hd.vars));
  }

  /** @returns {string} the kind of an edition: 'election' | 'hospital' | 'jail' | 'sleep'. */
  function editionOf(rep, page) {
    if (rep.election && page === 0) return 'election';
    return rep.kind === 'hospital' || rep.kind === 'jail' ? rep.kind : 'sleep';
  }

  function linesOf(rep, section) { return (rep.lines || []).filter(function (l) { return l && l.section === section; }); }
  function lineText(l) { return SR.text(l.key, l.vars); }

  // ---------------------------------------------------------------------------------------------
  // The photo: your stick, screened in halftone dots (ART_AUDIO §11)

  function photoClip(rep) {
    if (rep.election) return rep.election.won ? 'cheer' : 'lose';
    if (rep.kind === 'hospital') return 'hurt';
    if (rep.kind === 'jail') return 'idle';
    var kind = rep.headline && rep.headline.kind;
    return POSITIVE[kind] ? 'cheer' : NEGATIVE[kind] ? 'shock' : 'idle';
  }

  function drawPhoto(canvas, clip) {
    var dpr = Math.min(2, (typeof window.devicePixelRatio === 'number' && window.devicePixelRatio) || 1);
    var w = PHOTO_W, hh = PHOTO_H;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hh * dpr);
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;
    var paper = SR.art.draw.color('fx.newsprint'), ink = SR.art.draw.color('fx.halftone');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, hh);
    try {
      var off = document.createElement('canvas');
      off.width = w; off.height = hh;
      var o = off.getContext('2d');
      o.fillStyle = paper;
      o.fillRect(0, 0, w, hh);
      // a soft studio backdrop, then you
      o.fillStyle = SR.art.draw.color('ui.paper-3');
      o.beginPath(); o.ellipse(w / 2, hh * 0.52, w * 0.42, hh * 0.46, 0, 0, Math.PI * 2); o.fill();
      // Drawn a few times a pixel apart: a bolder figure survives the dot screen.
      [[0, 0], [-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]].forEach(function (d) {
        SR.art.stick.draw(o, clip, { x: w / 2 - 6 + d[0], y: hh + PHOTO_CROP + d[1], view: 'side', facing: 'right', scale: PHOTO_SCALE,
          player: true, t: 0.35, shadow: false });
      });
      var img = o.getImageData(0, 0, w, hh).data;
      ctx.fillStyle = ink;
      for (var y = 0; y < hh; y += DOT) {
        for (var x = (y / DOT) % 2 ? DOT / 2 : 0; x < w; x += DOT) {
          var i = ((Math.min(hh - 1, Math.round(y + DOT / 2)) * w) + Math.min(w - 1, Math.round(x + DOT / 2))) * 4;
          var lum = (0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2]) / 255;
          var r = (1 - lum) * DOT * 0.62;
          if (r > 0.25) { ctx.beginPath(); ctx.arc(x + DOT / 2, y + DOT / 2, r, 0, Math.PI * 2); ctx.fill(); }
        }
      }
    } catch (e) {
      SR.util.warnOnce('report.photo', 'SR.ui.report: the photo could not be screened (' + e.message + ')');
    }
  }

  function photo(rep) {
    var h = D().h;
    var cv = h('canvas', { 'data-id': 'report-photo', 'aria-hidden': 'true', style: { width: PHOTO_W + 'px', height: PHOTO_H + 'px', display: 'block',
      border: 'var(--line)', borderRadius: 'var(--r-xs)' } });
    drawPhoto(cv, photoClip(rep));
    return h('figure', { style: { margin: '0', flex: '0 0 auto' } }, cv,
      h('figcaption', { class: 't-caption', style: { color: 'var(--ink-700)', marginTop: '2px' } }, t('news.photo', newsVars({}))));
  }

  // ---------------------------------------------------------------------------------------------
  // Blocks

  function sectionTitle(sec) {
    return D().h('h3', { class: 't-small', style: { margin: '0 0 var(--sp-2)', fontWeight: '900', textTransform: 'uppercase',
      letterSpacing: '.08em', borderBottom: '1px solid var(--ink-900)', paddingBottom: '2px' } }, t('news.section.' + sec));
  }

  function lineItem(l) {
    var h = D().h;
    return h('li', { class: 't-body', 'data-id': 'report-line-' + l.key, style: { display: 'flex', gap: 'var(--sp-2)', alignItems: 'flex-start',
      margin: '0 0 var(--sp-1)', lineHeight: 'var(--lh-tight)' } },
      l.icon ? D().icon(l.icon, 20) : null, h('span', null, lineText(l)));
  }

  function column(rep, sec, first) {
    var h = D().h, lines = linesOf(rep, sec);
    if (!lines.length) return null;
    return h('section', { 'data-id': 'report-sec-' + sec, style: { minWidth: '0', padding: '0 var(--sp-3)',
      borderLeft: first ? 'none' : '1px solid var(--ink-300)' } },
      sectionTitle(sec), h('ul', { style: { listStyle: 'none', margin: '0', padding: '0' } }, lines.map(lineItem)));
  }

  function block(rep, sec) {
    var h = D().h, lines = linesOf(rep, sec);
    if (!lines.length) return null;
    return h('section', { 'data-id': 'report-sec-' + sec, style: { border: '2px solid var(--ink-900)', borderRadius: 'var(--r-s)',
      padding: 'var(--sp-2) var(--sp-3)', margin: '0 0 var(--sp-3)', background: 'var(--paper-0)' } },
      sectionTitle(sec), h('ul', { style: { listStyle: 'none', margin: '0', padding: '0' } }, lines.map(lineItem)));
  }

  function strip(rep, sec) {
    var h = D().h, lines = linesOf(rep, sec);
    if (!lines.length) return null;
    var parts = [];
    lines.forEach(function (l, i) {
      if (i) parts.push(h('span', { 'aria-hidden': 'true', style: { color: 'var(--ink-700)' } }, ' · '));
      parts.push(h('span', { 'data-id': 'report-line-' + l.key, style: { display: 'inline-flex', gap: '4px', alignItems: 'center' } },
        l.icon ? D().icon(l.icon, 16) : null, lineText(l)));
    });
    return h('section', { 'data-id': 'report-sec-' + sec, class: 't-body', style: { borderTop: '2px solid var(--ink-900)',
      paddingTop: 'var(--sp-2)', marginTop: 'var(--sp-3)' } },
      h('strong', { style: { textTransform: 'uppercase', letterSpacing: '.06em', marginRight: 'var(--sp-2)' } }, t('news.section.' + sec) + ':'), parts);
  }

  /** @returns {string} the new day's weekday name ('' when the Report has none). */
  function weekdayName(rep) {
    return typeof rep.weekday === 'number' && has('hud.weekday.' + rep.weekday) ? SR.text('hud.weekday.' + rep.weekday) : '';
  }

  function masthead(rep, edition) {
    var h = D().h;
    var title = edition === 'hospital' ? 'news.masthead.hospital' : 'news.masthead';
    var wd = weekdayName(rep);
    return h('header', { 'data-id': 'report-masthead', style: { textAlign: 'center', borderBottom: '5px double var(--ink-900)',
      paddingBottom: 'var(--sp-2)', marginBottom: 'var(--sp-3)' } },
      h('div', { class: 't-news', 'data-id': 'report-title', style: { fontSize: 'calc(var(--fs-44) * var(--ui-scale))', fontWeight: '900',
        letterSpacing: '.12em', textTransform: 'uppercase', lineHeight: '1' } }, t(title)),
      h('div', { class: 't-small', 'data-id': 'report-edition', style: { marginTop: 'var(--sp-1)', fontWeight: '700', letterSpacing: '.04em' } },
        t('news.edition.' + edition, { weekday: wd, day: rep.day })));
  }

  function headlineRow(rep) {
    var h = D().h;
    return h('div', { style: { display: 'flex', gap: 'var(--sp-4)', alignItems: 'center', marginBottom: 'var(--sp-3)' } },
      h('h2', { class: 't-news', 'data-id': 'report-headline', style: { flex: '1 1 auto', margin: '0', fontSize: 'calc(var(--fs-32) * var(--ui-scale))',
        fontWeight: '900', lineHeight: 'var(--lh-tight)', textTransform: 'uppercase' } }, headline(rep)),
      photo(rep));
  }

  // ---------------------------------------------------------------------------------------------
  // The election-night front page (UI §5.11): the result, the poll bar with its 50 % line, the
  // ±5 swing as a needle, then the stamp and the music.

  function needle(el, e, onDone) {
    var cv = el, W = 600, H = 70;
    var dpr = Math.min(2, (typeof window.devicePixelRatio === 'number' && window.devicePixelRatio) || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    var ctx = cv.getContext && cv.getContext('2d');
    var from = e.poll, to = SR.util.clamp(e.poll + (e.roll || 0), 0, 100);
    function tok(n) { return D().token(n); }
    function draw(v) {
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = tok('--ink-900'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(10, H - 14); ctx.lineTo(W - 10, H - 14); ctx.stroke();
      for (var i = 0; i <= 10; i++) {
        var x = 10 + i * (W - 20) / 10;
        ctx.beginPath(); ctx.moveTo(x, H - 14); ctx.lineTo(x, H - (i === 5 ? 34 : 22)); ctx.stroke();
      }
      ctx.fillStyle = tok('--danger'); ctx.fillRect(10 + (W - 20) / 2 - 1.5, 6, 3, H - 20);
      var nx = 10 + SR.util.clamp(v, 0, 100) / 100 * (W - 20);
      ctx.strokeStyle = tok('--primary-600'); ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(W / 2, H + 60); ctx.lineTo(nx, 8); ctx.stroke();
      ctx.fillStyle = tok('--ink-900'); ctx.beginPath(); ctx.arc(nx, 8, 5, 0, Math.PI * 2); ctx.fill();
    }
    var over = false;
    /** Settles the needle on the final reading and runs onDone once. @returns {boolean} it was still swinging */
    function end() {
      if (over) return false;
      over = true;
      draw(to);
      onDone();
      return true;
    }
    if (D().reduced() || D().fast() || typeof requestAnimationFrame !== 'function') { end(); return end; }
    var t0 = D().now();
    (function tick() {
      if (over || (!cv.isConnected && D().now() - t0 > 50)) return;
      var u = Math.min(1, (D().now() - t0) / NEEDLE_MS);
      if (u >= 1) { end(); return; }
      // a damped swing around the final reading
      draw(to + (from - to) * Math.cos(u * Math.PI * 3.5) * (1 - u));
      requestAnimationFrame(tick);
    })();
    return end;
  }

  function electionPage(rep, page) {
    var h = D().h, e = rep.election, final = Math.round((e.poll + (e.roll || 0)) * 10) / 10;
    var vars = newsVars({ path: e.path, poll: e.poll });
    var roll = (e.roll > 0 ? '+' : '') + (e.roll || 0);
    var cv = h('canvas', { 'data-id': 'report-needle', 'aria-hidden': 'true', style: { width: '600px', height: '70px', display: 'block', margin: '0 auto' } });
    var result = h('p', { class: 't-label', 'data-id': 'report-election-result', style: { textAlign: 'center', margin: 'var(--sp-2) 0', visibility: 'hidden' } },
      t('news.election.result', { final: final }));
    var box = h('section', { 'data-id': 'report-election', style: { textAlign: 'center', padding: 'var(--sp-3) 0' } },
      h('h2', { class: 't-news', 'data-id': 'report-headline', style: { fontSize: 'calc(var(--fs-44) * var(--ui-scale))', fontWeight: '900',
        textTransform: 'uppercase', margin: '0 0 var(--sp-4)', lineHeight: 'var(--lh-tight)' } }, t(e.won ? 'news.election.wonHead' : 'news.election.lostHead', vars)),
      h('div', { style: { display: 'flex', justifyContent: 'center', gap: 'var(--sp-4)', alignItems: 'center', marginBottom: 'var(--sp-2)' } },
        h('span', { class: 't-label' }, t('news.election.poll', { poll: e.poll })),
        SR.ui.meter({ id: 'report-poll', kind: 'poll', value: e.poll, max: 100, w: 360 }),
        h('span', { class: 't-small', style: { color: 'var(--ink-700)' } }, t('news.election.line'))),
      h('p', { class: 't-body', style: { margin: 'var(--sp-2) 0' } }, t('news.election.roll', { roll: roll })),
      cv, result);
    page.startAnim = function () {
      // A press while the needle swings settles it (the stamp lands) instead of turning the page.
      page.skipAnim = needle(cv, e, function () {
        result.style.visibility = 'visible';
        var key = e.won ? 'news.election.stamp.' + (e.path === 'dictator' ? 'dictator' : 'president') : 'news.election.stamp.concede';
        SR.ui.stamp({ text: t(key), kind: e.won ? 'primary' : 'ink' });
        // The march tutti and the march, or the sad trombone (ART_AUDIO §13.4), once W2-Music
        // registers them: an unknown song would stop the music that is playing (SR.audio.music).
        var A = SR.audio || {};
        if (e.won) {
          if (typeof A.stinger === 'function' && hasSong('stingers.election_win')) SR.audio.stinger('election_win');
          if (!D().fast() && SR.render && SR.render.fx && typeof SR.render.fx.confetti === 'function') SR.render.fx.confetti();
          if (typeof A.music === 'function' && hasSong('hail_to_the_stick')) SR.audio.music('hail_to_the_stick');
        } else if (typeof A.stinger === 'function' && hasSong('stingers.election_loss')) SR.audio.stinger('election_loss');
        D().announce(t(key) + '. ' + t('news.election.result', { final: final }));
      });
    };
    return box;
  }

  // ---------------------------------------------------------------------------------------------
  // The page

  function content(rep, pageNo, page) {
    var h = D().h, edition = editionOf(rep, pageNo);
    var body = h('div', { class: 'scroll-y', 'data-id': 'report-body', style: { flex: '1 1 auto', minHeight: '0', touchAction: 'pan-y' } });
    var nodes = [masthead(rep, edition)];
    if (edition === 'election') {
      nodes.push(electionPage(rep, page));
      body.appendChild(h('div', null, nodes));
      return body;
    }
    if (BLOCKS[edition]) nodes.push(block(rep, BLOCKS[edition]));
    if (rep.kind !== 'jail') nodes.push(headlineRow(rep));
    if (rep.ended) nodes.push(h('p', { class: 't-body', 'data-id': 'report-ended', style: { fontWeight: '700', margin: '0 0 var(--sp-3)' } },
      t('news.ended', { length: SR.state && SR.state.mode ? SR.state.mode.length : '' })));
    if (rep.dead) nodes.push(h('p', { class: 't-body', 'data-id': 'report-dead', style: { fontWeight: '700', margin: '0 0 var(--sp-3)', color: 'var(--danger-ink)' } },
      t('news.deceased')));
    var cols = COLUMNS.map(function (sec) { return linesOf(rep, sec).length ? sec : null; }).filter(Boolean);
    if (cols.length) {
      nodes.push(h('div', { 'data-id': 'report-columns', style: { display: 'grid', gridTemplateColumns: 'repeat(' + cols.length + ', minmax(0, 1fr))' } },
        cols.map(function (sec, i) { return column(rep, sec, i === 0); })));
    }
    // Sections this layout has no place for (an election line on a jail or hospital night, a
    // module's own section) still show, as blocks, so no line of the Report is ever dropped.
    var known = COLUMNS.concat(STRIPS, ['hospital', 'jail']);
    var extra = [];
    (rep.lines || []).forEach(function (l) { if (l && known.indexOf(l.section) < 0 && extra.indexOf(l.section) < 0) extra.push(l.section); });
    extra.forEach(function (sec) { nodes.push(block(rep, sec)); });
    STRIPS.forEach(function (sec) { nodes.push(strip(rep, sec)); });
    body.appendChild(h('div', null, nodes.filter(Boolean)));
    return body;
  }

  /**
   * Builds the page of a Report.
   * @param {object} rep the Report
   * @param {{onContinue: function, final: boolean}=} opts onContinue(): the last page's button;
   *   final: the button reads "Read the Final Edition" (the night ended the game)
   * @returns {HTMLElement} the page; el.button (the Continue button), el.next() (settles a
   *   swinging election needle, else the front page turns to the usual edition; false on the last
   *   page), el.page(), el.pages, el.onShow() (call once the page is in the document: the
   *   election's needle and stamp); ↑ / ↓ scroll an overflowing page
   */
  function build(rep, opts) {
    opts = opts || {};
    var h = D().h;
    var pages = rep.election ? 2 : 1, pageNo = 0;
    var el = h('div', { class: 'paper daily-fold', 'data-id': 'report', role: 'dialog', 'aria-modal': 'true',
      // UI §2.2: 160-1120 × 24-696 on the stage; centred and shrunk to the box in the touch-compact layout.
      style: { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(960px, calc(100% - 16px))',
        height: 'min(672px, calc(100% - 16px))', display: 'flex', flexDirection: 'column',
        boxSizing: 'border-box', padding: 'var(--sp-4) var(--sp-6) var(--sp-4)', background: 'var(--newsprint)', color: 'var(--ink-900)',
        border: 'var(--line)', borderRadius: 'var(--r-m)', boxShadow: 'var(--e-3)' } });
    var foot = h('footer', { style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--sp-3)', paddingTop: 'var(--sp-3)' } });
    var button = SR.ui.button({ id: 'report-continue', label: 'news.continue', variant: 'primary', autofocus: true, hint: 'confirm',
      onClick: function () { if (!el.next() && opts.onContinue) opts.onContinue(); } });
    foot.appendChild(button);
    el.button = button;

    function label() {
      if (pageNo < pages - 1) return 'news.continue.page';
      if (opts.final) return 'news.continue.final';
      return rep.kind === 'hospital' ? 'news.continue.hospital' : 'news.continue';
    }
    function show() {
      D().clear(el);
      el.startAnim = null;
      el.skipAnim = null;
      el.appendChild(content(rep, pageNo, el));
      el.appendChild(foot);
      button.update({ label: label() });
      var ed = editionOf(rep, pageNo);
      el.setAttribute('aria-label', t(ed === 'hospital' ? 'news.masthead.hospital' : 'news.masthead') + ', ' +
        t('news.edition.' + ed, { weekday: weekdayName(rep), day: rep.day }));
    }
    /**
     * Turns to the next page; a press while the election's needle swings settles it first.
     * @returns {boolean} false on the last page (nothing left to show)
     */
    el.next = function () {
      if (typeof el.skipAnim === 'function' && el.skipAnim()) return true;
      if (pageNo >= pages - 1) return false;
      pageNo++;
      show();
      SR.ui.focus.focus(button);
      D().sfx('open');
      return true;
    };
    // ↑ / ↓ scroll the page's body when it overflows (the touch-compact layout, a long night): the
    // Continue button holds the focus, and the focus kit gives its scope's handler the arrows first.
    SR.ui.focus.setHandler(el, function (action, ev) {
      if ((action !== 'up' && action !== 'down') || (ev && ev.down === false)) return false;
      var body = el.querySelector('[data-id="report-body"]');
      if (!body || body.scrollHeight <= body.clientHeight + 1) return false;
      body.scrollTop += (action === 'down' ? 1 : -1) * SCROLL_STEP;
      return true;
    });
    el.page = function () { return pageNo; };
    el.pages = pages;
    /** Starts the page's animation (the election's needle) once the page is in the document. */
    el.onShow = function () { var f = el.startAnim; el.startAnim = null; if (typeof f === 'function') f(); };
    show();
    return el;
  }

  SR.ui.report = { build: build, newsVars: newsVars, headline: headline, COLUMNS: COLUMNS.slice() };
})();
