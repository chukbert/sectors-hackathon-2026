"""Config Core — key OpenRouter tidak pernah ke frontend, Sectors key tidak ada di sini sama sekali."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def _bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class RoleConfig:
    effort: str
    temperature: float
    max_tokens: int


ROLES: dict[str, RoleConfig] = {
    # max_tokens sudah memperhitungkan reasoning_tokens model (xhigh bisa panjang)
    "router": RoleConfig("low", 0.0, 2600),
    "planner": RoleConfig("high", 0.0, 5200),
    "compiler": RoleConfig("medium", 0.0, 2400),
    "writer_panel": RoleConfig("medium", 0.2, 2600),
    "writer_l3": RoleConfig("xhigh", 0.2, 6000),
    "judge": RoleConfig("low", 0.0, 1600),
    "memory": RoleConfig("low", 0.0, 1600),
}


@dataclass(frozen=True)
class Settings:
    model: str
    llm_mode: str  # auto | live | template
    openrouter_api_key: str | None
    openrouter_base_url: str
    app_url: str
    store_url: str
    db_path: str
    max_credits_per_run: int
    max_parallel_fetches: int
    llm_timeout_s: float
    llm_retries: int
    history_turns_verbatim: int

    @staticmethod
    def from_env() -> "Settings":
        data_dir = os.getenv("IDXMACA_DATA_DIR", str(REPO_ROOT / ".data"))
        mode = os.getenv("IDXMACA_LLM_MODE", "auto").strip().lower()
        key = os.getenv("OPENROUTER_API_KEY") or None
        if mode == "auto":
            mode = "live" if key else "template"
        return Settings(
            model=os.getenv("IDXMACA_MODEL", "meta/muse-spark-1.3"),
            llm_mode=mode,
            openrouter_api_key=key,
            openrouter_base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/"),
            app_url=os.getenv("IDXMACA_APP_URL", "https://idxmaca.local"),
            store_url=os.getenv("IDXMACA_STORE_URL", "http://127.0.0.1:8787").rstrip("/"),
            db_path=os.getenv("IDXMACA_CORE_DB", str(Path(data_dir) / "core.db")),
            max_credits_per_run=int(os.getenv("IDXMACA_MAX_CREDITS_PER_RUN", "60")),
            max_parallel_fetches=int(os.getenv("IDXMACA_MAX_PARALLEL", "6")),
            llm_timeout_s=float(os.getenv("IDXMACA_LLM_TIMEOUT", "120")),
            llm_retries=int(os.getenv("IDXMACA_LLM_RETRIES", "3")),
            history_turns_verbatim=int(os.getenv("IDXMACA_HISTORY_TURNS", "10")),
        )


SETTINGS = Settings.from_env()