"""Pipelines chunk 2: P5 Event & Governance, P6 Peer & Sektor, P7 Tambang & Regional, P8 Risiko."""
from __future__ import annotations

from typing import Any

from . import charts as ch
from . import rules
from .compute import fmt_date_short, fmt_idr, fmt_num, fmt_pct, median, net_sum, pct_change, top_share
from .executor import RunContext
from .pipelines_core import Piece, empty, ev, has, q, r, syms


def _days_to(date_str: str | None) -> int | None:
    if not date_str:
        return None
    from datetime import date
    try:
        d = date.fromisoformat(date_str[:10])
        return (d - date.today()).days
    except ValueError:
        return None


# ================================================================= P5 Event & Governance
def b_corp_actions(ctx: RunContext, io: str = "IO-25") -> Piece:
    piece = Piece(io=io, panel="P5", why="IO-25 · timeline cum → ex → payment + kalender pasar")
    events, rows = [], []
    for sym in syms(ctx):
        for action in (ctx.value(f"ca:{sym}") or {}).get("actions", []):
            events.append({"symbol": sym, **action})
            rows.append({"symbol": sym, "type": action.get("type"), "ex": action.get("ex_date"),
                         "cum": action.get("cum_date"), "pay": action.get("payment_date"),
                         "amount": action.get("amount"), "status": action.get("status")})
            piece.evidence.append(ev(ctx, f"{sym} aksi korporasi", f"ca:{sym}", action))
    dividends = [e for e in events if e.get("type") == "dividend" and e.get("ex_date")]
    if not events:
        return empty(piece, "corporate actions tidak tersedia")
    dividends.sort(key=lambda e: e["ex_date"])
    nearest = dividends[0] if dividends else None
    if nearest:
        days = _days_to(nearest.get("ex_date"))
        piece.kpis = [ch.kpi("Ex-date terdekat", f"{nearest['symbol']} · {fmt_date_short(nearest['ex_date'])}",
                             f"{days} hari lagi" if days is not None else None, "warn" if (days or 99) <= 7 else "neutral"),
                      ch.kpi("Total aksi", str(len(events))),
                      ch.kpi("Dividen", str(len(dividends)))]
        piece.title = f"Ex-date dividen {nearest['symbol']} {fmt_date_short(nearest['ex_date'])} ({days} hari lagi)"
    else:
        piece.title = f"{len(events)} aksi korporasi terpantau"
    piece.items = [{"kind": "timeline", "symbol": e["symbol"], "date": e.get("ex_date") or e.get("cum_date"),
                    "label": e.get("type"), "detail": e.get("description") or "",
                    "amount": e.get("amount")} for e in events[:10]]
    piece.table = ch.table(
        [{"key": "symbol", "label": "Emiten"}, {"key": "type", "label": "Jenis"},
         {"key": "cum", "label": "Cum", "format": "date"}, {"key": "ex", "label": "Ex", "format": "date"},
         {"key": "pay", "label": "Bayar", "format": "date"}, {"key": "amount", "label": "Nilai", "align": "right", "format": "idr"}],
        rows[:14])
    piece.narrative = piece.title + ". Cum-date = hari terakhir beli agar berhak atas dividen."
    piece.facts = [piece.title, "Cum-date adalah hari terakhir pembelian agar berhak dividen"]
    return piece


def b_insider(ctx: RunContext, io: str = "IO-26") -> Piece:
    piece = Piece(io=io, panel="P5", why="IO-26 · transaksi insider dari keterbukaan informasi IDX")
    rows, sells, buys = [], 0, 0
    for sym in syms(ctx):
        for filing in (ctx.value(f"filings:{sym}") or {}).get("filings", []):
            if filing.get("type") != "insider":
                continue
            rows.append({"symbol": sym, **filing})
            if filing.get("action") == "sell":
                sells += 1
            elif filing.get("action") == "buy":
                buys += 1
            piece.evidence.append(ev(ctx, f"{sym} filing insider", f"filings:{sym}", filing))
    if not rows:
        return empty(piece, "filings insider tidak tersedia")
    rows.sort(key=lambda x: x.get("date") or "", reverse=True)
    top_sell = max((row for row in rows if row.get("action") == "sell"), key=lambda x: x.get("value") or 0, default=None)
    piece.kpis = [ch.kpi("Insider beli", str(buys), tone="up"), ch.kpi("Insider jual", str(sells), tone="down")]
    if top_sell:
        piece.kpis.append(ch.kpi("Terbesar", f"{top_sell['symbol']} {fmt_idr(top_sell.get('value'))}", top_sell.get("person", ""), "down"))
        piece.title = f"{top_sell.get('person', 'Insider')} jual {fmt_idr(top_sell.get('value'))} di {top_sell['symbol']}"
    else:
        piece.title = f"{buys} transaksi insider beli terpantau"
    piece.table = ch.table(
        [{"key": "date", "label": "Tanggal", "format": "date"}, {"key": "symbol", "label": "Emiten"},
         {"key": "person", "label": "Pihak"}, {"key": "action", "label": "Aksi"},
         {"key": "value", "label": "Nilai", "align": "right", "format": "idr"}],
        [{"date": row.get("date"), "symbol": row["symbol"], "person": row.get("person"),
          "action": row.get("action"), "value": row.get("value")} for row in rows[:12]])
    piece.narrative = piece.title + ". Insider jual bukan otomatis sinyal negatif, tetapi wajib dicek konteksnya."
    piece.facts = [piece.title]
    return piece


