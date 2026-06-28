#!/usr/bin/env python3
"""Capa 3 sidecar: valida VIGENCIA por edad sobre un bundle OKF.

No pertenece a OKF ni a CCDD. Lee el `timestamp` (ISO 8601) del frontmatter de
cada concepto y lo compara contra el TTL declarado en freshness.yaml.

Limite honesto: mide EDAD, un proxy de obsolescencia. No mide verdad. Una
politica vieja-pero-correcta saldra stale; una nueva-pero-falsa pasara. La unica
forma de gobernar verdad es una atestacion humana (ver CCDD `attest`).

Uso: python check_freshness.py <bundle_dir> --now 2026-06-28 [--json]
"""
import sys, re, json, argparse, datetime, pathlib
import yaml

RESERVED = {"index.md", "log.md"}


def load_frontmatter(path: pathlib.Path) -> dict | None:
    m = re.match(r"^---\n(.*?)\n---", path.read_text(encoding="utf-8"), re.S)
    return (yaml.safe_load(m.group(1)) or {}) if m else None


def sha256_file(p: pathlib.Path) -> str:
    import hashlib
    return hashlib.sha256(p.read_bytes()).hexdigest()


def load_attestations(root: pathlib.Path) -> dict:
    f = root / "attestations.json"
    if not f.exists():
        return {}
    data = json.loads(f.read_text(encoding="utf-8"))
    return {a["concept"]: a for a in data.get("attestations", [])}


def parse_ts(value) -> datetime.date | None:
    if value is None:
        return None
    s = str(value).replace("Z", "+00:00")
    try:
        return datetime.datetime.fromisoformat(s).date()
    except ValueError:
        try:
            return datetime.date.fromisoformat(s[:10])
        except ValueError:
            return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("bundle")
    ap.add_argument("--now", required=True, help="fecha de referencia ISO (YYYY-MM-DD)")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    root = pathlib.Path(args.bundle)
    now = datetime.date.fromisoformat(args.now)
    pol = yaml.safe_load((root / "freshness.yaml").read_text(encoding="utf-8"))
    defaults = pol.get("defaults", {})
    overrides = pol.get("overrides", {})
    on_stale = pol.get("on_stale", "warn")
    require_ts = set(pol.get("require_timestamp_for_types", []))

    attestations = load_attestations(root)

    rows, stale, missing = [], 0, 0
    for f in sorted(root.rglob("*.md")):
        if f.name in RESERVED:
            continue
        fm = load_frontmatter(f)
        rel = f.relative_to(root).as_posix()
        if fm is None:
            continue
        ctype = fm.get("type")
        ttl = overrides.get(rel, defaults.get(ctype))

        # Señal autoritativa: una atestacion humana de vigencia supersede a la edad.
        att = attestations.get(rel)
        if att is not None:
            void = att.get("content_sha256") != sha256_file(f)
            expired = now > datetime.date.fromisoformat(att["valid_until"])
            if void:
                stale += 1
                rows.append({"concept": rel, "type": ctype, "age_days": None,
                             "ttl_days": ttl, "status": "VOID-ATTEST",
                             "by": att.get("attested_by"),
                             "detail": "contenido cambió desde la atestación; re-atestar"})
                continue
            if expired:
                stale += 1
                rows.append({"concept": rel, "type": ctype, "age_days": None,
                             "ttl_days": ttl, "status": "EXPIRED-ATTEST",
                             "by": att.get("attested_by"),
                             "detail": f"vigencia venció {att['valid_until']}; re-atestar"})
                continue
            rows.append({"concept": rel, "type": ctype, "age_days": None,
                         "ttl_days": ttl, "status": "VIGENT",
                         "by": att.get("attested_by"),
                         "detail": f"atestado vigente hasta {att['valid_until']}"})
            continue

        ts = parse_ts(fm.get("timestamp"))
        if ts is None:
            sev = "MISSING-TS" if ctype in require_ts else "no-ts"
            if sev == "MISSING-TS":
                missing += 1
            rows.append({"concept": rel, "type": ctype, "age_days": None,
                         "ttl_days": ttl, "status": sev})
            continue
        if ttl is None:
            rows.append({"concept": rel, "type": ctype, "age_days": (now - ts).days,
                         "ttl_days": None, "status": "untracked"})
            continue
        age = (now - ts).days
        status = "STALE" if age > ttl else "fresh"
        if status == "STALE":
            stale += 1
        rows.append({"concept": rel, "type": ctype, "age_days": age,
                     "ttl_days": ttl, "status": status,
                     "remaining_days": ttl - age})

    result = {"now": args.now, "stale": stale, "missing_required_ts": missing,
              "on_stale": on_stale, "concepts": rows}
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"FRESHNESS @ {args.now}  (on_stale={on_stale})")
        for r in rows:
            age = "—" if r["age_days"] is None else f"{r['age_days']}d"
            ttl = "—" if r["ttl_days"] is None else f"{r['ttl_days']}d"
            rem = f"  (quedan {r['remaining_days']}d)" if r.get("remaining_days") is not None and r["status"] == "fresh" else ""
            extra = f"  [{r['by']}] {r['detail']}" if r.get("detail") else ""
            print(f"  [{r['status']:>14}] {r['concept']:<32} edad={age:<5} ttl={ttl}{rem}{extra}")
        print(f"  stale={stale}  missing_required_ts={missing}")

    fail = (stale + missing) > 0 and on_stale == "abort"
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
