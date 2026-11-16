# OráculoOposiciones

Qué temas caerán en tu oposición, estimado a partir de los exámenes oficiales, con simulacros de preguntas oficiales con la estructura real del examen y un generador de preguntas nuevas revisadas por varios agentes de IA. Aplicación web de un solo fichero.

**Usar la app:** https://fborrasumh.github.io/oraculooposiciones/ (enlace directo a una oposición: `?op=auxiliar-age`)
**Idiomas:** español (por defecto), inglés y portugués. Se cambia en el selector de la barra superior o con `?lang=en` / `?lang=pt`. Las preguntas se muestran siempre en español.

## Oposiciones

| Oposición | Estado |
|---|---|
| Auxiliar Administrativo del Estado (C2, AGE) | **Disponible** |
| Tramitación Procesal y Administrativa | Próximamente |
| Policía Nacional (Escala Básica) | Próximamente |
| Guardia Civil (Cabos y Guardias) | Próximamente |
| Personal laboral de Correos | Próximamente |

Cada oposición vive en `data/<id>/`:
- `config.json`: estructura del examen, temario y palabras clave de cada tema.
- `fuentes.json`: enlaces oficiales a cuadernillos y plantillas.
- `banco.json`: preguntas extraídas; lo genera la Action.

**Añadir una oposición** es rellenar esos dos ficheros, poner `"estado": "activa"` en `data/oposiciones.json` y lanzar la Action. El código no cambia.

## Auxiliar Administrativo del Estado: el examen

Según la convocatoria vigente (Resolución de 18 de diciembre de 2025, [BOE-A-2025-26262](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-26262)), es un ejercicio único de 90 minutos con dos partes eliminatorias:

- **Primera parte (sobre 50):** 30 preguntas del Bloque I (organización pública, 16 temas) y 30 psicotécnicas.
- **Segunda parte (sobre 50):** 50 preguntas del Bloque II (actividad administrativa y ofimática, 12 temas; Windows 11 y Microsoft 365).
- **Penalización:** cada fallo resta 1/3 de un acierto.

Como la estructura es fija, **la predicción se hace dentro de cada bloque**: cómo se reparten las 30 del Bloque I entre sus 16 temas, las 30 psicotécnicas entre aptitud administrativa, numérica y verbal, y las 50 del Bloque II entre sus 12 temas.

## Qué hace

1. **Predicción por tema dentro de cada bloque**, con intervalo del 80 % y probabilidad de que el tema salga.
   - Media ponderada en la que los exámenes recientes pesan más (semivida de 3 años), más la mitad de la tendencia.
   - La tabla indica en cuántos exámenes ha salido cada tema, porque el temario cambia entre convocatorias.
2. **Cuánto fiarse.** En cada bloque se predicen a ciegas los tres últimos exámenes, cada uno solo con los anteriores.
   - Se compara con dos referencias: repetir el examen anterior y la media de todos.
   - Si no las mejora, la app lo dice.
3. **Simulacros** con preguntas oficiales:
   - Del examen completo (110 preguntas en el orden real), de una parte, de un bloque o de un tema.
   - Filtro por año («desde 2023» deja solo exámenes con Microsoft 365).
   - Puntuación directa con penalización y nota aproximada sobre 50 por parte.
   - Reloj al ritmo del examen y enlace para retar a otra persona con el mismo examen.
4. **Reto diario.** Diez preguntas oficiales, iguales para todo el mundo cada día y por oposición. Lleva racha y un resultado en emojis para compartir.
5. **Generador con agentes**, con la clave de IA de cada persona:
   - Un agente redacta preguntas de un tema y cita la norma y el artículo.
   - Recibe el contexto de exámenes anteriores: subtemas frecuentes, subtemas olvidados y seis preguntas oficiales recientes.
   - Dos agentes resuelven a ciegas con las opciones barajadas.
   - El código comprueba el formato y descarta las copias del banco oficial.
   - Solo se aceptan las preguntas que los tres responden igual.
   - Exporta a Word, CSV y Moodle (GIFT).

## Lo que no hace (límites reales)

