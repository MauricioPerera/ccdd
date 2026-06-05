# Propuesta: CCDD — Context Contract-Driven Development

**Una metodología (y un estándar emergente) para construir agentes de IA confiables, tratando el
contexto que recibe el LLM como un contrato híbrido: declarado, versionado y verificable.**

> Como TDD pone el test primero y SDD pone la especificación primero, **CCDD pone el contrato de
> contexto primero.**

Estado: v0.3 (Draft) · implementación de referencia ejecutable · **51 tests verdes** · validada en 2 dominios. <!-- ccdd:test-count=51 -->

---

## El problema

En una app con LLM, lo único que realmente controla el comportamiento del modelo es el **contexto**
que le pasás: system prompt, políticas, instrucciones de herramientas, RAG, memoria, input del
usuario. Hoy ese contexto vive como **prompts sueltos repartidos por el código** — sin versionado
significativo, sin diff, sin gate de revisión, sin forma de auditar qué se envió ni de reproducirlo.

El resultado: nadie sabe con certeza por qué el agente se comportó como se comportó, y **una
regresión silenciosa en una política de seguridad puede pasar a producción sin que nadie la vea.**
TDD y SDD no ayudan: fueron pensados para gobernar **código determinista**, y un LLM no lo es.

## La propuesta

Elevar el contexto a un **contrato de primer nivel** (`context.yaml`) y construir un flujo de trabajo
alrededor de él. La idea distintiva es que el contrato es **híbrido** — combina dos naturalezas que
las metodologías clásicas mantienen separadas:

| Parte **dura** (determinista, se *verifica*) | Parte **blanda** (probabilística, se *juzga*) |
| :--- | :--- |
| Estructura, presupuestos de tokens, firmas, reglas | El comportamiento real del modelo |
| Contexto estático: políticas, instrucciones fijas | Contexto dinámico: memoria, RAG, input del usuario |
| La valida un **gate determinista** | La decide un **humano apoyado por un modelo** |

**Regla de oro:** lo verificable se automatiza; lo opinable lo decide una persona — el modelo
informa, no decide.

## El norte (para qué)

> Que un humano pueda **delegar una tarea a una IA con confianza alta** de que esta no solo la
> *ejecutará*, sino que *verificará su propio trabajo* y *evitará alucinar* en lo posible.

El contrato híbrido es el instrumento de esa confianza: el humano no tiene que *creer* que salió
bien, puede *comprobarlo*; y donde el modelo podría alucinar, no tiene la última palabra.

## El flujo de trabajo (5 etapas)

`diseñar el contrato → firmar + lint → gate de cambios en CI → ensamblar en vivo → auditar / reproducir`

Adopción **gradual** en tres niveles: **L1** (declarar + verificar local) · **L2** (gate en CI) ·
**L3** (ensamblado + auditoría en producción). Un equipo empieza por L1 y sube cuando lo necesita.

## Por qué es creíble (no es solo teoría)

Hay una **implementación de referencia ejecutable** (Python, stdlib + 3 deps) que demuestra cada
cláusula con una corrida real y un test que la fija:

- **Gate de regresión de contexto con 9 reglas deterministas** — bloquea en CI si un cambio baja el
  presupuesto, degrada una prioridad crítica, debilita o elimina una política o un guardrail, etc.
- **Gobernanza con firma criptográfica (Ed25519) y quórum M-de-N** — cambiar una política exige la
  firma de un revisor autorizado; los cambios de alto riesgo, varias firmas. Resiste suplantación y
  auto-registro (verificado con tests adversarios).
- **Asistente de revisión opcional (LLM local)** — ayuda al humano a juzgar un cambio, pero **no
  bloquea ni firma**: es la parte blanda, explícitamente fuera del gate.
- **Independencia tecnológica demostrada** — `export` emite el mismo contrato a formato OpenAI /
  Anthropic / texto. Migrar de framework no reescribe el contrato.
- **Salida estructurada (`--json`) y auto-descripción (`spec`)** — consumible por un agente o un CI,
  no solo por un humano.

**Validación honesta:** un segundo contrato de dominio distinto encontró un bug de semántica; una
revisión adversaria del propio gate encontró 3 bypasses (todos cerrados); y al cablear el LLM
descubrimos —y corregimos— un sesgo de prompt que habría marcado *toda mejora* como regresión. Todo
documentado en [`ccdd_FINDINGS.md`](ccdd_FINDINGS.md).

## Alcance honesto (qué CCDD **no** hace)

CCDD controla la **integridad del contexto**, no es seguridad integral del agente. Quedan fuera:
jailbreak del modelo base, seguridad de las acciones/herramientas, filtrado de la salida, y
veracidad de las fuentes externas. La prioridad de slots evita que las políticas se *omitan* por
falta de espacio — no sustituye la robustez del propio modelo.

## Contexto: un patrón convergente

[DESIGN.md](https://github.com/google-labs-code/design.md) (Google Labs) propone lo mismo en otro
dominio: un contrato híbrido (tokens exactos + prosa que explica el porqué) para que los agentes
generen UI con intención. Que dos proyectos lleguen a la misma forma —*máquina-verificable + juicio
humano*— desde dominios distintos sugiere que el patrón **"contrato híbrido para agentes"** es real
y generalizable. CCDD es el hermano *conductual* de ese enfoque *visual*.

## Lo que proponemos / cómo participar

1. **Probarlo:** clonar la referencia, correr `lint / diff / assemble / export` sobre los contratos
   de ejemplo (5 minutos, ver Quickstart en [`README.md`](README.md)).
2. **Discutir la especificación:** [`ccdd_spec_v0.3.md`](ccdd_spec_v0.3.md) es un Draft — los niveles
   de conformidad, las 9 reglas del gate y el modelo de gobernanza están abiertos a crítica.
3. **Romperlo:** la mejor contribución es una **revisión adversaria** independiente — un bypass del
   gate que no hayamos cubierto.
4. **Roadmap a v0.4:** tokenizador real, caducidad/revocación de atestaciones, rotación de claves.

## Mapa de lectura

| Para… | Leer |
| :--- | :--- |
| entender *por qué* | [`ccdd_workflow.md`](ccdd_workflow.md) (manifiesto) |
| *implementar* | [`ccdd_spec_v0.3.md`](ccdd_spec_v0.3.md) + [`ccdd_context.schema.json`](ccdd_context.schema.json) |
| *verlo correr* | [`ccdd_reference/`](ccdd_reference/) |
| el *cómo se construyó* (lecciones) | [`ccdd_FINDINGS.md`](ccdd_FINDINGS.md) |
