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

export const db = {
  all: (store) => tx(store, 'readonly', (s) => s.getAll()),
  get: (store, id) => tx(store, 'readonly', (s) => s.get(id)),
  put: (store, obj) => tx(store, 'readwrite', (s) => s.put(obj)),
  del: (store, id) => tx(store, 'readwrite', (s) => s.delete(id)),
};

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
