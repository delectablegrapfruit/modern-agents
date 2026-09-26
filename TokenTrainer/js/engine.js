// Trading simulation and coaching engine. Pure logic, no DOM: a session is a fixed list of steps (quizzes and trade
// decisions at checkpoints on real candles); the state is rebuilt by replaying the committed answers, which is what
// makes decisions final — there is no way to change an answer, only to replay the whole scenario from the start.
(function (root) {
  const TT = (root.TT = root.TT || {});

  const START_CASH = 10000;
  const FEE = 0.001; // 0.1% taker fee, Binance spot default
  const HEARTS = 5;
  const BLOWUP = 0.4; // lesson ends if the account falls below 40% of the start

  const ACTIONS = [
    { id: 'hold', label: 'Hold', sub: 'No trade', kind: 'hold' },
    { id: 'buy25', label: 'Buy small', sub: '+25% of account', kind: 'buy', frac: 0.25 },
    { id: 'buy50', label: 'Buy big', sub: '+50% of account', kind: 'buy', frac: 0.5 },
    { id: 'allin', label: 'All in', sub: 'Use all cash', kind: 'buy', frac: 1 },
    { id: 'trim', label: 'Trim half', sub: 'Sell 50% of holding', kind: 'sell', frac: 0.5 },
    { id: 'exit', label: 'Sell all', sub: 'Back to cash', kind: 'sell', frac: 1 },
  ];
  const STOPS = [
    { id: 'none', label: 'No stop' },
    { id: 's5', label: '−5%', pct: 0.05 },
    { id: 's10', label: '−10%', pct: 0.1 },
    { id: 's20', label: '−20%', pct: 0.2 },
    { id: 't10', label: 'Trail 10%', pct: 0.1, trail: true },
  ];
  const actionById = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));
  const stopById = Object.fromEntries(STOPS.map((s) => [s.id, s]));

  const GRADES = {
    excellent: { label: 'Excellent', xp: 15, heart: 0, mood: 'party' },
    good: { label: 'Good', xp: 10, heart: 0, mood: 'happy' },
    inaccuracy: { label: 'Inaccuracy', xp: 5, heart: 0, mood: 'meh' },
    mistake: { label: 'Mistake', xp: 2, heart: 1, mood: 'sad' },
    blunder: { label: 'Blunder', xp: 0, heart: 1, mood: 'shock' },
  };

  // ---------- helpers ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const pct = (x, d = 1) => (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(d) + '%';
  const pctAbs = (x, d = 1) => Math.abs(x * 100).toFixed(d) + '%';
  const money = (x) => (x < 0 ? '−$' : '$') + Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const signedMoney = (x) => (x >= 0 ? '+' : '') + money(x);

  function parseWhen(s) {
    // 'YYYY-MM-DD' or 'YYYY-MM-DDTHH' in UTC
    const iso = s.length === 10 ? s + 'T00:00:00Z' : s.length === 13 ? s + ':00:00Z' : s;
    return Date.parse(iso) / 1000;
  }
  function indexAt(series, when) {
    const ts = parseWhen(when);
    const i = series.t.findIndex((t) => t >= ts);
    return i < 0 ? series.t.length - 1 : i;
  }

  function makeSeries(raw, from = 0, to = raw.t.length) {
    const s = { symbol: raw.symbol, interval: raw.interval };
    for (const k of ['t', 'o', 'h', 'l', 'c', 'v']) s[k] = raw[k].slice(from, to);
    return TT.ind.withIndicators(s);
  }

  // ---------- session ----------
  // def: scenario definition (js/scenarios.js) or a practice spec {practice:true, symbol, seed}.
  function createSession(def, opts = {}) {
    const seed = opts.seed >>> 0 || 1;
    const rand = mulberry32(seed);
    let series, cps, meta;
    if (def.practice) {
      const pool = root.MARKET_DATA.practice;
      const symbols = Object.keys(pool);
      const symbol = def.symbol || symbols[Math.floor(rand() * symbols.length)];
      const raw = pool[symbol];
      const step = 5 + Math.floor(rand() * 6); // 5–10 days between decisions
      const n = 7, look = 60, len = look + n * step + 1;
      const start = Math.floor(rand() * (raw.t.length - len));
      series = makeSeries(raw, start, start + len);
      cps = Array.from({ length: n }, (_, k) => look + k * step);
      meta = { id: 'practice', title: 'Mystery Chart', symbol, blind: true };
    } else {
      series = makeSeries(root.MARKET_DATA.scenarios[def.data]);
      if (def.checkpoints) cps = def.checkpoints.map((w) => indexAt(series, w));
      else {
        const n = def.decisions || 8, look = def.lookback || 50;
        const step = Math.floor((series.t.length - 1 - look) / n);
        cps = Array.from({ length: n }, (_, k) => look + k * step);
      }
      meta = { id: def.id, title: def.title, symbol: series.symbol, blind: !!opts.blind };
    }
    const end = series.t.length - 1;
    const steps = [];
    const mid = Math.floor(cps.length / 2);
    steps.push({ type: 'quiz', cp: 0, quiz: makeQuiz(series, cps[0], rand() < 0.5 ? 'trend' : 'rsi', rand, meta) });
    cps.forEach((i, k) => {
      if (k === mid) steps.push({ type: 'quiz', cp: k, quiz: makeQuiz(series, i, rand() < 0.5 ? 'risk' : 'size', rand, meta) });
      steps.push({ type: 'trade', cp: k, i, next: k + 1 < cps.length ? cps[k + 1] : end });
    });
    return { def, seed, series, cps, end, steps, ...meta };
  }

  function newState() {
    return {
      cash: START_CASH, qty: 0, cost: 0, stop: null, fees: 0,
      trades: [], curve: [], peak: START_CASH, maxDD: 0,
      hearts: HEARTS, xp: 0, results: [], step: 0, lastKind: null, failed: null, done: false,
    };
  }

  const equityAt = (st, price) => st.cash + st.qty * price;

  function slippage(series, i) {
    const a = series.ind.atr[i] || series.h[i] - series.l[i];
    return 0.0005 + Math.min(0.004, (a / series.c[i]) * 0.03);
  }

  // ---------- execution ----------
  function available(st, series, i) {
    const price = series.c[i];
    const eq = equityAt(st, price);
    const exposure = (st.qty * price) / eq;
    return ACTIONS.filter((a) => {
      if (a.kind === 'buy') return st.cash > eq * 0.01 && exposure < 0.97;
      if (a.kind === 'sell') return st.qty > 0 && st.qty * price > 1;
      return true;
    }).map((a) => a.id);
  }

  function execute(st, series, i, actionId, stopId) {
    const a = actionById[actionId];
    const price = series.c[i];
    const slip = slippage(series, i);
    const eq = equityAt(st, price);
    let bought = false;
    if (a.kind === 'buy') {
      const spend = Math.min(st.cash, a.id === 'allin' ? st.cash : a.frac * eq);
      if (spend > 1) {
        const fill = price * (1 + slip);
        const fee = spend * FEE;
        st.qty += (spend - fee) / fill;
        st.cash -= spend;
        st.cost += spend;
        st.fees += fee;
        st.trades.push({ i, side: 'buy', price: fill, usd: spend });
        bought = true;
      }
    } else if (a.kind === 'sell') {
      const q = st.qty * a.frac;
      const fill = price * (1 - slip);
      const gross = q * fill, fee = gross * FEE;
      st.cash += gross - fee;
      st.fees += fee;
      st.cost *= 1 - a.frac;
      st.qty -= q;
      if (a.frac === 1) { st.qty = 0; st.cost = 0; }
      st.trades.push({ i, side: 'sell', price: fill, usd: gross });
    }
    // Stop orders: choosing a (different) stop, or adding to the position, re-anchors it at this close.
    const s = stopById[stopId || 'none'];
    if (!s.pct) st.stop = null;
    else if (!st.stop || st.stop.id !== s.id || bought) st.stop = { id: s.id, pct: s.pct, trail: !!s.trail, price: price * (1 - s.pct) };
    if (st.qty === 0 && st.stop && a.kind === 'sell') st.stop = null;
  }

  // Runs candles (from, to]; stops fill at the trigger, at the open on a gap, and slip further in crash candles.
  function simulate(st, series, from, to) {
    const ev = [];
    for (let i = from + 1; i <= to; i++) {
      const { o, h, l, c } = series;
      if (st.qty > 0 && st.stop && l[i] <= st.stop.price) {
        const base = o[i] <= st.stop.price ? o[i] : st.stop.price;
        const a = series.ind.atr[i - 1] || h[i] - l[i];
        const fast = h[i] - l[i] > 2.5 * a;
        const fill = (fast ? base - 0.25 * (base - l[i]) : base) * (1 - slippage(series, i));
        const gross = st.qty * fill, fee = gross * FEE;
        ev.push({ type: 'stop', i, trigger: st.stop.price, fill, gap: o[i] <= st.stop.price, fast, pnl: gross - fee - st.cost });
        st.trades.push({ i, side: 'stop', price: fill, usd: gross });
        st.cash += gross - fee;
        st.fees += fee;
        st.qty = 0; st.cost = 0; st.stop = null;
      }
      if (st.stop && st.stop.trail) st.stop.price = Math.max(st.stop.price, c[i] * (1 - st.stop.pct));
      const eq = equityAt(st, c[i]);
      st.curve.push({ i, eq });
      st.peak = Math.max(st.peak, eq);
      st.maxDD = Math.max(st.maxDD, 1 - eq / st.peak);
    }
    return ev;
  }

  const cloneState = (st) => ({ ...st, stop: st.stop && { ...st.stop }, trades: st.trades.slice(), curve: [], results: [] });

  // ---------- market read at a decision ----------
  function features(series, i) {
    const { c, h, v, ind } = series;
    const price = c[i];
    const s20 = ind.sma20[i], s50 = ind.sma50[i];
    const s20p = i >= 5 ? ind.sma20[i - 5] : null;
    const slope20 = s20 && s20p ? s20 / s20p - 1 : 0;
    const atrPct = (ind.atr[i] || h[i] - series.l[i]) / price;
    let trend = 'unknown';
    if (s20 != null) {
      const upper = s50 == null || s20 > s50, lower = s50 == null || s20 < s50;
      if (price > s20 && upper && slope20 > 0) trend = 'up';
      else if (price < s20 && lower && slope20 < 0) trend = 'down';
      else trend = 'mixed';
    }
    const back = (k) => (i >= k ? price / c[i - k] - 1 : price / c[0] - 1);
    const hiN = Math.max(...h.slice(Math.max(0, i - 29), i + 1));
    return {
      price, s20, s50, slope20, trend, atrPct,
      rsi: ind.rsi[i], ext20: s20 ? price / s20 - 1 : 0,
      ret1: back(1), ret5: back(5), fromHigh: price / hiN - 1,
      volRatio: ind.vol20[i - 1] ? v[i] / ind.vol20[i - 1] : 1,
      lostAvg: s20 != null && i > 0 && ind.sma20[i - 1] != null && price < s20 && c[i - 1] >= ind.sma20[i - 1],
    };
  }

  function trendText(f) {
    if (f.trend === 'up') return `uptrend (price ${pct(f.ext20)} vs its rising 20-bar average)`;
    if (f.trend === 'down') return `downtrend (price ${pct(f.ext20)} vs its falling 20-bar average)`;
    if (f.trend === 'mixed') return 'no clean trend (averages flat or crossing)';
    return 'too little history to read a trend';
  }

  // ---------- coaching ----------
  // Scores the decision on process (what was knowable at the close) and on outcome versus the other choices.
  function processNotes(ctx) {
    const { f, a, before, after, stopBefore, stopAfter, prevKind, coach } = ctx;
    const notes = [];
    const add = (pts, text) => notes.push({ pts, text });
    const r = f.rsi != null ? Math.round(f.rsi) : null;
    const hot = f.atrPct > 0.06;
    const stretched = (r != null && r > 75) || f.ext20 > Math.max(0.15, 3 * f.atrPct);
    const capitulation = r != null && r < 27 && f.ret5 < -0.15 && f.volRatio > 1.5;

    if (a.kind === 'buy') {
      if (f.trend === 'up') add(14, `Buying with the trend: ${trendText(f)}.`);
      if (f.trend === 'down') {
        if (r != null && r < 30 && f.ret1 > 0) add(-4, `Counter-trend bounce buy: RSI ${r} is oversold and the last candle closed green, but the trend is still down. Keep bounce trades small.`);
        else add(-16, `Catching a falling knife: ${trendText(f)}. Wait for a higher low or a reclaim of the average before buying.`);
      }
      if (stretched) add(-12, `Chasing: ${r != null ? `RSI ${r}, ` : ''}price ${pct(f.ext20)} above its 20-bar average. Late entries at stretched levels are the first to get shaken out on a pullback.`);
      if (f.ret5 < -0.25 && f.trend !== 'down') add(-8, `Buying mid-crash (${pct(f.ret5)} in 5 bars) with no base yet — violent moves rarely finish in one candle.`);
      if (after.exposure >= 0.95 && !stopAfter) add(-14, `All-in with no stop: an average candle here moves ${pctAbs(f.atrPct)}; one bad day hits your entire account.`);
    }
    if (a.kind === 'sell') {
      const gain = before.unreal;
      if (gain > 0.15 && (stretched || (r != null && r > 68))) add(12, `Taking profit into strength (${r != null ? `RSI ${r}` : 'stretched'}) locks in a ${pct(gain, 0)} gain on the position.`);
      if (f.trend === 'down' || f.lostAvg) add(12, f.lostAvg ? 'The trend broke: price just closed below its 20-bar average. Reducing risk on the break is disciplined.' : `Reducing exposure in a ${trendText(f)} is disciplined.`);
      if (capitulation) {
        if (f.trend === 'down') add(-4, `Late exit: RSI ${r} and volume ${f.volRatio.toFixed(1)}× normal after a ${pct(f.ret5, 0)} drop. Defensible in a downtrend, but you're selling after the damage.`);
        else add(-12, `Selling into capitulation: RSI ${r}, volume ${f.volRatio.toFixed(1)}× normal after a ${pct(f.ret5, 0)} drop. Forced sellers often mark short-term lows.`);
      }
      if (f.trend === 'up' && !stretched && !f.lostAvg && gain < 0.15) add(-10, `Exiting a healthy uptrend without a signal: ${trendText(f)}.`);
      if (a.id === 'trim' && before.exposure > 0.6) add(3, 'Scaling out keeps some upside while cutting risk.');
      if (gain < -0.15 && f.trend === 'down') add(6, `Cutting a ${pct(gain, 0)} loser in a downtrend — painful, but it caps the damage.`);
    }
    if (a.kind === 'hold') {
      if (before.exposure > 0.05) {
        if (f.trend === 'up' && !stretched) add(10, 'Letting a winner run: the trend is intact.');
        if (f.trend === 'up' && stretched && before.unreal > 0.3) add(-4, `Very extended (RSI ${r}) with a ${pct(before.unreal, 0)} open gain — trimming or trailing a stop would bank some of it.`);
        if (f.trend === 'down') {
          if (!stopAfter) add(-12, `Holding through a ${trendText(f)} with no stop — hope isn't a plan.`);
          else add(4, 'In a downtrend, but your stop defines the worst case.');
        }
        if (before.unreal < -0.2 && !stopAfter) add(-6, `Down ${pctAbs(before.unreal, 0)} on the position with no exit plan.`);
      } else {
        if (f.trend === 'down') add(10, 'Patience: cash is a position while the trend is down.');
        else if (f.trend === 'up') add(-6, `Sitting out a clear ${trendText(f)}.`);
        else add(4, 'No clear edge — waiting for one is reasonable.');
        if (f.ret5 < -0.25) add(6, 'Not catching the knife during a crash.');
      }
    }
    // Stops and sizing apply to whatever position you hold after the decision.
    if (after.exposure > 0.05) {
      if (stopAfter) {
        const risk = after.exposure * (stopAfter.pct + 0.005);
        if (risk <= 0.021) add(10, `Defined risk: your stop caps a loss near ${pctAbs(risk)} of the account — the 1–2% pros aim for.`);
        else if (risk <= 0.04) add(5, `Your stop caps a loss near ${pctAbs(risk)} of the account — reasonable, a little above the 1–2% pros aim for.`);
        else if (risk <= 0.065) add(-2, `Your stop risks about ${pctAbs(risk)} of the account; a smaller size or closer stop would bring it toward 1–2%.`);
        else add(-8, `Your stop still risks about ${pctAbs(risk)} of the account on one idea; pros keep it near 1–2%.`);
        if (stopAfter.pct < f.atrPct * 1.2) add(-6, `Stop inside normal noise: ${pctAbs(stopAfter.pct, 0)} away vs an average candle range of ${pctAbs(f.atrPct)}. Likely to get wicked out.`);
        if (!stopBefore) add(5, 'Added a protective stop.');
        if (stopAfter.trail && before.unreal > 0.1) add(4, 'A trailing stop protects the gain while letting the trend run.');
      } else {
        if (stopBefore) add(hot ? -8 : -4, 'Removed your stop' + (hot ? ` in a volatile market (${pctAbs(f.atrPct)} average range).` : '.'));
        if (after.exposure > 0.5 && hot && a.kind !== 'buy') add(-6, `Large position in a volatile market (${pctAbs(f.atrPct)} average range) with no exit plan.`);
      }
    }
    if (prevKind && a.kind !== 'hold' && prevKind !== 'hold' && prevKind !== a.kind) add(-5, 'Flip-flopping: reversing your last trade one step later pays fees and slippage twice.');
    // Coach lists use 'hold' for keeping a position and 'wait' for staying in cash.
    const cid = a.id === 'hold' && before.exposure <= 0.05 ? 'wait' : a.id;
    if (coach && coach.prefer && coach.prefer.includes(cid)) add(12, "In line with the coach's read of this moment.");
    if (coach && coach.avoid && coach.avoid.includes(cid)) add(-14, "Against the coach's read of this moment.");
    return notes;
  }

  function grade(score) {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'inaccuracy';
    if (score >= 28) return 'mistake';
    return 'blunder';
  }

  function snapshot(st, price) {
    const eq = equityAt(st, price);
    return { eq, exposure: (st.qty * price) / eq, unreal: st.cost > 0 ? (st.qty * price) / st.cost - 1 : 0 };
  }

  // ---------- step answers ----------
  function answerQuiz(session, st, choice) {
    const step = session.steps[st.step];
    const correct = choice === step.quiz.answer;
    const res = { type: 'quiz', step: st.step, choice, correct, xp: correct ? 5 : 0, heart: correct ? 0 : 1, explain: step.quiz.explain };
    st.hearts -= res.heart;
    st.xp += res.xp;
    st.results.push(res);
    advance(session, st);
    return res;
  }

  function answerTrade(session, st, actionId, stopId) {
    const step = session.steps[st.step];
    const { series } = session;
    const i = step.i, to = step.next;
    const avail = available(st, series, i);
    if (!avail.includes(actionId)) actionId = 'hold';
    const a = actionById[actionId];
    const f = features(series, i);
    const before = snapshot(st, f.price);
    const stopBefore = st.stop && { ...st.stop };
    const coach = (session.def.coach || []).find((c) => c.k === step.cp);
    const cid = actionId === 'hold' && before.exposure <= 0.05 ? 'wait' : actionId;

    // Alternatives: every available action with the same stop choice, simulated over the same candles.
    const alts = avail.map((id) => {
      const s = cloneState(st);
      execute(s, series, i, id, stopId);
      simulate(s, series, i, to);
      return { id, label: actionById[id].label, eq: equityAt(s, series.c[to]) };
    });

    execute(st, series, i, actionId, stopId);
    const after = snapshot(st, f.price);
    const stopAfter = st.stop && { ...st.stop };
    const events = simulate(st, series, i, to);
    const eqEnd = equityAt(st, series.c[to]);

    const notes = processNotes({ f, a, before, after, stopBefore, stopAfter, prevKind: st.lastKind, coach });
    const proc = clamp(55 + notes.reduce((s, n) => s + n.pts, 0), 0, 100);
    // Outcome: a gain scores 60–100 by how much of the best available gain you captured; a loss scores 60–0 by how
    // close you came to the worst available result. If every choice lost, it is your rank between worst and best.
    const hi = Math.max(...alts.map((x) => x.eq)), lo = Math.min(...alts.map((x) => x.eq));
    const d = eqEnd - before.eq, bestD = hi - before.eq, worstD = lo - before.eq;
    let outcome;
    if (hi - lo < before.eq * 0.005) outcome = 70;
    else if (bestD <= 0) outcome = ((eqEnd - lo) / (hi - lo)) * 100;
    else if (d >= 0) outcome = 60 + (40 * d) / bestD;
    else outcome = worstD < 0 ? 60 * (1 - d / worstD) : 60;
    outcome = clamp(outcome, 0, 100);
    const score = Math.round(0.65 * proc + 0.35 * outcome);
    const g = grade(score);

    const best = alts.reduce((b, x) => (x.eq > b.eq ? x : b), alts[0]);
    let verdict = null;
    if (proc >= 65 && d < 0 && outcome < 40) verdict = 'Right process, rough outcome. Markets are noisy over a few candles — keep making this kind of decision.';
    else if (proc < 45 && d > 0 && outcome > 70) verdict = 'It paid this time, but the setup was poor. Repeating this will cost you more often than it pays.';
    else if (proc >= 60 && d >= 0 && hi - eqEnd > before.eq * 0.05 && best.id !== actionId) verdict = `Good read. In hindsight, ${best.label} would have made ${money(hi - eqEnd)} more — that's hindsight, not a rule; size up only when the risk is defined.`;

    const res = {
      type: 'trade', step: st.step, cp: step.cp, i, to, action: actionId, stop: stopId,
      grade: g, score, proc: Math.round(proc), outcome: Math.round(outcome), notes, verdict,
      move: series.c[to] / f.price - 1, eqBefore: before.eq, eqAfter: eqEnd,
      alts, best, events, coach: coach && { why: coach.avoid && coach.avoid.includes(cid) && coach.whyNot ? coach.whyNot : coach.why }, f: { trend: f.trend, rsi: f.rsi, atrPct: f.atrPct, ext20: f.ext20 },
      // Hearts are lost for bad decisions, not bad luck: only when the process itself was poor.
      xp: GRADES[g].xp, heart: GRADES[g].heart && proc < 50 ? 1 : 0,
    };
    st.hearts -= res.heart;
    st.xp += res.xp;
    st.lastKind = a.kind;
    st.results.push(res);
    if (eqEnd < START_CASH * BLOWUP) st.failed = 'account';
    advance(session, st);
    return res;
  }

  function advance(session, st) {
    st.step++;
    if (st.hearts <= 0) st.failed = st.failed || 'hearts';
    if (!st.failed && st.step >= session.steps.length) st.done = true;
  }

  // answers: [{choice} | {action, stop}] in step order.
  function replay(session, answers) {
    const st = newState();
    for (const ans of answers) {
      if (st.done || st.failed) break;
      const step = session.steps[st.step];
      if (step.type === 'quiz') answerQuiz(session, st, ans.choice);
      else answerTrade(session, st, ans.action, ans.stop);
    }
    return st;
  }

  function summary(session, st) {
    const { series, cps } = session;
    const lastI = st.results.filter((r) => r.type === 'trade').reduce((m, r) => Math.max(m, r.to), cps[0]);
    const eq = equityAt(st, series.c[lastI]);
    const trades = st.results.filter((r) => r.type === 'trade');
    const quizzes = st.results.filter((r) => r.type === 'quiz');
    const avg = trades.length ? trades.reduce((s, r) => s + r.score, 0) / trades.length : 0;
    const hodl = (series.c[lastI] / series.c[cps[0]]) * (1 - FEE) - 1;
    let stars = 0;
    if (st.done) stars = avg >= 72 && st.hearts >= 3 && st.maxDD < 0.25 ? 3 : avg >= 62 ? 2 : 1;
    const counts = {};
    trades.forEach((r) => (counts[r.grade] = (counts[r.grade] || 0) + 1));
    const bonus = st.done ? 10 + stars * 5 : 0;
    return {
      equity: eq, ret: eq / START_CASH - 1, hodl, maxDD: st.maxDD, fees: st.fees,
      trades: st.trades.length, avg: Math.round(avg), counts, stars,
      quizRight: quizzes.filter((q) => q.correct).length, quizTotal: quizzes.length,
      xp: st.xp + bonus, bonus, from: series.t[cps[0]], to: series.t[lastI],
    };
  }

  // ---------- quizzes ----------
  function shuffleAnswer(rand, options, correct) {
    const idx = options.map((_, k) => k);
    for (let k = idx.length - 1; k > 0; k--) {
      const j = Math.floor(rand() * (k + 1));
      [idx[k], idx[j]] = [idx[j], idx[k]];
    }
    return { options: idx.map((k) => options[k]), answer: idx.indexOf(correct) };
  }

  function makeQuiz(series, i, type, rand, meta) {
    const f = features(series, i);
    const name = meta.blind ? 'this token' : series.symbol.replace(/USDT$/, '');
    if (type === 'trend' && f.trend === 'unknown') type = 'rsi';
    if (type === 'rsi' && f.rsi == null) type = 'size';
    if (type === 'trend') {
      const opts = ['Uptrend', 'Downtrend', 'Sideways / unclear'];
      const correct = f.trend === 'up' ? 0 : f.trend === 'down' ? 1 : 2;
      const s = shuffleAnswer(rand, opts, correct);
      return {
        kind: 'Read the chart', prompt: `Look at the chart. What is ${name}'s trend right now?`, ...s,
        explain: `Price is ${pct(f.ext20)} vs its 20-bar average (orange), which moved ${pct(f.slope20)} over 5 bars${f.s50 ? `; the 20 is ${f.s20 > f.s50 ? 'above' : 'below'} the 50-bar average (blue)` : ''}. Trend = where price sits relative to rising or falling averages, plus the direction of highs and lows.`,
      };
    }
    if (type === 'rsi') {
      const r = Math.round(f.rsi);
      const opts = ['Overbought — momentum is hot, pullback risk is higher', 'Oversold — selling is stretched, bounce risk is higher', 'Neutral — no extreme'];
      const correct = r >= 70 ? 0 : r <= 30 ? 1 : 2;
      const s = shuffleAnswer(rand, opts, correct);
      return {
        kind: 'Read the chart', prompt: `${name}'s 14-bar RSI is ${r}. What does that tell you?`, ...s,
        explain: `RSI measures recent gains vs losses on a 0–100 scale: above 70 is overbought, below 30 oversold. At ${r} it is ${correct === 0 ? 'overbought' : correct === 1 ? 'oversold' : 'neutral'}. In strong trends RSI can stay extreme for a long time — it's a warning light, not a sell signal on its own.`,
      };
    }
    if (type === 'risk') {
      const size = [2000, 3000, 4000, 5000, 6000][Math.floor(rand() * 5)];
      const stop = [0.05, 0.08, 0.1, 0.12, 0.15][Math.floor(rand() * 5)];
      const risk = size * stop;
      const opts = [money(risk), money(size), money(risk * 3), money(START_CASH * stop)];
      const uniq = [...new Set(opts)];
      const s = shuffleAnswer(rand, uniq, 0);
      return {
        kind: 'Risk math', prompt: `You buy ${money(size)} of ${name} with a stop ${pctAbs(stop, 0)} below your entry. Ignoring fees, how much can you lose if the stop is hit?`, ...s,
        explain: `Risk = position × stop distance = ${money(size)} × ${pctAbs(stop, 0)} = ${money(risk)}, or ${pctAbs(risk / START_CASH)} of a ${money(START_CASH)} account. Gaps and crash candles can fill a stop lower, so real risk is a bit higher.`,
      };
    }
    // position sizing from risk
    const riskPct = [0.01, 0.02][Math.floor(rand() * 2)];
    const stop = [0.04, 0.05, 0.08, 0.1][Math.floor(rand() * 4)];
    const size = (START_CASH * riskPct) / stop;
    const opts = [money(size), money(START_CASH * riskPct), money(START_CASH * stop), money(START_CASH)];
    const s = shuffleAnswer(rand, [...new Set(opts)], 0);
    return {
      kind: 'Position sizing', prompt: `You want to risk ${pctAbs(riskPct, 0)} of your ${money(START_CASH)} account, with a stop ${pctAbs(stop, 0)} below entry. How big should the position be?`, ...s,
      explain: `Size = account risk ÷ stop distance = ${money(START_CASH * riskPct)} ÷ ${pctAbs(stop, 0)} = ${money(size)}. Wider stops mean smaller positions — that's how pros survive volatile markets.`,
    };
  }

  TT.engine = {
    START_CASH, FEE, HEARTS, ACTIONS, STOPS, GRADES, actionById, stopById,
    createSession, newState, replay, answerQuiz, answerTrade, available, features, summary, equityAt,
    indexAt, mulberry32, fmt: { pct, pctAbs, money, signedMoney },
  };
})(typeof window !== 'undefined' ? window : globalThis);
