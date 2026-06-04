# CCDD — Hallazgos y lecciones de diseño

Este documento registra lo que **emergió de construir y atacar** la implementación de referencia,
no lo que se planeó. La especificación (`ccdd_spec_v0.3.md`) es normativa; el changelog
(`ccdd_CHANGELOG.md`) lista deltas por versión; **este documento captura el conocimiento**: qué
descubrimos al implementar, validar y romper el estándar, y cómo eso cambió el diseño.

La tesis de CCDD es la **verificabilidad adversaria**. La prueba más fuerte de esa tesis es que,
aplicada al propio proyecto, encontró cosas que ninguna cantidad de "añadir features" habría
encontrado — incluido un error mío.

---

## 1. Hallazgos al implementar (la spec se escribió desde el código)

Varias cláusulas normativas no se diseñaron en abstracto: aparecieron porque el código obligó a
tomar una decisión que la prosa había dejado ambigua.

| Hallazgo | Cómo apareció | Cláusula que generó |
| :--- | :--- | :--- |
| **Semántica de `min_tokens`** | Un slot de datos truncable con piso abortó con presupuesto de sobra porque el contenido era *más chico* que `min_tokens`. El piso confundía "retener ≥ X" con "el contenido debe medir ≥ X". | §3.2: piso efectivo = `min(tamaño_real, min_tokens)` |
| **Desplazamiento a cero** | Bajo presión de tokens, un slot de baja prioridad puede recibir 0 tokens y desaparecer del payload. No estaba documentado. | §5.3, corolario del orden de prioridad |
| **`lint` necesario-no-suficiente** | Para un slot crítico *dinámico*, `lint` no conoce el tamaño real hasta runtime. | §5.1, nota |

**Lección:** una spec que se escribe *contra una implementación que corre* es más honesta que una
que se escribe sola. El código no deja esconder las decisiones difíciles.

---

## 2. Validación N=2 (un segundo dominio rompe lo que el primero escondía)

El primer contrato (`support-agent`) hacía pasar todo. Un segundo de dominio distinto
(`code-review-agent`, agente con tools, 4 slots críticos, un slot de datos `runtime` con piso)
expuso de inmediato el bug de `min_tokens` (§1) — porque era el primer contrato con un piso en un
slot **no** crítico. Con N=1 ese bug era invisible.

**Lección:** un solo caso de ejemplo, diseñado por quien escribe el estándar, valida poco. El
segundo caso —de un dominio que no inspiró la gramática— es el que prueba si la gramática aguanta.

---

## 3. Revisión adversaria del gate (3 bypasses en lo que parecía "completo")

Tras firma + gobernanza + quórum, el modelo de confianza parecía cerrado. Una revisión adversaria
—*atacar* el gate en vez de extenderlo— encontró tres formas de **debilitar la postura sin tocar
el contenido firmado**:

| # | Bypass | Fix |
| :--- | :--- | :--- |
| 1 | Añadir un slot crítico estático **nuevo** con instrucciones maliciosas (R6 solo miraba los slots de la *baseline*) | **R6 ampliada**: evalúa los críticos de HEAD; un slot nuevo se trata como contenido desde vacío y exige atestación |
| 2 | Bajar `review_quorum: 2 → 1` para necesitar menos firmas | **R8** |
| 3 | Eliminar el guardrail `no-secrets` o debilitar su `on_fail` (`abort`→`warn`) | **R9** |

El gate pasó de 7 a **9 reglas**, todas deterministas, todas con test de regresión.

**Lección:** "añadir la siguiente feature de seguridad" y "buscar cómo evadir las que ya tengo" son
actividades distintas, y la segunda rinde más. La primera asume que el diseño es correcto; la
segunda lo verifica.

---

## 4. El asistente LLM (y el error que casi shippeo)

El último eslabón fue conectar un LLM local (LM Studio) para la pieza no-determinista: ayudar al
revisor humano a juzgar si un cambio de política la debilita. Diseño deliberado: **advisory, fuera
del gate, sin autoridad** (archivo `review_assist.py` separado de `ccdd.py`).

### 4.1. El LLM se equivoca (por eso no decide)

