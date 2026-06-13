---
id: poc-dev-sandbox
objetivo: "Implementar secretCode(name) para que cumpla su especificación (definida en los tests)"
executor: { runtime: pi, model: "kimi-k2.6:cloud", tools: [read, edit, write], isolation: sandbox }
workdir: ./sandboxdemo/src
gate_tests: ./sandboxdemo/gate
dod: ./DOD.dev-sandbox.md
limits: { timeout_s: 220, max_retries: 3 }
acceptance:
  - scenario: "los tests de secretCode pasan"
    given:
      - "un sandbox con secret.mjs (sin los tests)"
    when:
      - "el agente implementa secretCode(name)"
    then:
      - "el comando 'node --test' tiene éxito"
audit: { record: ./audit/poc-dev-sandbox.json }
---

## Historia
Como desarrollador quiero `secretCode(name)` que cumpla la especificación.

## Contexto para el ejecutor
- Implementa `secretCode` exportada en `secret.mjs`.
- Los tests NO están en tu directorio; descubrirás los requisitos por el feedback.
