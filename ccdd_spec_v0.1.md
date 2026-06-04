# CCDD — Especificación v0.1

**Context Contract-Driven Development**
Estándar de flujo de trabajo asistido por IA para sistemas de agentes y LLMs confiables.

| Campo | Valor |
| :--- | :--- |
| **Versión del estándar** (`ccdd_version`) | `0.1` |
| **Estado** | Borrador (Draft) |
| **Documento base / rationale** | [`ccdd_workflow.md`](ccdd_workflow.md) (manifiesto) |
| **Alcance** | Integridad y gobernanza del *contexto* enviado a un LLM |

> Este documento es la especificación normativa. El manifiesto [`ccdd_workflow.md`](ccdd_workflow.md) contiene la motivación narrativa y la comparativa de metodologías; se asume leído. Donde haya conflicto, **manda esta especificación**.

---

## 0. Convenciones

Las palabras clave **DEBE / NO DEBE / DEBERÍA / PUEDE** (MUST / MUST NOT / SHOULD / MAY) se interpretan según su uso convencional en especificaciones: **DEBE** = requisito de conformidad; **DEBERÍA** = recomendado, omitible con justificación; **PUEDE** = opcional.

Una afirmación de conformidad ("agente conforme a CCDD-L2") es válida solo si se satisface el conjunto **completo** de cláusulas DEBE del nivel declarado (ver §5).

---

## 1. Motivación y alcance

### 1.1. Problema
En software clásico los límites del sistema se fijan con tipos y contratos de API (OpenAPI, Protobuf). En sistemas con IA generativa la única palanca real de control sobre el comportamiento del modelo es el **contexto**. Hoy ese contexto suele vivir como prompts monolíticos en el código: no versionado de forma significativa, no testeable, sin gates de regresión.

### 1.2. Propuesta
CCDD eleva el contexto a **artefacto de ingeniería de primer nivel**: declarativo, firmado, versionado y verificable en CI y en runtime. El artefacto central es el **contrato de contexto** (`context.yaml`, §3).

### 1.3. Dentro de alcance
- Declaración de los canales de información (slots) que alimentan al modelo.
- Asignación de presupuesto de tokens por prioridad.
- Integridad criptográfica de las directivas estáticas.
- Gates de regresión de contexto en CI.
- Guardrails deterministas pre-inferencia.
- Auditoría y reproducción del payload ensamblado.

### 1.4. Fuera de alcance
CCDD **NO** es un sistema de seguridad integral del agente. Quedan fuera (ver §6 para el detalle): robustez del modelo frente a jailbreak, seguridad de la ejecución de herramientas, filtrado de la *salida* del modelo, y veracidad del contenido de fuentes dinámicas. Una implementación conforme **NO DEBE** afirmar que cubre estos vectores.

---

## 2. Terminología

- **Contrato de contexto**: el archivo `context.yaml` que declara slots, presupuesto y guardrails.
- **Slot**: un canal nombrado de información con prioridad, fuente y política de compactación. Es la unidad de composición del contexto.
- **Prioridad** (`priority`): entero ≥ 0. **Menor número = mayor prioridad de retención**: bajo presión de tokens, los slots de número *mayor* se truncan/resumen primero. `0` es lo más protegido.
- **Slot crítico**: todo slot con `compaction: none`. Sus directivas no pueden truncarse ni resumirse.
- **Presupuesto** (`budget`): los tokens totales disponibles para el modelo objetivo, menos la reserva de salida.
- **Compactación**: política aplicada a un slot cuando hay presión de tokens — `none`, `summarize` (heurística, no-determinista) o `truncate` (determinista).
- **Guardrail**: validación determinista ejecutada antes de la inferencia, con una acción `on_fail`.
- **Ensamblado** (assemble): el proceso runtime que mezcla los slots respetando el contrato y produce el **payload**.
- **Payload**: el prompt final, firmado y registrado, enviado al LLM.
- **Replay**: reproducción byte-a-byte de un payload registrado.

