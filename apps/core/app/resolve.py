"""Entity Resolver — nama/kata → ticker (IDX/SGX/KLSE) + scope sesi. Lokal, 0 kredit."""
from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field

IDX: dict[str, str] = {
    "BBCA": "Bank Central Asia", "BMRI": "Bank Mandiri", "BBRI": "Bank Rakyat Indonesia",
    "BBNI": "Bank Negara Indonesia", "BRIS": "Bank Syariah Indonesia", "ARTO": "Bank Jago",
    "BUMI": "Bumi Resources", "ADRO": "Alamtri Resources Adaro", "PTBA": "Bukit Asam",
    "ITMG": "Indo Tambangraya Megah", "HRUM": "Harum Energy", "INDY": "Indika Energy",
    "AADI": "Adaro Andalan Indonesia", "ANTM": "Aneka Tambang Antam",
    "MDKA": "Merdeka Copper Gold", "INCO": "Vale Indonesia", "MEDC": "Medco Energi",
    "WSKT": "Waskita Karya", "BNBR": "Bakrie dan Brothers", "GIAA": "Garuda Indonesia",
    "ENRG": "Energi Mega Persada", "TLKM": "Telkom Indonesia", "ASII": "Astra International",
    "UNVR": "Unilever Indonesia", "ICBP": "Indofood CBP", "GOTO": "GoTo Gojek Tokopedia",
    "SMGR": "Semen Indonesia", "KLBF": "Kalbe Farma",
}

ALIASES: dict[str, str] = {
    "bca": "BBCA", "bank bca": "BBCA", "bank central asia": "BBCA", "central asia": "BBCA",
    "mandiri": "BMRI", "bank mandiri": "BMRI", "bri": "BBRI", "bank rakyat": "BBRI",
    "bank rakyat indonesia": "BBRI", "bni": "BBNI", "bank negara": "BBNI",
    "bsi": "BRIS", "bank syariah": "BRIS", "jago": "ARTO",
    "bumi": "BUMI", "bumi resources": "BUMI", "adaro": "ADRO", "alamtri": "ADRO", "alam tri": "ADRO",
    "bukit asam": "PTBA", "ptba": "PTBA", "indotambang": "ITMG", "indo tambangraya": "ITMG",
    "harum": "HRUM", "indika": "INDY", "aadi": "AADI", "adaro andalan": "AADI",
    "antam": "ANTM", "aneka tambang": "ANTM", "merdeka": "MDKA", "merdeka copper": "MDKA",
    "vale": "INCO", "medco": "MEDC", "waskita": "WSKT", "bakrie": "BNBR",
    "garuda": "GIAA", "energi mega": "ENRG", "telkom": "TLKM", "telekomunikasi": "TLKM",
    "astra": "ASII", "unilever": "UNVR", "indofood": "ICBP", "goto": "GOTO", "gojek": "GOTO",
    "semen indonesia": "SMGR", "semen": "SMGR", "kalbe": "KLBF",
}

REGIONAL: dict[str, tuple[str, str]] = {  # alias -> (exchange, symbol)
    "dbs": ("sgx", "D05"), "dbs group": ("sgx", "D05"),
    "uob": ("sgx", "U11"), "united overseas": ("sgx", "U11"),
    "ocbc": ("sgx", "O39"), "singtel": ("sgx", "Z74"),
    "maybank": ("klse", "1155"), "malayan banking": ("klse", "1155"),
    "cimb": ("klse", "1023"), "public bank": ("klse", "1295"),
}

