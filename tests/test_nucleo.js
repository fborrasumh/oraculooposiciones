/* Pruebas de la lógica pura (node tests/test_nucleo.js) */
const N = require('../src/nucleo.js');
const cfg = require('../data/auxiliar-age/config.json');
let fallos = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✕ ') + m); if (!c) fallos++; };

/* banco sintético: 6 exámenes; en el Bloque I el tema 11 crece y el 6 aparece desde 2022 */
const r = N.rng('test'), banco = [];
const anios = [2016, 2017, 2019, 2022, 2023, 2024];
let id = 0;
for (const y of anios) {
  const b1 = {'b1-01': 4, 'b1-11': 4 + (y - 2016) * 0.5 | 0, 'b1-03': 3, 'b1-06': y >= 2022 ? 2 : 0};
  let resto = 30 - Object.values(b1).reduce((a, v) => a + v, 0);
  const otros = ['b1-02', 'b1-04', 'b1-05', 'b1-08', 'b1-09', 'b1-10', 'b1-12', 'b1-13', 'b1-14', 'b1-15', 'b1-16', 'b1-07'];
  for (let i = 0; resto > 0; i++, resto--) b1[otros[i % otros.length]] = (b1[otros[i % otros.length]] || 0) + 1;
  const reparto = {b1, psico: {'psico-admin': 10, 'psico-num': 12, 'psico-verbal': 8}, b2: {'b2-09': 10, 'b2-08': 9, 'b2-10': 7, 'b2-11': 5, 'b2-05': 5, 'b2-06': 3, 'b2-07': 3, 'b2-12': 3, 'b2-03': 2, 'b2-04': 2, 'b2-01': 1}};
  for (const bl in reparto) for (const tm in reparto[bl]) for (let k = 0; k < reparto[bl][tm]; k++) {
    id++; banco.push({id: 'q' + id, anio: y, bloque: bl, tema: tm, reserva: false, enunciado: `Pregunta ${id} del tema ${tm} sobre la norma correspondiente del examen`, opciones: ['a' + id, 'b' + id, 'c' + id, 'd' + id], correcta: 1 + (id % 4), anulada: false, imagen: false});
  }
  banco.push({id: 'res' + y, anio: y, bloque: 'b1', tema: 'b1-16', reserva: true, enunciado: 'reserva', opciones: ['1', '2', '3', '4'], correcta: 1});
  banco.push({id: 'sin' + y, anio: y, bloque: 'b2', tema: 'b2-otros', reserva: false, enunciado: 'sin tema', opciones: ['1', '2', '3', '4'], correcta: 1});
}
const c1 = N.conteosBloque(banco, 'b1');
ok(Object.values(c1[2024]).reduce((a, v) => a + v, 0) === 30, 'conteos: 30 por examen en el Bloque I, sin reserva');
ok(!Object.values(N.conteosBloque(banco, 'b2')).some(y => y['b2-otros']), 'conteos: las preguntas sin tema no cuentan');
const P = N.prediceTodo(banco, cfg.examen);
const suma = b => P[b].filas.reduce((a, f) => a + f.n, 0);
ok(Math.abs(suma('b1') - 30) < 1e-9 && Math.abs(suma('psico') - 30) < 1e-9 && Math.abs(suma('b2') - 50) < 1e-9, 'predicción: suma 30 / 30 / 50 por bloque');
ok(P.b1.obj === 2025, 'predicción: objetivo = examen siguiente al último del banco');
const f11 = P.b1.filas.find(f => f.id === 'b1-11');
ok(f11.tend === 'sube' && f11.n > 6, `predicción: el tema que crece sale con tendencia al alza (${f11.n.toFixed(1)}, ${f11.tend})`);
ok(P.b1.filas.find(f => f.id === 'b1-06').veces === 3, 'predicción: tema nuevo cuenta las veces que ha salido');
ok(P.b1.filas.every(f => f.lo <= Math.round(f.n) && f.hi >= Math.round(f.n) && f.prob >= 0 && f.prob <= 1), 'predicción: intervalo y probabilidad coherentes');
ok(P.b2.val && P.b2.val.porAnio.length === 3, 'validación a ciegas: 3 exámenes probados por bloque');
ok(JSON.stringify(N.prediceTodo(banco, cfg.examen).b1.filas) === JSON.stringify(P.b1.filas), 'predicción determinista');

