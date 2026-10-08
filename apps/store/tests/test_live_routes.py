from app.live_routes import translate


def test_official_path_is_passed_through_untouched():
    assert translate("/sectors/v2/companies/", {"where": "x", "limit": 200}) == (
        "/v2/companies/", {"where": "x", "limit": 200})
    assert translate("/sectors/v2/company/get-segments/ICBP/", {}) == ("/v2/company/get-segments/ICBP/", {})
    assert translate("https://api.sectors.app/sectors/v2/companies/list_companies_with_segments", None) == (
        "/v2/companies/list_companies_with_segments/", {})


def test_everything_else_is_fail_closed():
    assert translate("/v2/companies", {}) is None
    assert translate("/v2/company/report/BBCA", {}) is None
    assert translate("/sectors/v2", {}) is None
    assert translate("/other/v2/companies/", {}) is None
