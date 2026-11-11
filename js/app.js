import { db, getSetting, setSetting, uid, requestPersist, exportAll, importAll, migrateBlobs } from './db.js';
import { DEFAULT_CATEGORIES, GROUPS, SLOTS, SEASONS, OCCASIONS, VIBE_IDEAS } from './data.js';
import { resize, removeBackground, lastCutBad, blobURL, transformImage, trimTransparent, autoEnhance } from './images.js';
import { tagItem, styleOutfit, renderOutfit, chatAboutOutfit, enhanceItemPhoto, hasKey, testKey, modelsInUse, analyzeSelfie, analyzeBody, createAvatar } from './ai.js';
import { runOnboarding, runCoach, avatarSVG, avatarPNG, describeMe, bodyForAI, fLoader, startTipRotation, busyOn, busyOff, BODY_TYPES, BUILDS, SEASONS_C } from './profile.js';
import { getWeather, weatherForAI, findCity } from './weather.js';

// ================= Būsena =================
const S = {
  tab: 'fitas',
  items: [],
  outfits: [],
  worn: [],
  categories: [...DEFAULT_CATEGORIES],
  weather: null,
  currentId: null,
  renderTab: 'flat',
  styling: false,
  rendering: null,
  queue: [],
  queueRunning: false,
  fGroup: 'main',
  fCat: null,
  calMonth: new Date(),
  build: new Set(),
  buildEditId: null,
  keyOk: false,
  selfPhoto: null,
  selecting: false,
  chatting: null,
  profile: { about: '', learned: [] },
  me: {},
  enhancing: new Set(),
  pendingEnh: {},
  events: [],
  sel: new Set(),
};

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pad2 = (n) => String(n).padStart(2, '0');
const catById = (id) => S.categories.find((c) => c.id === id);
const itemById = (id) => S.items.find((i) => i.id === id);
const outfitById = (id) => S.outfits.find((o) => o.id === id);
const slotOf = (it) => (catById(it.category) || { slot: 'top' }).slot;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let toastTimer;
function toast(msg, ms = 2800, action = null) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<b class="t-act">${esc(action.label)} →</b>` : ''}`;
  t.classList.toggle('has-act', !!action);
  t.onclick = action ? () => { t.hidden = true; action.fn(); } : null;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), action ? Math.max(ms, 7000) : ms);
}
// Švelnūs pasiekimai – vieną kartą
async function milestone(key, msg) {
  const seen = (await getSetting('milestones')) || {};
  if (seen[key]) return;
  seen[key] = Date.now();
  await setSetting('milestones', seen);
  setTimeout(() => toast(msg, 4500), 600);
}

function wearStats() {
  const m = {};
  for (const w of S.worn) {
    for (const id of w.itemIds || []) {
      const s = (m[id] = m[id] || { count: 0, last: null });
      s.count++;
      if (!s.last || w.date > s.last) s.last = w.date;
    }
  }
  return m;
}

function fmtDate(str) {
  if (!str) return '';
  const d = new Date(str.length === 10 ? str + 'T12:00:00' : str);
  return d.toLocaleDateString('lt-LT', { month: 'long', day: 'numeric' });
}
const fmtTs = (ts) => fmtDate(new Date(ts).toISOString());

function lookNo(o) {
  const sorted = [...S.outfits].sort((a, b) => a.createdAt - b.createdAt);
  return pad2(sorted.findIndex((x) => x.id === o.id) + 1);
}

function plural(n, one, few, many) {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && (n100 < 10 || n100 >= 20)) return few;
  return many;
}

const loadingHTML = (text, sub = '') => fLoader(text, sub);

function tileHTML(it, extra = '', act = 'item', selected = false) {
  const c = catById(it.category);
  const pic = it.image ? `<img src="${blobURL(it.image)}" alt="" loading="lazy">` : `<span class="label lost">Nuotrauka dingo – įkelk iš naujo</span>`;
  return `<button class="tile ${selected ? 'sel' : ''}" data-act="${act}" data-id="${it.id}"><div class="ph-wrap">${pic}</div>
    <div class="cap">${esc(it.name || (c ? c.label : ''))}</div>${extra}</button>`;
}

// ================= Sheet =================
function openSheet(html) {
  const sh = $('#sheet');
  sh.innerHTML = `<div class="grab"></div>${html}`;
  sh.hidden = false;
  $('#sheetBackdrop').hidden = false;
  sh.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheetBackdrop').hidden = true;
  document.body.style.overflow = '';
}
$('#sheetBackdrop').addEventListener('click', closeSheet);
const sheetTop = (title) => `<div class="sheet-top"><h2>${title}</h2><button class="x" data-act="close">Uždaryti</button></div>`;

// ================= Outfito vaizdas =================
function orderedItems(itemIds) {
  return (itemIds || []).map(itemById).filter((i) => i && i.image).sort((a, b) => SLOTS[slotOf(a)].order - SLOTS[slotOf(b)].order);
}

function flatlayHTML(itemIds, mini = false, stamp = '', opts = {}) {
  const items = orderedItems(itemIds);
  if (!items.length) return `<div class="flatlay ${mini ? 'mini' : ''}"><div class="fl-main" style="justify-content:center"><span class="label">Rūbai ištrinti</span></div></div>`;
  const by = {};
  for (const it of items) (by[slotOf(it)] = by[slotOf(it)] || []).push(it);
  const itemAttr = (it) => (mini || opts.static ? '' : opts.oid ? `data-act="ofit-item" data-o="${opts.oid}" data-id="${it.id}"` : `data-act="item" data-id="${it.id}"`);
  const img = (it, slot) => `<div class="fl-item ${slot} cat-${it.category}" ${itemAttr(it)}><img src="${blobURL(it.image)}" alt="${esc(it.name)}" loading="lazy"></div>`;
  const all = (arr, slot) => (arr || []).map((i) => img(i, slot)).join('');

  // Kairė kolona: viršus (sluoksniais) → suknelė → apačia → pėdkelnės
  const uppers = [...(by.top || []).map((i) => [i, 'top']), ...(by.outer || []).map((i) => [i, 'outer'])];
  let main = '';
  if (uppers.length > 1) main += `<div class="fl-layer">${uppers.map(([i, sl]) => img(i, sl)).join('')}</div>`;
  else if (uppers.length) main += img(uppers[0][0], uppers[0][1]);
  main += all(by.onepiece, 'onepiece') + all(by.bottom, 'bottom');
  const tights = (by.legwear || []).filter((i) => i.category === 'tights');
  const socks = (by.legwear || []).filter((i) => i.category !== 'tights');
  main += all(tights, 'legwear');
  // jei nėra nei viršaus, nei apačios – kojinės lieka kairėje
  const mainEmpty = !main;
  // Dešinė kolona: galvos aksesuarai → kiti aksesuarai → kojinės → batai
  let side = all(by.head, 'head') + all(by.side, 'side') + (mainEmpty ? '' : all(socks, 'legwear')) + all(by.shoes, 'shoes');
  if (mainEmpty) main = all(socks, 'legwear');
  const zoom = opts.oid ? `data-act="zoom" data-o="${opts.oid}"` : '';
  return `<div class="flatlay ${mini ? 'mini' : ''} ${opts.big ? 'big' : ''} ${side ? '' : 'solo'}" ${zoom}><div class="fl-main">${main}</div>${side ? `<div class="fl-side">${side}</div>` : ''}</div>`;
}

function creditsHTML(o) {
  const items = orderedItems(o.itemIds);
  return `<ul class="credits">${items.map((it, i) => {
    const c = catById(it.category);
    return `<li data-act="ofit-item" data-o="${o.id}" data-id="${it.id}"><span class="n">${pad2(i + 1)}</span><span>${esc(it.name || (c ? c.label : 'Rūbas'))}</span><span class="c">${esc(c ? c.label : '')} ›</span></li>`;
  }).join('')}<li class="add-row" data-act="ofit-add" data-o="${o.id}"><span class="n">+</span><span>Pridėti rūbą</span></li></ul>`;
}

function outfitCardHTML(o) {
  const worn = S.worn.some((w) => w.outfitId === o.id && w.date === ymd());
  const tab = S.renderTab;
  const busy = S.rendering && S.rendering.id === o.id;
  let visual;
  if (tab === 'flat') {
    visual = flatlayHTML(o.itemIds, false, o.source === 'ai' ? 'Stilistės parinkta' : 'Tavo derinys', { oid: o.id }) + `<div class="label zoom-hint">Paliesk foną – padidinsi · paliesk rūbą – pakeisi</div>` + creditsHTML(o);
  } else {
    const blob = o.renders && o.renders[tab];
    if (busy && S.rendering.mode === tab) {
      visual = `<div class="render-box">${loadingHTML('Kuriamas vaizdas…', 'iki minutės')}</div>`;
    } else if (blob) {
      visual = `<div class="render-box" data-act="zoom-img" data-o="${o.id}" data-mode="${tab}"><img src="${blobURL(blob)}" alt="Outfitas"></div>
        <div class="row" style="margin:10px 18px 0;justify-content:space-between"><button class="btn sm ghost" style="padding-left:0;white-space:nowrap" data-act="render" data-mode="${tab}">Sugeneruoti iš naujo</button>
        ${o.imageNotes ? `<button class="btn sm ghost" style="padding-right:0;white-space:nowrap" data-act="clear-notes" data-id="${o.id}">Išvalyti pastabas</button>` : ''}</div>
        ${o.imageNotes ? `<div class="label" style="margin:2px 18px 0">Vaizdo pastabos: ${esc(o.imageNotes)}</div>` : ''}`;
    } else {
      const isMe = tab === 'me';
      const needSelf = isMe && !S.selfPhoto;
      visual = `<div class="render-box"><div class="loading">
        ${!isMe && S.me.avatarImg ? `<img class="rb-av" src="${blobURL(S.me.avatarImg)}" alt="">` : !isMe && S.me.done ? avatarSVG(S.me, { cls: 'rb-av', silhouette: false }) : ''}
        <span class="serif">${needSelf ? 'Reikia tavo nuotraukos' : isMe ? 'Kaip atrodytų ant tavęs?' : S.me.done ? 'Manekenas tavo figūros' : 'Pažiūrėk ant manekeno'}</span>
        <span class="label">${needSelf ? 'Įkelk ją skiltyje „Daugiau“' : 'Kaina ~0,05–0,20 $'}</span>
        ${needSelf ? `<a class="btn sm" href="#nustatymai">Įkelti nuotrauką</a>` : `<button class="btn primary sm" data-act="render" data-mode="${tab}">Sugeneruoti vaizdą</button>`}
      </div></div>`;
    }
  }
  return `<div class="card outfit-card pop">
    <div class="outfit-head">
      <div><div class="label" style="margin-bottom:8px">${o.vibe ? esc(o.vibe) : 'Šiandienos fitas'}</div><div class="outfit-title">${esc(o.title || 'Tavo fitas')}</div></div>
      <div class="look-no">Nº ${lookNo(o)}</div>
    </div>
    <div class="seg">
      <button class="${tab === 'flat' ? 'on' : ''}" data-act="rtab" data-v="flat">Rūbai</button>
      <button class="${tab === 'mannequin' ? 'on' : ''}" data-act="rtab" data-v="mannequin">Manekenas</button>
      <button class="${tab === 'me' ? 'on' : ''}" data-act="rtab" data-v="me">Ant manęs</button>
    </div>
    ${visual}
    <div class="outfit-body">
      ${o.explanation ? `<div class="quote">„${esc(o.explanation)}“</div>` : ''}
      ${o.tip ? `<div class="tip"><span class="label">Stilistės patarimas</span>${esc(o.tip)}</div>` : ''}
      ${o.gap ? `<div class="gap-note"><span class="label">Spintoje trūksta</span>${esc(o.gap)}</div>` : ''}
      <div class="actions">
        <button class="btn ${o.favorite ? 'primary' : ''}" data-act="fav" data-id="${o.id}">${o.favorite ? 'Mėgstamas ✓' : 'Į mėgstamus'}</button>
        <button class="btn ${worn ? 'dark' : ''}" data-act="wear" data-id="${o.id}" ${worn ? 'disabled' : ''}>${worn ? 'Vilki šiandien ✓' : 'Vilkėsiu šiandien'}</button>
        ${o.source === 'ai' ? `<button class="btn" data-act="restyle" data-id="${o.id}" ${S.styling ? 'disabled' : ''}>Kitas variantas</button>` : ''}
        <button class="btn ${o.source === 'ai' ? '' : 'full'}" data-act="builder" data-id="${o.id}">Keisti rūbus</button>
      </div>
      ${chatHTML(o)}
    </div>
  </div>`;
}

const CHAT_IDEAS = [
  ['Šilčiau', 'Padaryk šiltesnį variantą šiems orams'],
  ['Elegantiškiau', 'Padaryk elegantiškesnį'],
  ['Kasdieniškiau', 'Padaryk kasdieniškesnį ir patogesnį'],
  ['Kiti batai', 'Pakeisk batus'],
  ['Spalvingiau', 'Įnešk daugiau spalvos'],
  ['Kodėl taip?', 'Kodėl būtent toks derinys?'],
];

