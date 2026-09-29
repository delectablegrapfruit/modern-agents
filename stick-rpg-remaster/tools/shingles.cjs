// tools/shingles.cjs — owner: W1-Q. The copyright checks of ARCHITECTURE §18 (BUILD_PLAN §3.11):
//   - shingles: no run of 8 words shared between a string literal of the game (js/**, plus the text
//     of index.html and README.md) and a string literal of the recreation (../stick-rpg/js/**);
//     case- and punctuation-insensitive; literals joined with `+` count as one run, and an
//     interpolation (`'a ' + x + ' b'`, `${x}`, `{name}`) is one wildcard word `#`;
//   - banned: tools/banned.txt (BUILD_PLAN Appendix A) over js/**, css/**, index.html, README.md;
//   - binary: no binary file among the tracked (or about to be tracked) files of the project
//     (`git ls-files`, read-only; shots/, tests/visual/out/ and tests/perf/out/ are git-ignored).
//
//   node tools/shingles.cjs                  every check (exit code 1 on a finding)
//   node tools/shingles.cjs --banned         only the named checks (--shingles, --banned, --binary)
//   options: --root <dir> (default: this project), --ref <dir> (the recreation's js/, default
//            <root>/../stick-rpg/js), --paths a,b (root-relative files or dirs to scan instead of
//            the defaults), --quiet, --selftest (plants each kind of finding in a temp tree)
//
//   const S = require('./shingles.cjs');
//   S.lex(src) → tokens · S.strings(src) → [{ text, line }] · S.words(text) → normalised words
//   S.shingleCheck(opts) · S.bannedCheck(opts) · S.binaryCheck(opts) → { findings, ... }
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RUN = 8;               // words in a shingle
const MIN_REAL = 6;          // a shingle needs at least this many real words (not the `#` wildcard)

// ------------------------------------------------------------------------------------------------
// A small JavaScript lexer: enough to find string literals (with template literals and regex
// literals told apart from strings and division), used by the shingle check and the validator.

const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

/**
 * @param {string} src JavaScript source
 * @returns {{t: string, v: string, line: number}[]} tokens: t 's' string (template parts joined,
 *   interpolations as ' # '), 'i' identifier or keyword, 'n' number, 'r' regex, 'p' punctuator
 */
