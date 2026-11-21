// Fono šalinimo modeliai. Naudojami atskirame „darbininke“ (cutworker.js), kad juos uždarius
// telefonas atgautų visą atmintį. Čia nėra jokio `document` – veikia ir darbininke.
const TF_LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
const BG_LIB = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';

// Stipresnis nemokamas modelis produktams: RMBG-1.4 (~45 MB vieną kartą)
let rmbg = null;
async function loadRMBG(onProgress) {
  if (rmbg) return rmbg;
  const tf = await import(TF_LIB);
  tf.env.allowLocalModels = false;
  const progress_callback = (p) => { if (onProgress && p.status === 'progress' && p.total) onProgress('Siunčiamas modelis', p.loaded / p.total); };
  const model = await tf.AutoModel.from_pretrained('briaai/RMBG-1.4', { config: { model_type: 'custom' }, dtype: 'q8', progress_callback });
  const processor = await tf.AutoProcessor.from_pretrained('briaai/RMBG-1.4', {
    config: {
      do_normalize: true, do_pad: false, do_rescale: true, do_resize: true, image_mean: [0.5, 0.5, 0.5],
      feature_extractor_type: 'ImageFeatureExtractor', image_std: [1, 1, 1], resample: 2, rescale_factor: 0.00392156862745098,
      size: { width: 1024, height: 1024 },
    },
  });
  rmbg = { tf, model, processor };
  return rmbg;
}

// Grąžina kaukę: { data: Uint8Array (0–255, vienas kanalas), w, h }
export async function rmbgMask(blob, onProgress) {
  const { tf, model, processor } = await loadRMBG(onProgress);
  if (onProgress) onProgress('Karpoma', 0.5);
  const image = await tf.RawImage.fromBlob(blob);
  const { pixel_values } = await processor(image);
  const { output } = await model({ input: pixel_values });
  const t = output[0].mul(255).to('uint8');
  const mask = await tf.RawImage.fromTensor(t).resize(image.width, image.height);
  for (const x of [pixel_values, output, t]) { try { x.dispose?.(); } catch (_) {} }
  if (onProgress) onProgress('Karpoma', 1);
  return { data: new Uint8Array(mask.data), w: mask.width, h: mask.height };
}

let bgModule;
let bgWorkingModel = null;
export async function imglyCut(blob, onProgress) {
  if (!bgModule) bgModule = await import(BG_LIB);
  const fn = bgModule.removeBackground || bgModule.default;
  const progress = (key, current, total) => {
    if (onProgress && total) onProgress(key.startsWith('fetch') ? 'Siunčiamas modelis' : 'Karpoma', current / total);
  };
  const models = bgWorkingModel ? [bgWorkingModel] : ['isnet_fp16', 'isnet_quint8'];
  let lastErr;
  for (const model of models) {
    try {
      const result = await fn(blob, { model, output: { format: 'image/png' }, progress });
      bgWorkingModel = model;
      return result;
    } catch (e) {
      console.warn('bg model failed', model, e);
      lastErr = e;
    }
  }
  throw lastErr;
}
