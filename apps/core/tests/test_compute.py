from app.compute import (adv_value, cagr, fmt_date_short, fmt_idr, fmt_num, fmt_pct, index_series, margin,
                         median, net_sum, pct_change, position_pct, top_share, trend_label, yoy)


def test_pct_change_and_yoy():
    assert round(pct_change(110, 100), 2) == 10.0
    assert pct_change(90, 100) == -10.0
    assert pct_change(None, 100) is None
    assert round(yoy([100, 100, 100, 100, 120]), 2) == 20.0


def test_cagr_and_margin():
    assert round(cagr(100, 144, 2), 2) == 20.0
    assert round(margin(25, 100), 2) == 25.0
    assert margin(1, 0) is None


def test_position_in_range():
    assert position_pct(75, 50, 100) == 50.0
    assert position_pct(100, 50, 100) == 100.0
    assert position_pct(40, 50, 100) == 0.0


def test_index_series_base_100():
    rows = [{"date": "2026-01-01", "close": 100}, {"date": "2026-01-02", "close": 110}]
    assert index_series(rows) == [{"date": "2026-01-01", "value": 100.0}, {"date": "2026-01-02", "value": 110.0}]


def test_trend_label_streak():
    assert trend_label([1, 2, 3, 4]) == "naik 3 periode beruntun"
    assert trend_label([4, 3, 2]) == "turun 2 periode beruntun"
    assert trend_label([1]) == "data terbatas"


def test_median_top_share_adv_net():
    assert median([1, 2, 3, 4]) == 2.5
    assert median([1, 3, 5]) == 3
    assert round(top_share([50, 30, 20, 10], 3), 1) == 90.9
    rows = [{"value": 1e9}, {"value": 3e9}]
    assert adv_value(rows) == 2e9
    assert net_sum([{"net": 5}, {"net": -2}, {"net": 3}], "net", 2) == 1


def test_format_id():
    assert fmt_num(13.2) == "13,2"
    assert fmt_pct(5.7) == "5,7%"
    assert fmt_pct(8, sign=True) == "+8,0%"
    assert fmt_idr(1.2e12) == "Rp1,2 T"
    assert fmt_idr(-2.5e9) == "Rp-2,5 M"
    assert fmt_date_short("2026-09-05") == "05 Sep 2026"