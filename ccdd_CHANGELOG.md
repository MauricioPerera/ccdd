# CCDD — Changelog

Formato: cada versión lista cambios de la **especificación** y de la **implementación de
referencia**. La spec publicada es `ccdd_spec_v0.3.md` (v0.1 y v0.2 se conservan como histórico).

---

## v0.3 — Draft

### Correcciones de una revisión adversaria externa
Una pasada independiente (clonar el remoto, leer el código, correr la suite) encontró 4
inconsistencias de documentación —drift entre los docs y el código— y un hueco de test:
- **Conteo de tests desincronizado** (49/47/44 en distintos archivos) → todo sincronizado.
- **Docstring de `ccdd.py`** decía `R1–R7`; el gate es `R1–R9` → corregido.
- **Teaser del README** era una salida compuesta, no real → reemplazado por la salida literal de `diff`.
- **Manifiesto (`ccdd_workflow.md`) §3** describía el gate como *"diff Semántico"* con 3 reglas (modelo
  viejo R1–R4), **invirtiendo el claim central** (el gate es determinista R1–R9; lo semántico/LLM es
  advisory FUERA del gate). Reescrito + corregido el `guidelines.txt` fantasma.
- **Hueco en `draft.apply_draft`**: si el modelo emitía un `DOMAIN_MARKER` literal, quedaban dos
  marcadores → ahora se sanitiza; test de regresión agregado.
- **Fix sistémico:** un test (`TestDocConsistency`) ahora verifica que todo claim `"N tests verdes"`
  en los docs coincida con los tests reales — el drift de conteo no puede repetirse en silencio.
  *(La doc no estaba bajo contrato y derivó: un argumento involuntario a favor de la propia tesis.)*

Spec: `ccdd_spec_v0.3.md` (superset compatible de v0.2/v0.1). Resumen normativo en su §8.
**Reorienta el debilitamiento de políticas por reescritura** (antes planeado como check
advisory con LLM dentro del gate) hacia atestación humana firmada, fuera del gate.

### Generación de contratos — `ccdd init` (determinista)
Hasta ahora el contrato se redactaba 100% a mano (la barrera de entrada). `init` genera un contrato
base con **buenas prácticas por defecto** (críticos firmados con piso, guardrail anti-secretos,
prioridades sanas) que lintea limpio (0 advertencias) y ensambla de una.
- **Decisión de diseño:** la generación es ella misma híbrida — estructura **determinista** (plantilla)
  + la línea base de **políticas vetada y determinista** (NO generada por un LLM, porque los modelos
  confabulan con las políticas) + firma humana. Lo específico del dominio se agrega encima.
- Plantillas: `chat` (default) y `tool-agent` (agrega un slot `tool_specs`).
- Tests: +3 (44 → 47). Un test cazó un bug del template `tool-agent` (llaves mal escapadas).

### Generación asistida por IA — `draft.py` (fuera del núcleo)
Segunda capa de la generación, **no-determinista**, en un script separado de `ccdd.py` (como
`review_assist.py`). Sobre un contrato de `init`, un LLM local borronea el `system.txt` y reglas de
política **de dominio** a partir de una descripción en lenguaje natural.
- **Conserva la base vetada**: el LLM solo AGREGA contenido de dominio bajo una sección marcada como
  borrador; nunca reescribe las políticas base. Produce un **borrador sin firmar** — el humano revisa
  y firma. Nada se confía sin firma humana.
- La llamada al LLM se demuestra a mano (no-determinista); pero el **invariante de seguridad**
  —que `apply_draft` CONSERVA la base vetada y es idempotente— SÍ está en la suite determinista
  (2 tests). La parte que protege la base se verifica; lo no-determinista queda afuera.
- Cierra el flujo de creación híbrido: estructura determinista (`init`) → contenido asistido
  (`draft`) → revisión + firma humana — el norte de CCDD aplicado a la propia redacción del contrato.

### Asistente de revisión LLM (advisory, fuera del gate)
- **`review_assist.py`** (archivo separado de `ccdd.py`): usa un LLM local (LM Studio,
  endpoint OpenAI-compatible vía `urllib`, sin dependencias nuevas) para ayudar al revisor a
  juzgar si un cambio de política la debilita. **No bloquea, no firma, el gate no lo invoca.**
- Una prueba de discriminación adversaria (debilitar / endurecer / neutro) cazó un **sesgo del
  prompt**: preguntar "¿esto debilita?" hacía marcar WEAKENS casi cualquier cambio. Reformulado
  como clasificación neutral de 3 vías, granite-8b y lfm2-24b discriminan los tres casos bien.
  Lección: la salida depende del prompt, el modelo y la corrida → por eso es advisory, no autoridad.
- También: `max_tokens` 400→800, `CCDD_LLM_TIMEOUT` configurable (modelos de razonamiento lentos),
  y validación del veredicto en el parser (qwen3.5-9b devolvía la plantilla literal → `UNKNOWN`).
