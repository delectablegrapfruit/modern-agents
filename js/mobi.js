/* Kindle (MOBI / KF8 / AZW3) → EPUB converter.
 * Parses the PalmDB container, MOBI + EXTH headers, INDX/TAGX/CNCX indexes (SKEL, FRAG, NCX, guide), FDST flows,
 * PalmDOC and HUFF/CDIC compression, then repackages the book as an EPUB 3 blob that the rest of the app reads
 * like any other EPUB. Hybrid files use their KF8 half; old TEXtREAd files become plain-text chapters.
 * Runs in the browser (DOMParser/XMLSerializer) and, for tests, under Node with a DOM shim. */
(function (global) {
  'use strict';

  const MAX = 0xffffffff;
  const rd32 = (a, o) => ((a[o] << 24) | (a[o + 1] << 16) | (a[o + 2] << 8) | a[o + 3]) >>> 0;
  const rd16 = (a, o) => (a[o] << 8) | a[o + 1];
  const ascii = (a, o, l) => { let s = ''; for (let i = o; i < o + l && i < a.length; i++) s += String.fromCharCode(a[i]); return s; };
  const concat = parts => { let n = 0; for (const p of parts) n += p.length; const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
  const xml = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const te = new TextEncoder();
  const decoderFor = enc => { try { return new TextDecoder(enc === 1252 ? 'windows-1252' : enc === 65001 ? 'utf-8' : 'utf-8'); } catch (e) { return new TextDecoder(); } };
  const unescapeEntities = s => String(s || '').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ');

  /* Variable-length integers (7 bits per byte, high bit marks the last byte). */
  function varlen(a, i) { let value = 0, length = 0; for (let k = i; k < i + 4 && k < a.length; k++) { const b = a[k]; value = ((value << 7) | (b & 0x7f)) >>> 0; length++; if (b & 0x80) break; } return { value, length }; }
  function varlenFromEnd(a) { let value = 0; for (let k = Math.max(0, a.length - 4); k < a.length; k++) { const b = a[k]; if (b & 0x80) value = 0; value = ((value << 7) | (b & 0x7f)) >>> 0; } return value; }
  const bitCount = x => { let c = 0; for (; x > 0; x >>>= 1) if (x & 1) c++; return c; };
  const trailingZeros = x => { let c = 0; while (x && (x & 1) === 0) { x >>>= 1; c++; } return c; };

  /* ------------------------------------------------------------------ PalmDB container */
  function parsePDB(data) {
    if (data.length < 78) throw new Error('Not a Kindle file.');
    const name = ascii(data, 0, 32).replace(/\0.*$/, '');
    const type = ascii(data, 60, 4), creator = ascii(data, 64, 4);
    const n = rd16(data, 76);
    const offsets = [];
    for (let i = 0; i < n; i++) offsets.push(rd32(data, 78 + i * 8));
    const records = offsets.map((start, i) => ({ start, end: i + 1 < n ? offsets[i + 1] : data.length }));
    return { name, type, creator, numRecords: n, record: i => { const r = records[i]; if (!r || r.start > r.end || r.end > data.length) throw new RangeError('Record ' + i + ' out of bounds'); return data.subarray(r.start, r.end); } };
  }

  /* ------------------------------------------------------------------ headers */
  const MOBI_LANG = { 1: 'ar', 2: 'bg', 3: 'ca', 4: 'zh', 5: 'cs', 6: 'da', 7: 'de', 8: 'el', 9: 'en', 10: 'es', 11: 'fi', 12: 'fr', 13: 'he', 14: 'hu', 15: 'is', 16: 'it', 17: 'ja', 18: 'ko', 19: 'nl', 20: 'no', 21: 'pl', 22: 'pt', 23: 'rm', 24: 'ro', 25: 'ru', 26: 'hr', 27: 'sk', 28: 'sq', 29: 'sv', 30: 'th', 31: 'tr', 32: 'ur', 33: 'id', 34: 'uk', 35: 'be', 36: 'sl', 37: 'et', 38: 'lv', 39: 'lt', 41: 'fa', 42: 'vi', 43: 'hy', 44: 'az', 45: 'eu', 47: 'mk', 54: 'af', 55: 'ka', 56: 'fo', 57: 'hi', 58: 'mt', 62: 'ms', 63: 'kk', 65: 'sw', 69: 'bn', 70: 'pa', 71: 'gu', 72: 'or', 73: 'ta', 74: 'te', 75: 'kn', 76: 'ml', 78: 'mr', 82: 'cy', 83: 'gl', 97: 'ne' };

  function parseHeaders(rec) {
    const palmdoc = { compression: rd16(rec, 0), textLength: rd32(rec, 4), numTextRecords: rd16(rec, 8), recordSize: rd16(rec, 10), encryption: rd16(rec, 12) };
    if (ascii(rec, 16, 4) !== 'MOBI') return { palmdoc, mobi: null, exth: {}, kf8: null };
    const length = rd32(rec, 20);
    const at = (off, fallback) => (16 + off + 4 <= 16 + length && off + 4 <= rec.length ? rd32(rec, off) : fallback);
    const mobi = {
      length, type: at(24, 2), encoding: at(28, 65001), uid: at(32, 0), version: at(36, 6),
      titleOffset: at(84, 0), titleLength: at(88, 0), locale: at(92, 0),
      resourceStart: at(108, MAX), huffcdic: at(112, MAX), numHuffcdic: at(116, 0), exthFlag: at(128, 0),
      trailingFlags: length >= 0xe4 ? at(240, 0) : 0, indx: length >= 0xe8 ? at(244, MAX) : MAX,
    };
    mobi.language = MOBI_LANG[mobi.locale & 0xff] || 'en';
    const kf8 = mobi.version >= 8 ? { fdst: at(192, MAX), numFdst: at(196, 0), frag: at(248, MAX), skel: at(252, MAX), guide: at(260, MAX) } : null;
    const dec = decoderFor(mobi.encoding);
    mobi.title = mobi.titleLength && mobi.titleOffset + mobi.titleLength <= rec.length ? dec.decode(rec.subarray(mobi.titleOffset, mobi.titleOffset + mobi.titleLength)) : '';
    let exth = {};
    if (mobi.exthFlag & 0x40) {
      const e = rec.subarray(16 + length);
      if (ascii(e, 0, 4) === 'EXTH') {
        const count = rd32(e, 8); let o = 12;
        for (let i = 0; i < count && o + 8 <= e.length; i++) {
          const t = rd32(e, o), l = rd32(e, o + 4); if (l < 8) break;
          const body = e.subarray(o + 8, o + l);
          (exth[t] = exth[t] || []).push(body);
          o += l;
        }
      }
    }
    const str = t => exth[t] ? exth[t].map(b => dec.decode(b).replace(/\0+$/, '')) : [];
    const num = t => exth[t] && exth[t][0] && exth[t][0].length >= 4 ? rd32(exth[t][0], 0) : null;
    const meta = {
      title: str(503)[0] || mobi.title, creators: str(100), publisher: str(101)[0], description: str(103)[0], isbn: str(104)[0],
      subjects: str(105), date: str(106)[0], rights: str(109)[0], asin: str(113)[0], language: str(524)[0] || mobi.language,
      boundary: num(121), coverOffset: num(201), thumbOffset: num(202), coverURI: str(129)[0], fixedLayout: str(122)[0], cdeType: str(501)[0],
    };
    return { palmdoc, mobi, exth, meta, kf8 };
  }

  /* ------------------------------------------------------------------ decompression */
  function decompressPalmDOC(a) {
    const out = new Uint8Array(a.length * 8 + 16); let n = 0;
    for (let i = 0; i < a.length; i++) {
      const b = a[i];
      if (b === 0) out[n++] = 0;
      else if (b <= 8) { for (let k = 0; k < b && i + 1 + k < a.length; k++) out[n++] = a[i + 1 + k]; i += b; }
      else if (b <= 0x7f) out[n++] = b;
      else if (b <= 0xbf) {
        const pair = (b << 8) | a[++i];
        const distance = (pair & 0x3fff) >>> 3, length = (pair & 7) + 3;
        for (let k = 0; k < length; k++) { out[n] = out[n - distance]; n++; }
      } else { out[n++] = 32; out[n++] = b ^ 0x80; }
      if (n > out.length - 16) return out.subarray(0, n); // defensive: never overrun
    }
    return out.subarray(0, n);
  }

  function makeHuffCdic(pdb, base, huffIndex, numHuff) {
    const huff = pdb.record(base + huffIndex);
    if (ascii(huff, 0, 4) !== 'HUFF') throw new Error('Invalid HUFF record');
    const off1 = rd32(huff, 8), off2 = rd32(huff, 12);
    const table1 = []; for (let i = 0; i < 256; i++) { const x = rd32(huff, off1 + i * 4); table1.push([x & 0x80, x & 0x1f, x >>> 8]); }
    const table2 = [null]; for (let i = 0; i < 32; i++) table2.push([rd32(huff, off2 + i * 8), rd32(huff, off2 + i * 8 + 4)]);
    const dict = [];
    for (let i = 1; i < numHuff; i++) {
      const rec = pdb.record(base + huffIndex + i);
      if (ascii(rec, 0, 4) !== 'CDIC') throw new Error('Invalid CDIC record');
      const hlen = rd32(rec, 4), numEntries = rd32(rec, 8), codeLength = rd32(rec, 12);
      const n = Math.min(1 << codeLength, numEntries - dict.length);
      const buf = rec.subarray(hlen);
      for (let k = 0; k < n; k++) {
        const o = rd16(buf, k * 2), x = rd16(buf, o);
        dict.push([buf.slice(o + 2, o + 2 + (x & 0x7fff)), !!(x & 0x8000)]);
      }
    }
    const read32 = (a, from) => { // 32 bits starting at bit `from`, as a Number
      const startByte = from >>> 3, end = from + 32, endByte = end >>> 3;
      let v = 0; for (let i = startByte; i <= endByte; i++) v = v * 256 + (a[i] || 0);
      return Math.floor(v / Math.pow(2, 8 - (end & 7))) % 4294967296;
    };
    const decompress = a => {
      const parts = []; const bitLength = a.length * 8;
      for (let i = 0; i < bitLength;) {
        const bits = read32(a, i);
        let [found, codeLength, value] = table1[bits >>> 24];
        if (!found) { while (Math.floor(bits / Math.pow(2, 32 - codeLength)) < table2[codeLength][0]) codeLength++; value = table2[codeLength][1]; }
        if ((i += codeLength) > bitLength) break;
        const code = value - Math.floor(bits / Math.pow(2, 32 - codeLength));
        const entry = dict[code]; if (!entry) break;
        if (!entry[1]) { entry[0] = decompress(entry[0]); entry[1] = true; }
        parts.push(entry[0]);
      }
      return concat(parts);
    };
    return decompress;
  }

  /* ------------------------------------------------------------------ INDX (SKEL / FRAG / NCX / guide) */
  function readIndex(pdb, base, indxIndex) {
    const first = pdb.record(base + indxIndex);
    if (ascii(first, 0, 4) !== 'INDX') throw new Error('Invalid INDX record');
    const hlen = rd32(first, 4), numRecords = rd32(first, 24), encoding = rd32(first, 28), numCncx = rd32(first, 52);
    const dec = decoderFor(encoding);
    const tagx = first.subarray(hlen);
    if (ascii(tagx, 0, 4) !== 'TAGX') throw new Error('Invalid TAGX section');
    const tagxLen = rd32(tagx, 4), numControlBytes = rd32(tagx, 8);
    const tagTable = []; for (let i = 12; i + 4 <= tagxLen; i += 4) tagTable.push([tagx[i], tagx[i + 1], tagx[i + 2], tagx[i + 3]]);
    const cncx = {}; let cncxBase = 0;
    for (let i = 0; i < numCncx; i++) {
      const rec = pdb.record(base + indxIndex + numRecords + 1 + i);
      for (let pos = 0; pos < rec.length;) { const idx = pos; const { value, length } = varlen(rec, pos); pos += length; cncx[cncxBase + idx] = dec.decode(rec.subarray(pos, pos + value)); pos += value; }
      cncxBase += 0x10000;
    }
    const table = [];
    for (let i = 0; i < numRecords; i++) {
      const rec = pdb.record(base + indxIndex + 1 + i);
      if (ascii(rec, 0, 4) !== 'INDX') throw new Error('Invalid INDX record');
      const idxt = rd32(rec, 20), count = rd32(rec, 24);
      for (let j = 0; j < count; j++) {
        const off = rd16(rec, idxt + 4 + 2 * j);
        const nameLen = rec[off]; const name = ascii(rec, off + 1, nameLen);
        const startPos = off + 1 + nameLen; let controlIdx = 0, pos = startPos + numControlBytes;
        const tags = [];
        for (const [tag, numValues, mask, end] of tagTable) {
          if (end & 1) { controlIdx++; continue; }
          const value = rec[startPos + controlIdx] & mask;
          if (value === mask) {
            if (bitCount(mask) > 1) { const v = varlen(rec, pos); tags.push([tag, null, v.value, numValues]); pos += v.length; }
            else tags.push([tag, 1, null, numValues]);
          } else tags.push([tag, value >> trailingZeros(mask), null, numValues]);
        }
        const tagMap = {};
        for (const [tag, valueCount, valueBytes, numValues] of tags) {
          const values = [];
          if (valueCount != null) { for (let k = 0; k < valueCount * numValues; k++) { const v = varlen(rec, pos); values.push(v.value); pos += v.length; } }
          else { let c = 0; while (c < valueBytes) { const v = varlen(rec, pos); values.push(v.value); pos += v.length; c += v.length; } }
          tagMap[tag] = values;
        }
        table.push({ name, tagMap });
      }
    }
    return { table, cncx };
  }

  function readNCX(pdb, base, indxIndex) {
    const { table, cncx } = readIndex(pdb, base, indxIndex);
    const items = table.map(({ tagMap }, index) => ({
      index, offset: tagMap[1] && tagMap[1][0], size: tagMap[2] && tagMap[2][0], label: unescapeEntities(cncx[tagMap[3] && tagMap[3][0]] || ''),
      level: tagMap[4] ? tagMap[4][0] : 0, pos: tagMap[6], parent: tagMap[21] && tagMap[21][0], firstChild: tagMap[22] && tagMap[22][0], children: [],
    }));
    for (const it of items) if (it.parent != null && items[it.parent] && items[it.parent] !== it) items[it.parent].children.push(it);
    return items.filter(it => it.parent == null || !items[it.parent]);
  }

  /* ------------------------------------------------------------------ resources */
  const sniffImage = a => {
    if (a[0] === 0xff && a[1] === 0xd8) return ['image/jpeg', 'jpg'];
    if (a[0] === 0x89 && a[1] === 0x50) return ['image/png', 'png'];
    if (ascii(a, 0, 3) === 'GIF') return ['image/gif', 'gif'];
    if (ascii(a, 0, 2) === 'BM') return ['image/bmp', 'bmp'];
    if (ascii(a, 8, 4) === 'WEBP') return ['image/webp', 'webp'];
    if (/^\s*<(\?xml|svg)/.test(ascii(a, 0, 40))) return ['image/svg+xml', 'svg'];
    return null;
  };
  const sniffFont = a => {
    const m = ascii(a, 0, 4);
    if (m === 'OTTO') return ['font/otf', 'otf'];
    if (m === 'wOFF') return ['font/woff', 'woff'];
    if (m === 'true' || (a[0] === 0 && a[1] === 1 && a[2] === 0 && a[3] === 0)) return ['font/ttf', 'ttf'];
    return null;
  };
  async function inflateZlib(a) {
    if (typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
    const ds = new DecompressionStream('deflate');
    const w = ds.writable.getWriter(); w.write(a); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  async function decodeFont(rec) {
    const flags = rd32(rec, 8), dataStart = rd32(rec, 12), keyLength = rd32(rec, 16), keyStart = rd32(rec, 20);
    let a = rec.slice(dataStart);
    if (flags & 2) { const key = rec.subarray(keyStart, keyStart + keyLength); const n = Math.min(keyLength === 16 ? 1024 : 1040, a.length); for (let i = 0; i < n; i++) a[i] ^= key[i % key.length]; }
    if (flags & 1) { try { a = await inflateZlib(a); } catch (e) { /* keep raw */ } }
    return a;
  }
  const SKIP_MAGIC = new Set(['FLIS', 'FCIS', 'FDST', 'DATP', 'SRCS', 'CMET', 'PAGE', 'RESC', 'BOUN', 'CRES', 'CONT', 'kind', 'INDX', 'HUFF', 'CDIC', 'TAGX', '\xe9\x8e\r\n']);

  /* ------------------------------------------------------------------ DOM helpers (browser or shim) */
  const dom = () => global.MOBI_DOM || { DOMParser: global.DOMParser, XMLSerializer: global.XMLSerializer, document: global.document };
  /** Parse fragment/document HTML (or XHTML) and return a well-formed XHTML document string with the given <head> extras. */
  function toXHTMLDocument(html, { title, styles = [], lang = 'en', isXHTML = false } = {}) {
    const D = dom(); const parser = new D.DOMParser(), ser = new D.XMLSerializer();
    let doc = null;
    if (isXHTML) { try { const x = parser.parseFromString(html, 'application/xhtml+xml'); if (!x.querySelector('parsererror') && x.documentElement && x.documentElement.namespaceURI) doc = x; } catch (e) { doc = null; } }
    if (!doc) doc = parser.parseFromString(html, 'text/html');
    // strip Kindle-only wrappers/attributes that confuse browsers
    for (const el of Array.from(doc.querySelectorAll('guide, reference'))) el.remove();
    const body = doc.body || doc.documentElement;
    const out = parser.parseFromString(`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xml(lang)}"><head><title>${xml(title || '')}</title></head><body/></html>`, 'application/xhtml+xml');
    const head = out.getElementsByTagName('head')[0], outBody = out.getElementsByTagName('body')[0];
    for (const href of styles) { const l = out.createElementNS('http://www.w3.org/1999/xhtml', 'link'); l.setAttribute('rel', 'stylesheet'); l.setAttribute('type', 'text/css'); l.setAttribute('href', href); head.appendChild(l); }
    const srcHead = doc.head || doc.querySelector('head');
    if (srcHead) for (const el of Array.from(srcHead.children)) { const t = el.tagName.toLowerCase(); if (t === 'style' || (t === 'link' && /stylesheet/i.test(el.getAttribute('rel') || ''))) head.appendChild(out.importNode(el, true)); }
    if (body) { for (const attr of Array.from(body.attributes || [])) if (/^(class|style|id|dir)$/.test(attr.name)) outBody.setAttribute(attr.name, attr.value); for (const child of Array.from(body.childNodes)) outBody.appendChild(out.importNode(child, true)); }
    let s = ser.serializeToString(out);
    if (!/^<\?xml/.test(s)) s = '<?xml version="1.0" encoding="UTF-8"?>\n' + s;
    return s;
  }

  /* ------------------------------------------------------------------ the book */
  class KindleBook {
    constructor(data) {
      this.data = data instanceof Uint8Array ? data : new Uint8Array(data);
      this.pdb = parsePDB(this.data);
      this.resources = new Map(); // absolute record index → { name, mime, bytes }
    }
    static isKindle(data) { const a = data instanceof Uint8Array ? data : new Uint8Array(data); const t = ascii(a, 60, 8); return t === 'BOOKMOBI' || t === 'TEXtREAd'; }

    async toEPUB() {
      const { pdb } = this;
      if (pdb.type + pdb.creator === 'TEXtREAd') return this.textReadToEPUB();
      if (pdb.type + pdb.creator !== 'BOOKMOBI') throw new Error('Not a Kindle book.');
      this.base = 0;
      this.h = parseHeaders(pdb.record(0));
      if (!this.h.mobi) throw new Error('Missing MOBI header.');
      this.resourceBase = this.h.mobi.resourceStart < MAX ? this.h.mobi.resourceStart : pdb.numRecords;
      this.firstMeta = this.h.meta;
      if (this.h.palmdoc.encryption) throw new Error('This book is protected by DRM and can’t be opened. Only DRM-free Kindle files are supported.');
      const boundary = this.h.meta.boundary;
      if (this.h.mobi.version < 8 && boundary != null && boundary < MAX && boundary < pdb.numRecords) {
        try { const k = parseHeaders(pdb.record(boundary)); if (k.mobi && k.kf8) { this.h = k; this.base = boundary; } } catch (e) { /* fall back to MOBI7 */ }
      }
      this.meta = Object.assign({}, this.firstMeta, this.h.meta, { title: this.h.meta.title || this.firstMeta.title, creators: this.h.meta.creators.length ? this.h.meta.creators : this.firstMeta.creators });
      if (this.h.palmdoc.encryption) throw new Error('This book is protected by DRM and can’t be opened.');
      this.dec = decoderFor(this.h.mobi.encoding);
      this.setupText();
      this.isKF8 = !!this.h.kf8 && this.h.kf8.skel < MAX && this.h.kf8.frag < MAX;
      return this.isKF8 ? this.kf8ToEPUB() : this.mobi7ToEPUB();
    }

    /* text records */
    setupText() {
      const { palmdoc, mobi } = this.h;
      const c = palmdoc.compression;
      this.decompress = c === 1 ? a => a : c === 2 ? decompressPalmDOC : c === 17480 ? makeHuffCdic(this.pdb, this.base, mobi.huffcdic, mobi.numHuffcdic) : null;
      if (!this.decompress) throw new Error('Unknown compression type ' + c);
      const flags = mobi.trailingFlags, multibyte = flags & 1, numTrailing = bitCount(flags >>> 1);
      this.stripTrailing = a => {
        for (let i = 0; i < numTrailing; i++) { const n = varlenFromEnd(a); a = a.subarray(0, Math.max(0, a.length - n)); }
        if (multibyte && a.length) { const n = (a[a.length - 1] & 3) + 1; a = a.subarray(0, Math.max(0, a.length - n)); }
        return a;
      };
    }
    text(i) { return this.decompress(this.stripTrailing(this.pdb.record(this.base + 1 + i))); }
    fullText() {
      const parts = []; const n = this.h.palmdoc.numTextRecords;
      for (let i = 0; i < n; i++) { try { parts.push(this.text(i)); } catch (e) { break; } }
      return concat(parts);
    }
    /** Absolute resource record (0-based within the resource area). */
    async resource(index) {
      const abs = this.resourceBase + index;
      if (this.resources.has(abs)) return this.resources.get(abs);
      let rec; try { rec = this.pdb.record(abs); } catch (e) { return null; }
      const magic = ascii(rec, 0, 4);
      let entry = null;
      if (magic === 'FONT') { const bytes = await decodeFont(rec); const f = sniffFont(bytes) || ['application/octet-stream', 'bin']; entry = { kind: 'font', mime: f[0], ext: f[1], bytes }; }
      else if (magic === 'VIDE' || magic === 'AUDI') { entry = { kind: 'media', mime: magic === 'VIDE' ? 'video/mp4' : 'audio/mpeg', ext: magic === 'VIDE' ? 'mp4' : 'mp3', bytes: rec.slice(12) }; }
      else if (!SKIP_MAGIC.has(magic)) { const img = sniffImage(rec); if (img) entry = { kind: 'image', mime: img[0], ext: img[1], bytes: rec }; }
      if (entry) { entry.name = `${entry.kind === 'font' ? 'fonts' : 'images'}/res${String(index + 1).padStart(4, '0')}.${entry.ext}`; }
      this.resources.set(abs, entry);
      return entry;
    }

    /* ------------------------------------------------------------ shared packaging */
    async coverEntry() {
      const m = this.meta;
      const candidates = [];
      if (m.coverURI && /kindle:embed:(\w+)/.test(m.coverURI)) candidates.push(parseInt(m.coverURI.match(/kindle:embed:(\w+)/)[1], 32) - 1);
      if (m.coverOffset != null && m.coverOffset < MAX) candidates.push(m.coverOffset);
      if (m.thumbOffset != null && m.thumbOffset < MAX) candidates.push(m.thumbOffset);
      for (const idx of candidates) { const r = await this.resource(idx); if (r && r.kind === 'image') return r; }
      return null;
    }
    packageEPUB({ sections, toc, landmarks, extraFiles, cover, language }) {
      const zw = new Zip.ZipWriter();
      const m = this.meta, lang = language || m.language || 'en';
      const title = (m.title || this.pdb.name || 'Untitled').trim() || 'Untitled';
      const id = m.isbn ? 'urn:isbn:' + m.isbn : m.asin ? 'urn:asin:' + m.asin : 'urn:mobi:' + (this.h.mobi.uid || 0) + ':' + (this.pdb.name || '').replace(/\W+/g, '');
      const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      zw.add('mimetype', 'application/epub+zip');
      zw.add('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
      const manifest = [], spine = [];
      if (cover) {
        zw.add('OEBPS/images/cover.' + cover.ext, cover.bytes);
        manifest.push(`<item id="cover-image" href="images/cover.${cover.ext}" media-type="${cover.mime}" properties="cover-image"/>`);
        zw.add('OEBPS/text/cover.xhtml', `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Cover</title><style>body{margin:0;text-align:center}img{max-width:100%;max-height:100vh}</style></head><body><div epub:type="cover"><img src="../images/cover.${cover.ext}" alt="Cover"/></div></body></html>`);
        manifest.push(`<item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>`); spine.push(`<itemref idref="cover" linear="yes"/>`);
      }
      sections.forEach((s, i) => { zw.add('OEBPS/' + s.file, s.xhtml); manifest.push(`<item id="s${i}" href="${s.file}" media-type="application/xhtml+xml"/>`); spine.push(`<itemref idref="s${i}"/>`); });
      extraFiles.forEach((f, i) => { zw.add('OEBPS/' + f.name, f.bytes); manifest.push(`<item id="r${i}" href="${f.name}" media-type="${f.mime}"/>`); });
      const navList = (items, depth) => items.length ? `<ol>${items.map(it => `<li><a href="${xml(it.href)}">${xml(it.label || 'Untitled')}</a>${it.children && it.children.length && depth < 6 ? navList(it.children, depth + 1) : ''}</li>`).join('')}</ol>` : '';
      let order = 0;
      const ncxList = items => items.map(it => `<navPoint id="np${++order}" playOrder="${order}"><navLabel><text>${xml(it.label || 'Untitled')}</text></navLabel><content src="${xml(it.href)}"/>${it.children && it.children.length ? ncxList(it.children) : ''}</navPoint>`).join('');
      let tocItems = toc && toc.length ? toc : sections.map((s, i) => ({ label: s.title || `Section ${i + 1}`, href: s.file }));
      if (!(toc && toc.length) && tocItems.length > 200) { const step = Math.ceil(tocItems.length / 200); tocItems = tocItems.filter((_, i) => i % step === 0); }
      zw.add('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1>${navList(tocItems, 0)}</nav>${landmarks && landmarks.length ? `<nav epub:type="landmarks" hidden=""><ol>${landmarks.map(l => `<li><a epub:type="${xml(l.type)}" href="${xml(l.href)}">${xml(l.label || l.type)}</a></li>`).join('')}</ol></nav>` : ''}</body></html>`);
      zw.add('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${xml(id)}"/></head><docTitle><text>${xml(title)}</text></docTitle><navMap>${ncxList(tocItems)}</navMap></ncx>`);
      zw.add('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${xml(lang)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="pub-id">${xml(id)}</dc:identifier>
<dc:title>${xml(title)}</dc:title>
${(m.creators.length ? m.creators : ['Unknown Author']).map((c, i) => `<dc:creator id="creator${i}">${xml(c)}</dc:creator>`).join('\n')}
<dc:language>${xml(lang)}</dc:language>
${m.publisher ? `<dc:publisher>${xml(m.publisher)}</dc:publisher>` : ''}
${m.date ? `<dc:date>${xml(m.date)}</dc:date>` : ''}
${m.description ? `<dc:description>${xml(m.description.replace(/<[^>]+>/g, ''))}</dc:description>` : ''}
${m.rights ? `<dc:rights>${xml(m.rights)}</dc:rights>` : ''}
${(m.subjects || []).map(s => `<dc:subject>${xml(s)}</dc:subject>`).join('')}
<dc:source>Converted from Kindle ${this.isKF8 ? 'KF8' : 'MOBI'}</dc:source>
<meta property="dcterms:modified">${modified}</meta>
${cover ? '<meta name="cover" content="cover-image"/>' : ''}
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
${manifest.join('\n')}
</manifest>
<spine toc="ncx">
${spine.join('\n')}
</spine>
${landmarks && landmarks.length ? `<guide>${landmarks.map(l => `<reference type="${xml(l.type)}" title="${xml(l.label || l.type)}" href="${xml(l.href)}"/>`).join('')}</guide>` : ''}
</package>`);
      return zw.toBlob('application/epub+zip');
    }

    /* ------------------------------------------------------------ MOBI 6/7 (HTML 3 with filepos links) */
    async mobi7ToEPUB() {
      const raw = this.fullText();
      // byte-string view keeps offsets stable (filepos values are byte offsets)
      let str = ''; for (let i = 0; i < raw.length; i += 0x8000) str += String.fromCharCode.apply(null, raw.subarray(i, i + 0x8000));
      const breakRe = /<\s*(?:mbp:)?pagebreak[^>]*>/gi;
      const starts = [0]; for (const m of str.matchAll(breakRe)) if (m.index > 0) starts.push(m.index);
      const bounds = starts.map((s, i) => [s, i + 1 < starts.length ? starts[i + 1] : raw.length]).filter(([s, e]) => e > s);
      const fileposSet = new Set(); for (const m of str.matchAll(/filepos=['"]?(\d+)/gi)) fileposSet.add(+m[1]);
      // NCX (some MOBI7 files carry one) → offsets need anchors too
      let ncx = null;
      if (this.h.mobi.indx < MAX) { try { ncx = readNCX(this.pdb, this.base, this.h.mobi.indx); const walk = items => { for (const it of items) { if (it.offset != null) fileposSet.add(it.offset); walk(it.children); } }; walk(ncx); } catch (e) { ncx = null; } }
      const filepos = [...fileposSet].sort((a, b) => a - b);
      const sectionOf = pos => { let idx = bounds.findIndex(([s, e]) => pos >= s && pos < e); if (idx < 0) idx = pos >= raw.length ? bounds.length - 1 : 0; return idx; };
      const fileFor = i => `text/sec${String(i + 1).padStart(3, '0')}.xhtml`;
      const hrefFor = pos => `${fileFor(sectionOf(pos))}#filepos${pos}`;
      const sections = [];
      const imageRefs = new Set();
      for (let i = 0; i < bounds.length; i++) {
        const [s, e] = bounds[i];
        const parts = []; let cursor = s;
        for (const fp of filepos) { if (fp < s || fp >= e) continue; parts.push(raw.subarray(cursor, fp), te.encode(`<a id="filepos${fp}"></a>`)); cursor = fp; }
        parts.push(raw.subarray(cursor, e));
        let html = this.dec.decode(concat(parts)).replace(breakRe, '');
        html = html.replace(/<\/?mbp:[^>]*>/gi, '').replace(/<guide>[\s\S]*?<\/guide>/gi, '').replace(/<(metadata|dc-metadata|x-metadata)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<\/?(metadata|dc-metadata|x-metadata)\b[^>]*>/gi, '');
        html = html.replace(/<a([^>]*?)\sfilepos=['"]?(\d+)['"]?/gi, (m, pre, n) => { n = +n; return `<a${pre} href="${n >= s && n < e ? `#filepos${n}` : '../' + hrefFor(n)}"`; });
        html = html.replace(/<img([^>]*?)\srecindex=['"]?(\d+)['"]?/gi, (m, pre, n) => { imageRefs.add(+n); return `<img${pre} data-recindex="${+n}"`; });
        html = html.replace(/<(video|audio)([^>]*?)\smediarecindex=['"]?(\d+)['"]?/gi, (m, tag, pre, n) => { imageRefs.add(+n); return `<${tag}${pre} data-recindex="${+n}"`; });
        sections.push({ file: fileFor(i), html, title: '' });
      }
      // resources
      const extraFiles = [];
      const recNames = new Map();
      for (const rec of imageRefs) { const r = await this.resource(rec - 1); if (r) { recNames.set(rec, '../' + r.name); if (!extraFiles.includes(r)) extraFiles.push(r); } }
      const cover = await this.coverEntry();
      const styles = ['../styles/mobi.css'];
      extraFiles.push({ name: 'styles/mobi.css', mime: 'text/css', bytes: te.encode(`blockquote { margin: 0 0 0 1em; }\nimg { max-width: 100%; }\np { margin: 0; text-indent: 1.5em; }\n`) });
      for (const sec of sections) {
        sec.html = sec.html.replace(/data-recindex="(\d+)"/g, (m, n) => recNames.has(+n) ? `src="${recNames.get(+n)}"` : 'data-missing="1"');
        sec.xhtml = toXHTMLDocument(sec.html, { title: this.meta.title, styles, lang: this.meta.language });
        const hm = sec.html.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i); if (hm) sec.title = unescapeEntities(hm[1].replace(/<[^>]+>/g, '')).trim();
      }
      // table of contents
      let toc = null;
      if (ncx && ncx.length) { const map = it => ({ label: it.label, href: it.offset != null ? hrefFor(it.offset) : fileFor(0), children: it.children.map(map) }); toc = ncx.map(map); }
      const landmarks = [];
      const guideRe = /<reference\s+([^>]*)>/gi; const first = this.dec.decode(raw.subarray(bounds[0][0], Math.min(bounds[0][1], bounds[0][0] + 16384)));
      for (const m of first.matchAll(guideRe)) {
        const attrs = m[1]; const type = (attrs.match(/type=['"]?([^'"\s>]+)/i) || [])[1]; const ttl = (attrs.match(/title=['"]([^'"]*)['"]/i) || [])[1]; const fp = (attrs.match(/filepos=['"]?(\d+)/i) || [])[1];
        if (type && fp) landmarks.push({ type: type.toLowerCase() === 'text' ? 'bodymatter' : type.toLowerCase(), label: ttl || type, href: hrefFor(+fp) });
      }
      if (!toc) {
        const tocLm = landmarks.find(l => l.type === 'toc');
        if (tocLm) {
          const [file] = tocLm.href.split('#'); const sec = sections.find(s => s.file === file);
          if (sec) { const items = []; for (const m of sec.html.matchAll(/<a[^>]*href="([^"]*filepos\d+)"[^>]*>([\s\S]*?)<\/a>/gi)) { const label = unescapeEntities(m[2].replace(/<[^>]+>/g, '')).trim(); if (label) items.push({ label, href: m[1].startsWith('#') ? file + m[1] : m[1].replace(/^\.\.\//, '') }); } if (items.length) toc = items; }
        }
      }
      if (!toc) toc = sections.filter(s => s.title).map(s => ({ label: s.title, href: s.file }));
      return this.packageEPUB({ sections: sections.map(s => ({ file: s.file, xhtml: s.xhtml, title: s.title })), toc, landmarks, extraFiles, cover });
    }

    /* ------------------------------------------------------------ KF8 (AZW3): skeletons + fragments, flows, kindle: URIs */
    async kf8ToEPUB() {
      const { kf8 } = this.h, pdb = this.pdb, base = this.base;
      const raw = this.fullText();
      let flows = [[0, raw.length]];
      if (kf8.fdst < MAX && kf8.numFdst > 1) { try { const f = pdb.record(base + kf8.fdst); if (ascii(f, 0, 4) === 'FDST') { const n = rd32(f, 8); flows = []; for (let i = 0; i < n; i++) flows.push([rd32(f, 12 + i * 8), rd32(f, 16 + i * 8)]); } } catch (e) { /* single flow */ } }
      const skel = readIndex(pdb, base, kf8.skel).table.map(({ name, tagMap }, index) => ({ index, name, numFrag: tagMap[1][0], offset: tagMap[6][0], length: tagMap[6][1] }));
      const fragData = readIndex(pdb, base, kf8.frag);
      const frags = fragData.table.map(({ name, tagMap }) => ({ insertOffset: parseInt(name, 10), selector: fragData.cncx[tagMap[2][0]], index: tagMap[4][0], offset: tagMap[6][0], length: tagMap[6][1] }));
      const sections = []; let fragCursor = 0;
      for (const sk of skel) {
        const fr = frags.slice(fragCursor, fragCursor + sk.numFrag); fragCursor += sk.numFrag;
        sections.push({ skel: sk, frags: fr, file: `text/part${String(sk.index + 1).padStart(4, '0')}.xhtml` });
      }
      const sectionByFid = new Map(); for (const s of sections) for (const f of s.frags) sectionByFid.set(f.index, s);
      // NCX + guide first so that link targets can get anchors during assembly
      const anchorReq = new Map(); // fid → Set(off)
      const wantAnchor = (fid, off) => { if (!anchorReq.has(fid)) anchorReq.set(fid, new Set()); anchorReq.get(fid).add(off); };
      let ncx = null; if (this.h.mobi.indx < MAX) { try { ncx = readNCX(pdb, base, this.h.mobi.indx); const walk = items => { for (const it of items) { if (it.pos && it.pos.length >= 1) wantAnchor(it.pos[0], it.pos[1] || 0); walk(it.children); } }; walk(ncx); } catch (e) { ncx = null; } }
      let guide = []; if (kf8.guide < MAX) { try { const g = readIndex(pdb, base, kf8.guide); guide = g.table.map(({ name, tagMap }) => ({ type: name, label: g.cncx[tagMap[1] && tagMap[1][0]] || '', fid: (tagMap[6] && tagMap[6][0]) != null ? tagMap[6][0] : (tagMap[3] && tagMap[3][0]), off: (tagMap[6] && tagMap[6][1]) || 0 })).filter(x => x.fid != null); for (const l of guide) wantAnchor(l.fid, l.off); } catch (e) { guide = []; } }
      const posRe = /kindle:pos:fid:(\w+):off:(\w+)/g;
      for (const m of this.dec.decode(raw.subarray(flows[0][0], flows[0][1])).matchAll(posRe)) wantAnchor(parseInt(m[1], 32), parseInt(m[2], 32));
      // anchors: id/name/aid of the element at the offset, else insert one
      const anchorIds = new Map(); // `${fid}:${off}` → id
      const idAt = (fid, off) => anchorIds.get(fid + ':' + off);
      const assembled = [];
      for (const s of sections) {
        let skeleton = raw.slice(s.skel.offset, s.skel.offset + s.skel.length);
        let inserted = 0;
        for (const f of s.frags) {
          let fragRaw = raw.slice(s.skel.offset + s.skel.length + f.offset, s.skel.offset + s.skel.length + f.offset + f.length);
          const req = anchorReq.get(f.index);
          if (req) {
            const inserts = [];
            for (const off of [...req].sort((a, b) => a - b)) {
              const head = this.dec.decode(fragRaw.subarray(Math.min(off, fragRaw.length), Math.min(off + 400, fragRaw.length)));
              const m = head.match(/^\s*<[\w:-]+([^>]*)>/); const attrs = m ? m[1] : '';
              const idm = attrs.match(/\s(?:id|name)\s*=\s*['"]([^'"]*)['"]/i), aidm = attrs.match(/\said\s*=\s*['"]([^'"]*)['"]/i);
              if (idm) anchorIds.set(f.index + ':' + off, idm[1]);
              else if (aidm) anchorIds.set(f.index + ':' + off, 'aid-' + aidm[1]);
              else { const id = `kpos-${f.index}-${off}`; anchorIds.set(f.index + ':' + off, id); inserts.push([Math.min(off, fragRaw.length), id]); }
            }
            if (inserts.length) { const parts = []; let c = 0; for (const [o, id] of inserts) { parts.push(fragRaw.subarray(c, o), te.encode(`<a id="${id}"></a>`)); c = o; } parts.push(fragRaw.subarray(c)); fragRaw = concat(parts); }
          }
          const at = f.insertOffset - s.skel.offset + inserted;
          skeleton = concat([skeleton.subarray(0, at), fragRaw, skeleton.subarray(at)]);
          inserted += fragRaw.length - f.length;
        }
        assembled.push({ section: s, html: this.dec.decode(skeleton) });
      }
      // resources referenced by kindle:embed / kindle:flow
      const extraFiles = []; const flowFiles = new Map(); const embedNames = new Map();
      const embed = async (idStr) => { const idx = parseInt(idStr, 32) - 1; if (embedNames.has(idx)) return embedNames.get(idx); const r = await this.resource(idx); const name = r ? r.name : null; embedNames.set(idx, name); if (r && !extraFiles.includes(r)) extraFiles.push(r); return name; };
      const embedRe = /kindle:embed:(\w+)(?:\?mime=([\w\/+.-]+))?/g;
      const rewriteEmbeds = async (s, prefix) => { const out = []; let last = 0; for (const m of s.matchAll(embedRe)) { const name = await embed(m[1]); out.push(s.slice(last, m.index), name ? prefix + name : 'about:blank#missing-resource'); last = m.index + m[0].length; } out.push(s.slice(last)); return out.join(''); };
      const flowFile = async (idStr, mime) => {
        const idx = parseInt(idStr, 32); if (flowFiles.has(idx)) return flowFiles.get(idx);
        const fl = flows[idx]; if (!fl) return null;
        const isCSS = /css/i.test(mime || ''); const isSVG = /svg/i.test(mime || '');
        let text = this.dec.decode(raw.subarray(fl[0], fl[1]));
        text = await rewriteEmbeds(text, '../');
        const name = isCSS ? `styles/flow${String(idx).padStart(4, '0')}.css` : `images/flow${String(idx).padStart(4, '0')}.${isSVG ? 'svg' : 'txt'}`;
        extraFiles.push({ name, mime: isCSS ? 'text/css' : isSVG ? 'image/svg+xml' : 'text/plain', bytes: te.encode(text) });
        flowFiles.set(idx, name); return name;
      };
      const flowRe = /kindle:flow:(\w+)(?:\?mime=([\w\/+.-]+))?/g;
      const out = [];
      for (const { section, html } of assembled) {
        let s = html;
        const fls = []; s.replace(flowRe, (m, id, mime) => { fls.push([m, id, mime]); return m; });
        for (const [m, id, mime] of fls) { const name = await flowFile(id, mime); s = s.split(m).join(name ? '../' + name : ''); }
        s = await rewriteEmbeds(s, '../');
        s = s.replace(posRe, (m, fidS, offS) => { const fid = parseInt(fidS, 32), off = parseInt(offS, 32); const target = sectionByFid.get(fid); const id = idAt(fid, off); if (!target) return '#'; return (target === section ? '' : '../' + target.file) + (id ? '#' + id : ''); });
        s = s.replace(/\said=(['"])([^'"]*)\1/gi, (m, q, v) => ` data-aid="${v}"`);
        // elements addressed only by aid received ids of the form aid-<value>
        s = s.replace(/<([\w:-]+)([^>]*?)\sdata-aid="([^"]*)"([^>]*)>/g, (m, tag, pre, v, post) => /\sid=/.test(pre + post) ? m : `<${tag}${pre} id="aid-${v}"${post}>`);
        const styles = [];
        out.push({ file: section.file, xhtml: toXHTMLDocument(s, { title: this.meta.title, styles, lang: this.meta.language, isXHTML: true }), title: (s.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i) || []).map(x => unescapeEntities(x.replace(/<[^>]+>/g, '')).trim())[1] || '' });
      }
      const hrefFor = (fid, off) => { const target = sectionByFid.get(fid); if (!target) return out[0] ? out[0].file : 'text/part0001.xhtml'; const id = idAt(fid, off); return target.file + (id ? '#' + id : ''); };
      let toc = null;
      if (ncx && ncx.length) { const map = it => ({ label: it.label, href: it.pos && it.pos.length ? hrefFor(it.pos[0], it.pos[1] || 0) : out[0].file, children: it.children.map(map) }); toc = ncx.map(map); }
      const landmarks = guide.map(l => ({ type: /^text$/i.test(l.type) ? 'bodymatter' : l.type.toLowerCase(), label: unescapeEntities(l.label), href: hrefFor(l.fid, l.off) })).filter(l => l.type !== 'cover' || !this.meta.coverOffset);
      const cover = await this.coverEntry();
      const nonEmpty = out.filter((o, i) => sections[i].frags.length || /<body[^>]*>\s*[^\s<]|<img|<svg|<p|<div/i.test(o.xhtml));
      return this.packageEPUB({ sections: nonEmpty.length ? nonEmpty : out, toc, landmarks, extraFiles, cover });
    }

    /* ------------------------------------------------------------ TEXtREAd (PalmDOC text) */
    textReadToEPUB() {
      const rec0 = this.pdb.record(0);
      const palmdoc = { compression: rd16(rec0, 0), numTextRecords: rd16(rec0, 8), encryption: rd16(rec0, 12) };
      if (palmdoc.encryption) throw new Error('This book is protected by DRM and can’t be opened.');
      const decompress = palmdoc.compression === 2 ? decompressPalmDOC : a => a;
      const parts = []; for (let i = 1; i <= palmdoc.numTextRecords && i < this.pdb.numRecords; i++) parts.push(decompress(this.pdb.record(i)));
      const bytes = concat(parts);
      let text = decoderFor(1252).decode(bytes).replace(/\0/g, '');
      if (/^\s*<(\?xml|!doctype|html|head|body)/i.test(text)) {
        // Some old PalmDOC readers stored Mobipocket HTML: reuse the MOBI 7 path with a synthetic header.
        this.base = 0; this.resourceBase = palmdoc.numTextRecords + 1; this.isKF8 = false;
        this.h = { palmdoc, mobi: { encoding: 1252, uid: 0, indx: MAX, resourceStart: MAX, trailingFlags: 0, version: 0, language: 'en' }, exth: {}, kf8: null, meta: { title: this.pdb.name || 'Untitled', creators: [], subjects: [], language: 'en' } };
        this.meta = this.h.meta; this.dec = decoderFor(1252); this.decompress = decompress; this.stripTrailing = a => a;
        this.fullText = () => bytes;
        return this.mobi7ToEPUB();
      }
      if (!global.EPUB || !EPUB.build) throw new Error('EPUB builder unavailable');
      const title = this.pdb.name || 'Untitled';
      const chapters = global.EPUB.textToChapters ? EPUB.textToChapters(text) : [{ title: '', html: text.split(/\n{2,}/).map(p => `<p>${xml(p)}</p>`).join('') }];
      return EPUB.build({ title, author: '', chapters, language: 'en' });
    }
  }

  global.MOBI = {
    isKindle: KindleBook.isKindle,
    /** ArrayBuffer | Uint8Array → EPUB Blob. Throws a readable error for DRM or unsupported files. */
    async toEPUB(data) { return new KindleBook(data).toEPUB(); },
    _internals: { parsePDB, parseHeaders, decompressPalmDOC, readIndex, readNCX, KindleBook },
  };
})(typeof window !== 'undefined' ? window : globalThis);
