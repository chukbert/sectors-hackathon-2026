"""Kuota LLM untuk demo publik — supaya satu pengunjung (atau bot) tidak bisa menghabiskan anggaran.

Dua lapis, keduanya di memori proses (cukup untuk satu container):
- per IP  : jendela geser 10 menit per jenis panggilan
- global  : jumlah panggilan LLM per hari kalender UTC

Data Sectors tidak tersentuh: kuota hanya membatasi AI. Saat kuota habis, jalur deterministik tetap jalan
(teks → katalog); hanya foto yang benar-benar butuh AI yang ditolak dengan 429.
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

WINDOW_S = 600
PER_IP = {
    "scan_photo": int(os.getenv("STRUK_QUOTA_PHOTO_PER_10MIN", "8")),
    "scan_text": int(os.getenv("STRUK_QUOTA_TEXT_PER_10MIN", "20")),
}
DAILY_CAP = int(os.getenv("STRUK_QUOTA_DAILY_LLM", "600"))

_hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_day = {"date": "", "count": 0}


def client_ip(headers: dict[str, str] | None, fallback: str | None) -> str:
    """IP asli pengunjung: entri pertama X-Forwarded-For (diisi reverse proxy & proxy Next), lalu IP socket."""
    fwd = (headers or {}).get("x-forwarded-for") or ""
    first = fwd.split(",")[0].strip()
    return first or fallback or "?"


def take(kind: str, ip: str, now: float | None = None) -> bool:
    """Ambil satu jatah. False bila jatah IP ini atau jatah harian global habis (jatah tidak dipotong)."""
    now = time.time() if now is None else now
    today = datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%d")
    if _day["date"] != today:
        _day.update(date=today, count=0)
    if _day["count"] >= DAILY_CAP:
        return False
    q = _hits[(kind, ip)]
    while q and now - q[0] > WINDOW_S:
        q.popleft()
    if len(q) >= PER_IP.get(kind, 10):
        return False
    q.append(now)
    _day["count"] += 1
    return True


def stats() -> dict[str, int | str]:
    return {"date": _day["date"], "llm_calls_today": _day["count"], "daily_cap": DAILY_CAP}


def reset() -> None:
    _hits.clear()
    _day.update(date="", count=0)
