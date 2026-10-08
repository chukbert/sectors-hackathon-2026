"""API Core (/v1/health, /v1/struk/*) — kartu dirakit dari matriks snapshot Sectors asli, tanpa Store."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main
from app.struk import DISCLAIMER, service, universe

SNAP = Path(__file__).resolve().parents[3] / "fixtures" / "snapshot"


@pytest.fixture(scope="module")
def uni() -> dict:
    pages = [json.loads(f.read_text(encoding="utf-8"))["data"] for f in sorted((SNAP / "matrix").glob("*.json"))]
    records = universe.merge_pages(pages)
    return {"records": records, "count": len(records), "prov": {"fetched_at": "snapshot", "source": "store-hit"}}


@pytest.fixture
def client(uni, monkeypatch):
    async def fake_universe():
        return uni

    async def no_segments(sym):
        return None

    monkeypatch.delenv("STRUK_SECTORS_OFF", raising=False)
    monkeypatch.setattr(service, "load_universe", fake_universe)
    monkeypatch.setattr(service, "money_map", no_segments)
    with TestClient(main.app) as c:
        yield c


def test_search_by_ticker(client, uni):
    out = client.get("/v1/struk/search", params={"q": "bbca"}).json()
    assert out["exact"] and out["results"][0]["symbol"] == "BBCA" and out["universe_total"] == uni["count"]
    assert client.get("/v1/struk/search", params={"q": "Indomie"}).json()["results"] == []


def test_card_has_disclaimer_sources_and_five_sides(client):
    card = client.get("/v1/struk/company/icbp").json()
    assert card["symbol"] == "ICBP" and card["disclaimer"] == DISCLAIMER
    assert card["snowflake"]["total"] == 30 and len(card["snowflake"]["axes"]) == 5
    assert card["facts_src"]["api"].startswith("GET /v2/companies/") and card["owners"]["group"]["label"] == "Grup Salim"
    assert card["money"] is None  # panel kosong yang jujur, bukan angka karangan


def test_unknown_symbol_is_404(client):
    assert client.get("/v1/struk/company/ZZZZ").status_code == 404


def test_sectors_off_refuses_everything(uni, monkeypatch):
    monkeypatch.setenv("STRUK_SECTORS_OFF", "1")
    service.reset_cache()
    with TestClient(main.app) as c:
        for path in ("/v1/struk/company/ICBP", "/v1/struk/search?q=BB"):
            body = c.get(path).json()
            assert body["sectors_off"] is True and "tidak mengarang" in body["message"]
        assert c.get("/v1/struk/status").json()["sectors_off"] is True


def test_health_reports_store_unreachable_without_failing(client):
    body = client.get("/v1/health").json()
    assert body["ok"] is True and body["service"] == "paham-emiten-core"
