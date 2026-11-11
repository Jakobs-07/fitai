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
    if (kind === 'chat') {
      // naujausias pilnas modelis be datos priesagos (ne mini/nano/pro)
      pick = newest(text.filter((m) => !/(mini|nano|pro|preview|\d{4}-\d{2}-\d{2})/.test(m.id))) || newest(text.filter((m) => /-mini$/.test(m.id)));
    } else pick = newest(text.filter((m) => /-mini$/.test(m.id))) || newest(text.filter((m) => /mini/.test(m.id))) || newest(text);
  }
  if (!pick) throw new Error(kind === 'image' ? 'OpenAI neranda tinkamo vaizdų modelio šiam raktui.' : 'OpenAI neranda tinkamo teksto modelio šiam raktui.');
  await setSetting(kind === 'image' ? 'autoImageModel' : kind === 'chat' ? 'autoChatModel' : 'autoTextModel', pick);
  return pick;
}

async function currentModel(kind) {
  if (kind === 'chat') {
    // pokalbiui – stipresnis (ne mini) modelis: geresnė lietuvių kalba. ~1 centas žinutei.
    const m = (await getSetting('chatModel')) || (await getSetting('autoChatModel'));
    if (m) return m;
    try { return await discoverModel('chat'); } catch (_) { return currentModel('text'); }
  }
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
    await setSetting(kind === 'image' ? 'imageModel' : kind === 'chat' ? 'autoChatModel' : 'textModel', null); // nustatymas nebegalioja
    return run(await discoverModel(kind));
  }
}

export async function modelsInUse() {
  return { text: await currentModel('text'), image: await currentModel('image') };
}

