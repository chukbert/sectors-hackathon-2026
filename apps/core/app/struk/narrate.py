"""Peran LLM di Struk Jadi Saham — sengaja sempit, dan tidak boleh membawa angka sendiri.

1. read_receipt   : foto/teks struk → daftar merek (+ tebakan simbol, ditandai dugaan).
2. explain_money  : terjemahkan label segmen Sectors ke bahasa awam + 1 kalimat cara cari uang.

Penjaga: keluaran (2) ditolak bila memuat angka (semua angka di UI datang dari Sectors)
atau frasa rekomendasi (verify.BANNED_RE). Gagal/LLM mati → fallback deterministik, bukan karangan.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from ..llm import GATEWAY, LLMFatal, LLMUnavailable, extract_json
from ..verify import BANNED_RE
from . import brands

log = logging.getLogger("struk.narrate")
DIGIT_RE = re.compile(r"\d")

RECEIPT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["store", "items"],
    "properties": {
        "store": {"type": "string"},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["raw", "brand", "symbol", "price"],
                "properties": {
                    "raw": {"type": "string"},
                    "brand": {"type": "string"},
                    "symbol": {"type": "string"},
                    "price": {"type": "integer"},
                },
            },
        },
    },
}

RECEIPT_PROMPT = """Kamu membaca struk belanja Indonesia (atau daftar barang/layanan yang diketik pengguna).
Gambar juga bisa berupa FOTO PRODUK (kemasan, rak, logo, papan toko, aplikasi di layar), bukan struk:
maka setiap merek yang terlihat jelas menjadi satu item (raw = teks yang terbaca di kemasan, singkat), dan store = "".
Untuk setiap baris barang/layanan, kembalikan:
- raw: teks baris apa adanya (singkat)
- brand: nama MEREK yang paling mungkin (mis. "IDM GRG SPCL" → "Indomie", "PEPSODENT 190G" → "Pepsodent"); "" bila barang tanpa merek
- symbol: kode saham IDX 4 huruf pemilik merek bila kamu cukup yakin, selain itu ""
- price: TOTAL harga baris itu dalam rupiah sebagaimana TERCETAK di struk (setelah kali jumlah), bilangan bulat
  tanpa titik/koma (mis. "3 x 3.500  10.500" → 10500, "50rb" → 50000). 0 bila tidak tertera. Jangan menebak harga.
  Baris toko dan alat bayar (BRImo, QRIS, GoPay, tunai, debit, …) selalu price = 0.
