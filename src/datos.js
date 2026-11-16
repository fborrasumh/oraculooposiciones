/* ══ Datos: registro de oposiciones y configuración (incrustados al montar, ver build.py), banco oficial
   (data/<op>/banco.json, lo genera la GitHub Action) o, si aún no existe, un DEMO marcado como ficticio ══ */
const OPOS = OPOS_REG.oposiciones;
const opActiva = id => OPOS.find(o => o.id === id && o.estado === 'activa' && OPOS_CFG[o.id]);

/* DEMO · preguntas ESCRITAS PARA LA DEMOSTRACIÓN (no son preguntas oficiales); sirven para probar la app sin datos */
const DEMO_PREG = {
  'auxiliar-age': [
    ['b1', 'b1-01', 'Según el artículo 12 de la Constitución Española, los españoles son mayores de edad a los:', ['16 años.', '18 años.', '21 años.', '14 años.'], 2],
    ['b1', 'b1-02', 'Según el artículo 159 de la Constitución Española, el Tribunal Constitucional se compone de:', ['9 miembros.', '10 miembros.', '12 miembros.', '15 miembros.'], 3],
    ['b1', 'b1-03', 'Según la Ley Orgánica 3/1981, el Defensor del Pueblo es elegido por las Cortes Generales para un periodo de:', ['Cuatro años.', 'Cinco años.', 'Seis años.', 'Tres años.'], 2],
    ['b1', 'b1-07', 'Según la Ley 19/2013, de transparencia, la resolución sobre una solicitud de acceso a la información pública debe notificarse, con carácter general, en el plazo máximo de:', ['Diez días.', 'Quince días.', 'Un mes.', 'Tres meses.'], 3],
    ['b1', 'b1-10', '¿En qué ciudad tiene su sede el Tribunal de Justicia de la Unión Europea?', ['Bruselas.', 'Estrasburgo.', 'Fráncfort.', 'Luxemburgo.'], 4],
    ['b1', 'b1-11', 'Según el artículo 21.3 de la Ley 39/2015, cuando las normas reguladoras del procedimiento no fijen el plazo máximo para resolver, este será de:', ['Un mes.', 'Tres meses.', 'Seis meses.', 'Diez días.'], 2],
    ['b1', 'b1-11', 'Según el artículo 122 de la Ley 39/2015, si el acto es expreso, el plazo para interponer el recurso de alzada es de:', ['Diez días.', 'Quince días.', 'Un mes.', 'Dos meses.'], 3],
    ['b1', 'b1-12', 'Según el artículo 7 de la Ley Orgánica 3/2018, de protección de datos, el tratamiento de los datos de un menor puede fundarse en su consentimiento a partir de los:', ['12 años.', '14 años.', '16 años.', '18 años.'], 2],
    ['psico', 'psico-num', '¿Qué número continúa la serie? 2, 6, 12, 20, 30, …', ['36', '40', '42', '44'], 3],
    ['psico', 'psico-verbal', 'Señale el sinónimo de «efímero»:', ['Duradero.', 'Pasajero.', 'Eterno.', 'Sólido.'], 2],
    ['psico', 'psico-admin', 'Si se ordenan alfabéticamente por apellidos, ¿cuál iría en primer lugar?', ['Martínez Ruiz, Ana.', 'Martín Ruiz, Luis.', 'Martínez Rubio, Eva.', 'Martín Rubio, Juan.'], 4],
    ['b2', 'b2-05', '¿Cuántos bits forman un byte?', ['4', '8', '16', '32'], 2],
    ['b2', 'b2-06', 'En Windows 11, ¿qué combinación de teclas bloquea el equipo?', ['Tecla de Windows + L', 'Tecla de Windows + D', 'Alt + F4', 'Ctrl + Esc'], 1],
    ['b2', 'b2-08', 'En Word 365, con la interfaz en español, ¿qué combinación de teclas aplica el formato de negrita?', ['Ctrl + B', 'Ctrl + K', 'Ctrl + N', 'Ctrl + S'], 3],
    ['b2', 'b2-09', 'En Excel 365, ¿qué función devuelve el valor más alto de un rango de celdas?', ['MAYOR.ES', 'MAX', 'TOPE', 'SUMA'], 2]
  ]
};
function demoPreguntas(op) {
  return (DEMO_PREG[op] || []).map(([bloque, tema, enunciado, opciones, correcta], i) => ({id: 'demo-' + (i + 1), anio: 0, n: i + 1, bloque, tema, enunciado, opciones, correcta, anulada: false, imagen: false, reserva: false, demo: true}));
}
/* DEMO · recuentos FICTICIOS (no son datos reales): «preguntas» sin texto, solo para ver la predicción funcionando */
function demoRecuentos(cfg) {
  const r = rng('demo-' + cfg.id), out = [], anios = [2015, 2016, 2017, 2019, 2022, 2023, 2024, 2025, 2026];
  for (const b of cfg.examen.bloques) {
    const ts = cfg.temas.filter(t => t.bloque === b.id), pesos = ts.map((t, i) => 0.5 + r() * 1.5 + (i % 4 === 0 ? 0.8 : 0));
    for (const y of anios) {
      const w = pesos.map((p, i) => Math.max(0.05, p + (i === 1 ? (y - 2015) * 0.08 : 0) + (r() - 0.5) * 0.6)), W = w.reduce((a, v) => a + v, 0);
      const rep = reparto(ts.map((t, i) => ({id: t.id, cuota: w[i] / W})), b.n);
      for (const id in rep) for (let k = 0; k < rep[id]; k++) out.push({id: `demo-${y}-${id}-${k}`, anio: y, bloque: b.id, tema: id, reserva: false, stub: true});
    }
  }
  return out;
}

let DATA = null;
const temaDe = id => (DATA.cfg.temas.find(x => x.id === id) || null);
const nombreTema = id => { const x = temaDe(id); return x ? t(x.nombre) : sinTema(id) ? t('Sin tema asignado') : id; };
const etiquetaTema = id => { const x = temaDe(id); return x ? (x.bloque === 'psico' ? t('Psicotécnico') : t('Tema {0}', x.num)) : '—'; };
const bloqueDe = id => DATA.cfg.examen.bloques.find(b => b.id === id) || {nombre: id, color: '#666'};
/* Carga data/<op>/banco.json (mismo origen, en GitHub Pages). Abierta como fichero local o sin datos todavía → DEMO */
async function cargaDatos(op) {
  const cfg = OPOS_CFG[op];
  DATA = {op, cfg, real: false, preguntas: demoPreguntas(op), recuentos: demoRecuentos(cfg), examenes: [], generado: null};
  try {
    const r = await fetch(`data/${op}/banco.json`, {cache: 'no-cache'});
    if (!r.ok) throw 0;
    const j = await r.json();
    const ps = (j.preguntas || []).filter(q => q && q.enunciado && q.anio && q.bloque && q.tema);
    if (ps.length < 100) throw 0;
    DATA = {op, cfg, real: true, preguntas: ps, recuentos: ps, examenes: j.examenes || [], generado: j.generado || null};
  } catch { /* se queda el DEMO */ }
  return DATA;
}
