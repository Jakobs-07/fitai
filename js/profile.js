// Profilis: kūno tipas, spalvų tipas, piešiamas avataras, pasitikimas ir trumpas gidas.

export const BUILDS = [
  { id: 'slim', label: 'Liekna', k: 0.9 },
  { id: 'medium', label: 'Vidutinė', k: 1 },
  { id: 'full', label: 'Apvalesnė', k: 1.16 },
];

export const BODY_TYPES = [
  { id: 'hourglass', label: 'Smėlio laikrodis', short: 'pečiai ir klubai panašūs, liemuo aiškiai siauresnis',
    w: { sh: 46, bu: 44, wa: 29, hi: 48 }, tip: 'Pabrėžk liemenį: diržai, apgaubiamos suknelės, prigludę kirpimai.',
    en: 'hourglass body shape: shoulders and hips about equal width with a clearly defined narrow waist' },
  { id: 'pear', label: 'Kriaušė', short: 'klubai platesni už pečius',
    w: { sh: 40, bu: 38, wa: 31, hi: 52 }, tip: 'Dėmesį kelk į viršų: ryškesni viršai, įdomios apykaklės, A siluetas ir tiesios kelnės apačioje.',
    en: 'pear (triangle) body shape: hips noticeably wider than shoulders, narrower upper body' },
  { id: 'apple', label: 'Obuolys', short: 'apimtis per vidurį, liemuo mažai ryškus',
    w: { sh: 45, bu: 45, wa: 42, hi: 45 }, tip: 'V iškirptės, ilgos vertikalios linijos, laisvai krentantys audiniai, liemuo po krūtine.',
    en: 'apple (round) body shape: fuller midsection, waist not defined, slimmer legs' },
  { id: 'rectangle', label: 'Stačiakampis', short: 'pečiai, liemuo ir klubai panašaus pločio',
    w: { sh: 43, bu: 40, wa: 36, hi: 44 }, tip: 'Kurk liemenį: diržai, sluoksniai, peplum, struktūruoti švarkai.',
    en: 'rectangle (straight) body shape: shoulders, waist and hips of similar width, little waist definition' },
  { id: 'invtri', label: 'Apverstas trikampis', short: 'pečiai platesni už klubus',
    w: { sh: 52, bu: 44, wa: 33, hi: 40 }, tip: 'Apimtis apačioje: platesni sijonai ir kelnės, V iškirptės, paprasti pečiai.',
    en: 'inverted triangle body shape: shoulders noticeably wider than hips' },
];

export const SKINS = [
  { id: 's1', hex: '#F3DCCB', label: 'Labai šviesi' },
  { id: 's2', hex: '#E8C3A7', label: 'Šviesi' },
  { id: 's3', hex: '#D3A27F', label: 'Vidutinė' },
  { id: 's4', hex: '#AC7A54', label: 'Alyvuogių' },
  { id: 's5', hex: '#6F4A33', label: 'Tamsi' },
];
export const HAIRS = [
  { id: 'blond', hex: '#D7B56C', label: 'Šviesūs' },
  { id: 'lbrown', hex: '#9A6E45', label: 'Šviesiai rudi' },
  { id: 'dbrown', hex: '#4B3225', label: 'Tamsiai rudi' },
  { id: 'black', hex: '#1F1B19', label: 'Juodi' },
  { id: 'red', hex: '#A2492B', label: 'Rusvi' },
  { id: 'grey', hex: '#B8B3AB', label: 'Žili' },
];
export const EYES = [
  { id: 'blue', label: 'Mėlynos / pilkos' },
  { id: 'green', label: 'Žalios' },
  { id: 'hazel', label: 'Lazdyno' },
  { id: 'brown', label: 'Rudos' },
];
export const UNDERTONES = [
  { id: 'warm', label: 'Šiltas', hint: 'venos žalsvos, labiau tinka auksas' },
  { id: 'cool', label: 'Šaltas', hint: 'venos melsvos, labiau tinka sidabras' },
  { id: 'neutral', label: 'Nežinau / abu', hint: 'tinka ir auksas, ir sidabras' },
];