def b_suspension(ctx: RunContext, io: str = "IO-27") -> Piece:
    piece = Piece(io=io, panel="P5", why="IO-27 · riwayat suspensi/UMA + alasan + PDF IDX")
    rows, active = [], []
    if syms(ctx):
        for sym in syms(ctx):
            for s in (ctx.value(f"susp:{sym}") or {}).get("suspensions", []):
                rows.append({"symbol": sym, **s})
                if s.get("active"):
                    active.append((sym, s))
                piece.evidence.append(ev(ctx, f"{sym} suspensi", f"susp:{sym}", s))
    else:
        payload = ctx.value("susp_all") or {}
        rows = payload.get("suspensions") or []
    if not rows:
        piece.title = "0 suspensi tercatat di scope ini"
        piece.kpis = [ch.kpi("Suspensi", "0", tone="up")]
        piece.narrative = "Tidak ada suspensi tercatat untuk emiten dalam scope — likuiditas tidak terganggu suspensi."
        piece.table = ch.table([{"key": "symbol", "label": "Emiten"}], [])
        piece.facts = [piece.title]
        return piece
    piece.kpis = [ch.kpi("Riwayat", str(len(rows))), ch.kpi("Aktif", str(len(active)), tone="warn" if active else "up")]
    if active:
        sym0, s0 = active[0]
        days = _days_to(s0.get("start"))
        piece.title = f"{sym0} disuspensi {(abs(days) if days is not None else '—')} hari lalu: {s0.get('reason', '—')}"
        piece.kpis.append(ch.kpi("Sejak", fmt_date_short(s0.get("start")), "masih aktif", "down"))
    else:
        piece.title = f"{len(rows)} riwayat suspensi (tidak ada yang aktif)"
    piece.narrative = piece.title + ". Suspensi memengaruhi likuiditas dan kelayakan agunan/margin."
    piece.facts = [piece.title]
    piece.table = ch.table(
        [{"key": "symbol", "label": "Emiten"}, {"key": "start", "label": "Mulai", "format": "date"},
         {"key": "end", "label": "Selesai", "format": "date"}, {"key": "reason", "label": "Alasan"},
         {"key": "active", "label": "Status", "format": "bool"}],
        [{"symbol": row["symbol"], "start": row.get("start"), "end": row.get("end") or "—",
          "reason": row.get("reason"), "active": bool(row.get("active"))} for row in rows])
    return piece


def b_news(ctx: RunContext, io: str = "IO-28") -> Piece:
    piece = Piece(io=io, panel="P5", why="IO-28 · berita per emiten + tag")
    rows = []
    for sym in syms(ctx):
        for n in (ctx.value(f"news:{sym}") or {}).get("news", []):
            rows.append({"symbol": sym, **n})
            piece.evidence.append(ev(ctx, f"{sym} berita", f"news:{sym}", n))
    if not rows:
        return empty(piece, "news tidak tersedia")
    rows.sort(key=lambda x: x.get("date") or "", reverse=True)
    tag_count: dict[str, int] = {}
    for row in rows:
        for tag in row.get("tags", []):
            tag_count[tag] = tag_count.get(tag, 0) + 1
    top_tags = sorted(tag_count.items(), key=lambda kv: -kv[1])[:3]
    piece.title = f"{len(rows)} berita terpantau; tag dominan {', '.join(t for t, _ in top_tags) or '—'}"
    piece.kpis = [ch.kpi("Berita", str(len(rows)))] + [ch.kpi(f"#{t}", str(c)) for t, c in top_tags]
    piece.items = [{"kind": "news", "symbol": row["symbol"], "date": row.get("date"), "title": row.get("title"),
                    "source": row.get("source"), "url": row.get("url"), "tags": row.get("tags")} for row in rows[:10]]
    piece.narrative = piece.title + ". Feed ini konteks, bukan pemicu keputusan otomatis."
    piece.facts = [piece.title]
    return piece


