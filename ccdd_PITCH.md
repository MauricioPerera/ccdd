# CCDD — Guion de pitch deck

Audiencia: comunidad técnica / open-source. ~11 slides. Cada slide: **título**, contenido, y *nota
del orador*. Pensado para una charla de 10–15 min o un README animado.

---

### Slide 1 — Portada

**CCDD — Context Contract-Driven Development**
*Tratá el contexto de tu LLM como un contrato. Versionado, verificable, gobernado.*

`v0.3 · implementación de referencia · 51 tests verdes · 2 dominios` <!-- ccdd:test-count -->

> *Nota:* el gancho de una línea — "como TDD pone el test primero, CCDD pone el contrato de contexto primero."

---

### Slide 2 — El problema

- En una app con LLM, lo que controla el comportamiento **es el contexto** (system, políticas, RAG, input).
- Hoy vive como **prompts sueltos en el código**: sin versionado, sin diff, sin gate, sin auditoría.
- Consecuencia: **regresiones silenciosas** en políticas de seguridad llegan a producción sin que nadie las vea.

> *Nota:* preguntá a la audiencia "¿cómo revisan hoy un cambio de prompt en un PR?" — casi nadie tiene respuesta.

---

### Slide 3 — Por qué TDD/SDD no alcanzan

| | gobierna | puede ser |
| :--- | :--- | :--- |
| TDD / SDD | código, funciones | **100% verificable** |
| **CCDD** | un **LLM / agente** | **no-determinista** |

> *Nota:* no es que TDD esté mal — es que asume un sistema determinista. Un LLM no lo es. Hace falta otra cosa.

---

### Slide 4 — La idea: el contrato de contexto

`context.yaml` — declara los **slots** (canales de contexto), su prioridad, presupuesto y reglas.
Un artefacto único, versionable, que reemplaza los prompts sueltos.

> *Nota:* mostrar un `context.yaml` real de 15 líneas en pantalla. Que se vea simple.

---

### Slide 5 — La clave: es **híbrido**

| Parte **dura** (se *verifica*) | Parte **blanda** (se *juzga*) |
| :--- | :--- |
| estructura, firmas, reglas | comportamiento del modelo |
| estático: políticas | dinámico: RAG, input |
| gate automático | humano + modelo |

**Regla de oro:** lo verificable se automatiza; lo opinable lo decide una persona — el modelo informa, no decide.

> *Nota:* este es el corazón. Ni código rígido (no sirve para IA) ni "prompt y reza" (no es confiable).

---

### Slide 6 — El norte: delegar con confianza

> Que un humano pueda **delegar a una IA** confiando en que no solo *ejecuta*, sino que **verifica su
> trabajo** y **evita alucinar**.

El contrato es el instrumento: *no tenés que creer que salió bien — podés comprobarlo.*

> *Nota:* este slide es el "por qué emocional". Conectá con la experiencia de revisar a mano todo lo que hace una IA.

---

### Slide 7 — El flujo de trabajo (5 etapas)

`diseñar → firmar + lint → gate en CI → ensamblar en vivo → auditar / reproducir`

Adopción gradual: **L1** (local) → **L2** (CI) → **L3** (producción).

> *Nota:* mostrar el diagrama mermaid del ciclo. Enfatizar "empezás por L1, subís cuando querés".

---

### Slide 8 — No es teoría: corre

Demos en vivo (todas con test que las fija):
- `diff` **bloquea** un PR que debilita una política.
- `attest` **firma** un cambio revisado (Ed25519); una atestación falsa **no verifica**.
- `export` emite el **mismo contrato** a formato OpenAI *y* Anthropic.

`51 tests verdes · gate de 9 reglas · stdlib + 3 deps` <!-- ccdd:test-count -->

> *Nota:* si hay tiempo, demo en vivo de `diff` bloqueando. Es lo más convincente.

---

### Slide 9 — Construido atacándolo

- Un 2º dominio encontró un bug de semántica que el 1º escondía.
- Una **revisión adversaria** del gate encontró **3 bypasses** — todos cerrados.
- Al cablear un LLM, descubrí (y corregí) un **sesgo de prompt** que marcaba *toda mejora* como regresión.

> *Nota:* la honestidad vende. "Esto no es una demo pulida; es algo que rompimos a propósito y arreglamos."

---

### Slide 10 — Alcance honesto

CCDD cubre la **integridad del contexto**. **NO** cubre: jailbreak del modelo, seguridad de las
herramientas, filtrado de la salida, veracidad de las fuentes.

> *Nota:* declarar los límites genera confianza. Un estándar que no dice qué NO hace, miente por omisión.

---

### Slide 11 — Un patrón convergente + llamado a la acción

DESIGN.md (Google Labs) llegó a la misma forma —contrato híbrido— para diseño visual. **El patrón es real.**

**Sumate:**
1. Probá la referencia (5 min).
2. Criticá la spec (Draft).
3. **Rompé el gate** — la mejor contribución es un bypass que no cubrimos.

`→ repo / docs / Quickstart`

> *Nota:* cierre. El call-to-action más fuerte para open-source no es "usalo", es "rompelo".