export const SEASONS_C = {
  spring: { label: 'Pavasaris', desc: 'šiltos, šviesios ir skaidrios spalvos',
    good: [['Koralinė', '#EE8466'], ['Persikinė', '#F4B78E'], ['Šilta kreminė', '#F3E2C2'], ['Aukso geltona', '#E3BC52'], ['Salotinė', '#97BD58'], ['Turkio', '#37AE9F'], ['Šviesus kupranugaris', '#C7A078'], ['Šilta tamsiai mėlyna', '#2D4877']],
    avoid: 'juoda prie veido, šalta pilka, tamsiai bordinė' },
  summer: { label: 'Vasara', desc: 'šaltos, švelnios, pritildytos spalvos',
    good: [['Pudros', '#D4A6AE'], ['Levandų', '#B4A4CC'], ['Melsvai pilka', '#8DA1B5'], ['Mėtinė', '#A6CDBE'], ['Rūko mėlyna', '#6C8DB2'], ['Slyvų dūmo', '#896883'], ['Sidabriškai pilka', '#B8B7B3'], ['Švelni balta', '#F1EFE9']],
    avoid: 'oranžinė, garstyčių, ryški juoda' },
  autumn: { label: 'Ruduo', desc: 'šiltos, gilios, žemiškos spalvos',
    good: [['Rūdžių', '#B2552F'], ['Garstyčių', '#C6982D'], ['Alyvuogių', '#6A6A2E'], ['Šokolado', '#583929'], ['Kupranugario', '#AE8456'], ['Terakotos', '#C16849'], ['Giliai žalia', '#2E5043'], ['Kreminė', '#EDDEC3']],
    avoid: 'ryškiai balta, ledinės pastelės, šalta mėlyna' },
  winter: { label: 'Žiema', desc: 'šaltos, ryškios, kontrastingos spalvos',
    good: [['Grynai balta', '#FFFFFF'], ['Juoda', '#141414'], ['Rubino', '#A0142C'], ['Smaragdo', '#0E6A4E'], ['Karališka mėlyna', '#1F3E9E'], ['Vyšnių', '#7A1F39'], ['Ledinė mėlyna', '#CDE2EF'], ['Anglies pilka', '#3A3B3F']],
    avoid: 'kupranugario, oranžinė, prislopintos žemiškos spalvos' },
};

export const STYLES = ['Minimalistinis', 'Klasikinis', 'Romantiškas', 'Gatvės', 'Boho', 'Sportiškas', 'Elegantiškas', 'Eklektiškas', 'Skandinaviškas', 'Vintažinis'];

export function guessSeason({ undertone, hair, eyes, skin }) {
  const lightHair = ['blond', 'lbrown', 'grey'].includes(hair);
  const lightEyes = ['blue', 'green'].includes(eyes);
  const lightSkin = ['s1', 's2'].includes(skin);
  if (hair === 'red') return lightSkin && lightEyes ? 'spring' : 'autumn';
  let u = undertone;
  if (u === 'neutral' || !u) u = hair === 'grey' || eyes === 'blue' ? 'cool' : 'warm';
  if (u === 'warm') return lightHair && (lightEyes || lightSkin) ? 'spring' : 'autumn';
  if (lightHair) return 'summer';
  return 'winter';
}

export function guessBodyType({ wider, waist }) {
  if (waist === 'belly') return 'apple';
  if (wider === 'shoulders') return waist === 'clear' ? 'hourglass' : 'invtri';
  if (wider === 'hips') return waist === 'straight' ? 'pear' : waist === 'clear' ? 'pear' : 'pear';
  return waist === 'clear' ? 'hourglass' : 'rectangle';
}

export function describeMe(me) {
  if (!me || !me.done) return '';
  const bt = BODY_TYPES.find((b) => b.id === me.bodyType);
  const bl = BUILDS.find((b) => b.id === me.build);
  const se = SEASONS_C[me.season];
  const parts = [];
  if (me.height) parts.push(`ūgis ${me.height} cm`);
  if (bl) parts.push(`sudėjimas ${bl.label.toLowerCase()}`);
  if (bt) parts.push(`kūno tipas – ${bt.label.toLowerCase()} (${bt.short}); patarimas: ${bt.tip}`);
  if (se) parts.push(`spalvų tipas – ${se.label.toLowerCase()} (${se.desc}); geriausiai tinka: ${se.good.map((g) => g[0].toLowerCase()).join(', ')}; vengti prie veido: ${se.avoid}`);
  if (me.styles?.length) parts.push(`mėgstami stiliai: ${me.styles.join(', ').toLowerCase()}`);
  return parts.join('. ');
}

