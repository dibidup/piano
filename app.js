// Piano Groove Player (prueba del capítulo piloto). Usa PIANO (pianoeng.js), BOOK (data.js), INSTS (insts.js), ASSETS (drums.js).
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const ttl = s => esc(s).replace(/"([^"]*)"/g, '“$1”');
// Biblioteca: los capítulos llegan cifrados (AES-GCM) en CHAPTERS (chapters.js); la clave de cada uno va en el código QR del libro.
const LVN = {1: 'Beginner', 2: 'Intermediate', 3: 'Advanced', 4: 'Pro'};
let LIB = {};          // n → capítulo descifrado
let CH = null, ALL = [];
let LEVEL = 1, PI = 0, TR = 0, TPCT = 1, SOUND = 'piano';
const MODE = (typeof BOOK_MODE !== 'undefined') ? BOOK_MODE : 'piano';
const UKE = typeof BOOK_INST !== 'undefined' && BOOK_INST === 'uke';   // ukelele: mismo modo que la guitarra, 4 cuerdas G-C-E-A
const mute = {rh: false, lh: false, dr: false, bs: false, kb: false, gt: false};
let METRO = false, COUNTIN = true;
try { const o = JSON.parse(localStorage.getItem('pg-opts') || '{}'); if (o.s) SOUND = o.s; if ('m' in o) METRO = o.m; if ('c' in o) COUNTIN = o.c; } catch (e) {}
// vista (bajo y guitarra): 'all' partitura+TAB+mástil · 'nt' partitura+TAB · 'tab' solo TAB · 'neck' solo mástil
let VIEW = 'all'; try { VIEW = localStorage.getItem('pg-view-' + (typeof BOOK_MODE !== 'undefined' ? BOOK_MODE : 'piano')) || 'all'; } catch (e) {}
const VIEWS = [['all', 'All'], ['nt', 'Notes + TAB'], ['tab', 'TAB'], ['neck', 'Neck']];
function setView(v) { VIEW = v; try { localStorage.setItem('pg-view-' + MODE, v); } catch (e) {} applyView(); drawScore(); drawKbd(); fitTop(); }
function applyView() { const pl = $('player'); if (!pl) return; const on = MODE !== 'piano';
  VIEWS.forEach(([k]) => document.body.classList.toggle('v-' + k, on && VIEW === k));
  document.querySelectorAll('.views button,.rviews button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === VIEW));
  const rv = $('rview'); if (rv) rv.textContent = (VIEWS.find(x => x[0] === VIEW) || VIEWS[0])[1]; showChName(); }
function showChName(i) { const el = $('chname'); if (!el || !NOTES) return; const t = i == null ? (START || 0) : i; let sym = ''; for (const c of NOTES.cs) if (Math.max(0, c.s) <= t) sym = c.sym; el.textContent = sym; }
const saveOpts = () => { try { localStorage.setItem('pg-opts', JSON.stringify({s: SOUND, m: METRO, c: COUNTIN})); } catch (e) {} };
function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2200); }
const ub64 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
async function openChapter(id, keyB64) {
  const blob = CHAPTERS[id]; if (!blob) throw new Error('unknown');
  const raw = ub64(blob), iv = raw.slice(0, 12), ct = raw.slice(12);
  const key = await crypto.subtle.importKey('raw', ub64(keyB64), 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv}, key, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}
function codes() { let k = {}; try { k = JSON.parse(localStorage.getItem('pg-codes') || '{}'); } catch (e) {} if (typeof PREVIEW_KEYS !== 'undefined') Object.assign(k, PREVIEW_KEYS); return k; }
// capítulo partido en dos claves (nivel 1 / niveles 2-4): se juntan en una sola entrada
function addCh(c) { const o = LIB[c.n];
  if (o && !o.demo && !o.lib && !c.lib && o.id === c.id) { const lv = {}; o.levels.concat(c.levels).forEach(L => lv[L.n] = L);
    const m = Object.assign({}, o.part === 2 ? c : o); m.levels = Object.values(lv).sort((a, b) => a.n - b.n); delete m.part;
    m.more = (m.more || []).filter(n => !lv[n]); LIB[c.n] = m; return m; }
  LIB[c.n] = c; return c; }
