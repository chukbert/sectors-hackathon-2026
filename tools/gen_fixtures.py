#!/usr/bin/env python3
"""Generate deterministic Sectors-API-shaped fixtures for IDXMACA demo mode.

Usage:  python3 tools/gen_fixtures.py
Output: fixtures/sectors/*.json
"""
from __future__ import annotations

import json
import math
import random
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "fixtures" / "sectors"
TODAY = date(2026, 9, 23)
LAST_TRADING = date(2026, 9, 22)


def rng(key: str) -> random.Random:
    return random.Random(f"idxmaca::{key}")


def d2s(d: date) -> str:
    return d.isoformat()


def trading_days(end: date, n: int) -> list[date]:
    days: list[date] = []
    cur = end
    while len(days) < n:
        if cur.weekday() < 5:
            days.append(cur)
        cur -= timedelta(days=1)
    return list(reversed(days))


QPERIODS = [
    ("2024-Q3", date(2024, 9, 30)), ("2024-Q4", date(2024, 12, 31)),
    ("2025-Q1", date(2025, 3, 31)), ("2025-Q2", date(2025, 6, 30)),
    ("2025-Q3", date(2025, 9, 30)), ("2025-Q4", date(2025, 12, 31)),
    ("2026-Q1", date(2026, 3, 31)), ("2026-Q2", date(2026, 6, 30)),
]

BANKS = ["BBCA", "BMRI", "BBRI", "BBNI", "BRIS", "ARTO"]
MINERS = ["BUMI", "ADRO", "PTBA", "ITMG", "HRUM", "INDY", "ANTM", "MDKA"]
DISTRESSED = ["WSKT", "BNBR", "GIAA", "ENRG"]
OTHERS = ["TLKM", "ASII", "UNVR", "ICBP", "GOTO", "AADI", "MEDC", "INCO", "SMGR", "KLBF"]
ALL_IDX = BANKS + MINERS + DISTRESSED + OTHERS

META: dict[str, dict] = {}


def company_meta(sym: str) -> dict:
    if sym in META:
        return META[sym]
    table = {
        "BBCA": ("Bank Central Asia Tbk.", "Financials", "Banks", "Bank", 9875, 1215.0),
        "BMRI": ("Bank Mandiri (Persero) Tbk.", "Financials", "Banks", "Bank", 6050, 565.0),
        "BBRI": ("Bank Rakyat Indonesia (Persero) Tbk.", "Financials", "Banks", "Bank", 4520, 685.0),
        "BBNI": ("Bank Negara Indonesia (Persero) Tbk.", "Financials", "Banks", "Bank", 4980, 186.0),
        "BRIS": ("Bank Syariah Indonesia Tbk.", "Financials", "Banks", "Bank Syariah", 2740, 126.0),
        "ARTO": ("Bank Jago Tbk.", "Financials", "Banks", "Bank Digital", 2280, 31.6),
        "BUMI": ("Bumi Resources Tbk.", "Energy", "Energy", "Coal", 138, 51.2),
        "ADRO": ("Alamtri Resources Indonesia Tbk.", "Energy", "Energy", "Coal", 2410, 74.3),
        "PTBA": ("Bukit Asam Tbk.", "Energy", "Energy", "Coal", 2870, 33.0),
        "ITMG": ("Indo Tambangraya Megah Tbk.", "Energy", "Energy", "Coal", 25400, 28.7),
        "HRUM": ("Harum Energy Tbk.", "Energy", "Energy", "Coal", 1185, 15.9),
        "INDY": ("Indika Energy Tbk.", "Energy", "Energy", "Coal", 1520, 7.9),
        "ANTM": ("Aneka Tambang Tbk.", "Basic Materials", "Basic Materials", "Gold & Nickel", 1665, 40.0),
        "MDKA": ("Merdeka Copper Gold Tbk.", "Basic Materials", "Basic Materials", "Copper & Gold", 1860, 45.1),
        "INCO": ("Vale Indonesia Tbk.", "Basic Materials", "Basic Materials", "Nickel", 3760, 37.3),
        "MEDC": ("Medco Energi Internasional Tbk.", "Energy", "Energy", "Oil & Gas", 1385, 34.8),
        "WSKT": ("Waskita Karya (Persero) Tbk.", "Infrastructure", "Infrastructure", "Construction", 178, 2.1),
        "BNBR": ("Bakrie & Brothers Tbk.", "Industrials", "Industrials", "Conglomerate", 96, 3.0),
        "GIAA": ("Garuda Indonesia (Persero) Tbk.", "Transportation", "Transportation", "Airlines", 402, 10.4),
        "ENRG": ("Energi Mega Persada Tbk.", "Energy", "Energy", "Oil & Gas", 214, 5.5),
        "TLKM": ("Telkom Indonesia (Persero) Tbk.", "Telecommunications", "Telecommunications", "Telco", 3120, 309.0),
        "ASII": ("Astra International Tbk.", "Consumer Cyclicals", "Consumer Cyclicals", "Automotive", 5150, 208.0),
        "UNVR": ("Unilever Indonesia Tbk.", "Consumer Non-Cyclicals", "Consumer Non-Cyclicals", "Household", 1420, 54.2),
        "ICBP": ("Indofood CBP Sukses Makmur Tbk.", "Consumer Non-Cyclicals", "Consumer Non-Cyclicals", "Food", 11450, 133.5),
        "GOTO": ("GoTo Gojek Tokopedia Tbk.", "Technology", "Technology", "Internet", 71, 82.6),
        "AADI": ("Adaro Andalan Indonesia Tbk.", "Energy", "Energy", "Coal", 6890, 96.5),
        "SMGR": ("Semen Indonesia (Persero) Tbk.", "Basic Materials", "Basic Materials", "Cement", 3150, 21.2),
        "KLBF": ("Kalbe Farma Tbk.", "Healthcare", "Healthcare", "Pharma", 1350, 63.3),
    }
    name, sector, sub_sector, sub_industry, price, cap_t = table[sym]
    META[sym] = {
        "symbol": sym, "name": name, "sector": sector, "sub_sector": sub_sector,
        "sub_industry": sub_industry, "listing_board": "Main", "price": float(price),
        "market_cap_trn": cap_t,
        "listing_date": "1990-01-01" if sym in ("BBCA", "BMRI", "BBRI") else "2005-06-15",
    }
    return META[sym]


