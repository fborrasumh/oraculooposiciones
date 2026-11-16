#!/usr/bin/env python3
"""OráculoOposiciones · descarga los cuadernillos y plantillas oficiales de data/<oposición>/fuentes.json.

    python3 scripts/opos_fetch.py auxiliar-age            # descarga lo que falte
    python3 scripts/opos_fetch.py auxiliar-age --forzar   # vuelve a descargarlo todo

Guarda data/<op>/raw/<año>/{cuadernillo.pdf, plantilla.pdf, origen.json}. Comprueba que cada fichero sea un PDF de verdad
(las sedes devuelven a veces una página HTML de error con código 200). Si un enlace falla, prueba la variante con el
«%25» decodificado (los enlaces copiados de algunas webs vienen codificados dos veces). No inventa enlaces: lo que no
se puede descargar se anota en el informe y se arregla a mano en fuentes.json."""
import json, sys, time, pathlib, urllib.request, urllib.error, urllib.parse

R = pathlib.Path(__file__).resolve().parent.parent
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 OraculoOposiciones/1.0'


def variantes(url):
    out, u = [url], url
    for _ in range(2):
        u2 = u.replace('%25', '%')
        if u2 == u: break
        out.append(u2); u = u2
    if ' ' in url: out.append(url.replace(' ', '%20'))
    return list(dict.fromkeys(out))


def baja(url, destino):
    ultimo = ''
    for u in variantes(url):
        for intento in range(3):
            try:
                req = urllib.request.Request(u, headers={'User-Agent': UA, 'Accept': 'application/pdf,*/*'})
                with urllib.request.urlopen(req, timeout=90) as r: datos = r.read()
                if not datos.startswith(b'%PDF'): ultimo = f'{u}: no es un PDF ({datos[:60]!r})'; break
                destino.write_bytes(datos); return True, u
            except urllib.error.HTTPError as e:
                ultimo = f'{u}: HTTP {e.code}'
                if e.code in (403, 404, 410): break
            except Exception as e: ultimo = f'{u}: {type(e).__name__} {e}'
            time.sleep(3 * (intento + 1))
    return False, ultimo


def main():
    if len(sys.argv) < 2: print(__doc__); return 2
    op, forzar = sys.argv[1], '--forzar' in sys.argv
    base = R / 'data' / op
    fuentes = json.loads((base / 'fuentes.json').read_text(encoding='utf-8'))['examenes']
    fallos = 0
    for f in fuentes:
        if f.get('usar') is False: print(f"{f['anio']}: excluido ({f.get('motivo', '')})"); continue
        d = base / 'raw' / str(f['anio']); d.mkdir(parents=True, exist_ok=True)
        origen = {k: v for k, v in f.items()}
        for clave, nombre in (('cuadernillo', 'cuadernillo.pdf'), ('plantilla', 'plantilla.pdf')):
            if not f.get(clave): print(f"{f['anio']} · {clave}: sin enlace en fuentes.json"); continue
            p = d / nombre
            if p.exists() and not forzar: print(f"{f['anio']} · {clave}: ya descargado"); continue
            ok, info = baja(f[clave], p)
            print(f"{f['anio']} · {clave}: {'✓ ' + info if ok else '✕ ' + info}")
            if ok: origen[clave + '_url_usada'] = info
            else: fallos += 1
        (d / 'origen.json').write_text(json.dumps(origen, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'Descargas fallidas: {fallos}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