const npb = N.nPorBloque(cfg.examen, 110);
ok(npb.b1 === 30 && npb.psico === 30 && npb.b2 === 50, 'simulacro completo: 30 + 30 + 50');
const s10 = N.nPorBloque(cfg.examen, 10);
ok(s10.b1 + s10.psico + s10.b2 === 10 && s10.b2 >= 4, `simulacro corto: reparto proporcional (${JSON.stringify(s10)})`);
const sim = N.simulacro(banco, P, cfg.examen, 110, 'semilla-1');
ok(sim.length === 110 && new Set(sim.map(q => q.id)).size === 110, 'simulacro: 110 preguntas distintas');
ok(sim.slice(0, 30).every(q => q.bloque === 'b1') && sim.slice(30, 60).every(q => q.bloque === 'psico') && sim.slice(60).every(q => q.bloque === 'b2'), 'simulacro: bloques en el orden del examen real');
ok(!sim.some(q => q.reserva && false) && JSON.stringify(N.simulacro(banco, P, cfg.examen, 110, 'semilla-1').map(q => q.id)) === JSON.stringify(sim.map(q => q.id)), 'simulacro: misma semilla → mismo examen');
const s2 = N.simulacro(banco, P, cfg.examen, 50, 'x', {bloques: ['b2']});
ok(s2.length === 50 && s2.every(q => q.bloque === 'b2'), 'simulacro: solo la segunda parte');
const st = N.simulacro(banco, P, cfg.examen, 25, 'x', {tema: 'b2-09'});
ok(st.length === 25 && st.every(q => q.tema === 'b2-09'), 'simulacro: un solo tema');
ok(N.simulacro(banco, P, cfg.examen, 30, 'x', {bloques: ['b1'], desde: 2023}).every(q => q.anio >= 2023), 'simulacro: filtro por año');
ok(!N.utilizable({correcta: 2, opciones: ['a', 'b', 'c', 'd'], imagen: true}) && !N.utilizable({correcta: null, opciones: ['a', 'b', 'c', 'd']}), 'utilizable: fuera las de imagen y sin respuesta');

/* puntuación: 1.ª parte 60 preguntas: 45 aciertos, 9 fallos, 6 en blanco → directa 42 → nota 42/60·50 = 35 */
const qs = [], resp = {};
for (let i = 0; i < 60; i++) { const q = {id: 'p' + i, bloque: i < 30 ? 'b1' : 'psico', tema: 'x', correcta: 1}; qs.push(q); if (i < 45) resp[q.id] = 1; else if (i < 54) resp[q.id] = 2; }
const p = N.puntua(qs, resp, cfg.examen);
ok(p.partes.p1.ac === 45 && p.partes.p1.fa === 9 && p.partes.p1.bl === 6, 'puntuación: aciertos, fallos y blancos de la 1.ª parte');
ok(p.partes.p1.directa === 42 && p.partes.p1.nota === 35, `puntuación: directa 45 − 9/3 = 42 y nota ${p.partes.p1.nota} sobre 50`);
ok(p.partes.p2.n === 0 && p.partes.p2.nota === null, 'puntuación: parte sin preguntas → sin nota');

ok(N.numReto('2026-11-16') === 1 && N.numReto('2026-11-17') === 2, 'reto: numeración diaria');
ok(N.textoCompartirReto('OráculoOposiciones', 'Auxiliar AGE', 3, ['ok', 'ko', 'bl'], {ac: 1}, 'https://x').includes('🟩🟥⬜ 1/3'), 'reto: texto para compartir con emojis');
ok(N.diasHasta(null) === null, 'cuenta atrás: sin fecha no se inventa');

ok(N.revisaFormato({enunciado: 'Según la Ley 39/2015, ¿cuál es el plazo máximo para resolver?', opciones: ['a', 'b', 'c', 'd'], correcta: 2}).length === 0, 'generador: formato correcto');
ok(N.revisaFormato({enunciado: 'Corta', opciones: ['a', 'a', 'Todas las anteriores', ''], correcta: 7}).length === 5, 'generador: detecta los 5 fallos de formato');
ok(N.parecidoBanco({enunciado: banco[0].enunciado, opciones: banco[0].opciones}, banco) !== null, 'generador: detecta copia del banco');
ok(N.veredicto(2, [2, 2]) === 'aceptada' && N.veredicto(2, [2, 3]) === 'dudosa' && N.veredicto(2, [1, 3]) === 'descartada', 'generador: veredicto de los resolutores');
const pm = N.permuta({opciones: ['A', 'B', 'C', 'D']}, N.rng(5));
ok([1, 2, 3, 4].every(k => ['A', 'B', 'C', 'D'][pm.aOriginal(k) - 1] === pm.opciones[k - 1]), 'generador: la permutación se deshace bien');
const tr = N.temasRecurrentes([{tema: 'b1-11', anio: 2016, enunciado: 'El recurso de alzada se interpone…', opciones: []}, {tema: 'b1-11', anio: 2017, enunciado: 'Plazo del recurso de alzada', opciones: []}], 'b1-11', ['recurso de alzada', 'silencio administrativo'], 2024);
ok(tr.frecuentes[0].tema === 'recurso de alzada' && tr.olvidados.length === 1, 'generador: subtemas frecuentes y olvidados');
ok(N.aGIFT([{enunciado: '¿2+2?', opciones: ['3', '4', '5', '6'], correcta: 2}]).includes('=4'), 'exportación GIFT');

console.log(fallos ? `\n${fallos} pruebas fallan` : '\nTodas las pruebas pasan');
process.exit(fallos ? 1 : 0);
