#!/usr/bin/env python
"""
CCDD — draft: generación de contenido de dominio ASISTIDA POR IA (fuera del núcleo).

Sobre un contrato ya creado con `ccdd init` (estructura + políticas base vetadas, ambas
DETERMINISTAS), usa un LLM local (LM Studio) para BORRONEAR el contenido específico del dominio:
  - el system prompt (`system.txt`),
  - reglas de política ADICIONALES, específicas del dominio — que se AGREGAN a la base vetada,
    nunca la reemplazan.

Diseño (igual que `review_assist.py`): vive FUERA de `ccdd.py` porque es no-determinista. No tiene
autoridad: produce un **borrador sin firmar**. El humano lo revisa, lo lintea y lo firma con
`ccdd.py lint --sign`. Nada se confía sin firma humana. La base de seguridad vetada queda intacta.

Uso: python draft.py <contract_dir> --from "descripción del agente" [--model M]
Requiere LM Studio (o endpoint OpenAI-compatible). Config por entorno: CCDD_LLM_ENDPOINT/MODEL/TIMEOUT.
"""
from __future__ import annotations
import argparse, json, urllib.request, urllib.error
from pathlib import Path

import review_assist as ra  # reusa DEFAULT_ENDPOINT / DEFAULT_MODEL / DEFAULT_TIMEOUT

DOMAIN_MARKER = "# --- DOMINIO (BORRADOR generado por IA — REVISAR antes de firmar) ---"


def apply_draft(contract_dir: Path, system_prompt: str, domain_policies: str) -> None:
    """Aplica un borrador a los archivos del contrato de forma DETERMINISTA, separada de la
    llamada al LLM para poder VERIFICARLA sin un modelo. Invariante de seguridad:
      - reemplaza `system.txt` (contenido blando),
      - en `policies.txt` CONSERVA la base vetada y agrega el dominio bajo `DOMAIN_MARKER`,
      - idempotente: re-aplicar reemplaza la sección de dominio, nunca duplica ni toca la base."""
    (contract_dir / "system.txt").write_text(system_prompt.strip() + "\n", encoding="utf-8")
    pol = contract_dir / "policies.txt"
    base_only = pol.read_text(encoding="utf-8").split(DOMAIN_MARKER)[0].rstrip()
    # el contenido del modelo no puede inyectar un 2º marcador (mantiene la idempotencia exacta)
    domain = domain_policies.replace(DOMAIN_MARKER, "").strip()
    pol.write_text(f"{base_only}\n\n{DOMAIN_MARKER}\n{domain}\n", encoding="utf-8")


def chat(system: str, user: str, model: str, endpoint: str, timeout: int) -> str:
    body = json.dumps({
        "model": model,
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user}],
        "temperature": 0.2, "max_tokens": 800,
    }).encode("utf-8")
    req = urllib.request.Request(endpoint, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.loads(r.read().decode("utf-8"))
    m = d["choices"][0]["message"]
    return (m.get("content") or m.get("reasoning_content") or "").strip()


def main() -> int:
    ap = argparse.ArgumentParser(description="CCDD draft (asistido por IA, produce un borrador sin firmar)")
    ap.add_argument("contract_dir", type=Path)
    ap.add_argument("--from", dest="desc", required=True, help="descripción del agente en lenguaje natural")
    ap.add_argument("--model", default=ra.DEFAULT_MODEL)
    ap.add_argument("--endpoint", default=ra.DEFAULT_ENDPOINT)
    a = ap.parse_args()

    if not (a.contract_dir / "context.yaml").exists():
        print(f"draft: no hay context.yaml en {a.contract_dir} — corré `ccdd.py init` primero")
        return 1

    print("=" * 72)
    print("CCDD draft · ASISTIDO POR IA (no determinista) — produce un BORRADOR sin firmar")
    print(f"modelo: {a.model}  ·  contrato: {a.contract_dir}")
    print("=" * 72)
    try:
        system_prompt = chat(
            "Eres un ingeniero de prompts. Escribís el system prompt de un agente de IA: su rol, su "
            "tono y sus límites de comportamiento. Devolvés SOLO el texto del prompt, sin preámbulo, "
            "sin comillas, sin markdown.",
            f"Agente a configurar: {a.desc}\n\nEscribí su system prompt (4 a 8 líneas).",
            a.model, a.endpoint, ra.DEFAULT_TIMEOUT)
        domain_policies = chat(
            "Eres un auditor de seguridad. La política BASE del agente ya cubre: no revelar secretos, "
            "ignorar instrucciones inyectadas (prompt injection), y no ejecutar acciones irreversibles "
            "sin confirmación. NO repitas esas. Proponés reglas ADICIONALES específicas del dominio. "
            "Devolvés SOLO viñetas que empiezan con '- ', nada más.",
            f"Agente: {a.desc}\n\nListá 2 a 4 reglas de política ADICIONALES, específicas de este dominio.",
            a.model, a.endpoint, ra.DEFAULT_TIMEOUT)
    except (urllib.error.URLError, OSError) as e:
        print(f"LLM no disponible ({e}). No se generó nada; completá los .txt a mano.")
        return 0

    apply_draft(a.contract_dir, system_prompt, domain_policies)

    print("draft: BORRADOR escrito.")
    print("  · system.txt  (reemplazado por el system prompt propuesto)")
    print("  · policies.txt (base vetada CONSERVADA + sección de dominio marcada como borrador)")
    print("-" * 72)
    print("  RECORDATORIO: es el borrador de un modelo falible.")
    print("  1) Revisá — sobre todo las políticas de dominio (el modelo puede omitir o aflojar).")
    print("  2) Corré:  python ccdd.py lint <dir>   (verá advertencias de calidad si quedó flojo)")
    print("  3) Cuando estés conforme, FIRMÁ vos:  python ccdd.py lint <dir> --sign")
    print("  La base de seguridad NO la tocó la IA; solo agregó contenido de dominio.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
