// Nuotraukų apdorojimas: mažinimas, fono šalinimas, apkarpymas.
const BG_LIB = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';

async function bitmap(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch (_) {
    return await createImageBitmap(blob);
  }
}

function canvasToBlob(canvas, type = 'image/png', quality = 0.9) {
  return new Promise((res) => canvas.toBlob(res, type, quality));
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
  if (maxX < 0) return blob; // viskas permatoma – paliekam kaip yra
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
  return canvasToBlob(out, 'image/png');
}

let bgModule;
let bgWorkingModel = null;
export let lastCutBad = false;
export async function removeBackground(blob, onProgress) {
  if (!bgModule) bgModule = await import(BG_LIB);
  const fn = bgModule.removeBackground || bgModule.default;
  const progress = (key, current, total) => {
    if (onProgress && total) onProgress(key.startsWith('fetch') ? 'Siunčiamas modelis' : 'Karpoma', current / total);
  };
  // Pirmiausia tikslesnis modelis; jei telefonui per sunku – mažesnis.
  const models = bgWorkingModel ? [bgWorkingModel] : ['isnet_fp16', 'isnet_quint8'];
  let lastErr;
  for (const model of models) {
    try {
      const result = await fn(blob, { model, output: { format: 'image/png' }, progress });
      bgWorkingModel = model;
      let clean = result;
      cleanCutout.lastQuality = null;
      try { clean = await cleanCutout(result); } catch (e) { console.warn('clean', e); }
      const q = cleanCutout.lastQuality;
      // jei rūbas suskilo į gabalus ar beveik dingo – laikom, kad iškirpti nepavyko
      lastCutBad = !!q && (q.biggestShare < 0.7 || q.coverage < 0.06);
      return trimTransparent(clean);
    } catch (e) {
      console.warn('bg model failed', model, e);
      lastErr = e;
    }
  }
  throw lastErr;
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

const urlCache = new WeakMap();
export function blobURL(blob) {
  if (!blob) return '';
  let u = urlCache.get(blob);
  if (!u) {
    u = URL.createObjectURL(blob);
    urlCache.set(blob, u);
  }
  return u;
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
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < d.length; i += 16) {
    if (d[i + 3] < 128) continue;
    hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
    n++;
  }
  if (n < 100) return blob;
  const pct = (p) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * p) return v; } return 255; };
  const lo = pct(0.01), hi = pct(0.99);
  if (hi - lo < 20) return blob; // vienspalvis rūbas – neliečiam
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
  if (!biggest) return blob;
  const keepLab = new Uint8Array(sizes.length);
  for (let k = 1; k < sizes.length; k++) keepLab[k] = sizes[k] >= biggest * 0.04 ? 1 : 0;
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
