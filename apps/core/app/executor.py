"""Executor — DAG paralel per gelombang via Store Service, semaphore, budget guard, single-flight."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from .config import SETTINGS
from .ledger import Ledger
from .plan_builder import Plan, PlanNode
from .store_client import STORE, StoreError

log = logging.getLogger("idxmaca.executor")

EmitFn = Callable[[dict[str, Any]], Awaitable[None]]


@dataclass
class RunContext:
    plan: Plan
    scope: dict[str, Any]
    run_id: str = ""
    ledger: Ledger = field(default_factory=Ledger)
    data: dict[str, Any] = field(default_factory=dict)
    provenance: dict[str, dict[str, Any]] = field(default_factory=dict)
    credits: int = 0
    hits: int = 0
    misses: int = 0
    saved: int = 0
    calls: list[dict[str, Any]] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    budget_stopped: bool = False

    def value(self, key: str, default: Any = None) -> Any:
        v = self.data.get(key)
        return default if v is None else v

    def prov(self, key: str) -> dict[str, Any]:
        return self.provenance.get(key, {"source": "unknown", "fetched_at": None, "credits_spent": 0})

    async def fetch(self, endpoint: str, params: dict[str, Any] | None = None, key: str | None = None,
                    label: str | None = None, intents: list[str] | None = None,
                    optional: bool = False) -> Any | None:
        key = key or f"lazy:{endpoint}:{abs(hash(str(params)))}"
        if key in self.data:
            return self.data[key]
        est = 1
        if self.credits + est > SETTINGS.max_credits_per_run:
            self.data[key] = None
            self.provenance[key] = {"source": "skipped-budget", "fetched_at": None, "credits_spent": 0,
                                    "endpoint": endpoint, "params": params or {}, "label": label, "intents": intents or []}
            self.budget_stopped = True
            self.errors.append(f"budget: {key} dilewati")
            return None
        try:
            result = await STORE.fetch(endpoint, params or {})
        except StoreError as exc:
            self.data[key] = None
            self.provenance[key] = {"source": "error", "fetched_at": None, "credits_spent": 0,
                                    "endpoint": endpoint, "params": params or {}, "label": label,
                                    "intents": intents or [], "error": str(exc)}
            self.errors.append(f"{key}: {exc}")
            return None
        status = result.get("http_status")
        credits = int(result.get("credits_spent") or 0)
        self.credits += credits
        self.calls.append({"key": key, "endpoint": endpoint, "params": params or {}, "source": result.get("source"),
                           "credits_spent": credits, "fetched_at": result.get("fetched_at"), "http_status": status,
                           "label": label, "intents": intents or []})
        if result.get("source") == "store-hit":
            self.hits += 1
            self.saved += max(0, int(result.get("saved_credits") or 0))
        else:
            self.misses += 1
        ok = status is not None and 200 <= status < 300
        self.data[key] = result.get("data") if ok else None
        self.provenance[key] = {"source": result.get("source"), "fetched_at": result.get("fetched_at"),
                                "credits_spent": credits, "endpoint": endpoint, "params": params or {},
                                "label": label, "intents": intents or [], "http_status": status,
                                "cache_key": result.get("cache_key"), "warnings": result.get("warnings")}
        if not ok and not optional:
            self.errors.append(f"{key}: HTTP {status}")
        return self.data[key]


async def execute(plan: Plan, scope: dict[str, Any], emit: EmitFn, run_id: str = "") -> RunContext:
    ctx = RunContext(plan=plan, scope=scope, run_id=run_id)
    by_wave: dict[int, list[PlanNode]] = {}
    for node in plan.nodes:
        by_wave.setdefault(node.wave, []).append(node)
    sem = asyncio.Semaphore(SETTINGS.max_parallel_fetches)

    async def run_node(node: PlanNode) -> None:
        if node.invalid:
            node.status, node.error = "invalid", node.error or "params invalid"
            await emit({"type": "node", **node.as_dict()})
            return
        if ctx.credits + node.est_credits > SETTINGS.max_credits_per_run:
            node.status, node.error = "skipped_budget", "budget run terlampaui"
            ctx.budget_stopped = True
            ctx.data[node.key] = None
            await emit({"type": "node", **node.as_dict()})
            return
        async with sem:
            try:
                result = await STORE.fetch(node.endpoint, node.params)
            except StoreError as exc:
                node.status, node.error = "error", str(exc)
                ctx.data[node.key] = None
                ctx.errors.append(f"{node.key}: {exc}")
                await emit({"type": "node", **node.as_dict()})
                return
        status = result.get("http_status")
        credits = int(result.get("credits_spent") or 0)
        node.credits_spent = credits
        node.source = result.get("source")
        node.fetched_at = result.get("fetched_at")
        ctx.credits += credits
        ctx.calls.append({"key": node.key, "node_id": node.id, "endpoint": node.endpoint, "params": node.params,
                          "source": result.get("source"), "credits_spent": credits,
                          "fetched_at": result.get("fetched_at"), "http_status": status,
                          "label": node.label, "intents": node.intents})
        if result.get("source") == "store-hit":
            ctx.hits += 1
        else:
            ctx.misses += 1
        ok = status is not None and 200 <= status < 300
        if ok:
            node.status = "ok"
            ctx.data[node.key] = result.get("data")
        elif status == 404:
            node.status = "not_found"
            ctx.data[node.key] = None
        else:
            node.status = "error"
            node.error = f"HTTP {status}"
            ctx.data[node.key] = None
            if not node.optional:
                ctx.errors.append(f"{node.key}: HTTP {status}")
        ctx.provenance[node.key] = {"source": result.get("source"), "fetched_at": result.get("fetched_at"),
                                    "credits_spent": credits, "endpoint": node.endpoint, "params": node.params,
                                    "label": node.label, "intents": node.intents, "http_status": status,
                                    "cache_key": result.get("cache_key"), "warnings": result.get("warnings")}
        await emit({"type": "node", **node.as_dict()})

    for wave in sorted(by_wave):
        await emit({"type": "wave", "wave": wave, "count": len(by_wave[wave]),
                    "labels": [n.label for n in by_wave[wave]][:12]})
        await asyncio.gather(*(run_node(node) for node in by_wave[wave]))
    return ctx