# ================================================================= P6 Peer & Sektor
def b_screener(ctx: RunContext, io: str = "IO-11") -> Piece:
    piece = Piece(io=io, panel="P6", why="IO-11 · screener terstruktur (hasil compiler NL→where)")
    payload = ctx.value("screener_query") or {}
    rows = payload.get("companies") or []
    compiler = ctx.plan.compiler or {}
    criteria = compiler.get("where")
    if not rows:
        return empty(piece, "screener tidak mengembalikan hasil")
    points = [{"symbol": row["symbol"], "x": row.get("pe"), "y": row.get("roe"), "size": row.get("market_cap"),
               "color": ch.ALT if (row.get("roe") or 0) > 15 else ch.FOCUS}
              for row in rows if row.get("pe") and row.get("roe")]
    roes = [p["y"] for p in points]
    med_roe = median(roes)
    y_max = None
    outliers: list[str] = []
    if med_roe and roes and max(roes) > 3 * med_roe and max(roes) > 60:
        y_max = round(med_roe * 2.5, 0)
        outliers = [p["symbol"] for p in points if p["y"] > (y_max or 0)]
        points = [p for p in points if p["y"] <= (y_max or 0)]
    piece.chart = ch.scatter(points, x_name="P/E (x)", y_name="ROE (%)", height=320, y_max=y_max)
    top = max(rows, key=lambda x: x.get("roe") or 0)
    piece.title = f"{len(rows)} emiten lolos kriteria; ROE tertinggi {top['symbol']} {fmt_pct(top.get('roe'))}"
    piece.kpis = [ch.kpi("Lolos", str(payload.get("total", len(rows)))),
                  ch.kpi("Median P/E", f"{fmt_num(median([r.get('pe') for r in rows]))}x"),
                  ch.kpi("Median ROE", fmt_pct(median([r.get('roe') for r in rows]))),
                  ch.kpi("Median yield", fmt_pct(median([r.get('dividend_yield') for r in rows])))]
    crit_text = "tanpa filter" if not criteria else ", ".join(f"{k} {list(v.keys())[0]} {list(v.values())[0]}" if isinstance(v, dict) else f"{k}={v}" for k, v in criteria.items())
    piece.narrative = f"Kriteria: {crit_text}. " + piece.title + "."
    piece.facts = [piece.title, f"Kriteria screener: {crit_text}"]
    piece.table = ch.table(
        [{"key": "symbol", "label": "Emiten"}, {"key": "name", "label": "Nama"},
         {"key": "pe", "label": "P/E", "align": "right", "format": "x"}, {"key": "pb", "label": "P/B", "align": "right", "format": "x"},
         {"key": "roe", "label": "ROE", "align": "right", "format": "pct"}, {"key": "der", "label": "DER", "align": "right", "format": "x"},
         {"key": "yield", "label": "Yield", "align": "right", "format": "pct"}, {"key": "float", "label": "Float", "align": "right", "format": "pct"}],
        [{"symbol": row["symbol"], "name": row["name"], "pe": row.get("pe"), "pb": row.get("pb"), "roe": row.get("roe"),
          "der": row.get("der"), "yield": row.get("dividend_yield"), "float": row.get("free_float_pct")} for row in rows],
        note=f"Compiler: {compiler.get('compiler', '—')} · 1 kredit (terstruktur), bukan NL q 3 kredit")
    if outliers:
        piece.chart["graphic"] = [{"type": "text", "right": 8, "top": 4,
                                   "style": {"text": f"di luar skala: {', '.join(outliers)} (lihat tabel)",
                                             "fontSize": 10, "fill": ch.WARN}}]
        piece.facts.append(f"Outlier di luar skala chart: {', '.join(outliers)} — nilainya ada di tabel")
    piece.evidence.append(ev(ctx, "Screener hasil terstruktur", "screener_query",
                             {"count": len(rows), "criteria": criteria,
                              "metrics": [{k: row.get(k) for k in ("symbol", "pe", "pb", "roe", "der", "dividend_yield", "free_float_pct")} for row in rows]}))
    return piece


def b_rank(ctx: RunContext, io: str = "IO-12") -> Piece:
    piece = Piece(io=io, panel="P6", why="IO-12 · ranking yield/ROE + garis median")
    div_rows = _rows_value((ctx.value("rank_div") or {}).get("companies") or [], "dividend_yield")
    roe_rows = _rows_value((ctx.value("rank_roe") or {}).get("companies") or [], "roe")
    if not div_rows and not roe_rows:
        return empty(piece, "ranking tidak tersedia")
    top = div_rows[:10]
    med = median([row.get("value") for row in top])
    piece.chart = ch.bar([row["symbol"] for row in top], [row.get("value") for row in top],
                         horizontal=True, suffix="%", name="Dividend yield", threshold=med, height=320)
    piece.title = f"Top yield: {top[0]['symbol']} {fmt_pct(top[0].get('value'))}" if top else "Ranking yield"
    piece.kpis = [ch.kpi("Top yield", f"{top[0]['symbol']} {fmt_pct(top[0].get('value'))}", tone="up") if top else ch.kpi("Top yield", "—"),
                  ch.kpi("Median top-10", fmt_pct(med))]
    if roe_rows:
        piece.kpis.append(ch.kpi("Top ROE", f"{roe_rows[0]['symbol']} {fmt_pct(roe_rows[0].get('value'))}", tone="up"))
    piece.narrative = piece.title + (f"; top ROE {roe_rows[0]['symbol']} {fmt_pct(roe_rows[0].get('value'))}" if roe_rows else "") + ". Ranking memakai data terstruktur Sectors, bukan estimasi."
    piece.facts = [piece.title]
    piece.table = ch.table(
        [{"key": "symbol", "label": "Emiten"}, {"key": "value", "label": "Yield", "align": "right", "format": "pct"}],
        [{"symbol": row["symbol"], "value": row.get("value")} for row in top])
    piece.evidence.append(ev(ctx, "Top ranked dividend yield", "rank_div", {"top": [(row["symbol"], row.get("value")) for row in top]}))
    return piece


def _rows_value(rows: list[dict], field: str) -> list[dict]:
    out = []
    for row in rows:
        value = row.get("value")
        if value is None:
            value = row.get(field)
        if value is None:
            continue
        out.append({**row, "value": value})
    return out


