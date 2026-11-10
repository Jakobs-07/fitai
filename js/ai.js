// OpenAI API: rūbų atpažinimas, outfitų parinkimas, vaizdų generavimas.
import { getSetting, setSetting } from './db.js';
import { SEASONS, OCCASIONS } from './data.js';
import { toDataURLForAI, toPngForAI } from './images.js';

const API = 'https://api.openai.com/v1';
export const DEFAULT_TEXT_MODEL = 'gpt-5-mini';
export const DEFAULT_IMAGE_MODEL = 'gpt-image-2.6-flare';


async function key() {
  const k = await getSetting('apiKey');
  if (!k) throw new Error('NO_KEY');
  return k;
}

async function fail(res) {
  let msg = `Klaida ${res.status}`;
  let code = '';
  try {
    const j = await res.json();
    if (j.error && j.error.message) msg = j.error.message;
    code = (j.error && (j.error.code || j.error.type)) || '';
  } catch (_) {}
  if (res.status === 401) msg = 'Neteisingas API raktas. Patikrink nustatymuose.';
  if (res.status === 429) msg = 'Baigėsi kreditas arba per daug užklausų. Patikrink OpenAI sąskaitą.';
  const err = new Error(msg);
  err.modelMissing = res.status === 404 || code === 'model_not_found' || /model .*(does not exist|not found|deprecated|no longer)/i.test(msg);
  throw err;
}

// ---- Modelių parinkimas ----
// OpenAI periodiškai išima senus modelius. Jei nurodytas modelis nebeegzistuoja,
// paklausiam OpenAI, kokie modeliai prieinami šiam raktui, ir pasirenkam naujausią tinkamą.
async function listModels() {
  const res = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${await key()}` } });
  if (!res.ok) await fail(res);
  return (await res.json()).data || [];
}
const newest = (arr) => arr.sort((a, b) => (b.created || 0) - (a.created || 0))[0]?.id;

async function discoverModel(kind) {
  const all = await listModels();
  let pick;
  if (kind === 'image') {
    const imgs = all.filter((m) => /^gpt-image/.test(m.id));
    pick = newest(imgs.filter((m) => !/mini/.test(m.id))) || newest(imgs);
  } else {
    const text = all.filter((m) => /^gpt-\d/.test(m.id) && !/(audio|realtime|image|search|transcribe|tts|codex|instruct|chat-latest)/.test(m.id));
    pick = newest(text.filter((m) => /-mini$/.test(m.id))) || newest(text.filter((m) => /mini/.test(m.id))) || newest(text);
  }
  if (!pick) throw new Error(kind === 'image' ? 'OpenAI neranda tinkamo vaizdų modelio šiam raktui.' : 'OpenAI neranda tinkamo teksto modelio šiam raktui.');
  await setSetting(kind === 'image' ? 'autoImageModel' : 'autoTextModel', pick);
  return pick;
}

async function currentModel(kind) {
  return kind === 'image'
    ? (await getSetting('imageModel')) || (await getSetting('autoImageModel')) || DEFAULT_IMAGE_MODEL
    : (await getSetting('textModel')) || (await getSetting('autoTextModel')) || DEFAULT_TEXT_MODEL;
}

// Paleidžia užklausą; jei modelis dingęs – susiranda naują ir bando dar kartą.
async function withModel(kind, run) {
  try {
    return await run(await currentModel(kind));
  } catch (e) {
    if (!e.modelMissing) throw e;
    await setSetting(kind === 'image' ? 'imageModel' : 'textModel', null); // rankinis nustatymas nebegalioja
    return run(await discoverModel(kind));
  }
}

export async function modelsInUse() {
  return { text: await currentModel('text'), image: await currentModel('image') };
}

async function chatJSON(messages) {
  const res = await withModel('text', async (model) => {
    const r = await fetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await key()}` },
      body: JSON.stringify({ model, messages, response_format: { type: 'json_object' } }),
    });
    if (!r.ok) await fail(r);
    return r;
  });
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

// ---- Stilistė ----
const STYLIST =
  'Tu esi asmeninė stilistė: šilta, tiesmuka, su gera skonio nuojauta, kalbi kaip mados žurnalo redaktorė. ' +
  'Kalbi lietuviškai, natūraliai, be emoji. ' +
  'Fitus sudarai TIK iš pateiktos spintos rūbų (naudok tikslius id). ' +
  'Taisyklės: arba suknelė (vieta onepiece), arba viršus + apačia; batai jei yra; viršutinis rūbas jei vėsu; ' +
  'pėdkelnės/kojinės jei tinka; 0–3 aksesuarai. Atsižvelk į orus, progą, spalvų derinius. ' +
  'Jei įmanoma, rinkis rečiau vilkėtus rūbus, bet stilius svarbiau. ';