FUNDAMENTALS = {
    "BBCA": dict(pe=13.2, pb=3.1, roe=16.4, der=0.4, yield_=5.7, eps=748, growth=6.8, npl=1.9, casa=81.0, nim=5.7, ldr=74.0),
    "BMRI": dict(pe=11.3, pb=2.2, roe=14.1, der=0.5, yield_=6.1, eps=535, growth=8.2, npl=2.1, casa=74.0, nim=5.1, ldr=90.0),
    "BBRI": dict(pe=11.9, pb=2.4, roe=15.8, der=0.6, yield_=4.9, eps=380, growth=5.1, npl=2.9, casa=67.0, nim=7.4, ldr=97.0),
    "BBNI": dict(pe=10.8, pb=1.8, roe=13.2, der=0.5, yield_=6.4, eps=461, growth=4.4, npl=2.2, casa=70.0, nim=4.4, ldr=88.0),
    "BRIS": dict(pe=12.5, pb=2.0, roe=18.3, der=0.4, yield_=3.8, eps=219, growth=12.6, npl=2.0, casa=61.0, nim=5.6, ldr=82.0),
    "ARTO": dict(pe=21.4, pb=4.2, roe=9.6, der=0.3, yield_=2.1, eps=107, growth=24.0, npl=1.6, casa=58.0, nim=6.9, ldr=70.0),
    "BUMI": dict(pe=6.4, pb=0.8, roe=11.0, der=0.7, yield_=1.4, eps=21, growth=-3.0, npl=None, casa=None, nim=None, ldr=None),
    "ADRO": dict(pe=5.9, pb=1.1, roe=18.5, der=0.3, yield_=8.1, eps=408, growth=-6.2, npl=None, casa=None, nim=None, ldr=None),
    "PTBA": dict(pe=7.2, pb=1.3, roe=17.8, der=0.2, yield_=9.4, eps=398, growth=-4.1, npl=None, casa=None, nim=None, ldr=None),
    "ITMG": dict(pe=6.1, pb=1.4, roe=22.4, der=0.1, yield_=7.2, eps=4164, growth=-2.8, npl=None, casa=None, nim=None, ldr=None),
    "HRUM": dict(pe=9.8, pb=1.0, roe=10.2, der=0.4, yield_=2.6, eps=121, growth=3.4, npl=None, casa=None, nim=None, ldr=None),
    "INDY": dict(pe=8.6, pb=0.6, roe=7.1, der=0.6, yield_=3.1, eps=177, growth=1.2, npl=None, casa=None, nim=None, ldr=None),
    "ANTM": dict(pe=14.2, pb=1.6, roe=11.4, der=0.2, yield_=2.4, eps=117, growth=9.8, npl=None, casa=None, nim=None, ldr=None),
    "MDKA": dict(pe=28.4, pb=2.1, roe=7.6, der=0.8, yield_=0.0, eps=65, growth=15.1, npl=None, casa=None, nim=None, ldr=None),
    "INCO": dict(pe=12.8, pb=1.1, roe=8.7, der=0.1, yield_=2.9, eps=294, growth=-8.4, npl=None, casa=None, nim=None, ldr=None),
    "MEDC": dict(pe=4.8, pb=0.7, roe=14.6, der=1.6, yield_=2.2, eps=289, growth=6.5, npl=None, casa=None, nim=None, ldr=None),
    "WSKT": dict(pe=None, pb=0.3, roe=-42.0, der=4.8, yield_=0.0, eps=-385, growth=-18.0, npl=None, casa=None, nim=None, ldr=None),
    "BNBR": dict(pe=None, pb=0.4, roe=-12.4, der=2.1, yield_=0.0, eps=-16, growth=-4.0, npl=None, casa=None, nim=None, ldr=None),
    "GIAA": dict(pe=None, pb=0.2, roe=-58.0, der=6.2, yield_=0.0, eps=-187, growth=-9.0, npl=None, casa=None, nim=None, ldr=None),
    "ENRG": dict(pe=6.9, pb=0.5, roe=6.2, der=0.9, yield_=0.0, eps=31, growth=-1.0, npl=None, casa=None, nim=None, ldr=None),
    "TLKM": dict(pe=11.4, pb=2.1, roe=18.9, der=0.5, yield_=6.5, eps=274, growth=2.6, npl=None, casa=None, nim=None, ldr=None),
    "ASII": dict(pe=6.9, pb=1.0, roe=14.2, der=0.4, yield_=6.8, eps=746, growth=4.1, npl=None, casa=None, nim=None, ldr=None),
    "UNVR": dict(pe=15.8, pb=18.0, roe=112.0, der=1.1, yield_=8.2, eps=90, growth=-9.4, npl=None, casa=None, nim=None, ldr=None),
    "ICBP": dict(pe=12.6, pb=2.0, roe=16.1, der=0.8, yield_=3.2, eps=909, growth=3.8, npl=None, casa=None, nim=None, ldr=None),
    "GOTO": dict(pe=None, pb=1.4, roe=-6.2, der=0.1, yield_=0.0, eps=-3, growth=32.0, npl=None, casa=None, nim=None, ldr=None),
    "AADI": dict(pe=5.2, pb=1.6, roe=31.0, der=0.2, yield_=6.4, eps=1325, growth=-2.2, npl=None, casa=None, nim=None, ldr=None),
    "SMGR": dict(pe=9.4, pb=0.5, roe=5.1, der=0.5, yield_=4.2, eps=335, growth=-7.8, npl=None, casa=None, nim=None, ldr=None),
    "KLBF": dict(pe=17.6, pb=2.2, roe=13.1, der=0.2, yield_=3.1, eps=77, growth=5.4, npl=None, casa=None, nim=None, ldr=None),
}

SECTORS_BY_SYM = {s: company_meta(s)["sub_sector"] for s in ALL_IDX}


