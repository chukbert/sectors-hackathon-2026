"""TTL per jenis data (STORE.md §4) + klasifikasi jenis data."""
from __future__ import annotations

from .keys import normalize_path

HOUR = 3600
DAY = 24 * HOUR


def data_kind(endpoint: str) -> str:
    path = normalize_path(endpoint)
    if any(s in path for s in ("/helpers", "/subsectors", "/industries", "/subindustries", "/tags", "/broker/registry")):
        return "helper"
    if "/subsector/report" in path:
        return "subsector_report"
    if "/company/report" in path and "/quarterly" not in path:
        return "company_report"
    if "/quarterly" in path or "quarterly-dates" in path:
        return "quarterly"
    if any(s in path for s in ("/daily", "/universe/close", "/index/daily", "/foreign-flow", "/most-traded", "/movers", "/idx/market-cap", "/broker/top", "/broker/summary", "/broker/activity", "/broker/top-buyers", "/broker/top-sellers")):
        return "eod"
    if any(s in path for s in ("/corporate-actions", "/filings", "/suspensions", "/news")):
        return "event"
    if "/companies" in path or "/top-ranked" in path or "/ranked" in path or "/top-growth" in path or "/free-float" in path:
        return "screener"
    if "/mining" in path or "/commodities" in path or "/licenses" in path or "/auctions" in path:
        return "mining"
    if "/sgx" in path or "/klse" in path:
        return "regional"
    return "default"


def ttl_seconds(endpoint: str, default_ttl: int) -> int:
    kind = data_kind(endpoint)
    return {
        "helper": 7 * DAY,
        "subsector_report": DAY,
        "company_report": DAY,
        "quarterly": 90 * DAY,  # imutabel sampai report_date baru; disegarkan via check dates
        "eod": DAY,
        "event": 6 * HOUR,  # append-only + since; gabung saat fetch
        "screener": DAY,
        "mining": 7 * DAY,
        "regional": DAY,
        "default": default_ttl,
    }[kind]