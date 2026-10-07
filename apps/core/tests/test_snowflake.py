"""Lima sisi (30 cek ala Snowflake) — diuji terhadap matriks Sectors asli (fixtures/snapshot/, 0 kredit)."""
import json
from pathlib import Path

import pytest

from app.struk import snowflake as sf
from app.struk import universe

SNAP = Path(__file__).resolve().parents[3] / "fixtures" / "snapshot"


@pytest.fixture(scope="module")
def records() -> dict:
    pages = [json.loads(f.read_text(encoding="utf-8"))["data"] for f in sorted((SNAP / "matrix").glob("*.json"))]
    return universe.merge_pages(pages)


def _results(records, sym) -> dict:
    return {c["id"]: c["result"] for a in sf.evaluate(records, sym)["axes"] for c in a["checks"]}


def test_every_check_field_is_harvested():
    harvested = {f for g in universe.GROUPS.values() for f in g}
    assert sf.fields() <= harvested


def test_thirty_checks_five_axes():
    non_bank = [c for c in sf.CHECKS if c.id not in sf.BANK_ONLY]
    assert len(non_bank) == 30
    assert {c.axis for c in sf.CHECKS} == {a[0] for a in sf.AXES}
    for axis, *_ in sf.AXES:
        assert sum(1 for c in non_bank if c.axis == axis) == 6


def test_whole_exchange_evaluates(records):
    for sym in records:
        out = sf.evaluate(records, sym)
        assert out["assessed"] <= out["total"] and out["passed"] <= out["assessed"]
        assert out["total"] == (28 if out["is_bank"] else 30)


def test_icbp_known_outcomes(records):
    r = _results(records, "ICBP")
    # intrinsic 23.503 vs harga 6.825; PE 10,37 < rata-rata industri 12,15; PEG 0,34
    assert r["v_iv20"] and r["v_iv40"] and r["v_pe_peer"] and r["v_peg"]
    assert r["p_eps_5y"] is True            # EPS 2025 791 > 2020 564,8
    assert r["h_current"] is True           # current ratio 4,15
    assert r["h_der40"] is False            # D/E 0,84
    assert r["h_ocf"] is True               # kas operasi / utang 0,26
    assert r["h_interest"] is False         # ICR 4,55
    assert r["d_payout"] is True            # payout 0,42
    assert r["f_eps20"] is True             # perkiraan pertumbuhan laba 27,7%


def test_bank_uses_bank_health_checks(records):
    out = sf.evaluate(records, "BBCA")
    assert out["is_bank"]
    health = {c["id"]: c["result"] for a in out["axes"] if a["id"] == "health" for c in a["checks"]}
    assert set(health) == sf.BANK_ONLY
    assert health["b_npl"] is True and health["b_ldr"] is True and health["b_car"] is True


def test_loss_makers_and_non_payers(records):
    r = _results(records, "GOTO")
    assert r["v_iv20"] is False             # intrinsic_value negatif
    assert r["v_peg"] is False              # PE negatif: PEG positif palsu tidak lolos
    assert r["f_profit"] is False
    assert r["d_y25"] is False and r["d_stable"] is False
    assert _results(records, "ROTI")["d_payout"] is False   # payout 259%: dividen melebihi laba


def test_where_constants_match_local_stats(records):
    out = sf.evaluate(records, "ICBP")
    pe = next(c for a in out["axes"] for c in a["checks"] if c["id"] == "v_pe_mkt")
    assert pe["where"] == f"pe_ttm > 0 and pe_ttm < {out['stats']['market_pe']}"
    assert 0 < pe["market_pass"] < len(records)
