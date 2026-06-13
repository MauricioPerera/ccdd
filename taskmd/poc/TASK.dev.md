---
id: poc-dev-001
objetivo: "Implementar la función sum(a,b) para que devuelva la suma de a y b"
executor: { runtime: pi, model: "kimi-k2.6:cloud", tools: [read, edit, write, bash], isolation: container }
workdir: ./devrepo
dod: ./DOD.dev.md
limits: { timeout_s: 220, max_retries: 2 }
acceptance:
  - scenario: "los tests pasan"
    given:
      - "un repo con sum.mjs sin implementar y sum.test.mjs"
    when:
      - "el agente implementa sum(a,b)"
    then:
      - "el comando 'node --test' tiene éxito"
audit: { record: ./audit/poc-dev-001.json }
---

## Historia
Como desarrollador quiero que `sum(a,b)` devuelva la suma, para que la suite pase.

## Contexto para el ejecutor
- Archivo a implementar: `sum.mjs` (función `sum` exportada).
- Tests: `sum.test.mjs` (no editar).
- Elimina el marcador `TODO` al implementar.

## Criterios blandos (juicio humano)
- La implementación es simple y legible.