function lex(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  let prev = null;
  const push = (tok) => { out.push(tok); prev = tok; };

  function escape() {
    // src[i] is the backslash
    const c = src[i + 1];
    i += 2;
    if (c === undefined) return '';
    if (c === '\n') { line++; return ''; }
    if (c === '\r') { if (src[i] === '\n') i++; line++; return ''; }
    if (c === 'n' || c === 'r' || c === 't' || c === 'v' || c === 'f' || c === 'b') return ' ';
    if (c === 'x') { const h = src.substr(i, 2); i += 2; return String.fromCharCode(parseInt(h, 16) || 32); }
    if (c === 'u') {
      if (src[i] === '{') { const e = src.indexOf('}', i); const h = src.slice(i + 1, e); i = e + 1; return String.fromCodePoint(parseInt(h, 16) || 32); }
      const h = src.substr(i, 4); i += 4; return String.fromCharCode(parseInt(h, 16) || 32);
    }
    return c;
  }
  function readString(q) {
    i++;
    let v = '';
    while (i < n) {
      const c = src[i];
      if (c === '\\') { v += escape(); continue; }
      if (c === q) { i++; break; }
      if (c === '\n') { line++; break; }      // unterminated: stop at the line end
      v += c;
      i++;
    }
    return v;
  }
  function skipComment() {
    if (src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; return true; }
    if (src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      const end = e < 0 ? n : e + 2;
      for (let k = i; k < end; k++) if (src[k] === '\n') line++;
      i = end;
      return true;
    }
    return false;
  }
  function skipExpr() {
    // inside ${ ... } of a template: skip to the matching brace (strings, templates, comments nested)
    let depth = 1;
    while (i < n) {
      const c = src[i];
      if (c === '{') { depth++; i++; continue; }
      if (c === '}') { depth--; i++; if (!depth) return; continue; }
      if (c === '\'' || c === '"') { readString(c); continue; }
      if (c === '`') { readTemplate(); continue; }
      if (c === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) { skipComment(); continue; }
      if (c === '\n') line++;
      i++;
    }
  }
  function readTemplate() {
    i++;
    let v = '';
    while (i < n) {
      const c = src[i];
      if (c === '\\') { v += escape(); continue; }
      if (c === '`') { i++; break; }
      if (c === '$' && src[i + 1] === '{') { i += 2; skipExpr(); v += ' # '; continue; }
      if (c === '\n') line++;
      v += c;
      i++;
    }
    return v;
  }
  function regexAllowed() {
    if (!prev) return true;
    if (prev.t === 'p') return prev.v !== ')' && prev.v !== ']' && prev.v !== '++' && prev.v !== '--';
    if (prev.t === 'i') return REGEX_AFTER_WORD.has(prev.v);
    return false;
  }
  function skipRegex() {
    i++;
    let cls = false;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '\n') break;
      if (cls) { if (c === ']') cls = false; i++; continue; }
      if (c === '[') { cls = true; i++; continue; }
      if (c === '/') { i++; break; }
      i++;
    }
    while (i < n && /[a-z]/i.test(src[i])) i++;
  }

  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ' || c === '﻿' || c === ' ' || c === ' ') { i++; continue; }
    if (c === '/' && skipComment()) continue;
    if (c === '\'' || c === '"') { const l = line; push({ t: 's', v: readString(c), line: l }); continue; }
    if (c === '`') { const l = line; push({ t: 's', v: readTemplate(), line: l, tpl: true }); continue; }
    if (c === '/') {
      if (regexAllowed()) { const l = line; skipRegex(); push({ t: 'r', v: '', line: l }); continue; }
      i++;
      push({ t: 'p', v: src[i] === '=' ? (i++, '/=') : '/', line });
      continue;
    }
    if (/[A-Za-z_$\\]/.test(c) || c > '\u007f') {
      let v = '';
      while (i < n && (/[A-Za-z0-9_$\\]/.test(src[i]) || src[i] > '\u007f')) v += src[i++];
      push({ t: 'i', v, line });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let v = '';
      while (i < n && /[0-9A-Za-z_.]/.test(src[i])) {
        if ((src[i] === 'e' || src[i] === 'E') && (src[i + 1] === '+' || src[i + 1] === '-')) v += src[i++];
        v += src[i++];
      }
      push({ t: 'n', v, line });
      continue;
    }
    if (c === '+' || c === '-') {
      if (src[i + 1] === c) { push({ t: 'p', v: c + c, line }); i += 2; continue; }
      if (src[i + 1] === '=') { push({ t: 'p', v: c + '=', line }); i += 2; continue; }
    }
    push({ t: 'p', v: c, line });
    i++;
  }
  return out;
}

/** Skips one simple operand (a.b.c, f(x), a[i], (x)) from token m; @returns {number} the next index. */
function skipOperand(tok, m) {
  const start = m;
  const balanced = (open, close) => {
    let d = 0;
    for (; m < tok.length; m++) {
      if (tok[m].t === 'p' && tok[m].v === open) d++;
      else if (tok[m].t === 'p' && tok[m].v === close) { d--; if (!d) { m++; return true; } }
    }
    return false;
  };
  if (tok[m] && tok[m].t === 'p' && tok[m].v === '(') { if (!balanced('(', ')')) return start; }
  else if (tok[m] && (tok[m].t === 'i' || tok[m].t === 'n')) m++;
  else return start;
  while (tok[m]) {
    if (tok[m].t === 'p' && tok[m].v === '.' && tok[m + 1] && tok[m + 1].t === 'i') { m += 2; continue; }
    if (tok[m].t === 'p' && tok[m].v === '(') { if (!balanced('(', ')')) return start; continue; }
    if (tok[m].t === 'p' && tok[m].v === '[') { if (!balanced('[', ']')) return start; continue; }
    break;
  }
  return m;
}

/**
 * The string runs of a source: literals joined by `+` form one run; a simple operand between two
 * literals (`'a ' + n + ' b'`) becomes the wildcard word `#`.
 * @returns {{text: string, line: number}[]}
 */
