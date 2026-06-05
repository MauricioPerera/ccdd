# CCDD — Especificación v0.3

**Context Contract-Driven Development**
Estándar de flujo de trabajo asistido por IA para sistemas de agentes y LLMs confiables.

| Campo | Valor |
| :--- | :--- |
| **Versión del estándar** (`ccdd_version`) | `0.3` |
| **Estado** | Borrador (Draft) |
| **Compatibilidad** | Superset de v0.2/v0.1: todo contrato anterior válido sigue siéndolo |
| **Documento base / rationale** | [`ccdd_workflow.md`](ccdd_workflow.md) (manifiesto) |
| **Historial de cambios** | [`ccdd_CHANGELOG.md`](ccdd_CHANGELOG.md) · resumen de deltas vs v0.2 en §8 |
| **Alcance** | Integridad y gobernanza del *contexto* enviado a un LLM |

> Especificación normativa; reemplaza a `ccdd_spec_v0.2.md` (conservada como histórico). El manifiesto [`ccdd_workflow.md`](ccdd_workflow.md) contiene la motivación; se asume leído. Donde haya conflicto, **manda esta especificación**.

---

## 0. Convenciones

Las palabras clave **DEBE / NO DEBE / DEBERÍA / PUEDE** (MUST / MUST NOT / SHOULD / MAY) se interpretan según su uso convencional en especificaciones. Una afirmación de conformidad ("conforme a CCDD-L2") es válida solo si se satisface el conjunto **completo** de cláusulas DEBE del nivel declarado (§5).

---

## 1. Motivación y alcance

### 1.1. Problema
En software clásico los límites del sistema se fijan con tipos y contratos de API. En sistemas con IA generativa la única palanca real de control sobre el comportamiento del modelo es el **contexto**, que hoy suele vivir como prompts monolíticos en el código: no versionado de forma significativa, no testeable, sin gates de regresión.

### 1.2. Propuesta
CCDD eleva el contexto a **artefacto de ingeniería de primer nivel**: declarativo, firmado, versionado y verificable en CI y en runtime. El artefacto central es el **contrato de contexto** (`context.yaml`, §3). Los cambios de alto riesgo (políticas, registro de revisores) se gobiernan con **atestaciones firmadas** y **quórum** (§5.5).

### 1.3. Dentro de alcance
Declaración de slots; presupuesto de tokens por prioridad; integridad criptográfica de las directivas estáticas; gates de regresión de contexto en CI (estructura, contenido y gobernanza); guardrails deterministas pre-inferencia; auditoría y reproducción del payload; **gobernanza de cambios de política mediante atestación humana firmada con quórum**.

### 1.4. Fuera de alcance
CCDD **NO** es un sistema de seguridad integral del agente. Quedan fuera (§6.4): jailbreak del modelo, seguridad de la ejecución de herramientas, filtrado de la *salida*, y veracidad del contenido de fuentes dinámicas. Una implementación conforme **NO DEBE** afirmar que cubre estos vectores.

---

## 2. Terminología

- **Contrato de contexto**: el archivo `context.yaml` que declara slots, presupuesto y guardrails.
- **Slot**: canal nombrado de información con prioridad, fuente y política de compactación.
- **Prioridad** (`priority`): entero ≥ 0. **Menor número = mayor prioridad de retención**.
- **Slot crítico**: slot con `compaction: none`; no se trunca ni resume.
- **Presupuesto** (`budget`): tokens del modelo objetivo menos la reserva de salida.
- **Compactación**: `none`, `summarize` (heurística) o `truncate` (determinista).
- **Guardrail**: validación pre-inferencia con una acción `on_fail`.
- **Ensamblado** / **Payload** / **Replay**: el proceso runtime que produce el prompt final firmado, y su reproducción byte-a-byte.
- **Revisor**: identidad autorizada para atestar cambios de alto riesgo. Su clave **pública** está en `reviewers.json`; conserva su clave **privada**.
- **Registro de revisores** (`reviewers.json`): mapa revisor → clave pública (Ed25519), versionado. Puede incluir `__quorum__` (umbral para cambios del propio registro).
- **Atestación**: afirmación firmada por un revisor de que revisó un cambio de contenido; atada al hash del contenido nuevo (`attestations.json`).
- **Quórum** (`review_quorum`, `__quorum__`): nº de revisores distintos cuya firma se exige para un cambio.

---

## 3. El contrato de contexto (`context.yaml`)

### 3.1. Estructura de alto nivel