def gen_report(sym: str) -> dict:
    m = company_meta(sym)
    f = FUNDAMENTALS[sym]
    r = rng(f"report::{sym}")
    close = m["price"]
    high = round(close * r.uniform(1.05, 1.25), 0)
    low = round(close * r.uniform(0.72, 0.9), 0)
    hist = []
    base_pe = (f["pe"] or 14.0) * r.uniform(0.82, 0.95)
    for i in range(60):
        d = date(2026, 9, 1) - timedelta(days=30 * (59 - i))
        drift = i / 59 * ((f["pe"] or 14.0) - base_pe)
        hist.append({"month": d.strftime("%Y-%m"), "pe": round(base_pe + drift + r.uniform(-0.28, 0.28), 2),
                     "pb": round(max(0.2, (f["pb"] or 2.0) * r.uniform(0.85, 1.02)), 2)})
    bad = sym in DISTRESSED
    years = []
    rev0 = {"Banks": 58000e9, "Energy": 42000e9}.get(m["sector"], 30000e9) * r.uniform(0.6, 1.6)
    for i, y in enumerate(range(2021, 2027)):
        g = (f["growth"] or 4.0) / 100
        rev = rev0 * ((1 + g) ** (i - 5 + 5))
        rev = rev0 * (1 + g * (i - 5) / 5) ** (i - 5 + 5) if False else rev0 * ((1 + g) ** (i - 5))
        ni = rev * r.uniform(0.08, 0.24)
        if bad:
            ni = -abs(ni) if y >= 2025 else ni * 0.5
        years.append({
            "year": y,
            "revenue": round(rev),
            "net_income": round(ni),
            "total_assets": round(rev * r.uniform(1.4, 6.0)),
            "total_equity": round(-abs(rev * 0.12) if bad and y >= 2025 else rev * r.uniform(0.5, 0.9)),
            "total_liabilities": round(rev * r.uniform(1.0, 5.0)),
            "operating_cash_flow": round(-abs(ni) * 0.4 if bad else ni * r.uniform(0.9, 1.4)),
            "eps": round((ni / (rev / (f["eps"] or 100) * 1e9 / 1e9)) if f["eps"] else 100, 1),
        })
    ebitda = (years[-1]["net_income"] * r.uniform(1.4, 2.2)) if years[-1]["net_income"] else None
    div_hist = [
        {"year": y, "dps": round(max(0.0, (f["yield_"] or 0) / 100 * close * r.uniform(0.6, 1.3)), 1),
         "payout_ratio": round(r.uniform(0.25, 0.75), 2)} for y in range(2021, 2027)
    ]
    mgmt = [
        {"name": f"Direktur Utama {sym}", "position": "Presiden Direktur", "shares": round(r.uniform(2e6, 4e7)),
         "ownership_pct": round(r.uniform(0.01, 0.9), 2)},
        {"name": f"Direktur Keuangan {sym}", "position": "Direktur", "shares": round(r.uniform(1e6, 1.5e7)),
         "ownership_pct": round(r.uniform(0.005, 0.4), 2)},
    ]
    if sym == "BMRI":
        mgmt[0]["shares"] = int(5.1e9 / close)
        mgmt[0]["ownership_pct"] = 0.05
    holder = {"BBCA": [("PT Dwimuria Investama Andalan", 54.94), ("Publik", 30.1), ("Asing", 14.96)],
              "BMRI": [("Pemerintah RI", 52.0), ("Publik", 33.0), ("Asing", 15.0)],
              "BBRI": [("Pemerintah RI", 53.19), ("Publik", 30.0), ("Asing", 16.81)],
              "BBNI": [("Pemerintah RI", 60.0), ("Publik", 25.0), ("Asing", 15.0)]}.get(
        sym, [(f"Pengendali {sym}", round(r.uniform(35, 70), 2)), ("Publik", round(r.uniform(20, 40), 2)),
              ("Asing", round(r.uniform(5, 20), 2))])
    ownership = {
        "shareholders": [{"name": n, "pct": p, "type": "corporate" if i == 0 else "public"} for i, (n, p) in enumerate(holder)],
        "foreign_pct": next(p for n, p in holder if n == "Asing"),
        "free_float_pct": {"BBCA": 30.1, "BMRI": 33.0, "BBRI": 30.0, "BBNI": 25.0}.get(sym, round(r.uniform(8, 45), 2)),
        "controlling_pct": holder[0][1],
        "affiliates": [f"Anak usaha {sym} 1", f"Anak usaha {sym} 2"],
    }
    segments = []
    if m["sector"] == "Banks":
        segments = [{"segment": "Kredit Korporasi", "share": round(r.uniform(30, 45), 1)},
                    {"segment": "Kredit Ritel/Konsumer", "share": round(r.uniform(25, 40), 1)},
                    {"segment": "Treasury & Lainnya", "share": round(r.uniform(10, 25), 1)}]
    elif m["sector"] == "Energy":
        segments = [{"segment": "Batu bara", "share": round(r.uniform(60, 85), 1)},
                    {"segment": "Emas/Nikel", "share": round(r.uniform(5, 20), 1)},
                    {"segment": "Jasa & Lainnya", "share": round(r.uniform(5, 20), 1)}]
    else:
        seg_names = ["Segmen Utama", "Segmen Kedua", "Segmen Lainnya"]
        shares = sorted([r.uniform(15, 60) for _ in range(3)], reverse=True)
        tot = sum(shares)
        segments = [{"segment": n, "share": round(s / tot * 100, 1)} for n, s in zip(seg_names, shares)]
    overview = {
        "close": close, "change_pct": round(r.uniform(-2.5, 3.5), 2), "market_cap": round(m["market_cap_trn"] * 1e12),
        "52w_high": high, "52w_low": low, "volume_avg_30d": round(r.uniform(2e7, 9e8)),
        "value_avg_30d": round(r.uniform(5e10, 9e11)), "employees": round(r.uniform(2000, 120000)),
        "description": f"{m['name']} — emiten {m['sub_sector']} di BEI.",
        "address": "Jakarta, Indonesia", "website": f"https://www.{sym.lower()}.co.id",
    }
    peers = [p for p in ALL_IDX if company_meta(p)["sub_sector"] == m["sub_sector"] and p != sym][:6]
    return {
        "overview": overview,
        "valuation": {"pe_ttm": f["pe"], "pb": f["pb"], "ps": round(r.uniform(0.5, 6), 2),
                      "ev_ebitda": round(ebitda / (years[-1]["revenue"] * 0.3), 1) if ebitda else None,
                      "dividend_yield": f["yield_"], "earnings_yield": round(100 / f["pe"], 2) if f["pe"] else None,
                      "history": hist, "pe_mean_5y": round(sum(h["pe"] for h in hist) / len(hist), 2),
                      "pe_std_5y": round(math.sqrt(sum((h["pe"] - sum(x["pe"] for x in hist) / len(hist)) ** 2 for h in hist) / len(hist)), 2)},
        "financials": {"annual": years,
                       "ratios": {"roe": f["roe"], "der": f["der"], "current_ratio": round(r.uniform(0.8, 2.6), 2),
                                  "interest_coverage": round(r.uniform(1.1, 12.0), 1) if not bad else 0.4,
                                  "gross_margin": round(r.uniform(18, 55), 1), "net_margin": round(r.uniform(4, 28), 1)}},
        "dividend": {"yield": f["yield_"], "payout_ratio": div_hist[-1]["payout_ratio"], "dps_last": div_hist[-1]["dps"],
                     "history": div_hist},
        "future": {"estimates": [{"year": y, "revenue_est": round(years[-1]["revenue"] * (1 + 0.06) ** (y - 2026)),
                                  "earnings_est": round((years[-1]["net_income"] or 1e11) * (1 + 0.07) ** (y - 2026))}
                                 for y in (2026, 2027)]},
        "management": mgmt,
        "ownership": ownership,
        "segments": segments,
        "peers": peers,
    }


