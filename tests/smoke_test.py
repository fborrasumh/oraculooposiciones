"""Prueba de OráculoOposiciones en un Chromium real con IA simulada:  python3 tests/smoke_test.py
Comprueba: modo demostración, selector de oposición, estructura del examen, predicción por bloques (30/30/50), simulacro
completo con la estructura real y la penalización de 1/3, enlace para retar, reto diario y racha, «¿Por qué?» anclado a la
plantilla, generador con panel de cinco agentes (formato, copia del banco, discrepancias, Contradictor), examen completo con IA,
Mis generadas, Tu clave, repaso espaciado y plan, banco y examen por año, buscador, validación con cotejo, estado por oposición,
idiomas, CSP, descargas, datos «reales» sintéticos y desborde en móvil."""
import asyncio, sys, pathlib, re, json
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from forja_test import Harness
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path('/tmp/oo_test'); OUT.mkdir(exist_ok=True)
CFG = json.loads((ROOT / 'data' / 'auxiliar-age' / 'config.json').read_text(encoding='utf-8'))

LARGO = 'Según la Ley 39/2015, de 1 de octubre, del Procedimiento Administrativo Común de las Administraciones Públicas, '
GEN = {'preguntas': [
    {'subtema': 'buena', 'enunciado': LARGO + '¿cuál es la respuesta? (BUENA)', 'opciones': ['Distractor uno', 'CORRECTA buena', 'Distractor dos', 'Distractor tres'], 'correcta': 2, 'explicacion': 'Porque sí.', 'referencia': 'Ley 39/2015, art. 21'},
    {'subtema': 'formato', 'enunciado': LARGO + '¿cuál? (FORMATO)', 'opciones': ['a', 'a', 'Ninguna de las anteriores', 'b'], 'correcta': 7, 'explicacion': '', 'referencia': ''},
    {'subtema': 'copia', 'enunciado': 'Según el artículo 21.3 de la Ley 39/2015, cuando las normas reguladoras del procedimiento no fijen el plazo máximo para resolver, este será de:', 'opciones': ['Un mes.', 'CORRECTA Tres meses.', 'Seis meses.', 'Diez días.'], 'correcta': 2, 'explicacion': '', 'referencia': ''},
    {'subtema': 'clave mal', 'enunciado': LARGO + '¿cuál? (CLAVE MAL)', 'opciones': ['Opción que el redactor da por buena', 'Otra', 'CORRECTA de verdad', 'Otra más'], 'correcta': 1, 'explicacion': '', 'referencia': ''},
    {'subtema': 'dudosa', 'enunciado': LARGO + '¿cuál? (DUDOSA)', 'opciones': ['CORRECTA según el redactor', 'ALTERNATIVA', 'Otra', 'Otra más'], 'correcta': 1, 'explicacion': '', 'referencia': ''},
    {'subtema': 'contra', 'enunciado': LARGO + 'en materia de plazos, ¿cuál? (CONTRA MALA)', 'opciones': ['CORRECTA para los resolutores', 'Otra opción', 'Otra distinta', 'Otra más'], 'correcta': 1, 'explicacion': '', 'referencia': ''}]}
LLAMADAS = {'gen': 0}

def gen_unica(n):
    """para el examen con IA: preguntas distintas en cada llamada (si no, el código las descarta por repetidas)"""
    LLAMADAS['gen'] += 1; k = LLAMADAS['gen']
    return {'preguntas': [{'subtema': f's{k}', 'enunciado': ' '.join(f'w{k}x{j}y{i}' for j in range(9)) + ' ¿cuál es la respuesta correcta?', 'opciones': [f'Distractor a{k}{j}', f'CORRECTA b{k}{j}', f'Distractor c{k}{j}', f'Distractor d{k}{j}'], 'correcta': 2, 'explicacion': 'x', 'referencia': 'Ley 39/2015, art. 21'} for j in range(n) for i in [j]]}