---

## 3. El contrato de contexto (`context.yaml`)

### 3.1. Estructura de alto nivel

```yaml
ccdd_version: "0.1"            # versión del estándar al que se conforma
contract:
  name: "support-agent"
  budget:
    model: "claude-opus-4-8"   # modelo objetivo (define el límite de tokens)
    max_tokens: 200000         # presupuesto total duro
    reserve_output: 8000       # tokens reservados para la respuesta, no asignables a slots
  slots: [ ... ]               # lista de canales (§3.2)
  guardrails: [ ... ]          # validaciones deterministas pre-inferencia (§3.3)
```

### 3.2. Slot

```yaml
slots:
  - id: environment
    priority: 0                # mayor prioridad de retención
    source: { type: static, path: "env.txt", sign: true }
    compaction: none           # crítico: nunca se trunca ni resume
    min_tokens: 200            # piso garantizado; si no entra, el assemble FALLA

  - id: system
    priority: 1
    source: { type: static, path: "system.txt", sign: true }
    compaction: none
    min_tokens: 1500

  - id: policies
    priority: 1                # mismo nivel crítico que system
    source: { type: static, path: "policies.txt", sign: true }
    compaction: none

  - id: memory
    priority: 2
    source: { type: dynamic, provider: "session_memory" }
    compaction: summarize      # heurístico / no-determinista
    max_tokens: 4000

  - id: rag
    priority: 3
    source: { type: dynamic, provider: "vector_search", k: 8 }
    compaction: truncate       # determinista: drop de los menos relevantes
    max_tokens: 12000

  - id: user_message
    priority: 4                # menor prioridad de retención
    source: { type: runtime }
    compaction: truncate
```

**Campos:**

| Campo | Req. | Descripción |
| :--- | :--- | :--- |
| `id` | MUST | Identificador único del slot. |
| `priority` | MUST | Entero ≥ 0. Ver §2. |
| `source.type` | MUST | `static` \| `dynamic` \| `runtime`. |
| `source.sign` | MUST en `static` | Si `true`, el contenido se firma (§4). |
| `compaction` | MUST | `none` \| `summarize` \| `truncate`. |
| `min_tokens` | SHOULD en críticos | Piso de **retención**, acotado al tamaño real del contenido (ver nota). |
| `max_tokens` | MAY | Techo de asignación del slot. |

> **Semántica de `min_tokens`.** Es el mínimo que el slot debe **retener cuando su contenido es al menos así de grande**, no una exigencia de que el contenido alcance ese tamaño. El piso efectivo es `min(tamaño_real_del_contenido, min_tokens)`. Una implementación **DEBE** abortar el assemble solo si la compactación fuerza al slot por debajo de ese piso efectivo; un contenido naturalmente más pequeño que `min_tokens` **NO** es un fallo. (Esta aclaración surgió de validar el estándar contra un segundo contrato: un slot de datos truncable con piso —p. ej. el diff de un agente de revisión— se comporta distinto a un slot crítico, donde el contenido siempre se retiene entero.)

### 3.3. Guardrails

```yaml
guardrails:
  - id: no-secrets
    type: regex_deny
    pattern: "(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})"
    on_fail: abort             # abort | reroute | warn

  - id: valid-json-slot
    type: json_schema
    target_slot: rag
    schema_path: "schemas/rag.json"
    on_fail: reroute
    reroute_to: "fallback_flow"

  - id: slot-references
    type: reference_check      # {{slot:id}} apunta a slots existentes
    on_fail: abort
```

---

## 4. El ciclo de vida CCDD

Las cinco etapas del manifiesto, ahora con sus requisitos normativos asociados (ver §5 para a qué nivel pertenece cada uno).