async function chatJSON(messages, kind = 'text') {
  const res = await withModel(kind, async (model) => {
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
  'Jei įmanoma, rinkis rečiau vilkėtus rūbus, bet stilius svarbiau. ' +
  'SVARBIAUSIA – jos stiliaus profilis (jos_stilius): ką ji pati apie save parašė, ką tu apie ją išmokai, ' +
  'kokie fitai jai patiko, kuriuos atmetė ir ką pati keitė. Derink prie jos skonio, nekartok to, kas jai nepatiko. ' +
  'ORAI: jei šalta, vėjuota ar lyja – pirmiausia sluoksniuok iš to, kas yra (megztinis po švarku, marškiniai po megztiniu, pėdkelnės po kelnėmis ar sijonu, šiltesni batai). ' +
  'KALBA: rašyk taisyklinga, paprasta lietuvių kalba, trumpais aiškiais sakiniais. Nekurk naujų žodžių, nemaišyk angliškų žodžių, nevartok techninių terminų ar laukų pavadinimų. ' +
  'Minėk tik tuos rūbus, kurie tikrai yra spintoje, ir vadink juos jų pavadinimais. Nesiprieštarauk sau. ' +
  'Atsižvelk į jos figūrą ir spalvų tipą (jos_figura_ir_spalvos) – rinkis jai palankius siluetus ir spalvas prie veido, bet jos skonis svarbiau už taisykles. ';

function profileFor(style) {
  if (!style) return null;
  const p = {};
  if (style.about) p.ji_pati_apie_save = style.about;
  if (style.body) p.jos_figura_ir_spalvos = style.body;
  if (style.learned?.length) p.ka_ismokai_apie_jos_skoni = style.learned;
  if (style.favorites?.length) p.patike_fitai = style.favorites;
  if (style.events?.length) p.paskutiniai_jos_veiksmai = style.events;
  return Object.keys(p).length ? p : null;
}

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

export async function styleOutfit({ vibe, items, categories, weather, wearStats, exclude = [], style = null, must = [] }) {
  const wardrobe = wardrobeFor(items, categories, wearStats);
  const today = new Date().toISOString().slice(0, 10);
  const out = await chatJSON([
    {
      role: 'system',
      content:
        STYLIST +
        'Atsakyk TIK JSON: {"title": "trumpas žaismingas pavadinimas", "itemIds": [...], ' +
        '"explanation": "2–3 sakiniai kodėl šis derinys", "tip": "1 stiliaus patarimas (pvz. kaip susegti, kokį makiažą)", ' +
        '"gap": "" arba vienu trumpu sakiniu, ko spintoje tikrai trūksta šiems orams ar progai (be priekaištų)}. ' +
        'Jei spintoje trūksta būtinų rūbų, vis tiek pasiūlyk geriausią įmanomą. Rūbus iš "butinai_itraukti" privalai įtraukti.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        noras: vibe || 'Kasdienis, stilingas outfitas šiandienai',
        jos_stilius: profileFor(style),
        data: today,
        orai: weather || 'nežinomi',
        nesiulyti_tiksliai_tokio_pat_derinio_kaip: exclude,
        butinai_itraukti: must,
        spinta: wardrobe,
      }),
    },
  ]);
  const valid = new Set(items.map((i) => i.id));
  out.itemIds = (out.itemIds || []).filter((id) => valid.has(id));
  for (const id of must) if (valid.has(id) && !out.itemIds.includes(id)) out.itemIds.push(id);
  if (!out.itemIds.length) throw new Error('Stilistei nepavyko parinkti rūbų. Pabandyk kitaip aprašyti norą.');
  return out;
}

// ---- Vaizdas "ant manekeno" arba "ant manęs" ----
export async function renderOutfit({ items, categories, mode, selfPhoto, notes = '', bodyDesc = '', bodyRef = null, avatar = null }) {
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const fd = new FormData();
  let idx = 1;
  let prompt;
  const list = [];
  if (mode === 'me') {
    if (!selfPhoto) throw new Error('NO_SELF');
    fd.append('image[]', await toPngForAI(selfPhoto, 1024), 'person.png');
    idx = 2;
  } else if (avatar) {
    fd.append('image[]', await toPngForAI(avatar, 1024), 'mannequin.png');
    idx = 2;
  } else if (bodyRef) {
    fd.append('image[]', bodyRef, 'body.png');
    idx = 2;
  }
  for (const it of items.slice(0, mode === 'me' ? 9 : 10)) {
    fd.append('image[]', await toPngForAI(it.image, 768), `item${idx}.png`);
    const c = catById[it.category];
    list.push(`Image ${idx}: ${it.name || ''} (${c ? c.label : ''})`);
    idx++;
  }
  const slotOf = (it) => catById[it.category]?.slot;
  const hasShoes = items.some((it) => slotOf(it) === 'shoes');
  const hosiery = items.filter((it) => slotOf(it) === 'legwear');
  const hasTights = hosiery.some((it) => it.category === 'tights');
  const hasSocks = hosiery.some((it) => it.category !== 'tights');
  const n = list.length;
  const garments = `The outfit consists of exactly ${n} item${n > 1 ? 's' : ''} listed below. EVERY one of them must be clearly visible in the final image:\n${list.join('\n')}`;
  if (mode === 'me') {
    prompt =
      'Realistic fashion photo. Show the woman from image 1 wearing EXACTLY the clothing items from the other images, ' +
      'combined as one outfit. Keep her face, hair and skin tone identical to image 1. ' +
      'BODY PROPORTIONS ARE SACRED: keep her exact body shape, weight, height, leg length, torso length, ' +
      'shoulder, bust, waist and hip widths and head-to-body ratio exactly as in image 1. Do NOT slim her, do NOT lengthen her legs, ' +
      'do NOT make her taller, curvier or thinner, do NOT idealize or retouch her figure. Only the clothes change. ' +
      (bodyDesc ? `For reference she is ${bodyDesc}. ` : '') +
      'Reproduce every garment faithfully: same color, pattern, texture, cut and details. ' +
      'Full body, standing, natural relaxed pose, head to toe visible, plain warm beige studio background, ' +
      'soft natural light, high-end editorial look.\n' + garments;
  } else if (avatar) {
    prompt =
      'Realistic fashion e-commerce photo. Image 1 is the client\'s personal mannequin. Use THIS EXACT mannequin: keep its body shape, ' +
      'proportions, height-to-width ratio, shoulder, bust, waist and hip widths, leg and torso length, pose, camera framing and background exactly the same. ' +
      'Do NOT slim, lengthen or idealize it. Dress it in EXACTLY the clothing items from the other images, combined as one outfit, ' +
      'replacing the bodysuit. Reproduce every garment faithfully: same color, pattern, texture, cut and details.\n' + garments;
  } else {
    prompt =
      'Realistic fashion e-commerce photo of a neutral, faceless matte white female mannequin, full body, head to toe, ' +
      (bodyDesc
        ? `with the exact body proportions of ${bodyDesc}. ` +
          (bodyRef ? 'Image 1 is ONLY a grey body-shape reference silhouette: copy its proportions exactly (shoulder, waist and hip widths, leg and torso length, build), but do NOT copy its color, hair or flat style. ' : '') +
          'Do NOT idealize, slim or elongate the figure. '
        : 'with the realistic proportions of an average-height woman (about 165 cm tall): natural leg length and torso, NOT an elongated, extra-tall runway mannequin. ') +
      'The mannequin stands naturally and fits fully in the frame with some empty space above the head and below the feet. ' +
      'It wears EXACTLY the clothing items from the provided images, combined as one outfit. ' +
      'Reproduce every garment faithfully: same color, pattern, texture, cut and details. ' +
      'Plain warm beige studio background, soft even lighting, centered.\n' + garments;
  }
  prompt +=
    '\nPOSE: standing flat-footed with both heels and soles fully on the floor, weight evenly on both feet – NOT on tiptoes, ' +
    'no raised heels, no ballet/arched feet (unless the provided shoes themselves have high heels). ' +
    '\nSTRICT RULES: Use ONLY the items shown in the provided images. ' +
    'Do NOT add any other clothing, shoes, socks, tights, bags, jewelry or accessories that are not in the images. ';
  if (hasTights) {
    prompt +=
      'The tights/pantyhose are worn exactly like real hosiery: one smooth continuous layer of fabric covering the legs and the whole foot, ' +
      'following the natural foot shape. The foot looks like a normal foot in tights – NO separated or individually wrapped toes, no glove-like toes, no visible toe gaps. ';
  }
  if (hasSocks) {
    prompt += hasTights
      ? 'The socks are worn OVER the tights, clearly visible on the feet and ankles. '
      : 'The socks are clearly visible on the feet and ankles. ';
  }
  if (!hasShoes) {
    prompt += hosiery.length
      ? 'No shoes are provided: the feet wear only the provided tights/socks, no shoes. '
      : 'No shoes are provided: show natural bare feet, no shoes and no socks. ';
  }
  if (notes) prompt += `\nAdditional instructions from the client (follow them): ${notes}`;
  fd.append('prompt', prompt);
  fd.append('n', '1');
  const send = async (model, extras) => {
    const body = new FormData();
    for (const [k, v] of fd.entries()) body.append(k, v);
    body.append('model', model);
    if (extras) { body.append('size', '1024x1536'); body.append('quality', 'medium'); body.append('input_fidelity', 'high'); }
    const r = await fetch(`${API}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${await key()}` }, body });
    if (!r.ok) await fail(r);
    return r;
  };
  const res = await withModel('image', async (model) => {
    try {
      return await send(model, true);
    } catch (e) {
      // naujesni modeliai gali nepriimti dydžio/kokybės parametrų – bandome be jų
      if (!e.modelMissing && /size|quality|parameter|fidelity/i.test(e.message)) return send(model, false);
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
export async function chatAboutOutfit({ outfit, message, items, categories, weather, wearStats, style = null }) {
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
        'Atsakyk tiksliai į jos klausimą. Atsakymas trumpas: 1–3 sakiniai. Niekada neminėk techninių dalykų (id, itemIds, JSON, sąrašų) – kalbėk tik apie rūbus. ' +
        'Programėlė moka generuoti fito vaizdą: "mannequin" (ant manekeno) arba "me" (ant jos pačios nuotraukos). ' +
        'Jei ji prašo sukurti, pataisyti ar pergeneruoti vaizdą – nustatyk "render" ir NEDELSK, nepaklausk dar kartą. ' +
        'Jei pageidauja kažko konkretaus vaizde (pvz. be batų, kita poza, kitas fonas) – įrašyk tai į "imageNotes" angliškai, trumpai; ' +
        'šios pastabos galios ir kitiems to fito vaizdams. Tuščias "imageNotes" reiškia – palikti esamas pastabas. ' +
        'Jei pasikeitė rūbai ir jau yra vaizdas, gali iškart nustatyti "render", kad vaizdas atsinaujintų. ' +
        'Atsakyk TIK JSON: {"reply": "tavo atsakymas", "changed": true/false, "itemIds": [visi fito rūbų id po pakeitimo], ' +
        '"title": "pavadinimas (jei pasikeitė fitas)", "explanation": "2–3 sakiniai apie naują derinį (jei pasikeitė)", "tip": "patarimas (jei pasikeitė)", ' +
        '"render": null | "mannequin" | "me", "imageNotes": "" }. ' +
        'Jei spintoje nėra to, ko ji prašo, pasakyk tai ir pasiūlyk artimiausią variantą. ' +
        'Papildomai JSON lauke "learned": jei iš jos žodžių aiškiai matosi ILGALAIKIS skonio pomėgis ar nemėgimas ' +
        '(pvz. "nemėgstu geltonos", "visada noriu patogių batų"), parašyk jį vienu trumpu sakiniu trečiu asmeniu ' +
        '(pvz. "Nemėgsta geltonos spalvos."). Vienkartiniams prašymams ("šiandien be batų") ir tam, ką jau žinai, – tuščia eilutė.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        data: new Date().toISOString().slice(0, 10),
        orai: weather || 'nežinomi',
        pradinis_noras: outfit.vibe || '',
        dabartinis_fitas: {
          pavadinimas: outfit.title,
          rubai: outfit.itemIds.map((id) => { const it = items.find((i) => i.id === id); const c = it && categories.find((x) => x.id === it.category); return { id, pavadinimas: it?.name || '', kategorija: c?.label || '' }; }),
        },
        jau_sugeneruoti_vaizdai: Object.keys(outfit.renders || {}),
        esamos_vaizdo_pastabos: outfit.imageNotes || '',
        jos_stilius: profileFor(style),
        spinta: wardrobeFor(items, categories, wearStats),
      }),
    },
    { role: 'assistant', content: JSON.stringify({ reply: 'Supratau, matau spintą ir dabartinį fitą.' }) },
    ...history,
    { role: 'user', content: message },
  ], 'chat');
  const valid = new Set(items.map((i) => i.id));
  out.itemIds = (out.itemIds || []).filter((id) => valid.has(id));
  if (!out.itemIds.length) out.changed = false;
  if (!['mannequin', 'me'].includes(out.render)) out.render = null;
  out.learned = typeof out.learned === 'string' ? out.learned.trim() : '';
  out.imageNotes = typeof out.imageNotes === 'string' ? out.imageNotes.trim() : '';
  if (!out.reply) out.reply = 'Atsiprašau, nesupratau. Pabandyk perrašyti kitaip.';
  return out;
}

