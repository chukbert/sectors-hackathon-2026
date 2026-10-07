"""Probe 1 kredit: seberapa lengkap data lama, forecast, dan valuasi untuk 30 cek ala Snowflake?

Satu panggilan Screener dengan `symbol like '%' or ...` + include_query_values: nilai setiap
field yang dirujuk ikut kembali untuk 200 emiten pertama (urut simbol). Cakupan per field dihitung
dari sampel itu. Respons mentah disimpan ke fixtures/validation/.

  python tools/probe_snowflake.py --dry    # rencana saja, 0 kredit
  python tools/probe_snowflake.py          # 1 panggilan, 1 kredit
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_api import OUT, load_env  # noqa: E402

LOW = "-1000000000000000000"
FIELDS = [
    "eps[2015]", "eps[2016]", "eps[2020]", "eps[2025]",
    "total_dividend[2015]", "total_dividend[2016]", "total_dividend[2020]", "total_dividend[2025]",
    "debt_to_equity_ratio[2020]",
    "forecast_eps_growth[2026]", "forecast_revenue_growth[2026]", "forecast_eps_growth[2027]",
    "intrinsic_value", "peg[2025]", "pe_peer_avg[2025]",
]
PARAMS = {
    "where": "symbol like '%' or " + " or ".join(f"{f} > {LOW}" for f in FIELDS),
    "order_by": "symbol",
    "limit": 200,
    "include_query_values": "true",
}
NAME = "D_snowflake_coverage"


def coverage(data: dict) -> None:
    rows = data.get("results") or data.get("data") or []
    total = (data.get("pagination") or {}).get("total_count")
    print(f"sampel: {len(rows)} emiten (urut simbol, {rows[0]['symbol']}..{rows[-1]['symbol']}) · total_count: {total}"
          if rows else "sampel kosong")
    for f in FIELDS:
        vals = [(r.get("query_values") or {}).get(f) for r in rows]
        n = sum(v is not None for v in vals)
        nz = sum(v not in (None, 0) for v in vals)
        print(f"  {f:<30} terisi {n:>3}/{len(rows)} ({n / max(len(rows), 1):>4.0%}) · bukan nol {nz:>3}")


def main() -> int:
    print(f"Rencana: 1 panggilan /v2/companies/, 1 kredit, {len(FIELDS)} field.")
    if "--dry" in sys.argv:
        print(urllib.parse.urlencode(PARAMS))
        return 0
    env = load_env()
    key = env.get("SECTORS_API_KEY", "")
    if not key:
        print("SECTORS_API_KEY tidak ada di .env — batal, 0 kredit terpakai.")
        return 1
    base = env.get("SECTORS_BASE_URL", "https://api.sectors.app").rstrip("/")
    auth = f"{env.get('SECTORS_AUTH_SCHEME', '')} {key}".strip()
    url = f"{base}/v2/companies/?{urllib.parse.urlencode(PARAMS)}"
    req = urllib.request.Request(url, headers={"Authorization": auth, "Accept": "application/json",
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
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{NAME}.json").write_text(
        json.dumps({"request": {"path": "/v2/companies/", "params": PARAMS}, "status": status, "response": data},
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"HTTP {status} -> fixtures/validation/{NAME}.json")
    if status == 200 and isinstance(data, dict):
        coverage(data)
    else:
        print(json.dumps(data, ensure_ascii=False)[:800])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
