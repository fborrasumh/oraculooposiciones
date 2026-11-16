/* ══ OráculoOposiciones · interfaz. La lógica pura está en nucleo.js (probada en Node) y los datos en datos.js ══ */
const STEPS = ['Inicio', 'Predicción', 'Simulacro', 'Generador IA'];
const HUBS = ['Reto diario'];
const NAV = [['Ver la predicción', 'Todo funciona sin clave, salvo el generador de preguntas nuevas.'], ['Siguiente: simulacro', 'Pulsa «Practicar» en un tema para un simulacro solo de él.'], ['Siguiente: generador IA', 'Elige qué practicar y empieza; puedes dejar el simulacro y volver.'], ['Volver al inicio', 'Descarga las preguntas aceptadas en Word, CSV o Moodle (GIFT).']];
const RENDER = {0: pintaInicio, 1: pintaPred, 2: pintaSim, 3: pintaGen, 4: pintaReto};
const GLOS = [
  ['¿De dónde salen las preguntas?', 'De los cuadernillos de examen y las plantillas de respuestas que publica el organismo convocante (para Auxiliar Administrativo del Estado, la sede electrónica del INAP). Un proceso automático del repositorio los descarga, extrae el texto y lee la respuesta de cada pregunta. Si la plantilla de un examen es la provisional, se indica en cada pregunta. Las anuladas y las que dependen de una tabla o una imagen no entran en los simulacros.'],
  ['¿Cómo se asigna el bloque y el tema?', 'El bloque lo decide la estructura de la convocatoria: en Auxiliar Administrativo del Estado, las 30 primeras preguntas de la primera parte son del Bloque I, las 30 siguientes son psicotécnicas y la segunda parte es del Bloque II. El tema lo asigna una IA o, si no hay, unas palabras clave por tema. Es automático y se equivoca a veces; la parte sin tema se indica en la portada.'],
  ['¿Cómo se predice?', 'Dentro de cada bloque se calcula qué parte de sus preguntas ha tenido cada tema en cada examen. Los exámenes recientes pesan más (semivida de 3 años) y se añade la mitad de la tendencia. El resultado se escala al número de preguntas del bloque. El intervalo del 80 % combina lo que varía de un examen a otro y el azar propio de un recuento. «Probabilidad de que salga» es la probabilidad de al menos una pregunta del tema si el reparto fuera ese.'],
  ['¿Cuánto fiarse?', 'En cada bloque el método se prueba a ciegas: se esconde un examen, se predice con los anteriores y se compara con lo que salió, en los tres últimos. Se compara con dos referencias sencillas: repetir el examen anterior y la media de todos. Si no las mejora, la app lo dice y conviene usar el resultado solo como orden de prioridad.'],
  ['El temario cambia', 'Los programas se modifican entre convocatorias: entran temas nuevos (Gobierno abierto, protección de datos, igualdad y LGTBI) y cambian las versiones de Windows y Office. Un tema reciente tiene pocos exámenes detrás, así que su estimación es menos segura; la tabla indica en cuántos exámenes ha salido. En los simulacros puedes limitarte a los exámenes recientes.'],
  ['¿Predice preguntas concretas?', 'No. Predice cuántas preguntas tendrá cada tema. El simulacro usa preguntas oficiales de años anteriores en esa proporción: sirve para entrenar el formato y el ritmo, no para adivinar el examen. Las preguntas antiguas pueden haber quedado desfasadas por cambios en las leyes.'],
  ['Generador con agentes', 'Un agente redacta, con el contexto de exámenes anteriores (subtemas que más se repiten, subtemas que llevan tiempo sin salir y seis preguntas oficiales recientes), dos agentes resuelven a ciegas con las opciones barajadas y el código comprueba el formato y que no sea una copia del banco oficial. Solo se aceptan las preguntas que los tres responden igual. Eso reduce mucho los errores, pero no los elimina. Si tienes claves de dos proveedores, usa el otro para el segundo resolutor.'],
  ['Privacidad y coste', 'La predicción, los simulacros y el reto diario funcionan en tu navegador, sin clave y sin enviar nada. El generador envía al proveedor de IA que elijas el tema y unas preguntas oficiales de ejemplo; nunca datos tuyos. Cada tanda son tres llamadas a la IA y la pagas tú con tu clave: elige un modelo económico.'],
  ['Puntuación', 'Como en el examen: cada acierto vale 1 y cada fallo resta un tercio; en blanco, 0. La puntuación directa de cada parte se pasa a una nota sobre 50 de forma proporcional. Es una aproximación: la nota oficial usa una fórmula de transformación y unos mínimos que fija la Comisión Permanente de Selección en cada convocatoria.']
];
let S = {op: null, sim: null, reto: null, racha: {}, gen: [], genStats: null, modoSim: 'probable'};
let ENVIO_OK = false, PRED = {}, relojT = null;
const BASE_URL = () => location.origin + location.pathname;
const pct = x => Math.round(x * 100) + ' %';
const EX = () => DATA.cfg.examen;
const nExamen = () => EX().bloques.reduce((a, b) => a + b.n, 0);
const segPorPregunta = () => EX().minutos * 60 / nExamen();

/* ── cálculo una vez cargados los datos ── */
function calcula() { PRED = prediceTodo(DATA.recuentos, EX()); }
const preg = id => DATA.preguntas.find(q => q.id === id);
const origenDe = q => q.demo ? t('Pregunta de ejemplo (no oficial)') : t('Examen {0} · pregunta {1}', q.anio, q.n) + (q.plantilla === 'provisional' ? ' · ' + t('respuesta de la plantilla provisional') : '');
const objetivo = () => (Object.values(PRED)[0] || {}).obj;

