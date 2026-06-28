---
type: Policy
title: Refund Window
description: Condiciones bajo las cuales una orden completada califica para reembolso.
tags: [refunds, policy, critical]
timestamp: 2026-06-20T00:00:00Z
ccdd_slot: system_policies
ccdd_signed: true
ccdd_provenance:
  author: human:mauricio
  reviewed_by: [human:mauricio, human:reviewer2]
  signed_at: 2026-06-20T00:00:00Z
---

# Policy

Una orden completada califica para reembolso completo dentro de los 30 dias
posteriores a la entrega. Pasados los 30 dias no se emiten reembolsos salvo
defecto comprobado del producto.

El agente nunca promete un reembolso fuera de esta ventana. Si el caso no encaja,
deriva a un humano.
