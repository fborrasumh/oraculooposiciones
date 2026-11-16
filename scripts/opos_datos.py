#!/usr/bin/env python3
"""OráculoOposiciones · de los PDF oficiales a data/<oposición>/banco.json (sin red).

    python3 scripts/opos_datos.py auxiliar-age

Para cada examen de data/<op>/raw/<año>/:
  1. extrae el texto del cuadernillo y de la plantilla (pdfplumber);
  2. separa preguntas y opciones a)–d) (parse_cuadernillo) y lee la letra correcta de cada número (parse_plantilla),
     teniendo en cuenta que la numeración puede reiniciarse en la segunda parte y en las preguntas de reserva;
  3. asigna parte y bloque según la estructura de la convocatoria (en la primera parte, las 30 primeras son del
     Bloque I y las 30 siguientes psicotécnicas) y el tema por palabras clave (o por IA, si existe clasificacion_ia.json);
  4. escribe data/<op>/banco.json (lo que lee la app) y data/<op>/informe.md (qué se extrajo y qué falló, examen a examen).
Nada se inventa: una pregunta sin respuesta en la plantilla queda con correcta=null y no entra en simulacros."""
import json, re, sys, unicodedata, datetime, pathlib

R = pathlib.Path(__file__).resolve().parent.parent
LETRA = {'a': 1, 'b': 2, 'c': 3, 'd': 4}
MESES = {m: i + 1 for i, m in enumerate('enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split())}


def norm(s):
    s = unicodedata.normalize('NFD', str(s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9ñ@]+', ' ', s).strip()


# ── 1 · cuadernillo ──────────────────────────────────────────────────────────────────────────────
RUIDO = re.compile(r'^\s*(-\s*\d+\s*-|\d+\s*/\s*\d+|p[aá]gina\s+\d+.*|modelo\s+[ab]\s*$|aux[\s-]*l.*\d{2,4}.*|cuerpo general auxiliar.*|instituto nacional de administraci[oó]n p[uú]blica.*|ministerio .*|comisi[oó]n permanente de selecci[oó]n.*)\s*$', re.I)
QNUM = re.compile(r'^\s*(\d{1,3})\s*[.)]\s*(.*)$')
OPC = re.compile(r'^\s*([a-dA-D])\s*[).]\s*(.*)$')
CAB = re.compile(r'(primera|segunda)\s+parte|preguntas?\s+de\s+reserva|\breserva\b', re.I)
CONTEXTO = re.compile(r'responda\s+a\s+las\s+preguntas|preguntas\s+\d{1,3}\s+a\s+(la\s+)?\d{1,3}|siguiente\s+(tabla|cuadro|gr[aá]fico|texto|relaci[oó]n)|a\s+continuaci[oó]n\s+se\s+(presenta|muestra|recoge)', re.I)
MATERIAL = re.compile(r'\b(tabla|cuadro|gr[aá]fico|figura|imagen|captura|ilustraci[oó]n)\b|siguiente(s)?\s+datos|datos\s+anteriores', re.I)


def cabecera(l):
    m = CAB.search(l)
    if not m or len(l) > 90: return None
    t = m.group(0).lower()
    return 'reserva' if 'reserva' in t else ('p2' if 'segunda' in t else 'p1')


def limpia(texto):
    return [l.rstrip() for l in texto.replace('\r', '').split('\n') if l.strip() and not RUIDO.match(l)]


def parse_cuadernillo(texto):
    """Máquina de estados: pregunta → enunciado → opciones a)…d) → siguiente pregunta.
    Una línea «n.» abre pregunta si n es la siguiente esperada, o si n = 1 y la anterior está completa (la numeración se
    reinicia: segunda parte o reserva). Las cabeceras («SEGUNDA PARTE», «PREGUNTAS DE RESERVA») y los textos comunes a
    varias preguntas («Con los datos de la tabla, responda a las preguntas 31 a 40») se guardan como marcas."""
    qs, cur, campo, seg, marca, ctx = [], None, None, 0, None, None
    def ctx_para(n):   # el texto común solo vale para las preguntas que dice («31 a 40»); sin rango, para las 5 siguientes
        nonlocal ctx
        if not ctx: return None
        if ctx['rango']: v = ctx['rango'][0] <= n <= ctx['rango'][1]
        else: ctx['usos'] += 1; v = ctx['usos'] <= 5
        if not v and (not ctx['rango'] or n > ctx['rango'][1]): ctx = None
        return ctx['txt'] if v else None
    def cierra():
        nonlocal cur
        if cur is not None and len(cur['opciones']) == 4: qs.append(cur)
        cur = None
    for l in limpia(texto):
        h = cabecera(l)
        if h and (cur is None or len(cur['opciones']) == 4):
            cierra(); marca = h; campo = None; ctx = None; continue
        mq, mo = QNUM.match(l), OPC.match(l)
        if mo and cur is not None and campo in ('enunciado', 'opcion') and LETRA[mo.group(1).lower()] == len(cur['opciones']) + 1:
            cur['opciones'].append(mo.group(2).strip()); campo = 'opcion'; continue
        if mq:
            n, resto = int(mq.group(1)), mq.group(2).strip()
            completa = cur is None or len(cur['opciones']) == 4
            ult = cur['n'] if cur is not None else (qs[-1]['n'] if qs else 0)
            if completa and (n == ult + 1 or (n == 1 and ult >= 3)):
                if n == 1 and ult >= 3: seg += 1
                cierra()
                cur = {'n': n, 'seg': seg, 'marca': marca, 'enunciado': resto, 'opciones': [], 'contexto': ctx_para(n)}; campo = 'enunciado'; continue
        if CONTEXTO.search(l) and (cur is None or len(cur['opciones']) == 4):
            cierra(); ctx = {'txt': l.strip(), 'rango': None, 'usos': 0}; campo = 'contexto'
            m = re.search(r'(\d{1,3})\s+a\s+(?:la\s+)?(\d{1,3})', l)
            if m: ctx['rango'] = (int(m.group(1)), int(m.group(2)))
            continue
        if campo == 'contexto': ctx['txt'] = (ctx['txt'] + ' ' + l.strip()).strip(); continue
        if cur is None: continue
        if campo == 'enunciado': cur['enunciado'] = (cur['enunciado'] + ' ' + l.strip()).strip()
        elif campo == 'opcion': cur['opciones'][-1] = (cur['opciones'][-1] + ' ' + l.strip()).strip()
    cierra()
    une = lambda x: re.sub(r'(\w)- (?=[a-záéíóúñü])', r'\1', re.sub(r'\s+', ' ', x or '')).strip()
    for q in qs:
        q['enunciado'], q['opciones'] = une(q['enunciado']), [une(o) for o in q['opciones']]
        q['contexto'] = une(q['contexto']) if q['contexto'] else None
        q['imagen'] = bool(q['contexto'] or MATERIAL.search(q['enunciado']))   # depende de un material que no se extrae bien
    return qs


def mejor_cuadernillo(texto):
    """La portada trae instrucciones numeradas («1. No abra este cuadernillo…»): se prueba a empezar en cada una de las
    primeras líneas «1.» y gana lo que extrae más preguntas."""
    ls = texto.replace('\r', '').split('\n')
    inicios = [i for i, l in enumerate(ls) if QNUM.match(l) and int(QNUM.match(l).group(1)) == 1][:10] or [0]
    mejor = []
    for i in inicios:
        qs = parse_cuadernillo('\n'.join(ls[i:]))
        if len(qs) >= len(mejor): mejor = qs
    return mejor


def fecha_portada(texto):
    m = re.search(r'(\d{1,2})\s+de\s+(' + '|'.join(MESES) + r')\s+de\s+(20\d\d)', norm(texto[:4000]))
    return f'{m.group(3)}-{MESES[m.group(2)]:02d}-{int(m.group(1)):02d}' if m else None


# ── 2 · plantilla ──────────────────────────────────────────────────────────────────────────────
PAR = re.compile(r'(?<!\d)(\d{1,3})\s*[.\-)]?\s*(ANULADA|Anulada|anulada|ANUL\.?|[A-Da-d])(?![A-Za-zÁÉÍÓÚáéíóúñ])')


def parse_plantilla(texto):
    """Devuelve una lista de segmentos [{'marca': 'p1'|'p2'|'reserva'|None, 'resp': {n: 1..4 | 0 (anulada)}}],
    separados por las cabeceras del documento. Dentro de cada segmento vale la primera aparición de cada número."""
    segs = [{'marca': None, 'resp': {}}]
    for l in texto.replace('\r', '').split('\n'):
        h = cabecera(l)
        if h:
            if segs[-1]['resp'] or segs[-1]['marca'] is None and len(segs) > 1: segs.append({'marca': h, 'resp': {}})
            else: segs[-1]['marca'] = h
            l = CAB.sub(' ', l)
        for n, v in PAR.findall(l):
            n = int(n); val = 0 if v.upper().startswith('ANUL') else LETRA[v.lower()]
            if 1 <= n <= 200 and n not in segs[-1]['resp']: segs[-1]['resp'][n] = val
    return [s for s in segs if s['resp']]


def respuestas(qs, segs):
    """Empareja cada pregunta (segmento del cuadernillo, número) con su respuesta.
    - Si el cuadernillo tiene numeración continua (un segmento), se unen todos los segmentos de la plantilla.
    - Si se reinicia, se emparejan los segmentos por orden; si la plantilla tiene menos segmentos, se usa la unión."""
    nseg = len({q['seg'] for q in qs})
    out = {}
    if nseg == 1 or len(segs) < nseg:
        union = {}
        for s in segs:
            for n, v in s['resp'].items(): union.setdefault(n, v)
        for q in qs: out[(q['seg'], q['n'])] = union.get(q['n'])
    else:
        for q in qs: out[(q['seg'], q['n'])] = segs[q['seg']]['resp'].get(q['n']) if q['seg'] < len(segs) else None
    return out


# ── 3 · estructura: parte, bloque y reserva ──────────────────────────────────────────────────────
def estructura(qs, cfg):
    """Asigna parte (p1/p2), reserva (sí/no) y, en la primera parte, el bloque por posición (bases: las 30 primeras del
    Bloque I y las 30 siguientes psicotécnicas). Usa las cabeceras del cuadernillo si las hay; si no, la posición."""
    bl = {b['id']: b for b in cfg['examen']['bloques']}
    n1 = sum(bl[b]['n'] for b in cfg['examen']['partes'][0]['bloques'])   # 60
    n2 = sum(bl[b]['n'] for b in cfg['examen']['partes'][1]['bloques'])   # 50
    segs = sorted({q['seg'] for q in qs})
    if len(segs) > 1:   # numeración reiniciada: cada segmento es una parte o un grupo de reserva
        tam = {s: sum(1 for q in qs if q['seg'] == s) for s in segs}
        grandes = [s for s in segs if tam[s] > 8]
        for q in qs:
            s = q['seg']
            q['reserva'] = tam[s] <= 8 or q.get('marca') == 'reserva'
            q['parte'] = 'p2' if (grandes and len(grandes) > 1 and s >= grandes[1]) else 'p1'
            q['pos'] = q['n']
    else:               # numeración continua: 1-60 primera parte, (61-65 reserva), siguientes 50 segunda, (resto reserva)
        total = len(qs); res1 = 5 if total >= n1 + n2 + 8 else 0
        for i, q in enumerate(sorted(qs, key=lambda x: x['n'])):
            m = q.get('marca')
            if i < n1: q['parte'], q['reserva'], q['pos'] = 'p1', False, i + 1
            elif i < n1 + res1: q['parte'], q['reserva'], q['pos'] = 'p1', True, i + 1
            elif i < n1 + res1 + n2: q['parte'], q['reserva'], q['pos'] = 'p2', False, i - n1 - res1 + 1
            else: q['parte'], q['reserva'], q['pos'] = 'p2', True, i - n1 - res1 + 1
            if m == 'p2' and q['parte'] == 'p1' and i >= n1: q['parte'] = 'p2'
    b_p1 = cfg['examen']['partes'][0]['bloques']                           # ['b1', 'psico']
    lim = bl[b_p1[0]]['n']
    for q in qs:
        if q['parte'] == 'p2': q['bloque'] = cfg['examen']['partes'][1]['bloques'][0]
        elif not q['reserva']: q['bloque'] = b_p1[0] if q['pos'] <= lim else b_p1[1]
        else: q['bloque'] = None   # reserva de la primera parte: se decide por el contenido (clasifica)


# ── 4 · tema por palabras clave ────────────────────────────────────────────────────────────────
def clasifica(q, temas):
    """Puntúa cada tema del bloque: palabra clave en el enunciado = 2 × nº de palabras de la clave; en las opciones = 1 ×.
    Devuelve (tema, confianza). Sin coincidencias → '<bloque>-otros'."""
    en, op = ' ' + norm(q['enunciado']) + ' ', ' ' + norm(' '.join(q['opciones'])) + ' '
    pts = {}
    for t in temas:
        s = 0
        for kw in t['kw']:
            k = norm(kw); w = len(k.split())
            rx = re.compile(r'(?<![a-z0-9])' + re.escape(k) + r'(?![a-z0-9])')
            s += 2 * w * len(rx.findall(en)) + w * len(rx.findall(op))
        if s: pts[t['id']] = s
    if not pts: return None, 0.0
    orden = sorted(pts.items(), key=lambda x: -x[1])
    return orden[0][0], round(orden[0][1] / sum(pts.values()), 2)


def numericas(q):
    return all(re.fullmatch(r'[\d.,\s/%€a-z]{1,14}', o.strip().lower() or 'x') and re.search(r'\d', o) for o in q['opciones'])


def asigna_tema(q, cfg, ia):
    temas = cfg['temas']
    if q['bloque'] is None:   # reserva de la primera parte: Bloque I si casa con algún tema jurídico; si no, psicotécnica
        b1, _ = clasifica(q, [t for t in temas if t['bloque'] == 'b1'])
        q['bloque'] = 'b1' if b1 and not numericas(q) else 'psico'
    if q['id'] in ia and any(t['id'] == ia[q['id']] and t['bloque'] == q['bloque'] for t in temas):
        q['tema'], q['conf'], q['metodo'] = ia[q['id']], 1.0, 'ia'; return
    t, c = clasifica(q, [t for t in temas if t['bloque'] == q['bloque']])
    if not t and q['bloque'] == 'psico': t, c = ('psico-num', 0.3) if numericas(q) else (None, 0.0)
    q['tema'], q['conf'], q['metodo'] = (t or q['bloque'] + '-otros'), c, 'palabras'


# ── 5 · montaje ────────────────────────────────────────────────────────────────────────────────
def texto_pdf(p):
    import pdfplumber
    with pdfplumber.open(p) as pdf: return '\n'.join((pg.extract_text() or '') for pg in pdf.pages)


def procesa(d, cfg, origen):
    anio = int(d.name); inf = {'anio': anio, 'ok': False, 'convocatoria': origen.get('convocatoria'), 'plantilla_tipo': origen.get('plantilla_tipo')}
    cu, pl = d / 'cuadernillo.pdf', d / 'plantilla.pdf'
    tx = (d / 'cuadernillo.txt').read_text(encoding='utf-8') if (d / 'cuadernillo.txt').exists() else (texto_pdf(cu) if cu.exists() else '')
    if not tx: inf['error'] = 'falta el cuadernillo'; return [], inf
    (d / 'cuadernillo.txt').write_text(tx, encoding='utf-8')
    fp = fecha_portada(tx); inf['fecha'] = origen.get('fecha') or fp
    anio_ex = int(inf['fecha'][:4]) if inf['fecha'] else anio
    qs = mejor_cuadernillo(tx)
    inf['preguntas'] = len(qs)
    if len(qs) < 20: inf['error'] = f'solo se reconocieron {len(qs)} preguntas'; return [], inf
    tp = (d / 'plantilla.txt').read_text(encoding='utf-8') if (d / 'plantilla.txt').exists() else (texto_pdf(pl) if pl.exists() else '')
    if tp: (d / 'plantilla.txt').write_text(tp, encoding='utf-8')
    segs = parse_plantilla(tp) if tp else []
    resp = respuestas(qs, segs)
    estructura(qs, cfg)
    out = []
    for q in qs:
        r = resp.get((q['seg'], q['n']))
        out.append({'id': f"{anio}-{q['seg']}-{q['n']:03d}", 'anio': anio_ex, 'n': q['n'], 'parte': q['parte'], 'reserva': q['reserva'], 'bloque': q['bloque'],
                    'enunciado': q['enunciado'], 'opciones': q['opciones'], 'contexto': q['contexto'],
                    'correcta': r if r else None, 'anulada': r == 0, 'imagen': q['imagen'], 'plantilla': origen.get('plantilla_tipo')})
    inf['con_respuesta'] = sum(1 for q in out if q['correcta'])
    inf['anuladas'] = sum(1 for q in out if q['anulada'])
    inf['cobertura'] = round(sum(1 for q in out if q['correcta'] or q['anulada']) / max(1, len(out)), 3)
    inf['por_parte'] = {p: sum(1 for q in out if q['parte'] == p and not q['reserva']) for p in ('p1', 'p2')}
    inf['reserva'] = sum(1 for q in out if q['reserva'])
    if tp and inf['cobertura'] < 0.9: inf['aviso'] = f"la plantilla solo cubre el {inf['cobertura']:.0%} de las preguntas: revisa el emparejamiento"
    if not tp: inf['aviso'] = 'sin plantilla: cuenta para la predicción, no entra en simulacros'
    if inf['anuladas'] > 10:   # no es creíble: probablemente se ha leído mal la plantilla
        inf['aviso'] = f"{inf['anuladas']} anuladas: plantilla descartada por poco fiable"
        for q in out: q['correcta'], q['anulada'] = None, False
    inf['ok'] = True
    return out, inf


def main():
    if len(sys.argv) < 2: print(__doc__); return 2
    op = sys.argv[1]; base = R / 'data' / op
    cfg = json.loads((base / 'config.json').read_text(encoding='utf-8'))
    fuentes = {str(f['anio']): f for f in json.loads((base / 'fuentes.json').read_text(encoding='utf-8'))['examenes']}
    ia = json.loads((base / 'clasificacion_ia.json').read_text(encoding='utf-8')) if (base / 'clasificacion_ia.json').exists() else {}
    preg, informes = [], []
    for d in sorted(p for p in (base / 'raw').glob('20[0-9][0-9]') if p.is_dir()):
        try: qs, inf = procesa(d, cfg, fuentes.get(d.name, {}))
        except Exception as e: qs, inf = [], {'anio': int(d.name), 'ok': False, 'error': f'{type(e).__name__}: {e}'}
        for q in qs: asigna_tema(q, cfg, ia)
        preg += qs; informes.append(inf)
    temas = [{'id': t['id'], 'bloque': t['bloque'], 'num': t['num'], 'nombre': t['nombre']} for t in cfg['temas']]
    datos = {'generado': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'), 'oposicion': op,
             'fuente': 'Cuadernillos y plantillas de respuestas publicados en la sede electrónica del INAP (sede.inap.gob.es)',
             'clasificacion': 'Parte y bloque por la estructura de la convocatoria; tema por IA (clasificacion_ia.json) cuando existe y, si no, por palabras clave (config.json)',
             'temas': temas, 'examenes': informes, 'preguntas': preg}
    (base / 'banco.json').write_text(json.dumps(datos, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    L = [f"# Informe de extracción · {cfg['nombre']}", '', f"Generado: {datos['generado']}", '',
         '| Examen | Fecha | Preguntas | 1.ª parte | 2.ª parte | Reserva | Con respuesta | Anuladas | Plantilla | Estado |', '|---|---|---|---|---|---|---|---|---|---|']
    for i in informes:
        pp = i.get('por_parte', {})
        L.append(f"| {i['anio']} | {i.get('fecha') or '¿?'} | {i.get('preguntas', 0)} | {pp.get('p1', 0)} | {pp.get('p2', 0)} | {i.get('reserva', 0)} | {i.get('con_respuesta', 0)} | {i.get('anuladas', 0)} | {i.get('plantilla_tipo') or '—'} | {('✓ ' + i.get('aviso', '')) if i['ok'] else '✕ ' + i.get('error', '')} |")
    sc = sum(1 for q in preg if q['tema'].endswith('-otros')); nia = sum(1 for q in preg if q.get('metodo') == 'ia')
    L += ['', f'Preguntas totales: {len(preg)} · tema asignado con IA: {nia} · sin tema: {sc} ({sc / max(1, len(preg)):.0%})', '',
          'Esperado en cada examen reciente: 60 en la 1.ª parte y 50 en la 2.ª (más reserva). Si un examen se aparta, revisa su cuadernillo.',
          'Revisa a mano al menos 20 preguntas por examen contra el PDF antes de fiarte de los datos.']
    (base / 'informe.md').write_text('\n'.join(L) + '\n', encoding='utf-8')
    print('\n'.join(L))
    return 0 if preg else 1


if __name__ == '__main__':
    sys.exit(main())