async function loadLibrary() {
  const k = codes(); LIB = {};
  for (const [id, key] of Object.entries(k)) { try { const c = await openChapter(id, key); if (LIB[c.n] && LIB[c.n].demo) delete LIB[c.n]; addCh(c); } catch (e) {} }
  if (typeof DEMO !== 'undefined' && DEMO && !Object.keys(LIB).length) LIB[DEMO.n] = DEMO;
}
// código: PG1.<id>.<clave>[.L<nivel>]  (dentro de https://piano.dibidup.com/#…)
async function handleCode(txt) {
  const m = /(?:PG1|BG1|GG1|UK1|FS1)\.(\w+)\.([\w-]{16,})(?:\.L(\d))?/.exec(decodeURIComponent(txt || ''));
  if (!m) { toast('This code is not from this book.'); return false; }
  try {
    const c = await openChapter(m[1], m[2]); const k = codes(); k[m[1]] = m[2];
    try { localStorage.setItem('pg-codes', JSON.stringify(k)); } catch (e) {}
    if (LIB[c.n] && LIB[c.n].demo) delete LIB[c.n];
    const had = LIB[c.n] && !LIB[c.n].demo ? LIB[c.n].levels.map(L => L.n) : []; const isNew = !c.levels.every(L => had.includes(L.n)); addCh(c);
    if (c.lib) { toast('The Pattern Library is unlocked!'); openLib(c.n, 1); return true; }
    toast(!isNew ? 'Chapter ' + c.n + ' is already in your library' : c.part === 2 ? 'Chapter ' + c.n + ': ' + c.levels.map(L => LVN[L.n]).join(', ') + ' added' : 'Chapter ' + c.n + ' added: ' + c.title);
    openLib(c.n, m[3] ? +m[3] : 1); return true;
  } catch (e) { toast('This code could not be read. Try again.'); return false; }
}
function openLib(n, lv) {
  stop(); CH = LIB[n]; ALL = [];
  CH.levels.forEach(L => L.sections.forEach(S => S.patterns.forEach(p => ALL.push(Object.assign({lv: L.n, sec: S.title}, p)))));
  LEVEL = CH.levels.some(L => L.n === lv) ? lv : CH.levels[0].n; PI = ALL.findIndex(p => p.lv === LEVEL); TR = 0; TPCT = 1; NOTES = null;
  chapterView(); window.scrollTo(0, 0);
}
function library() {
  stop(); CH = null;
  const chs = Object.values(LIB).sort((a, b) => (a.lib ? 999 : a.n) - (b.lib ? 999 : b.n));
  const items = chs.map(c => { const n = c.levels.reduce((a, L) => a + L.sections.reduce((x, S) => x + S.patterns.length, 0), 0);
    return `<button class="sec chb" data-n="${c.n}"><span class="sw l${c.lib ? 4 : 2}"></span><span><b>${c.lib ? '' : '<span class="n">' + c.n + '</span> '}${esc(c.title)}${c.demo ? ' <small class="demo">SAMPLE</small>' : ''}</b><span>${n} patterns${c.sub ? ' · ' + esc(c.sub) : ''}</span></span></button>`; }).join('');
  const total = Object.keys(CHAPTERS).filter(k => k !== 'lib' && !(k.endsWith('2') && CHAPTERS[k.slice(0, -1)])).length;
  $('view').innerHTML = `<h2>Your library</h2>${items ? `<div class="list">${items}</div>` : ''}
    <div class="empty"><svg viewBox="0 0 24 24"><path d="M4 4h5v2H6v3H4V4zm11 0h5v5h-2V6h-3V4zM4 15h2v3h3v2H4v-5zm14 3v-3h2v5h-5v-2h3zM8 8h3v3H8V8zm5 0h3v3h-3V8zm-5 5h3v3H8v-3zm5 0h3v3h-3v-3z"/></svg>
    <p class="muted">${Object.values(LIB).filter(c => !c.demo).length ? 'Add more chapters' : 'Add your first chapter'}: point your camera at the code on the <b>first page of any chapter</b> of the book, or tap <b>Scan a code</b>.<br>${Object.values(LIB).filter(c => !c.demo && !c.lib).length} of ${total} chapters added.</p></div>`;
  document.querySelectorAll('.chb').forEach(b => b.onclick = () => openLib(+b.dataset.n, 1));
}
function chapterView() { home(); }
// ---------------- vistas
function home() {
  const levels = CH.levels.map(L => `<button class="lvb" data-l="${L.n}" aria-pressed="${L.n === LEVEL}"><i class="lvsq l${L.n}"></i>${LVN[L.n]}</button>`).join('') + (CH.more || []).map(n => `<button class="lvb lock" data-lock="${n}" aria-pressed="false" style="opacity:.5"><i class="lvsq l${n}"></i>${LVN[n]} 🔒</button>`).join('');
  const list = CH.levels.find(L => L.n === LEVEL).sections.map(S => `<h3>${esc(S.title)}</h3><div class="list">` +
    S.patterns.map(p => { const i = ALL.findIndex(q => q.num === p.num); return `<button class="sec pat${i === PI ? ' on' : ''}" data-i="${i}"><span class="sw l${LEVEL}"></span><span><b><span class="n">${p.num}</span> ${ttl(p.t)}</b><span>${esc(p.ch.replace(/<\d+/g, '').replace(/\s*\|\s*/g, ' | '))} · ${p.bpm} bpm</span></span></button>`; }).join('') + '</div>').join('');
  $('view').innerHTML = `<button class="btn ghost back" id="back">‹ Library</button><div class="chtitle"><small>${CH.lib ? 'Extra' : 'Chapter ' + CH.n}</small><h2>${esc(CH.title)}</h2></div><div class="lvbar">${levels}</div><div id="player"></div>${list}`;
  $('back').onclick = () => library();
  document.querySelectorAll('.lvb.lock').forEach(b => b.onclick = () => toast('To open this level, scan the code at the start of the Intermediate level in the book.'));
  document.querySelectorAll('.lvb:not(.lock)').forEach(b => b.onclick = () => { LEVEL = +b.dataset.l; PI = ALL.findIndex(p => p.lv === LEVEL); stop(); home(); });
  document.querySelectorAll('.pat').forEach(b => b.onclick = () => { const was = playing; stop(); PI = +b.dataset.i; home(); $('player').scrollIntoView({behavior: 'smooth', block: 'start'}); if (was) play(); });
  renderPlayer();
}
const cur = () => ALL[PI];
function keyName() { return PIANO.transposeKey(cur().key || 'C', TR); }
function chan(k, label) { return `<button data-m="${k}" aria-pressed="${!mute[k]}">${label}</button>`; }
function renderPlayer() {
  const P = cur(), T0 = Math.round(P.bpm * TPCT);
  $('player').innerHTML = `${MODE !== 'piano' ? `<div class="views" role="group" aria-label="View">${VIEWS.map(([k, l]) => `<button data-v="${k}" aria-pressed="${VIEW === k}">${l}</button>`).join('')}</div>` : ''}<div class="scorewrap"><div class="score" id="score"></div></div>
  <div class="seekrow"><div class="qbtns"><button id="qmet" aria-pressed="${METRO}" title="Metronome" aria-label="Metronome"><svg viewBox="0 0 24 24"><path d="M9.2 2h5.6l4.6 18.5c.2.8-.4 1.5-1.2 1.5H5.8c-.8 0-1.4-.7-1.2-1.5zM10.6 4l-3.3 14h9.4l-1.2-5-3.6 3.3-1.1-1.1 4.2-3.9L13.4 4z"/></svg></button><button id="qcin" aria-pressed="${COUNTIN}" title="Count-in" aria-label="Count-in"><b>1234</b></button><button id="qfull" title="Full screen" aria-label="Full screen"><svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/></svg></button></div><div class="seek" id="seek" aria-label="Position and loop"></div></div>
  ${MODE !== 'piano' ? '<div class="chname" id="chname"></div>' : ''}<div class="kbd" id="kbd"></div>
  <div class="transport"><div class="pbtns"><button id="play" aria-label="Play"><svg viewBox="0 0 24 24" id="picon"><path d="M7 4.5v15l13-7.5z"/></svg></button><button id="prst" class="prst" aria-label="Back to start"><svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM19 5v14L9 12z"/></svg></button></div>
  <div style="display:grid;gap:4px;min-width:0"><div class="gnav"><span class="gt"><span class="n">${P.num}</span> ${ttl(P.t)}</span><button id="gprev">‹ Previous</button><button id="gnext">Next ›</button></div>
  <div><span class="bpm"><span id="bpm">${T0}</span> <small><span id="pct">${TPCT !== 1 ? Math.round(TPCT * 100) + '% · ' : ''}</span>bpm${/\/8$/.test(P.meter || '') ? ' (dotted quarter) · ' + P.meter : ''}${P.swing ? ' · swing ' + P.swing + 'ths' : ''}</small></span></div>
  <input type="range" id="tempo" min="30" max="220" value="${T0}" aria-label="Tempo">
  <div class="steps"><button data-f=".5">50%</button><button data-f=".75">75%</button><button data-f=".9">90%</button><button data-f="1">100%</button><button data-d="-4">−4</button><button data-d="4">+4</button></div></div></div>
  <div class="keyrow"><span>Key</span><button id="kdn" aria-label="Transpose down">−</button><b id="kname">${esc(keyName())}</b><button id="kup" aria-label="Transpose up">+</button><button id="k0" class="ghostb">Original key</button></div>
  <div class="mix chs">${MODE === 'guitar' ? chan('gt', UKE ? 'Ukulele' : 'Guitar') + chan('dr', 'Drums') + chan('bs', 'Bass') : MODE === 'bass' ? chan('bs', 'Bass') + chan('dr', 'Drums') + chan('kb', 'Keys') : chan('rh', 'Right hand') + chan('lh', 'Left hand') + chan('dr', 'Drums') + chan('bs', 'Bass')}</div>
  <div class="opts">${MODE !== 'piano' ? '' : `<label><input type="radio" name="snd" value="piano" ${SOUND === 'piano' ? 'checked' : ''}><span>Acoustic piano</span></label><label><input type="radio" name="snd" value="ep" ${SOUND === 'ep' ? 'checked' : ''}><span>Electric piano</span></label>`}<label><input type="checkbox" id="metro" ${METRO ? 'checked' : ''}><span>Metronome</span></label><label><input type="checkbox" id="countin" ${COUNTIN ? 'checked' : ''}><span>Count-in</span></label></div>
  <div class="syncrow"><span>Sync</span><button id="sydn" aria-label="Show the score earlier">−</button><b id="syval">${SYNC > 0 ? '+' : ''}${SYNC} ms</b><button id="syup" aria-label="Show the score later">+</button><small>If the moving bar runs ahead of the sound, press +; if it lags behind, press −.</small></div>
  <p class="tip">${esc(P.tip)}</p>
  <div class="rail" id="rail" aria-label="Quick controls">
    <button id="rplay" class="rbig" aria-label="Play"><svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg></button>
    <div class="rrow"><button id="rprev" aria-label="Previous pattern">‹</button><button id="rnext" aria-label="Next pattern">›</button></div>
    <div class="rlab">Tempo</div><div class="rrow"><button id="rtdn" aria-label="Slower">−</button><button id="rtup" aria-label="Faster">+</button></div><div class="rval" id="rbpm"></div>
    <div class="rlab">Key</div><div class="rrow"><button id="rkdn" aria-label="Key down">−</button><button id="rkup" aria-label="Key up">+</button></div><div class="rval" id="rkey"></div>
    ${MODE !== 'piano' ? `<div class="rlab">View</div><div class="rviews">${VIEWS.map(([k, l]) => `<button data-v="${k}" aria-pressed="${VIEW === k}">${{all: 'All', nt: 'N+T', tab: 'TAB', neck: 'Neck'}[k]}</button>`).join('')}</div>` : ''}
    <div class="rmix">${(MODE === 'guitar' ? [['gt', UKE ? 'Uke' : 'Gtr'], ['dr', 'Drm'], ['bs', 'Bass']] : MODE === 'bass' ? [['bs', 'Bass'], ['dr', 'Drm'], ['kb', 'Keys']] : [['rh', 'RH'], ['lh', 'LH'], ['dr', 'Drm'], ['bs', 'Bass']]).map(([k, l]) => `<button data-rm="${k}" aria-pressed="${!mute[k]}">${l}</button>`).join('')}</div>
  </div>`;
  LOOP = null; START = 0; PAUSED = false; KLO = 36; KHI = 84; applyView(); drawScore(); drawKbd(); initRail(); drawSeek(); applyView();
  document.querySelectorAll('.views button').forEach(b => b.onclick = () => setView(b.dataset.v));
  const sy = d => { SYNC = Math.max(-300, Math.min(300, SYNC + d)); try { localStorage.setItem('pg-sync', SYNC); } catch (e) {} $('syval').textContent = (SYNC > 0 ? '+' : '') + SYNC + ' ms'; };
  $('sydn').onclick = () => sy(-20); $('syup').onclick = () => sy(20);
  $('qfull').onclick = () => setFocus(true); if (document.body.classList.contains('focus')) buildFbar();
  $('score').onclick = () => playing ? pause() : play();
  const setT = (v, f) => { $('tempo').value = v; $('bpm').textContent = $('tempo').value; TPCT = f ? +f : +$('tempo').value / P.bpm; if (Math.abs(TPCT - 1) < .005) TPCT = 1; $('pct').textContent = TPCT !== 1 ? Math.round(TPCT * 100) + '% · ' : ''; };
  $('tempo').oninput = e => setT(e.target.value);
  document.querySelectorAll('.steps button').forEach(b => b.onclick = () => b.dataset.f ? setT(Math.round(P.bpm * b.dataset.f), b.dataset.f) : setT(+$('tempo').value + +b.dataset.d));
  document.querySelectorAll('.mix button[data-m]').forEach(b => { b.onclick = () => { if (b._long) { b._long = false; return; } mute[b.dataset.m] = !mute[b.dataset.m]; b.setAttribute('aria-pressed', !mute[b.dataset.m]); }; holdVol(b, b.dataset.m); });
  volLabels();
  $('play').onclick = () => playing ? pause() : play();
  if ($('prst')) $('prst').onclick = () => { stop(); PAUSED = false; START = LOOP ? LOOP[0] * (NOTES || PIANO.expand(cur(), {tr: TR})).n : 0; markSeek(Math.floor(START / (NOTES || PIANO.expand(cur(), {tr: TR})).n), 0); };
  const mv = d => { const was = playing; stop(); const lst = ALL.filter(p => p.lv === LEVEL); const k = (lst.indexOf(P) + d + lst.length) % lst.length; PI = ALL.indexOf(lst[k]); home(); if (was) play(); };
  $('gprev').onclick = () => mv(-1); $('gnext').onclick = () => mv(1);
  const tr = d => { TR = d === 0 ? 0 : Math.max(-6, Math.min(6, TR + d)); if (TR === 6 && d > 0) TR = 6; $('kname').textContent = keyName(); NOTES = null; drawScore(); };
  $('kdn').onclick = () => tr(-1); $('kup').onclick = () => tr(1); $('k0').onclick = () => tr(0);
  document.querySelectorAll('input[name=snd]').forEach(r => r.onchange = () => { SOUND = r.value; saveOpts(); });
  $('metro').onchange = e => { METRO = e.target.checked; saveOpts(); $('qmet').setAttribute('aria-pressed', METRO); };
  $('countin').onchange = e => { COUNTIN = e.target.checked; saveOpts(); $('qcin').setAttribute('aria-pressed', COUNTIN); };
  $('qmet').onclick = () => { $('metro').checked = !$('metro').checked; $('metro').dispatchEvent(new Event('change')); };
  $('qcin').onclick = () => { $('countin').checked = !$('countin').checked; $('countin').dispatchEvent(new Event('change')); };
}
let LAY = null, NOTES = null;
let CHFR = new Map(), ARP = new Map(), FBNF = 13, SYS = [], CURSYS = -1, KEYS = null, FRETS = null, SW = 640, GBASS = null;
// guitarra: trastes (acordes con su forma, notas sueltas por posición) y bajo de acompañamiento (P.bass o la fundamental en cada cambio)
function prepGtr(P) {
  const X = NOTES, L = X.n * X.nb; FRETS = new Map();
  const single = (X.hands.gt || []).filter(n => !n.fr), m = PIANO.tabFrets(single, P.pos, P.lv, UKE ? PIANO.UKSTR : PIANO.GSTR);
  CHFR = new Map();   // acordes con forma: los de la cifra (nt.fr) y los escritos nota a nota (varias notas a la vez)
  for (const nt of X.hands.gt || []) { let fr = nt.fr; const r = m.get(nt);
    if (!fr && r && nt.ps.length > 1) fr = [[r[0], r[1]], ...(r[2] || []).map(e => [e[0], e[1]])];
    if (fr && fr.length > 1) CHFR.set(nt, nt.vfr ? nt.vfr.slice().sort((p, q) => p[0] - q[0]) : fr); FRETS.set(nt, fr || [r].filter(Boolean)); }
  const vfrArp = new Map(); for (const nt of X.hands.gt || []) if (nt.vfr && nt.fr && nt.fr.length === 1) vfrArp.set(nt, nt.vfr.slice().sort((p, q) => p[0] - q[0]));   // ukelele: punteo sobre la forma del acorde
  // arpegios: las notas sueltas de un mismo acorde que caen en cuerdas distintas (una por cuerda, palmo ≤ 4 trastes) forman su forma de acorde
  ARP = new Map(); const segs = X.cs.map((c, k) => [Math.max(0, c.s), k + 1 < X.cs.length ? Math.max(0, X.cs[k + 1].s) : L]);
  for (const [a, z] of segs) { const ns = (X.hands.gt || []).filter(nt => nt.s >= a && nt.s < z && !CHFR.has(nt) && m.get(nt) && !nt.wrapIn);
    if (ns.length < 3) continue; const cnt = new Map();   // en cada cuerda, el traste más tocado forma parte de la forma; el resto son notas de paso
    for (const nt of ns) { const [st, f] = m.get(nt), k = st + '_' + f; cnt.set(k, (cnt.get(k) || 0) + 1); }
    const byS = new Map(); for (const [k, c] of [...cnt.entries()].sort((p, q) => q[1] - p[1])) { const [st, f] = k.split('_').map(Number); if (!byS.has(st)) byS.set(st, f); }
    const inShape = nt => { const [st, f] = m.get(nt); return byS.get(st) === f; }, extra = ns.filter(nt => !inShape(nt)).length;
    const fx = [...byS.values()].filter(f => f > 0);
    if (byS.size < 3 || extra > ns.length * 0.3 || (fx.length && Math.max(...fx) - Math.min(...fx) > 4)) continue;
    let shape = [...byS.entries()].sort((p, q) => p[0] - q[0]);
    // si las notas caben en la forma normal del acorde (p. ej. el Do abierto), se enseña la forma completa
    try { const k = segs.findIndex(sg => sg[0] === a), sym = X.cs[k] && X.cs[k].sym;
      if (sym) { const V = PIANO.expand({ch: sym, gtr: 'C' + '-'.repeat(X.n - 1), key: P.key || 'C', lv: P.lv || 2, meter: P.meter, inst: P.inst}).hands.gt[0], vf = V && V.fr;
        if (vf && shape.every(([st, f]) => vf.some(q => q[0] === st && q[1] === f))) shape = vf.slice().sort((p, q) => p[0] - q[0]); } } catch (e) {}
    ns.forEach(nt => ARP.set(nt, inShape(nt) ? shape : {shape})); }
  for (const [nt, sh] of vfrArp) ARP.set(nt, sh);
  let b = P.bass; if (!b) { const a = new Array(L).fill('-'); X.cs.forEach(c => { if (c.s >= 0 && c.s < L) a[c.s] = '1'; }); if (a[0] !== '1') a[0] = '1'; b = a.join(''); }
  GBASS = PIANO.expand(Object.assign({}, P, {bass: b, rh: '', lh: '', gtr: ''}), {tr: TR}).hands.bs || [];
}
// bajo: digitación (para el mástil) y teclado de acompañamiento (P.keys o un acorde sostenido en cada cambio)
function prepBass(P) {
  if (MODE === 'guitar') return prepGtr(P);
  if (MODE !== 'bass') return; const X = NOTES, L = X.n * X.nb;
  FRETS = PIANO.tabFrets(X.hands.bs || [], P.pos, P.lv);
  let k = P.keys;
  if (!k) { const a = new Array(L).fill('-'); X.cs.forEach(c => { if (c.s >= 0 && c.s < L) a[c.s] = 'T'; }); if (a[0] !== 'T') a[0] = 'T'; k = a.join(''); }
  KEYS = PIANO.expand(Object.assign({}, P, {rh: k, lh: '', bass: ''}), {tr: TR});
}
// barra de posición: tocar un compás = ir ahí; arrastrar por varios compases = repetir esa zona en bucle
function seekTo(bar) {
  const X = NOTES || PIANO.expand(cur(), {tr: TR}), bn = X.n; START = bar * bn;
  if (playing && ctx) { voices.forEach(v => { try { v.stop(); } catch (e) {} }); voices = []; visQ = []; cin = 0; POS = START; WRAPPED = false; CRASH1 = true; nextT = ctx.currentTime + 0.06; }
  markSeek(bar, 0);
  if (PAGE) { const k = SYS.findIndex(L => bar >= L.bars[0] && bar < L.bars[1]); if (k >= 0 && (k < PAGE[0] || k >= PAGE[1])) pageFrom(k); }
}
function drawSeek() {
  const box = $('seek'); if (!box) return; const X = NOTES || PIANO.expand(cur(), {tr: TR}), nb = X.nb;
  let h = '<div class="sbars">'; for (let b = 0; b < nb; b++) h += `<div class="sc${LOOP && b >= LOOP[0] && b < LOOP[1] ? ' lp' : ''}" data-b="${b}"><i></i><span>${b + 1}</span></div>`;
  h += '</div>' + (LOOP ? `<button class="sclr" id="sclr" aria-label="Stop looping">Loop ${LOOP[0] + 1}–${LOOP[1]} ✕</button>` : '<span class="shint">Tap a bar to jump · hold bars to loop them (hold again to clear)</span>');
  box.innerHTML = h; markSeek(Math.floor(START / X.n), 0);
  if ($('sclr')) $('sclr').onclick = () => { LOOP = null; drawSeek(); };
  const cellAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY); const c = el && el.closest && el.closest('.sc'); return c ? +c.dataset.b : null; };
  let a = null, drag = false, lp = null, longDone = false; const bars = box.querySelector('.sbars');   // pulsación larga = bucle de ese compás
  bars.oncontextmenu = e => e.preventDefault();
  bars.onpointerdown = e => { a = cellAt(e); drag = false; longDone = false; clearTimeout(lp); if (a === null) return; bars.setPointerCapture(e.pointerId);
    const b0 = a; lp = setTimeout(() => { if (drag || a !== b0) return; longDone = true; try { navigator.vibrate && navigator.vibrate(25); } catch (er) {}
      // sin bucle: ese compás · fuera del bucle: se amplía hasta él · dentro del bucle: se quita el bucle
      if (!LOOP) LOOP = [b0, b0 + 1]; else if (b0 >= LOOP[0] && b0 < LOOP[1]) LOOP = null; else LOOP = [Math.min(LOOP[0], b0), Math.max(LOOP[1], b0 + 1)];
      drawSeek(); if (LOOP) seekTo(LOOP[0]); }, 550); };
  bars.onpointermove = e => { if (a === null || longDone) return; const b = cellAt(e); if (b === null || (b === a && !drag)) return; drag = true; clearTimeout(lp);
    const lo = Math.min(a, b), hi = Math.max(a, b); bars.querySelectorAll('.sc').forEach(c => c.classList.toggle('lp', +c.dataset.b >= lo && +c.dataset.b <= hi)); };
  bars.onpointerup = e => { clearTimeout(lp); if (a === null) return; if (longDone) { a = null; longDone = false; return; } const b = cellAt(e); const end = b === null ? a : b;
    if (drag) { LOOP = [Math.min(a, end), Math.max(a, end) + 1]; drawSeek(); seekTo(LOOP[0]); }
    else { if (LOOP && (a < LOOP[0] || a >= LOOP[1])) LOOP = null; drawSeek(); seekTo(a); }
    a = null; drag = false; };
  bars.onpointercancel = () => { clearTimeout(lp); a = null; drag = false; if (!longDone) drawSeek(); longDone = false; };
}
function markSeek(bar, frac) { const box = $('seek'); if (!box) return; box.querySelectorAll('.sc').forEach(c => { const on = +c.dataset.b === bar; c.classList.toggle('cur', on); c.querySelector('i').style.width = on ? (frac * 100).toFixed(1) + '%' : '0'; }); }
// volumen por canal: mantener pulsado Guitar / Bass / Drums (o Gtr / Bass / Drm en la barra lateral) abre un control de volumen
const CHN = {gt: 'Guitar', dr: 'Drums', bs: 'Bass', kb: 'Keys', rh: 'Right hand', lh: 'Left hand'};
function volLabels() { document.querySelectorAll('[data-m],[data-rm]').forEach(b => { const k = b.dataset.m || b.dataset.rm; let t = b.querySelector('.vl'); const v = Math.round(vf(k) * 100);
  if (v === 100) { if (t) t.remove(); return; } if (!t) { t = document.createElement('small'); t.className = 'vl'; b.appendChild(t); } t.textContent = v + '%'; }); }
