"""Prueba de OráculoOposiciones en un Chromium real con IA simulada:  python3 tests/smoke_test.py
Comprueba: modo demostración, selector de oposición, estructura del examen, predicción por bloques (30/30/50), simulacro
completo con la estructura real y la penalización de 1/3, enlace para retar, reto diario y racha, generador con tres agentes
(formato, copia del banco, discrepancias), idiomas, CSP, descargas, datos «reales» sintéticos y desborde en móvil."""
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
    {'subtema': 'dudosa', 'enunciado': LARGO + '¿cuál? (DUDOSA)', 'opciones': ['CORRECTA según el redactor', 'ALTERNATIVA', 'Otra', 'Otra más'], 'correcta': 1, 'explicacion': '', 'referencia': ''}]}

async def reply(prov, system, user, info):
    if 'Redacta ' in user and 'preguntas NUEVAS' in user: return ('j', GEN)
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
    return {'generado': '2026-11-16T00:00:00+00:00', 'oposicion': 'auxiliar-age', 'examenes': [{'anio': 2022, 'plantilla_tipo': 'provisional'}], 'preguntas': pre}

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
        await p.evaluate('go(4)'); await p.wait_for_timeout(300)
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
        await p.select_option('#genN', '5'); await p.click('#btnGen'); await p.wait_for_selector('#mEnvio.on')
        env = await p.inner_text('#envioTxt')
        check('aviso previo con muestra de lo que sale', 'preparador experto' in env and 'Procedimiento administrativo' in env)
        await p.check('#envioOk'); await p.click('#envioSi')
        await h.esp('S.genStats !== null')
        st = await p.evaluate('S.genStats')
        check('agentes: 1 aceptada, 1 dudosa, 3 descartadas', (st['aceptadas'], st['dudosas'], st['descartadas']) == (1, 1, 3), json.dumps(st, ensure_ascii=False))
        mot = ' '.join(st['motivos'])
        check('el código descarta formato erróneo y copia del banco', 'opciones repetidas' in mot and 'se parece demasiado' in mot, mot)
        check('se descarta la clave equivocada aunque la diga el redactor', 'ninguno de los dos resolutores' in mot)
        check('tres llamadas a la IA (redactor + 2 resolutores)', len(h.seen) == 3, str(len(h.seen)))
        res = await p.evaluate("S.gen.find(g=>g.estado==='aceptada').resolutores.map(r=>r.opcion)")
        check('las opciones barajadas se devuelven a su número original', res == [2, 2], str(res))
        await h.shot(str(OUT / '3_generador.png'))
        fn = await h.descarga('#btnGenWord', str(OUT / 'gen.docx')); check('Word de las preguntas aceptadas', fn.endswith('.docx') and (OUT / 'gen.docx').read_bytes()[:2] == b'PK')
        fn = await h.descarga('#btnGenGift', str(OUT / 'gen.gift.txt')); check('GIFT para Moodle', '=CORRECTA buena' in (OUT / 'gen.gift.txt').read_text())
        await p.reload(); await p.wait_for_timeout(700)
        check('al recargar se conservan racha y preguntas', await p.evaluate("S.racha['auxiliar-age'].n") == 1 and await p.evaluate('S.gen.length') == 2)
        # idiomas
        falt = await h.faltan_traducciones(); check('no faltan traducciones', falt == [], str(falt[:8]))
        await h.idioma('en'); await p.evaluate('go(1)'); await p.wait_for_timeout(300)
        tx = await p.inner_text('#predBloques'); check('en inglés: bloques y temas traducidos', 'Block I' in tx and 'Spanish Constitution' in tx and 'Topic' in tx)
        await h.idioma('pt'); await p.evaluate('go(0)'); await p.wait_for_timeout(300); check('en portugués: portada traducida', 'Escolha o seu concurso' in await p.inner_text('section[data-step="0"]'))
        for s in (2, 3, 4):
            await p.evaluate(f'go({s})'); await p.wait_for_timeout(150)
        await h.idioma('es')
        check('sin errores de página', not h.errors, str(h.errors))
        check('móvil sin desborde (portada)', not await h.desborde_movil())
        check('móvil sin desborde (predicción)', not await h.desborde_movil('go(1)'))
        check('móvil sin desborde (simulacro en marcha)', not await h.desborde_movil("creaSim('x',10,'probable','real');go(2)"))
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
        check('?reto abre el reto diario', await p.evaluate('step') == 4)
        await h.shot(str(OUT / '7_real_reto.png'))
        await p.evaluate('go(1)'); await p.wait_for_timeout(200); await h.shot(str(OUT / '8_real_pred.png'))
        check('sin errores de página (datos reales)', not h.errors, str(h.errors))
    print('\nTODO OK' if ok else '\nHAY FALLOS'); sys.exit(0 if ok else 1)

asyncio.run(main())
