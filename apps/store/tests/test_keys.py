from app.keys import canonical_key, credit_cost, normalize_params, normalize_path
from app.ttl import ttl_seconds


def test_path_normalization_uppercases_symbol():
    assert normalize_path("/sectors/v2/company/get-segments/icbp/") == "/SECTORS/v2/company/GET-SEGMENTS/ICBP"
    assert normalize_path("https://api.sectors.app/v2/company/report/bbca") == "/v2/company/REPORT/BBCA"
    assert normalize_path("/sectors/v2/companies/") == "/SECTORS/v2/companies"
    # Segmen dengan garis bawah dibiarkan apa adanya.
    assert normalize_path("/sectors/v2/companies/list_companies_with_segments/").endswith("/list_companies_with_segments")


def test_params_aliases_and_sorting():
    a = normalize_params({"sections": ["peers", "valuation"], "symbol": "bbca"})
    b = normalize_params({"symbol": "BBCA", "sections": ["valuation", "peers"]})
    assert a == b == {"sections": ["peers", "valuation"], "symbol": "BBCA"}
    assert normalize_params({"limit": "200", "include_query_values": "true", "x": "  ", "y": None}) == {
        "include_query_values": True, "limit": 200}


def test_canonical_key_stable_across_input_order():
    k1 = canonical_key("/sectors/v2/company/get-segments/ICbp", {"b": 1, "a": ["y", "x"]})
    k2 = canonical_key("https://api.sectors.app/sectors/v2/company/get-segments/icbp/", {"a": ["x", "y"], "b": "1"})
    assert k1 == k2
    assert k1 != canonical_key("/sectors/v2/company/get-segments/INDF", {"b": 1, "a": ["y", "x"]})


def test_credit_cost_rules():
    screener = "/sectors/v2/companies/"
    assert credit_cost(screener, {"where": "roe[2025] > 0.1"}) == 1
    assert credit_cost(screener, {"q": "bank murah"}) == 3
    assert credit_cost("/sectors/v2/company/get-segments/ICBP/") == 1
    assert credit_cost("/sectors/v2/company/get-segments/NOPE/", {}, 404) == 1
    assert credit_cost(screener, {}, 500) == 0
    assert credit_cost(screener, {"q": "bank murah"}, 400) == 1
    assert credit_cost(screener, {"where": "roe[2025] > 0.1"}, 400) == 0
    for status in (401, 403, 429):
        assert credit_cost(screener, {}, status) == 0


def test_ttl_sectors_paths_are_annual():
    assert ttl_seconds("/sectors/v2/companies/", 3600) == 30 * 24 * 3600
    assert ttl_seconds("/v2/something/else", 3600) == 3600
