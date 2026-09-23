from app.live_routes import translate


def test_translate_core_endpoints():
    assert translate("/v2/company/report/BBCA", {"sections": ["overview"]}) == (
        "/v2/company/report/BBCA/", {"sections": ["overview"]})
    assert translate("/v2/company/report/BBCA/quarterly", {"n_quarters": 8}) == (
        "/v2/financials/quarterly/BBCA/", {"n_quarters": 8})
    assert translate("/v2/company/quarterly-dates", {"limit": 30}) == (
        "/v2/companies/quarterly-financial-dates/", {"limit": 30})
    assert translate("/v2/company/report/BBCA/quarterly-dates", {}) == (
        "/v2/company/get_quarterly_financial_dates/BBCA/", {})
    assert translate("/v2/universe/close", {"limit": 30}) == ("/v2/close/", {"limit": 30})
    assert translate("/v2/idx/market-cap", {}) == ("/v2/idx-total/", {})


def test_translate_screener_sort_becomes_order_by():
    path, params = translate("/v2/companies", {"sort": "-market_cap", "limit": 25})
    assert path == "/v2/companies/"
    assert params == {"order_by": "market_cap", "desc": True, "limit": 25}


def test_translate_movers_and_brokers():
    path, params = translate("/v2/movers/top", {"type": "gainers", "period": "1d", "limit": 10})
    assert path == "/v2/companies/top-changes/"
    assert params == {"classifications": "top_gainers", "periods": "1d", "n_stock": 10}
    assert translate("/v2/movers/most-traded", {"limit": 10}) == ("/v2/most-traded/", {"limit": 10})
    assert translate("/v2/broker/summary/BBCA", {}) == ("/v2/broker-summary/BBCA/", {})
    assert translate("/v2/broker/top-buyers/BBCA", {}) == ("/v2/broker-summary/BBCA/top/", {})
    assert translate("/v2/broker/top", {"limit": 30}) == ("/v2/brokers/top/", {"limit": 30})
    assert translate("/v2/broker/activity/ZP", {}) == ("/v2/broker-activity/ZP/", {})


def test_translate_query_param_endpoints():
    assert translate("/v2/filings/BBCA", {}) == ("/v2/filings/", {"symbol": "BBCA"})
    assert translate("/v2/suspensions/WSKT", {}) == ("/v2/suspensions/", {"symbol": "WSKT"})
    assert translate("/v2/news/BBCA", {}) == ("/v2/news/", {"symbols": "BBCA"})
    assert translate("/v2/corporate-actions/BBCA", {}) == ("/v2/company/corporate-actions/BBCA/", {})
    path, params = translate("/v2/corporate-actions/calendar", {"types": ["dividend", "upcoming_dividend"]})
    assert path == "/v2/corporate-actions/"
    assert params["type"] == ["dividend", "upcoming_dividend"]
    assert translate("/v2/foreign-flow/BBCA", {}) == ("/v2/foreign-flow/BBCA/", {})
    assert translate("/v2/subsector/report/banks", {"sections": ["overview"]}) == (
        "/v2/subsector/report/banks/", {"sections": ["overview"]})
    assert translate("/v2/helpers/subsectors", {}) == ("/v2/subsectors/", {})


def test_translate_sgx_and_mining_generic():
    assert translate("/v2/sgx/company/report/D05", {"sections": ["overview"]}) == (
        "/v2/sgx/company/report/D05/", {"sections": ["overview"]})
    assert translate("/v2/sgx/short-sell", {}) == ("/v2/sgx/short-sell/", {})
    assert translate("/v2/commodities", {}) == ("/v2/mining/commodities/", {})
    assert translate("/v2/mining/auctions", {}) == ("/v2/mining/license-auctions/", {})


def test_translate_unmapped_is_fail_closed():
    assert translate("/v2/ipo/performance", {}) is None
    assert translate("/v2/mining/ANTM", {}) is None
    assert translate("/v2/mining/ANTM/production", {}) is None
    assert translate("/v2/unknown/thing", {}) is None