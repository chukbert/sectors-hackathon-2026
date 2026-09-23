"""Rule engine red-flag kredit (IO-38) — deterministik, tiap aturan membawa bukti."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class RuleHit:
    rule: str
    label: str
    weight: int
    triggered: bool
    detail: str
    values: dict[str, Any] = field(default_factory=dict)
    severity: str = "info"  # info | warn | critical

    def as_dict(self) -> dict[str, Any]:
        return {"rule": self.rule, "label": self.label, "weight": self.weight, "triggered": self.triggered,
                "detail": self.detail, "values": self.values, "severity": self.severity}


RULES: list[tuple[str, str, int, str]] = [
    ("equity_negative", "Ekuitas negatif", 30, "critical"),
    ("ocf_negative_profit", "Arus kas operasi negatif saat laba positif", 22, "critical"),
    ("suspension_active", "Suspensi BEI aktif", 20, "critical"),
    ("high_leverage", "DER di atas 2x", 16, "warn"),
    ("late_report", "Terlambat lapor LK kuartal", 14, "warn"),
    ("insider_sell", "Insider jual 90 hari terakhir", 12, "warn"),
    ("foreign_net_sell", "Asing net sell 5 hari", 8, "info"),
    ("low_float", "Free float di bawah 7,5%", 10, "warn"),
    ("broker_concentration", "Konsentrasi broker tinggi (top-3 > 75%)", 10, "warn"),
    ("drawdown_deep", "Drawdown 30 hari di atas 20%", 8, "info"),
]


def _last(rows: list[dict]) -> dict:
    return rows[-1] if rows else {}


def evaluate(sym: str, d: dict[str, Any]) -> list[RuleHit]:
    """d = data yang sudah di-fetch untuk simbol (quarterly, report, filings, suspensions, foreign, daily, broker)."""
    hits: list[RuleHit] = []
    quarterly = d.get("quarterly") or []
    last_q = _last(quarterly)
    ratios = ((d.get("report") or {}).get("sections", {}).get("financials", {}) or {}).get("ratios", {}) or {}

    equity = last_q.get("total_equity")
    ocf = last_q.get("operating_cash_flow")
    ni = last_q.get("net_income")
    hits.append(RuleHit(
        "equity_negative", "Ekuitas negatif", 30, bool(equity is not None and equity < 0),
        f"Ekuitas {last_q.get('period', '—')}: {_fmt_idr(equity)}" if equity is not None else "data ekuitas tidak tersedia",
        {"total_equity": equity, "period": last_q.get("period")},
        "critical" if equity is not None and equity < 0 else "info",
    ))
    hits.append(RuleHit(
        "ocf_negative_profit", "Arus kas operasi negatif saat laba positif", 22,
        bool(ocf is not None and ni is not None and ocf < 0 and ni > 0),
        f"OCF {_fmt_idr(ocf)} vs laba {_fmt_idr(ni)}" if ocf is not None and ni is not None else "data OCF tidak tersedia",
        {"ocf": ocf, "net_income": ni}, "critical" if (ocf is not None and ocf < 0 and (ni or 0) > 0) else "info",
    ))
    susp = d.get("suspensions") or []
    active = [s for s in susp if s.get("active")]
    hits.append(RuleHit(
        "suspension_active", "Suspensi BEI aktif", 20, bool(active),
        active[0].get("reason", "—") if active else "tidak ada suspensi aktif",
        {"count": len(susp), "active": len(active)}, "critical" if active else "info",
    ))
    der = ratios.get("der")
    hits.append(RuleHit(
        "high_leverage", "DER di atas 2x", 16, bool(der is not None and der > 2),
        f"DER {der}x" if der is not None else "data DER tidak tersedia", {"der": der},
        "warn" if der is not None and der > 2 else "info",
    ))
    late = d.get("late_report")
    hits.append(RuleHit(
        "late_report", "Terlambat lapor LK kuartal", 14, bool(late),
        d.get("late_report_detail") or ("belum rilis LK terbaru" if late else "rilis tepat waktu"),
        {"late": bool(late)}, "warn" if late else "info",
    ))
    filings = d.get("filings") or []
    sells = [f for f in filings if f.get("action") == "sell"]
    sell_value = sum(f.get("value") or 0 for f in sells)
    hits.append(RuleHit(
        "insider_sell", "Insider jual 90 hari terakhir", 12, bool(sells),
        f"{len(sells)} transaksi jual, total {_fmt_idr(sell_value)}" if sells else "tidak ada insider jual",
        {"count": len(sells), "value": sell_value}, "warn" if sells else "info",
    ))
    net5 = d.get("foreign_net_5d")
    hits.append(RuleHit(
        "foreign_net_sell", "Asing net sell 5 hari", 8, bool(net5 is not None and net5 < 0),
        f"Net asing 5 hari {_fmt_idr(net5)}" if net5 is not None else "data asing tidak tersedia",
        {"net_5d": net5}, "info",
    ))
    float_pct = d.get("free_float_pct")
    hits.append(RuleHit(
        "low_float", "Free float di bawah 7,5%", 10, bool(float_pct is not None and float_pct < 7.5),
        f"Free float {float_pct}%" if float_pct is not None else "data float tidak tersedia",
        {"free_float_pct": float_pct}, "warn" if float_pct is not None and float_pct < 7.5 else "info",
    ))
    top3 = d.get("broker_top3_share")
    hits.append(RuleHit(
        "broker_concentration", "Konsentrasi broker tinggi (top-3 > 75%)", 10, bool(top3 is not None and top3 > 75),
        f"Top-3 broker {round(top3, 1)}% nilai transaksi" if top3 is not None else "data broker tidak tersedia",
        {"top3_share": top3}, "warn" if top3 is not None and top3 > 70 else "info",
    ))
    drawdown = d.get("drawdown_30d")
    hits.append(RuleHit(
        "drawdown_deep", "Drawdown 30 hari di atas 20%", 8, bool(drawdown is not None and drawdown > 20),
        f"Drawdown {round(drawdown, 1)}% dari puncak 30 hari" if drawdown is not None else "data harga tidak tersedia",
        {"drawdown_30d": drawdown}, "info",
    ))
    return hits


def score(hits: list[RuleHit]) -> int:
    total = sum(h.weight for h in hits if h.triggered)
    return min(100, total)


def grade(score_value: int) -> str:
    if score_value >= 70:
        return "bahaya tinggi"
    if score_value >= 40:
        return "perlu perhatian"
    if score_value >= 15:
        return "pantau"
    return "rendah"


def _fmt_idr(v: float | None) -> str:
    if v is None:
        return "—"
    av = abs(v)
    if av >= 1e12:
        return f"Rp{v / 1e12:.1f} T".replace(".", ",")
    if av >= 1e9:
        return f"Rp{v / 1e9:.1f} M".replace(".", ",")
    if av >= 1e6:
        return f"Rp{v / 1e6:.0f} jt"
    return f"Rp{v:,.0f}".replace(",", ".")