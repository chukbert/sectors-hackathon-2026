"""Planner — query → DAG node fetch (dedup + fetch-sharing) + estimasi kredit via Store lookup.

Prinsip docs/ARCHITECTURE.md §13: 38 intent ≠ 38 panggilan. Node digabung sebelum lookup.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

from .catalog import INTENTS, PANEL_TITLES, PLAYBOOKS, intents_for_playbooks, select_playbooks
from .compiler import compile_screener
from .config import SETTINGS
from .resolve import META, Scope, resolve, subsector_slug
from .store_client import STORE, StoreError

log = logging.getLogger("idxmaca.planner")


@dataclass
class PlanNode:
    id: str
    key: str
    endpoint: str
    params: dict[str, Any]
    wave: int
    intents: list[str] = field(default_factory=list)
    optional: bool = False
    label: str = ""
    est_credits: int = 0
    hit: bool = False
    fresh: bool = False
    invalid: bool = False
    live_ready: bool = True
    live_path: str | None = None
    cache_warnings: list[str] = field(default_factory=list)
    status: str = "pending"
    error: str | None = None
    fetched_at: str | None = None
    source: str | None = None
    credits_spent: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "key": self.key, "endpoint": self.endpoint, "params": self.params,
            "wave": self.wave, "intents": self.intents, "optional": self.optional, "label": self.label,
            "est_credits": self.est_credits, "hit": self.hit, "fresh": self.fresh, "invalid": self.invalid,
            "live_ready": self.live_ready, "live_path": self.live_path, "warnings": self.cache_warnings,
            "status": self.status, "error": self.error, "fetched_at": self.fetched_at,
            "source": self.source, "credits_spent": self.credits_spent,
        }


@dataclass
class Plan:
    query: str
    session_id: str
    persona: str
    playbooks: list[str]
    intents: list[str]
    nodes: list[PlanNode]
    scope: dict[str, Any]
    notes: list[str] = field(default_factory=list)
    language: str = "id"
    over_budget: bool = False
    compiler: dict[str, Any] | None = None
    router_source: str = "template"

    def estimates(self) -> dict[str, Any]:
        hits = [n for n in self.nodes if n.hit and n.fresh]
        live = [n for n in self.nodes if not (n.hit and n.fresh)]
        credits = sum(n.est_credits for n in live)
        return {
            "nodes": len(self.nodes),
            "store_hits": len(hits),
            "live": len(live),
            "credits_live": credits,
            "credits_saved": sum(n.est_credits for n in hits),
            "waves": len({n.wave for n in self.nodes}),
            "over_budget": self.over_budget,
            "budget_max": SETTINGS.max_credits_per_run,
        }

    def as_dict(self) -> dict[str, Any]:
        return {
            "query": self.query, "session_id": self.session_id, "persona": self.persona,
            "playbooks": [{"key": p, "label": PLAYBOOKS[p]["label"]} for p in self.playbooks],
            "intents": [{"id": i, "name": INTENTS[i].name, "panel": INTENTS[i].panel} for i in self.intents],
            "panel_titles": PANEL_TITLES,
            "nodes": [n.as_dict() for n in self.nodes],
            "estimates": self.estimates(),
            "scope": self.scope,
            "notes": self.notes,
            "language": self.language,
            "compiler": self.compiler,
            "router_source": self.router_source,
        }


PERSONA_BY_PLAYBOOK = {
    "earnings": "A1/A2 Analis Riset",
    "comps": "B1 Banker/Valuasi",
    "credit": "C1/C2 Kredit & Risiko",
    "market": "A3 Trader/Sales",
    "flow": "A3 Bandarmologi",
    "mining": "A1/B1 Tambang & Advisory",
    "regional": "A2/B1 Regional Analyst",
    "committee": "CIO / Komite Investasi",
}


def plan_to_storage(plan: Plan) -> dict[str, Any]:
    return {
        "query": plan.query, "session_id": plan.session_id, "persona": plan.persona,
        "playbooks": plan.playbooks, "intents": plan.intents, "scope": plan.scope, "notes": plan.notes,
        "language": plan.language, "over_budget": plan.over_budget, "compiler": plan.compiler,
        "router_source": plan.router_source,
        "nodes": [n.as_dict() for n in plan.nodes],
    }


def plan_from_storage(data: dict[str, Any]) -> Plan:
    nodes = [PlanNode(**{k: v for k, v in node.items() if k in PlanNode.__dataclass_fields__})
             for node in data.get("nodes", [])]
    return Plan(query=data.get("query", ""), session_id=data.get("session_id", ""),
                persona=data.get("persona", "Analis"), playbooks=data.get("playbooks", []),
                intents=data.get("intents", []), nodes=nodes, scope=data.get("scope", {}),
                notes=data.get("notes", []), language=data.get("language", "id"),
                over_budget=bool(data.get("over_budget")), compiler=data.get("compiler"),
                router_source=data.get("router_source", "template"))


def _label(endpoint: str, params: dict) -> str:
    path = endpoint
    if "company/report" in path:
        sym = path.rstrip("/").split("/")[-1]
        sections = params.get("sections") or []
        if "quarterly" in path:
            return f"Quarterly {sym}"
        return f"Report {sym} · {','.join(sections) if sections else 'full'}"
    if "company/daily" in path:
        return f"Daily {path.rstrip('/').split('/')[-1]}"
    if "broker/summary" in path:
        return f"Broker summary {path.rstrip('/').split('/')[-1]}"
    if "broker/top-buyers" in path:
        return f"Top buyers {path.rstrip('/').split('/')[-1]}"
    if "broker/top-sellers" in path:
        return f"Top sellers {path.rstrip('/').split('/')[-1]}"
    if "foreign-flow" in path:
        return "Foreign flow universe"
    if "corporate-actions/calendar" in path:
        return "Kalender aksi korporasi"
    if "corporate-actions" in path:
        return f"Corp actions {path.rstrip('/').split('/')[-1]}"
    if "filings" in path:
        return f"Filings {path.rstrip('/').split('/')[-1]}"
    if "suspensions" in path:
        return f"Suspensi {path.rstrip('/').split('/')[-1]}"
    if "news" in path:
        return f"News {path.rstrip('/').split('/')[-1]}"
    if "helpers" in path:
        return "Helpers klasifikasi"
    if "subsector/report" in path:
        return f"Report sektor {params.get('slug', '')}"
    if "mining" in path:
        return f"Mining {'/'.join(path.rstrip('/').split('/')[2:])}"
    if "commodities" in path:
        return "Harga komoditas"
    if "sgx" in path or "klse" in path:
        return f"Regional {path.rstrip('/').split('/')[-1]}"
    if "universe" in path:
        return "Universe close"
    if "index" in path:
        return f"Index {params.get('symbol', '')}"
    if "movers" in path:
        return f"Movers {params.get('type', '')}"
    if "companies" in path:
        return "Screener"
    if "quarterly-dates" in path:
        return "Quarterly dates"
    if "ipo" in path:
        return "IPO performance"
    if "helpers" in path:
        return "Helpers"
    return path


def _merge_nodes(nodes: list[PlanNode]) -> list[PlanNode]:
    """Fetch-sharing: union sections utk endpoint sama + dedup (endpoint, params)."""
    by_merge: dict[tuple, PlanNode] = {}
    for node in nodes:
        merge_key = (node.endpoint, node.key)
        if merge_key in by_merge:
            target = by_merge[merge_key]
            sections = list(dict.fromkeys((target.params.get("sections") or []) + (node.params.get("sections") or [])))
            if sections:
                target.params["sections"] = sections
            target.intents = list(dict.fromkeys(target.intents + node.intents))
            target.optional = target.optional and node.optional
        else:
            by_merge[merge_key] = node
    seen: dict[str, PlanNode] = {}
    for node in by_merge.values():
        params_json = json.dumps(node.params, sort_keys=True, default=str)
        dedup_key = f"{node.endpoint}|{params_json}"
        if dedup_key in seen:
            seen[dedup_key].intents = list(dict.fromkeys(seen[dedup_key].intents + node.intents))
        else:
            seen[dedup_key] = node
    merged = list(seen.values())
    merged.sort(key=lambda n: (n.wave, n.endpoint, json.dumps(n.params, sort_keys=True)))
    for i, node in enumerate(merged):
        node.id = f"n{i + 1:02d}"
        node.label = node.label or _label(node.endpoint, node.params)
    return merged


async def build_plan(query: str, session_id: str, session_context: list[dict] | None = None,
                     recommended: dict[str, Any] | None = None) -> Plan:
    scope_obj: Scope = resolve(query)
    scope: dict[str, Any] = scope_obj.as_dict()
    notes: list[str] = list(scope_obj.notes)
    playbooks = select_playbooks(query, scope_obj.symbols)
    router_source = "template"
    if recommended and recommended.get("playbooks"):
        valid = [p for p in recommended["playbooks"] if p in PLAYBOOKS]
        if valid:
            playbooks = valid[:3]
            router_source = "llm"
        if recommended.get("persona"):
            notes.append(f"persona: {recommended['persona']}")
    if not scope_obj.has_scope:
        from .resolve import GROUP_HINTS, MINERS
        defaults = {
            "earnings": ["BBCA", "BMRI", "BBRI"],
            "comps": ["BBCA", "BMRI", "BBRI"],
            "flow": ["BBCA", "BMRI"],
            "mining": sorted(MINERS)[:3],
            "credit": GROUP_HINTS["distressed"] + [s_ for s_ in GROUP_HINTS["watchlist"] if s_ not in GROUP_HINTS["distressed"]][:6],
            "committee": GROUP_HINTS["watchlist"][:6],
            "market": ["BBCA", "BMRI", "BBRI"],
            "regional": ["BBCA", "BMRI"],
        }
        picked: list[str] = []
        for pb in playbooks:
            for s_ in defaults.get(pb, []):
                if s_ not in picked:
                    picked.append(s_)
        if picked:
            scope_obj.symbols = picked[:12]
            scope = scope_obj.as_dict()
        notes.append("tanpa emiten eksplisit — memakai cakupan default sesuai playbook (bisa dispesifikkan)")

    intents = intents_for_playbooks(playbooks)
    if recommended and recommended.get("intents"):
        valid_io = [i for i in recommended["intents"] if i in INTENTS]
        if valid_io:
            # baseline playbook tetap dijamin, LLM boleh menambah intent spesifik
            intents = list(dict.fromkeys([*intents, *valid_io]))[:42]

    compiler_result = None
    if "IO-11" in intents:
        compiler_result = await compile_screener(query, session_context)
        notes.append(f"compiler: {compiler_result.get('compiler')} → {json.dumps(compiler_result.get('where'), ensure_ascii=False)}")

    nodes: list[PlanNode] = []
    for io_id in intents:
        intent = INTENTS[io_id]
        for spec in intent.nodes:
            for expanded in spec.expanded(scope):
                params = {k: v for k, v in expanded.params.items() if not k.startswith("$")}
                if expanded.key.startswith("subsector") and scope_obj.symbols:
                    params["slug"] = subsector_slug(scope_obj.symbols[0])
                if expanded.key == "screener_query" and compiler_result:
                    if compiler_result.get("where"):
                        params["where"] = compiler_result["where"]
                    params["sort"] = compiler_result.get("sort", "-market_cap")
                    params["limit"] = compiler_result.get("limit", 25)
                endpoint_final = expanded.endpoint
                for placeholder, value in params.items():
                    if value not in (None, "", []) and isinstance(value, (str, int)):
                        endpoint_final = endpoint_final.replace("{" + placeholder + "}", str(value))
                nodes.append(PlanNode(id="", key=expanded.key, endpoint=endpoint_final, params=params,
                                      wave=expanded.wave, intents=[io_id], optional=expanded.optional,
                                      label=_label(endpoint_final, params)))
    nodes = _merge_nodes(nodes)

    for node in nodes:
        try:
            look = await STORE.lookup(node.endpoint, node.params)
            node.hit = bool(look.get("hit"))
            node.fresh = bool(look.get("fresh"))
            node.invalid = bool(look.get("invalid"))
            node.error = look.get("error")
            node.live_ready = bool(look.get("live_ready", True))
            node.live_path = look.get("live_path")
            node.cache_warnings = list(look.get("warnings") or [])
            node.est_credits = 0 if look.get("demo_mode") else int(look.get("est_credits_live") or 0)
        except StoreError as exc:
            log.warning("lookup gagal utk %s: %s", node.endpoint, exc)
            node.error = "store tidak terjangkau — estimasi konservatif 1 kredit"
            node.est_credits = 1

    over_budget = sum(n.est_credits for n in nodes) > SETTINGS.max_credits_per_run
    if over_budget:
        notes.append(f"estimasi live {sum(n.est_credits for n in nodes)} kredit > budget {SETTINGS.max_credits_per_run}; persempit scope atau naikkan budget")
    unmapped = [n for n in nodes if not n.live_ready]
    if unmapped:
        sample = ", ".join(sorted({n.endpoint for n in unmapped})[:3])
        notes.append(f"{len(unmapped)} node belum dipetakan ke API live (fail-closed, 0 kredit): {sample}")
    personas = [PERSONA_BY_PLAYBOOK.get(p, "Analis") for p in playbooks[:2]]
    return Plan(query=query, session_id=session_id, persona=" + ".join(personas), playbooks=playbooks,
                intents=intents, nodes=nodes, scope=scope, notes=notes, language=scope_obj.language,
                over_budget=over_budget, compiler=compiler_result, router_source=router_source)