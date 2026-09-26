// Loads the browser scripts into Node's global scope.
const fs = require('fs'), path = require('path'), vm = require('vm');
globalThis.window = globalThis;
for (const f of ['data/market-data.js', 'js/indicators.js', 'js/engine.js', 'js/scenarios.js'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), { filename: f });
module.exports = globalThis.TT;
