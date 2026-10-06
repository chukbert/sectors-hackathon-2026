"""Validasi 3 asumsi API Sectors sebelum membangun "Struk Jadi Saham" (estimasi 3 kredit).

Membaca SECTORS_API_KEY dari .env (tidak pernah dicetak). Respons mentah disimpan ke
fixtures/validation/ supaya bisa dianalisis ulang tanpa menembak API lagi.

  python tools/validate_api.py           # jalankan 3 panggilan
  python tools/validate_api.py --dry     # tampilkan rencana saja, 0 kredit
"""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "fixtures" / "validation"

CONSUMER = ["ICBP", "INDF", "UNVR", "AMRT", "MYOR", "TLKM", "BBRI"]
# Filter `symbol` di where WAJIB berakhiran .JK — tanpa itu hasil kosong (tetap 1 kredit).
SYMS = ", ".join(f"'{s}.JK'" for s in CONSUMER)

CALLS = [
    {
        "name": "A_arith_query_values",
        "question": "Ekspresi aritmetika antar-tahun jalan + query_values memuat semua field numerik yang dirujuk?",
        "path": "/v2/companies/",
        "params": {
            "where": "market_cap_rank <= 200 and revenue[2025] > revenue[2024] and earnings[2025] < earnings[2024]",
            "order_by": "-market_cap",
            "limit": 200,
            "include_query_values": "true",
        },
        "est": 1,
    },
    {
        "name": "B_list_fields",
        "question": "query_values / respons memuat major_shareholders, free_float, affiliates untuk emiten konsumer?",
        "path": "/v2/companies/",
        "params": {
            "where": f"symbol in [{SYMS}] and major_shareholders_share_percentage > 0 and free_float > 0",
            "order_by": "-market_cap",
            "limit": 50,
            "include_query_values": "true",
        },
        "est": 1,
    },
    {
        "name": "C_segments_list",
        "question": "Emiten konsumer utama punya data revenue segments?",
        "path": "/v2/companies/list_companies_with_segments/",
        "params": {},
        "est": 1,
    },
]


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def main() -> int:
    dry = "--dry" in sys.argv
    env = load_env()
    key = env.get("SECTORS_API_KEY", "")
    base = env.get("SECTORS_BASE_URL", "https://api.sectors.app").rstrip("/")
    scheme = env.get("SECTORS_AUTH_SCHEME", "")
    print(f"Rencana: {len(CALLS)} panggilan, estimasi {sum(c['est'] for c in CALLS)} kredit (400 = gratis).")
    if dry:
        for c in CALLS:
            print(f"- {c['name']}: {c['path']}?{urllib.parse.urlencode(c['params'])}")
        return 0
    if not key:
        print("SECTORS_API_KEY tidak ada di .env — batal, 0 kredit terpakai.")
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    auth = f"{scheme} {key}".strip()
    for c in CALLS:
        url = f"{base}{c['path']}"
        if c["params"]:
            url += "?" + urllib.parse.urlencode(c["params"])
        req = urllib.request.Request(url, headers={"Authorization": auth, "Accept": "application/json",
                                                     # UA bawaan Python-urllib diblokir Cloudflare (1010)
                                                     "User-Agent": "IDXMACA-Store/0.1"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                status, body = r.status, r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            status, body = e.code, e.read().decode("utf-8", "replace")
        try:
            data = json.loads(body)
        except ValueError:
            data = {"raw": body[:2000]}
        (OUT / f"{c['name']}.json").write_text(
            json.dumps({"request": {"path": c["path"], "params": c["params"]}, "status": status, "response": data},
                       ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"{c['name']}: HTTP {status} -> fixtures/validation/{c['name']}.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