- **No predice preguntas concretas**, solo cuántas tendrá cada tema.
- **La asignación de tema es automática.** El bloque sale de la estructura de la convocatoria (en la primera parte, las 30 primeras son del Bloque I y las 30 siguientes, psicotécnicas). El tema lo pone la IA o, si no hay clave, las palabras clave de `config.json`, y a veces se equivoca.
- **El temario y las leyes cambian.** Una pregunta de 2016 puede estar desfasada (versiones antiguas de Office o leyes modificadas). Los temas nuevos tienen pocos exámenes detrás.
- **Psicotécnicas con tabla y preguntas con imagen:** no entran en los simulacros, porque la tabla no se extrae con fiabilidad. Sí cuentan para la predicción.
- **La nota sobre 50 es aproximada.** La oficial usa una fórmula de transformación y unos mínimos que publica la Comisión Permanente de Selección en cada convocatoria.
- **Que tres agentes coincidan no garantiza que una pregunta generada sea correcta.**
- Herramienta independiente, sin relación con el INAP ni con los organismos convocantes.

## Datos: cómo se traen los exámenes al repositorio

**Actions → «Datos» → Run workflow** (`.github/workflows/datos.yml`), con la oposición (`auxiliar-age`):

1. `scripts/opos_fetch.py` descarga los cuadernillos (modelo A) y las plantillas de `data/<op>/fuentes.json`. Comprueba que cada fichero sea un PDF.
2. `scripts/opos_datos.py` hace la extracción:
   - Extrae el texto y separa preguntas y opciones a)–d).
   - Lee la plantilla y empareja la respuesta de cada pregunta, aunque la numeración se reinicie en la segunda parte o en la reserva.
   - Asigna parte, bloque y reserva, y clasifica el tema.
   - Escribe `banco.json` e `informe.md`, con preguntas, partes, reserva, respuestas leídas y anuladas de cada examen.
3. `scripts/opos_clasifica_ia.py` asigna el tema con IA (secreto `OPENAI_API_KEY`, modelo `gpt-6-luna`), ofreciendo solo los temas del bloque de cada pregunta.

Exámenes del turno libre localizados en la sede del INAP: 2015, 2016, 2017 (sin plantilla localizada), 2019, 2022 (plantilla provisional), 2023, 2024, 2025 (llamamiento extraordinario) y 2026. Los años 2015-2022 son aproximados: el flujo intenta leer la fecha de la portada del cuadernillo.

**Antes de dar los datos por buenos:**
- Revisa el informe (60 + 50 preguntas por examen en los recientes).
- Contrasta a mano al menos 20 preguntas por examen con el PDF.

Mientras no exista `banco.json`, la app funciona en **modo demostración**: recuentos ficticios y 15 preguntas escritas para la demo, todo marcado como tal.

## Privacidad

- La predicción, los simulacros, el reto, la racha y la clave de IA se quedan en el navegador.
- El generador envía al proveedor elegido el tema y unas preguntas oficiales de ejemplo, nunca datos de la persona. Antes del primer envío muestra lo que va a salir.
- Cada tanda son tres llamadas a la IA, pagadas con la clave de cada persona.

## Desarrollo y pruebas

```bash
python3 scripts/i18n_fuente.py     # regenera src/i18n.js (diccionarios en/pt)
python3 build.py                   # monta index.html (incrusta data/oposiciones.json y los config.json activos)
node tests/test_nucleo.js          # predicción por bloques, validación, simulacro, puntuación, generador
python3 tests/test_datos.py        # extractor de cuadernillos y plantillas (textos de prueba)
python3 tests/i18n_claves.py       # traducciones que faltan
python3 tests/smoke_test.py        # app completa en Chromium con IA simulada
```

## Autoría

- Fernando Borrás Rocher (Universidad Miguel Hernández de Elche) · ORCID [0000-0002-5519-4573](https://orcid.org/0000-0002-5519-4573)

De la familia de OráculoMIR y PAUsible (Fernando Borrás Rocher), adaptada a las oposiciones.

Fuente de las preguntas oficiales: cuadernillos y plantillas de respuestas publicados en la sede electrónica del INAP.

## Cómo citar

Borrás Rocher, F. (2026). *OráculoOposiciones* (v1.0.0) [Software]. https://github.com/fborrasumh/oraculooposiciones (DOI en trámite)

## Licencia

Código: MIT. Véase [LICENSE](LICENSE). Las preguntas oficiales pertenecen a su fuente (INAP y organismos convocantes) y se reproducen citándola.
