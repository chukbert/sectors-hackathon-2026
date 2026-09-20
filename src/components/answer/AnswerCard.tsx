"use client";

import { useMemo, useRef, useState } from "react";
import type { AnswerDoc, FactRef } from "@/lib/output/answerdoc";
import type { LangMode } from "@/lib/util/format";
import Blocks from "@/components/answer/Blocks";
import { formatFactRef } from "@/components/answer/rich";

const MODES: Array<{ id: LangMode; label: string }> = [
  { id: "pemula", label: "Pemula" },
  { id: "menengah", label: "Menengah" },
  { id: "advanced", label: "Advanced" },
];

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
  const [busyExport, setBusyExport] = useState(false);
  const factIndex = useMemo(() => new Map<string, FactRef>(doc.factIndex.map((f) => [f.id, f])), [doc.factIndex]);

  const exportPng = async () => {
    if (!cardRef.current) return;
    setBusyExport(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, { backgroundColor: "#0a0d14", pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `investigraph-L${doc.level}-${doc.title.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setBusyExport(false);
    }
  };

  const copySummary = async () => {
    const plain = doc.conclusion[mode].replace(/\{\{f:([a-z0-9]+)\|[a-z]+\}\}/gi, (_m, id: string) => {
      const fact = factIndex.get(id);
      return fact ? formatFactRef(fact, mode) : "";
    });
    await navigator.clipboard.writeText(
      `${doc.title}\n\n${plain}\n\nSumber: Sectors API (${doc.evidence.length} pengambilan, ${doc.credits.total.toFixed(0)} kr). Bukan rekomendasi jual/beli.`,
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div ref={cardRef} className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-snug sm:text-lg">{doc.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="chip border-accent/40 text-accent">L{doc.level}</span>
              <span className="chip">{doc.domain}</span>
              <span className={`chip ${doc.verified.compliance ? "border-positive/40 text-positive" : "border-negative/50 text-negative"}`}>
                {doc.verified.compliance ? "compliance lolos" : "compliance ditahan"}
              </span>
              <span className={`chip ${doc.verified.citations ? "" : "border-warn/50 text-warn"}`}>{doc.verified.citations ? "sitasi terverifikasi" : "sitasi perlu ditinjau"}</span>
              {doc.verified.degraded ? <span className="chip border-warn/50 text-warn">mode aman</span> : null}
              <span className="chip tabular">{doc.credits.total.toFixed(0)} kr Sectors</span>
              <span className="chip">{doc.evidence.length} sumber</span>
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

        <p className="mt-4 text-[15px] leading-relaxed text-ink">{doc.conclusion[mode] ? renderParagraph(doc.conclusion[mode], factIndex, mode) : null}</p>

        <div className="mt-5 flex flex-col gap-5">
          {doc.sections.map((section) => (
            <section key={section.id}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{section.title}</h3>
              <Blocks blocks={section.blocks} factIndex={factIndex} mode={mode} />
            </section>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <span className="text-[11px] text-muted">Diperbarui {new Date(doc.generatedAt).toLocaleString("id-ID")} · sumber angka: Sectors API</span>
          <div className="flex items-center gap-2">
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

      {showAudit ? <AuditPanel doc={doc} /> : null}
    </div>
  );
}

function renderParagraph(text: string, factIndex: Map<string, FactRef>, mode: LangMode) {
  const parts = text.split(/(\{\{f:[a-z0-9]+\|[a-z]+\}\})/gi);
  return parts.map((part, i) => {
    const m = part.match(/^\{\{f:([a-z0-9]+)\|([a-z]+)\}\}$/i);
    if (!m) return <span key={i}>{part}</span>;
    const fact = factIndex.get(m[1]);
    if (!fact) return <span key={i} className="text-negative">[data hilang]</span>;
    return (
      <span key={i} className="fact-chip tabular" title={`${fact.label} · as of ${fact.asOf} · ${fact.source}`}>
        {formatFactRef(fact, mode)}
      </span>
    );
  });
}

function AuditPanel({ doc }: { doc: AnswerDoc }) {
  return (
    <div className="card p-4 text-sm">
      <div className="text-xs uppercase tracking-wide text-muted">Pengambilan data (Sectors)</div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted">
            <tr>
              <th className="px-2 py-1 text-left font-normal">Endpoint</th>
              <th className="px-2 py-1 text-left font-normal">Tujuan</th>
              <th className="px-2 py-1 text-left font-normal">Sumber</th>
              <th className="px-2 py-1 text-right font-normal">kr</th>
              <th className="px-2 py-1 text-right font-normal">fakta</th>
            </tr>
          </thead>
          <tbody>
            {doc.evidence.map((e, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-2 py-1 tabular">{e.endpoint}</td>
                <td className="px-2 py-1 text-muted">{e.purpose ?? "-"}</td>
                <td className="px-2 py-1">
                  <span className={`chip ${e.source === "live" ? "border-warn/40 text-warn" : "border-positive/40 text-positive"}`}>{e.source}</span>
                </td>
                <td className="px-2 py-1 text-right tabular">{e.chargedKr}</td>
                <td className="px-2 py-1 text-right tabular">{e.facts}</td>
              </tr>
            ))}
            {doc.evidence.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-2 text-muted">
                  Tidak ada pengambilan data pada jawaban ini.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {doc.traces.length ? (
        <>
          <div className="mt-4 text-xs uppercase tracking-wide text-muted">Keputusan verifikasi (Jev)</div>
          <ul className="mt-2 flex flex-col gap-1 text-xs">
            {doc.traces.map((t, i) => (
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

      {doc.notes.length ? (
        <>
          <div className="mt-4 text-xs uppercase tracking-wide text-muted">Catatan & batasan</div>
          <ul className="mt-2 list-disc pl-4 text-xs text-muted">
            {doc.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        Investigraph menyajikan data dan konteks, bukan rekomendasi jual/beli. Semua angka berasal dari Sectors API dan diberi sitasi; keputusan investasi
        sepenuhnya tanggung jawab pengguna.
      </p>
    </div>
  );
}