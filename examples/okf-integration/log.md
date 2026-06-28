# Update Log

## 2026-06-28
* **Vigencia firmada (Ed25519)**: la atestación de vigencia ahora se firma con clave privada del revisor y se verifica contra `reviewers.json`. La firma cubre concepto+contenido+ventana; no se puede forjar ni extender sin la clave.
* **Capa 3 (sidecar)**: agregado gobierno de vigencia por edad (`freshness.yaml` + `check_freshness.py`) y la [Tesis OKF + CCDD](/THESIS.md). Cubre la grieta que ni OKF ni CCDD gobiernan; mide edad (proxy), no verdad.

## 2026-06-25
* **Creation**: agente de enriquecimiento agregó [Freshness alert](/playbooks/freshness-alert.md).

## 2026-06-20
* **Update**: revisión humana de [Refund Window](/policies/refunds.md), firmada con quórum.

## 2026-06-18
* **Initialization**: estructura base del bundle.
