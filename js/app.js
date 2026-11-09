import { db, getSetting, setSetting, uid, requestPersist, exportAll, importAll } from './db.js';
import { DEFAULT_CATEGORIES, GROUPS, SLOTS, SEASONS, OCCASIONS, VIBE_IDEAS } from './data.js';
import { resize, removeBackground, blobURL, transformImage } from './images.js';
import { tagItem, styleOutfit, renderOutfit, chatAboutOutfit, hasKey, testKey, modelsInUse } from './ai.js';
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
function toast(msg, ms = 2800) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
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

const loadingHTML = (text) => `<div class="loading"><span class="serif">${text}</span><div class="loader"></div></div>`;

function tileHTML(it, extra = '', act = 'item', selected = false) {
  const c = catById(it.category);
  return `<button class="tile ${selected ? 'sel' : ''}" data-act="${act}" data-id="${it.id}"><div class="ph-wrap"><img src="${blobURL(it.image)}" alt="" loading="lazy"></div>
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
  return (itemIds || []).map(itemById).filter(Boolean).sort((a, b) => SLOTS[slotOf(a)].order - SLOTS[slotOf(b)].order);
}

function flatlayHTML(itemIds, mini = false, stamp = '') {
  const items = orderedItems(itemIds);
  if (!items.length) return `<div class="flatlay ${mini ? 'mini' : ''}"><div class="fl-main" style="justify-content:center"><span class="label">Rūbai ištrinti</span></div></div>`;
  const by = {};
  for (const it of items) (by[slotOf(it)] = by[slotOf(it)] || []).push(it);
  const img = (it, slot) => `<div class="fl-item ${slot}" ${mini ? '' : `data-act="item" data-id="${it.id}"`}><img src="${blobURL(it.image)}" alt="${esc(it.name)}" loading="lazy"></div>`;
  const row = (arr, slot) => (arr && arr.length ? (arr.length > 1 ? `<div class="fl-row">${arr.map((i) => img(i, slot)).join('')}</div>` : img(arr[0], slot)) : '');
  let main = row(by.head, 'head');
  if (by.outer && by.top) {
    main += `<div class="fl-row">${by.outer.map((i) => img(i, 'outer')).join('')}${by.top.map((i) => img(i, 'top')).join('')}</div>`;
  } else {
    main += row(by.outer, 'outer') + row(by.top, 'top');
  }
  main += row(by.onepiece, 'onepiece') + row(by.bottom, 'bottom') + row(by.legwear, 'legwear') + row(by.shoes, 'shoes');
  const side = by.side ? `<div class="fl-side">${by.side.map((i) => img(i, 'side')).join('')}</div>` : '';
  return `<div class="flatlay ${mini ? 'mini' : ''}">${stamp ? `<span class="label fl-stamp">${stamp}</span>` : ''}<div class="fl-main">${main}</div>${side}</div>`;
}

function creditsHTML(itemIds) {
  const items = orderedItems(itemIds);
  return `<ul class="credits">${items.map((it, i) => {
    const c = catById(it.category);
    return `<li data-act="item" data-id="${it.id}"><span class="n">${pad2(i + 1)}</span><span>${esc(it.name || (c ? c.label : 'Rūbas'))}</span><span class="c">${esc(c ? c.label : '')}</span></li>`;
  }).join('')}</ul>`;
}

function outfitCardHTML(o) {
  const worn = S.worn.some((w) => w.outfitId === o.id && w.date === ymd());
  const tab = S.renderTab;
  const busy = S.rendering && S.rendering.id === o.id;
  let visual;
  if (tab === 'flat') {
    visual = flatlayHTML(o.itemIds, false, o.source === 'ai' ? 'Stilistės parinkta' : 'Tavo derinys') + creditsHTML(o.itemIds);
  } else {
    const blob = o.renders && o.renders[tab];
    if (busy && S.rendering.mode === tab) {
      visual = `<div class="render-box">${loadingHTML('Kuriamas vaizdas…')}<span class="label" style="margin-top:-20px">Iki minutės</span></div>`;
    } else if (blob) {
      visual = `<div class="render-box"><img src="${blobURL(blob)}" alt="Outfitas"></div>
        <div class="row" style="margin:10px 18px 0"><button class="btn sm ghost" data-act="render" data-mode="${tab}">Sugeneruoti iš naujo</button></div>`;
    } else {
      const isMe = tab === 'me';
      const needSelf = isMe && !S.selfPhoto;
      visual = `<div class="render-box"><div class="loading">
        <span class="serif">${needSelf ? 'Reikia tavo nuotraukos' : isMe ? 'Kaip atrodytų ant tavęs?' : 'Pažiūrėk ant manekeno'}</span>
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

const CHAT_IDEAS = ['Kažką šiltesnio', 'Spalvingiau', 'Pakeisk batus', 'Kodėl būtent taip?'];

function chatHTML(o) {
  const msgs = o.chat || [];
  const busy = S.chatting === o.id;
  return `<div class="chat">
    <div class="section-head"><h3>Pokalbis su stiliste</h3><span class="label">${msgs.length ? '' : 'Pataisyk fitą žodžiais'}</span></div>
    ${msgs.map((m) => m.role === 'user'
      ? `<div class="msg me">${esc(m.text)}</div>`
      : `<div class="msg her">${esc(m.text)}${m.changed ? '<span class="label msg-note">Fitas atnaujintas</span>' : ''}</div>`).join('')}
    ${busy ? `<div class="msg her typing"><div class="loader"></div></div>` : ''}
    ${!msgs.length && !busy ? `<div class="chips wrap">${CHAT_IDEAS.map((t) => `<button class="chip" data-act="chat-idea" data-id="${o.id}" data-v="${esc(t)}">${t}</button>`).join('')}</div>` : ''}
    <form class="chat-form" data-id="${o.id}">
      <input class="input" id="chatInput" autocomplete="off" placeholder="Pvz. pakeisk batus į baltus…" ${busy ? 'disabled' : ''}>
      <button class="btn primary sm" type="submit" ${busy ? 'disabled' : ''}>Siųsti</button>
    </form>
  </div>`;
}

async function sendChat(id, text) {
  text = (text || '').trim();
  const o = outfitById(id);
  if (!o || !text || S.chatting) return;
  if (!S.keyOk) return toast('Pokalbiui reikia DI rakto (skiltis „Daugiau“)');
  o.chat = [...(o.chat || []), { role: 'user', text, at: Date.now() }];
  await saveOutfit(o);
  S.chatting = o.id;
  await rerender();
  document.querySelector('.chat-form')?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  try {
    const r = await chatAboutOutfit({
      outfit: o, message: text, items: S.items, categories: S.categories,
      weather: weatherForAI(S.weather), wearStats: wearStats(),
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
    await saveOutfit(o);
  } catch (e) {
    toast(e.message === 'NO_KEY' ? 'Reikia API rakto' : 'Klaida: ' + e.message, 5000);
  }
  S.chatting = null;
  await rerender();
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
    <div class="hello"><div class="h-title">${g1}<br><em>${g2}</em></div><div class="label h-sub">${dateStr}</div></div>`;

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
        <div class="label" style="margin-top:6px">${w.min}° / ${w.max}° · Lietus ${w.rain ?? 0}%</div></div>
    </div>`;
  }

  html += `<div class="card vibe-card stack">
    <div class="vibe-q">Koks šiandien<br><em>vaibas?</em></div>
    <textarea class="input" id="vibe" placeholder="Kava su drauge, noriu jaustis patogiai, bet atrodyti stilingai…">${esc(S.lastVibe || '')}</textarea>
    <div class="chips">${VIBE_IDEAS.map((v) => `<button class="chip" data-act="vibe-idea" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>
    <button class="btn primary block" data-act="style" ${S.styling ? 'disabled' : ''}>${S.styling ? 'Stilistė galvoja…' : 'Sukurk man fitą'}</button>
    <button class="btn block" data-act="builder">Susidėsiu pati</button>
  </div>`;

  if (S.styling) html += `<div class="card">${loadingHTML('Stilistė rausiasi po tavo spintą…')}</div>`;
  if (cur) html += outfitCardHTML(cur);
  return html + `</div>`;
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
      ${setHead('02', 'Mano nuotrauka', 'Režimui „Ant manęs“')}
      <div class="row" style="gap:16px;align-items:flex-start">
        ${S.selfPhoto ? `<img class="self-photo" src="${blobURL(S.selfPhoto)}" alt="">` : `<div class="self-photo" style="display:grid;place-items:center"><span class="label">Nėra</span></div>`}
        <div class="stack" style="gap:10px"><span class="small muted">Geriausia pilno ūgio, stovint, gerai apšviesta. Siunčiama į OpenAI tik spaudžiant „Sugeneruoti“.</span>
          <div class="row"><button class="btn sm" data-act="self-photo">${S.selfPhoto ? 'Pakeisti' : 'Įkelti'}</button>${S.selfPhoto ? `<button class="btn sm danger" data-act="del-self">Ištrinti</button>` : ''}</div></div>
      </div>
    </div>

    <div class="card set-block">
      ${setHead('03', 'Orai', `Dabar: ${esc(loc ? (loc.auto ? 'pagal telefono vietą' : loc.name) : 'pagal telefono vietą')}`)}
      <div class="row"><input class="input" id="city" placeholder="Miestas, pvz. Kaunas" style="flex:1"><button class="btn sm" data-act="set-city">OK</button></div>
      <button class="btn sm ghost" style="align-self:flex-start" data-act="auto-loc">Naudoti telefono vietą</button>
    </div>

    <div class="card set-block">
      <div class="switch-row">${setHead('04', 'Iškirpti foną', 'Telefone, nemokamai. Pirmą kartą atsisiunčia ~40 MB.')}
        <label class="switch" style="margin-left:auto"><input type="checkbox" id="bgToggle" ${bg ? 'checked' : ''}><span></span></label></div>
    </div>

    <div class="card set-block">
      ${setHead('05', 'Mano kategorijos', 'Pridėk savų, jei trūksta')}
      ${custom.map((c) => `<div class="row"><span style="flex:1">${esc(c.label)} <span class="label">${SLOTS[c.slot].label}</span></span><button class="btn sm danger" data-act="del-cat" data-id="${c.id}">Šalinti</button></div>`).join('')}
      <input class="input" id="newCat" placeholder="Pvz. Kombinezonai">
      <div class="row"><select class="input" id="newCatSlot" style="flex:1">${Object.entries(SLOTS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
        <button class="btn sm" data-act="add-cat">Pridėti</button></div>
    </div>

    <div class="card set-block">
      ${setHead('06', 'Atsarginė kopija', `Išsaugok spintą į iCloud Drive (Failai), kad niekas nedingtų.${usage}`)}
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
  if (fileTarget === 'import') {
    try {
      await importAll(files[0]);
      await loadAll();
      toast('Spinta atkurta');
      rerender();
    } catch (e) {
      toast('Nepavyko atkurti: ' + e.message);
    }
    return;
  }
  const single = files.length === 1;
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

function updateQueueTile(q) {
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
          image = await resize(cut, 900, 'image/png');
          cutout = true;
        } catch (e) {
          console.warn('bg', e);
          if (!bgFailedOnce) toast('Fono iškirpti nepavyko – paliekama originali nuotrauka');
          bgFailedOnce = true;
        }
      }
      const item = {
        id: q.id, image, original, cutout, createdAt: Date.now(),
        category: defaultCategory(), name: '', colors: [], seasons: [], occasions: [], warmth: 3, description: '',
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
    } catch (e) {
      console.error(e);
      toast('Nepavyko įkelti nuotraukos: ' + e.message);
    }
    URL.revokeObjectURL(q.preview);
    S.queue.shift();
    if (S.tab === 'spinta') await rerender();
  }
  S.queueRunning = false;
  if (done === 1 && wasSingle) openItem(lastId, true);
  else if (done > 1) toast(`Įkelta ${done} ${plural(done, 'rūbas', 'rūbai', 'rūbų')}`);
}

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
      <div class="item-hero"><img id="itemImg" src="${blobURL(it.image)}" alt=""></div>
      <div class="img-tools">
        <button data-act="img-op" data-op="rotL" aria-label="Pasukti į kairę"><svg viewBox="0 0 24 24"><path d="M4 9.5A8 8 0 1 1 5.6 16"/><path d="M4 4.5v5h5"/></svg><span>Pasukti</span></button>
        <button data-act="img-op" data-op="rotR" aria-label="Pasukti į dešinę"><svg viewBox="0 0 24 24"><path d="M20 9.5A8 8 0 1 0 18.4 16"/><path d="M20 4.5v5h-5"/></svg><span>Pasukti</span></button>
        <button data-act="img-op" data-op="flipH" aria-label="Apversti"><svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M9 7 3.5 17H9z"/><path d="M15 7l5.5 10H15z"/></svg><span>Apversti</span></button>
      </div>
      ${fresh ? `<div class="label center">${S.keyOk ? 'DI užpildė informaciją – pataisyk, jei reikia' : 'Užpildyk informaciją (su DI raktu tai vyksta automatiškai)'}</div>` : ''}
      <div class="field"><label>Pavadinimas</label><input class="input" name="name" value="${esc(it.name)}" placeholder="Balta lininė palaidinė"></div>
      <div class="field"><label>Kategorija</label><select class="input" name="category">${categorySelect(it.category)}</select></div>
      <div class="field"><label>Spalvos</label><input class="input" name="colors" value="${esc((it.colors || []).join(', '))}" placeholder="balta, smėlio"></div>
      <div class="field"><label>Sezonai</label><div class="chips wrap" data-group="seasons">${SEASONS.map((s) => `<button class="chip soft ${(it.seasons || []).includes(s) ? 'on' : ''}" data-act="toggle" data-v="${s}">${s}</button>`).join('')}</div></div>
      <div class="field"><label>Progos</label><div class="chips wrap" data-group="occasions">${OCCASIONS.map((s) => `<button class="chip soft ${(it.occasions || []).includes(s) ? 'on' : ''}" data-act="toggle" data-v="${s}">${s}</button>`).join('')}</div></div>
      <div class="field"><label>Šiltumas</label><div class="warmth">${WARMTH.map((e, i) => `<button class="${it.warmth === i + 1 ? 'on' : ''}" data-act="warmth" data-v="${i + 1}">${e}</button>`).join('')}</div></div>
      <div class="label center">${ws ? `Vilkėta ${ws.count} k. · paskutinį kartą ${fmtDate(ws.last)}` : 'Dar nevilkėta'}</div>
      <button class="btn primary block" data-act="save-item">Išsaugoti</button>
      <div class="row">
        <button class="btn sm" style="flex:1" data-act="recut">${it.cutout ? 'Grąžinti originalą' : 'Iškirpti foną'}</button>
        <button class="btn sm danger" style="flex:1" data-act="del-item">Ištrinti</button>
      </div>
    </div>`);
}

// ================= Konstruktorius =================
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
    <div class="stack">${rows}
      <button class="btn primary block" data-act="build-save">${editId ? 'Išsaugoti' : 'Sukurti fitą'}</button>
    </div>`);
}

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

async function doStyle(vibe, exclude = []) {
  if (!S.keyOk) return toast('Įjunk DI stilistę – įvesk raktą skiltyje „Daugiau“');
  if (S.items.length < 2) return toast('Įkelk bent kelis rūbus į spintą');
  S.styling = true;
  S.lastVibe = vibe;
  await rerender();
  try {
    const r = await styleOutfit({
      vibe, items: S.items, categories: S.categories,
      weather: weatherForAI(S.weather), wearStats: wearStats(), exclude,
    });
    const o = {
      id: uid(), title: r.title, explanation: r.explanation, tip: r.tip, vibe,
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
    doStyle(o.vibe || '', o.itemIds);
  },
  rtab(el) {
    S.renderTab = el.dataset.v;
    rerender();
  },
  async render(el) {
    const o = outfitById(S.currentId);
    const mode = el.dataset.mode;
    if (!o) return;
    if (!S.keyOk) return toast('Reikia API rakto (skiltis „Daugiau“)');
    S.rendering = { id: o.id, mode };
    await rerender();
    try {
      const items = o.itemIds.map(itemById).filter(Boolean);
      const blob = await renderOutfit({ items, categories: S.categories, mode, selfPhoto: S.selfPhoto });
      o.renders = { ...(o.renders || {}), [mode]: blob };
      await saveOutfit(o);
    } catch (e) {
      toast(e.message === 'NO_SELF' ? 'Įkelk savo nuotrauką skiltyje „Daugiau“' : 'Vaizdo sukurti nepavyko: ' + e.message, 6000);
    }
    S.rendering = null;
    rerender();
  },
  async fav(el) {
    const o = outfitById(el.dataset.id);
    o.favorite = !o.favorite;
    await saveOutfit(o);
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
    toast('Pažymėta kalendoriuje');
    closeSheet();
    rerender();
  },
  builder(el) {
    openBuilder(el.dataset.id || null);
  },
  pick(el) {
    const id = el.dataset.id;
    const slot = el.closest('[data-slot]').dataset.slot;
    if (S.build.has(id)) {
      S.build.delete(id);
      el.classList.remove('sel');
      return;
    }
    if (slot !== 'side') {
      el.parentElement.querySelectorAll('.tile.sel').forEach((t) => { t.classList.remove('sel'); S.build.delete(t.dataset.id); });
    }
    S.build.add(id);
    el.classList.add('sel');
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
      el.disabled = true;
      el.textContent = 'Karpoma…';
      try {
        const cut = await removeBackground(it.original, (lab, p) => (el.textContent = `${lab} ${Math.round(p * 100)}%`));
        it.image = await resize(cut, 900, 'image/png');
        it.cutout = true;
      } catch (e) {
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
  if (e.target.id === 'bgToggle') {
    await setSetting('bgRemoval', e.target.checked);
    toast(e.target.checked ? 'Fonas bus iškerpamas' : 'Fonas nebus iškerpamas');
  }
});
$('#weatherPill').addEventListener('click', () => (location.hash = '#fitas'));

// ================= Paleidimas =================
async function loadAll() {
  S.items = await db.all('items');
  S.outfits = await db.all('outfits');
  S.worn = await db.all('worn');
  const custom = (await getSetting('customCategories')) || [];
  S.categories = [...DEFAULT_CATEGORIES, ...custom];
  S.currentId = await getSetting('currentOutfit');
  S.keyOk = await hasKey();
  S.selfPhoto = await getSetting('selfPhoto');
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

async function init() {
  S.tab = location.hash.slice(1) || 'fitas';
  await loadAll();
  await render();
  requestPersist();
  loadWeather();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('sw', e));
  }
}
init();