// ---- Rūbo nuotraukos pagražinimas su DI (kaip parduotuvės nuotrauka) ----
export async function enhanceItemPhoto(blob, name = '') {
  const png = await toPngForAI(blob, 1024);
  const prompt =
    'Turn this photo into a clean, professional e-commerce product photo of the SAME garment' + (name ? ` (${name})` : '') + '. ' +
    'Keep it 100% the same item: identical colors, pattern, print, texture, fabric, cut, length, buttons, logos and all details. ' +
    'Only make it look neat: smooth out wrinkles, lay it straight and symmetric as a tidy flat lay, even soft studio lighting. ' +
    'Show only the garment, centered, nothing else, on a fully transparent background (or plain pure white if transparency is impossible). ' +
    'Do not add, remove or redesign anything.';
  const send = async (model, extras) => {
    const body = new FormData();
    body.append('model', model);
    body.append('image[]', png, 'item.png');
    body.append('prompt', prompt);
    body.append('n', '1');
    if (extras) { body.append('background', 'transparent'); body.append('quality', 'medium'); body.append('size', '1024x1024'); }
    const r = await fetch(`${API}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${await key()}` }, body });
    if (!r.ok) await fail(r);
    return r;
  };
  const res = await withModel('image', async (model) => {
    try {
      return await send(model, true);
    } catch (e) {
      if (!e.modelMissing && /background|size|quality|parameter|transparen/i.test(e.message)) return send(model, false);
      throw e;
    }
  });
  const j = await res.json();
  const b64 = j.data?.[0]?.b64_json;
  if (b64) return (await fetch(`data:image/png;base64,${b64}`)).blob();
  const url = j.data?.[0]?.url;
  if (url) return (await fetch(url)).blob();
  throw new Error('Pagražinti nepavyko.');
}

