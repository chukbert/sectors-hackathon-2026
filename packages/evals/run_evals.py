#!/usr/bin/env python3
"""Eval harness IDXMACA — 20 pertanyaan baku (ID/EN, typo ticker, emiten suspensi, tambang, SGX, chat).

Mengukur: intent tepat, run selesai, verifier angka & bahasa lolos, kredit dalam budget, bukti ada.
Usage: .venv/bin/python packages/evals/run_evals.py [--core http://127.0.0.1:8788] [--limit N]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
CORE = "http://127.0.0.1:8788"


def run_one(client: httpx.Client, question: dict, session_id: str | None) -> dict:
    q = question["q"]
    expect = question.get("expect", "run")
    result: dict = {"id": question["id"], "expect": expect, "pass": False, "notes": []}
    try:
        chat = client.post(f"{CORE}/v1/chat", json={"text": q, "session_id": session_id}, timeout=120).json()
    except Exception as exc:  # noqa: BLE001
        result["notes"].append(f"chat gagal: {exc}")
        return result
    result["kind"] = chat.get("kind")
    result["session_id"] = chat.get("session_id")
    if expect == "chat":
        ok = chat.get("kind") == "chat" and len(str(chat.get("reply", ""))) > 20
        result["pass"] = ok
        if not ok:
            result["notes"].append("bukan jawaban chat yang wajar")
        return result
    if chat.get("kind") != "plan":
        result["notes"].append(f"tidak menghasilkan plan ({chat.get('kind')})")
        return result
    plan = chat["plan"]
    intents = {i["id"] for i in plan["intents"]}
    for needed in question.get("must_intents", []):
        if needed not in intents:
            result["notes"].append(f"intent {needed} tidak dipilih")
    if question.get("typo_symbol") and question["typo_symbol"] not in (plan["scope"].get("symbols") or []):
        result["notes"].append(f"resolver gagal mengenali {question['typo_symbol']}")
    if question.get("followup_of"):
        result["followup"] = True
    run_id = chat["run_id"]
    events: list[dict] = []
    try:
        with client.stream("POST", f"{CORE}/v1/runs/{run_id}/approve", timeout=600) as resp:
            for line in resp.iter_lines():
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))
    except Exception as exc:  # noqa: BLE001
        result["notes"].append(f"approve gagal: {exc}")
        return result
    done = next((e for e in events if e["type"] == "done"), None)
    if not done:
        err = next((e for e in events if e["type"] == "error"), {"error": "tanpa done"})
        result["notes"].append(f"run error: {err.get('error')}")
        return result
    res = done["result"]
    panels = res["panels"]
    empty = [p["id"] for p in panels if p["status"] != "ready"]
    verification = res["memo"]["verification"]
    if empty and expect == "run":
        result["notes"].append(f"panel kosong: {empty}")
    if not verification.get("ok"):
        result["notes"].append(f"verifier memo gagal: {json.dumps(verification.get('numeric', {}).get('unverified', [])[:2])}")
    if not res.get("evidence"):
        result["notes"].append("tanpa evidence ledger")
    if res["usage"]["sectors_credits"] > 60:
        result["notes"].append(f"kredit {res['usage']['sectors_credits']} > budget 60")
    result["panels_ready"] = sum(1 for p in panels if p["status"] == "ready")
    result["intents"] = len(intents)
    result["credits"] = res["usage"]["sectors_credits"]
    result["pass"] = not result["notes"]
    result["result"] = res
    return result


def main() -> int:
    global CORE
    parser = argparse.ArgumentParser()
    parser.add_argument("--core", default=CORE)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    CORE = args.core.rstrip("/")
    questions = json.loads((HERE / "questions.json").read_text(encoding="utf-8"))["questions"]
    if args.limit:
        questions = questions[: args.limit]
    passed, sessions = 0, {}
    with httpx.Client() as client:
        for question in questions:
            sid = sessions.get(question.get("followup_of"))
            out = run_one(client, question, sid)
            sessions[question["id"]] = out.get("session_id")
            status = "PASS" if out["pass"] else "FAIL"
            passed += 1 if out["pass"] else 0
            extra = f"intents={out.get('intents', '-')} panels={out.get('panels_ready', '-')} kredit={out.get('credits', '-')}"
            print(f"[{status}] {out['id']} {question['q'][:64]!r} {extra}")
            for note in out["notes"]:
                print(f"        · {note}")
            if out.get("result"):
                (HERE / "last_results").mkdir(exist_ok=True)
                (HERE / "last_results" / f"{out['id']}.json").write_text(
                    json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    total = len(questions)
    print(f"\nSKOR: {passed}/{total} ({passed / total * 100:.0f}%) — target ≥90%")
    return 0 if passed >= total * 0.9 else 1


if __name__ == "__main__":
    sys.exit(main())