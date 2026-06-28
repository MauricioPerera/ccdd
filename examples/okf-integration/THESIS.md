---
type: Documentation
title: Tesis de la POC OKF + CCDD
description: Análisis de por qué OKF y CCDD son complementos duales, dónde está el único seam, y qué deja sin gobernar la combinación.
tags: [okf, ccdd, architecture, thesis]
timestamp: 2026-06-28T00:00:00Z
ccdd_provenance:
  author: agent:claude-opus-4-8
  generated_at: 2026-06-28T00:00:00Z
---

# Tesis

OKF y CCDD son **complementos no solapados por diseño**. El "Out of Scope" de
OKF v0.1 (provenance, signing, access control, context budgeting, freshness)
es casi exactamente el "In Scope" de CCDD. OKF gobierna el **conocimiento en
reposo** (portable, legible, diffeable). CCDD gobierna el **conocimiento en
inferencia** (qué entra a la ventana, con qué garantías, bajo qué presupuesto).
Misma materia, dos estados. Esta POC es la prueba de existencia de que el límite
entre ambos es real y componible sin modificar ninguno de los dos specs.

# El seam es legal, no un hack

El interlock —`policies/refunds.md` siendo a la vez concepto OKF y slot CCDD
firmado (`system_policies`)— lo autoriza el propio §9 de OKF: *"Consumers MUST
NOT reject a bundle because of unknown additional frontmatter keys."* Esa
cláusula de recepción permisiva es la licencia formal para que `ccdd_slot`,
`ccdd_signed` y `ccdd_provenance` viajen en el frontmatter sin romper
conformidad. Verificado: `okf` lo tolera, `ccdd lint` lo lee, ninguno cede.

# El aporte real: gradiente de severidad sobre un corpus plano

OKF trata todos los conceptos con el mismo rigor permisivo (links rotos
tolerados, `type` desconocido válido). La POC demuestra que se puede superponer
un gradiente de severidad sin forkear el corpus:

* el subconjunto crítico se **promueve** a slot estático (firma + quórum +
  `compaction: none`);
* el largo cola fluye por el slot dinámico permisivo (`summarize`, sin gobierno
  de contenido).

La severidad queda scopeada al **riesgo**, no al corpus.

# El límite honesto

CCDD es slot-granular y enumerado; OKF es file-granular y no acotado. CCDD **no
completa** OKF para todo el corpus: solo para el subconjunto promovible a slot.
El largo cola sigue bajo el régimen deliberadamente no-gobernado de OKF — sin
firma ni procedencia verificada. Gobernarlo exige un validador OKF §9 +
chequeo de procedencia como paso de CI aparte; es pegamento, no CCDD nativo.

# La grieta que ninguno cubre: freshness

OKF hace `timestamp` opcional y no valida frescura. CCDD firma **contenido**
(anti-tamper), no **recencia**: una política firmada y obsoleta pasa el gate para
siempre. Ni OKF ni CCDD responden *"¿este conocimiento sigue vigente?"*. Esa es
la frontera real que la POC ilumina. Ver [Freshness alert](/playbooks/freshness-alert.md),
que gobierna la frescura de los *datos*, no la del *conocimiento*.

La POC la ataca en dos niveles: (1) un proxy determinista por **edad**
(`freshness.yaml` + `check_freshness.py`), y (2) una **atestación humana de
vigencia firmada Ed25519** (`attestations.json` + `attest_vigencia.py`, verificada
contra `reviewers.json`) — un humano afirma "sigue siendo verdad" y lo **firma**
con su clave privada. La firma cubre `concepto:content_sha:attested_at:valid_until`,
así que se anula si el contenido cambia O si se intenta extender la ventana sin
re-firmar, y no puede forjarla quien no tenga la clave. La atestación supersede a
la edad. Lo único que NO se automatiza —y es el punto— es el *juicio* de verdad:
lo aporta el humano; la máquina lo liga, lo firma, lo verifica y lo caduca.
Estados: VIGENT / EXPIRED-ATTEST / VOID-ATTEST / INVALID-ATTEST / fallback por edad.

# Estado verificado de la POC

Contra el tooling de referencia (`ccdd.py`) y el SPEC de OKF v0.1:

* `context.yaml` valida contra `ccdd_context.schema.json` — OK.
* `ccdd lint` — OK (3 slots; crítico 166 tok / 14000 disponibles).
* `ccdd assemble` — OK (`system_policies` full e intocable; guardrails verdes).
* Conformidad OKF §9 — frontmatter parseable y `type` no vacío en todo `.md`.

# En una frase

OKF y CCDD son complementos no solapados cuyo único punto de contacto —el
concepto crítico promovido a slot firmado— está sancionado por la cláusula de
permisividad de OKF; juntos cubren reposo + inferencia, pero dejan al
descubierto, por construcción, el gobierno del largo cola y la vigencia
semántica del conocimiento.
