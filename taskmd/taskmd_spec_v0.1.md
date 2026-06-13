# TASK.md — Especificación (borrador v0.1)

> Hermano de ejecución de la familia **design.md / game.md / ccdd**.
> Mismo ADN: documento de dos capas (YAML máquina-checable + Markdown humano)
> con una capa de validación determinista que es la fuente de verdad, no la prosa.
>
> Objeto que gobierna: **¿la tarea delegada logró su objetivo?** — respondido por
> gates deterministas contra el sistema real, no por la opinión del modelo ejecutor.

---

## 1. Principio rector (heredado de ccdd)

> *"Lo verificable va a un gate determinista; lo opinable va a una persona — el modelo informa, no decide."*

Corolario operativo (cierre con la economía de modelos):
**el contrato declara HECHOS (post-condiciones), no COMPORTAMIENTO.** Por eso el
ejecutor puede ser cualquier modelo: el gate checa hechos, no cómo se llegó a ellos.
`facts-not-behavior` (game.md) = independencia del modelo.

---

## 2. Modelo conceptual: Historia + AC + DoD

| Concepto ágil | En el contrato | Régimen |
|---|---|---|
| Narrativa ("Como… quiero… para…") | cuerpo Markdown | blando / juicio humano |
| **Acceptance Criteria** (por historia) | gates deterministas específicos | duro |
| **Definition of Done** (transversal) | set de gates reusable (`DOD.md`) | duro |

**Booleano de compleción:**

```
technical_done = (todos los AC en PASS) AND (toda la DoD en PASS)
accepted       = technical_done AND (visto bueno humano sobre criterios blandos, si los hay)
```

`technical_done` es objetivo, reproducible e independiente del modelo ejecutor.
`accepted` añade el juicio humano solo donde algo es genuinamente opinable.

### 2.1 Composición: instancia + librerías reusables

`TASK.md` es la **instancia** (lo específico de ESTA tarea: los AC). Compone dos
**librerías reusables** por referencia, que juegan papeles **paralelos** — gobernanza
de un extremo cada una:

```
TASK.md  = instancia (los AC propios de la tarea)
  ├── context: ./context.yaml   ← ccdd: gobierna la ENTRADA del ejecutor   (opcional)
  └── dod:     ./DOD.web.md      ← gobierna INVARIANTES de salida           (reusable)
```

`context.yaml` (ccdd) y `DOD.md` son simétricos: ambos son gobernanza reusable y
referenciada; uno del lado de la **entrada**, otro de las **invariantes de salida**.
Acoplamiento **débil y por referencia**: ccdd queda intacto, con su propio
lint/firma/assembly — se **compone**, no se absorbe. La ejecución queda gobernada de
punta a punta (entrada + salida), y el audit registra **ambos**: el contexto exacto
enviado (audit de ccdd) y el resultado de los gates (audit de TASK).

---

## 3. Forma del documento

Igual que design.md / game.md: front-matter YAML + cuerpo Markdown.

```markdown
---
id: task-2026-0001
objetivo: "Publicar el pedido #X en y.com"
executor: { runtime: pi, model: "kimi-k2.6:cloud", tools: [browser] }
context: ./context.yaml           # ccdd: gobierna la ENTRADA del ejecutor (opcional)
dod: ./DOD.web.md                 # set transversal aplicable
limits: { timeout_s: 120, max_retries: 2, max_cost_usd: 0.05 }
acceptance:                       # AC -> Given/When/Then (ver §5)
  - scenario: "pedido publicado"
    given:
      - "una sesión autenticada en y.com"
    when:
      - "el agente envía el pedido #X"
    then:
      - "el endpoint /orders/X responde state=placed"
      - "el DOM muestra #order-confirmation"
audit: { record: ./audit/task-2026-0001.jsonl }
---

## Historia
Como operador de ventas quiero publicar el pedido #X para que el cliente lo reciba.

## Contexto para el ejecutor
(URL, credenciales por referencia segura, pasos sugeridos — NO vinculantes.)

## Criterios blandos (juicio humano)
- El mensaje de confirmación al cliente suena natural.
```

---

