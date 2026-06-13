---
id: poc-dev-002
objetivo: "Implementar roundHalfEven(x) que redondea x al entero más cercano"
executor: { runtime: pi, model: "kimi-k2.6:cloud", tools: [read, edit, write, bash], isolation: container }
workdir: ./devrepo
dod: ./DOD.dev.md
limits: { timeout_s: 220, max_retries: 3 }
acceptance:
  - scenario: "los tests de redondeo pasan"
    given:
      - "un repo con bankers.mjs sin implementar y bankers.test.mjs"
    when:
      - "el agente implementa roundHalfEven(x)"
    then:
      - "el comando 'node --test bankers.test.mjs' tiene éxito"
audit: { record: ./audit/poc-dev-002.json }
---

## Historia
Como desarrollador quiero `roundHalfEven(x)` para redondear al entero más cercano.

## Contexto para el ejecutor
- Implementa la función `roundHalfEven` exportada en `bankers.mjs`.
- No edites `bankers.test.mjs`.