function chatHTML(o) {
  const msgs = o.chat || [];
  const busy = S.chatting === o.id;
  return `<div class="chat">
    <div class="section-head"><h3>Pokalbis su stiliste</h3><span class="label">${msgs.length ? '' : 'Pataisyk fitą žodžiais'}</span></div>
    ${msgs.map((m) => m.role === 'user'
      ? `<div class="msg me">${esc(m.text)}</div>`
      : `<div class="msg her">${esc(m.text)}${m.changed ? '<span class="label msg-note">Fitas atnaujintas</span>' : ''}</div>`).join('')}
    ${busy ? `<div class="msg her typing"><div class="loader"></div></div>` : ''}
    ${!busy ? `<div class="chips">${CHAT_IDEAS.filter(([l]) => l !== 'Šilčiau' || (S.weather && S.weather.temp < 14)).map(([l, t]) => `<button class="chip" data-act="chat-idea" data-id="${o.id}" data-v="${esc(t)}">${l}</button>`).join('')}</div>` : ''}
    <form class="chat-form" data-id="${o.id}">
      <input class="input" id="chatInput" autocomplete="off" placeholder="Pvz. pakeisk batus į baltus…" ${busy ? 'disabled' : ''}>
      <button class="btn primary sm" type="submit" ${busy ? 'disabled' : ''}>Siųsti</button>
    </form>
  </div>`;
}

// ---- Trintukas: rankinis fono valymas ----
async function openEraser(id) {
  const it = itemById(id);
  if (!it) return;
  const bmp = await createImageBitmap(it.image);
  const ed = document.createElement('div');
  ed.className = 'editor';
  ed.innerHTML = `
    <div class="lb-top"><span class="label">Trinti foną</span><button class="x" data-ed="cancel">Atšaukti</button></div>
    <div class="ed-stage"><canvas></canvas></div>
    <div class="ed-tools">
      <div class="label center">Braukyk pirštu per tai, ką nori ištrinti</div>
      <label class="ed-size"><span class="label">Teptukas</span><input type="range" min="8" max="90" value="34" id="edSize"></label>
      <div class="row">
        <button class="btn sm" data-ed="undo">Atgal</button>
        <button class="btn sm" data-ed="reset">Iš naujo</button>
        <button class="btn sm primary" style="flex:1" data-ed="save">Išsaugoti</button>
      </div>
    </div>`;
  document.body.appendChild(ed);
  const cv = ed.querySelector('canvas');
  cv.width = bmp.width;
  cv.height = bmp.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const initial = ctx.getImageData(0, 0, cv.width, cv.height);
  const undo = [];
  let drawing = false;
  let last = null;
  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * cv.width) / r.width, y: ((e.clientY - r.top) * cv.height) / r.height, k: cv.width / r.width };
  };
  const stroke = (a, b) => {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = +ed.querySelector('#edSize').value * a.k;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  };
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    undo.push(ctx.getImageData(0, 0, cv.width, cv.height));
    if (undo.length > 15) undo.shift();
    drawing = true;
    last = pos(e);
    stroke(last, last);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    stroke(last, p);
    last = p;
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => cv.addEventListener(t, () => (drawing = false)));
  ed.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ed]');
    if (!b) return;
    const a = b.dataset.ed;
    if (a === 'cancel') ed.remove();
    if (a === 'undo' && undo.length) ctx.putImageData(undo.pop(), 0, 0);
    if (a === 'reset') {
      undo.push(ctx.getImageData(0, 0, cv.width, cv.height));
      ctx.putImageData(initial, 0, 0);
    }
    if (a === 'save') {
      b.disabled = true;
      b.textContent = 'Saugoma…';
      const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      it.image = await trimTransparent(blob, 8);
      it.cutout = true;
      await db.put('items', it);
      ed.remove();
      openItem(it.id);
      rerender();
      toast('Išsaugota');
    }
  });
}

// ---- Pagražinimo apsauga: palyginimas ir spalvos pokyčio tikrinimas ----
async function avgColor(blob) {
  const bm = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = 48; c.height = 48;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bm, 0, 0, 48, 48);
  const d = x.getImageData(0, 0, 48, 48).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 180) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}
async function colorShift(a, b) {
  try {
    const [x, y] = await Promise.all([avgColor(a), avgColor(b)]);
    // atspalvio pokytis svarbesnis nei šviesumo: lyginam spalvas be bendro šviesumo
    const lx = (x[0] + x[1] + x[2]) / 3 || 1, ly = (y[0] + y[1] + y[2]) / 3 || 1;
    const chroma = Math.hypot(...x.map((v, i) => (v - lx) - (y[i] - ly)));
    return chroma * 1.6 + Math.abs(lx - ly) * 0.3;
  } catch (_) { return 0; }
}

function openCompare(id) {
  const it = itemById(id);
  const p = S.pendingEnh[id];
  if (!it || !p) return;
  openSheet(`${sheetTop('Prieš ir po')}
    <div class="stack">
      <div class="compare">
        <figure><div class="cmp-ph"><img src="${blobURL(it.image)}" alt=""></div><figcaption class="label">Prieš</figcaption></figure>
        <figure><div class="cmp-ph"><img src="${blobURL(p.image)}" alt=""></div><figcaption class="label">Po</figcaption></figure>
      </div>
      ${p.warn ? `<div class="gap-note warn"><span class="label">Atidžiai</span>Atrodo, DI pakeitė rūbo spalvą ar atspalvį. Jei rūbas atrodo ne taip kaip tikras – palik seną nuotrauką.</div>` : `<p class="small muted center" style="margin:0">Spalvos nepasikeitė. Patikrink, ar rūbas atrodo kaip tikras.</p>`}
      <div class="row"><button class="btn" style="flex:1" data-act="enh-drop" data-id="${id}">Palikti seną</button>
        <button class="btn primary" style="flex:1" data-act="enh-keep" data-id="${id}">Naudoti naują</button></div>
    </div>`);
}

// ---- Šviesa: šviesumas ir kontrastas be DI ----
async function openLight(id) {
  const it = itemById(id);
  if (!it?.image) return;
  const ed = document.createElement('div');
  ed.className = 'editor';
  const url = blobURL(it.image);
  ed.innerHTML = `
    <div class="lb-top"><span class="label">Šviesa</span><button class="x" data-ed="cancel">Atšaukti</button></div>
    <div class="ed-stage light-stage"><img id="ltImg" src="${url}" alt=""></div>
    <div class="ed-tools">
      <label class="ed-size"><span class="label" style="width:88px">Šviesumas</span><input type="range" min="70" max="140" value="100" id="ltB"></label>
      <label class="ed-size"><span class="label" style="width:88px">Kontrastas</span><input type="range" min="70" max="140" value="100" id="ltC"></label>
      <label class="ed-size"><span class="label" style="width:88px">Šiluma</span><input type="range" min="-30" max="30" value="0" id="ltW"></label>
      <div class="row"><button class="btn sm" data-ed="reset">Iš naujo</button><button class="btn sm primary" style="flex:1" data-ed="save">Išsaugoti</button></div>
    </div>`;
  document.body.appendChild(ed);
  const img = ed.querySelector('#ltImg');
  const v = () => ({ b: +ed.querySelector('#ltB').value / 100, c: +ed.querySelector('#ltC').value / 100, w: +ed.querySelector('#ltW').value });
  const preview = () => {
    const { b, c, w } = v();
    img.style.filter = `brightness(${b}) contrast(${c}) sepia(${Math.max(0, w) / 100}) hue-rotate(${w < 0 ? w * 0.6 : 0}deg) saturate(${1 + Math.abs(w) / 200})`;
  };
  ed.addEventListener('input', preview);
  ed.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ed]');
    if (!b) return;
    if (b.dataset.ed === 'cancel') return ed.remove();
    if (b.dataset.ed === 'reset') { ['ltB', 'ltC'].forEach((k) => (ed.querySelector('#' + k).value = 100)); ed.querySelector('#ltW').value = 0; return preview(); }
    if (b.dataset.ed === 'save') {
      b.disabled = true;
      const { b: br, c: ct, w } = v();
      const bm = await createImageBitmap(it.image);
      const cv = document.createElement('canvas');
      cv.width = bm.width; cv.height = bm.height;
      const x = cv.getContext('2d', { willReadFrequently: true });
      x.drawImage(bm, 0, 0);
      const d = x.getImageData(0, 0, cv.width, cv.height);
      const a = d.data;
      const wr = 1 + w / 300, wb = 1 - w / 300;
      for (let i = 0; i < a.length; i += 4) {
        for (let k = 0; k < 3; k++) {
          let val = a[i + k] * br;
          val = (val - 128) * ct + 128;
          if (k === 0) val *= wr;
          if (k === 2) val *= wb;
          a[i + k] = val < 0 ? 0 : val > 255 ? 255 : val;
        }
      }
      x.putImageData(d, 0, 0);
      const out = await new Promise((r) => cv.toBlob(r, 'image/png'));
      it.prevImage = it.image;
      it.image = out;
      await db.put('items', it);
      ed.remove();
      openItem(it.id);
      rerender();
      toast('Šviesa pakoreguota');
    }
  });
}

// ---- Stiliaus profilis: ką stilistė žino apie jos skonį ----
const itemNames = (ids) => ids.map(itemById).filter(Boolean).map((i) => i.name || catById(i.category)?.label || 'rūbas');

function styleCtx() {
  const favorites = S.outfits.filter((o) => o.favorite).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10)
    .map((o) => itemNames(o.itemIds).join(' + ')).filter(Boolean);
  return { about: S.profile.about, body: describeMe(S.me), learned: S.profile.learned, favorites, events: S.events.slice(-15).map((e) => e.text) };
}

async function logEvent(text) {
  S.events.push({ text, at: Date.now() });
  S.events = S.events.slice(-30);
  await setSetting('styleEvents', S.events);
}

async function saveProfile() {
  await setSetting('styleProfile', S.profile);
}

async function doRender(o, mode) {
  if (!S.keyOk) return toast('Reikia API rakto (skiltis „Daugiau“)');
  if (S.rendering) return toast('Vaizdas jau kuriamas – palauk');
  if (mode === 'me' && !S.selfPhoto) return toast('Įkelk savo nuotrauką skiltyje „Daugiau“');
  S.rendering = { id: o.id, mode };
  S.renderTab = mode;
  await rerender();
  try {
    const items = o.itemIds.map(itemById).filter(Boolean);
    let bodyRef = null;
    const avatar = mode === 'mannequin' && S.me.avatarImg ? S.me.avatarImg : null;
    if (mode === 'mannequin' && S.me.done && !avatar) { try { bodyRef = await avatarPNG(S.me); } catch (e) { console.warn('avatar', e); } }
    const blob = await renderOutfit({ items, categories: S.categories, mode, selfPhoto: S.selfPhoto, notes: o.imageNotes || '', bodyDesc: bodyForAI(S.me), bodyRef, avatar });
    o.renders = { ...(o.renders || {}), [mode]: blob };
    await saveOutfit(o);
    const card = document.querySelector('.outfit-card .seg');
    const visible = S.tab === 'fitas' && card && card.getBoundingClientRect().top < window.innerHeight && card.getBoundingClientRect().bottom > 0;
    if (!visible) toast(mode === 'me' ? 'Vaizdas ant tavęs paruoštas' : 'Manekenas paruoštas', 7000, { label: 'Žiūrėti', fn: async () => { await setCurrent(o.id); S.renderTab = mode; location.hash = '#fitas'; await rerender(); document.querySelector('.outfit-card .seg')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } });
  } catch (e) {
    toast(e.message === 'NO_SELF' ? 'Įkelk savo nuotrauką skiltyje „Daugiau“' : 'Vaizdo sukurti nepavyko: ' + e.message, 6000);
  }
  S.rendering = null;
  rerender();
}

async function afterOutfitEdit(o, msg) {
  o.renders = {};
  o.edited = true;
  await saveOutfit(o);
  closeSheet();
  toast(msg);
  rerender();
}

