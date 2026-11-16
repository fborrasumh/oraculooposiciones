/* ══ Núcleo de OráculoOposiciones: lógica pura, sin DOM (se prueba en Node con tests/test_nucleo.js) ══
   · conteos por bloque, año y tema · predicción dentro de cada bloque con validación a ciegas · muestreo reproducible
   · puntuación por partes con penalización · comprobaciones del generador multiagente ══
   La estructura del examen (bloques y número de preguntas de cada uno) la fija la convocatoria: lo que se predice es
   cómo se reparten esas preguntas entre los temas de cada bloque. */

/* generador pseudoaleatorio con semilla (mulberry32): mismo texto → mismo examen en cualquier móvil */
function semillaDe(s) { let h = 1779033703 ^ String(s).length; for (let i = 0; i < String(s).length; i++) { h = Math.imul(h ^ String(s).charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return h >>> 0; }
function rng(seed) { let a = typeof seed === 'number' ? seed >>> 0 : semillaDe(seed); return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function baraja(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const sinTema = id => /-otros$/.test(String(id));
/* {año: {tema: n}} de un bloque, sin preguntas de reserva ni sin tema (las de reserva no siempre se corrigen) */
function conteosBloque(preguntas, bloque) {
  const c = {};
  for (const q of preguntas) {
    if (q.bloque !== bloque || q.reserva || sinTema(q.tema) || !q.anio) continue;
    (c[q.anio] = c[q.anio] || {}); c[q.anio][q.tema] = (c[q.anio][q.tema] || 0) + 1;
  }
  return c;
}
const aniosDe = c => Object.keys(c).map(Number).sort((a, b) => a - b);
function cuotas(c) {
  const o = {};
  for (const y of aniosDe(c)) { const tot = Object.values(c[y]).reduce((s, v) => s + v, 0) || 1; o[y] = {}; for (const k in c[y]) o[y][k] = c[y][k] / tot; }
  return o;
}

/* Predicción para el examen «obj» con los anteriores (dentro de un bloque de n preguntas):
   media ponderada con semivida «h» exámenes-año (lo reciente pesa más) + tendencia lineal ponderada amortiguada a la mitad.
   Se renormaliza para que la suma sea n. El intervalo combina la dispersión histórica y el azar de un recuento (Poisson). */
function predice(c, obj, {h = 3, amort = 0.5, n = 30, asigs} = {}) {
  const q = cuotas(c), ys = aniosDe(c).filter(y => y < obj);
  if (!ys.length) return {filas: [], anios: []};
  const ids = asigs || [...new Set(ys.flatMap(y => Object.keys(q[y])))];
  const w = ys.map(y => Math.pow(0.5, (obj - 1 - y) / h)), W = w.reduce((s, v) => s + v, 0);
  const yb = ys.reduce((s, y, i) => s + w[i] * y, 0) / W;
  const filas = ids.map(id => {
    const s = ys.map(y => q[y][id] || 0);
    const m = s.reduce((a, v, i) => a + w[i] * v, 0) / W;
    let sxx = 0, sxy = 0; ys.forEach((y, i) => { sxx += w[i] * (y - yb) ** 2; sxy += w[i] * (y - yb) * (s[i] - m); });
    const b = sxx > 0 && ys.length >= 3 ? sxy / sxx : 0;
    const p = Math.max(0, m + amort * b * (obj - yb));
    const res = ys.map((y, i) => s[i] - (m + b * (y - yb)));
    const sd = Math.sqrt(res.reduce((a, r, i) => a + w[i] * r * r, 0) / W);
    const ult = ys.slice(-3).map(y => ({anio: y, n: (c[y] || {})[id] || 0}));
    const ultimaVez = [...ys].reverse().find(y => ((c[y] || {})[id] || 0) > 0) || null;
    const veces = ys.filter(y => ((c[y] || {})[id] || 0) > 0).length;
    return {id, cuota: p, tendencia: b, sd, ult, ultimaVez, veces};
  });
  const tot = filas.reduce((a, f) => a + f.cuota, 0) || 1;
  for (const f of filas) {
    f.cuota /= tot; f.n = f.cuota * n;
    const sdN = Math.sqrt((f.sd * n) ** 2 + f.n);
    f.lo = Math.max(0, Math.round(f.n - 1.28 * sdN)); f.hi = Math.round(f.n + 1.28 * sdN);   // ≈ intervalo del 80 %
    f.prob = 1 - Math.exp(-f.n);                                                              // P(al menos una pregunta) con Poisson
    f.tend = f.tendencia * n > 0.4 ? 'sube' : f.tendencia * n < -0.4 ? 'baja' : 'estable';
  }
  filas.sort((a, b) => b.n - a.n);
  return {filas, anios: ys};
}

/* Validación a ciegas: para cada uno de los «k» últimos exámenes se predice SOLO con los anteriores y se compara con lo que salió.
   Referencias: «igual que el examen anterior» y «media simple de todos». Error = media de |predicho − real| en preguntas por tema. */
function valida(c, {k = 3, n = 30, h = 3} = {}) {
  const ys = aniosDe(c), q = cuotas(c), out = [];
  for (const Y of ys.slice(-k)) {
    const prev = ys.filter(y => y < Y); if (prev.length < 3) continue;
    const sub = {}; prev.forEach(y => sub[y] = c[y]);
    const ids = [...new Set([...prev.flatMap(y => Object.keys(c[y])), ...Object.keys(c[Y])])];
    const p = predice(sub, Y, {n, h, asigs: ids}), real = id => (q[Y][id] || 0) * n;
    const pm = Object.fromEntries(p.filas.map(f => [f.id, f.n]));
    const ant = prev.at(-1), media = id => prev.reduce((a, y) => a + (q[y][id] || 0), 0) / prev.length * n;
    const err = f => ids.reduce((a, id) => a + Math.abs(f(id) - real(id)), 0) / ids.length;
    const kTop = Math.min(5, Math.max(1, Math.floor(ids.length / 2)));
    const top = [...ids].sort((a, b) => (pm[b] || 0) - (pm[a] || 0)).slice(0, kTop), topReal = [...ids].sort((a, b) => real(b) - real(a)).slice(0, kTop);
    out.push({anio: Y, mae: err(id => pm[id] || 0), maeAnterior: err(id => (q[ant][id] || 0) * n), maeMedia: err(media), aciertoTop: top.filter(x => topReal.includes(x)).length, kTop});
  }
  if (!out.length) return null;
  const av = key => out.reduce((a, o) => a + o[key], 0) / out.length;
  const r = {porAnio: out, mae: av('mae'), maeAnterior: av('maeAnterior'), maeMedia: av('maeMedia'), aciertoTop: av('aciertoTop'), kTop: out[0].kTop};
  r.nivel = r.mae <= 0.85 * Math.min(r.maeAnterior, r.maeMedia) ? 'alta' : r.mae <= Math.min(r.maeAnterior, r.maeMedia) * 1.02 ? 'media' : 'baja';
  return r;
}

/* Predicción de todos los bloques: {b1: {filas, anios, val}, psico: …, b2: …} */
function prediceTodo(preguntas, examen, obj) {
  const out = {};
  for (const b of examen.bloques) {
    const c = conteosBloque(preguntas, b.id), ys = aniosDe(c);
    const o = obj || (ys.length ? ys.at(-1) + 1 : new Date().getFullYear() + 1);
    out[b.id] = {...predice(c, o, {n: b.n}), val: valida(c, {n: b.n}), conteos: c, obj: o};
  }
  return out;
}

/* reparto entero de n preguntas según las cuotas (restos mayores) */
function reparto(filas, n) {
  const base = filas.map(f => ({id: f.id, x: f.cuota * n})); base.forEach(b => { b.k = Math.floor(b.x); b.r = b.x - b.k; });
  let falta = n - base.reduce((a, b) => a + b.k, 0);
  [...base].sort((a, b) => b.r - a.r).forEach(b => { if (falta > 0) { b.k++; falta--; } });
  return Object.fromEntries(base.map(b => [b.id, b.k]));
}
const utilizable = q => q && q.correcta && !q.anulada && !q.imagen && Array.isArray(q.opciones) && q.opciones.length === 4;

/* Cuántas preguntas de cada bloque lleva un simulacro de n: el examen completo respeta la estructura (30/30/50);
   uno más corto la reparte en la misma proporción. «bloques» limita a los elegidos. */
function nPorBloque(examen, n, bloques) {
  const bs = examen.bloques.filter(b => !bloques || bloques.includes(b.id));
  return reparto(bs.map(b => ({id: b.id, cuota: b.n / bs.reduce((a, x) => a + x.n, 0)})), n);
}

/* Simulacro «probable»: preguntas oficiales en la proporción que predice el modelo dentro de cada bloque, con los bloques
   en el orden del examen real. filtro: {bloques?: [...], tema?: id, desde?: año}. Reproducible con la semilla. */
function simulacro(preguntas, pred, examen, n, semilla, filtro = {}) {
  const r = rng(semilla), ok = q => utilizable(q) && (!filtro.desde || q.anio >= filtro.desde);
  if (filtro.tema) return baraja(preguntas.filter(q => ok(q) && q.tema === filtro.tema), r).slice(0, n);
  const npb = nPorBloque(examen, n, filtro.bloques), sel = [];
  for (const b of examen.bloques) {
    const k = npb[b.id]; if (!k) continue;
    const pool = {}; for (const q of preguntas) if (ok(q) && q.bloque === b.id && !sinTema(q.tema)) (pool[q.tema] = pool[q.tema] || []).push(q);
    const fs = ((pred[b.id] || {}).filas || []).filter(f => pool[f.id]);
    let elegidas = [];
    if (fs.length) {
      const tot = fs.reduce((a, f) => a + f.cuota, 0) || 1, rep = reparto(fs.map(f => ({id: f.id, cuota: f.cuota / tot})), k);
      for (const f of fs) elegidas.push(...baraja(pool[f.id], r).slice(0, rep[f.id]));
    }
    if (elegidas.length < k) {   // temas con pocas preguntas: se completa con el resto del bloque (incluidas las sin tema)
      const ya = new Set(elegidas.map(q => q.id));
      elegidas.push(...baraja(preguntas.filter(q => ok(q) && q.bloque === b.id && !ya.has(q.id)), r).slice(0, k - elegidas.length));
    }
    sel.push(...baraja(elegidas, r).slice(0, k));
  }
  return sel;
}

/* Puntuación por partes: acierto 1, fallo −penalización (1/3), en blanco 0. «directa» = aciertos − fallos × pen.
   «nota» = directa escalada a la nota máxima de la parte (aproximación lineal: la oficial usa una fórmula de transformación
   que publica la Comisión en cada convocatoria). */
function puntua(qs, resp, examen) {
  const pen = examen.penalizacion ?? 1 / 3, parteDe = Object.fromEntries(examen.bloques.map(b => [b.id, b.parte]));
  const tot = {ac: 0, fa: 0, bl: 0}, partes = {}, porTema = {};
  for (const p of examen.partes) partes[p.id] = {ac: 0, fa: 0, bl: 0, n: 0, max: p.max};
  qs.forEach(q => {
    const r = resp[q.id], p = partes[parteDe[q.bloque]] || (partes._ = partes._ || {ac: 0, fa: 0, bl: 0, n: 0, max: 0}), tm = (porTema[q.tema] = porTema[q.tema] || {ac: 0, fa: 0, bl: 0});
    const k = !r ? 'bl' : r === q.correcta ? 'ac' : 'fa';
    tot[k]++; p[k]++; p.n++; tm[k]++;
  });
  const red = x => Math.round(x * 100) / 100;
  for (const id in partes) { const p = partes[id]; p.directa = red(p.ac - p.fa * pen); p.nota = p.n ? red(Math.max(0, p.directa) / p.n * p.max) : null; }
  return {...tot, directa: red(tot.ac - tot.fa * pen), partes, porTema};
}

/* reto diario: misma fecha → mismas 10 preguntas para todo el mundo (por eso se puede comparar y compartir) */
function fechaMadrid(d = new Date()) { return new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Madrid'}).format(d); }
const RETO_INICIO = '2026-11-16';
function numReto(fecha) { return Math.round((Date.parse(fecha + 'T12:00:00Z') - Date.parse(RETO_INICIO + 'T12:00:00Z')) / 864e5) + 1; }
function diasHasta(fechaISO, d = new Date()) { return fechaISO ? Math.max(0, Math.ceil((Date.parse(fechaISO) - d.getTime()) / 864e5)) : null; }
function textoCompartirReto(app, corto, num, marcas, sc, url) {
  const em = marcas.map(m => m === 'ok' ? '🟩' : m === 'ko' ? '🟥' : '⬜').join('');
  return `${app} · ${corto} · Reto #${num}\n${em} ${sc.ac}/${marcas.length}\n${url}`;
}

/* ── generador multiagente: lo que el código puede comprobar sin fiarse de ninguna IA ── */
const palabras = s => new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-zñ0-9]{4,}/g) || []);
function jaccard(a, b) { const A = palabras(a), B = palabras(b); if (!A.size || !B.size) return 0; let i = 0; A.forEach(x => { if (B.has(x)) i++; }); return i / (A.size + B.size - i); }
function revisaFormato(g, {minPal = 6} = {}) {
  const fallos = [];
  const ops = Array.isArray(g.opciones) ? g.opciones.map(o => String(o || '').trim()) : [];
  if (String(g.enunciado || '').trim().split(/\s+/).length < minPal) fallos.push('enunciado demasiado corto');
  if (ops.length !== 4 || ops.some(o => !o)) fallos.push('no tiene 4 opciones');
  if (new Set(ops.map(o => o.toLowerCase())).size !== ops.length) fallos.push('opciones repetidas');
  if (![1, 2, 3, 4].includes(Number(g.correcta))) fallos.push('respuesta correcta fuera de 1-4');
  if (ops.some(o => /todas las (anteriores|opciones)|ninguna de las anteriores/i.test(o))) fallos.push('usa «todas/ninguna de las anteriores»');
  return fallos;
}
function parecidoBanco(g, banco, umbral = 0.6) {
  let mejor = {s: 0, id: null};
  for (const q of banco) { const s = jaccard(g.enunciado + ' ' + (g.opciones || []).join(' '), q.enunciado + ' ' + (q.opciones || []).join(' ')); if (s > mejor.s) mejor = {s, id: q.id}; }
  return mejor.s >= umbral ? mejor : null;
}
function permuta(g, r) { const idx = baraja([0, 1, 2, 3], r); return {opciones: idx.map(i => g.opciones[i]), aOriginal: k => idx[k - 1] + 1}; }
function veredicto(clave, respuestas) {
  const ok = respuestas.filter(x => x === clave).length;
  return ok === respuestas.length ? 'aceptada' : ok === 0 ? 'descartada' : 'dudosa';
}
/* Contexto de exámenes anteriores para el redactor: qué subtemas (palabras clave del tema) han salido, cuántas veces y cuándo.
   «olvidados» = subtemas con ≥2 preguntas ausentes en los últimos ≥3 exámenes-año (heurística, no predicción). */
const sinTildes = s => ' ' + String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ@]+/g, ' ') + ' ';
function temasRecurrentes(preguntas, tema, kws, anioRef, {top = 12, hueco = 3} = {}) {
  const qs = preguntas.filter(q => q.tema === tema && q.anio), cuenta = {};
  const vistos = new Set(), unicas = (kws || []).filter(k => { const c = sinTildes(k).trim(); if (!c || vistos.has(c)) return false; vistos.add(c); return true; });
  const rxs = unicas.map(k => [k, new RegExp('(?<![a-z0-9])' + sinTildes(k).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z0-9])')]);
  for (const q of qs) {
    const tx = sinTildes(q.enunciado + ' ' + (q.opciones || []).join(' '));
    for (const [k, rx] of rxs) if (rx.test(tx)) { const c = (cuenta[k] = cuenta[k] || {tema: k, n: 0, anios: new Set()}); c.n++; c.anios.add(q.anio); }
  }
  const lista = Object.values(cuenta).map(c => ({tema: c.tema, n: c.n, ultimo: Math.max(...c.anios), anios: c.anios.size})).sort((a, b) => b.n - a.n || b.ultimo - a.ultimo);
  return {total: qs.length, frecuentes: lista.slice(0, top), olvidados: lista.filter(c => c.n >= 2 && anioRef - c.ultimo >= hueco).slice(0, 8)};
}
function ejemplosRecientes(preguntas, tema, n, r) {
  const ok = preguntas.filter(q => q.tema === tema && utilizable(q)).sort((a, b) => b.anio - a.anio);
  const recientes = ok.filter(q => q.anio >= (ok[0] || {anio: 0}).anio - 4);
  return baraja(recientes.length >= n ? recientes : ok, r).slice(0, n);
}

/* GIFT (formato de preguntas de Moodle) */
const giftEsc = s => String(s).replace(/([~=#{}:\\])/g, '\\$1');
function aGIFT(qs, app = 'OraculoOposiciones') { return qs.map((q, i) => `::${app} ${i + 1}::${giftEsc(q.enunciado)} {\n${q.opciones.map((o, k) => `${k + 1 === q.correcta ? '=' : '~'}${giftEsc(o)}`).join('\n')}\n}`).join('\n\n') + '\n'; }

if (typeof module !== 'undefined') module.exports = {rng, baraja, sinTema, conteosBloque, aniosDe, cuotas, predice, valida, prediceTodo, reparto, nPorBloque, simulacro, puntua, utilizable, fechaMadrid, numReto, diasHasta, textoCompartirReto, jaccard, revisaFormato, parecidoBanco, permuta, veredicto, aGIFT, temasRecurrentes, ejemplosRecientes};