```yaml
ccdd_version: "0.3"
contract:
  name: "support-agent"
  budget:
    model: "claude-opus-4-8"
    max_tokens: 200000
    reserve_output: 8000
  slots: [ ... ]               # §3.2
  guardrails: [ ... ]          # §3.3
```

### 3.2. Slot

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
| `review_quorum` | MAY | Nº de revisores distintos que deben firmar un cambio de contenido de este slot (gate L2/R6). Default 1. |

> **Semántica de `min_tokens`.** Mínimo que el slot debe **retener cuando su contenido es al menos así de grande**; el piso efectivo es `min(tamaño_real, min_tokens)`. Se aborta solo si la compactación fuerza al slot por debajo de ese piso; un contenido naturalmente más pequeño que `min_tokens` **NO** es un fallo.

### 3.3. Guardrails

| Campo | Req. | Descripción |
| :--- | :--- | :--- |
| `id` | MUST | Identificador único. |
| `type` | MUST | `regex_deny` \| `json_schema` \| `reference_check`. |
| `on_fail` | MUST | `abort` \| `reroute` \| `warn`. |
| `pattern` | MUST si `regex_deny` | Regex que, si coincide en el payload, hace fallar el guardrail. |
| `target_slot`, `schema_path` | MUST si `json_schema` | Slot a validar y esquema JSON contra el que validarlo. |
| `reroute_to` | MUST si `on_fail: reroute` | Flujo de contingencia. |

**Semántica:** `regex_deny` falla si el patrón coincide; `json_schema` falla si el slot no parsea como JSON o no satisface el esquema; `reference_check` falla si una referencia apunta a un slot inexistente. **Fail-closed (DEBE):** un guardrail cuyo `type` la implementación no puede ejecutar **DEBE** tratarse como fallido (no aprobado en silencio).

---

## 4. El ciclo de vida CCDD

1. **Diseñar el contrato** (`context.yaml`, §3).
2. **Firmar y verificar en local** — SHA-256 de estáticos en `expected-hashes.json`; `lint` valida referencias y presupuestos.
3. **Integración continua de contexto (CCI)** — cada cambio dispara el gate L2 (§5.2); los cambios de alto riesgo requieren atestación (§5.5).
4. **Orquestación y guardrails en caliente** — ensamblado por prioridad + guardrails pre-inferencia (§5.3).
5. **Auditoría y reproducción** — payload firmado, registrado y reproducible byte-a-byte.

---

## 5. Niveles de conformidad

```
L1 · CCDD-Core      Contrato + lint + firmas (dev-time)
L2 · CCDD-CI        L1 + gate de regresiones en CI (R1–R9)
L3 · CCDD-Runtime   L2 + ensamblado, guardrails y auditoría
```

### 5.1. L1 · CCDD-Core (dev-time)

| Requisito | Normativo |
| :--- | :--- |
| `context.yaml` válido contra el esquema (§3) | MUST |
| Todo slot tiene `priority` y `compaction` explícitas | MUST |
| `lint` pasa: sin referencias rotas, dentro de presupuesto | MUST |
| Estáticos con `sign: true` firmados (SHA-256) en `expected-hashes.json` | MUST |
| Aislamiento estructural de `dynamic` vs `system`/`policies` (§6) | SHOULD |
| `lint` emite **advertencias de calidad** (no bloqueantes) ante contratos válidos pero flojos | SHOULD |
| Las herramientas emiten **salida estructurada** (findings `{id, severity, message}`) para consumo por agentes/CI | SHOULD |

> **Advertencias de calidad de `lint` (SHOULD).** Además de los errores que bloquean, `lint` DEBERÍA avisar de contratos *válidos pero riesgosos*. La referencia implementa: `no-secrets-guardrail` (ningún `regex_deny`), `critical-without-floor` (slot crítico sin `min_tokens`), `unsigned-static` (estático con `sign:false`), `dynamic-in-critical-zone` (slot `dynamic` con prioridad en la zona de los críticos). Severidad `warning`: no fallan el lint, pero se reportan. (Inspirado en los lints de buenas prácticas de DESIGN.md.)

> **Nota sobre `lint` y presupuesto.** Para slots críticos **estáticos** la verificación de presupuesto es exacta (mide el tamaño real); para un slot crítico **dinámico**, `lint` solo puede usar `min_tokens` como cota inferior y es **necesario pero no suficiente** — el assemble (§5.3) es el único punto que garantiza la factibilidad real.

### 5.2. L2 · CCDD-CI (integración)