def gen_quarterly(sym: str) -> list[dict]:
    f = FUNDAMENTALS[sym]
    m = company_meta(sym)
    r = rng(f"q::{sym}")
    base = {"Banks": 14000e9, "Energy": 9000e9}.get(m["sector"], 7000e9) * r.uniform(0.7, 1.7)
    dbase = date(2024, 7, 1)
    out = []
    for i, (period, rd) in enumerate(QPERIODS):
        rev = base * ((1 + (f["growth"] or 4) / 100 / 4) ** i) * r.uniform(0.97, 1.04)
        ni = rev * r.uniform(0.10, 0.28)
        if sym in DISTRESSED and i >= 5:
            ni = -abs(ni) * 0.6
        row = {
            "period": period, "report_date": d2s(rd), "revenue": round(rev), "net_income": round(ni),
            "eps": round(ni / 1e10, 1), "total_assets": round(rev * r.uniform(2.0, 6.0)),
            "total_equity": round(rev * r.uniform(0.4, 1.0) * (-1 if sym in DISTRESSED and i >= 5 else 1)),
            "total_liabilities": round(rev * r.uniform(1.5, 5.0)),
            "operating_cash_flow": round(-abs(ni) * 0.5 if sym in DISTRESSED and i >= 5 else ni * r.uniform(0.7, 1.3)),
            "gross_profit": round(rev * r.uniform(0.2, 0.5)),
        }
        if f["nim"]:
            row.update({"nim": round(f["nim"] + r.uniform(-0.4, 0.4), 2),
                        "npl": round((f["npl"] or 2.0) + r.uniform(-0.3, 0.5), 2),
                        "casa": round((f["casa"] or 70) + r.uniform(-2, 2), 1),
                        "ldr": round((f["ldr"] or 85) + r.uniform(-3, 3), 1),
                        "net_interest_income": round(rev * r.uniform(0.55, 0.75)),
                        "loan_loss_provision": round(rev * r.uniform(0.02, 0.06))})
        out.append(row)
    return out


def gen_daily(sym: str) -> list[dict]:
    m = company_meta(sym)
    r = rng(f"daily::{sym}")
    days = trading_days(LAST_TRADING, 90)
    px = m["price"] * r.uniform(0.85, 0.95)
    out = []
    shock = {"BBCA": (60, 0.03), "BMRI": (75, -0.02), "BBRI": (30, 0.05)}.get(sym)
    for i, d in enumerate(days):
        drift = r.uniform(-0.012, 0.013)
        px = max(20.0, px * (1 + drift))
        if shock and d == days[shock[0]]:
            px *= (1 + shock[1])
        hi = px * (1 + abs(r.uniform(0, 0.015)))
        lo = px * (1 - abs(r.uniform(0, 0.015)))
        vol = round(r.uniform(1e7, 6e8) * (1 + (0.9 if i > 80 else 0)))
        out.append({"date": d2s(d), "open": round(lo * 1.002, 1), "high": round(hi, 1), "low": round(lo, 1),
                    "close": round(px, 1), "volume": vol, "value": round(vol * px)})
    out[-1]["close"] = m["price"]
    return out


def gen_index_daily() -> dict[str, list[dict]]:
    out = {}
    for code, start, drift in (("IHSG", 7250, 0.0006), ("LQ45", 940, 0.0004), ("IDX30", 520, 0.0005), ("IDXENERGY", 1890, 0.0011)):
        r = rng(f"idx::{code}")
        px = start
        rows = []
        for d in trading_days(LAST_TRADING, 90):
            px *= (1 + r.uniform(-0.009, 0.01) + drift)
            rows.append({"date": d2s(d), "close": round(px, 2), "volume": round(r.uniform(1e9, 9e9))})
        out[code] = rows
    return out


def gen_foreign_flow() -> dict:
    r = rng("foreign")
    days = trading_days(LAST_TRADING, 14)
    per = {}
    for sym in ALL_IDX:
        m = company_meta(sym)
        base = m["market_cap_trn"] * 1e12 * 0.0004
        rows = []
        for d in days:
            net = r.uniform(-base, base)
            if sym in ("BBCA", "BMRI", "BBRI"):
                net = -abs(net) * (1.6 if d >= days[-3] else 1.0)
            rows.append({"date": d2s(d), "foreign_buy": round(abs(net) + r.uniform(1e9, 5e9) * 0.2),
                         "foreign_sell": round(abs(net) * (1.4 if net < 0 else 0.4) + r.uniform(1e9, 4e9) * 0.2),
                         "net": round(net), "foreign_pct": round(r.uniform(8, 30), 2)})
        per[sym] = rows
    return {"per_symbol": per,
            "universe": [{"symbol": s, "net_5d": round(sum(x["net"] for x in per[s][-5:])),
                          "net_1d": per[s][-1]["net"], "foreign_pct": per[s][-1]["foreign_pct"]} for s in ALL_IDX]}