def b_growth(ctx: RunContext, io: str = "IO-13") -> Piece:
    piece = Piece(io=io, panel="P6", why="IO-13 · leaders vs laggards pertumbuhan laba")
    rows = _rows_value((ctx.value("growth") or {}).get("companies") or [], "earnings_growth_yoy")
    if not rows:
        return empty(piece, "top growth tidak tersedia")
    leaders = rows[:6]
    laggards = rows[-6:]
    categories = [row["symbol"] for row in leaders] + [row["symbol"] for row in laggards]
    values = [row.get("value") for row in leaders] + [row.get("value") for row in laggards]
    piece.chart = ch.diverging_bar(categories, values, suffix="%", height=300)
    piece.title = f"Leader {leaders[0]['symbol']} {fmt_pct(leaders[0].get('value'), 1, True)}; laggard {laggards[-1]['symbol']} {fmt_pct(laggards[-1].get('value'), 1, True)}"
    piece.kpis = [ch.kpi("Leader", f"{leaders[0]['symbol']} {fmt_pct(leaders[0].get('value'), 1, True)}", tone="up"),
                  ch.kpi("Laggard", f"{laggards[-1]['symbol']} {fmt_pct(laggards[-1].get('value'), 1, True)}", tone="down")]
    piece.narrative = piece.title + " (pertumbuhan laba YoY)."
    piece.facts = [piece.title]
    piece.evidence.append(ev(ctx, "Top growth earnings YoY", "growth", {"leaders": [r["symbol"] for r in leaders], "laggards": [r["symbol"] for r in laggards]}))
    return piece


def b_free_float(ctx: RunContext, io: str = "IO-14") -> Piece:
    piece = Piece(io=io, panel="P4", why="IO-14 · float vs ambang BEI 7,5% + likuiditas")
    payload = ctx.value("float") or {}
    rows = payload.get("companies") or []
    if not rows:
        return empty(piece, "free float tidak tersedia")
    target = [row for row in rows if row["symbol"] in syms(ctx)] if syms(ctx) else rows
    if not target:
        target = rows
    target = sorted(target, key=lambda x: x.get("free_float_pct") or 0)[:14]
    below = [row for row in target if (row.get("free_float_pct") or 100) < 7.5]
    piece.chart = ch.bar([row["symbol"] for row in target], [row.get("free_float_pct") for row in target],
                         suffix="%", name="Free float", threshold=7.5, height=280)
    piece.title = f"{len(below)} emiten berfloat di bawah ambang 7,5%" if below else "Semua emiten scope berfloat di atas ambang 7,5%"
    piece.kpis = [ch.kpi("Di bawah ambang", str(len(below)), tone="warn" if below else "up"),
                  ch.kpi("Median float", fmt_pct(median([row.get("free_float_pct") for row in target])))]
    if below:
        piece.kpis.append(ch.kpi("Terendah", f"{below[0]['symbol']} {fmt_pct(below[0].get('free_float_pct'))}", tone="warn"))
    piece.narrative = piece.title + ". Float kecil = risiko likuiditas dan kelayakan agunan/margin."
    piece.facts = [piece.title]
    piece.evidence.append(ev(ctx, "Free float universe", "float",
                             {"below_threshold": [row["symbol"] for row in below], "threshold": 7.5,
                              "median_float": median([row.get("free_float_pct") for row in target]),
                              "rows": [{"symbol": row["symbol"], "free_float_pct": row.get("free_float_pct")} for row in target]}))
    return piece


def b_sector_map(ctx: RunContext, io: str = "IO-15") -> Piece:
    piece = Piece(io=io, panel="P6", why="IO-15 · peta klasifikasi subsektor untuk peer set")
    payload = ctx.value("helpers") or {}
    subsectors = payload.get("subsectors") or {}
    if not subsectors:
        return empty(piece, "helpers subsectors tidak tersedia")
    items = [{"kind": "sector", "label": name, "symbols": data.get("symbols", [])} for name, data in subsectors.items()]
    focus = None
    for sym in syms(ctx):
        for name, data in subsectors.items():
            if sym in data.get("symbols", []):
                focus = name
                break
        if focus:
            break
    piece.title = f"Peer set {focus}: {len(next((d['symbols'] for n, d in subsectors.items() if n == focus), []))} emiten" if focus else f"{len(subsectors)} subsektor terpetakan"
    piece.kpis = [ch.kpi("Subsektor", str(len(subsectors))),
                  ch.kpi("Fokus", focus or "—")] if focus else [ch.kpi("Subsektor", str(len(subsectors)))]
    piece.items = items[:12]
    piece.narrative = "Klasifikasi resmi dipakai sebagai dasar peer set yang transparan dan bisa diaudit."
    piece.facts = [piece.title]
    piece.evidence.append(ev(ctx, "Helpers subsectors", "helpers", {"count": len(subsectors)}))
    return piece


