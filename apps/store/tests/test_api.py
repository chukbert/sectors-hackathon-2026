from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_fetch_then_hit_then_lookup():
    payload = {"endpoint": "/v2/company/report/BMRI", "params": {"sections": ["valuation"]}}
    r1 = client.post("/v1/store/fetch", json=payload).json()
    assert r1["source"] == "fixture"
    assert r1["credits_spent"] == 0
    assert r1["data"]["sections"]["valuation"]["pe_ttm"] == 11.3
    key = r1["cache_key"]

    r2 = client.post("/v1/store/fetch", json=payload).json()
    assert r2["source"] == "store-hit"
    assert r2["cache_key"] == key

    look = client.post("/v1/store/lookup", json=payload).json()
    assert look["hit"] is True and look["fresh"] is True
    assert look["est_credits_live"] == 0


def test_lookup_miss_estimates_live_cost():
    look = client.post("/v1/store/lookup", json={"endpoint": "/v2/company/report/BBNI", "params": {"sections": ["overview", "valuation", "financials"]}}).json()
    assert look["hit"] is False
    # mode fixture = demo → estimasi 0 kredit (jujur: tidak ada kredit keluar)
    assert look["demo_mode"] is True
    assert look["est_credits_live"] == 0


def test_invalid_params_rejected_free():
    r = client.post("/v1/store/fetch", json={"endpoint": "/v2/company/daily/BBCA", "params": {"start": "2026-09-20", "end": "2026-09-01"}})
    assert r.status_code == 400


def test_unknown_fixture_is_honest_501():
    r = client.post("/v1/store/fetch", json={"endpoint": "/v2/nonexistent/thing", "params": {}})
    assert r.status_code == 501
    assert r.json()["detail"]["error"] == "fixture_unavailable"


def test_cache_hit_costs_zero_and_records_actual_savings():
    from app.keys import canonical_key
    from app.main import db

    endpoint, params = "/v2/company/report/ASII", {"sections": ["overview"]}
    key = canonical_key(endpoint, params)
    before = db.stats()
    db.put(key, "GET", endpoint, params, {"sections": {"overview": {"symbol": "ASII"}}}, 200, 2, 3600, origin="live")
    db.record_saving(key, 2)
    r = client.post("/v1/store/fetch", json={"endpoint": endpoint, "params": params}).json()
    assert r["source"] == "store-hit"
    assert r["credits_spent"] == 0
    after = db.stats()
    assert after["credits_spent"] - before["credits_spent"] == 2
    assert after["credits_saved"] - before["credits_saved"] >= 4
    stats = client.get("/v1/store/stats").json()
    assert stats["credit_start"] - stats["credits_spent"] == stats["credit_remaining"]


def test_stats_shape():
    s = client.get("/v1/store/stats").json()
    for field in ("cached_keys", "store_hits", "hit_rate", "credits_spent", "credits_saved"):
        assert field in s
    assert s["mode"] == "fixture"


def test_invalidate():
    payload = {"endpoint": "/v2/company/report/ARTO", "params": {"sections": ["overview"]}}
    client.post("/v1/store/fetch", json=payload)
    assert client.post("/v1/store/lookup", json=payload).json()["hit"] is True
    client.post("/v1/store/invalidate", json=payload)
    assert client.post("/v1/store/lookup", json=payload).json()["hit"] is False