BROKERS = {
    "ZP": {"name": "Maybank Sekuritas", "type": "asing", "category": "institusi"},
    "AK": {"name": "Mirae Asset Sekuritas", "type": "domestik", "category": "institusi"},
    "DX": {"name": "Bahana Sekuritas", "type": "asing", "category": "institusi"},
    "BK": {"name": "J.P. Morgan Sekuritas", "type": "asing", "category": "institusi"},
    "CC": {"name": "Mandiri Sekuritas", "type": "domestik", "category": "institusi"},
    "YP": {"name": "Binaartha Sekuritas", "type": "domestik", "category": "ritel"},
    "NI": {"name": "BNI Sekuritas", "type": "domestik", "category": "institusi"},
    "OD": {"name": "BRI Danareksa Sekuritas", "type": "domestik", "category": "institusi"},
    "MG": {"name": "Semesta Indovest", "type": "domestik", "category": "ritel"},
    "CS": {"name": "Credit Suisse Sekuritas", "type": "asing", "category": "institusi"},
    "KZ": {"name": "CLSA Sekuritas", "type": "asing", "category": "institusi"},
    "PD": {"name": "Indo Premier Sekuritas", "type": "domestik", "category": "institusi"},
}


def gen_broker() -> dict:
    r = rng("broker")
    summary, top_buyers, top_sellers = {}, {}, {}
    for sym in ALL_IDX:
        rows = []
        for code, meta in BROKERS.items():
            buy = r.uniform(0, 9e10) * (3.4 if (sym in ("BBCA", "BMRI", "BBRI") and code in ("ZP", "AK", "DX")) else 1)
            sell = r.uniform(0, 8e10) * (2.8 if (sym in ("BBCA", "BMRI", "BBRI") and code in ("BK", "CC")) else 1)
            if sym in ("BBCA", "BMRI", "BBRI"):
                if code == "ZP":
                    buy = {"BBCA": 4.2e11, "BMRI": 2.1e11, "BBRI": 1.4e11}[sym]
                    sell = buy * 0.12
                if code == "AK":
                    buy = {"BBCA": 3.1e11, "BMRI": 1.9e11, "BBRI": 2.4e11}[sym]
                    sell = buy * 0.2
                if code == "DX":
                    buy = {"BBCA": 1.5e11, "BMRI": 0.9e11, "BBRI": 1.1e11}[sym]
                    sell = buy * 0.25
                if code == "BK":
                    sell = {"BBCA": 2.8e11, "BMRI": 1.4e11, "BBRI": 2.0e11}[sym]
                    buy = sell * 0.15
                if code == "CC":
                    sell = {"BBCA": 1.9e11, "BMRI": 1.2e11, "BBRI": 2.6e11}[sym]
                    buy = sell * 0.3
            if buy < 1e9 and sell < 1e9:
                continue
            rows.append({"broker": code, "broker_name": meta["name"], "type": meta["type"], "category": meta["category"],
                         "buy_value": round(buy), "sell_value": round(sell), "net_value": round(buy - sell),
                         "buy_volume": round(buy / 1000), "sell_volume": round(sell / 1000),
                         "freq": round(r.uniform(500, 90000))})
        rows.sort(key=lambda x: -x["buy_value"])
        summary[sym] = rows
        top_buyers[sym] = sorted(rows, key=lambda x: -x["buy_value"])[:5]
        top_sellers[sym] = sorted(rows, key=lambda x: x["net_value"])[:5]
    daily_top = []
    for d in trading_days(LAST_TRADING, 14):
        for code, meta in list(BROKERS.items())[:8]:
            daily_top.append({"date": d2s(d), "broker": code, "broker_name": meta["name"], "type": meta["type"],
                              "buy_value": round(r.uniform(3e11, 2.4e12)), "sell_value": round(r.uniform(3e11, 2.2e12)),
                              "net_value": round(r.uniform(-8e11, 9e11))})
    activity = {}
    for code in BROKERS:
        rows = []
        for sym in ALL_IDX:
            for s in summary[sym]:
                if s["broker"] == code:
                    rows.append({"symbol": sym, "buy_value": s["buy_value"], "sell_value": s["sell_value"],
                                 "net_value": s["net_value"]})
        activity[code] = sorted(rows, key=lambda x: -abs(x["net_value"]))[:10]
    return {"registry": BROKERS, "summary": summary, "top_buyers": top_buyers, "top_sellers": top_sellers,
            "daily_top": daily_top, "activity": activity}


def gen_events() -> dict:
    r = rng("events")
    ca, filings, susp, news = {}, {}, {}, {}
    for sym in ALL_IDX:
        m = company_meta(sym)
        ex = LAST_TRADING + timedelta(days=r.randint(3, 60))
        ca[sym] = [{"type": "dividend", "ex_date": d2s(ex), "cum_date": d2s(ex - timedelta(days=2)),
                    "payment_date": d2s(ex + timedelta(days=14)), "amount": round(m["price"] * r.uniform(0.01, 0.06)),
                    "status": "announced", "description": f"Dividen interim {sym}"},
                   {"type": "buyback", "ex_date": d2s(LAST_TRADING - timedelta(days=r.randint(5, 40))),
                    "cum_date": None, "payment_date": None, "amount": round(r.uniform(1e11, 9e11)),
                    "status": "active", "description": f"Program buyback {sym}"}]
        fl = []
        sell_names = {"BMRI", "WSKT", "BNBR", "GIAA", "ADRO"}
        for i in range(r.randint(1, 3)):
            is_bad = sym == "BMRI" and i == 0
            is_sell = is_bad or (sym in sell_names and i % 2 == 0)
            fl.append({"date": d2s(LAST_TRADING - timedelta(days=r.randint(2, 80))),
                       "type": "insider", "title": f"Transaksi insider {sym}",
                       "person": f"Direksi {sym}" if not is_bad else "Direktur Utama BMRI",
                       "action": "sell" if is_sell else "buy",
                       "value": 5.1e9 if is_bad else round(r.uniform(1e8, 8e9)),
                       "shares": round(5.1e9 / m["price"]) if is_bad else round(r.uniform(1e4, 2e6)),
                       "pdf_url": f"https://www.idx.co.id/keterbukaan/{sym}-insider-{i}.pdf"})
        if sym in DISTRESSED:
            fl.insert(0, {"date": d2s(LAST_TRADING - timedelta(days=r.randint(10, 120))), "type": "financial_report",
                          "title": f"Keterlambatan penyampaian LK {sym}", "person": "Perseroan", "action": None,
                          "value": None, "shares": None, "pdf_url": f"https://www.idx.co.id/keterbukaan/{sym}-late.pdf"})
        filings[sym] = fl
        susp[sym] = []
        if sym in ("WSKT", "BNBR", "GIAA"):
            susp[sym].append({"start": d2s(LAST_TRADING - timedelta(days=r.randint(20, 120))), "end": None,
                              "reason": "Permintaan keterangan atas fluktuasi harga" if sym != "WSKT" else "Penundaan kewajiban pembayaran utang",
                              "pdf_url": f"https://www.idx.co.id/pengumuman/{sym}-suspensi.pdf", "active": True})
        if sym == "BUMI":
            susp[sym].append({"start": "2024-06-10", "end": "2024-06-14", "reason": "UMA", "pdf_url": "https://www.idx.co.id/uma.pdf", "active": False})
        tags = [company_meta(sym)["sub_sector"].lower(), "emiten"]
        news[sym] = [{"date": d2s(LAST_TRADING - timedelta(days=r.randint(0, 30))),
                      "title": f"{m['name']} laporkan kinerja kuartalan", "source": "Bisnis.com",
                      "url": f"https://news.example.com/{sym.lower()}-kinerja",
                      "tags": [company_meta(sym)["sub_sector"].lower()]},
                     {"date": d2s(LAST_TRADING - timedelta(days=r.randint(0, 30))),
                      "title": f"Analis soroti valuasi {sym}", "source": "Kontan",
                      "url": f"https://news.example.com/{sym.lower()}-valuasi", "tags": ["valuasi"]}]
        if sym in ("BBCA", "BMRI", "BBRI"):
            news[sym].append({"date": d2s(LAST_TRADING - timedelta(days=4)),
                              "title": f"Asing catat net sell di saham bank besar, {sym} terdampak",
                              "source": "Bloomberg Technoz", "url": "https://news.example.com/asing-net-sell",
                              "tags": ["asing", "flow", "bank"]})
    return {"corporate_actions": ca,
            "calendar": [{"date": d2s(LAST_TRADING + timedelta(days=i)), "event": ev}
                         for i, ev in enumerate(["RUPS Tahunan BBCA", "Ex-date dividen BBRI", "Listing perdana emiten baru", "Publikasi LK Q3 mulai"], start=2)],
            "filings": filings, "suspensions": susp, "news": news}


