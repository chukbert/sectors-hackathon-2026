"""Verifier dua lapis (docs/ARCHITECTURE.md §8).

Lapis kode (penentu): angka wajib ada di ledger (toleransi pembulatan), frasa rekomendasi diblokir, disclaimer disuntik.
Lapis judge LLM (low) dipakai di live mode; template mode cukup lapis kode.
"""
from __future__ import annotations

import re
from typing import Any

from .ledger import Ledger

DISCLAIMER = ("Alat informasi dan analisis, bukan rekomendasi investasi. "
              "Verifikasi ke sumber primer (IDX/keterbukaan informasi) sebelum mengambil keputusan.")

BANNED = [
    r"\brekomendasi(?:kan)?\b", r"\btarget price\b", r"\bharga target\b", r"\bprice target\b",
    r"\btake profit\b", r"\bstop loss\b", r"\bcut loss\b",
    r"\b(?:buy|sell|hold)\s+rating\b", r"\bmust buy\b", r"\bstrong buy\b", r"\bstrong sell\b",
    r"\bcuan\b", r"\bdijamin\b", r"\bpasti (?:naik|turun|untung)\b", r"\bsebaiknya (?:beli|jual|tahan)\b",
    r"\blayak (?:beli|jual)\b", r"\bsinyal (?:beli|jual)\b", r"\bpasang target\b",
    r"\bsaya sarankan\b", r"\bkami sarankan\b", r"\bwe recommend\b", r"\byou should (?:buy|sell)\b",
    r"\bwaktunya (?:beli|jual)\b", r"\bburuan beli\b", r"\bborong sekarang\b",
]
BANNED_RE = re.compile("|".join(BANNED), re.IGNORECASE)

COUNT_WORDS = {
    "hari", "bulan", "tahun", "kuartal", "periode", "lapis", "aturan", "peer", "emiten", "direksi",
    "berita", "site", "provinsi", "transaksi", "suspensi", "aksi", "dividen", "broker", "titik",
    "pilihan", "langkah", "baris", "kolom", "halaman", "dari", "ke", "nomor", "level", "layer",
    "analis", "menit", "detik", "kali", "sesi", "panel", "kartu", "poin", "asumsi", "skenario",
}
UNIT_MULT = {"t": 1e12, "tn": 1e12, "triliun": 1e12, "m": 1e9, "miliar": 1e9, "jt": 1e6, "juta": 1e6,
             "rb": 1e3, "ribu": 1e3, "kuadriliun": 1e15}
WHITELIST_TOKENS = {"100", "52", "7,5", "7.5", "90", "365", "30", "24", "14", "12", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "0"}

NUMBER_RE = re.compile(r"(?<![\w-])(-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?)(\s*)(%|x|T|M|jt|rb|Kuadriliun|triliun|miliar|juta|ribu)?(?!\w)", re.IGNORECASE)
DATE_RE = re.compile(r"\b\d{1,2}[\s/-](?:jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des)[a-z]*[\s/-]\d{2,4}\b", re.IGNORECASE)
Q_RE = re.compile(r"\bQ[1-4]\b|\bIO-\d+\b|\bP[1-8]\b|\bL[0-3]\b|\bFH\d\b")
PERIOD_RE = re.compile(r"\b\d{4}\s*[-–]?\s*Q[1-4]\b", re.IGNORECASE)


def _to_float(raw: str) -> float | None:
    s = raw.strip()
    if not s:
        return None
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        int_part, _, frac = s.partition(",")
        s = int_part + "." + frac if len(frac) <= 2 else int_part + frac
    elif "." in s:
        int_part, _, frac = s.partition(".")
        s = int_part + frac if len(frac) == 3 else s
    try:
        return float(s)
    except ValueError:
        return None


