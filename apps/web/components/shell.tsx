"use client";

import React, { useEffect, useRef } from "react";
import type { EvidenceItem, SessionInfo } from "@/lib/types";

export function Sidebar({
  sessions,
  activeSession,
  onNewChat,
  onPickSession,
  config,
  storeStats,
}: {
  sessions: SessionInfo[];
  activeSession?: string;
  onNewChat: () => void;
  onPickSession: (id: string) => void;
  config: Record<string, unknown> | null;
  storeStats: Record<string, unknown> | null;
}) {
  const mode = String(config?.llm_mode ?? "template");
  const storeMode = String(storeStats?.mode ?? "—");
  const hitRate = typeof storeStats?.hit_rate === "number" ? `${Math.round((storeStats.hit_rate as number) * 100)}%` : "—";
  const saved = typeof storeStats?.credits_saved === "number" ? (storeStats.credits_saved as number) : 0;
  const spent = typeof storeStats?.credits_spent === "number" ? (storeStats.credits_spent as number) : 0;
  const remaining = typeof storeStats?.credit_remaining === "number" ? (storeStats.credit_remaining as number) : null;
  return (
    <nav className="side">
      <div>
        <button className="iconbtn" title="Menu" onClick={() => document.body.classList.toggle("navcol")}>
          ☰
        </button>
      </div>
      <button className="newchat" onClick={onNewChat}>
        ✎&nbsp;&nbsp;Chat baru
      </button>
      <div className="navsec">Sesi</div>
      {sessions.slice(0, 12).map((s) => (
        <button key={s.id} className={`navitem ${activeSession === s.id ? "active" : ""}`} onClick={() => onPickSession(s.id)}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{s.title || "(tanpa judul)"}</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>{s.turns}</span>
        </button>
      ))}
      {!sessions.length ? <div className="navitem" style={{ color: "var(--muted)" }}>Belum ada sesi</div> : null}
      <div className="navsp" />
      <div className="navbot">
        <div className="navitem" title="Hukum cache wajib: semua lewat Store">
          Store {storeMode} · hit-rate {hitRate} · {saved} kredit dihemat
          {remaining !== null ? ` · sisa ${remaining}` : ""}
        </div>
        <div className="navitem" title="Satu model untuk semua peran">
          Model: {String(config?.model ?? "meta/muse-spark-1.3")} · LLM {mode}
        </div>
        <div className="navitem">● Jakarta · IDX · {config?.llm_available ? "LLM live" : "LLM template (tanpa key)"}</div>
      </div>
    </nav>
  );
}

export function Composer({
  value,
  onChange,
  onSend,
  disabled,
  contextLine,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  contextLine: string;
  hint: React.ReactNode;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${Math.min(ref.current.scrollHeight, 180)}px`;
    }
  }, [value]);
  return (
    <div className="composerzone">
      <div className="composer">
        <p className="ctxline">
          Konteks sesi: <b>{contextLine}</b>
        </p>
        <div className="cbox">
          <textarea
            ref={ref}
            rows={1}
            placeholder="Tanyakan IDXMACA — mis. bandingkan BBCA, BMRI, BBRI + siapa yang akumulasi + risiko kreditnya"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <div className="crow">
            <button className="iconbtn" title="Lampirkan (roadmap)" disabled>
              ＋
            </button>
            <span className="sp" />
            <button className="iconbtn" title="Dikte (roadmap)" disabled>
              🎙
            </button>
            <button className="sendbtn" title="Kirim" disabled={disabled || !value.trim()} onClick={onSend}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
        <div className="hint">{hint}</div>
      </div>
    </div>
  );
}

export function EvidenceDrawer({ item, onClose }: { item: EvidenceItem | null; onClose: () => void }) {
  if (!item) return null;
  const value = item.value;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Bukti {item.id}</h3>
          <button className="iconbtn" onClick={onClose} title="Tutup">
            ✕
          </button>
        </div>
        <p style={{ marginTop: 0, fontSize: 14 }}>
          <b>{item.label}</b>
        </p>
        <div className="kv">
          <span className="k">Endpoint</span>
          <span className="v">{item.endpoint}</span>
        </div>
        <div className="kv">
          <span className="k">Parameter</span>
          <span className="v">{JSON.stringify(item.params)}</span>
        </div>
        <div className="kv">
          <span className="k">Ditarik</span>
          <span className="v">{item.fetched_at}</span>
        </div>
        <div className="kv">
          <span className="k">Sumber</span>
          <span className={`v ${item.source === "store-hit" || item.source === "fixture" ? "hit" : "live"}`}>
            {item.source}
            {item.source === "store-hit" ? " · 0 kredit" : item.source === "sectors-live" ? " · live" : ""}
          </span>
        </div>
        {item.node_key ? (
          <div className="kv">
            <span className="k">Node</span>
            <span className="v">{item.node_key}</span>
          </div>
        ) : null}
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4 }}>Nilai yang dipakai:</p>
        <pre className="json">{JSON.stringify(value, null, 1)}</pre>
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}