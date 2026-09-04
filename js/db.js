/* IndexedDB persistence: books, original files, annotations, collections, settings and reading statistics. */
(function (global) {
  'use strict';
  const NAME = 'books-offline', VERSION = 1;
  const STORES = {
    books: { keyPath: 'id', indexes: [['addedAt', 'addedAt'], ['lastOpenedAt', 'lastOpenedAt'], ['kind', 'kind']] },
    files: { keyPath: 'id' },
    annotations: { keyPath: 'id', indexes: [['bookId', 'bookId']] },
    collections: { keyPath: 'id' },
    settings: { keyPath: 'key' },
    stats: { keyPath: 'day' },
  };
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(new Error('IndexedDB is not available'));
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, def] of Object.entries(STORES)) {
          if (db.objectStoreNames.contains(name)) continue;
          const store = db.createObjectStore(name, { keyPath: def.keyPath });
          for (const [idx, path] of def.indexes || []) store.createIndex(idx, path);
        }
      };
      req.onsuccess = () => { const db = req.result; db.onversionchange = () => db.close(); resolve(db); };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Database blocked by another tab'));
    });
    return dbPromise;
  }
  const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      let out;
      Promise.resolve(fn(t.objectStore(store), t)).then(v => { out = v; }).catch(reject);
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transaction aborted'));
    });
  }

  const DB = {
    open,
    get: (store, key) => tx(store, 'readonly', s => wrap(s.get(key))),
    getAll: store => tx(store, 'readonly', s => wrap(s.getAll())),
    byIndex: (store, index, value) => tx(store, 'readonly', s => wrap(s.index(index).getAll(value))),
    put: (store, value) => tx(store, 'readwrite', s => wrap(s.put(value))).then(() => value),
    putMany: (store, values) => tx(store, 'readwrite', s => { for (const v of values) s.put(v); }),
    delete: (store, key) => tx(store, 'readwrite', s => wrap(s.delete(key))),
    deleteMany: (store, keys) => tx(store, 'readwrite', s => { for (const k of keys) s.delete(k); }),
    clear: store => tx(store, 'readwrite', s => wrap(s.clear())),
    count: store => tx(store, 'readonly', s => wrap(s.count())),
    async estimate() { try { return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) { return null; } },
    async persist() { try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* ignore */ } return false; },
  };

  /* Settings: write-through cache so the UI can read synchronously. */
  const DEFAULTS = {
    appearance: 'system',          // system | light | dark
    view: 'grid',                  // grid | list
    sort: 'recent',                // recent | title | author
    sidebarCollapsed: false,
    dailyGoalMinutes: 5,           // Books' default daily reading goal
    yearlyGoalBooks: 12,
    homeContinue: true,            // Home sections (see Customize Home)
    homeGoals: true,
    homeStats: true,
    // Reader
    theme: 'original',             // original | quiet | paper | bold | calm | focus
    autoNight: true,
    font: 'original',
    fontSize: 100,                 // percent
    lineHeight: 'normal',          // tight | normal | loose
    textWidth: 'medium',           // narrow | medium | wide | full  (text column width in both layouts)
    justify: false,
    hyphenate: true,
    layout: 'paginated',           // paginated | scroll
    spread: 'auto',                // auto | single | double  (paginated only)
    pageTurn: 'slide',             // slide | none            (paginated only)
    wheelTurnsPages: true,
    wheelSensitivity: 'medium',    // low | medium | high
    wheelInvert: false,
    wheelHorizontal: true,         // horizontal wheel, tilt wheel and ⇧-wheel turn pages
    showPageNumbers: true,
    showChapterProgress: true,
  };
  const Settings = {
    values: { ...DEFAULTS },
    defaults: DEFAULTS,
    async load() {
      try {
        const rows = await DB.getAll('settings');
        for (const r of rows) this.values[r.key] = r.value;
      } catch (e) { console.warn('settings load failed', e); }
      return this.values;
    },
    get(key) { return key in this.values ? this.values[key] : DEFAULTS[key]; },
    set(key, value) {
      this.values[key] = value;
      DB.put('settings', { key, value }).catch(e => console.warn('settings save failed', e));
      global.dispatchEvent(new CustomEvent('settings:change', { detail: { key, value } }));
      return value;
    },
    reset(keys) { for (const k of keys) this.set(k, DEFAULTS[k]); },
  };

  /* Reading statistics: seconds read per day, pages turned, finished books. */
  const Stats = {
    async addSeconds(sec, pages = 0) {
      const day = U.todayKey();
      const row = (await DB.get('stats', day)) || { day, seconds: 0, pages: 0 };
      row.seconds += sec; row.pages += pages;
      await DB.put('stats', row);
      return row;
    },
    async all() { return DB.getAll('stats'); },
    async today() { return (await DB.get('stats', U.todayKey())) || { day: U.todayKey(), seconds: 0, pages: 0 }; },
    /** Consecutive days (ending today or yesterday) that met the daily goal. */
    streak(rows, goalMinutes) {
      const byDay = new Map(rows.map(r => [r.day, r]));
      let streak = 0, offset = 0;
      const met = k => (byDay.get(k)?.seconds || 0) >= goalMinutes * 60;
      if (!met(U.todayKey())) offset = -1; // today not done yet: count from yesterday
      for (let i = offset; i > -3650; i--) { if (met(U.dayOffsetKey(i))) streak++; else break; }
      return streak;
    },
  };

  global.DB = DB; global.Settings = Settings; global.Stats = Stats;
})(window);