export function bodyForAI(me) {
  if (!me || !me.done) return '';
  const bt = BODY_TYPES.find((b) => b.id === me.bodyType);
  const bl = { slim: 'slim', medium: 'average, medium', full: 'fuller, curvy' }[me.build] || 'average';
  return `a woman ${me.height || 165} cm tall with a ${bl} build and ${bt ? bt.en : 'average proportions'}`;
}

// ---------- Avataras (piešiamas SVG) ----------
function smooth(pts, closed = true) {
  // Catmull-Rom → Bezier
  const n = pts.length;
  const p = (i) => pts[(i + n) % n];
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = closed ? p(i - 1) : pts[Math.max(0, i - 1)];
    const p1 = p(i), p2 = p(i + 1);
    const p3 = closed ? p(i + 2) : pts[Math.min(n - 1, i + 2)];
    const t = 0.18;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + (closed ? 'Z' : '');
}

export function avatarSVG(me = {}, opts = {}) {
  const bt = BODY_TYPES.find((b) => b.id === me.bodyType) || BODY_TYPES[3];
  const k = (BUILDS.find((b) => b.id === me.build) || BUILDS[1]).k;
  const h = Math.min(195, Math.max(145, +me.height || 165));
  const s = h / 165; // kūno ilgis žemiau galvos
  const sil = !!opts.silhouette;
  const skin = sil ? '#8A8580' : (SKINS.find((x) => x.id === me.skin) || SKINS[1]).hex;
  const hair = sil ? '#8A8580' : (HAIRS.find((x) => x.id === me.hair) || HAIRS[2]).hex;
  const cx = 100;
  const Y = (y) => 70 + (y - 70) * s; // viskas žemiau smakro tempiama pagal ūgį
  const sh = bt.w.sh * (0.94 + (k - 1) * 0.6), bu = bt.w.bu * k, wa = bt.w.wa * k, hi = bt.w.hi * k;
  const thighK = k;
  const yNeck = Y(78), ySh = Y(94), yBu = Y(134), yWa = Y(184), yHi = Y(230), yCr = Y(262), yKn = Y(362), yCa = Y(400), yAn = Y(462), yFt = Y(478);
  const lc = hi * 0.5;
  const kc = lc * 0.62, kw = 12.5 * thighK, cw = 12 * thighK;
  const ac = lc * 0.5, aw = 6.2;
  const R = [
    [cx + 9, Y(68)], [cx + 10, yNeck], [cx + sh * 0.7, ySh - 6], [cx + sh, ySh + 4], [cx + bu, yBu],
    [cx + wa, yWa], [cx + hi, yHi], [cx + hi * 0.93, yCr + 8],
    [cx + kc + kw, yKn], [cx + kc + cw + 1, yCa], [cx + ac + aw, yAn], [cx + ac + aw + 3, yFt], [cx + ac - aw - 1, yFt + 2],
    [cx + ac - aw, yAn], [cx + kc - kw + 2, yKn], [cx + 3, yCr + 6],
  ];
  // kairė pusė – veidrodinė, einam atgal
  const L = R.slice().reverse().map(([x, y]) => [2 * cx - x, y]);
  const body = smooth([...R.slice(0, -1), [cx, yCr], ...L.slice(1)]);
  const armW = 7.5 * Math.sqrt(k);
  const armX = (side) => {
    const sg = side;
    return smooth([
      [cx + sg * (sh - 4), ySh + 6],
      [cx + sg * (Math.max(bu, wa) + armW + 3), yWa - 8],
      [cx + sg * (Math.max(hi, wa) + armW + 2), yCr + 14],
    ], false);
  };
  const vbH = Math.ceil(yFt + 14);
  const cid = 'avc' + Math.random().toString(36).slice(2, 8);
  const headCy = 42;
  return `<svg class="avatar ${opts.cls || ''}" viewBox="0 0 200 ${vbH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Avataras">
    ${opts.bg ? `<rect width="200" height="${vbH}" fill="${opts.bg}"/>` : ''}
    ${opts.ruler ? `<g class="av-ruler" stroke="currentColor" stroke-width=".6" opacity=".35"><line x1="186" y1="14" x2="186" y2="${yFt + 2}"/>${Array.from({ length: 9 }, (_, i) => { const yy = 14 + ((yFt + 2 - 14) * i) / 8; return `<line x1="182" x2="190" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>`; }).join('')}</g>` : ''}
    <path d="M${cx - 22},${headCy - 4} C${cx - 26},${headCy + 28} ${cx - 22},${headCy + 44} ${cx - 12},${headCy + 46} L${cx + 12},${headCy + 46} C${cx + 22},${headCy + 44} ${cx + 26},${headCy + 28} ${cx + 22},${headCy - 4} Z" fill="${hair}"/>
    <path d="${armX(1)}" fill="none" stroke="${skin}" stroke-width="${(armW * 2).toFixed(1)}" stroke-linecap="round"/>
    <path d="${armX(-1)}" fill="none" stroke="${skin}" stroke-width="${(armW * 2).toFixed(1)}" stroke-linecap="round"/>
    <path d="${body}" fill="${skin}"/>
    ${sil ? '' : `<clipPath id="${cid}"><path d="${body}"/></clipPath><rect clip-path="url(#${cid})" x="0" y="${(ySh + 2).toFixed(1)}" width="200" height="${(yCr + 26 - ySh).toFixed(1)}" fill="${opts.suit || '#2E2623'}"/>
    <path clip-path="url(#${cid})" d="M${cx - sh},${(ySh + 2).toFixed(1)} Q${cx},${(ySh + 22).toFixed(1)} ${cx + sh},${(ySh + 2).toFixed(1)} L${cx + sh},${(ySh - 12).toFixed(1)} L${cx - sh},${(ySh - 12).toFixed(1)}Z" fill="${skin}"/>`}
    <ellipse cx="${cx}" cy="${headCy}" rx="19" ry="24" fill="${skin}"/>
    <path d="M${cx - 21},${headCy - 2} C${cx - 22},${headCy - 30} ${cx + 22},${headCy - 30} ${cx + 21},${headCy - 2} C${cx + 12},${headCy - 14} ${cx - 6},${headCy - 16} ${cx - 21},${headCy - 2} Z" fill="${hair}"/>
    ${sil ? '' : `<path d="${body}" fill="none" stroke="rgba(29,26,23,.18)" stroke-width=".8"/>`}
  </svg>`;
}

