"""Store: cache read-through terhadap snapshot Sectors asli (offline) dan jalur live dengan Sectors palsu."""
import asyncio
import dataclasses
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.keys import canonical_key

SNAP = Path(__file__).resolve().parents[3] / "fixtures" / "snapshot"
SEG_LIST = "/sectors/v2/companies/list_companies_with_segments/"


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:  # menjalankan startup → seed snapshot
        yield c


def _snapshot(name: str) -> dict:
    return json.loads((SNAP / name).read_text(encoding="utf-8"))


class FakeSectors:
    """Pengganti klien Sectors: menghitung panggilan dan menjawab menurut path."""

    configured = True

    def __init__(self, replies: dict | None = None, delay: float = 0.0):
        self.calls: list[tuple[str, dict]] = []
        self.replies = replies or {}
        self.delay = delay

    async def get(self, endpoint, params=None):
        self.calls.append((endpoint, params or {}))
        if self.delay:
            await asyncio.sleep(self.delay)
        return self.replies.get(endpoint, (200, {"ok": True}))

    async def aclose(self):
        return None


@pytest.fixture
def live(monkeypatch):
    """Mode live dengan Sectors palsu; kembali ke offline setelah tes."""
    monkeypatch.setattr(main, "SETTINGS", dataclasses.replace(main.SETTINGS, mode="live"))
    fake = FakeSectors()
    monkeypatch.setattr(main, "sectors", fake)
    return fake


def test_offline_serves_snapshot_with_zero_credits(client):
    snap = _snapshot("matrix/fin_0.json")
    r = client.post("/v1/store/fetch", json={"endpoint": snap["endpoint"], "params": snap["params"]}).json()
    assert r["source"] == "store-hit" and r["credits_spent"] == 0 and r["mode"] == "offline"
    assert r["data"] == snap["data"]
    assert r["cache_key"] == canonical_key(snap["endpoint"], snap["params"])


def test_offline_miss_is_honest_503(client):
    r = client.post("/v1/store/fetch", json={"endpoint": "/sectors/v2/company/get-segments/ZZZZ/", "params": {}})
    assert r.status_code == 503
    assert r.json()["detail"]["error"] == "offline_no_cache"


def test_lookup_reports_hit_and_miss(client):
    snap = _snapshot("matrix/fin_0.json")
    hit = client.post("/v1/store/lookup", json={"endpoint": snap["endpoint"], "params": snap["params"]}).json()
    assert hit["hit"] is True and hit["fresh"] is True and hit["est_credits_live"] == 0
    miss = client.post("/v1/store/lookup", json={"endpoint": "/sectors/v2/company/get-segments/ZZZZ/", "params": {}}).json()
    assert miss["hit"] is False and miss["live_path"] == "/v2/company/get-segments/ZZZZ/" and miss["live_ready"] is True


def test_symbol_case_does_not_change_the_key(client):
    a = client.post("/v1/store/lookup", json={"endpoint": "/sectors/v2/company/get-segments/icbp/", "params": {}}).json()
    b = client.post("/v1/store/lookup", json={"endpoint": "/sectors/v2/company/get-segments/ICBP/", "params": {}}).json()
    assert a["cache_key"] == b["cache_key"]
    assert a["hit"] is True  # snapshot segmen ICBP ikut ter-seed


def test_cache_hit_costs_zero_and_records_saving(client):
    key = canonical_key("/sectors/v2/test/saving", {})
    main.db.put(key, "GET", "/sectors/v2/test/saving", {}, {"x": 1}, 200, 3, 3600)
    before = client.get("/v1/store/stats").json()
    r = client.post("/v1/store/fetch", json={"endpoint": "/sectors/v2/test/saving", "params": {}}).json()
    after = client.get("/v1/store/stats").json()
    assert r["source"] == "store-hit" and r["credits_spent"] == 0
    assert after["credits_saved"] - before["credits_saved"] == 3
    assert after["credits_spent"] == before["credits_spent"]
    assert after["credit_start"] - after["credits_spent"] == after["credit_remaining"]


def test_stats_shape(client):
    s = client.get("/v1/store/stats").json()
    for field in ("cached_keys", "store_hits", "hit_rate", "credits_spent", "credits_saved"):
        assert field in s
    assert s["mode"] == "offline" and s["cached_keys"] >= 250  # 25 halaman matriks + segmen ter-seed


def test_invalidate(client):
    payload = {"endpoint": "/sectors/v2/test/invalidate", "params": {"a": 1}}
    main.db.put(canonical_key(payload["endpoint"], payload["params"]), "GET", payload["endpoint"], payload["params"],
                {"x": 1}, 200, 0, 3600)
    assert client.post("/v1/store/lookup", json=payload).json()["hit"] is True
    assert client.post("/v1/store/invalidate", json=payload).json() == {"deleted": 1}
    assert client.post("/v1/store/lookup", json=payload).json()["hit"] is False


def test_unknown_mode_is_rejected(monkeypatch):
    from app.config import Settings

    monkeypatch.setenv("IDXMACA_STORE_MODE", "fixture")
    with pytest.raises(ValueError):
        Settings.from_env()


def test_live_miss_spends_then_hits(client, live):
    payload = {"endpoint": "/sectors/v2/test/live-miss", "params": {"limit": 5}}
    first = client.post("/v1/store/fetch", json=payload).json()
    assert first["source"] == "sectors-live" and first["credits_spent"] == 1
    assert live.calls == [("/v2/test/live-miss/", {"limit": 5})]
    second = client.post("/v1/store/fetch", json=payload).json()
    assert second["source"] == "store-hit" and second["credits_spent"] == 0
    assert len(live.calls) == 1


def test_live_404_is_charged_once_and_cached(client, live):
    live.replies["/v2/company/get-segments/NOPE/"] = (404, {"error": "not found"})
    payload = {"endpoint": "/sectors/v2/company/get-segments/NOPE/", "params": {}}
    first = client.post("/v1/store/fetch", json=payload).json()
    assert first["http_status"] == 404 and first["credits_spent"] == 1
    second = client.post("/v1/store/fetch", json=payload).json()
    assert second["source"] == "store-hit" and second["http_status"] == 404
    assert len(live.calls) == 1


def test_live_unmapped_path_is_fail_closed(client, live):
    r = client.post("/v1/store/fetch", json={"endpoint": "/v2/company/report/BBCA", "params": {}})
    body = r.json()
    assert body["http_status"] == 501 and body["credits_spent"] == 0
    assert body["data"]["error"] == "live_route_unavailable"
    assert live.calls == []


def test_live_without_api_key_is_503(client, live):
    live.configured = False
    r = client.post("/v1/store/fetch", json={"endpoint": "/sectors/v2/test/nokey", "params": {}})
    assert r.status_code == 503 and r.json()["detail"]["error"] == "no_api_key"
    assert live.calls == []


def test_live_single_flight_fires_once(live):
    live.delay = 0.05

    async def go():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://t") as c:
            payload = {"endpoint": "/sectors/v2/test/single-flight", "params": {}}
            return await asyncio.gather(*[c.post("/v1/store/fetch", json=payload) for _ in range(3)])

    responses = asyncio.run(go())
    assert all(r.status_code == 200 for r in responses)
    assert len(live.calls) == 1