1. **Diseñar el contrato** — se declara `context.yaml` (§3).
2. **Firmar y verificar en local** — se generan firmas SHA-256 de los slots `static` con `sign: true`, se persisten en `expected-hashes.json`, y `lint` valida referencias y presupuestos.
3. **Integración continua de contexto (CCI)** — cada cambio de contrato dispara gates en CI (§5, L2).
4. **Orquestación y guardrails en caliente** — el ensamblado runtime respeta prioridades y corre guardrails antes de inferir (§5, L3).
5. **Auditoría y reproducción** — el payload se firma, registra y es reproducible byte-a-byte.

---

## 5. Niveles de conformidad

La adopción es gradual. Cada nivel **incluye** al anterior. El claim cita el nivel: *"conforme a CCDD-L2"*.

```
L1 · CCDD-Core      Contrato + lint + firmas (dev-time)
L2 · CCDD-CI        L1 + gate de regresiones en CI
L3 · CCDD-Runtime   L2 + ensamblado, guardrails y auditoría
```

### 5.1. L1 · CCDD-Core (dev-time)

| Requisito | Normativo |
| :--- | :--- |
| Existe un `context.yaml` válido contra el esquema (§3) | MUST |
| Todo slot tiene `priority` y `compaction` explícitas | MUST |
| `lint` pasa: sin referencias rotas entre slots, dentro de presupuesto | MUST |
| Slots `static` con `sign: true` firmados (SHA-256) en `expected-hashes.json` | MUST |
| Aislamiento estructural de slots `dynamic` vs `system`/`policies` (§6) | SHOULD |

*Garantiza:* contexto declarado y versionado. *No garantiza:* nada en runtime.

> **Nota sobre la verificación de presupuesto en `lint`.** `lint` comprueba que el costo de los slots críticos (`compaction: none`) entra en el presupuesto. Para slots críticos **estáticos** mide el tamaño real, por lo que la verificación es exacta. Para un slot crítico **dinámico**, su tamaño real no se conoce hasta runtime; `lint` solo puede usar `min_tokens` como cota inferior. Por tanto, para contratos con slots críticos dinámicos, `lint` es condición **necesaria pero no suficiente**: el assemble (§5.3) sigue siendo el único punto que garantiza la factibilidad real.

### 5.2. L2 · CCDD-CI (integración)

| Requisito | Normativo |
| :--- | :--- |
| Todo cambio de contrato/políticas dispara verificación en CI | MUST |
| CI bloquea si baja el presupuesto total de tokens | MUST |
| CI bloquea si baja la prioridad de un slot crítico | MUST |
| CI bloquea si un slot estático cambió sin re-firmar su hash | MUST |
| El `diff` de políticas es determinista o auditable | MUST |
| `diff` semántico asistido por LLM | MAY |

*Garantiza:* nadie degrada la postura de contexto sin que un gate lo frene. *No garantiza:* que el runtime respete el contrato.

> **Alcance del `diff` implementado (referencia).** El gate L2 de la implementación de referencia (`ccdd diff <baseline> <head>`) es un diff **estructural del contrato**, puramente determinista (sin LLM) — lo que satisface el MUST de determinismo y desactiva la objeción P3 (§6.3) para todas las reglas estructurales. Reglas bloqueantes: bajada de presupuesto disponible (R1), degradación de prioridad de un slot crítico (R2), pérdida de criticidad de un slot (R3), pérdida de firma de un estático (R4), ascenso de un slot dinámico no confiable a la zona de prioridad de los críticos (R5, §6.5), y `[v0.2-track]` eliminación/alteración de una directiva (línea) en el contenido de un slot crítico estático (R6, determinista). Lo único que queda fuera es el debilitamiento de una política por **reescritura** con la misma estructura (redacción más floja), que requiere un diff semántico con LLM.

### 5.3. L3 · CCDD-Runtime (producción)

