"""Struk Jadi Saham — diuji terhadap snapshot respons Sectors asli (fixtures/snapshot/, 0 kredit)."""
import json
from pathlib import Path

import pytest

from app.struk import brands, rules, service, universe

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


@pytest.mark.parametrize("rule", rules.RULES, ids=lambda r: r.id)
def test_local_rule_matches_sectors_screener_count(records, rule):
    """Evaluasi lokal per emiten harus sepakat dengan ekspresi `where` yang dijalankan Sectors."""
    sectors_total = _load(SNAP / "cohorts" / f"{rule.id}.json")["pagination"]["total_count"]
    assert sum(1 for r in records.values() if rule.check(r)) == sectors_total


def test_brand_lookup_tolerates_receipt_spelling():
    assert brands.lookup("Indomie Goreng Rendang").symbol == "ICBP"
    assert brands.lookup("PEPSODENT").symbol == "UNVR"
    assert brands.lookup("teh pucuk harum").symbol == "MYOR"
    assert brands.lookup("Indomaret").relation == "indirect"


def test_symbol_codes_do_not_prefix_match_generic_items():
    assert brands.lookup("Roti tawar") is None
    assert brands.lookup("ROTI").symbol == "ROTI"


def test_generic_words_are_not_brands():
    for raw in ["Surya beras 5kg", "Clear plastik bag", "Better tissue gulung", "Lux lampu LED"]:
        assert brands.lookup(raw) is None, raw
    assert brands.lookup("Surya").symbol == "GGRM" and brands.lookup("Sunsilk Black Shine").symbol == "UNVR"


@pytest.mark.asyncio
async def test_basket_ignores_raw_text_when_reader_found_no_brand(monkeypatch):
    monkeypatch.delenv("STRUK_SECTORS_OFF", raising=False)
    service.reset_cache()

    async def fake_universe():
        return {"records": {"UNVR": {"company_name": "Unilever Indonesia Tbk"}}, "count": 1, "prov": {}}

    monkeypatch.setattr(service, "load_universe", fake_universe)
    monkeypatch.setattr(service, "_matrix_src", lambda u, f: {})
    out = await service.basket([{"raw": "Clear plastik bag", "brand": "", "symbol": ""}])
    assert out["companies"] == [] and len(out["unknown"]) == 1


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
        await service.basket([{"raw": "Indomie", "brand": "Indomie"}])


def test_quota_limits_each_visitor_and_resets_after_window():
    from app.struk import quota

    quota.reset()
    cap = quota.PER_IP["scan_photo"]
    assert all(quota.take("scan_photo", "1.1.1.1", now=1000.0) for _ in range(cap))
    assert not quota.take("scan_photo", "1.1.1.1", now=1000.0)
    assert quota.take("scan_photo", "2.2.2.2", now=1000.0)  # pengunjung lain tidak ikut terblokir
    assert quota.take("scan_photo", "1.1.1.1", now=1000.0 + quota.WINDOW_S + 1)
    quota.reset()


def test_quota_daily_cap_is_global(monkeypatch):
    from app.struk import quota

    quota.reset()
    monkeypatch.setattr(quota, "DAILY_CAP", 3)
    assert [quota.take("reflect", f"10.0.0.{i}", now=5000.0) for i in range(4)] == [True, True, True, False]
    quota.reset()


def test_client_ip_prefers_first_forwarded_hop():
    from app.struk import quota

    assert quota.client_ip({"x-forwarded-for": "203.0.113.9, 10.0.0.2"}, "172.18.0.4") == "203.0.113.9"
    assert quota.client_ip({}, "172.18.0.4") == "172.18.0.4"


async def test_text_scan_without_quota_stays_deterministic():
    from app.struk import narrate

    out = await narrate.read_receipt("Indomie goreng, Pepsodent", use_llm=False)
    assert out["llm"] is False and [i["raw"] for i in out["items"]] == ["Indomie goreng", "Pepsodent"]