def b_sector_report(ctx: RunContext, io: str = "IO-29") -> Piece:
    piece = Piece(io=io, panel="P6", why="IO-29 · kartu sektor: valuasi agregat + top constituents")
    payload = ctx.value("subsector") or {}
    if not payload or not payload.get("companies"):
        return empty(piece, "subsector report tidak tersedia")
    rows = payload["companies"]
    piece.chart = ch.bar([row["symbol"] for row in payload.get("top5", [])],
                         [row.get("pe") for row in payload.get("top5", [])], suffix="x", name="P/E", threshold=payload.get("median_pe"),
                         height=240)
    piece.title = f"P/E sektor {payload.get('name')} median {fmt_num(payload.get('median_pe'))}x; {len(rows)} emiten"
    piece.kpis = [ch.kpi("Emiten", str(payload.get("count"))), ch.kpi("Median P/E", f"{fmt_num(payload.get('median_pe'))}x"),
                  ch.kpi("Rata-rata P/E", f"{fmt_num(payload.get('avg_pe'))}x"),
                  ch.kpi("Market cap", fmt_idr(payload.get("total_market_cap")))]
    piece.narrative = piece.title + f". Konstituen terbesar: {', '.join(row['symbol'] for row in payload.get('top5', [])[:5])}."
    piece.facts = [piece.title]
    piece.evidence.append(ev(ctx, f"Subsector report {payload.get('slug')}", "subsector",
                             {"median_pe": payload.get("median_pe"), "count": payload.get("count")}))
    return piece


# ================================================================= P7 Tambang & Regional
def b_mining_dossier(ctx: RunContext, io: str = "IO-30") -> Piece:
    piece = Piece(io=io, panel="P7", why="IO-30 · profil, produksi, biaya, finansial tambang")
    miners = [s for s in syms(ctx) if has(ctx, f"mining_detail:{s}")]
    if not miners and syms(ctx):
        miners = [s for s in syms(ctx) if has(ctx, f"mining_fin:{s}")]
    if not miners:
        return empty(piece, "bukan emiten tambang / data mining tidak tersedia")
    focus = miners[0]
    detail = ctx.value(f"mining_detail:{focus}") or {}
    prod = (ctx.value(f"mining_prod:{focus}") or {}).get("production") or []
    fin = (ctx.value(f"mining_fin:{focus}") or {}).get("financials") or {}
    if prod:
        years = [str(row["year"]) for row in prod]
        vols = [row.get("volume_mt") for row in prod]
        piece.chart = ch.line(years, [{"name": "Produksi (Mt)", "data": vols, "color": ch.FOCUS}],
                              y_name="Mt", suffix="", height=260)
        latest = prod[-1]
        growth = pct_change(latest.get("volume_mt"), prod[0].get("volume_mt"))
        piece.title = f"Produksi {focus} {fmt_num(latest.get('volume_mt'))} Mt ({fmt_pct(growth, 1, True)} vs 2021); cash cost {fmt_num(latest.get('cash_cost_usd'))} USD/t"
        piece.kpis = [ch.kpi("Produksi", f"{fmt_num(latest.get('volume_mt'))} Mt", f"{fmt_pct(growth, 1, True)} vs 2021", "up" if (growth or 0) >= 0 else "down"),
                      ch.kpi("Strip ratio", fmt_num(latest.get("strip_ratio"))),
                      ch.kpi("Cash cost", f"US${fmt_num(latest.get('cash_cost_usd'))}/t"),
                      ch.kpi("Komoditas", detail.get("commodity", "—"))]
        piece.narrative = piece.title + "."
        piece.facts = [piece.title]
        piece.evidence.append(ev(ctx, f"{focus} produksi tambang", f"mining_prod:{focus}", {"latest": latest, "growth_pct": growth}))
    if fin:
        annual = fin.get("annual") or []
        piece.table = ch.table(
            [{"key": "year", "label": "Tahun"}, {"key": "revenue", "label": f"Revenue ({fin.get('currency')})", "align": "right", "format": "num"},
             {"key": "net_income", "label": "Laba", "align": "right", "format": "num"}, {"key": "ebitda", "label": "EBITDA", "align": "right", "format": "num"}],
            annual, note=f"Mata uang {fin.get('currency')} sesuai laporan emiten")
        piece.evidence.append(ev(ctx, f"{focus} finansial tambang", f"mining_fin:{focus}", {"annual": annual[-2:]}))
    piece.kpis = piece.kpis or [ch.kpi("Emiten", focus)]
    if not piece.narrative:
        piece.narrative = f"Dossier {focus}."
    return piece


def b_mining_ownership(ctx: RunContext, io: str = "IO-31") -> Piece:
    piece = Piece(io=io, panel="P7", why="IO-31 · struktur kepemilikan tambang (induk → anak)")
    for sym in syms(ctx):
        payload = ctx.value(f"mining_own:{sym}") or {}
        if not payload.get("ownership"):
            continue
        own = payload["ownership"]
        parents = own.get("parents") or []
        subs = own.get("subsidiaries") or []
        piece.items = [{"kind": "tree", "label": "Pemegang", "children": [
            {"label": f"{p.get('name')} ({fmt_pct(p.get('pct'))})", "children": []} for p in parents]},
            {"kind": "tree", "label": "Anak usaha", "children": [
                {"label": f"{s.get('name')} ({fmt_pct(s.get('pct'))})", "children": []} for s in subs]}]
        piece.title = f"Struktur {sym}: {len(parents)} lapis induk, {own.get('layers')} lapis grup"
        piece.kpis = [ch.kpi(p.get("name", "—"), fmt_pct(p.get("pct"))) for p in parents[:3]] or [ch.kpi("Layer", str(own.get("layers")))]
        piece.narrative = piece.title + "."
        piece.facts = [piece.title]
        piece.evidence.append(ev(ctx, f"{sym} ownership tree", f"mining_own:{sym}", own))
        return piece
    return empty(piece, "ownership tambang tidak tersedia")


