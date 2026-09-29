// tests/balance/bots.cjs — owner: W1-Q (scaffold; W3-Balance writes the B-23 bots). Rule-level bots
// for tests/balance/sim.cjs (BALANCE B-23, B-25). Walking is free in the game (GDD §4.1), so a bot
// only chooses actions; it never moves.
//
// A bot is { name, decide(state, ctx) → { id, params } | null, minigame?(open, state, ctx) → result,
// init?(state, ctx) }. decide is called until it returns null (the bot goes to sleep), the day is
// over, or the day's decision cap is reached. state is the live run state: read it, never write it
// (the sim applies every change through SR.rules.act.run). ctx:
//   ctx.SR          the rules namespace (mode rules, loaded once)
//   ctx.rng         the bot's own random stream (never the rules stream)
//   ctx.policy      'normal' | 'expert' (B-23)
//   ctx.day, ctx.min  the clock
//   ctx.preview(id, params) → Preview (pure, on a copy of the rules stream)
//   ctx.candidates(filter) → the ids of the registered actions a bot may choose (no world, bag,
//                    phone, jail, trip or hospital owner, no :resolve, no sub-screen), filtered by
//                    ctx.candidates({ groups: [...] })
//   ctx.cashIn(p)   the cash a Preview gains (wage, win, ...), ctx.statIn(p) its stat points
//   ctx.memo        a per-run object the bot may keep notes in
// Wave 1 ships `idle` (the trivial bot of BUILD_PLAN §3.11), `sampler` (random eligible actions:
// a fuzzer for the rules) and `worker` (a data-driven, legal-only grinder: work when it pays, train
// otherwise, eat when hurt), which need no action id: they read the registered actions and their
// previews, so they work unchanged when wave 2's buildings land. The four B-23 bots (Grinder,
// Saint, Kingpin, Tourist) and their normal / expert policies are W3-Balance's.
'use strict';

const LEGAL = ['eat', 'buy', 'work', 'train'];

/** @returns {string} the variant a bot picks for an action (full shifts). */
function variantOf(def) { return Array.isArray(def.variants) && def.variants.length ? (def.variants.indexOf('full') >= 0 ? 'full' : def.variants[0]) : undefined; }

/** @returns {{id: string, params: object}} a decision with the action's default params. */
function choose(ctx, id) {
  const def = ctx.SR.reg.action[id];
  const v = def ? variantOf(def) : undefined;
  return { id, params: v ? { variant: v } : {} };
}

const bots = {
  /** Sleeps every day: the trivial bot (the nights, the markets and the calendar still run). */
  idle: {
    name: 'idle',
    decide() { return null; },
  },

  /** Random eligible actions (legal groups, preview ok), up to 12 a day: a fuzzer for the rules. */
  sampler: {
    name: 'sampler',
    decide(state, ctx) {
      ctx.memo.today = ctx.memo.day === ctx.day ? (ctx.memo.today || 0) + 1 : 1;
      ctx.memo.day = ctx.day;
      if (ctx.memo.today > 12) return null;
      const ok = ctx.candidates({ groups: LEGAL }).filter((id) => { const p = ctx.preview(id, choose(ctx, id).params); return p && p.ok && !p.hidden; });
      return ok.length ? choose(ctx, ctx.rng.pick(ok)) : null;
    },
  },

  /**
   * A legal-only grinder read from the data: eat when HP is below half, else the work row with the
   * best cash per hour, else the training row with the most stat points per hour, else sleep.
   * Expert policy: never idles while a row fits; normal: stops after 75 % of the waking day (B-23).
   */
  worker: {
    name: 'worker',
    decide(state, ctx) {
      const T = ctx.SR.tuning;
      const dayEnd = (T.time && T.time.dayEnd) || 1440;
      const wake = state.clock.wake || 480;
      if (ctx.policy !== 'expert' && state.clock.min - wake > 0.75 * (dayEnd - wake)) return null;
      const best = (groups, score) => {
        let pick = null;
        let top = 0;
        ctx.candidates({ groups }).forEach((id) => {
          const d = choose(ctx, id);
          const p = ctx.preview(id, d.params);
          if (!p || !p.ok || p.hidden) return;
          const v = score(p);
          if (v > top) { top = v; pick = d; }
        });
        return pick;
      };
      const perHour = (n, p) => n / Math.max(0.5, ((p.cost && p.cost.min) || 30) / 60);
      if (state.stats.hp < state.stats.hpMax / 2) {
        const eat = best(['eat'], (p) => { const hp = (p.gains || []).filter((g) => g.kind === 'hp').reduce((a, g) => a + (g.n || 0), 0); return hp > 0 && (!p.cost || (p.cost.cash || 0) <= state.money.cash) ? hp : 0; });
        if (eat) return eat;
      }
      return best(['work'], (p) => perHour(ctx.cashIn(p), p)) || best(['train'], (p) => perHour(ctx.statIn(p), p));
    },
  },
};

module.exports = { bots, LEGAL, choose, variantOf };
