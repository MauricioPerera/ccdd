---
id: poc-dev-003
objetivo: "Implementar secretCode(name) para que cumpla su especificación (definida en los tests)"
executor: { runtime: pi, model: "kimi-k2.6:cloud", tools: [write], isolation: tool-restricted }
workdir: ./devrepo
dod: ./DOD.dev.md
limits: { timeout_s: 220, max_retries: 3 }
acceptance:
  - scenario: "los tests de secretCode pasan"
    given:
      - "un repo con secret.mjs y secret.test.mjs"
    when:
      - "el agente implementa secretCode(name)"
    then:
      - "el comando 'node --test ../_holdout/secret.test.mjs' tiene éxito"
audit: { record: ./audit/poc-dev-003.json }
---

## Historia
Como desarrollador quiero `secretCode(name)` que cumpla la especificación dada por los tests.

## Contexto para el ejecutor
- Implementa `secretCode` exportada en `secret.mjs`. No edites `secret.test.mjs`.
- La especificación está EN los tests; no se conoce de antemano.
