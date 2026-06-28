---
type: Playbook
title: Freshness alert triage
description: Pasos para triage de una alerta de frescura sobre el pipeline de ordenes.
tags: [oncall, incident]
timestamp: 2026-06-25T14:10:00Z
ccdd_provenance:
  author: agent:enrichment-bot
  model: claude-sonnet-4-6
  generated_at: 2026-06-25T14:10:00Z
---

# Trigger

Salta cuando `orders` se atrasa mas de 30 minutos respecto de su SLA.
Ver la [politica de reembolsos](/policies/refunds.md) si el cliente reclama por demora.

# Steps

1. Revisar el dashboard de ingestion.
2. Verificar el ultimo job de carga.
