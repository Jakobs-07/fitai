// Nuotraukų apdorojimas: mažinimas, fono šalinimas, apkarpymas.

async function bitmap(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch (_) {
    return await createImageBitmap(blob);
  }
}

// iPhone Safari turi bendrą drobių atminties ribą ir drobes atlaisvina vėlai – todėl po užkodavimo jas iškart „ištuštinam“.
function freeCanvas(c) { try { c.width = 0; c.height = 0; } catch (_) {} }
function canvasToBlob(canvas, type = 'image/png', quality = 0.9) {
  return new Promise((res) => canvas.toBlob((b) => { freeCanvas(canvas); res(b); }, type, quality));
}

export async function resize(blob, max = 1200, type = 'image/jpeg', quality = 0.88, bg = null) {
  const img = await bitmap(blob);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  img.close?.();
  return canvasToBlob(c, type, quality);
}

// Nukerpa permatomus kraštus, kad rūbas užimtų visą plotą.
export async function trimTransparent(blob, pad = 12) {
  const img = await bitmap(blob);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  img.close?.();
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (data[(y * width + x) * 4 + 3] > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) { freeCanvas(c); return blob; } // viskas permatoma – paliekam kaip yra
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d').drawImage(c, minX, minY, w, h, 0, 0, w, h);
  freeCanvas(c);
  return canvasToBlob(out, 'image/png');
}

// ---- Fono šalinimas atskirame darbininke ----
// Modeliai telefone užima daug atminties ir jos neatiduoda. Todėl jie veikia darbininke,
// kurį uždarome kas kelias nuotraukas (ir keičiant modelį) – taip atmintis atlaisvinama.
const RECYCLE_EVERY = 6;
const IDLE_LIMIT = 120000; // jei darbininkas 2 min. nieko nesako – laikom, kad užstrigo
let worker = null, workerEngine = null, workerUses = 0, reqId = 0, workerBroken = false, workerOk = false;
const waiting = new Map();

export function releaseCutter() {
  if (worker) { try { worker.terminate(); } catch (_) {} }
  worker = null; workerEngine = null; workerUses = 0;
  for (const w of waiting.values()) { clearTimeout(w.timer); w.reject(new Error('Karpymas nutrauktas')); }
  waiting.clear();
}

function getWorker(engine) {
  if (worker && workerEngine !== engine) releaseCutter(); // du modeliai kartu – per daug atminties
  if (!worker) {
    worker = new Worker(new URL('./cutworker.js', import.meta.url), { type: 'module' });
    workerEngine = engine;
    worker.onmessage = ({ data }) => {
      workerOk = true;
      const w = waiting.get(data.id);
      if (!w) return;
      clearTimeout(w.timer);
      if (data.progress) { w.onProgress?.(...data.progress); w.timer = setTimeout(w.stall, IDLE_LIMIT); return; }
      waiting.delete(data.id);
      if (data.error) w.reject(new Error(data.error)); else w.resolve(data);
    };
    worker.onerror = (e) => { e.preventDefault?.(); if (!workerOk) workerBroken = true; releaseCutter(); };
  }
  return worker;
}

function runInWorker(engine, blob, onProgress) {
  const w = getWorker(engine);
  workerUses++;
  const id = ++reqId;
  return new Promise((resolve, reject) => {
    const entry = { resolve, reject, onProgress };
    entry.stall = () => { releaseCutter(); };
    entry.timer = setTimeout(entry.stall, IDLE_LIMIT);
    waiting.set(id, entry);
    w.postMessage({ id, engine, blob });
  });
}

// Jei darbininkai šiame telefone neveikia – tie patys modeliai pagrindiniame lange
async function direct(engine, blob, onProgress) {
  const m = await import('./cutmodels.js');
  return engine === 'rmbg' ? { mask: (await m.rmbgMask(blob, onProgress)) } : { blob: await m.imglyCut(blob, onProgress) };
}

async function cutWith(engine, blob, onProgress) {
  let res;
  if (!workerBroken && typeof Worker !== 'undefined') {
    try {
      res = await runInWorker(engine, blob, onProgress);
    } catch (e) {
      if (!workerBroken) throw e;
      res = null;
    }
  }
  if (!res) {
    const d = await direct(engine, blob, onProgress);
    res = d.mask ? { mask: d.mask.data, w: d.mask.w, h: d.mask.h } : d;
  }
  if (res.blob) return res.blob;
  // kaukę uždedam ant nuotraukos
  const bm = await bitmap(blob);
  const c = document.createElement('canvas');
  c.width = res.w; c.height = res.h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bm, 0, 0, c.width, c.height);
  bm.close?.();
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const mask = res.mask;
  for (let i = 0; i < mask.length; i++) id.data[i * 4 + 3] = mask[i];
  ctx.putImageData(id, 0, 0);
  return canvasToBlob(c, 'image/png');
}

export let lastCutBad = false;