async def reply(prov, system, user, info):
    if 'Redacta ' in user and 'preguntas NUEVAS' in user:
        if 'EXAMEN_IA' in user or 'YA REDACTADAS' in user or LLAMADAS.get('modo') == 'examen': return ('j', gen_unica(int(re.search(r'Redacta (\d+)', user).group(1))))
        return ('j', GEN)
    if 'Eres el Contradictor' in user:
        ids = re.findall(r'^id: (\S+)', user, re.M); bloques = user.split('id: ')[1:]
        return ('j', {'revisiones': [{'id': i, 'veredicto': 'mala' if 'CONTRA MALA' in b else 'ok', 'problema': 'la clave no es la correcta' if 'CONTRA MALA' in b else '', 'alternativa': 0} for i, b in zip(ids, bloques)]})
    if 'Eres la Lista de control' in user:
        ids = re.findall(r'^id: (\S+)', user, re.M)
        return ('j', {'revisiones': [{'id': i, 'veredicto': 'ok', 'fallos': [], 'nota': ''} for i in ids]})
    if 'Explica a un opositor' in user:
        return ('j', {'clave': 'IDEA CLAVE DE PRUEBA', 'explicacion': 'Porque lo dice la norma.', 'opciones': ['a', 'b', 'c', 'd'], 'aviso': '', 'repaso': 'Ley 39/2015'})
    if 'Resuelve estas preguntas' in user:
        tribunal = 'tribunal calificador' in user; out = []
        for bloque in user.split('id: ')[1:]:
            ls = bloque.strip().split('\n'); qid = ls[0].strip(); ops = [l for l in ls if re.match(r'^[1-4]\. ', l)]
            marca = 'ALTERNATIVA' if (tribunal and 'DUDOSA' in bloque) else 'CORRECTA'
            k = next((i + 1 for i, l in enumerate(ops) if marca in l), 0)
            out.append({'id': qid, 'opcion': k, 'seguridad': 90, 'motivo': 'ok'})
        return ('j', {'respuestas': out})
    return ('t', '{}')

def datos_sinteticos():
    """banco.json falso: 6 exámenes × (30 + 30 + 50 + 10 de reserva), para probar el camino de «datos reales» sin red"""
    temas = {b['id']: [t['id'] for t in CFG['temas'] if t['bloque'] == b['id']] for b in CFG['examen']['bloques']}
    pre = []
    for y in (2019, 2022, 2023, 2024, 2025, 2026):
        n = 0
        for b in CFG['examen']['bloques']:
            for k in range(b['n'] + 5):
                n += 1; tm = temas[b['id']][(k * 3 + y) % len(temas[b['id']])] if k % 17 else b['id'] + '-otros'
                pre.append({'id': f'{y}-0-{n:03d}', 'anio': y, 'n': n, 'parte': b['parte'], 'reserva': k >= b['n'], 'bloque': b['id'], 'tema': tm, 'enunciado': f'Enunciado oficial {y} {n} del tema {tm}', 'opciones': ['o1', 'o2', 'o3', 'o4'], 'correcta': 1 + n % 4, 'anulada': n == 5, 'imagen': n == 40, 'plantilla': 'provisional' if y == 2022 else 'definitiva', 'metodo': 'ia'})
    return {'generado': '2026-11-16T00:00:00+00:00', 'oposicion': 'auxiliar-age', 'examenes': [{'anio': y, 'ok': True, 'preguntas': 120, 'con_respuesta': 119, 'anuladas': 1, 'por_parte': {'p1': 60, 'p2': 50}, 'reserva': 10, 'plantilla_tipo': 'provisional' if y == 2022 else 'definitiva', 'cotejo': {'coincide': True, 'publicadas': 1, 'fuente': 'https://example.org'} if y == 2024 else None} for y in (2019, 2022, 2023, 2024, 2025, 2026)] + [{'anio': 2016, 'ok': False, 'excluido': True, 'error': 'excluido: escaneado'}], 'preguntas': pre}