function strings(src) {
  const tok = lex(src);
  const out = [];
  for (let k = 0; k < tok.length; k++) {
    if (tok[k].t !== 's') continue;
    let text = tok[k].v;
    const line = tok[k].line;
    let j = k;
    for (;;) {
      const plus = tok[j + 1];
      if (!plus || plus.t !== 'p' || plus.v !== '+') break;
      if (tok[j + 2] && tok[j + 2].t === 's') { text += tok[j + 2].v; j += 2; continue; }
      const m = skipOperand(tok, j + 2);
      if (m > j + 2 && tok[m] && tok[m].t === 'p' && tok[m].v === '+' && tok[m + 1] && tok[m + 1].t === 's') {
        text += ' # ' + tok[m + 1].v;
        j = m + 1;
        continue;
      }
      break;
    }
    out.push({ text, line });
    k = j;
  }
  return out;
}

/** @returns {string[]} lower-case words of a text: markup, entities and punctuation dropped, placeholders as `#`. */
function words(text) {
  return String(text).toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/g, ' ')
    .replace(/\{[a-z0-9_.]*\}/g, ' # ')
    .replace(/%[sd]/g, ' # ')
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9#]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** @returns {string[]} root-relative paths of the files under rel (a file or a directory) with one of exts. */
function walk(root, rel, exts) {
  const abs = path.join(root, rel);
  let st;
  try { st = fs.statSync(abs); } catch (e) { return []; }
  if (st.isFile()) return [rel.split(path.sep).join('/')];
  const out = [];
  for (const name of fs.readdirSync(abs).sort()) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const r = path.join(rel, name);
    const s = fs.statSync(path.join(root, r));
    if (s.isDirectory()) out.push(...walk(root, r, exts));
    else if (!exts || exts.some((e) => name.endsWith(e))) out.push(r.split(path.sep).join('/'));
  }
  return out;
}

/**
 * @returns {boolean} a string is prose, not code: inline CSS (`left: 12px; top: 4px`), a selector
 * list or a path is not text a player reads, and would only match the recreation's own markup.
 */
function isProse(text) {
  const decl = String(text).match(/[a-z-]+\s*:\s*[^;:]+;/gi);
  if (decl && decl.length >= 2) return false;
  if (/^[\w./-]+\.(js|css|html|png|json)$/i.test(String(text).trim())) return false;
  return true;
}

/** The texts a file contributes: string runs of a .js file, the whole text of anything else. */
function textsOf(rel, src) {
  if (/\.(c?js)$/.test(rel)) return strings(src).filter((r) => isProse(r.text));
  if (/\.html?$/.test(rel)) {
    // the page's own text and attribute values (scripts are separate files)
    const body = src.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    return [{ text: body, line: 1 }];
  }
  return [{ text: src, line: 1 }];
}

// ------------------------------------------------------------------------------------------------
// Shingles

/**
 * Builds the shingle index of the recreation.
 * @returns {Map<string, string>} shingle → 'file:line' of its first occurrence
 */
