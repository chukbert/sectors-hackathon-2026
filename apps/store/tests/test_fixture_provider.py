from app.fixture_provider import respond


def test_company_report_sections_filter():
    status, body = respond("/v2/company/report/bbca", {"sections": ["overview", "valuation"]})
    assert status == 200
    assert set(body["sections"].keys()) == {"overview", "valuation"}
    assert body["sections"]["valuation"]["pe_ttm"] == 13.2


def test_company_report_unknown_symbol():
    status, body = respond("/v2/company/report/NOPE", {})
    assert status == 404
    assert body["error"] == "symbol_not_found"


def test_quarterly():
    status, body = respond("/v2/company/report/BBRI/quarterly", {"limit": 3})
    assert status == 200
    assert len(body["quarterly"]) == 3
    assert body["quarterly"][-1]["period"] == "2026-Q2"


def test_screener_where_banks_low_pe():
    status, body = respond("/v2/companies", {"where": {"sub_sector": "Banks", "pe": {"lt": 12}}})
    assert status == 200
    syms = {c["symbol"] for c in body["companies"]}
    assert {"BMRI", "BBNI"} <= syms
    assert "ARTO" not in syms


def test_movers_and_most_traded():
    status, body = respond("/v2/movers/top", {"period": "1d", "type": "gainers"})
    assert status == 200 and body["movers"]
    status, body = respond("/v2/movers/most-traded", {})
    assert status == 200 and len(body["most_traded"]) == 10


def test_broker_summary_has_foreign_net_buy():
    status, body = respond("/v2/broker/summary/BBCA", {})
    assert status == 200
    zp = next(b for b in body["brokers"] if b["broker"] == "ZP")
    assert zp["net_value"] > 0


def test_foreign_flow_symbols():
    status, body = respond("/v2/foreign-flow", {"symbols": ["BBCA", "BMRI"]})
    assert status == 200
    assert set(body["per_symbol"].keys()) == {"BBCA", "BMRI"}


def test_mining_and_commodities():
    status, body = respond("/v2/mining/companies", {})
    assert status == 200 and body["companies"]
    status, body = respond("/v2/mining/ADRO/ownership", {})
    assert status == 200 and body["ownership"]["layers"] >= 1
    status, body = respond("/v2/commodities", {})
    assert status == 200 and "Coal (HBA)" in body["commodities"]


def test_regional_sgx_report():
    status, body = respond("/v2/sgx/company/report/D05", {})
    assert status == 200
    assert body["report"]["pe"] == 11.8


def test_unknown_endpoint_returns_none():
    assert respond("/v2/unknown/thing", {}) is None