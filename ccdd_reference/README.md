# CCDD — Implementación de referencia (v0.2 + v0.3-track)

Implementación mínima y auditable que vuelve **demostrable** la especificación
[`../ccdd_spec_v0.3.md`](../ccdd_spec_v0.3.md). No es producción: el tokenizador
es una aproximación (`chars/4`) y `summarize` recorta en vez de invocar un LLM.
El objetivo es probar que las cláusulas normativas son ejecutables, no ser eficiente.

## Requisitos
```
pip install pyyaml jsonschema      # L1 / L2 / L3
pip install cryptography           # solo para keygen / attest / verificación de firma (v0.3)
```

## Uso

```bash
# generar un contrato base con buenas prácticas (determinista; sin LLM)
python ccdd.py init my-agent --name my-agent --template chat   # o --template tool-agent
#   incluye una biblioteca de POLÍTICAS BASE vetada (no generada por IA); completá los .txt y `lint --sign`

# CCDD-L1 — validar contra el esquema y firmar los estáticos
python ccdd.py lint contracts/support-agent --sign

# CCDD-L1 — re-verificar firmas (sin re-firmar); avisa de contratos válidos pero flojos
python ccdd.py lint contracts/support-agent

# salida estructurada para agentes/CI (findings con severidad error/warning/info)
python ccdd.py lint contracts/support-agent --json
python ccdd.py diff contracts/support-agent contracts/support-agent-bad --json

# CCDD-L2 — gate de regresión: comparar un contrato propuesto contra la baseline
python ccdd.py diff contracts/support-agent contracts/support-agent-bad

# v0.3 — un revisor genera su par de claves y se registra (la pública va a reviewers.json)
python ccdd.py keygen contracts/support-agent --reviewer mauricio --key-out mauricio.key

# v0.3 — tras revisar el cambio (humano + modelo), lo atesta FIRMANDO con su clave privada
python ccdd.py attest contracts/support-agent policies --reviewer mauricio --key mauricio.key --note "revisado"

# CCDD-L3 — ensamblar el payload con entradas runtime
python ccdd.py assemble contracts/support-agent --inputs inputs.json

# export — el MISMO contrato al formato de cada framework (prueba la independencia tecnológica)
python ccdd.py export contracts/support-agent --format openai    --inputs inputs.json
python ccdd.py export contracts/support-agent --format anthropic --inputs inputs.json

# spec — el catálogo de reglas en JSON (el tool se auto-describe para un agente)
python ccdd.py spec
```

En Windows, exportá `PYTHONIOENCODING=utf-8` antes de correr para la salida en español.

**Lints de calidad** (advertencias que no bloquean, inspiradas en DESIGN.md): `lint` avisa de
contratos válidos pero flojos — `no-secrets-guardrail` (sin `regex_deny`), `critical-without-floor`
(slot crítico sin `min_tokens`), `unsigned-static` (estático con `sign:false`), `dynamic-in-critical-zone`
(fuente no confiable con retención de política). Con `--json` salen como findings de severidad `warning`.

## Herramientas asistidas por IA — fuera del núcleo determinista

Dos scripts viven **deliberadamente separados de `ccdd.py`** porque llaman a un LLM (LM Studio,
endpoint OpenAI-compatible) y son no-deterministas. **Ninguno tiene autoridad**: producen borradores
u opiniones que el humano revisa y firma. El núcleo `ccdd.py` no los invoca y no depende de ningún LLM.

### `draft.py` — generar contenido de dominio sobre la base vetada

Sobre un contrato creado con `ccdd init`, borronea el `system.txt` y reglas de política
**específicas del dominio** a partir de una descripción en lenguaje natural — **sin tocar la base
vetada** (solo agrega, bajo una sección marcada como borrador). Produce un borrador sin firmar.

```bash
python ccdd.py init my-agent --name my-agent           # estructura + base vetada (determinista)
python draft.py my-agent --from "agente de soporte de un banco; nunca da consejos de inversión; escala fraude a un humano"
python ccdd.py lint my-agent                           # revisás (sobre todo las políticas de dominio)
python ccdd.py lint my-agent --sign                    # cuando estás conforme, firmás VOS
```