// Avataro siluetas PNG pavidalu – DI manekenui kaip proporcijų pavyzdys
export async function avatarPNG(me) {
  const svg = avatarSVG(me, { silhouette: true, bg: '#FFFFFF' });
  const vb = svg.match(/viewBox="0 0 200 (\d+)"/);
  const H = vb ? +vb[1] : 520;
  const scale = 1536 / H;
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg width="200" height="' + H + '" '));
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1536;
  const x = c.getContext('2d');
  x.fillStyle = '#FFFFFF';
  x.fillRect(0, 0, c.width, c.height);
  const w = 200 * scale * 0.92, hh = H * scale * 0.92;
  x.drawImage(img, (c.width - w) / 2, (c.height - hh) / 2, w, hh);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}

// ---------- Krovimo animacija su stiliaus patarimais ----------
export const TIPS = [
  'Viena ryški detalė stipresnė už tris.',
  'Batai ir rankinė neprivalo būti vienos spalvos – užtenka vieno tono.',
  'Susikišk marškinių priekį į kelnes – liemuo iškart ryškesnis.',
  'Atsiraitoti rankogaliai daro bet kurį švarką lengvesnį.',
  'Monochromas ilgina siluetą.',
  'Platus viršus – siauresnė apačia, ir atvirkščiai.',
  'Diržas virš švarko – greitas būdas sukurti liemenį.',
  'Kreminė dažnai elegantiškesnė už grynai baltą.',
  'Trys spalvos derinyje – saugi ir graži taisyklė.',
  'Tekstūra derinyje veikia kaip papuošalas.',
  'Pėdkelnės tos pačios spalvos kaip batai ilgina kojas.',
  'Seniausiai vilkėtas rūbas – dažnai šviežiausias derinys.',
  'Kai abejoji – rinkis geresnę avalynę.',
  'Raštą derink su vienspalviais, kuriuose pasikartoja jo spalva.',
  'Oversized švarkas ir siauras sijonas – klasika, kuri neapgauna.',
  'Sidabras ar auksas? Rinkis pagal odos atspalvį, ne pagal madą.',
];

