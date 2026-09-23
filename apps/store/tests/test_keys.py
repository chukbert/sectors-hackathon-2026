from datetime import date

from app.keys import canonical_key, clamp_params, credit_cost, normalize_params, normalize_path


def test_path_normalization_uppercases_symbol():
    assert normalize_path("/v2/company/report/bbca/") == "/v2/company/report/BBCA"
    assert normalize_path("https://api.sectors.app/v2/company/daily/bbca") == "/v2/company/daily/BBCA"
    assert normalize_path("/v2/sgx/company/report/d05") == "/v2/sgx/company/report/D05"


def test_params_aliases_and_sorting():
    a = normalize_params({"sections": ["peers", "valuation"], "symbol": "bbca"})
    b = normalize_params({"symbol": "BBCA", "sections": ["valuation", "peers"]})
    assert a == b == {"sections": ["peers", "valuation"], "symbol": "BBCA"}


def test_canonical_key_stable_across_input_order():
    k1 = canonical_key("/v2/company/report/BBca", {"sections": ["valuation", "overview"]})
    k2 = canonical_key("https://api.sectors.app/v2/company/report/BBCa/", {"sections": ["overview", "valuation"]})
    assert k1 == k2


def test_clamp_broker_range_14_days():
    params, warnings, error = clamp_params("/v2/broker/summary/BBCA", {"start": "2026-01-01", "end": "2026-09-22"}, date(2026, 9, 23))
    assert error is None
    assert params["start"] == "2026-09-09"
    assert warnings and "clamp" in warnings[0]


def test_clamp_invalid_start_after_end():
    _, _, error = clamp_params("/v2/company/daily/BBCA", {"start": "2026-09-20", "end": "2026-09-01"}, date(2026, 9, 23))
    assert error == "start > end"


def test_clamp_idx_daily_90_days():
    params, _, _ = clamp_params("/v2/company/daily/BBCA", {"start": "2025-01-01"}, date(2026, 9, 23))
    assert params["start"] == "2026-06-25"


def test_credit_cost_rules():
    assert credit_cost("/v2/companies", {"where": {"roe": {"gt": 15}}}) == 1
    assert credit_cost("/v2/companies", {"q": "bank murah"}) == 3
    assert credit_cost("/v2/company/report/BBCA", {"sections": ["overview", "valuation"]}) == 2
    assert credit_cost("/v2/company/report/BBCA", {}) == 8
    assert credit_cost("/v2/company/report/NOPE", {}, 404) == 1
    assert credit_cost("/v2/company/daily/BBCA", {}, 500) == 0
    assert credit_cost("/v2/companies", {"q": "bank murah"}, 400) == 1
    assert credit_cost("/v2/companies", {"where": {"roe": {"gt": 15}}}, 400) == 0


def test_credit_cost_official_table():
    assert credit_cost("/v2/company/report/BBCA/quarterly", {"n_quarters": 8}) == 8
    assert credit_cost("/v2/company/report/BBCA/quarterly", {}, 200, {"quarterly": [1, 2, 3]}) == 3
    assert credit_cost("/v2/company/report/BBCA/quarterly-dates") == 1
    assert credit_cost("/v2/company/quarterly-dates", {"limit": 30}) == 1
    assert credit_cost("/v2/company/quarterly-dates", {"limit": 90}) == 3
    assert credit_cost("/v2/universe/close", {"limit": 30}) == 1
    assert credit_cost("/v2/universe/close", {}) == 32
    assert credit_cost("/v2/companies/free-float", {}, 200, {"companies": [0] * 250}) == 3
    assert credit_cost("/v2/movers/most-traded", {"limit": 10}) == 2
    assert credit_cost("/v2/movers/top", {"type": "gainers", "period": "1d"}) == 1
    assert credit_cost("/v2/movers/top", {}) == 10
    assert credit_cost("/v2/broker/top", {"limit": 30}) == 2
    assert credit_cost("/v2/broker/top-buyers/BBCA") == 2
    assert credit_cost("/v2/broker/top-sellers/BBCA") == 2
    assert credit_cost("/v2/broker/summary/BBCA") == 1
    assert credit_cost("/v2/broker/registry") == 1
    assert credit_cost("/v2/broker/activity/ZP") == 1
    assert credit_cost("/v2/foreign-flow/BBCA") == 1
    assert credit_cost("/v2/foreign-flow", {"symbols": ["BBCA", "BBRI"]}) == 2
    assert credit_cost("/v2/foreign-flow", {}) == 25
    assert credit_cost("/v2/corporate-actions/calendar", {"types": ["dividend", "upcoming_dividend"]}) == 2
    assert credit_cost("/v2/corporate-actions/calendar", {}) == 7
    assert credit_cost("/v2/subsector/report/banks", {"sections": ["overview", "valuation"]}) == 2
    assert credit_cost("/v2/subsector/report/banks", {}) == 6
    assert credit_cost("/v2/sgx/company/report/D05", {"sections": ["overview"]}) == 1
    assert credit_cost("/v2/sgx/company/report/D05", {}) == 4
    assert credit_cost("/v2/filings/BBCA") == 1
    assert credit_cost("/v2/suspensions/WSKT") == 1
    assert credit_cost("/v2/news/BBCA") == 1
    assert credit_cost("/v2/helpers/subsectors") == 1