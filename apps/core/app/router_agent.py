"""Router agent — query → persona/playbook/intent (LLM low di live mode, deterministik di template)."""
from __future__ import annotations

import json
import logging
import re

from .catalog import PLAYBOOKS, INTENTS
from .llm import GATEWAY, LLMFatal, LLMUnavailable, extract_json
from .resolve import resolve

log = logging.getLogger("idxmaca.router")

ROUTER_SCHEMA = {
    "type": "object",
    "properties": {
        "persona": {"type": "string"},
        "playbooks": {"type": "array", "items": {"type": "string", "enum": list(PLAYBOOKS.keys())}},
        "intents": {"type": "array", "items": {"type": "string", "enum": list(INTENTS.keys())}},
        "symbols": {"type": "array", "items": {"type": "string"}},
        "regional": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "exchange": {"type": "string", "enum": ["sgx", "klse"]},
                    "symbol": {"type": "string"},
                },
                "required": ["exchange", "symbol"],
                "additionalProperties": False,
            },
        },
        "is_chat": {"type": "boolean"},
        "reason": {"type": "string"},
    },
    "required": ["persona", "playbooks", "intents", "symbols", "regional", "is_chat", "reason"],
    "additionalProperties": False,
}

CHAT_HINTS = ("halo", "hai ", "hi ", "terima kasih", "makasih", "thanks", "apa itu", "apa yang dimaksud",
              "arti ", "maksudnya", "jelaskan istilah", "what is", "define", "how do i", "cara baca",
              "cum-date", "cum date", "ex-date", "ex date", "uma", "ara", "arb", "p/e", "pbv", "roe",
              "der", "free float", "net buy", "net sell", "payout", "dps", "dscr", "icr", "nim", "casa", "npl", "ldr")


ANALYTIC_HINTS = ("screener", "screening", "scan", "review", "banding", "compare", "comps", "buatkan",
                   "siapkan", "susun", "analisis", "cek ", "tinjau", "rank", "urutkan", "dossier",
                   "export", "ringkas", "investigasi", "selidiki")


def looks_like_chat(text: str) -> bool:
    low = f" {text.lower().strip()} "
    scope = resolve(text)
    if scope.has_scope:
        return False
    if any(h in low for h in ANALYTIC_HINTS):
        return False
    if any(h in low for h in CHAT_HINTS) and len(low) < 220:
        return True
    playbook_hits = sum(1 for pb in PLAYBOOKS.values() for kw in pb["keywords"] if kw in low)
    return playbook_hits == 0 and len(low) < 160


async def route(text: str, session_context: list[dict] | None = None) -> dict:
    scope = resolve(text)
    if GATEWAY.available:
        from .prompts import load as load_prompt

        messages = [
            {"role": "system", "content": load_prompt(
                "router",
                playbooks=json.dumps({k: v["label"] for k, v in PLAYBOOKS.items()}),
                scope=json.dumps(scope.as_dict(), ensure_ascii=False),
            )},
        ] + (session_context or [])[-6:] + [{"role": "user", "content": text}]
        try:
            result = await GATEWAY.chat("router", messages, json_schema=ROUTER_SCHEMA)
            parsed = extract_json(result["text"])
            parsed["source"] = "llm"
            if parsed.get("is_chat") and scope.has_scope:
                # jaring pengaman: emiten sudah terdeteksi → bukan chat bebas
                parsed["is_chat"] = False
            return parsed
        except (LLMUnavailable, LLMFatal, ValueError, KeyError) as exc:
            log.warning("router LLM gagal, fallback template: %s", exc)
    is_chat = looks_like_chat(text)
    fallback_playbooks = [] if is_chat else None
    return {"persona": "Analis", "playbooks": fallback_playbooks or [], "intents": [], "symbols": [], "regional": [],
            "is_chat": is_chat, "source": "template", "reason": "heuristic"}


