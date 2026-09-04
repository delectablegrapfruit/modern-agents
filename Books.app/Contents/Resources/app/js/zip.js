/* Minimal ZIP reader/writer. Reading inflates via the browser's DecompressionStream (no third-party code). */
(function (global) {
  'use strict';
  const SIG_EOCD = 0x06054b50, SIG_CEN = 0x02014b50, SIG_LOC = 0x04034b50, SIG_Z64_LOC = 0x07064b50, SIG_Z64_EOCD = 0x06064b50;
  const td = new TextDecoder('utf-8');
  const te = new TextEncoder();

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress ZIP data (DecompressionStream unsupported).');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  class ZipReader {
    constructor(buffer) {
      this.buf = buffer; this.view = new DataView(buffer); this.bytes = new Uint8Array(buffer);
      this.entries = new Map(); this._cache = new Map();
      this._parse();
    }
    static async fromBlob(blob) { return new ZipReader(await blob.arrayBuffer()); }
    _parse() {
      const v = this.view, n = this.buf.byteLength;
      let eocd = -1;
      for (let i = n - 22; i >= Math.max(0, n - 22 - 65557); i--) if (v.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
      if (eocd < 0) throw new Error('Not a ZIP archive');
      let count = v.getUint16(eocd + 10, true), cdSize = v.getUint32(eocd + 12, true), cdOff = v.getUint32(eocd + 16, true);
      if (count === 0xffff || cdOff === 0xffffffff || cdSize === 0xffffffff) {
        const loc = eocd - 20;
        if (loc >= 0 && v.getUint32(loc, true) === SIG_Z64_LOC) {
          const z = Number(v.getBigUint64(loc + 8, true));
          if (v.getUint32(z, true) === SIG_Z64_EOCD) {
            count = Number(v.getBigUint64(z + 32, true)); cdSize = Number(v.getBigUint64(z + 40, true)); cdOff = Number(v.getBigUint64(z + 48, true));
          }
        }
      }
      let p = cdOff;
      for (let i = 0; i < count && p + 46 <= n; i++) {
        if (v.getUint32(p, true) !== SIG_CEN) break;
        const method = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true);
        let csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
        const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
        let offset = v.getUint32(p + 42, true);
        const name = td.decode(this.bytes.subarray(p + 46, p + 46 + nameLen));
        if (csize === 0xffffffff || usize === 0xffffffff || offset === 0xffffffff) {
          let q = p + 46 + nameLen; const end = q + extraLen;
          while (q + 4 <= end) {
            const id = v.getUint16(q, true), sz = v.getUint16(q + 2, true);
            if (id === 1) {
              let r = q + 4;
              if (usize === 0xffffffff) { usize = Number(v.getBigUint64(r, true)); r += 8; }
              if (csize === 0xffffffff) { csize = Number(v.getBigUint64(r, true)); r += 8; }
              if (offset === 0xffffffff) { offset = Number(v.getBigUint64(r, true)); r += 8; }
            }
            q += 4 + sz;
          }
        }
        this.entries.set(name, { name, method, csize, usize, offset, crc, dir: name.endsWith('/') });
        p += 46 + nameLen + extraLen + commentLen;
      }
    }
    has(name) { return this.entries.has(name); }
    names() { return [...this.entries.keys()]; }
    /** Case-insensitive / URL-decoded lookup helper for sloppy EPUBs. */
    find(name) {
      if (this.entries.has(name)) return name;
      let dec = name; try { dec = decodeURIComponent(name); } catch (e) { /* ignore */ }
      if (this.entries.has(dec)) return dec;
      const lower = dec.toLowerCase();
      for (const k of this.entries.keys()) if (k.toLowerCase() === lower) return k;
      return null;
    }
    async read(name) {
      const key = this.find(name);
      if (!key) throw new Error('Missing archive entry: ' + name);
      if (this._cache.has(key)) return this._cache.get(key);
      const e = this.entries.get(key), v = this.view;
      if (v.getUint32(e.offset, true) !== SIG_LOC) throw new Error('Corrupt local header for ' + name);
      const nameLen = v.getUint16(e.offset + 26, true), extraLen = v.getUint16(e.offset + 28, true);
      const start = e.offset + 30 + nameLen + extraLen;
      const raw = this.bytes.subarray(start, start + e.csize);
      let out;
      if (e.method === 0) out = raw;
      else if (e.method === 8) out = await inflateRaw(raw);
      else throw new Error('Unsupported ZIP compression method ' + e.method);
      this._cache.set(key, out);
      return out;
    }
    async text(name) { return td.decode(await this.read(name)); }
    async blob(name, type) { return new Blob([await this.read(name)], { type: type || 'application/octet-stream' }); }
  }

  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function dosDateTime(d) {
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }

  /** STORE-only writer: enough to produce valid EPUBs (mimetype must be first and uncompressed). */
  class ZipWriter {
    constructor() { this.files = []; }
    add(name, data) {
      const bytes = typeof data === 'string' ? te.encode(data) : (data instanceof ArrayBuffer ? new Uint8Array(data) : data);
      this.files.push({ name: te.encode(name), ascii: /^[\x20-\x7e]*$/.test(name), bytes, crc: crc32(bytes) });
      return this;
    }
    toBlob(type) {
      const parts = [], central = [], now = dosDateTime(new Date());
      let offset = 0, cdSize = 0;
      for (const f of this.files) {
        const flags = f.ascii ? 0 : 0x800;
        const h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, SIG_LOC, true); h.setUint16(4, 20, true); h.setUint16(6, flags, true); h.setUint16(8, 0, true);
        h.setUint16(10, now.time, true); h.setUint16(12, now.date, true); h.setUint32(14, f.crc, true);
        h.setUint32(18, f.bytes.length, true); h.setUint32(22, f.bytes.length, true); h.setUint16(26, f.name.length, true); h.setUint16(28, 0, true);
        parts.push(h.buffer, f.name, f.bytes);
        const c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, SIG_CEN, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, flags, true); c.setUint16(10, 0, true);
        c.setUint16(12, now.time, true); c.setUint16(14, now.date, true); c.setUint32(16, f.crc, true);
        c.setUint32(20, f.bytes.length, true); c.setUint32(24, f.bytes.length, true); c.setUint16(28, f.name.length, true);
        c.setUint32(42, offset, true);
        central.push(c.buffer, f.name); cdSize += 46 + f.name.length;
        offset += 30 + f.name.length + f.bytes.length;
      }
      const e = new DataView(new ArrayBuffer(22));
      e.setUint32(0, SIG_EOCD, true); e.setUint16(8, this.files.length, true); e.setUint16(10, this.files.length, true);
      e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
      return new Blob([...parts, ...central, e.buffer], { type: type || 'application/zip' });
    }
  }

  global.Zip = { ZipReader, ZipWriter, crc32, inflateRaw, supported: typeof DecompressionStream !== 'undefined' };
})(window);
