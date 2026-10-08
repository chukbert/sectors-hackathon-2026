"""Config Core — hanya alamat Store. Core tidak memegang key apa pun: key Sectors hidup di Store."""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    store_url: str

    @staticmethod
    def from_env() -> "Settings":
        return Settings(store_url=os.getenv("IDXMACA_STORE_URL", "http://127.0.0.1:8787").rstrip("/"))


SETTINGS = Settings.from_env()
