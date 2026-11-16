#!/usr/bin/env python3
"""Lista las claves de traducción que usa la app (HTML, t('…'), pasos, ayuda y textos de las configuraciones).
python3 tests/i18n_claves.py  → imprime las que faltan en src/i18n.js y en el diccionario base de Forja (en)."""
import re, json, pathlib, subprocess
R = pathlib.Path(__file__).resolve().parent.parent
def claves():
    ks = []
    body = (R/'src'/'body.html').read_text(encoding='utf-8')
    ks += re.findall(r'data-i18n="([^"]+)"', body) + re.findall(r'data-i18n-attr="[^":]+:([^"]+)"', body)
    for f in ('app.js', 'datos.js'):
        s = (R/'src'/f).read_text(encoding='utf-8')
        ks += [x.encode().decode('unicode_escape').encode('latin1').decode('utf-8') if '\\' in x else x for x in re.findall(r"\bt\('((?:[^'\\]|\\.)*)'", s)]
        m = re.search(r'const STEPS = \[(.*?)\];', s);  ks += re.findall(r"'([^']+)'", m.group(1)) if m else []
        for nombre in ('HUBS', 'NAV', 'GLOS'):
            m = re.search(r'const ' + nombre + r' = \[(.*?)\n?\];', s, re.S)
            if m: ks += re.findall(r"'((?:[^'\\]|\\.)+)'", m.group(1))
    s = (R/'src'/'nucleo.js').read_text(encoding='utf-8')
    ks += re.findall(r"fallos\.push\('([^']+)'\)", s) + ['sube', 'baja', 'estable']
    reg = json.loads((R/'data'/'oposiciones.json').read_text(encoding='utf-8'))
    for o in reg['oposiciones']:
        ks += [o['nombre'], o['organismo']]
        p = R/'data'/o['id']/'config.json'
        if o['estado'] == 'activa' and p.exists():
            c = json.loads(p.read_text(encoding='utf-8'))
            ks += [c['nombre'], c['corto'], c['convocatoria']['plazas'], c['proximo']['etiqueta']] + [t['nombre'] for t in c['temas']] + [b['nombre'] for b in c['examen']['bloques']] + [x for p_ in c['examen']['partes'] for x in (p_['nombre'], p_['minimo_txt'])]
    return list(dict.fromkeys(k for k in ks if k.strip()))
if __name__ == '__main__':
    js = (R/'src'/'i18n.js').read_text(encoding='utf-8') if (R/'src'/'i18n.js').exists() else 'const I18N={en:{},pt:{}};'
    base = (R/'forja'/'js'/'65-i18n.js').read_text(encoding='utf-8')
    prog = base.split('const _dict')[0].replace('let LANG', 'var LANG') + '\n' + js + '\nconst K=' + json.dumps(claves(), ensure_ascii=False) + ';\nfor (const l of ["en","pt"]) { const d={...(I18N_BASE[l]||{}),...(I18N[l]||{})}; for (const k of K) if (d[k]===undefined) console.log(l+"\\t"+k); }'
    out = subprocess.run(['node', '-e', 'const APP="x";' + prog], capture_output=True, text=True)
    print(out.stdout or 'Completo', out.stderr[:2000])