function refIndex(refDir) {
  const index = new Map();
  for (const rel of walk(refDir, '.', ['.js'])) {
    const src = fs.readFileSync(path.join(refDir, rel), 'utf8');
    for (const run of strings(src)) {
      if (!isProse(run.text)) continue;
      const w = words(run.text);
      for (let k = 0; k + RUN <= w.length; k++) {
        const sh = w.slice(k, k + RUN);
        if (sh.filter((x) => x !== '#').length < MIN_REAL) continue;
        const key = sh.join(' ');
        if (!index.has(key)) index.set(key, rel.replace(/^\.\//, '') + ':' + run.line);
      }
    }
  }
  return index;
}

/**
 * The shingle check.
 * @param {{root: string, ref: string, paths: string[], read: function(string): string}} opts
 * @returns {{findings: {file: string, line: number, text: string, ref: string}[], files: number, refShingles: number, missingRef: boolean}}
 */
function shingleCheck(opts) {
  const root = opts.root || ROOT;
  const ref = opts.ref || path.resolve(root, '..', 'stick-rpg', 'js');
  if (!fs.existsSync(ref)) return { findings: [], files: 0, refShingles: 0, missingRef: true };
  const index = opts.index || refIndex(ref);
  const list = opts.files || [].concat(...(opts.paths || ['js', 'index.html', 'README.md']).map((p) => walk(root, p, ['.js', '.html', '.md'])));
  const read = opts.read || ((rel) => fs.readFileSync(path.join(root, rel), 'utf8'));
  const findings = [];
  for (const rel of list) {
    let src;
    try { src = read(rel); } catch (e) { continue; }
    for (const run of textsOf(rel, src)) {
      const w = words(run.text);
      let k = 0;
      while (k + RUN <= w.length) {
        const key = w.slice(k, k + RUN).join(' ');
        const hit = index.get(key);
        if (!hit) { k++; continue; }
        // extend to the longest shared span for a readable report
        let e = k + 1;
        while (e + RUN <= w.length && index.has(w.slice(e, e + RUN).join(' '))) e++;
        findings.push({ file: rel, line: run.line, text: w.slice(k, e - 1 + RUN).join(' '), ref: hit });
        k = e - 1 + RUN;
      }
    }
  }
  return { findings, files: list.length, refShingles: index.size, missingRef: false };
}

// ------------------------------------------------------------------------------------------------
// Banned strings

/** @returns {{substring: string[], word: string[], upper: string[], onlyIn: {term: string, where: string[]}[]}} */
function parseBanned(text) {
  const lists = { substring: [], word: [], upper: [], onlyIn: [] };
  const names = { substring: 'substring', word: 'word', upper: 'upper', 'only-in': 'onlyIn' };
  let cur = 'substring';
  const add = (list, entry) => {
    if (list === 'onlyIn') {
      const m = /^(.+?)\s*:\s*(.+)$/.exec(entry);
      if (!m) throw new Error('banned.txt: an [only-in] entry needs "term: where, where" (' + entry + ')');
      lists.onlyIn.push({ term: m[1].trim(), where: m[2].split(',').map((s) => s.trim()).filter(Boolean) });
    } else lists[list].push(entry);
  };
  for (const raw of String(text).split(/\r?\n/)) {
    const lineText = raw.trim();
    if (!lineText || lineText.startsWith('#')) continue;
    const m = /^\[(substring|word|upper|only-in)\]\s*(.*)$/.exec(lineText);
    if (m) {
      if (m[2]) add(names[m[1]], m[2]);
      else cur = names[m[1]];
      continue;
    }
    if (/^\[[^\]]*\]$/.test(lineText)) throw new Error('banned.txt: unknown list marker ' + lineText);
    add(cur, lineText);
  }
  return lists;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function lineAt(src, idx) { let l = 1; for (let k = 0; k < idx; k++) if (src.charCodeAt(k) === 10) l++; return l; }

/** @returns {number[][]} [start, end) spans of the values of text keys in a source. */
function keyValueSpans(src, keys) {
  const spans = [];
  for (const key of keys) {
    const re = new RegExp('([\'"])' + escapeRe(key) + '\\1\\s*:\\s*', 'g');
    let m;
    while ((m = re.exec(src))) {
      let i = m.index + m[0].length;
      const start = i;
      if (src[i] === '[') {
        let depth = 0;
        for (; i < src.length; i++) {
          const c = src[i];
          if (c === '\'' || c === '"' || c === '`') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } continue; }
          if (c === '[') depth++;
          else if (c === ']') { depth--; if (!depth) { i++; break; } }
        }
      } else if (src[i] === '\'' || src[i] === '"' || src[i] === '`') {
        const q = src[i];
        i++;
        while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
        i++;
      }
      spans.push([start, i]);
    }
  }
  return spans;
}

/**
 * The banned-strings check.
 * @param {{root: string, list: string, paths: string[], files: string[], read: function(string): string}} opts
 * @returns {{findings: {file: string, line: number, term: string, list: string}[], files: number}}
 */
