#!/usr/bin/env python3
"""Registra una atestacion humana de VIGENCIA SEMANTICA sobre un concepto OKF.

Distinto de la firma de contenido CCDD (que dice 'aprobado') y del proxy de edad
(que dice 'reciente'): esto dice 'un humano afirma que SIGUE SIENDO VERDAD'.
Liga al sha256 del archivo (se anula si el contenido cambia) y caduca.

NO automatiza el juicio: el operador escribe quien atesta y hasta cuando. La
maquina solo lo persiste ligado a contenido y fecha.

Uso:
  python attest_vigencia.py <bundle> --concept policies/refunds.md \
      --by human:mauricio --on 2026-06-28 --until 2027-06-28 --note "..."
"""
import sys, json, hashlib, argparse, datetime, pathlib


def sha256_file(p: pathlib.Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("bundle")
    ap.add_argument("--concept", required=True)
    ap.add_argument("--by", required=True)
    ap.add_argument("--on", required=True, help="fecha de atestacion ISO")
    ap.add_argument("--until", required=True, help="vigente hasta ISO")
    ap.add_argument("--note", default="")
    args = ap.parse_args()

    root = pathlib.Path(args.bundle)
    target = root / args.concept
    if not target.exists():
        print(f"ERROR: no existe {args.concept}")
        return 1
    datetime.date.fromisoformat(args.on)
    datetime.date.fromisoformat(args.until)

    store = root / "attestations.json"
    data = (json.loads(store.read_text(encoding="utf-8"))
            if store.exists() else {"vigencia_version": "0.1", "attestations": []})

    entry = {
        "concept": args.concept,
        "content_sha256": sha256_file(target),
        "statement": "vigente",
        "attested_by": args.by,
        "attested_at": args.on,
        "valid_until": args.until,
        "note": args.note,
    }
    # reemplaza atestacion previa del mismo concepto
    data["attestations"] = [a for a in data["attestations"]
                            if a["concept"] != args.concept] + [entry]
    store.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                     encoding="utf-8")
    print(f"ATESTADO: {args.concept} vigente por {args.by} hasta {args.until} "
          f"(sha {entry['content_sha256'][:8]}…)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
