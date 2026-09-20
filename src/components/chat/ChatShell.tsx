"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnswerDoc } from "@/lib/output/answerdoc";
import type { LangMode } from "@/lib/util/format";
import AnswerCard from "@/components/answer/AnswerCard";
import Composer from "@/components/chat/Composer";
import ProgressFeed from "@/components/chat/ProgressFeed";
import Sidebar, { type MemoryInfo, type SessionInfo } from "@/components/chat/Sidebar";

type ProgressEvent = { phase: string; message: string; detail?: string };

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  doc?: AnswerDoc;
  events?: ProgressEvent[];
  streaming?: boolean;
};

type StatusInfo = {
  mode: "replay" | "hybrid" | "live";
  spentTodayKr: number;
  facts: number;
  cacheEntries: number;
};

export default function ChatShell() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [memory, setMemory] = useState<MemoryInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [langMode, setLangMode] = useState<LangMode>("menengah");
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const refreshSide = useCallback(async () => {
    const [s, m, st] = await Promise.all([
      fetch("/api/sessions").then((r) => r.json()),
      fetch("/api/memory").then((r) => r.json()),
      fetch(`/api/status${activeId ? `?sessionId=${activeId}` : ""}`).then((r) => r.json()),
    ]);
    setSessions(s.sessions ?? []);
    setMemory(m.memory ?? []);
    setStatus(st);
  }, [activeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSide();
  }, [refreshSide]);

  useEffect(() => {
    if (!activeId) return;
    fetch(`/api/sessions/${activeId}`)
      .then((r) => r.json())
      .then((data: { turns?: Array<{ role: string; content: string | null; answedoc: unknown; id: string }> }) => {
        const msgs: ChatMessage[] = [];
        for (const turn of data.turns ?? []) {
          if (turn.role === "user") msgs.push({ id: turn.id, role: "user", text: turn.content ?? "" });
          else if (turn.answedoc) msgs.push({ id: turn.id, role: "assistant", text: "", doc: turn.answedoc as AnswerDoc });
        }
        setMessages(msgs);
      })
      .catch(() => setMessages([]));
  }, [activeId]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (question: string) => {
    setError(null);
    setBusy(true);
    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: "user", text: question };
    const assistantId = `a_${Date.now()}`;
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", text: "", events: [], streaming: true }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeId, question, langMode }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const payload = JSON.parse(line) as
            | { type: "session"; sessionId: string }
            | { type: "event"; phase: string; message: string; detail?: string }
            | { type: "doc"; doc: AnswerDoc }
            | { type: "error"; message: string };
          if (payload.type === "session") {
            setActiveId(payload.sessionId);
          } else if (payload.type === "event") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, events: [...(m.events ?? []), { phase: payload.phase, message: payload.message, detail: payload.detail }] } : m)),
            );
          } else if (payload.type === "doc") {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, doc: payload.doc, streaming: false } : m)));
          } else if (payload.type === "error") {
            throw new Error(payload.message);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false, text: "Terjadi kesalahan saat memproses pertanyaan." } : m)));
    } finally {
      setBusy(false);
      void refreshSide();
    }
  };

  const newSession = async () => {
    const res = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ langMode }) });
    const data = (await res.json()) as { session: SessionInfo };
    setActiveId(data.session.id);
    setMessages([]);
    void refreshSide();
  };

  const changeMode = async (mode: LangMode) => {
    setLangMode(mode);
    if (activeId) {
      await fetch(`/api/sessions/${activeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ langMode: mode }) });
    }
  };

  const deleteMemory = async (id: string) => {
    await fetch(`/api/memory?id=${id}`, { method: "DELETE" });
    void refreshSide();
  };

  const setRunMode = async (mode: StatusInfo["mode"]) => {
    await fetch("/api/status", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
    void refreshSide();
  };

  return (
    <div className="flex h-dvh">
      <Sidebar sessions={sessions} activeId={activeId} memory={memory} onSelect={setActiveId} onNew={newSession} onDeleteMemory={deleteMemory} />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Thread</span>
            {activeId ? <span className="chip tabular">{messages.filter((m) => m.role === "user").length} pertanyaan</span> : null}
            <span className="chip border-accent2/40 text-accent2">memori aktif {memory.length}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="chip tabular">kredit hari ini {status ? status.spentTodayKr.toFixed(0) : "–"} kr</span>
            <span className="chip tabular">cache {status ? status.cacheEntries : "–"} · fakta {status ? status.facts : "–"}</span>
            <div className="flex items-center gap-1 rounded-full border border-line bg-surface2 p-0.5">
              {(["replay", "hybrid", "live"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRunMode(m)}
                  className={`rounded-full px-2.5 py-1 ${status?.mode === m ? "bg-accent/20 text-accent" : "text-muted hover:text-ink"}`}
                  title={m === "replay" ? "hanya dari cache (0 kr)" : m === "hybrid" ? "cache dulu, live bila perlu" : "selalu live"}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
            {messages.length === 0 ? <EmptyState onPick={send} /> : null}
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md border border-line bg-surface2 px-4 py-2.5 text-sm">
                  {m.text}
                </div>
              ) : (
                <div key={m.id} className="flex flex-col gap-3">
                  {m.streaming ? (
                    <div className="card p-4">
                      <ProgressFeed events={m.events ?? []} busy />
                    </div>
                  ) : null}
                  {m.doc ? <AnswerCard doc={m.doc} mode={langMode} onModeChange={changeMode} /> : null}
                  {!m.doc && !m.streaming && m.text ? <div className="card p-4 text-sm text-negative">{m.text}</div> : null}
                </div>
              ),
            )}
            {error ? <div className="card border-negative/40 p-3 text-sm text-negative">{error}</div> : null}
          </div>
        </div>

        <div className="border-t border-line px-4 py-3">
          <div className="mx-auto w-full max-w-3xl">
            <Composer onSend={send} busy={busy} />
            <p className="mt-2 text-center text-[11px] text-muted">
              10 level analisis · 3 gaya bahasa tersimpan · cache-first (mode <span className="tabular">{status?.mode ?? "hybrid"}</span>) · bukan rekomendasi jual/beli
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="card flex flex-col gap-4 p-5">
      <div>
        <h1 className="text-lg font-semibold">Investigraph</h1>
        <p className="mt-1 text-sm text-muted">
          Asisten riset saham IDX. Saya mengambil data dari Sectors API, menghitung angka turunan di kode, lalu menulis tiga versi penjelasan (Pemula,
          Menengah, Advanced) yang bisa kamu ganti kapan saja tanpa memanggil data lagi.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { t: "L1 — fakta tunggal", d: "Harga, kapitalisasi pasar, volume", q: "Berapa harga dan kapitalisasi pasar BRMS sekarang?" },
          { t: "L5 — perbandingan", d: "Dua emiten atau lebih sejajar", q: "Bandingkan BBCA vs BBRI: valuasi dan kinerja terbarunya." },
          { t: "L8 — bandarmologi", d: "Broker, asing, akumulasi/distribusi", q: "Cek bandarmologi PTBA 30 hari terakhir: siapa akumulasi dan bagaimana asing?" },
          { t: "L10 — riset keputusan", d: "Dossier multi-dimensi + skenario", q: "Saya pertimbangkan TLKM jangka panjang — tolong riset lengkap sebelum saya putuskan." },
        ].map((item) => (
          <button
            key={item.t}
            type="button"
            onClick={() => onPick(item.q)}
            className="rounded-xl border border-line bg-surface2/50 p-3 text-left transition hover:border-accent/50"
          >
            <div className="text-sm font-medium">{item.t}</div>
            <div className="mt-0.5 text-xs text-muted">{item.d}</div>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted">
        Semua angka diberi sitasi (klik untuk detail). Jawaban bukan rekomendasi jual/beli. Kredit Sectors terpakai sesuai level; cache membuat pertanyaan
        ulang gratis.
      </p>
    </div>
  );
}