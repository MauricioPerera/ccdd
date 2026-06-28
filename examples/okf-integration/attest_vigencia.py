#!/usr/bin/env python3
"""Registra una atestacion humana FIRMADA de VIGENCIA SEMANTICA sobre un concepto OKF.

Distinto de la firma de contenido CCDD (que dice 'aprobado') y del proxy de edad
(que dice 'reciente'): esto dice 'un humano afirma que SIGUE SIENDO VERDAD'.

La firma Ed25519 cubre  vigencia:{concept}:{content_sha256}:{attested_at}:{valid_until}
de modo que se anula si el contenido cambia O si se intenta extender la ventana de
vigencia sin volver a firmar. La raiz de confianza es reviewers.json (mismo registro
que usa ccdd.py keygen); --by debe estar registrado alli.

NO automatiza el juicio: el humano decide 'sigue siendo verdad' y lo firma con su
clave privada. La maquina liga, verifica y caduca.

Generar identidad (reutiliza el tooling CCDD):
  python ../../ccdd_reference/ccdd.py keygen . --reviewer human:mauricio --key mauricio.key

Atestar:
  python attest_vigencia.py . --concept policies/refunds.md \
      --by human:mauricio --on 2026-06-28 --until 2027-06-28 \
      --key mauricio.key --note "..."
"""
import sys, json, hashlib, argparse, datetime, pathlib


def sha256_file(p: pathlib.Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def vigencia_msg(concept: str, content_sha: str, on: str, until: str) -> bytes:
    return f"vigencia:{concept}:{content_sha}:{on}:{until}".encode("utf-8")


def sign(priv_hex: str, msg: bytes) -> str:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    return Ed25519PrivateKey.from_private_bytes(bytes.fromhex(priv_hex)).sign(msg).hex()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("bundle")
    ap.add_argument("--concept", required=True)
    ap.add_argument("--by", required=True, help="id del revisor (debe estar en reviewers.json)")
    ap.add_argument("--on", required=True, help="fecha de atestacion ISO")
    ap.add_argument("--until", required=True, help="vigente hasta ISO")
    ap.add_argument("--key", required=True, help="ruta a la clave privada Ed25519")
    ap.add_argument("--note", default="")
    args = ap.parse_args()

    root = pathlib.Path(args.bundle).resolve()
    target = (root / args.concept).resolve()
    # Path traversal: el concepto debe quedar dentro del bundle.
    try:
        target.relative_to(root)
    except ValueError:
        print(f"ERROR: '{args.concept}' debe estar dentro del bundle.")
        return 1
    if not target.exists():
        print(f"ERROR: no existe {args.concept}")
        return 1
    try:
        datetime.date.fromisoformat(args.on)
        datetime.date.fromisoformat(args.until)
    except ValueError:
        print("ERROR: --on y --until deben tener formato ISO (YYYY-MM-DD).")
        return 1

    # el revisor debe estar registrado en la raiz de confianza
    reg_path = root / "reviewers.json"
    if not reg_path.exists():
        print("ERROR: no hay reviewers.json. Registra la identidad con: "
              "ccdd.py keygen . --reviewer <id> --key <privada>")
        return 1
    try:
        registry = json.loads(reg_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print("ERROR: reviewers.json no es un JSON válido.")
        return 1
    if args.by not in registry:
        print(f"ERROR: '{args.by}' no está registrado en reviewers.json.")
        return 1

    key_file = pathlib.Path(args.key)
    if not key_file.exists():
        print(f"ERROR: no existe la clave privada {args.key}")
        return 1
    priv_hex = key_file.read_text(encoding="utf-8").strip()

    content_sha = sha256_file(target)
    try:
        signature = sign(priv_hex, vigencia_msg(args.concept, content_sha, args.on, args.until))
    except (ValueError, TypeError) as e:
        print(f"ERROR: clave privada inválida: {e}")
        return 1

    store = root / "attestations.json"
    if store.exists():
        try:
            data = json.loads(store.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print(f"ERROR: {store.name} no contiene un JSON válido.")
            return 1
        if not isinstance(data, dict) or not isinstance(data.get("attestations"), list):
            print(f"ERROR: {store.name} no tiene la estructura esperada.")
            return 1
    else:
        data = {"vigencia_version": "0.2", "attestations": []}

    entry = {
        "concept": args.concept,
        "content_sha256": content_sha,
        "statement": "vigente",
        "attested_by": args.by,
        "attested_at": args.on,
        "valid_until": args.until,
        "signature": signature,
        "note": args.note,
    }
    data["vigencia_version"] = "0.2"
    data["attestations"] = [a for a in data["attestations"]
                            if not (isinstance(a, dict) and a.get("concept") == args.concept)] + [entry]
    store.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                     encoding="utf-8")
    print(f"ATESTADO+FIRMADO: {args.concept} vigente por {args.by} hasta {args.until} "
          f"(sha {content_sha[:8]}…, sig {signature[:8]}…)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