PRESETS: dict[str, list[str]] = {
    "3 bank besar": ["BBCA", "BMRI", "BBRI"],
    "tiga bank besar": ["BBCA", "BMRI", "BBRI"],
    "bank besar": ["BBCA", "BMRI", "BBRI"],
    "big banks": ["BBCA", "BMRI", "BBRI"],
    "bank dividen": ["BBCA", "BMRI", "BBRI", "BBNI", "BRIS"],
    "bank": ["BBCA", "BMRI", "BBRI", "BBNI", "BRIS", "ARTO"],
    "perbankan": ["BBCA", "BMRI", "BBRI", "BBNI", "BRIS", "ARTO"],
    "tambang": ["ADRO", "PTBA", "ITMG", "BUMI", "HRUM", "INDY"],
    "coal": ["ADRO", "PTBA", "ITMG", "BUMI", "AADI"],
    "batu bara": ["ADRO", "PTBA", "ITMG", "BUMI", "AADI"],
    "mining": ["ADRO", "PTBA", "ITMG", "ANTM", "MDKA", "INCO"],
    "portfolio": ["BBCA", "BMRI", "BBRI", "TLKM", "ASII", "UNVR", "ICBP", "GOTO", "ANTM", "MDKA"],
    "portofolio": ["BBCA", "BMRI", "BBRI", "TLKM", "ASII", "UNVR", "ICBP", "GOTO", "ANTM", "MDKA"],
    "debitur": ["WSKT", "BNBR", "GIAA", "ENRG", "MEDC", "SMGR", "INCO", "KLBF", "PTBA", "ITMG"],
}

GROUP_HINTS = {
    "banks": ["BBCA", "BMRI", "BBRI", "BBNI", "BRIS", "ARTO"],
    "miners": ["ADRO", "PTBA", "ITMG", "BUMI", "HRUM", "INDY", "ANTM", "MDKA", "INCO"],
    "distressed": ["WSKT", "BNBR", "GIAA", "ENRG"],
    "watchlist": ["BBCA", "BMRI", "BBRI", "TLKM", "ASII", "UNVR", "ICBP", "GOTO", "ANTM", "MDKA"],
}

# Metadata emiten (dipakai planner untuk slug subsektor & filter tambang; lokal, 0 kredit).
META: dict[str, tuple[str, str]] = {
    "BBCA": ("Financials", "Banks"), "BMRI": ("Financials", "Banks"), "BBRI": ("Financials", "Banks"),
    "BBNI": ("Financials", "Banks"), "BRIS": ("Financials", "Banks"), "ARTO": ("Financials", "Banks"),
    "BUMI": ("Energy", "Energy"), "ADRO": ("Energy", "Energy"), "PTBA": ("Energy", "Energy"),
    "ITMG": ("Energy", "Energy"), "HRUM": ("Energy", "Energy"), "INDY": ("Energy", "Energy"),
    "AADI": ("Energy", "Energy"), "MEDC": ("Energy", "Energy"), "ENRG": ("Energy", "Energy"),
    "ANTM": ("Basic Materials", "Basic Materials"), "MDKA": ("Basic Materials", "Basic Materials"),
    "INCO": ("Basic Materials", "Basic Materials"), "SMGR": ("Basic Materials", "Basic Materials"),
    "WSKT": ("Infrastructure", "Infrastructure"), "BNBR": ("Industrials", "Industrials"),
    "GIAA": ("Transportation", "Transportation"), "TLKM": ("Telecommunications", "Telecommunications"),
    "ASII": ("Consumer Cyclicals", "Consumer Cyclicals"), "UNVR": ("Consumer Non-Cyclicals", "Consumer Non-Cyclicals"),
    "ICBP": ("Consumer Non-Cyclicals", "Consumer Non-Cyclicals"), "GOTO": ("Technology", "Technology"),
    "KLBF": ("Healthcare", "Healthcare"),
}

MINERS = {"BUMI", "ADRO", "PTBA", "ITMG", "HRUM", "INDY", "AADI", "ANTM", "MDKA", "INCO", "MEDC"}


def is_miner(sym: str) -> bool:
    return sym.upper() in MINERS


def subsector_slug(sym: str) -> str:
    sub = META.get(sym.upper(), ("", "Banks"))[1]
    return sub.lower().replace(" ", "-")

EN_MARKERS = ("the ", "compare", "versus", " vs ", "risk ", "dividend yield", "market cap", "please", "show me", "screening")
ID_MARKERS = (" dan ", " yang ", " apa ", " saham", " bandingkan", " cek ", " harga", " emiten", " risiko", " keuangan",
              " kinerja", " dividen", " laporan", " berita", " asing", " portfolio", " portofolio", " debitur",
              " kredit", " tambang", " batu bara", " jual", " beli", " scan", " review", " siapa")