## 4. Front-matter: campos

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | string | sí | Identificador estable de la tarea. |
| `objetivo` | string | sí | Una línea, en lenguaje natural. |
| `executor` | objeto | sí | `{runtime, model, tools, isolation}` — quién/qué ejecuta. `tools` = allowlist (acota superficie). `isolation` ∈ `none\|tool-restricted\|sandbox` (§8.1, obligatorio). Variable de coste. |
| `context` | path | no | Referencia a un `context.yaml` (ccdd) que gobierna la ENTRADA del ejecutor. Opcional; se compone, no se absorbe. |
| `dod` | path | sí | Referencia al `DOD.md` transversal aplicable. |
| `limits` | objeto | sí | `timeout_s`, `max_retries`, `max_cost_usd`. Gates duros también. |
| `acceptance` | lista | sí | Escenarios Given/When/Then (§5). |
| `audit` | objeto | sí | Dónde se registra la ejecución reproducible. |

---

## 5. AC: Given/When/Then por fuera, gates tipados por dentro

**Gherkin por fuera, plantillas tipadas por dentro** (decisión #1, §13).
`Given` = pre-condiciones (pueden ser gates que deben sostenerse antes);
`When` = la acción delegada al ejecutor (NO es gate, es la instrucción);
`Then`/`And` = los gates.

**Binding por catálogo cerrado, no por regex abierto.** Cada step de un AC debe
coincidir con una **plantilla** del catálogo (§6) por **frase exacta + slots tipados**.
No hay matching difuso: o el step matchea una plantilla conocida, o el contract-lint
falla (§11.2). Esto elimina la ambigüedad/precedencia del regex y cierra el único hueco
por donde se colaría interpretación en el camino AC→gate.

Por qué cerrado y no Cucumber abierto: en BDD clásico los humanos escriben libre y los
devs ponen regex para atraparlos. Aquí **el autor de los AC es un LLM (el orquestador) o
plantillas** → lo constreñimos al catálogo. Coherente con la tesis "sacar la opinión del
LLM del veredicto".

Una **entrada de catálogo** (es a la vez step library y definición de gate):

```yaml
- step:  "el endpoint {url} responde {field}={value}"   # se lee como Gherkin
  slots: { url: url, field: jsonpath, value: string }   # tipados → el lint los valida
  gate:  { type: http, url: "{url}", expect: { jsonpath: "{field}", equals: "{value}" } }
```

Un `Then` del TASK.md llena los slots:

```
then:
  - "el endpoint /orders/X responde state=placed"   # url=/orders/X field=state value=placed
```

El step library **es** el catálogo de gates (un solo artefacto). Un check nuevo exige
**añadir una plantilla primero** — feature, no bug: fuerza a que el catálogo de gates sea
explícito. El apalancamiento "cualquier modelo ejecuta" vale exactamente lo que de
completo esté este catálogo.

---

## 6. Catálogo de gates / step library (v0.1)

**Un solo artefacto**: cada entrada es `{ step, slots, gate }` (§5). Aquí se listan
por `type` de gate; cada `type` puede tener varias plantillas de step.
Correr un gate da: `PASS | FAIL | ERROR` + **evidence** (el valor observado, para audit).

| `type` | Params | `expect` | Checa contra |
|---|---|---|---|
| `http` | method, url, headers, body | status, json-path==, header== | API/backend real |
| `dom` | selector, frame | present / absent / visible / text== | página viva |
| `db` | query, params | rows==N, value== | base de datos real |
| `file` | path | exists / sha256== / contains | filesystem |
| `exit` | cmd | code==0, stdout~ | proceso/CLI |
| `screenshot` | selector, baseline | diff <= threshold | render real |
| `event` | source, match | recibido < timeout | webhook/cola |

Cada fila se materializa como una o más plantillas de step (frase Gherkin + slots
tipados) según el formato de §5. Añadir un check = añadir una plantilla a este catálogo
(revisado, como se añade una regla de lint a design.md).

Reglas de diseño del gate:
- **Independiente del ejecutor**: lo corre el orquestador (código), nunca el modelo que hizo la tarea.
- **Determinista en el check**, aunque opere sobre un mundo abierto (ver §8).
- **Guarda evidencia**: siempre registra observado-vs-esperado.

---

## 7. DoD: `DOD.md` reusable y protegido contra regresión

Set transversal que aplica a toda tarea de una clase (p. ej. `DOD.web.md`).
Es el equivalente a las 28 reglas de game.md o el lint de design.md: invariantes
que **no deben debilitarse en silencio** (regression gate de ccdd → candidato a firmar).

Ejemplos de gates DoD (web):
- No se filtran secretos en logs/artefactos (scan determinista).
- Existe registro de audit y es reproducible.
- Sin errores de consola/red fuera de una allowlist.
- La operación respeta `limits` (tiempo/coste).
- Limpieza/idempotencia tras la ejecución.

---

## 8. Dos niveles de validación

| Nivel | Cuándo | Naturaleza | Análogo en tu familia |
|---|---|---|---|
| **contract-lint** | antes de ejecutar | cerrado, determinista puro | lint de design.md / game-lint |
| **reality-gate** | en runtime | determinista en el check, mundo abierto | cross-validación de game.md contra el motor real |

`contract-lint` valida que el `TASK.md` esté bien formado (§11).
`reality-gate` corre los gates contra el sistema vivo. Aquí está la diferencia
honesta con design.md/game.md: ellos validan artefactos **estáticos**; nosotros
asertamos contra un sistema **dinámico** (web async, anti-bot, timing). El *form*
y `facts-not-behavior` transfieren; la superficie de verificación es más dura y
exige reintentos/timeouts/evidencia.

### 8.1 Integridad del gate: aislamiento del ejecutor (regla dura)

**Un gate solo verifica si el ejecutor NO puede alcanzarlo.** Si el ejecutor puede
leer los tests/archivos de verificación, *los gamea al instante* — sobreajusta a los
casos visibles en vez de cumplir el objetivo. Verificado empíricamente: un ejecutor con
tools `read`/`bash` **encontró un test "held-out" en una carpeta vecina y copió los
valores esperados**, pasando sin implementar nada. El loop de verificación solo se volvió
real al **cegar** al ejecutor (tools = solo `write`).

Corolario: **"held-out por carpeta" NO es aislamiento.** Un agente con acceso al
filesystem alcanza cualquier ruta. El aislamiento real requiere una de:

| `executor.isolation` | Significado | Cuándo |
|---|---|---|
| `none` | sin aislamiento | OK solo si el gate **no es un artefacto legible** (p. ej. browser: el gate es el estado vivo del sistema, no un archivo). |
| `tool-restricted` | tools sin acceso de lectura (p. ej. solo `write`) | el ejecutor está ciego; útil pero cripple para dev real. |
| `sandbox` | ejecutor en contenedor/worktree que **físicamente no contiene** los tests; el gate corre aparte | la postura correcta para dev real (tools completas, gate fuera de alcance). |

El contrato **DEBE declarar** `executor.isolation`. Lint caza las combinaciones inseguras
(§11.9). `sandbox` no es verificable por lint (queda fuera de su alcance) — se confía en
la declaración. Y recordá: aun con aislamiento, *el apalancamiento vale lo que valga el
gate*: tests incompletos → el modelo sobreajusta igual; hacen falta property/mutation tests.

#### `sandbox` por copia: lo que confina y lo que NO (medido)

La implementación de referencia del `sandbox` es **por copia + inyección**: el ejecutor
trabaja en una copia aislada de la fuente; los tests se **inyectan solo mientras corre el
gate** (con el ejecutor ya inactivo) y se borran después → el test **nunca vive en el árbol
del ejecutor durante su turno**. Esto da **host-isolation** siempre (no muta el repo real,
es repetible, teardown limpio). Pero su poder de **confinamiento del ejecutor depende de
las tools** — verificado empíricamente con el mismo contrato (valores arbitrarios):

| tools del ejecutor | resultado |
|---|---|
| `read, edit, write` (sin shell) | ✅ **confina**: no puede enumerar el filesystem → no encuentra el test → resuelve por feedback (loop FAIL→PASS) |
| `+ bash` (shell/exploración) | ❌ **escapa**: `find`/`cd ..` localiza el test master en el filesystem compartido → lo gamea (PASS al instante) |

Regla práctica: **`sandbox` por copia es sólido solo si las tools del ejecutor NO incluyen
shell/exploración** (`bash`). Si el ejecutor necesita `bash`, el confinamiento real exige
**aislamiento a nivel SO** (contenedor/VM, namespace de filesystem separado) — fuera del
alcance de la copia-sandbox.

#### Whack-a-mole: por qué hay un cuarto valor `container` (medido)

Intentar ocultar el material del gate de un agente con `bash` en un **filesystem
compartido** es **futil** — verificado en 4 rondas, cada cierre abrió otro canal:

1. test en carpeta "held-out" → el agente la halló con `find`.
2. copia-sandbox (test fuera del sandbox) → halló el master con `find`.
3. test pasado por **env** → el proceso hijo **hereda el env**; lo leyó con `echo $VAR`.
4. env filtrado → leyó los **valores esperados en los logs de audit** (y en la solución de otra tarea, y en la fuente del orquestador).

Conclusión dura: **en un FS compartido no se puede confinar a un ejecutor con shell
ocultando archivos.** Solo dos cosas confinan de verdad:
- **(a) quitar el shell/exploración** (`tools` sin `bash`) — la copia-sandbox basta; verificado (loop FAIL→PASS, sin gaming).
- **(b) namespace de FS separado** — contenedor/VM/WSL sin mount compartido.

| `executor.isolation` | confina shell? | requiere |
|---|---|---|
| `none` | — | gate no-archivo (browser) |
| `tool-restricted` | n/a (sin readers) | tools ⊆ `{write}` |
| `sandbox` (copia) | **NO** | tools sin `bash` |
| `container` | **SÍ** | namespace separado (contenedor/VM/WSL sin mount) — declarado, no verificable por lint |

Lint (§11.9) **rechaza `sandbox` + `bash`** y exige `container` para ejecutores con shell.
En esta máquina hay **WSL2** disponible (sin Docker) como vía de `container` real, pero
correr el ejecutor confinado dentro de WSL (usuario/permisos sin mount al gate) es un paso
de **infraestructura**, no de contrato — el `TASK.md` solo lo declara con `isolation: container`.

---

## 9. Ciclo de vida

```
1. Design     — yo (orquestador) redacto TASK.md desde tu pedido: historia + AC + dod + limits
2. Lint       — contract-lint (cerrado): bien formado, steps resueltos, gates con assertion
3. Delegate   — ejecuta el modelo barato (Pi/…); el `When` es la instrucción
4. Reality-gate — yo corro AC + DoD contra el sistema real → PASS/FAIL por gate + evidence
5. Decide     — technical_done = todos verdes. Si falla un gate: reintento (≤ max_retries) o escalo
6. Soft       — criterios blandos → tu visto bueno (accepted)
7. Audit      — acciones + resultado de cada gate, reproducible
```

El modelo **informa** (reporta lo que hizo); el **gate decide** si está hecho.

---

## 10. Semántica de compleción

- Cada gate: `PASS|FAIL|ERROR` + evidence.
- `technical_done` ⇔ todos los AC y DoD en `PASS`.
- `FAIL` reintentable → reintento con feedback hasta `max_retries`; luego `escalado` (§10.1).
- `ERROR` (no se pudo evaluar el gate) ≠ `FAIL` → se reporta como inconcluso, nunca como hecho.
- Un AC no determinizable se marca `manual: true` y cuenta para `accepted`, no para `technical_done`.

### 10.1 Reintento con feedback y escalado (decisión #3, §13)

Separación que mantiene la filosofía intacta: **el feedback vive del lado de EJECUCIÓN;
el veredicto (gate = done/not-done) sigue puro.** El feedback afecta *cómo intentamos
llegar*, nunca *si está hecho*. El gate informa el fallo; el orquestador decide la corrección.

**Regla de oro (anti-gaming):** el feedback describe la **brecha en la realidad**
(el objetivo incumplido), **nunca el assert interno del gate**.
→ *"el pedido sigue en `draft`, debe quedar publicado"* — no *"haz que `json.state==placed`"*.
El gate es la fuente de verdad; jamás se le revela a lo que está siendo juzgado.

**Mediación**: el orquestador lee `FAIL` + evidence, decide reintentar / cambiar enfoque /
escalar, y **sintetiza** el feedback de brecha. No es un loop crudo.

**Parada determinista** (lado duro, son límites):
- `max_retries` agotado → escala.
- **No-progreso**: mismo gate con la misma evidence dos veces → para y escala (no seguir pagando).

**Escalera de escalado** (cada peldaño disparado por `FAIL`, siempre desde lo más barato).
Se declara en el contrato como `executor.models: [barato, capaz, …]` (lista ordenada;
si falta, cae a `[executor.model]`):
```
1. mismo modelo barato + feedback de brecha     (≤ N; no-progreso o budget → sube)
2. modelo más capaz + feedback                  (solo si el barato no converge)
3. humano / re-plan                             (escalera agotada → ESCALATE)
```
El feedback se **acarrea entre peldaños** (el modelo capaz arranca con el contexto del
fracaso del barato). El veredicto sigue siendo del motor, sea cual sea el modelo que ejecutó.

**Tradeoff asumido**: el feedback retry sube el listón de **completitud del gate** (más
superficie para gamearlo si el gate es débil). Razón para invertir en gates completos, no
para evitar el feedback.

*Estado*: **implementado y verificado** (mock determinista: peldaño barato no-progresa → sube
al capaz → PASS; el audit registra `rung`/`model` por intento).

---

## 11. Reglas de contract-lint (starter, v0.1)

1. Schema válido; campos obligatorios presentes.
2. Todo step `Then/And` matchea una **plantilla** del catálogo por frase exacta + slots, y cada slot respeta su tipo (sin steps colgados ni slots mal tipados — análogo a "refs rotas" de design.md).
3. Ningún gate sin `expect` (un gate sin assertion no verifica nada).
4. `limits` declarados (timeout, retries, coste).
5. `dod` referencia resuelve a un `DOD.md` existente.
6. Coherencia de régimen: nada marcado determinista que en realidad sea juicio humano.
7. **Regresión**: AC/DoD no pueden debilitarse respecto a la versión previa sin **sign-off explícito** (CI gate de ccdd). En v1 el sign-off es un **marcador registrado** (campo + autor), determinista, **sin criptografía**; la firma criptográfica se añade en L2/L3 (ver §13 #2).
8. **Cross-lint TASK↔context** (si hay `context`): el `context.yaml` referenciado provee las tools/políticas que el `executor` necesita — coherencia entrada↔tarea. Es la "validación contra la realidad" aplicada al contrato hermano.
9. **Integridad del gate / aislamiento** (§8.1): `executor.isolation` ∈ `none|tool-restricted|sandbox|container`, declarado. **Falla** si: `tool-restricted` con tools que leen; `sandbox` con `bash` (la copia no confina shell); `none` con gate basado en archivos (`workdir`). `container` se acepta (namespace separado declarado; no verificable por lint).

---

## 12. Decisiones abiertas

Ninguna — todas resueltas para v0.1 (§13).

## 13. Decisiones resueltas

- **#2 — Firmas** *(resuelta)*: **diferir la firma criptográfica a L2/L3** (cuando el `DOD.md`
  sea plantilla reusable / multi-autor / producción). En v1 (L1, dev-time) el "no debilitar en
  silencio" lo da el **regression gate determinista** (§11.7) + un **sign-off registrado no
  cripto** (campo + autor). Mapea a las capas de adopción de ccdd: no firmar en L1, firmar en L2/L3.
- **#3 — Reintento inteligente** *(resuelta)*: **feedback retry, mediado por el orquestador,
  por brecha de realidad** (nunca el assert del gate), con **parada determinista**
  (`max_retries` + no-progreso) y **escalera de escalado** (barato+feedback → modelo capaz →
  humano). El feedback es lado de ejecución; el veredicto sigue puro. Ver §10.1.
- **#1 — Formato del step library** *(resuelta)*: **catálogo de plantillas cerrado** (opción C).
  Gherkin por fuera, plantillas tipadas por dentro; binding por frase exacta + slots tipados,
  **no** regex abierto. El step library **es** el catálogo de gates (un solo artefacto, §5–§6).
  El autor de los AC (LLM/plantillas) queda constreñido al catálogo → sin matching difuso, sin
  hueco interpretativo AC→gate. Añadir un check = añadir una plantilla (revisada).
- **#4 — Relación con ccdd** *(resuelta)*: `TASK.md` **referencia opcionalmente** un
  `context.yaml` (acoplamiento débil, por referencia — opción B). `context.yaml` (entrada)
  y `DOD.md` (invariantes de salida) son librerías reusables **simétricas** que la instancia
  `TASK.md` compone. ccdd se compone, no se absorbe. Se añade la regla de **cross-lint
  TASK↔context** (§11.8). Ver §2.1.
```
