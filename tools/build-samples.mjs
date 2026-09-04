#!/usr/bin/env node
// Builds js/samples.js from public-domain Project Gutenberg texts (GITenberg mirrors on GitHub).
// Usage: node tools/build-samples.mjs   (network required; output is committed so the app itself needs none)
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, '.cache');
mkdirSync(cacheDir, { recursive: true });

const RAW = 'https://raw.githubusercontent.com/GITenberg/';

/** @type {Array<any>} */
const BOOKS = [
  {
    id: 'alice', url: 'Alice-s-Adventures-in-Wonderland_11/master/11-0.txt',
    title: "Alice's Adventures in Wonderland", author: 'Lewis Carroll', year: 1865, language: 'en',
    subjects: ['Fantasy', 'Children’s Literature'],
    description: 'Bored on a riverbank, Alice follows a waistcoated White Rabbit down a hole and tumbles into a world where logic runs backwards: a tea party that never ends, a Cheshire Cat that vanishes into its grin, and a Queen whose favourite sentence is the death sentence. Carroll’s 1865 classic remains the definitive nonsense adventure.',
    heading: /^CHAPTER ([IVX]+)\. (.+)$/, labelPrefix: 'Chapter',
    palette: { bg: '#2d5f8b', fg: '#f4efe6', accent: '#e9c46a' },
  },
  {
    id: 'carol', url: 'A-Christmas-Carol_46/master/46-0.txt',
    title: 'A Christmas Carol', author: 'Charles Dickens', year: 1843, language: 'en',
    subjects: ['Classics', 'Holiday'],
    description: 'On Christmas Eve, the miser Ebenezer Scrooge is visited by the ghost of his old partner Jacob Marley and three spirits who show him the Christmases of his past, present and future. Dickens’ 1843 ghost story of redemption shaped the way the holiday is celebrated to this day.',
    heading: /^STAVE ([IVX]+):\s+(.+)$/, labelPrefix: 'Stave', titleCase: true,
    frontMatter: { title: 'Preface', from: /^PREFACE$/i, skipLine: true },
    palette: { bg: '#7a1f2b', fg: '#f6efe3', accent: '#d9a441' },
  },
  {
    id: 'timemachine', url: 'The-Time-Machine_35/master/35-0.txt',
    title: 'The Time Machine', author: 'H. G. Wells', year: 1895, language: 'en',
    subjects: ['Science Fiction'],
    description: 'An inventor builds a machine that carries him to the year 802,701, where humanity has split into the frail, childlike Eloi and the subterranean Morlocks who feed on them. Wells’ first novel invented the time-travel story and remains a sharp parable about class and progress.',
    heading: /^\s*([IVXL]+|Epilogue)\s*$/, titleOnNextLine: true, labelPrefix: 'Chapter',
    palette: { bg: '#1f3b2d', fg: '#efe9d8', accent: '#c7a24b' },
  },
  {
    id: 'jekyll', url: 'The-Strange-Case-of-Dr.-Jekyll-and-Mr.-Hyde_43/master/43-0.txt',
    title: 'The Strange Case of Dr. Jekyll and Mr. Hyde', author: 'Robert Louis Stevenson', year: 1886, language: 'en',
    subjects: ['Gothic', 'Mystery'],
    description: 'London lawyer Gabriel Utterson investigates the strange bond between his respectable friend Dr. Henry Jekyll and the brutish Edward Hyde. Stevenson’s 1886 novella gave the language its shorthand for a divided self.',
    headingList: [
      'STORY OF THE DOOR', 'SEARCH FOR MR. HYDE', 'DR. JEKYLL WAS QUITE AT EASE', 'THE CAREW MURDER CASE',
      'INCIDENT OF THE LETTER', 'REMARKABLE INCIDENT OF DR. LANYON', 'INCIDENT OF DR. LANYON', 'INCIDENT AT THE WINDOW', 'THE LAST NIGHT',
      "DR. LANYON’S NARRATIVE", "HENRY JEKYLL’S FULL STATEMENT OF THE CASE",
    ], titleCase: true,
    palette: { bg: '#3a2f4b', fg: '#efe8f4', accent: '#c9b458' },
  },
  {
    id: 'gatsby', url: 'The-Great-Gatsby_64317/master/64317-0.txt',
    title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', year: 1925, language: 'en',
    subjects: ['Classics', 'Literary Fiction'],
    description: 'Nick Carraway rents a small house on Long Island next door to the mysterious millionaire Jay Gatsby, whose lavish parties are all staged for one woman across the bay. Fitzgerald’s 1925 novel is the great American story of longing, money and reinvention.',
    heading: /^\s{6,}([IVX]+)\s*$/, labelPrefix: 'Chapter',
    frontMatter: { title: 'Dedication', from: /^\s+Once again\s*$/, verse: true },
    palette: { bg: '#0f2a44', fg: '#f3ecd8', accent: '#d4af37' },
  },
  {
    id: 'frankenstein', url: 'Frankenstein_84/master/84-0.txt',
    title: 'Frankenstein; or, The Modern Prometheus', author: 'Mary Wollstonecraft Shelley', year: 1818, language: 'en',
    subjects: ['Gothic', 'Science Fiction'],
    description: 'Victor Frankenstein, a brilliant young scientist, discovers the secret of animating lifeless matter and creates a being he cannot bear to look upon. Told through letters and confessions, Shelley’s 1818 novel asks who the real monster is.',
    heading: /^(Letter|Chapter) (\d+)$/, labelFromMatch: true,
    palette: { bg: '#2b2b2f', fg: '#ece6da', accent: '#a9c3d6' },
  },
  {
    id: 'sherlock', url: 'The-Adventures-of-Sherlock-Holmes_1661/master/1661.txt',
    title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle', year: 1892, language: 'en',
    subjects: ['Mystery', 'Short Stories'],
    description: 'Twelve cases from 221B Baker Street, from a scandal in Bohemia to the mystery of the copper beeches, narrated by the ever-loyal Dr. Watson. Doyle’s first collection of Holmes stories fixed the template for every detective who followed.',
    heading: /^(?:ADVENTURE )?([IVX]+)\. ([A-Z][A-Z’'\-\. ,]+)$/, titleCase: true, smartQuotes: true, labelPrefix: '',
    palette: { bg: '#4a3423', fg: '#f2e9dc', accent: '#c58f3a' },
  },
];

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'the', 'to', 'with']);
function titleCase(s) {
  const words = s.toLowerCase().split(/\s+/);
  return words.map((w, i) => {
    const m = w.match(/^([\("']*)([a-z’'\.\-]+)(.*)$/);
    if (!m) return w;
    const core = m[2];
    if (i > 0 && i < words.length - 1 && SMALL.has(core)) return m[1] + core + m[3];
    const cap = core.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-');
    return m[1] + cap + m[3];
  }).join(' ').replace(/\bMr\./g, 'Mr.').replace(/\bDr\./g, 'Dr.').replace(/’S\b/g, '’s');
}

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function smartQuotes(s) {
  return s
    .replace(/(^|[\s(\[—-])"/g, '$1“').replace(/"/g, '”')
    .replace(/(^|[\s(\[“—-])'(?=\w)/g, '$1‘').replace(/'/g, '’');
}

function inline(text, opts) {
  let t = esc(text);
  if (opts.smartQuotes) t = smartQuotes(t);
  t = t.replace(/--/g, '—');
  t = t.replace(/_([^_]{1,400}?)_/g, '<em>$1</em>');
  return t;
}

/** Convert a run of plain-text lines to HTML blocks. */
function blocksToHtml(lines, opts) {
  const html = [];
  let block = [];
  const flush = () => {
    if (!block.length) return;
    const indented = block.filter(l => /^\s{2,}\S/.test(l)).length;
    const isVerse = opts.forceVerse || (indented >= Math.max(1, Math.ceil(block.length * 0.6)) && block.length >= 2) || (block.length === 1 && /^\s{4,}\S/.test(block[0]) && block[0].trim().length < 60);
    if (isVerse) {
      const minIndent = Math.min(...block.map(l => (l.match(/^\s*/) || [''])[0].length));
      html.push('<p class="verse">' + block.map(l => inline(l.slice(minIndent).replace(/\s+$/, ''), opts)).join('<br>') + '</p>');
    } else {
      const text = block.map(l => l.trim()).join(' ');
      if (/^[IVXL]+\.$/.test(text) && block.length === 1) html.push('<h3 class="section">' + text + '</h3>');
      else if (/^(THE END\.?|FINIS)$/i.test(text)) html.push('<p class="the-end">' + inline(text, opts) + '</p>');
      else if (/^\* {2,}\* {2,}\*/.test(text) || /^\*\s+\*\s+\*/.test(text)) html.push('<p class="separator">* * *</p>');
      else html.push('<p>' + inline(text, opts) + '</p>');
    }
    block = [];
  };
  for (const line of lines) {
    if (!line.trim()) { flush(); continue; }
    block.push(line);
  }
  flush();
  return html.join('\n');
}

async function fetchText(url, id) {
  const cache = join(cacheDir, id + '.txt');
  if (existsSync(cache)) return readFileSync(cache, 'utf8');
  const res = await fetch(RAW + url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  const text = await res.text();
  writeFileSync(cache, text);
  return text;
}

function build(book, raw) {
  let text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const start = lines.findIndex(l => /^\*\*\* START OF/.test(l));
  let end = lines.findIndex(l => /^\*\*\* END OF/.test(l));
  if (end < 0) end = lines.length;
  // the START marker may wrap onto a second line ending with ***
  let bodyStart = start + 1;
  if (start >= 0 && !/\*\*\*\s*$/.test(lines[start])) bodyStart = start + 2;
  const body = lines.slice(bodyStart, end);

  // locate heading lines
  const isHeading = (line) => {
    if (book.headingList) {
      const t = line.trim().replace(/'/g, '’');
      const idx = book.headingList.indexOf(t);
      return idx >= 0 ? { label: null, title: titleCase(t) } : null;
    }
    const m = line.match(book.heading);
    if (!m) return null;
    if (book.labelFromMatch) return { label: `${m[1]} ${m[2]}`, title: null };
    if (book.titleOnNextLine) {
      const numeral = m[1];
      if (!/^[IVXL]+$/.test(numeral)) return { label: null, title: titleCase(numeral) };
      return { label: `${book.labelPrefix} ${numeral}`, title: '__NEXT__' };
    }
    const label = book.labelPrefix ? `${book.labelPrefix} ${m[1]}` : m[1];
    let title = m[2] ? m[2].trim() : null;
    if (title && book.titleCase) title = titleCase(title);
    return { label, title };
  };
  let marks = [];
  for (let i = 0; i < body.length; i++) {
    const h = isHeading(body[i]);
    if (h) marks.push({ i, ...h });
  }
  // drop table-of-contents runs: consecutive headings fewer than 8 lines apart
  marks = marks.filter((m, k) => {
    const next = marks[k + 1];
    return !(next && next.i - m.i < 8);
  });
  if (!marks.length) throw new Error('No chapters found for ' + book.id);

  const chapters = [];
  // front matter
  if (book.frontMatter) {
    const fmStart = body.findIndex((l, i) => i < marks[0].i && book.frontMatter.from.test(l));
    if (fmStart >= 0) {
      const fmLines = body.slice(fmStart + (book.frontMatter.skipLine ? 1 : 0), marks[0].i);
      const html = blocksToHtml(fmLines, { ...book, forceVerse: !!book.frontMatter.verse });
      if (html.trim()) chapters.push({ label: null, title: book.frontMatter.title, html, frontMatter: true });
    }
  }
  for (let k = 0; k < marks.length; k++) {
    const m = marks[k];
    const to = k + 1 < marks.length ? marks[k + 1].i : body.length;
    let from = m.i + 1;
    let title = m.title;
    let label = m.label;
    if (title === '__NEXT__') {
      while (from < to && !body[from].trim()) from++;
      title = body[from].trim();
      from++;
    }
    // chapters whose heading line is the title itself (Jekyll)
    const html = blocksToHtml(body.slice(from, to), book);
    chapters.push({ label, title, html });
  }
  const words = chapters.reduce((n, c) => n + c.html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length, 0);
  return {
    id: book.id, title: book.title, author: book.author, year: book.year, language: book.language,
    subjects: book.subjects, description: book.description, palette: book.palette,
    publisher: 'Project Gutenberg', source: 'https://www.gutenberg.org/', words,
    chapters,
  };
}

const out = [];
for (const book of BOOKS) {
  const raw = await fetchText(book.url, book.id);
  const built = build(book, raw);
  console.log(`${built.id}: ${built.chapters.length} chapters, ${built.words} words`);
  for (const c of built.chapters) console.log('   -', [c.label, c.title].filter(Boolean).join(': '), `(${c.html.length}b)`);
  out.push(built);
}
const js = '// Generated by tools/build-samples.mjs from Project Gutenberg texts (public domain in the USA).\n' +
  '// Loaded lazily by the app when sample books are (re)installed. Do not edit by hand.\n' +
  'window.SAMPLE_BOOKS = ' + JSON.stringify(out) + ';\n';
writeFileSync(join(here, '..', 'js', 'samples.js'), js);
console.log('wrote js/samples.js', (js.length / 1024).toFixed(0) + ' KB');