### `review_assist.py` — ADVISORY, fuera del gate

Usa un LLM local para **ayudar al revisor humano** a juzgar si un cambio de política la
debilita. Es no-determinista y **no tiene autoridad**: no bloquea, no firma, y el gate
(`ccdd.py diff`) no lo invoca. El gate sigue exigiendo la atestación firmada del humano (R6).

```bash
pip install pyyaml          # (urllib es stdlib; no hace falta cliente OpenAI)
# con LM Studio sirviendo en http://localhost:1234
python review_assist.py <baseline_dir> <head_dir> <slot_id> [--model M] [--endpoint URL]
# config por entorno: CCDD_LLM_ENDPOINT, CCDD_LLM_MODEL
```

Salida: un veredicto `WEAKENS|NEUTRAL|STRENGTHENS` + razón + preocupaciones, con un
recordatorio explícito de que es una **opinión falible**. Si el server no está (o el modelo
tarda más que `CCDD_LLM_TIMEOUT`, default 300s), el revisor procede sin asistencia y el gate
exige su firma igual. El parser rechaza como `UNKNOWN` las respuestas que no traen un veredicto
válido (algunos modelos devuelven la plantilla de ejemplo sin rellenar).

**Lección de diseño (el prompt importa más que el modelo).** Una primera versión del prompt
preguntaba *"¿este cambio DEBILITA la política?"*. Con esa redacción, los modelos marcaban
**WEAKENS para casi cualquier cambio** —incluido un endurecimiento y una reescritura neutra— y
confabulaban razones. El defecto era del prompt (anclaje), no de los modelos. Reformulado como
una **clasificación neutral de tres vías** ("no asumas que todo cambio debilita"), la
discriminación se arregla:

| Caso de prueba | `granite-3.2-8b` | `lfm2-24b-a2b` |
| :--- | :--- | :--- |
| debilitar ("nunca"→"evita, salvo…") | WEAKENS ✓ | WEAKENS ✓ |
| endurecer (añade prohibiciones + reporte) | STRENGTHENS ✓ | STRENGTHENS ✓ |
| reescritura neutra (sinónimos) | NEUTRAL ✓ | NEUTRAL ✓ |

Notas por modelo: `granite-3.2-8b` es rápido y de formato limpio (buen default);
`lfm2-24b-a2b` (MoE ~2B activos) discrimina igual de bien; `gemma-4-12b` da el análisis más
rico pero es lento y "razona" largo (subir `max_tokens`); `qwen3.5-9b` **falló** devolviendo la
plantilla de ejemplo sin rellenar → el parser lo marca `UNKNOWN`.

Esto refuerza —no debilita— el porqué del diseño: la salida del advisory depende del **prompt**,
del **modelo** y de la **corrida**. Construirlo bien exigió una prueba de discriminación
adversaria que cazó un sesgo sutil que yo mismo introduje y que habría marcado *toda mejora*
como regresión. Por eso el LLM **informa pero no decide**, y el gate exige la firma humana.

## Tests

Suite con `unittest` (stdlib). 47 tests (L1/L2/L3 + validación N=2 + features v0.2/v0.3-track,
incluida la firma de atestaciones y la defensa contra suplantación) que mapean cada escenario
a una cláusula de la spec:

```bash
python -m unittest discover -s tests -p "test_*.py" -v
```

Cubre, entre otros: lint OK, firma, tamper (hash desalineado), presupuesto inviable, rechazo de
esquema, truncamiento por prioridad, bloqueo de secreto, aborto por slot crítico, determinismo de
replay, desplazamiento a cero, validación `json_schema`, las 9 reglas de regresión del gate L2,
atestación firmada (válida / suplantada / revisor no registrado / caducada), y gobernanza del
registro de revisores (auto-registro bloqueado / cambio atestado / génesis).

## Qué demuestra cada escenario

