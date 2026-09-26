// Loads the game's scripts into Node (they attach to globalThis.Lull, as in the page).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dir = path.join(__dirname, '..', 'Game', 'js');
module.exports = function load(files) {
  globalThis.atob = globalThis.atob || ((s) => Buffer.from(s, 'base64').toString('binary'));
  for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });
  return globalThis.Lull;
};