Primeras pruebas sobre un caso de **debilitamiento** ("nunca reveles claves" → "evita… salvo
soporte interno"):

- `granite-3.2-8b`: rápido, JSON limpio.
- `gemma-4-12b`: lento, pero el análisis más rico (detectó el vector de suplantación).
- `qwen3.5-9b`: **falló** — devolvió la plantilla de ejemplo sin rellenar (el parser ahora lo marca `UNKNOWN`).
- `lfm2-24b-a2b`: correcto y conciso.

### 4.2. El sesgo era del PROMPT, no del modelo

Una prueba de **discriminación** (debilitar / endurecer / neutro) reveló que con el prompt original
—*"¿este cambio DEBILITA?"*— los modelos marcaban **WEAKENS para casi todo**, incluido un
endurecimiento y una reescritura neutra, y confabulaban razones. Mi conclusión inicial fue "los
modelos tienen sesgo, son casi ruido". **Esa conclusión era mía y estaba equivocada.**

El defecto era de **anclaje en el prompt**. Reformulado como clasificación neutral de tres vías
("no asumas que todo cambio debilita"), `granite-8b` y `lfm2-24b` aciertan los tres casos:

| Caso | granite-3.2-8b | lfm2-24b-a2b |
| :--- | :--- | :--- |
| debilitar | WEAKENS ✓ | WEAKENS ✓ |
| endurecer | STRENGTHENS ✓ | STRENGTHENS ✓ |
| neutro | NEUTRAL ✓ | NEUTRAL ✓ |

**Lección (la más importante del proyecto).** Casi shippeo un advisory que marcaba *toda mejora de
política como regresión*. No lo cazó probar el camino feliz (el debilitamiento daba el veredicto
correcto por el motivo equivocado), sino una prueba adversaria que cruzó los tres sentidos del
cambio. La salida del LLM depende del **prompt**, del **modelo** y de la **corrida** — tres fuentes
de fragilidad. Por eso el LLM **informa pero no decide**, y el gate determinista exige la firma
humana pase lo que pase. La pieza no-determinista validó, desde su propia falibilidad, por qué
debía estar fuera del camino crítico.

---

## 5. Robusteces que los experimentos forzaron

Ninguna se planeó; todas salieron de algo que se rompió:

- `max_tokens` 400 → 800 (modelos que "razonan" agotaban el presupuesto antes del JSON).
- `CCDD_LLM_TIMEOUT` configurable (default 300s) — los modelos de razonamiento son lentos.
- Validación del veredicto en el parser — una respuesta JSON válida pero con la plantilla literal
  (o un valor fuera de `{WEAKENS, NEUTRAL, STRENGTHENS}`) se rechaza como `UNKNOWN`.
- Degradación con gracia: si el server no responde o expira, el revisor procede sin asistencia y el
  gate exige su firma igual.

---

## 6. Aprendizaje de un proyecto-primo: DESIGN.md

[DESIGN.md](https://github.com/google-labs-code/design.md) (Google Labs) es, en otro dominio, la
misma idea: un **contrato híbrido para agentes** — *tokens exactos (máquina) + prosa que explica el
porqué (humano)* — para diseño visual. Que dos proyectos llegaran a la misma forma desde dominios
distintos es evidencia de que el patrón "contrato híbrido" es real, no idiosincrásico.

Compararlos mostró que DESIGN.md estaba **más maduro en la capa de consumo por agentes**, y de ahí
tomamos dos cosas:

1. **Salida estructurada (`--json`) con severidades** (`error`/`warning`/`info`) en `lint` y `diff`.
   CCDD imprimía prosa para humanos; ahora emite findings parseables por un agente o un CI — coherente
   con el norte de "delegar a una IA": el resultado de la verificación tiene que ser *consumible por
   máquina*, no solo legible.
2. **Lints de calidad** (advertencias que no bloquean) para contratos *válidos pero flojos*:
   `no-secrets-guardrail`, `critical-without-floor`, `unsigned-static`, `dynamic-in-critical-zone`.
   Son el análogo de `missing-primary` / `contrast-ratio` de DESIGN.md, pero sobre la postura de
   contexto. Cazan justo lo que invita a alucinar/filtrar sin ser un error formal.

**Lección:** mirar un proyecto que resuelve un problema *hermano* en otro dominio rinde más que mirar
competidores directos. Lo verificable de CCDD se fortaleció copiando una buena idea de diseño, no de
seguridad.

## 7. El hilo conductor

CCDD afirma que la calidad en sistemas no-deterministas se gana con contratos verificables y
verificación adversaria. Construirlo produjo, una y otra vez, la misma forma:

> lo que parecía completo tenía un agujero, y solo *atacarlo* (no extenderlo) lo encontró —
> a veces el agujero estaba en el código, a veces en la gramática, una vez en mi propio prompt.

El núcleo determinista (gate de 9 reglas, 39 tests, sin LLM) es lo que permite que todo esto sea
**verificable**: cada hallazgo se convirtió en un test que lo fija. La pieza heurística (el
advisory LLM) vive afuera, etiquetada como falible. Esa separación no es un detalle de
implementación: es la tesis.