def b_mining_sites(ctx: RunContext, io: str = "IO-32") -> Piece:
    piece = Piece(io=io, panel="P7", why="IO-32 · lokasi site & cadangan (lat/long)")
    points, rows = [], []
    for sym in syms(ctx):
        for site in (ctx.value(f"mining_sites:{sym}") or {}).get("sites", []):
            points.append({"name": f"{sym} · {site.get('name')}", "lon": site.get("lon"), "lat": site.get("lat"),
                           "label": site.get("province")})
            rows.append({"symbol": sym, "name": site.get("name"), "province": site.get("province"),
                         "lat": site.get("lat"), "lon": site.get("lon"), "status": site.get("status")})
            piece.evidence.append(ev(ctx, f"{sym} site", f"mining_sites:{sym}", site))
    if not points:
        return empty(piece, "site tambang tidak tersedia")
    piece.chart = ch.map_points(points, height=300)
    provs = {row["province"] for row in rows if row.get("province")}
    piece.title = f"{len(points)} site di {len(provs)} provinsi: {', '.join(sorted(provs)[:4])}"
    piece.kpis = [ch.kpi("Site", str(len(points))), ch.kpi("Provinsi", str(len(provs)))]
    piece.narrative = piece.title + "."
    piece.facts = [piece.title]
    piece.table = ch.table(
        [{"key": "symbol", "label": "Emiten"}, {"key": "name", "label": "Site"}, {"key": "province", "label": "Provinsi"},
         {"key": "status", "label": "Status"}], rows)
    return piece


def b_commodity(ctx: RunContext, io: str = "IO-33") -> Piece:
    piece = Piece(io=io, panel="P7", why="IO-33 · harga komoditas + tujuan ekspor")
    payload = ctx.value("commodities") or {}
    detail = payload.get("detail") or payload.get("commodities") or {}
    if not detail:
        return empty(piece, "harga komoditas tidak tersedia")
    key = None
    for candidate in detail:
        if "Coal" in candidate:
            key = candidate
            break
    key = key or list(detail.keys())[0]
    series = (detail.get(key) or {}).get("series") or []
    if series:
        piece.chart = ch.line([row["month"] for row in series], [{"name": key, "data": [row["price"] for row in series]}],
                              y_name="USD", suffix="", height=280, x_interval=5)
    yoyv = (detail.get(key) or {}).get("yoy_pct")
    dest = None
    exports_rows = []
    for sym in syms(ctx):
        exports_rows.extend((ctx.value(f"mining_exports:{sym}") or {}).get("exports", []))
    if exports_rows:
        combined: dict[str, float] = {}
        for row in exports_rows:
            combined[row["country"]] = combined.get(row["country"], 0) + (row.get("share_pct") or 0)
        tot = sum(combined.values()) or 1
        dest = sorted(((k, v / tot * 100) for k, v in combined.items()), key=lambda kv: -kv[1])
    piece.title = f"{key} {fmt_num((detail.get(key) or {}).get('latest'))} USD ({fmt_pct(yoyv, 1, True)} YoY)"
    if dest:
        piece.title += f"; {dest[0][0]} tujuan ekspor utama ({fmt_pct(dest[0][1])})"
        piece.kpis = [ch.kpi(k, fmt_pct(v)) for k, v in dest[:4]]
    piece.kpis = ([ch.kpi(key, f"{fmt_num((detail.get(key) or {}).get('latest'))} USD", fmt_pct(yoyv, 1, True), "up" if (yoyv or 0) >= 0 else "down")] + piece.kpis)[:5]
    piece.narrative = piece.title + "."
    piece.facts = [piece.title]
    piece.evidence.append(ev(ctx, f"Harga komoditas {key}", "commodities", {"latest": (detail.get(key) or {}).get("latest"), "yoy_pct": yoyv}))
    if dest:
        piece.table = ch.table([{"key": "country", "label": "Negara tujuan"}, {"key": "share", "label": "Share", "align": "right", "format": "pct"}],
                               [{"country": k, "share": round(v, 1)} for k, v in dest])
    return piece


def b_licenses(ctx: RunContext, io: str = "IO-34") -> Piece:
    piece = Piece(io=io, panel="P7", why="IO-34 · radar lisensi IUP/IUPK & lelang WIUP (countdown)")
    rows = []
    for sym in syms(ctx):
        for lic in (ctx.value(f"mining_lic:{sym}") or {}).get("licenses", []):
            rows.append({"symbol": sym, **lic})
            piece.evidence.append(ev(ctx, f"{sym} lisensi tambang", f"mining_lic:{sym}", lic))
    auctions = (ctx.value("auctions") or {}).get("auctions") or []
    if not rows and not auctions:
        return empty(piece, "lisensi/lelang tambang tidak tersedia")
    expiring = [row for row in rows if (_days_to(row.get("expiry")) or 9999) < 365]
    piece.table = ch.table(
        [{"key": "symbol", "label": "Emiten"}, {"key": "type", "label": "Jenis"}, {"key": "holder", "label": "Pemegang"},
         {"key": "expiry", "label": "Kedaluwarsa", "format": "date"}, {"key": "days", "label": "Sisa hari", "align": "right"},
         {"key": "status", "label": "Status"}],
        [{"symbol": row["symbol"], "type": row.get("type"), "holder": row.get("holder"),
          "expiry": row.get("expiry"), "days": _days_to(row.get("expiry")), "status": row.get("status")} for row in rows])
    piece.title = f"{len(expiring)} IUP kedaluwarsa <12 bulan; {len(auctions)} lelang WIUP terpantau"
    piece.kpis = [ch.kpi("Lisensi", str(len(rows))), ch.kpi("<12 bulan", str(len(expiring)), tone="warn" if expiring else "up"),
                  ch.kpi("Lelang aktif", str(len(auctions)))]
    piece.narrative = piece.title + ". Lisensi kedaluwarsa adalah risiko operasional yang sering luput dari memo."
    piece.facts = [piece.title]
    if auctions:
        piece.items = [{"kind": "news", "symbol": a.get("commodity"), "date": a.get("closing"),
                        "title": f"Lelang {a.get('id')} · status {a.get('status')}", "source": a.get("location"),
                        "tags": [a.get("commodity")]} for a in auctions[:6]]
    return piece


