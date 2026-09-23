import type { ChatResponse, Plan, RunResult, SessionInfo, StreamEvent, Turn } from "./types";

const BASE = "/api/core";

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = (await res.json()).detail ?? (await res.text());
    } catch {
      detail = res.statusText;
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return (await res.json()) as T;
}

export async function sendChat(text: string, sessionId?: string): Promise<ChatResponse> {
  const res = await fetch(`${BASE}/v1/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, session_id: sessionId ?? null }),
  });
  return j<ChatResponse>(res);
}

export async function fetchConfig(): Promise<Record<string, unknown>> {
  return j<Record<string, unknown>>(await fetch(`${BASE}/v1/config`, { cache: "no-store" }));
}

export async function fetchStoreStats(): Promise<Record<string, unknown>> {
  return j<Record<string, unknown>>(await fetch(`${BASE}/v1/store/stats`, { cache: "no-store" }));
}

export async function fetchSessions(): Promise<{ sessions: SessionInfo[] }> {
  return j<{ sessions: SessionInfo[] }>(await fetch(`${BASE}/v1/sessions`, { cache: "no-store" }));
}

export async function fetchSessionTurns(sessionId: string): Promise<{ turns: Turn[]; entity_state: Record<string, unknown> }> {
  return j(await fetch(`${BASE}/v1/sessions/${sessionId}`, { cache: "no-store" }));
}

export async function fetchRun(runId: string): Promise<{ status: string; plan: Record<string, unknown>; result: RunResult | null }> {
  return j(await fetch(`${BASE}/v1/runs/${runId}`, { cache: "no-store" }));
}

export async function streamApprove(
  runId: string,
  onEvent: (event: StreamEvent) => void,
  opts: { force?: boolean } = {},
): Promise<void> {
  const res = await fetch(`${BASE}/v1/runs/${runId}/approve${opts.force ? "?force=true" : ""}`, { method: "POST" });
  if (!res.ok || !res.body) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* noop */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)) as StreamEvent);
      } catch {
        /* chunk tidak lengkap — abaikan */
      }
    }
  }
}

export async function exportRun(runId: string, fmt: "xlsx" | "docx" | "pdf"): Promise<void> {
  const res = await fetch(`${BASE}/v1/export/${runId}/${fmt}`, { method: "POST" });
  if (!res.ok) throw new Error(`export ${fmt} gagal: ${res.status}`);
  if (fmt === "pdf") {
    const html = await res.text();
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 400);
    }
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `idxmaca-${runId}.${fmt}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function planNodeStats(plan: Plan | null) {
  const nodes = plan?.nodes ?? [];
  return {
    total: nodes.length,
    ok: nodes.filter((n) => n.status === "ok").length,
    error: nodes.filter((n) => n.status === "error" || n.status === "not_found").length,
    running: nodes.filter((n) => n.status === "running").length,
  };
}