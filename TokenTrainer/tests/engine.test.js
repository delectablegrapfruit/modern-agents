// node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const TT = require('./load.js');
const E = TT.engine;

function play(session, pick) {
  const answers = [];
  let st = E.newState();
  while (!st.done && !st.failed) {
    const step = session.steps[st.step];
    answers.push(step.type === 'quiz' ? { choice: step.quiz.answer } : pick(step, st));
    st = E.replay(session, answers);
  }
  return { st, answers };
}

test('every scenario has data, ordered checkpoints and valid coach/news entries', () => {
  const ids = TT.UNITS.map((u) => u.id);
  for (const def of TT.SCENARIOS) {
    assert.ok(ids.includes(def.unit), def.id);
    const s = E.createSession(def, { seed: 1 });
    assert.ok(s.cps[0] >= 3, `${def.id}: needs lookback before first decision`);
    for (let k = 1; k < s.cps.length; k++) assert.ok(s.cps[k] > s.cps[k - 1], `${def.id}: checkpoints must increase`);
    assert.ok(s.cps[s.cps.length - 1] < s.end, `${def.id}: last decision needs candles after it`);
    for (const c of def.coach || []) {
      assert.ok(c.k >= 0 && c.k < s.cps.length, `${def.id}: coach k=${c.k} out of range`);
      for (const id of [...(c.prefer || []), ...(c.avoid || [])]) assert.ok(id === 'wait' || E.actionById[id], `${def.id}: unknown action ${id}`);
    }
    if (def.checkpoints) {
      def.checkpoints.forEach((w, k) => {
        const t = s.series.t[s.cps[k]];
        const want = Date.parse(w.length === 10 ? w + 'T00:00:00Z' : w + ':00:00Z') / 1000;
        assert.strictEqual(t, want, `${def.id}: checkpoint ${w} has no candle at that time`);
      });
    }
  }
});

test('replaying the same answers rebuilds the same state (decisions are final and deterministic)', () => {
  const s = E.createSession(TT.scenarioById.covid, { seed: 5 });
  const r = E.mulberry32(3);
  const { st, answers } = play(s, () => ({ action: E.ACTIONS[Math.floor(r() * 6)].id, stop: E.STOPS[Math.floor(r() * 5)].id }));
  const again = E.replay(s, answers);
  assert.strictEqual(again.cash, st.cash);
  assert.strictEqual(again.qty, st.qty);
  assert.deepStrictEqual(again.results.map((x) => x.score), st.results.map((x) => x.score));
});

test('buying charges the fee and slippage; selling everything returns to cash', () => {
  const s = E.createSession(TT.scenarioById.btc_etf, { seed: 1 });
  const st = E.newState();
  st.step = 1; // first trade step
  const res = E.answerTrade(s, st, 'allin', 'none');
  const buy = st.trades[0];
  assert.strictEqual(buy.side, 'buy');
  assert.ok(buy.price > s.series.c[res.i], 'buy fills above the close (slippage)');
  assert.ok(st.fees >= E.START_CASH * E.FEE - 1e-6);
  assert.ok(st.cash < 1);
  st.step = s.steps.findIndex((x, k) => k > 1 && x.type === 'trade');
  E.answerTrade(s, st, 'exit', 'none');
  assert.strictEqual(st.qty, 0);
});

test('a stop fills at or below its trigger during the LUNA collapse', () => {
  const s = E.createSession(TT.scenarioById.luna, { seed: 1 });
  const { st } = play(s, (step, st) => ({ action: st.qty > 0 ? 'hold' : 'allin', stop: 's10' }));
  const stops = st.results.flatMap((r) => r.events || []).filter((e) => e.type === 'stop');
  assert.ok(stops.length > 0, 'expected at least one stop-out');
  for (const e of stops) assert.ok(e.fill <= e.trigger, 'stop cannot fill above its trigger');
});

test('buying and holding LUNA all the way down is graded badly and blows up the account', () => {
  const s = E.createSession(TT.scenarioById.luna, { seed: 1 });
  const { st } = play(s, (step, st) => ({ action: st.qty > 0 ? 'hold' : 'allin', stop: 'none' }));
  assert.ok(st.failed, 'lesson should end early');
  const grades = st.results.filter((r) => r.type === 'trade').map((r) => r.grade);
  assert.ok(grades.includes('blunder') || grades.includes('mistake'));
});

test('a disciplined trend-follower outscores random play across all lessons', () => {
  const avg = (pick) => {
    let total = 0, n = 0;
    for (const def of TT.SCENARIOS) {
      for (const seed of [1, 2, 3]) {
        const s = E.createSession(def, { seed });
        const r = E.mulberry32(seed * 7);
        const { st } = play(s, (step, st) => pick(s, step, st, r));
        for (const x of st.results) if (x.type === 'trade') { total += x.score; n++; }
      }
    }
    return total / n;
  };
  const trend = avg((s, step) => {
    const f = E.features(s.series, step.i);
    if (f.trend === 'up' && f.rsi < 72) return { action: 'buy25', stop: 't10' };
    if (f.trend === 'down' || f.lostAvg) return { action: 'exit', stop: 'none' };
    return { action: 'hold', stop: 't10' };
  });
  const random = avg((s, step, st, r) => ({ action: E.ACTIONS[Math.floor(r() * 6)].id, stop: E.STOPS[Math.floor(r() * 5)].id }));
  assert.ok(trend > random + 3, `trend ${trend.toFixed(1)} vs random ${random.toFixed(1)}`);
});

test('quiz answers are marked against the computed answer', () => {
  const s = E.createSession(TT.scenarioById.eth_merge, { seed: 9 });
  const st = E.newState();
  const q = s.steps[0].quiz;
  const wrong = (q.answer + 1) % q.options.length;
  const res = E.answerQuiz(s, st, wrong);
  assert.strictEqual(res.correct, false);
  assert.strictEqual(st.hearts, E.HEARTS - 1);
});

test('practice rounds are reproducible from their seed', () => {
  const a = E.createSession({ practice: true }, { seed: 123 });
  const b = E.createSession({ practice: true }, { seed: 123 });
  assert.strictEqual(a.symbol, b.symbol);
  assert.deepStrictEqual(a.series.t.slice(0, 5), b.series.t.slice(0, 5));
  assert.ok(a.blind);
});
