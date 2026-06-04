#!/usr/bin/env python
"""
CCDD — Asistente de revisión (ADVISORY, NO determinista, FUERA del gate).

Usa un LLM local (LM Studio, endpoint OpenAI-compatible) para AYUDAR a un revisor
humano a decidir si un cambio de contenido de una política lo debilita. Es una
herramienta del revisor, no un componente del gate:

  - NO bloquea nada. NO firma nada. NO sustituye la atestación humana (R6).
  - El gate L2 (`ccdd.py diff`) es 100% determinista y no llama a este archivo.
  - El LLM SE EQUIVOCA: su veredicto es una opinión, no una autoridad. El revisor
    decide y firma con `ccdd.py attest`.

Está en un archivo aparte a propósito: la frontera determinista / heurística de CCDD
es física, no solo conceptual. Ver spec §5.5 y §6.3 (P3).

Uso:
  python review_assist.py <baseline_dir> <head_dir> <slot_id> [--model M] [--endpoint URL]
Config por entorno: CCDD_LLM_ENDPOINT, CCDD_LLM_MODEL.
"""
from __future__ import annotations
import argparse, json, os, sys, urllib.request, urllib.error
from pathlib import Path

DEFAULT_ENDPOINT = os.environ.get("CCDD_LLM_ENDPOINT", "http://localhost:1234/v1/chat/completions")
DEFAULT_MODEL = os.environ.get("CCDD_LLM_MODEL", "ibm/granite-3.2-8b")
DEFAULT_TIMEOUT = int(os.environ.get("CCDD_LLM_TIMEOUT", "300"))  # modelos de razonamiento son lentos

SYSTEM = (
    "Eres un auditor de seguridad objetivo. Clasificas un cambio de política de un agente "
    "LLM en EXACTAMENTE una categoría según su efecto en la postura de seguridad:\n"
    "- STRENGTHENS: más estricta (añade prohibiciones, endurece reglas, exige más controles).\n"
    "- NEUTRAL: mismo significado, solo cambia la redacción.\n"
    "- WEAKENS: menos estricta (añade excepciones, suaviza prohibiciones, reduce el alcance).\n"
    "NO asumas que todo cambio debilita: un cambio puede fortalecer o ser neutro. "
    "Lee con cuidado qué se añade y qué se quita. Respondes SOLO con JSON válido."
)
USER_TMPL = (
    "ANTES:\n{before}\n\nDESPUÉS:\n{after}\n\n"
    "Clasifica el efecto del cambio (ANTES → DESPUÉS). "
    "JSON: {{\"verdict\": \"<STRENGTHENS|NEUTRAL|WEAKENS>\", "
    "\"reason\": \"una frase\", \"concerns\": [\"...\"]}}"
)


def slot_static_path(contract_dir: Path, slot_id: str) -> Path | None:
    cy = contract_dir / "context.yaml"
    if not cy.exists():
        return None
    import yaml
    c = yaml.safe_load(cy.read_text(encoding="utf-8"))["contract"]
    s = next((s for s in c["slots"] if s["id"] == slot_id), None)
    if not s or s["source"].get("type") != "static":
        return None
    return contract_dir / s["source"]["path"]


def call_llm(endpoint: str, model: str, before: str, after: str, timeout: int = DEFAULT_TIMEOUT) -> dict:
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": USER_TMPL.format(before=before, after=after)},
        ],
        "temperature": 0,
        "max_tokens": 800,   # holgura para modelos que "razonan" antes del JSON
    }).encode("utf-8")
    req = urllib.request.Request(endpoint, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read().decode("utf-8"))
    msg = data["choices"][0]["message"]
    return _parse_json(msg.get("content") or msg.get("reasoning_content") or "")


VALID_VERDICTS = {"WEAKENS", "NEUTRAL", "STRENGTHENS"}


def _parse_json(text: str) -> dict:
    t = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    i, j = t.find("{"), t.rfind("}")
    if i >= 0 and j > i:
        try:
            obj = json.loads(t[i:j + 1])
            v = obj.get("verdict", "")
            # algunos modelos devuelven la PLANTILLA literal ("WEAKENS|NEUTRAL|...") o un
            # valor fuera del conjunto: no es un juicio, es ruido. No lo aceptamos.
            if v not in VALID_VERDICTS:
                return {"verdict": "UNKNOWN",
                        "reason": f"el modelo no emitió un veredicto válido (devolvió {v!r})",
                        "concerns": []}
            return obj
        except json.JSONDecodeError:
            pass
    return {"verdict": "UNKNOWN", "reason": f"respuesta no parseable: {text[:120]}", "concerns": []}


def main() -> int:
    ap = argparse.ArgumentParser(description="CCDD review-assist (ADVISORY, no determinista)")
    ap.add_argument("baseline_dir", type=Path)
    ap.add_argument("head_dir", type=Path)
    ap.add_argument("slot_id")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    a = ap.parse_args()

    bp = slot_static_path(a.baseline_dir, a.slot_id)
    hp = slot_static_path(a.head_dir, a.slot_id)
    if hp is None:
        print(f"review-assist: '{a.slot_id}' no es un slot estático en head"); return 1
    before = bp.read_text(encoding="utf-8") if (bp and bp.exists()) else "(slot nuevo, sin versión previa)"
    after = hp.read_text(encoding="utf-8")
    if before == after:
        print("review-assist: sin cambios de contenido; nada que revisar."); return 0

    print("=" * 70)
    print("CCDD review-assist  ·  ADVISORY (no determinista, NO bloquea, NO firma)")
    print(f"modelo: {a.model}  ·  slot: {a.slot_id}")
    print("=" * 70)
    try:
        v = call_llm(a.endpoint, a.model, before, after)
    except (urllib.error.URLError, OSError) as e:
        print(f"LLM no disponible ({e}). El revisor procede SIN asistencia — el gate")
        print("sigue exigiendo su atestación firmada igualmente.")
        return 0

    print(f"  veredicto del modelo : {v.get('verdict', '?')}")
    print(f"  razón                : {v.get('reason', '')}")
    for c in v.get("concerns", []) or []:
        print(f"  · preocupación        : {c}")
    print("-" * 70)
    print("  RECORDATORIO: esto es una OPINIÓN de un modelo falible, no un veredicto.")
    print("  El revisor humano decide y, si aprueba, firma con `ccdd.py attest`.")
    print("  El gate (`ccdd.py diff`) NO usa esta salida: exige tu firma igual.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
