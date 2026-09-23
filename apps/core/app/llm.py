"""LLM Gateway — satu-satunya pintu ke OpenRouter (docs/ARCHITECTURE.md §3).

Satu model untuk semua peran (meta/muse-spark-1.3); pembeda: reasoning_effort, temperature, prompt.
Mode template = fallback jujur tanpa API key (narasi deterministik), bukan karangan data.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

import httpx

from .config import ROLES, SETTINGS

log = logging.getLogger("idxmaca.llm")


class LLMUnavailable(RuntimeError):
    pass


class LLMFatal(RuntimeError):
    pass


def extract_json(text: str) -> Any:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.+?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start:end + 1])
        raise


class LLMGateway:
    def __init__(self, settings=SETTINGS):
        self.settings = settings
        self._client = httpx.AsyncClient(timeout=settings.llm_timeout_s)

    @property
    def available(self) -> bool:
        return self.settings.llm_mode == "live" and bool(self.settings.openrouter_api_key)

    @property
    def budget_cap_usd(self) -> float:
        import os
        return float(os.getenv("IDXMACA_MAX_LLM_USD_PER_RUN", "1.50"))

    async def aclose(self) -> None:
        await self._client.aclose()

    async def chat(
        self,
        role: str,
        messages: list[dict[str, Any]],
        *,
        json_schema: dict | None = None,
        run_id: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        if not self.available:
            raise LLMUnavailable(f"mode {self.settings.llm_mode}: OpenRouter tidak aktif")
        cfg = ROLES[role]
        payload: dict[str, Any] = {
            "model": self.settings.model,
            "messages": messages,
            "temperature": cfg.temperature if temperature is None else temperature,
            "max_tokens": cfg.max_tokens if max_tokens is None else max_tokens,
            "reasoning": {"effort": cfg.effort},
        }
        if json_schema is not None:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": f"idxmaca_{role}", "strict": True, "schema": json_schema},
            }
        headers = {
            "Authorization": f"Bearer {self.settings.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": self.settings.app_url,
            "X-Title": "IDXMACA",
        }
        attempt, delay, empty_retried = 0, 1.0, False
        while attempt <= self.settings.llm_retries:
            try:
                r = await self._client.post(f"{self.settings.openrouter_base_url}/chat/completions", json=payload, headers=headers)
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                if attempt == self.settings.llm_retries:
                    raise LLMFatal(f"OpenRouter tidak terjangkau: {exc}") from exc
                await asyncio.sleep(delay)
                delay *= 2
                attempt += 1
                continue
            if r.status_code in (402, 403):
                raise LLMFatal(f"OpenRouter menolak ({r.status_code}): {r.text[:200]}")
            if r.status_code == 429 or r.status_code >= 500:
                if attempt == self.settings.llm_retries:
                    raise LLMFatal(f"OpenRouter gagal setelah retry ({r.status_code}): {r.text[:200]}")
                await asyncio.sleep(delay)
                delay *= 2
                attempt += 1
                continue
            if r.status_code >= 400:
                raise LLMFatal(f"OpenRouter error {r.status_code}: {r.text[:300]}")
            body = r.json()
            usage = body.get("usage") or {}
            text = ""
            choices = body.get("choices") or []
            if choices:
                text = (choices[0].get("message") or {}).get("content") or ""
            if not text:
                finish = (choices[0].get("finish_reason") if choices else None) or ""
                if not empty_retried and (finish == "length" or not finish):
                    empty_retried = True
                    payload["max_tokens"] = int(payload["max_tokens"] * 2)
                    log.warning("konten kosong (finish=%s) — retry dengan max_tokens=%s", finish, payload["max_tokens"])
                    continue
                raise LLMFatal(f"Respons tanpa konten (finish={finish}): {json.dumps(body)[:200]}")
            from . import memory  # hindari siklus import

            cost = usage.get("cost")
            memory.log_llm_call(
                run_id=run_id, role=role, model=self.settings.model, effort=ROLES[role].effort,
                prompt_tokens=usage.get("prompt_tokens"), completion_tokens=usage.get("completion_tokens"),
                cost=float(cost) if cost is not None else None,
            )
            return {"text": text, "usage": usage, "role": role, "effort": ROLES[role].effort, "model": self.settings.model}
        raise LLMFatal("tidak seharusnya sampai sini")


GATEWAY = LLMGateway()