---
type: Documentation
title: POC — Gobierno de conocimiento en 3 capas (OKF + CCDD + freshness)
description: Bundle OKF gobernado por CCDD con una capa sidecar de vigencia. Demuestra que OKF (reposo) y CCDD (inferencia) son complementos duales.
tags: [okf, ccdd, poc, governance]
timestamp: 2026-06-28T00:00:00Z
ccdd_provenance:
  author: agent:claude-opus-4-8
  generated_at: 2026-06-28T00:00:00Z
---

# POC: gobierno de conocimiento en 3 capas

Esta POC demuestra empíricamente que **OKF** (Open Knowledge Format) y **CCDD**
(el contrato de contexto) son **complementos duales por diseño**, y delimita el
único hueco que ninguno de los dos cubre. La tesis completa está en
[THESIS.md](/THESIS.md).

## Las tres capas

| Capa | Gobierna | Spec / tooling | Archivos |
|------|----------|----------------|----------|
| **OKF** | conocimiento en reposo (portabilidad, conformidad §9) | OKF v0.1 | todos los `.md` |
| **CCDD** | inferencia: integridad de contexto + presupuesto | `ccdd.py` (repo upstream) | `context.yaml`, `expected-hashes.json` |
| **Freshness (sidecar)** | vigencia por edad (proxy, NO verdad) | propio | `freshness.yaml`, `check_freshness.py` |

## El seam

`policies/refunds.md` es a la vez un concepto OKF conforme (`type: Policy`) y el
slot crítico CCDD `system_policies` (firmado, `compaction: none`, quórum 2). El
mismo archivo, gobernado por el gate y legible por OKF, sin modificar ningún
spec. Lo autoriza OKF §9: *"Consumers MUST NOT reject a bundle because of unknown
additional frontmatter keys."*

## Reproducir (las 3 verdes)

Requiere el repo de referencia CCDD (`ccdd.py`) y `pyyaml` + `jsonschema`.

```bash
# Capa OKF §9: todo .md no reservado tiene frontmatter parseable con type
#   (validación mínima incluida en el chequeo de abajo)

# Capa CCDD — integridad + presupuesto + ensamblado
python ../../ccdd_reference/ccdd.py lint .
echo '{"user_query":"reembolso de orden entregada hace 40 dias"}' > /tmp/q.json
python ../../ccdd_reference/ccdd.py assemble . --inputs /tmp/q.json

# Capa Freshness — vigencia por edad (--now es obligatorio y determinista)
python check_freshness.py . --now 2026-06-28
python check_freshness.py . --now 2026-10-01   # demo: el playbook salta a STALE

# Capa Vigencia — atestación humana FIRMADA (Ed25519; supersede a la edad)
# 1. registrar identidad del revisor (reutiliza el tooling CCDD; la privada NO se versiona)
python ../../ccdd_reference/ccdd.py keygen . --reviewer human:mauricio --key mauricio.key
# 2. atestar y firmar (la firma cubre concepto+sha+ventana: se anula si cambia el contenido o la ventana)
python attest_vigencia.py . --concept policies/refunds.md \
    --by human:mauricio --on 2026-06-28 --until 2027-06-28 --key mauricio.key --note "..."
# 3. verificar (firma inválida o no registrada -> INVALID-ATTEST; vencida -> EXPIRED-ATTEST)
python check_freshness.py . --now 2026-06-28
python check_freshness.py . --now 2027-09-01
```

## Lo que esta POC NO resuelve (por construcción)

1. **Largo cola sin gobierno de contenido**: CCDD es slot-granular; solo gobierna
   el subconjunto promovible a slot. El resto queda OKF-permisivo.
2. **Vigencia semántica**: ni OKF (timestamp opcional) ni CCDD (firma contenido,
   no recencia) responden *"¿sigue siendo verdad?"*. La POC la aproxima en dos
   niveles: edad (`check_freshness.py`) y **atestación humana firmada Ed25519**
   (`attestations.json` + `attest_vigencia.py`), verificada contra `reviewers.json`.
   La firma cubre concepto+contenido+ventana, así que no se puede forjar ni
   extender sin la clave privada. Lo único que no se automatiza —el *juicio* de
   verdad— lo aporta el humano, por diseño.

## Estructura

```
context.yaml              contrato CCDD (3 slots, budget, 2 guardrails)
expected-hashes.json      firma SHA-256 del slot crítico {slot: sha}
freshness.yaml            política de vigencia por edad (TTL por type)
check_freshness.py        validador capa 3 (edad + atestación firmada de vigencia)
attestations.json         atestaciones de vigencia FIRMADAS (Ed25519)
attest_vigencia.py        herramienta para registrar/firmar una atestación
reviewers.json            registro de claves públicas (raíz de confianza)
# mauricio.key            clave privada del revisor — NO se versiona (.gitignore *.key)
index.md, log.md          reservados OKF
README.md, THESIS.md      docs (conceptos OKF, largo cola)
policies/refunds.md       seam: concepto OKF + slot crítico firmado
playbooks/freshness-alert.md
```
