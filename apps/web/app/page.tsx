"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Composer, EvidenceDrawer, Sidebar, Toast } from "@/components/shell";
import { L0Strip, MemoCard, PlanCard, SparkIcon, Typing } from "@/components/messages";
import { PieceCard } from "@/components/pieces";
import * as api from "@/lib/api";
import type { ChatResponse, EvidenceItem, L0, Memo, Panel, Plan, RunResult, SessionInfo, StreamEvent } from "@/lib/types";

type Msg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; kind: "typing" }
  | { id: string; role: "assistant"; kind: "chat"; text: string; disclaimer?: string | null }
  | {
      id: string;
      role: "assistant";
      kind: "run";
      runId: string;
      plan: Plan;
      phase: "planned" | "running" | "done" | "error";
      l0?: L0;
      panels?: Panel[];
      memo?: Memo;
      followups?: string[];
      result?: RunResult;
      statusLine?: string;
      error?: string;
    };

const uid = () => Math.random().toString(36).slice(2, 10);

const isRunMsg = (m: Msg): m is Extract<Msg, { kind: "run" }> =>
  m.role === "assistant" && "kind" in m && m.kind === "run";

export default function Page() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [storeStats, setStoreStats] = useState<Record<string, unknown> | null>(null);
  const [evidence, setEvidence] = useState<Record<string, EvidenceItem>>({});
  const [drawer, setDrawer] = useState<EvidenceItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const refreshMeta = useCallback(async () => {
    try {
      const [cfg, stats, sess] = await Promise.all([api.fetchConfig(), api.fetchStoreStats(), api.fetchSessions()]);
      setConfig(cfg);
      setStoreStats(stats);
      setSessions(sess.sessions);
    } catch {
      /* core mungkin belum hidup — UI tetap jalan */
    }
  }, []);

  useEffect(() => {
    void refreshMeta();
    const t = window.setInterval(() => void refreshMeta(), 20000);
    return () => window.clearInterval(t);
  }, [refreshMeta]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const contextLine = useMemo(() => {
    const run = [...messages].reverse().find((m) => m.role === "assistant" && m.kind === "run") as
      | Extract<Msg, { kind: "run" }>
      | undefined;
    const syms = run?.plan.scope.symbols ?? [];
    const regional = run?.plan.scope.regional ?? [];
    if (!syms.length && !regional.length) return "belum ada — mulai dengan satu pertanyaan";
    return [...syms.slice(0, 6), ...regional.map((r) => r.symbol)].join(", ") + ` · ${syms.length} emiten`;
  }, [messages]);

  const updateRun = useCallback((id: string, patch: Partial<Extract<Msg, { kind: "run" }>>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id && m.role === "assistant" && m.kind === "run" ? { ...m, ...patch } : m)),
    );
  }, []);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setBusy(true);
      setInput("");
      const userMsg: Msg = { id: uid(), role: "user", text: q };
      const typingId = uid();
      setMessages((prev) => [...prev, userMsg, { id: typingId, role: "assistant", kind: "typing" }]);
      try {
        const res: ChatResponse = await api.sendChat(q, sessionId);
        if (res.kind === "chat") {
          setSessionId(res.session_id);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === typingId ? { id: m.id, role: "assistant", kind: "chat", text: res.reply, disclaimer: res.disclaimer } : m,
            ),
          );
          void refreshMeta();
        } else {
          setSessionId(res.session_id);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === typingId
                ? { id: m.id, role: "assistant", kind: "run", runId: res.run_id, plan: res.plan, phase: "planned" }
                : m,
            ),
          );
          void refreshMeta();
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === typingId ? { id: m.id, role: "assistant", kind: "chat", text: `Gagal memproses: ${detail}` } : m,
          ),
        );
        showToast("Core tidak menjawab — cek apakah `tools/serve.sh` jalan.");
      } finally {
        setBusy(false);
      }
    },
    [busy, sessionId, refreshMeta, showToast],
  );

  const approve = useCallback(
    async (msgId: string, runId: string, force = false) => {
      updateRun(msgId, { phase: "running", statusLine: "Menyiapkan gelombang fetch…" });
      try {
        await api.streamApprove(
          runId,
          (event: StreamEvent) => {
            if (event.type === "plan") {
              const plan = (event as unknown as { plan: Plan }).plan;
              updateRun(msgId, { plan, phase: "running" });
            } else if (event.type === "wave") {
              updateRun(msgId, { statusLine: `Gelombang ${String(event.wave)}: ${String(event.count)} pengambilan data` });
            } else if (event.type === "node") {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== msgId || !isRunMsg(m)) return m;
                  const nodes = m.plan.nodes.map((n) =>
                    n.id === (event as unknown as { id: string }).id
                      ? {
                          ...n,
                          status: String(event.status),
                          source: (event.source as string) ?? null,
                          credits_spent: Number(event.credits_spent ?? 0),
                          fetched_at: (event.fetched_at as string) ?? null,
                        }
                      : n,
                  );
                  return { ...m, plan: { ...m.plan, nodes } };
                }),
              );
            } else if (event.type === "l0") {
              updateRun(msgId, { l0: event.l0 as L0 });
            } else if (event.type === "panel") {
              const panel = event.panel as Panel;
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== msgId || !isRunMsg(m)) return m;
                  const existing = m.panels ?? [];
                  const idx = existing.findIndex((p) => p.id === panel.id);
                  const next = [...existing];
                  if (idx >= 0) next[idx] = panel;
                  else next.push(panel);
                  return { ...m, panels: next };
                }),
              );
            } else if (event.type === "panel_update") {
              const panel = event.panel as Panel;
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== msgId || !isRunMsg(m)) return m;
                  const next = (m.panels ?? []).map((p) => (p.id === panel.id ? panel : p));
                  return { ...m, panels: next };
                }),
              );
            } else if (event.type === "memo") {
              updateRun(msgId, { memo: event.memo as Memo, followups: (event.followups as string[]) ?? [] });
            } else if (event.type === "done") {
              const result = (event as unknown as { result: RunResult }).result;
              setEvidence(result.evidence ?? {});
              updateRun(msgId, { phase: "done", result, l0: result.l0, panels: result.panels, memo: result.memo, followups: result.followups });
              void refreshMeta();
            } else if (event.type === "error") {
              updateRun(msgId, { phase: "error", error: String(event.error ?? "error tidak diketahui") });
            }
          },
          { force },
        );
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        updateRun(msgId, { phase: "error", error: detail });
        showToast(detail.slice(0, 140));
      }
    },
    [refreshMeta, showToast, updateRun],
  );

  const onEvidence = useCallback(
    (id: string) => {
      const item = evidence[id];
      if (item) setDrawer(item);
      else showToast(`Bukti ${id} belum termuat (run belum selesai?).`);
    },
    [evidence, showToast],
  );

  const onExport = useCallback(
    async (runId: string, fmt: "xlsx" | "docx" | "pdf") => {
      try {
        await api.exportRun(runId, fmt);
        showToast(`Export ${fmt.toUpperCase()} siap.`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : `export ${fmt} gagal`);
      }
    },
    [showToast],
  );

  const pickSession = useCallback(
    async (id: string) => {
      try {
        const data = await api.fetchSessionTurns(id);
        setSessionId(id);
        const rebuilt: Msg[] = data.turns.map((t) => ({
          id: `turn-${t.id}`,
          role: t.role === "user" ? "user" : "assistant",
          kind: "chat",
          text: t.text,
        })) as Msg[];
        setMessages(rebuilt);
        showToast("Sesi dimuat — memori sesi dipakai untuk lanjutan.");
      } catch {
        showToast("Gagal memuat sesi.");
      }
    },
    [showToast],
  );

  const newChat = useCallback(() => {
    setMessages([]);
    setSessionId(undefined);
    setEvidence({});
    showToast("Sesi baru — memori dikosongkan.");
  }, [showToast]);

  const suggestions = [
    {
      title: "Bandingkan 3 bank",
      sub: "Valuasi, flow broker & asing, red-flag",
      q: "Bandingkan BBCA, BMRI, BBRI kuartal terakhir + siapa yang akumulasi + risiko kreditnya?",
    },
    { title: "Screener bank dividen", sub: "Filter natural → tabel comps", q: "Screening bank dengan dividen di atas 4% lalu bandingkan valuasinya" },
    { title: "Scan red-flag 10 debitur", sub: "Skor bahaya + bukti per aturan", q: "Scan red-flag 10 debitur: mana yang memburuk kuartal ini?" },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      <Sidebar sessions={sessions} activeSession={sessionId} onNewChat={newChat} onPickSession={pickSession} config={config} storeStats={storeStats} />
      <div className="main">
        <div className="glow" />
        <div className="topbar">
          <button className="iconbtn" title="Menu" onClick={() => document.body.classList.toggle("navcol")}>
            ☰
          </button>
          <button className="modelpill" onClick={() => showToast("Model terkunci: meta/muse-spark-1.3 via OpenRouter")}>
            <SparkIcon size={22} />
            <span>
              IDXMACA <span style={{ color: "var(--muted)", fontSize: 12 }}>▾</span>
              <br />
              <small>
                {String(config?.model ?? "meta/muse-spark-1.3")} · {String(config?.llm_mode ?? "template")} ·{" "}
                {String(storeStats?.mode ?? "fixture")}
              </small>
            </span>
          </button>
          <div className="topright">
            <span className="chip">
              Store {typeof storeStats?.hit_rate === "number" ? `${Math.round((storeStats.hit_rate as number) * 100)}% hit` : "—"}
              {typeof storeStats?.credits_spent === "number" && (storeStats.credits_spent as number) > 0
                ? ` · ${storeStats.credits_spent} kredit live`
                : " · 0 kredit"}
            </span>
            {typeof storeStats?.credit_remaining === "number" ? (
              <span className="chip" title="Sisa kredit menurut catatan IDXMACA (baseline disinkronkan manual ke portal hackathon; portal tetap sumber resmi)">
                Sisa {storeStats.credit_remaining as number} kredit
              </span>
            ) : null}
            <div className="avatar">A</div>
          </div>
        </div>

        <div className="scroll" ref={scrollRef}>
          <div className="thread">
            {!messages.length ? (
              <div className="welcome">
                <h1 className="greet">Halo, Analis</h1>
                <p className="greet-sub">Mau analisis emiten apa hari ini?</p>
                <div className="sugg">
                  {suggestions.map((s) => (
                    <button key={s.title} onClick={() => void send(s.q)} disabled={busy}>
                      <b>{s.title}</b>
                      <span>{s.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((m) => {
              if (m.role === "user") {
                return (
                  <div className="msg user" key={m.id}>
                    <div className="bubble">{m.text}</div>
                  </div>
                );
              }
              if (m.kind === "typing") {
                return (
                  <div className="msg agent" key={m.id}>
                    <SparkIcon />
                    <div className="bubble">
                      <Typing />
                    </div>
                  </div>
                );
              }
              if (m.kind === "chat") {
                return (
                  <div className="msg agent" key={m.id}>
                    <SparkIcon />
                    <div className="bubble">
                      <p style={{ margin: "2px 0 8px", whiteSpace: "pre-wrap" }}>{m.text}</p>
                      {m.disclaimer ? <div className="disclaimer">{m.disclaimer}</div> : null}
                      <div className="mactions">
                        <button title="Salin" onClick={() => navigator.clipboard.writeText(m.text)}>
                          ⧉
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div className="msg agent" key={m.id}>
                  <SparkIcon />
                  <div className="bubble">
                    <PlanCard
                      plan={m.plan}
                      phase={m.phase}
                      onApprove={(force) => void approve(m.id, m.runId, force)}
                      onOpenPlan={() =>
                        setDrawer({
                          id: "plan",
                          label: "Rencana agen (DAG node → endpoint)",
                          endpoint: "internal://planner",
                          params: {},
                          fetched_at: new Date().toISOString(),
                          source: m.plan.router_source ?? "planner",
                          value: m.plan,
                        })
                      }
                    />
                    {m.l0 ? <L0Strip l0={m.l0} /> : null}
                    {m.statusLine && m.phase === "running" ? <div className="src">{m.statusLine}</div> : null}
                    {m.panels?.map((panel) => (
                      <div key={panel.id}>
                        <h4 style={{ margin: "18px 0 2px", fontSize: 15 }}>
                          {panel.id} · {panel.title}{" "}
                          <span className={`chip ${panel.status === "ready" ? "" : "warn"}`}>{panel.items.length} intent</span>
                        </h4>
                        {panel.why ? <p className="sub">{panel.why}</p> : null}
                        {panel.items.map((piece) => (
                          <PieceCard key={piece.io} piece={piece} onEvidence={onEvidence} />
                        ))}
                      </div>
                    ))}
                    {m.error ? <div className="empty">Run gagal: {m.error}</div> : null}
                    {m.phase === "done" && m.memo && m.result ? (
                      <MemoCard
                        memo={m.memo}
                        followups={m.followups ?? []}
                        runId={m.runId}
                        result={m.result}
                        onExport={(fmt) => void onExport(m.runId, fmt)}
                        onFollowup={(f) => void send(f)}
                      />
                    ) : null}
                    <div className="mactions">
                      <button title="Jawaban bagus" onClick={() => showToast("Feedback dicatat — terima kasih.")}>
                        👍
                      </button>
                      <button title="Perlu perbaikan" onClick={() => showToast("Feedback dicatat — akan dievaluasi.")}>
                        👎
                      </button>
                      <button title="Salin ringkasan" onClick={() => navigator.clipboard.writeText(m.l0 ? `${m.l0.title}\n${m.l0.bullets.join("\n")}` : m.plan.query)}>
                        ⧉
                      </button>
                      <button title="Ulangi run (approve lagi, tetap cache)" onClick={() => void approve(m.id, m.runId, false)}>
                        ↺
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Composer
          value={input}
          onChange={setInput}
          onSend={() => void send(input)}
          disabled={busy}
          contextLine={contextLine}
          hint={
            <>
              Angka ilustrasi demo (mode {String(storeStats?.mode ?? "fixture")}) · semua angka memo bisa diklik ke bukti · Store hit-rate{" "}
              {typeof storeStats?.hit_rate === "number" ? `${Math.round((storeStats.hit_rate as number) * 100)}%` : "—"}
            </>
          }
        />
      </div>
      <EvidenceDrawer item={drawer} onClose={() => setDrawer(null)} />
      <Toast message={toast} />
    </div>
  );
}