from app.ledger import Ledger
from app.verify import DISCLAIMER, check_policy, check_threshold_values, extract_numbers, sanitize_text


def ledger() -> Ledger:
    led = Ledger()
    led.add(label="P/E BBCA", endpoint="/v2/company/report/BBCA", params={}, fetched_at="2026-09-23T15:40",
            source="store-hit", value={"pe_ttm": 13.2, "premium_pct": 8.0, "net_5d": -1.2e12, "insider_value": 5.1e9,
                                       "der": 0.4, "yield": 5.7, "threshold": 7.5})
    return led


def test_currency_and_units_are_verified():
    led = ledger()
    text = "P/E 13,2x dengan premi 8,0%; asing net sell Rp-1,2 T; insider jual Rp5,1 M; DER 0,4x."
    result = check_threshold_values(text, led)
    assert result["ok"], result["unverified"]


def test_minus_sign_is_captured():
    led = ledger()
    tokens = extract_numbers("OD distribusi Rp -38,1 M")
    assert any(t["value"] == -38.1e9 for t in tokens), tokens


def test_52_minggu_tidak_dianggap_miliar():
    tokens = extract_numbers("BBCA di 58% rentang 52 minggu")
    assert all(t["value"] != 52e9 for t in tokens), tokens


def test_unverified_number_detected():
    led = ledger()
    result = check_threshold_values("P/E 15,9x sangat mahal", led)
    assert not result["ok"]
    assert result["unverified"][0]["value"] == 15.9


def test_banned_recommendation_language():
    assert not check_policy("Sebaiknya beli sekarang, target price Rp10.000.")["ok"]
    assert check_policy("Asing net sell Rp1,2 T; risiko utama adalah likuiditas.")["ok"]


def test_sanitize_drops_bad_sentences():
    led = ledger()
    text = "P/E 13,2x wajar. Angka ini diprediksi naik ke 20x. Yield 5,7% di atas median."
    cleaned, dropped = sanitize_text(text, led)
    assert "20x" not in cleaned
    assert len(dropped) == 1
    assert "13,2x" in cleaned and "5,7%" in cleaned


def test_disclaimer_constant():
    assert "bukan rekomendasi investasi" in DISCLAIMER.lower()