FREE_CHAT_KB: dict[str, str] = {
    "cum-date": "Cum-date = hari terakhir kamu membeli saham agar berhak mendapat dividen/aksi korporasi. Setelahnya (ex-date), pembeli baru tidak berhak. Contoh jadwal ada di IO-25.",
    "cum date": "Cum-date = hari terakhir pembelian agar berhak atas dividen atau aksi korporasi; ex-date adalah hari setelahnya.",
    "ex-date": "Ex-date = hari pertama saham diperdagangkan tanpa hak atas dividen/aksi korporasi. Harga biasanya menyesuaikan.",
    "uma": "UMA (Unusual Market Activity) = pengumuman BEI saat ada pola perdagangan tidak wajar. Bukan sanksi, tapi peringatan dini; sering diikuti permintaan keterangan.",
    "ara": "ARA = batas kenaikan harga harian (auto reject atas); ARB = batas penurunan (auto reject bawah). Batasnya berbeda per rentang harga.",
    "p/e": "P/E (price to earnings) = harga dibagi laba per saham. Makin tinggi, makin mahal relatif terhadap laba. Bandingkan dengan median peer dan historinya (IO-02, IO-08).",
    "pbv": "PBV/PB = harga dibagi nilai buku ekuitas per saham. Berguna untuk bank dan emiten padat modal.",
    "roe": "ROE = laba bersih dibagi ekuitas; ukuran efisiensi modal. Bank bagus biasanya dua digit.",
    "der": "DER = total utang dibagi ekuitas; ukuran leverage. Di atas 2x perlu perhatian khusus untuk analisis kredit.",
    "free float": "Free float = porsi saham yang diperdagangkan publik (bukan pemegang terkendali). Ambang BEI 7,5%; float kecil = risiko likuiditas.",
    "net buy": "Net buy = nilai beli broker/asing melebihi jual pada periode tertentu; kebalikannya net sell. Lihat IO-21/IO-24.",
    "net sell": "Net sell = nilai jual melebihi beli (mis. asing net sell Rp1,2 T dalam 5 hari). Ini tekanan jual, bukan otomatis sinyal harga.",
    "payout": "Payout ratio = porsi laba yang dibagikan sebagai dividen. Payout tinggi dengan laba stabil biasanya berkelanjutan.",
    "dps": "DPS = dividen per saham. Yield = DPS dibagi harga.",
    "dscr": "DSCR = arus kas operasi dibagi kewajiban utang (pokok+bunga); di bawah 1x berarti kas tidak cukup menutup utang.",
    "icr": "ICR = EBIT dibagi beban bunga; makin kecil, makin rapuh terhadap kenaikan bunga.",
    "nim": "NIM = margin bunga bersih bank; selisih pendapatan bunga dan beban bunga dibagi aset produktif.",
    "casa": "CASA = porsi dana murah (giro+tabungan). CASA tinggi menekan biaya dana bank.",
    "npl": "NPL = kredit bermasalah dibagi total kredit; indikator utama risiko kredit bank.",
    "ldr": "LDR = loan to deposit ratio; seberapa agresif dana dipakai untuk kredit.",
}


def free_chat_reply(text: str, entity_state: dict | None = None) -> str | None:
    low = text.lower().strip()
    for key, answer in sorted(FREE_CHAT_KB.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"(?<![a-z]){re.escape(key)}(?![a-z])", low):
            return answer
    if re.match(r"^(halo|hai|hi|hello|selamat (pagi|siang|sore|malam))", low):
        return ("Halo! Saya IDXMACA. Tanyakan apa saja soal emiten IDX — misalnya \"bandingkan BBCA, BMRI, BBRI kuartal terakhir\" "
                "atau \"scan red-flag 10 debitur\". Saya akan menyusun rencana + estimasi kredit dulu sebelum menarik data.")
    if re.match(r"^(terima kasih|makasih|thanks|thank you)", low):
        return "Sama-sama. Kalau mau, saya bisa lanjutkan dari konteks sesi ini tanpa menarik data baru."
    if entity_state and entity_state.get("symbols"):
        syms = ", ".join(entity_state["symbols"][:6])
        return (f"Saya masih memegang konteks sesi: {syms}. Mau saya lanjutkan dengan red-flag scan, flow check, "
                f"atau perbandingan valuasi? Sebutkan saja.")
    return None