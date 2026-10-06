"""Katalog kurasi merek sehari-hari → emiten IDX.

Ini satu-satunya pengetahuan non-Sectors di aplikasi, dan sengaja dibatasi pada pemetaan
nama merek. Setiap emiten tetap harus ada di snapshot Screener Sectors sebelum ditampilkan;
semua angka, pemilik, dan segmen hanya dari Sectors. Merek di luar katalog boleh ditebak LLM
tetapi ditandai `dugaan` sampai simbolnya terkonfirmasi ada di data Sectors.

relation:
  direct   — merek milik emiten atau anak usaha yang dikonsolidasi
  indirect — emiten hanya pemegang saham minoritas pemilik merek
"""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class BrandHit:
    brand: str
    symbol: str
    relation: str
    note: str | None = None


# symbol: (relation, [merek...], catatan opsional)
CATALOG: dict[str, tuple[str, list[str], str | None]] = {
    "ICBP": ("direct", ["Indomie", "Supermi", "Sarimi", "Pop Mie", "Sakura", "Chitato", "Qtela", "JetZ",
                        "Indomilk", "Cap Enaak", "Kremer", "Indofood Kecap", "Indofood Sambal", "Promina",
                        "SUN bubur bayi", "Club air mineral", "Ichi Ocha", "Milkuat"], None),
    "INDF": ("direct", ["Bimoli", "Bogasari", "Segitiga Biru", "Cakra Kembar", "Kunci Biru", "Indofood"], None),
    "UNVR": ("direct", ["Pepsodent", "Close Up", "Lifebuoy", "Lux", "Dove", "Sunsilk", "Clear", "Rexona",
                        "Citra", "Pond's", "Vaseline", "Glow & Lovely", "Rinso", "Molto", "Sunlight", "Wipol",
                        "Vixal", "Super Pell", "Royco", "Bango"], None),
    "MYOR": ("direct", ["Kopiko", "Torabika", "Le Minerale", "Teh Pucuk Harum", "Roma Kelapa", "Roma Malkist",
                        "Energen", "Beng-Beng", "Choki-Choki", "Slai O'lai", "Astor", "Danisa", "Better",
                        "Kopiko 78"], None),
    "AMRT": ("direct", ["Alfamart", "Alfagift", "Dan+Dan"], None),
    "MIDI": ("direct", ["Alfamidi", "Lawson"], None),
    "DNET": ("indirect", ["Indomaret"], "Indomaret bukan perusahaan terbuka; DNET memegang sebagian saham pengelolanya."),
    "HERO": ("direct", ["Guardian", "IKEA"], None),
    "MPPA": ("direct", ["Hypermart", "Foodmart"], None),
    "LPPF": ("direct", ["Matahari Department Store"], None),
    "RALS": ("direct", ["Ramayana"], None),
    "ERAA": ("direct", ["Erafone", "iBox"], None),
    "MAPI": ("direct", ["Zara", "SOGO", "Starbucks"], "Starbucks Indonesia dikelola anak usaha MAPI (MAP Boga)."),
    "MAPA": ("direct", ["Sports Station", "Converse", "Skechers"], None),
    "ACES": ("direct", ["AZKO", "Ace Hardware"], None),
    "TLKM": ("direct", ["Telkomsel", "IndiHome", "simPATI", "by.U", "Kartu Halo", "Telkom"], None),
    "ISAT": ("direct", ["Indosat", "IM3", "Tri", "3 (Three)"], None),
    "EXCL": ("direct", ["XL", "AXIS", "Smartfren", "XLSmart"], None),
    "BBRI": ("direct", ["BRI", "BRImo"], None),
    "BBCA": ("direct", ["BCA", "myBCA", "BCA Mobile", "Flazz"], None),
    "BMRI": ("direct", ["Bank Mandiri", "Livin'", "e-money Mandiri"], None),
    "BBNI": ("direct", ["BNI", "wondr"], None),
    "BRIS": ("direct", ["BSI", "Bank Syariah Indonesia", "BYOND"], None),
    "GOTO": ("direct", ["Gojek", "GoPay", "GoFood", "GoRide", "GoSend"], None),
    "BUKA": ("direct", ["Bukalapak"], None),
    "KLBF": ("direct", ["Promag", "Mixagrip", "Hydro Coco", "Prenagen", "Fatigon", "Extra Joss", "Komix",
                        "Entrostop", "Woods", "Diabetasol", "Zee"], None),
    "SIDO": ("direct", ["Tolak Angin", "Tolak Linu", "Kuku Bima Ener-G", "Alang Sari"], None),
    "ULTJ": ("direct", ["Ultra Milk", "Teh Kotak", "Sari Kacang Ijo", "Ultra Mimi"], None),
    "CMRY": ("direct", ["Cimory", "Kanzler"], None),
    "GOOD": ("direct", ["Garuda Kacang", "Gery", "Chocolatos", "Clevo", "Leo"], None),
    "CPIN": ("direct", ["Fiesta", "Champ", "Okey nugget", "Golden Fiesta"], None),
    "JPFA": ("direct", ["So Good", "Best Chicken"], None),
    "HMSP": ("direct", ["Sampoerna A Mild", "Dji Sam Soe", "Marlboro", "U Mild"], None),
    "GGRM": ("direct", ["Gudang Garam", "Surya", "GG Mild"], None),
    "WIIM": ("direct", ["Wismilak"], None),
    "CLEO": ("direct", ["Cleo"], None),
    "ROTI": ("direct", ["Sari Roti"], None),
    "MLBI": ("direct", ["Bir Bintang", "Bintang Zero"], None),
    "TCID": ("direct", ["Gatsby", "Pixy", "Pucelle"], None),
    "FAST": ("direct", ["KFC"], None),
    "PZZA": ("direct", ["Pizza Hut"], None),
    "ASII": ("direct", ["Honda (sepeda motor)", "Toyota", "Daihatsu", "FIFGROUP", "Astra"], None),
    "AUTO": ("direct", ["Aspira"], None),
    "SMGR": ("direct", ["Semen Gresik", "Semen Padang", "Dynamix"], None),
    "INTP": ("direct", ["Semen Tiga Roda"], None),
    "AVIA": ("direct", ["Avian", "No Drop"], None),
    "JSMR": ("direct", ["Jasa Marga", "jalan tol"], None),
    "GIAA": ("direct", ["Garuda Indonesia", "Citilink"], None),
    "BIRD": ("direct", ["Blue Bird", "Golden Bird"], None),
    "PGAS": ("direct", ["PGN", "gas PGN"], None),
    "KAEF": ("direct", ["Kimia Farma", "Apotek Kimia Farma"], None),
    "SILO": ("direct", ["Siloam"], None),
    "MIKA": ("direct", ["Mitra Keluarga"], None),
    "HEAL": ("direct", ["Hermina"], None),
    "SCMA": ("direct", ["SCTV", "Indosiar", "Vidio"], None),
    "MNCN": ("direct", ["RCTI", "MNCTV", "GTV"], None),
    "BELI": ("direct", ["Blibli", "tiket.com"], None),
}


