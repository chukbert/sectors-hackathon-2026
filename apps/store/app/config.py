"""Config Store Service — semua lewat env, key Sectors hanya hidup di sini."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def _bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    mode: str  # fixture | offline | live | auto
    sectors_api_key: str | None
    sectors_base_url: str
    auth_scheme: str
    db_path: str
    fixtures_dir: str
    max_retries: int
    timeout_s: float
    allow_fixture_fallback: bool
    default_ttl_s: int
    negative_ttl_s: int
    credit_start: int

    @staticmethod
    def from_env() -> "Settings":
        mode = os.getenv("IDXMACA_STORE_MODE", "fixture").strip().lower()
        data_dir = os.getenv("IDXMACA_DATA_DIR", str(REPO_ROOT / ".data"))
        db = os.getenv("IDXMACA_STORE_DB", str(Path(data_dir) / "store.db"))
        fixtures = os.getenv("IDXMACA_FIXTURES_DIR", str(REPO_ROOT / "fixtures" / "sectors"))
        return Settings(
            mode=mode,
            sectors_api_key=os.getenv("SECTORS_API_KEY") or None,
            sectors_base_url=os.getenv("SECTORS_BASE_URL", "https://api.sectors.app").rstrip("/"),
            # Default "" = kirim API key mentah di header Authorization (spesifikasi apiKey Sectors).
            auth_scheme=os.getenv("SECTORS_AUTH_SCHEME", "").strip(),
            db_path=db,
            fixtures_dir=fixtures,
            max_retries=int(os.getenv("IDXMACA_SECTORS_RETRIES", "2")),
            timeout_s=float(os.getenv("IDXMACA_SECTORS_TIMEOUT", "30")),
            allow_fixture_fallback=_bool("IDXMACA_ALLOW_FIXTURE_FALLBACK", True),
            default_ttl_s=int(os.getenv("IDXMACA_DEFAULT_TTL", str(24 * 3600))),
            negative_ttl_s=int(os.getenv("IDXMACA_NEGATIVE_TTL", str(6 * 3600))),
            credit_start=int(os.getenv("IDXMACA_CREDIT_START", "1000")),
        )


SETTINGS = Settings.from_env()