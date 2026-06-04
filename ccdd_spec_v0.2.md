# CCDD — Especificación v0.2

**Context Contract-Driven Development**
Estándar de flujo de trabajo asistido por IA para sistemas de agentes y LLMs confiables.

| Campo | Valor |
| :--- | :--- |
| **Versión del estándar** (`ccdd_version`) | `0.2` |
| **Estado** | Borrador (Draft) |
| **Compatibilidad** | Superset de v0.1: todo contrato `ccdd_version: "0.1"` válido sigue siendo válido en v0.2 |
| **Documento base / rationale** | [`ccdd_workflow.md`](ccdd_workflow.md) (manifiesto) |
| **Historial de cambios** | [`ccdd_CHANGELOG.md`](ccdd_CHANGELOG.md) · resumen de deltas vs v0.1 en §8 |
| **Alcance** | Integridad y gobernanza del *contexto* enviado a un LLM |

> Este documento es la especificación normativa y reemplaza a `ccdd_spec_v0.1.md` (que se conserva como histórico). El manifiesto [`ccdd_workflow.md`](ccdd_workflow.md) contiene la motivación narrativa; se asume leído. Donde haya conflicto, **manda esta especificación**.

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
- Gates de regresión de contexto en CI (estructural y de contenido).
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
- **Guardrail**: validación ejecutada antes de la inferencia, con una acción `on_fail`.
- **Ensamblado** (assemble): el proceso runtime que mezcla los slots respetando el contrato y produce el **payload**.
- **Payload**: el prompt final, firmado y registrado, enviado al LLM.
- **Replay**: reproducción byte-a-byte de un payload registrado.

---

## 3. El contrato de contexto (`context.yaml`)

### 3.1. Estructura de alto nivel

```yaml
ccdd_version: "0.2"            # versión del estándar al que se conforma
contract:
  name: "support-agent"
  budget:
    model: "claude-opus-4-8"   # modelo objetivo (define el límite de tokens)
    max_tokens: 200000         # presupuesto total duro
    reserve_output: 8000       # tokens reservados para la respuesta, no asignables a slots
  slots: [ ... ]               # lista de canales (§3.2)
  guardrails: [ ... ]          # validaciones pre-inferencia (§3.3)
```

### 3.2. Slot

```yaml
slots:
  - id: environment
    priority: 0                # mayor prioridad de retención
    source: { type: static, path: "env.txt", sign: true }
    compaction: none           # crítico: nunca se trunca ni resume
    min_tokens: 200            # piso de retención (ver nota)

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

> **Semántica de `min_tokens`.** Es el mínimo que el slot debe **retener cuando su contenido es al menos así de grande**, no una exigencia de que el contenido alcance ese tamaño. El piso efectivo es `min(tamaño_real_del_contenido, min_tokens)`. Una implementación **DEBE** abortar el assemble solo si la compactación fuerza al slot por debajo de ese piso efectivo; un contenido naturalmente más pequeño que `min_tokens` **NO** es un fallo.

### 3.3. Guardrails

```yaml
guardrails:
  - id: no-secrets
    type: regex_deny
    pattern: "(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})"
    on_fail: abort             # abort | reroute | warn

  - id: valid-rag
    type: json_schema
    target_slot: rag
    schema_path: "schemas/rag.json"
    on_fail: reroute
    reroute_to: "fallback_flow"

  - id: slot-references
    type: reference_check      # {{slot:id}} apunta a slots existentes
    on_fail: abort
