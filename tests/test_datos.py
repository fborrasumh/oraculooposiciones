#!/usr/bin/env python3
"""Pruebas del extractor (sin red ni PDF): textos que imitan los cuadernillos y plantillas del INAP."""
import sys, json, pathlib
R = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(R / 'scripts'))
import opos_datos as D

cfg = json.loads((R / 'data' / 'auxiliar-age' / 'config.json').read_text(encoding='utf-8'))
fallos = 0
def ok(cond, msg):
    global fallos
    print(('✓ ' if cond else '✕ ') + msg)
    if not cond: fallos += 1

def preg(n, enun='Según la Constitución Española, ¿cuál es la mayoría de edad?', ops=('16 años.', '18 años.', '21 años.', '14 años.')):
    return f"{n}. {enun}\na) {ops[0]}\nb) {ops[1]}\nc) {ops[2]}\nd) {ops[3]}\n"

# A · numeración continua, portada con instrucciones numeradas, cabecera de página, 60 + 5 + 50 + 5
portada = "INSTRUCCIONES\n1. No abra este cuadernillo hasta que se le indique.\n2. Este cuestionario consta de dos partes.\nMadrid, 14 de diciembre de 2024\n"
cuerpo = "PRIMERA PARTE\n"
for n in range(1, 31): cuerpo += preg(n)
cuerpo += "Página 4 de 20\n"
for n in range(31, 61): cuerpo += preg(n, '¿Qué número continúa la serie 2, 6, 12, 20, 30?', ('36', '40', '42', '44'))
cuerpo += "PREGUNTAS DE RESERVA\n"
for n in range(61, 66): cuerpo += preg(n, 'El Defensor del Pueblo es elegido por las Cortes Generales por un periodo de:', ('4 años.', '5 años.', '6 años.', '3 años.'))
cuerpo += "SEGUNDA PARTE\n"
for n in range(66, 116): cuerpo += preg(n, 'En Excel 365, ¿qué función devuelve el valor máximo de un rango de celdas?', ('MAYOR', 'MAX', 'TOPE', 'CIMA'))
cuerpo += "PREGUNTAS DE RESERVA\n"
for n in range(116, 121): cuerpo += preg(n, 'En Word 365, ¿qué combinación aplica negrita?', ('Ctrl+N', 'Ctrl+K', 'Ctrl+S', 'Ctrl+B'))
tx = portada + cuerpo
qs = D.mejor_cuadernillo(tx)
ok(len(qs) == 120, f'A: 120 preguntas (salen {len(qs)}), sin las instrucciones de la portada')
ok(D.fecha_portada(tx) == '2024-12-14', 'A: fecha leída de la portada')
D.estructura(qs, cfg)
cuenta = lambda f: sum(1 for q in qs if f(q))
ok(cuenta(lambda q: q['parte'] == 'p1' and not q['reserva']) == 60, 'A: 60 de la primera parte')
ok(cuenta(lambda q: q['parte'] == 'p2' and not q['reserva']) == 50, 'A: 50 de la segunda parte')
ok(cuenta(lambda q: q['reserva']) == 10, 'A: 10 de reserva')
ok(cuenta(lambda q: q['bloque'] == 'b1') == 30 and cuenta(lambda q: q['bloque'] == 'psico') == 30, 'A: 30 Bloque I y 30 psicotécnicas por posición')
ok(all(q['bloque'] == 'b2' for q in qs if q['parte'] == 'p2'), 'A: toda la segunda parte es Bloque II')
# plantilla a columnas (lectura por filas: 1 A 21 B 41 C …), con una anulada
pl = "PLANTILLA DEFINITIVA DE RESPUESTAS\n" + '\n'.join(' '.join(f'{n}. {"ABCD"[n % 4]}' if n != 23 else '23. ANULADA' for n in (r, r + 20, r + 40, r + 60, r + 80, r + 100)) for r in range(1, 21))
segs = D.parse_plantilla(pl)
resp = D.respuestas(qs, segs)
ok(sum(1 for v in resp.values() if v) == 119 and resp[(0, 23)] == 0, 'A: plantilla en columnas → 119 respuestas y la 23 anulada')
ok(resp[(0, 2)] == 3 and resp[(0, 120)] == 1, 'A: letras a número (2 → C=3, 120 → A=1)')
ia = {}
for q in qs: q['id'] = f"x-{q['n']}"; D.asigna_tema(q, cfg, ia)
t = {q['n']: q['tema'] for q in qs}
ok(t[1] == 'b1-01', f'A: «mayoría de edad / Constitución» → tema 1 del Bloque I ({t[1]})')
ok(t[31] == 'psico-num', f'A: serie numérica → aptitud numérica ({t[31]})')
ok(t[61] == 'b1-03' and qs[60]['bloque'] == 'b1', f'A: reserva de la 1.ª parte sobre el Defensor del Pueblo → Bloque I, tema 3 ({t[61]})')
ok(t[66] == 'b2-09', f'A: función de Excel → tema 9 del Bloque II ({t[66]})')
ok(t[116] == 'b2-08', f'A: negrita en Word → tema 8 del Bloque II ({t[116]})')

