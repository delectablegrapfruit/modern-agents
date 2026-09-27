// Loads the game's classic scripts into a Node vm context with a minimal window, for headless tests.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function load(files) {
  const ctx = { console, Math, Date, JSON, Map, Set, Uint8Array, Int32Array, Float64Array, Float32Array, Object, Array, Number, String, Infinity, NaN, isFinite };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
  return ctx.MZ;
};