def gen_screener() -> dict:
    rows = []
    r = rng("screener")
    for sym in ALL_IDX:
        m, f = company_meta(sym), FUNDAMENTALS[sym]
        rows.append({
            "symbol": sym, "name": m["name"], "sector": m["sector"], "sub_sector": m["sub_sector"],
            "sub_industry": m["sub_industry"], "price": m["price"], "market_cap": round(m["market_cap_trn"] * 1e12),
            "pe": f["pe"], "pb": f["pb"], "roe": f["roe"], "der": f["der"], "dividend_yield": f["yield_"],
            "revenue_growth_yoy": round(f["growth"] + r.uniform(-3, 3), 2),
            "earnings_growth_yoy": round((f["growth"] or 0) * r.uniform(0.6, 1.6), 2),
            "free_float_pct": {"BBCA": 30.1, "BMRI": 33.0, "BBRI": 30.0, "BBNI": 25.0}.get(sym, round(r.uniform(8, 45), 2)),
            "avg_daily_value_30d": round(r.uniform(1e10, 8e11)),
            "change_pct_1d": round(r.uniform(-4, 5), 2), "change_pct_30d": round(r.uniform(-12, 18), 2),
            "dividend_freq": "tahunan", "listing_date": m["listing_date"],
        })
    return {"companies": rows,
            "latest_quarterly_dates": [{"symbol": s, "period": "2026-Q2",
                                        "report_date": d2s(date(2026, 7, 25) + timedelta(days=(i % 25))),
                                        "is_latest": True} for i, s in enumerate(ALL_IDX)],
            "ipo_performance": [{"symbol": s, "listing_date": "2025-06-12", "ret_7d": round(r.uniform(-8, 22), 1),
                                 "ret_30d": round(r.uniform(-15, 45), 1), "ret_90d": round(r.uniform(-20, 80), 1),
                                 "ret_365d": round(r.uniform(-30, 130), 1), "sector": company_meta(s)["sector"]}
                                for s in ("AADI", "GOTO", "BRIS", "MDKA", "ARTO")]}


def gen_market() -> dict:
    r = rng("market")
    universe = []
    for sym in ALL_IDX:
        m = company_meta(sym)
        universe.append({"symbol": sym, "name": m["name"], "sector": m["sector"], "sub_sector": m["sub_sector"],
                         "close": m["price"], "change_pct": round(r.uniform(-5, 6), 2),
                         "market_cap": round(m["market_cap_trn"] * 1e12), "volume": round(r.uniform(1e7, 9e8)),
                         "value": round(r.uniform(1e10, 9e11))})
    sectors: dict[str, list[float]] = {}
    for u in universe:
        sectors.setdefault(u["sector"], []).append(u["change_pct"])
    sector_perf = [{"sector": s, "change_pct": round(sum(v) / len(v), 2)} for s, v in sectors.items()]
    for s in sector_perf:
        if s["sector"] == "Energy":
            s["change_pct"] = 1.4
        if s["sector"] == "Technology":
            s["change_pct"] = -1.8
    movers = {}
    for period in ("1d", "7d", "30d", "365d"):
        rows = [dict(u, ret=round(r.uniform(-9, 14), 2)) for u in universe]
        movers[f"gainers_{period}"] = sorted(rows, key=lambda x: -x["ret"])[:10]
        movers[f"losers_{period}"] = sorted(rows, key=lambda x: x["ret"])[:10]
    most_traded = sorted([dict(u, value=round(r.uniform(4e11, 2.4e12))) for u in universe], key=lambda x: -x["value"])[:10]
    return {"universe_close": {"date": d2s(LAST_TRADING), "rows": universe},
            "sector_performance": sector_perf,
            "index_daily": gen_index_daily(),
            "market_cap": {"total": round(11800e12), "date": d2s(LAST_TRADING),
                           "by_sector": [{"sector": s, "market_cap": round(r.uniform(200e12, 2600e12))} for s in sectors]},
            "movers": movers, "most_traded": most_traded}


