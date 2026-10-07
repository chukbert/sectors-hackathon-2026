"""Paham Emiten — diuji terhadap snapshot respons Sectors asli (fixtures/snapshot/, 0 kredit)."""
import json
from pathlib import Path

import pytest

from app.struk import brands, service, universe

SNAP = Path(__file__).resolve().parents[3] / "fixtures" / "snapshot"


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))["data"]


@pytest.fixture(scope="module")
def records() -> dict:
    pages = [_load(f) for f in sorted((SNAP / "matrix").glob("*.json"))]
    return universe.merge_pages(pages)


def test_matrix_covers_whole_exchange(records):
    total = _load(SNAP / "matrix" / "fin_0.json")["pagination"]["total_count"]
    assert len(records) == total
    icbp = records["ICBP"]
    assert icbp["company_name"].startswith("Indofood CBP")
    assert icbp[f"revenue[{universe.LATEST}]"] > 0 and "sub_sector" in icbp


def test_search_is_ticker_only(records):
    out = service.search_tickers(records, "bbca.jk")
    assert out["exact"] and out["results"][0]["symbol"] == "BBCA"
    # Awalan kode jadi saran, kode persis selalu di urutan pertama.
    pre = service.search_tickers(records, "BB")
    assert not pre["exact"] and all(r["symbol"].startswith("BB") for r in pre["results"]) and len(pre["results"]) == 8
    roti = service.search_tickers(records, "ROTI")
    assert [r["symbol"] for r in roti["results"]][:1] == ["ROTI"]
    # Nama merek atau nama perusahaan bukan input: tidak menebak.
    assert service.search_tickers(records, "Indomie")["results"] == []
    assert service.search_tickers(records, "Bank Central Asia")["results"] == []
    assert service.search_tickers(records, " -- ")["results"] == []


def test_card_brand_chips_only_for_direct_owners():
    assert "Indomie" in brands.brands_of("ICBP")
    assert brands.brands_of("DNET") == []  # Indomaret: DNET hanya pemegang saham minoritas
    assert brands.brands_of("ANTM") == []


def test_controller_chain_follows_linked_parent(records):
    chain = service.controller_chain(records, "ICBP")
    assert chain[0]["symbol"] == "INDF" and chain[0]["pct"] > 0.5
    assert service.owner_group(records, "ICBP")["label"] == "Grup Salim"


def test_peers_include_self(records):
    u = {"records": records, "count": len(records), "prov": {}}
    ps = service.peers(u, "ICBP")
    assert any(p["is_self"] for p in ps) and len(ps) >= 3


@pytest.mark.asyncio
async def test_sectors_off_kills_the_app(monkeypatch):
    monkeypatch.setenv("STRUK_SECTORS_OFF", "1")
    service.reset_cache()
    with pytest.raises(service.SectorsOff):
        await service.company_card("ICBP")
    with pytest.raises(service.SectorsOff):
        await service.load_universe()  # pencarian juga berhenti, bukan menebak dari katalog


def test_every_catalog_symbol_exists_in_sectors_snapshot(records):
    missing = [s for s in brands.CATALOG if s not in records]
    assert missing == []