def b_regional(ctx: RunContext, io: str = "IO-35") -> Piece:
    piece = Piece(io=io, panel="P7", why="IO-35 · dossier SGX/KLSE format identik IDX")
    payload = ctx.value("sgx_report") or next(
        (ctx.data[k] for k in ctx.data if k.startswith("sgx_report:") and ctx.data[k]), {})
    report = payload.get("report") or {}
    if not report:
        return empty(piece, "dossier regional tidak tersedia")
    rows = [{"symbol": payload.get("symbol"), "name": report.get("name"), "exchange": payload.get("exchange", "SGX"),
             "pe": report.get("pe"), "pb": report.get("pb"), "roe": report.get("roe"), "yield": report.get("dividend_yield")}]
    for sym in syms(ctx):
        val = r(ctx, sym, "valuation") or {}
        name = ((ctx.value(f"report:{sym}") or {}).get("sections", {}).get("overview") or {}).get("description", "")
        rows.append({"symbol": sym, "name": name.split(" — ")[0], "exchange": "IDX", "pe": val.get("pe_ttm"),
                     "pb": val.get("pb"), "roe": None, "yield": val.get("dividend_yield")})
    piece.chart = ch.bar([f"{row['symbol']} · {row['exchange']}" for row in rows],
                         [row.get("pe") for row in rows], suffix="x", name="P/E", height=240)
    piece.title = f"Valuasi {report.get('name')} (P/E {fmt_num(report.get('pe'))}x) vs emiten IDX scope"
    piece.kpis = [ch.kpi(report.get("name", "Regional"), f"{fmt_num(report.get('pe'))}x", f"ROE {fmt_pct(report.get('roe'))} · yield {fmt_pct(report.get('dividend_yield'))}")]
    piece.narrative = piece.title + ". Format dossier disamakan agar perbandingan apel-ke-apel."
    piece.facts = [piece.title]
    regional_key = next((k for k in ctx.data if k.startswith("sgx_report:") and ctx.data[k]), "sgx_report")
    piece.evidence.append(ev(ctx, f"Dossier {payload.get('symbol')} {payload.get('exchange')}", regional_key, report))
    piece.table = ch.table(
        [{"key": "symbol", "label": "Emiten"}, {"key": "exchange", "label": "Bursa"}, {"key": "pe", "label": "P/E", "align": "right", "format": "x"},
         {"key": "pb", "label": "P/B", "align": "right", "format": "x"}, {"key": "roe", "label": "ROE", "align": "right", "format": "pct"},
         {"key": "yield", "label": "Yield", "align": "right", "format": "pct"}], rows)
    return piece


def b_regional_flow(ctx: RunContext, io: str = "IO-36") -> Piece:
    piece = Piece(io=io, panel="P7", why="IO-36 · short sell, buyback, filing insider SGX")
    shorts = (ctx.value("sgx_short") or {}).get("short_sell") or {}
    buybacks = (ctx.value("sgx_buybacks") or {}).get("buybacks") or {}
    if not shorts and not buybacks:
        return empty(piece, "data flow SGX tidak tersedia")
    sym = next(iter(shorts)) if shorts else None
    rows = shorts.get(sym, []) if sym else []
    if rows:
        piece.chart = ch.line([row["date"] for row in rows], [{"name": "Short %", "data": [row.get("short_pct") for row in rows]}],
                              y_name="%", suffix="%", height=250, x_interval=5)
    bb_rows = []
    for s, items in buybacks.items():
        for item in items:
            bb_rows.append({"symbol": s, **item})
    piece.title = f"Short {sym} rata-rata {fmt_pct(sum((r.get('short_pct') or 0) for r in rows) / len(rows) if rows else None)}; {len(bb_rows)} buyback tercatat"
    piece.kpis = [ch.kpi("Short avg", fmt_pct(sum((r.get("short_pct") or 0) for r in rows) / len(rows) if rows else None)),
                  ch.kpi("Buyback", str(len(bb_rows)))]
    if bb_rows:
        piece.kpis.append(ch.kpi("Buyback terbesar", f"{bb_rows[0]['symbol']} {fmt_idr(bb_rows[0].get('value'))}"))
    piece.narrative = piece.title + "."
    piece.facts = [piece.title]
    piece.table = ch.table(
        [{"key": "symbol", "label": "Emiten"}, {"key": "date", "label": "Tanggal", "format": "date"},
         {"key": "shares", "label": "Saham", "align": "right", "format": "num"}, {"key": "value", "label": "Nilai", "align": "right", "format": "idr"}],
        bb_rows[:10])
    piece.evidence.append(ev(ctx, "SGX short sell & buyback", "sgx_short", {"short_symbols": list(shorts.keys()), "buybacks": len(bb_rows)}))
    return piece


