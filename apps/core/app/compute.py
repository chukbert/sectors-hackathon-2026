"""Compute deterministik — LLM tidak pernah menghitung (docs/ARCHITECTURE.md §7)."""
from __future__ import annotations

import math
from typing import Any, Iterable


def safe_div(a: float | None, b: float | None) -> float | None:
    if a is None or b in (None, 0):
        return None
    return a / b


def pct_change(new: float | None, old: float | None) -> float | None:
    if new is None or old in (None, 0):
        return None
    return (new - old) / abs(old) * 100.0


def yoy(series: list[float], lag: int = 4) -> float | None:
    if len(series) <= lag:
        return None
    return pct_change(series[-1], series[-1 - lag])


def cagr(first: float | None, last: float | None, years: float) -> float | None:
    if not first or not last or first <= 0 or last <= 0 or years <= 0:
        return None
    return ((last / first) ** (1 / years) - 1) * 100.0


def margin(profit: float | None, revenue: float | None) -> float | None:
    m = safe_div(profit, revenue)
    return None if m is None else m * 100.0


def median(values: Iterable[float | None]) -> float | None:
    vals = sorted(v for v in values if v is not None)
    if not vals:
        return None
    mid = len(vals) // 2
    return vals[mid] if len(vals) % 2 else (vals[mid - 1] + vals[mid]) / 2


def mean(values: Iterable[float | None]) -> float | None:
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


def stdev(values: Iterable[float | None]) -> float | None:
    vals = [v for v in values if v is not None]
    if len(vals) < 2:
        return None
    mu = sum(vals) / len(vals)
    return math.sqrt(sum((v - mu) ** 2 for v in vals) / len(vals))


def position_pct(value: float | None, low: float | None, high: float | None) -> float | None:
    if value is None or low is None or high is None or high <= low:
        return None
    return max(0.0, min(100.0, (value - low) / (high - low) * 100.0))


def index_series(rows: list[dict], value_key: str = "close", base: float | None = None) -> list[dict]:
    if not rows:
        return []
    start = base if base is not None else rows[0].get(value_key)
    if not start:
        return []
    return [{"date": r.get("date"), "value": round((r.get(value_key) or 0) / start * 100.0, 2)} for r in rows]


def adv_value(rows: list[dict], days: int = 30) -> float | None:
    subset = rows[-days:]
    vals = [r.get("value") for r in subset if r.get("value")]
    return sum(vals) / len(vals) if vals else None


def net_sum(rows: list[dict], key: str, days: int) -> float:
    return sum((r.get(key) or 0) for r in rows[-days:])


def top_share(values: list[float], top: int = 3) -> float | None:
    total = sum(v for v in values if v)
    if not total:
        return None
    return sum(sorted((v for v in values if v), reverse=True)[:top]) / total * 100.0


def hhi(values: list[float]) -> float | None:
    total = sum(v for v in values if v)
    if not total:
        return None
    return sum((v / total * 100) ** 2 for v in values if v)


def trend_label(values: list[float | None], up_word: str = "naik", down_word: str = "turun") -> str:
    vals = [v for v in values if v is not None]
    if len(vals) < 2:
        return "data terbatas"
    streak, direction = 0, None
    for i in range(len(vals) - 1, 0, -1):
        diff = vals[i] - vals[i - 1]
        step = "up" if diff > 0 else "down" if diff < 0 else None
        if step is None:
            break
        if direction is None:
            direction = step
        elif direction != step:
            break
        streak += 1
    if direction is None:
        return "datar"
    word = up_word if direction == "up" else down_word
    return f"{word} {streak} periode beruntun" if streak >= 2 else f"terakhir {word}"


def pct_diff(a: float | None, b: float | None) -> float | None:
    band = safe_div(abs(a or 0) - abs(b or 0), abs(b)) if (a is not None and b) else None
    return None if band is None else band * 100.0


# ---------------------------------------------------------------- format id-ID
def fmt_num(v: float | None, digits: int = 1) -> str:
    if v is None:
        return "—"
    s = f"{v:,.{digits}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def fmt_pct(v: float | None, digits: int = 1, sign: bool = False) -> str:
    if v is None:
        return "—"
    s = fmt_num(v, digits)
    return f"{'+' if sign and v > 0 else ''}{s}%"


def fmt_idr(v: float | None, digits: int = 1) -> str:
    if v is None:
        return "—"
    av = abs(v)
    if av >= 1e15:
        return f"Rp{fmt_num(v / 1e15, digits)} Kuadriliun"
    if av >= 1e12:
        return f"Rp{fmt_num(v / 1e12, digits)} T"
    if av >= 1e9:
        return f"Rp{fmt_num(v / 1e9, digits)} M"
    if av >= 1e6:
        return f"Rp{fmt_num(v / 1e6, digits)} jt"
    return f"Rp{fmt_num(v, 0)}"


def fmt_usd(v: float | None) -> str:
    if v is None:
        return "—"
    if abs(v) >= 1e9:
        return f"US${fmt_num(v / 1e9, 2)} M"
    if abs(v) >= 1e6:
        return f"US${fmt_num(v / 1e6, 1)} jt"
    return f"US${fmt_num(v, 2)}"


def fmt_date_short(iso_date: str | None) -> str:
    if not iso_date:
        return "—"
    months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
    try:
        y, m, d = iso_date[:10].split("-")
        return f"{int(d):02d} {months[int(m) - 1]} {y}"
    except (IndexError, ValueError):
        return iso_date