function wardrobeFor(items, categories, wearStats) {
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  return items.map((it) => {
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
}

export async function styleOutfit({ vibe, items, categories, weather, wearStats, exclude = [] }) {
  const wardrobe = wardrobeFor(items, categories, wearStats);
  const today = new Date().toISOString().slice(0, 10);
  const out = await chatJSON([
    {
      role: 'system',
      content:
        STYLIST +
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
export async function renderOutfit({ items, categories, mode, selfPhoto, notes = '' }) {
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const fd = new FormData();
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
      'Full body, standing, natural relaxed pose, head to toe visible including shoes, plain warm beige studio background, ' +
      'soft natural light, high-end editorial look.\n' +
      list.join('\n');
  } else {
    prompt =
      'Fashion e-commerce photo of a neutral, faceless matte white female mannequin (full body, head to toe) ' +
      'wearing EXACTLY the clothing items from the provided images, combined as one outfit. ' +
      'Reproduce every garment faithfully: same color, pattern, texture, cut and details. ' +
      'Plain warm beige studio background, soft even lighting, centered, entire outfit including shoes visible.\n' +
      list.join('\n');
  }
  const hasShoes = items.some((it) => catById[it.category]?.slot === 'shoes');
  prompt +=
    '\nSTRICT RULES: Use ONLY the garments shown in the provided item images. ' +
    'Do NOT add any other clothing, shoes, socks, tights, bags, jewelry or accessories that are not in the images. ' +
    (hasShoes ? '' : 'No shoes are provided, so show bare feet without any shoes or socks. ');
  if (notes) prompt += `\nAdditional instructions from the client (follow them): ${notes}`;
  fd.append('prompt', prompt);
  fd.append('n', '1');
  const send = async (model, extras) => {
    const body = new FormData();
    for (const [k, v] of fd.entries()) body.append(k, v);
    body.append('model', model);
    if (extras) { body.append('size', '1024x1536'); body.append('quality', 'medium'); }
    const r = await fetch(`${API}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${await key()}` }, body });
    if (!r.ok) await fail(r);
    return r;
  };
  const res = await withModel('image', async (model) => {
    try {
      return await send(model, true);
    } catch (e) {
      // naujesni modeliai gali nepriimti dydžio/kokybės parametrų – bandome be jų
      if (!e.modelMissing && /size|quality|parameter/i.test(e.message)) return send(model, false);
      throw e;
    }
  });
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

// ---- Pokalbis su stiliste apie konkretų fitą ----
export async function chatAboutOutfit({ outfit, message, items, categories, weather, wearStats }) {
  const history = (outfit.chat || []).slice(-12).map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.role === 'user' ? m.text : JSON.stringify({ reply: m.text }),
  }));
  const out = await chatJSON([
    {
      role: 'system',
      content:
        STYLIST +
        'Dabar kalbiesi su klientė apie jau sudarytą fitą. Ji gali klausti, prašyti pakeitimų ar naujos idėjos. ' +
        'Jei prašo pakeisti – pakeisk tik tai, ko reikia, likusius rūbus palik. Jei tik klausia – atsakyk ir nieko nekeisk. ' +
        'Atsakymas trumpas: 1–3 sakiniai. Niekada neminėk techninių dalykų (id, itemIds, JSON, sąrašų) – kalbėk tik apie rūbus. ' +
        'Programėlė moka generuoti fito vaizdą: "mannequin" (ant manekeno) arba "me" (ant jos pačios nuotraukos). ' +
        'Jei ji prašo sukurti, pataisyti ar pergeneruoti vaizdą – nustatyk "render" ir NEDELSK, nepaklausk dar kartą. ' +
        'Jei pageidauja kažko konkretaus vaizde (pvz. be batų, kita poza, kitas fonas) – įrašyk tai į "imageNotes" angliškai, trumpai; ' +
        'šios pastabos galios ir kitiems to fito vaizdams. Tuščias "imageNotes" reiškia – palikti esamas pastabas. ' +
        'Jei pasikeitė rūbai ir jau yra vaizdas, gali iškart nustatyti "render", kad vaizdas atsinaujintų. ' +
        'Atsakyk TIK JSON: {"reply": "tavo atsakymas", "changed": true/false, "itemIds": [visi fito rūbų id po pakeitimo], ' +
        '"title": "pavadinimas (jei pasikeitė fitas)", "explanation": "2–3 sakiniai apie naują derinį (jei pasikeitė)", "tip": "patarimas (jei pasikeitė)", ' +
        '"render": null | "mannequin" | "me", "imageNotes": "" }. ' +
        'Jei spintoje nėra to, ko ji prašo, pasakyk tai ir pasiūlyk artimiausią variantą.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        data: new Date().toISOString().slice(0, 10),
        orai: weather || 'nežinomi',
        pradinis_noras: outfit.vibe || '',
        dabartinis_fitas: { pavadinimas: outfit.title, itemIds: outfit.itemIds },
        jau_sugeneruoti_vaizdai: Object.keys(outfit.renders || {}),
        esamos_vaizdo_pastabos: outfit.imageNotes || '',
        spinta: wardrobeFor(items, categories, wearStats),
      }),
    },
    { role: 'assistant', content: JSON.stringify({ reply: 'Supratau, matau spintą ir dabartinį fitą.' }) },
    ...history,
    { role: 'user', content: message },
  ]);
  const valid = new Set(items.map((i) => i.id));
  out.itemIds = (out.itemIds || []).filter((id) => valid.has(id));
  if (!out.itemIds.length) out.changed = false;
  if (!['mannequin', 'me'].includes(out.render)) out.render = null;
  out.imageNotes = typeof out.imageNotes === 'string' ? out.imageNotes.trim() : '';
  if (!out.reply) out.reply = 'Atsiprašau, nesupratau. Pabandyk perrašyti kitaip.';
  return out;
}