async function finishCut(result) {
  let clean = result;
  cleanCutout.lastQuality = null;
  try { clean = await cleanCutout(result); } catch (e) { console.warn('clean', e); }
  const q = cleanCutout.lastQuality;
  // jei rūbas suskilo į gabalus ar beveik dingo – laikom, kad iškirpti nepavyko
  return { blob: clean, bad: !!q && (q.biggestShare < 0.7 || q.coverage < 0.06) };
}

let rmbgBroken = false;
export async function removeBackground(blob, onProgress) {
  let res = null;
  try {
    if (!rmbgBroken) {
      try {
        res = await finishCut(await cutWith('rmbg', blob, onProgress));
      } catch (e) {
        console.warn('rmbg', e);
        if (!/nutrauktas/.test(e.message)) rmbgBroken = true; // šiame telefone neveikia – naudosim atsarginį
      }
    }
    if (!res || res.bad) {
      try {
        const alt = await finishCut(await cutWith('imgly', blob, onProgress));
        if (!res || !alt.bad) res = alt;
      } catch (e) {
        if (!res) throw e;
      }
    }
  } finally {
    if (workerUses >= RECYCLE_EVERY || workerEngine === 'imgly') releaseCutter();
  }
  lastCutBad = res.bad;
  return trimTransparent(res.blob);
}

// Mažas JPEG su baltu fonu – DI analizei (pigiau ir greičiau).
export async function toDataURLForAI(blob, max = 512) {
  const small = await resize(blob, max, 'image/jpeg', 0.8, '#ffffff');
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(small);
  });
}

export async function toPngForAI(blob, max = 768) {
  return resize(blob, max, 'image/png', 1, '#ffffff');
}

let urlCache = new WeakMap();
const urlBlob = new Map();
export function blobURL(blob) {
  if (!blob) return '';
  let u = urlCache.get(blob);
  if (!u) {
    u = URL.createObjectURL(blob);
    urlCache.set(blob, u);
    urlBlob.set(u, blob);
  }
  return u;
}

// iPhone, pritrūkus atminties, kartais „pamiršta“ nuotraukų nuorodas – vietoj jų rodomi mėlyni klaustukai.
// Tada nuorodą sukuriam iš naujo, o jei ir tai nepadeda – nuotraukas iš naujo perskaitom iš telefono atminties.
export function repairDeadImages(reload) {
  let busy = false;
  document.addEventListener('error', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLImageElement)) return;
    const src = el.getAttribute('src') || '';
    if (!src.startsWith('blob:')) return;
    const b = urlBlob.get(src);
    if (b && !el.dataset.fixed) {
      el.dataset.fixed = '1';
      urlCache.delete(b);
      urlBlob.delete(src);
      el.src = blobURL(b);
      return;
    }
    if (busy) return;
    busy = true;
    urlCache = new WeakMap();
    urlBlob.clear();
    setTimeout(async () => {
      try { await reload(); } catch (err) { console.warn('reload', err); }
      setTimeout(() => { busy = false; }, 15000);
    }, 300);
  }, true);
}

// Pasukti / apversti nuotrauką. op: 'rotL' | 'rotR' | 'flipH'
export async function transformImage(blob, op) {
  const img = await bitmap(blob);
  const rot = op === 'rotL' || op === 'rotR';
  const c = document.createElement('canvas');
  c.width = rot ? img.height : img.width;
  c.height = rot ? img.width : img.height;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  if (op === 'rotR') ctx.rotate(Math.PI / 2);
  if (op === 'rotL') ctx.rotate(-Math.PI / 2);
  if (op === 'flipH') ctx.scale(-1, 1);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  img.close?.();
  const type = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  return canvasToBlob(c, type, 0.9);
}

// Nemokamas automatinis pataisymas: šviesa ir kontrastas pagal ryškumą (spalvų atspalvis nekeičiamas).
export async function autoEnhance(blob, strength = 0.7) {
  const img = await bitmap(blob);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  img.close?.();
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < d.length; i += 16) {
    if (d[i + 3] < 128) continue;
    hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
    n++;
  }
  if (n < 100) { freeCanvas(c); return blob; }
  const pct = (p) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * p) return v; } return 255; };
  const lo = pct(0.01), hi = pct(0.99);
  if (hi - lo < 20) { freeCanvas(c); return blob; } // vienspalvis rūbas – neliečiam
  // Šviesūs rūbai (pilkšvai nufotografuoti) pabaltinami, tamsūs paliekami beveik nepakeisti. Niekada netamsinam.
  const hiT = hi >= 140 ? hi + (240 - hi) * 0.5 : hi * 1.1;
  const gain = Math.min(1.35, (hiT - lo * 0.9) / Math.max(1, hi - lo));
  const curve = new Float32Array(256);
  for (let L = 0; L < 256; L++) {
    const v = Math.max(L, Math.min(250, hiT - (hi - L) * gain));
    curve[L] = L + (v - L) * strength;
  }
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const k = L > 1 ? curve[Math.round(L)] / L : 1;
    d[i] = Math.min(255, d[i] * k);
    d[i + 1] = Math.min(255, d[i + 1] * k);
    d[i + 2] = Math.min(255, d[i + 2] * k);
  }
  ctx.putImageData(id, 0, 0);
  return canvasToBlob(c, blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9);
}