def gen_mining() -> dict:
    r = rng("mining")
    names = {"BUMI": ("Bumi Resources", 78.0, "KPC/Arutmin"), "ADRO": ("Alamtri Resources", 92.0, "Adaro Indonesia"),
             "PTBA": ("Bukit Asam", 60.0, "Tanjung Enim"), "ITMG": ("Indo Tambangraya", 88.0, "Bontang"),
             "HRUM": ("Harum Energy", 70.0, "KPC"), "INDY": ("Indika Energy", 65.0, "Kideco"),
             "AADI": ("Adaro Andalan", 85.0, "Adaro Indonesia"), "ANTM": ("Aneka Tambang", 55.0, "Pongkor"),
             "MDKA": ("Merdeka Copper Gold", 48.0, "Tujuh Bukit"), "INCO": ("Vale Indonesia", 72.0, "Sorowako"),
             "MEDC": ("Medco Energi", 40.0, "Riau")}
    companies, detail, ownership, sites, production, licenses, auctions, financials, performance, contracts, exports, dest = (
        [], {}, {}, {}, {}, {}, [], {}, {}, {}, {}, {})
    for sym, (name, prod_mt, site) in names.items():
        m = company_meta(sym)
        company = {"symbol": sym, "name": name, "sector": "Energy" if m["sector"] == "Energy" else "Basic Materials",
                   "commodity": {"ADRO": "Coal", "AADI": "Coal", "PTBA": "Coal", "ITMG": "Coal", "HRUM": "Coal",
                                 "BUMI": "Coal", "INDY": "Coal", "ANTM": "Gold & Nickel", "MDKA": "Copper & Gold",
                                 "INCO": "Nickel", "MEDC": "Oil & Gas"}.get(sym, "Minerals"),
                   "market_cap": round(m["market_cap_trn"] * 1e12), "price": m["price"]}
        companies.append(company)
        detail[sym] = {**company, "pits": 3 if sym in MINERS[:4] else 1, "employees": round(r.uniform(1500, 20000)),
                       "listing_date": m["listing_date"], "profile": f"Produsen {company['commodity']} dengan operasi di {site}."}
        ownership[sym] = {"parents": [{"name": f"Grup {sym} Holding", "pct": round(r.uniform(51, 85), 2)},
                                      {"name": "Publik", "pct": round(r.uniform(15, 49), 2)}],
                          "subsidiaries": [{"name": f"{sym} Mining Unit", "pct": round(r.uniform(60, 100), 1)}],
                          "layers": 3 if sym in ("BUMI", "BNBR") else 1}
        sites[sym] = [{"name": site, "province": {"ADRO": "Kalimantan Selatan", "PTBA": "Sumatera Selatan",
                                                  "ITMG": "Kalimantan Timur", "INCO": "Sulawesi Selatan",
                                                  "MDKA": "Jawa Timur", "ANTM": "Banten", "BUMI": "Kalimantan Timur",
                                                  "AADI": "Kalimantan Selatan", "HRUM": "Kalimantan Timur",
                                                  "INDY": "Kalimantan Timur", "MEDC": "Riau"}.get(sym, "Kalimantan Timur"),
                      "lat": round(r.uniform(-8, 4), 4), "lon": round(r.uniform(96, 136), 4),
                      "status": "operasi", "area_ha": round(r.uniform(2000, 60000))}]
        production[sym] = [{"year": y, "volume_mt": round(prod_mt * ((1.03) ** (y - 2026)) * r.uniform(0.94, 1.06), 1),
                            "strip_ratio": round(r.uniform(3.5, 7.5), 2), "cash_cost_usd": round(r.uniform(28, 52), 1)}
                           for y in range(2021, 2027)]
        licenses[sym] = [{"type": "IUPK" if sym in ("BUMI", "ADRO") else "IUP", "number": f"IUP/{sym}/2020",
                          "holder": f"{sym} Mining Unit", "expiry": d2s(LAST_TRADING + timedelta(days=r.choice([200, 300, 700, 1500]))),
                          "status": "aktif", "area_ha": round(r.uniform(2000, 50000))} for _ in range(2)]
        if sym in ("BUMI", "ITMG"):
            licenses[sym][0]["expiry"] = d2s(LAST_TRADING + timedelta(days=r.randint(60, 300)))
        auctions.append({"id": f"WIUP-2026-{sym}", "commodity": company["commodity"], "location": "Kalimantan",
                         "status": r.choice(["pengumuman", "lelang", "pemenang ditetapkan"]),
                         "announced": d2s(LAST_TRADING - timedelta(days=r.randint(3, 40))),
                         "closing": d2s(LAST_TRADING + timedelta(days=r.randint(5, 60)))})
        financials[sym] = {"currency": "USD" if sym in ("ADRO", "ITMG", "INCO", "PTBA") else "IDR",
                           "annual": [{"year": y, "revenue": round(prod_mt * 1e6 * r.uniform(55, 120) * (1.05 ** (y - 2026))),
                                       "net_income": round(prod_mt * 1e6 * r.uniform(10, 35) * (1.05 ** (y - 2026))),
                                       "ebitda": round(prod_mt * 1e6 * r.uniform(25, 60) * (1.05 ** (y - 2026)))}
                                      for y in range(2021, 2027)]}
        performance[sym] = [{"year": y, "ret": round(r.uniform(-30, 60), 1)} for y in range(2021, 2027)]
        contracts[sym] = [{"contractor": f"Kontraktor {sym}", "type": "overburden removal", "value_usd": round(r.uniform(2e7, 4e8)),
                           "period": f"{2024}-{2027}"} for _ in range(2)]
        exports[sym] = [{"country": c, "share_pct": 0.0} for c in ("China", "India", "Japan", "Korea", "Lainnya")]
        shares = [r.uniform(20, 65), r.uniform(10, 25), r.uniform(5, 15), r.uniform(3, 12)]
        tot = sum(shares)
        for i, e in enumerate(exports[sym][:4]):
            e["share_pct"] = round(shares[i] / tot * 100, 1)
        exports[sym].append({"country": "Lainnya", "share_pct": round(100 - sum(e["share_pct"] for e in exports[sym][:4]), 1)})
        if sym in ("ADRO", "BUMI", "AADI"):
            exports[sym][0]["share_pct"] = 60.0
        dest[sym] = exports[sym]
    commodities = {}
    for c, base, yoy in (("Coal (HBA)", 118.5, 15.2), ("Nickel LME", 16420, -8.4), ("Gold", 2648, 22.0),
                         ("Tin", 33200, 11.5), ("Copper", 9840, 6.2), ("Crude Oil", 78.4, -3.1)):
        series = []
        for i in range(36):
            d = date(2026, 9, 1) - timedelta(days=30 * (35 - i))
            series.append({"month": d.strftime("%Y-%m"), "price": round(base * (1 + yoy / 100 / 36 * (i - 24)) * (1 + r.uniform(-0.03, 0.03)), 2)})
        commodities[c] = {"unit": "USD", "yoy_pct": yoy, "latest": series[-1]["price"], "series": series}
    return {"companies": companies, "detail": detail, "ownership": ownership, "sites": sites,
            "production": production, "licenses": licenses, "auctions": auctions, "financials": financials,
            "performance": performance, "contracts": contracts, "exports": exports, "sales_destination": dest,
            "commodities": commodities}


