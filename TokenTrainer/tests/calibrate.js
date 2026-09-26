// Calibration: runs simple strategies through every scenario and prints grade tallies. node tests/calibrate.js
const TT = require('./load.js'); const E = TT.engine;
const strategies = {
  hodl: (k) => ({ action: k === 0 ? 'allin' : 'hold', stop: 'none' }),
  cash: () => ({ action: 'hold', stop: 'none' }),
  coach: (k, s) => { const c = (s.def.coach || []).find((c) => c.k === k); return { action: c ? c.prefer[0] : 'hold', stop: 's10' }; },
  trend: (k, s) => {
    const f = E.features(s.series, s.cps[k]);
    if (f.trend === 'up' && f.rsi < 72) return { action: 'buy50', stop: 't10' };
    if (f.trend === 'down' || f.lostAvg) return { action: 'exit', stop: 'none' };
    return { action: 'hold', stop: 't10' };
  },
  expert: (k, s) => {
    const i = s.cps[k], f = E.features(s.series, i);
    const c = (s.def.coach || []).find((c) => c.k === k);
    if (c) return { action: c.prefer.find((x) => x !== 'wait') || 'hold', stop: 't10' };
    if (f.trend === 'up' && f.rsi < 72) return { action: 'buy25', stop: 't10' };
    if (f.trend === 'down' || f.lostAvg) return { action: 'exit', stop: 'none' };
    return { action: 'hold', stop: 't10' };
  },
  random: (k, s, r) => ({ action: E.ACTIONS[Math.floor(r() * 6)].id, stop: E.STOPS[Math.floor(r() * 5)].id }),
};
for (const [name, fn] of Object.entries(strategies)) {
  const tally = {}; let rets = [];
  for (const def of [...TT.SCENARIOS, { practice: true }]) {
    const s = E.createSession(def, { seed: 42 }); const r = E.mulberry32(9);
    const answers = []; let st = E.newState();
    while (!st.done && !st.failed) {
      const step = s.steps[st.step];
      const ans = step.type === 'quiz' ? { choice: step.quiz.answer } : fn(step.cp, s, r);
      answers.push(ans); st = E.replay(s, answers);
    }
    const sum = E.summary(s, st);
    for (const x of st.results) if (x.type === 'trade') tally[x.grade] = (tally[x.grade] || 0) + 1;
    rets.push(`${s.id}:${(sum.ret * 100).toFixed(0)}%/${sum.avg}${st.failed ? '!' + st.failed : ''}★${sum.stars}`);
  }
  console.log(name.padEnd(7), JSON.stringify(tally)); console.log('   ', rets.join(' '));
}
