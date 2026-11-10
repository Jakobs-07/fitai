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
      return trimTransparent(result);
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