El gate `diff` compara HEAD contra una baseline y bloquea ante una regresión. **Todas las reglas R1–R9 son deterministas** (sin LLM): el juicio humano vive fuera del gate (§5.5).

| Requisito | Normativo |
| :--- | :--- |
| Todo cambio de contrato/políticas dispara verificación en CI | MUST |
| **R1** — bloquea si baja el presupuesto disponible | MUST |
| **R2** — bloquea si se degrada la prioridad de un slot crítico | MUST |
| **R3** — bloquea si un slot pierde su criticidad (`none` → otra) | MUST |
| **R4** — bloquea si un estático firmado cambió sin re-firmar / perdió la firma | MUST |
| **R5** — bloquea si un slot `dynamic` asciende a la zona de prioridad de los críticos | MUST |
| **R6** — bloquea si un slot crítico estático **nuevo o modificado** carece de atestación firmada que alcance su `review_quorum` (§5.5) | MUST |
| **R7** — bloquea si cambia `reviewers.json` sin atestación de revisor(es) ya registrado(s) en la baseline que alcance `__quorum__` (§5.5) | MUST |
| **R8** — bloquea si baja el `review_quorum` de un slot crítico (debilita la gobernanza) | MUST |
| **R9** — bloquea si se elimina un guardrail o se debilita su `on_fail` (`abort` > `reroute` > `warn`) | MUST |
| El conjunto de reglas del gate es **determinista o auditable** | MUST |

*Garantiza:* nadie degrada la postura de contexto —estructura, contenido de políticas, guardrails, quórum, ni el registro de confianza— sin un gate que lo frene. *No garantiza:* que el runtime respete el contrato.

> **Nota — R6 cubre slots nuevos.** R6 evalúa los slots críticos estáticos de **HEAD**, no solo los de la baseline: un slot crítico **nuevo** (o uno que pasa a ser crítico estático) se trata como contenido que cambió desde vacío y exige atestación. (Sin esto, la atestación se evadiría añadiendo un slot nuevo con instrucciones maliciosas en vez de editar uno existente — bypass encontrado en revisión adversaria.)

### 5.3. L3 · CCDD-Runtime (producción)

| Requisito | Normativo |
| :--- | :--- |
| El ensamblado trunca/resume de menor a mayor prioridad | MUST |
| Assemble **aborta** si un slot `compaction: none` no entra, o cae bajo su piso efectivo (§3.2) | MUST |
| Guardrails pre-inferencia; `on_fail` se respeta; tipos no ejecutables fallan-cerrado | MUST |
| Fallo de validación ⇒ aborto o reruta determinista (no se llama al LLM) | MUST |
| Payload firmado y registrado con su verdict; replay byte-a-byte | MUST |
| Slots `summarize` declarados como no-deterministas en el contrato | MUST |
| Confidencialidad en reposo del payload registrado | SHOULD |

> **Corolario del orden de prioridad.** Bajo presión de tokens, un slot no crítico puede recibir **cero** tokens y quedar excluido del payload. Es comportamiento conforme (forma extrema de C1, §6.2): los críticos sobreviven aunque la entrada del usuario desaparezca. Una implementación **DEBERÍA** registrar en el verdict los slots desplazados a cero.

### 5.4. Regla de honestidad de conformidad

> Una implementación **NO DEBE** afirmar un nivel cuyo conjunto completo de cláusulas MUST no satisface. La conformidad parcial se reporta como el nivel **inferior** completo más extras. No existen niveles intermedios.

### 5.5. Atestación y gobernanza de cambios (detalle de R6/R7)

El principio rector: **el juicio difuso —¿este cambio de política debilita la seguridad?— lo hace un humano, asistido por un modelo, FUERA del gate.** El gate solo hace lo determinista: detectar el cambio y verificar firmas. Así el invariante "todo gate `MUST` es determinista" se preserva mientras el juicio queda donde debe.

**Mecanismo:**

