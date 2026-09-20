"use client";

import { useMemo, useRef, useState } from "react";
import type { AnswerDoc, FactRef } from "@/lib/output/answerdoc";
import type { LangMode } from "@/lib/util/format";
import { formatDateId } from "@/lib/util/format";
import Blocks from "@/components/answer/Blocks";
import { formatFactRef } from "@/components/answer/rich";

const MODES: Array<{ id: LangMode; label: string }> = [
  { id: "pemula", label: "Pemula" },
  { id: "menengah", label: "Menengah" },
  { id: "advanced", label: "Advanced" },
];

const PLACEHOLDER = /\{\{f:([a-z0-9]+)\|[a-z]+\}\}/gi;

export default function AnswerCard({
  doc,
  mode,
  onModeChange,
}: {
  doc: AnswerDoc;
  mode: LangMode;
  onModeChange: (mode: LangMode) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [audit, setAudit] = useState(false);
  const [busyExport, setBusyExport] = useState(false);
  const { agents, evidence, factIndexSrc, sections } = useMemo(
    () => ({
      agents: doc.agents ?? [],
      evidence: doc.evidence ?? [],
      factIndexSrc: doc.factIndex ?? [],
      sections: doc.sections ?? [],
    }),
    [doc],
  );
  const factIndex = useMemo(() => new Map<string, FactRef>(factIndexSrc.map((f) => [f.id, f])), [factIndexSrc]);

  const cite = useMemo(() => {
    const bySource = new Map<string, number>();
    for (const e of evidence) if (!bySource.has(e.endpoint)) bySource.set(e.endpoint, bySource.size + 1);
    for (const f of factIndexSrc) if (f.source && !bySource.has(f.source)) bySource.set(f.source, bySource.size + 1);
    return { sources: [...bySource.entries()] };
  }, [evidence, factIndexSrc]);

  const resolvePlain = (text: string) => text.replace(PLACEHOLDER, (_m, id: string) => {
    const fact = factIndex.get(id);
    return fact ? formatFactRef(fact, mode) : "—";
  });

  const tldr = useMemo(() => {
    const raw = resolvePlain(doc.conclusion?.[mode] ?? "");
    const first = raw.split(/(?<=[.!?])\s/)[0] ?? raw;
    return first.length > 180 ? `${first.slice(0, 177)}…` : first;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, mode, factIndex]);

  const exportPng = async () => {
    if (!cardRef.current) return;
    setBusyExport(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, { backgroundColor: "#0b0c10", pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `investigraph-L${doc.level}-${doc.title.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setBusyExport(false);
    }
  };

  const copySummary = async () => {
    const lines: string[] = [`# ${doc.title}`, "", resolvePlain(doc.conclusion?.[mode] ?? ""), ""];
    for (const s of sections) {
      const narr = s.blocks.find((b) => b.kind === "narrative");
      if (narr && narr.kind === "narrative") lines.push(`## ${s.title}`, "", resolvePlain(narr.variants[mode]), "");
    }
    lines.push("Sumber:");
    cite.sources.forEach(([endpoint, n]) => lines.push(`  [${n}] ${endpoint} · Sectors API`));
    lines.push("", "Bukan rekomendasi jual/beli. Semua angka dari Sectors API dan tersitasi.");
    await navigator.clipboard.writeText(lines.join("\n"));
  };

  const stages = [
    { label: "Guard", detail: "scope" },
    { label: "Intent", detail: `${Math.max(1, agents.length)}` },
    { label: "Plan", detail: `${evidence.length} call` },
    { label: "Agents", detail: `${agents.length || 1}` },
    { label: "Verify", detail: doc.verified?.citations ? "ok" : "review" },
    { label: "Done", detail: `L${doc.level}` },
  ];

  return (
    <div className="flex flex-col gap-3">
        <div ref={cardRef} className={`card p-4 sm:p-5 ${audit ? "audit" : ""}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold leading-snug sm:text-xl">{doc.title}</h2>
              <div className="mt-2 flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5">
                <span className="chip shrink-0 border-accent/40 text-accent tabular" title="Level analisis (kedalaman)">L{doc.level}</span>
                <span className="chip shrink-0 whitespace-nowrap" title="Domain / intent yang terdeteksi">{doc.domain}</span>
                <span className={`chip shrink-0 ${doc.verified?.compliance ? "border-positive/40 text-positive" : "border-negative/50 text-negative"}`} title="Pemeriksaan kepatuhan (tanpa anjuran beli/jual)">
                  {doc.verified?.compliance ? "compliance lolos" : "compliance ditahan"}
                </span>
                <span className={`chip shrink-0 ${doc.verified?.citations ? "" : "border-warn/50 text-warn"}`} title="Semua angka terhubung ke sumber data">{doc.verified?.citations ? "sitasi ✓" : "sitasi ?"}</span>
                {doc.verified?.degraded ? <span className="chip shrink-0 border-warn/50 text-warn" title="Narasi memakai template fallback (LLM gagal); angka tetap bersitasi">mode aman</span> : null}
                <span className="chip shrink-0 tabular" title="Kredit Sectors terpakai untuk jawaban ini"><span className="h-2 w-2 rounded-full bg-warn" />{(doc.credits?.total ?? 0).toFixed(0)} kr</span>
                <button type="button" onClick={() => setShowAudit((v) => !v)} className="chip shrink-0 tabular transition hover:border-accent/50 hover:text-ink" title="Buka jejak audit sumber">
                  {evidence.length} sumber
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-full border border-line bg-surface2 p-0.5">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onModeChange(m.id)}
                  className={`rounded-full px-3 py-1 text-xs transition ${mode === m.id ? "bg-accent/20 text-accent" : "text-muted hover:text-ink"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            {stages.map((s, i) => (
              <span key={s.label} className="flex items-center gap-1.5">
                <span className={`stepper-dot ${s.detail === "review" ? "" : "done"}`} />
                <span className="uppercase tracking-wide">{s.label}</span>
                <span className="tabular text-ink/70">{s.detail}</span>
                {i < stages.length - 1 ? <span className="text-line">·</span> : null}
              </span>
            ))}
          </div>

          {tldr ? (
            <div className="tldr mt-3">
              <span className="mt-0.5 shrink-0 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">TL;DR</span>
              <span className="min-w-0">{tldr}</span>
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-5">
            {sections.map((section) => {
              if (section.id === "hero") return <Blocks key={section.id} blocks={section.blocks} factIndex={factIndex} mode={mode} />;
              if (section.id === "catatan") return <Blocks key={section.id} blocks={section.blocks} factIndex={factIndex} mode={mode} />;
              return (
                <section key={section.id}>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{section.title}</h3>
                  <Blocks blocks={section.blocks} factIndex={factIndex} mode={mode} />
                </section>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <span className="text-[11px] text-muted">Diperbarui {formatDateId(doc.generatedAt)} · sumber angka: Sectors API</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setAudit((v) => !v)} className={`rounded-lg border px-3 py-1.5 text-xs transition ${audit ? "border-accent/50 bg-accent/10 text-accent" : "border-line text-muted hover:text-ink"}`} title="Tampilkan garis sitasi di setiap angka">
                Mode audit
              </button>
              <button type="button" onClick={() => setShowAudit((v) => !v)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:text-ink">
                {showAudit ? "Tutup audit" : "Jejak audit"}
              </button>
              <button type="button" onClick={copySummary} className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:text-ink">
                Salin ringkasan
              </button>
              <button type="button" onClick={exportPng} disabled={busyExport} className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:bg-accent/20 disabled:opacity-50">
                {busyExport ? "Menyiapkan…" : "Ekspor PNG"}
              </button>
            </div>
          </div>
        </div>

        {showAudit ? <AuditPanel doc={doc} sources={cite.sources} agents={agents} /> : null}
    </div>
  );
}

function AuditPanel({ doc, sources, agents }: { doc: AnswerDoc; sources: Array<[string, number]>; agents: NonNullable<AnswerDoc["agents"]> }) {
  const evidence = doc.evidence ?? [];
  const traces = doc.traces ?? [];
  const notes = doc.notes ?? [];
  const sourceNumber = new Map(sources);
  return (
    <div className="card p-4 text-sm">
      <div className="text-xs uppercase tracking-wide text-muted">Pengambilan data (Sectors)</div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted">
            <tr>
              <th className="px-2 py-1 text-left font-normal">#</th>
              <th className="px-2 py-1 text-left font-normal">Endpoint</th>
              <th className="px-2 py-1 text-left font-normal">Tujuan</th>
              <th className="px-2 py-1 text-left font-normal">Sumber</th>
              <th className="px-2 py-1 text-right font-normal">kr</th>
              <th className="px-2 py-1 text-right font-normal">fakta</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map((e, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-2 py-1 tabular text-accent">[{sourceNumber.get(e.endpoint) ?? "-"}]</td>
                <td className="px-2 py-1 tabular">{e.endpoint}</td>
                <td className="px-2 py-1 text-muted">{e.purpose ?? "-"}</td>
                <td className="px-2 py-1">
                  <span className={`chip ${e.source === "live" ? "border-warn/40 text-warn" : "border-positive/40 text-positive"}`}>{e.source}</span>
                </td>
                <td className="px-2 py-1 text-right tabular">{e.chargedKr}</td>
                <td className="px-2 py-1 text-right tabular">{e.facts}</td>
              </tr>
            ))}
            {evidence.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-2 text-muted">Tidak ada pengambilan data pada jawaban ini.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {agents.length ? (
        <>
          <div className="mt-4 text-xs uppercase tracking-wide text-muted">Agent yang dijalankan</div>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs">
            {agents.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface2/60 px-2 py-1">
                <span className={`h-1.5 w-1.5 rounded-full ${a.status === "ok" ? "bg-positive" : a.status === "partial" ? "bg-warn" : "bg-negative"}`} />
                <span>{a.label}</span>
                <span className="tabular text-muted">{a.facts}f · {a.creditsKr}kr</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {traces.length ? (
        <>
          <div className="mt-4 text-xs uppercase tracking-wide text-muted">Keputusan verifikasi (Jev)</div>
          <ul className="mt-2 flex flex-col gap-1 text-xs">
            {traces.map((t, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 border-t border-line py-1">
                <span className="chip">{t.position}</span>
                <span>{t.outcome}</span>
                <span className="text-muted">conf {t.confidence.toFixed(2)}</span>
                <span className="tabular text-muted">${t.costUsd.toFixed(6)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {notes.length ? (
        <>
          <div className="mt-4 text-xs uppercase tracking-wide text-muted">Catatan & batasan</div>
          <ul className="mt-2 list-disc pl-4 text-xs text-muted">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        Investigraph menyajikan data dan konteks, bukan rekomendasi jual/beli. Semua angka berasal dari Sectors API dan diberi sitasi; keputusan investasi sepenuhnya tanggung jawab pengguna.
      </p>
    </div>
  );
}
