#!/usr/bin/env node
// Long seeded runs of the Watch bot (js/bot.js), headless: whole Classic games played as the page plays them (gravity,
// the lock, the bot's hands at their pace), on four processes. For each set of rules and style (Human, Unrestrained):
// lines a game, the share of lines cleared by Quads, Twists, how many games topped out, and pieces a second. Every
// game stops at a cap of lines (an A-type game has no end of its own), and falls at one speed throughout (its level,
// past the setup's 15 too: Retro lock's 19 is three frames a row, 20 two, 30 one, as the old table has it).
//   node Lull/scripts/bot-soak.cjs [games=140] [lines=200]
// scripts/test.cjs runs a small one of these (a few games) on every test run.
'use strict';
const path = require('path');
const { fork } = require('child_process');

const SETS = [
  { name: 'Human, level 1', share: 0.1, classic: { level: 1 }, speed: 1 },
  { name: 'Human, level 8', share: 0.1, classic: { level: 8 }, speed: 8 },
  { name: 'Human, level 15', share: 0.1, classic: { level: 15 }, speed: 15 },
  { name: 'Human, level 18 (the fall of 15 and up)', share: 0.08, classic: { level: 15 }, speed: 18 },
  { name: 'Human, Retro lock, level 15 (4 frames a row)', share: 0.08, classic: { level: 15, lock: 'retro', rand: 'retro' }, speed: 15 },
  { name: 'Human, Retro lock, level 19 (3 frames a row)', share: 0.08, classic: { level: 15, lock: 'retro', rand: 'retro' }, speed: 19 },
  { name: 'Human, Retro lock, level 20 (2 frames a row)', share: 0.08, classic: { level: 15, lock: 'retro', rand: 'retro' }, speed: 20 },
  { name: 'Human, Retro lock, level 30 (1 frame a row)', share: 0.06, classic: { level: 15, lock: 'retro', rand: 'retro' }, speed: 30 },
  { name: 'Human, level 5, no Next, no Hold', share: 0.06, classic: { level: 5, next: 0, hold: false }, speed: 5 },
  { name: 'Human, level 5, mistakes Often', share: 0.06, classic: { level: 5 }, speed: 5, mistakes: 'often' },
  { name: 'Unrestrained, level 15', share: 0.06, classic: { level: 15 }, speed: 15, style: 'unrestrained' },
  { name: 'Unrestrained, Retro lock, level 20', share: 0.06, classic: { level: 15, lock: 'retro', rand: 'retro' }, speed: 20, style: 'unrestrained' },
  { name: 'Unrestrained, Retro lock, level 30', share: 0.04, classic: { level: 15, lock: 'retro', rand: 'retro' }, speed: 30, style: 'unrestrained' },
];

if (process.argv[2] === '--child') {
  const L = require('./load.cjs')(['util.js', 'pieces.js', 'board.js', 'recipe.js', 'engine.js', 'items.js', 'library.js', 'classic.js', 'bot.js']);
  process.on('message', (job) => {
    const r = L.Bot.simulate({ classic: job.classic, speed: job.speed, style: job.style, seed: job.seed, botSeed: job.seed * 7 + 3, mistakes: job.mistakes, lines: job.lines, pieces: job.lines * 4 });
    process.send({ set: job.set, lines: r.lines, quads: r.quads, twists: r.twists, topout: r.topout, pieces: r.pieces, seconds: r.seconds, level: r.level });
  });
  return;
}

const total = Number(process.argv[2]) || 140, cap = Number(process.argv[3]) || 200;
const jobs = [];
let seed = 9000;
for (const [i, s] of SETS.entries()) {
  const n = i === SETS.length - 1 ? total - jobs.length : Math.round(total * s.share);
  for (let k = 0; k < n; k++) jobs.push({ set: i, classic: s.classic, speed: s.speed, style: s.style || 'human', mistakes: s.mistakes || 'off', seed: seed++, lines: cap });
}
const out = SETS.map(() => ({ games: 0, lines: 0, quads: 0, twists: 0, topouts: 0, pieces: 0, seconds: 0 }));
const t0 = Date.now();
let next = 0, done = 0;
const workers = Math.max(1, Math.min(4, require('os').cpus().length));
for (let w = 0; w < workers; w++) {
  const child = fork(__filename, ['--child']);
  const feed = () => { if (next < jobs.length) child.send(jobs[next++]); else child.kill(); };
  child.on('message', (r) => {
    const o = out[r.set];
    o.games++; o.lines += r.lines; o.quads += r.quads; o.twists += r.twists; o.topouts += r.topout ? 1 : 0; o.pieces += r.pieces; o.seconds += r.seconds;
    if (++done === jobs.length) report();
    feed();
  });
  feed();
}
function report() {
  console.log('Watch bot: ' + done + ' seeded games, each to ' + cap + ' lines or the top out (' + Math.round((Date.now() - t0) / 1000) + ' s)\n');
  console.log('| Rules | Games | Lines a game | Lines by Quads | Twists a game | Topped out | Pieces a second |');
  console.log('|---|---|---|---|---|---|---|');
  SETS.forEach((s, i) => {
    const o = out[i];
    if (!o.games) return;
    console.log('| ' + [s.name, o.games, (o.lines / o.games).toFixed(1), (100 * o.quads * 4 / Math.max(1, o.lines)).toFixed(1) + '%', (o.twists / o.games).toFixed(2), o.topouts + ' (' + (100 * o.topouts / o.games).toFixed(1) + '%)', (o.pieces / o.seconds).toFixed(2)].join(' | ') + ' |');
  });
}