| Requisito | Normativo |
| :--- | :--- |
| El ensamblado trunca/resume de menor a mayor prioridad | MUST |
| Assemble **aborta** si un slot `compaction: none` no entra, o cae bajo `min_tokens` | MUST |
| Guardrails deterministas corren pre-inferencia; `on_fail` se respeta | MUST |
| Fallo de validación ⇒ aborto o reruta determinista (no se llama al LLM) | MUST |
| Payload ensamblado firmado y registrado con su verdict | MUST |
| Replay byte-a-byte del payload reproducible | MUST |
| Slots `summarize` declarados como no-deterministas en el manifiesto del contrato | MUST |
| Control de confidencialidad en reposo del payload registrado | SHOULD |

*Garantiza:* el ciclo cerrado completo. *No garantiza:* nada de §6.

> **Corolario del orden de prioridad.** Bajo presión de tokens, un slot no crítico puede recibir **cero** tokens y quedar excluido por completo del payload, si los slots de mayor prioridad agotan el presupuesto antes de llegar a él. Esto es comportamiento conforme, no un error: es la forma extrema de la garantía C1 (§6.2) — los slots críticos sobreviven aunque la entrada del usuario desaparezca. Una implementación **DEBERÍA** registrar en el verdict qué slots fueron desplazados a cero.

### 5.4. Regla de honestidad de conformidad

> Una implementación **NO DEBE** afirmar un nivel cuyo conjunto completo de cláusulas MUST no satisface. La conformidad parcial se reporta como el nivel **inferior** completo más una lista explícita de extras. No existen niveles intermedios ("L2.5").

| Si implementás… | Podés afirmar | NO podés afirmar |
| :--- | :--- | :--- |
| `context.yaml` + lint local | CCDD-L1 / Core | protección anti-regresión |
| + gate de CI determinista | CCDD-L2 | que el runtime respeta el contrato |
| + ensamblado/guardrails/replay | CCDD-L3 / Full | inmunidad a prompt injection (§6) |

---

## 6. Consideraciones de seguridad

CCDD es un mecanismo de **control de integridad del contexto**, no un sistema de seguridad integral. Esta sección delimita exactamente qué se cubre. *Un estándar que no declara lo que no cubre, miente por omisión.*

### 6.1. Modelo de amenaza

**Activos:** A1 integridad de directivas estáticas · A2 jerarquía de prioridad bajo presión · A3 no-repudio del payload · A4 secretos.
**Actores:** T1 usuario malicioso (controla `user_message`) · T2 fuente dinámica envenenada (indirect injection) · T3 desarrollador interno no autorizado · T4 atacante con acceso a logs.

### 6.2. Amenazas CUBIERTAS

| ID | Amenaza | Actor | Control | Verificable por |
| :--- | :--- | :--- | :--- | :--- |
| C1 | Omisión de políticas por presión de tokens | T1, T2 | `priority` + `min_tokens` + `compaction: none` | Assemble aborta si un crítico no alcanza su piso |
| C2 | Degradación silenciosa de prioridad en un PR | T3 | Gate de CI | `diff` de contrato |
| C3 | Alteración de estáticos sin re-firmar | T3 | SHA-256 + `expected-hashes.json` | Comparación de hash determinista |
| C4 | Fuga de secretos hacia el LLM | T1, T2 | Guardrail `regex_deny` (`on_fail: abort`) | Determinista (regex) |
| C5 | Repudio / imposibilidad de auditar | T4 | Firma + registro del payload | Replay byte-a-byte |

> **Sobre C1 — lo que CCDD realmente prueba:** no es "el modelo ignora la inyección", sino "**bajo estrés de presupuesto, las políticas nunca son las que se sacrifican**". Es una garantía de *orden de truncamiento*, fuerte y verificable. Debe venderse por lo que es, no como inmunidad a injection.

### 6.3. Amenazas CUBIERTAS SOLO PARCIALMENTE

