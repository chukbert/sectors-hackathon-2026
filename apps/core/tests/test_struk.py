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


@pytest.mark.parametrize("line,expected", [
    ("Indomie goreng 3.500", ("Indomie goreng", 3500)),
    ("Sari Roti Rp 15.500,00", ("Sari Roti", 15500)),
    ("Pulsa Telkomsel 50rb", ("Pulsa Telkomsel", 50000)),
    ("IDM GRG SPCL 85G x3 10.500", ("IDM GRG SPCL 85G x3", 10500)),
    ("ULTRA MILK COKLAT 250", ("ULTRA MILK COKLAT 250", None)),  # ukuran, bukan harga
    ("PEPSODENT 190G", ("PEPSODENT 190G", None)),
    ("Teh 1500ml", ("Teh 1500ml", None)),
])
def test_price_is_read_from_the_end_of_a_receipt_line(line, expected):
    from app.struk import narrate

    assert narrate.parse_price(line) == expected


def test_payment_and_total_lines_never_count_as_spending():
    from app.struk import narrate

    assert narrate.clean_price("Bayar: BRImo", 187500) is None
    assert narrate.clean_price("TOTAL", 187500) is None
    assert narrate.clean_price("Indomie", -5) is None
    assert narrate.clean_price("Indomie", "3500") == 3500
    out = narrate._split_text("Indomie 3.500, Kopiko 2.000\nBayar: BRImo 187.500")
    assert [(i["raw"], i["price"]) for i in out["items"]] == [("Indomie", 3500), ("Kopiko", 2000), ("Bayar: BRImo", None)]


@pytest.mark.asyncio
async def test_spending_flows_to_issuers_and_groups(monkeypatch, records):
    monkeypatch.delenv("STRUK_SECTORS_OFF", raising=False)

    async def fake_universe():
        return {"records": records, "count": len(records), "prov": {}}

    monkeypatch.setattr(service, "load_universe", fake_universe)
    monkeypatch.setattr(service, "_matrix_src", lambda u, f: {})
    out = await service.basket([
        {"raw": "IDM GRG SPCL x3", "brand": "Indomie", "price": 10500},
        {"raw": "CHITATO", "brand": "Chitato", "price": 9000},
        {"raw": "PEPSODENT 190G", "brand": "Pepsodent", "price": 12000},
        {"raw": "Kantong plastik", "brand": "", "price": 200},
        {"raw": "INDOMARET", "brand": "Indomaret", "price": None},
    ])
    sp = out["spend"]
    assert sp["total"] == 31700 and sp["to_issuers"] == 31500 and sp["other"] == 200
    assert sp["lines"] == 5 and sp["priced_lines"] == 4
    icbp = next(c for c in sp["companies"] if c["symbol"] == "ICBP")
    assert icbp["amount"] == 19500  # dua baris (Indomie + Chitato) ke satu emiten
    # Margin datang dari matriks Sectors, bukan dari struk.
    assert icbp["per_100"] == round(service._num(records["ICBP"][f"net_profit_margin[{universe.LATEST}]"]) * 100, 1)
    assert sum(g["amount"] for g in sp["groups"]) == sp["to_issuers"]
    assert abs(sum(g["share"] for g in sp["groups"]) + sp["other_share"] - 1) < 1e-3
    assert "AMRT" not in {c["symbol"] for c in sp["companies"]}  # baris tanpa harga tidak ikut dihitung


@pytest.mark.asyncio
async def test_spending_without_prices_is_empty_not_invented(monkeypatch, records):
    async def fake_universe():
        return {"records": records, "count": len(records), "prov": {}}

    monkeypatch.setattr(service, "load_universe", fake_universe)
    monkeypatch.setattr(service, "_matrix_src", lambda u, f: {})
    sp = (await service.basket([{"raw": "Indomie", "brand": "Indomie"}]))["spend"]
    assert sp["total"] == 0 and sp["companies"] == [] and sp["to_issuers_share"] is None


def test_new_catalog_brands_that_are_common_words_match_exactly_only():
    assert brands.lookup("Natur-E").symbol == "DVLA"
    assert brands.lookup("Nature Republic") is None  # bukan Natur-E (DVLA)
    assert brands.lookup("Charm").symbol == "UCID" and brands.lookup("Charming") is None
    assert brands.lookup("Marina").symbol == "TSPC" and brands.lookup("Marinara") is None


def test_every_catalog_symbol_exists_in_sectors_snapshot(records):
    missing = [s for s in brands.CATALOG if s not in records]
    assert missing == []


@pytest.mark.asyncio
async def test_ai_guess_does_not_inherit_verified_from_sibling_line(monkeypatch, records):
    async def fake_universe():
        return {"records": records, "count": len(records), "prov": {}}

    monkeypatch.setattr(service, "load_universe", fake_universe)
    monkeypatch.setattr(service, "_matrix_src", lambda u, f: {})
    out = await service.basket([
        {"raw": "ENERVON-C 30S", "brand": "Enervon-C", "symbol": "DVLA"},
        {"raw": "NEOZEP FORTE", "brand": "Neozep", "symbol": "DVLA"},  # tebakan AI, bukan katalog
    ])
    dvla = next(c for c in out["companies"] if c["symbol"] == "DVLA")
    by_raw = {ln["raw"]: ln for ln in dvla["lines"]}
    assert by_raw["ENERVON-C 30S"]["verified"] is True
    assert by_raw["NEOZEP FORTE"]["verified"] is False and by_raw["NEOZEP FORTE"]["relation"] == "dugaan"