def extract_numbers(text: str) -> list[dict[str, Any]]:
    out = []
    text = re.sub(r"\b(Rp|IDR|US\$|USD|SGD|MYR)\s*", r"\1 ", text)
    masked = PERIOD_RE.sub(" ", text)
    masked = DATE_RE.sub(" ", masked)
    masked = Q_RE.sub(" ", masked)
    for match in NUMBER_RE.finditer(masked):
        raw, _, unit = match.groups()
        value = _to_float(raw)
        if value is None:
            continue
        after = masked[match.end():match.end() + 14].strip().lower()
        word_after = re.match(r"([a-z]+)", after)
        context_word = word_after.group(1) if word_after else ""
        if context_word in COUNT_WORDS:
            continue
        if raw.lower() in WHITELIST_TOKENS and not unit:
            continue
        mult = UNIT_MULT.get((unit or "").lower(), 1.0)
        decimals = len(raw.split(",")[-1]) if "," in raw else 0
        step = (10 ** -decimals) * mult
        out.append({"token": match.group(0).strip(), "value": value * mult, "unit": unit,
                    "step": step,
                    "context": masked[max(0, match.start() - 24):match.end() + 12].strip()})
    return out


def check_threshold_values(text: str, ledger: Ledger) -> dict[str, Any]:
    allowed = ledger.numeric_values()
    allowed_set = list(allowed)
    unverified = []
    for item in extract_numbers(text):
        value = item["value"]
        found = False
        for candidate in allowed_set:
            tol = max(0.005, abs(candidate) * 0.01, 0.5 * item.get("step", 0.0))
            if abs(value - candidate) <= tol:
                found = True
                break
        if not found:
            unverified.append(item)
    return {"ok": not unverified, "unverified": unverified, "checked": len(extract_numbers(text)),
            "allowed_values": len(allowed_set)}


def check_policy(text: str) -> dict[str, Any]:
    hits = sorted({m.group(0).lower() for m in BANNED_RE.finditer(text)})
    return {"ok": not hits, "banned": hits}


def has_disclaimer(text: str) -> bool:
    return "bukan rekomendasi investasi" in text.lower()


def sanitize_text(text: str, ledger: Ledger) -> tuple[str, list[str]]:
    """Buang kalimat yang memuat angka tak terbukti atau frasa terlarang (fail-closed, jujur)."""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    kept, dropped = [], []
    for sentence in sentences:
        threshold = check_threshold_values(sentence, ledger)
        policy = check_policy(sentence)
        if threshold["ok"] and policy["ok"]:
            kept.append(sentence)
        else:
            dropped.append(sentence.strip())
    return " ".join(kept).strip(), dropped


def verify_text(text: str, ledger: Ledger) -> dict[str, Any]:
    threshold = check_threshold_values(text, ledger)
    policy = check_policy(text)
    return {"threshold": threshold, "policy": policy, "ok": threshold["ok"] and policy["ok"]}


JUDGE_SCHEMA = {
    "type": "object",
    "properties": {"pass": {"type": "boolean"}, "temuan": {"type": "array", "items": {"type": "string"}}},
    "required": ["pass", "temuan"],
    "additionalProperties": False,
}


async def judge_language(text: str) -> dict[str, Any]:
    """Lapis 2: judge LLM low-effort; bila tidak tersedia, lapis kode sudah final."""
    from .llm import GATEWAY, LLMFatal, LLMUnavailable, extract_json

    if not GATEWAY.available:
        return {"pass": True, "temuan": [], "judge": "template-skip"}
    from .prompts import load as load_prompt

    messages = [
        {"role": "system", "content": load_prompt("judge")},
        {"role": "user", "content": text[:6000]},
    ]
    try:
        result = await GATEWAY.chat("judge", messages, json_schema=JUDGE_SCHEMA)
        parsed = extract_json(result["text"])
        parsed["judge"] = "llm"
        return parsed
    except (LLMUnavailable, LLMFatal, ValueError) as exc:
        return {"pass": True, "temuan": [f"judge tidak tersedia: {exc}"], "judge": "unavailable"}