function holdVol(b, k) { let tm = null;
  b.addEventListener('contextmenu', e => e.preventDefault());
  b.addEventListener('pointerdown', () => { clearTimeout(tm); tm = setTimeout(() => { b._long = true; try { navigator.vibrate && navigator.vibrate(25); } catch (e) {} openVol(b, k); }, 500); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => clearTimeout(tm))); }
function openVol(b, k) {
  document.querySelectorAll('.volpop').forEach(x => x.remove());
  const r = b.getBoundingClientRect(), pop = document.createElement('div'); pop.className = 'volpop';
  pop.innerHTML = `<div class="vh"><b>${CHN[k] || k}</b><span id="vval">${Math.round(vf(k) * 100)}%</span></div><input type="range" min="0" max="150" step="5" value="${Math.round(vf(k) * 100)}" aria-label="${CHN[k] || k} volume"><div class="vb"><button data-v="0">0</button><button data-v="50">50</button><button data-v="100">100</button><button data-v="150">150</button><button class="vok">OK</button></div>`;
  document.body.appendChild(pop);
  const W = pop.offsetWidth, H = pop.offsetHeight; let x = r.left + r.width / 2 - W / 2, y = r.top - H - 8; if (y < 6) y = r.bottom + 8;
  pop.style.left = Math.max(6, Math.min(innerWidth - W - 6, x)) + 'px'; pop.style.top = Math.max(6, Math.min(innerHeight - H - 6, y)) + 'px';
  const set = v => { VOL[k] = v / 100; pop.querySelector('input').value = v; $('vval').textContent = v + '%'; volLabels(); if (v > 0 && mute[k]) { mute[k] = false; document.querySelectorAll(`[data-m="${k}"],[data-rm="${k}"]`).forEach(x => x.setAttribute('aria-pressed', 'true')); } };
  pop.querySelector('input').oninput = e => set(+e.target.value);
  pop.querySelectorAll('[data-v]').forEach(x => x.onclick = () => set(+x.dataset.v));
  const close = () => { pop.remove(); document.removeEventListener('pointerdown', out, true); };
  const out = e => { if (!pop.contains(e.target)) close(); };
  pop.querySelector('.vok').onclick = close; setTimeout(() => document.addEventListener('pointerdown', out, true), 0);
}
// pantalla completa: solo partitura, barra de compases y mástil/teclado; una barra flotante para tocar y volver a las funciones
function setFocus(on) {
  document.body.classList.toggle('focus', on);
  try { if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch (e) {}
  const fb = document.querySelector('body > .fbar'); if (fb) fb.remove(); if (on) buildFbar();
  setTimeout(() => { if ($('score')) drawScore(); if ($('player')) $('player').scrollIntoView({block: 'start'}); }, 120);
}
function buildFbar() {
  document.querySelectorAll('body > .fbar').forEach(x => x.remove());
  const fb = document.createElement('div'); fb.className = 'fbar';
  fb.innerHTML = '<button class="fprst" aria-label="Back to start"><svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM19 5v14L9 12z"/></svg></button><button class="fplay" aria-label="Play"></button><button class="fexit" aria-label="Exit full screen"><svg viewBox="0 0 24 24"><path d="M10 4v6H4V8h4V4zm4 0h2v4h4v2h-6zM4 14h6v6H8v-4H4zm10 0h6v2h-4v4h-2z"/></svg><span>Controls</span></button>';
  document.body.appendChild(fb);
  fb.querySelector('.fplay').onclick = () => { $('play') && $('play').click(); syncFbar(); };
  fb.querySelector('.fprst').onclick = () => { $('prst') && $('prst').click(); syncFbar(); };
  fb.querySelector('.fexit').onclick = () => setFocus(false);
  syncFbar();
}
function syncFbar() { const b = document.querySelector('body > .fbar .fplay'); if (!b) return;
  b.innerHTML = playing ? '<svg viewBox="0 0 24 24"><path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>'; }
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('focus')) setFocus(false); });
setInterval(() => { syncFbar(); if (document.body.classList.contains('focus') && !$('player')) setFocus(false); }, 300);
// barra lateral compacta (solo móvil en horizontal): los controles principales sin bajar la página
let RAILT = null;
function syncRail() { if (!$('player') || !$('player').innerHTML) { const r = $('rail'); if (r) r.remove(); document.body.classList.remove('hasrail'); }
  if (!$('rail')) { clearInterval(RAILT); RAILT = null; return; }
  $('rbpm').textContent = $('bpm') ? $('bpm').textContent + ' bpm' : ''; $('rkey').textContent = $('kname') ? $('kname').textContent : '';
  $('rplay').innerHTML = playing ? '<svg viewBox="0 0 24 24"><path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>';
  document.querySelectorAll('#rail [data-rm]').forEach(b => b.setAttribute('aria-pressed', !mute[b.dataset.rm])); volLabels(); }