function bannedCheck(opts) {
  const root = opts.root || ROOT;
  const lists = parseBanned(opts.list !== undefined ? opts.list : fs.readFileSync(path.join(__dirname, 'banned.txt'), 'utf8'));
  const list = opts.files || [].concat(...(opts.paths || ['js', 'css', 'index.html', 'README.md']).map((p) => walk(root, p, ['.js', '.css', '.html', '.md'])));
  const read = opts.read || ((rel) => fs.readFileSync(path.join(root, rel), 'utf8'));
  const findings = [];
  for (const rel of list) {
    let src;
    try { src = read(rel); } catch (e) { continue; }
    const low = src.toLowerCase();
    for (const term of lists.substring) {
      const t = term.toLowerCase();
      for (let k = low.indexOf(t); k >= 0; k = low.indexOf(t, k + 1)) findings.push({ file: rel, line: lineAt(src, k), term, list: 'substring' });
    }
    for (const [name, flags] of [['word', 'gi'], ['upper', 'g']]) {
      for (const term of lists[name]) {
        const re = new RegExp('(^|[^A-Za-z0-9_])' + escapeRe(term) + '(?![A-Za-z0-9_])', flags);
        let m;
        while ((m = re.exec(src))) {
          findings.push({ file: rel, line: lineAt(src, m.index + m[1].length), term, list: name });
          re.lastIndex = m.index + m[0].length;
        }
      }
    }
    for (const rule of lists.onlyIn) {
      if (rule.where.indexOf(rel) >= 0) continue;
      const t = rule.term.toLowerCase();
      let spans = null;
      for (let k = low.indexOf(t); k >= 0; k = low.indexOf(t, k + 1)) {
        if (!spans) spans = keyValueSpans(src, rule.where.filter((w) => !/[/\\]/.test(w) && !/\.(md|js|cjs|html|css|txt|json)$/i.test(w)));
        if (spans.some((s) => k >= s[0] && k < s[1])) continue;
        findings.push({ file: rel, line: lineAt(src, k), term: rule.term, list: 'only-in ' + rule.where.join(', ') });
      }
    }
  }
  return { findings, files: list.length, lists };
}

// ------------------------------------------------------------------------------------------------
// Binary files

const BINARY_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|tiff?|psd|mp3|wav|ogg|oga|flac|m4a|aac|mp4|m4v|webm|mov|avi|woff2?|ttf|otf|eot|zip|gz|tgz|bz2|xz|7z|rar|pdf|exe|dll|so|dylib|bin|swf|fla|class|jar|wasm|sqlite|db)$/i;

/** @returns {boolean} a file is binary: a known binary extension, or a NUL byte in its first 8,000 bytes. */
function isBinary(buf, name) {
  if (name && BINARY_EXT.test(name)) return true;
  const len = Math.min(buf.length, 8000);
  for (let k = 0; k < len; k++) if (buf[k] === 0) return true;
  return false;
}

/**
 * The binary check over the project's tracked files and its untracked, not-ignored ones (they are
 * about to be committed). Read-only git (`ls-files`).
 * @returns {{findings: {file: string}[], files: number, error: (string|null)}}
 */
function binaryCheck(opts) {
  const root = (opts && opts.root) || ROOT;
  let listed;
  try {
    const run = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean);
    listed = Array.from(new Set(run(['ls-files', '-z']).concat(run(['ls-files', '-z', '--others', '--exclude-standard']))));
  } catch (e) {
    return { findings: [], files: 0, error: 'git ls-files failed (' + e.message.split('\n')[0] + ')' };
  }
  const findings = [];
  for (const rel of listed) {
    let buf;
    try { buf = fs.readFileSync(path.join(root, rel)); } catch (e) { continue; }
    if (isBinary(buf, rel)) findings.push({ file: rel });
  }
  return { findings, files: listed.length, error: null };
}

// ------------------------------------------------------------------------------------------------
// Self-test: plants one of each finding in a temp tree.