export const F_SVG = `<svg class="f-mark" viewBox="0 0 60 80" aria-hidden="true">
  <path class="f1" d="M14 72 V10 H48"/><path class="f2" d="M14 40 H40"/><circle class="f3" cx="50" cy="70" r="3.4"/></svg>`;

export function fLoader(text = 'Kraunama', sub = '') {
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
  return `<div class="fload">${F_SVG}<div class="serif fl-text">${text}</div>${sub ? `<div class="label">${sub}</div>` : ''}
    <div class="tip-rot"><span class="label">Stiliaus patarimas</span><span class="tip-t">${tip}</span></div></div>`;
}

let tipTimer = null;
export function startTipRotation() {
  if (tipTimer) return;
  tipTimer = setInterval(() => {
    document.querySelectorAll('.tip-rot .tip-t').forEach((el) => {
      el.classList.add('out');
      setTimeout(() => {
        let t;
        do t = TIPS[Math.floor(Math.random() * TIPS.length)]; while (t === el.textContent && TIPS.length > 1);
        el.textContent = t;
        el.classList.remove('out');
      }, 350);
    });
  }, 4200);
}

let busyEl = null;
export function busyOn(text = 'Palauk', sub = '') {
  if (!busyEl) {
    busyEl = document.createElement('div');
    busyEl.className = 'busy';
    document.body.appendChild(busyEl);
  }
  busyEl.innerHTML = `<div class="busy-card">${fLoader(text, sub)}</div>`;
  busyEl.hidden = false;
}
export function busyText(text) {
  const t = busyEl?.querySelector('.fl-text');
  if (t) t.textContent = text;
}
export function busyOff() {
  if (busyEl) busyEl.hidden = true;
}