// ---- Spalvų tipas iš asmenukės ----
export async function analyzeSelfie(blob) {
  const img = await toDataURLForAI(blob);
  return chatJSON([
    { role: 'system', content: 'You are a professional color analyst. Look at the person in the photo (skin, hair, eyes) and return ONLY JSON.' },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            'Return JSON: {"skin": one of s1 (very light), s2 (light), s3 (medium), s4 (olive/tan), s5 (dark), ' +
            '"hair": one of blond, lbrown, dbrown, black, red, grey, "eyes": one of blue, green, hazel, brown, ' +
            '"undertone": one of warm, cool, neutral, "season": one of spring, summer, autumn, winter}. ' +
            'Ignore lighting color casts as much as possible.',
        },
        { type: 'image_url', image_url: { url: img, detail: 'low' } },
      ],
    },
  ]);
}

// ---- Figūra ir spalvos iš nuotraukos visu ūgiu ----
export async function analyzeBody(blob) {
  const img = await toDataURLForAI(blob, 1024);
  return chatJSON([
    { role: 'system', content: 'You are a professional stylist and color analyst. Analyse the woman in the full-body photo kindly and objectively. Return ONLY JSON.' },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            'Return JSON: {"bodyType": one of hourglass (shoulders≈hips, clearly defined waist), pear (hips wider than shoulders), ' +
            'apple (fuller midsection, little waist definition), rectangle (shoulders, waist, hips similar), invtri (shoulders wider than hips), ' +
            '"build": one of slim, medium, full, "skin": s1 (very light) | s2 (light) | s3 (medium) | s4 (olive/tan) | s5 (dark), ' +
            '"hair": blond | lbrown | dbrown | black | red | grey, "eyes": blue | green | hazel | brown, "undertone": warm | cool | neutral, ' +
            '"season": spring | summer | autumn | winter}. Judge proportions from the silhouette, ignore loose clothing as much as possible.',
        },
        { type: 'image_url', image_url: { url: img, detail: 'high' } },
      ],
    },
  ]);
}

