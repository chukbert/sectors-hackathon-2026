"""Writer L1/L2 (panel) + L3 (memo) — LLM menarasikan, kode menyediakan angka (ledger).

Live mode: panel writer (medium) dan L3 (xhigh). Template mode: narasi deterministik dari facts.
Semua keluaran melewati verifier (angka vs ledger, frasa terlarang) sebelum dipakai.
"""
from __future__ import annotations

import asyncio
import json
import logging

from .executor import RunContext
from .llm import GATEWAY, LLMFatal, LLMUnavailable, extract_json
from .pipelines_core import Piece
from .verify import DISCLAIMER, check_policy, judge_language, sanitize_text, verify_text

log = logging.getLogger("idxmaca.writer")

PANEL_WRITER_SCHEMA = {
    "type": "object",
    "properties": {"narrative": {"type": "string"}},
    "required": ["narrative"],
    "additionalProperties": False,
}

MEMO_SCHEMA = {
    "type": "object",
    "properties": {
        "lenses": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"title": {"type": "string"}, "text": {"type": "string"}},
                "required": ["title", "text"],
                "additionalProperties": False,
            },
        },
        "followups": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["lenses", "followups"],
    "additionalProperties": False,
}

from .prompts import GROUNDING, load as load_prompt  # noqa: E402


async def write_panels(ctx: RunContext, pieces: list[Piece]) -> None:
    """Tulis ulang narasi hero panel dengan model (medium), fallback aman ke template."""
    if not GATEWAY.available:
        return
    sem = asyncio.Semaphore(4)

    async def one(piece: Piece) -> None:
        if piece.status != "ready" or not piece.facts:
            return
        async with sem:
            messages = [
                {"role": "system", "content": load_prompt("writer_panel")},
                {"role": "user", "content": json.dumps({"judul": piece.title, "facts": piece.facts,
                                                        "konteks": piece.why}, ensure_ascii=False)},
            ]
            try:
                result = await GATEWAY.chat("writer_panel", messages, json_schema=PANEL_WRITER_SCHEMA, run_id=ctx.run_id or None)
                parsed = extract_json(result["text"])
                narrative = str(parsed.get("narrative", "")).strip()
                if not narrative:
                    return
                cleaned, dropped = sanitize_text(narrative, ctx.ledger)
                if dropped or not cleaned:
                    log.warning("panel writer %s: %d kalimat dibuang verifier", piece.io, len(dropped))
                if cleaned:
                    piece.narrative = cleaned
            except (LLMUnavailable, LLMFatal, ValueError, KeyError) as exc:
                log.warning("panel writer %s fallback template: %s", piece.io, exc)

    await asyncio.gather(*(one(p) for p in pieces))


def _compose(facts: list[str], limit: int = 4) -> str:
    sentences: list[str] = []
    seen: list[str] = []
    for raw in facts:
        text = raw.strip().rstrip(".")
        if not text:
            continue
        if any(text in other or other in text for other in seen):
            continue
        seen.append(text)
        sentences.append(text)
        if len(sentences) >= limit:
            break
    return ". ".join(sentences) + "." if sentences else ""


def _template_memo(ctx: RunContext, pieces: list[Piece]) -> dict:
    def facts_of(panel_ids: set[str], limit: int = 4) -> list[str]:
        out: list[str] = []
        for piece in pieces:
            if piece.panel in panel_ids and piece.status == "ready":
                out.extend(piece.facts or [piece.title])
        return out

    lenses = [
        {"title": "Lensa Riset", "text": _compose(facts_of({"P1", "P2"})) or "Data riset tidak cukup pada scope ini."},
        {"title": "Lensa Deal", "text": _compose(facts_of({"P6", "P7"})) or "Tidak ada data komparasi pada scope ini."},
        {"title": "Lensa Kredit", "text": _compose(facts_of({"P8", "P4", "P5"})) or "Tidak ada sinyal risiko material pada scope ini."},
    ]
    return {"lenses": lenses, "followups": []}


async def build_memo(ctx: RunContext, pieces: list[Piece]) -> dict:
    memo = _template_memo(ctx, pieces)
    source = "template"
    if GATEWAY.available:
        facts = []
        for piece in pieces:
            if piece.status == "ready":
                facts.extend(piece.facts[:2])
        messages = [
            {"role": "system", "content": load_prompt("writer_l3")},
            {"role": "user", "content": json.dumps({"query": ctx.plan.query, "persona": ctx.plan.persona,
                                                    "scope": ctx.scope, "facts": facts[:60]}, ensure_ascii=False)},
        ]
        try:
            result = await GATEWAY.chat("writer_l3", messages, json_schema=MEMO_SCHEMA)
            parsed = extract_json(result["text"])
            lenses = []
            for lens in parsed.get("lenses", [])[:3]:
                cleaned, dropped = sanitize_text(str(lens.get("text", "")), ctx.ledger)
                lenses.append({"title": str(lens.get("title", "Lensa")), "text": cleaned,
                               "dropped_sentences": len(dropped)})
            if lenses:
                memo = {"lenses": lenses, "followups": parsed.get("followups", [])[:4]}
                source = "llm-xhigh"
        except (LLMUnavailable, LLMFatal, ValueError, KeyError) as exc:
            log.warning("memo L3 fallback template: %s", exc)

    full_text = " ".join(lens["text"] for lens in memo["lenses"])
    threshold = verify_text(full_text, ctx.ledger)
    judge = await judge_language(full_text)
    if not judge.get("pass", True):
        sanitized = []
        for lens in memo["lenses"]:
            cleaned, _ = sanitize_text(lens["text"], ctx.ledger)
            sanitized.append({**lens, "text": cleaned})
        memo["lenses"] = sanitized
        memo["revision"] = "judge-fail→template-sanitized"
    memo["disclaimer"] = DISCLAIMER
    memo["verification"] = {"numeric": threshold["threshold"], "policy": threshold["policy"],
                            "ok": bool(threshold["ok"] and threshold["policy"]["ok"]),
                            "judge": judge, "source": source, "disclaimer_present": True}
    return memo


def collect_followups(ctx: RunContext, pieces: list[Piece], llm_followups: list[str] | None = None) -> list[str]:
    intents = set(ctx.plan.intents)
    out: list[str] = []
    sym0 = (ctx.scope.get("symbols") or ["emiten"])[0]
    if llm_followups:
        out.extend(llm_followups)
    if "IO-05" in intents:
        out.append("Jadwal dividen mendekat apa saja?")
    if "IO-21" in intents and not ctx.scope.get("regional"):
        out.append("Tambahkan DBS untuk perbandingan regional")
    if "IO-38" not in intents and ctx.scope.get("symbols"):
        out.append(f"Scan red-flag {sym0} dan bandingkan skornya")
    if "IO-24" in intents:
        out.append("Broker mana yang paling agresif seminggu ini?")
    if "IO-03" in intents:
        out.append("Jelaskan risiko kreditnya saja")
    if "IO-08" in intents:
        out.append("Bandingkan valuasi dengan rata-rata 5 tahun")
    out.append("Ringkas jadi 5 poin untuk komite")
    seen, unique = set(), []
    for item in out:
        if item not in seen:
            seen.add(item)
            unique.append(item)
    return unique[:4]