# B · numeración reiniciada en la segunda parte y en la reserva; texto común de una tabla para varias psicotécnicas
tx = "PRIMERA PARTE\n" + ''.join(preg(n) for n in range(1, 31))
tx += "Con los datos de la tabla siguiente, responda a las preguntas 31 a 33.\nNombre Edad Ciudad\nAna 34 Soria\n"
tx += ''.join(preg(n, '¿Cuántas personas de la tabla viven en Soria?', ('1', '2', '3', '4')) for n in range(31, 34))
tx += ''.join(preg(n, 'Señale el sinónimo de «efímero»:', ('Duradero.', 'Pasajero.', 'Eterno.', 'Sólido.')) for n in range(34, 61))
tx += "SEGUNDA PARTE\n" + ''.join(preg(n, 'En el Explorador de archivos de Windows 11, ¿qué hace la combinación Ctrl+Mayús+N?', ('Crea una carpeta nueva.', 'Cierra la ventana.', 'Abre la papelera.', 'Renombra el archivo.')) for n in range(1, 51))
tx += "PREGUNTAS DE RESERVA\n" + ''.join(preg(n, '¿Qué protocolo cifra la navegación web?', ('HTTP', 'HTTPS', 'FTP', 'SMTP')) for n in range(1, 6))
qs = D.mejor_cuadernillo(tx)
ok(len(qs) == 115, f'B: 115 preguntas con numeración reiniciada (salen {len(qs)})')
ok(len({q['seg'] for q in qs}) == 3, 'B: tres segmentos (1.ª parte, 2.ª parte, reserva)')
ok(qs[30]['imagen'] and qs[30]['contexto'] and 'tabla' in qs[30]['contexto'].lower(), 'B: la psicotécnica de tabla queda marcada como «depende de material»')
ok(qs[32]['imagen'] and not qs[33]['contexto'] and not qs[33]['imagen'], 'B: el texto común solo se aplica a las preguntas 31-33')
ok(not qs[29]['opciones'][3].lower().count('nombre edad'), 'B: el texto de la tabla no se pega a la última opción de la pregunta anterior')
D.estructura(qs, cfg)
ok(sum(1 for q in qs if q['parte'] == 'p2' and not q['reserva']) == 50 and sum(1 for q in qs if q['reserva']) == 5, 'B: 50 de la segunda parte y 5 de reserva')
pl = "Primera parte\n" + ' '.join(f'{n} B' for n in range(1, 61)) + "\nSegunda parte\n" + ' '.join(f'{n} C' for n in range(1, 51)) + "\nReserva\n" + ' '.join(f'{n} D' for n in range(1, 6))
segs = D.parse_plantilla(pl)
ok(len(segs) == 3, f'B: plantilla con tres segmentos ({len(segs)})')
resp = D.respuestas(qs, segs)
ok(resp[(0, 1)] == 2 and resp[(1, 1)] == 3 and resp[(2, 1)] == 4, 'B: cada segmento del cuadernillo se empareja con el suyo de la plantilla')

# B2 · plantilla leída por columnas (izquierda: 1.ª parte y su reserva; derecha: 2.ª parte y su reserva), como las del INAP
pl = "Primera parte\n" + '\n'.join(f'{n}. a' for n in range(1, 61)) + "\nPreguntas de reserva\n" + '\n'.join(f'{n}. b' for n in range(1, 6)) + "\nSegunda parte\n" + '\n'.join(f'{n}. c' for n in range(1, 51)) + "\n52. d Preguntas de reserva\n" + '\n'.join(f'{n}. d' for n in range(1, 6))
segs = D.parse_plantilla(pl)
ok([len(s['resp']) for s in segs][:3] == [60, 5, 50] and segs[0]['resp'][1] == 1 and segs[2]['resp'][1] == 3, f'B2: plantilla por columnas → segmentos 60/5/50/… ({[len(s["resp"]) for s in segs]})')

# D · erratas típicas del OCR: «14, —», «aj», «bj)» y dos opciones por línea
tx = "1. De acuerdo con la Ley 50/1997, los Vicepresidentes:\naj Han de ser siempre Ministros.\nbj) Asisten sin ser miembros.\nc) Pueden ser Ministros o no.\nd) No asisten.\n2, — Según la Ley 19/2013, ¿cuánto dura el mandato del Presidente del Consejo de Transparencia?\na) Cinco años. b) Cuatro años.\nc) Seis años. d) Tres años.\n"
D.OCR_MODO = True; qs = D.parse_cuadernillo(tx); D.OCR_MODO = False
ok(len(qs) == 2 and qs[0]['opciones'][1].startswith('Asisten') and qs[1]['opciones'][1] == 'Cuatro años.', f'D: OCR con «aj», «bj)», «2,» y dos opciones por línea ({len(qs)})')

# C · formato con mayúsculas «A)» y guion de fin de línea
tx = "1. La Ley 39/2015 regula el procedimiento adminis-\ntrativo común de las Administraciones Públicas. ¿En qué plazo debe resolverse si la norma no fija otro?\nA) Un mes.\nB) Tres meses.\nC) Seis meses.\nD) Diez días.\n" + preg(2) + preg(3)
qs = D.mejor_cuadernillo(tx)
ok(len(qs) == 3 and 'administrativo común' in qs[0]['enunciado'], 'C: opciones «A)» y guion de fin de línea unido')

print(f'\n{"Todas las pruebas pasan" if not fallos else f"{fallos} pruebas fallan"}')
sys.exit(1 if fallos else 0)
