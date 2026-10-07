"""Panen snapshot Sectors untuk Paham Emiten — lewat Store (cache + ledger kredit), lalu
simpan respons asli ke fixtures/snapshot/ supaya demo & juri bisa jalan dengan 0 kredit.

  python tools/harvest.py --dry              # rencana + estimasi kredit (0 kredit)
  python tools/harvest.py --budget 80        # jalankan; berhenti sebelum melewati anggaran
  python tools/harvest.py --only matrix      # matrix | segments
  python tools/harvest.py --only segments --all-segments --dry   # seluruh emiten bersegmen yang belum di snapshot

Store harus berjalan dalam mode live (IDXMACA_STORE_MODE=live) untuk panen sungguhan.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "core"))

from app.struk import brands, universe  # noqa: E402

OUT = ROOT / "fixtures" / "snapshot"
STORE = "http://127.0.0.1:8787"
SEG_LIST = "/sectors/v2/companies/list_companies_with_segments/"
MAX_PAGES = 6  # ~950 emiten / 200 per halaman


def seg_endpoint(sym: str) -> str:
    return f"/sectors/v2/company/get-segments/{sym}/"


def save(category: str, name: str, endpoint: str, params: dict, resp: dict) -> None:
    d = OUT / category
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{name}.json").write_text(json.dumps({
        "endpoint": endpoint, "params": params, "http_status": resp.get("http_status", 200),
        "credits_spent": resp.get("credits_spent", 0), "fetched_at": resp.get("fetched_at"),
        "fetched_at_epoch": resp.get("fetched_at_epoch"), "source": resp.get("source"),
        "data": resp["data"],
    }, ensure_ascii=False, indent=1), encoding="utf-8")


def seed_segment_list_from_validation() -> list[str]:
    """Daftar emiten bersegmen sudah dibayar saat validasi — pakai ulang, jangan bayar lagi."""
    snap = OUT / "segments" / "_list.json"
    if not snap.exists():
        val = ROOT / "fixtures" / "validation" / "C_segments_list.json"
        body = json.loads(val.read_text(encoding="utf-8"))
        snap.parent.mkdir(parents=True, exist_ok=True)
        snap.write_text(json.dumps({
            "endpoint": SEG_LIST, "params": {}, "http_status": body["status"], "credits_spent": 1,
            "fetched_at_epoch": val.stat().st_mtime, "source": "sectors-live (validasi 2026-10-06)",
            "data": body["response"],
        }, ensure_ascii=False, indent=1), encoding="utf-8")
    data = json.loads(snap.read_text(encoding="utf-8"))["data"]
    return sorted(universe.bare(s) for s in data)


def _market_caps() -> dict[str, float]:
    pages = [json.loads(f.read_text(encoding="utf-8"))["data"] for f in sorted((OUT / "matrix").glob("*.json"))]
    recs = universe.merge_pages(pages) if pages else {}
    return {s: float(r.get("market_cap") or 0) for s, r in recs.items()}


def plan(only: str | None, all_segments: bool = False) -> list[tuple[str, str, str, dict]]:
    """(kategori, nama, endpoint, params) — matriks dihitung per halaman secara dinamis saat jalan."""
    out: list[tuple[str, str, str, dict]] = []
    if only in (None, "segments"):
        have = set(seed_segment_list_from_validation())
        syms = [s for s in brands.catalog_symbols() if s in have]
        if all_segments:
            # Katalog dulu, lalu sisanya urut kapitalisasi pasar — anggaran terpotong pun yang besar sudah dapat.
            caps = _market_caps()
            done = {f.stem for f in (OUT / "segments").glob("*.json")}
            rest = sorted((s for s in have if s not in syms), key=lambda s: -caps.get(s, 0))
            syms = [s for s in syms + rest if s not in done]
        for sym in syms:
            out.append(("segments", sym, seg_endpoint(sym), {}))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--budget", type=int, default=80)
    ap.add_argument("--only", choices=["matrix", "segments"])
    ap.add_argument("--all-segments", action="store_true", help="semua emiten bersegmen, bukan hanya katalog merek")
    ap.add_argument("--sleep", type=float, default=0.0, help="jeda antar panggilan miss (hindari 429)")
    args = ap.parse_args()

    client = httpx.Client(base_url=STORE, timeout=120)
    spent = 0

    def fetch(category: str, name: str, endpoint: str, params: dict) -> dict | None:
        nonlocal spent
        look = client.post("/v1/store/lookup", json={"endpoint": endpoint, "params": params}).json()
        est = int(look.get("est_credits_live") or 0)
        if args.dry:
            print(f"  [{'HIT ' if look.get('fresh') else 'MISS'}] {category}/{name}: est {est} kredit")
            spent += est
            return None
        if spent + est > args.budget:
            print(f"  STOP: {category}/{name} butuh {est}, total akan {spent + est} > anggaran {args.budget}")
            raise SystemExit(2)
        if args.sleep and not look.get("fresh"):
            time.sleep(args.sleep)
        r = client.post("/v1/store/fetch", json={"endpoint": endpoint, "params": params})
        if r.status_code >= 400:
            print(f"  GAGAL {category}/{name}: HTTP {r.status_code} {r.text[:300]}")
            return None
        resp = r.json()
        spent += int(resp.get("credits_spent") or 0)
        status = resp.get("http_status")
        print(f"  {category}/{name}: HTTP {status}, {resp.get('source')}, kredit {resp.get('credits_spent')} (total {spent})")
        # Cache hit tidak menimpa snapshot yang ada: provenans asli (sectors-live, kredit 1) harus tetap.
        is_hit = str(resp.get("source", "")).startswith("store-hit")
        if status and 200 <= int(status) < 300 and not (is_hit and (OUT / category / f"{name}.json").exists()):
            save(category, name, endpoint, params, resp)
        return resp

    health = client.get("/v1/health").json()
    print(f"Store mode={health.get('mode')} key={'ada' if health.get('sectors_key_configured') else 'TIDAK ADA'}")
    if not args.dry and health.get("mode") != "live":
        print("Store bukan mode live — batal.")
        return 1

    if args.only in (None, "matrix"):
        print("Matriks seluruh bursa (Screener + query_values):")
        for group in universe.GROUPS:
            for page in range(MAX_PAGES):
                params = universe.matrix_params(group, page * universe.PAGE)
                resp = fetch("matrix", f"{group}_{page}", universe.SCREENER, params)
                if args.dry:
                    if page == 4:
                        break  # estimasi: ~950 emiten = 5 halaman
                    continue
                if not resp or not (resp["data"].get("pagination") or {}).get("has_next"):
                    break

    rest = plan(args.only, args.all_segments)
    if rest:
        print(f"Segmen ({len(rest)}):")
    for category, name, endpoint, params in rest:
        fetch(category, name, endpoint, params)

    print(f"{'ESTIMASI' if args.dry else 'TOTAL'} kredit: {spent}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
