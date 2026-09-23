import pytest

from app import plan_builder
from app.plan_builder import build_plan, plan_from_storage, plan_to_storage


@pytest.fixture(autouse=True)
def fake_store(monkeypatch):
    async def fake_lookup(endpoint, params=None):
        return {"hit": False, "fresh": False, "invalid": False, "error": None,
                "est_credits_live": 1, "demo_mode": True, "mode": "fixture"}

    monkeypatch.setattr(plan_builder.STORE, "lookup", fake_lookup)


@pytest.mark.asyncio
async def test_build_plan_banks_merges_report_sections():
    plan = await build_plan("Bandingkan BBCA, BMRI, BBRI kuartal terakhir + flow + risiko", "s1")
    assert {"BBCA", "BMRI", "BBRI"} <= set(plan.scope["symbols"])
    report_nodes = [n for n in plan.nodes if n.endpoint == "/v2/company/report/BBCA"]
    assert len(report_nodes) == 1, "report per emiten harus merge jadi satu node (fetch-sharing)"
    sections = set(report_nodes[0].params.get("sections") or [])
    assert {"overview", "valuation", "financials"} <= sections
    assert len(report_nodes[0].intents) >= 3
    assert all(n.est_credits == 0 for n in plan.nodes), "demo mode harus 0 kredit"


@pytest.mark.asyncio
async def test_subsector_endpoint_resolved():
    plan = await build_plan("review sektor bank dong", "s1")
    subs = [n for n in plan.nodes if "subsector/report/" in n.endpoint]
    assert subs, [n.endpoint for n in plan.nodes]
    assert subs[0].endpoint.endswith("/banks")
    assert "{" not in subs[0].endpoint and "$" not in subs[0].endpoint


@pytest.mark.asyncio
async def test_mining_scope_adds_miner_nodes():
    plan = await build_plan("update harga batu bara, produksi, IUP dan ekspor", "s1")
    assert plan.scope["symbols"], "scope tambang default harus terisi"
    assert any("mining/" in n.endpoint for n in plan.nodes)


@pytest.mark.asyncio
async def test_budget_flag():
    plan = await build_plan("paket komite lengkap semua", "s1")
    assert plan.estimates()["nodes"] > 20


@pytest.mark.asyncio
async def test_roundtrip_storage():
    plan = await build_plan("earnings flash BBCA", "s1")
    restored = plan_from_storage(plan_to_storage(plan))
    assert restored.query == plan.query
    assert [n.endpoint for n in restored.nodes] == [n.endpoint for n in plan.nodes]
    assert restored.intents == plan.intents