// ---------- Pasitikimas ir profilio kūrimas ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function runOnboarding({ me = {}, startAt = 0, canAI = false, analyzeSelfie = null, onSave }) {
  const d = { height: 165, build: 'medium', bodyType: '', skin: 's2', hair: 'dbrown', eyes: '', undertone: '', styles: [], name: '', ...me };
  let step = startAt;
  let quiz = null;
  let drawn = null;
  const STEPS = ['welcome', 'name', 'size', 'body', 'colors', 'styles', 'avatar'];
  const el = document.createElement('div');
  el.className = 'onb';
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';

  const progress = () => step === 0 ? '' : `<div class="onb-prog">${STEPS.slice(1).map((_, i) => `<i class="${i < step ? 'on' : ''}"></i>`).join('')}</div>`;
  const top = () => step === 0 ? '' : `<div class="onb-top"><button class="x" data-o="back">${step > (startAt || 1) ? '← Atgal' : ''}</button>${progress()}<span class="label">${step}/${STEPS.length - 1}</span></div>`;

  function screen() {
    const s = STEPS[step];
    if (s === 'welcome') {
      return `<div class="onb-welcome">
        <div class="ow-brand">Fitai<em>.</em></div>
        <div class="ow-fig">${avatarSVG({ ...d, bodyType: 'hourglass' }, { cls: 'ow-av' })}</div>
        <div class="ow-title">Tavo spinta.<br><em>Tavo stilistė.</em></div>
        <p class="ow-sub">Įkelk savo rūbus, o Fitai kasdien pasiūlys, ką vilkėti – pagal orus, nuotaiką ir tavo figūrą.</p>
        <button class="btn primary block" data-o="next">Susikurti profilį</button>
        <span class="label center">Užtruks apie 2 minutes · viskas lieka tavo telefone</span>
      </div>`;
    }
    if (s === 'name') {
      return `<div class="onb-q"><span class="label">Susipažinkim</span><h2>Kuo tu<br><em>vardu?</em></h2></div>
        <input class="input onb-big" id="obName" autocomplete="given-name" placeholder="Tavo vardas" value="${esc(d.name)}">
        <p class="small muted">Taip į tave kreipsis stilistė.</p>`;
    }
    if (s === 'size') {
      return `<div class="onb-q"><span class="label">Tavo figūra</span><h2>Ūgis ir<br><em>sudėjimas</em></h2></div>
        <div class="onb-height"><span class="oh-val"><b id="obHval">${d.height}</b> cm</span>
          <input type="range" id="obH" min="145" max="195" value="${d.height}"></div>
        <div class="onb-cards three">${BUILDS.map((b) => `<button class="ocard ${d.build === b.id ? 'on' : ''}" data-o="build" data-v="${b.id}">
          ${avatarSVG({ ...d, build: b.id, bodyType: d.bodyType || 'rectangle', height: 165 }, { cls: 'oc-av' })}<span>${b.label}</span></button>`).join('')}</div>
        <p class="small muted">Pagal tai piešiamas tavo avataras ir manekenas, ant kurio matysi derinius.</p>`;
    }
    if (s === 'body') {
      if (quiz) {
        return `<div class="onb-q"><span class="label">Padėsiu nustatyti</span><h2>Pažiūrėk į<br><em>veidrodį</em></h2></div>
          <div class="field"><label>Kas platesni?</label><div class="chips wrap">${[['shoulders', 'Pečiai'], ['same', 'Panašiai'], ['hips', 'Klubai']].map(([v, l]) => `<button class="chip soft ${quiz.wider === v ? 'on' : ''}" data-o="qz" data-k="wider" data-v="${v}">${l}</button>`).join('')}</div></div>
          <div class="field"><label>Tavo liemuo</label><div class="chips wrap">${[['clear', 'Aiškiai siauresnis'], ['some', 'Šiek tiek'], ['straight', 'Beveik tiesus'], ['belly', 'Platesnis per vidurį']].map(([v, l]) => `<button class="chip soft ${quiz.waist === v ? 'on' : ''}" data-o="qz" data-k="waist" data-v="${v}">${l}</button>`).join('')}</div></div>
          ${quiz.wider && quiz.waist ? (() => { const g = BODY_TYPES.find((b) => b.id === guessBodyType(quiz)); return `<div class="onb-result">${avatarSVG({ ...d, bodyType: g.id }, { cls: 'or-av' })}<div><span class="label">Tavo kūno tipas</span><div class="serif or-name">${g.label}</div><p class="small">${g.tip}</p></div></div>`; })() : ''}
          <button class="btn sm ghost" style="align-self:flex-start;padding-left:0" data-o="quiz-off">← Rinksiuosi pati</button>`;
      }
      return `<div class="onb-q"><span class="label">Kūno tipas</span><h2>Kuri figūra<br><em>panašiausia?</em></h2></div>
        <div class="onb-cards">${BODY_TYPES.map((b) => `<button class="ocard ${d.bodyType === b.id ? 'on' : ''}" data-o="body" data-v="${b.id}">
          ${avatarSVG({ ...d, bodyType: b.id }, { cls: 'oc-av' })}<span>${b.label}</span><small>${b.short}</small></button>`).join('')}
          <button class="ocard help" data-o="quiz-on"><span class="serif" style="font-size:34px;color:var(--wine)">?</span><span>Nežinau</span><small>padėk nustatyti</small></button></div>
        ${d.bodyType ? `<div class="tip"><span class="label">Kas tau tinka</span>${BODY_TYPES.find((b) => b.id === d.bodyType).tip}</div>` : ''}`;
    }
    if (s === 'colors') {
      const season = d.eyes && d.undertone ? guessSeason(d) : null;
      const se = season && SEASONS_C[season];
      return `<div class="onb-q"><span class="label">Spalvų tipas</span><h2>Kokios spalvos<br><em>tau tinka?</em></h2></div>
        <div class="field"><label>Odos atspalvis</label><div class="swatches">${SKINS.map((x) => `<button class="sw ${d.skin === x.id ? 'on' : ''}" style="background:${x.hex}" data-o="set" data-k="skin" data-v="${x.id}" aria-label="${x.label}"></button>`).join('')}</div></div>
        <div class="field"><label>Plaukai</label><div class="swatches">${HAIRS.map((x) => `<button class="sw ${d.hair === x.id ? 'on' : ''}" style="background:${x.hex}" data-o="set" data-k="hair" data-v="${x.id}" aria-label="${x.label}"></button>`).join('')}</div>
          <span class="small muted">${HAIRS.find((x) => x.id === d.hair)?.label || ''}</span></div>
        <div class="field"><label>Akys</label><div class="chips wrap">${EYES.map((x) => `<button class="chip soft ${d.eyes === x.id ? 'on' : ''}" data-o="set" data-k="eyes" data-v="${x.id}">${x.label}</button>`).join('')}</div></div>
        <div class="field"><label>Odos potonis · pažiūrėk į venas ant riešo</label><div class="chips wrap">${UNDERTONES.map((x) => `<button class="chip soft ${d.undertone === x.id ? 'on' : ''}" data-o="set" data-k="undertone" data-v="${x.id}">${x.label}</button>`).join('')}</div>
          ${d.undertone ? `<span class="small muted">${UNDERTONES.find((x) => x.id === d.undertone).hint}</span>` : ''}</div>
        ${se ? `<div class="season"><span class="label">Tavo spalvų tipas</span><div class="se-name">${se.label}</div><p class="small">${se.desc[0].toUpperCase() + se.desc.slice(1)}. Vengti prie veido: ${se.avoid}.</p>
          <div class="palette">${se.good.map(([n, hex]) => `<span><i style="background:${hex}"></i>${n}</span>`).join('')}</div></div>` : ''}
        ${canAI && analyzeSelfie ? `<button class="btn sm" data-o="selfie">Patikslinti iš asmenukės · DI ~0,01 $</button>
          <span class="small muted">Geriausia dienos šviesoje, be makiažo filtrų. Nuotrauka nesaugoma.</span>` : ''}`;
    }
    if (s === 'styles') {
      return `<div class="onb-q"><span class="label">Stilius</span><h2>Kas tau<br><em>artima?</em></h2></div>
        <p class="small muted" style="margin-top:-6px">Pasirink kelis. Vėliau stilistė mokysis iš to, ką renkiesi.</p>
        <div class="chips wrap">${STYLES.map((x) => `<button class="chip soft ${d.styles.includes(x) ? 'on' : ''}" data-o="style" data-v="${x}">${x}</button>`).join('')}</div>`;
    }
    if (s === 'avatar') {
      const bt = BODY_TYPES.find((b) => b.id === d.bodyType);
      const se = SEASONS_C[d.season];
      return `<div class="onb-q"><span class="label">Paruošta</span><h2>${d.name ? esc(d.name) + ',<br>' : ''}<em>čia tu</em></h2></div>
        <div class="onb-avatar">${avatarSVG(d, { cls: 'big-av', ruler: true })}
          <dl class="av-facts"><dt>Ūgis</dt><dd>${d.height} cm</dd><dt>Sudėjimas</dt><dd>${BUILDS.find((b) => b.id === d.build)?.label}</dd>
          <dt>Figūra</dt><dd>${bt ? bt.label : '—'}</dd><dt>Spalvos</dt><dd>${se ? se.label : '—'}</dd></dl></div>
        ${se ? `<div class="palette">${se.good.map(([n, hex]) => `<span><i style="background:${hex}"></i>${n}</span>`).join('')}</div>` : ''}
        <p class="small muted">Tokių pačių proporcijų bus ir manekenas, ant kurio DI rodys tavo derinius.</p>`;
    }
    return '';
  }

  function canNext() {
    const s = STEPS[step];
    if (s === 'body') return !!(quiz ? quiz.wider && quiz.waist : d.bodyType);
    if (s === 'colors') return !!(d.eyes && d.undertone);
    return true;
  }

  function draw() {
    const s = STEPS[step];
    const last = s === 'avatar';
    const anim = drawn !== step + (quiz ? 'q' : '');
    drawn = step + (quiz ? 'q' : '');
    const keepY = anim ? 0 : el.scrollTop;
    el.innerHTML = `${top()}<div class="onb-body ${anim ? 'anim' : ''}" data-step="${s}">${screen()}</div>
      ${s === 'welcome' ? '' : `<div class="onb-foot"><button class="btn primary block" data-o="next" ${canNext() ? '' : 'disabled'}>${last ? 'Viskas tinka' : s === 'name' && !d.name ? 'Praleisti' : 'Toliau'}</button></div>`}`;
    el.scrollTop = keepY;
    const r = el.querySelector('#obH');
    if (r) r.addEventListener('input', () => { d.height = +r.value; el.querySelector('#obHval').textContent = r.value; });
    const n = el.querySelector('#obName');
    if (n) n.addEventListener('input', () => {
      d.name = n.value.trim();
      const b = el.querySelector('[data-o=next]');
      if (b) b.textContent = d.name ? 'Toliau' : 'Praleisti';
    });
  }

  function finish() {
    d.season = d.seasonAI || guessSeason(d);
    d.done = true;
    d.updatedAt = Date.now();
    el.remove();
    document.body.style.overflow = '';
    onSave(d);
  }

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-o]');
    if (!b) return;
    const o = b.dataset.o;
    if (o === 'next') {
      if (STEPS[step] === 'body' && quiz) { d.bodyType = guessBodyType(quiz); quiz = null; }
      if (STEPS[step] === 'colors') d.season = d.seasonAI || guessSeason(d);
      if (step === STEPS.length - 1) return finish();
      step++;
    }
    if (o === 'back') { if (quiz) quiz = null; else if (step > 1) step--; }
    if (o === 'build') d.build = b.dataset.v;
    if (o === 'body') d.bodyType = b.dataset.v;
    if (o === 'quiz-on') quiz = {};
    if (o === 'quiz-off') quiz = null;
    if (o === 'qz') quiz[b.dataset.k] = b.dataset.v;
    if (o === 'set') { d[b.dataset.k] = b.dataset.v; d.seasonAI = null; }
    if (o === 'style') d.styles = d.styles.includes(b.dataset.v) ? d.styles.filter((x) => x !== b.dataset.v) : [...d.styles, b.dataset.v];
    if (o === 'selfie') {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.onchange = async () => {
        const f = inp.files[0];
        if (!f) return;
        busyOn('Žiūriu į tavo spalvas', 'apie 10 sekundžių');
        try {
          const r = await analyzeSelfie(f);
          for (const k of ['skin', 'hair', 'eyes', 'undertone']) if (r[k]) d[k] = r[k];
          if (r.season && SEASONS_C[r.season]) d.seasonAI = r.season;
        } catch (err) {
          alert('Nepavyko: ' + err.message);
        }
        busyOff();
        draw();
      };
      inp.click();
      return;
    }
    draw();
  });
  draw();
}