// ---- Iškirpimo valymas: atplaišos (pakabos, siūlai), skylės viduje, dantyti kraštai ----
function minFilter(src, w, h, r) {
  // kvadratinis „erozijos“ filtras (atskirai eilutėms ir stulpeliams)
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      let m = 1;
      for (let k = -r; k <= r && m; k++) { const xx = x + k; if (xx < 0 || xx >= w || !src[o + xx]) m = 0; }
      tmp[o + x] = m;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 1;
      for (let k = -r; k <= r && m; k++) { const yy = y + k; if (yy < 0 || yy >= h || !tmp[yy * w + x]) m = 0; }
      out[y * w + x] = m;
    }
  }
  return out;
}
function maxFilter(src, w, h, r) {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = src[i] ? 0 : 1;
  const e = minFilter(inv, w, h, r);
  for (let i = 0; i < e.length; i++) e[i] = e[i] ? 0 : 1;
  return e;
}
function components(mask, w, h) {
  const lab = new Int32Array(w * h);
  const sizes = [0];
  const stack = [];
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || lab[i]) continue;
    n++;
    let size = 0;
    stack.push(i);
    lab[i] = n;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % w, y = (p - x) / w;
      if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = n; stack.push(p - 1); }
      if (x < w - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = n; stack.push(p + 1); }
      if (y > 0 && mask[p - w] && !lab[p - w]) { lab[p - w] = n; stack.push(p - w); }
      if (y < h - 1 && mask[p + w] && !lab[p + w]) { lab[p + w] = n; stack.push(p + w); }
    }
    sizes.push(size);
  }
  return { lab, sizes };
}

export async function cleanCutout(blob) {
  const img = await bitmap(blob);
  const w = img.width, h = img.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  img.close?.();
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const r = Math.max(2, Math.round(Math.max(w, h) / 400)); // ~3 px 1200 px nuotraukai
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < solid.length; i++) solid[i] = d[i * 4 + 3] > 24 ? 1 : 0;
  // 1) „atidarymas“: nuima plonas linijas (pakabos kabliukas, siūlai)
  const opened = maxFilter(minFilter(solid, w, h, r), w, h, r);
  // 2) paliekam tik didelius gabalus (rūbą), mažas dėmeles išmetam
  const { lab, sizes } = components(opened, w, h);
  const biggest = Math.max(0, ...sizes.slice(1));
  if (!biggest) { freeCanvas(c); return blob; }
  // vidutinis kiekvieno gabalo neperšviečiamumas: blyškios dėmės (popieriaus tekstūra, šešėliai) – ne rūbas
  const asum = new Float64Array(sizes.length);
  for (let i = 0; i < lab.length; i++) if (lab[i]) asum[lab[i]] += d[i * 4 + 3];
  const keepLab = new Uint8Array(sizes.length);
  for (let k = 1; k < sizes.length; k++) keepLab[k] = sizes[k] >= biggest * 0.04 && (sizes[k] === biggest || asum[k] / sizes[k] > 150) ? 1 : 0;
  const keep = new Uint8Array(w * h);
  for (let i = 0; i < keep.length; i++) keep[i] = keepLab[lab[i]];
  // 3) užpildom mažas skyles rūbo viduje (pusiau permatomos vietos), didelius tarpus (tarp rankovės ir šono) paliekam
  const holes = components(keep.map((v) => (v ? 0 : 1)), w, h);
  const border = new Uint8Array(holes.sizes.length);
  for (let x = 0; x < w; x++) { border[holes.lab[x]] = 1; border[holes.lab[(h - 1) * w + x]] = 1; }
  for (let y = 0; y < h; y++) { border[holes.lab[y * w]] = 1; border[holes.lab[y * w + w - 1]] = 1; }
  for (let i = 0; i < keep.length; i++) {
    const L = holes.lab[i];
    if (L && !border[L] && holes.sizes[L] < biggest * 0.015) keep[i] = 1;
  }
  const near = maxFilter(keep, w, h, r + 1); // kraštai lieka
  const core = minFilter(keep, w, h, r + 1); // vidus – visiškai neperšviečiamas
  // atsargiai: trinam tik tai, kas tikrai atplaiša; pusiau permatomų rūbo vietų neliečiam
  let total = 0;
  for (let i = 0; i < keep.length; i++) {
    const a = i * 4 + 3;
    if (!near[i]) { if (solid[i]) d[a] = 0; continue; }
    if (core[i] && d[a] > 60) d[a] = 255;
    else if (d[a] > 215) d[a] = 255;
    if (d[a] > 128) total++;
  }
  cleanCutout.lastQuality = { biggestShare: biggest / Math.max(1, sizes.slice(1).reduce((x, y) => x + y, 0)), coverage: total / (w * h) };
  ctx.putImageData(id, 0, 0);
  return canvasToBlob(c, 'image/png');
}