async function sendChat(id, text) {
  text = (text || '').trim();
  const o = outfitById(id);
  if (!o || !text || S.chatting) return;
  if (!S.keyOk) return toast('Pokalbiui reikia DI rakto (skiltis „Daugiau“)');
  o.chat = [...(o.chat || []), { role: 'user', text, at: Date.now() }];
  await saveOutfit(o);
  S.chatting = o.id;
  let renderAfter = null;
  await rerender();
  document.querySelector('.chat-form')?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  try {
    const r = await chatAboutOutfit({
      outfit: o, message: text, items: S.items, categories: S.categories,
      weather: weatherForAI(S.weather), wearStats: wearStats(), style: styleCtx(),
    });
    const changed = !!r.changed && r.itemIds.join() !== o.itemIds.join();
    o.chat.push({ role: 'assistant', text: r.reply, changed, at: Date.now() });
    if (changed) {
      o.itemIds = r.itemIds;
      if (r.title) o.title = r.title;
      if (r.explanation) o.explanation = r.explanation;
      if (r.tip) o.tip = r.tip;
      o.renders = {};
      S.renderTab = 'flat';
    }
    if (r.imageNotes) o.imageNotes = r.imageNotes;
    if (r.learned && !S.profile.learned.some((l) => l.toLowerCase() === r.learned.toLowerCase())) {
      S.profile.learned = [...S.profile.learned, r.learned].slice(-40);
      await saveProfile();
      setTimeout(() => toast('Stilistė įsiminė: ' + r.learned, 4000), 300);
    }
    await saveOutfit(o);
    renderAfter = r.render;
  } catch (e) {
    toast(e.message === 'NO_KEY' ? 'Reikia API rakto' : 'Klaida: ' + e.message, 5000);
  }
  S.chatting = null;
  await rerender();
  if (renderAfter) {
    // stilistė paprašė sukurti vaizdą – rodom jį kortelės viršuje
    await doRender(o, renderAfter);
    document.querySelector('.outfit-card .seg')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  document.querySelector('.chat-form')?.scrollIntoView({ block: 'end' });
}

document.addEventListener('submit', (e) => {
  const f = e.target.closest('.chat-form');
  if (!f) return;
  e.preventDefault();
  sendChat(f.dataset.id, f.querySelector('#chatInput').value);
});

// ================= Ekranai =================
function viewFitas() {
  const h = new Date().getHours();
  const [g1, g2] = h < 11 ? ['Labas', 'rytas'] : h < 18 ? ['Laba', 'diena'] : ['Labas', 'vakaras'];
  const dateStr = new Date().toLocaleDateString('lt-LT', { weekday: 'long', month: 'long', day: 'numeric' });
  const cur = outfitById(S.currentId);
  let html = `<div class="stack">
    <div class="hello"><div class="h-title">${g1}<br><em>${g2}${S.me.name ? ', ' + esc(S.me.name) : ''}</em></div><div class="label h-sub">${dateStr}</div></div>`;

  if (S.items.length < 2 || !S.keyOk) {
    html += `<div class="card"><div class="label" style="margin-bottom:6px">Pradžia</div><div class="steps-list">
      ${!isStandalone() ? step('1', 'Įsidiek programėlę', 'Safari: Bendrinti → „Į pradžios ekraną“', false, '#nustatymai') : ''}
      ${step('2', 'Įkelk savo rūbus', S.items.length ? `Jau įkelta: ${S.items.length}` : 'Nufotografuok arba pasirink iš galerijos', S.items.length >= 2, '#spinta')}
      ${step('3', 'Įjunk DI stilistę', S.keyOk ? 'Įjungta' : 'Įvesk OpenAI raktą skiltyje „Daugiau“', S.keyOk, '#nustatymai')}
    </div></div>`;
  }

  if (S.weather) {
    const w = S.weather;
    html += `<div class="weather-box panel-wine">
      <div><div class="label" style="margin-bottom:10px">${esc(w.place)} · šiandien</div><div class="t">${w.temp}°</div></div>
      <div style="text-align:right"><div class="serif" style="font-size:20px">${esc(w.text)}</div>
        <div class="label" style="margin-top:6px">Jaučiasi ${w.feels}° · vėjas ${w.wind} km/h</div>
        <div class="label" style="margin-top:2px">Dieną ${w.min}°…${w.max}° · lietus ${w.rain ?? 0}%</div></div>
    </div>`;
  }

  html += `<div class="card vibe-card stack">
    <div class="vibe-q">Koks šiandien<br><em>vaibas?</em></div>
    <textarea class="input" id="vibe" placeholder="Kava su drauge, noriu jaustis patogiai, bet atrodyti stilingai…">${esc(S.lastVibe || '')}</textarea>
    <div class="chips">${VIBE_IDEAS.map((v) => `<button class="chip" data-act="vibe-idea" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>
    <button class="btn primary block" data-act="style" ${S.styling ? 'disabled' : ''}>${S.styling ? 'Stilistė galvoja…' : 'Sukurk man fitą'}</button>
    <div class="row"><button class="btn" style="flex:1" data-act="shuffle">Dėlioti</button><button class="btn" style="flex:1" data-act="builder">Iš sąrašo</button></div>
  </div>`;

  if (S.styling) html += `<div class="card">${loadingHTML('Stilistė rausiasi po tavo spintą…')}</div>`;
  if (cur) html += outfitCardHTML(cur);
  return html + feedsHTML() + `</div>`;
}

function feedsHTML() {
  if (S.items.length < 4) return '';
  const ws = wearStats();
  let html = '';
  const fresh = [...S.items].filter((i) => i.image && Date.now() - i.createdAt < 14 * 864e5 && !ws[i.id]).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (fresh) {
    html += `<div class="card feed-new">
      <div class="fn-ph" data-act="item" data-id="${fresh.id}"><img src="${blobURL(fresh.image)}" alt=""></div>
      <div class="stack" style="gap:8px;flex:1;min-width:0"><span class="label">Naujas spintoje</span>
        <div class="serif" style="font-size:21px;line-height:1.15">${esc(fresh.name || 'Naujas rūbas')}</div>
        <button class="btn sm primary" style="align-self:flex-start" data-act="style-with" data-id="${fresh.id}">Sukurk fitą su juo</button></div></div>`;
  }
  const forgotten = [...S.items].filter((i) => i.image && i.id !== fresh?.id)
    .sort((a, b) => (ws[a.id]?.last || '0000').localeCompare(ws[b.id]?.last || '0000') || a.createdAt - b.createdAt).slice(0, 8);
  if (forgotten.length >= 3) {
    html += `<div class="section-head"><h3>Seniai vilkėti</h3><span class="label">Paliesk – sukursim fitą</span></div>
      <div class="picker-row feed-row">${forgotten.map((it) => tileHTML(it, `<span class="badge">${ws[it.id] ? fmtDate(ws[it.id].last) : 'niekada'}</span>`, 'item')).join('')}</div>`;
  }
  return html;
}

function step(n, title, text, done, href) {
  return `<a href="${href}" class="step ${done ? 'done' : ''}"><span class="num">${done ? '✓' : n}</span>
    <span class="t"><b>${title}</b><span>${text}</span></span><span class="label">→</span></a>`;
}

function viewSpinta() {
  const countIn = (fn) => S.items.filter(fn).length;
  const groupCount = (g) => countIn((i) => (catById(i.category) || {}).group === g.id);
  const groups = GROUPS.filter((g) => S.categories.some((c) => c.group === g.id));
  if (!groups.some((g) => g.id === S.fGroup)) S.fGroup = groups[0].id;
  let items = S.items.filter((i) => (catById(i.category) || {}).group === S.fGroup);
  if (S.fCat) items = items.filter((i) => i.category === S.fCat);
  items = [...items].sort((a, b) => b.createdAt - a.createdAt);
  const cats = S.categories.filter((c) => c.group === S.fGroup);

  let html = `<div class="stack">
    <div class="hello row" style="justify-content:space-between;align-items:flex-end">
      <div><div class="h-title">Mano<br><em>spinta</em></div><div class="label h-sub">${S.items.length} ${plural(S.items.length, 'rūbas', 'rūbai', 'rūbų')}</div></div>
      ${S.items.length ? `<button class="btn sm ${S.selecting ? 'dark' : ''}" data-act="select-mode">${S.selecting ? 'Baigti' : 'Žymėti'}</button>` : ''}
    </div>
    <nav class="filters">
      ${groups.map((g) => `<button class="filt ${S.fGroup === g.id ? 'on' : ''}" data-act="fgroup" data-v="${g.id}">${g.label}<sup>${groupCount(g)}</sup></button>`).join('')}
    </nav>
    ${cats.length > 1 ? `<nav class="subfilters">${cats.map((c) => {
      const n = countIn((i) => i.category === c.id);
      return `<button class="sub ${S.fCat === c.id ? 'on' : ''}" data-act="fcat" data-v="${c.id}">${esc(c.label)}<sup>${n}</sup></button>`;
    }).join('')}</nav>` : ''}`;

  if (!items.length && !S.queue.length) {
    const where = S.fCat ? catById(S.fCat)?.label : GROUPS.find((g) => g.id === S.fGroup)?.label;
    html += `<div class="card empty"><div class="big">${S.items.length ? 'Tuščia' : 'Pradėkim'}</div><h3>${S.items.length ? `${esc(where)} – dar nieko` : 'Spinta laukia rūbų'}</h3>
      <p>Spausk + ir nufotografuok rūbą arba pasirink kelias nuotraukas iš galerijos. Fonas iškerpamas automatiškai.</p>
      <button class="btn primary" data-act="add">Pridėti rūbų</button></div>`;
  } else {
    if (S.queue.length) html += uploadBannerHTML();
    html += `<div class="grid">`;
    for (const q of S.queue) {
      html += `<div class="tile" data-q="${q.id}"><div class="ph-wrap"><img class="ph" src="${q.preview}" alt=""></div><div class="cap">Įkeliama</div>
        <div class="proc"><span class="lbl">${esc(q.label)}</span><div class="bar"><i style="width:${Math.round(q.p * 100)}%"></i></div></div></div>`;
    }
    for (const it of items) html += S.selecting ? tileHTML(it, '', 'sel-item', S.sel.has(it.id)) : tileHTML(it);
    html += `</div>`;
  }
  if (S.selecting) {
    const n = S.sel.size;
    return html + `</div><div class="bulkbar">
      <span class="label bb-count">${n ? `Pažymėta: ${n}` : 'Paliesk rūbus'}</span>
      <button class="btn sm" data-act="sel-all">${items.length && items.every((i) => S.sel.has(i.id)) ? 'Nužymėti' : 'Visus'}</button>
      <button class="btn sm" data-act="sel-move" ${n ? '' : 'disabled'}>Kategorija</button>
      <button class="btn sm danger" data-act="sel-del" ${n ? '' : 'disabled'}>Ištrinti</button>
    </div>`;
  }
  return html + `</div><button class="fab" data-act="add" aria-label="Pridėti rūbą">+</button>`;
}

function favCard(o) {
  return `<button class="fav" data-act="open-outfit" data-id="${o.id}">${flatlayHTML(o.itemIds, true)}
    <div class="ft">${esc(o.title || 'Fitas')}</div><div class="label fd">Nº ${lookNo(o)} · ${fmtTs(o.createdAt)}</div></button>`;
}

function viewMegstami() {
  const favs = S.outfits.filter((o) => o.favorite).sort((a, b) => b.createdAt - a.createdAt);
  const recent = S.outfits.filter((o) => !o.favorite).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
  let html = `<div class="stack"><div class="hello"><div class="h-title"><em>Mėgstami</em><br>fitai</div><div class="label h-sub">${favs.length} išsaugoti</div></div>`;
  html += favs.length
    ? `<div class="fav-grid">${favs.map(favCard).join('')}</div>`
    : `<div class="card empty"><div class="big">Dar nieko</div><h3>Nėra mėgstamų</h3><p>Kai fitas patiks, spausk „Į mėgstamus“ ir jis atsiras čia.</p></div>`;
  if (recent.length) html += `<div class="section-head"><h3>Neseniai sukurti</h3><span class="label">${recent.length}</span></div><div class="fav-grid">${recent.map(favCard).join('')}</div>`;
  return html + `</div>`;
}

function viewKalendorius() {
  const m = S.calMonth;
  const y = m.getFullYear(), mo = m.getMonth();
  const first = new Date(y, mo, 1);
  const days = new Date(y, mo + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const byDate = {};
  for (const w of S.worn) (byDate[w.date] = byDate[w.date] || []).push(w);
  const title = first.toLocaleDateString('lt-LT', { month: 'long' });
  let cells = ['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk'].map((d) => `<div class="dow label">${d}</div>`).join('');
  for (let i = 0; i < offset; i++) cells += `<div class="day out"></div>`;
  const today = ymd();
  let monthCount = 0;
  for (let d = 1; d <= days; d++) {
    const ds = ymd(new Date(y, mo, d));
    const e = byDate[ds];
    let img = '';
    if (e) {
      monthCount += e.length;
      const its = e[0].itemIds.map(itemById).filter(Boolean);
      const hero = its.find((i) => ['onepiece', 'top'].includes(slotOf(i))) || its[0];
      if (hero) img = `<img src="${blobURL(hero.image)}" alt="">`;
    }
    cells += `<button class="day ${e ? 'has' : ''} ${ds === today ? 'today' : ''}" data-act="day" data-d="${ds}">${pad2(d)}${img}</button>`;
  }
  const ws = wearStats();
  const forgotten = [...S.items]
    .sort((a, b) => (ws[a.id]?.last || '0000').localeCompare(ws[b.id]?.last || '0000') || a.createdAt - b.createdAt)
    .slice(0, 6);
  let html = `<div class="stack">
    <div class="hello"><div class="h-title">Kas<br><em>vilkėta</em></div><div class="label h-sub">Šį mėnesį užfiksuota: ${monthCount}</div></div>
    <div class="card stack">
      <div class="cal-head"><button class="cal-nav" data-act="cal" data-v="-1">←</button><h2>${title} <span class="label">${y}</span></h2><button class="cal-nav" data-act="cal" data-v="1">→</button></div>
      <div class="cal">${cells}</div>
    </div>`;
  if (forgotten.length && S.worn.length) {
    html += `<div class="section-head"><h3>Seniai vilkėti</h3><span class="label">Stilistė juos prisimins</span></div>
      <div class="grid">${forgotten.map((it) => tileHTML(it, `<span class="badge">${ws[it.id] ? fmtDate(ws[it.id].last) : 'niekada'}</span>`)).join('')}</div>`;
  }
  return html + `</div>`;
}

function profileCardHTML() {
  const me = S.me;
  if (!me.done) {
    return `<div class="card panel-sand set-block">${setHead('—', 'Mano profilis', 'Figūra, spalvos ir avataras')}
      <button class="btn primary" data-act="onboard" data-v="name">Susikurti profilį</button></div>`;
  }
  const bt = BODY_TYPES.find((b) => b.id === me.bodyType);
  const se = SEASONS_C[me.season];
  return `<div class="card set-block prof-card">${setHead('—', me.name ? esc(me.name) : 'Mano profilis', 'Pagal tai kuriamas manekenas ir parenkami deriniai')}
    <div class="prof-row" data-act="onboard" data-v="avatar">${me.avatarImg ? `<img class="prof-av av-img" src="${blobURL(me.avatarImg)}" alt="">` : avatarSVG(me, { cls: 'prof-av' })}
      <dl class="av-facts"><dt>Ūgis</dt><dd>${me.height} cm</dd><dt>Sudėjimas</dt><dd>${BUILDS.find((b) => b.id === me.build)?.label || '—'}</dd>
      <dt>Figūra</dt><dd>${bt ? bt.label : '—'}</dd><dt>Spalvos</dt><dd>${se ? se.label : '—'}</dd>${me.styles?.length ? `<dt>Stilius</dt><dd>${esc(me.styles.slice(0, 3).join(', '))}</dd>` : ''}</dl></div>
    ${se ? `<div class="palette">${se.good.map(([n, hex]) => `<span><i style="background:${hex}"></i>${n}</span>`).join('')}</div>` : ''}
    ${bt ? `<div class="tip" style="margin-top:0"><span class="label">Tavo figūrai</span>${bt.tip}</div>` : ''}
    <div class="row"><button class="btn sm" style="flex:1" data-act="onboard" data-v="avatar">Redaguoti</button><button class="btn sm" style="flex:1" data-act="coach">Rodyti gidą</button></div>
  </div>`;
}

const setHead = (n, title, sub = '') => `<div class="set-head"><span class="n">${n}</span><div><b>${title}</b>${sub ? `<div class="small muted">${sub}</div>` : ''}</div></div>`;

async function viewNustatymai() {
  const loc = await getSetting('location');
  const bg = await getSetting('bgRemoval', true);
  const { text: textModel, image: imageModel } = await modelsInUse();
  const custom = S.categories.filter((c) => c.custom);
  let usage = '';
  try {
    const est = await navigator.storage.estimate();
    usage = ` Užimta ${(est.usage / 1048576).toFixed(1)} MB.`;
  } catch (_) {}

  return `<div class="stack">
    <div class="hello"><div class="h-title">Mano<br><em>nustatymai</em></div></div>

    ${!isStandalone() ? `<div class="card panel-sand set-block">${setHead('—', 'Įsidiek į telefoną')}
      <ol class="steps small"><li>Atsidaryk šį puslapį <b>Safari</b></li><li>Spausk <b>Bendrinti</b> (kvadratas su rodykle) apačioje</li>
      <li>Pasirink <b>„Į pradžios ekraną“</b></li><li>Spausk <b>Pridėti</b></li></ol></div>` : ''}

    ${profileCardHTML()}

    <div class="card set-block">
      ${setHead('01', 'DI stilistė', `<span class="${S.keyOk ? 'status-ok' : 'status-no'}">${S.keyOk ? 'Įjungta' : 'Neįjungta – reikia OpenAI rakto'}</span>`)}
      <div class="field"><label>OpenAI API raktas</label>
        <input class="input" id="apiKey" type="password" autocomplete="off" placeholder="${S.keyOk ? '•••••••• išsaugotas' : 'sk-…'}"></div>
      <div class="row"><button class="btn primary" style="flex:1" data-act="save-key">Išsaugoti raktą</button>${S.keyOk ? `<button class="btn danger" data-act="del-key">Pašalinti</button>` : ''}</div>
      <details><summary>Kaip gauti raktą? (~5 min.)</summary>
        <ol class="steps small" style="margin-top:10px">
          <li>Atsidaryk <b>platform.openai.com</b> ir prisijunk su ta pačia paskyra kaip ChatGPT.</li>
          <li><b>Settings → Billing</b>: papildyk, pvz., <b>5 $</b>. Išjunk „auto recharge“, kad niekada nenuskaičiuotų daugiau.</li>
          <li><b>API keys → Create new secret key</b>, nukopijuok raktą.</li>
          <li>Įklijuok jį čia ir spausk „Išsaugoti“.</li>
        </ol>
        <p class="small muted">Raktas saugomas tik šiame telefone. Fito parinkimas kainuoja mažiau nei centą, vaizdas ~5–20 centų.
        Jei vaizdai meta klaidą apie „verification“, OpenAI nustatymuose (Settings → Organization → General) reikia patvirtinti tapatybę.</p>
      </details>
    </div>

    <div class="card set-block">
      ${setHead('02', 'Mano stilius', 'Stilistė į tai atsižvelgia kiekvieną kartą')}
      <div class="field"><label>Apie mano stilių (rašyk laisvai)</label>
        <textarea class="input" id="styleAbout" placeholder="Pvz. mėgstu oversized, neutralias spalvas, nemėgstu aukštakulnių, darbe dėviu džinsus…">${esc(S.profile.about)}</textarea></div>
      <button class="btn sm" style="align-self:flex-start" data-act="save-about">Išsaugoti</button>
      <div class="field"><label>Ką stilistė išmoko iš pokalbių</label>
        ${S.profile.learned.length ? `<ul class="learned">${S.profile.learned.map((l, i) => `<li><span>${esc(l)}</span><button class="x" data-act="del-learned" data-i="${i}">Šalinti</button></li>`).join('')}</ul>`
          : `<span class="small muted">Kol kas nieko. Kai pokalbyje pasakysi, kas tau patinka ar ne, stilistė tai įsimins.</span>`}
      </div>
      <span class="small muted">Stilistė taip pat mato, kokius fitus pažymėjai mėgstamais, kuriuos atmetei, ką pati keitei ir ką vilkėjai.</span>
      ${S.profile.learned.length || S.events.length ? `<button class="btn sm ghost" style="align-self:flex-start;padding-left:0" data-act="reset-style">Pamiršti viską, ką išmoko</button>` : ''}
    </div>

    <div class="card set-block">
      ${setHead('03', 'Mano nuotrauka', 'Režimui „Ant manęs“')}
      <div class="row" style="gap:16px;align-items:flex-start">
        ${S.selfPhoto ? `<img class="self-photo" src="${blobURL(S.selfPhoto)}" alt="">` : `<div class="self-photo" style="display:grid;place-items:center"><span class="label">Nėra</span></div>`}
        <div class="stack" style="gap:10px"><span class="small muted">Geriausia pilno ūgio, stovint, gerai apšviesta. Siunčiama į OpenAI tik spaudžiant „Sugeneruoti“.</span>
          <div class="row"><button class="btn sm" data-act="self-photo">${S.selfPhoto ? 'Pakeisti' : 'Įkelti'}</button>${S.selfPhoto ? `<button class="btn sm danger" data-act="del-self">Ištrinti</button>` : ''}</div></div>
      </div>
    </div>

    <div class="card set-block">
      ${setHead('04', 'Orai', `Dabar: ${esc(loc ? (loc.auto ? 'pagal telefono vietą' : loc.name) : 'pagal telefono vietą')}`)}
      <div class="row"><input class="input" id="city" placeholder="Miestas, pvz. Kaunas" style="flex:1"><button class="btn sm" data-act="set-city">OK</button></div>
      <button class="btn sm ghost" style="align-self:flex-start" data-act="auto-loc">Naudoti telefono vietą</button>
    </div>

    <div class="card set-block">
      <div class="switch-row">${setHead('05', 'Iškirpti foną', 'Telefone, nemokamai. Pirmą kartą atsisiunčia ~40 MB.')}
        <label class="switch" style="margin-left:auto"><input type="checkbox" id="bgToggle" ${bg ? 'checked' : ''}><span></span></label></div>
      <div class="switch-row"><div class="set-head"><span class="n" style="visibility:hidden">05</span><div><b>Pataisyti šviesą</b><div class="small muted">Automatiškai pašviesina ir paryškina naujas nuotraukas. Nemokamai.</div></div></div>
        <label class="switch" style="margin-left:auto"><input type="checkbox" id="enhToggle" ${(await getSetting('autoEnhance', true)) ? 'checked' : ''}><span></span></label></div>
    </div>

    <div class="card set-block">
      ${setHead('06', 'Mano kategorijos', 'Pridėk savų, jei trūksta')}
      ${custom.map((c) => `<div class="row"><span style="flex:1">${esc(c.label)} <span class="label">${SLOTS[c.slot].label}</span></span><button class="btn sm danger" data-act="del-cat" data-id="${c.id}">Šalinti</button></div>`).join('')}
      <input class="input" id="newCat" placeholder="Pvz. Kombinezonai">
      <div class="row"><select class="input" id="newCatSlot" style="flex:1">${Object.entries(SLOTS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
        <button class="btn sm" data-act="add-cat">Pridėti</button></div>
    </div>

    <div class="card set-block">
      ${setHead('07', 'Atsarginė kopija', `Išsaugok spintą į iCloud Drive (Failai), kad niekas nedingtų.${usage}`)}
      <div class="row"><button class="btn dark" style="flex:1" data-act="export">Išsaugoti kopiją</button><button class="btn" style="flex:1" data-act="import">Atkurti</button></div>
    </div>

    ${S.items.some((i) => i.demo) ? `<div class="card panel-sand set-block">${setHead('—', 'Bandomieji rūbai', `Spintoje yra ${S.items.filter((i) => i.demo).length} pavyzdinių rūbų`)}
      <button class="btn danger" data-act="del-demo">Ištrinti bandomuosius rūbus</button></div>` : ''}

    <details class="card"><summary>Išplėstiniai nustatymai</summary>
      <div class="stack" style="margin-top:12px">
        <p class="small muted" style="margin:0">Modeliai parenkami automatiškai. Keisk tik jei žinai, ką darai – tuščias laukas grąžina automatinį parinkimą.</p>
        <div class="field"><label>Teksto modelis</label><input class="input" id="textModel" value="${esc(textModel)}"></div>
        <div class="field"><label>Vaizdų modelis</label><input class="input" id="imageModel" value="${esc(imageModel)}"></div>
        <button class="btn" data-act="save-models">Išsaugoti</button>
      </div>
    </details>
    <p class="center label">Fitai · viskas saugoma tik šiame telefone</p>
  </div>`;
}

// ================= Atvaizdavimas =================
async function render() {
  document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === S.tab));
  const v = { fitas: viewFitas, spinta: viewSpinta, megstami: viewMegstami, kalendorius: viewKalendorius, nustatymai: viewNustatymai }[S.tab] || viewFitas;
  view.innerHTML = await v();
  // pasirinktą grupę/rūšį atsukam į matomą vietą
  for (const sel of ['.filters .filt.on', '.subfilters .sub.on']) {
    const on = view.querySelector(sel);
    if (on) {
      const nav = on.parentElement;
      nav.scrollLeft = on.offsetLeft - nav.clientWidth / 2 + on.offsetWidth / 2;
    }
  }
}
async function rerender() {
  const y = window.scrollY;
  await render();
  window.scrollTo(0, y);
}

function updateWeatherPill() {
  const p = $('#weatherPill');
  if (!S.weather) return (p.hidden = true);
  p.hidden = false;
  const d = new Date();
  const mon = ['Sau', 'Vas', 'Kov', 'Bal', 'Geg', 'Bir', 'Lie', 'Rgp', 'Rgs', 'Spl', 'Lap', 'Gru'][d.getMonth()];
  p.textContent = `${mon} ${pad2(d.getDate())} — ${S.weather.temp}°C`;
}

window.addEventListener('hashchange', () => {
  S.tab = location.hash.slice(1) || 'fitas';
  S.selecting = false;
  S.sel.clear();
  closeSheet();
  render().then(() => window.scrollTo(0, 0));
});

// ================= Rūbų įkėlimas =================
const fileInput = $('#fileInput');
let fileTarget = 'items';
fileInput.addEventListener('change', async () => {
  const files = [...fileInput.files];
  fileInput.value = '';
  if (!files.length) return;
  if (fileTarget === 'self') {
    S.selfPhoto = await resize(files[0], 1400, 'image/jpeg', 0.88);
    await setSetting('selfPhoto', S.selfPhoto);
    toast('Nuotrauka išsaugota');
    return rerender();
  }
  if (fileTarget.startsWith('replace:')) {
    const it = itemById(fileTarget.slice(8));
    fileTarget = 'items';
    if (!it) return;
    busyOn('Ruošiama nuotrauka', 'karpomas fonas');
    try {
      const original = await resize(files[0], 1400, 'image/jpeg', 0.85);
      let image = original, cutout = false;
      if (await getSetting('bgRemoval', true)) {
        try { const cut = await removeBackground(original); if (!lastCutBad) { image = await resize(cut, 900, 'image/png'); cutout = true; } else toast('Fono gerai iškirpti nepavyko – palikta originali nuotrauka', 4500); } catch (e) { console.warn('bg', e); }
      }
      if (await getSetting('autoEnhance', true)) { try { image = await autoEnhance(image); } catch (_) {} }
      Object.assign(it, { image, original, cutout });
      delete it.prevImage;
      await db.put('items', it);
      busyOff();
      toast('Nuotrauka atnaujinta');
      openItem(it.id);
      rerender();
    } catch (e) {
      busyOff();
      toast('Nepavyko: ' + e.message);
    }
    return;
  }
  if (fileTarget === 'import') {
    busyOn('Atkuriama spinta');
    try {
      await importAll(files[0]);
      await loadAll();
      toast('Spinta atkurta');
      rerender();
    } catch (e) {
      toast('Nepavyko atkurti: ' + e.message);
    }
    busyOff();
    return;
  }
  const single = files.length === 1;
  if (!S.queueRunning) { S.batch = { total: 0, done: 0, ids: [] }; }
  S.batch.total += files.length;
  for (const f of files) S.queue.push({ id: uid(), file: f, label: 'Laukia', p: 0, preview: URL.createObjectURL(f), single });
  if (S.tab !== 'spinta') location.hash = '#spinta';
  else rerender();
  runQueue();
});

function defaultCategory() {
  if (S.fCat) return S.fCat;
  if (S.fGroup) {
    const c = S.categories.find((c) => c.group === S.fGroup);
    if (c) return c.id;
  }
  return 'tshirts';
}

function stageOf(label = '') {
  if (/DI/.test(label)) return 2;
  if (/šviesa/i.test(label)) return 1;
  return 0;
}
function uploadBannerHTML() {
  const q = S.queue[0];
  const b = S.batch || { total: S.queue.length, done: 0 };
  const st = stageOf(q?.label);
  const steps = ['Karpomas fonas', 'Taisoma šviesa', S.keyOk ? 'DI atpažįsta' : 'Saugoma'];
  return `<div class="up-banner" id="upBanner">
    <div class="row" style="justify-content:space-between"><span class="label">Įkeliama ${Math.min(b.done + 1, b.total)} iš ${b.total}</span><span class="label">${Math.round(((b.done + (q?.p || 0)) / Math.max(1, b.total)) * 100)}%</span></div>
    <ol class="up-steps">${steps.map((t, i) => `<li class="${i < st ? 'done' : i === st ? 'on' : ''}">${t}</li>`).join('')}</ol>
    <div class="bar"><i style="width:${((b.done + (q?.p || 0)) / Math.max(1, b.total)) * 100}%"></i></div>
    <span class="small muted">Gali naršyti toliau – baigus parodysiu visus naujus rūbus peržiūrai.</span></div>`;
}
function updateQueueTile(q) {
  const ban = document.getElementById('upBanner');
  if (ban) ban.outerHTML = uploadBannerHTML();
  const el = document.querySelector(`[data-q="${q.id}"]`);
  if (!el) return;
  el.querySelector('.lbl').textContent = q.label;
  el.querySelector('.bar i').style.width = `${Math.round(q.p * 100)}%`;
}

let bgFailedOnce = false;
async function runQueue() {
  if (S.queueRunning) return;
  S.queueRunning = true;
  let done = 0, lastId = null, wasSingle = false;
  const useKey = S.keyOk;
  while (S.queue.length) {
    const q = S.queue[0];
    try {
      q.label = 'Ruošiama'; q.p = 0.05; updateQueueTile(q);
      const original = await resize(q.file, 1400, 'image/jpeg', 0.85);
      let image = original, cutout = false;
      if (await getSetting('bgRemoval', true)) {
        try {
          q.label = 'Karpomas fonas'; updateQueueTile(q);
          const cut = await removeBackground(original, (lab, p) => { q.label = lab; q.p = 0.1 + p * 0.6; updateQueueTile(q); });
          if (lastCutBad) { q.cutBad = true; } else { image = await resize(cut, 900, 'image/png'); cutout = true; }
        } catch (e) {
          console.warn('bg', e);
          if (!bgFailedOnce) toast('Fono iškirpti nepavyko – paliekama originali nuotrauka');
          bgFailedOnce = true;
        }
      }
      if (await getSetting('autoEnhance', true)) {
        q.label = 'Taisoma šviesa'; q.p = 0.72; updateQueueTile(q);
        try { image = await autoEnhance(image); } catch (e) { console.warn('enhance', e); }
      }
      const item = {
        id: q.id, image, original, cutout, createdAt: Date.now(),
        category: defaultCategory(), name: '', colors: [], seasons: [], occasions: [], warmth: 3, description: '', cutBad: !!q.cutBad,
      };
      if (useKey) {
        q.label = 'DI atpažįsta'; q.p = 0.8; updateQueueTile(q);
        try {
          const t = await tagItem(image, S.categories);
          Object.assign(item, {
            category: t.category || item.category,
            name: t.name || '',
            colors: Array.isArray(t.colors) ? t.colors.slice(0, 4) : [],
            seasons: t.seasons,
            occasions: t.occasions,
            warmth: Math.min(5, Math.max(1, parseInt(t.warmth) || 3)),
            description: t.description || '',
          });
        } catch (e) {
          console.warn('tag', e);
          toast('DI atpažinti nepavyko: ' + e.message);
        }
      }
      await db.put('items', item);
      S.items.push(item);
      done++; lastId = item.id; wasSingle = q.single;
      if (S.batch) { S.batch.done++; S.batch.ids.push(item.id); }
    } catch (e) {
      console.error(e);
      toast('Nepavyko įkelti nuotraukos: ' + e.message);
    }
    URL.revokeObjectURL(q.preview);
    S.queue.shift();
    if (S.tab === 'spinta') await rerender();
  }
  S.queueRunning = false;
  const ids = S.batch?.ids || [];
  S.batch = null;
  const mk = [[50, '50 rūbų spintoje. Tikra kolekcija.'], [25, '25 rūbai – deriniai darosi įdomesni.'], [10, 'Dešimt rūbų. Stilistė jau turi iš ko rinktis.'], [1, 'Pirmas rūbas spintoje. Gera pradžia.']].find(([k]) => S.items.length >= k);
  if (mk && done) milestone('items' + mk[0], mk[1]);
  if (done === 1 && wasSingle) openItem(lastId, true);
  else if (ids.length > 1) openReview(ids);
  else if (done) rerender();
}

// ---- Naujų rūbų peržiūra: viskas viename lange, be atskirų „Išsaugoti“ ----
function openReview(ids) {
  const its = ids.map(itemById).filter(Boolean);
  if (!its.length) return;
  openSheet(`${sheetTop(`Nauji rūbai · ${its.length}`)}
    <div class="stack">
      <p class="small muted" style="margin:0">${S.keyOk ? 'DI jau užpildė pavadinimus ir kategorijas.' : 'Rūbai jau spintoje.'} Pataisyk tik tai, kas neteisinga – pakeitimai saugomi iškart.</p>
      <div class="rv-list">${its.map((it) => `<div class="rv-row" data-id="${it.id}">
        <div class="rv-ph" data-act="item" data-id="${it.id}"><img src="${blobURL(it.image)}" alt=""></div>
        <div class="rv-f"><input class="input rv-name" value="${esc(it.name)}" placeholder="Pavadinimas">
          <select class="input rv-cat">${categorySelect(it.category)}</select></div>
        <button class="rv-del" data-act="rv-del" data-id="${it.id}" aria-label="Ištrinti">×</button></div>`).join('')}</div>
      <button class="btn primary block" data-act="close">Išsaugoti visus</button>
    </div>`);
}

document.addEventListener('change', async (e) => {
  const row = e.target.closest('.rv-row');
  if (!row) return;
  const it = itemById(row.dataset.id);
  if (!it) return;
  if (e.target.classList.contains('rv-name')) it.name = e.target.value.trim();
  if (e.target.classList.contains('rv-cat')) it.category = e.target.value;
  await db.put('items', it);
  if (S.tab === 'spinta') { const y = window.scrollY; view.innerHTML = await viewSpinta(); window.scrollTo(0, y); }
});

// ================= Rūbo kortelė =================
function categorySelect(selected) {
  return GROUPS.map((g) => {
    const cs = S.categories.filter((c) => c.group === g.id);
    if (!cs.length) return '';
    return `<optgroup label="${g.label}">${cs.map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</optgroup>`;
  }).join('');
}

const WARMTH = ['Plonas', 'Lengvas', 'Vidutinis', 'Šiltas', 'Labai'];

function openItem(id, fresh = false) {
  const it = itemById(id);
  if (!it) return;
  const ws = wearStats()[id];
  openSheet(`
    ${sheetTop(fresh ? 'Naujas rūbas' : 'Rūbas')}
    <div class="stack" id="itemForm" data-id="${id}">
      ${it.image ? `<div class="item-hero"><img id="itemImg" src="${blobURL(it.image)}" alt=""></div>`
        : `<div class="item-hero stack" style="gap:10px"><span class="serif" style="font-size:20px">Nuotrauka dingo</span>
            <span class="small muted center">Telefonas jos nebegali perskaityti. Įkelk šio rūbo nuotrauką iš naujo – visa kita informacija liks.</span>
            <button class="btn primary sm" data-act="replace-photo" data-id="${it.id}">Įkelti naują nuotrauką</button></div>`}
      ${it.image ? `<div class="img-tools">
        <button data-act="img-op" data-op="rotL" aria-label="Pasukti į kairę"><svg viewBox="0 0 24 24"><path d="M4 9.5A8 8 0 1 1 5.6 16"/><path d="M4 4.5v5h5"/></svg><span>Pasukti</span></button>
        <button data-act="img-op" data-op="rotR" aria-label="Pasukti į dešinę"><svg viewBox="0 0 24 24"><path d="M20 9.5A8 8 0 1 0 18.4 16"/><path d="M20 4.5v5h-5"/></svg><span>Pasukti</span></button>
        <button data-act="img-op" data-op="flipH" aria-label="Apversti"><svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M9 7 3.5 17H9z"/><path d="M15 7l5.5 10H15z"/></svg><span>Apversti</span></button>
        <button data-act="light" aria-label="Šviesa"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg><span>Šviesa</span></button>
        <button data-act="erase" aria-label="Trinti foną"><svg viewBox="0 0 24 24"><path d="M14.5 4.5 20 10 11 19H6.5L4 16.5z"/><path d="M9.5 9.5 15 15"/><path d="M11 19h9"/></svg><span>Trinti</span></button>
      </div>` : ''}
      ${it.cutBad && !it.cutout ? `<div class="gap-note warn"><span class="label">Fonas neiškirptas</span>Šios nuotraukos fono automatiškai gerai iškirpti nepavyko, todėl palikta originali. Gali nutrinti foną trintuku.</div>` : ''}
      ${fresh ? `<div class="label center">${S.keyOk ? 'DI užpildė informaciją – pataisyk, jei reikia' : 'Užpildyk informaciją (su DI raktu tai vyksta automatiškai)'}</div>` : ''}
      <div class="field"><label>Pavadinimas</label><input class="input" name="name" value="${esc(it.name)}" placeholder="Balta lininė palaidinė"></div>
      <div class="field"><label>Kategorija</label><select class="input" name="category">${categorySelect(it.category)}</select></div>
      <div class="field"><label>Spalvos</label><input class="input" name="colors" value="${esc((it.colors || []).join(', '))}" placeholder="balta, smėlio"></div>
      <div class="field"><label>Sezonai</label><div class="chips wrap" data-group="seasons">${SEASONS.map((s) => `<button class="chip soft ${(it.seasons || []).includes(s) ? 'on' : ''}" data-act="toggle" data-v="${s}">${s}</button>`).join('')}</div></div>
      <div class="field"><label>Progos</label><div class="chips wrap" data-group="occasions">${OCCASIONS.map((s) => `<button class="chip soft ${(it.occasions || []).includes(s) ? 'on' : ''}" data-act="toggle" data-v="${s}">${s}</button>`).join('')}</div></div>
      <div class="field"><label>Kaina, € · nebūtina</label><input class="input" name="price" inputmode="decimal" value="${it.price ?? ''}" placeholder="pvz. 39"></div>
      <div class="field"><label>Šiltumas</label><div class="warmth">${WARMTH.map((e, i) => `<button class="${it.warmth === i + 1 ? 'on' : ''}" data-act="warmth" data-v="${i + 1}">${e}</button>`).join('')}</div></div>
      <div class="wear-stats">
        <div><span class="label">Vilkėta</span><b>${ws ? ws.count : 0}<small> k.</small></b><span class="small muted">${ws ? 'paskutinį kartą ' + fmtDate(ws.last) : 'dar nė karto'}</span></div>
        <div><span class="label">Vienam dėvėjimui</span><b>${it.price ? (it.price / Math.max(1, ws ? ws.count : 0)).toFixed(2) + '<small> €</small>' : '—'}</b><span class="small muted">${it.price ? `kaina ${it.price} €` : 'įrašyk kainą'}</span></div>
      </div>
      <div class="row"><button class="btn sm" style="flex:1" data-act="wear-item" data-id="${it.id}">Dėviu šiandien</button>
        <button class="btn sm" style="flex:1" data-act="style-with" data-id="${it.id}">Fitas su šiuo</button></div>
      <button class="btn primary block" data-act="save-item">Išsaugoti</button>
      <div class="row">
        ${S.pendingEnh[it.id] ? `<button class="btn sm primary" style="flex:1" data-act="enh-compare" data-id="${it.id}">Peržiūrėti pagražinimą</button>`
          : S.enhancing.has(it.id) ? `<button class="btn sm" style="flex:1" disabled>DI gražina fone…</button>`
          : `<button class="btn sm" style="flex:1" data-act="ai-enhance">Pagražinti su DI · ~0,10 $</button>`}
        ${it.prevImage ? `<button class="btn sm ghost" data-act="undo-enhance">Grąžinti ankstesnę</button>` : ''}
      </div>
      <div class="row">
        <button class="btn sm" style="flex:1" data-act="recut">${it.cutout ? 'Grąžinti originalą' : 'Iškirpti foną'}</button>
        <button class="btn sm danger" style="flex:1" data-act="del-item">Ištrinti</button>
      </div>
    </div>`);
}

// ================= Konstruktorius =================
const BOARD = [['outer', 'Paltas'], ['top', 'Viršus'], ['head', 'Galva'], ['bottom', 'Apačia'], ['side', 'Rankinė'], ['legwear', 'Kojinės'], ['shoes', 'Batai']];
function slotBoardHTML() {
  const chosen = [...S.build].map(itemById).filter(Boolean);
  return (S.me.done ? `<div class="sb-fig">${avatarSVG(S.me, { silhouette: true })}</div>` : '') + BOARD.map(([slot, label]) => {
    const its = chosen.filter((i) => slotOf(i) === slot || (slot === 'top' && slotOf(i) === 'onepiece'));
    const has = S.items.some((i) => slotOf(i) === slot || (slot === 'top' && slotOf(i) === 'onepiece'));
    return `<button class="sb-slot sb-${slot} ${its.length ? 'filled' : ''} ${has ? '' : 'empty'}" data-act="sb-go" data-v="${slot}">
      ${its.length ? `<img src="${blobURL(its[0].image)}" alt="">${its.length > 1 ? `<span class="sb-n">+${its.length - 1}</span>` : ''}` : `<span>+ ${label}</span>`}</button>`;
  }).join('');
}

function openBuilder(editId = null) {
  if (!S.items.length) {
    toast('Pirmiausia įkelk rūbų į spintą');
    location.hash = '#spinta';
    return;
  }
  S.buildEditId = editId;
  S.build = new Set(editId ? outfitById(editId)?.itemIds || [] : []);
  const slots = Object.entries(SLOTS).sort((a, b) => a[1].order - b[1].order);
  let rows = '';
  for (const [slot, info] of slots) {
    const its = S.items.filter((i) => slotOf(i) === slot);
    if (!its.length) continue;
    rows += `<div class="field"><label>${info.label}</label><div class="picker-row" data-slot="${slot}">
      ${its.map((it) => tileHTML(it, '', 'pick').replace('class="tile"', `class="tile ${S.build.has(it.id) ? 'sel' : ''}"`)).join('')}
    </div></div>`;
  }
  openSheet(`${sheetTop(editId ? 'Keisti rūbus' : 'Susidėk fitą')}
    <div class="stack"><div class="slot-board" id="slotBoard">${slotBoardHTML()}</div>${rows}
      <button class="btn primary block" data-act="build-save">${editId ? 'Išsaugoti' : 'Sukurti fitą'}</button>
    </div>`);
}

// ================= Dėliok: eilės pagal vietą, smeigtukai, maišymas =================
const DL_ROWS = [
  { slot: 'outer', label: 'Viršutinis', none: 'be striukės', optional: true, h: 120 },
  { slot: 'top', label: 'Viršus', h: 150 },
  { slot: 'onepiece', label: 'Suknelė', h: 230 },
  { slot: 'bottom', label: 'Apačia', h: 160 },
  { slot: 'legwear', label: 'Kojinės, pėdkelnės', none: 'be kojinių', optional: true, h: 110 },
  { slot: 'shoes', label: 'Batai', none: 'be batų', optional: true, h: 84 },
  { slot: 'side', label: 'Aksesuaras', none: 'be aksesuaro', optional: true, h: 84 },
];
const DL = { mode: 'sep', pins: {}, idx: {}, rare: false, el: null };

function dlRows() {
  return DL_ROWS.filter((r) => (DL.mode === 'dress' ? r.slot !== 'top' && r.slot !== 'bottom' : r.slot !== 'onepiece'))
    .map((r) => ({ ...r, items: S.items.filter((i) => i.image && slotOf(i) === r.slot) }))
    .filter((r) => r.items.length);
}

function dlPick(r) {
  // atsitiktinis rūbas; jei įjungta – dažniau tie, kurie seniai vilkėti
  const n = r.items.length + (r.optional ? 1 : 0);
  if (!DL.rare) return Math.floor(Math.random() * n);
  const ws = wearStats();
  const score = (it) => (ws[it.id] ? ws[it.id].count : 0);
  const weights = r.items.map((it) => 1 / (1 + score(it)) ** 1.5);
  if (r.optional) weights.unshift(0.25);
  const tot = weights.reduce((a, b) => a + b, 0);
  let x = Math.random() * tot;
  for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x <= 0) return i; }
  return 0;
}

function openShuffle(fromIds = null) {
  if (S.items.length < 2) { toast('Pirmiausia įkelk bent kelis rūbus'); location.hash = '#spinta'; return; }
  if (fromIds) {
    DL.mode = fromIds.some((id) => itemById(id) && slotOf(itemById(id)) === 'onepiece') ? 'dress' : 'sep';
    DL.idx = {};
    for (const r of dlRows()) {
      const i = r.items.findIndex((it) => fromIds.includes(it.id));
      DL.idx[r.slot] = i < 0 ? 0 : i + (r.optional ? 1 : 0);
    }
  }
  const el = DL.el || document.createElement('div');
  DL.el = el;
  el.className = 'dlk';
  if (!el.isConnected) document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  drawShuffle(!fromIds && !Object.keys(DL.idx).length);
}

function drawShuffle(randomize = false) {
  const el = DL.el;
  const rows = dlRows();
  if (randomize) for (const r of rows) if (!DL.pins[r.slot]) DL.idx[r.slot] = dlPick(r);
  const hasDress = S.items.some((i) => slotOf(i) === 'onepiece');
  el.innerHTML = `<div class="dl-top">
      <button class="x" data-dl="close">Uždaryti</button><span class="dl-title">Dėliok</span>
      <button class="x" data-dl="rare" style="color:${DL.rare ? 'var(--wine)' : ''}">${DL.rare ? '● ' : ''}Retai vilkėti</button></div>
    ${hasDress ? `<div class="dl-mode"><button class="${DL.mode === 'sep' ? 'on' : ''}" data-dl="mode" data-v="sep">Viršus + apačia</button><button class="${DL.mode === 'dress' ? 'on' : ''}" data-dl="mode" data-v="dress">Suknelė</button></div>` : ''}
    ${S.hintDl ? '' : `<div class="dl-hint"><span>Brauk eilę į šoną, <b>prisek</b> tai, kas patinka, ir spausk <b>Maišyti</b>.</span><button class="x" data-dl="hint-x">Supratau</button></div>`}
    <div class="dl-rows">${rows.map((r) => {
      const cards = (r.optional ? [`<div class="dl-card none" data-i="0"><span class="label">${r.none}</span></div>`] : [])
        .concat(r.items.map((it, i) => `<div class="dl-card" data-i="${i + (r.optional ? 1 : 0)}" data-id="${it.id}"><img src="${blobURL(it.image)}" alt="" draggable="false"></div>`));
      return `<div class="dl-row ${DL.pins[r.slot] ? 'pinned' : ''}" data-slot="${r.slot}">
        <div class="dl-head"><span class="label">${r.label}</span><button class="dl-pin" data-dl="pin" data-slot="${r.slot}">${DL.pins[r.slot] ? 'Prisegta' : 'Prisegti'}</button></div>
        <div class="dl-track" style="--h:${r.h}px">${cards.join('')}</div></div>`;
    }).join('')}</div>
    <div class="dl-foot"><button class="btn" data-dl="shuffle">Maišyti</button><button class="btn primary" data-dl="save">Išsaugoti fitą</button></div>`;
  // atsukam į pasirinktus
  el.querySelectorAll('.dl-row').forEach((row) => {
    const tr = row.querySelector('.dl-track');
    const i = DL.idx[row.dataset.slot] || 0;
    const card = tr.children[i];
    if (card) tr.scrollLeft = card.offsetLeft - (tr.clientWidth - card.offsetWidth) / 2;
    let t;
    tr.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const mid = tr.scrollLeft + tr.clientWidth / 2;
        let best = 0, bd = 1e9;
        [...tr.children].forEach((c, k) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = k; } });
        DL.idx[row.dataset.slot] = best;
        tr.querySelectorAll('.dl-card').forEach((c, k) => c.classList.toggle('cur', k === best));
      }, 90);
    }, { passive: true });
    tr.querySelectorAll('.dl-card').forEach((c, k) => c.classList.toggle('cur', k === i));
  });
}

function shuffleScroll() {
  const rows = dlRows();
  for (const r of rows) {
    if (DL.pins[r.slot]) continue;
    let i = dlPick(r);
    if (i === DL.idx[r.slot] && r.items.length > 1) i = dlPick(r);
    DL.idx[r.slot] = i;
    const tr = DL.el.querySelector(`.dl-row[data-slot="${r.slot}"] .dl-track`);
    const card = tr?.children[i];
    if (card) tr.scrollTo({ left: card.offsetLeft - (tr.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' });
  }
}

function closeShuffle() {
  DL.el?.remove();
  document.body.style.overflow = '';
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-dl]');
  if (!b || !DL.el?.contains(b)) return;
  const a = b.dataset.dl;
  if (a === 'close') return closeShuffle();
  if (a === 'pin') { DL.pins[b.dataset.slot] = !DL.pins[b.dataset.slot]; const row = b.closest('.dl-row'); row.classList.toggle('pinned'); b.textContent = DL.pins[b.dataset.slot] ? 'Prisegta' : 'Prisegti'; return; }
  if (a === 'rare') { DL.rare = !DL.rare; toast(DL.rare ? 'Dažniau rodys seniai vilkėtus rūbus' : 'Visi rūbai vienodai'); return drawShuffle(); }
  if (a === 'mode') { DL.mode = b.dataset.v; return drawShuffle(true); }
  if (a === 'shuffle') return shuffleScroll();
  if (a === 'hint-x') { S.hintDl = true; setSetting('hintDl', true); b.closest('.dl-hint').remove(); return; }
  if (a === 'save') {
    const ids = [];
    DL.el.querySelectorAll('.dl-row').forEach((row) => {
      const c = row.querySelector('.dl-track').children[DL.idx[row.dataset.slot] || 0];
      if (c?.dataset.id) ids.push(c.dataset.id);
    });
    if (!ids.length) return toast('Pasirink bent vieną rūbą');
    const o = { id: uid(), title: 'Sudėliotas derinys', vibe: '', itemIds: ids, createdAt: Date.now(), favorite: false, source: 'manual', renders: {} };
    await saveOutfit(o);
    await setCurrent(o.id);
    logEvent(`Pati susidėliojo: ${itemNames(ids).join(' + ')}`);
    closeShuffle();
    toast('Fitas išsaugotas');
    if (S.tab !== 'fitas') location.hash = '#fitas'; else rerender();
  }
});

// ================= Veiksmai =================
async function saveOutfit(o) {
  await db.put('outfits', o);
  const i = S.outfits.findIndex((x) => x.id === o.id);
  if (i >= 0) S.outfits[i] = o;
  else S.outfits.push(o);
}

async function setCurrent(id) {
  S.currentId = id;
  S.renderTab = 'flat';
  await setSetting('currentOutfit', id);
}

async function doStyle(vibe, exclude = [], must = []) {
  if (!S.keyOk) return toast('Įjunk DI stilistę – įvesk raktą skiltyje „Daugiau“');
  if (S.items.length < 2) return toast('Įkelk bent kelis rūbus į spintą');
  S.styling = true;
  S.lastVibe = vibe;
  await rerender();
  try {
    const r = await styleOutfit({
      vibe, items: S.items, categories: S.categories,
      weather: weatherForAI(S.weather), wearStats: wearStats(), exclude, style: styleCtx(), must,
    });
    const o = {
      id: uid(), title: r.title, explanation: r.explanation, tip: r.tip, vibe, gap: r.gap || '',
      itemIds: r.itemIds, createdAt: Date.now(), favorite: false, source: 'ai', renders: {},
    };
    await saveOutfit(o);
    await setCurrent(o.id);
  } catch (e) {
    toast(e.message === 'NO_KEY' ? 'Reikia API rakto' : 'Klaida: ' + e.message, 5000);
  }
  S.styling = false;
  await rerender();
  const card = document.querySelector('.outfit-card');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const actions = {
  close: closeSheet,
  add() {
    fileTarget = 'items';
    fileInput.multiple = true;
    fileInput.click();
  },
  'vibe-idea'(el) {
    $('#vibe').value = el.dataset.v;
  },
  style() {
    doStyle(($('#vibe')?.value || '').trim());
  },
  restyle(el) {
    const o = outfitById(el.dataset.id);
    logEvent(`Atmetė fitą ir paprašė kito: ${itemNames(o.itemIds).join(' + ')}`);
    doStyle(o.vibe || '', o.itemIds);
  },
  rtab(el) {
    S.renderTab = el.dataset.v;
    rerender();
  },
  async render(el) {
    const o = outfitById(S.currentId);
    if (o) doRender(o, el.dataset.mode);
  },
  async fav(el) {
    const o = outfitById(el.dataset.id);
    o.favorite = !o.favorite;
    await saveOutfit(o);
    if (o.favorite) logEvent(`Pažymėjo mėgstamu: ${itemNames(o.itemIds).join(' + ')}`);
    toast(o.favorite ? 'Pridėta prie mėgstamų' : 'Pašalinta iš mėgstamų');
    closeSheet();
    rerender();
  },
  async wear(el, _e, date = ymd()) {
    const o = outfitById(el.dataset.id);
    if (S.worn.some((w) => w.outfitId === o.id && w.date === date)) return toast('Jau pažymėta');
    const w = { id: uid(), date, outfitId: o.id, itemIds: [...o.itemIds] };
    await db.put('worn', w);
    S.worn.push(w);
    logEvent(`Vilkėjo: ${itemNames(o.itemIds).join(' + ')}`);
    toast('Pažymėta kalendoriuje');
    milestone('wear1', 'Pirmas užfiksuotas fitas. Nuo šiol stilistė primins pamirštus rūbus.');
    closeSheet();
    rerender();
  },
  builder(el) {
    openBuilder(el.dataset.id || null);
  },
  shuffle(el) {
    openShuffle(el.dataset.id ? outfitById(el.dataset.id)?.itemIds : null);
  },
  pick(el) {
    const id = el.dataset.id;
    if (S.build.has(id)) {
      S.build.delete(id);
      el.classList.remove('sel');
      const b = $('#slotBoard');
      if (b) b.innerHTML = slotBoardHTML();
      return;
    }
    S.build.add(id);
    el.classList.add('sel');
    const b = $('#slotBoard');
    if (b) b.innerHTML = slotBoardHTML();
  },
  'sb-go'(el) {
    let slot = el.dataset.v;
    let row = document.querySelector(`.picker-row[data-slot="${slot}"]`);
    if (!row && slot === 'top') row = document.querySelector('.picker-row[data-slot="onepiece"]');
    if (!row) return toast('Šiai vietai spintoje rūbų dar nėra');
    row.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.parentElement.classList.add('flash');
    setTimeout(() => row.parentElement.classList.remove('flash'), 900);
  },
  async 'build-save'() {
    if (!S.build.size) return toast('Pasirink bent vieną rūbą');
    const ids = [...S.build];
    if (S.buildEditId) {
      const o = outfitById(S.buildEditId);
      o.itemIds = ids;
      o.renders = {};
      await saveOutfit(o);
      await setCurrent(o.id);
    } else {
      const o = { id: uid(), title: 'Mano derinys', vibe: '', itemIds: ids, createdAt: Date.now(), favorite: false, source: 'manual', renders: {} };
      await saveOutfit(o);
      await setCurrent(o.id);
    }
    closeSheet();
    if (S.tab !== 'fitas') location.hash = '#fitas';
    else rerender();
  },
  fgroup(el) {
    S.fGroup = el.dataset.v;
    S.fCat = null;
    rerender();
  },
  fcat(el) {
    S.fCat = S.fCat === el.dataset.v ? null : el.dataset.v;
    rerender();
  },
  item(el) {
    openItem(el.dataset.id);
  },
  toggle(el) {
    el.classList.toggle('on');
  },
  warmth(el) {
    el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
  },
  async 'save-item'() {
    const f = $('#itemForm');
    const it = itemById(f.dataset.id);
    it.name = f.querySelector('[name=name]').value.trim();
    it.category = f.querySelector('[name=category]').value;
    it.colors = f.querySelector('[name=colors]').value.split(',').map((s) => s.trim()).filter(Boolean);
    it.seasons = [...f.querySelectorAll('[data-group=seasons] .on')].map((b) => b.dataset.v);
    it.occasions = [...f.querySelectorAll('[data-group=occasions] .on')].map((b) => b.dataset.v);
    const w = f.querySelector('.warmth .on');
    it.warmth = w ? +w.dataset.v : it.warmth;
    const pr = parseFloat((f.querySelector('[name=price]').value || '').replace(',', '.'));
    it.price = pr > 0 ? Math.round(pr * 100) / 100 : null;
    await db.put('items', it);
    closeSheet();
    toast('Išsaugota');
    rerender();
  },
  async 'img-op'(el) {
    const it = itemById($('#itemForm').dataset.id);
    if (!it || el.disabled) return;
    const tools = document.querySelectorAll('.img-tools button');
    tools.forEach((b) => (b.disabled = true));
    try {
      const op = el.dataset.op;
      const sameOriginal = it.original === it.image;
      it.image = await transformImage(it.image, op);
      if (it.original) it.original = sameOriginal ? it.image : await transformImage(it.original, op);
      await db.put('items', it);
      $('#itemImg').src = blobURL(it.image);
    } catch (e) {
      toast('Nepavyko: ' + e.message);
    }
    tools.forEach((b) => (b.disabled = false));
    if (S.tab === 'spinta' || S.tab === 'kalendorius') {
      const y = window.scrollY;
      view.innerHTML = await ({ spinta: viewSpinta, kalendorius: viewKalendorius })[S.tab]();
      window.scrollTo(0, y);
    }
  },
  async recut(el) {
    const it = itemById($('#itemForm').dataset.id);
    if (it.cutout) {
      it.image = it.original;
      it.cutout = false;
    } else {
      busyOn('Karpomas fonas', 'kelios sekundės');
      try {
        const cut = await removeBackground(it.original);
        if (lastCutBad) { busyOff(); toast('Fono gerai iškirpti nepavyko – palikta originali nuotrauka. Gali nutrinti trintuku.', 5000); return; }
        it.image = await resize(cut, 900, 'image/png');
        it.cutout = true;
        busyOff();
      } catch (e) {
        busyOff();
        console.warn('bg', e);
        toast('Fono iškirpti nepavyko. Patikrink internetą ir bandyk dar kartą.', 4000);
        el.disabled = false;
        el.textContent = 'Iškirpti foną';
        return;
      }
    }
    await db.put('items', it);
    openItem(it.id);
    rerender();
  },
  async 'del-item'() {
    const id = $('#itemForm').dataset.id;
    if (!confirm('Ištrinti šį rūbą iš spintos?')) return;
    await db.del('items', id);
    S.items = S.items.filter((i) => i.id !== id);
    closeSheet();
    toast('Ištrinta');
    rerender();
  },
  'open-outfit'(el) {
    const o = outfitById(el.dataset.id);
    openSheet(`${sheetTop(`Nº ${lookNo(o)}`)}
      <div class="stack">
        <div class="outfit-title">${esc(o.title || 'Fitas')}</div>
        ${flatlayHTML(o.itemIds).replace('class="flatlay', 'style="margin:0" class="flatlay')}
        ${o.explanation ? `<div class="quote" style="margin:0">„${esc(o.explanation)}“</div>` : ''}
        <button class="btn primary block" data-act="show-outfit" data-id="${o.id}">Rodyti pagrindiniame ekrane</button>
        <div class="row">
          <button class="btn" style="flex:1" data-act="wear" data-id="${o.id}">Vilkėsiu šiandien</button>
          <button class="btn" style="flex:1" data-act="fav" data-id="${o.id}">${o.favorite ? 'Nebemėgstu' : 'Į mėgstamus'}</button>
        </div>
        <button class="btn sm ghost" data-act="del-outfit" data-id="${o.id}">Ištrinti fitą</button>
      </div>`);
  },
  async 'show-outfit'(el) {
    await setCurrent(el.dataset.id);
    closeSheet();
    location.hash = '#fitas';
  },
  async 'del-outfit'(el) {
    if (!confirm('Ištrinti šį fitą?')) return;
    await db.del('outfits', el.dataset.id);
    S.outfits = S.outfits.filter((o) => o.id !== el.dataset.id);
    if (S.currentId === el.dataset.id) S.currentId = null;
    closeSheet();
    rerender();
  },
  cal(el) {
    const m = S.calMonth;
    S.calMonth = new Date(m.getFullYear(), m.getMonth() + +el.dataset.v, 1);
    rerender();
  },
  day(el) {
    const date = el.dataset.d;
    const entries = S.worn.filter((w) => w.date === date);
    const recent = [...S.outfits].sort((a, b) => (b.favorite - a.favorite) || b.createdAt - a.createdAt).slice(0, 12);
    openSheet(`${sheetTop(fmtDate(date))}
      <div class="stack">
        ${entries.length ? entries.map((w) => `<div class="stack">${flatlayHTML(w.itemIds, true)}
          <button class="btn sm danger" data-act="unwear" data-id="${w.id}">Pašalinti iš kalendoriaus</button></div>`).join('') : `<div class="label center">Šią dieną fitas nepažymėtas</div>`}
        ${recent.length ? `<div class="section-head"><h3>Pridėti fitą šiai dienai</h3></div>
          <div class="fav-grid">${recent.map((o) => favCard(o).replace('data-act="open-outfit"', `data-act="wear-on" data-d="${date}"`)).join('')}</div>` : ''}
      </div>`);
  },
  'wear-on'(el, e) {
    actions.wear(el, e, el.dataset.d);
  },
  async unwear(el) {
    await db.del('worn', el.dataset.id);
    S.worn = S.worn.filter((w) => w.id !== el.dataset.id);
    closeSheet();
    rerender();
  },
  async 'save-key'(el) {
    const k = $('#apiKey').value.trim();
    if (!k) return toast('Įklijuok raktą');
    el.disabled = true;
    el.textContent = 'Tikrinama…';
    let ok = false;
    try { ok = await testKey(k); } catch (_) {}
    if (!ok) {
      el.disabled = false;
      el.textContent = 'Išsaugoti raktą';
      return toast('Raktas neveikia. Patikrink, ar nukopijavai visą.', 4000);
    }
    await setSetting('apiKey', k);
    S.keyOk = true;
    toast('DI stilistė įjungta');
    rerender();
  },
  async 'del-key'() {
    if (!confirm('Pašalinti API raktą iš telefono?')) return;
    await db.del('kv', 'apiKey');
    S.keyOk = false;
    rerender();
  },
  'self-photo'() {
    fileTarget = 'self';
    fileInput.multiple = false;
    fileInput.click();
  },
  async 'del-self'() {
    await db.del('kv', 'selfPhoto');
    S.selfPhoto = null;
    rerender();
  },
  async 'set-city'() {
    const name = $('#city').value.trim();
    if (!name) return;
    try {
      const c = await findCity(name);
      await setSetting('location', { ...c, auto: false });
      toast(`Orai: ${c.name}`);
      loadWeather();
      rerender();
    } catch (e) {
      toast(e.message);
    }
  },
  async 'auto-loc'() {
    await setSetting('location', { auto: true, lat: 54.6872, lon: 25.2797, name: 'Tavo vieta' });
    await loadWeather();
    rerender();
  },
  async 'add-cat'() {
    const label = $('#newCat').value.trim();
    if (!label) return toast('Įrašyk pavadinimą');
    const c = { id: 'c_' + uid(), label, group: 'custom', slot: $('#newCatSlot').value, custom: true };
    S.categories.push(c);
    await setSetting('customCategories', S.categories.filter((x) => x.custom));
    toast('Kategorija pridėta');
    rerender();
  },
  async 'del-cat'(el) {
    if (S.items.some((i) => i.category === el.dataset.id)) return toast('Šioje kategorijoje yra rūbų – pirmiau juos perkelk');
    S.categories = S.categories.filter((c) => c.id !== el.dataset.id);
    await setSetting('customCategories', S.categories.filter((x) => x.custom));
    rerender();
  },
  async export(el) {
    el.disabled = true;
    el.textContent = 'Ruošiama…';
    try {
      const blob = await exportAll();
      const name = `fitai-kopija-${ymd()}.json`;
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Fitai kopija' });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
      await setSetting('lastBackup', Date.now());
    } catch (e) {
      if (e.name !== 'AbortError') toast('Nepavyko: ' + e.message);
    }
    el.disabled = false;
    el.textContent = 'Išsaugoti kopiją';
  },
  import() {
    fileTarget = 'import';
    fileInput.multiple = false;
    fileInput.click();
  },
  zoom(el, e) {
    if (e.target.closest('.fl-item')) return;
    const o = outfitById(el.dataset.o);
    if (!o) return;
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<div class="lb-top"><span class="label">Nº ${lookNo(o)} · ${esc(o.title || '')}</span><button class="x" data-act="lb-close">Uždaryti</button></div>
      ${flatlayHTML(o.itemIds, false, '', { big: true, static: true })}`;
    lb.addEventListener('click', (ev) => { if (!ev.target.closest('.lb-top') || ev.target.closest('[data-act=lb-close]')) lb.remove(); });
    document.body.appendChild(lb);
  },
  'zoom-img'(el) {
    const o = outfitById(el.dataset.o);
    const blob = o?.renders?.[el.dataset.mode];
    if (!blob) return;
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<div class="lb-top"><span class="label">Nº ${lookNo(o)} · ${el.dataset.mode === 'me' ? 'Ant manęs' : 'Manekenas'}</span><button class="x">Uždaryti</button></div>
      <div class="lb-img"><img src="${blobURL(blob)}" alt=""></div>`;
    lb.addEventListener('click', () => lb.remove());
    document.body.appendChild(lb);
  },
  'lb-close'() {
    document.querySelector('.lightbox')?.remove();
  },
  'ofit-item'(el) {
    const o = outfitById(el.dataset.o);
    const it = itemById(el.dataset.id);
    if (!o || !it) return;
    const slot = slotOf(it);
    const alts = S.items.filter((i) => slotOf(i) === slot && i.id !== it.id && !o.itemIds.includes(i.id));
    openSheet(`${sheetTop('Keisti rūbą')}
      <div class="stack">
        <div class="swap-cur">
          <div class="sc-ph">${it.image ? `<img src="${blobURL(it.image)}" alt="">` : ''}</div>
          <div class="sc-info">
            <span class="label">${esc(catById(it.category)?.label || '')} · dabar fite</span>
            <b>${esc(it.name || catById(it.category)?.label || 'Rūbas')}</b>
            <div class="row" style="flex-wrap:wrap">
              <button class="btn sm danger" data-act="ofit-remove" data-o="${o.id}" data-id="${it.id}">Išimti</button>
              <button class="btn sm" data-act="item" data-id="${it.id}">Kortelė</button>
            </div>
          </div>
        </div>
        <div class="section-head"><h3>Pakeisti į</h3><span class="label">${SLOTS[slot].label}</span></div>
        ${alts.length ? `<div class="grid">${alts.map((a) => tileHTML(a, '', 'ofit-swap').replace('data-act="ofit-swap"', `data-act="ofit-swap" data-o="${o.id}" data-from="${it.id}"`)).join('')}</div>`
          : `<div class="label center">Spintoje daugiau rūbų šiai vietai nėra</div>`}
      </div>`);
  },
  async 'ofit-swap'(el) {
    const o = outfitById(el.dataset.o);
    o.itemIds = o.itemIds.map((id) => (id === el.dataset.from ? el.dataset.id : id));
    logEvent(`Fite pati pakeitė „${itemNames([el.dataset.from])[0]}“ į „${itemNames([el.dataset.id])[0]}“`);
    await afterOutfitEdit(o, 'Rūbas pakeistas');
  },
  async 'ofit-remove'(el) {
    const o = outfitById(el.dataset.o);
    if (o.itemIds.length <= 1) return toast('Fite turi likti bent vienas rūbas');
    o.itemIds = o.itemIds.filter((id) => id !== el.dataset.id);
    logEvent(`Iš fito pati išėmė „${itemNames([el.dataset.id])[0]}“`);
    await afterOutfitEdit(o, 'Rūbas išimtas');
  },
  'ofit-add'(el) {
    const o = outfitById(el.dataset.o);
    const slots = Object.entries(SLOTS).sort((a, b) => a[1].order - b[1].order);
    let rows = '';
    for (const [slot, info] of slots) {
      const its = S.items.filter((i) => slotOf(i) === slot && !o.itemIds.includes(i.id));
      if (!its.length) continue;
      rows += `<div class="field"><label>${info.label}</label><div class="picker-row">
        ${its.map((it) => tileHTML(it, '', 'ofit-addpick').replace('data-act="ofit-addpick"', `data-act="ofit-addpick" data-o="${o.id}"`)).join('')}</div></div>`;
    }
    openSheet(`${sheetTop('Pridėti rūbą')}<div class="stack">${rows || '<div class="label center">Visi rūbai jau šiame fite</div>'}</div>`);
  },
  async 'ofit-addpick'(el) {
    const o = outfitById(el.dataset.o);
    if (!o.itemIds.includes(el.dataset.id)) o.itemIds.push(el.dataset.id);
    logEvent(`Į fitą pati pridėjo „${itemNames([el.dataset.id])[0]}“`);
    await afterOutfitEdit(o, 'Rūbas pridėtas');
  },
  noop() {},
  async 'wear-item'(el) {
    const id = el.dataset.id;
    const today = ymd();
    if (S.worn.some((w) => w.date === today && w.itemIds.includes(id))) return toast('Šiandien jau pažymėta');
    const w = { id: uid(), date: today, outfitId: null, itemIds: [id] };
    await db.put('worn', w);
    S.worn.push(w);
    logEvent(`Vilkėjo: ${itemNames([id]).join('')}`);
    toast('Pažymėta kalendoriuje');
    openItem(id);
    rerender();
  },
  'style-with'(el) {
    const id = el.dataset.id;
    if (!S.keyOk) return toast('Tam reikia DI rakto (skiltis „Daugiau“)');
    closeSheet();
    location.hash = '#fitas';
    setTimeout(() => doStyle(`Derinys su šiuo rūbu: ${itemNames([id])[0]}`, [], [id]), 50);
  },
  async 'rv-del'(el) {
    const id = el.dataset.id;
    await db.del('items', id);
    S.items = S.items.filter((i) => i.id !== id);
    el.closest('.rv-row').remove();
    toast('Ištrinta');
    if (S.tab === 'spinta') { const y = window.scrollY; view.innerHTML = await viewSpinta(); window.scrollTo(0, y); }
  },
  onboard(el) {
    startOnboarding(el.dataset.v || 0);
  },
  coach() {
    startCoach();
  },
  'replace-photo'(el) {
    fileTarget = 'replace:' + el.dataset.id;
    fileInput.multiple = false;
    fileInput.click();
  },
  async 'ai-enhance'() {
    const it = itemById($('#itemForm').dataset.id);
    if (!it) return;
    if (!S.keyOk) return toast('Reikia DI rakto (skiltis „Daugiau“)');
    if (S.enhancing.has(it.id)) return;
    S.enhancing.add(it.id);
    openItem(it.id);
    toast('DI gražina fone – gali naršyti toliau', 3500);
    try {
      let out = await enhanceItemPhoto(it.image, it.name);
      // jei DI grąžino baltą foną – iškerpam nemokamai telefone
      try {
        const bm = await createImageBitmap(out);
        const c = document.createElement('canvas');
        c.width = 4; c.height = 4;
        const x = c.getContext('2d');
        x.drawImage(bm, 0, 0, 4, 4);
        if (x.getImageData(0, 0, 1, 1).data[3] > 200) out = await removeBackground(out);
      } catch (_) {}
      out = await trimTransparent(out, 8);
      const image = await resize(out, 900, 'image/png');
      const shift = await colorShift(it.image, image);
      S.pendingEnh[it.id] = { image, warn: shift > 38 };
      S.enhancing.delete(it.id);
      const open = $('#itemForm')?.dataset.id === it.id;
      if (open) openCompare(it.id);
      else toast('Pagražinimas paruoštas', 9000, { label: 'Peržiūrėti', fn: () => openCompare(it.id) });
    } catch (e) {
      S.enhancing.delete(it.id);
      toast('Pagražinti nepavyko: ' + e.message, 6000);
      if ($('#itemForm')?.dataset.id === it.id) openItem(it.id);
    }
  },
  'enh-compare'(el) {
    openCompare(el.dataset.id);
  },
  async 'enh-keep'(el) {
    const it = itemById(el.dataset.id);
    const p = S.pendingEnh[el.dataset.id];
    if (!it || !p) return closeSheet();
    it.prevImage = it.image;
    it.image = p.image;
    it.cutout = true;
    delete S.pendingEnh[it.id];
    await db.put('items', it);
    toast('Išsaugota nauja nuotrauka');
    openItem(it.id);
    rerender();
  },
  'enh-drop'(el) {
    delete S.pendingEnh[el.dataset.id];
    toast('Palikta sena nuotrauka');
    openItem(el.dataset.id);
  },
  light() {
    const id = $('#itemForm')?.dataset.id;
    if (id) openLight(id);
  },
  async 'undo-enhance'() {
    const it = itemById($('#itemForm').dataset.id);
    if (!it?.prevImage) return;
    it.image = it.prevImage;
    delete it.prevImage;
    await db.put('items', it);
    toast('Grąžinta ankstesnė nuotrauka');
    openItem(it.id);
    rerender();
  },
  erase() {
    const id = $('#itemForm')?.dataset.id;
    if (id) openEraser(id);
  },
  async 'save-about'() {
    S.profile.about = $('#styleAbout').value.trim();
    await saveProfile();
    toast('Stilius išsaugotas');
  },
  async 'del-learned'(el) {
    S.profile.learned.splice(+el.dataset.i, 1);
    await saveProfile();
    rerender();
  },
  async 'reset-style'() {
    if (!confirm('Ištrinti viską, ką stilistė išmoko apie tavo skonį? Tavo paties aprašymas liks.')) return;
    S.profile.learned = [];
    S.events = [];
    await saveProfile();
    await setSetting('styleEvents', []);
    toast('Stilistė pamiršo išmoktus dalykus');
    rerender();
  },
  async 'clear-notes'(el) {
    const o = outfitById(el.dataset.id);
    o.imageNotes = '';
    await saveOutfit(o);
    toast('Vaizdo pastabos išvalytos');
    rerender();
  },
  'chat-idea'(el) {
    sendChat(el.dataset.id, el.dataset.v);
  },
  'select-mode'() {
    S.selecting = !S.selecting;
    S.sel.clear();
    rerender();
  },
  'sel-item'(el) {
    const id = el.dataset.id;
    if (S.sel.has(id)) S.sel.delete(id);
    else S.sel.add(id);
    rerender();
  },
  'sel-all'() {
    const visible = [...document.querySelectorAll('.grid .tile[data-id]')].map((t) => t.dataset.id);
    const all = visible.every((id) => S.sel.has(id));
    visible.forEach((id) => (all ? S.sel.delete(id) : S.sel.add(id)));
    rerender();
  },
  async 'sel-del'() {
    const n = S.sel.size;
    if (!n || !confirm(`Ištrinti ${n} ${plural(n, 'rūbą', 'rūbus', 'rūbų')} iš spintos? To atšaukti nebus galima.`)) return;
    for (const id of S.sel) await db.del('items', id);
    S.items = S.items.filter((i) => !S.sel.has(i.id));
    S.sel.clear();
    S.selecting = false;
    toast(`Ištrinta: ${n}`);
    rerender();
  },
  'sel-move'() {
    const n = S.sel.size;
    openSheet(`${sheetTop('Keisti kategoriją')}
      <div class="stack">
        <div class="label">${n} ${plural(n, 'rūbas', 'rūbai', 'rūbų')}</div>
        <div class="field"><label>Nauja kategorija</label><select class="input" id="moveCat">${categorySelect(S.fCat || '')}</select></div>
        <button class="btn primary block" data-act="sel-move-save">Perkelti</button>
      </div>`);
  },
  async 'sel-move-save'() {
    const cat = $('#moveCat').value;
    for (const id of S.sel) {
      const it = itemById(id);
      if (it) { it.category = cat; await db.put('items', it); }
    }
    const n = S.sel.size;
    S.sel.clear();
    S.selecting = false;
    closeSheet();
    toast(`Perkelta: ${n} → ${catById(cat).label}`);
    rerender();
  },
  async 'del-demo'() {
    if (!confirm('Ištrinti visus bandomuosius rūbus ir su jais sukurtus fitus?')) return;
    const demoIds = new Set(S.items.filter((i) => i.demo).map((i) => i.id));
    for (const id of demoIds) await db.del('items', id);
    for (const o of S.outfits.filter((o) => o.itemIds.some((id) => demoIds.has(id)))) await db.del('outfits', o.id);
    for (const w of S.worn.filter((w) => w.itemIds.some((id) => demoIds.has(id)))) await db.del('worn', w.id);
    await loadAll();
    toast('Bandomieji rūbai ištrinti');
    rerender();
  },
  async 'save-models'() {
    const cur = await modelsInUse();
    const t = $('#textModel').value.trim();
    const i = $('#imageModel').value.trim();
    if (!t) await setSetting('textModel', null);
    else if (t !== cur.text) await setSetting('textModel', t);
    if (!i) await setSetting('imageModel', null);
    else if (i !== cur.image) await setSetting('imageModel', i);
    toast('Išsaugota');
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (fn) {
    e.preventDefault();
    fn(el, e);
  }
});
document.addEventListener('change', async (e) => {
  if (e.target.id === 'enhToggle') {
    await setSetting('autoEnhance', e.target.checked);
    toast(e.target.checked ? 'Naujos nuotraukos bus pataisomos' : 'Nuotraukos nebus pataisomos');
  }
  if (e.target.id === 'bgToggle') {
    await setSetting('bgRemoval', e.target.checked);
    toast(e.target.checked ? 'Fonas bus iškerpamas' : 'Fonas nebus iškerpamas');
  }
});
$('#weatherPill').addEventListener('click', () => (location.hash = '#fitas'));

// ================= Paleidimas =================
async function loadAll() {
  try {
    const broken = await migrateBlobs();
    if (broken) console.warn('Sugadintų nuotraukų:', broken);
  } catch (e) {
    console.warn('migrate', e);
  }
  S.items = await db.all('items');
  // sugadintą nuotrauką bandom pakeisti originalia
  const ok = (b) => b instanceof Blob && b.size > 0;
  for (const it of S.items) {
    if (ok(it.image)) continue;
    it.image = ok(it.original) ? it.original : null;
    if (it.image) it.cutout = false;
    await db.put('items', it);
  }
  S.outfits = await db.all('outfits');
  S.worn = await db.all('worn');
  const custom = (await getSetting('customCategories')) || [];
  S.categories = [...DEFAULT_CATEGORIES, ...custom];
  S.currentId = await getSetting('currentOutfit');
  S.keyOk = await hasKey();
  S.selfPhoto = await getSetting('selfPhoto');
  S.profile = { about: '', learned: [], ...((await getSetting('styleProfile')) || {}) };
  S.events = (await getSetting('styleEvents')) || [];
  S.me = (await getSetting('me')) || {};
  S.hintDl = !!(await getSetting('hintDl'));
}

async function loadWeather() {
  try {
    S.weather = await getWeather();
    updateWeatherPill();
    if (S.tab === 'fitas') rerender();
  } catch (e) {
    console.warn('weather', e);
  }
}

function startOnboarding(startAt = 0) {
  const first = !S.me.done;
  runOnboarding({
    me: S.me, startAt, canAI: S.keyOk,
    ai: { analyzeSelfie, analyzeBody, createAvatar, prepPhoto: (f) => resize(f, 1400, 'image/jpeg', 0.88) },
    onSave: async (me) => {
      S.me = me;
      await setSetting('me', me);
      if (me.photo && me.photo !== S.selfPhoto) { S.selfPhoto = me.photo; await setSetting('selfPhoto', me.photo); }
      await rerender();
      if (first || !(await getSetting('coachDone'))) {
        setTimeout(() => startCoach(true), 350);
      } else toast('Profilis atnaujintas');
    },
  });
}

function startCoach(first = false) {
  runCoach({
    name: S.me.name,
    go: async (tab) => {
      if (S.tab === tab) return;
      location.hash = '#' + tab;
      await new Promise((r) => setTimeout(r, 400));
    },
    onDone: async (go) => { await setSetting('coachDone', true); if (go) location.hash = '#spinta'; },
  });
}

async function init() {
  S.tab = location.hash.slice(1) || 'fitas';
  startTipRotation();
  await loadAll();
  await render();
  if (!S.me.done) startOnboarding(0);
  requestPersist();
  loadWeather();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('sw', e));
  }
}
init();