// ---------- Trumpas gidas ----------
const COACH = [
  { sel: '#tabbar [data-tab=fitas]', title: 'Fitas', text: 'Parašyk, kokia šiandien nuotaika, ir stilistė sudės derinį iš tavo spintos pagal orus.' },
  { sel: '#tabbar [data-tab=spinta]', title: 'Spinta', text: 'Čia įkeli rūbus. Gali pasirinkti daug nuotraukų iš karto – fonas iškerpamas pats.' },
  { sel: '#tabbar [data-tab=megstami]', title: 'Mėgstami', text: 'Patikę deriniai lieka čia. Stilistė iš jų mokosi tavo skonio.' },
  { sel: '#tabbar [data-tab=kalendorius]', title: 'Kalendorius', text: 'Pažymėk, ką vilkėjai. Stilistė primins seniai pamirštus rūbus.' },
  { sel: '#tabbar [data-tab=nustatymai]', title: 'Daugiau', text: 'Tavo profilis, avataras, DI raktas ir atsarginė kopija.' },
];

export function runCoach({ name = '', onDone }) {
  let i = 0;
  const el = document.createElement('div');
  el.className = 'coach';
  document.body.appendChild(el);
  function draw() {
    const c = COACH[i];
    const t = document.querySelector(c.sel);
    const r = t ? t.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    const pad = 4;
    el.innerHTML = `<div class="coach-hole" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>
      <div class="coach-card" style="bottom:${window.innerHeight - r.top + 18}px">
        <div class="row" style="justify-content:space-between"><span class="label">${String(i + 1).padStart(2, '0')} / ${String(COACH.length).padStart(2, '0')}</span><button class="x" data-c="skip">Praleisti</button></div>
        ${i === 0 && name ? `<div class="serif" style="font-size:18px;color:var(--wine)">Sveika, ${esc(name)}.</div>` : ''}
        <h3>${c.title}</h3><p>${c.text}</p>
        <button class="btn primary block" data-c="next">${i === COACH.length - 1 ? 'Pradėkim nuo spintos' : 'Toliau'}</button>
      </div>`;
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    if (b.dataset.c === 'next' && i < COACH.length - 1) { i++; return draw(); }
    el.remove();
    onDone(b.dataset.c === 'next');
  });
  window.addEventListener('resize', () => el.isConnected && draw());
  draw();
}