// ---- Asmeninis manekenas iš jos nuotraukos ----
export async function createAvatar(photo) {
  const fd = new FormData();
  fd.append('image[]', await toPngForAI(photo, 1024), 'person.png');
  fd.append('prompt',
    'Create a realistic full-body studio photo of a faceless, smooth matte white fashion mannequin that has EXACTLY the same body as the woman in the image: ' +
    'identical height-to-width ratio, shoulder width, bust, waist, hips, thighs, leg length, torso length, arm length and overall build. ' +
    'Do NOT slim, lengthen, idealize or change the figure in any way – it must be a faithful 1:1 body double. ' +
    'No face, no hair, no skin texture. The mannequin wears only a plain, thin, fitted nude-beige bodysuit so the shape is visible. ' +
    'Neutral standing pose, front view, feet flat on the floor, arms relaxed slightly away from the body. ' +
    'Head to toe fully in frame with a little space above and below, centered, plain warm beige studio background, soft even light.');
  fd.append('n', '1');
  const send = async (model, extras) => {
    const body = new FormData();
    for (const [k, v] of fd.entries()) body.append(k, v);
    body.append('model', model);
    if (extras) { body.append('size', '1024x1536'); body.append('quality', 'medium'); body.append('input_fidelity', 'high'); }
    const r = await fetch(`${API}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${await key()}` }, body });
    if (!r.ok) await fail(r);
    return r;
  };
  const res = await withModel('image', async (model) => {
    try { return await send(model, true); } catch (e) {
      if (!e.modelMissing && /size|quality|parameter|fidelity/i.test(e.message)) return send(model, false);
      throw e;
    }
  });
  const j = await res.json();
  const b64 = j.data?.[0]?.b64_json;
  if (b64) return (await fetch(`data:image/png;base64,${b64}`)).blob();
  if (j.data?.[0]?.url) return (await fetch(j.data[0].url)).blob();
  throw new Error('Manekeno sukurti nepavyko.');
}