# ================================================================= P8 Risiko
def _rule_inputs(ctx: RunContext, sym: str) -> dict[str, Any]:
    quarterly = q(ctx, sym)
    report = ctx.value(f"report:{sym}") or {}
    sections = report.get("sections") or {}
    filings = (ctx.value(f"filings:{sym}") or {}).get("filings") or []
    susp = (ctx.value(f"susp:{sym}") or {}).get("suspensions") or []
    foreign_rows = ((ctx.value(f"foreign:{sym}") or ctx.value("foreign") or {}).get("per_symbol") or {}).get(sym) or []
    daily = (ctx.value(f"daily:{sym}") or {}).get("daily") or []
    brokers = (ctx.value(f"broker_summary:{sym}") or {}).get("brokers") or []
    float_pct = (sections.get("ownership") or {}).get("free_float_pct")
    drawdown = None
    if daily:
        peak = max(row.get("close") or 0 for row in daily[-30:])
        last = daily[-1].get("close") or 0
        if peak:
            drawdown = (peak - last) / peak * 100
    top3 = top_share([b.get("buy_value") or 0 for b in brokers], 3)
    qdates = (ctx.value("qdates") or {}).get("companies") or []
    newest = max((row.get("report_date") or "" for row in qdates), default="")
    mine = next((row.get("report_date") or "" for row in qdates if row["symbol"] == sym), None)
    if not mine:
        own = (ctx.value(f"qdates_sym:{sym}") or {}).get("dates") or []
        mine = max((row.get("report_date") or "" for row in own), default=None)
    return {
        "quarterly": quarterly, "report": {"sections": sections}, "filings": filings, "suspensions": susp,
        "foreign_net_5d": net_sum(foreign_rows, "net", 5) if foreign_rows else None,
        "free_float_pct": float_pct, "drawdown_30d": drawdown, "broker_top3_share": top3,
        "late_report": bool(mine and newest and mine < newest),
        "late_report_detail": f"rilis {fmt_date_short(mine)} vs terbaru {fmt_date_short(newest)}" if mine else None,
    }


def b_red_flags(ctx: RunContext, io: str = "IO-38") -> Piece:
    piece = Piece(io=io, panel="P8", why="IO-38 · skor bahaya + checklist aturan terpicu (klik bukti)")
    targets = syms(ctx)
    if not targets:
        return empty(piece, "red-flag butuh daftar emiten")
    results = []
    for sym in targets:
        hits = rules.evaluate(sym, _rule_inputs(ctx, sym))
        sc = rules.score(hits)
        triggered = [h for h in hits if h.triggered]
        refs = {h.rule: ev(ctx, f"{sym} {h.label}", f"quarterly:{sym}", h.values, unit=h.label) for h in triggered}
        results.append({"symbol": sym, "score": sc, "grade": rules.grade(sc), "triggered": triggered, "hits": hits, "refs": refs})
    worst = max(results, key=lambda x: x["score"])
    all_triggered = [h for r_ in results for h in r_["triggered"]]
    piece.chart = ch.gauge(worst["score"], label=f"skor {worst['symbol']}", height=210)
    piece.title = f"Skor bahaya {worst['symbol']} {worst['score']}/100 ({worst['grade']}): {len(worst['triggered'])} aturan terpicu"
    piece.kpis = [ch.kpi(r_["symbol"], f"{r_['score']}/100", f"{len(r_['triggered'])} aturan", 
                         "down" if r_["score"] >= 70 else "warn" if r_["score"] >= 40 else "up") for r_ in results][:6]
    piece.items = [{"kind": "check", "symbol": h_ctx["symbol"], "label": h_.label, "detail": h_.detail,
                    "triggered": True, "weight": h_.weight, "severity": h_.severity,
                    "ev_ref": h_ctx["refs"].get(h_.rule)}
                   for h_ctx in results for h_ in h_ctx["triggered"]] or [
        {"kind": "check", "symbol": r_["symbol"], "label": "Tidak ada aturan terpicu", "detail": "semua ambang aman", "triggered": False, "weight": 0, "severity": "info"}
        for r_ in results]
    piece.table = ch.table(
        [{"key": "symbol", "label": "Emiten"}, {"key": "score", "label": "Skor", "align": "right"},
         {"key": "grade", "label": "Kategori"}, {"key": "rules", "label": "Aturan terpicu"}],
        [{"symbol": r_["symbol"], "score": r_["score"], "grade": r_["grade"],
          "rules": ", ".join(h.label for h in r_["triggered"]) or "—"} for r_ in results])
    piece.narrative = piece.title + ". " + ("; ".join(f"{h_.label} ({h_.detail})" for h_ in all_triggered[:4]) if all_triggered else "Tidak ada ambang yang terpicu.")
    piece.facts = [piece.title] + [f"{r_['symbol']}: {', '.join(h.label for h in r_['triggered']) or 'aman'}" for r_ in results]
    piece.evidence.append(ev(ctx, "Skor red-flag per emiten", "qdates", {"scores": {r_["symbol"]: r_["score"] for r_ in results}}))
    return piece