function initRail() {
  document.querySelectorAll('body > .rail').forEach(r => r.remove()); const rl = $('rail'); if (rl) { document.body.appendChild(rl); document.body.classList.add('hasrail'); }   // fuera de la tarjeta: fijo al borde de la pantalla
  const go = (id, sel) => { const el = sel ? document.querySelector(sel) : $(id); if (el) el.click(); syncRail(); };
  $('rplay').onclick = () => go('play'); $('rprev').onclick = () => go('gprev'); $('rnext').onclick = () => go('gnext');
  $('rtdn').onclick = () => go(null, '.steps [data-d="-4"]'); $('rtup').onclick = () => go(null, '.steps [data-d="4"]');
  $('rkdn').onclick = () => go('kdn'); $('rkup').onclick = () => go('kup');
  document.querySelectorAll('.rviews button').forEach(b => b.onclick = () => setView(b.dataset.v));
  document.querySelectorAll('#rail [data-rm]').forEach(b => { b.onclick = () => { if (b._long) { b._long = false; return; } go(null, `.mix button[data-m="${b.dataset.rm}"]`); }; holdVol(b, b.dataset.rm); });
  syncRail(); if (!RAILT) RAILT = setInterval(syncRail, 300); }
// si la partitura no cabe (móvil en horizontal), se alinea arriba: centrada se cortaría la primera línea
function fitTop() { const box = $('score'); if (!box || PAGE) return; box.style.alignContent = ''; const svg = box.querySelector('svg'); if (svg) { svg.style.width = ''; svg.style.margin = ''; }
  requestAnimationFrame(() => {
    // una línea completa (pentagrama + las 6 cuerdas de TAB) tiene que caber: si no, se reduce la partitura lo justo
    if (svg && SYS.length && getComputedStyle(box).maxHeight !== 'none') { const sc = svg.clientWidth / (SW + 8), hMax = Math.max(...SYS.map(L => L.H)) * sc + 6, room = box.clientHeight - 6;
      if (hMax > room && room > 60) { svg.style.width = Math.max(55, room / hMax * 100).toFixed(1) + '%'; svg.style.margin = '0 auto'; } }
    if (box.scrollHeight > box.clientHeight + 2) { box.style.alignContent = 'start'; box.scrollTop = 0; } }); }
