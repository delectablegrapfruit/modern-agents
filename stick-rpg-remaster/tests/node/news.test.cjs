// tests/node/news.test.cjs — owner: W2-RulesE (W1-E in wave 1). SR.rules.news (BALANCE B-29; ARCHITECTURE §6.9): the
// headline is yesterday's heaviest log entry by B-29 weight (ties: the latest) at or above
// minWeight, else a city absurdity with a stable variant; the TV news leads with the same entry.
//   node tests/node/news.test.cjs
'use strict';
const H = require('./econ-helpers.cjs');

const T = H.L.suite('news (W1-E)');
const SR = H.boot();
const N = SR.rules.news;

/** A state whose yesterday's log holds these kinds (in order), each with vars { i }. */
function withLog(kinds, patch) {
  const s = H.state(SR, patch);
  kinds.forEach((k, i) => SR.rules.log.add(s, k, { i: i }));
  SR.rules.log.roll(s);
  return s;
}

T.section('the headline picks by B-29 weight');
{
  const W = SR.tuning.news.weights;
  const kinds = Object.keys(W);
  // Every pair: the heavier kind wins whatever the order.
  let bad = [];
  for (let a = 0; a < kinds.length; a++) {
    for (let b = 0; b < kinds.length; b++) {
      if (W[kinds[a]] <= W[kinds[b]]) continue;
      const h = N.headline(withLog([kinds[b], kinds[a], kinds[b]])).key;
      if (h !== 'news.head.' + kinds[a]) bad.push([kinds[a], kinds[b], h]);
    }
  }
  T.eq(bad, [], 'for every pair of kinds the heavier one is the headline');
  T.eq(N.headline(withLog(['fall', 'promoted', 'carHit'])), { key: 'news.head.promoted', vars: N.headline(withLog(['fall', 'promoted', 'carHit'])).vars, kind: 'promoted' },
    'a promotion outweighs a fall and a car hit');
  T.eq(N.headline(withLog(['electionWon', 'removed', 'jailed'])).kind, 'electionWon', 'an election outweighs everything');
  const tie = N.headline(withLog(['promoted', 'fall', 'promoted']));
  T.eq([tie.kind, tie.vars.i], ['promoted', 2], 'ties: the latest');
  T.eq(N.headline(withLog(['storm'])).key, 'news.head.absurd', 'below minWeight (a storm, 8): a city absurdity');
  T.eq(N.headline(withLog(['fall'])).kind, 'fall', 'at minWeight (a fall, 10): the fall');
  T.eq(N.headline(withLog([])).key, 'news.head.absurd', 'a quiet day: a city absurdity');
  const q = withLog([], { clock: { day: 9 } }), q2 = withLog([], { clock: { day: 9 } });
  T.eq(N.headline(q).vars.variant, N.headline(q2).vars.variant, 'the same morning always shows the same template');
  const st = withLog([]);
  const r0 = SR.rng.rules.state();
  N.headline(st);
  T.eq(SR.rng.rules.state(), r0, 'picking a headline draws nothing from the rules stream');
  T.eq(N.headline(withLog(['promoted'])).vars.i, 0, 'the entry\'s vars go to the template');
}

T.section('the TV news leads with the same entry');
{
  const s = withLog(['fall', 'bankRobbery']);
  const tv = N.tvStory(s, SR.rng.create(1));
  T.eq([tv.key, tv.lead], ['news.tv.bankRobbery', true], 'the TV news leads with the headline\'s entry');
  const q = N.tvStory(withLog([]), SR.rng.create(1));
  T.eq([q.key, q.lead], ['news.story', false], 'otherwise one of the stories');
  T.eq(N.lead(withLog(['stockMove', 'carHit'])).kind, 'carHit', 'lead() is the entry itself');
}

T.done();
