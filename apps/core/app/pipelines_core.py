"""Pipelines analisis — satu builder per intent-output (angka dari compute + ledger).

Chunk 1: P1 Snapshot/Valuasi, P2 Kinerja/Segmen, P3 Pasar/Momentum, P4 Flow/Kepemilikan.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from . import charts as ch
from .compute import (adv_value, fmt_date_short, fmt_idr, fmt_num, fmt_pct, index_series, margin,
                 median, net_sum, pct_change, pct_diff, position_pct, safe_div, top_share, trend_label, yoy)
from .executor import RunContext


@dataclass
class Piece:
    io: str
    panel: str
    title: str = ""
    why: str = ""
    narrative: str = ""
    kpis: list[dict] = field(default_factory=list)
    chart: dict | None = None
    table: dict | None = None
    items: list[dict] = field(default_factory=list)
    facts: list[str] = field(default_factory=list)
    evidence: list[str] = field(default_factory=list)
    status: str = "ready"
    empty_reason: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {"io": self.io, "panel": self.panel, "title": self.title, "why": self.why,
                "narrative": self.narrative, "kpis": self.kpis, "chart": self.chart, "table": self.table,
                "items": self.items, "facts": self.facts, "evidence": self.evidence, "status": self.status,
                "empty_reason": self.empty_reason}


def syms(ctx: RunContext) -> list[str]:
    return list(ctx.scope.get("symbols") or [])


def has(ctx: RunContext, key: str) -> bool:
    return key in ctx.data and ctx.data.get(key) is not None


def r(ctx: RunContext, sym: str, section: str) -> dict:
    payload = ctx.value(f"report:{sym}") or {}
    return (payload.get("sections") or {}).get(section) or {}


def q(ctx: RunContext, sym: str) -> list[dict]:
    return (ctx.value(f"quarterly:{sym}") or {}).get("quarterly") or []


def ev(ctx: RunContext, label: str, key: str, value: Any = None, unit: str | None = None) -> str:
    p = ctx.prov(key)
    return ctx.ledger.add(label=label, endpoint=p.get("endpoint", key), params=p.get("params", {}),
                          fetched_at=p.get("fetched_at") or "—", source=p.get("source") or "unknown",
                          value=value, unit=unit, node_key=key)


def empty(piece: Piece, reason: str) -> Piece:
    piece.status, piece.empty_reason = "empty", reason
    piece.narrative = piece.narrative or f"Data tidak tersedia: {reason}. Panel ini jujur dikosongkan, bukan dikarang."
    return piece


def _split_symbols(ctx: RunContext, limit: int = 3) -> tuple[list[str], list[str]]:
    s = syms(ctx)
    return s[:limit], s[limit:]


# ================================================================= P1 Snapshot & Valuasi
def b_snapshot(ctx: RunContext, io: str = "IO-01") -> Piece:
    piece = Piece(io=io, panel="P1", why="IO-01 · kartu identitas + posisi harga dalam rentang 52 minggu")
    heads, rest = _split_symbols(ctx)
    rows, kpis = [], []
    for sym in syms(ctx):
        ov = r(ctx, sym, "overview")
        if not ov:
            continue
        pos = position_pct(ov.get("close"), ov.get("52w_low"), ov.get("52w_high"))
        rows.append({"symbol": sym, "close": ov.get("close"), "low": ov.get("52w_low"), "high": ov.get("52w_high"),
                     "position": pos or 0})
        kpis.append(ch.kpi(sym, f"Rp{fmt_num(ov.get('close'), 0)}", f"{fmt_pct(ov.get('change_pct'), 2, True)} · {fmt_idr(ov.get('market_cap'))}",
                           "up" if (ov.get("change_pct") or 0) >= 0 else "down"))
        piece.evidence.append(ev(ctx, f"{sym} overview (harga, 52w)", f"report:{sym}",
                                 {"close": ov.get("close"), "52w_low": ov.get("52w_low"), "52w_high": ov.get("52w_high"),
                                  "position_pct": pos, "change_pct": ov.get("change_pct"), "market_cap": ov.get("market_cap")}))
    if not rows:
        return empty(piece, "report overview tidak tersedia")
    piece.kpis = kpis[:6]
    piece.chart = ch.price_position(rows)
    first = rows[0]
    piece.title = f"{first['symbol']} di {round(first['position'])}% rentang 52 minggu"
    piece.narrative = "; ".join(
        f"{row['symbol']} {round(row['position'])}% dari rentang {fmt_num(row['low'], 0)}–{fmt_num(row['high'], 0)}"
        for row in rows[:4])
    piece.facts = [piece.title] + [f"{row['symbol']} pada {round(row['position'])}% rentang 52 minggu" for row in rows]
    if rest:
        piece.table = ch.table(
            [{"key": "symbol", "label": "Emiten"}, {"key": "close", "label": "Harga", "align": "right"},
             {"key": "position", "label": "Posisi 52w", "align": "right", "format": "pct"}],
            [{"symbol": s, "close": row["close"], "position": round(row["position"], 1)}
             for s, row in zip(syms(ctx), rows)][:40])
    return piece


def b_valuation_band(ctx: RunContext, io: str = "IO-02") -> Piece:
    piece = Piece(io=io, panel="P1", why="IO-02 · garis P/E + band rata-rata ±1σ → premi/diskon vs histori")
    heads, rest = _split_symbols(ctx)
    series, info, kpis, table_rows = [], [], [], []
    band = None
    for i, sym in enumerate(syms(ctx)):
        val = r(ctx, sym, "valuation")
        if not val or val.get("pe_ttm") is None:
            continue
        mean5, std5 = val.get("pe_mean_5y"), val.get("pe_std_5y")
        premium = pct_diff(val.get("pe_ttm"), mean5)
        hist = val.get("history") or []
        color = ch.PALETTE[i % len(ch.PALETTE)]
        if hist:
            series.append({"name": sym, "data": [h.get("pe") for h in hist], "color": color})
        if i == 0 and hist and mean5:
            band = (round(mean5 - (std5 or 0), 2), round(mean5 + (std5 or 0), 2))
        info.append((sym, val, premium))
        kpis.append(ch.kpi(sym, f"{fmt_num(val.get('pe_ttm'))}x", f"histori {fmt_num(mean5)}x · {fmt_pct(premium, 1, True)}",
                           "down" if (premium or 0) < 0 else "up"))
        table_rows.append({"symbol": sym, "pe": val.get("pe_ttm"), "pb": val.get("pb"),
                           "mean5": mean5, "premium": round(premium, 1) if premium is not None else None,
                           "yield": val.get("dividend_yield")})
        piece.evidence.append(ev(ctx, f"{sym} valuation (P/E, band 5 thn)", f"report:{sym}",
                                 {"pe_ttm": val.get("pe_ttm"), "pb": val.get("pb"), "pe_mean_5y": mean5,
                                  "pe_std_5y": std5, "premium_pct": premium, "dividend_yield": val.get("dividend_yield")}))
    if not series:
        return empty(piece, "sections=valuation tidak tersedia")
    x = [h.get("month") for h in (r(ctx, info[0][0], "valuation").get("history") or [])]
    piece.chart = ch.line(x, series, y_name="x", suffix="x", band=band, band_label="±1σ 5 thn", x_interval=11,
                          height=300)
    sym0, val0, prem0 = info[0]
    piece.title = f"P/E {sym0} {fmt_num(val0.get('pe_ttm'))}x: {'premi' if (prem0 or 0) >= 0 else 'diskon'} {fmt_pct(abs(prem0 or 0))} vs rata-rata 5 tahun"
    piece.kpis = kpis[:6]
    piece.narrative = " · ".join(
        f"{s} {fmt_num(v.get('pe_ttm'))}x vs rata-rata {fmt_num(v.get('pe_mean_5y'))}x ({'premi' if (p or 0) >= 0 else 'diskon'} {fmt_pct(abs(p or 0))})"
        for s, v, p in info[:4])
    piece.facts = [piece.title] + [piece.narrative]
    piece.table = ch.table(
        [{"key": "symbol", "label": "Emiten"}, {"key": "pe", "label": "P/E", "align": "right", "format": "x"},
         {"key": "pb", "label": "P/B", "align": "right", "format": "x"}, {"key": "mean5", "label": "Rata2 5 thn", "align": "right", "format": "x"},
         {"key": "premium", "label": "Premi/diskon", "align": "right", "format": "pct"}, {"key": "yield", "label": "Yield", "align": "right", "format": "pct"}],
        table_rows)
    return piece


def b_earnings(ctx: RunContext, io: str = "IO-03") -> Piece:
    piece = Piece(io=io, panel="P2", why="IO-03 · bar laba + garis margin (8 kuartal), anotasi tren")
    series_data, kpis, table_rows, first = [], [], [], None
    for i, sym in enumerate(syms(ctx)):
        rows = q(ctx, sym)
        if not rows:
            continue
        periods = [row["period"] for row in rows]
        rev = [row.get("revenue") for row in rows]
        ni = [row.get("net_income") for row in rows]
        margins = [margin(row.get("net_income"), row.get("revenue")) for row in rows]
        growth = yoy(ni)
        if first is None:
            first = (sym, rows, periods, rev, ni, margins)
        kpis.append(ch.kpi(sym, fmt_idr(ni[-1]), f"YoY {fmt_pct(growth, 1, True)} · margin {fmt_pct(margins[-1])}",
                           "up" if (growth or 0) >= 0 else "down"))
        table_rows.append({"symbol": sym, "period": rows[-1]["period"], "revenue": rev[-1], "net_income": ni[-1],
                           "margin": round(margins[-1], 1) if margins[-1] is not None else None,
                           "yoy": round(growth, 1) if growth is not None else None})
        piece.evidence.append(ev(ctx, f"{sym} laba kuartalan + margin", f"quarterly:{sym}",
                                 {"period": rows[-1]["period"], "revenue": rev[-1], "net_income": ni[-1],
                                  "margin": margins[-1], "yoy": growth}))
    if first is None:
        return empty(piece, "quarterly financials tidak tersedia")
    sym0, rows0, periods0, rev0, ni0, margins0 = first
    trend = trend_label([m for m in margins0 if m is not None])
    piece.chart = ch.combo_bar_line(periods0, {"name": f"Laba {sym0}", "data": ni0},
                                    {"name": "Margin", "data": [round(m, 1) if m is not None else None for m in margins0]},
                                    suffix_bar="", suffix_line="%", y_left="Rp", y_right="margin %", height=320)
    piece.kpis = kpis[:6]
    piece.title = f"Laba {sym0} {trend}, margin {fmt_pct(margins0[-1])}"
    piece.narrative = f"{sym0}: laba {fmt_idr(ni0[-1])} pada {rows0[-1]['period']} (margin {fmt_pct(margins0[-1])}, YoY {fmt_pct(yoy(ni0), 1, True)}); margin {trend}."
    piece.facts = [piece.title, piece.narrative] + [f"{s} YoY {fmt_pct(row['yoy'], 1, True)}, margin {fmt_pct(row['margin'])}" for s, row in zip([x[0] for x in [(sym0,)]], table_rows[:1])]
    piece.table = ch.table(
        [{"key": "symbol", "label": "Emiten"}, {"key": "period", "label": "Kuartal"},
         {"key": "revenue", "label": "Pendapatan", "align": "right", "format": "idr"},
         {"key": "net_income", "label": "Laba", "align": "right", "format": "idr"},
         {"key": "margin", "label": "Margin", "align": "right", "format": "pct"},
         {"key": "yoy", "label": "YoY", "align": "right", "format": "pct"}],
        table_rows)
    return piece


def b_forecast(ctx: RunContext, io: str = "IO-04") -> Piece:
    piece = Piece(io=io, panel="P1", why="IO-04 · estimasi vs realisasi; forecast selalu diberi label estimasi")
    sym = syms(ctx)[0] if syms(ctx) else ""
    fut = r(ctx, sym, "future").get("estimates") or []
    rows = q(ctx, sym)
    if not fut or not rows:
        return empty(piece, "sections=future / quarterly tidak tersedia")
    actual = rows[-1].get("net_income")
    est = fut[0].get("earnings_est")
    diff = pct_diff(actual, est)
    piece.chart = ch.bar([f"Aktual {rows[-1]['period']}", f"Estimasi {fut[0]['year']} (est.)"],
                         [actual, est], suffix="", name="Laba", height=240)
    piece.title = f"Realisasi {fmt_pct(diff, 1, True)} vs konsensus (estimasi)"
    piece.kpis = [ch.kpi("Aktual", fmt_idr(actual)), ch.kpi("Estimasi", fmt_idr(est), "label estimasi"),
                  ch.kpi("Selisih", fmt_pct(diff, 1, True), tone="down" if (diff or 0) < 0 else "up")]
    piece.narrative = f"{sym} membukukan laba {fmt_idr(actual)} pada {rows[-1]['period']}; estimasi konsensus {fmt_idr(est)} (estimasi, bukan aktual) → selisih {fmt_pct(diff, 1, True)}."
    piece.facts = [piece.title]
    piece.evidence.append(ev(ctx, f"{sym} estimasi laba", f"report:{sym}", {"estimates": fut}))
    piece.evidence.append(ev(ctx, f"{sym} laba aktual", f"quarterly:{sym}", {"net_income": actual, "period": rows[-1]["period"]}))
    return piece


def b_dividend(ctx: RunContext, io: str = "IO-05") -> Piece:
    piece = Piece(io=io, panel="P1", why="IO-05 · yield vs median + jadwal cum/ex-date")
    rows_yield, kpis, events = [], [], []
    for sym in syms(ctx):
        div = r(ctx, sym, "dividend")
        if not div:
            continue
        rows_yield.append({"symbol": sym, "yield": div.get("yield"), "payout": div.get("payout_ratio"),
                           "dps": div.get("dps_last")})
        kpis.append(ch.kpi(sym, fmt_pct(div.get("yield")), f"payout {fmt_pct((div.get('payout_ratio') or 0) * 100)}",
                           "up" if (div.get("yield") or 0) >= 4 else "neutral"))
        piece.evidence.append(ev(ctx, f"{sym} dividend profile", f"report:{sym}",
                                 {"yield": div.get("yield"), "payout_ratio": div.get("payout_ratio"), "dps": div.get("dps_last")}))
        for action in (ctx.value(f"ca:{sym}") or {}).get("actions", []):
            if action.get("type") == "dividend":
                events.append({"symbol": sym, **action})
                piece.evidence.append(ev(ctx, f"{sym} jadwal dividen", f"ca:{sym}", action))
    if not rows_yield:
        return empty(piece, "sections=dividend tidak tersedia")
    med = median([row["yield"] for row in rows_yield])
    top = max(rows_yield, key=lambda x: x["yield"] or 0)
    piece.chart = ch.bar([row["symbol"] for row in rows_yield], [row["yield"] for row in rows_yield],
                         suffix="%", name="Yield", threshold=med, height=250)
    piece.title = f"Yield {top['symbol']} {fmt_pct(top['yield'])} tertinggi; median {fmt_pct(med)}"
    piece.kpis = kpis[:6]
    piece.narrative = f"Median yield {fmt_pct(med)}; " + " · ".join(f"{row['symbol']} {fmt_pct(row['yield'])} (payout {fmt_pct((row['payout'] or 0) * 100)})" for row in rows_yield[:4])
    if events:
        nearest = sorted(events, key=lambda e: e.get("ex_date") or "9999")[0]
        piece.narrative += f" Ex-date terdekat {nearest['symbol']} {fmt_date_short(nearest.get('ex_date'))}."
        piece.facts.append(f"Ex-date dividen terdekat {nearest['symbol']} {fmt_date_short(nearest.get('ex_date'))}")
    piece.facts.insert(0, piece.title)
    piece.table = ch.table(
        [{"key": "symbol", "label": "Emiten"}, {"key": "yield", "label": "Yield", "align": "right", "format": "pct"},
         {"key": "payout", "label": "Payout", "align": "right", "format": "pct100"}, {"key": "dps", "label": "DPS", "align": "right"}],
        rows_yield)
    piece.items = [{"kind": "event", "symbol": e["symbol"], "date": e.get("ex_date"), "label": "ex-date",
                    "detail": f"cum {fmt_date_short(e.get('cum_date'))} · bayar {fmt_date_short(e.get('payment_date'))}"} for e in events[:8]]
    return piece


def b_management(ctx: RunContext, io: str = "IO-06") -> Piece:
    piece = Piece(io=io, panel="P4", why="IO-06 · direksi + kepemilikan eksekutif (skin-in-the-game)")
    rows, kpis = [], []
    for sym in syms(ctx):
        mgmt = r(ctx, sym, "management") or []
        if not mgmt:
            continue
        total_pct = sum(m.get("ownership_pct") or 0 for m in mgmt)
        rows.append({"symbol": sym, "count": len(mgmt), "ownership_pct": round(total_pct, 2),
                     "top": (mgmt[0].get("name") if mgmt else "—")})
        kpis.append(ch.kpi(sym, fmt_pct(total_pct, 2), f"{len(mgmt)} direksi terdata",
                           "up" if total_pct >= 1 else "warn"))
        piece.evidence.append(ev(ctx, f"{sym} management & kepemilikan", f"report:{sym}", {"management": mgmt, "total_pct": total_pct}))
    if not rows:
        return empty(piece, "sections=management tidak tersedia")
    piece.chart = ch.bar([row["symbol"] for row in rows], [row["ownership_pct"] for row in rows],
                         suffix="%", name="Kepemilikan direksi", height=230)
    low = min(rows, key=lambda x: x["ownership_pct"])
    piece.title = f"Kepemilikan direksi {low['symbol']} {fmt_pct(low['ownership_pct'])} — skin-in-the-game rendah" if low["ownership_pct"] < 1 else f"Kepemilikan direksi {max(rows, key=lambda x: x['ownership_pct'])['symbol']} tertinggi"
    piece.kpis = kpis
    piece.narrative = " · ".join(f"{row['symbol']}: {row['count']} direksi, total kepemilikan {fmt_pct(row['ownership_pct'], 2)}" for row in rows[:5])
    piece.facts = [piece.title, piece.narrative]
    return piece


def b_ownership(ctx: RunContext, io: str = "IO-07") -> Piece:
    piece = Piece(io=io, panel="P4", why="IO-07 · konsentrasi pemegang besar + asing + free float")
    sym = syms(ctx)[0] if syms(ctx) else ""
    own = r(ctx, sym, "ownership")
    if not own:
        return empty(piece, "sections=ownership tidak tersedia")
    labels = [s.get("name") or "—" for s in own.get("shareholders", [])]
    values = [s.get("pct") or 0 for s in own.get("shareholders", [])]
    ctrl = own.get("controlling_pct")
    foreign = own.get("foreign_pct")
    float_pct = own.get("free_float_pct")
    piece.chart = ch.donut(labels, values, center=f"kendali {fmt_pct(ctrl)}", height=260)
    piece.title = f"Pengendali {fmt_pct(ctrl)}; asing {fmt_pct(foreign)}; free float {fmt_pct(float_pct)}"
    piece.kpis = [ch.kpi("Pengendali", fmt_pct(ctrl)), ch.kpi("Asing", fmt_pct(foreign)),
                  ch.kpi("Free float", fmt_pct(float_pct), tone="warn" if (float_pct or 0) < 7.5 else "up")]
    piece.narrative = f"Struktur {sym}: " + ", ".join(f"{l} {fmt_pct(v)}" for l, v in zip(labels, values)) + f". Free float {fmt_pct(float_pct)}."
    piece.facts = [piece.title, f"Free float {sym} {fmt_pct(float_pct)}"]
    piece.evidence.append(ev(ctx, f"{sym} ownership & free float", f"report:{sym}",
                             {"shareholders": own.get("shareholders"), "controlling_pct": ctrl,
                              "foreign_pct": foreign, "free_float_pct": float_pct}))
    piece.table = ch.table([{"key": "name", "label": "Pemegang"}, {"key": "pct", "label": "%", "align": "right", "format": "pct"}],
                           [{"name": l, "pct": v} for l, v in zip(labels, values)])
    return piece


def b_peers(ctx: RunContext, io: str = "IO-08") -> Piece:
    piece = Piece(io=io, panel="P6", why="IO-08 · tabel comps + median otomatis (hijau = lebih baik dari median)")
    all_rows = (ctx.value("screener") or {}).get("companies") or []
    by_symbol = {row["symbol"]: row for row in all_rows}
    symbols: list[str] = []
    for sym in syms(ctx):
        for peer in (ctx.value(f"report:{sym}") or {}).get("sections", {}).get("peers", []) or []:
            if peer not in symbols:
                symbols.append(peer)
    for sym in syms(ctx):
        if sym in by_symbol and sym not in symbols:
            symbols.insert(0, sym)
    rows = [by_symbol[s] for s in symbols if s in by_symbol][:10]
    if not rows:
        return empty(piece, "peer set tidak tersedia")
    med_pe = median([row.get("pe") for row in rows])
    med_pb = median([row.get("pb") for row in rows])
    med_roe = median([row.get("roe") for row in rows])
    med_yield = median([row.get("dividend_yield") for row in rows])
    table_rows = []
    for row in rows:
        table_rows.append({"symbol": row["symbol"], "name": row["name"], "pe": row.get("pe"), "pb": row.get("pb"),
                           "roe": row.get("roe"), "yield": row.get("dividend_yield"), "der": row.get("der"),
                           "pe_better": row.get("pe") is not None and med_pe is not None and row["pe"] < med_pe,
                           "pb_better": row.get("pb") is not None and med_pb is not None and row["pb"] < med_pb,
                           "roe_better": row.get("roe") is not None and med_roe is not None and row["roe"] > med_roe,
                           "yield_better": row.get("dividend_yield") is not None and med_yield is not None and row["dividend_yield"] > med_yield,
                           "der_better": row.get("der") is not None and median([r.get("der") for r in rows]) is not None
                           and row["der"] < (median([r.get("der") for r in rows]) or 0)})
    piece.table = ch.table(
        [{"key": "symbol", "label": "Emiten"},
         {"key": "pe", "label": "P/E", "align": "right", "format": "x", "better": "lower"},
         {"key": "pb", "label": "P/B", "align": "right", "format": "x", "better": "lower"},
         {"key": "roe", "label": "ROE", "align": "right", "format": "pct", "better": "higher"},
         {"key": "yield", "label": "Yield", "align": "right", "format": "pct", "better": "higher"},
         {"key": "der", "label": "DER", "align": "right", "format": "x", "better": "lower"}],
        table_rows,
        note=f"Median peer: P/E {fmt_num(med_pe)}x · P/B {fmt_num(med_pb)}x · ROE {fmt_pct(med_roe)} · yield {fmt_pct(med_yield)}; hijau = lebih baik dari median")
    cheapest = min((row for row in rows if row.get("pe")), key=lambda x: x["pe"], default=None)
    piece.title = f"Median P/E peer {fmt_num(med_pe)}x; {cheapest['symbol'] if cheapest else '—'} {fmt_num(cheapest['pe']) if cheapest else '—'}x termurah di set ini"
    piece.kpis = [ch.kpi("Peer count", str(len(rows))), ch.kpi("Median P/E", f"{fmt_num(med_pe)}x"),
                  ch.kpi("Median ROE", fmt_pct(med_roe)), ch.kpi("Median yield", fmt_pct(med_yield))]
    piece.narrative = f"Set {len(rows)} peer ({', '.join(row['symbol'] for row in rows)}). " + piece.title + "."
    piece.facts = [piece.title, f"Median ROE peer {fmt_pct(med_roe)}, median yield {fmt_pct(med_yield)}"]
    piece.evidence.append(ev(ctx, "Screener universe (peer set)", "screener",
                             {"symbols": [row["symbol"] for row in rows], "median_pe": med_pe, "median_pb": med_pb,
                              "median_roe": med_roe, "median_yield": med_yield, "rows": table_rows}))
    return piece


def b_segments(ctx: RunContext, io: str = "IO-09") -> Piece:
    piece = Piece(io=io, panel="P2", why="IO-09 · mix segmen pendapatan (100% stacked)")
    sym = syms(ctx)[0] if syms(ctx) else ""
    segs = r(ctx, sym, "segments") or []
    if not segs:
        return empty(piece, "sections=segments tidak tersedia")
    labels = [s.get("segment") for s in segs]
    values = [s.get("share") or 0 for s in segs]
    top = max(segs, key=lambda s: s.get("share") or 0)
    piece.chart = ch.stacked_bar([sym], [{"name": l, "data": [v], "color": ch.PALETTE[i % len(ch.PALETTE)]}
                                          for i, (l, v) in enumerate(zip(labels, values))], height=200)
    piece.title = f"Segmen {top.get('segment')} kini {fmt_pct(top.get('share'))} pendapatan {sym}"
    piece.narrative = f"Mix {sym}: " + ", ".join(f"{l} {fmt_pct(v)}" for l, v in zip(labels, values)) + "."
    piece.facts = [piece.title, piece.narrative]
    piece.kpis = [ch.kpi(l, fmt_pct(v)) for l, v in zip(labels, values)][:4]
    piece.evidence.append(ev(ctx, f"{sym} segment mix", f"report:{sym}", {"segments": segs}))
    return piece


def b_freshness(ctx: RunContext, io: str = "IO-10") -> Piece:
    piece = Piece(io=io, panel="P1", why="IO-10 · siapa sudah/belum rilis LK terbaru")
    payload = ctx.value("qdates") or {}
    latest = payload.get("latest_period")
    rows = list(payload.get("companies") or [])
    own = []
    for sym in syms(ctx):
        dates = (ctx.value(f"qdates_sym:{sym}") or {}).get("dates") or []
        last = max((d.get("report_date") or "" for d in dates), default="")
        if last:
            own.append({"symbol": sym, "period": dates[0].get("period"), "report_date": last})
    if syms(ctx) and own:
        target = own
        latest = latest or own[0].get("period")
    elif syms(ctx):
        target = [row for row in rows if row["symbol"] in syms(ctx)]
    else:
        target = rows
    if not target:
        return empty(piece, "quarterly-dates tidak tersedia")
    dates = sorted(row.get("report_date") or "" for row in target)
    newest = dates[-1] if dates else None
    laggards = [row for row in target if (row.get("report_date") or "") < (newest or "")]
    piece.table = ch.table(
        [{"key": "symbol", "label": "Emiten"}, {"key": "period", "label": "Kuartal"},
         {"key": "report_date", "label": "Tanggal rilis", "align": "right", "format": "date"}],
        [{"symbol": row["symbol"], "period": row.get("period"), "report_date": row.get("report_date")} for row in target])
    piece.kpis = [ch.kpi("Emiten", str(len(target))), ch.kpi("Rilis terbaru", fmt_date_short(newest)),
                  ch.kpi("Belum rilis", str(len(laggards)), tone="warn" if laggards else "neutral")]
    piece.title = f"{len(laggards)} dari {len(target)} emiten belum rilis {latest} (flag telat lapor)" if laggards else f"Semua {len(target)} emiten sudah rilis {latest}"
    piece.narrative = piece.title + (f": {', '.join(row['symbol'] for row in laggards[:6])}" if laggards else "")
    piece.facts = [piece.title]
    piece.evidence.append(ev(ctx, "Latest quarterly dates", "qdates", {"latest_period": latest, "laggards": [row["symbol"] for row in laggards]}))
    return piece


# ================================================================= P3 Pasar & Momentum
def b_price_history(ctx: RunContext, io: str = "IO-16") -> Piece:
    piece = Piece(io=io, panel="P3", why="IO-16 · grafik harga terindeks (base 100) + overlay event")
    series, kpis, markers_used = [], [], False
    adv_by_sym = {}
    for i, sym in enumerate(syms(ctx)):
        payload = ctx.value(f"daily:{sym}") or {}
        rows = payload.get("daily") or []
        if not rows:
            continue
        idx = index_series(rows)
        series.append({"name": sym, "data": [p["value"] for p in idx], "color": ch.PALETTE[i % len(ch.PALETTE)]})
        adv = adv_value(rows)
        adv_by_sym[sym] = adv
        ret = pct_change(rows[-1].get("close"), rows[0].get("close"))
        kpis.append(ch.kpi(sym, fmt_pct(ret, 1, True), f"ADV {fmt_idr(adv)}", "up" if (ret or 0) >= 0 else "down"))
        piece.evidence.append(ev(ctx, f"{sym} daily 90 hari", f"daily:{sym}",
                                 {"start": rows[0]["date"], "end": rows[-1]["date"], "return_pct": ret, "adv_30d": adv}))
        markers = []
        if not markers_used:
            for action in (ctx.value(f"ca:{sym}") or {}).get("actions", []):
                if action.get("ex_date") and action.get("type") == "dividend":
                    markers.append({"name": "D", "coord": [action["ex_date"], 0], "value": None})
            for filing in (ctx.value(f"filings:{sym}") or {}).get("filings", []):
                if filing.get("action") in ("buy", "sell"):
                    markers.append({"name": "I", "coord": [filing.get("date"), 0]})
        markers_used = True
    if not series:
        return empty(piece, "daily transaction tidak tersedia")
    x = [p["date"] for p in index_series((ctx.value(f"daily:{syms(ctx)[0]}") or {}).get("daily") or [])]
    piece.chart = ch.line(x, series, y_name="indeks (base 100)", x_interval=13, height=320)
    head = syms(ctx)[0]
    ret0 = pct_change(((ctx.value(f"daily:{head}") or {}).get("daily") or [{}])[-1].get("close"),
                      ((ctx.value(f"daily:{head}") or {}).get("daily") or [{}])[0].get("close"))
    piece.title = f"{head} {fmt_pct(ret0, 1, True)} vs awal periode; likuiditas {fmt_idr(adv_by_sym.get(head))}"
    piece.kpis = kpis[:6]
    piece.narrative = " · ".join(f"{s} {fmt_pct(pct_change(((ctx.value(f'daily:{s}') or {}).get('daily') or [{}])[-1].get('close'), ((ctx.value(f'daily:{s}') or {}).get('daily') or [{}])[0].get('close')), 1, True)}" for s in syms(ctx)[:5])
    piece.facts = [piece.title, "Perbandingan apel-ke-apel memakai indeks base 100"]
    return piece


def b_market_snapshot(ctx: RunContext, io: str = "IO-17") -> Piece:
    piece = Piece(io=io, panel="P3", why="IO-17 · heatmap sektoral dari screener (top market cap) + breadth pasar")
    payload = ctx.value("universe") or {}
    rows = payload.get("companies") or payload.get("rows") or []
    if not rows:
        return empty(piece, "snapshot pasar tidak tersedia")
    def change_of(row: dict) -> float:
        if row.get("change_pct") is not None:
            return float(row["change_pct"])
        if row.get("daily_close_change") is not None:
            return round(float(row["daily_close_change"]) * 100, 2)
        if row.get("change_pct_1d") is not None:
            return float(row["change_pct_1d"])
        return 0.0
    by_sector: dict[str, list[float]] = {}
    for row in rows:
        by_sector.setdefault(row.get("sector") or "—", []).append(change_of(row))
    sectors = sorted(by_sector.items(), key=lambda kv: -sum(kv[1]) / len(kv[1]))
    labels = [s for s, _ in sectors]
    values = [round(sum(v) / len(v), 2) for _, v in sectors]
    piece.chart = ch.sector_heatmap(labels, values, height=200)
    best, worst = sectors[0], sectors[-1]
    piece.title = f"{best[0]} {fmt_pct(best[1] and sum(best[1]) / len(best[1]), 2, True)} hijau; {worst[0]} {fmt_pct(sum(worst[1]) / len(worst[1]), 2, True)} merah"
    gainers = sum(1 for row in rows if change_of(row) > 0)
    piece.kpis = [ch.kpi("Emiten", str(len(rows))), ch.kpi("Naik", f"{gainers}", tone="up"),
                  ch.kpi("Turun", f"{len(rows) - gainers}", tone="down")]
    if payload.get("date"):
        piece.kpis.append(ch.kpi("Tanggal", fmt_date_short(payload.get("date"))))
    piece.narrative = piece.title + f" ({gainers} naik / {len(rows) - gainers} turun; top 200 market cap)."
    piece.facts = [piece.title]
    piece.evidence.append(ev(ctx, "Screener snapshot (market cap desc)", "universe", {"date": payload.get("date"), "count": len(rows)}))
    return piece


def b_index_compare(ctx: RunContext, io: str = "IO-18") -> Piece:
    piece = Piece(io=io, panel="P3", why="IO-18 · saham vs IHSG (indeks base 100)")
    idx_payload = ctx.value("index") or {}
    idx_rows = idx_payload.get("daily") or []
    series = []
    if idx_rows:
        series.append({"name": idx_payload.get("symbol", "IHSG"), "data": [p["value"] for p in index_series(idx_rows)],
                       "color": ch.GREY})
    for i, sym in enumerate(syms(ctx)):
        rows = (ctx.value(f"daily:{sym}") or {}).get("daily") or []
        if rows:
            series.append({"name": sym, "data": [p["value"] for p in index_series(rows)], "color": ch.PALETTE[i % len(ch.PALETTE)]})
    if len(series) < 2:
        return empty(piece, "index daily / daily saham tidak tersedia")
    x = [p["date"] for p in index_series(idx_rows)] if idx_rows else [p["date"] for p in index_series((ctx.value(f"daily:{syms(ctx)[0]}") or {}).get("daily") or [])]
    piece.chart = ch.line(x, series, y_name="indeks (base 100)", x_interval=13, height=300)
    ret_idx = pct_change(idx_rows[-1].get("close"), idx_rows[0].get("close")) if idx_rows else None
    rel = []
    for sym in syms(ctx):
        rows = (ctx.value(f"daily:{sym}") or {}).get("daily") or []
        if rows:
            ret = pct_change(rows[-1].get("close"), rows[0].get("close"))
            rel.append((sym, (ret or 0) - (ret_idx or 0)))
    piece.kpis = [ch.kpi("IHSG", fmt_pct(ret_idx, 1, True))] + [ch.kpi(s, fmt_pct(d, 1, True), "vs IHSG", "up" if d >= 0 else "down") for s, d in rel[:4]]
    if rel:
        best = max(rel, key=lambda x: x[1])
        piece.title = f"{best[0]} outperform IHSG {fmt_pct(best[1], 1, True)} dalam 90 hari"
        piece.narrative = " · ".join(f"{s} vs IHSG {fmt_pct(d, 1, True)}" for s, d in rel)
        piece.facts = [piece.title, piece.narrative]
    piece.evidence.append(ev(ctx, "Index daily 90 hari", "index", {"symbol": idx_payload.get("symbol"), "return_pct": ret_idx}))
    for sym in syms(ctx):
        rows = (ctx.value(f"daily:{sym}") or {}).get("daily") or []
        if rows:
            piece.evidence.append(ev(ctx, f"{sym} return 90 hari", f"daily:{sym}",
                                     {"return_pct": pct_change(rows[-1].get("close"), rows[0].get("close"))}))
    return piece


def b_movers(ctx: RunContext, io: str = "IO-19") -> Piece:
    piece = Piece(io=io, panel="P3", why="IO-19 · top gainers/losers + most traded")
    gain = (ctx.value("movers_gain") or {}).get("movers") or []
    lose = (ctx.value("movers_lose") or {}).get("movers") or []
    traded = (ctx.value("most_traded") or {}).get("most_traded") or []
    if not gain and not lose:
        return empty(piece, "movers tidak tersedia")
    rows = gain[:5] + lose[:5]
    piece.chart = ch.diverging_bar([row["symbol"] for row in rows], [row.get("change_pct") for row in rows],
                                   suffix="%", height=300)
    top_traded = traded[0] if traded else None
    piece.title = f"Top gainer {gain[0]['symbol']} {fmt_pct(gain[0].get('change_pct'), 2, True)}" + (
        f"; most traded {top_traded['symbol']} {fmt_idr(top_traded.get('value'))}" if top_traded else "")
    piece.kpis = [ch.kpi("Top gainer", f"{gain[0]['symbol']} {fmt_pct(gain[0].get('change_pct'), 2, True)}", tone="up")] if gain else []
    if lose:
        piece.kpis.append(ch.kpi("Top loser", f"{lose[0]['symbol']} {fmt_pct(lose[0].get('change_pct'), 2, True)}", tone="down"))
    if top_traded:
        piece.kpis.append(ch.kpi("Most traded", f"{top_traded['symbol']}", fmt_idr(top_traded.get("value"))))
    piece.narrative = piece.title + "."
    piece.facts = [piece.title]
    piece.table = ch.table(
        [{"key": "symbol", "label": "Emiten"}, {"key": "change", "label": "Perubahan 1d", "align": "right", "format": "pct"},
         {"key": "sector", "label": "Sektor"}],
        [{"symbol": row["symbol"], "change": row.get("change_pct"), "sector": row.get("sector")} for row in rows])
    piece.evidence.append(ev(ctx, "Top movers 1 hari", "movers_gain", {"gainers": [r["symbol"] for r in gain[:5]], "losers": [r["symbol"] for r in lose[:5]]}))
    if traded:
        piece.evidence.append(ev(ctx, "Most traded", "most_traded", {"top": [(r["symbol"], r.get("value")) for r in traded[:5]]}))
    return piece


def b_ipo(ctx: RunContext, io: str = "IO-20") -> Piece:
    piece = Piece(io=io, panel="P6", why="IO-20 · preseden listing 7/30/90/365 hari")
    rows = (ctx.value("ipo") or {}).get("ipo_performance") or []
    if not rows:
        return empty(piece, "IPO performance tidak tersedia")
    rows_sorted = sorted(rows, key=lambda r: -(r.get("ret_90d") or 0))
    piece.chart = ch.dot_plot([{"label": f"{r['symbol']} · 90h", "value": r.get("ret_90d"),
                                "color": ch.ALT if (r.get("ret_90d") or 0) >= 0 else ch.RED} for r in rows_sorted],
                              suffix="%", height=260)
    med = median([r.get("ret_90d") for r in rows])
    piece.title = f"IPO median {fmt_pct(med, 1, True)} di 90 hari (preseden, bukan jaminan)"
    piece.kpis = [ch.kpi("IPO dianalisis", str(len(rows))), ch.kpi("Median 90h", fmt_pct(med, 1, True)),
                  ch.kpi("Median 365h", fmt_pct(median([r.get("ret_365d") for r in rows]), 1, True))]
    piece.narrative = piece.title + ": " + " · ".join(f"{r['symbol']} {fmt_pct(r.get('ret_90d'), 1, True)}" for r in rows_sorted[:5])
    piece.facts = [piece.title]
    piece.table = ch.table(
        [{"key": "symbol", "label": "Emiten"}, {"key": "sector", "label": "Sektor"},
         {"key": "r7", "label": "7h", "align": "right", "format": "pct"}, {"key": "r30", "label": "30h", "align": "right", "format": "pct"},
         {"key": "r90", "label": "90h", "align": "right", "format": "pct"}, {"key": "r365", "label": "365h", "align": "right", "format": "pct"}],
        [{"symbol": r["symbol"], "sector": r.get("sector"), "r7": r.get("ret_7d"), "r30": r.get("ret_30d"),
          "r90": r.get("ret_90d"), "r365": r.get("ret_365d")} for r in rows_sorted])
    piece.evidence.append(ev(ctx, "IPO listing performance", "ipo", {"median_90d": med, "rows": len(rows)}))
    return piece


# ================================================================= P4 Flow & Kepemilikan
def b_flow(ctx: RunContext, io: str = "IO-21") -> Piece:
    piece = Piece(io=io, panel="P4", why="IO-21 · diverging bar beli-vs-jual broker + net kumulatif")
    sym = syms(ctx)[0] if syms(ctx) else ""
    payload = ctx.value(f"broker_summary:{sym}") or {}
    brokers = payload.get("brokers") or []
    if not brokers:
        return empty(piece, "broker summary tidak tersedia")
    ranked = sorted(brokers, key=lambda b: -(b.get("buy_value") or 0))[:6]
    piece.chart = ch.diverging_bar([f"{b['broker']} · {b.get('type', '')}" for b in ranked],
                                   [b.get("net_value") for b in ranked], suffix="", height=280)
    top = max(brokers, key=lambda b: b.get("net_value") or 0)
    bottom = min(brokers, key=lambda b: b.get("net_value") or 0)
    conc = top_share([b.get("buy_value") or 0 for b in brokers], 3)
    piece.kpis = [ch.kpi("Akumulasi", f"{top['broker']} {fmt_idr(top.get('net_value'))}", top.get("broker_name", ""), "up"),
                  ch.kpi("Distribusi", f"{bottom['broker']} {fmt_idr(bottom.get('net_value'))}", bottom.get("broker_name", ""), "down"),
                  ch.kpi("Top-3 share", fmt_pct(conc), "konsentrasi beli", "warn" if (conc or 0) > 70 else "neutral")]
    piece.title = f"{top['broker']} akumulasi {fmt_idr(top.get('net_value'))} di {sym}; {bottom['broker']} distribusi {fmt_idr(bottom.get('net_value'))}"
    piece.narrative = piece.title + f". Konsentrasi top-3 broker {fmt_pct(conc)} dari sisi beli."
    piece.facts = [piece.title, f"Konsentrasi broker top-3 {fmt_pct(conc)}"]
    piece.table = ch.table(
        [{"key": "broker", "label": "Broker"}, {"key": "name", "label": "Nama"}, {"key": "type", "label": "Tipe"},
         {"key": "buy", "label": "Beli", "align": "right", "format": "idr"},
         {"key": "sell", "label": "Jual", "align": "right", "format": "idr"},
         {"key": "net", "label": "Net", "align": "right", "format": "idr"}],
        [{"broker": b["broker"], "name": b.get("broker_name"), "type": b.get("type"), "buy": b.get("buy_value"),
          "sell": b.get("sell_value"), "net": b.get("net_value")} for b in ranked])
    piece.evidence.append(ev(ctx, f"{sym} broker summary", f"broker_summary:{sym}",
                             {"top_buyer": top["broker"], "top_buyer_net": top.get("net_value"),
                              "top_seller": bottom["broker"], "top_seller_net": bottom.get("net_value"),
                              "top3_share": conc}))
    return piece


def b_broker_behavior(ctx: RunContext, io: str = "IO-22") -> Piece:
    piece = Piece(io=io, panel="P4", why="IO-22 · pola broker lintas saham (heatmap broker × saham)")
    payload = ctx.value("broker_activity") or {}
    activity = payload.get("activity") or []
    if not activity:
        return empty(piece, "broker activity tidak tersedia")
    rows = activity[:10]
    broker_label = payload.get("broker", "broker")
    piece.chart = ch.diverging_bar([r["symbol"] for r in rows], [r.get("net_value") for r in rows], height=280)
    top = max(rows, key=lambda r: r.get("net_value") or 0)
    piece.title = f"Broker {broker_label} paling agresif di {top['symbol']} ({fmt_idr(top.get('net_value'))})"
    piece.narrative = piece.title + ". Pola ini dasar analisis bandarmologi, bukan rekomendasi ikut posisi."
    piece.kpis = [ch.kpi("Broker", broker_label), ch.kpi("Saham dipantau", str(len(rows))),
                  ch.kpi("Net terbesar", fmt_idr(top.get("net_value")))]
    piece.facts = [piece.title]
    piece.evidence.append(ev(ctx, f"Aktivitas broker {broker_label}", "broker_activity", {"rows": rows[:6]}))
    return piece


def b_broker_landscape(ctx: RunContext, io: str = "IO-23") -> Piece:
    piece = Piece(io=io, panel="P4", why="IO-23 · kohort broker (asing/domestik) + ranking harian")
    registry = (ctx.value("broker_registry") or {}).get("registry") or {}
    daily = (ctx.value("broker_top") or {}).get("brokers") or []
    if not registry:
        return empty(piece, "broker registry tidak tersedia")
    cohort: dict[str, float] = {}
    for row in daily:
        broker = registry.get(row.get("broker"), {})
        key = broker.get("type", "lainnya")
        cohort[key] = cohort.get(key, 0) + (row.get("buy_value") or 0)
    labels = list(cohort.keys())
    values = [round(v / 1e12, 2) for v in cohort.values()]
    piece.chart = ch.donut([f"{k} (Rp T)" for k in labels], values, height=250, suffix=" T", center="turnover")
    top_daily = sorted(daily, key=lambda r: -(r.get("net_value") or 0))[:5]
    piece.title = f"Turnover {labels[0]} {fmt_pct(safe_div(cohort[labels[0]], sum(cohort.values())) * 100 if sum(cohort.values()) else None)}; top net {top_daily[0]['broker'] if top_daily else '—'}"
    piece.kpis = [ch.kpi(k, f"Rp{fmt_num(v)} T") for k, v in zip(labels, values)][:4]
    piece.narrative = "Komposisi turnover: " + ", ".join(f"{k} Rp{fmt_num(v)} T" for k, v in zip(labels, values)) + "."
    piece.facts = [piece.title]
    piece.table = ch.table(
        [{"key": "broker", "label": "Broker"}, {"key": "name", "label": "Nama"}, {"key": "type", "label": "Tipe"},
         {"key": "buy", "label": "Beli", "align": "right", "format": "idr"}, {"key": "net", "label": "Net", "align": "right", "format": "idr"}],
        [{"broker": r.get("broker"), "name": r.get("broker_name"), "type": r.get("type"),
          "buy": r.get("buy_value"), "net": r.get("net_value")} for r in top_daily])
    total_cohort = sum(cohort.values()) or 1
    shares = {k: round(v / total_cohort * 100, 2) for k, v in cohort.items()}
    piece.evidence.append(ev(ctx, "Broker registry + top brokers", "broker_registry",
                             {"cohort": cohort, "shares_pct": shares, "top": top_daily[:5],
                              "turnover_t": {k: round(v / 1e12, 2) for k, v in cohort.items()}}))
    return piece


def b_foreign_flow(ctx: RunContext, io: str = "IO-24") -> Piece:
    piece = Piece(io=io, panel="P4", why="IO-24 · net asing harian + kumulatif (per emiten scope)")
    payload = ctx.value("foreign") or {}
    per = dict(payload.get("per_symbol") or {})
    for sym in syms(ctx):
        sub = (ctx.value(f"foreign:{sym}") or {}).get("per_symbol") or {}
        per.update(sub)
    series_rows, kpis = [], []
    for sym, rows in per.items():
        if not rows:
            continue
        net5 = net_sum(rows, "net", 5)
        net1 = rows[-1].get("net") or 0
        kpis.append(ch.kpi(sym, fmt_idr(net5), f"hari ini {fmt_idr(net1)}", "up" if net5 >= 0 else "down"))
        series_rows.append((sym, rows, net5))
        piece.evidence.append(ev(ctx, f"{sym} foreign flow 14 hari", "foreign",
                                 {"net_5d": net5, "net_1d": net1, "net_5d_abs": abs(net5), "net_1d_abs": abs(net1),
                                  "foreign_pct": rows[-1].get("foreign_pct")}))
    if not series_rows:
        return empty(piece, "foreign flow tidak tersedia (butuh symbols)")
    sym0, rows0, net5_0 = series_rows[0]
    cumulative, acc = [], 0.0
    for row in rows0:
        acc += row.get("net") or 0
        cumulative.append(round(acc / 1e12, 3))
    piece.chart = ch.combo_bar_line([row.get("date") for row in rows0],
                                    {"name": f"Net harian {sym0} (Rp T)", "data": [round((row.get('net') or 0) / 1e12, 3) for row in rows0]},
                                    {"name": "Kumulatif (Rp T)", "data": cumulative},
                                    suffix_bar="", suffix_line="", y_left="Rp T", y_right="Rp T", height=300)
    piece.title = f"Asing {'net sell' if net5_0 < 0 else 'net buy'} {fmt_idr(abs(net5_0))} di {sym0} (5 hari)"
    piece.kpis = kpis[:6]
    piece.narrative = " · ".join(f"{s} net 5 hari {fmt_idr(v)}" for s, _, v in series_rows[:5])
    piece.facts = [piece.title, piece.narrative]
    return piece