def _key(s: str) -> str:
    return re.sub(r"[^a-z0-9+]", "", s.lower())


_INDEX: dict[str, BrandHit] = {}
_SYMBOLS: dict[str, BrandHit] = {}  # kode saham: hanya cocok persis ("roti tawar" ≠ ROTI)
for _sym, (_rel, _brands, _note) in CATALOG.items():
    for _b in _brands:
        _INDEX[_key(_b)] = BrandHit(_b, _sym, _rel, _note)
    _SYMBOLS[_key(_sym)] = BrandHit(_sym, _sym, _rel, _note)


# Merek yang juga kata umum: hanya cocok persis, tidak lewat prefiks ("Surya beras" ≠ Surya).
_EXACT_ONLY = {_key(b) for b in ["Clear", "Surya", "Better", "Lux", "Tri", "Leo", "Zee", "Citra", "Astra", "Champ",
                                 "Woods", "Dove", "Close Up", "Sakura", "Astor", "Lawson", "Indofood", "Telkom"]}


def lookup(name: str) -> BrandHit | None:
    """Cocokkan nama merek (toleran huruf/spasi/tanda baca) ke katalog."""
    k = _key(name)
    if not k:
        return None
    if k in _INDEX:
        return _INDEX[k]
    if k in _SYMBOLS:
        return _SYMBOLS[k]
    # Prefiks: "Indomie Goreng Rendang" → Indomie; minimal 4 huruf agar tidak salah tangkap.
    best = None
    for bk, hit in _INDEX.items():
        if len(bk) >= 4 and bk not in _EXACT_ONLY and k.startswith(bk) and (best is None or len(bk) > len(_key(best.brand))):
            best = hit
    return best


def catalog_symbols() -> list[str]:
    return sorted(CATALOG)


def brands_of(symbol: str) -> list[str]:
    entry = CATALOG.get(symbol.upper())
    return list(entry[1]) if entry else []