1. **Registro de revisores** (`reviewers.json`, versionado): mapa revisor → clave pública Ed25519. El gate lo toma de la **baseline**, nunca de HEAD, para que nadie se auto-registre en el mismo PR que necesita atestar. PUEDE incluir `__quorum__` (umbral para cambios del propio registro).
2. **Atestación firmada** (`attestations.json`, versionado): por cada target (un slot, o `__reviewers__`), una lista de firmas. Cada firma cubre `target:hash_del_contenido`, de modo que **caduca si el contenido vuelve a cambiar** y no puede replicarse a otro target.
3. **Verificación (R6/R7):** ante un cambio de contenido de un slot crítico (R6) o del registro (R7), el gate cuenta los revisores **distintos** con firma válida sobre el hash nuevo, cuya clave pública está en el registro de la baseline, y **DEBE** bloquear si ese número es menor que el quórum aplicable (`review_quorum` del slot, o `__quorum__`; default 1).
4. **Génesis:** si la baseline no tiene registro, la primera carga de `reviewers.json` es un evento **génesis** informativo que **DEBE** auditarse fuera de banda. Es el bootstrap de confianza, inevitable en cualquier sistema de este tipo, y es el único punto sin trust anchor.

> Una implementación **NO DEBE** contar como válida una firma de un revisor ausente del registro de la baseline, ni una firma cuyo hash no coincida con el contenido actual.

**Asistente de revisión (opcional, advisory).** Una implementación **PUEDE** ofrecer una herramienta que use un LLM para ayudar al revisor a clasificar el efecto de un cambio de política. Tal herramienta **NO DEBE** formar parte del gate ni bloquear/desbloquear nada: es no-determinista y su salida depende del **prompt**, del **modelo** y de la **corrida**. En pruebas con modelos locales, un prompt sesgado ("¿esto debilita?") hacía marcar como debilitamiento casi cualquier cambio —incluido un endurecimiento—; con una clasificación neutral de tres vías la discriminación se corrige, pero el resultado sigue siendo falible. El gate **DEBE** seguir exigiendo la atestación firmada del humano con independencia de lo que diga el asistente. La referencia provee `review_assist.py` como ejemplo, en un archivo separado del gate para hacer física la frontera determinista/heurística.

---

## 6. Consideraciones de seguridad

CCDD es **control de integridad del contexto**, no seguridad integral. *Un estándar que no declara lo que no cubre, miente por omisión.*

### 6.1. Modelo de amenaza

**Activos:** A1 integridad de directivas estáticas · A2 jerarquía de prioridad · A3 no-repudio del payload · A4 secretos · A5 integridad del registro de confianza.
**Actores:** T1 usuario malicioso · T2 fuente dinámica envenenada · T3 desarrollador interno no autorizado · T4 atacante con acceso a logs · T5 revisor impostor (intenta atestar sin ser quien dice).

### 6.2. Amenazas CUBIERTAS

| ID | Amenaza | Actor | Control | Verificable por |
| :--- | :--- | :--- | :--- | :--- |
| C1 | Omisión de políticas por presión de tokens | T1, T2 | `priority` + `min_tokens` + `compaction: none` | Assemble aborta si un crítico no alcanza su piso |
| C2 | Degradación de prioridad en un PR | T3 | Gate de CI (R2) | `diff` de contrato |
| C3 | Alteración de estáticos sin re-firmar | T3 | SHA-256 + `expected-hashes.json` (R4) | Hash determinista |
| C4 | Fuga de secretos hacia el LLM | T1, T2 | Guardrail `regex_deny` | Determinista (regex) |
| C5 | Repudio / no auditar | T4 | Firma + registro del payload | Replay byte-a-byte |
| C6 | Borrado/alteración de directiva re-firmando el hash | T3 | Diff de contenido + atestación firmada (R6) | Líneas + verificación de firma |
| C7 | Payload estructurado malformado/envenenado | T2 | Guardrail `json_schema` | Validación de esquema |
| C8 | **Suplantación de revisor** (atestar en nombre de otro) | T5 | **Firma Ed25519 verificada contra el registro** | La firma no verifica sin la clave privada |
| C9 | **Auto-registro de un atacante como revisor** | T3, T5 | **R7: cambios al registro requieren atestación de un revisor existente** | Registro tomado de la baseline + firma |
| C10 | **Punto único de fallo en un cambio de alto riesgo** | T3, T5 | **Quórum M-de-N** (`review_quorum` / `__quorum__`) | Cuenta de firmantes distintos válidos |
| C11 | **Debilitamiento de la postura editando el contrato** (slot crítico nuevo sin atestar, bajar `review_quorum`, quitar/debilitar un guardrail) | T3 | **R6 (slots nuevos), R8 (quórum), R9 (guardrails)** | `diff` determinista |

> **Sobre C1:** no es "el modelo ignora la inyección", sino "**bajo estrés de presupuesto, las políticas nunca son las que se sacrifican**". Garantía de *orden de truncamiento*, verificable. No es inmunidad a injection.

