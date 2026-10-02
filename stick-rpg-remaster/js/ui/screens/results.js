// js/ui/screens/results.js — owner: W2-Front. The Final Edition of The Daily Fold (UI §5.14; GDD
// §4.19; BALANCE B-18): SR.ui.results.
//   build(result, opts) → the page: the masthead and edition line ("Final Edition · Day 40 of 40"),
//     the headline (templated from the ending, the rank, your title and karma), the halftone photo of
//     your stick in a pose by karma column (a halo, a shrug, horns; a plinth in office; knocked flat
//     when deceased), NET WORTH (the scene counts it up) and its parts, the stats and karma, the
//     banners (PRESIDENT / DICTATOR OF STICKS, UNVERIFIED, DECEASED, the MET THE ARTIST sticker), the
//     rank stamp (thumped on by the scene), the graphs and the "Achievements · Legacy · Hall of Fame"
//     line (P1 `achievements`), and Keep playing (timed games) · Title · Copy summary.
//   summary(result) → the plain-text summary of UI §5.14 (Copy summary: the clipboard, else the
//     read-only, pre-selected textarea).
//   headline(result) → the headline; file(result, state) → files the run in the profile once (the
//     Hall of Fame by length: ranked runs only, B-18; lifetime totals; the MET THE ARTIST badge) and
//     returns the run's Hall of Fame place.
// Load-time rule: defines functions only.
(function () {
  'use strict';
  var SR = window.SR;

  var PHOTO_W = 190, PHOTO_H = 210;       // the halftone photo (CSS px)
  var DOT = 3;                            // ART_AUDIO §11: a 3 px dot screen
  var PHOTO_TOP = 40;                     // room above the head for the halo or the horns
  var STAMP_M = 52, STAMP_S = 38, STAMP_LONG = 14;   // the rank stamp's type on the page (px; long ranks smaller)
  var RUNS_KEPT = 30;                     // the profile remembers this many recent runs (filed once)
  var BREAKDOWN = ['cash', 'bank', 'cds', 'stocks', 'homes', 'furniture', 'car', 'loan', 'lien'];
  var ALWAYS = { cash: 1, bank: 1 };
  var NEGATIVE = { loan: 1, lien: 1 };

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function text(k, v) { return SR.text(k, v); }

  // ------------------------------------------------------------------------------------------------
  // Words
  // ------------------------------------------------------------------------------------------------
  function rankText(r) { return r.rankKey && SR.text.has(r.rankKey) ? text(r.rankKey) : String(r.rank || ''); }
  function titleText(r) { return r.title && SR.text.has('job.' + r.title) ? text('job.' + r.title) : text('job.none'); }
  function homeText(r) { return r.home && SR.text.has('home.' + r.home) ? text('home.' + r.home) : ''; }
  function bannerText(b) { return SR.text.has('rank.banner.' + b) ? text('rank.banner.' + b) : String(b).toUpperCase(); }
  function has(r, b) { return (r.banners || []).indexOf(b) >= 0; }
  /** The day the edition names: a timed game's last day, else the day it ended. */
  function dayShown(r) { return r.reason === 'time' && r.length > 0 ? Math.min(r.day, r.length) : r.day; }
  /** A timed run that ended within its length; a Keep-playing run went on as an Unlimited game (GDD §5). */
  function timed(r) { return r.length > 0 && dayShown(r) <= r.length; }
  function lengthText(r) { return timed(r) ? String(r.length) : text('front.res.unlimited'); }
  function edition(r) {
    return timed(r) ? text('front.res.edition', { day: dayShown(r), length: r.length }) : text('front.res.editionDay', { day: dayShown(r) });
  }
  function signed(n) { return (n > 0 ? '+' : '') + SR.text.num(n); }

  function headlineKey(r) {
    if (has(r, 'unverified')) return 'front.head.cheat';
    if (r.reason === 'death') return 'front.head.death';
    if (has(r, 'president')) return 'front.head.president';
    if (has(r, 'dictator')) return 'front.head.dictator';
    return 'front.head.' + (r.reason === 'retire' ? 'retire' : 'time') + '.' + (r.column || 'neutral');
  }
  /** @returns {string} the Final Edition's headline (the same one every time for a run). */
  function headline(r) {
    var up = function (s) { return String(s || '').toUpperCase(); };
    return text(headlineKey(r), {
      variant: SR.util.hash(r.name, r.day, r.rank, r.netWorth),
      rank: up(rankText(r)), name: up(r.name), title: up(titleText(r)), home: up(homeText(r)) || up(text('front.res.nowhere')),
      days: dayShown(r), money: SR.text.money(r.netWorth),
    });
  }

  /** The plain-text summary of UI §5.14. */
  function summary(r) {
    var banners = (r.banners || []).filter(function (b) { return b !== 'metArtist'; }).map(function (b) { return ' · ' + bannerText(b); }).join('');
    var st = r.stats || {};
    return [
      text('front.sum.line1', { game: text('game.title'), name: r.name, rank: rankText(r), banners: banners }),
      text('front.sum.line2', { day: dayShown(r), length: lengthText(r), difficulty: SR.ui.title.difficultyName(r.difficulty), money: SR.text.money(r.netWorth) }),
      text('front.sum.line3', { str: st.str, int: st.int, cha: st.cha, karma: signed(st.karma || 0) }),
      text('front.sum.line4', { title: titleText(r), home: homeText(r) || text('front.res.nowhere'), legacy: SR.text.num(r.legacy || 0) }),
      text('front.sum.line5', { headline: headline(r) }),
      text('ui.fanNote'),
    ].join('\n');
  }

  // ------------------------------------------------------------------------------------------------
  // The profile: the Hall of Fame by length, lifetime totals, badges (filed once per run)
  // ------------------------------------------------------------------------------------------------
  function runKey(r, s) { return [s && s.seed, r.name, r.difficulty, r.length].join('|'); }
  function endKey(r, s) { return runKey(r, s) + '|' + r.reason + '|' + r.day; }

  /**
   * Files a run in the profile once: the Hall of Fame (ranked runs only: never the cheat name, a
   * Keep-playing run only at its original end, any run only at its first end; B-18), the lifetime
   * totals (days, falls, fights, best net worth per length) and the MET THE ARTIST badge.
   * @returns {{bucket: string, place: number|null}} the run's Hall of Fame place (1-based)
   */
  function file(r, s) {
    var out = { bucket: r.bucket, place: null };
    var p;
    try { p = SR.save.profile(); } catch (e) { return out; }
    p.totals = p.totals || {};
    p.totals.seen = p.totals.seen || {};
    var ek = endKey(r, s), rk = runKey(r, s);
    var list = (p.hallOfFame[r.bucket] = p.hallOfFame[r.bucket] || []);
    var mine = list.filter(function (e) { return e.run === ek; })[0];
    if (!p.totals.seen[ek]) {
      var seen = p.totals.seen;
      // B-18: a run is entered once, at its first end. A later end of the same run (an Unlimited run
      // retired, resumed from its autosave and retired again) adds its days but no second entry.
      var firstEnd = !seen[rk];
      var prev = seen[rk] || { days: 0, falls: 0, fights: 0 };
      var rec = (s && s.records) || {};
      var days = dayShown(r), falls = rec.falls || 0, fights = (rec.fightsWon || 0) + (rec.ringWins || 0);
      p.totals.runs = (p.totals.runs || 0) + (seen[rk] ? 0 : 1);
      p.totals.days = (p.totals.days || 0) + Math.max(0, days - prev.days);
      p.totals.falls = (p.totals.falls || 0) + Math.max(0, falls - prev.falls);
      p.totals.fights = (p.totals.fights || 0) + Math.max(0, fights - prev.fights);
      p.totals.best = p.totals.best || {};
      // The best net worth of a length counts the runs the Hall of Fame would take (B-18): never the
      // cheat name, and a Keep-playing run only at its original end (not after 300 more days).
      if (firstEnd && r.ranked && !has(r, 'unverified') && (p.totals.best[r.bucket] === undefined || r.netWorth > p.totals.best[r.bucket])) p.totals.best[r.bucket] = r.netWorth;
      seen[rk] = { days: days, falls: falls, fights: fights };
      seen[ek] = 1;
      var keys = Object.keys(seen);
      while (keys.length > RUNS_KEPT * 2) { delete seen[keys.shift()]; }
      if (has(r, 'metArtist') && !p.badges.metArtist) p.badges.metArtist = new Date().toISOString().slice(0, 10);
      if (firstEnd && r.ranked && !mine) {
        mine = { run: ek, name: r.name, rank: r.rank, rankKey: r.rankKey, netWorth: r.netWorth, legacy: r.legacy || 0, day: dayShown(r),
          difficulty: r.difficulty, date: new Date().toISOString().slice(0, 10), banners: (r.banners || []).slice() };
        list.push(mine);
        list.sort(function (a, b) { return (b.legacy - a.legacy) || (b.netWorth - a.netWorth); });
        var top = (SR.tuning.endgame.hof && SR.tuning.endgame.hof.top) || 10;
        if (list.length > top) list.length = top;
      }
      try { SR.save.saveProfile(p); } catch (e) { SR.util.warnOnce('results.profile', 'results: the profile could not be saved (' + e.message + ')'); }
    }
    var i = mine ? list.indexOf(mine) : -1;
    out.place = i >= 0 ? i + 1 : null;
    return out;
  }

  // ------------------------------------------------------------------------------------------------
  // The photo (ART_AUDIO §11: halftone dots on newsprint)
  // ------------------------------------------------------------------------------------------------
  function drawPhoto(cv, r) {
    var k = ((SR.stage && SR.stage.uiK) || 1) * (window.devicePixelRatio || 1);
    cv.width = Math.round(PHOTO_W * k); cv.height = Math.round(PHOTO_H * k);
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    var A = SR.art.draw;
    ctx.fillStyle = A.color('fx.newsprint');
    ctx.fillRect(0, 0, PHOTO_W, PHOTO_H);
    try {
      var off = document.createElement('canvas');
      off.width = PHOTO_W; off.height = PHOTO_H;
      var o = off.getContext('2d');
      o.fillStyle = A.color('fx.newsprint');
      o.fillRect(0, 0, PHOTO_W, PHOTO_H);
      o.fillStyle = A.color('ui.paper-3');
      o.beginPath(); o.ellipse(PHOTO_W / 2, PHOTO_H * 0.5, PHOTO_W * 0.42, PHOTO_H * 0.44, 0, 0, Math.PI * 2); o.fill();
      var dead = has(r, 'deceased'), office = has(r, 'president') || has(r, 'dictator');
      var pose = dead ? 'knocked' : r.column === 'good' ? 'cheer' : r.column === 'evil' ? 'win' : 'idle';
      var base = PHOTO_H - (office ? 44 : 22);
      if (office) {
        o.fillStyle = A.color('stone'); o.fillRect(PHOTO_W / 2 - 52, base, 104, 30);
        o.strokeStyle = A.color('ink'); o.lineWidth = 2; o.strokeRect(PHOTO_W / 2 - 52, base, 104, 30);
      }
      var opts = { x: PHOTO_W / 2, y: base, view: 'side', facing: 'right', scale: 1, player: true, karma: (r.stats && r.stats.karma) || 0,
        t: 0.4, shadow: false, mood: dead ? 'hurt' : r.column === 'evil' ? 'smug' : 'happy' };
      if (SR.art.stick && typeof SR.art.stick.draw === 'function') {
        // Fill the frame: the figure's height at scale 1 decides the scale (a knocked-down stick lies flat).
        var J1 = SR.art.stick.joints(pose, { view: 'side', facing: 'right', scale: 1, x: 0, y: 0 });
        var tall = Math.max(40, -(J1.head[1] - J1.r));
        opts.scale = Math.min(1.1, (base - PHOTO_TOP) / tall);
        // Drawn a few times a pixel apart: a bolder figure survives the dot screen.
        [[0, 0], [-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]].forEach(function (d) { SR.art.stick.draw(o, pose, Object.assign({}, opts, { x: opts.x + d[0], y: opts.y + d[1] })); });
        var J = SR.art.stick.joints(pose, opts);
        var hx = J.head[0], hy = J.head[1], hr = J.r;
        o.lineWidth = 3; o.strokeStyle = A.color('ink'); o.fillStyle = A.color('ink');
        if (!dead && r.column === 'good') { o.beginPath(); o.ellipse(hx, hy - hr * 1.5, hr * 0.9, hr * 0.28, 0, 0, Math.PI * 2); o.stroke(); }
        else if (!dead && r.column === 'evil') {
          [-1, 1].forEach(function (sx) { o.beginPath(); o.moveTo(hx + sx * hr * 0.35, hy - hr * 0.8); o.lineTo(hx + sx * hr * 0.75, hy - hr * 1.6); o.lineTo(hx + sx * hr * 0.8, hy - hr * 0.6); o.closePath(); o.fill(); });
        } else if (!dead) {
          A.text(o, text('front.res.shrug'), hx + hr * 1.3, hy - hr * 0.9, { size: 26, role: 'display', color: 'ink', upper: false });
        }
      }
      var img = o.getImageData(0, 0, PHOTO_W, PHOTO_H).data;
      ctx.fillStyle = A.color('fx.halftone');
      for (var y = 0; y < PHOTO_H; y += DOT) {
        for (var x = (y / DOT) % 2 ? DOT / 2 : 0; x < PHOTO_W; x += DOT) {
          var i = ((Math.min(PHOTO_H - 1, Math.round(y + DOT / 2)) * PHOTO_W) + Math.min(PHOTO_W - 1, Math.round(x + DOT / 2))) * 4;
          var lum = (0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2]) / 255;
          var rr = (1 - lum) * DOT * 0.62;
          if (rr > 0.25) { ctx.beginPath(); ctx.arc(x + DOT / 2, y + DOT / 2, rr, 0, Math.PI * 2); ctx.fill(); }
        }
      }
    } catch (e) {
      SR.util.warnOnce('results.photo', 'results: the photo could not be screened (' + e.message + ')');
    }
  }

  // ------------------------------------------------------------------------------------------------
  // The page
  // ------------------------------------------------------------------------------------------------
  function history(s, key) {
    var pts = s && s.history && s.history[key];
    return Array.isArray(pts) ? pts.map(function (p) { return Array.isArray(p) ? p[1] : typeof p === 'number' ? p : p && p.value; })
      .filter(function (v) { return typeof v === 'number'; }) : [];
  }

  /**
   * Builds the Final Edition.
   * @param {object} r the run's results (SR.rules.endgame.results)
   * @param {{state: object, place: object, onKeep: function, onTitle: function, onCopy: function, canKeep: boolean}} opts
   * @returns {HTMLElement} the page, with setNetWorth(n), showStamp(animate) and buttons
   */
  function build(r, opts) {
    opts = opts || {};
    var s = opts.state || null;
    var nw = h('span', { class: 'res-nw-v t-money', 'data-id': 'results-networth' }, SR.text.money(0));
    var parts = h('ul', { class: 'res-parts', 'data-id': 'results-parts' });
    var b = r.breakdown || {};
    BREAKDOWN.forEach(function (k) {
      var v = b[k] || 0;
      if (!v && !ALWAYS[k]) return;
      parts.appendChild(h('li', { class: 'res-part', 'data-id': 'results-part-' + k },
        h('span', { class: 'res-part-k' }, text('front.res.part.' + k)),
        h('span', { class: 'res-part-v' }, SR.text.money(NEGATIVE[k] ? -v : v))));
    });
    var photo = h('canvas', { class: 'res-photo-cv', 'data-id': 'results-photo', 'aria-hidden': 'true', style: { width: PHOTO_W + 'px', height: PHOTO_H + 'px' } });
    drawPhoto(photo, r);
    var st = r.stats || {};
    var statsLine = h('p', { class: 'res-stats', 'data-id': 'results-stats' },
      text('front.res.stats', { str: st.str, int: st.int, cha: st.cha }));
    var karmaLine = h('p', { class: 'res-karma', 'data-id': 'results-karma' }, text('front.res.karma', { karma: signed(st.karma || 0) }));
    var side = h('div', { class: 'res-side' });
    if (SR.features.achievements && s) {
      var nws = history(s, 'nw');
      if (nws.length > 1 && SR.ui.lineChart) side.appendChild(SR.ui.lineChart({ id: 'results-chart-nw', label: 'front.res.chartNw', w: 360, h: 120,
        series: [{ data: nws, kind: 'money', label: 'front.res.nwShort' }], format: function (v) { return SR.text.money(v, { compact: true }); } }));
      var ss = ['str', 'int', 'cha'].map(function (k) { return { data: history(s, k), kind: k, label: 'ui.stat.' + k }; });
      if (ss[0].data.length > 1 && SR.ui.lineChart) side.appendChild(SR.ui.lineChart({ id: 'results-chart-stats', label: 'front.res.chartStats', w: 360, h: 120, series: ss }));
    }
    side.appendChild(statsLine);
    side.appendChild(karmaLine);
    side.appendChild(h('p', { class: 'res-life', 'data-id': 'results-life' }, text('front.res.life', { title: titleText(r), home: homeText(r) || text('front.res.nowhere') })));
    side.appendChild(h('p', { class: 'res-life', 'data-id': 'results-mode' }, text('front.res.mode', { difficulty: SR.ui.title.difficultyName(r.difficulty),
      length: timed(r) ? text('front.res.days', { n: r.length }) : text('front.res.unlimited') })));

    var banners = h('div', { class: 'res-banners', 'data-id': 'results-banners' });
    (r.banners || []).forEach(function (bn) {
      banners.appendChild(h('span', { class: ['res-banner', 'res-banner--' + bn], 'data-id': 'results-banner-' + bn }, bannerText(bn)));
    });
    var stampKind = has(r, 'deceased') ? 'hp' : r.column === 'good' ? 'primary' : r.column === 'evil' ? 'hp' : 'ink';
    var rt = rankText(r);
    var stamp = SR.ui.stamp({ text: rt, kind: stampKind, static: true, id: 'results-stamp', size: rt.length > STAMP_LONG ? STAMP_S : STAMP_M });
    stamp.classList.add('res-stamp');
    stamp.setAttribute('aria-hidden', 'true');
    var stampSlot = h('div', { class: 'res-stamp-slot', 'data-id': 'results-rank' }, stamp,
      h('span', { class: 'vh', 'data-id': 'results-rank-text' }, text('front.res.rank', { rank: rankText(r) })));

    var meta = null;
    if (SR.features.achievements) {
      var bits = [text('front.res.achievements', { n: r.achievements || 0 }), text('front.res.legacy', { n: SR.text.num(r.legacy || 0) })];
      if (opts.place && opts.place.place) bits.push(text('front.res.hof', { n: opts.place.place, bucket: text('rank.bucket.' + r.bucket) }));
      meta = h('p', { class: 'res-meta', 'data-id': 'results-meta' }, bits.join(' · '));
    }

    var btns = h('div', { class: 'res-actions' });
    if (opts.canKeep) btns.appendChild(SR.ui.button({ id: 'results-keep', label: 'front.res.keep', onClick: opts.onKeep }));
    btns.appendChild(SR.ui.button({ id: 'results-title', label: 'front.res.title', variant: 'primary', onClick: opts.onTitle }));
    btns.appendChild(SR.ui.button({ id: 'results-copy', label: 'front.res.copy', onClick: opts.onCopy }));

    var page = h('article', { class: 'res paper', 'data-id': 'results', 'aria-label': text('front.res.aria') },
      h('header', { class: 'res-mast' },
        h('p', { class: 'res-paper t-news', 'data-id': 'results-masthead' }, text('front.res.masthead')),
        h('p', { class: 'res-ed', 'data-id': 'results-edition' }, edition(r))),
      h('h1', { class: 'res-head t-news', 'data-id': 'results-headline' }, headline(r)),
      h('div', { class: 'res-body' },
        h('figure', { class: 'res-photo' }, photo, h('figcaption', { class: 'res-cap' }, text('front.res.photo', { name: r.name }))),
        h('div', { class: 'res-money' }, h('p', { class: 'res-nw' }, h('span', { class: 'res-nw-k' }, text('front.res.netWorth')), nw), parts),
        side),
      h('div', { class: 'res-bottom' }, banners, stampSlot),
      meta, btns);
    page.setNetWorth = function (n) { nw.textContent = SR.text.money(Math.round(n)); };
    page.showStamp = function (animate) {
      stampSlot.classList.add('is-shown');
      if (animate && !D().reduced()) { stamp.classList.remove('is-thump'); void stamp.offsetWidth; stamp.classList.add('is-thump'); }
    };
    page.buttons = btns;
    return page;
  }

  SR.ui.results = { build: build, summary: summary, headline: headline, file: file, dayShown: dayShown, rankText: rankText };
})();
