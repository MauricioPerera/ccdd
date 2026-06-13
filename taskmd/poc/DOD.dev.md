---
id: dod-dev-v0
applies_to: dev
gates:
  - "el comando 'node --test' tiene éxito"
  - "el comando 'node check-no-todo.mjs' tiene éxito"
signoff: { by: "mauricio", at: "2026-06-13" }
---

## Definition of Done — tareas de desarrollo (v0)

Invariantes transversales:
- la suite completa pasa (no-regresión),
- no quedan marcadores `TODO` en el código.

`technical_done = (AC) AND (esta DoD)`. El lado blando (diseño/legibilidad) queda
para review humano (`accepted`), no para el gate.