function selftest(opts) {
  const { suite } = require(path.join(ROOT, 'tests', 'node', 'load.cjs'));
  const T = suite('tools/shingles.cjs --selftest');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-shingles-'));
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), text); };
  try {
    T.section('lexer');
    const s = strings("var a = 'one' + 'two', b = \"x\" + n + 'y'; /* 'no' */ // 'no'\nvar r = /'q'/g, t = `t ${f('z')} u`; c = d / e / 'f';");
    T.eq(s.map((x) => x.text), ['onetwo', 'x # y', 't  #  u', 'f'], 'string runs: concatenation, the # wildcard, comments, regex and template literals');
    T.eq(words("Don't PANIC: it's only {n} dollars & <b>cents</b>!"), ['dont', 'panic', 'its', 'only', '#', 'dollars', 'cents'], 'words: case, apostrophes, placeholders, markup and punctuation');

    T.section('banned strings (one plant per list)');
    const nf = (term) => term.split('').join('');    // plants are assembled here, never scanned
    put('js/plant-sub.js', "var s = 'Read the " + nf('STICK') + nf('NEWS') + " daily';\n");
    put('js/plant-word.js', "var s = 'Greetings from " + nf('Brook') + nf('lyn') + ", and from " + nf('Brook') + "lynite too';\n");
    put('js/plant-upper.js', "var s = 'A " + nf('GEN') + nf('IUS') + " move';\nvar t = 'a " + nf('gen') + nf('ius') + " move';\n");
    put('js/plant-only.js', "var s = 'Thanks to " + nf('XG') + "en';\n");
    put('js/data/text/en-ui.js', "SR.def.text({ 'ui.fanNote': 'Fan remaster. Not affiliated with or endorsed by " + nf('XG') + "en Studios.', 'ui.other': '" + nf('XG') + "en' });\n");
    put('README.md', 'A fan remaster; ' + nf('XG') + 'en made the original.\n');
    put('js/clean.js', "var s = 'An ordinary genius of a sentence about Brooklynite paper.';\n");
    const b = bannedCheck({ root: tmp });
    const by = (file) => b.findings.filter((f) => f.file === file).map((f) => f.list + ':' + f.line);
    T.eq(by('js/plant-sub.js'), ['substring:1'], 'a case-insensitive substring is found');
    T.eq(by('js/plant-word.js'), ['word:1'], 'a whole word is found, and not inside a longer word');
    T.eq(by('js/plant-upper.js'), ['upper:1'], 'an upper-case word is found, its lower-case prose is not');
    T.eq(by('js/plant-only.js'), ['only-in ui.fanNote, README.md:1'], 'an [only-in] term outside its places is found');
    T.eq(by('js/data/text/en-ui.js').length, 1, 'an [only-in] term is allowed in its text key and nowhere else in that file');
    T.eq(by('README.md'), [], 'an [only-in] term is allowed in its file');
    T.eq(by('js/clean.js'), [], 'a clean file passes');
    const real = bannedCheck({ root: ROOT, files: [] });
    T.ok(real.lists.substring.length >= 60 && real.lists.word.length === 12 && real.lists.upper.length === 2 && real.lists.onlyIn.length === 1,
      'tools/banned.txt holds Appendix A (' + real.lists.substring.length + ' substrings, 12 words, 2 upper, 1 only-in)');

    T.section('shingles');
    const ref = opts.ref || path.resolve(ROOT, '..', 'stick-rpg', 'js');
    if (!fs.existsSync(ref)) {
      T.ok(false, 'the recreation exists at ' + ref);
    } else {
      const index = refIndex(ref);
      T.ok(index.size > 1000, 'the recreation yields ' + index.size + ' shingles');
      // a real run of 10+ plain words from the recreation, re-cased and re-punctuated
      let pick = null;
      for (const rel of walk(ref, '.', ['.js'])) {
        for (const run of strings(fs.readFileSync(path.join(ref, rel), 'utf8'))) {
          const w = words(run.text);
          if (w.length >= 10 && w.slice(0, 10).every((x) => x !== '#' && /^[a-z]+$/.test(x))) { pick = w.slice(0, 10); break; }
        }
        if (pick) break;
      }
      T.ok(!!pick, 'found a 10-word run in the recreation to plant');
      if (pick) {
        const planted = pick.map((x, k) => (k % 3 === 0 ? x.toUpperCase() : x)).join(' ... ');
        put('js/data/text/en-plant.js', "SR.def.text({ 'x.plant': 'So, " + planted.replace(/'/g, '') + "!' });\n");
        put('js/data/text/en-split.js', "var s = '" + pick.slice(0, 5).join(' ') + " ' + '" + pick.slice(5).join(' ') + "';\n");
        put('js/data/text/en-fresh.js', "SR.def.text({ 'x.fresh': 'A folded paper crane drifts over the sky island at noon today.' });\n");
        const r = shingleCheck({ root: tmp, ref, index, paths: ['js'] });
        const hit = (file) => r.findings.filter((f) => f.file === file);
        T.eq(hit('js/data/text/en-plant.js').length, 1, 'a planted 8-word run (other case and punctuation) is found');
        T.ok(hit('js/data/text/en-plant.js').length && hit('js/data/text/en-plant.js')[0].text.split(' ').length >= 10, 'the report shows the whole shared span');
        T.eq(hit('js/data/text/en-split.js').length, 1, 'a run split over two concatenated literals is found');
        T.eq(hit('js/data/text/en-fresh.js'), [], 'a fresh sentence passes');
      }
    }

    T.section('binary files');
    T.ok(isBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1]), 'x.dat'), 'a NUL byte marks a binary file');
    T.ok(isBinary(Buffer.from('abc'), 'art/logo.png'), 'a binary extension marks a binary file');
    T.ok(!isBinary(Buffer.from('// text\n'), 'js/a.js'), 'a text file passes');
    const bin = binaryCheck({ root: ROOT });
    T.ok(bin.error === null && bin.files > 50, 'git ls-files lists the project (' + bin.files + ' files)', bin.error);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return T.done();
}

