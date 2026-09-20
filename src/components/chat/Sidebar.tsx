"use client";

import { useState } from "react";

export type SessionInfo = {
  id: string;
  title: string;
  updatedAt: string;
  levelMax: number | null;
  creditsUsedKr: number;
};

export type MemoryInfo = {
  id: string;
  kind: string;
  entity: string | null;
  key: string | null;
  value: unknown;
  provenance: string;
};

export default function Sidebar({
  sessions,
  activeId,
  memory,
  onSelect,
  onNew,
  onDeleteMemory,
}: {
  sessions: SessionInfo[];
  activeId: string | null;
  memory: MemoryInfo[];
  onSelect: (id: string) => void;
  onNew: () => void;
  onDeleteMemory: (id: string) => void;
}) {
  const [tab, setTab] = useState<"sessions" | "memory">("sessions");
  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-3 border-r border-line bg-surface/40 p-3 lg:flex">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 text-sm font-semibold text-accent">IG</div>
        <div>
          <div className="text-sm font-semibold">INVESTIGRAPH</div>
          <div className="text-[11px] text-muted">riset IDX berbasis bukti</div>
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-xl border border-line bg-surface2 p-0.5 text-xs">
        <button type="button" onClick={() => setTab("sessions")} className={`flex-1 rounded-lg px-2 py-1 ${tab === "sessions" ? "bg-accent/20 text-accent" : "text-muted"}`}>
          Sesi
        </button>
        <button type="button" onClick={() => setTab("memory")} className={`flex-1 rounded-lg px-2 py-1 ${tab === "memory" ? "bg-accent/20 text-accent" : "text-muted"}`}>
          Memori ({memory.length})
        </button>
      </div>

      {tab === "sessions" ? (
        <>
          <button type="button" onClick={onNew} className="rounded-xl border border-line bg-surface2 px-3 py-2 text-sm transition hover:border-accent/50">
            + Investigasi baru
          </button>
          <div className="flex flex-col gap-1 overflow-y-auto">
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${activeId === s.id ? "border-accent/50 bg-accent/10" : "border-transparent hover:border-line hover:bg-surface2/60"}`}
              >
                <div className="line-clamp-2">{s.title}</div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted">
                  {s.levelMax ? <span className="chip px-1.5 py-0">L{s.levelMax}</span> : null}
                  <span className="tabular">{s.creditsUsedKr.toFixed(0)} kr</span>
                  <span>{new Date(s.updatedAt).toLocaleDateString("id-ID")}</span>
                </div>
              </button>
            ))}
            {sessions.length === 0 ? <div className="px-2 text-xs text-muted">Belum ada sesi.</div> : null}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto text-xs">
          <p className="px-1 text-[11px] leading-relaxed text-muted">
            Memori lintas sesi (fakta tervalidasi, kesimpulan, preferensi). Sesi baru hanya membawa memori ini — bukan transkrip lama.
          </p>
          {memory.map((m) => (
            <div key={m.id} className="rounded-xl border border-line bg-surface2/60 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="chip px-1.5 py-0">{m.kind}</span>
                <button type="button" onClick={() => onDeleteMemory(m.id)} className="text-[10px] text-muted hover:text-negative">
                  hapus
                </button>
              </div>
              <div className="mt-1 text-ink/90">
                {m.entity ? <span className="tabular">{m.entity}</span> : null}
                {m.key ? <span className="text-muted"> · {m.key}</span> : null}
              </div>
              <div className="mt-0.5 line-clamp-3 text-muted">{typeof m.value === "string" ? m.value : JSON.stringify(m.value)}</div>
              <div className="mt-0.5 text-[10px] text-muted/70">{m.provenance}</div>
            </div>
          ))}
          {memory.length === 0 ? <div className="px-2 text-muted">Belum ada memori.</div> : null}
        </div>
      )}
    </aside>
  );
}