"""Katalog 38 intent-output → node fetch, compute, chart, panel (docs/INTENT-OUTPUT.md §2, §8).

Prinsip: intent ≠ agen. Katalog ini yang membuat planner bisa dedup + fetch-sharing.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .resolve import META, is_miner


@dataclass(frozen=True)
class NodeSpec:
    key: str
    endpoint: str
    params: dict[str, Any] = field(default_factory=dict)
    scope: str = "single"  # single | ticker | regional | peer
    wave: int = 2
    optional: bool = False
    require_miner: bool = False

    def expanded(self, scope: dict) -> list["NodeSpec"]:
        ticks = scope.get("symbols") or []
        regs = scope.get("regional") or []
        out: list[NodeSpec] = []
        if self.scope == "ticker":
            for sym in ticks:
                if self.require_miner and not is_miner(sym):
                    continue
                out.append(self._sub({"symbol": sym, "symbols": ticks}, tick_key=f"{self.key}:{sym}"))
        elif self.scope == "regional":
            for entry in regs:
                out.append(self._sub({"symbol": entry["symbol"], "exchange": entry["exchange"]},
                                     tick_key=f"{self.key}:{entry['symbol']}:{entry['exchange']}"))
        else:
            out.append(self._sub({"symbol": ticks[0] if ticks else "", "symbols": ticks}, tick_key=self.key))
        return out

    def _sub(self, mapping: dict, tick_key: str) -> "NodeSpec":
        endpoint = self.endpoint
        params: dict[str, Any] = {}
        for k, v in self.params.items():
            if isinstance(v, str) and v.startswith("$"):
                params[k] = mapping.get(v[1:], v)
            elif isinstance(v, list):
                params[k] = [mapping.get(x[1:], x) if isinstance(x, str) and x.startswith("$") else x for x in v]
            else:
                params[k] = v
        for placeholder, value in {**mapping, **params}.items():
            if value in (None, "", []):
                continue
            if isinstance(value, str) and value.startswith("$"):
                continue  # placeholder $ref yang belum teresolusi — disubstitusi planner
            endpoint = endpoint.replace("{" + placeholder + "}", str(value))
        return NodeSpec(key=tick_key, endpoint=endpoint, params=params, scope=self.scope, wave=self.wave,
                        optional=self.optional, require_miner=self.require_miner)


@dataclass(frozen=True)
class Intent:
    id: str
    name: str
    panel: str
    compute: str
    nodes: tuple[NodeSpec, ...] = ()
    chart: str | None = None
    level: str = "L1"


def _n(key: str, endpoint: str, params: dict | None = None, scope: str = "single", wave: int = 2,
       optional: bool = False, miner: bool = False) -> NodeSpec:
    return NodeSpec(key=key, endpoint=endpoint, params=params or {}, scope=scope, wave=wave,
                    optional=optional, require_miner=miner)


INTENTS: dict[str, Intent] = {
    "IO-01": Intent("IO-01", "Company Snapshot", "P1", "snapshot", (
        _n("report", "/v2/company/report/{symbol}", {"sections": ["overview"]}, "ticker", 1),
    ), "kpi_strip"),
    "IO-02": Intent("IO-02", "Valuation Band", "P1", "valuation_band", (
        _n("report", "/v2/company/report/{symbol}", {"sections": ["valuation"]}, "ticker", 2),
    ), "valuation_band"),
    "IO-03": Intent("IO-03", "Earnings & Margins Trend", "P2", "earnings_trend", (
        _n("report", "/v2/company/report/{symbol}", {"sections": ["financials"]}, "ticker", 2),
        _n("quarterly", "/v2/company/report/{symbol}/quarterly", {"n_quarters": 8}, "ticker", 2),
    ), "earnings_combo"),
    "IO-04": Intent("IO-04", "Forecast vs Realisasi", "P1", "forecast", (
        _n("report", "/v2/company/report/{symbol}", {"sections": ["future"]}, "ticker", 2),
        _n("quarterly", "/v2/company/report/{symbol}/quarterly", {"n_quarters": 8}, "ticker", 2),
    ), "forecast_bar"),
    "IO-05": Intent("IO-05", "Dividend Profile", "P1", "dividend", (
        _n("report", "/v2/company/report/{symbol}", {"sections": ["dividend"]}, "ticker", 2),
        _n("ca", "/v2/corporate-actions/{symbol}", {}, "ticker", 4),
    ), "dividend_bar"),
    "IO-06": Intent("IO-06", "Management & Skin-in-the-game", "P4", "management", (
        _n("report", "/v2/company/report/{symbol}", {"sections": ["management"]}, "ticker", 2),
    ), "mgmt_bar"),
    "IO-07": Intent("IO-07", "Ownership Snapshot", "P4", "ownership", (
        _n("report", "/v2/company/report/{symbol}", {"sections": ["ownership"]}, "ticker", 2),
    ), "ownership_donut"),
    "IO-08": Intent("IO-08", "Peer Snapshot", "P6", "peers", (
        _n("report", "/v2/company/report/{symbol}", {"sections": ["peers"]}, "ticker", 2),
        _n("screener", "/v2/companies", {}, "single", 1),
    ), "comps_table"),
    "IO-09": Intent("IO-09", "Revenue Segment Mix", "P2", "segments", (
        _n("report", "/v2/company/report/{symbol}", {"sections": ["segments"]}, "ticker", 2),
    ), "segment_stack"),
    "IO-10": Intent("IO-10", "Quarterly Freshness", "P1", "freshness", (
        _n("qdates", "/v2/company/quarterly-dates", {"limit": 30}, "single", 2),
        _n("qdates_sym", "/v2/company/report/{symbol}/quarterly-dates", {}, "ticker", 2, optional=True),
    ), "freshness_timeline"),
    "IO-11": Intent("IO-11", "NL Screener", "P6", "screener", (
        _n("screener_query", "/v2/companies", {"limit": 25}, "single", 5),
    ), "screener_scatter"),
    "IO-12": Intent("IO-12", "Dividend / Value Rank", "P6", "rank", (
        _n("rank_div", "/v2/companies", {"order_by": "dividend_yield", "desc": True, "limit": 12}, "single", 1),
        _n("rank_roe", "/v2/companies", {"order_by": "roe", "desc": True, "limit": 12}, "single", 1),
    ), "rank_bar"),
    "IO-13": Intent("IO-13", "Growth Leaders/Laggards", "P6", "growth", (
        _n("growth", "/v2/companies", {"order_by": "earnings_growth_yoy", "desc": True, "limit": 24}, "single", 1),
    ), "growth_bar"),
    "IO-14": Intent("IO-14", "Free Float & Likuiditas", "P4", "free_float", (
        _n("float", "/v2/companies/free-float", {"limit": 40}, "single", 1),
    ), "float_bar"),
    "IO-15": Intent("IO-15", "Sector Map", "P6", "sector_map", (
        _n("helpers", "/v2/helpers/subsectors", {}, "single", 1),
    ), "tree"),
    "IO-16": Intent("IO-16", "Price History", "P3", "price_history", (
        _n("daily", "/v2/company/daily/{symbol}", {}, "ticker", 2),
    ), "price_indexed"),
    "IO-17": Intent("IO-17", "Market Snapshot", "P3", "market_snapshot", (
        _n("universe", "/v2/companies", {"order_by": "market_cap", "desc": True, "limit": 200}, "single", 1),
    ), "sector_heatmap"),
    "IO-18": Intent("IO-18", "Index & Market Cap", "P3", "index_compare", (
        _n("index", "/v2/index/daily", {"symbol": "IHSG"}, "single", 1),
        _n("daily", "/v2/company/daily/{symbol}", {}, "ticker", 2),
    ), "index_compare"),
    "IO-19": Intent("IO-19", "Movers & Most-Traded", "P3", "movers", (
        _n("movers_gain", "/v2/movers/top", {"period": "1d", "type": "gainers", "limit": 10}, "single", 1),
        _n("movers_lose", "/v2/movers/top", {"period": "1d", "type": "losers", "limit": 10}, "single", 1),
        _n("most_traded", "/v2/movers/most-traded", {"limit": 10}, "single", 1),
    ), "movers_bar"),
    "IO-20": Intent("IO-20", "IPO Precedent", "P6", "ipo", (
        _n("ipo", "/v2/ipo/performance", {}, "single", 1),
    ), "ipo_dot"),
    "IO-21": Intent("IO-21", "Flow Check per Saham", "P4", "flow", (
        _n("broker_summary", "/v2/broker/summary/{symbol}", {}, "ticker", 3),
        _n("broker_buyers", "/v2/broker/top-buyers/{symbol}", {}, "ticker", 3, optional=True),
        _n("broker_sellers", "/v2/broker/top-sellers/{symbol}", {}, "ticker", 3, optional=True),
    ), "flow_diverging"),
    "IO-22": Intent("IO-22", "Broker Behavior", "P4", "broker_behavior", (
        _n("broker_activity", "/v2/broker/activity/{broker}", {"broker": "ZP"}, "single", 3),
    ), "broker_heatmap"),
    "IO-23": Intent("IO-23", "Broker Landscape", "P4", "broker_landscape", (
        _n("broker_registry", "/v2/broker/registry", {}, "single", 3),
        _n("broker_top", "/v2/broker/top", {"limit": 30}, "single", 3),
    ), "broker_donut"),
    "IO-24": Intent("IO-24", "Foreign Flow", "P4", "foreign_flow", (
        _n("foreign", "/v2/foreign-flow/{symbol}", {}, "ticker", 3),
    ), "foreign_bar"),
    "IO-25": Intent("IO-25", "Corporate Action Timeline", "P5", "corp_actions", (
        _n("ca", "/v2/corporate-actions/{symbol}", {}, "ticker", 4),
        _n("ca_cal", "/v2/corporate-actions/calendar", {"types": ["dividend", "upcoming_dividend"]}, "single", 4),
    ), "ca_timeline"),
    "IO-26": Intent("IO-26", "Insider Monitor", "P5", "insider", (
        _n("filings", "/v2/filings/{symbol}", {}, "ticker", 4),
    ), "insider_markers"),
    "IO-27": Intent("IO-27", "Suspension & UMA Watch", "P5", "suspension", (
        _n("susp", "/v2/suspensions/{symbol}", {}, "ticker", 4),
    ), "susp_table"),
    "IO-28": Intent("IO-28", "News Brief", "P5", "news", (
        _n("news", "/v2/news/{symbol}", {}, "ticker", 4),
    ), "news_feed"),
    "IO-29": Intent("IO-29", "Sector Report Card", "P6", "sector_report", (
        _n("subsector", "/v2/subsector/report/{slug}", {"slug": "$subsector", "sections": ["overview", "valuation", "performance"]}, "single", 5),
    ), "sector_card"),
    "IO-30": Intent("IO-30", "Mining Company Dossier", "P7", "mining_dossier", (
        _n("mining_detail", "/v2/mining/{symbol}", {}, "ticker", 5, miner=True),
        _n("mining_prod", "/v2/mining/{symbol}/production", {}, "ticker", 5, miner=True),
        _n("mining_fin", "/v2/mining/{symbol}/financials", {}, "ticker", 5, miner=True),
    ), "mining_prod"),
    "IO-31": Intent("IO-31", "Ownership Tree Tambang", "P7", "mining_ownership", (
        _n("mining_own", "/v2/mining/{symbol}/ownership", {}, "ticker", 5, miner=True),
    ), "tree"),
    "IO-32": Intent("IO-32", "Site & Reserve Map", "P7", "mining_sites", (
        _n("mining_sites", "/v2/mining/{symbol}/sites", {}, "ticker", 5, miner=True),
        _n("mining_prod", "/v2/mining/{symbol}/production", {}, "ticker", 5, miner=True),
    ), "map"),
    "IO-33": Intent("IO-33", "Commodity Price & Trade", "P7", "commodity", (
        _n("commodities", "/v2/commodities", {}, "single", 5, miner=True),
        _n("mining_exports", "/v2/mining/{symbol}/exports", {}, "ticker", 5, miner=True),
    ), "commodity_line"),
    "IO-34": Intent("IO-34", "License & Auction Radar", "P7", "licenses", (
        _n("mining_lic", "/v2/mining/{symbol}/licenses", {}, "ticker", 5, miner=True),
        _n("auctions", "/v2/mining/auctions", {}, "single", 5, miner=True),
    ), "license_table"),
    "IO-35": Intent("IO-35", "SGX/KLSE Dossier", "P7", "regional", (
        _n("sgx_report", "/v2/sgx/company/report/{symbol}", {"sections": ["overview", "valuation"]}, "regional", 5),
    ), "regional_table"),
    "IO-36": Intent("IO-36", "SGX Flow Spesial", "P7", "regional_flow", (
        _n("sgx_short", "/v2/sgx/short-sell", {}, "single", 5),
        _n("sgx_buybacks", "/v2/sgx/buybacks", {}, "single", 5),
        _n("sgx_filings", "/v2/sgx/filings", {}, "single", 5),
        _n("sgx_news", "/v2/sgx/news", {}, "single", 5, optional=True),
    ), "regional_flow"),
    "IO-38": Intent("IO-38", "Credit & Red-Flag Scan", "P8", "red_flags", (), "gauge"),
    "IO-39": Intent("IO-39", "Chat Bebas", "chat", "chat", (), None, "L0"),
}

# Playbook → intent (docs/INTENT-OUTPUT.md §9 + PRD §5)
PLAYBOOKS: dict[str, dict[str, Any]] = {
    "earnings": {
        "label": "Earnings & Company Memo",
        "keywords": ["earnings", "kinerja", "laba", "lk", "kuartal", "quarter", "snapshot", "valuasi", "valuation",
                     "memo", "flash", "fundamental", "dividen", "dividend", "tren", "margin", "forecast"],
        "intents": ["IO-01", "IO-02", "IO-03", "IO-04", "IO-05", "IO-08", "IO-10", "IO-25", "IO-26", "IO-28"],
    },
    "comps": {
        "label": "Comps Builder",
        "keywords": ["comps", "peer", "banding", "compare", "screening", "screener", "murah", "mahal",
                     "value", "valuasi", "perbandingan", "ranking", "rank", "yield", "dividen", "sektor", "sector"],
        "intents": ["IO-08", "IO-11", "IO-12", "IO-13", "IO-15", "IO-20", "IO-29"],
    },
    "credit": {
        "label": "Credit & Red-Flag Memo",
        "keywords": ["kredit", "credit", "risiko", "risk", "red-flag", "red flag", "redflag", "bahaya",
                     "debitur", "default", "ekuitas", "leverage", "covenant", "scan", "early warning",
                     "goreng", "uma", "forensik", "fraud", "suspensi", "suspend", "telat lapor", "likuiditas"],
        "intents": ["IO-01", "IO-03", "IO-07", "IO-10", "IO-14", "IO-16", "IO-21", "IO-24", "IO-25", "IO-26", "IO-27", "IO-38"],
    },
    "market": {
        "label": "Market Snapshot",
        "keywords": ["pasar", "market", "ihsg", "index", "indeks", "movers", "mover", "most traded", "asing", "kemarin",
                     "harian", "daily", "pagi", "komite", "paket"],
        "intents": ["IO-16", "IO-17", "IO-18", "IO-19", "IO-24"],
    },
    "flow": {
        "label": "Flow Check",
        "keywords": ["flow", "broker", "akumulasi", "distribusi", "bandar", "asing", "net buy", "net sell",
                     "bandarmologi", "institusi", "ritel"],
        "intents": ["IO-21", "IO-22", "IO-23", "IO-24"],
    },
    "mining": {
        "label": "Mining Dossier",
        "keywords": ["tambang", "mining", "batu bara", "coal", "nikel", "nickel", "emas", "gold",
                     "iup", "iupk", "lelang", "cadangan", "ekspor", "smelter", "komoditas"],
        "intents": ["IO-01", "IO-02", "IO-03", "IO-08", "IO-29", "IO-30", "IO-31", "IO-32", "IO-33", "IO-34"],
    },
    "regional": {
        "label": "Regional Compare",
        "keywords": ["sgx", "klse", "singapur", "singapore", "malaysia", "regional", "dbs", "uob", "maybank",
                     "lintas bursa", "asean"],
        "intents": ["IO-01", "IO-02", "IO-03", "IO-05", "IO-08", "IO-35", "IO-36"],
    },
    "committee": {
        "label": "Paket Komite (Q1)",
        "keywords": ["komite", "paket", "lengkap", "full", "all", "semua", "mega"],
        "intents": ["IO-01", "IO-02", "IO-03", "IO-04", "IO-05", "IO-06", "IO-07", "IO-08", "IO-09", "IO-10",
                    "IO-11", "IO-12", "IO-13", "IO-14", "IO-15", "IO-16", "IO-17", "IO-18", "IO-19", "IO-20",
                    "IO-21", "IO-22", "IO-23", "IO-24", "IO-25", "IO-26", "IO-27", "IO-28", "IO-29", "IO-30",
                    "IO-31", "IO-32", "IO-33", "IO-34", "IO-35", "IO-36", "IO-38"],
    },
}

PANEL_ORDER = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]
PANEL_TITLES = {
    "P1": "Snapshot & Valuasi",
    "P2": "Kinerja & Segmen",
    "P3": "Pasar & Momentum",
    "P4": "Flow & Kepemilikan",
    "P5": "Event & Governance",
    "P6": "Peer & Sektor",
    "P7": "Tambang & Regional",
    "P8": "Risiko",
}


def select_playbooks(text: str, scope_symbols: list[str] | None = None) -> list[str]:
    low = f" {text.lower()} "
    scored: list[tuple[int, str]] = []
    for key, pb in PLAYBOOKS.items():
        score = sum(1 for kw in pb["keywords"] if kw in low)
        if score:
            scored.append((score, key))
    scored.sort(key=lambda x: (-x[0], x[1]))
    out = [k for _, k in scored]
    if not out:
        out = ["earnings"]
    if len(out) > 1:
        primary = out[0]
        merged = None
        for key in out[1:]:
            if key == "committee":
                continue
        if primary != "market":
            out = out[:3]
    return out[:3] if "committee" not in out else ["committee"]


def intents_for_playbooks(playbooks: list[str]) -> list[str]:
    seen: list[str] = []
    for pb in playbooks:
        for io in PLAYBOOKS[pb]["intents"]:
            if io not in seen:
                seen.append(io)
    return seen