| Escenario | Cláusula de la spec | Resultado observable |
| :--- | :--- | :--- |
| `lint --sign` | §5.1 L1 — firmas SHA-256 | genera `expected-hashes.json` |
| `lint` tras editar un estático | §6.2 C3 — tamper | **LINT: FALLÓ** (hash no coincide) |
| `diff` good vs `support-agent-bad` | §5.2 L2 — regresiones | **DIFF: BLOQUEADO** con 5 regresiones (presupuesto, firma, prioridad, criticidad, injection) |
| reescribir política → `diff` → `keygen`+`attest` firmado → `diff` | §5.2 R6 + v0.3 | bloquea sin atestación; pasa con firma válida; **caduca** al volver a cambiar |
| atestación fabricada por un impostor (sin la clave) | v0.3 modelo de confianza | `diff` **BLOQUEA**: la firma no verifica / revisor no registrado en la baseline |
| un atacante se auto-registra en `reviewers.json` | v0.3 R7 gobernanza | `diff` **BLOQUEA**: el cambio del registro no fue atestado por un revisor existente |
| `review_quorum: 2` y solo 1 revisor firma | v0.3 quórum M-de-N | `diff` **BLOQUEA** (1/2); pasa cuando firma el segundo revisor (2/2) |
| bypass: slot crítico **nuevo** / bajar quórum / quitar guardrail | R6/R8/R9 (rev. adversaria) | `diff` **BLOQUEA** — tres vías de debilitar el contrato, todas cerradas |
| `assemble` normal | §5.3 L3 — truncamiento por prioridad | `user_message` (prio 4) se trunca; los críticos (prio 0–1) quedan `full` |
| `assemble` con presupuesto insuficiente para un crítico | §5.3 / §6.2 C1 | **ASSEMBLE: ABORTADO** |
| `assemble` con secreto en RAG (`inputs_attack.json`) | §6.2 C4 — `regex_deny` | **BLOQUEADO POR GUARDRAIL**, no se infiere |
| cualquier `assemble` | §5.3 — auditoría | `last-assembly.json` con payload + `sha256` + verdict (replay) |

## Mapa de archivos

```
ccdd.py                               CLI: init (scaffold) + lint (L1) + diff (L2) + keygen/attest (v0.3) + assemble (L3)
                                      + export (a openai/anthropic/text) + spec (catálogo de reglas)
                                      reviewers.json (claves públicas, versionado) lo genera keygen;
                                      attestations.json (firmadas, versionado) lo genera attest;
                                      *.key (claves privadas) NO se versiona
contracts/support-agent/              contrato base (la "baseline")
  context.yaml                        el contrato de contexto
  env.txt / system.txt / policies.txt slots estáticos (firmados)
  expected-hashes.json                firmas (generado por lint --sign)
  last-assembly.json                  registro auditable (generado por assemble)
contracts/support-agent-bad/          variante regresada (demo del gate L2)
contracts/code-review-agent/          segundo dominio (validación N=2, agente con tools)
draft.py                              generación de contenido de dominio asistida por IA (init->draft); fuera del núcleo
review_assist.py                      asistente de revisión ADVISORY (LM Studio); fuera del gate
tests/test_ccdd.py                    suite unittest (47 tests, solo el núcleo determinista)
inputs.json                           entradas runtime — caso normal
inputs_attack.json                    entradas runtime — secreto + injection
inputs_codereview.json                entradas runtime — code-review-agent
```

## Cobertura vs spec (qué NO hace todavía)

- El `diff` L2 cubre regresiones **estructurales (R1–R5)** + **contenido de políticas (R6)** +
  **gobernanza del registro (R7)**, todas deterministas. El debilitamiento de una política por
  *reescritura* se resuelve con atestación humana firmada (no con un LLM en el gate).
- `summarize` recorta, no resume con LLM (declarado no-determinista en §6).
- El "tokenizador" es aproximado (`chars/4`); enchufar uno real no cambia la lógica.
- El quórum **M-de-N** (`review_quorum` por slot, `__quorum__` para el registro) ya está; el
  **génesis** del registro de revisores no tiene trust anchor (bootstrap): debe auditarse fuera de banda.
- Falta: tokenizador real, caducidad temporal/revocación explícita de atestaciones.