### 6.3. Amenazas CUBIERTAS SOLO PARCIALMENTE

| ID | Amenaza | Por qué es parcial |
| :--- | :--- | :--- |
| P1 | Prompt injection que **sí cabe** en presupuesto | CCDD garantiza que las políticas *están presentes*, no que el modelo *las obedezca*. |
| P2 | Indirect injection vía RAG/memoria | CCDD aísla el slot y valida su formato (C7), no neutraliza la inyección semántica. |
| P3 | Debilitamiento de política por **reescritura** | El *gating* está cerrado deterministamente (R6 + atestación firmada con quórum). El residual es la **calidad del juicio humano** del revisor (que ninguna automatización garantiza) y el **bootstrap de génesis** del registro (§5.5), que debe auditarse fuera de banda. |

### 6.4. Amenazas FUERA DE ALCANCE

Una implementación conforme **NO DEBE** afirmar que aborda:

- **O1** Jailbreak del modelo base.
- **O2** Seguridad de las herramientas/acciones del agente.
- **O3** Exfiltración en la salida.
- **O4** Confidencialidad en reposo del payload firmado (firmar da integridad, no cifrado).
- **O5** Veracidad/envenenamiento en origen de la fuente dinámica.

### 6.5. Recomendaciones normativas

- Una implementación **DEBE** tratar todo slot `dynamic` como no confiable y aislarlo estructuralmente de `system`/`policies`.
- Una implementación **NO DEBE** afirmar conformidad de seguridad si las reglas de su gate L2 no son deterministas o auditables.
- Las claves privadas de revisor **NO DEBEN** versionarse; `reviewers.json` (públicas) y `attestations.json` (firmas) **SÍ**.
- Un evento **génesis** de `reviewers.json` **DEBE** auditarse fuera de banda.
- La documentación de un agente CCDD **DEBERÍA** reproducir §6.4 textualmente.

---

## 7. Roadmap a v0.4

Implementado y verificado en la referencia (`ccdd_reference/`, 51 tests <!-- ccdd:test-count=51 -->): L1/L2/L3, gate R1–R9, guardrails `regex_deny`/`reference_check`/`json_schema`, atestación firmada Ed25519, gobernanza del registro y quórum M-de-N, export multi-framework, y **generación determinista del contrato (`init`) con biblioteca de políticas base vetada**.

En la referencia, fuera del núcleo determinista (no-determinista, demo manual — requieren un LLM):

- [x] **`draft` — generación de contenido de dominio asistida por IA** (`draft.py`), sobre la base vetada de `init`. Borronea el system prompt y reglas de dominio; **conserva la base vetada** y produce un borrador sin firmar que entra al flujo normal (lint → revisión humana → firma). La estructura y las políticas base siguen siendo deterministas; solo lo específico del dominio lo borronea un LLM, y nada se confía sin firma humana.
- [x] **`review_assist`** — advisory para el revisor (§5.5).

Abierto (v0.4):

- [ ] Tokenizador real en lugar de la aproximación `chars/4`.
- [ ] **Caducidad temporal / revocación explícita** de atestaciones (hoy solo caducan al cambiar el contenido).
- [ ] Aislamiento estructural de slots `dynamic` (§6.5) ejecutado y verificado por la referencia.
- [ ] Rotación/revocación de claves de revisor con cadena de gobernanza.

---

## 8. Cambios respecto de v0.2

- **§3.2** — nuevo campo `review_quorum` (quórum por slot).
- **§5.2** — el gate L2 pasa de R1–R6 a **R1–R9**: **R6 evoluciona** (cambio de contenido de política requiere atestación firmada con quórum, y cubre slots críticos **nuevos** de HEAD); **R7** (gobernanza del registro); y, tras una **revisión adversaria**, **R8** (no bajar `review_quorum`) y **R9** (no eliminar/debilitar guardrails) — que cierran bypasses del modelo de atestación vía edición del contrato (C11).
- **§5.5 (nueva)** — modelo normativo de **atestación y gobernanza**: registro de revisores, firma Ed25519, quórum, génesis, juicio humano fuera del gate.
- **§6.1/6.2** — nuevos actores (T5 impostor) y amenazas cubiertas **C8** (suplantación), **C9** (auto-registro), **C10** (punto único de fallo). **P3** reformulada: el gating está cerrado; el residual es el juicio humano y el génesis.
- Compatibilidad: contratos `ccdd_version` `"0.1"`/`"0.2"` siguen siendo válidos; v0.3 solo añade cláusulas.
