"""IDXMACA Core API — chat → plan (approval) → run SSE → panels → memo → export."""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from .config import SETTINGS
from .executor import execute
from .export import build_docx, build_print_html, build_xlsx
from .llm import GATEWAY
from .memory import MEMORY
from .panels import assemble
from .plan_builder import build_plan, plan_from_storage, plan_to_storage
from .router_agent import free_chat_reply, route
from .store_client import STORE
from .verify import DISCLAIMER

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("idxmaca.core")

app = FastAPI(title="IDXMACA Core", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ChatRequest(BaseModel):
    text: str
    session_id: str | None = None


class SessionRequest(BaseModel):
    title: str = "Sesi baru"


def _sse(data: dict[str, Any]) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@app.get("/v1/health")
async def health():
    store_ok = True
    try:
        await STORE.health()
    except Exception:  # noqa: BLE001
        store_ok = False
    return {"ok": True, "service": "idxmaca-core", "llm_mode": SETTINGS.llm_mode,
            "model": SETTINGS.model, "store_reachable": store_ok, "store_url": SETTINGS.store_url}


@app.get("/v1/config")
async def config():
    from .catalog import INTENTS, PANEL_TITLES, PLAYBOOKS

    return {
        "model": SETTINGS.model,
        "llm_mode": SETTINGS.llm_mode,
        "llm_available": GATEWAY.available,
        "store_url": SETTINGS.store_url,
        "budget": {"max_credits_per_run": SETTINGS.max_credits_per_run,
                   "max_llm_usd_per_run": GATEWAY.budget_cap_usd},
        "playbooks": [{"key": k, "label": v["label"], "intents": len(v["intents"])} for k, v in PLAYBOOKS.items()],
        "intents": len(INTENTS),
        "panels": PANEL_TITLES,
        "disclaimer": DISCLAIMER,
    }


@app.get("/v1/store/stats")
async def store_stats():
    try:
        return await STORE.stats()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"store tidak terjangkau: {exc}") from exc


@app.post("/v1/sessions")
async def create_session(req: SessionRequest):
    sid = MEMORY.create_session(req.title)
    return {"session_id": sid}


@app.get("/v1/sessions")
async def list_sessions():
    return {"sessions": MEMORY.list_sessions()}


@app.get("/v1/sessions/{session_id}")
async def get_session(session_id: str):
    session = MEMORY.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    return {**session, "turns": MEMORY.get_turns(session_id)}


