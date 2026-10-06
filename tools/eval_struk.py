"""Evaluasi pembacaan struk: seberapa sering baris struk dipetakan ke emiten yang benar, dan
seberapa sering aplikasi MENGARANG emiten untuk merek yang pemiliknya tidak tercatat di BEI.

    .venv/bin/python tools/eval_struk.py                      # Core lokal (http://127.0.0.1:8788)
    .venv/bin/python tools/eval_struk.py --base https://sectors.muflichlabs.online/api/core
    .venv/bin/python tools/eval_struk.py --set b               # set B (held-out, ditulis sebelum katalog diperluas)

Dua jalur dibandingkan:
  katalog saja  — pencocokan deterministik brands.lookup (tanpa AI), baseline
  aplikasi      — jalur /v1/struk/scan sungguhan (AI membaca merek → katalog + verifikasi ke data Sectors)
0 kredit Sectors (Store offline). Biaya AI: 1 panggilan per struk (set A 6, set B 4).
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "core"))
from app.struk import brands  # noqa: E402

UA = {"content-type": "application/json", "user-agent": "struk-eval/1.0"}


def scan(base: str, text: str) -> dict:
    req = urllib.request.Request(f"{base.rstrip('/')}/v1/struk/scan", data=json.dumps({"text": text}).encode(), headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def ok(exp: str | list[str] | None, got: str | None) -> bool:
    """expected bisa daftar bila lebih dari satu emiten sah (mis. operator toko dan induk yang mengonsolidasi)."""
    return got in exp if isinstance(exp, list) else got == exp


def score(rows: list[tuple[str, str | list[str] | None, str | None]]) -> dict:
    issuers = [r for r in rows if r[1]]
    others = [r for r in rows if not r[1]]
    return {
        "lines": len(rows),
        "correct": sum(1 for _, exp, got in rows if ok(exp, got)),
        "issuer_lines": len(issuers),
        "issuer_found": sum(1 for _, exp, got in issuers if ok(exp, got)),
        "non_issuer_lines": len(others),
        "invented": sum(1 for _, _, got in others if got),  # merek non-emiten yang dipaksa jadi emiten
        "wrong_issuer": sum(1 for _, exp, got in issuers if got and not ok(exp, got)),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8788")
    ap.add_argument("--set", choices=["a", "b"], default="a")
    ap.add_argument("--out")
    args = ap.parse_args()
    suffix = "" if args.set == "a" else "_b"
    out_path = args.out or str(ROOT / "fixtures" / "eval" / f"struk_eval{suffix}_result.json")
    spec = json.loads((ROOT / "fixtures" / "eval" / f"struk_eval{suffix}.json").read_text(encoding="utf-8"))

    base_rows, app_rows, detail = [], [], []
    for rc in spec["receipts"]:
        lines = rc["lines"]
        res = scan(args.base, "\n".join(raw for raw, _ in lines))
        by_raw = {raw: c["symbol"] for c in res.get("companies", []) for raw in c.get("items", [])}

        def found(raw: str) -> str | None:
            # Pembaca bisa memangkas harga/ukuran di ujung baris; cocokkan juga sebagai awalan.
            if raw in by_raw:
                return by_raw[raw]
            hits = [sym for r, sym in by_raw.items() if r and raw.upper().startswith(r.upper())]
            return hits[0] if hits else None
        verified = {ln["raw"]: ln.get("verified") for c in res.get("companies", []) for ln in c.get("lines", [])}
        for raw, exp in lines:
            hit = brands.lookup(raw)
            cat = hit.symbol if hit else None
            got = found(raw)
            base_rows.append((raw, exp, cat))
            app_rows.append((raw, exp, got))
            detail.append({"receipt": rc["id"], "raw": raw, "expected": exp, "catalog_only": cat, "app": got,
                           "app_verified_by_catalog": next((v for r, v in verified.items() if raw.upper().startswith(r.upper())), None) if got else None, "ok": ok(exp, got)})

    out = {"catalog_only": score(base_rows), "app": score(app_rows), "lines": detail}
    Path(out_path).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    def pct(a: int, b: int) -> str:
        return f"{a}/{b} ({100 * a / b:.0f}%)" if b else "-"

    print("| Jalur | Baris benar | Emiten ditemukan | Merek non-emiten dikarang jadi emiten | Emiten salah |")
    print("|---|---|---|---|---|")
    for name, s in (("Katalog saja (tanpa AI)", out["catalog_only"]), ("Aplikasi (AI + katalog + data Sectors)", out["app"])):
        print(f"| {name} | {pct(s['correct'], s['lines'])} | {pct(s['issuer_found'], s['issuer_lines'])} | "
              f"{pct(s['invented'], s['non_issuer_lines'])} | {s['wrong_issuer']} |")
    misses = [d for d in detail if not d["ok"]]
    if misses:
        print("\nMeleset:")
        for d in misses:
            print(f"  {d['receipt']:<20} {d['raw']:<24} harap={d['expected']}  dapat={d['app']}")


if __name__ == "__main__":
    main()
