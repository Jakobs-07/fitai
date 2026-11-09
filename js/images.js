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
export async function removeBackground(blob, onProgress) {
  if (!bgModule) bgModule = await import(BG_LIB);
  const fn = bgModule.removeBackground || bgModule.default;
  const config = {
    model: 'isnet_quint8',
    output: { format: 'image/png' },
    progress: (key, current, total) => {
      if (onProgress && total) onProgress(key.startsWith('fetch') ? 'Siunčiamas modelis' : 'Karpoma', current / total);
    },
  };
  let result;
  try {
    result = await fn(blob, config);
  } catch (e) {
    // senesnės/naujesnės versijos gali nepriimti modelio pavadinimo
    delete config.model;
    result = await fn(blob, config);
  }
  return trimTransparent(result);
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