async def main():
    ok = True
    def check(nombre, cond, extra=''):
        nonlocal ok; ok &= bool(cond); print(('✓' if cond else '✕'), nombre, extra)
    async with Harness(ROOT / 'index.html', reply) as h:
        p = h.page
        check('CSP bloquea otros orígenes', await h.csp_bloquea())
        check('sin errores al cargar', not h.errors, str(h.errors))
        check('portada: aviso de demostración', 'demostración' in await p.inner_text('#estadoDatos'))
        cards = await p.locator('#oposGrid .oo-op').count()
        check('portada: 5 oposiciones, 1 activa y 4 próximamente', cards == 5 and await p.locator('#oposGrid .oo-op[aria-disabled]').count() == 4)
        await p.click('#oposGrid [data-op="correos"]', force=True); await p.wait_for_timeout(200)
        check('una oposición próxima no se puede elegir', await p.evaluate('DATA.op') == 'auxiliar-age')
        est = await p.inner_text('#estructura')
        check('estructura del examen: 30 + 30 + 50, 90 minutos, penalización', all(x in est for x in ('30', '50', '90 minutos', 'tercio')), est[:200])
        check('sin cuenta atrás inventada', 'sin publicar' in est)
        check('chip de la oposición en la barra', 'Auxiliar AGE' in await p.inner_text('#opChip'))
        await h.shot(str(OUT / '0_inicio.png'))
        # predicción
        await p.click('#btnStart'); await p.wait_for_timeout(300)
        check('predicción: tres bloques', await p.locator('#predBloques .oo-bloque').count() == 3)
        sumas = await p.evaluate('Object.fromEntries(Object.entries(PRED).map(([k,v])=>[k,Math.round(v.filas.reduce((a,f)=>a+f.n,0)*1000)/1000]))')
        check('predicción suma 30 / 30 / 50', sumas == {'b1': 30, 'psico': 30, 'b2': 50}, str(sumas))
        check('una fila por tema del bloque', await p.locator('#predBloques .oo-bloque').nth(0).locator('tbody tr').count() == 16 and await p.locator('#predBloques .oo-bloque').nth(2).locator('tbody tr').count() == 12)
        check('validación a ciegas por bloque', (await p.inner_text('#predBloques')).count('a ciegas') == 3)
        await h.shot(str(OUT / '1_prediccion.png'))
        fn = await h.descarga('#btnCsvPred', str(OUT / 'pred.csv')); check('CSV de la predicción', fn.endswith('.csv') and 'Constitución' in (OUT / 'pred.csv').read_text(encoding='utf-8-sig'))
        await p.click('#predBloques [data-practica="b1-11"]'); await p.wait_for_timeout(300)
        check('«Practicar» lleva al simulacro del tema', await p.evaluate('step') == 2 and await p.input_value('#simModo') == 'tema:b1-11')
        # simulacro completo (demo: las 15 de ejemplo)
        await p.select_option('#simModo', 'probable'); await p.select_option('#simN', '0'); await p.click('#btnSim'); await p.wait_for_timeout(300)
        nq = await p.evaluate('S.sim.qs.length'); check('simulacro completo con lo disponible en la demo', nq == 15, str(nq))
        bl = await p.evaluate('S.sim.qs.map(preg).map(q=>q.bloque)')
        check('bloques en el orden del examen real', bl == sorted(bl, key=['b1', 'psico', 'b2'].index), str(bl))
        check('reloj al ritmo del examen (90 min / 110)', re.search(r'\d+:\d\d', await p.inner_text('#reloj') or '') and await p.evaluate('S.sim.limite') == round(15 * 90 * 60 / 110))
        for i in range(nq):
            await p.click('#simExamen .om-op[data-op="2"]'); await p.wait_for_timeout(50)
        await p.click('#simExamen [data-fin]'); await p.wait_for_timeout(300)
        sc = await p.evaluate('puntua(S.sim.qs.map(preg), S.sim.resp, EX())')
        check('puntuación con penalización de 1/3', abs(sc['directa'] - (sc['ac'] - sc['fa'] / 3)) < 0.01 and sc['ac'] + sc['fa'] + sc['bl'] == nq, str({k: sc[k] for k in ('ac', 'fa', 'bl', 'directa')}))
        txt = await p.inner_text('#simExamen')
        check('resultado con nota por partes', 'Primera parte' in txt and 'Segunda parte' in txt and 'directa' in txt)
        await h.shot(str(OUT / '2_simulacro.png'))
        # reto diario
        await p.evaluate('go(5)'); await p.wait_for_timeout(300)
        n = await p.evaluate('S.reto.qs.length'); check('reto con 10 preguntas', n == 10, str(n))
        for i in range(n):
            await p.click('#retoQ .om-op[data-op="2"]'); await p.wait_for_timeout(50)
            if i < n - 1: await p.click('#retoQ [data-mov="1"]'); await p.wait_for_timeout(30)
        txt = await p.inner_text('#retoBox pre')
        check('reto terminado con texto para compartir y racha', 'Reto #' in txt and 'Auxiliar AGE' in txt and re.search('[🟩🟥]', txt) and await p.evaluate("S.racha['auxiliar-age'].n") == 1, txt)
        await h.shot(str(OUT / '4_reto.png'))
        # generador con agentes
        await p.evaluate("go(3)"); await p.wait_for_timeout(200)
        check('generador: los 31 temas en el desplegable', await p.locator('#genTema option').count() == 31)
        await p.select_option('#genTema', 'b1-11')
        await p.click('#btnGen'); await p.wait_for_selector('#mIA.on')
        await p.fill('#apiKey', 'sk-test-clave-larga-de-prueba-123'); await p.keyboard.press('Escape')
        await p.select_option('#genN', '10'); await p.click('#btnGen'); await p.wait_for_selector('#mEnvio.on')
        env = await p.inner_text('#envioTxt')
        check('aviso previo con muestra de lo que sale', 'preparador experto' in env and 'Procedimiento administrativo' in env)
        await p.check('#envioOk'); await p.click('#envioSi')
        await h.esp('S.genStats !== null')
        st = await p.evaluate('S.genStats')
        check('panel: de 10 pedidas y 6 redactadas, 1 aceptada, 1 dudosa y 8 descartadas (4 por el panel o el código, 4 que no llegaron)', (st['aceptadas'], st['dudosas'], st['descartadas']) == (1, 1, 8), json.dumps(st, ensure_ascii=False))
        mot = ' '.join(st['motivos'])
        check('el código descarta formato erróneo y copia del banco', 'opciones repetidas' in mot and 'se parece demasiado' in mot, mot)
        check('se descarta la clave equivocada aunque la diga el redactor', 'ninguno de los dos resolutores' in mot)
        check('el Contradictor descarta aunque los resolutores coincidan', 'descartada por el panel' in mot)
        check('cinco llamadas a la IA (redactor, 2 resolutores, Contradictor y Lista)', len(h.seen) == 5, str(len(h.seen)))
        res = await p.evaluate("S.gen.find(g=>g.estado==='aceptada').resolutores.map(r=>r.opcion)")
        check('las opciones barajadas se devuelven a su número original', res == [2, 2], str(res))
        await h.shot(str(OUT / '3_generador.png'))
        fn = await h.descarga('#btnGenWord', str(OUT / 'gen.docx')); check('Word de las preguntas aceptadas', fn.endswith('.docx') and (OUT / 'gen.docx').read_bytes()[:2] == b'PK')
        fn = await h.descarga('#btnGenGift', str(OUT / 'gen.gift.txt')); check('GIFT para Moodle', '=CORRECTA buena' in (OUT / 'gen.gift.txt').read_text())
        # «¿Por qué?» sobre una pregunta del reto (ya respondida)
        await p.evaluate('go(5)'); await p.wait_for_timeout(300)
        await p.click('#retoQ [data-porque]'); await h.esp("document.querySelector('#retoQ .om-expbox') !== null")
        check('«¿Por qué?»: explicación anclada a la respuesta de la plantilla', 'IDEA CLAVE DE PRUEBA' in await p.inner_text('#retoQ') and 'Respuesta de la plantilla:' in h.seen[-1].get('user', '') if isinstance(h.seen[-1], dict) else 'IDEA CLAVE DE PRUEBA' in await p.inner_text('#retoQ'))
        check('la explicación se guarda (no se paga dos veces)', await p.evaluate('Object.keys(S.explic).length') == 1)
        # examen completo con IA (25 preguntas), con relleno de oficiales
        LLAMADAS['modo'] = 'examen'
        await p.evaluate('go(4)'); await p.wait_for_timeout(200)
        check('examen con IA: estimación de llamadas antes de empezar', 'llamadas' in await p.inner_text('#exEstima'))
        await p.select_option('#exN', '25'); await p.click('#btnExGen')
        await h.esp("S.examenIA && S.examenIA.estado === 'listo'", n=400)
        X = await p.evaluate('({n: S.examenIA.n, ia: S.examenIA.preguntas.filter(q=>q.ia).length, tot: S.examenIA.preguntas.length, bl: [...new Set(S.examenIA.preguntas.map(q=>q.bloque))].length})')
        check('examen con IA: 25 preguntas del panel en los tres bloques', X['n'] == 25 and X['ia'] == 25 and X['bl'] == 3, str(X))
        await p.click('#btnExSim'); await p.wait_for_timeout(300)
        check('examen con IA: simulacro con bloques en orden', await p.evaluate('S.sim.ia') and await p.evaluate("(b=>b.join()===[...b].sort((x,y)=>['b1','psico','b2'].indexOf(x)-['b1','psico','b2'].indexOf(y)).join())(S.sim.qs.map(preg).map(q=>q.bloque))"))
        LLAMADAS['modo'] = None
        await h.shot(str(OUT / '9_examen_ia.png'))
        await p.evaluate('go(9)'); await p.wait_for_timeout(200)
        check('Mis generadas: el examen y las preguntas sueltas', await p.locator('#miasEx .om-fila').count() == 1 and await p.locator('#miasGen details').count() == 2)
        fn = await h.descarga('#btnMiasCopia', str(OUT / 'mias.json')); check('copia JSON de Mis generadas', json.loads((OUT / 'mias.json').read_text())['oposicion'] == 'auxiliar-age')
        await p.evaluate('go(10)'); await p.wait_for_timeout(200)
        check('Tu clave de IA: guía y coste con el examen completo', 'platform.openai.com' in await p.inner_text('#clavePasos') and 'llamadas' in await p.inner_text('#claveCoste'))
        await p.reload(); await p.wait_for_timeout(700)
        check('al recargar se conservan racha, preguntas y examen generado', await p.evaluate("S.racha['auxiliar-age'].n") == 1 and await p.evaluate('S.gen.length') == 2 and await p.evaluate('S.archivo.length') == 1 and await p.evaluate('S.examenIA === S.archivo[0]'))
        # estado por oposición: aparcar y recuperar
        r = await p.evaluate("(()=>{ const g=S.gen.length; aparcaOp(); activaOp('otra-op'); const vacio=S.gen.length===0&&S.archivo.length===0; aparcaOp(); activaOp('auxiliar-age'); return vacio && S.gen.length===g && S.archivo.length===1; })()")
        check('estado por oposición: cada una guarda su estudio aparte', r)
        # idiomas
        falt = await h.faltan_traducciones(); check('no faltan traducciones', falt == [], str(falt[:8]))
        await h.idioma('en'); await p.evaluate('go(1)'); await p.wait_for_timeout(300)
        tx = await p.inner_text('#predBloques'); check('en inglés: bloques y temas traducidos', 'Block I' in tx and 'Spanish Constitution' in tx and 'Topic' in tx)
        await h.idioma('pt'); await p.evaluate('go(0)'); await p.wait_for_timeout(300); check('en portugués: portada traducida', 'Escolha o seu concurso' in await p.inner_text('section[data-step="0"]'))
        for s in range(2, 11):
            await p.evaluate(f'go({s})'); await p.wait_for_timeout(120)
        await h.idioma('es')
        check('sin errores de página', not h.errors, str(h.errors))
        check('móvil sin desborde (portada)', not await h.desborde_movil())
        check('móvil sin desborde (predicción)', not await h.desborde_movil('go(1)'))
        check('móvil sin desborde (simulacro en marcha)', not await h.desborde_movil("creaSim('x',10,'probable','real');go(2)"))
        for pas, nom in ((6, 'mi estudio'), (7, 'banco'), (8, 'validación'), (9, 'mis generadas'), (10, 'tu clave')):
            check(f'móvil sin desborde ({nom})', not await h.desborde_movil(f'go({pas})'))
        await p.set_viewport_size({'width': 390, 'height': 844}); await p.evaluate('go(0)'); await h.shot(str(OUT / '5_movil_inicio.png'))
        await p.evaluate('go(1)'); await h.shot(str(OUT / '6_movil_pred.png')); await p.set_viewport_size({'width': 1360, 'height': 900})
    # ── con datos «reales» (sintéticos) servidos como data/auxiliar-age/banco.json ──
    js = json.dumps(datos_sinteticos())
    fake = "const _f=window.fetch;window.fetch=(u,o)=>String(u).includes('banco.json')?Promise.resolve(new Response(" + json.dumps(js) + ",{status:200,headers:{'content-type':'application/json'}})):_f(u,o);"
    async with Harness(ROOT / 'index.html', reply, init_scripts=[fake]) as h:
        p = h.page; await p.wait_for_timeout(500)
        check('con banco.json: modo real', await p.evaluate('DATA.real') and 'Banco oficial' in await p.inner_text('#estadoDatos'))
        check('aviso de plantilla provisional en portada', 'provisional: 2022' in await p.inner_text('#estadoDatos'))
        check('predicción para el examen de 2027', await p.evaluate('objetivo()') == 2027)
        check('reserva y «sin tema» no entran en la predicción', not await p.evaluate("Object.values(PRED).some(b=>b.filas.some(f=>/-otros$/.test(f.id)))") and await p.evaluate("Object.values(PRED.b1.conteos[2026]).reduce((a,v)=>a+v,0)") < 30)
        v = await p.evaluate('PRED.b2.val'); check('validación a ciegas en 2024-2026', v and [o['anio'] for o in v['porAnio']] == [2024, 2025, 2026], str(v and v['porAnio']))
        await p.evaluate("creaSim('reto-amigo', 0, 'probable', 'real', 0)"); a = await p.evaluate('S.sim.qs')
        check('simulacro completo: 110 preguntas, 30/30/50', len(a) == 110 and await p.evaluate("['b1','psico','b2'].map(b=>S.sim.qs.map(preg).filter(q=>q.bloque===b).length).join()") == '30,30,50')
        await p.evaluate("creaSim('reto-amigo', 0, 'probable', 'real', 0)"); b = await p.evaluate('S.sim.qs')
        check('misma semilla → mismas 110 preguntas', a == b)
        check('sin anuladas, con tabla ni reserva sin respuesta', await p.evaluate("S.sim.qs.map(preg).every(q=>!q.anulada&&!q.imagen&&q.correcta)"))
        await p.evaluate("creaSim('x', 50, 'parte:p2', 'real', 2024)")
        check('segunda parte desde 2024', await p.evaluate("S.sim.qs.map(preg).every(q=>q.bloque==='b2'&&q.anio>=2024)") and await p.evaluate('S.sim.qs.length') == 50)
        await p.evaluate("creaSim('reto-amigo', 0, 'probable', 'real', 0)")
        url = await p.evaluate('enlaceSim(S.sim)'); check('enlace para retar con la oposición', '?op=auxiliar-age&sim=reto-amigo&n=110' in url, url)
        await p.goto((ROOT / 'index.html').as_uri() + '?op=auxiliar-age&sim=reto-amigo&n=110&m=probable&d=0'); await p.wait_for_timeout(700)
        check('abrir el enlace reproduce el mismo examen', await p.evaluate('S.sim.qs') == a and await p.evaluate('step') == 2)
        await p.evaluate("go(2)"); await p.click('#simExamen .om-op[data-op="1"]'); await p.wait_for_timeout(100)
        check('pregunta con año del examen y aviso de plantilla provisional al corregir', 'Examen 20' in await p.inner_text('#simExamen'))
        await p.goto((ROOT / 'index.html').as_uri() + '?op=auxiliar-age&reto'); await p.wait_for_timeout(600)
        check('?reto abre el reto diario', await p.evaluate('step') == 5)
        for i in range(10):
            await p.click('#retoQ .om-op[data-op="2"]'); await p.wait_for_timeout(40)
            if i < 9: await p.click('#retoQ [data-mov="1"]'); await p.wait_for_timeout(25)
        n = await p.evaluate('Object.keys(S.hist).length'); check('las respuestas del reto entran en el historial', n == 10, str(n))
        fallos = await p.evaluate("Object.values(S.hist).filter(e=>e.ko).length")
        await p.evaluate('go(6)'); await p.wait_for_timeout(300)
        check('Mi estudio: los fallos están en el repaso', f'Preguntas en tu repaso: {fallos}' in await p.inner_text('#repasoBox'), await p.inner_text('#repasoBox'))
        check('Mi estudio: plan con una fila por tema', await p.locator('#planBox tbody tr').count() == len([t for t in CFG['temas']]) - 0 or await p.locator('#planBox tbody tr').count() > 20)
        await h.shot(str(OUT / '10_estudio.png'))
        # banco: examen oficial de un año y buscador
        await p.evaluate('go(7)'); await p.wait_for_timeout(300)
        check('banco: un examen por año', await p.locator('#bancoAnio option').count() == 6)
        await p.select_option('#bancoAnio', '2026'); await p.click('#btnAnio'); await p.wait_for_timeout(300)
        r = await p.evaluate('({n: S.sim.qs.length, anio: S.sim.anio, res: S.sim.qs.map(preg).some(q=>q.reserva||q.anulada||q.imagen)})')
        check('examen oficial de 2026: puntuables sin reserva, anuladas ni tablas', r['anio'] == 2026 and r['n'] == 108 and not r['res'], str(r))
        check('enlace del examen por año', '&anio=2026' in await p.evaluate('enlaceSim(S.sim)'))
        await p.evaluate('go(7)'); await p.fill('#busTexto', 'Enunciado oficial 2024'); await p.wait_for_timeout(500)
        check('buscador por palabras y año', 'preguntas oficiales con respuesta' in await p.inner_text('#busRes') and await p.locator('#busRes .om-res').count() == 25)
        await p.select_option('#busTema', 'b2-09'); await p.wait_for_timeout(200)
        check('buscador por tema', all('Excel' in x for x in await p.locator('#busRes .om-res small').all_inner_texts()))
        # validación
        await p.evaluate('go(8)'); await p.wait_for_timeout(300)
        vt = await p.inner_text('#valTabla')
        check('validación: tabla de exámenes con cotejo y plantilla provisional', 'coincide' in vt and 'provisional' in vt and '60 + 50' in vt, vt[:200])
        check('validación: exámenes apartados y su motivo', 'apartado: escaneado' in await p.inner_text('#valLista'))
        check('validación: fiabilidad de la predicción por bloque', (await p.inner_text('#valPred')).count('a ciegas') == 3)
        await h.shot(str(OUT / '11_validacion.png'))
        # aviso de error desde una pregunta corregida
        await p.evaluate('go(5)'); await p.wait_for_timeout(200)
        href = await p.get_attribute('#retoQ a[href*="issues/new"]', 'href')
        check('«Avisar de un error» abre una incidencia de GitHub rellenada', href and 'oraculooposiciones/issues/new' in href and 'Auxiliar%20AGE' in href, str(href)[:120])
        await h.shot(str(OUT / '7_real_reto.png'))
        await p.evaluate('go(1)'); await p.wait_for_timeout(200); await h.shot(str(OUT / '8_real_pred.png'))
        check('sin errores de página (datos reales)', not h.errors, str(h.errors))
    print('\nTODO OK' if ok else '\nHAY FALLOS'); sys.exit(0 if ok else 1)

asyncio.run(main())
