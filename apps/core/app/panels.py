"""Panel assembly — 8 panel hero (docs/INTENT-OUTPUT.md §8) + L0 strip + memo L3, render progresif."""
from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable

from .catalog import INTENTS, PANEL_ORDER, PANEL_TITLES
from .executor import RunContext
from .pipelines_core import (Piece, b_dividend, b_earnings, b_flow, b_foreign_flow, b_forecast, b_freshness,
                             b_index_compare, b_ipo, b_management, b_market_snapshot, b_movers, b_ownership,
                             b_peers, b_price_history, b_segments, b_snapshot, b_valuation_band,
                             b_broker_behavior, b_broker_landscape)
from .pipelines_special import (b_commodity, b_corp_actions, b_free_float, b_growth, b_insider, b_licenses,
                                b_mining_dossier, b_mining_ownership, b_mining_sites, b_news, b_rank,
                                b_red_flags, b_regional, b_regional_flow, b_screener, b_sector_map,
                                b_sector_report, b_suspension)
from .verify import DISCLAIMER
from .writer import build_memo, collect_followups, write_panels

log = logging.getLogger("idxmaca.panels")

BUILDERS: dict[str, Callable[..., Piece]] = {
    "IO-01": b_snapshot, "IO-02": b_valuation_band, "IO-03": b_earnings, "IO-04": b_forecast,
    "IO-05": b_dividend, "IO-06": b_management, "IO-07": b_ownership, "IO-08": b_peers,
    "IO-09": b_segments, "IO-10": b_freshness, "IO-11": b_screener, "IO-12": b_rank,
    "IO-13": b_growth, "IO-14": b_free_float, "IO-15": b_sector_map, "IO-16": b_price_history,
    "IO-17": b_market_snapshot, "IO-18": b_index_compare, "IO-19": b_movers, "IO-20": b_ipo,
    "IO-21": b_flow, "IO-22": b_broker_behavior, "IO-23": b_broker_landscape, "IO-24": b_foreign_flow,
    "IO-25": b_corp_actions, "IO-26": b_insider, "IO-27": b_suspension, "IO-28": b_news,
    "IO-29": b_sector_report, "IO-30": b_mining_dossier, "IO-31": b_mining_ownership,
    "IO-32": b_mining_sites, "IO-33": b_commodity, "IO-34": b_licenses, "IO-35": b_regional,
    "IO-36": b_regional_flow, "IO-38": b_red_flags,
}

EmitFn = Callable[[dict[str, Any]], Awaitable[None]]


def build_pieces(ctx: RunContext) -> list[Piece]:
    pieces: list[Piece] = []
    for io in ctx.plan.intents:
        builder = BUILDERS.get(io)
        if builder is None:
            continue
        try:
            piece = builder(ctx, io)
        except Exception as exc:  # noqa: BLE001 - kill-switch per panel, bukan crash run
            log.exception("builder %s gagal", io)
            piece = Piece(io=io, panel=INTENTS[io].panel, title=f"{io} gagal diproses",
                          status="empty", empty_reason=f"error: {exc}")
        if piece is None:
            continue
        if not piece.title:
            piece.title = INTENTS[io].name
        pieces.append(piece)
    return pieces


def group_panels(pieces: list[Piece]) -> list[dict[str, Any]]:
    panels: list[dict[str, Any]] = []
    for panel_id in PANEL_ORDER:
        items = [p for p in pieces if p.panel == panel_id]
        if not items:
            continue
        ready = [p for p in items if p.status == "ready"]
        hero = next((p for p in ready if p.chart), ready[0] if ready else items[0])
        panels.append({
            "id": panel_id, "title": PANEL_TITLES[panel_id],
            "status": "ready" if ready else "empty",
            "hero_io": hero.io, "items": [p.as_dict() for p in items],
            "why": hero.why,
        })
    return panels


def build_l0(ctx: RunContext, pieces: list[Piece]) -> dict[str, Any]:
    kpis: list[dict] = []
    for piece in pieces:
        for kpi in piece.kpis:
            if len(kpis) >= 5:
                break
            kpis.append(kpi)
        if len(kpis) >= 5:
            break
    bullets: list[str] = []
    for panel_id in PANEL_ORDER:
        for piece in pieces:
            if piece.panel == panel_id and piece.status == "ready" and piece.facts:
                bullets.append(piece.facts[0])
                break
        if len(bullets) >= 3:
            break
    if not bullets:
        bullets = [p.title for p in pieces[:3]]
    title = pieces[0].title if pieces else "Tidak ada hasil"
    p8 = next((p for p in pieces if p.panel == "P8" and p.status == "ready"), None)
    if p8 and any("70/100" in (k.get("value") or "") or "bahaya tinggi" in (k.get("sub") or "") for k in p8.kpis):
        title = p8.title
    else:
        first_p1 = next((p for p in pieces if p.panel in ("P1", "P2") and p.status == "ready"), None)
        title = first_p1.title if first_p1 else title
    return {
        "title": title,
        "kpis": kpis,
        "bullets": bullets,
        "persona": ctx.plan.persona,
        "playbooks": ctx.plan.playbooks,
        "query": ctx.plan.query,
        "scope": ctx.scope,
        "disclaimer": DISCLAIMER,
    }


async def assemble(ctx: RunContext, emit: EmitFn) -> dict[str, Any]:
    pieces = build_pieces(ctx)
    panels = group_panels(pieces)
    l0 = build_l0(ctx, pieces)
    await emit({"type": "l0", "l0": l0})
    for panel in panels:
        await emit({"type": "panel", "panel": panel})

    try:
        await write_panels(ctx, pieces)
        enhanced = group_panels(pieces)
        for panel in enhanced:
            await emit({"type": "panel_update", "panel": panel})
    except Exception as exc:  # noqa: BLE001
        log.warning("panel writer gagal total: %s", exc)

    memo = await build_memo(ctx, pieces)
    followups = collect_followups(ctx, pieces, memo.get("followups"))
    await emit({"type": "memo", "memo": memo, "followups": followups})

    return {
        "l0": l0,
        "panels": group_panels(pieces),
        "memo": memo,
        "followups": followups,
        "evidence": ctx.ledger.as_map(),
        "usage": {
            "sectors_credits": ctx.credits,
            "store_hits": ctx.hits,
            "store_misses": ctx.misses,
            "calls": len(ctx.calls),
            "budget_stopped": ctx.budget_stopped,
        },
        "errors": ctx.errors,
    }