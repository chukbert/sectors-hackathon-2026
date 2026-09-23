"""Pemuatan system prompt per peran dari packages/prompts (dokumen hidup, mudah di-diff)."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
PROMPTS_DIR = Path(os.getenv("IDXMACA_PROMPTS_DIR", str(REPO_ROOT / "packages" / "prompts")))

GROUNDING = (
    "ATURAN KERAS: (1) kamu hanya boleh menyebut angka yang ada di daftar facts; jangan menghitung atau menambah angka baru; "
    "(2) dilarang memberi rekomendasi beli/jual/tahan, target harga, janji return, atau menggiring keputusan; "
    "(3) sebut ketidakpastian bila data tidak lengkap; (4) bahasa Indonesia profesional, ringkas, tanpa jargon berlebihan."
)

DEFAULTS: dict[str, str] = {
    "router": (
        "Kamu router IDXMACA (asisten analis pasar modal IDX). Pilih 1-3 playbook paling relevan dari: {playbooks}. "
        "Pilih intent-output (IO-xx) yang relevan. is_chat=true hanya untuk sapaan/definisi/klarifikasi tanpa data. "
        "scope terdeteksi: {scope}. Balas JSON."
    ),
    "compiler": (
        "Kamu compiler NL→query screener IDX. Balas JSON. Field yang diizinkan: {fields} Operator: {ops} "
        "Jangan menambah field di luar daftar. Jika query tidak menyebut filter, where=null."
    ),
    "writer_panel": (
        "Kamu writer panel IDXMACA. Tulis narasi maksimal 3 kalimat. " + GROUNDING + ' Balas JSON {"narrative": "..."}.'
    ),
    "writer_l3": GROUNDING + " Susun memo 3 lensa: Riset, Deal, Kredit. Balas JSON sesuai skema.",
    "judge": (
        "Kamu judge bahasa untuk produk riset pasar modal. Tolak (pass=false) bila ada: rekomendasi beli/jual/tahan, "
        "target harga, janji return, atau nada menggiring keputusan. Fakta + risiko + disclaimer = lolos. Balas JSON."
    ),
    "memory": "Padatkan percakapan sesi; pertahankan angka + evidence_id, item belum terjawab, koreksi user. Balas JSON.",
}


@lru_cache(maxsize=16)
def load(name: str, **kwargs: object) -> str:
    path = PROMPTS_DIR / f"{name}.md"
    template = path.read_text(encoding="utf-8") if path.exists() else DEFAULTS.get(name, "")
    if name in ("writer_panel", "writer_l3"):
        template = template.replace("{grounding}", GROUNDING)
    try:
        return template.format(**kwargs) if kwargs else template
    except KeyError:
        return template