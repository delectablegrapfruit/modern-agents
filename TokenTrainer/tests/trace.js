// node tests/trace.js <scenario> <strategy>  — prints each graded decision with its notes.
const TT = require('./load.js'); const E = TT.engine;
const [id, strat = 'random'] = process.argv.slice(2);
const s = E.createSession(TT.scenarioById[id] || { practice: true }, { seed: 42 }); const r = E.mulberry32(9);
const ans = []; let st = E.newState();
while (!st.done && !st.failed) {
  const step = s.steps[st.step];
  ans.push(step.type === 'quiz' ? { choice: step.quiz.answer } : strat === 'random'
    ? { action: E.ACTIONS[Math.floor(r() * 6)].id, stop: E.STOPS[Math.floor(r() * 5)].id } : { action: strat.split(':')[0], stop: strat.split(':')[1] || 'none' });
  st = E.replay(s, ans);
}
for (const x of st.results.filter((x) => x.type === 'trade')) {
  console.log(`k${x.cp} ${x.action}/${x.stop} ${x.f.trend} rsi${Math.round(x.f.rsi)} proc ${x.proc} out ${x.outcome} → ${x.score} ${x.grade} | move ${(x.move * 100).toFixed(1)}% eq ${Math.round(x.eqAfter)} best ${x.best.label} ${x.events.map((e) => e.type).join()}`);
  x.notes.forEach((n) => console.log('     ', n.pts, n.text));
}