/* ── compartir: menú nativo del móvil; si no hay, se copia al portapapeles ── */
async function comparte(texto, url) {
  try { if (navigator.share) { await navigator.share({text: texto, url}); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(texto + (url && !texto.includes(url) ? '\n' + url : '')); toast(t('Copiado: pégalo en WhatsApp, Instagram o donde quieras')); }
  catch { toast(t('No se pudo copiar. Copia el enlace de la barra del navegador.')); }
}
const enlaceWA = texto => 'https://wa.me/?text=' + encodeURIComponent(texto);
const enlaceOp = (extra = '') => `${BASE_URL()}?op=${encodeURIComponent(DATA.op)}${extra}`;

/* ── cambiar de oposición ── */
async function eligeOp(id) {
  if (!opActiva(id)) return toast(t('Esta oposición llegará próximamente'));
  if (DATA && DATA.op === id) return;
  S.op = id; S.sim = null; S.reto = null; S.gen = []; S.genStats = null; S.modoSim = 'probable'; guarda();
  await cargaDatos(id); calcula(); pintaChip();
  try { history.replaceState(null, '', '?op=' + encodeURIComponent(id)); } catch { }
  RENDER[step]();
}
function pintaChip() { $('opChip').innerHTML = `${esc(DATA.cfg.corto)} <svg class="i"><use href="#i-down"/></svg>`; }
$('opChip').onclick = () => { go(0); setTimeout(() => $('oposGrid').scrollIntoView({behavior: 'smooth', block: 'center'}), 50); };

/* ── 0 · inicio ── */
function pintaInicio() {
  $('oposGrid').innerHTML = OPOS.map(o => {
    const act = !!opActiva(o.id), sel = DATA.op === o.id;
    return `<button type="button" class="oo-op ${sel ? 'sel' : ''}" data-op="${esc(o.id)}" ${act ? '' : 'aria-disabled="true"'}><b>${esc(t(o.nombre))}</b><small>${esc(t(o.organismo))}${o.grupo && o.grupo !== '—' ? ' · ' + esc(o.grupo) : ''}</small><span class="fa-chip ${act ? 'ok' : ''}">${esc(act ? (sel ? t('Seleccionada') : t('Disponible')) : t('Próximamente'))}</span></button>`;
  }).join('');
  const qs = DATA.preguntas, ys = [...new Set(qs.map(q => q.anio))].sort(), sc = qs.filter(q => sinTema(q.tema)).length, prov = DATA.examenes.filter(e => e.plantilla_tipo === 'provisional').map(e => e.anio);
  $('estadoDatos').innerHTML = DATA.real
    ? `<div class="okbox">${esc(t('Banco oficial de {0}: {1} preguntas de {2} exámenes ({3}–{4}). {5} se pueden usar en simulacros (con respuesta, sin tabla ni imagen y no anuladas).', t(DATA.cfg.nombre), nf(qs.length), ys.length, ys[0], ys.at(-1), nf(qs.filter(utilizable).length)))} ${esc(t('Tema asignado con IA: {0}; por palabras clave: el resto. Sin tema: {1}.', pct(qs.filter(q => q.metodo === 'ia').length / Math.max(1, qs.length)), pct(sc / Math.max(1, qs.length))))}${prov.length ? ' ' + esc(t('Exámenes con plantilla provisional: {0}.', prov.join(', '))) : ''}</div>`
    : `<div class="aviso"><b>${esc(t('Modo demostración.'))}</b> ${esc(t('Aún no se han cargado los exámenes oficiales: los recuentos son ficticios y las {0} preguntas son ejemplos escritos para la demo. Los datos reales los trae el flujo «Datos» del repositorio.', DATA.preguntas.length))}</div>`;
  const c = DATA.cfg, e = c.examen;
  $('estrTit').textContent = t('Así es el examen de {0}', t(c.nombre));
  $('estructura').innerHTML = `<div class="oo-estr">${e.partes.map(p => `<div class="oo-parte"><h4>${esc(t(p.nombre))} <small>${esc(t('sobre {0} puntos', p.max))}</small></h4>${e.bloques.filter(b => b.parte === p.id).map(b => `<div class="oo-bl" style="--c:${b.color}"><b>${b.n}</b><span>${esc(t(b.nombre))}<small>${esc(t('{0} temas', c.temas.filter(x => x.bloque === b.id).length))}</small></span></div>`).join('')}<p class="help">${esc(t(p.minimo_txt))}</p></div>`).join('')}</div>
    <p>${esc(t('{0} preguntas en {1} minutos. Cada fallo resta un tercio de un acierto; en blanco no resta.', nExamen(), e.minutos))} <a href="${esc(c.convocatoria.url)}" target="_blank" rel="noopener">${esc(t('Convocatoria {0}', c.convocatoria.ref))}</a> · ${esc(t(c.convocatoria.plazas))}.</p>
    <p class="help">${esc(c.proximo.fecha ? t('Próximo examen: {0}.', c.proximo.fecha) : t('{0}: fecha del examen sin publicar todavía.', t(c.proximo.etiqueta)))}</p>`;
  const r = S.racha[DATA.op];
  $('inicioProj').innerHTML = (S.sim && !S.sim.fin ? `${esc(t('Tienes un simulacro a medias.'))} <button class="btn btn-ghost btn-sm" id="btnCont" type="button">${esc(t('Seguir'))}</button> ` : '') + (r && r.n ? `🔥 ${esc(t('racha de {0} días', r.n))}` : '');
}
$('btnStart').onclick = () => go(1);
$('btnEjemplo').onclick = () => go(4);
document.addEventListener('click', e => {
  if (e.target.id === 'btnCont') go(2);
  const b = e.target.closest('[data-op]'); if (b && b.closest('#oposGrid')) eligeOp(b.dataset.op);
});

/* ── 1 · predicción ── */
function confianzaHTML(v) {
  if (!v) return `<p class="help">${esc(t('Hacen falta al menos cuatro exámenes para probar el método a ciegas.'))}</p>`;
  return `<p><span class="fa-chip ${v.nivel === 'alta' ? 'ok' : v.nivel === 'media' ? 'aviso' : 'error'}">${esc(t(v.nivel === 'alta' ? 'Fiabilidad alta' : v.nivel === 'media' ? 'Fiabilidad media' : 'Fiabilidad baja'))}</span> ${esc(t('Probado a ciegas en los exámenes {0}: se desvió de media {1} preguntas por tema. Repetir el examen anterior se desviaba {2} y la media de todos, {3}. De los {4} temas que puso arriba, {5} estaban de verdad entre los {4} con más preguntas.', v.porAnio.map(o => o.anio).join(', '), v.mae.toFixed(2), v.maeAnterior.toFixed(2), v.maeMedia.toFixed(2), v.kTop, v.aciertoTop.toFixed(1)))}</p>
    <p class="help">${esc(t(v.nivel === 'alta' ? 'El reparto por temas es bastante estable: úsalo para repartir tus horas.' : v.nivel === 'media' ? 'Mejora poco a las referencias sencillas: tómalo como orientación.' : 'No mejora a las referencias sencillas: úsalo solo como orden de prioridad y no dejes ningún tema sin estudiar.'))}</p>`;
}
function pintaPred() {
  $('predTit').textContent = t('Predicción · {0} · examen de {1}', t(DATA.cfg.corto), objetivo() ?? '—');
  const fl = {sube: '↑', baja: '↓', estable: '→'};
  $('predBloques').innerHTML = (DATA.real ? '' : `<div class="aviso">${esc(t('Datos de demostración ficticios: las tablas muestran cómo funciona, no la predicción real.'))}</div>`) + EX().bloques.map(b => {
    const P = PRED[b.id] || {filas: []}, max = Math.max(1, ...P.filas.map(f => f.hi));
    return `<div class="card oo-bloque" style="--c:${b.color}"><h3><span class="oo-dot"></span>${esc(t(b.nombre))} <small class="muted">· ${esc(t('{0} preguntas', b.n))}</small></h3>${confianzaHTML(P.val)}
    <div class="table-wrap"><table class="om-tabla"><thead><tr><th>#</th><th>${esc(t('Tema'))}</th><th>${esc(t('Esperadas'))}</th><th>${esc(t('Intervalo 80 %'))}</th><th>${esc(t('Probabilidad de que salga'))}</th><th>${esc(t('Tendencia'))}</th><th>${esc(t('Últimos exámenes'))}</th><th></th></tr></thead><tbody>${P.filas.map((f, i) => `<tr>
      <td>${i + 1}</td><td><small class="muted">${esc(etiquetaTema(f.id))}</small><br><b>${esc(nombreTema(f.id))}</b><br><small class="muted">${esc(t('ha salido en {0} de {1} exámenes', f.veces, P.anios.length))}${f.ultimaVez && f.ultimaVez < P.anios.at(-1) ? ' · ' + esc(t('última vez en {0}', f.ultimaVez)) : ''}</small></td>
      <td><div class="om-bar${f.n / max < 0.25 ? ' corto' : ''}" role="img" style="--w:${(f.n / max * 100).toFixed(1)}%" aria-label="${esc(t('{0} preguntas esperadas', f.n.toFixed(1)))}"><span style="width:${(f.n / max * 100).toFixed(1)}%"></span><em>${f.n.toFixed(1)}</em></div></td>
      <td>${f.lo}–${f.hi}</td><td>${pct(f.prob)}</td><td title="${esc(t(f.tend))}">${fl[f.tend]} <small>${esc(t(f.tend))}</small></td>
      <td><small>${f.ult.map(u => `${u.anio}: ${u.n}`).join(' · ')}</small></td>
      <td><button class="btn btn-ghost btn-sm" type="button" data-practica="${esc(f.id)}">${esc(t('Practicar'))}</button></td></tr>`).join('')}</tbody></table></div></div>`;
  }).join('');
  const ys = Object.values(PRED)[0] ? Object.values(PRED)[0].anios : [];
  $('notaPred').textContent = t('Calculado con los exámenes {0}–{1}. Las preguntas de reserva y las que no tienen tema asignado no se reparten.', ys[0] ?? '–', ys.at(-1) ?? '–');
}
document.addEventListener('click', e => { const b = e.target.closest('[data-practica]'); if (b) { S.modoSim = 'tema:' + b.dataset.practica; guarda(); go(2); } });
$('btnCsvPred').onclick = () => dl(`oraculo_${DATA.op}_prediccion.csv`, csvDe([t('bloque'), t('tema'), t('esperadas'), t('minimo_80'), t('maximo_80'), t('probabilidad'), t('tendencia'), t('examenes_con_preguntas')], EX().bloques.flatMap(b => (PRED[b.id].filas || []).map(f => [t(b.nombre), nombreTema(f.id), f.n.toFixed(2), f.lo, f.hi, f.prob.toFixed(2), t(f.tend), f.veces]))), 'text/csv;charset=utf-8');
/* imagen para redes (1080×1350): los temas con más peso de cada bloque */
function lienzoPred() {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#0F2237'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#FFB38A'; g.font = '700 34px system-ui, sans-serif'; g.fillText('OráculoOposiciones', 70, 100);
  g.fillStyle = '#fff'; g.font = '800 58px system-ui, sans-serif'; g.fillText(t(DATA.cfg.corto) + ': ' + t('lo que más pesa'), 70, 185);
  g.fillStyle = '#C3D3E2'; g.font = '400 28px system-ui, sans-serif'; g.fillText(t('Preguntas esperadas por tema en el próximo examen'), 70, 232);
  let y = 300;
  for (const b of EX().bloques) {
    const top = (PRED[b.id].filas || []).slice(0, 3), max = Math.max(1, ...top.map(f => f.n));
    g.fillStyle = b.color; g.font = '700 30px system-ui, sans-serif'; g.fillText(t(b.nombre).slice(0, 48) + ` (${b.n})`, 70, y); y += 52;
    top.forEach(f => {
      g.fillStyle = '#fff'; g.font = '500 26px system-ui, sans-serif'; g.fillText(nombreTema(f.id).slice(0, 58), 70, y);
      g.fillStyle = '#1F3A56'; g.fillRect(70, y + 12, 760, 22); g.fillStyle = b.color; g.fillRect(70, y + 12, 760 * f.n / max, 22);
      g.fillStyle = '#fff'; g.font = '800 30px system-ui, sans-serif'; g.fillText(f.n.toFixed(1), 860, y + 33); y += 74;
    });
    y += 22;
  }
  g.fillStyle = '#9DB6CD'; g.font = '400 26px system-ui, sans-serif';
  g.fillText(DATA.real ? t('Estimación estadística, no una filtración. Pruébala gratis:') : t('DEMO con datos ficticios'), 70, H - 110);
  g.fillStyle = '#7FD6C4'; g.font = '700 28px system-ui, sans-serif'; g.fillText(enlaceOp().replace(/^https?:\/\//, '').slice(0, 64), 70, H - 64);
  return c;
}
$('btnCompartePred').onclick = () => {
  if (!Object.keys(PRED).length) return toast(t('Aún no hay predicción'));
  lienzoPred().toBlob(async b => {
    const f = new File([b], `oraculo_${DATA.op}.png`, {type: 'image/png'}), top = (PRED[EX().bloques[0].id].filas || []).slice(0, 2).map(x => nombreTema(x.id)).join(' · ');
    const txt = t('Según OráculoOposiciones, en {0} lo que más pesa del {1} es: {2}. ¿Y tú qué llevas peor?', t(DATA.cfg.corto), t(EX().bloques[0].nombre), top);
    try { if (navigator.canShare && navigator.canShare({files: [f]})) { await navigator.share({files: [f], text: txt, url: enlaceOp()}); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    dl(`oraculo_${DATA.op}.png`, b); toast(t('Imagen descargada: compártela en tus redes'));
  }, 'image/png');
};

/* ── examen (simulacro y reto): una pregunta por pantalla, con rejilla para saltar ── */
function pintaPregunta(box, ex, modo) {
  const ids = ex.qs, i = Math.min(ex.idx || 0, ids.length - 1), q = preg(ids[i]);
  if (!q) { box.innerHTML = `<p class="empty">${esc(t('No se encontró la pregunta.'))}</p>`; return; }
  const r = ex.resp[q.id], ver = ex.fin || (modo === 'reto' && r);
  const rejilla = ids.map((id, k) => { const rr = ex.resp[id], qq = preg(id), est = !rr ? '' : (ex.fin || modo === 'reto') ? (qq && rr === qq.correcta ? 'ok' : 'ko') : 'resp'; return `<button type="button" class="om-cel ${est} ${k === i ? 'act' : ''}" data-ir="${k}" aria-label="${esc(t('Pregunta {0}', k + 1))}">${k + 1}</button>`; }).join('');
  const L = 'abcd';
  box.innerHTML = `<div class="card om-preg">
    <div class="om-cab"><span class="fa-chip">${esc(t('Pregunta {0} de {1}', i + 1, ids.length))}</span><span class="fa-chip" style="background:${bloqueDe(q.bloque).color}22">${esc(t(bloqueDe(q.bloque).nombre))}</span><span class="fa-chip">${esc(etiquetaTema(q.tema))}</span>${!q.demo && q.anio ? `<span class="fa-chip">${esc(t('Examen {0}', q.anio))}</span>` : ''}${modo === 'sim' && !ex.fin && ex.limite ? `<span class="fa-chip aviso" id="reloj"></span>` : ''}</div>
    <p class="om-enun">${esc(q.enunciado)}</p>
    <div class="om-ops" role="radiogroup" aria-label="${esc(t('Opciones'))}">${q.opciones.map((o, k) => {
      const n = k + 1, cls = ver ? (n === q.correcta ? 'ok' : n === r ? 'ko' : '') : (n === r ? 'sel' : '');
      return `<button type="button" role="radio" aria-checked="${n === r}" class="om-op ${cls}" data-op="${n}" ${ver ? 'disabled' : ''}><b>${L[k]}</b><span>${esc(o)}</span></button>`; }).join('')}</div>
    ${ver ? `<p class="help">${esc(origenDe(q))}${r ? '' : ' · ' + esc(t('en blanco'))}. ${esc(t('Respuesta correcta: {0}.', L[q.correcta - 1]))} ${esc(nombreTema(q.tema))}.</p>` : ''}
    <div class="actions"><button class="btn btn-ghost btn-sm" type="button" data-mov="-1" ${i === 0 ? 'disabled' : ''}>${ico('left')} ${esc(t('Anterior'))}</button>
      ${!ver && r && modo === 'sim' ? `<button class="btn btn-ghost btn-sm" type="button" data-blanco="1">${esc(t('Dejar en blanco'))}</button>` : ''}
      <button class="btn btn-ghost btn-sm" type="button" data-mov="1" ${i === ids.length - 1 ? 'disabled' : ''}>${esc(t('Siguiente'))} ${ico('right')}</button>
      ${!ex.fin && modo === 'sim' ? `<button class="btn btn-primary btn-sm" type="button" data-fin="1">${esc(t('Terminar y corregir'))}</button>` : ''}</div>
    <div class="om-rejilla">${rejilla}</div></div>`;
  box.onclick = ev => {
    const b = ev.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.op) { ex.resp[q.id] = +b.dataset.op; if (modo === 'reto') { if (Object.keys(ex.resp).length === ids.length) cierraReto(); } else if (i < ids.length - 1) ex.idx = i + 1; guarda(); return RENDER[step](); }
    if (b.dataset.blanco) { delete ex.resp[q.id]; guarda(); return RENDER[step](); }
    if (b.dataset.mov) { ex.idx = Math.max(0, Math.min(ids.length - 1, i + +b.dataset.mov)); guarda(); return RENDER[step](); }
    if (b.dataset.ir) { ex.idx = +b.dataset.ir; guarda(); return RENDER[step](); }
    if (b.dataset.fin) { const bl = ids.length - Object.keys(ex.resp).length; if (bl && !b.dataset.ok) { b.dataset.ok = 1; b.textContent = t('Quedan {0} en blanco. Pulsa otra vez para corregir', bl); return; } terminaSim(); }
  };
}
function resumenHTML(qs, ex) {
  const p = puntua(qs, ex.resp, EX());
  const partes = EX().partes.filter(x => p.partes[x.id] && p.partes[x.id].n);
  const temas = Object.entries(p.porTema).sort((a, b) => (b[1].ac + b[1].fa + b[1].bl) - (a[1].ac + a[1].fa + a[1].bl));
  return {p, html: `<div class="om-marcador"><div><b>${p.ac}</b><span>${esc(t('aciertos'))}</span></div><div><b>${p.fa}</b><span>${esc(t('fallos'))}</span></div><div><b>${p.bl}</b><span>${esc(t('en blanco'))}</span></div><div><b>${p.directa}</b><span>${esc(t('puntuación directa'))}</span></div>${partes.map(x => `<div><b>${p.partes[x.id].nota}</b><span>${esc(t('{0}: nota aprox. sobre {1}', t(x.nombre), x.max))}</span></div>`).join('')}</div>
    <p class="help">${esc(t('Directa = aciertos − fallos ÷ 3. La nota sobre 50 es proporcional y aproximada: la oficial usa la fórmula y los mínimos que publica la Comisión en cada convocatoria.'))}</p>
    <div class="table-wrap"><table><thead><tr><th>${esc(t('Tema'))}</th><th>${esc(t('aciertos'))}</th><th>${esc(t('fallos'))}</th><th>${esc(t('en blanco'))}</th></tr></thead><tbody>${temas.map(([id, a]) => `<tr><td><small class="muted">${esc(etiquetaTema(id))}</small> ${esc(nombreTema(id))}</td><td>${a.ac}</td><td>${a.fa}</td><td>${a.bl}</td></tr>`).join('')}</tbody></table></div>`};
}

/* ── 2 · simulacro ── */
/* modos: «probable» (examen entero), «parte:p1», «bloque:b2», «tema:b1-11» */
function filtroDe(modo) {
  if (modo.startsWith('parte:')) { const p = EX().partes.find(x => x.id === modo.slice(6)); return {bloques: p ? p.bloques : null}; }
  if (modo.startsWith('bloque:')) return {bloques: [modo.slice(7)]};
  if (modo.startsWith('tema:')) return {tema: modo.slice(5)};
  return {};
}
function nCompleto(modo) {
  const f = filtroDe(modo);
  if (f.tema) return 30;
  return EX().bloques.filter(b => !f.bloques || f.bloques.includes(b.id)).reduce((a, b) => a + b.n, 0);
}
function opcionesModo() {
  const e = EX(), sel = $('simModo'), v = S.modoSim;
  sel.innerHTML = `<option value="probable">${esc(t('Examen completo probable ({0} preguntas)', nExamen()))}</option>`
    + `<optgroup label="${esc(t('Por partes'))}">${e.partes.map(p => `<option value="parte:${p.id}">${esc(t(p.nombre))} (${nCompleto('parte:' + p.id)})</option>`).join('')}</optgroup>`
    + `<optgroup label="${esc(t('Por bloques'))}">${e.bloques.map(b => `<option value="bloque:${b.id}">${esc(t(b.nombre))} (${b.n})</option>`).join('')}</optgroup>`
    + e.bloques.map(b => `<optgroup label="${esc(t(b.nombre))}">${DATA.cfg.temas.filter(x => x.bloque === b.id).map(x => `<option value="tema:${x.id}">${esc(etiquetaTema(x.id))} · ${esc(t(x.nombre)).slice(0, 80)}</option>`).join('')}</optgroup>`).join('');
  sel.value = [...sel.options].some(o => o.value === v) ? v : 'probable';
}
function pintaSim() {
  opcionesModo();
  $('simLede').textContent = t('Preguntas oficiales de exámenes anteriores, elegidas en la proporción que predice el modelo y en el orden del examen real. Puntuación como en {0}: acierto +1, fallo −1/3, en blanco 0.', t(DATA.cfg.corto));
  $('optRitmo').textContent = t('Ritmo del examen (≈ {0} s por pregunta)', Math.round(segPorPregunta()));
  const disp = DATA.preguntas.filter(utilizable).length;
  $('simInfo').textContent = t('Hay {0} preguntas disponibles para simulacros.', nf(disp)) + (DATA.real ? '' : ' ' + t('En la demostración solo hay {0} preguntas de ejemplo.', disp));
  clearInterval(relojT);
  const ex = S.sim, box = $('simExamen');
  if (!ex) { box.innerHTML = ''; return; }
  const qs = ex.qs.map(preg).filter(Boolean);
  if (!qs.length) { S.sim = null; box.innerHTML = ''; return; }
  if (ex.fin) {
    const {p, html} = resumenHTML(qs, ex), url = enlaceSim(ex);
    const txt = t('He sacado una directa de {0} sobre {1} en un simulacro de {2} en OráculoOposiciones. ¿Me superas con el mismo examen?', p.directa, qs.length, t(DATA.cfg.corto));
    box.innerHTML = `<div class="card"><h3>${esc(t('Resultado del simulacro'))}</h3>${html}<div class="actions"><button class="btn btn-primary" type="button" id="btnCompSim">${ico('ext')} ${esc(t('Compartir y retar'))}</button><a class="btn btn-ghost" href="${esc(enlaceWA(txt + '\n' + url))}" target="_blank" rel="noopener">WhatsApp</a><button class="btn btn-ghost" type="button" id="btnOtraSim">${ico('refresh')} ${esc(t('Otro simulacro'))}</button></div></div><div id="simRev"></div>`;
    $('btnCompSim').onclick = () => comparte(txt, url); $('btnOtraSim').onclick = () => { S.sim = null; guarda(); pintaSim(); };
    pintaPregunta($('simRev'), ex, 'sim'); return;
  }
  pintaPregunta(box, ex, 'sim');
  if (ex.limite) {
    const tic = () => { const quedan = Math.max(0, ex.limite - (Date.now() - ex.t0) / 1000), el = $('reloj'); if (el) el.textContent = '⏱ ' + mmss(quedan); if (quedan <= 0) { clearInterval(relojT); toast(t('Se acabó el tiempo')); terminaSim(); } };
    tic(); relojT = setInterval(tic, 1000);
  }
}
const enlaceSim = ex => enlaceOp(`&sim=${encodeURIComponent(ex.semilla)}&n=${ex.qs.length}&m=${encodeURIComponent(ex.modo)}&d=${ex.desde || 0}`);
function creaSim(semilla, n, modo, tiempo, desde) {
  const qs = simulacro(DATA.preguntas, PRED, EX(), n || nCompleto(modo), semilla, {...filtroDe(modo), desde: desde || 0});
  if (!qs.length) { toast(t('No hay preguntas disponibles para esa selección')); return false; }
  S.sim = {semilla, modo, desde: desde || 0, qs: qs.map(q => q.id), resp: {}, idx: 0, fin: false, t0: Date.now(), limite: tiempo === 'real' ? Math.round(qs.length * segPorPregunta()) : 0};
  if (qs.length < (n || nCompleto(modo))) toast(t('Solo hay {0} preguntas disponibles: el simulacro tiene {0}.', qs.length));
  guarda(); return true;
}
$('btnSim').onclick = () => { S.modoSim = $('simModo').value; if (creaSim('s' + Date.now().toString(36), +$('simN').value, $('simModo').value, $('simTiempo').value, +$('simDesde').value)) pintaSim(); };
$('btnSimLink').onclick = () => {
  const ex = S.sim || {semilla: 's' + Date.now().toString(36), modo: $('simModo').value, desde: +$('simDesde').value, qs: Array(+$('simN').value || nCompleto($('simModo').value))};
  comparte(t('Te reto a este simulacro de {0} en OráculoOposiciones: mismas preguntas para los dos. ¿Quién saca más nota?', t(DATA.cfg.corto)), enlaceSim(ex));
};
function terminaSim() { clearInterval(relojT); if (S.sim) { S.sim.fin = true; S.sim.idx = 0; guarda(); } pintaSim(); window.scrollTo({top: 0}); }

/* ── 4 · reto diario (mismas 10 preguntas para todos hoy, en cada oposición) ── */
function retoDeHoy() {
  const f = fechaMadrid();
  if (!S.reto || S.reto.fecha !== f || S.reto.op !== DATA.op) { S.reto = {op: DATA.op, fecha: f, qs: simulacro(DATA.preguntas, PRED, EX(), 10, `reto-${DATA.op}-${f}`).map(q => q.id), resp: {}, idx: 0, fin: false}; guarda(); }
  return S.reto;
}
function cierraReto() {
  const ex = S.reto; if (ex.fin) return; ex.fin = true;
  const ayer = fechaMadrid(new Date(Date.parse(ex.fecha + 'T12:00:00Z') - 864e5)), r = S.racha[ex.op] || {ultima: null, n: 0};
  S.racha[ex.op] = {ultima: ex.fecha, n: r.ultima === ayer ? r.n + 1 : r.ultima === ex.fecha ? r.n : 1};
  guarda(); toast(t('Reto completado. ¡Compártelo!'));
}
function pintaReto() {
  const ex = retoDeHoy(), qs = ex.qs.map(preg).filter(Boolean), racha = (S.racha[DATA.op] || {}).n;
  $('retoNum').textContent = t('{0} · reto n.º {1} · {2}', t(DATA.cfg.corto), numReto(ex.fecha), new Date(ex.fecha + 'T12:00:00').toLocaleDateString(locale(), {weekday: 'long', day: 'numeric', month: 'long'}));
  if (!qs.length) { $('retoBox').innerHTML = `<p class="empty">${esc(t('No hay preguntas disponibles.'))}</p>`; return; }
  let cab = '';
  if (ex.fin) {
    const {p, html} = resumenHTML(qs, ex), marcas = qs.map(q => !ex.resp[q.id] ? 'bl' : ex.resp[q.id] === q.correcta ? 'ok' : 'ko');
    const txt = textoCompartirReto('OráculoOposiciones', t(DATA.cfg.corto), numReto(ex.fecha), marcas, p, enlaceOp('&reto'));
    cab = `<div class="card"><h3>${esc(t('Tu reto de hoy'))} ${racha ? `<span class="fa-chip ok">🔥 ${esc(t('racha de {0} días', racha))}</span>` : ''}</h3><pre class="om-share">${esc(txt)}</pre>${html}
      <div class="actions"><button class="btn btn-primary" type="button" id="btnCompReto">${ico('ext')} ${esc(t('Compartir resultado'))}</button><a class="btn btn-ghost" href="${esc(enlaceWA(txt))}" target="_blank" rel="noopener">WhatsApp</a></div><p class="help">${esc(t('Mañana habrá un reto nuevo. Repasa abajo cada pregunta con su respuesta oficial.'))}</p></div>`;
  }
  $('retoBox').innerHTML = cab + '<div id="retoQ"></div>';
  if ($('btnCompReto')) $('btnCompReto').onclick = () => comparte($('btnCompReto').closest('.card').querySelector('pre').textContent);
  pintaPregunta($('retoQ'), ex, 'reto');
}

/* ── 3 · generador con agentes ── */
function pintaGen() {
  const sel = $('genTema'), v = sel.value;
  sel.innerHTML = EX().bloques.map(b => {
    const filas = (PRED[b.id] || {}).filas || [], esp = Object.fromEntries(filas.map(f => [f.id, f.n]));
    const ts = DATA.cfg.temas.filter(x => x.bloque === b.id).sort((a, z) => (esp[z.id] || 0) - (esp[a.id] || 0));
    return `<optgroup label="${esc(t(b.nombre))}">${ts.map(x => `<option value="${x.id}">${esc(etiquetaTema(x.id))} · ${esc(t(x.nombre)).slice(0, 70)}${esp[x.id] != null ? ' · ' + esp[x.id].toFixed(1) : ''}</option>`).join('')}</optgroup>`;
  }).join('');
  if ([...sel.options].some(o => o.value === v)) sel.value = v;
  const pv = getProv(), otros = Object.keys(PROV).filter(p => p !== pv && getKey(p));
  $('genRev').innerHTML = `<option value="">${esc(t('Mismo proveedor ({0})', PROV[pv].n))}</option>` + otros.map(p => `<option value="${p}">${esc(PROV[p].n)}</option>`).join('');
  const st = S.genStats, acept = S.gen.filter(g => g.estado === 'aceptada'), dud = S.gen.filter(g => g.estado === 'dudosa');
  $('genRes').innerHTML = !S.gen.length && !st ? '' : `
    ${st ? `<div class="card"><h3>${esc(t('Última tanda'))}</h3><p>${esc(t('Redactadas: {0} · aceptadas por los tres agentes: {1} · dudosas: {2} · descartadas: {3}.', st.total, st.aceptadas, st.dudosas, st.descartadas))}</p>${st.motivos.length ? `<ul class="fa-ul">${st.motivos.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}${ctxHTML(st.contexto)}</div>` : ''}
    <div class="card"><h3>${esc(t('Preguntas aceptadas ({0})', acept.length))}</h3>${acept.length ? acept.map(cartaGen).join('') : `<p class="empty">${esc(t('Todavía ninguna.'))}</p>`}
      <div class="actions"><button class="btn btn-word" id="btnGenWord" type="button">${ico('doc')} Word</button><button class="btn btn-ghost" id="btnGenCsv" type="button">CSV</button><button class="btn btn-ghost" id="btnGenGift" type="button">Moodle (GIFT)</button><button class="btn btn-ghost" id="btnGenBorra" type="button">${ico('trash')} ${esc(t('Borrar'))}</button></div></div>
    ${dud.length ? `<div class="card"><h3>${esc(t('Dudosas: un resolutor no estuvo de acuerdo ({0})', dud.length))}</h3><p class="help">${esc(t('No las uses para estudiar sin comprobarlas con el texto de la norma.'))}</p>${dud.map(cartaGen).join('')}</div>` : ''}`;
  if ($('btnGenWord')) { $('btnGenWord').onclick = genWord; $('btnGenCsv').onclick = genCsv; $('btnGenGift').onclick = () => { const a = S.gen.filter(g => g.estado === 'aceptada'); if (!a.length) return toast(t('No hay preguntas aceptadas')); dl(`oraculo_${DATA.op}_preguntas.gift.txt`, aGIFT(a), 'text/plain;charset=utf-8'); }; $('btnGenBorra').onclick = () => { S.gen = []; S.genStats = null; guarda(); pintaGen(); }; }
}
function ctxHTML(c) {
  if (!c || !c.total) return '';
  return `<details class="om-gen"><summary><b>${esc(t('Contexto de exámenes anteriores que recibió el redactor'))}</b> · ${esc(t('{0} preguntas oficiales de este tema', nf(c.total)))}</summary>
    <p><b>${esc(t('Subtemas que más se repiten'))}:</b> ${c.frecuentes.map(f => esc(`${f.tema} (${f.n} · ${f.ultimo})`)).join(', ') || '—'}</p>
    <p><b>${esc(t('Llevan 3 años o más sin salir'))}:</b> ${c.olvidados.map(f => esc(`${f.tema} (${f.ultimo})`)).join(', ') || esc(t('ninguno'))}</p>
    <p class="help">${esc(t('Recuento automático por palabras clave, más {0} preguntas oficiales recientes como ejemplo de estilo. Que un subtema lleve años sin salir no significa que vaya a salir.', (c.ejemplos || []).length))}</p></details>`;
}
function cartaGen(g) {
  return `<details class="om-gen"><summary><span class="fa-chip ${g.estado === 'aceptada' ? 'ok' : 'aviso'}">${esc(t(g.estado === 'aceptada' ? '3/3 de acuerdo' : '2/3 de acuerdo'))}</span> <b>${esc(nombreTema(g.tema))}</b> · ${esc(g.subtema || '')}<br>${esc(g.enunciado)}</summary>
    <ol class="om-ol" type="a">${g.opciones.map((o, k) => `<li class="${k + 1 === g.correcta ? 'om-ok' : ''}">${esc(o)}</li>`).join('')}</ol>
    <p><b>${esc(t('Explicación'))}:</b> ${esc(g.explicacion || '')}</p><p class="help">${esc(t('Norma y artículo que cita el redactor (compruébalo)'))}: ${esc(g.referencia || t('no indicada'))}</p>
    <p class="help">${g.resolutores.map((r, k) => esc(t('Resolutor {0} ({1}): opción {2}, seguridad {3} %. {4}', k + 1, r.prov, r.opcion ? 'abcd'[r.opcion - 1] : '–', r.seguridad ?? '–', r.motivo || ''))).join('<br>')}</p></details>`;
}

const PROMPT_GEN = (cfg, tema, n, ejemplos, ctx) => {
  const psico = tema.bloque === 'psico';
  return `Eres ${cfg.redactor}. Redacta ${n} preguntas NUEVAS del examen de ${cfg.nombre} sobre «${tema.nombre}», de tipo test con 4 opciones (a, b, c, d) y una sola respuesta correcta, con el estilo y la dificultad de los exámenes oficiales recientes.
Reglas:
${psico ? `- Son preguntas psicotécnicas: deben poder resolverse solo con el enunciado, sin tablas, gráficos ni imágenes externas. Comprueba tú mismo el cálculo o la regla de la serie antes de dar la respuesta.
- En "referencia" explica en una frase la regla o el cálculo.` : `- Solo contenidos de la normativa VIGENTE (texto consolidado). Si una norma ha cambiado hace poco o hay dudas sobre la redacción vigente, elige otro contenido.
- Pregunta por lo que dice literalmente la norma (plazos, órganos, mayorías, requisitos) o, en ofimática, por el comportamiento real de Windows 11 y Microsoft 365 en español.
- En "referencia" indica la norma y el artículo concretos (o, en ofimática, el menú o la función), sin inventar artículos.`}
- Una sola opción claramente correcta; las otras tres, plausibles pero inequívocamente incorrectas.
- Nada de «todas las anteriores» ni «ninguna de las anteriores».
- No copies ni parafrasees las preguntas de ejemplo: solo enseñan el estilo.
- Reparte la posición de la respuesta correcta entre 1, 2, 3 y 4.
Devuelve SOLO este JSON:
{"preguntas":[{"subtema":"subtema concreto","enunciado":"…","opciones":["…","…","…","…"],"correcta":1,"explicacion":"por qué es la correcta y por qué fallan las demás, en 2-4 frases","referencia":"…"}]}
El enunciado y las opciones, siempre en español. La explicación y el subtema, en ${langIA()}.

${ctx && ctx.total ? `CONTEXTO DE EXÁMENES ANTERIORES (${ctx.total} preguntas oficiales de este tema entre ${ctx.desde} y ${ctx.hasta}; recuento automático por palabras clave):
- Subtemas que más se repiten: ${ctx.frecuentes.map(f => `${f.tema} (${f.n} preguntas; última vez en ${f.ultimo})`).join('; ') || '—'}.
- Subtemas habituales que llevan 3 años o más sin salir: ${ctx.olvidados.map(f => `${f.tema} (última vez en ${f.ultimo})`).join('; ') || 'ninguno'}.
Usa este contexto para elegir subtemas con peso en el examen, sobre todo los que más se repiten y los que llevan tiempo sin salir, pero con un enfoque distinto al de las preguntas ya puestas.

` : ''}PREGUNTAS OFICIALES RECIENTES DE EJEMPLO (solo para el estilo y el nivel; la respuesta correcta va marcada con *; no copiar):
${ejemplos.map((q, i) => `${i + 1}. [Examen ${q.anio}] ${q.enunciado}\n${q.opciones.map((o, k) => `   ${k + 1 === q.correcta ? '*' : ' '}${'abcd'[k]}) ${o}`).join('\n')}`).join('\n\n') || '(sin ejemplos)'}`;
};
const ROLES = ['un preparador de oposiciones con veinte años de experiencia en este temario', 'un miembro del tribunal calificador que revisa las impugnaciones de la plantilla'];
const PROMPT_RES = (k, items) => `Eres ${ROLES[k]}. Resuelve estas preguntas de examen de oposición. Para cada una elige la ÚNICA opción correcta según la normativa vigente (o, en ofimática, según Windows 11 y Microsoft 365 en español; en psicotécnicos, comprobando el cálculo). Si ninguna opción es claramente correcta o hay más de una correcta, responde 0 y explica por qué.
Devuelve SOLO este JSON (opcion: 1 = a, 2 = b, 3 = c, 4 = d): {"respuestas":[{"id":"g1","opcion":1,"seguridad":90,"motivo":"una frase, en ${langIA()}"}]}

${items.map(x => `id: ${x.id}\n${x.enunciado}\n${x.opciones.map((o, j) => `${j + 1}. ${o}`).join('\n')}`).join('\n\n')}`;
async function conProveedor(pv, fn) {
  if (!pv || pv === getProv()) return fn();
  const prev = localStorage.getItem(APP + '_prov'); localStorage.setItem(APP + '_prov', pv);
  try { return await fn(); } finally { if (prev === null) localStorage.removeItem(APP + '_prov'); else localStorage.setItem(APP + '_prov', prev); }
}
let busy = false;
$('btnGen').onclick = async () => {
  if (busy) return; if (!pideClave()) return;
  const tema = temaDe($('genTema').value), n = +$('genN').value, rev = $('genRev').value || '', pv1 = getProv();
  if (!tema) return;
  const r = rng('gen' + Date.now()), todo = DATA.preguntas.filter(q => !q.stub);
  const ejemplos = ejemplosRecientes(todo, tema.id, 6, r), ys = [...new Set(todo.map(q => q.anio).filter(Boolean))].sort();
  const ctx = {...temasRecurrentes(todo, tema.id, tema.kw, ys.at(-1)), desde: ys[0], hasta: ys.at(-1)};
  const prompt = PROMPT_GEN(DATA.cfg, tema, n, ejemplos, ctx);
  if (!(await pideEnvio(prompt, 0))) return;
  busy = true; $('btnGen').disabled = true; const st = $('genEstado'), motivos = [];
  const paso = m => { st.innerHTML = '<span class="spin"></span> ' + esc(m); };
  try {
    paso(t('Agente 1 de 3: redactando {0} preguntas…', n));
    const raw = await llmJSON([{role: 'system', content: 'Eres un redactor riguroso de preguntas de examen de oposiciones. Respondes SOLO con JSON válido.'}, {role: 'user', content: prompt}], {max: 700 * n + 800});
    const cands = [];
    (raw.preguntas || []).slice(0, n).forEach((g, i) => {
      const x = {id: 'g' + (i + 1), tema: tema.id, subtema: String(g.subtema || ''), enunciado: String(g.enunciado || '').trim(), opciones: (g.opciones || []).map(o => String(o).trim()), correcta: Number(g.correcta), explicacion: String(g.explicacion || ''), referencia: String(g.referencia || '')};
      const f = revisaFormato(x, {minPal: tema.bloque === 'psico' ? 3 : 6}); if (f.length) return motivos.push(t('Pregunta {0} descartada por el código: {1}.', i + 1, f.map(m => t(m)).join(', ')));
      const pb = parecidoBanco(x, todo); if (pb) return motivos.push(t('Pregunta {0} descartada: se parece demasiado a la oficial {1} ({2}).', i + 1, pb.id, pct(pb.s)));
      cands.push(x);
    });
    const res = [];
    for (const k of [0, 1]) {
      const pv = k === 1 && rev ? rev : pv1;
      paso(t('Agente {0} de 3: resolviendo a ciegas con {1}…', k + 2, PROV[pv].n));
      if (!cands.length) break;
      const perm = cands.map(c => permuta(c, rng(c.id + k + Date.now())));
      const out = await conProveedor(pv, () => llmJSON([{role: 'system', content: 'Resuelves preguntas de examen de oposiciones con rigor. Respondes SOLO con JSON válido.'}, {role: 'user', content: PROMPT_RES(k, cands.map((c, j) => ({id: c.id, enunciado: c.enunciado, opciones: perm[j].opciones})))}], {max: 220 * cands.length + 400}));
      const mapa = Object.fromEntries((out.respuestas || []).map(a => [String(a.id), a]));
      res.push(cands.map((c, j) => { const a = mapa[c.id] || {}, o = Number(a.opcion); return {prov: PROV[pv].n, opcion: o >= 1 && o <= 4 ? perm[j].aOriginal(o) : 0, seguridad: a.seguridad, motivo: String(a.motivo || '')}; }));
    }
    let ac = 0, du = 0, de = motivos.length + Math.max(0, n - (raw.preguntas || []).slice(0, n).length);
    cands.forEach((c, j) => {
      c.resolutores = res.map(rr => rr[j]); c.estado = veredicto(c.correcta, c.resolutores.map(x => x.opcion));
      if (c.estado === 'descartada') { de++; motivos.push(t('Pregunta «{0}…» descartada: ninguno de los dos resolutores eligió la respuesta del redactor.', c.enunciado.slice(0, 50))); return; }
      c.id = uid('gen-'); c.fecha = new Date().toISOString(); S.gen.push(c); c.estado === 'aceptada' ? ac++ : du++;
    });
    S.genStats = {total: n, aceptadas: ac, dudosas: du, descartadas: de, motivos, contexto: {tema: tema.id, total: ctx.total, frecuentes: ctx.frecuentes.slice(0, 8), olvidados: ctx.olvidados, ejemplos: ejemplos.map(q => q.id)}};
    await guardaYa(); st.textContent = t('Hecho: {0} aceptadas de {1}.', ac, n); pintaGen();
  } catch (e) { st.textContent = e.message; toast(e.message, 8000); }
  finally { busy = false; $('btnGen').disabled = false; }
};
function genMd() { return S.gen.filter(g => g.estado === 'aceptada').map((g, i) => `## ${i + 1}. ${nombreTema(g.tema)} · ${g.subtema}\n${g.enunciado}\n\n${g.opciones.map((o, k) => `${'abcd'[k]}) ${o}`).join('\n')}\n\n**${t('Respuesta')}:** ${'abcd'[g.correcta - 1]}. ${g.explicacion}\n\n*${t('Norma y artículo que cita el redactor (compruébalo)')}: ${g.referencia}*`).join('\n\n'); }
async function genWord() { if (!S.gen.some(g => g.estado === 'aceptada')) return toast(t('No hay preguntas aceptadas')); try { dl(`oraculo_${DATA.op}_preguntas.docx`, await wordDeMarkdown(genMd(), {titulo: APP_NAME + ' · ' + t(DATA.cfg.nombre), subtitulo: t('Preguntas generadas y verificadas por tres agentes de IA'), pie: t('Generado con {0}. Preguntas no oficiales: compruébalas con el texto de la norma.', APP_NAME)})); } catch (e) { toast(e.message, 7000); } }
function genCsv() { const a = S.gen.filter(g => g.estado === 'aceptada'); if (!a.length) return toast(t('No hay preguntas aceptadas')); dl(`oraculo_${DATA.op}_preguntas.csv`, csvDe([t('tema'), t('subtema'), t('enunciado'), 'a', 'b', 'c', 'd', t('correcta'), t('explicacion'), t('referencia')], a.map(g => [nombreTema(g.tema), g.subtema, g.enunciado, ...g.opciones, 'abcd'[g.correcta - 1], g.explicacion, g.referencia])), 'text/csv;charset=utf-8'); }

/* aviso previo al envío (una vez por sesión) */
let envioRes = null;
function pideEnvio(textoEnviado) {
  if (ENVIO_OK) return Promise.resolve(true);
  $('envioInfo').innerHTML = `<p class="sub" style="margin-top:0">${esc(t('Se enviarán unos {0} caracteres a {1}. No incluye datos tuyos: solo el tema y preguntas oficiales de ejemplo. Son tres llamadas (redactor y dos resolutores).', nf(textoEnviado.length), PROV[getProv()].n))}</p><p class="help">${esc(t('Muestra del envío:'))}</p>`;
  $('envioTxt').textContent = textoEnviado.slice(0, 3000) + (textoEnviado.length > 3000 ? '\n…' : '');
  $('envioOk').checked = false; $('envioSi').disabled = true; $('mEnvio').classList.add('on');
  return new Promise(r => { envioRes = r; });
}
function cierraEnvio(v) { $('mEnvio').classList.remove('on'); if (envioRes) { const r = envioRes; envioRes = null; if (v) ENVIO_OK = true; r(v); } }
_cierres.mEnvio = () => cierraEnvio(false);
$('envioOk').onchange = () => { $('envioSi').disabled = !$('envioOk').checked; };
$('envioSi').onclick = () => cierraEnvio(true); $('envioNo').onclick = () => cierraEnvio(false);

/* ── arranque: oposición (?op=…) → datos → predicción → enlaces compartidos (?reto, ?sim=…) ── */
(async () => {
  const p = await cargaEstado(); if (p) S = {...S, ...p, racha: (p.racha && typeof p.racha === 'object' && !('n' in p.racha)) ? p.racha : {}};
  const q = new URLSearchParams(location.search);
  const op = opActiva(q.get('op')) ? q.get('op') : opActiva(S.op) ? S.op : OPOS.find(o => opActiva(o.id)).id;
  if (op !== S.op) { S.sim = null; S.reto = null; S.gen = []; S.genStats = null; }
  S.op = op;
  await cargaDatos(op); calcula(); iniciaUI(); pintaChip();
  if (q.has('reto')) return go(4);
  if (q.get('sim')) { const m = q.get('m') || 'probable'; S.modoSim = m; if (creaSim(q.get('sim'), Math.min(200, Math.max(1, +q.get('n') || 25)), m, 'real', +q.get('d') || 0)) toast(t('Mismo examen que quien te ha retado. ¡Suerte!')); return go(2); }
  go(0);
})();