- Spec §5.5 (PUEDE, advisory) y §6.3 (P3) actualizadas. La suite determinista sigue en 39
  tests (el advisor requiere server vivo y es no-determinista: se demuestra a mano).

### Consumo por agentes y lints de calidad (aprendido de DESIGN.md)
Comparando CCDD con [DESIGN.md](https://github.com/google-labs-code/design.md) —un "contrato
híbrido" análogo, para diseño visual— adoptamos dos cosas que tenía más maduras:
- **Salida estructurada `--json` con severidades** en `lint` y `diff`: findings `{id, severity,
  message}` (error / warning / info). Hace a CCDD consumible por un agente o un CI, no solo por
  un humano. (`lint --json`, `diff --json`)
- **Lints de calidad** (advertencias que NO bloquean): avisan de contratos válidos pero flojos —
  `no-secrets-guardrail`, `critical-without-floor`, `unsigned-static`, `dynamic-in-critical-zone`.
  Análogos a `missing-primary` / `contrast-ratio` de DESIGN.md, pero orientados a la postura de
  contexto.
- **`ccdd export --format openai|anthropic|text`**: el MISMO contrato se emite en el formato nativo
  de distintos frameworks. **Prueba la "independencia tecnológica"** que el manifiesto solo afirmaba.
  (Análogo a `export` Tailwind/DTCG de DESIGN.md.)
- **`ccdd spec`**: emite en JSON el catálogo de reglas (niveles, R1–R9, lints de calidad, tipos de
  guardrail, formatos) — el tool se **auto-describe** para un agente. (Análogo a `spec` de DESIGN.md.)
- Refactor: la lógica de ensamblado L3 se extrajo a `resolve_and_allocate`, compartida por
  `assemble` y `export`. Tests: +5 (39 → 44).

### Hardening por revisión adversaria (gate L2: R1–R7 → R1–R9)
Una revisión adversaria del propio gate encontró tres bypasses del modelo de atestación, todos
explotables editando el contrato en vez del contenido:
- **R6 ampliada**: ahora evalúa los slots críticos estáticos de **HEAD**, no solo los de la
  baseline → un slot crítico **nuevo** con instrucciones maliciosas ya no evade la atestación.
- **R8 (nueva)**: bloquea si baja el `review_quorum` de un slot crítico.
- **R9 (nueva)**: bloquea si se elimina un guardrail o se debilita su `on_fail` (`abort` >
  `reroute` > `warn`).
- Amenaza C11 añadida a la spec §6.2. Tests: +4 (35 → 39).

### Diseño: atestación humana asistida por modelo (R6 evolucionado)
El juicio no-determinista —¿esta reescritura debilita la política?— **no vive dentro del gate**.
Vive en un **humano asistido por un modelo**. El gate hace solo lo determinista:
1. detecta que el contenido de un slot crítico estático cambió (hash + diff de líneas);
2. **bloquea por defecto** hasta que un revisor autorizado registre una **atestación**;
3. la atestación se ata al **hash del contenido nuevo** → caduca si el contenido vuelve a cambiar.

Así el invariante "todos los gates `MUST` son deterministas" queda intacto (el gate pregunta
"¿hay atestación válida para este hash?"), y el juicio difuso queda fuera del camino crítico.
También **arregla la usabilidad de R6 v0.2**, que bloqueaba *todo* cambio de política (incluso
mejoras): ahora un cambio legítimo se desbloquea con una revisión humana registrada.

### Atestación FIRMADA (modelo de confianza asimétrico)
La atestación se firma con **Ed25519** (lib `cryptography`). Cierra la suplantación: afirmar
`"reviewer": "mauricio"` sin la clave privada de mauricio produce una firma que no verifica.
- **Registro de revisores** (`reviewers.json`, versionado): mapea revisor → clave pública. El
  gate lo toma de la **baseline**, no de head, para que nadie se auto-registre en el mismo PR.
- **La firma cubre `slot:hash_contenido`**: caduca si el contenido cambia y no se puede replicar
  a otro slot.

### Implementación de referencia
- **`ccdd keygen <contract> --reviewer <n> --key-out <f>`**: par Ed25519; registra la pública en
  `reviewers.json`, guarda la privada en `<f>` (no se versiona). (`cmd_keygen`)
- **`ccdd attest <contract> <slot> --reviewer <n> --key <privada>`**: atestación firmada
  (`attestations.json`, atada al hash del contenido). (`cmd_attest`)
- **R6 evolucionado**: cambio de contenido de un slot crítico estático → bloquea salvo
  atestación **firmada por un revisor registrado en la baseline** para el hash nuevo. (`cmd_diff`)
- **R7 — gobernanza del registro (¿quién vigila a los vigilantes?).** Un cambio a
  `reviewers.json` (añadir/revocar/rotar un revisor) debe ser atestado por un revisor YA
  registrado en la baseline (atestación especial del target `__reviewers__`). Evita el
  auto-registro de un atacante. **Génesis:** si la baseline no tiene registro, la primera carga
  es un evento génesis informativo que DEBE auditarse fuera de banda (bootstrap de confianza,
  inevitable). (`cmd_diff` R7, `cmd_attest` target `__reviewers__`)
- **Quórum M-de-N.** La atestación pasa de "una firma" a un **conjunto de firmas**: el gate
  exige `review_quorum` revisores DISTINTOS (válidos y registrados) para un cambio de política
  (`review_quorum` en el slot, default 1) o `__quorum__` para el registro de revisores. Las firmas
  se acumulan en `attestations.json`; cada una está atada al hash, así que las caducas no cuentan.
  (`valid_signers`, `cmd_attest` acumulativo, R6/R7 con umbral)
- **Tests:** 26 → 35. Nuevos: sin atestación bloquea, firma válida pasa, **suplantación
  bloquea**, **revisor no registrado bloquea**, caducidad al cambiar el contenido,
  **auto-registro bloquea**, cambio de registro atestado pasa, génesis permitido, y
  **quórum 2-de-N** (1/2 bloquea, 2/2 pasa).
- **Dependencia nueva** (solo para keygen/attest/verificación de firma): `cryptography`. L1 y L3
  no la requieren (import perezoso).

### Nota de versionado
Se versionan: `reviewers.json` (claves públicas) y `attestations.json` (parte del PR).
NO se versionan: claves privadas (`*.key`), `last-assembly.json`, `diff-report.json`.

---

## v0.2 — Draft

Spec: `ccdd_spec_v0.2.md` (superset compatible de v0.1; los contratos `ccdd_version: "0.1"`
siguen siendo válidos). Resumen normativo en su §8.

### Especificación
- **§3.3** — guardrails especificados normativamente: tabla de campos, semántica por tipo, y
  regla **fail-closed** para tipos no ejecutables.
- **§5.2** — gate L2 reformulado como reglas **R1–R6**; **R6** (diff de contenido de políticas)
  promovido a cláusula **MUST** determinista. El diff semántico LLM se acota a la *reescritura*
  y se reclasifica `MAY`/advisory.
- **§6.2** — nuevas amenazas cubiertas **C6** (borrado de directiva re-firmando) y **C7**
  (payload estructurado malformado). **§6.3 P3** reformulada (solo queda la reescritura).

### Implementación de referencia
- **Guardrail `json_schema` real.** Valida que el contenido de un slot parsee como JSON y
  cumpla un esquema (`schema_path`); bloquea ante JSON inválido o violación. (`cmd_assemble`)
- **Gate L2 — regla R6: diff de contenido de políticas.** `ccdd diff` compara el contenido por
  líneas de los slots críticos estáticos y bloquea si una directiva fue eliminada/alterada,
  aunque la estructura no cambie y el hash se haya re-firmado. Determinista. (`cmd_diff`)
- **Tests:** 23 → 26. Nuevos: `json_schema` válido/inválido, tipo de guardrail desconocido
  fail-closed, y eliminación de directiva de política (R6).

### Aún abierto (objetivo v0.3)
- Diff semántico con LLM para el debilitamiento por reescritura (advisory `warn`; no-determinismo
  documentado).
- Tokenizador real en lugar de la aproximación `chars/4`.

---

## v0.1 — Draft (hito inicial)

### Especificación (`ccdd_spec_v0.1.md`)
- Estándar normativo completo: convenciones MUST/SHOULD/MAY, motivación y alcance,
  terminología, esquema del `context.yaml`, ciclo de vida, **3 niveles de conformidad**
  (L1 Core / L2 CI / L3 Runtime), y **consideraciones de seguridad** (modelo de amenaza:
  cubierto / parcial / fuera de alcance).
- Esquema formal máquina-verificable: `ccdd_context.schema.json` (JSON Schema 2020-12).

### Implementación de referencia (`ccdd_reference/`)
- `lint` (L1): valida contra el esquema, comprueba referencias, factibilidad de presupuesto,
  y firma SHA-256 de estáticos.
- `diff` (L2): gate de regresión estructural con 5 reglas (R1-R5).
- `assemble` (L3 núcleo): asignación por prioridad, abortos por slot crítico/piso, guardrails
  deterministas pre-inferencia, payload firmado + verdict (replay byte-a-byte).
- Validación **N=2**: dos contratos de dominio distinto (support-agent, code-review-agent).
- Suite inicial de 19 tests (`unittest`, stdlib); creció con cada versión hasta 39.

### Cláusulas de spec surgidas de implementar/validar
- Semántica de `min_tokens` como piso de retención acotado al contenido real (§3.2) — bug
  descubierto por la validación N=2.
- Corolario de desplazamiento a cero de slots de baja prioridad bajo presión (§5.3).
- Nota de `lint` necesario-no-suficiente para slots críticos dinámicos (§5.1).
- Sincronización manifiesto↔spec: corrección de la sobre-afirmación de "previene prompt
  injection" a "persistencia de políticas bajo presión de tokens".