@app.post("/v1/chat")
async def chat(req: ChatRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text kosong")
    if req.session_id and MEMORY.get_session(req.session_id):
        session_id = req.session_id
    else:
        session_id = MEMORY.create_session(text[:80])
    context = MEMORY.build_context_messages(session_id, text) if MEMORY.get_turns(session_id) else []
    state = (MEMORY.get_session(session_id) or {}).get("entity_state") or {}

    routed = await route(text, context)
    if routed.get("is_chat"):
        reply = free_chat_reply(text, state) or (
            "Saya bisa menjawab pertanyaan analisis emiten IDX: sebutkan emiten dan hal yang ingin dicek "
            "(valuasi, kinerja, flow, dividen, red-flag). Saya akan menyusun rencana dan estimasi kredit dulu."
        )
        MEMORY.append_turn(session_id, "user", text)
        MEMORY.append_turn(session_id, "assistant", reply, model=SETTINGS.model, effort="low")
        return {"kind": "chat", "session_id": session_id, "reply": reply,
                "disclaimer": DISCLAIMER if state else None}

    plan = await build_plan(text, session_id, context, recommended=routed)
    run_id = uuid.uuid4().hex[:12]
    MEMORY.save_run(run_id, session_id, text, plan_to_storage(plan))
    MEMORY.append_turn(session_id, "user", text, run_id=run_id)
    MEMORY.update_entity_state(session_id, {
        "symbols": plan.scope.get("symbols") or [],
        "regional": [f"{r.get('exchange')}:{r.get('symbol')}" for r in plan.scope.get("regional") or []],
        "groups": plan.scope.get("groups") or [],
        "language": plan.language,
        "playbooks": plan.playbooks,
    })
    return {"kind": "plan", "session_id": session_id, "run_id": run_id, "plan": plan.as_dict(),
            "disclaimer": DISCLAIMER}


@app.get("/v1/runs/{run_id}")
async def get_run(run_id: str):
    run = MEMORY.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    return {"run_id": run["run_id"], "status": run["status"], "plan": run["plan"], "result": run["result"],
            "error": run.get("error"), "usage": MEMORY.llm_usage(run_id)}


@app.post("/v1/runs/{run_id}/approve")
async def approve_run(run_id: str, force: bool = Query(default=False)):
    run = MEMORY.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    if run["status"] == "done" and run.get("result"):
        async def replay():
            yield _sse({"type": "plan", "plan": run["plan"], "replay": True})
            result = run["result"]
            yield _sse({"type": "l0", "l0": result.get("l0")})
            for panel in result.get("panels") or []:
                yield _sse({"type": "panel", "panel": panel})
            yield _sse({"type": "memo", "memo": result.get("memo"), "followups": result.get("followups")})
            yield _sse({"type": "done", "result": result, "replay": True})

        return StreamingResponse(replay(), media_type="text/event-stream")

    plan = plan_from_storage(run["plan"])
    if plan.over_budget and not force:
        raise HTTPException(status_code=409, detail={
            "error": "over_budget", "estimates": plan.estimates(),
            "detail": "Estimasi kredit melebihi budget run. Setujui dengan force=true untuk tetap jalan, atau persempit scope.",
        })
    session_id = run["session_id"]
    queue: asyncio.Queue = asyncio.Queue()

    async def emit(event: dict[str, Any]) -> None:
        await queue.put(event)

    async def runner() -> None:
        try:
            MEMORY.set_run_status(run_id, "running")
            await emit({"type": "plan", "plan": plan.as_dict()})
            ctx = await execute(plan, plan.scope, emit, run_id=run_id)
            result = await assemble(ctx, emit)
            result["plan"] = plan.as_dict()
            result["usage"]["llm"] = MEMORY.llm_usage(run_id)
            result["run_id"] = run_id
            result["session_id"] = session_id
            MEMORY.set_run_status(run_id, "done", result=result)
            summary_parts = [result["l0"].get("title", "")]
            summary_parts += (result["l0"].get("bullets") or [])[:3]
            MEMORY.append_turn(
                session_id, "assistant", " | ".join(p for p in summary_parts if p),
                intent_ids=plan.intents, evidence_ids=list((result.get("evidence") or {}).keys())[:40],
                run_id=run_id, model=SETTINGS.model, effort="xhigh" if GATEWAY.available else "template",
                cost=(result["usage"].get("llm") or {}).get("cost_usd"))
            for sym in (plan.scope.get("symbols") or [])[:7]:
                period = next((p.get("period") for p in result["l0"].get("kpis", []) if False), "2026-Q2")
                MEMORY.upsert_snapshot(sym, period, {"title": result["l0"].get("title"),
                                                     "bullets": result["l0"].get("bullets")},
                                       model=SETTINGS.model)
            await emit({"type": "done", "result": result})
        except Exception as exc:  # noqa: BLE001
            log.exception("run %s gagal", run_id)
            MEMORY.set_run_status(run_id, "error", error=str(exc))
            await emit({"type": "error", "error": str(exc), "hint": "Periksa Store Service dan env OPENROUTER/SECTORS."})
        finally:
            await queue.put(None)

    async def stream():
        task = asyncio.create_task(runner())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield _sse(item)
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _require_result(run_id: str) -> dict[str, Any]:
    run = MEMORY.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    if not run.get("result"):
        raise HTTPException(status_code=409, detail="run belum selesai — approve dan tunggu hingga done")
    return run["result"]


@app.post("/v1/export/{run_id}/xlsx")
async def export_xlsx(run_id: str):
    data = build_xlsx(_require_result(run_id))
    return Response(content=data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="idxmaca-{run_id}.xlsx"'})


@app.post("/v1/export/{run_id}/docx")
async def export_docx(run_id: str):
    data = build_docx(_require_result(run_id))
    return Response(content=data, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    headers={"Content-Disposition": f'attachment; filename="idxmaca-{run_id}.docx"'})


@app.post("/v1/export/{run_id}/pdf")
async def export_pdf(run_id: str):
    html = build_print_html(_require_result(run_id))
    return Response(content=html, media_type="text/html",
                    headers={"Content-Disposition": f'inline; filename="idxmaca-{run_id}.html"'})


@app.on_event("shutdown")
async def _shutdown():
    await GATEWAY.aclose()
    await STORE.aclose()