let RSZ = null; addEventListener('resize', () => { clearTimeout(RSZ); RSZ = setTimeout(() => { if ($('score') && !playing) drawScore(); }, 250); });
// pasa de línea sola: si no caben todos los pentagramas (móvil en horizontal), muestra el que está sonando y el siguiente
function follow(k) {
  if (k === CURSYS) return; CURSYS = k; if (!PAGE) return;
  if (k < PAGE[0] || k >= PAGE[1]) pageFrom(k);
}
function drawScore() {
  const P = cur(); const narrow = MODE !== 'bass' && innerWidth < 700, foc = document.body.classList.contains('focus') && innerWidth < innerHeight, W = narrow ? (MODE === 'piano' ? (foc ? 340 : 400) : (foc ? 400 : 470)) : 640;   // pantalla completa en vertical: aún más grande   // guitarra y piano en móvil vertical: 2 compases por línea, más grandes
  SW = W;
  SYS = (MODE === 'bass' ? PIANO.systemsBass : MODE === 'guitar' ? PIANO.systemsGtr : PIANO.systems)(P, Object.assign({W, sp: 5.6, tr: TR}, MODE !== 'bass' ? {big: true} : {}, MODE !== 'piano' && VIEW === 'tab' ? {rhythm: true} : MODE !== 'piano' && VIEW === 'neck' ? {rhythmOnly: true} : {}, narrow ? {per: 2, forcePer: MODE === 'piano' ? 2 : undefined} : {}, MODE !== 'piano' && VIEW === 'neck' ? {per: 4} : {})); LAY = SYS[0];
  NOTES = PIANO.expand(P, {tr: TR}); prepBass(P); if (MODE !== 'piano') drawFret(); else if ($('kbd')) drawKbd();
  PAGE = null; PAGEH = 0; if ($('score')) $('score').style.height = ''; showSystems(0, SYS.length);
  // si no cabe todo, se pasa a páginas: solo las líneas que caben enteras (pentagrama + TAB), empezando por la que suena
  requestAnimationFrame(() => { const box = $('score'); if (box && box.scrollHeight > box.clientHeight + 4) pageFrom(0); });
}
let PAGE = null, PAGEH = 0;   // [primera, última+1] líneas visibles cuando la partitura va por páginas
function showSystems(a, z) {
  let y = 0, g = '';
  SYS.forEach((L, k) => { if (k < a || k >= z) return; L.y = y; g += `<g transform="translate(0 ${y.toFixed(1)})">${PIANO.toSVG(L)}<rect id="ph${k}" x="0" y="0" width="${(L.slotX[L.bars[0] * L.n + 1] - L.slotX[L.bars[0] * L.n]).toFixed(1)}" height="${L.H.toFixed(1)}" rx="3" class="ph" visibility="hidden"/></g>`; y += L.H + 4; });
  const box = $('score'); box.innerHTML = `<svg viewBox="-4 0 ${SW + 8} ${Math.max(1, y - 4).toFixed(1)}" width="100%" role="img" aria-label="Score">${g}</svg>`;
  box.style.alignContent = ''; box.scrollTop = 0;
}
function pageFrom(k) {
  const box = $('score'); if (!box) return; const svg0 = box.querySelector('svg'); box.style.alignContent = 'start';
  if (!PAGEH) { PAGEH = box.clientHeight; box.style.height = PAGEH + 'px'; }   // el recuadro no cambia de alto al pasar de página
  const room = PAGEH - 8, wpx = (svg0 ? svg0.parentElement.clientWidth : box.clientWidth) - 16, sc = wpx / (SW + 8);
  let z = k, h = 0; while (z < SYS.length && (z === k || h + (SYS[z].H + 4) * sc <= room)) { h += (SYS[z].H + 4) * sc; z++; }
  PAGE = [k, z]; showSystems(k, z);
  const svg = box.querySelector('svg'); const hh = (h - 4 * sc);
  if (svg && hh > room) { svg.style.width = Math.max(50, room / hh * 100).toFixed(1) + '%'; svg.style.margin = '0 auto'; }
}
// teclado: C2..C6
let KLO = 36, KHI = 84;   // C2–C6 (4 octavas); si suena una nota fuera, el teclado se desplaza hasta ella
// mástil completo (trastes 0–12), siempre visible: las notas del patrón en tenue y la que suena iluminada
function drawFret() {
  const box = $('kbd'); if (!box) return;
  // mástil: trastes 0–12 como mínimo; si el patrón sube más, se alarga lo necesario (hasta el 24)
  let maxF = 12; if (FRETS) for (const fr of FRETS.values()) if (fr) (Array.isArray(fr[0]) ? fr : [fr]).forEach(q => { if (q && q[1] > maxF) maxF = q[1]; (q && q[2] || []).forEach(e => { if (e[1] > maxF) maxF = e[1]; }); });
  if (NOTES && NOTES.hands.gt) for (const nt of NOTES.hands.gt) if (nt.fr) nt.fr.forEach(q => { if (q[1] > maxF) maxF = q[1]; });
  const NF = Math.min(24, maxF + 1); FBNF = NF; const sx = f => 3 + f * 94 / NF; let h = '';
  for (let f = 0; f <= NF; f++) h += `<line x1="${sx(f)}%" y1="10%" x2="${sx(f)}%" y2="84%" class="${f ? 'fw' : 'nut'}"/>`;   // los trastes acaban en la primera y la última cuerda
  [3, 5, 7, 9, 12, 15, 17, 19, 21, 24].filter(f => f <= NF).forEach(f => h += `<circle cx="${sx(f - 0.5)}%" cy="47%" r="3.5" class="fdot"/>`);
  const NSx = MODE === 'guitar' && !UKE ? 6 : 4, dy = 74 / (NSx - 1);
  for (let st = 0; st < NSx; st++) h += `<line x1="${sx(0)}%" y1="${84 - st * dy}%" x2="97%" y2="${84 - st * dy}%" class="str" style="stroke-width:${UKE ? 1.9 : (MODE === 'guitar' ? 2.2 : 2.6) - st * (MODE === 'guitar' ? 0.32 : 0.45)}"/>`;
  const used = new Set(); if (FRETS) for (const [nt, fr] of FRETS.entries()) if (fr && !(GDIAG && (CHFR.has(nt) || ARP.has(nt)))) (Array.isArray(fr[0]) ? fr : [fr]).forEach(q => q && used.add(q[0] + '_' + q[1]));
  for (let st = 0; st < NSx; st++) for (let f = 0; f <= NF; f++) h += `<circle id="f${st}_${f}" cx="${f ? sx(f - 0.5) : 1.5}%" cy="${84 - st * dy}%" r="${(MODE === 'guitar' && !UKE ? 5.5 : 7) * (NF > 16 ? 0.8 : 1)}" class="fn${used.has(st + '_' + f) ? ' used' : ''}"/>`;
  for (const f of [3, 5, 7, 9, 12, 15, 17, 19, 21, 24].filter(f => f <= NF)) h += `<text x="${sx(f - 0.5)}%" y="100%" text-anchor="middle" class="kl">${f}</text>`;
  if (GDIAG) h += '<g id="chd"></g>';
  box.innerHTML = `<svg width="100%" height="${MODE === 'guitar' && !UKE ? 104 : 90}" aria-hidden="true">${h}</svg>`;
  if (GDIAG) showChord([...CHFR.values()][0] || [...ARP.values()].filter(v => Array.isArray(v))[0] || null, 0);
}
// guitarra (prueba): el acorde se ve como diagrama completo en el mástil (cejilla incluida) y late con cada rasgueo
const GDIAG = MODE === 'guitar';
function chordFingers(fr) {
  const fx = fr.filter(q => q[1] > 0), opens = fr.some(q => q[1] === 0), minF = fx.length ? Math.min(...fx.map(q => q[1])) : 0;
  const atMin = fx.filter(q => q[1] === minF), sts = atMin.map(q => q[0]);
  let barre = !opens && minF > 0 && atMin.length >= 2 ? [Math.min(...sts), Math.max(...fr.map(q => q[0]))] : null;
  if (barre) { const on = new Set(fr.map(q => q[0])); for (let st = barre[0]; st <= barre[1]; st++) if (!on.has(st)) { barre = null; break; } }   // con una cuerda apagada en medio no es cejilla
  const fing = new Map(); let k = barre ? 2 : 1;
  if (barre) atMin.forEach(q => fing.set(q[0], 1));
  fx.filter(q => !(barre && q[1] === minF)).sort((a, b) => a[1] - b[1] || a[0] - b[0]).forEach(q => fing.set(q[0], Math.min(4, k++)));
  return {barre, minF, fing};
}
function showChord(fr, hit, mute) {
  const g = $('chd'); if (!g) return; const sv = g.ownerSVGElement; if (sv) sv.classList.toggle('chordmode', !!fr); if (!fr) { g.innerHTML = ''; return; }
  const NF = FBNF, NSc = UKE ? 4 : 6, sx = f => 3 + f * 94 / NF, dy = 74 / (NSc - 1), Y = st => 84 - st * dy, {barre, minF, fing} = chordFingers(fr);
  const on = new Map(fr.map(q => [q[0], q[1]])); let h = '';
  for (let st = 0; st < NSc; st++) if (!on.has(st)) h += `<text x="1.5%" y="${Y(st) + 2.6}%" text-anchor="middle" class="cx">×</text>`;
  if (barre) h += `<rect x="${sx(minF - 0.5) - 1.15}%" y="${Y(barre[1]) - 4.5}%" width="2.3%" height="${(barre[1] - barre[0]) * dy + 9}%" rx="7" class="cb"/>`;
  for (const [st, f] of on) {
    if (f === 0) { h += `<circle id="cd${st}_0" cx="1.6%" cy="${Y(st)}%" r="4" class="co"/>`; continue; }
    if (barre && f === minF && st !== barre[0] && st !== barre[1]) { h += `<circle id="cd${st}_${f}" cx="${sx(f - 0.5)}%" cy="${Y(st)}%" r="7.5" class="cd bm"/>`; continue; }
    h += `<circle id="cd${st}_${f}" cx="${sx(f - 0.5)}%" cy="${Y(st)}%" r="7.5" class="cd"/><text x="${sx(f - 0.5)}%" y="${Y(st) + 3.4}%" text-anchor="middle" class="cf">${fing.get(st) || ''}</text>`; }
  g.innerHTML = h; g.dataset.sh = JSON.stringify(fr); g.setAttribute('class', hit ? (mute ? 'hit mute' : 'hit') : '');
}
function shiftKbd(m) {
  const on = [...lit.entries()].filter(([, c]) => c > 0).map(([k]) => +k).concat([m]);   // lo que ya suena tiene que seguir viéndose
  const lo = Math.min(...on), hi = Math.max(...on), cLo = lo - (lo % 12), cHi = hi + (12 - hi % 12) % 12;
  if (cHi - cLo > 48) { KLO = cLo; KHI = cHi; }   // muy separadas (mano izquierda muy grave y derecha muy aguda): teclado más ancho
  else if (m < KLO) { KLO = m - (m % 12); KHI = KLO + 48; } else { KHI = m + (12 - m % 12) % 12; KLO = KHI - 48; }
  drawKbd(); for (const [k, c] of lit) if (c > 0) { const el = $('k' + k); if (el) el.classList.add('on'); }
}
function drawKbd() {
  if (MODE !== 'piano') return drawFret();
  const whites = []; for (let m = KLO; m <= KHI; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
  const ww = 100 / whites.length; let h = '';
  whites.forEach((m, i) => h += `<rect class="kw" id="k${m}" x="${(i * ww).toFixed(3)}%" y="0" width="${ww.toFixed(3)}%" height="100%"/>`);
  for (let m = KLO; m <= KHI; m++) if ([1, 3, 6, 8, 10].includes(m % 12)) { const i = whites.indexOf(m - 1); h += `<rect class="kb" id="k${m}" x="${((i + 1) * ww - ww * 0.32).toFixed(3)}%" y="0" width="${(ww * 0.64).toFixed(3)}%" height="62%"/>`; }
  whites.forEach((m, i) => { if (m % 12 === 0) h += `<text x="${(i * ww + ww / 2).toFixed(3)}%" y="92%" text-anchor="middle" class="kl">C${m / 12 - 1}</text>`; });
  $('kbd').innerHTML = `<svg width="100%" height="64" aria-hidden="true">${h}</svg>`;
}

// ---------------- audio
let POS = 0, START = 0, LOOP = null, WRAPPED = false, CRASH1 = true, PAUSED = false, LASTP = -1;   // posición (semicorchea), inicio elegido en la barra, bucle [compás inicial, compás final) y si ya se ha dado la vuelta
let ctx = null, master = null, bufs = {}, INST = {}, loaded = false, playing = false, timer = null, nextT = 0, step = 0, cin = 0, visQ = [], voices = [], rr = {}, openHat = null, WL = null;
function b64buf(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
function onset(buf) { const x = buf.getChannelData(0); for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.02) return Math.max(0, i / buf.sampleRate - 0.002); return 0; }
async function initAudio() {
  if (ctx) return; try { ctx = new (window.AudioContext || window.webkitAudioContext)({latencyHint: 'playback'}); } catch (e) { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
  // limitador suave: evita la saturación (el «chisporroteo») cuando suenan muchas notas a la vez
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.2; comp.connect(ctx.destination);
  master = ctx.createGain(); master.gain.value = 0.42; master.connect(comp);
  // reverberación breve y ligera (poca CPU en móviles)
  const conv = ctx.createConvolver(); const len = Math.floor(ctx.sampleRate * 0.9), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4); }
  conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.12; conv.connect(wet).connect(master);
  REVIN = ctx.createGain(); REVIN.connect(conv);
  toast('Loading sounds…');
  const jobs = Object.entries(ASSETS.snd).map(([k, v]) => ctx.decodeAudioData(b64buf(v)).then(b => bufs[k] = {b, o: onset(b)}));
  for (const [name, v] of Object.entries(INSTS)) for (const [m, b64] of Object.entries(v.pts)) jobs.push(ctx.decodeAudioData(b64buf(b64)).then(b => { (INST[name] = INST[name] || {})[m] = {b, o: onset(b)}; }));
  await Promise.all(jobs); loaded = true;
}
let REVIN = null; const live = []; const byKey = new Map();
const NV = {hh: 3, ride: 2, kick: 2, snare: 2, ghost: 2};
const G = {hh: 3.4, hhA: 2.2, hho: 3.0, ride: 3.6, crash: .85, snare: .8, snareA: .8, ghost: 1.0, xstick: 1.6, kick: .6, sticks: 1.2};
function hit(name, t, gain) {
  let key = name; if (NV[name]) { rr[name] = ((rr[name] || 0) + 1) % NV[name]; key = name + '_' + rr[name]; } else if (!name.startsWith('click')) key = name + '_0';
  const B = bufs[key]; if (!B) return null; const s = ctx.createBufferSource(); s.buffer = B.b; const g = ctx.createGain(); g.gain.value = gain;
  s.connect(g).connect(master); s.start(t, B.o); voices.push(s); if (voices.length > 200) voices.shift(); return {s, g};
}
const VOL = {};   // volumen de cada canal (1 = 100 %), se cambia con una pulsación larga en su botón
const vf = k => VOL[k] == null ? 1 : VOL[k];
const play1 = (n, t, v = 1) => hit(n, t, 1.2 * (G[n] || 1) * v * (n === 'sticks' ? 1 : vf('dr')));
function strike(k, ch, t) {
  if (k === 'hh') { if (openHat && openHat.t < t) { openHat.g.gain.setTargetAtTime(0, t, 0.012); openHat = null; } if (ch === 'x') play1('hh', t, .8); else if (ch === 'X') play1('hhA', t); else { const r = play1('hho', t); if (r) openHat = {...r, t}; } }
  else if (k === 'rd') play1('ride', t); else if (k === 'cr') play1('crash', t);
  else if (k === 'bd') play1('kick', t);
  else if (k === 'sn') { if (ch === 'c') play1('xstick', t, .9); else if (ch === 'g') play1('ghost', t); else play1(ch === 'A' ? 'snareA' : 'snare', t, .9); }
}
function note(inst, m, t, dur, lv, from) {
  const P = INST[inst]; if (!P) return; let best = null; for (const k of Object.keys(P)) if (best === null || Math.abs(+k - m) < Math.abs(best - m)) best = +k;
  const B = P[best]; const src = ctx.createBufferSource(); src.buffer = B.b; src.playbackRate.value = Math.pow(2, (m - best) / 12);
  if (from != null) { src.playbackRate.setValueAtTime(Math.pow(2, (from - best) / 12), t); src.playbackRate.linearRampToValueAtTime(Math.pow(2, (m - best) / 12), t + (Math.abs(from - m) === 2 ? 0.14 : 0.07)); }
  const g = ctx.createGain(); src.connect(g); g.connect(master); if (!inst.startsWith('bass')) g.connect(REVIN);
  const rel = inst.startsWith('bass') ? .04 : .09, end = t + dur;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv, t + 0.004);                // entrada sin clic
  g.gain.setValueAtTime(lv, end); g.gain.setTargetAtTime(0, end, rel); src.start(t, B.o); src.stop(end + rel * 6);
  // la misma tecla otra vez: apaga la anterior (como el apagador de un piano)
  const key = inst + m, prev = byKey.get(key);
  if (prev && prev.end > t) { prev.g.gain.cancelScheduledValues(t); prev.g.gain.setTargetAtTime(0, t, 0.015); try { prev.src.stop(t + 0.12); } catch (e) {} }
  const v = {src, g, end: end + rel * 6}; byKey.set(key, v); live.push(v);
  // como mucho 40 voces: las más antiguas se apagan con un fundido rápido
  while (live.length && live[0].end < t) live.shift();
  if (live.length > 40) { const o = live.shift(); o.g.gain.cancelScheduledValues(t); o.g.gain.setTargetAtTime(0, t, 0.02); try { o.src.stop(t + 0.15); } catch (e) {} }
  voices.push(src); if (voices.length > 300) voices.splice(0, 100);
}
const lit = new Map();
function keyOn(m, hand, t, dur) { visQ.push([t, 'k', m, hand, 1]); visQ.push([t + dur * 0.92, 'k', m, hand, 0]); }
function schedule() {
  const P = cur(); if (!NOTES) { NOTES = PIANO.expand(P, {tr: TR}); prepBass(P); }
  const M = NOTES.M, bn = NOTES.n, n = bn * NOTES.nb, bpm = +$('tempo').value, s = 60 / bpm / M.beat;
  const DR = P.drum || (CH.drums || {})[P.dr] || null;
  while (nextT < ctx.currentTime + 0.2) {
    if (cin > 0) { play1('sticks', nextT, cin === bn / M.beat ? 1 : .8); cin--; nextT += M.beat * s; continue; }
    const i = POS, sw = M.beat === 4 ? (P.swing || 0) : 0, t = nextT + (sw === 8 ? [0, .333, .667, .333][i % 4] : sw === 16 ? (i % 2 ? .333 : 0) : 0) * s;
    if (MODE === 'guitar') {
      if (!mute.bs && GBASS) for (const nt of GBASS) if (nt.s === i && !(nt.wrapIn && WRAPPED)) for (const p of nt.ps) note('bassf', p.m, t, (nt.d + (nt.wrap || 0)) * s * 0.95, .55 * (nt.v / 0.85) * vf('bs'));
      if (!mute.gt) for (const nt of NOTES.hands.gt || []) if (nt.s === i) {
        if (nt.wrapIn && WRAPPED) continue;
        const tone = 'g' + (P.tone || CH.tone || 'clean');
        let dur = (nt.d + (nt.wrap || 0)) * s * (nt.d <= 2 ? 0.85 : 0.97);
        if (nt.art === 's' || nt.art === 'a') dur = Math.min(dur, s * 1.2);
        const ghost = nt.art === 'x', palm = nt.art === 'm', acc = (nt.art === '>' || nt.art === 'a' || nt.art === '^') ? 1.3 : 1;
        const lv = .5 / Math.sqrt(Math.max(1, nt.ps.length) * 0.6) * (nt.v / 0.85) * acc * (ghost ? .5 : nt.art === 'h' || nt.art === 'p' ? .75 : 1) * vf('gt');
        const frs = FRETS && FRETS.get(nt) || [];
        let order = nt.ps.map((p, k) => k); if (nt.art === 'U') order.reverse();
        const gap = nt.ps.length > 1 ? (nt.art === 'D' || nt.art === 'U' ? .011 : .006) : 0;
        const prev = nt.art === '/' ? (NOTES.hands.gt[NOTES.hands.gt.indexOf(nt) - 1] || null) : null;
        order.forEach((k, j) => { const m = nt.ps[k].m, tt = t + j * gap;
          if (ghost) note('gmute', m, tt, .05, lv * 1.2);
          else note(palm ? 'gmute' : (INST[tone] ? tone : 'gclean'), m, tt, palm ? Math.min(dur, .16) : dur, lv, nt.art === 'b' ? m - 2 : prev ? prev.ps[0].m : null); });
        if (GDIAG && CHFR.has(nt)) { const cf = CHFR.get(nt); visQ.push([t, 'c', cf, 1, ghost]); visQ.push([t + Math.min(.13, dur * 0.6), 'c', cf, 0]); }
        else if (GDIAG && ARP.has(nt)) { const a = ARP.get(nt), sh = a.shape || a, key = frs[0] ? frs[0][0] + '_' + frs[0][1] : null;   // arpegio: la forma del acorde y cada nota encendida dentro de ella
          visQ.push([t, 'ca', sh]); if (key) { const ev = a.shape ? 'f' : 'cn'; visQ.push([t, ev, key, 1]); visQ.push([t + Math.max(.08, dur * 0.92), ev, key, 0]); } }
        else { if (GDIAG) visQ.push([t, 'cd']); for (const fr of frs) { visQ.push([t, 'f', fr[0] + '_' + fr[1], 1]); visQ.push([t + Math.max(.08, dur * 0.92), 'f', fr[0] + '_' + fr[1], 0]); } }
      }
    }
    if (MODE === 'bass' && !mute.kb && KEYS) for (const nt of KEYS.hands.rh || []) if (nt.s === i) { const dur = nt.d * s * 0.95; for (const p of nt.ps) note('ep', p.m, t, dur, .2 / Math.sqrt(nt.ps.length) * 1.4 * vf('kb')); }
    for (const hand of (MODE === 'bass' ? ['bs'] : MODE === 'guitar' ? [] : ['rh', 'lh', 'bs'])) {
      if (mute[hand]) continue; const lst = NOTES.hands[hand]; if (!lst) continue;
      for (const nt of lst) if (nt.s === i) {
        if (nt.wrapIn && WRAPPED) continue;                       // ya suena desde el final de la vuelta anterior
        let dur = (nt.d + (nt.wrap || 0)) * s * (nt.d <= 2 ? 0.85 : 0.97);
        if (nt.art === 's' || nt.art === 'a') dur = Math.min(dur, s * 1.2);
        const inst = hand === 'bs' ? 'bassf' : SOUND;
        const acc = (nt.art === '>' || nt.art === 'a' || nt.art === '^') ? 1.3 : 1;
        const lv = (hand === 'bs' ? .62 : (hand === 'rh' ? .42 : .5) / Math.sqrt(nt.ps.length) * 1.35) * (nt.v / 0.85) * acc * vf(hand);
        for (const g of (nt.gr || [])) note(inst, g.m, t - 0.05, 0.06, lv * 0.8);
        if (MODE === 'bass') {
          const ghost = nt.art === 'x', legato = nt.art === 'h' || nt.art === 'p', slide = nt.art === '/';
          const bl = .7 * (nt.v / 0.85) * acc * vf('bs') * (ghost ? .45 : legato ? .75 : (nt.art === 'T' || nt.art === 'P') ? 1.25 : 1);
          const prev = slide ? lst[lst.indexOf(nt) - 1] : null;
          const binst = INST.bassslap && ((CH && CH.id === 'slap') || P.slap) ? 'bassslap' : 'bassf';   // capítulo de slap: sonido de bajo slap
          for (const p of nt.ps) note(binst, p.m, t, ghost ? Math.min(dur, .06) : dur, bl * (binst === 'bassslap' ? 0.85 : 1), prev ? prev.ps[0].m : null);
          const fr = FRETS && FRETS.get(nt); if (fr) { visQ.push([t, 'f', fr[0] + '_' + fr[1], 1]); visQ.push([t + Math.max(.08, dur * 0.92), 'f', fr[0] + '_' + fr[1], 0]); }
          continue;
        }
        for (const p of nt.ps) { const m = p.m; note(inst, m, t, dur, lv); if (hand !== 'bs') keyOn(m, hand, t, dur); }
      }
    }
    // platillo crash: en el primer tiempo solo al arrancar (o al volver al principio de una forma larga), no en cada compás
    if (DR && !mute.dr) for (const k of ['hh', 'rd', 'cr', 'sn', 'bd']) { const r = DR[k] || ''; const c = r[i % r.length]; if (!c || c === '.') continue;
      if (k === 'cr' && i % bn === 0 && !(CRASH1 || (i === 0 && NOTES.nb >= 8))) continue;
      strike(k, c, t); }
    CRASH1 = false;
    if (METRO && i % M.beat === 0) hit(i % bn === 0 ? 'click' : 'click2', t, i % bn === 0 ? .4 : .28);
    visQ.push([t, 'p', i]); step++; nextT += s;
    { const la = LOOP ? LOOP[0] * bn : 0, lb = LOOP ? Math.min(LOOP[1], NOTES.nb) * bn : n; POS++; if (POS >= lb || POS < la) { POS = la; WRAPPED = la === 0; } }
  }
}
// sincronía imagen-sonido: lo que se ve se retrasa lo que tarda el sonido en salir por el altavoz (latencia de salida del móvil o del Bluetooth)
let SYNC = 0; try { SYNC = +(localStorage.getItem('pg-sync') || 0) || 0; } catch (e) {}   // ajuste fino del usuario, en ms (+ = la imagen más tarde)
const outLat = () => { try { return Math.min(0.35, (ctx.outputLatency || 0) + (ctx.baseLatency || 0)); } catch (e) { return 0; } };
function draw() {
  if (!playing) return; const now = ctx.currentTime - outLat() + 0.012 - SYNC / 1000;
  const due = visQ.filter(e => e[0] <= now).sort((a, b) => a[0] - b[0]); visQ = visQ.filter(e => e[0] > now);
  for (const e of due) {
    if (e[1] === 'p') { LASTP = e[2]; const bar = Math.floor(e[2] / NOTES.n); markSeek(bar, (e[2] % NOTES.n + 1) / NOTES.n); showChName(e[2]); { const kk = SYS.findIndex(L => bar >= L.bars[0] && bar < L.bars[1]); if (kk >= 0) follow(kk); } SYS.forEach((L, k) => { const r = $('ph' + k); if (!r) return;
        const on = bar >= L.bars[0] && bar < L.bars[1]; r.setAttribute('visibility', on ? 'visible' : 'hidden'); if (on) { r.setAttribute('x', (L.slotX[e[2]] - 2).toFixed(1)); follow(k); } }); }
    else if (e[1] === 'f') { const el = $('f' + e[2]); if (el) el.classList.toggle('on', !!e[3]); }
    else if (e[1] === 'c') showChord(e[2], e[3], e[4]);
    else if (e[1] === 'ca') { const g = $('chd'); if (g && g.dataset.sh !== JSON.stringify(e[2])) showChord(e[2], 0); if (g) { g.setAttribute('class', 'arp'); const sv = g.ownerSVGElement; if (sv) sv.classList.add('chordmode'); } }
    else if (e[1] === 'cn') { const el = $('cd' + e[2]); if (el) el.classList.toggle('lit', !!e[3]); }
    else if (e[1] === 'cd') { const g = $('chd'); if (g && g.innerHTML) g.setAttribute('class', 'dim'); }   // el acorde queda atenuado; solo se ven además las notas que suenan
    else { if (e[4] && MODE === 'piano' && !$('k' + e[2])) shiftKbd(e[2]);
      const el = $('k' + e[2]); if (el) { const c = (lit.get(e[2]) || 0) + (e[4] ? 1 : -1); lit.set(e[2], Math.max(0, c)); el.classList.toggle('on', c > 0); el.classList.toggle(e[3], c > 0); } }
  }
  requestAnimationFrame(draw);
}
async function play() {
  await initAudio(); if (ctx.state === 'suspended') await ctx.resume(); if (!loaded) return;
  if (innerWidth > innerHeight && innerHeight < 620 && $('player')) $('player').scrollIntoView({behavior: 'smooth', block: 'start'});
  document.querySelectorAll('#kbd .on, #chd .lit').forEach(el => el.classList.remove('on', 'lit', 'rh', 'lh')); lit.clear();
  NOTES = null; playing = true; step = 0; visQ = []; POS = START; WRAPPED = false; CRASH1 = true; cin = (COUNTIN && !PAUSED) ? (() => { const X = PIANO.expand(cur(), {tr: TR}); return X.n / X.M.beat; })() : 0; nextT = ctx.currentTime + 0.08; timer = setInterval(schedule, 25); schedule();
  PAUSED = false; $('picon').innerHTML = '<path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/>'; $('play').setAttribute('aria-label', 'Pause'); requestAnimationFrame(draw);
  try { if ('wakeLock' in navigator && !WL) { WL = await navigator.wakeLock.request('screen'); WL.addEventListener('release', () => WL = null); } } catch (e) {}
}
// pausa: se para el sonido y todo se queda como está (partitura, compás, acorde y nota en el mástil); el play sigue desde ahí
function pause() {
  if (!playing) return; playing = false; clearInterval(timer); voices.forEach(v => { try { v.stop(); } catch (e) {} }); voices = []; openHat = null; visQ = [];
  live.length = 0; byKey.clear(); try { WL && WL.release(); WL = null; } catch (e) {}
  const n = NOTES ? NOTES.n * NOTES.nb : 0; if (n && LASTP >= 0) { const la = LOOP ? LOOP[0] * NOTES.n : 0, lb = LOOP ? LOOP[1] * NOTES.n : n; START = LASTP + 1; if (START >= lb || START < la) START = la; }
  // lo que suena justo en ese momento se queda encendido: el acorde completo o la nota en su sitio
  if (NOTES && LASTP >= 0 && MODE !== 'piano') { const hand = MODE === 'guitar' ? 'gt' : 'bs';
    for (const nt of NOTES.hands[hand] || []) if (nt.s <= LASTP && LASTP < nt.s + nt.d) { const fr = FRETS && FRETS.get(nt);
      if (MODE === 'guitar' && CHFR.has(nt)) showChord(CHFR.get(nt), 0);
      else if (MODE === 'guitar' && ARP.has(nt) && fr && fr[0]) { const a = ARP.get(nt); showChord(a.shape || a, 0); const el = $('cd' + fr[0][0] + '_' + fr[0][1]); if (el) el.classList.add('lit'); else { const f2 = $('f' + fr[0][0] + '_' + fr[0][1]); if (f2) f2.classList.add('on'); } }
      else if (fr) (Array.isArray(fr[0]) ? fr : [fr]).forEach(q => { const el = q && $('f' + q[0] + '_' + q[1]); if (el) el.classList.add('on'); }); } }
  PAUSED = true; const g = $('chd'); if (g && g.innerHTML) { g.setAttribute('class', ''); const sv = g.ownerSVGElement; if (sv) sv.classList.add('chordmode'); }
  if ($('picon')) { $('picon').innerHTML = '<path d="M7 4.5v15l13-7.5z"/>'; $('play').setAttribute('aria-label', 'Play'); }
}
function stop() { PAUSED = false;
  if (!playing) return; playing = false; clearInterval(timer); voices.forEach(v => { try { v.stop(); } catch (e) {} }); voices = []; openHat = null;
  live.length = 0; byKey.clear(); try { WL && WL.release(); WL = null; } catch (e) {}
  document.querySelectorAll('.ph').forEach(r => r.setAttribute('visibility', 'hidden')); CURSYS = -1; if (PAGE) pageFrom(0); else if ($('score')) $('score').scrollTop = 0; document.querySelectorAll('#kbd rect, #kbd circle').forEach(r => r.classList.remove('on', 'rh', 'lh')); lit.clear();
  if (GDIAG) showChord([...CHFR.values()][0] || [...ARP.values()].filter(v => Array.isArray(v))[0] || null, 0);
  if ($('picon')) { $('picon').innerHTML = '<path d="M7 4.5v15l13-7.5z"/>'; $('play').setAttribute('aria-label', 'Play'); }
}
// escanear con la cámara (foto) o al abrir un enlace del libro
async function readImage(src) {
  const img = new Image(); img.src = src; await img.decode();
  for (const max of [1400, 900, 2000, 600]) {
    const k = Math.min(1, max / Math.max(img.width, img.height)); const w = Math.round(img.width * k), h = Math.round(img.height * k);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d', {willReadFrequently: true}); cx.drawImage(img, 0, 0, w, h);
    const r = jsQR(cx.getImageData(0, 0, w, h).data, w, h, {inversionAttempts: 'dontInvert'}); if (r) return r.data; }
  return null;
}
$('cam').onchange = async e => { const f = e.target.files[0]; if (!f) return; const url = URL.createObjectURL(f);
  try { const t = await readImage(url); if (t) await handleCode(t); else toast('No code found. Hold the phone steady and fill the screen with the code.'); } finally { URL.revokeObjectURL(url); e.target.value = ''; } };
(async () => { await loadLibrary(); const h = location.hash.slice(1);
  if (/(?:PG1|BG1|GG1|UK1|FS1)\./.test(h)) { try { history.replaceState(null, '', location.pathname); } catch (e) {} if (await handleCode(h)) return; }
  library(); })();
addEventListener('hashchange', async () => { const h = location.hash.slice(1); if (/(?:PG1|BG1|GG1|UK1|FS1)\./.test(h)) { try { history.replaceState(null, '', location.pathname); } catch (e) {} await handleCode(h); } });
let _rz = null; 
if ('serviceWorker' in navigator && /^https:$/.test(location.protocol) && !/claude|claudeusercontent/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
// guitarra: al girar el móvil, se recoloca la partitura (2 compases por línea en vertical)
if (MODE !== 'bass') { let wasN = innerWidth < 700; addEventListener('resize', () => { const n = innerWidth < 700; if (n !== wasN && !playing && $('score')) { wasN = n; drawScore(); } }); }
