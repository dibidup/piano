// Piano Grooves: motor común (libro + app). Patrones en rejilla de semicorcheas, cifrado americano,
// expansión a notas con ortografía correcta, transposición y maquetación de gran pentagrama como lista de dibujo.
(function (root) {
'use strict';
const LET = 'CDEFGAB', NAT = [0, 2, 4, 5, 7, 9, 11];
const pcL = l => NAT[LET.indexOf(l)];
const mod = (a, n) => ((a % n) + n) % n;
const midiOf = p => 12 * (p.o + 1) + pcL(p.l) + p.a;
function spell(letter, midi, aug2) {                // letra fija → octava y alteración (aug2: segunda/novena aumentada → sin doble sostenido)
  const o = Math.round((midi - pcL(letter)) / 12) - 1, a = midi - (12 * (o + 1) + pcL(letter));
  if (aug2 && a >= 2) return spell(LET[(LET.indexOf(letter) + 1) % 7], midi);   // #9 de E7#9 = G (b10), no F𝄪; el resto de dobles sostenidos se respeta
  return {l: letter, o, a, m: midi};
}
function parseRoot(s) { const m = /^([A-G])(bb|b|##|#)?/.exec(s); if (!m) throw new Error('raíz ' + s);
  const acc = m[2] || ''; return [{l: m[1], a: acc === 'b' ? -1 : acc === 'bb' ? -2 : acc === '#' ? 1 : acc === '##' ? 2 : 0}, m[0].length]; }
const MAJ = {1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12, 9: 14, 10: 16, 11: 17, 12: 19, 13: 21};

function parseChord(sym) {
  let [rt, n] = parseRoot(sym); let q = sym.slice(n), bass = null;
  const sl = q.search(/\/[A-G]/); if (sl >= 0) { bass = parseRoot(q.slice(sl + 1))[0]; q = q.slice(0, sl); }
  const iv = {1: [0, 0], 3: [2, 4], 5: [4, 7]};
  const minor = /^m(?!aj)/.test(q) || /^-/.test(q);
  if (minor) iv[3] = [2, 3];
  if (/dim|°|m7b5|ø/.test(q)) { iv[3] = [2, 3]; iv[5] = [4, 6]; }
  if (/aug|\+/.test(q) || /#5/.test(q)) iv[5] = [4, 8];
  if (/b5/.test(q)) iv[5] = [4, 6];
  if (/sus2/.test(q)) iv[3] = [1, 2]; else if (/sus/.test(q)) iv[3] = [3, 5];
  if (/maj7|maj9|maj13|M7|Δ/.test(q)) iv[7] = [6, 11];
  else if (/dim7|°7/.test(q)) iv[7] = [6, 9];
  else if (/7|9|11|13/.test(q) && !/add|6\/?9/.test(q)) iv[7] = [6, 10];
  if (/6/.test(q) && !/13/.test(q)) iv[6] = [5, 9];
  if (/b9/.test(q)) iv[9] = [8, 13]; else if (/#9/.test(q)) iv[9] = [8, 15]; else if (/9|11|13/.test(q)) iv[9] = [8, 14];
  if (/add9|add2/.test(q)) iv[9] = [8, 14];
  if (/#11/.test(q)) iv[11] = [10, 18]; else if (/11/.test(q)) iv[11] = [10, 17];
  if (/b13/.test(q)) iv[13] = [12, 20]; else if (/13/.test(q)) iv[13] = [12, 21];
  return {sym, root: rt, q, bass, iv, minor};
}
// grado → [pasos, semitonos] respecto a la fundamental del acorde
function degree(tok, ch) {
  let oct = 0; while (/[+-]$/.test(tok)) { oct += tok.endsWith('+') ? 1 : -1; tok = tok.slice(0, -1); }
  let r;
  const m = /^(b|#|n)?(\d+)$/.exec(tok === 'R' ? '1' : tok);   // n = intervalo natural de la escala mayor (n7 = 7ª mayor, n3 = 3ª mayor)
  if (!m) throw new Error('grado ' + tok);
  const d = +m[2];
  if (m[1] === 'n') r = [d - 1, MAJ[d]];
  else if (m[1] === '#' && d === 7) r = [6, 11];                 // '#7' = séptima elevada (sensible), como n7
  else if (m[1]) r = [d - 1, MAJ[d] + (m[1] === 'b' ? -1 : 1)];
  else if (d === 8) r = [7, 12];
  else if (ch.iv[d]) r = ch.iv[d].slice();
  else if (d === 7) r = ch.iv[6] ? ch.iv[6].slice() : [6, 10];
  else if (d === 6) r = [5, ch.minor ? 9 : 9];
  else r = [d - 1, MAJ[d]];
  return [r[0] + 7 * oct, r[1] + 12 * oct];
}
const SHAPES = {T: '~1 3 5', C: '~1 3 5 7', G: '~3 7', K: '~3 5 7 9', O: '1 8', F: '1 5', S: '1 7', Q: '1 3+', P: '1 5 8', D: '~1 3 5 8'};
const RANGES = {rh: [58, 69], lh: [40, 51], bs: [28, 39], gt: [40, 51]};       // dónde cae la fundamental de referencia
const VL = {rh: [66, 55, 81], lh: [52, 40, 64], gt: [60, 48, 76], bs: [40, 28, 52], keys: [66, 55, 81]};                  // centro inicial, mínimo y máximo de los acordes enlazados

function chordsOf(str, nb, n) {           // 'C G | Am F' → [{s, ch}] por semicorchea absoluta
  const bars = str.split('|').map(b => b.trim().split(/\s+/).filter(Boolean));
  while (bars.length < nb) bars.push(bars[bars.length - 1]);
  const out = [];
  bars.slice(0, nb).forEach((b, bi) => b.forEach((sym, k) => {
    if (sym === '%') return; let early = 0; const m = /<(\d+)$/.exec(sym); if (m) { early = +m[1]; sym = sym.slice(0, m.index); }
    out.push({s: bi * n + Math.round(k * n / b.length) - early, sym, ch: parseChord(sym)}); }));
  return out.sort((a, b) => a.s - b.s);
}
function chordAt(cs, s) { let c = cs[0]; for (const x of cs) if (x.s <= s) c = x; return c; }

function refRoot(ch, hand, useBass) {
  const r = (useBass && ch.bass) ? ch.bass : ch.root, pc = mod(pcL(r.l) + r.a, 12), [lo] = RANGES[hand];
  let m = lo + mod(pc - lo, 12); return {r, m};
}
function toneAt(ch, hand, tok, useBass) {
  const om = /^([^+-]+)([+-]*)$/.exec(tok), base = om ? om[1] : tok, oc = om ? (om[2].split('+').length - om[2].split('-').length) * 12 : 0;
  if (base === 'B' || (base === '1' && hand !== 'rh' && ch.bass)) { const {r, m} = refRoot(ch, hand, true); return [spell(r.l, m + oc)]; }
  if (base === '8' && hand !== 'rh' && ch.bass) { const {r, m} = refRoot(ch, hand, true); return [spell(r.l, m + 12 + oc)]; }
  const {r, m} = refRoot(ch, hand, false); const [st, se] = degree(tok, ch);
  return [spell(LET[mod(LET.indexOf(r.l) + st, 7)], m + se, mod(st, 7) === 1 && mod(se, 12) === 3)];
}
function voiceLed(ch, hand, toks, prev) {
  const {r, m: rm} = refRoot(ch, hand, false);
  let tones = toks.map(t => { const [st, se] = degree(t, ch); return {l: LET[mod(LET.indexOf(r.l) + st, 7)], pc: mod(rm + se, 12), se: mod(se, 12), a2: mod(st, 7) === 1 && mod(se, 12) === 3}; });
  // notas repetidas (p. ej. la octava de D = 1-3-5-8): se doblan una octava por encima de esa misma nota
  const dbl = []; tones = tones.filter((t, i) => { if (tones.findIndex(u => u.pc === t.pc) !== i) { dbl.push(t.pc); return false; } return true; });
  tones.sort((a, b) => a.se - b.se);               // posición cerrada, en orden de altura
  const [c0, lo, hi] = VL[hand]; const cands = [];
  for (let rot = 0; rot < tones.length; rot++) {
    const ord = tones.slice(rot).concat(tones.slice(0, rot));
    for (let base = lo - 12; base <= hi; base++) {
      if (mod(base, 12) !== ord[0].pc) continue;
      const ms = [base]; for (let i = 1; i < ord.length; i++) { let x = ms[i - 1] + 1; while (mod(x, 12) !== ord[i].pc) x++; ms.push(x); }
      const vs = ord.map((t, i) => spell(t.l, ms[i], t.a2));
      for (let k = 0; k < dbl.length; k++) vs.push(spell(vs[k].l, vs[k].m + 12));   // dobla la nota más grave: acorde de octava
      vs.sort((a, b) => a.m - b.m);
      if (vs[0].m < lo || vs[vs.length - 1].m > hi + (dbl.length ? 12 : 0)) continue;
      cands.push(vs);
    }
  }
  let best = null, bs = 1e9;
  for (const c of cands) {
    const ms = c.map(p => p.m); let sc;
    if (prev && prev.length === ms.length) sc = ms.reduce((a, x, i) => a + Math.abs(x - prev[i]), 0);
    else if (prev && prev.length) { const pm = prev.reduce((a, b) => a + b) / prev.length; sc = Math.abs(ms.reduce((a, b) => a + b) / ms.length - pm) * 2 + Math.abs(ms[ms.length - 1] - prev[prev.length - 1]); }
    else sc = Math.abs(ms.reduce((a, b) => a + b) / ms.length - c0);
    if (sc < bs) { bs = sc; best = c; }
  }
  return best;
}
function toneAtAll(cd, hand, def, c) {
  if (!def) return toneAt(cd, hand, c);
  const all = def.replace('~', '').trim().split(/\s+/).filter(t => !t.endsWith('^')); const ps = [];
  for (const t of all) ps.push(...toneAt(cd, hand, t)); return ps; }
function cleanHand(s) { return (s || '').replace(/[|\s]/g, ''); }
// compases: n = semicorcheas por compás, beat = semicorcheas por pulso
const METERS = {'4/4': {n: 16, beat: 4, sig: [4, 4]}, '3/4': {n: 12, beat: 4, sig: [3, 4]}, '2/4': {n: 8, beat: 4, sig: [2, 4]},
                '12/8': {n: 24, beat: 6, sig: [12, 8]}, '6/8': {n: 12, beat: 6, sig: [6, 8]}, '9/8': {n: 18, beat: 6, sig: [9, 8]}};
const meterOf = P => METERS[P.meter || '4/4'] || METERS['4/4'];
const DYNV = {ppp: .32, pp: .42, p: .55, mp: .7, mf: .85, f: 1.0, ff: 1.18, fff: 1.3};
function parseDyn(str, L) {        // '0:mp 16:< 28:f' → marcas y factor de volumen por semicorchea
  const marks = []; (str || '').trim().split(/\s+/).filter(Boolean).forEach(t => { const m = /^(\d+):(.+)$/.exec(t); if (m) marks.push({s: +m[1], m: m[2]}); });
  marks.sort((a, b) => a.s - b.s);
  const vel = new Array(L).fill(DYNV.mf); let cur = DYNV.mf;
  for (let i = 0; i < marks.length; i++) {
    const mk = marks[i];
    if (DYNV[mk.m]) { cur = DYNV[mk.m]; for (let j = mk.s; j < L; j++) vel[j] = cur; }
    else if (mk.m === '<' || mk.m === '>') {
      const nx = marks.slice(i + 1).find(x => DYNV[x.m]); const end = nx ? nx.s : L; const to = nx ? DYNV[nx.m] : cur * (mk.m === '<' ? 1.3 : 0.7);
      for (let j = mk.s; j < end && j < L; j++) vel[j] = cur + (to - cur) * (j - mk.s) / Math.max(1, end - mk.s);
    }
  }
  return {marks, vel};
}

// patrón → notas por mano: {s, d, ps:[pitch]}  (s,d en semicorcheas absolutas)
function expand(P, opt) {
  opt = opt || {};
  const M = meterOf(P), n = M.n, ch0 = P.ch, nb = P.bars || Math.max(1, (P.ch || '').split('|').length, ...['rh', 'lh', 'bass'].map(h => Math.ceil(cleanHand(P[h]).length / n)));
  const tr = opt.tr || 0;
  const chStr = tr ? transposeChords(ch0, P.key || 'C', tr) : ch0;
  const cs = chordsOf(chStr, nb, n);
  const legend = Object.assign({}, SHAPES, P.leg || {});
  const dyn = parseDyn(P.dyn, nb * n);
  const hands = {};
  for (const hand of ['rh', 'lh', 'bs', 'gt']) {
    const src = cleanHand(hand === 'bs' ? P.bass : hand === 'gt' ? P.gtr : P[hand]); if (!src) continue; let gprev = null;
    const L = nb * n, str = src.padEnd(L, '.').slice(0, L), out = []; let prev = null;
    for (let i = 0; i < L; i++) {
      const c = str[i]; if (c === '.' || c === '-') continue;
      let e = i + 1; while (e < L && str[e] === '-') e++;
      const cd = chordAt(cs, i).ch; let ps;
      const def = legend[c];
      let gr = [], gfr = null, vfr = null;
      if (hand === 'gt' && def && def[0] === '@') {                 // punteo por cuerdas sobre la forma del acorde: '@51' = cuerdas 5 y 1 (numeración de la TAB, 1 = la más aguda)
        const uk = P.inst === 'uke', NSg = uk ? 4 : 6, v = (uk ? ukVoicing : gVoicing)(cd, 'chord', gprev, P.lv || 1, P); gprev = v; vfr = v.fr;
        const want = def.slice(1).split('').map(d => NSg - +d); const on = [];
        for (const w of want) { const q = v.fr.find(([st]) => st === w) || v.fr.filter(x => !on.includes(x)).sort((x, y) => Math.abs(x[0] - w) - Math.abs(y[0] - w))[0];   // cuerda que no está en la forma: la más cercana que suena
          if (q && !on.includes(q)) on.push(q); }
        gfr = on; ps = on.map(([st, f]) => gSpell(cd, (uk ? UKSTR : GSTR)[st] + f)); }
      else if (hand === 'gt' && P.inst === 'uke' && UKPICK[c]) {        // ukelele: punteo por cuerdas sobre la forma del acorde (W = Sol, X = Do, Y = Mi, Z = La; V = Sol y La a la vez)
        const v = ukVoicing(cd, 'chord', gprev, P.lv || 1, P); gprev = v; vfr = v.fr;
        const on = v.fr.filter(([st]) => UKPICK[c].includes(st));
        gfr = on; ps = on.map(([st, f]) => gSpell(cd, UKSTR[st] + f)); }
      else if (hand === 'gt' && (P.inst === 'uke' || P.inst === 'fs') && P.frx && P.frx[i] && !tr) { gfr = P.frx[i].map(q => q.slice()); const bd = cleanHand((P.art || {})[hand]).padEnd(L, '.')[i] === 'b' ? 2 : 0; let tp = []; try { tp = toneAtAll(cd, hand, def, c); } catch (e) {}   // la ortografía de la tablatura (tonalidad), la altura de los trastes
        ps = gfr.map(([st, f]) => { const m = (P.inst === 'uke' ? UKSTR : GSTR)[st] + f + bd, q = tp.find(t => mod(t.m - m, 12) === 0); return q ? spell(q.l, m) : gSpell(cd, m); }); }   // acorde exacto de tablatura (ukelele): cuerdas y trastes fijados
      else if (hand === 'gt' && GSHAPE[c]) { const v = (P.inst === 'uke' ? ukVoicing : gVoicing)(cd, GSHAPE[c], gprev, P.lv || 1, P); ps = v.ps; gfr = v.fr; gprev = v; }
      else if (def) {
        const vl = def.startsWith('~'), all = def.replace('~', '').trim().split(/\s+/);
        const toks = all.filter(t => !t.endsWith('^')), gts = all.filter(t => t.endsWith('^')).map(t => t.slice(0, -1));
        if (vl) { ps = voiceLed(cd, hand === 'bs' ? 'lh' : hand, toks, prev); prev = ps.map(p => p.m); }
        else { ps = []; for (const t of toks) ps.push(...toneAt(cd, hand, t)); }
        for (const t of gts) gr.push(...toneAt(cd, hand, t));
      } else ps = toneAt(cd, hand, c);
      if (hand === 'bs') ps = ps.map(p => p.m < 28 ? spell(p.l, p.m + 12) : p);
      if (hand === 'gt' && !gfr) ps = ps.map(p => p.m < 40 ? spell(p.l, p.m + 12) : p);
      const seen = new Set(); ps = ps.filter(p => !seen.has(p.m) && seen.add(p.m)).sort((a, b) => a.m - b.m);
      const art = cleanHand((P.art || {})[hand]).padEnd(L, '.')[i];
      const fgs = tr ? null : (P.fing || {})[hand]; let fg = '';     // la digitación solo vale en la tonalidad escrita
      if (fgs && typeof fgs === 'object' && !Array.isArray(fgs)) fg = String(fgs[i] || '');           // {posición: '135'} para acordes
      else if (fgs) { const c2 = cleanHand(fgs).padEnd(L, '.')[i]; if (/[0-5]/.test(c2)) fg = c2; }      // un dígito por ataque
      const sts = (P.str || {})[hand]; let sn = 0;   // cuerda fijada: 1 = la más aguda (str={'gt': '6.5.4...'}), como en la TAB
      if (sts) { const c3 = cleanHand(sts).padEnd(L, '.')[i]; if (/[1-6]/.test(c3)) sn = +c3; }
      const pfc = cleanHand((P.pf || {})[hand]).padEnd(L, '.')[i], pf = 'pima'.includes(pfc) && pfc !== '.' ? pfc : '';   // dedos de la mano que pulsa (p i m a)
      out.push({s: i, d: e - i, ps, gr, art: /[>sat^xhp\/TPvDUmb]/.test(art) ? art : '', v: dyn.vel[i], fg, fr: gfr, sn, vfr, pf});
    }
    // la cadena empieza con '-': la última nota del patrón sigue sonando al volver al principio (p. ej. el tumbao, que anticipa en el 4)
    const w = (str.match(/^-+/) || [''])[0].length, lastN = out[out.length - 1];
    if (w && lastN && lastN.s + lastN.d === L) { lastN.wrap = w; out.unshift({s: 0, d: w, ps: lastN.ps, gr: [], art: '', v: lastN.v, wrapIn: true}); }
    if (hand === 'gt' && P.inst === 'uke') {     // ukelele: el patrón entero sube de octava hasta caber desde el Do 4 (las notas de tablatura ya caen ahí)
      const free = out.filter(o => !o.fr && o.ps.length), lo = free.length ? Math.min(...free.flatMap(o => o.ps.map(q => q.m))) : 60;
      const sh = lo < 60 ? 12 * Math.ceil((60 - lo) / 12) : 0;
      if (sh) for (const o of free) o.ps = o.ps.map(q => spell(q.l, q.m + sh)); }
    hands[hand] = out;
  }
  // si la mano izquierda llega a la misma tecla (o más arriba) que la derecha en el mismo golpe, baja una octava
  // (se mira lo que suena en la derecha durante toda la nota, y la decisión vale para todas las repeticiones del mismo acorde: registro estable)
  if (hands.lh && hands.rh) { const key = l => l.ps.map(q => q.m).join(','), drop = new Set();
    for (const l of hands.lh) { const r = hands.rh.filter(x => x.s < l.s + l.d && l.s < x.s + x.d); if (!r.length) continue;
      const lo = Math.min(...r.flatMap(x => x.ps.map(q => q.m)));
      if (Math.max(...l.ps.map(q => q.m)) >= lo && Math.min(...l.ps.map(q => q.m)) - 12 >= 28) drop.add(key(l)); }
    for (const l of hands.lh) if (drop.has(key(l))) l.ps = l.ps.map(q => spell(q.l, q.m - 12)); }
  return {nb, n, M, cs, hands, dyn, key: tr ? transposeKey(P.key || 'C', tr) : (P.key || 'C')};
}

// ---------------- tonalidades y transposición
const KEYS_MAJ = {C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7, 'C#': 7};
const PREF = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const PREFm = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
function keyInfo(k) {   // 'Am' → armadura de Do mayor
  const minor = /m$/.test(k); const t = minor ? k.slice(0, -1) : k; const [r] = parseRoot(t);
  let name = t;
  if (minor) { const l = LET[mod(LET.indexOf(r.l) + 2, 7)]; const a = mod(pcL(r.l) + r.a + 3 - pcL(l) + 6, 12) - 6; name = nameOf({l, a}); }
  return {root: r, minor, fifths: KEYS_MAJ[name] ?? 0};
}
function transposeKey(k, tr) {
  const minor = /m$/.test(k); const t = minor ? k.slice(0, -1) : k; const [r] = parseRoot(t);
  const pc = mod(pcL(r.l) + r.a + tr, 12); return (minor ? PREFm : PREF)[pc] + (minor ? 'm' : '');
}
function nameOf(p) { return p.l + (p.a === -1 ? 'b' : p.a === -2 ? 'bb' : p.a === 1 ? '#' : p.a === 2 ? '##' : ''); }
function transposeChords(str, key, tr) {
  const k0 = keyInfo(key).root, k1n = transposeKey(key, tr), k1 = parseRoot(k1n.replace(/m$/, ''))[0];
  const steps = mod(LET.indexOf(k1.l) - LET.indexOf(k0.l), 7);
  const mv = r => { const l = LET[mod(LET.indexOf(r.l) + steps, 7)]; const target = mod(pcL(r.l) + r.a + tr, 12);
    let a = mod(target - pcL(l) + 6, 12) - 6; return {l, a}; };
  return str.split(/(\s+|\|)/).map(tok => {
    if (!/^[A-G]/.test(tok)) return tok;
    const [r, n] = parseRoot(tok); let rest = tok.slice(n); const sl = rest.search(/\/[A-G]/);
    if (sl >= 0) { const [b, nb2] = parseRoot(rest.slice(sl + 1)); rest = rest.slice(0, sl) + '/' + nameOf(mv(b)) + rest.slice(sl + 1 + nb2); }
    return nameOf(mv(r)) + rest;
  }).join('');
}

// ---------------- de notas a figuras (reglas de escritura en 4/4)
const LEGAL = [24, 16, 12, 8, 6, 4, 3, 2, 1];
function okNote(s, d, M) {        // s: posición dentro del compás (semicorcheas)
  const n = M.n, B = M.beat; if (s + d > n) return false;
  if (B === 6) {                   // compases compuestos: pulso = negra con puntillo
    if (d === n) return s === 0 && (n === 24 || n === 12);
    if (s % 6 === 0) { if (d === 24) return false; if (d === 18) return s === 0; if (d === 12) return s % 12 === 0; if (d === 16 || d === 8) return false; return d <= 6; }
    const r = s % 6, left = 6 - r;          // dentro del pulso: no cruzar
    if (d > left) return false;
    if (r % 2 === 0) return d === 4 || d === 2 || d === 1 || d === 3;
    return d === 1 || (d === 3 && r === 3);
  }
  if (s % 4 === 0) {
    if (d === 16) return s === 0 && n === 16; if (d === 12) return s === 0 || (n === 12 && false);
    if (d === 8) return n === 16 ? s % 8 === 0 : true; if (d === 6) return n === 16 ? s % 8 === 0 : s % 4 === 0;
    return d <= 4;
  }
  if (s % 4 === 2) return d === 2 || d === 1 || ((d === 4 || d === 6) && s % 8 === 2 && n === 16);
  if (s % 4 === 1) return d === 1 || d === 2 || d === 3;
  return d === 1;
}
function okRest(s, d, M) {
  const n = M.n, B = M.beat; if (s + d > n) return false;
  if (d === n) return s === 0;
  if (B === 6) { if (d === 12) return s % 12 === 0; if (d === 6) return s % 6 === 0; if (d === 4) return false; if (d === 2) return s % 2 === 0; return d === 1; }
  if (d === 16 || d === 12) return false; if (d === 8) return n === 16 ? s % 8 === 0 : s % 4 === 0; if (d === 6) return false;
  if (d === 4) return s % 4 === 0; if (d === 3) return false; if (d === 2) return s % 2 === 0; return d === 1;
}
function pieces(s, d, ok, M) { const out = []; while (d > 0) { const c = LEGAL.find(v => v <= d && ok(s, v, M)) || 1; out.push([s, c]); s += c; d -= c; } return out; }
function figures(notes, nb, n, M) {   // → por compás: [{s(abs), d, k:'n'|'r', ps, tie, cont}]
  M = M || METERS['4/4'];
  const bars = []; for (let b = 0; b < nb; b++) bars.push([]);
  const occ = new Array(nb * n).fill(null);
  for (const nt of notes) for (let i = nt.s; i < Math.min(nb * n, nt.s + nt.d); i++) occ[i] = nt;
  for (let b = 0; b < nb; b++) {
    let i = 0;
    while (i < n) {
      const a = b * n + i, nt = occ[a];
      let j = i + 1; while (j < n && occ[b * n + j] === nt && !(nt && nt.s === b * n + j)) j++;
      if (nt) {
        const cont = nt.s < a || !!nt.wrapIn; const tieOut = nt.s + nt.d > b * n + j || (!!nt.wrap && nt.s + nt.d === b * n + j);
        const pcs = pieces(i, j - i, okNote, M);
        pcs.forEach(([ps, pd], k) => bars[b].push({s: b * n + ps, d: pd, k: 'n', ps: nt.ps, gr: (k === 0 && !cont) ? nt.gr : [], art: (k === 0 && !cont) ? nt.art : '', fg: (k === 0 && !cont) ? nt.fg : '', tie: k < pcs.length - 1 || tieOut, cont: k > 0 || cont, tieIn: k === 0 && !!nt.wrapIn && a === nt.s}));
      } else {
        for (const [ps, pd] of pieces(i, j - i, okRest, M)) bars[b].push({s: b * n + ps, d: pd, k: 'r'});
      }
      i = j;
    }
  }
  return bars;
}

// ---------------- maquetación del gran pentagrama
const DUR = {24: ['w', 1], 16: ['w', 0], 12: ['h', 1], 8: ['h', 0], 6: ['q', 1], 4: ['q', 0], 3: ['e', 1], 2: ['e', 0], 1: ['s', 0]};
const HEAD = {w: 0xE0A2, h: 0xE0A3, q: 0xE0A4, e: 0xE0A4, s: 0xE0A4};
const REST = {w: 0xE4E3, h: 0xE4E4, q: 0xE4E5, e: 0xE4E6, s: 0xE4E7};
const ACC = {'-2': 0xE264, '-1': 0xE260, 0: 0xE261, 1: 0xE262, 2: 0xE263};
const SHARPS = [8, 5, 9, 6, 3, 7, 4], FLATS = [4, 7, 3, 6, 2, 5, 1];
const ORD_S = 'FCGDAEB', ORD_F = 'BEADGCF';
// ---------------- espaciado horizontal sin choques (QA de grabado)
// Cada columna (semicorchea) tiene extensiones a la izquierda (alteraciones, cabezas desplazadas, notas de adorno) y a la derecha
// (cabeza, segundas, puntillo, corchete, silencio, números de TAB). Los huecos de la rejilla son proporcionales al ritmo, pero se
// ensanchan donde hace falta y se encogen un poco en los demás (relleno por nivel de agua).
const RESTW = {w: 1.13, h: 1.13, q: 1.08, e: 0.99, s: 1.2};          // ancho de los silencios en espacios
const RESTV = {e: [-1.0, 0.7], s: [-2.0, 0.7], q: [-1.5, 1.5], h: [0, 0.54], w: [-0.54, 0]};   // alto (espacios) respecto a la línea central
function headShift(f) {     // segundas en un acorde → 1 (cabeza a la derecha), -1 (a la izquierda), 0
  const ps = f.pos.slice().sort((a, b) => a - b); for (let i = 1; i < ps.length; i++) if (ps[i] - ps[i - 1] === 1) return f.up !== false ? 1 : -1; return 0; }
function accColsOf(f) {
  const ord = f.pos.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]); const accN = ord.filter(([p, i]) => f.accs[i] !== null).reverse(), cols = [];
  for (const [p] of accN) { const c = cols.findIndex(last => last - p >= 6); if (c < 0) cols.push(p); else cols[c] = p; } return cols.length; }
function figExt(f, sp, hw, n) {    // → [izquierda, derecha] en puntos respecto a la x de la columna
  const [kind, dots] = DUR[f.d];
  if (f.k === 'r') return f.d === n ? null : [0, RESTW[kind] * sp + (dots ? sp * 1.9 : 0)];
  const hwK = kind === 'w' ? sp * 1.69 : hw, sh = headShift(f);
  let L = accColsOf(f) * sp * 1.15 + (sh < 0 ? hwK : 0) + (f.accs.some(a => a !== null) ? sp * 0.1 : 0), R = hwK * (sh > 0 ? 2 : 1);
  if (dots) R = Math.max(R, hwK + sp * (sh > 0 ? 1.7 : 0.6) + sp * 0.45);
  if (!f.grp && (kind === 'e' || kind === 's')) R = Math.max(R, f.up ? hw + sp * 1.15 : sp * 1.55);
  if (f.gr && f.gr.length) L = Math.max(L, sp * 1.9 + (f.accs.some(a => a !== null) ? sp * 1.2 : 0) + (f.gr.some(g => g.a) ? sp * 1.0 : 0) + sp * 0.2);
  return [L, R];
}
function spaceCols(o) {   // o: {N, n, sp, U, pad, barGap, L[], R[], occ[], chords:[[col, ancho]]} → {lead, g[], Lbar(col)}
  const {N, n, sp, pad, barGap} = o, isBar = c => c > 0 && c < N && c % n === 0;
  const fixed = (i, j) => { let k = 0; for (let t = i + 1; t <= j; t++) if (isBar(t)) k++; return k * barGap; };
  const m = new Array(N).fill(0), add = (i, j, need) => { if (j <= i) return; const e = (need - fixed(i, j)) / (j - i); for (let t = i; t < j; t++) m[t] = Math.max(m[t], e); };
  const Ldef = pad * 0.55 + barGap * 0.2, Lbar = c => Math.max(Ldef, o.occ[c] ? o.L[c] + sp * 0.45 : 0);
  const ev = []; for (let c = 0; c < N; c++) if (o.occ[c]) ev.push(c);
  const lead = ev.length && ev[0] === 0 ? Math.max(pad, o.L[0] + sp * 0.6) : pad;
  if (ev.length && ev[0] > 0) add(0, ev[0], o.L[ev[0]] + sp * 0.6 - lead);
  for (let k = 1; k < ev.length; k++) { const a = ev[k - 1], b = ev[k]; let bs = -1, be = -1; for (let t = a + 1; t <= b; t++) if (isBar(t)) { if (bs < 0) bs = t; be = t; }
    if (bs < 0) add(a, b, o.R[a] + o.L[b] + sp * 0.35);
    else { add(a, bs, o.R[a] + sp * 0.45 + Lbar(bs)); if (b > be) add(be, b, o.L[b] + sp * 0.4 - Lbar(be)); } }
  if (ev.length) { const z = ev[ev.length - 1]; add(z, N, o.R[z] + sp * 0.3 - sp * 0.8); }
  const chs = (o.chords || []).slice().sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < chs.length; k++) add(chs[k - 1][0], chs[k][0], chs[k - 1][1] + sp * 0.8);
  const U = o.U - (lead - pad), sm = m.reduce((a, b) => a + b, 0); let g;
  if (sm >= U) g = m.map(v => v * U / sm);
  else { let lo = 0, hi = U; for (let it = 0; it < 50; it++) { const mid = (lo + hi) / 2, s = m.reduce((a, v) => a + Math.max(mid, v), 0); if (s > U) hi = mid; else lo = mid; } g = m.map(v => Math.max(lo, v)); }
  return {lead, g, Lbar, crowd: sm / U};
}
function restsInBeams(bars) {     // silencios bajo una barra: se apartan de la barra (máx. 2 espacios) y, si no basta, se alargan las plicas
  for (const bar of bars) { const seen = new Set();
    for (const f of bar) { const g = f.grp; if (!g || seen.has(g) || g._y === undefined) continue; seen.add(g);
      const s0 = g[0].s, s1 = g[g.length - 1].s, rs = bar.filter(r => r.k === 'r' && r.s > s0 && r.s < s1); if (!rs.length) continue;
      const lv = g.some(q => q.d === 1 || q.d === 3) ? 2.5 : 1;
      for (const r of rs) { const [vb, vt] = RESTV[DUR[r.d][0]] || [-1, 1];
        if (g[0].up) { const over = 4 + vt * 2 + 0.8 - (g._y - lv); if (over > 0) { const mv = Math.min(4, Math.ceil(over / 2) * 2); r.ry = -mv; if (over > mv) g._y += over - mv; } }
        else { const over = g._y + lv + 0.8 - (4 + vb * 2); if (over > 0) { const mv = Math.min(4, Math.ceil(over / 2) * 2); r.ry = mv; if (over > mv) g._y -= over - mv; } } }
      g.forEach(q => { q.sy = g._y; }); } }
}
function chordW(sym, size) { return 0.6 * size * sym.replace(/(^[A-G]|\/[A-G])[b#]/g, '$1x').length; }
const posOf = (p, clef) => 7 * p.o + LET.indexOf(p.l) - (clef === 'treble' ? 30 : 18);

function layout(P, o) {
  o = o || {};
  const X = expand(P, {tr: o.tr || 0});
  const {nb, n, M} = X, sp = o.sp || 5.4, W = o.W || 480, ki = keyInfo(X.key), ks = ki.fifths;
  const b0 = o.bars ? o.bars[0] : 0, b1 = o.bars ? o.bars[1] : nb, first = b0 === 0, last = b1 === nb, nbs = b1 - b0;
  const inSys = s => s >= b0 * n && s < b1 * n;
  const items = [];
  const G = (x, y, cp, size) => items.push(['g', x, y, cp, size || 4 * sp]);
  const L = (x1, y1, x2, y2, w) => items.push(['l', x1, y1, x2, y2, w]);
  const PO = pts => items.push(['p', pts]);
  const DOT = (x, y, r) => items.push(['o', x, y, r]);
  const hw = sp * 1.18;
  // eje horizontal
  let x0 = sp * 1.6;                              // llave + línea del sistema
  const xClef = x0 + sp * 0.8; let x = x0 + sp * 4.2;
  const ksw = Math.abs(ks) * sp * 1.05; const xKey = x; x += ksw + (ks ? sp * 0.8 : 0);
  const two = M.sig[0] > 9;
  const xTime = x + sp * 0.2; if (first) x += sp * (two ? 4.0 : 3.0);
  const xRep = x; if (first) x += sp * 1.6; else x += sp * 0.4;
  const endw = sp * 1.6, barGap = sp * 1.5, pad = sp * 1.9;
  const usable = W - x - endw - pad - (nbs - 1) * barGap - sp * 0.8;
  const slotw = usable / (nbs * n);
  const slotX = [], barX = {};
  const barStart = b => b === b0 ? slotX[b0 * n] - pad * 0.8 : barX[b], barEnd = b => b + 1 < b1 ? barX[b + 1] : W - endw;
  // figuras por mano
  const staffs = [{hand: 'rh', clef: 'treble'}, {hand: 'lh', clef: 'bass'}];
  const keyAcc = {}; (ks > 0 ? ORD_S.slice(0, ks) : ORD_F.slice(0, -ks)).split('').forEach(l => keyAcc[l] = ks > 0 ? 1 : -1);
  const ext = {};
  for (const S of staffs) {
    const notes = X.hands[S.hand] || [];
    S.bars = figures(notes, nb, n, M);
    let lo = 0, hi = 8;
    for (const bar of S.bars) {
      const state = {};
      for (const f of bar) {
        if (f.k !== 'n') continue;
        f.pos = f.ps.map(p => posOf(p, S.clef));
        f.accs = f.ps.map((p, i) => { const k = p.l + p.o; const cur = k in state ? state[k] : (keyAcc[p.l] || 0);
          state[k] = p.a; return (f.cont || cur === p.a) ? null : p.a; });
        lo = Math.min(lo, Math.min(...f.pos) - 1); hi = Math.max(hi, Math.max(...f.pos) + 1);
      }
    }
    S.lo = lo; S.hi = hi;
  }
  // grupos de barra (por pulso) y dirección de plicas
  for (const S of staffs) {
    for (const bar of S.bars) {
      let grp = [];
      const flush = () => { if (grp.length) { const all = grp.flatMap(f => f.pos); const up = (Math.max(...all) - 4) < (4 - Math.min(...all)) || (Math.max(...all) - 4) === (4 - Math.min(...all)) && S.clef === 'treble' && false ? true : (Math.max(...all) - 4) <= (4 - Math.min(...all));
        grp.forEach(f => { f.up = up; f.grp = grp.length > 1 ? grp : null; }); } grp = []; };
      let beat = -1;
      for (const f of bar) {
        const b = Math.floor((f.s % n) / M.beat);
        const beamable = f.k === 'n' && f.d < 4;
        if (f.k === 'r' && f.d < 4 && b === beat) continue;      // silencio corto dentro del pulso: la barra pasa por encima
        if (!beamable || b !== beat) flush();
        if (beamable) { grp.push(f); beat = b; } else { beat = -1; if (f.k === 'n') { grp.push(f); flush(); } }
      }
      flush();
    }
    // altura de plicas
    for (const bar of S.bars) for (const f of bar) {
      if (f.k !== 'n' || DUR[f.d][0] === 'w') continue;
      if (f.grp) { if (f.grp._y === undefined) { const all = f.grp.flatMap(g => g.pos); const sixteenth = f.grp.some(g => g.d === 1 || g.d === 3);
          f.grp._y = f.up ? Math.max(Math.max(...all) + 7, 4 + (sixteenth ? 1 : 0)) : Math.min(Math.min(...all) - 7, 4 - (sixteenth ? 1 : 0)); }
        f.sy = f.grp._y; }
      else f.sy = f.up ? Math.max(Math.max(...f.pos) + 7, 4) : Math.min(Math.min(...f.pos) - 7, 4);
    }
    restsInBeams(S.bars);
    for (const bar of S.bars) for (const f of bar) { if (f.k === 'n' && f.sy !== undefined) { S.lo = Math.min(S.lo, f.sy - 1); S.hi = Math.max(S.hi, f.sy + 1); }
      if (f.k === 'n' && f.art && !f.cont) { const k = (f.art === 'a' ? 6.5 : 4.6) + (f.tie || f.tieIn ? 1.8 : 0); if (f.up === false) S.hi = Math.max(S.hi, Math.max(...f.pos) + k); else S.lo = Math.min(S.lo, Math.min(...f.pos) - k); } }
    // sitio para la digitación (antes de calcular la altura del sistema)
    for (const bar of S.bars) for (const f of bar) {
      if (f.k !== 'n' || !f.fg) continue; const nd = String(f.fg).length, top = S.clef === 'treble';
      const sy = f.sy !== undefined ? f.sy : (top ? -99 : 99);
      const artK = f.art === 'a' ? 7.6 : f.art === 's' || f.art === 't' ? 4.2 : 5.9, multi = f.pos.length > 1;   // por fuera de articulaciones y ligaduras del mismo lado
      f.fgExt = top ? Math.max(Math.max(...f.pos) + 2.5, f.up ? sy + 2 : -99, 9.5, f.art && f.up === false ? Math.max(...f.pos) + artK : -99, f.tie && (multi || f.up === false) ? Math.max(...f.pos) + 4.4 : -99)
        : Math.min(Math.min(...f.pos) - 3.5, f.up === false ? sy - 2 : 99, -2.5, f.art && f.up !== false ? Math.min(...f.pos) - artK - 1 : 99, f.tie && (multi || f.up !== false) ? Math.min(...f.pos) - 5.2 : 99);
      const fz = o.big ? 1.35 : 1; if (top) S.hi = Math.max(S.hi, f.fgExt + nd * 2.9 * fz + 1); else S.lo = Math.min(S.lo, f.fgExt - nd * 2.9 * fz - 1);
    }
  }
  // espaciado horizontal: columnas comunes a los dos pentagramas y al cifrado
  { const N = nbs * n, Le = new Array(N).fill(0), Re = new Array(N).fill(0), occ = new Array(N).fill(false);
    for (const S of staffs) for (const bar of S.bars.slice(b0, b1)) for (const f of bar) { const e = figExt(f, sp, hw, n); if (!e) continue; const c = f.s - b0 * n;
      occ[c] = true; Le[c] = Math.max(Le[c], e[0]); Re[c] = Math.max(Re[c], e[1]); }
    const chs = X.cs.filter(c => inSys(Math.max(0, c.s))).map(c => [Math.max(0, c.s) - b0 * n, chordW(c.sym, o.big ? sp * 3.1 : sp * 2.3) - sp * 0.2]);
    const Sp = spaceCols({N, n, sp, U: usable, pad, barGap, L: Le, R: Re, occ, chords: chs});
    for (let i = 0; i < nb * n; i++) { const b = Math.floor(i / n) - b0; slotX.push(x + pad + (i - b0 * n) * slotw + b * barGap); }
    let xx = x + Sp.lead; for (let c = 0; c < N; c++) { slotX[b0 * n + c] = xx; xx += Sp.g[c] + ((c + 1) % n === 0 ? barGap : 0); }
    for (let b = b0 + 1; b < b1; b++) barX[b] = slotX[b * n] - Sp.Lbar((b - b0) * n); o._crowd = Sp.crowd; }
  // geometría vertical (y hacia arriba, origen abajo)
  const T = staffs[0], B = staffs[1];
  const LBL = P.lbl || null, chordH = sp * (o.big ? 4.2 : 3.2) + (LBL && Object.keys(LBL).some(b => +b >= b0 && +b < b1) ? sp * 2.8 : 0);   // rótulos por compás (p. ej. «Harmonic minor»)
  const botPad = sp * 1.2 + Math.max(0, -B.lo) * sp / 2;
  const yB = botPad;                                                  // y de la línea inferior del pentagrama de fa
  const gap = Math.max(sp * 6.4, (Math.max(0, B.hi - 8) + Math.max(0, -T.lo)) * sp / 2 + sp * (X.dyn.marks.length ? 3.9 : 2.5));   // con dinámicas: sitio para ellas entre los pentagramas
  const yT = yB + 8 * sp / 2 + gap;
  const topPad = Math.max(0, T.hi - 8) * sp / 2 + chordH;
  const H = yT + 4 * sp + topPad;
  T.y0 = yT; B.y0 = yB;
  const Y = (S, pos) => S.y0 + pos * sp / 2;
  // pentagramas, llave, barras
  for (const S of staffs) for (let p = 0; p <= 8; p += 2) L(x0, Y(S, p), W, Y(S, p), 0.55);
  L(x0, Y(B, 0), x0, Y(T, 8), 1.0);
  items.push(['brace', x0 - sp * 0.35, Y(B, 0), Y(T, 8) - Y(B, 0)]);
  G(xClef, Y(T, 2), 0xE050); G(xClef, Y(B, 6), 0xE062);
  const kpos = ks > 0 ? SHARPS : FLATS;
  for (const S of staffs) for (let i = 0; i < Math.abs(ks); i++) G(xKey + i * sp * 1.05, Y(S, kpos[i] - (S.clef === 'bass' ? 2 : 0)), ks > 0 ? 0xE262 : 0xE260);
  const digits = (v, xx, y) => { const t = String(v); const w = sp * 1.9; t.split('').forEach((d, i) => G(xx + (t.length > 1 ? 0 : sp * 0.4) + i * w - (t.length > 1 ? 0 : sp * 0.4), y, 0xE080 + +d)); };
  if (first) for (const S of staffs) { const xx = xTime + (two ? 0 : 0); digits(M.sig[0], xx, Y(S, 6)); digits(M.sig[1], xx + (two ? sp * 0.95 : 0), Y(S, 2)); }
  // repetición inicial y final (sistema completo)
  const rep = (xx, start) => { const yb = Y(B, 0), yt = Y(T, 8);
    if (start) { L(xx, yb, xx, yt, 1.8); L(xx + sp * 0.55, yb, xx + sp * 0.55, yt, 0.6); for (const S of staffs) { DOT(xx + sp * 1.05, Y(S, 3), sp * 0.2); DOT(xx + sp * 1.05, Y(S, 5), sp * 0.2); } }
    else { L(xx - 0.9, yb, xx - 0.9, yt, 1.8); L(xx - sp * 0.65, yb, xx - sp * 0.65, yt, 0.6); for (const S of staffs) { DOT(xx - sp * 1.15, Y(S, 3), sp * 0.2); DOT(xx - sp * 1.15, Y(S, 5), sp * 0.2); } } };
  if (first) rep(xRep, true);
  if (last) rep(W, false); else for (const S of staffs) L(W - 0.4, Y(S, 0), W - 0.4, Y(S, 8), 0.8);
  for (const bx of Object.values(barX)) for (const S of staffs) L(bx, Y(S, 0), bx, Y(S, 8), 0.8);
  // notas
  for (const S of staffs) {
    const ledgers = (xh, pos, w) => { for (let p = -2; p >= pos; p -= 2) L(xh - sp * 0.4, Y(S, p), xh + w + sp * 0.4, Y(S, p), 0.6);
      for (let p = 10; p <= pos; p += 2) L(xh - sp * 0.4, Y(S, p), xh + w + sp * 0.4, Y(S, p), 0.6); };
    for (const bar of S.bars.slice(b0, b1)) for (const f of bar) {
      const [kind, dots] = DUR[f.d];
      const bStart = Math.floor(f.s / n) * n;
      let xc = slotX[f.s];
      if (f.k === 'r') {
        if (f.d === n) { const bb = Math.floor(f.s / n), xa = barStart(bb), xb = barEnd(bb);
          G((xa + xb) / 2 - sp * 0.6, Y(S, 6), REST.w); continue; }
        G(xc, Y(S, (kind === 'w' ? 6 : 4) + (f.ry || 0)), REST[kind]);
        if (dots) DOT(xc + sp * 1.6, Y(S, 5 + (f.ry || 0)), sp * 0.2);
        continue;
      }
      const hwK = kind === 'w' ? sp * 1.69 : hw;
      // segundas: cabezas desplazadas
      const ord = f.pos.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
      const shift = new Array(f.pos.length).fill(0);
      if (f.up !== false) { let last = null; for (const [p, i] of ord) { if (last !== null && p - last[0] === 1 && !shift[last[1]]) shift[i] = 1; last = [p, i]; } }
      else { let last = null; for (const [p, i] of ord.slice().reverse()) { if (last !== null && last[0] - p === 1 && !shift[last[1]]) shift[i] = -1; last = [p, i]; } }
      const anyLeft = shift.some(v => v < 0);
      // alteraciones
      const accN = ord.filter(([p, i]) => f.accs[i] !== null).reverse(); const cols = [];
      for (const [p, i] of accN) { let c = cols.findIndex(last => last - p >= 6); if (c < 0) { cols.push(p); c = cols.length - 1; } else cols[c] = p;
        G(xc - sp * 1.15 * (c + 1) - (anyLeft ? hw : 0), Y(S, p), ACC[f.accs[i]], 4 * sp); }
      for (const [p, i] of ord) {
        const xh = xc + shift[i] * hwK;
        ledgers(xh, p, hwK);
        G(xh, Y(S, p), HEAD[kind]);
        if (dots) DOT(xc + hwK + sp * (shift.some(v => v > 0) ? 1.7 : 0.6), Y(S, p % 2 ? p : p + 1), sp * 0.2);
      }
      if (kind !== 'w') {
        const sx = f.up ? xc + hw - 0.35 : xc + 0.35;
        const yEnd = Y(S, f.sy);
        const yStart = f.up ? Y(S, Math.min(...f.pos)) + sp * 0.15 : Y(S, Math.max(...f.pos)) - sp * 0.15;
        L(sx, yStart, sx, yEnd, 0.75);
        f.sx = sx;
        if (!f.grp && (kind === 'e' || kind === 's')) G(sx - 0.3, yEnd, kind === 'e' ? (f.up ? 0xE240 : 0xE241) : (f.up ? 0xE242 : 0xE243));
      }
      // digitación: números encima (mano derecha) o debajo (mano izquierda), apilados de agudo a grave
      if (f.fg) {      // '135' = de grave a agudo: arriba se apila con el agudo encima; abajo, con el agudo junto al pentagrama
        const top = S.clef === 'treble', ds = String(f.fg).split('');
        const order = top ? ds : ds.slice().reverse();
        const fz = o.big ? 1.35 : 1; order.forEach((d, k) => items.push(['t', xc + hw * 0.5, Y(S, f.fgExt) + (top ? 1 : -1) * k * sp * 1.45 * fz - (top ? 0 : sp * 0.9 * fz), d, sp * 1.55 * fz, 1]));
      }
      // articulaciones (por fuera, al lado contrario de la plica)
      if (f.art) {
        const out_ = f.up === false ? 1 : -1, pe = out_ > 0 ? Math.max(...f.pos) : Math.min(...f.pos);
        let ya = Y(S, pe) + out_ * sp * 1.3; if (out_ > 0 && pe < 8 && pe % 2 === 0) ya = Y(S, pe) + sp * 1.4;
        if (f.tie || f.tieIn) ya += out_ * sp * 0.9;                     // la ligadura sale por el mismo lado: la articulación va por fuera
        const xa = xc + hw * 0.5;
        if (f.art === 'a') { DOT(xa, ya, sp * 0.22); ya += out_ > 0 ? sp * 0.45 : -sp * 0.85; }      // picado junto a la cabeza, acento por fuera
        if ('>a'.includes(f.art)) G(xa - sp * 0.68, ya + (out_ < 0 ? -sp * 0.6 : 0), 0xE4A0, sp * 4);
        if (f.art === 's') DOT(xa, ya, sp * 0.22);
        if (f.art === 't') L(xa - sp * 0.55, ya, xa + sp * 0.55, ya, 0.9);
        if (f.art === '^') G(xa - sp * 0.6, ya, out_ > 0 ? 0xE4AC : 0xE4AD, sp * 4);
      }
      if (f.gr && f.gr.length) {
        const gs = sp * 2.7, gx = xc - sp * 1.9 - (f.accs.some(a => a !== null) ? sp * 1.2 : 0);
        for (const g of f.gr) { const gp = posOf(g, S.clef); ledgers(gx, gp, hw * 0.7);
          G(gx, Y(S, gp), 0xE0A4, gs); const ga = g.a !== (keyAcc[g.l] || 0) ? g.a : null; if (ga !== null) G(gx - sp * 0.95, Y(S, gp), ACC[ga], sp * 2.9);
          const sx2 = gx + hw * 0.66; L(sx2, Y(S, gp) + sp * 0.1, sx2, Y(S, gp) + sp * 2.6, 0.55);
          G(sx2 - 0.2, Y(S, gp) + sp * 2.6, 0xE240, gs); L(sx2 - sp * 0.55, Y(S, gp) + sp * 1.2, sx2 + sp * 0.75, Y(S, gp) + sp * 2.3, 0.55); }
      }
      if (f.tieIn) ord.forEach(([p, i], k) => { const below = ord.length === 1 ? f.up !== false : k < ord.length / 2;
        const yy = Y(S, p) + (below ? -sp * 0.75 : sp * 0.75); items.push(['c', xc - sp * 2.6, yy, xc + hw * 0.3, yy, (below ? -1 : 1) * sp * 0.55, sp * 0.2]); });
      // ligaduras de prolongación: de cabeza a cabeza, curva por fuera del acorde
      if (f.tie) {
        const nx = inSys(f.s + f.d) ? slotX[f.s + f.d] : W + sp * 0.4;
        ord.forEach(([p, i], k) => {
          const below = ord.length === 1 ? f.up !== false : k < ord.length / 2;
          const yy = Y(S, p) + (below ? -sp * 0.75 : sp * 0.75);
          const flg = !f.grp && (kind === 'e' || kind === 's');
          const xa = !below && f.up && kind !== 'w' ? xc + hw + (flg ? sp * 1.1 : sp * 0.25) : below && f.up === false && flg ? xc + sp * 1.6 : xc + hwK * 0.62, xb = nx + hw * 0.38;   // por encima con plica arriba: tras la plica (y el corchete)
          items.push(['c', xa, yy, xb, yy, (below ? -1 : 1) * Math.min(sp * 0.9, sp * 0.35 + (xb - xa) * 0.06), sp * 0.2]);
        });
      }
    }
    // barras de corchea/semicorchea
    for (const bar of S.bars.slice(b0, b1)) {
      const seen = new Set();
      for (const f of bar) {
        if (!f.grp || seen.has(f.grp)) continue; seen.add(f.grp);
        const g = f.grp, up = g[0].up, th = sp * 0.5, dir = up ? -1 : 1, yb0 = Y(S, g[0].sy);
        const beam = (xa, xb, lvl) => { const yb = yb0 + dir * lvl * sp * 0.75, y2 = yb + (up ? -th : th); PO([[xa, yb], [xb, yb], [xb, y2], [xa, y2]]); };
        const xs = g.map(q => q.sx);
        beam(xs[0] - 0.375, xs[xs.length - 1] + 0.375, 0);
        g.forEach((q, i) => {
          if (q.d !== 1 && q.d !== 3) return;
          if (q.d === 3) return;
          const nxt = g[i + 1], prv = g[i - 1];
          if (nxt && nxt.d === 1 && nxt.s === q.s + q.d) beam(q.sx - 0.375, nxt.sx + 0.375, 1);
          else if (!(prv && prv.d === 1 && prv.s + prv.d === q.s)) { const Lh = sp * 1.1; if (prv) beam(q.sx - Lh, q.sx + 0.375, 1); else beam(q.sx - 0.375, q.sx + Lh, 1); }
        });
      }
    }
  }
  // cifrado
  const yC = Y(T, Math.max(10, T.hi + 1)) + sp * 0.9;
  for (const c of X.cs) if (inSys(Math.max(0, c.s))) items.push(['ch', slotX[Math.max(0, c.s)] - sp * 0.2, yC, c.sym].concat(o.big ? [sp * 3.1] : []));
  if (LBL) for (const [bk, txt] of Object.entries(LBL)) { const bb = +bk; if (bb < b0 || bb >= b1) continue; items.push(['t', slotX[bb * n + Math.floor(n / 2)], yC + sp * (o.big ? 3.3 : 2.6), txt, sp * (o.big ? 2.0 : 1.7), 0]); }
  // dinámicas: entre los dos pentagramas
  const yD = Math.max(Y(B, Math.max(B.hi, 8)) + sp * 0.9, Math.min(Y(T, Math.min(T.lo, 0)) - sp * 2.0, (Y(T, Math.min(T.lo, 0) - 2.5) + Y(B, Math.max(B.hi, 8))) / 2 - sp * 0.7)), DG = {p: 0xE520, m: 0xE521, f: 0xE522};
  X.dyn.marks.forEach((mk, i) => {
    const nxH = X.dyn.marks.slice(i + 1).find(q => q.s > mk.s);
    const hairOn = (mk.m === '<' || mk.m === '>') && mk.s < b0 * n && (!nxH || nxH.s > b0 * n);   // regulador que viene del sistema anterior
    if (!inSys(mk.s) && !hairOn) return; const xd = hairOn ? slotX[b0 * n] - pad : slotX[mk.s];
    if (DYNV[mk.m]) { let xx = xd - sp * 0.3; for (const ch of mk.m) { G(xx, yD, DG[ch], sp * 3.6); xx += sp * (ch === 'm' ? 1.75 : 1.2); } }
    else { const nx = X.dyn.marks.slice(i + 1).find(q => q.s > mk.s); const xe = nx && inSys(nx.s) ? slotX[nx.s] - sp * 1.2 : W - endw; const h = sp * 0.6, ym = yD + sp * 0.55;
      if (mk.m === '<') { L(xd, ym, xe, ym + h, 0.6); L(xd, ym, xe, ym - h, 0.6); } else { L(xd, ym + h, xe, ym, 0.6); L(xd, ym - h, xe, ym, 0.6); } }
  });
  return {items, W, H, slotX, sp, notes: X.hands, cs: X.cs, nb, n, M, key: X.key, bars: [b0, b1]};
}

// reparto equilibrado: nunca un compás suelto en la última línea (4 → 2+2, 5 → 3+2, 7 → 4+3)
const lineSizes = (nb, per) => { if (per >= nb) return [nb]; let L = Math.ceil(nb / per);
  const mk = L => { const b = Math.floor(nb / L), e = nb % L; return Array.from({length: L}, (_, i) => b + (i < e ? 1 : 0)); };
  let sz = mk(L); if (per > 1 && L > 1 && sz.includes(1)) sz = mk(L - 1); return sz; };
const lineBars = (nb, per) => { let b = 0; return lineSizes(nb, per).map(k => [b, b += k]); };
// varios sistemas: nb compases repartidos en líneas de 'per' compases
function systems(P, o) {
  o = o || {}; const X = expand(P, {tr: o.tr || 0}), nb = X.nb, n = X.n;
  let per = o.forcePer || P.per || o.per;
  if (!per) { if (nb <= 2) per = nb; else { const dens = Math.max(...['rh', 'lh'].map(h => (X.hands[h] || []).length)) / nb; per = n <= 16 ? (dens <= 5 ? 4 : 2) : (dens <= 8 ? 3 : 2); } }
  const run = pr => { const out = [], cr = []; for (const bb of lineBars(nb, pr)) { const oo = Object.assign({}, o, {bars: bb}); out.push(layout(P, oo)); cr.push(oo._crowd || 0); } return [out, cr]; };
  let [out, cr] = run(per);
  if (o.forcePer && per > 1 && Math.max(...cr) > 1.25) out = run(1)[0];     // móvil: un compás muy denso no cabe en media línea → un compás por línea
  return out;
}

// ================= GUITARRA: voicings, digitación y pentagrama en clave de sol (octava escrita) + TAB de 6 cuerdas
const GSTR = [40, 45, 50, 55, 59, 64];             // E2 A2 D3 G3 B3 E4
const GSHAPE = {C: 'chord', B: 'barre', P: 'power', Q: 'power3', T: 'top3', M: 'mid3', S: 'shell', N: 'funk', K: 'drop2', O: 'oct'};
const X = null;
const GOPEN = {'A7b9': [X, 0, 2, 3, 2, 3], 'E7b9': [0, 2, 0, 1, 0, 1], 'C': [X, 3, 2, 0, 1, 0], 'A': [X, 0, 2, 2, 2, 0], 'G': [3, 2, 0, 0, 0, 3], 'E': [0, 2, 2, 1, 0, 0], 'D': [X, X, 0, 2, 3, 2],
  'Am': [X, 0, 2, 2, 1, 0], 'Em': [0, 2, 2, 0, 0, 0], 'Dm': [X, X, 0, 2, 3, 1], 'C7': [X, 3, 2, 3, 1, 0], 'A7': [X, 0, 2, 0, 2, 0], 'G7': [3, 2, 0, 0, 0, 1],
  'E7': [0, 2, 0, 1, 0, 0], 'D7': [X, X, 0, 2, 1, 2], 'B7': [X, 2, 1, 2, 0, 2], 'Am7': [X, 0, 2, 0, 1, 0], 'Em7': [0, 2, 0, 0, 0, 0], 'Dm7': [X, X, 0, 2, 1, 1],
  'Cmaj7': [X, 3, 2, 0, 0, 0], 'Emaj7': [0, 2, 1, 1, 0, 0], 'Fmaj7': [X, X, 3, 2, 1, 0], 'Amaj7': [X, 0, 2, 1, 2, 0], 'Dmaj7': [X, X, 0, 2, 2, 2], 'Gmaj7': [3, 2, 0, 0, 0, 2],
  'Asus2': [X, 0, 2, 2, 0, 0], 'Asus4': [X, 0, 2, 2, 3, 0], 'Dsus2': [X, X, 0, 2, 3, 0], 'Dsus4': [X, X, 0, 2, 3, 3], 'Esus4': [0, 2, 2, 2, 0, 0],
  'Cadd9': [X, 3, 2, 0, 3, 0], 'E9': [0, 2, 0, 1, 0, 2], 'A9': [X, 0, 2, 4, 2, 3], 'G/B': [X, 2, 0, 0, 0, 3], 'C/G': [3, 3, 2, 0, 1, 0], 'D/F#': [2, X, 0, 2, 3, 2],
  'C/E': [0, 3, 2, 0, 1, 0], 'C6': [X, 3, 2, 2, 1, 0], 'G6': [3, 2, 0, 0, 0, 0], 'D6': [X, X, 0, 2, 0, 2], 'A6': [X, 0, 2, 2, 2, 2], 'E6': [0, 2, 2, 1, 2, 0], 'C/B': [X, 2, 2, 0, 1, 0], 'G/F#': [2, X, 0, 0, 0, 3], 'F/C': [X, 3, 3, 2, 1, 1], 'D/A': [X, 0, 0, 2, 3, 2], 'G/D': [X, X, 0, 0, 0, 3], 'A/E': [0, 0, 2, 2, 2, 0], 'Em/D': [X, X, 0, 0, 0, 0], 'Am/E': [0, 0, 2, 2, 1, 0], 'Dm/A': [X, 0, 0, 2, 3, 1], 'Am/G': [3, 0, 2, 2, 1, 0], 'F': [1, 3, 3, 2, 1, 1], 'Bm': [X, 2, 4, 4, 3, 2], 'B': [X, 2, 4, 4, 4, 2], 'F#m': [2, 4, 4, 2, 2, 2]};
const GBARRE = {   // forma de Mi (raíz en 6.ª) y de La (raíz en 5.ª), relativas al traste de la raíz
  E: {'': [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], maj7: [0, X, 1, 1, 0, X], sus4: [0, 2, 2, 2, 0, 0],
      '13': [0, X, 0, 1, 2, X], '7b9': [0, X, 0, 1, 0, 1], m7b5: [0, X, 0, 0, -1, X], dim7: [0, X, -1, 0, -1, X], '6': [0, X, -1, 1, 0, X], m6: [0, X, -1, 0, 0, X], '5': [0, 2, 2, X, X, X]},
  A: {'': [X, 0, 2, 2, 2, 0], m: [X, 0, 2, 2, 1, 0], '7': [X, 0, 2, 0, 2, 0], m7: [X, 0, 2, 0, 1, 0], maj7: [X, 0, 2, 1, 2, 0], sus4: [X, 0, 2, 2, 3, 0],
      sus2: [X, 0, 2, 2, 0, 0], '9': [X, 0, -1, 0, 0, 0], m9: [X, 0, -2, 0, 0, X], '7#9': [X, 0, -1, 0, 1, X], '7b9': [X, 0, -1, 0, -1, X], m7b5: [X, 0, 1, 0, 1, X], dim7: [X, 0, 1, -1, 1, X],
      '6': [X, 0, 2, 2, 2, 2], m6: [X, 0, 2, -1, 1, X], dim: [X, 0, 1, 2, 1, X], add9: [X, 0, 2, 4, 2, 0], maj9: [X, 0, -1, 1, 0, X], '13': [X, 0, X, 0, 2, 2], '5': [X, 0, 2, 2, X, X]}};
function gQual(ch) {          // calidad normalizada para buscar formas
  const q = ch.q;
  if (/^5$/.test(q)) return '5';
  if (/m7b5|ø/.test(q)) return 'm7b5'; if (/dim7|°7/.test(q)) return 'dim7'; if (/^(dim|°|o)$/.test(q)) return 'dim';
  if (/7#9/.test(q)) return '7#9'; if (/7b9/.test(q)) return '7b9'; if (/maj9/.test(q)) return 'maj9'; if (/maj/.test(q)) return 'maj7';
  if (/^m9/.test(q)) return 'm9'; if (/^m6/.test(q)) return 'm6'; if (/^m/.test(q)) return /7|11/.test(q) ? 'm7' : 'm';
  if (/13/.test(q)) return '13'; if (/9/.test(q) && !/add/.test(q)) return '9'; if (/add9|add2/.test(q)) return 'add9';
  if (/7sus|sus4/.test(q)) return 'sus4'; if (/sus2/.test(q)) return 'sus2'; if (/6/.test(q)) return '6'; if (/7/.test(q)) return '7';
  return '';
}
function gName(ch) { return nameOf(ch.root) + ({'': '', m: 'm', '7': '7', m7: 'm7', maj7: 'maj7', sus2: 'sus2', sus4: 'sus4', add9: 'add9', '9': '9'}[gQual(ch)] ?? '#') + (ch.bass ? '/' + nameOf(ch.bass) : ''); }
// ortografía de una nota del acorde según su intervalo
function gSpell(ch, m) {
  const r = ch.root, rpc = mod(pcL(r.l) + r.a, 12), iv = mod(m - rpc, 12);
  for (const d of [1, 3, 5, 7, 9, 11, 13, 6]) { const v = ch.iv[d]; if (v && mod(v[1], 12) === iv) return spell(LET[mod(LET.indexOf(r.l) + v[0], 7)], m, d === 9 && iv === 3); }
  if (ch.bass && mod(pcL(ch.bass.l) + ch.bass.a, 12) === mod(m, 12)) return spell(ch.bass.l, m);
  const st = {0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6}[iv];
  return spell(LET[mod(LET.indexOf(r.l) + st, 7)], m);
}
const frToPs = (ch, fr) => fr.map((f, s) => f === null ? null : {s, f, p: gSpell(ch, GSTR[s] + f)}).filter(Boolean);
function gBrute(ch, strings, tones, rootLow, prev, lv, P, orders) {   // orders: órdenes de voces permitidos (índices de tones, de grave a agudo)     // voicings pequeños: tonos obligatorios en un juego de cuerdas, palmo ≤ 4 trastes
  const rpc = mod(pcL(ch.root.l) + ch.root.a, 12);
  const pcs = tones.map(t => { const [, se] = degree(t, ch); return mod(rpc + se, 12); });
  const opts = strings.map(s => { const o = []; for (let f = 0; f <= 15; f++) if (pcs.includes(mod(GSTR[s] + f, 12))) o.push(f); return o; });
  let best = null, bs = 1e9; const hasPos = P && P.pos != null && P.pos >= 0, pAvg = hasPos ? P.pos + 1.5 : prev ? prev.avg : (lv >= 2 ? 5 : 2);
  const rec = (i, acc) => {
    if (i === strings.length) {
      const fr = acc.filter(f => f > 0); if (fr.length && Math.max(...fr) - Math.min(...fr) > 3) return;
      const got = new Set(acc.map((f, k) => mod(GSTR[strings[k]] + f, 12))); if (!pcs.every(p => got.has(p))) return;
      if (rootLow && mod(GSTR[strings[0]] + acc[0], 12) !== rpc) return;
      if (orders) { const ix = acc.map((f, k) => pcs.indexOf(mod(GSTR[strings[k]] + f, 12))); if (!orders.some(o => o.length === ix.length && o.every((v, k) => v === ix[k]))) return; }
      const avg = fr.length ? fr.reduce((a, b) => a + b) / fr.length : 0;
      const openFar = acc.some(f => f === 0) && fr.length && Math.max(...fr) > 4 ? 4 : 0;   // cuerdas al aire mezcladas con trastes altos: raro
      const sc = openFar + Math.abs(avg - pAvg) + (hasPos && prev ? Math.abs(avg - prev.avg) * 0.3 : 0) + Math.max(0, avg - 9) * 0.4 + avg * 0.04 + acc.filter(f => f === 0).length * (lv >= 2 ? 0.6 : -0.2);
      if (sc < bs) { bs = sc; best = acc.slice(); } return; }
    for (const f of opts[i]) { acc.push(f); rec(i + 1, acc); acc.pop(); } };
  rec(0, []);
  if (!best) return null;
  const fr = new Array(6).fill(null); strings.forEach((s, k) => fr[s] = best[k]); return fr;
}
function gVoicing(ch, kind, prev, lv, P) {
  const rpc = mod(pcL(ch.root.l) + ch.root.a, 12), q = gQual(ch), cands = [];
  const add = (fr, bonus) => { if (fr) cands.push({fr, bonus: bonus || 0}); };
  if (kind === 'chord' || kind === 'barre') {
    const nm = nameOf(ch.root) + (q === 'm' ? 'm' : q === '' ? '' : q) + (ch.bass ? '/' + nameOf(ch.bass) : '');
    if (kind === 'chord' && GOPEN[nm]) add(GOPEN[nm], lv <= 1 ? -6 : -1.5);
    if (kind === 'chord' && ch.bass && GOPEN[nameOf(ch.root) + (q === 'm' ? 'm' : q)]) add(GOPEN[nameOf(ch.root) + (q === 'm' ? 'm' : q)], lv <= 1 ? -2 : 0);
    for (const [sh, s0] of [['E', 0], ['A', 1]]) {
      const tab = GBARRE[sh][q] || (/^7[b#]9$/.test(q) ? null : GBARRE[sh][q.startsWith('m') ? 'm' : /7|9|13/.test(q) ? '7' : '']);
      if (!tab) continue;
      for (const base of [mod(rpc - mod(GSTR[s0], 12), 12), mod(rpc - mod(GSTR[s0], 12), 12) + 12]) {
        if (kind === 'barre' && base === 0) continue;   // cejilla de verdad: nunca la forma abierta
        const fr = tab.map(v => v === null ? null : base + v); if (fr.some(f => f !== null && (f < 0 || f > 17))) continue; add(fr, base > 10 ? 2 : 0); } }
  } else if (kind === 'power' || kind === 'power3') {
    for (const s0 of [0, 1, 2]) { const base = mod(rpc - mod(GSTR[s0], 12), 12); for (const b of [base, base + 12]) { if (b > 14) continue;
      const fr = new Array(6).fill(null); fr[s0] = b; fr[s0 + 1] = b + 2; if (kind === 'power3') fr[s0 + 2] = b + 2; add(fr, s0 * 0.8 + (b === 0 ? -0.5 : 0)); } }
  } else if (kind === 'oct') {
    for (const s0 of [0, 1, 2, 3]) { const base = mod(rpc - mod(GSTR[s0], 12), 12); for (const b of [base, base + 12]) { if (b > 14 || b < 1) continue;
      const fr = new Array(6).fill(null); fr[s0] = b; fr[s0 + 2] = b + 2 + (s0 >= 2 ? 1 : 0); add(fr, 0); } }
  } else {
    const third = ch.iv[3] ? '3' : '1';
    const spec = {top3: [[3, 4, 5], ['1', third, '5'], false], mid3: [[2, 3, 4], ['1', third, '5'], false], shell: [[0, 2, 3], ['1', third, '7'], true],
      funk: [[2, 3, 4], [third, '7', '9'], false], drop2: [[2, 3, 4, 5], ch.iv[7] ? ['1', third, '5', '7'] : ['1', third, '5'], false]}[kind];
    // funk: 3-7-9 de grave a agudo; drop 2: la segunda voz más aguda de la posición cerrada baja una octava (5-1-3-7, 7-3-5-1, 1-5-7-3, 3-7-1-5)
    const ords = kind === 'funk' ? [[0, 1, 2]] : kind === 'drop2' && spec[1].length === 4 ? [[2, 0, 1, 3], [3, 1, 2, 0], [0, 2, 3, 1], [1, 3, 0, 2]] : null;
    add(gBrute(ch, spec[0], spec[1], spec[2], prev, lv, P, ords) || (kind === 'funk' ? gBrute(ch, spec[0], spec[1], spec[2], prev, lv, P) : null));
    if (kind === 'shell') add(gBrute(ch, [1, 3, 4], spec[1], true, prev, lv, P));
    if (kind === 'drop2') add(gBrute(ch, [1, 2, 3, 4], spec[1], false, prev, lv, P, ords));
  }
  if (!cands.length) add(gBrute(ch, [3, 4, 5], ['1', ch.iv[3] ? '3' : '5', '5'], false, prev, lv, P) || [X, X, X, 0, 0, 0]);
  let best = null, bs = 1e9;
  for (const c of cands) { const fr = c.fr.filter(f => f !== null && f > 0); const avg = fr.length ? fr.reduce((a, b) => a + b) / fr.length : 0;
    const nn = c.fr.map((f, k) => f === null ? -1 : k).filter(k => k >= 0), hole = kind === 'chord' && nn.length ? c.fr.slice(nn[0], nn[nn.length - 1] + 1).filter(f => f === null).length * 3 : 0;   // rasgueo: sin cuerdas muertas en medio
    const sc = c.bonus + hole + (prev ? Math.abs(avg - prev.avg) * 0.6 : avg * 0.15) + (P && P.pos != null ? Math.abs(avg - P.pos) * 0.5 : Math.max(0, avg - 7) * 0.7);   // sin pos: no subir indefinidamente por el mástil
    if (sc < bs) { bs = sc; best = {fr: c.fr, avg}; } }
  const notes = frToPs(ch, best.fr).sort((a, b) => a.p.m - b.p.m);
  return {ps: notes.map(n => n.p), fr: notes.map(n => [n.s, n.f]), avg: best.avg};
}

// ================= BAJO: pentagrama en clave de fa (se escribe una octava por encima de lo que suena) + tablatura de 4 cuerdas
const BSTR = [28, 33, 38, 43];
// ================= UKELELE: afinación G-C-E-A reentrante (Sol 4, Do 4, Mi 4, La 4); cuerda 0 = Sol (la 4.ª, abajo en la TAB)
const UKSTR = [67, 60, 64, 69];
const UKPICK = {W: [0], X: [1], Y: [2], Z: [3], V: [0, 3]};
const UKOPEN = {C: [0, 0, 0, 3], Cm: [0, 3, 3, 3], C7: [0, 0, 0, 1], Cmaj7: [0, 0, 0, 2], Cm7: [3, 3, 3, 3], C6: [0, 0, 0, 0], Csus4: [0, 0, 1, 3], Csus2: [0, 2, 3, 3], Cadd9: [0, 2, 0, 3],
  D: [2, 2, 2, 0], Dm: [2, 2, 1, 0], D7: [2, 2, 2, 3], Dm7: [2, 2, 1, 3], Dmaj7: [2, 2, 2, 4], Dsus2: [2, 2, 0, 0], Dsus4: [0, 2, 3, 0], D6: [2, 2, 2, 2],
  E: [1, 4, 0, 2], Em: [0, 4, 3, 2], E7: [1, 2, 0, 2], Em7: [0, 2, 0, 2], Esus4: [4, 4, 5, 2],
  F: [2, 0, 1, 0], Fm: [1, 0, 1, 3], F7: [2, 3, 1, 3], Fmaj7: [2, 4, 1, 3], F6: [2, 2, 1, 3],
  G: [0, 2, 3, 2], Gm: [0, 2, 3, 1], G7: [0, 2, 1, 2], Gmaj7: [0, 2, 2, 2], Gm7: [0, 2, 1, 1], Gsus4: [0, 2, 3, 3], Gsus2: [0, 2, 3, 0], G6: [0, 2, 0, 2],
  A: [2, 1, 0, 0], Am: [2, 0, 0, 0], A7: [0, 1, 0, 0], Am7: [0, 0, 0, 0], Amaj7: [1, 1, 0, 0], Asus4: [2, 2, 0, 0], Asus2: [2, 4, 5, 2], A6: [2, 4, 2, 4], Am6: [2, 4, 2, 3],
  Bb: [3, 2, 1, 1], Bbm: [3, 1, 1, 1], Bb7: [1, 2, 1, 1], Bbmaj7: [3, 2, 1, 0], Bbm7: [1, 1, 1, 1],
  B: [4, 3, 2, 2], Bm: [4, 2, 2, 2], B7: [2, 3, 2, 2], Bm7: [2, 2, 2, 2], Bm7b5: [2, 2, 1, 2], Bdim7: [1, 2, 1, 2],
  Eb: [0, 3, 3, 1], Ebmaj7: [3, 3, 3, 5], 'F#m': [2, 1, 2, 0], 'C#m': [1, 1, 0, 4], Gdim7: [0, 1, 0, 1], 'C#dim7': [0, 1, 0, 1], Edim7: [0, 1, 0, 1]};
const UKQ = {'': ['1', '3', '5'], m: ['1', 'b3', '5'], '7': ['1', '3', 'b7'], m7: ['1', 'b3', 'b7'], maj7: ['1', '3', '7'], '6': ['1', '3', '6'], m6: ['1', 'b3', '6'],
  sus2: ['1', '2', '5'], sus4: ['1', '4', '5'], add9: ['1', '3', '9'], '9': ['3', 'b7', '9'], m9: ['b3', 'b7', '9'], maj9: ['3', '7', '9'], '13': ['3', 'b7', '13'],
  m7b5: ['1', 'b3', 'b5', 'b7'], dim7: ['1', 'b3', 'b5', '6'], dim: ['1', 'b3', 'b5'], aug: ['1', '3', '#5'], '7#9': ['3', 'b7', '#9'], '7b9': ['3', 'b7', 'b9'], '5': ['1', '5']};
function ukQual(ch) { const q = ch.q || ''; if (/^dim$|^°$|^o$/.test(q)) return 'dim'; if (/aug|\+$/.test(q)) return 'aug'; if (/^m6/.test(q)) return 'm6'; if (/^6/.test(q)) return '6';
  if (/^m9/.test(q)) return 'm9'; if (/^maj9/.test(q)) return 'maj9'; return gQual(ch); }
function ukVoicing(ch, kind, prev, lv, P) {        // rasgueo: las cuatro cuerdas; forma abierta habitual o forma móvil (palmo ≤ 3 trastes)
  const rpc = mod(pcL(ch.root.l) + ch.root.a, 12), q = ukQual(ch), cands = [];
  const nm = nameOf(ch.root) + q; const alias = {'Db': 'C#', 'C#': 'Db', 'Gb': 'F#', 'F#': 'Gb', 'G#': 'Ab', 'Ab': 'G#', 'D#': 'Eb', 'A#': 'Bb'};
  const op = UKOPEN[nm] || UKOPEN[(alias[nameOf(ch.root)] || '') + q];
  if (op) cands.push({fr: op, bonus: lv <= 1 ? -6 : -2});
  const need = (UKQ[q] || UKQ['']).map(t => { const [, se] = degree(t, ch); return mod(rpc + se, 12); });
  const allow = new Set(need.concat([rpc, mod(rpc + 7, 12)]));
  for (const v of Object.values(ch.iv || {})) if (v) allow.add(mod(rpc + v[1], 12));          // solo notas del acorde
  const fs = [...Array(13).keys()];
  for (const a of fs) for (const b of fs) for (const c of fs) for (const d of fs) { const fr = [a, b, c, d], pr = fr.filter(f => f > 0);
    if (pr.length && Math.max(...pr) - Math.min(...pr) > (lv >= 3 ? 4 : 3)) continue;
    if (pr.length && Math.min(...pr) > 9) continue;
    const pcs = fr.map((f, s) => mod(UKSTR[s] + f, 12)); if (!need.every(x => pcs.includes(x)) || !pcs.every(x => allow.has(x))) continue;
    if (fr.some(f => f === 0) && pr.length && Math.max(...pr) > 5) continue;
    cands.push({fr, bonus: 0}); }
  let best = null, bs = 1e9;
  for (const c of cands) { const pr = c.fr.filter(f => f > 0), avg = pr.length ? pr.reduce((x, y) => x + y) / pr.length : 0, span = pr.length ? Math.max(...pr) - Math.min(...pr) : 0;
    const dist = new Set(c.fr.map((f, s) => f > 0 ? f : null).filter(v => v !== null)).size;   // trastes distintos ≈ dedos
    const sc = c.bonus + (prev ? Math.abs(avg - prev.avg) * 0.6 : 0) + (P && P.pos != null && P.pos >= 0 ? Math.abs(avg - P.pos - 1) * 0.6 : avg * 0.4) + span * 0.5 + dist * 0.3 - c.fr.filter(f => f === 0).length * (lv >= 2 ? 0 : 0.4);
    if (sc < bs) { bs = sc; best = {fr: c.fr, avg}; } }
  const notes = best.fr.map((f, s) => ({s, f, p: gSpell(ch, UKSTR[s] + f)})).sort((x, y) => x.p.m - y.p.m);
  return {ps: notes.map(n => n.p), fr: notes.map(n => [n.s, n.f]), avg: best.avg};
}                    // E1 A1 D2 G2 (al aire)
function tabFrets(notes, pos, lv, STR) {
  STR = STR || BSTR;          // lv 1: prioriza cuerdas al aire; lv ≥ 2: posiciones cerradas en cajas de 4 trastes                    // digitación: posición cómoda y pocos saltos (programación dinámica)
  const seq = notes.filter(n => !n.wrapIn && !n.fr); const cost = [], cx = new Map();
  const cand0 = n => { const c = cand(n); if (!n.sn) return c; const st = STR.length - n.sn, k = c.filter(q => q[0] === st); return k.length ? k : c; };   // cuerda fijada con str (si se puede)
  const cand = n => { const bd = n.art === 'b' ? 2 : 0;                 // bend: se pisa un tono por debajo de la nota escrita
    const ms = n.ps.map(q => q.m - bd).sort((a, b) => a - b), m = ms[0], c = [];
    for (let s = 0; s < STR.length; s++) { const f = m - STR[s]; if (f < 0 || f > 19) continue;
      // dobles cuerdas (y notas múltiples): cada nota superior en una cuerda más aguda, dentro de un palmo de 4 trastes
      const ex = []; let ss = s, ok = true, xc = 0;     // xc: coste del palmo y de las sextas en cuerdas contiguas
      for (const mm of ms.slice(1)) { let got = null;
        for (let t = ss + 1; t < STR.length; t++) { const ff = mm - STR[t]; if (ff >= 0 && ff <= 19 && [f, ...ex.map(e => e[1])].every(g => !g || !ff || Math.abs(g - ff) <= 4)) {
          const iv = mod(mm - ms[ex.length], 12), d = Math.abs(ff - f) + (t - ss - 1) * 1.5 + ((iv === 8 || iv === 9) && t === ss + 1 ? 3 : 0);   /* sextas: saltando una cuerda */ if (!got || d < got[2]) got = [t, ff, d]; } }
        if (!got) { ok = false; break; } xc += got[2]; ex.push(got.slice(0, 2)); ss = got[0]; }
      if (ok) { c.push(ex.length ? [s, f, ex] : [s, f]); cx.set(c[c.length - 1], xc * 0.6); } }
    return c.length ? c : [[0, Math.max(0, m - STR[0])]]; };
  const C = seq.map(cand0); const box = (lv || 1) >= 2;
  // estado = (nota elegida, posición de la mano p: el índice en el traste p, el meñique en p+3). Cambiar de posición cuesta.
  const P0 = [...Array(17).keys()].map(i => i + 1);
  const fc = (s, f) => (box ? f * 0.03 : f * 0.09) + (f > 9 ? (f - 9) * (box ? 0.25 : 0.5) : 0) + (box && f === 0 ? 0.9 : 0)
    + (pos != null && f ? (Math.max(0, pos - 1 - f) + Math.max(0, f - pos - 3)) * 0.9 : 0)
    + (pos != null && !f && pos > 3 ? 3.2 : 0);   // posición: trastes pos-1 (estirando el índice) … pos+3; sin cuerdas al aire por encima del traste 3
  const fits = (f, p, ex) => (f === 0 || (f >= p && f <= p + 3)) && (!ex || ex.every(e => e[1] === 0 || (e[1] >= p - 1 && e[1] <= p + 4)));
  let prev = new Map();                               // clave 'k|p' → {c, bk}
  C.forEach((cs, i) => {
    const cur = new Map();
    cs.forEach(([s, f, ex], k) => P0.forEach(p => {
      if (!fits(f, p, ex)) return;
      const sa = seq[i].art, base = fc(s, f) + (cx.get(cs[k]) || 0) + (sa === 'P' && s < STR.length - 2 ? 3 : 0) + (sa === 'T' && s === STR.length - 1 ? 1.5 : 0);   // slap: pop en D/G, pulgar en E/A/D
      if (!i) { cur.set(k + '|' + p, {c: base + (f ? 0 : 0), bk: null}); return; }
      let best = 1e9, bk = null;
      for (const [key, v] of prev) { const [k0, p0] = key.split('|').map(Number); const [s0] = C[i - 1][k0];
        const f0 = C[i - 1][k0][1], m0 = seq[i - 1].ps[0].m - (seq[i - 1].art === 'b' ? 2 : 0), m1 = seq[i].ps[0].m - (seq[i].art === 'b' ? 2 : 0);   // bend: cuenta la nota pisada
        const crawl = s === s0 && f && f0 && Math.abs(f - f0) <= 2 && Math.abs(m1 - m0) <= 2;      // paso cromático por la misma cuerda: la mano se arrastra un traste
        const shift = p0 === p ? 0 : ((box ? 2.4 : 1.4) + Math.abs(p - p0) * 0.3) * (crawl ? 0.35 : 1);
        const oct = STR === BSTR && Math.abs(m1 - m0) === 12 && Math.abs(s - s0) === 2 && Math.abs(f - f0) === 2 ? -3 : 0;   // bajo: octava = dos cuerdas y dos trastes arriba
        const lig = seq[i].art && 'hp/'.includes(seq[i].art) && s !== s0 ? 40 : 0;   // ligados y slides: la misma cuerda
        const same = m1 === m0 && s !== s0 ? 1.5 : 0;     // la misma nota repetida: la misma cuerda
        const c = v.c + shift + Math.abs(s - s0) * 0.12 + base + lig + oct + same; if (c < best) { best = c; bk = key; } }
      cur.set(k + '|' + p, {c: best, bk}); }));
    if (!cur.size) { const [s, f] = cs[0]; let best = 1e9, bk = null; for (const [key, v] of prev) if (v.c < best) { best = v.c; bk = key; }
      cur.set('0|' + Math.max(1, f || 1), {c: (i ? best : 0) + 5, bk}); }
    cost.push(cur); prev = cur; });
  const res = new Map(); if (!seq.length) return res;
  let key = [...prev.entries()].sort((x, y) => x[1].c - y[1].c)[0][0];
  for (let i = seq.length - 1; i >= 0; i--) { const k = +key.split('|')[0]; res.set(seq[i], C[i][k]); key = cost[i].get(key).bk; }
  // una nota que se repite poco después vuelve a la misma cuerda y traste, si queda a mano de las notas vecinas
  const sig = n => n.ps.map(q => q.m).join(',') + (n.art === 'b' ? 'b' : ''), lig = n => n && n.art && 'hp/'.includes(n.art);   // una nota con bend no es la misma que la nota real
  for (let i = 1; i < seq.length; i++) for (let j = i - 1; j >= Math.max(0, i - 6); j--) { if (seq[i].sn) break; if (sig(seq[j]) !== sig(seq[i])) continue;   // una nota con cuerda fijada (str) no se mueve
    const a = res.get(seq[j]), b = res.get(seq[i]); if (!a || !b || a[0] === b[0] || lig(seq[i]) || lig(seq[i + 1])) break;
    const near = [seq[i - 1], seq[i + 1]].filter(Boolean).map(n => res.get(n)).every(r => !r || !r[1] || !a[1] || Math.abs(r[1] - a[1]) <= 4);
    if (near) res.set(seq[i], a); break; }
  // la continuación de una nota ligada desde el final del bucle usa la misma cuerda
  notes.filter(n => n.wrapIn).forEach(n => { const src = seq[seq.length - 1]; if (src) res.set(n, res.get(src)); });
  return res;
}
function layoutBass(P, o) { return layoutStr(P, o, BASSI); }
const BASSI = {hand: 'bs', strings: BSTR, clef: 'bass', name: 'bass'}, GTRI = {hand: 'gt', strings: GSTR, clef: 'treble', name: 'gtr'};
const UKEI = {hand: 'gt', strings: UKSTR, clef: 'treble', name: 'uke', wr: 0};          // el ukelele se escribe como suena
function layoutStr(P, o, I) {
  o = o || {}; const NS = I.strings.length;
  const X = expand(P, {tr: o.tr || 0});
  const {nb, n, M} = X, sp = o.sp || 5.4, W = o.W || 480, ki = keyInfo(X.key), ks = ki.fifths;
  const b0 = o.bars ? o.bars[0] : 0, b1 = o.bars ? o.bars[1] : nb, first = b0 === 0, last = b1 === nb, nbs = b1 - b0;
  const inSys = s => s >= b0 * n && s < b1 * n;
  const items = [], G = (x, y, cp, size) => items.push(['g', x, y, cp, size || 4 * sp]), L = (x1, y1, x2, y2, w) => items.push(['l', x1, y1, x2, y2, w]);
  const PO = pts => items.push(['p', pts]), DOT = (x, y, r) => items.push(['o', x, y, r]), TX = (x, y, t, size, bold) => items.push(['t', x, y, t, size, bold ? 1 : 0]);
  const hw = sp * 1.18;
  const RHY = !!(o.rhythm || o.rhythmOnly);   // ritmo sin alturas: una línea, cabezas en el centro (vistas TAB y mástil de la app)
  const WR = I.wr == null ? 12 : I.wr, notes = (X.hands[I.hand] || []).map(nt => Object.assign({}, nt, {ps: nt.ps.map(p => spell(p.l, p.m + WR)), snd: nt.ps}));   // guitarra y bajo: escrito una octava arriba; ukelele: como suena
  const frets = tabFrets(notes.map((nt, i) => Object.assign({}, nt, {ps: nt.snd, _i: i})), P.pos, P.lv, I.strings);
  const fretOf = new Map(); [...frets.entries()].forEach(([k, v]) => fretOf.set(k._i, v));
  // eje horizontal
  const x0 = sp * 0.4; let x = x0 + sp * 4.2; const xClef = x0 + sp * 0.9;
  const xKey = x; x += Math.abs(ks) * sp * 1.05 + (ks ? sp * 0.8 : 0);
  const two = M.sig[0] > 9, xTime = x + sp * 0.2; if (first) x += sp * (two ? 4.0 : 3.0);
  const xRep = x; if (first) x += sp * 1.6; else x += sp * 0.4;
  const endw = sp * 1.6, barGap = sp * 1.5, pad = sp * 1.9;
  const SEG = (P.seg || []).filter(b => b > b0 && b < b1), segW = sp * 3.2;      // varios ejercicios en una línea: :||: entre ellos
  const usable = W - x - endw - pad - (nbs - 1) * barGap - sp * 0.8 - SEG.length * segW, slotw = usable / (nbs * n);
  const slotX = [], barX = {};
  const barStart = b => b === b0 ? slotX[b0 * n] - pad * 0.8 : barX[b], barEnd = b => b + 1 < b1 ? barX[b + 1] : W - endw;
  // figuras
  const keyAcc = {}; (ks > 0 ? ORD_S.slice(0, ks) : ORD_F.slice(0, -ks)).split('').forEach(l => keyAcc[l] = ks > 0 ? 1 : -1);
  const notesI = notes.map((nt, i) => Object.assign(nt, {_i: i}));
  const bars = figures(notesI, nb, n, M);
  // figures pierde la referencia a la nota original: la recuperamos por la altura y el inicio
  const srcAt = new Map(); notesI.forEach(nt => { for (let i = nt.s; i < nt.s + nt.d + (nt.wrap || 0); i++) srcAt.set(i % (nb * n), nt); });
  let lo = 0, hi = 8;
  const fgLv = q => Math.max(Math.max(...q.pos) + 2, q.up && q.sy != null ? q.sy + 1.5 : 0, 9.5,       // altura de la digitación: por encima de plicas, articulaciones y ligaduras
    q.art && '>sat^'.includes(q.art) && q.up === false ? Math.max(...q.pos) + (q.art === 'a' ? 7.6 : q.art === 's' || q.art === 't' ? 4.2 : 5.9) : 0,
    (q.tie || q.tieIn) && q.up === false ? Math.max(...q.pos) + 4.4 : 0);
  for (const bar of bars) { const state = {};
    for (const f of bar) { if (f.k !== 'n') continue; f.pos = f.ps.map(p => posOf(p, I.clef)); f.src = srcAt.get(f.s);
      f.accs = f.ps.map(p => { const k = p.l + p.o; const cur = k in state ? state[k] : (keyAcc[p.l] || 0); state[k] = p.a; return (f.cont || cur === p.a) ? null : p.a; });
      if (RHY) { f.pos = [4]; f.accs = [null]; }
      lo = Math.min(lo, Math.min(...f.pos) - 1); hi = Math.max(hi, Math.max(...f.pos) + 1); } }
  for (const bar of bars) { let grp = [], beat = -1;
    const flush = () => { if (grp.length) { const all = grp.flatMap(f => f.pos); const up = (Math.max(...all) - 4) <= (4 - Math.min(...all)); grp.forEach(f => { f.up = up; f.grp = grp.length > 1 ? grp : null; }); } grp = []; };
    for (const f of bar) { const b = Math.floor((f.s % n) / M.beat), bm = f.k === 'n' && f.d < 4;
      if (f.k === 'r' && f.d < 4 && b === beat) continue;
      if (!bm || b !== beat) flush(); if (bm) { grp.push(f); beat = b; } else { beat = -1; if (f.k === 'n') { grp.push(f); flush(); } } }
    flush();
    for (const f of bar) { if (f.k !== 'n' || DUR[f.d][0] === 'w') continue;
      if (f.grp) { if (f.grp._y === undefined) { const all = f.grp.flatMap(g => g.pos); const sx = f.grp.some(g => g.d === 1 || g.d === 3);
          f.grp._y = f.up ? Math.max(Math.max(...all) + 7, 4 + (sx ? 1 : 0)) : Math.min(Math.min(...all) - 7, 4 - (sx ? 1 : 0)); } f.sy = f.grp._y; }
      else f.sy = f.up ? Math.max(Math.max(...f.pos) + 7, 4) : Math.min(Math.min(...f.pos) - 7, 4);
      lo = Math.min(lo, f.sy - 1); hi = Math.max(hi, f.sy + 1); }
    restsInBeams([bar]); for (const f of bar) if (f.k === 'n' && f.sy !== undefined) { lo = Math.min(lo, f.sy - 1); hi = Math.max(hi, f.sy + 1); }
    for (const f of bar) if (f.k === 'n' && f.fg) hi = Math.max(hi, fgLv(f) + 4 + (bar.some(q => 'DUm'.includes(q.art || '#')) ? 4 : 0));
    for (const f of bar) if (f.k === 'n' && f.art && '>sat^'.includes(f.art)) { const k = (f.art === 'a' ? 6.6 : 5) + (f.tie || f.tieIn ? 1.8 : 0); if (f.up === false) hi = Math.max(hi, Math.max(...f.pos) + k); else lo = Math.min(lo, Math.min(...f.pos) - k); } }
  // espaciado horizontal: pentagrama, TAB y cifrado comparten columnas
  { const N = nbs * n, Le = new Array(N).fill(0), Re = new Array(N).fill(0), occ = new Array(N).fill(false);
    const tz = sp * (NS > 4 ? 1.3 : 1.45) * (o.big ? 1.45 : 1) * (o.big ? 1.05 : 0.95);
    for (const bar of bars.slice(b0, b1)) for (const f of bar) { const c = f.s - b0 * n, ghost = f.art === 'x';
      const e = figExt(ghost ? Object.assign({}, f, {accs: f.accs.map(() => null)}) : f, sp, hw, n); if (!e) continue; occ[c] = true;
      let [l, r] = e;
      if (f.k === 'n' && !f.cont) { const src = f.src, fr = src && (src.fr ? null : fretOf.get(src._i));
        const nums = src && src.fr ? src.fr.map(q => q[1]) : fr ? [fr[1], ...(fr[2] || []).map(q => q[1])] : [];
        const tw = Math.max(0, ...nums.map(v => String(ghost ? 'x' : v).length)) * 0.62 * tz + tz * 0.3;
        if (nums.length) { l = Math.max(l, tw / 2 - hw / 2); r = Math.max(r, hw / 2 + tw / 2); }
        if (f.fg) { const fw = 0.6 * sp * 1.55 * String(f.fg).length; l = Math.max(l, fw / 2 - hw / 2); r = Math.max(r, hw / 2 + fw / 2); }
        if (f.art === 'b') r = Math.max(r, hw / 2 + tz * 2.3);
        if (f.art === '/' && src && src.fr) l = Math.max(l, tw / 2 - hw / 2 + tz * 1.4); }
      Le[c] = Math.max(Le[c], l); Re[c] = Math.max(Re[c], r); }
    const chs = X.cs.filter(c => inSys(Math.max(0, c.s))).map(c => [Math.max(0, c.s) - b0 * n, chordW(c.sym, o.big ? sp * 3.4 : sp * 2.3) - sp * 0.2]);
    const Sp = spaceCols({N, n, sp, U: usable, pad, barGap, L: Le, R: Re, occ, chords: chs});
    for (let i = 0; i < nb * n; i++) { const b = Math.floor(i / n) - b0; slotX.push(x + pad + (i - b0 * n) * slotw + b * barGap); }
    let xx = x + Sp.lead; for (let c = 0; c < N; c++) { slotX[b0 * n + c] = xx; xx += Sp.g[c] + ((c + 1) % n === 0 ? barGap : 0); }
    for (let b = b0 + 1; b < b1; b++) barX[b] = slotX[b * n] - Sp.Lbar((b - b0) * n); o._crowd = Sp.crowd;
    for (const sb of SEG) { for (let i = sb * n; i < b1 * n; i++) slotX[i] += segW; for (let b = sb + 1; b < b1; b++) barX[b] += segW; barX[sb] += segW / 2; } }
  // vertical: TAB abajo, pentagrama arriba, cifrado encima
  const BIG = !!o.big, tsp = sp * (NS > 4 ? 1.3 : 1.45) * (BIG ? 1.45 : 1), tabH = (NS - 1) * tsp, yTab = sp * 1.6 + (P.slap ? sp * 2.4 : 0);
  const hasDyn = X.dyn.marks.length > 0;
  const yS = yTab + tabH + Math.max(sp * 5.5, Math.max(0, -lo) * sp / 2 + sp * 2.2) + (hasDyn ? sp * 2.2 : 0);
  const LBL = P.lbl || null, hasLbl = !!LBL && Object.keys(LBL).some(b => +b >= b0 && +b < b1);      // rótulos por compás, encima del cifrado
  const H = yS + 4 * sp + Math.max(0, hi - 8) * sp / 2 + sp * (BIG ? 4.6 : 3.4) + (hasLbl ? sp * 2.8 : 0) + (bars.some(bar => bar.some(f => 'DUm'.includes(f.art || '#'))) ? sp * 2 : 0);
  const Y = pos => yS + pos * sp / 2, TY = s => yTab + s * tsp;          // s: 0=E (abajo) … 3=G (arriba)
  for (let p = 0; p <= 8; p += 2) if (!RHY || p === 4) L(x0, Y(p), W, Y(p), RHY ? 0.8 : 0.55);
  for (let s = 0; s < NS; s++) L(x0, TY(s), W, TY(s), 0.5);
  const SA = RHY ? 2 : 0, SB = RHY ? 6 : 8;
  L(x0, Y(SA), x0, Y(SB), 0.9); L(x0, TY(0), x0, TY(NS - 1), 0.9);
  if (RHY) {} else if (I.clef === 'bass') G(xClef, Y(6), 0xE062); else { G(xClef, Y(2), I.wr === 0 ? 0xE050 : 0xE052); }   // ukelele: clave de sol sin 8
  ['T', 'A', 'B'].forEach((c, i) => TX(xClef + sp * 1.0, yTab + tabH / 2 + (1 - i) * tsp * 1.15 - tsp * 0.35, c, tsp * 0.95, 1));
  const kpos = ks > 0 ? SHARPS : FLATS;
  if (!RHY) for (let i = 0; i < Math.abs(ks); i++) G(xKey + i * sp * 1.05, Y(kpos[i] - (I.clef === 'bass' ? 2 : 0)), ks > 0 ? 0xE262 : 0xE260);
  const digits = (v, xx, y) => { const t = String(v); t.split('').forEach((d, i) => G(xx + i * sp * 1.9, y, 0xE080 + +d)); };
  if (first) { digits(M.sig[0], xTime, Y(6)); digits(M.sig[1], xTime + (two ? sp * 0.95 : 0), Y(2)); }
  const rep = (xx, start, ya, yb, dots) => { if (start) { L(xx, ya, xx, yb, 1.8); L(xx + sp * 0.55, ya, xx + sp * 0.55, yb, 0.6); dots.forEach(y => DOT(xx + sp * 1.05, y, sp * 0.2)); }
    else { L(xx - 0.9, ya, xx - 0.9, yb, 1.8); L(xx - sp * 0.65, ya, xx - sp * 0.65, yb, 0.6); dots.forEach(y => DOT(xx - sp * 1.15, y, sp * 0.2)); } };
  const dS = [Y(3), Y(5)], dT = [yTab + tabH / 2 - tsp * 0.5, yTab + tabH / 2 + tsp * 0.5];
  if (first) { rep(xRep, true, Y(SA), Y(SB), dS); rep(xRep, true, TY(0), TY(NS - 1), dT); }
  if (last) { rep(W, false, Y(SA), Y(SB), dS); rep(W, false, TY(0), TY(NS - 1), dT); } else { L(W - 0.4, Y(SA), W - 0.4, Y(SB), 0.8); L(W - 0.4, TY(0), W - 0.4, TY(NS - 1), 0.8); }
  for (const [bk, bx] of Object.entries(barX)) { if (SEG.includes(+bk)) { [[Y(SA), Y(SB), dS], [TY(0), TY(NS - 1), dT]].forEach(([ya, yb, dd]) => {
      L(bx - sp * 0.55, ya, bx - sp * 0.55, yb, 0.6); L(bx, ya, bx, yb, 1.8); L(bx + sp * 0.55, ya, bx + sp * 0.55, yb, 0.6);
      dd.forEach(y => { DOT(bx - sp * 1.05, y, sp * 0.2); DOT(bx + sp * 1.05, y, sp * 0.2); }); }); continue; }
    L(bx, Y(SA), bx, Y(SB), 0.8); L(bx, TY(0), bx, TY(NS - 1), 0.8); }
  const ledgers = (xh, pos, w) => { for (let p = -2; p >= pos; p -= 2) L(xh - sp * 0.4, Y(p), xh + w + sp * 0.4, Y(p), 0.6); for (let p = 10; p <= pos; p += 2) L(xh - sp * 0.4, Y(p), xh + w + sp * 0.4, Y(p), 0.6); };
  let prevTab = null, pmRun = null; const pmRuns = []; const fgH = {};
  for (const bar of bars.slice(b0, b1)) for (const f of bar) {
    const [kind, dots] = DUR[f.d]; const xc = slotX[f.s];
    if (f.k === 'r') { if (f.d === n) { const bb = Math.floor(f.s / n); G((barStart(bb) + barEnd(bb)) / 2 - sp * 0.6, Y(6), REST.w); continue; }
      G(xc, Y((kind === 'w' ? 6 : 4) + (f.ry || 0)), REST[kind]); if (dots) DOT(xc + sp * 1.6, Y(5 + (f.ry || 0)), sp * 0.2); continue; }
    const hwK = kind === 'w' ? sp * 1.69 : hw, ghost = f.art === 'x';
    { const ord = f.pos.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]); const shift = new Array(f.pos.length).fill(0);
      if (f.up !== false) { let last = null; for (const [p, i] of ord) { if (last && p - last[0] === 1 && !shift[last[1]]) shift[i] = 1; last = [p, i]; } }
      else { let last = null; for (const [p, i] of ord.slice().reverse()) { if (last && last[0] - p === 1 && !shift[last[1]]) shift[i] = -1; last = [p, i]; } }
      const accN = ord.filter(([p, i]) => f.accs[i] !== null).reverse(); const cols = [];
      if (!ghost) for (const [p, i] of accN) { let c = cols.findIndex(lst => lst - p >= 6); if (c < 0) { cols.push(p); c = cols.length - 1; } else cols[c] = p;
        G(xc - sp * 1.15 * (c + 1) - (shift.some(v => v < 0) ? hw : 0), Y(p), ACC[f.accs[i]]); }
      for (const [p, i] of ord) { const xh = xc + shift[i] * hwK; ledgers(xh, p, hwK); G(xh, Y(p), ghost ? 0xE0A9 : HEAD[kind]);
        if (dots) DOT(xc + hwK + sp * (shift.some(v => v > 0) ? 1.7 : 0.6), Y(p % 2 ? p : p + 1), sp * 0.2); } }
    if (kind !== 'w') { const sx = f.up ? xc + hw - 0.35 : xc + 0.35, yEnd = Y(f.sy), yStart = f.up ? Y(Math.min(...f.pos)) + sp * 0.15 : Y(Math.max(...f.pos)) - sp * 0.15;
      L(sx, yStart, sx, yEnd, 0.75); f.sx = sx;
      if (!f.grp && (kind === 'e' || kind === 's')) G(sx - 0.3, yEnd, kind === 'e' ? (f.up ? 0xE240 : 0xE241) : (f.up ? 0xE242 : 0xE243)); }
    if (f.fg) { const bi = SEG.length ? -1 : Math.floor(f.s / n); if (fgH[bi] === undefined) { const fs = (bi < 0 ? bars.slice(b0, b1).flat() : bars[bi]).filter(q => q.k === 'n' && q.fg);   // varios ejercicios: digitación a una sola altura
        fgH[bi] = Math.max(...fs.map(fgLv)) + (fs.some(q => q.accs.some(a => a !== null)) ? 1 : 0); }
      items.push(['t', xc + hw * 0.5, Y(fgH[bi]), String(f.fg), sp * 1.55, 1]); }
    // articulaciones
    if (f.art && !f.cont) { const out_ = f.up === false ? 1 : -1, pe = out_ > 0 ? Math.max(...f.pos) : Math.min(...f.pos); let ya = Y(pe) + out_ * sp * (f.tie || f.tieIn ? 2.2 : 1.3); const xa = xc + hw * 0.5;
      if (f.art === 'a') { DOT(xa, ya, sp * 0.22); ya += out_ > 0 ? sp * 0.45 : -sp * 0.85; }
      if ('>a'.includes(f.art)) G(xa - sp * 0.68, ya + (out_ < 0 ? -sp * 0.6 : 0), 0xE4A0, sp * 4);
      if (f.art === 's') DOT(xa, ya, sp * 0.22);
      if (f.art === 't') L(xa - sp * 0.55, ya, xa + sp * 0.55, ya, 0.9);
      if (f.art === '^') G(xa - sp * 0.6, ya, out_ > 0 ? 0xE4AC : 0xE4AD, sp * 4); }
    // tablatura
    const src = f.src; const one = src && src.fr && src.fr.length === 1;      // nota suelta con traste fijado (ukelele): se dibuja como nota, con ligados y slides
    const fr = src && (one ? src.fr[0] : src.fr ? null : fretOf.get(src._i));
    if (src && src.fr && !one && !f.cont) {          // acorde de guitarra: un número por cuerda
      for (const [st, fn] of src.fr) { const t = ghost ? 'x' : String(fn), w = (t.length * 0.62 + 0.3) * tsp, ty = TY(st);
        items.push(['r', xc + hw / 2 - w / 2, ty - tsp * 0.5, w, tsp]); TX(xc + hw / 2, ty - tsp * (BIG ? 0.38 : 0.34), t, tsp * (BIG ? 1.05 : 0.9), 1);
        if (f.art === '/') L(xc + hw / 2 - w / 2 - tsp * 1.3, ty - tsp * 0.3, xc + hw / 2 - w / 2 - 1, ty + tsp * 0.05, 0.7); }   // slide de acorde
      prevTab = {chord: src.fr.map(([st, fn]) => ({st, fn})), x: xc + hw / 2, w: tsp * 0.92, top: Math.max(...src.fr.map(q => q[0]))};   // un ligado puede salir de una nota del acorde (pinza)
    }
    const fgB = (() => { const bi = Math.floor(f.s / n), fs = bars[bi].filter(q => q.k === 'n' && q.fg); if (!fs.length) return null;
      return Math.max(...fs.map(fgLv)) + (fs.some(q => q.accs.some(a => a !== null)) ? 1 : 0); })();
    const yStr = Y(Math.max(10, Math.max(...f.pos) + 3, (f.up && f.sy != null ? f.sy + 2 : 0), fgB != null ? fgB + 3.6 : 0));   // la púa va por encima de la digitación
    if (f.art === 'D' || f.art === 'U') G(xc + hw * 0.5 - sp * 0.7, yStr, f.art === 'D' ? 0xE610 : 0xE612, sp * 3.2);
    if (src && src.pf && !f.cont) items.push(['t', xc + hw * 0.5, yTab + tabH + tsp * 0.75, src.pf, tsp * 1.0, 0]);   // p i m a entre la TAB y el pentagrama
    if (f.art === 'm' && !f.cont) {                       // P.M. con línea de extensión mientras siga el apagado
      if (pmRun && pmRun.open) pmRun.x1 = xc + hw; else { pmRun = {x0: xc, x1: xc + hw, y: yStr, open: true}; pmRuns.push(pmRun); } pmRun.y = Math.max(pmRun.y, yStr); }
    else if (!f.cont && pmRun && pmRun.open) { if (f.art && f.art !== 'x') pmRun.open = false; else pmRun.x1 = xc + hw; }   // sin marca: sigue apagado
    if (fr && !f.cont) { const [st, fn] = fr, t = ghost ? 'x' : String(fn), w = (t.length * 0.62 + 0.3) * tsp, ty = TY(st);
      items.push(['r', xc + hw / 2 - w / 2, ty - tsp * 0.5, w, tsp]); TX(xc + hw / 2, ty - tsp * (BIG ? 0.38 : 0.34), t, tsp * (BIG ? 1.05 : 0.95), 1);
      for (const [s2, f2] of (fr[2] || [])) { const t2 = ghost ? 'x' : String(f2), w2 = (t2.length * 0.62 + 0.3) * tsp, ty2 = TY(s2);
        items.push(['r', xc + hw / 2 - w2 / 2, ty2 - tsp * 0.5, w2, tsp]); TX(xc + hw / 2, ty2 - tsp * (BIG ? 0.38 : 0.34), t2, tsp * (BIG ? 1.05 : 0.95), 1); }
      if (f.art === 'b') { TX(xc + hw / 2 + tsp * 1.3, ty + tsp * 1.1, 'full', tsp * 0.7, 1); L(xc + hw / 2 + tsp * 0.5, ty, xc + hw / 2 + tsp * 1.0, ty + tsp * 0.9, 0.6); }
      // técnica: hammer, pull, slide (arco o raya desde la nota anterior), slap/pop (letra bajo la TAB)
      if (prevTab && prevTab.chord) { const q = prevTab.chord.find(c => c.st === st); prevTab = q ? Object.assign({}, prevTab, q, {chord: null}) : null; }
      if (prevTab && f.art && 'hp/'.includes(f.art) && prevTab.st === st) {
        if (f.art === '/') { const dy = fn > prevTab.fn ? 1 : -1; L(prevTab.x + tsp * 0.7, ty - dy * tsp * 0.25, xc + hw / 2 - w / 2 - 1, ty + dy * tsp * 0.25, 0.7); }
        else { const yt = TY(Math.max(st, prevTab.top, ...(fr[2] || []).map(e => e[0]))) + tsp * 0.6, xa = prevTab.x + prevTab.w / 2 - tsp * 0.15, xb = xc + hw / 2 - w / 2 + tsp * 0.15;   // arco por encima de la nota más aguda (dobles cuerdas)
          items.push(['c', Math.min(xa, (prevTab.x + xc + hw / 2) / 2 - tsp * 0.3), yt, Math.max(xb, (prevTab.x + xc + hw / 2) / 2 + tsp * 0.3), yt, tsp * 0.5, sp * 0.18]); TX((prevTab.x + xc + hw / 2) / 2, yt + tsp * 0.75, f.art === 'h' ? 'H' : 'P', tsp * 0.7, 1); } }
      if (f.art === 'T' || f.art === 'P') TX(xc + hw / 2, yTab - tsp * 1.3, f.art, tsp * 0.85, 1);
      if (f.art === 'v') { const yv = TY(NS - 1) + tsp * 1.1; let xx = xc + hw / 2 - tsp * 0.4;             // vibrato: línea ondulada sobre la TAB
        for (let k = 0; k < 6; k++) { L(xx, yv + (k % 2 ? tsp * 0.25 : -tsp * 0.25) * 0, xx + tsp * 0.3, yv + (k % 2 ? -tsp * 0.22 : tsp * 0.22), 0.7); L(xx + tsp * 0.3, yv + (k % 2 ? -tsp * 0.22 : tsp * 0.22), xx + tsp * 0.6, yv, 0.7); xx += tsp * 0.6; } }
      prevTab = {st, fn, x: xc + hw / 2, w, top: Math.max(st, ...(fr[2] || []).map(e => e[0]))}; }
    else if (!f.cont && !(src && src.fr && src.fr.length > 1)) prevTab = null;
    if (f.tie) { const nx = inSys(f.s + f.d) ? slotX[f.s + f.d] : W + sp * 0.4, below = f.up !== false;
      const flg = !f.grp && (kind === 'e' || kind === 's');
      f.pos.forEach(p => items.push(['c', !below && f.up && kind !== 'w' ? xc + hw + (flg ? sp * 1.1 : sp * 0.25) : below && f.up === false && flg ? xc + sp * 1.6 : xc + hwK * 0.62, Y(p) + (below ? -sp * 0.75 : sp * 0.75), nx + hw * 0.38, Y(p) + (below ? -sp * 0.75 : sp * 0.75), (below ? -1 : 1) * Math.min(sp * 0.9, sp * 0.35 + (nx - xc) * 0.06), sp * 0.2])); }
    if (f.tieIn) f.pos.forEach(p => { const below = f.up !== false; items.push(['c', xc - sp * 2.6, Y(p) + (below ? -sp * 0.75 : sp * 0.75), xc + hw * 0.3, Y(p) + (below ? -sp * 0.75 : sp * 0.75), (below ? -1 : 1) * sp * 0.55, sp * 0.2]); });
  }
  for (const bar of bars.slice(b0, b1)) { const seen = new Set();
    for (const f of bar) { if (!f.grp || seen.has(f.grp)) continue; seen.add(f.grp);
      const g = f.grp, up = g[0].up, th = sp * 0.5, dir = up ? -1 : 1, yb0 = Y(g[0].sy);
      const beam = (xa, xb, lvl) => { const yb = yb0 + dir * lvl * sp * 0.75, y2 = yb + (up ? -th : th); PO([[xa, yb], [xb, yb], [xb, y2], [xa, y2]]); };
      const xs = g.map(q => q.sx); beam(xs[0] - 0.375, xs[xs.length - 1] + 0.375, 0);
      g.forEach((q, i) => { if (q.d !== 1) return; const nxt = g[i + 1], prv = g[i - 1];
        if (nxt && nxt.d === 1 && nxt.s === q.s + q.d) beam(q.sx - 0.375, nxt.sx + 0.375, 1); else if (!(prv && prv.d === 1 && prv.s + prv.d === q.s)) { const Lh = sp * 1.1; if (prv) beam(q.sx - Lh, q.sx + 0.375, 1); else beam(q.sx - 0.375, q.sx + Lh, 1); } }); } }
  const hasStrum = bars.some(bar => bar.some(f => 'DUm'.includes(f.art || '#')));
  const yC = Y(Math.max(10, hi + 1) + (hasStrum ? 4 : 0)) + sp * 0.9;
  for (const c of X.cs) if (inSys(Math.max(0, c.s))) items.push(['ch', slotX[Math.max(0, c.s)] - sp * 0.2, yC, c.sym].concat(BIG ? [sp * 3.4] : []));
  if (hasLbl) for (const [bk, txt] of Object.entries(LBL)) { const bb = +bk; if (bb < b0 || bb >= b1) continue; TX(slotX[bb * n + Math.floor(n / 2)], yC + sp * (BIG ? 3.6 : 2.6), txt, sp * (BIG ? 2.0 : 1.7), 0); }
  pmRuns.forEach(r => { TX(r.x0 + hw * 0.5, r.y, 'P.M.', sp * 1.35, 1); const xs = r.x0 + hw * 0.5 + sp * 2.4;
    for (let xx = xs; xx < r.x1 - sp * 0.4; xx += sp * 1.2) L(xx, r.y + sp * 0.45, Math.min(xx + sp * 0.6, r.x1), r.y + sp * 0.45, 0.6);
    if (r.x1 - xs > sp * 1.5) L(r.x1, r.y + sp * 0.45, r.x1, r.y + sp * 0.05, 0.6); });
  const yD = Y(Math.min(-4, lo)) - sp * 2.0, DG = {p: 0xE520, m: 0xE521, f: 0xE522};
  X.dyn.marks.forEach((mk, i) => {
    const nxH = X.dyn.marks.slice(i + 1).find(q => q.s > mk.s);
    const hairOn = (mk.m === '<' || mk.m === '>') && mk.s < b0 * n && (!nxH || nxH.s > b0 * n);
    if (!inSys(mk.s) && !hairOn) return; const xd = hairOn ? slotX[b0 * n] - pad : slotX[mk.s];
    if (DYNV[mk.m]) { let xx = xd - sp * 0.3; for (const ch of mk.m) { G(xx, yD, DG[ch], sp * 3.6); xx += sp * (ch === 'm' ? 1.75 : 1.2); } }
    else if (mk.m === '<' || mk.m === '>') { const xe = nxH && inSys(nxH.s) ? slotX[nxH.s] - sp * 1.2 : W - endw; const h = sp * 0.6, ym = yD + sp * 0.55;
      if (mk.m === '<') { L(xd, ym, xe, ym + h, 0.6); L(xd, ym, xe, ym - h, 0.6); } else { L(xd, ym + h, xe, ym, 0.6); L(xd, ym - h, xe, ym, 0.6); } } });
  if (o.rhythmOnly) {
    const cutT = yTab + tabH + tsp * 0.6, yOf = it => it[0] === 'l' ? Math.min(it[2], it[4]) : it[0] === 'p' ? Math.min(...it[1].map(q => q[1])) : it[0] === 'c' ? Math.min(it[2], it[4]) : it[2];
    const sh = Y(1) - sp * 1.2 - 0, keep = [];
    for (const it of items) { if (yOf(it) <= cutT && it[0] !== 'ch') continue; const q = it.slice();
      if (q[0] === 'l') { q[2] -= sh; q[4] -= sh; } else if (q[0] === 'p') q[1] = q[1].map(([x, y]) => [x, y - sh]); else if (q[0] === 'c') { q[2] -= sh; q[4] -= sh; } else q[2] -= sh; keep.push(q); }
    return {items: keep, W, H: H - sh, slotX, sp, cs: X.cs, nb, n, M, key: X.key, bars: [b0, b1], frets: notes.map((nt, i) => fretOf.get(i))};
  }
  if (o.tabOnly) {        // solo tablatura (app): se quita el pentagrama; el cifrado, el rasgueo y el P.M. bajan sobre la TAB
    const cut = yTab + tabH + sp * 1.2, yOf = it => it[0] === 'l' ? Math.min(it[2], it[4]) : it[0] === 'p' ? Math.min(...it[1].map(q => q[1])) : it[0] === 'c' ? Math.min(it[2], it[4]) : it[2];
    const yStrum = cut + sp * 1.4, pmY = new Set(items.filter(it => it[0] === 't' && it[3] === 'P.M.').map(it => it[2]));
    const strumH = items.some(it => (it[0] === 'g' && (it[3] === 0xE610 || it[3] === 0xE612)) || pmY.size) ? sp * 3.4 : 0, yCh = cut + strumH + sp * (BIG ? 1.6 : 1.2);
    const keep = [];
    for (const it of items) {
      if (it[0] === 'ch') { keep.push(['ch', it[1], yCh].concat(it.slice(3))); continue; }
      if (it[0] === 'g' && (it[3] === 0xE610 || it[3] === 0xE612)) { keep.push(['g', it[1], yStrum, it[3], it[4]]); continue; }
      if (it[0] === 't' && it[3] === 'P.M.') { keep.push(['t', it[1], yStrum + sp * 0.3, it[3], it[4], it[5]]); continue; }
      if (it[0] === 'l' && it[2] === it[4] && [...pmY].some(y => Math.abs(it[2] - (y + sp * 0.45)) < 0.01)) { keep.push(['l', it[1], yStrum + sp * 0.75, it[3], yStrum + sp * 0.75, it[5]]); continue; }
      if (it[0] === 'l' && [...pmY].some(y => Math.abs(Math.max(it[2], it[4]) - (y + sp * 0.45)) < 0.01)) { keep.push(['l', it[1], yStrum + sp * 0.75, it[3], yStrum + sp * 0.35, it[5]]); continue; }
      if (yOf(it) <= cut) keep.push(it); }
    return {items: keep, W, H: yCh + sp * (BIG ? 3.6 : 3), slotX, sp, cs: X.cs, nb, n, M, key: X.key, bars: [b0, b1], frets: notes.map((nt, i) => fretOf.get(i))};
  }
  // diagramas de acorde debajo de la TAB (libro de guitarra): uno por cada acorde nuevo de la línea
  let dh = 0;
  const voic = [];                                   // acordes de la línea (para los diagramas al pie de página)
  if (P.diag === 2 && I.hand === 'gt' && !RHY) { let last = null;
    for (const nt of notes) { const vf = nt.vfr || nt.fr; if (nt.s < b0 * n || nt.s >= b1 * n || !vf || vf.length < (NS > 4 ? 3 : 4)) continue;
      const sig = vf.map(q => q.join(':')).join(','); if (sig === last) continue; last = sig;
      const cs = X.cs.filter(c => c.s <= nt.s).pop(); voic.push({sym: cs ? cs.sym : '', fr: vf}); } }
  else if (P.diag && I.hand === 'gt' && !RHY) {
    const ds = sp * 1.1, fg = sp * 1.3, NF = 4, dw = (NS - 1) * ds, top = -sp * 2.6;      // top: primera línea (cejuela) del diagrama
    let last = null, px = -1e9, any = false;
    for (const nt of notes) { if (nt.s < b0 * n || nt.s >= b1 * n || !nt.fr || nt.fr.length < 3) continue;
      const sig = nt.fr.map(q => q.join(':')).join(','); if (sig === last) continue; last = sig; any = true;
      const fs = nt.fr.map(q => q[1]).filter(f => f > 0), hi = Math.max(0, ...fs), lo = fs.length ? Math.min(...fs) : 1;
      const base = hi <= NF ? 1 : lo;                                                // traste de arriba del diagrama
      let x0 = Math.max(slotX[nt.s] + hw / 2 - dw / 2, px + dw + sp * 2.2); x0 = Math.min(x0, W - dw - sp * 0.6); px = x0;
      const cs = X.cs.filter(c => c.s <= nt.s).pop();
      if (cs) items.push(['chs', x0 + dw / 2, top + sp * 1.55, cs.sym, sp * 1.5]);
      for (let k = 0; k < NS; k++) L(x0 + k * ds, top, x0 + k * ds, top - NF * fg, 0.45);
      for (let f = 0; f <= NF; f++) L(x0, top - f * fg, x0 + dw, top - f * fg, f === 0 && base === 1 ? 1.6 : 0.45);
      if (base > 1) TX(x0 - sp * 1.2, top - fg * 0.85, String(base), sp * 1.15, 0);
      const on = new Map(nt.fr.map(q => [q[0], q[1]]));
      const bar = fs.length >= (NS > 4 ? 4 : 3) && nt.fr.filter(q => q[1] === lo).length >= 2 && lo > 0 && [...on.keys()].every(k => on.get(k) >= lo) ? lo : 0;   // cejilla
      if (bar) { const ks = nt.fr.filter(q => q[1] === lo).map(q => q[0]); const a = Math.min(...ks), b = Math.max(...ks);
        const y = top - (lo - base + 0.5) * fg; L(x0 + a * ds, y, x0 + b * ds, y, ds * 0.75); }
      for (let k = 0; k < NS; k++) { const x = x0 + k * ds;
        if (!on.has(k)) { TX(x, top + sp * 0.25, 'x', sp * 1.0, 0); continue; }
        const f = on.get(k); if (f === 0) { items.push(['oc', x, top + sp * 0.65, ds * 0.3]); continue; }
        if (f !== bar) DOT(x, top - (f - base + 0.5) * fg, ds * 0.36); } }
    if (any) dh = sp * 2.9 + NF * fg + sp * 0.6;
  }
  return {items, W, H, slotX, sp, cs: X.cs, nb, n, M, key: X.key, bars: [b0, b1], frets: notes.map((nt, i) => fretOf.get(i)), segX: SEG.map(b => barX[b]), dh, voic};
}
function layoutGtr(P, o) { return layoutStr(P, o, P.inst === 'uke' ? UKEI : GTRI); }
function systemsGtr(P, o) {
  o = o || {}; const X = expand(P, {tr: o.tr || 0}), nb = X.nb, n = X.n;
  let per = o.per || P.per; if (!per) { const dens = (X.hands.gt || []).length / nb; per = nb <= 2 ? nb : (n <= 16 ? (dens <= 6 ? 4 : 2) : (dens <= 8 ? 3 : 2)); }
  const out = []; for (const bb of lineBars(nb, per)) out.push(layoutGtr(P, Object.assign({}, o, {bars: bb})));
  return out;
}
function systemsBass(P, o) {
  o = o || {}; const X = expand(P, {tr: o.tr || 0}), nb = X.nb, n = X.n;
  let per = o.per || P.per; if (!per) { const dens = (X.hands.bs || []).length / nb; per = nb <= 2 ? nb : (n <= 16 ? (dens <= 6 ? 4 : 2) : (dens <= 8 ? 3 : 2)); }
  const out = []; for (const bb of lineBars(nb, per)) out.push(layoutBass(P, Object.assign({}, o, {bars: bb})));
  return out;
}

// ---------------- SVG (app)
function toSVG(Lr, o) {
  o = o || {}; const ink = o.ink || 'currentColor', H = Lr.H, YY = v => (H - v).toFixed(1), f = v => v.toFixed(1), sp = Lr.sp;
  const out = [];
  for (const it of Lr.items) {
    const t = it[0];
    if (t === 'g') out.push(`<text x="${f(it[1])}" y="${YY(it[2])}" font-family="PGBrv" font-size="${f(it[4])}" fill="${ink}">${String.fromCodePoint(it[3])}</text>`);
    else if (t === 'l') out.push(`<line x1="${f(it[1])}" y1="${YY(it[2])}" x2="${f(it[3])}" y2="${YY(it[4])}" stroke="${ink}" stroke-width="${it[5]}"/>`);
    else if (t === 'p') out.push(`<polygon points="${it[1].map(([x, y]) => f(x) + ',' + YY(y)).join(' ')}" fill="${ink}"/>`);
    else if (t === 'o') out.push(`<circle cx="${f(it[1])}" cy="${YY(it[2])}" r="${it[3].toFixed(2)}" fill="${ink}"/>`);
    else if (t === 'c') { const [, xa, ya, xb, yb, dy, th] = it; const Lc = xb - xa, sg = dy > 0 ? 1 : -1;
      out.push(`<path d="M${f(xa)} ${YY(ya)} C${f(xa + Lc * .25)} ${YY(ya + dy * 1.33)} ${f(xb - Lc * .25)} ${YY(yb + dy * 1.33)} ${f(xb)} ${YY(yb)} C${f(xb - Lc * .25)} ${YY(yb + dy * 1.33 - sg * th)} ${f(xa + Lc * .25)} ${YY(ya + dy * 1.33 - sg * th)} ${f(xa)} ${YY(ya)}Z" fill="${ink}"/>`); }
    else if (t === 'brace') { const [, x, y, h] = it; const k = h / (4 * sp);
      out.push(`<text transform="translate(${f(x - 0.277 * sp * k - 2)},${YY(y)}) scale(${k.toFixed(3)})" font-family="PGBrv" font-size="${f(4 * sp)}" fill="${ink}"></text>`); }
    else if (t === 't') out.push(`<text x="${f(it[1])}" y="${YY(it[2])}" text-anchor="middle" font-family="var(--body),sans-serif" font-weight="${it[5] ? 700 : 400}" font-size="${f(it[4])}" fill="${ink}">${it[3]}</text>`);
    else if (t === 'r') out.push(`<rect x="${f(it[1])}" y="${YY(it[2] + it[4])}" width="${f(it[3])}" height="${f(it[4])}" fill="#fff"/>`);
    else if (t === 'ch') out.push(`<text x="${f(it[1])}" y="${YY(it[2])}" font-family="var(--body),sans-serif" font-weight="700" font-size="${f(it[4] || sp * 2.3)}" fill="${ink}">${chordHTML(it[3])}</text>`);
  }
  return out.join('');
}
function chordHTML(s) { return s.replace(/(^[A-G])b/, '$1♭').replace(/(^[A-G])#/, '$1♯').replace(/\/([A-G])b/, '/$1♭').replace(/\/([A-G])#/, '/$1♯'); }

const API = {expand, layout, systems, layoutBass, systemsBass, layoutGtr, systemsGtr, tabFrets, GSTR, UKSTR, gVoicing, ukVoicing, METERS, toSVG, transposeChords, transposeKey, keyInfo, parseChord, midiOf, figures, chordHTML, PREF};
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PIANO = API;
})(this);