```

**Campos:**

| Campo | Req. | Descripción |
| :--- | :--- | :--- |
| `id` | MUST | Identificador único del guardrail. |
| `type` | MUST | `regex_deny` \| `json_schema` \| `reference_check`. |
| `on_fail` | MUST | `abort` (no se infiere) \| `reroute` (a un flujo de contingencia) \| `warn` (registra, no bloquea). |
| `pattern` | MUST si `regex_deny` | Regex que, si **coincide** en el payload, hace fallar el guardrail. |
| `target_slot`, `schema_path` | MUST si `json_schema` | El slot a validar y el esquema JSON contra el que validarlo. |
| `reroute_to` | MUST si `on_fail: reroute` | Identificador del flujo de contingencia. |

**Semántica normativa:**

- `regex_deny`: el guardrail **falla** si `pattern` coincide en el contenido ensamblado.
- `json_schema`: el guardrail **falla** si el contenido de `target_slot` no parsea como JSON o no satisface el esquema en `schema_path`.
- `reference_check`: el guardrail **falla** si una referencia entre slots apunta a un slot inexistente (verificable en `lint`).
- **Fail-closed (DEBE):** un guardrail cuyo `type` la implementación no puede ejecutar **NO DEBE** reportarse como aprobado; **DEBE** tratarse como fallido y honrar su `on_fail`. (Evita un verdict `passed` falso por una validación que nunca corrió.)

---

## 4. El ciclo de vida CCDD

Las cinco etapas del manifiesto, con sus requisitos normativos asociados (ver §5 para a qué nivel pertenece cada uno).

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

El gate `diff` compara el contrato propuesto (HEAD) contra una baseline (p. ej. `main`) y bloquea el merge ante una regresión de la postura de contexto. **Todas las reglas R1–R6 son deterministas** (sin LLM).

| Requisito | Normativo |
| :--- | :--- |
| Todo cambio de contrato/políticas dispara verificación en CI | MUST |
| **R1** — CI bloquea si baja el presupuesto disponible | MUST |
| **R2** — CI bloquea si se degrada la prioridad de un slot crítico | MUST |
| **R3** — CI bloquea si un slot pierde su criticidad (`none` → otra) | MUST |
| **R4** — CI bloquea si un estático firmado cambió sin re-firmar / perdió la firma | MUST |
| **R5** — CI bloquea si un slot `dynamic` asciende a la zona de prioridad de los críticos | MUST |
| **R6** — CI bloquea si se elimina/altera una directiva (línea) en el contenido de un slot crítico estático | MUST |
| El conjunto de reglas del gate es **determinista o auditable** | MUST |
| `diff` semántico de *reescritura* asistido por LLM (§6.3 P3) | MAY |

*Garantiza:* nadie degrada la postura de contexto —estructura **ni contenido de políticas**— sin que un gate lo frene. *No garantiza:* que el runtime respete el contrato.

> **Alcance del diff (R6 vs semántico).** R1–R5 cubren la **estructura** del contrato; R6 cubre el **contenido** de las políticas a nivel de línea (eliminación/alteración de una directiva), de forma determinista. Lo único que queda fuera es el debilitamiento de una política por **reescritura** que conserva la estructura y la cantidad de líneas pero afloja la redacción: eso requiere un diff semántico con LLM y, por su no-determinismo, **DEBERÍA** ofrecerse como check `warn`/advisory, no como gate `MUST` determinista (ver §6.3).

### 5.3. L3 · CCDD-Runtime (producción)

| Requisito | Normativo |
| :--- | :--- |
| El ensamblado trunca/resume de menor a mayor prioridad | MUST |
| Assemble **aborta** si un slot `compaction: none` no entra, o cae bajo su piso efectivo (§3.2) | MUST |
| Guardrails corren pre-inferencia; `on_fail` se respeta; tipos no ejecutables fallan-cerrado (§3.3) | MUST |
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
| + gate de CI determinista (R1–R6) | CCDD-L2 | que el runtime respeta el contrato |
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
| C2 | Degradación silenciosa de prioridad en un PR | T3 | Gate de CI (R2) | `diff` de contrato |
| C3 | Alteración de estáticos sin re-firmar | T3 | SHA-256 + `expected-hashes.json` (R4) | Comparación de hash determinista |
| C4 | Fuga de secretos hacia el LLM | T1, T2 | Guardrail `regex_deny` (`on_fail: abort`) | Determinista (regex) |
| C5 | Repudio / imposibilidad de auditar | T4 | Firma + registro del payload | Replay byte-a-byte |
| C6 | **Borrado de una directiva de política re-firmando el hash** | T3 | **Diff de contenido por líneas (R6, L2)** | Comparación de líneas determinista |
| C7 | **Payload estructurado malformado/envenenado** (p. ej. RAG que rompe el formato esperado) | T2 | **Guardrail `json_schema`** | Validación de esquema determinista |

> **Sobre C1 — lo que CCDD realmente prueba:** no es "el modelo ignora la inyección", sino "**bajo estrés de presupuesto, las políticas nunca son las que se sacrifican**". Es una garantía de *orden de truncamiento*, fuerte y verificable. Debe venderse por lo que es, no como inmunidad a injection.

### 6.3. Amenazas CUBIERTAS SOLO PARCIALMENTE

| ID | Amenaza | Por qué es parcial |
| :--- | :--- | :--- |
| P1 | Prompt injection directo que **sí cabe** en presupuesto | La prioridad no hace nada: el input entra completo y compite semánticamente con las políticas. CCDD garantiza que las políticas *están presentes*, no que el modelo *las obedezca*. |
| P2 | Indirect injection vía RAG/memoria (T2) | El contenido entra por un slot `dynamic` que el contrato trata como "datos" pero el modelo puede leer como instrucciones. CCDD puede aislar el slot y validar su formato (C7), no neutralizar la inyección semántica. |
| P3 | Debilitamiento de una política por **reescritura** (misma estructura) | El borrado de directivas ya está cubierto deterministamente (C6/R6). Para la reescritura, `[v0.3-track]` el gate **detecta** deterministamente el cambio de contenido y **bloquea hasta una atestación humana** (asistida por un modelo) atada al hash nuevo — el juicio de si debilita la política lo hace una persona, fuera del gate. Esto cierra el *gating* de forma determinista; el residual es la **calidad del juicio humano**, que ninguna automatización puede garantizar. |

### 6.4. Amenazas FUERA DE ALCANCE

Una implementación conforme **NO DEBE** afirmar que aborda:

- **O1** Jailbreak del modelo base (robustez del modelo, no del contrato).
- **O2** Seguridad de las herramientas/acciones del agente (CCDD gobierna el input, no la ejecución de tool calls).
- **O3** Exfiltración en la salida (el replay audita lo enviado, no inspecciona la respuesta).
- **O4** Confidencialidad en reposo del payload firmado (firmar da integridad, no cifrado; el payload contiene el contexto en claro).
- **O5** Veracidad/envenenamiento en origen de la fuente dinámica (se valida formato, no contenido).

### 6.5. Recomendaciones normativas

- Una implementación **DEBE** tratar todo slot `dynamic` como no confiable y aislarlo estructuralmente (delimitadores no falsificables) de `system`/`policies`.
- Una implementación **NO DEBE** afirmar conformidad de seguridad si las reglas de su gate L2 no son deterministas o auditables.
- Una implementación que registre payloads **DEBE** documentar el control de confidencialidad en reposo (O4).
- La documentación de un agente CCDD **DEBERÍA** reproducir §6.4 textualmente para no inducir falsa confianza.

---

## 7. Estado y trabajo pendiente (roadmap a v0.3)

Implementado y verificado en la referencia (`ccdd_reference/`, 26 tests):

- [x] Esquema JSON formal (`ccdd_context.schema.json`), niveles L1/L2/L3, registro auditable, validación N=2.
- [x] Gate L2 con reglas R1–R6 (estructurales + diff de contenido de políticas), todas deterministas.
- [x] Guardrails `regex_deny`, `reference_check` y `json_schema`; tipos no ejecutables fail-closed.

En progreso (`[v0.3-track]`, ya en la referencia — ver `ccdd_CHANGELOG.md`):

- [x] **Atestación humana asistida por modelo** para el debilitamiento por *reescritura* (§6.3 P3). En vez de meter un LLM no-determinista dentro del gate, R6 evoluciona: el gate **detecta deterministamente** el cambio de contenido de una política y **bloquea hasta que un revisor registre una atestación** (`ccdd attest`) atada al hash del contenido nuevo (caduca si vuelve a cambiar). El juicio difuso lo hace un humano apoyado en un modelo, **fuera** del camino determinista. Esto preserva el invariante "todo gate `MUST` es determinista" y arregla la usabilidad de R6 (que en v0.2 bloqueaba todo cambio de política, incluidas mejoras).

- [x] **Firma criptográfica de la atestación (Ed25519).** La atestación se firma con la clave privada del revisor; el gate verifica contra un registro de claves públicas (`reviewers.json`) tomado de la **baseline** (no de head, para que nadie se auto-registre en el mismo PR). Cierra la suplantación y el revisor no autorizado.
- [x] **Gobernanza del registro de revisores (R7).** Aplicación recursiva del mismo mecanismo: un cambio a `reviewers.json` (añadir/revocar/rotar) debe ser atestado por un revisor ya registrado en la baseline (atestación del target `__reviewers__`). El único punto sin trust anchor es el **génesis** (primera carga del registro), que es informativo y DEBE auditarse fuera de banda — bootstrap de confianza inevitable en cualquier sistema de este tipo.
- [x] **Quórum M-de-N.** El gate exige `review_quorum` revisores distintos para un cambio de política, o `__quorum__` para el registro. Las firmas se acumulan (`attestations.json`), cada una atada al hash; una sola firma deja de ser un punto único de fallo en cambios de alto riesgo.

Abierto (objetivo v0.3):

- [ ] Tokenizador real en lugar de la aproximación `chars/4` (la lógica es agnóstica al tokenizador).
- [ ] Aislamiento estructural de slots `dynamic` (§6.5) ejecutado y verificado por la referencia (hoy es SHOULD documental).
- [ ] Caducidad temporal / revocación explícita de atestaciones (hoy solo caducan al cambiar el contenido).

---

## 8. Cambios respecto de v0.1

Resumen normativo de los deltas (detalle en [`ccdd_CHANGELOG.md`](ccdd_CHANGELOG.md)):

- **§3.3** — guardrails ahora especificados normativamente: tabla de campos, semántica por tipo, y la regla **fail-closed** para tipos no ejecutables.
- **§5.2** — el gate L2 pasa de "diff estructural" a **R1–R6**: se añade **R6** (diff de contenido de políticas a nivel de línea) como cláusula **MUST** determinista. El "diff semántico LLM" se acota a la *reescritura* y se reclasifica como `MAY`/advisory.
- **§6.2** — nuevas amenazas cubiertas **C6** (borrado de directiva re-firmando) y **C7** (payload estructurado malformado).
- **§6.3 P3** — reformulada: la parte determinista (borrado de directivas) queda resuelta por R6; solo el debilitamiento por reescritura permanece parcial.
- **§7** — roadmap reorientado a v0.3.
- Compatibilidad: los contratos `ccdd_version: "0.1"` siguen siendo válidos; v0.2 no rompe nada, solo añade cláusulas.
