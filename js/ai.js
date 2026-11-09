// OpenAI API: rūbų atpažinimas, outfitų parinkimas, vaizdų generavimas.
import { getSetting } from './db.js';
import { SEASONS, OCCASIONS } from './data.js';
import { toDataURLForAI, toPngForAI } from './images.js';

const API = 'https://api.openai.com/v1';
export const DEFAULT_TEXT_MODEL = 'gpt-5-mini';
export const DEFAULT_IMAGE_MODEL = 'gpt-image-1';

async function key() {
  const k = await getSetting('apiKey');
  if (!k) throw new Error('NO_KEY');
  return k;
}

async function fail(res) {
  let msg = `Klaida ${res.status}`;
  try {
    const j = await res.json();
    if (j.error && j.error.message) msg = j.error.message;
  } catch (_) {}
  if (res.status === 401) msg = 'Neteisingas API raktas. Patikrink nustatymuose.';
  if (res.status === 429) msg = 'Baigėsi kreditas arba per daug užklausų. Patikrink OpenAI sąskaitą.';
  throw new Error(msg);
}

async function chatJSON(messages) {
  const model = (await getSetting('textModel')) || DEFAULT_TEXT_MODEL;
  const res = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await key()}` },
    body: JSON.stringify({ model, messages, response_format: { type: 'json_object' } }),
  });
  if (!res.ok) await fail(res);
  const j = await res.json();
  const text = j.choices?.[0]?.message?.content || '{}';
  return JSON.parse(text);
}

export async function hasKey() {
  return !!(await getSetting('apiKey'));
}

// ---- Rūbo atpažinimas iš nuotraukos ----
export async function tagItem(blob, categories) {
  const img = await toDataURLForAI(blob);
  const catList = categories.map((c) => `${c.id} = ${c.label}`).join('\n');
  const out = await chatJSON([
    {
      role: 'system',
      content:
        'Tu esi mados ekspertė. Atpažink rūbą nuotraukoje. Atsakyk TIK JSON formatu lietuviškai.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            `Kategorijos (naudok id):\n${catList}\n\n` +
            `Grąžink JSON: {"category": id, "name": "trumpas pavadinimas, pvz. Balta lininė palaidinė", ` +
            `"colors": ["pagrindinės spalvos lietuviškai"], "seasons": [iš: ${SEASONS.join(', ')}], ` +
            `"occasions": [iš: ${OCCASIONS.join(', ')}], "warmth": 1-5 (1 labai plonas, 5 labai šiltas), ` +
            `"description": "1 sakinys apie stilių, medžiagą, kirpimą"}`,
        },
        { type: 'image_url', image_url: { url: img, detail: 'low' } },
      ],
    },
  ]);
  if (!categories.some((c) => c.id === out.category)) out.category = null;
  out.seasons = (out.seasons || []).filter((s) => SEASONS.includes(s));
  out.occasions = (out.occasions || []).filter((s) => OCCASIONS.includes(s));
  return out;
}

// ---- Stilistė: parenka outfitą iš spintos ----
export async function styleOutfit({ vibe, items, categories, weather, wearStats, exclude = [] }) {
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const wardrobe = items.map((it) => {
    const c = catById[it.category];
    const ws = wearStats[it.id];
    return {
      id: it.id,
      kategorija: c ? c.label : it.category,
      vieta: c ? c.slot : 'top',
      pavadinimas: it.name,
      spalvos: it.colors,
      sezonai: it.seasons,
      progos: it.occasions,
      silumas: it.warmth,
      aprasas: it.description,
      vilketa_kartu: ws ? ws.count : 0,
      paskutini_karta: ws ? ws.last : null,
    };
  });
  const today = new Date().toISOString().slice(0, 10);
  const out = await chatJSON([
    {
      role: 'system',
      content:
        'Tu esi šilta, žaisminga ir talentinga asmeninė stilistė. Kalbi lietuviškai, draugiškai, su keliais emoji. ' +
        'Sudarai outfitą TIK iš pateiktos spintos rūbų (naudok tikslius id). ' +
        'Taisyklės: arba suknelė (vieta onepiece), arba viršus + apačia; batai jei yra; viršutinis rūbas jei vėsu; ' +
        'pėdkelnės/kojinės jei tinka; 0–3 aksesuarai. Atsižvelk į orus, progą, spalvų derinius. ' +
        'Jei įmanoma, rinkis rečiau vilkėtus rūbus, bet stilius svarbiau. ' +
        'Atsakyk TIK JSON: {"title": "trumpas žaismingas pavadinimas", "itemIds": [...], ' +
        '"explanation": "2–3 sakiniai kodėl šis derinys", "tip": "1 stiliaus patarimas (pvz. kaip susegti, kokį makiažą)"}. ' +
        'Jei spintoje trūksta būtinų rūbų, vis tiek pasiūlyk geriausią įmanomą ir paminėk, ko trūksta.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        noras: vibe || 'Kasdienis, stilingas outfitas šiandienai',
        data: today,
        orai: weather || 'nežinomi',
        nesiulyti_tiksliai_tokio_pat_derinio_kaip: exclude,
        spinta: wardrobe,
      }),
    },
  ]);
  const valid = new Set(items.map((i) => i.id));
  out.itemIds = (out.itemIds || []).filter((id) => valid.has(id));
  if (!out.itemIds.length) throw new Error('Stilistei nepavyko parinkti rūbų. Pabandyk kitaip aprašyti norą.');
  return out;
}

// ---- Vaizdas "ant manekeno" arba "ant manęs" ----
export async function renderOutfit({ items, categories, mode, selfPhoto }) {
  const model = (await getSetting('imageModel')) || DEFAULT_IMAGE_MODEL;
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const fd = new FormData();
  fd.append('model', model);
  let idx = 1;
  let prompt;
  const list = [];
  if (mode === 'me') {
    if (!selfPhoto) throw new Error('NO_SELF');
    fd.append('image[]', await toPngForAI(selfPhoto, 1024), 'person.png');
    idx = 2;
  }
  for (const it of items.slice(0, mode === 'me' ? 9 : 10)) {
    fd.append('image[]', await toPngForAI(it.image, 768), `item${idx}.png`);
    const c = catById[it.category];
    list.push(`Image ${idx}: ${it.name || ''} (${c ? c.label : ''})`);
    idx++;
  }
  if (mode === 'me') {
    prompt =
      'Fashion photo. Show the woman from image 1 wearing EXACTLY the clothing items from the other images, ' +
      'combined as one outfit. Keep her face, hair, body shape and skin tone identical to image 1. ' +
      'Reproduce every garment faithfully: same color, pattern, texture, cut and details. ' +
      'Full body, standing, natural relaxed pose, head to toe visible including shoes, soft pastel studio background, ' +
      'soft natural light, high-end editorial look.\n' +
      list.join('\n');
  } else {
    prompt =
      'Fashion e-commerce photo of a neutral, faceless matte white female mannequin (full body, head to toe) ' +
      'wearing EXACTLY the clothing items from the provided images, combined as one outfit. ' +
      'Reproduce every garment faithfully: same color, pattern, texture, cut and details. ' +
      'Soft pastel studio background, soft even lighting, centered, entire outfit including shoes visible.\n' +
      list.join('\n');
  }
  fd.append('prompt', prompt);
  fd.append('size', '1024x1536');
  fd.append('quality', 'medium');
  fd.append('n', '1');
  const res = await fetch(`${API}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await key()}` },
    body: fd,
  });
  if (!res.ok) await fail(res);
  const j = await res.json();
  const b64 = j.data?.[0]?.b64_json;
  if (b64) return (await fetch(`data:image/png;base64,${b64}`)).blob();
  const url = j.data?.[0]?.url;
  if (url) return (await fetch(url)).blob();
  throw new Error('Vaizdo sugeneruoti nepavyko.');
}

export async function testKey(k) {
  const res = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${k}` } });
  return res.ok;
}
