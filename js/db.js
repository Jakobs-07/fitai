// Paprasta IndexedDB saugykla. Viskas lieka telefone.
const DB_NAME = 'fitai';
const DB_VERSION = 1;
const STORES = ['items', 'outfits', 'worn', 'kv'];

let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          db.createObjectStore(s, { keyPath: s === 'kv' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    let result;
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// iPhone Safari kartais sugadina nuotrauką (Blob), kai ji iš naujo įrašoma į IndexedDB.
// Todėl nuotraukas saugome kaip baitus (ArrayBuffer), o nuskaitę paverčiame atgal į Blob.
async function pack(v) {
  if (v instanceof Blob) {
    try {
      return { __bin: await v.arrayBuffer(), type: v.type };
    } catch (e) {
      console.warn('Nuotrauka neperskaitoma', e);
      return { __broken: true };
    }
  }
  if (Array.isArray(v)) return Promise.all(v.map(pack));
  if (v && typeof v === 'object' && !(v instanceof ArrayBuffer) && !ArrayBuffer.isView(v)) {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = await pack(x);
    return o;
  }
  return v;
}
function unpack(v) {
  if (!v || typeof v !== 'object' || v instanceof Blob || v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return v;
  if (v.__bin instanceof ArrayBuffer) return new Blob([v.__bin], { type: v.type || '' });
  if (v.__broken) return null;
  if (Array.isArray(v)) return v.map(unpack);
  const o = {};
  for (const [k, x] of Object.entries(v)) o[k] = unpack(x);
  return o;
}

export const db = {
  all: async (store) => (await tx(store, 'readonly', (s) => s.getAll())).map(unpack),
  get: async (store, id) => unpack(await tx(store, 'readonly', (s) => s.get(id))),
  put: async (store, obj) => {
    const packed = await pack(obj); // būtinai prieš transakciją – ji neturi laukti
    packed.__packed = true;
    return tx(store, 'readwrite', (s) => s.put(packed));
  },
  del: (store, id) => tx(store, 'readwrite', (s) => s.delete(id)),
};

// Seni įrašai (su Blob) perrašomi nauju formatu. Grąžina, kiek nuotraukų nepavyko perskaityti.
export async function migrateBlobs() {
  let broken = 0;
  for (const store of ['items', 'outfits', 'kv']) {
    const raw = await tx(store, 'readonly', (s) => s.getAll());
    for (const rec of raw) {
      if (rec.__packed) continue;
      const packed = await pack(rec);
      broken += JSON.stringify(packed, (k, v) => (v instanceof ArrayBuffer ? 0 : v)).split('"__broken"').length - 1;
      packed.__packed = true;
      await tx(store, 'readwrite', (s) => s.put(packed));
    }
  }
  return broken;
}

export async function getSetting(key, fallback = null) {
  const row = await db.get('kv', key);
  return row ? row.value : fallback;
}
export async function setSetting(key, value) {
  return db.put('kv', { key, value });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (_) {}
  return false;
}

// ---- Atsarginė kopija ----
function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

async function encode(obj) {
  if (obj instanceof Blob) return { __blob: await blobToDataURL(obj) };
  if (Array.isArray(obj)) return Promise.all(obj.map(encode));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = await encode(v);
    return out;
  }
  return obj;
}
async function decode(obj) {
  if (obj && typeof obj === 'object' && typeof obj.__blob === 'string') return (await fetch(obj.__blob)).blob();
  if (Array.isArray(obj)) return Promise.all(obj.map(decode));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = await decode(v);
    return out;
  }
  return obj;
}

export async function exportAll() {
  const data = { app: 'fitai', version: 1, exportedAt: new Date().toISOString() };
  for (const s of STORES) {
    let rows = await db.all(s);
    if (s === 'kv') rows = rows.filter((r) => r.key !== 'apiKey'); // raktas į kopiją nekeliauja
    data[s] = await encode(rows);
  }
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export async function importAll(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'fitai') throw new Error('Tai ne Fitai kopijos failas');
  for (const s of STORES) {
    if (!data[s]) continue;
    const rows = await decode(data[s]);
    for (const row of rows) await db.put(s, row);
  }
}
