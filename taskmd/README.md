# TASK.md — Verificación determinista de tareas agénticas

Un sistema para **gestionar tareas delegadas a agentes** (modelos baratos, incluido control de
navegador y desarrollo) donde **la compleción la dictamina código determinista, no la opinión del
modelo**. Hermano de ejecución de la familia [ccdd](https://github.com/MauricioPerera/ccdd) /
[design.md](https://github.com/google-labs-code/design.md) /
[game-protocol](https://github.com/MauricioPerera/game-protocol).

> Regla rectora (de ccdd): *"lo verificable va a un gate determinista; lo opinable va a una
> persona — el modelo informa, no decide."*

El spec completo está en [`taskmd_spec_v0.1.md`](taskmd_spec_v0.1.md). Este README resume el sistema, el
flujo, y **los hallazgos empíricos** (lo más valioso: varios se descubrieron rompiendo cosas).

---

## El modelo

Una tarea = un contrato `TASK.md` (front-matter YAML + cuerpo Markdown), con la estructura de una
historia de usuario:

| Concepto ágil | En el contrato | Régimen |
|---|---|---|
| Narrativa ("Como… quiero…") | cuerpo Markdown | blando / juicio humano |
| **Acceptance Criteria** (por tarea) | gates deterministas específicos | duro |
| **Definition of Done** (transversal) | `DOD.md` reusable | duro |

```
technical_done = (todos los AC en PASS) AND (toda la DoD en PASS)
accepted       = technical_done AND visto-bueno humano de lo blando (si lo hay)
```

`technical_done` es **objetivo, reproducible e independiente del modelo ejecutor**. Los AC se
escriben en **Given/When/Then** (legible) que resuelven contra un **catálogo de plantillas cerrado**
(`catalog.mjs`) a **gates tipados** (`url`, `dom`, `http`, `exit`, …). El contrato declara **hechos**
(post-condiciones), no comportamiento → cualquier modelo puede ejecutar; el gate checa hechos.

---

## El flujo

```
hablás conmigo
  → redacto TASK.md (historia + AC + DoD + executor + isolation)
  → contract-lint (cerrado, determinista): bien formado, gates resuelven, aislamiento coherente
  → ejecutor barato (Pi/kimi, o navegador, o dev) ejecuta el OBJETIVO
  → gate-runner (yo, código) corre AC ∧ DoD contra la REALIDAD → veredicto + evidencia
     FAIL → feedback de BRECHA (no el assert) → reintento
            → no-progreso / budget → SUBE de modelo (escalera)
            → escalera agotada → humano
  → teardown garantizado (browser/sandbox/container)
```

El **veredicto siempre es del motor de gates**, nunca del ejecutor.

---

## Componentes

| Archivo | Qué es |
|---|---|
| [`taskmd_spec_v0.1.md`](taskmd_spec_v0.1.md) | El spec (4 decisiones resueltas, reglas de lint, hallazgos). |
| [`poc/engine/catalog.mjs`](poc/engine/catalog.mjs) | Step library = catálogo de gates (plantillas cerradas). |
| [`poc/engine/run-task.mjs`](poc/engine/run-task.mjs) | Motor: parsea TASK+DOD, matchea, ejecuta gates, `--lint`/`--dry`. |
| [`poc/engine/orchestrate.mjs`](poc/engine/orchestrate.mjs) | Lazo: lint → lifecycle → ejecutor → gate → feedback/reintento → escalera → teardown. |
| [`poc/engine/container-run.mjs`](poc/engine/container-run.mjs) | Runtime `container` real en WSL2 (ejecutor confinado). |
| `poc/TASK.*.md`, `poc/DOD.*.md` | Contratos de ejemplo (browser, dev, sandbox, escalera). |
| `poc/audit/*.json` | Veredictos reproducibles con evidencia por intento. |

---

## Los hallazgos (medidos, no teóricos)

1. **El gate determinista decopla la calidad del coste del modelo.** Si la validación es objetiva,
   conviene el modelo más barato que cumpla; el gate atrapa lo que falle. El caro (orquestador) solo
   diseña y verifica. *El gate no hace el fallo gratis (se paga en reintentos) sino seguro.*

2. **El gate debe ser independiente del ejecutor.** Se verifica contra la **realidad** (DOM/URL por
   CDP, exit code de tests), nunca preguntándole al ejecutor "¿lo hiciste?". Demostrado: nunca creí
   el "logueé" de Pi — lo confirmé leyendo el navegador real; el control negativo (FAIL real) probó
   que el gate **discrimina**.

3. **Anti-gaming: el feedback describe la BRECHA, no el assert.** *"el pedido sigue en draft"*, no
   *"hacé json.state==placed"*. El gate es la fuente de verdad; jamás se le revela a lo juzgado.

4. **Integridad del gate = aislamiento del ejecutor (el hallazgo grande).** Un gate solo verifica si
   el ejecutor no puede alcanzarlo. Probado en **whack-a-mole**: cada vez que oculté el test, un
   ejecutor con `bash` lo encontró por otro canal del **filesystem compartido**:
   `find` de la carpeta held-out → `find` del master del copy-sandbox → **env heredado** del proceso
   hijo → **logs de audit** / fuente del orquestador / solución de otra tarea.
   **Conclusión dura: en un FS compartido no se confina a un agente con shell ocultando archivos.**

   | `executor.isolation` | confina shell? | requiere |
   |---|---|---|
   | `none` | — | gate no-archivo (browser) |
   | `tool-restricted` | n/a | tools ⊆ `{write}` (ciego) |
   | `sandbox` (copia) | **NO** | tools sin `bash` |
   | `container` | **SÍ** | namespace de FS separado |

   El **lint rechaza `sandbox`+`bash`** y exige `container`. Y se construyó un **`container` real en
   WSL2 sin Docker** (`container-run.mjs`): ejecutor como usuario normal **con bash**, gate
   propiedad de root (`chmod 700`) → `find`/`cat` del gate dan **Permission denied**, pero el loop
   converge por el canal de feedback. (`wsl -u root` da root sin password: el límite es Windows.)

5. **El apalancamiento vale lo que valga el gate.** Aun confinado, si los tests son incompletos el
   modelo sobreajusta (el "PASS" de un mapeo arbitrario es un lookup hardcodeado de los casos
   visibles). Hacen falta tests **held-out** + property/mutation. El feedback que revela los
   `expected` es, a la vez, el más potente y el de mayor riesgo de overfitting.

6. **Escalera de escalado.** `executor.models: [barato, capaz, …]`: cada peldaño corre hasta
   no-progreso/budget, entonces **sube**; solo escala a humano al agotarse. Materializa la tesis
   económica: *empezar barato, subir solo cuando el gate demuestra que no converge.*

---

## Los PoCs (qué demostró cada uno)

| PoC | Demostró |
|---|---|
| **Browser login** (`TASK.login.md` + `gate-runner.mjs`) | Ejecutor barato (kimi) controla Chrome; gate por **CDP** verifica URL+DOM independiente; control negativo discrimina. |
| **Motor genérico** (`run-task.mjs`) | Lee cualquier `TASK.md`, matchea al catálogo, ejecuta gates; `--lint` previo; `technical_done = AC ∧ DoD`. |
| **Lazo de orquestación** (`orchestrate.mjs`) | Un comando: lint → Chrome → delegar → gate → feedback/reintento → no-progreso → teardown. |
| **Dev** (`TASK.dev.md`, gate `exit`) | El mismo sistema sin browser: AC=`node --test`, DoD=suite; el modelo barato implementa hasta verde. |
| **Reintento real** (`TASK.dev-secret.md`) | Ejecutor ciego (`tool-restricted`) FAIL→FAIL→FAIL→PASS contra el feedback. |
| **Sandbox / whack-a-mole** (`TASK.dev-sandbox.md`) | Copia aislada; reveló que `bash` escapa el FS compartido. |
| **Container WSL** (`container-run.mjs`) | Confinamiento real con shell; Permission denied + loop converge. |
| **Escalera** (`TASK.login-ladder.md`) | cheap no-progresa → sube a capable → PASS (audit con `rung`/`model`). |

### Correr

```bash
cd poc/engine
npm install                                   # js-yaml
node run-task.mjs ../TASK.login.md --lint      # contract-lint (sin ejecutar)
node orchestrate.mjs ../TASK.dev-secret.md --executor pi --max 3   # lazo completo
node orchestrate.mjs ../TASK.login-ladder.md --executor mock --max 1  # escalera (determinista)
node container-run.mjs                         # runtime container en WSL2
```

*(Los fixtures evolucionaron a lo largo de la sesión; algunos PoCs son ilustrativos y pueden
requerir re-sembrar su `devrepo`/stub.)*

---

## Estado y qué falta para producción

**Hecho y verificado**: contrato + lint + motor de gates (AC∧DoD) + lazo (feedback/reintento/
no-progreso/escalera) + lifecycle (browser/sandbox) + runtime `container` real (WSL).

**Falta**:
- `Given`/`limits` no se enforquean aún (solo `then:` de AC + DoD).
- Slot-type validation, regresión (§11.7) y cross-lint TASK↔context (§11.8) en el lint.
- Catálogo de gates pequeño (crece según necesidad).
- `container`: hoy corre un ejecutor mínimo (API de Ollama) en WSL; correr **Pi** confinado es
  integración (instalarlo en WSL como usuario restringido).
- Escalera real cheap→capable: necesita 2 modelos calibrados o un provider Claude en Pi.
- Firmas criptográficas del `DOD.md`: diferidas a L2/L3 (ccdd).

---

## Principios para llevarse

- El veredicto es **código contra la realidad**, no la palabra del modelo.
- **Facts-not-behavior** → el modelo ejecutor es una variable de coste optimizable.
- La verificación solo es real si **el ejecutor no alcanza el gate** — y en FS compartido eso exige
  quitar el shell o un namespace separado.
- **El apalancamiento vale lo que valga el gate**: invertí en gates completos, no en el modelo.
