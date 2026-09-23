#!/usr/bin/env python3
"""Smoke test end-to-end IDXMACA (butuh store+core jalan, mode fixture).

Usage: .venv/bin/python tools/smoke_test.py ["query"]
"""
from __future__ import annotations

import json
import sys

import httpx

CORE = "http://127.0.0.1:8788"


def run_query(query: str, approve: bool = True) -> dict:
    session = httpx.post(f"{CORE}/v1/sessions", json={"title": query[:60]}, timeout=30).json()["session_id"]
    chat = httpx.post(f"{CORE}/v1/chat", json={"text": query, "session_id": session}, timeout=120).json()
    if chat.get("kind") == "chat":
        print(f"• CHAT BEbas → {chat['reply'][:160]}")
        return {"kind": "chat", **chat}
    plan = chat["plan"]
    est = plan["estimates"]
    print(f"• PLAN {chat['run_id']}: {len(plan['intents'])} intent → {est['nodes']} node "
          f"({est['store_hits']} hit + {est['live']} live ≈ {est['credits_live']} kredit, {est['waves']} wave)")
    if not approve:
        return {"kind": "plan", **chat}
    events: list[dict] = []
    with httpx.stream("POST", f"{CORE}/v1/runs/{chat['run_id']}/approve", timeout=600) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    done = next((e for e in events if e["type"] == "done"), None)
    if done is None:
        err = next((e for e in events if e["type"] == "error"), {"error": "unknown"})
        print(f"  ✗ RUN GAGAL: {err}")
        return {"kind": "error", "error": err, "run_id": chat["run_id"]}
    result = done["result"]
    panels = [f"{p['id']}:{'ok' if p['status']=='ready' else 'empty'}({len(p['items'])})" for p in result["panels"]]
    bad = [(it["io"], it.get("empty_reason")) for p in result["panels"] for it in p["items"] if it["status"] != "ready"]
    print(f"  ✓ L0: {result['l0']['title']}")
    print(f"  panels: {' '.join(panels)}")
    print(f"  usage: {result['usage']['calls']} node, {result['usage']['sectors_credits']} kredit, "
          f"hits {result['usage']['store_hits']}; memo verify={result["memo"]["verification"]["ok"]}")
    if bad:
        print(f"  ! empty: {bad}")
    if result.get("errors"):
        print(f"  ! errors: {result['errors'][:3]}")
    return {"kind": "done", **result, "run_id": chat["run_id"]}


if __name__ == "__main__":
    q = sys.argv[1] if len(sys.argv) > 1 else "Bandingkan BBCA, BMRI, BBRI kuartal terakhir + siapa yang akumulasi + risiko kreditnya?"
    print(f"\n=== QUERY: {q}")
    run_query(q)