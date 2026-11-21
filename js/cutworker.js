// Fono šalinimo darbininkas. Programėlė jį uždaro kas kelias nuotraukas – taip atlaisvinama modelio atmintis.
import { rmbgMask, imglyCut } from './cutmodels.js';

self.onmessage = async ({ data }) => {
  const { id, engine, blob } = data;
  const onProgress = (label, p) => self.postMessage({ id, progress: [label, p] });
  try {
    if (engine === 'rmbg') {
      const m = await rmbgMask(blob, onProgress);
      self.postMessage({ id, mask: m.data, w: m.w, h: m.h }, [m.data.buffer]);
    } else {
      const out = await imglyCut(blob, onProgress);
      self.postMessage({ id, blob: out });
    }
  } catch (e) {
    self.postMessage({ id, error: String((e && e.message) || e) });
  }
};