| ID | Amenaza | Por qué es parcial |
| :--- | :--- | :--- |
| P1 | Prompt injection directo que **sí cabe** en presupuesto | La prioridad no hace nada: el input entra completo y compite semánticamente con las políticas. CCDD garantiza que las políticas *están presentes*, no que el modelo *las obedezca*. |
| P2 | Indirect injection vía RAG/memoria (T2) | El contenido entra por un slot `dynamic` que el contrato trata como "datos" pero el modelo puede leer como instrucciones. CCDD puede aislar el slot, no neutralizar la inyección semántica. |
| P3 | Determinismo del `diff` semántico (C2) | Si usa LLM, el gate deja de ser determinista y puede evadirse con fraseos que no marque como cambio de política. |

### 6.4. Amenazas FUERA DE ALCANCE

Una implementación conforme **NO DEBE** afirmar que aborda:

- **O1** Jailbreak del modelo base (robustez del modelo, no del contrato).
- **O2** Seguridad de las herramientas/acciones del agente (CCDD gobierna el input, no la ejecución de tool calls).
- **O3** Exfiltración en la salida (el replay audita lo enviado, no inspecciona la respuesta).
- **O4** Confidencialidad en reposo del payload firmado (firmar da integridad, no cifrado; el payload contiene el contexto en claro).
- **O5** Veracidad/envenenamiento en origen de la fuente dinámica (se valida formato, no contenido).

### 6.5. Recomendaciones normativas

- Una implementación **DEBE** tratar todo slot `dynamic` como no confiable y aislarlo estructuralmente (delimitadores no falsificables) de `system`/`policies`.
- Una implementación **NO DEBE** afirmar conformidad de seguridad si su `diff` de políticas no es determinista o auditable.
- Una implementación que registre payloads **DEBE** documentar el control de confidencialidad en reposo (O4).
- La documentación de un agente CCDD **DEBERÍA** reproducir §6.4 textualmente para no inducir falsa confianza.

---

## 7. Estado y trabajo pendiente (roadmap a v0.2)

Entregado en esta línea de trabajo:

- [x] Esquema JSON formal del `context.yaml` — [`ccdd_context.schema.json`](ccdd_context.schema.json) (JSON Schema draft 2020-12, máquina-verificable).
- [x] Implementación de referencia mínima (linter L1 + assembler L3) — [`ccdd_reference/`](ccdd_reference/), ejecutable y con escenarios de demo.
- [x] Caso aplicado que recorre lint → firma → assemble → guardrail → registro auditable (ver `ccdd_reference/README.md`).
- [x] Formato del registro de auditoría: `last-assembly.json` (payload + `payload_sha256` + verdict).
- [x] Suite de tests automatizada (19 tests, `unittest` stdlib) que verifica cada cláusula L1/L2/L3 — `ccdd_reference/tests/`.
- [x] Implementación del gate L2 (`ccdd diff`): diff estructural determinista con 5 reglas de regresión bloqueantes — `ccdd_reference/ccdd.py`.
- [x] Validación N=2: segundo contrato de dominio distinto (`contracts/code-review-agent`, agente con tools). Descubrió y corrigió un bug de semántica de `min_tokens` (ver §3.2) — la gramática aguantó el resto sin cambios.

En progreso (`[v0.2-track]`, ya en la referencia — ver `ccdd_CHANGELOG.md`):

- [x] Guardrail `json_schema` real en el runner (valida que el slot parsee como JSON y cumpla un esquema).
- [x] Gate L2 — regla R6: diff de **contenido por líneas** de slots críticos estáticos; bloquea si se elimina/altera una directiva aunque la estructura no cambie (cubre la parte determinista del diff semántico).

Aún abierto (objetivo v0.2):

- [ ] Diff semántico con **LLM** para detectar debilitamiento por *reescritura* (misma estructura, redacción más floja) — único resto de P3; reabre la frontera determinista/heurística.
- [ ] Tokenizador real en lugar de la aproximación `chars/4`.
