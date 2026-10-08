"""TTL per jenis data (docs/STORE.md, bagian TTL)."""
from __future__ import annotations

from .keys import normalize_path

DAY = 24 * 3600


def ttl_seconds(endpoint: str, default_ttl: int) -> int:
    # Fundamental tahunan, segmen, dan kepemilikan berubah per laporan tahunan, bukan harian.
    if normalize_path(endpoint).startswith("/SECTORS/"):
        return 30 * DAY
    return default_ttl
