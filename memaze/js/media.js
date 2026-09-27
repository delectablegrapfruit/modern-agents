/* Memaze — the media library: the player sprite, win/lose animations, goal, background and music are files.
 *
 * Where files come from, all merged into one list per slot:
 *   default   built-in placeholders shipped in assets/defaults
 *   folder    media/<slot>/ next to the game, served and watched by serve.py (drop files in with Finder/Explorer)
 *   linked    a folder on disk picked with the File System Access API (Chrome/Edge), rescanned every few seconds
 *   imported  files dropped on or picked in the game's Media screen, kept in IndexedDB (or written to the folder
 *             above when there is one to write to)
 */
(function () {
  'use strict';
  const MZ = window.MZ;

  const SLOTS = ['player', 'background', 'win', 'lose', 'goal', 'music'];
  const SLOT_INFO = {
    player: { label: 'Player', kinds: ['image', 'video'], hint: 'The thing you roll around. Transparent PNG/GIF/WebP/WebM keep their see-through bits.' },
    background: { label: 'Background', kinds: ['image', 'video'], hint: 'Shown behind the maze instead of (or on top of) the RGB pattern.' },
    win: { label: 'Win', kinds: ['image', 'video'], hint: 'Plays full screen when you reach the goal.' },
    lose: { label: 'Lose', kinds: ['image', 'video'], hint: 'Plays full screen when you fall off or run out of time.' },
    goal: { label: 'Goal', kinds: ['image', 'video'], hint: 'What sits on the goal pad.' },
    music: { label: 'Music', kinds: ['audio', 'video'], hint: 'Loops while you play. Several files play as a shuffled playlist.' },
  };
  const EXT = {
    image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'apng', 'svg', 'bmp', 'ico'],
    video: ['mp4', 'm4v', 'webm', 'mov', 'ogv'],
    audio: ['mp3', 'ogg', 'oga', 'opus', 'wav', 'm4a', 'aac', 'flac'],
  };
  function kindOf(name, type) {
    const ext = String(name).split('.').pop().toLowerCase();
    for (const k in EXT) if (EXT[k].includes(ext)) return k;
    if (type) { const t = type.split('/')[0]; if (t === 'image' || t === 'video' || t === 'audio') return t; }
    return null;
  }

  const DEFAULTS = [
    { id: 'default:ball', slot: 'player', name: 'Bubble Ball', kind: 'image', url: 'assets/defaults/player-ball.svg' },
    { id: 'default:pixel', slot: 'player', name: 'Pixel Slime (GIF)', kind: 'image', url: 'assets/defaults/player-pixel.gif', pixel: true },
    { id: 'default:burst', slot: 'win', name: 'You Win!', kind: 'image', url: 'assets/defaults/win-burst.svg' },
    { id: 'default:splat', slot: 'lose', name: 'Oops!', kind: 'image', url: 'assets/defaults/lose-splat.svg' },
    { id: 'default:portal', slot: 'goal', name: 'Portal', kind: 'builtin' },
    { id: 'default:flag', slot: 'goal', name: 'Finish Flag', kind: 'image', url: 'assets/defaults/goal-flag.svg' },
    { id: 'none', slot: 'music', name: 'No music', kind: 'builtin' },
    { id: 'default:synth', slot: 'music', name: 'Synth Loop', kind: 'builtin' },
  ].map((d) => Object.assign({ source: 'default' }, d));

  // ---------- IndexedDB (falls back to memory when storage is blocked) ----------
  const idb = {
    db: null, mem: { media: new Map(), kv: new Map() }, persistent: false,
    open() {
      return new Promise((resolve) => {
        let req;
        try { req = indexedDB.open('memaze', 1); } catch (e) { resolve(false); return; }
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        };
        req.onsuccess = () => { this.db = req.result; this.persistent = true; resolve(true); };
        req.onerror = () => resolve(false);
        req.onblocked = () => resolve(false);
      });
    },
    tx(store, mode, fn) {
      if (!this.db) return Promise.resolve(fn(null, this.mem[store]));
      return new Promise((resolve, reject) => {
        try {
          const t = this.db.transaction(store, mode), s = t.objectStore(store);
          const out = fn(s);
          t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
          t.onerror = () => reject(t.error);
        } catch (e) { reject(e); }
      });
    },
    all(store) {
      if (!this.db) return Promise.resolve(Array.from(this.mem[store].values()));
      return this.tx(store, 'readonly', (s) => s.getAll());
    },
    put(store, val, key) {
      if (!this.db) { this.mem[store].set(key || val.id, val); return Promise.resolve(); }
      return this.tx(store, 'readwrite', (s) => s.put(val, key));
    },
    get(store, key) {
      if (!this.db) return Promise.resolve(this.mem[store].get(key));
      return this.tx(store, 'readonly', (s) => s.get(key));
    },
    del(store, key) {
      if (!this.db) { this.mem[store].delete(key); return Promise.resolve(); }
      return this.tx(store, 'readwrite', (s) => s.delete(key));
    },
  };

  const Media = MZ.emitter({
    SLOTS, SLOT_INFO, EXT, kindOf,
    items: new Map(),
    server: null, // {writable, rev} when serve.py answers
    linked: null, // {handle, name, granted, writable}
    fsaSupported: typeof window.showDirectoryPicker === 'function',
    storage: 'memory',
    _urlCache: new Map(),

    async init() {
      for (const d of DEFAULTS) this.items.set(d.id, d);
      await idb.open();
      this.storage = idb.persistent ? 'browser' : 'memory';
      try {
        for (const rec of await idb.all('media')) this._addImported(rec);
      } catch (e) { /* storage unavailable */ }
      await this.detectServer();
      try {
        const handle = await idb.get('kv', 'linked');
        if (handle && handle.kind === 'directory') {
          this.linked = { handle, name: handle.name, granted: false, writable: false };
          const perm = await handle.queryPermission({ mode: 'readwrite' }).catch(() => 'denied');
          const read = perm === 'granted' ? 'granted' : await handle.queryPermission({ mode: 'read' }).catch(() => 'denied');
          if (read === 'granted') { this.linked.granted = true; this.linked.writable = perm === 'granted'; await this.scanLinked(); }
        }
      } catch (e) { /* no FSA */ }
      this._startWatching();
      this.emit('change');
    },

    async detectServer() {
      if (!/^https?:$/.test(location.protocol)) return;
      try {
        const res = await fetch('api/ping', { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        if (j && j.app === 'memaze') { this.server = { writable: !!j.writable, rev: '', dir: j.mediaDir }; await this.scanServer(); }
      } catch (e) { /* static hosting: no server */ }
    },

    async scanServer() {
      if (!this.server) return false;
      let j;
      try {
        const res = await fetch('api/media', { cache: 'no-store' });
        if (!res.ok) return false;
        j = await res.json();
      } catch (e) { return false; }
      if (j.rev === this.server.rev) return false;
      this.server.rev = j.rev;
      for (const [id, it] of this.items) if (it.source === 'folder') this.items.delete(id);
      for (const slot of SLOTS) {
        for (const f of (j.slots && j.slots[slot]) || []) {
          const id = 'folder:' + slot + '/' + f.name;
          this.items.set(id, { id, slot, name: f.name, kind: f.kind, url: f.url.replace(/^\//, '') + '?v=' + Math.round(f.mtime), source: 'folder', size: f.size, mtime: f.mtime });
        }
      }
      return true;
    },

    async linkFolder() {
      if (!this.fsaSupported) throw new Error('This browser cannot link folders. Use Chrome or Edge, run serve.py, or drop files in instead.');
      const handle = await window.showDirectoryPicker({ id: 'memaze-media', mode: 'readwrite' });
      this.linked = { handle, name: handle.name, granted: true, writable: true };
      try { await idb.put('kv', handle, 'linked'); } catch (e) { /* can't persist the link */ }
      for (const slot of SLOTS) { try { await handle.getDirectoryHandle(slot, { create: true }); } catch (e) { this.linked.writable = false; } }
      await this.scanLinked(true);
      this.emit('change');
    },
    async reconnectFolder() {
      if (!this.linked) return;
      const perm = await this.linked.handle.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
      this.linked.granted = perm === 'granted';
      this.linked.writable = perm === 'granted';
      if (this.linked.granted) { await this.scanLinked(true); this.emit('change'); }
    },
    async unlinkFolder() {
      this.linked = null;
      for (const [id, it] of this.items) if (it.source === 'linked') this.items.delete(id);
      try { await idb.del('kv', 'linked'); } catch (e) { /* ignore */ }
      this.emit('change');
    },

    async scanLinked(force) {
      const L = this.linked;
      if (!L || !L.granted) return false;
      const found = new Map();
      for (const slot of SLOTS) {
        let dir;
        try { dir = await L.handle.getDirectoryHandle(slot); } catch (e) { continue; }
        try {
          for await (const entry of dir.values()) {
            if (entry.kind !== 'file' || entry.name.startsWith('.')) continue;
            const kind = kindOf(entry.name);
            if (!kind) continue;
            const file = await entry.getFile();
            const id = 'linked:' + slot + '/' + entry.name;
            const sig = file.size + ':' + file.lastModified;
            let url = this._urlCache.get(id);
            if (!url || url.sig !== sig) {
              if (url) URL.revokeObjectURL(url.url);
              url = { sig, url: URL.createObjectURL(file) };
              this._urlCache.set(id, url);
            }
            found.set(id, { id, slot, name: entry.name, kind, url: url.url, source: 'linked', size: file.size, mtime: file.lastModified / 1000, sig });
          }
        } catch (e) { L.granted = false; return false; }
      }
      let changed = !!force;
      for (const [id, it] of this.items) {
        if (it.source !== 'linked') continue;
        if (!found.has(id)) { this.items.delete(id); changed = true; const u = this._urlCache.get(id); if (u) URL.revokeObjectURL(u.url); this._urlCache.delete(id); }
      }
      for (const [id, it] of found) {
        const old = this.items.get(id);
        if (!old || old.sig !== it.sig) changed = true;
        this.items.set(id, it);
      }
      return changed;
    },

    _startWatching() {
      const tick = async () => {
        if (document.visibilityState === 'visible') {
          let changed = false;
          if (this.server) changed = (await this.scanServer()) || changed;
          if (this.linked && this.linked.granted) changed = (await this.scanLinked()) || changed;
          if (changed) this.emit('change');
        }
        setTimeout(tick, 2500);
      };
      setTimeout(tick, 2500);
      window.addEventListener('focus', () => this.refresh());
    },
    async refresh() {
      let changed = false;
      if (this.server) changed = (await this.scanServer()) || changed;
      if (this.linked && this.linked.granted) changed = (await this.scanLinked()) || changed;
      if (changed) this.emit('change');
    },

    _addImported(rec) {
      const url = URL.createObjectURL(rec.blob);
      this.items.set(rec.id, { id: rec.id, slot: rec.slot, name: rec.name, kind: rec.kind, url, source: 'imported', size: rec.blob.size, mtime: rec.added / 1000 });
    },

    // Where imported files end up, in order of preference.
    destination() {
      if (this.server && this.server.writable) return 'folder';
      if (this.linked && this.linked.granted && this.linked.writable) return 'linked';
      return this.storage;
    },

    // Import files into a slot. Audio always goes to music. Returns the new items.
    async importFiles(files, slot) {
      const out = [];
      for (const file of files) {
        const kind = kindOf(file.name, file.type);
        if (!kind) { MZ.toast('Skipped ' + file.name + ' (not an image, video or audio file)'); continue; }
        let target = kind === 'audio' ? 'music' : slot;
        if (!SLOT_INFO[target].kinds.includes(kind)) { MZ.toast(SLOT_INFO[target].label + " can't use " + kind + ' files'); continue; }
        const dest = this.destination();
        try {
          if (dest === 'folder') {
            const res = await fetch('api/media/' + target, { method: 'POST', headers: { 'X-Filename': encodeURIComponent(file.name) }, body: file });
            if (!res.ok) throw new Error('upload failed (' + res.status + ')');
            const j = await res.json();
            await this.scanServer();
            const id = 'folder:' + target + '/' + j.item.name;
            if (this.items.get(id)) out.push(this.items.get(id));
          } else if (dest === 'linked') {
            const dir = await this.linked.handle.getDirectoryHandle(target, { create: true });
            let name = file.name, n = 2;
            const exists = async (nm) => { try { await dir.getFileHandle(nm); return true; } catch (e) { return false; } };
            while (await exists(name)) name = file.name.replace(/(\.[^.]*)?$/, ' (' + n++ + ')$1');
            const fh = await dir.getFileHandle(name, { create: true });
            const w = await fh.createWritable();
            await w.write(file);
            await w.close();
            await this.scanLinked();
            const it = this.items.get('linked:' + target + '/' + name);
            if (it) out.push(it);
          } else {
            const rec = { id: 'imported:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), slot: target, name: file.name, kind, blob: file, added: Date.now() };
            try { await idb.put('media', rec); } catch (e) { MZ.toast('Browser storage is full or blocked — ' + file.name + ' is kept until you close the game.'); }
            this._addImported(rec);
            out.push(this.items.get(rec.id));
          }
        } catch (e) {
          MZ.toast('Could not add ' + file.name + ': ' + e.message);
        }
      }
      if (out.length) this.emit('change');
      return out;
    },

    // Dropped folders (any browser): sub-folders named after a slot fill that slot, loose files go to `slot`.
    async importDataTransfer(dt, slot) {
      const jobs = new Map();
      const add = (s, f) => { if (!jobs.has(s)) jobs.set(s, []); jobs.get(s).push(f); };
      const entries = [];
      for (const item of Array.from(dt.items || [])) {
        const en = item.webkitGetAsEntry && item.webkitGetAsEntry();
        if (en) entries.push(en);
      }
      if (!entries.length) { for (const f of Array.from(dt.files || [])) add(slot, f); }
      const fileOf = (en) => new Promise((res) => en.file(res, () => res(null)));
      const readAll = (dir) => new Promise((res) => {
        const rd = dir.createReader(), all = [];
        const next = () => rd.readEntries((batch) => { if (!batch.length) res(all); else { all.push(...batch); next(); } }, () => res(all));
        next();
      });
      const walk = async (en, s, depth) => {
        if (en.isFile) { const f = await fileOf(en); if (f) add(s, f); return; }
        if (depth > 3) return;
        const sub = SLOTS.includes(en.name.toLowerCase()) ? en.name.toLowerCase() : s;
        for (const child of await readAll(en)) await walk(child, sub, depth + 1);
      };
      for (const en of entries) await walk(en, slot, 0);
      const out = [];
      for (const [s, files] of jobs) out.push(...(await this.importFiles(files, s)));
      return out;
    },

    async remove(id) {
      const it = this.items.get(id);
      if (!it || it.source === 'default') return;
      if (it.source === 'folder') {
        const res = await fetch('api/media/' + it.slot + '/' + encodeURIComponent(it.name), { method: 'DELETE' });
        if (!res.ok) { MZ.toast('Could not delete ' + it.name); return; }
        await this.scanServer();
      } else if (it.source === 'linked') {
        try {
          const dir = await this.linked.handle.getDirectoryHandle(it.slot);
          await dir.removeEntry(it.name);
        } catch (e) { MZ.toast('Could not delete ' + it.name + ' (linked folder is read-only?)'); return; }
        await this.scanLinked(true);
      } else {
        try { await idb.del('media', id); } catch (e) { /* ignore */ }
        URL.revokeObjectURL(it.url);
        this.items.delete(id);
      }
      this.emit('change');
    },

    list(slot) {
      const order = { default: 0, folder: 1, linked: 2, imported: 3 };
      return Array.from(this.items.values()).filter((it) => it.slot === slot)
        .sort((a, b) => order[a.source] - order[b.source] || a.name.localeCompare(b.name));
    },
    get(id) { return this.items.get(id) || null; },

    // Resolve a slot's selection ('random', an item id, or null) to an item. Falls back to the slot's first default.
    resolve(slot, sel) {
      const all = this.list(slot);
      if (sel === 'random') {
        const own = all.filter((it) => it.source !== 'default');
        const pool = own.length ? own : all.filter((it) => it.id !== 'none');
        return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
      }
      return this.items.get(sel) || all[0] || null;
    },

    // A live element for an item: <img> (animated GIF/APNG/WebP/SVG animate natively), <video> or <audio>.
    element(item, o) {
      o = o || {};
      if (!item || item.kind === 'builtin') return null;
      let el;
      if (item.kind === 'image') {
        el = new Image();
        el.decoding = 'async';
        el.draggable = false;
        el.alt = '';
        el.src = item.url;
      } else if (item.kind === 'video') {
        el = document.createElement('video');
        el.muted = o.muted !== false;
        el.loop = o.loop !== false;
        el.playsInline = true;
        el.setAttribute('playsinline', '');
        el.preload = 'auto';
        el.src = item.url;
        if (o.autoplay !== false) {
          el.autoplay = true;
          el.play().catch(() => { if (!el.muted) { el.muted = true; el.play().catch(() => {}); } });
        }
      } else if (item.kind === 'audio') {
        el = new Audio(item.url);
        el.loop = !!o.loop;
      }
      if (el) el.className = 'media-el' + (item.pixel ? ' pixelated' : '');
      return el;
    },

    // Animated SVGs and GIFs keep one clock per URL, so showing one again would resume mid-animation. A fresh blob
    // URL restarts it from the first frame. Returns {url, revoke}.
    async freshUrl(item) {
      if (item.kind !== 'image') return { url: item.url, revoke() {} };
      const bump = () => ({ url: item.url + (item.url.includes('?') ? '&' : '?') + 'r=' + Date.now(), revoke() {} });
      if (location.protocol === 'file:' && !/^blob:/.test(item.url)) return bump(); // file:// pages can't fetch
      try {
        let blob = this._blobs.get(item.url);
        if (!blob) {
          const res = await fetch(item.url);
          if (!res.ok) throw new Error(res.status);
          blob = await res.blob();
          if (blob.size < 64 * 1024 * 1024) this._blobs.set(item.url, blob);
        }
        const url = URL.createObjectURL(blob);
        return { url, revoke: () => setTimeout(() => URL.revokeObjectURL(url), 1000) };
      } catch (e) {
        return /^blob:/.test(item.url) ? { url: item.url, revoke() {} } : bump();
      }
    },
    _blobs: new Map(),
  });

  // ---------- chroma key: green-screen videos (and images) made see-through with a tiny WebGL shader ----------
  const VS = 'attribute vec2 p;varying vec2 uv;void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  const FS = [
    'precision mediump float;varying vec2 uv;uniform sampler2D t;uniform vec3 key;uniform float tol;uniform float soft;',
    'vec2 cc(vec3 c){return vec2(-.169*c.r-.331*c.g+.5*c.b,.5*c.r-.419*c.g-.081*c.b);}',
    'void main(){vec4 c=texture2D(t,uv);float d=distance(cc(c.rgb),cc(key));float a=smoothstep(tol,tol+soft,d);',
    'float l=dot(c.rgb,vec3(.299,.587,.114));vec3 rgb=mix(vec3(l),c.rgb,a*.6+.4);gl_FragColor=vec4(rgb*c.a*a,c.a*a);}',
  ].join('');
  function hexRgb(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16) || 0;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  class Chroma {
    constructor(src, opts) {
      this.src = src;
      this.opts = opts;
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'media-el chroma';
      const gl = (this.gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true }));
      if (!gl) { this.failed = true; return; }
      const sh = (type, code) => { const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); return s; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      this.u = { key: gl.getUniformLocation(prog, 'key'), tol: gl.getUniformLocation(prog, 'tol'), soft: gl.getUniformLocation(prog, 'soft') };
      const loop = () => {
        if (this.dead) return;
        this.frame();
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
    frame() {
      const s = this.src, gl = this.gl;
      const w = s.videoWidth || s.naturalWidth, h = s.videoHeight || s.naturalHeight;
      if (!w || !h || (s.readyState !== undefined && s.readyState < 2)) return;
      const k = Math.min(1, 1280 / Math.max(w, h));
      const W = Math.round(w * k), H = Math.round(h * k);
      if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; gl.viewport(0, 0, W, H); }
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s); } catch (e) { return; }
      gl.uniform3fv(this.u.key, hexRgb(this.opts.color));
      gl.uniform1f(this.u.tol, this.opts.tol * 0.5);
      gl.uniform1f(this.u.soft, Math.max(0.005, this.opts.soft * 0.3));
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    destroy() {
      this.dead = true;
      cancelAnimationFrame(this.raf);
      const ext = this.gl && this.gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
  }

  // Mount an item into a host element, replacing what was there. Returns {el, media, destroy}.
  Media.mount = function (host, item, o) {
    o = o || {};
    Media.unmount(host);
    const el = Media.element(item, o);
    if (!el) return null;
    let shown = el, chroma = null;
    if (o.chroma && o.chroma.on) {
      chroma = new Chroma(el, o.chroma);
      if (!chroma.failed) {
        el.classList.add('chroma-src');
        host.appendChild(el);
        shown = chroma.canvas;
      } else chroma = null;
    }
    host.appendChild(shown);
    const m = { el, shown, chroma, item };
    host._mz = m;
    return m;
  };
  Media.unmount = function (host) {
    const m = host._mz;
    if (!m) { host.textContent = ''; return; }
    if (m.chroma) m.chroma.destroy();
    if (m.el.tagName === 'VIDEO' || m.el.tagName === 'AUDIO') { m.el.pause(); m.el.removeAttribute('src'); m.el.load(); }
    host.textContent = '';
    host._mz = null;
  };

  MZ.Media = Media;
})();
