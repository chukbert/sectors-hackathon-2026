"""Panel harus terisi dari bentuk respons live Sectors yang sudah dinormalisasi Store.

Sampel = potongan respons live nyata (company report/daily/foreign-flow/movers)
+ payload kanonis screener/index/most-traded. Regresi untuk insiden 'panel kosong'.
"""
from app.executor import RunContext
from app.plan_builder import Plan
from app import pipelines_core as pc


def make_ctx(**data) -> RunContext:
    plan = Plan(query="test", session_id="s", persona="A3", playbooks=["market"], intents=[], nodes=[], scope={})
    ctx = RunContext(plan=plan, scope={"symbols": ["BBCA"]})
    ctx.data.update(data)
    for key in data:
        if key in ("universe", "index", "movers_gain", "movers_lose", "most_traded"):
            endpoint = {"universe": "/v2/companies", "index": "/v2/index/daily"}.get(key, "/v2/movers/top")
        else:
            endpoint = "/v2/" + key.split(":")[0]
        ctx.provenance[key] = {"source": "sectors-live", "fetched_at": "2026-09-23T14:08:23+0700",
                               "credits_spent": 1, "endpoint": endpoint, "params": {}}
    return ctx


REPORT_OVERVIEW = {"symbol": "BBCA", "sections": {"overview": {
    "sector": "Financials", "sub_sector": "Banks", "market_cap": 9.4e14,
    "close": 7275, "change_pct": -1.98, "52w_low": 5000, "52w_high": 8600}}}

DAILY = {"symbol": "BBCA", "daily": [
    {"date": "2026-09-22", "close": 7100, "volume": 900},
    {"date": "2026-09-23", "close": 7275, "volume": 1200}]}

FOREIGN = {"per_symbol": {"BBCA": [
    {"date": "2026-09-22", "net": -120_000_000_000, "foreign_pct": 0.68},
    {"date": "2026-09-23", "net": -80_000_000_000, "foreign_pct": 0.68}]}, "symbols": ["BBCA"]}

UNIVERSE = {"companies": [
    {"symbol": "BBCA", "name": "BCA", "sector": "Financials", "market_cap": 9.4e14, "change_pct_1d": 1.2},
    {"symbol": "BBRI", "name": "BRI", "sector": "Financials", "market_cap": 5.7e14, "change_pct_1d": -0.4},
    {"symbol": "ANTM", "name": "Antam", "sector": "Basic Materials", "market_cap": 4.0e13, "change_pct_1d": 2.9}]}

MOVERS_GAIN = {"movers": [
    {"symbol": "ANTM", "change_pct": 6.2, "price": 1600, "date": "2026-09-23"},
    {"symbol": "MDKA", "change_pct": 4.1, "price": 2500, "date": "2026-09-23"}]}
MOVERS_LOSE = {"movers": [
    {"symbol": "WSKT", "change_pct": -6.8, "price": 50, "date": "2026-09-23"},
    {"symbol": "GOTO", "change_pct": -3.3, "price": 60, "date": "2026-09-23"}]}
MOST_TRADED = {"most_traded": [
    {"symbol": "BBCA", "volume": 3_000_000_000, "value": 2.1e13},
    {"symbol": "GOTO", "volume": 1_000_000_000, "value": 6.0e10}]}

INDEX = {"symbol": "IHSG", "daily": [
    {"date": "2026-09-22", "close": 7100}, {"date": "2026-09-23", "close": 7200}]}


def test_snapshot_filled_from_live_report():
    piece = pc.b_snapshot(make_ctx(**{"report:BBCA": REPORT_OVERVIEW}))
    assert piece.status != "empty"
    assert "BBCA" in piece.title
    assert piece.chart is not None


def test_price_history_filled_from_live_daily():
    piece = pc.b_price_history(make_ctx(**{"daily:BBCA": DAILY}))
    assert piece.status != "empty"
    assert piece.chart and len(piece.chart.get("series", [])) == 1


def test_market_snapshot_filled_from_live_screener():
    piece = pc.b_market_snapshot(make_ctx(universe=UNIVERSE))
    assert piece.status != "empty"
    assert piece.chart is not None
    assert any(k.get("label") == "Emiten" for k in piece.kpis)


def test_movers_filled_from_live_top_changes():
    piece = pc.b_movers(make_ctx(movers_gain=MOVERS_GAIN, movers_lose=MOVERS_LOSE, most_traded=MOST_TRADED))
    assert piece.status != "empty"
    assert "ANTM" in piece.title
    assert "most traded" in piece.title


def test_index_compare_filled_from_live_index_and_daily():
    piece = pc.b_index_compare(make_ctx(index=INDEX, **{"daily:BBCA": DAILY}))
    assert piece.status != "empty"
    assert piece.chart and len(piece.chart.get("series", [])) >= 2


def test_foreign_flow_filled_from_live_per_symbol():
    piece = pc.b_foreign_flow(make_ctx(**{"foreign:BBCA": FOREIGN}))
    assert piece.status != "empty"
    assert "BBCA" in piece.title

def test_snapshot_survives_missing_52w_but_keeps_kpis():
    ov = {"symbol": "BBCA", "sections": {"overview": {
        "close": 6200, "market_cap": 7.5e14, "change_pct": -0.4, "52w_low": None, "52w_high": None}}}
    piece = pc.b_snapshot(make_ctx(**{"report:BBCA": ov}))
    assert piece.status != "empty"
    assert piece.kpis
    assert piece.chart is None