@dataclass
class Scope:
    symbols: list[str] = field(default_factory=list)
    groups: list[str] = field(default_factory=list)
    regional: list[dict[str, str]] = field(default_factory=list)
    watchlist_size: int | None = None
    language: str = "id"
    notes: list[str] = field(default_factory=list)

    @property
    def has_scope(self) -> bool:
        return bool(self.symbols or self.regional or self.groups)

    def as_dict(self) -> dict:
        return {"symbols": self.symbols, "groups": self.groups, "regional": self.regional,
                "watchlist_size": self.watchlist_size, "language": self.language, "notes": self.notes}


def _match_aliases(text: str) -> list[str]:
    found: list[tuple[int, str]] = []
    low = text.lower()
    for alias, sym in sorted(ALIASES.items(), key=lambda kv: -len(kv[0])):
        m = re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", low)
        if m:
            found.append((m.start(), sym))
    return [s for _, s in sorted(found)]


def detect_language(text: str) -> str:
    low = f" {text.lower()} "
    en = sum(1 for m in EN_MARKERS if m in low)
    ids = sum(1 for m in ID_MARKERS if m in low)
    return "en" if en >= 3 and en > ids else "id"


def resolve(text: str) -> Scope:
    scope = Scope(language=detect_language(text))
    low = text.lower()

    for preset, syms in sorted(PRESETS.items(), key=lambda kv: -len(kv[0])):
        if preset in low:
            scope.groups.append(preset)
            for s in syms:
                if s not in scope.symbols:
                    scope.symbols.append(s)
            break

    for alias, (exch, sym) in sorted(REGIONAL.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", low):
            entry = {"exchange": exch, "symbol": sym, "alias": alias}
            if entry not in scope.regional:
                scope.regional.append(entry)

    for alias_sym in _match_aliases(text):
        if alias_sym not in scope.symbols:
            scope.symbols.append(alias_sym)

    for sym in re.findall(r"\b[A-Z]{4}\b", text):
        if sym in IDX and sym not in scope.symbols:
            scope.symbols.append(sym)

    m = re.search(r"(\d{1,3})\s*(saham|emiten|debitur|posisi|bank|ticker)", low)
    if m:
        scope.watchlist_size = min(int(m.group(1)), 40)
        if not scope.symbols and not scope.regional:
            base = GROUP_HINTS["distressed"] if "debitur" in m.group(2) else GROUP_HINTS["watchlist"]
            extra = [s for s in IDX if s not in base]
            scope.symbols = (base + extra)[: scope.watchlist_size]
            scope.notes.append(f"daftar default {scope.watchlist_size} {m.group(2)} (demo)")

    mining_kw = ("batu bara", "coal", "tambang", "mining", "iup", "nikel", "nickel", "emas", "smelter", "cadangan", "ekspor")
    if any(kw in low for kw in mining_kw) and not any(is_miner(s) for s in scope.symbols):
        for s_ in GROUP_HINTS["miners"][:3]:
            if s_ not in scope.symbols:
                scope.symbols.append(s_)
        scope.notes.append("scope tambang default demo (ADRO, PTBA, ITMG)")

    if not scope.symbols and not scope.regional:
        words = re.findall(r"[a-z]{3,}", low)
        for w in words:
            close = difflib.get_close_matches(w, list(ALIASES.keys()) + [s.lower() for s in IDX], n=1, cutoff=0.86)
            if close:
                cand = close[0]
                sym = ALIASES.get(cand, cand.upper() if cand.upper() in IDX else None)
                if sym and sym in IDX and sym not in scope.symbols:
                    scope.symbols.append(sym)
                    scope.notes.append(f"fuzzy: '{w}' → {sym}")

    return scope


def is_idx_symbol(sym: str) -> bool:
    return sym.upper() in IDX