// ------------------------------------------------------------------------------------------------
// CLI

function main(argv) {
  const has = (f) => argv.includes(f);
  const val = (f) => { const k = argv.indexOf(f); return k >= 0 ? argv[k + 1] : undefined; };
  const root = val('--root') ? path.resolve(val('--root')) : ROOT;
  const ref = val('--ref') ? path.resolve(val('--ref')) : path.resolve(root, '..', 'stick-rpg', 'js');
  if (has('--selftest')) { selftest({ ref }); return; }
  const paths = val('--paths') ? val('--paths').split(',').map((s) => s.trim()).filter(Boolean) : null;
  const quiet = has('--quiet');
  const only = ['--shingles', '--banned', '--binary'].filter(has);
  const run = (name) => !only.length || only.includes('--' + name);
  let failed = 0;
  const t0 = Date.now();
  if (run('banned')) {
    const b = bannedCheck({ root, paths });
    for (const f of b.findings) console.log('BANNED ' + f.file + ':' + f.line + ' "' + f.term + '" [' + f.list + ']');
    console.log('banned strings: ' + b.findings.length + ' found in ' + b.files + ' files');
    failed += b.findings.length;
  }
  if (run('shingles')) {
    const s = shingleCheck({ root, ref, paths });
    if (s.missingRef) { console.log('SHINGLES the recreation was not found at ' + ref + ' (--ref <dir>)'); failed++; }
    for (const f of s.findings) console.log('SHINGLE ' + f.file + ':' + f.line + ' shares "' + f.text + '" with the recreation (' + f.ref + ')');
    if (!s.missingRef) console.log('shingles: ' + s.findings.length + ' shared runs in ' + s.files + ' files (' + s.refShingles + ' reference shingles)');
    failed += s.findings.length;
  }
  if (run('binary')) {
    const b = binaryCheck({ root });
    if (b.error) { console.log('BINARY ' + b.error); failed++; }
    for (const f of b.findings) console.log('BINARY ' + f.file + ' is a binary file');
    if (!b.error) console.log('binary files: ' + b.findings.length + ' among ' + b.files + ' tracked or untracked files');
    failed += b.findings.length;
  }
  if (!quiet) console.log('tools/shingles.cjs: ' + (failed ? 'FAIL' : 'ok') + ' (' + (Date.now() - t0) + ' ms)');
  process.exitCode = failed ? 1 : 0;
}

module.exports = { lex, strings, words, walk, isProse, textsOf, refIndex, shingleCheck, parseBanned, bannedCheck, isBinary, binaryCheck, RUN, MIN_REAL };

if (require.main === module) main(process.argv.slice(2));
