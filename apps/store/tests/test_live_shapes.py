"""Normalisasi bentuk live -> kanonis. Sampel diambil dari respons live nyata (cache Store)."""
from app.live_shapes import normalize


def test_report_sections_top_level_wrapped():
    raw = {
        "symbol": "BBCA.JK",
        "company_name": "PT Bank Central Asia Tbk.",
        "overview": {
            "sector": "Financials", "sub_sector": "Banks", "market_cap": 887857728862500,
            "last_close_price": 7275, "daily_close_change": -0.019841,
            "52_w_low": 5000, "52_w_high": 8000,
        },
    }
    out = normalize("/v2/company/report/BBCA", {"sections": ["overview"]}, raw)
    assert out["symbol"] == "BBCA"
    ov = out["sections"]["overview"]
    assert ov["close"] == 7275
    assert ov["market_cap"] == 887857728862500
    assert round(ov["change_pct"], 2) == -1.98
    assert ov["52w_low"] == 5000 and ov["52w_high"] == 8000
    assert "overview" not in out


def test_daily_list_wrapped():
    raw = [{"date": "2026-09-23", "close": 7275, "volume": 100, "market_cap": 1},
           {"date": "2026-09-22", "close": 7000, "volume": 90, "market_cap": 1}]
    out = normalize("/v2/company/daily/BBCA", {}, raw)
    assert out["symbol"] == "BBCA"
    assert [r["close"] for r in out["daily"]] == [7275, 7000]


def test_index_bars_from_data_key():
    raw = {"symbol": "ihsg", "data": [{"date": "2026-09-23", "level": 7200}, {"date": "2026-09-22", "close": 7100}]}
    out = normalize("/v2/index/daily", {"symbol": "IHSG"}, raw)
    assert out["symbol"] == "IHSG"
    assert [r["close"] for r in out["daily"]] == [7200, 7100]


def test_movers_nested_classification_period():
    raw = {"top_losers": {"1d": [{"symbol": "WSKT.JK", "name": "Waskita", "last_close_price": 50,
                                   "price_change": -0.051, "latest_close_date": "2026-09-23"}]}}
    out = normalize("/v2/movers/top", {"type": "losers", "period": "1d"}, raw)
    row = out["movers"][0]
    assert row["symbol"] == "WSKT"
    assert row["change_pct"] == -5.1
    assert out["type"] == "losers"


def test_most_traded_keyed_by_date_arrays():
    raw = {"2026-09-22": [["GOTO.JK", "GoTo", 1033123000]],
           "2026-09-23": [["BBCA.JK", "BCA", 2222222, 15000000000000]]}
    out = normalize("/v2/movers/most-traded", {"limit": 10}, raw)
    assert out["most_traded"][0]["symbol"] == "BBCA"
    assert out["most_traded"][0]["value"] == 15000000000000


def test_foreign_flow_data_to_per_symbol():
    raw = {"symbol": "BBCA.JK", "start": "2026-06-25", "end": "2026-09-23",
           "data": [{"date": "2026-06-25", "net_foreign_inflow": 10067810000,
                     "foreign_buy_idr": 825055380000, "foreign_sell_idr": 814987570000, "foreign_share": 0.6843}]}
    out = normalize("/v2/foreign-flow/BBCA", {}, raw)
    rows = out["per_symbol"]["BBCA"]
    assert rows[0]["net"] == 10067810000
    assert rows[0]["foreign_pct"] == 0.6843


def test_screener_data_to_companies_canonical_fields():
    raw = {"data": [{"symbol": "BBCA.JK", "company_name": "Bank Central Asia", "sector": "Financials",
                     "last_close_price": 7275, "daily_close_change": -0.01984, "market_cap": 9e14,
                     "pe_ttm": 11.3, "pb_mrq": 3.1, "roe_ttm": 16.4, "yield_ttm": 5.7,
                     "yoy_quarter_earnings_growth": 10.05}], "total": 1}
    out = normalize("/v2/companies", {"limit": 200}, raw)
    row = out["companies"][0]
    assert row["symbol"] == "BBCA"
    assert row["name"] == "Bank Central Asia"
    assert row["price"] == 7275
    assert round(row["change_pct_1d"], 2) == -1.98
    assert row["pe"] == 11.3 and row["pb"] == 3.1 and row["roe"] == 16.4
    assert row["dividend_yield"] == 5.7 and row["earnings_growth_yoy"] == 10.05


def test_unknown_endpoint_untouched():
    raw = {"foo": 1}
    assert normalize("/v2/broker/registry", {}, raw) is raw

def test_report_52w_from_all_time_price_wrapper():
    raw = {"symbol": "BBCA.JK", "overview": {
        "last_close_price": 6200, "market_cap": 7.5e14,
        "52w_low": None, "52w_high": None,
        "all_time_price": {"52_w_low": {"2026-06-09": 4820}, "52_w_high": {"2025-10-30": 8750}},
    }}
    out = normalize("/v2/company/report/BBCA", {"sections": ["overview"]}, raw)
    ov = out["sections"]["overview"]
    assert ov["close"] == 6200
    assert ov["52w_low"] == 4820 and ov["52w_high"] == 8750


def test_normalize_does_not_mutate_input():
    import copy
    raw = {"symbol": "BBCA.JK", "overview": {"last_close_price": 6200, "52w_low": None,
                                              "all_time_price": {"52_w_low": {"d": 4820}}}}
    before = copy.deepcopy(raw)
    out = normalize("/v2/company/report/BBCA", {"sections": ["overview"]}, raw)
    assert raw == before
    assert out["sections"]["overview"]["52w_low"] == 4820