Juga kembalikan `store`: nama toko di struk (mis. "Indomaret", "Alfamart") atau "".
Toko itu sendiri juga dimasukkan sebagai item (raw = nama toko, brand = nama toko).
Abaikan baris total, pajak, kembalian, diskon, nomor kartu, dan data pribadi.
Merek yang dikenal aplikasi (prioritaskan ejaan ini): {known}
Balas JSON saja."""


# Harga baris di akhir teks: "Rp3.500", "10.500", "15000", "12rb", "12k". Angka ≤3 digit tanpa Rp/rb
# dibiarkan (mis. "ULTRA MILK 250" itu ukuran, bukan harga).
PRICE_RE = re.compile(r"\s*(?:@\s*|=\s*)?(?:rp\.?\s*(?P<rp>\d[\d.,]*)|(?P<k>\d+(?:[.,]\d+)?)\s*(?:rb|ribu|k)\b"
                      r"|(?P<sep>\d{1,3}(?:[.,]\d{3})+)|(?P<plain>\d{4,}))\s*$", re.I)
NOT_GOODS_RE = re.compile(r"\b(bayar|tunai|cash|debit|kredit|qris|brimo|gopay|ovo|dana|shopeepay|flazz|e-?money|livin|"
                          r"total|subtotal|kembali|kembalian|ppn|pajak|diskon)\b", re.I)


def parse_price(raw: str) -> tuple[str, int | None]:
    """'Indomie goreng 3.500' → ('Indomie goreng', 3500). Harga adalah data struk pengguna, bukan fakta perusahaan."""
    m = PRICE_RE.search(raw or "")
    if not m or m.start() == 0:
        return raw, None
    if m.group("rp"):
        val = int(re.sub(r"[.,]\d{1,2}$", "", m.group("rp")).replace(".", "").replace(",", "") or 0)
    elif m.group("k"):
        val = round(float(m.group("k").replace(",", ".")) * 1000)
    else:
        val = int(re.sub(r"[.,]", "", m.group("sep") or m.group("plain")))
    return raw[: m.start()].strip(" -:x@"), (val if 0 < val < 100_000_000 else None)


def clean_price(raw: str, price: Any) -> int | None:
    """Harga dari LLM/pengguna: bilangan bulat positif yang masuk akal; baris bayar/total tidak dihitung belanja."""
    if NOT_GOODS_RE.search(raw or ""):
        return None
    try:
        val = int(round(float(price)))
    except (TypeError, ValueError):
        return None
    return val if 0 < val < 100_000_000 else None


def _split_text(text: str | None) -> dict[str, Any]:
    """Jalur tanpa LLM: pisah per koma/baris (dan harga di ujung baris), katalog yang mencocokkan."""
    parts = [p.strip() for p in re.split(r"[\n;]+|,(?!\d{3}\b)| dan ", text or "") if p.strip()]
    items = []
    for p in parts:
        name, price = parse_price(p)
        items.append({"raw": name, "brand": name, "symbol": None, "price": clean_price(name, price)})
    return {"store": None, "items": items, "llm": False}


async def read_receipt(text: str | None = None, image_data_url: str | None = None, use_llm: bool = True) -> dict[str, Any]:
    if not text and not image_data_url:
        return {"store": None, "items": [], "llm": False}
    if not use_llm and text and not image_data_url:
        return _split_text(text)
    known = ", ".join(sorted({b for s in brands.CATALOG for b in brands.brands_of(s)})[:400])
    content: list[dict[str, Any]] = [{"type": "text", "text": RECEIPT_PROMPT.format(known=known)}]
    if text:
        content.append({"type": "text", "text": f"Input pengguna:\n{text}"})
    if image_data_url:
        content.append({"type": "image_url", "image_url": {"url": image_data_url}})
    try:
        out = await GATEWAY.chat("struk_parse", [{"role": "user", "content": content}], json_schema=RECEIPT_SCHEMA)
        data = extract_json(out["text"])
        items = []
        for i in data.get("items") or []:
            if not isinstance(i, dict) or not (i.get("raw") or i.get("brand")):
                continue
            raw = i.get("raw") or i.get("brand") or ""
            # Harga sudah di kolomnya sendiri; buang dari teks baris agar baris tampil bersih.
            price = clean_price(raw, i.get("price"))
            name, _ = parse_price(raw)
            if name == raw and price:
                name = re.sub(rf"\s*(?:rp\.?\s*)?{price}\s*$", "", raw, flags=re.I)  # "KANTONG PLASTIK 200"
            items.append({**i, "raw": name or raw, "price": price})
        return {"store": data.get("store") or None, "items": items, "llm": True}
    except (LLMUnavailable, LLMFatal, ValueError, json.JSONDecodeError) as exc:
        if image_data_url and not text:
            raise
        log.warning("read_receipt fallback deterministik: %s", exc)
        return _split_text(text)


EXPLAIN_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["labels", "summary"],
    "properties": {
        "labels": {
            "type": "array",
            "items": {"type": "object", "additionalProperties": False, "required": ["en", "id"],
                      "properties": {"en": {"type": "string"}, "id": {"type": "string"}}},
        },
        "summary": {"type": "string"},
    },
}

EXPLAIN_PROMPT = """Ini label diagram aliran uang (revenue segments) perusahaan {name} dari data Sectors.
Tugas:
1. labels: terjemahkan SETIAP label ke Bahasa Indonesia yang mudah dipahami orang awam (maks 4 kata). Jangan ubah maknanya.
2. summary: SATU kalimat (maks 30 kata) menjelaskan cara perusahaan ini mendapatkan uang, berdasarkan label yang ADA saja,
   urutkan dari aliran terbesar ke terkecil sesuai urutan input.
ATURAN: DILARANG menulis angka atau persen apa pun. DILARANG menyarankan beli/jual/tahan. Jangan menambah fakta di luar label.
Label (urut dari nilai terbesar): {labels}
Balas JSON saja."""

_EXPLAIN_CACHE: dict[str, dict[str, Any]] = {}


async def explain_money(symbol: str, name: str, money: dict[str, Any]) -> dict[str, Any]:
    key = f"{symbol}:{money.get('year')}"
    if key in _EXPLAIN_CACHE:
        return _EXPLAIN_CACHE[key]
    ordered = sorted(money["links"], key=lambda lk: -lk["value"])
    labels = list(dict.fromkeys([lk["source"] for lk in ordered] + [lk["target"] for lk in ordered]))
    result = {"labels": {lbl: lbl for lbl in labels}, "summary": None, "llm": False}
    try:
        out = await GATEWAY.chat("struk_explain", [{"role": "user", "content": EXPLAIN_PROMPT.format(
            name=name, labels=json.dumps(labels, ensure_ascii=False))}], json_schema=EXPLAIN_SCHEMA)
        data = extract_json(out["text"])
        trans = {d["en"].strip(): d["id"].strip() for d in data.get("labels") or [] if d.get("en") and d.get("id")}
        summary = (data.get("summary") or "").strip()
        if summary and (DIGIT_RE.search(summary) or BANNED_RE.search(summary)):
            log.warning("explain_money ditolak penjaga (angka/rekomendasi): %s", summary)
            summary = None
        result = {"labels": {lbl: (trans.get(lbl) if trans.get(lbl) and not DIGIT_RE.search(trans[lbl]) else lbl)
                             for lbl in labels},
                  "summary": summary or None, "llm": True}
    except (LLMUnavailable, LLMFatal, ValueError, json.JSONDecodeError) as exc:
        log.warning("explain_money fallback: %s", exc)
    _EXPLAIN_CACHE[key] = result
    return result