def gen_regional() -> dict:
    r = rng("regional")
    sgx = {
        "D05": {"name": "DBS Group Holdings", "exchange": "SGX", "price": 43.8, "currency": "SGD",
                "pe": 11.8, "pb": 1.9, "roe": 17.2, "dividend_yield": 5.2, "market_cap": 124.6e9},
        "U11": {"name": "United Overseas Bank", "exchange": "SGX", "price": 36.4, "currency": "SGD",
                "pe": 12.4, "pb": 1.7, "roe": 14.8, "dividend_yield": 4.6, "market_cap": 61.2e9},
        "O39": {"name": "OCBC Bank", "exchange": "SGX", "price": 19.2, "currency": "SGD",
                "pe": 11.2, "pb": 1.5, "roe": 13.9, "dividend_yield": 5.5, "market_cap": 86.4e9},
        "Z74": {"name": "Singtel", "exchange": "SGX", "price": 4.32, "currency": "SGD",
                "pe": 14.1, "pb": 2.4, "roe": 16.0, "dividend_yield": 3.9, "market_cap": 71.0e9},
    }
    klse = {
        "1155": {"name": "Malayan Banking (Maybank)", "exchange": "KLSE", "price": 10.62, "currency": "MYR",
                 "pe": 11.6, "pb": 1.3, "roe": 11.4, "dividend_yield": 5.6, "market_cap": 128.1e9},
        "1023": {"name": "CIMB Group", "exchange": "KLSE", "price": 7.44, "currency": "MYR",
                 "pe": 10.4, "pb": 1.2, "roe": 11.8, "dividend_yield": 5.1, "market_cap": 79.4e9},
        "1295": {"name": "Public Bank", "exchange": "KLSE", "price": 4.28, "currency": "MYR",
                 "pe": 12.8, "pb": 1.5, "roe": 12.2, "dividend_yield": 4.4, "market_cap": 83.0e9},
    }
    return {"sgx_companies": sgx, "klse_companies": klse,
            "sgx_short_sell": {sym: [{"date": d2s(d), "short_value": round(r.uniform(1e6, 3e7)),
                                      "short_pct": round(r.uniform(0.05, 1.4), 3)}
                                     for d in trading_days(LAST_TRADING, 30)] for sym in sgx},
            "sgx_buybacks": {sym: [{"date": d2s(LAST_TRADING - timedelta(days=r.randint(1, 30))),
                                    "shares": round(r.uniform(1e5, 3e6)), "value": round(r.uniform(2e6, 9e7)),
                                    "pct_of_issued": round(r.uniform(0.01, 0.3), 3)} for _ in range(3)] for sym in sgx},
            "sgx_filings": {sym: [{"date": d2s(LAST_TRADING - timedelta(days=r.randint(2, 45))),
                                   "title": f"{sym} share buyback notice", "type": "buyback",
                                   "person": "Company", "action": None, "value": round(r.uniform(1e6, 8e7))}
                                  for _ in range(2)] for sym in sgx},
            "sgx_news": {sym: [{"date": d2s(LAST_TRADING - timedelta(days=r.randint(0, 20))),
                                "title": f"{v['name']} posts steady quarter", "source": "Business Times",
                                "url": "https://news.example.com/sgx", "tags": ["bank", "regional"]}] for sym, v in sgx.items()},
            "klse_reports": {sym: {"report": v, "peers": list(klse.keys())} for sym, v in klse.items()}}


def gen_helpers() -> dict:
    subsectors = {}
    for sym in ALL_IDX:
        m = company_meta(sym)
        subsectors.setdefault(m["sub_sector"], {"slug": m["sub_sector"].lower().replace(" ", "-"),
                                                "symbols": []})["symbols"].append(sym)
    industries = {"Financials": BANKS, "Energy": MINERS + ["ENRG", "MEDC", "AADI"],
                  "Basic Materials": ["ANTM", "MDKA", "INCO", "SMGR"], "Infrastructure": ["WSKT"],
                  "Industrials": ["BNBR"], "Transportation": ["GIAA"], "Telecommunications": ["TLKM"],
                  "Consumer Cyclicals": ["ASII"], "Consumer Non-Cyclicals": ["UNVR", "ICBP"],
                  "Technology": ["GOTO"], "Healthcare": ["KLBF"]}
    return {"subsectors": subsectors, "industries": industries,
            "tags": ["dividend", "value", "growth", "blue-chip", "high-roe", "high-der", "syariah", "esg"],
            "subindustries": {k: v for k, v in subsectors.items()}}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    reports = {s: gen_report(s) for s in ALL_IDX}
    quarterly = {s: gen_quarterly(s) for s in ALL_IDX}
    daily = {s: gen_daily(s) for s in ALL_IDX}
    broker = gen_broker()
    events = gen_events()
    mining = gen_mining()
    regional = gen_regional()
    files = {
        "company_reports.json": reports,
        "quarterly.json": quarterly,
        "daily.json": daily,
        "market.json": gen_market(),
        "screener.json": gen_screener(),
        "flow.json": {"foreign": gen_foreign_flow(), "broker": broker},
        "events.json": events,
        "mining.json": mining,
        "regional.json": regional,
        "helpers.json": gen_helpers(),
        "meta.json": {"generated_at": datetime.utcnow().isoformat() + "Z", "last_trading_day": d2s(LAST_TRADING),
                      "symbols": ALL_IDX, "banks": BANKS, "miners": MINERS, "distressed": DISTRESSED,
                      "note": "Fixture demo mode IDXMACA - angka ilustrasi, bukan data real."},
    }
    for name, payload in files.items():
        (OUT / name).write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"wrote {name} ({len(json.dumps(payload)) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()