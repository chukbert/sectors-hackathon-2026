"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PortfolioGraph } from "@/lib/portfolio/graph";
import { layoutGraph } from "@/lib/portfolio/graph";
import { formatIdr, formatPercent } from "@/lib/util/format";
import type { PortfolioProfile } from "@/lib/db/portfolio-store";

type Response = { profile: PortfolioProfile | null; graph: { status: string; creditsKr: number; error: string | null; graph: PortfolioGraph | null; createdAt: string } | null; mode: string };

const KIND_STYLE = {
  holding: { fill: "#ff8b3d", stroke: "#ff8b3d", label: "punya Anda" },
  listed: { fill: "#a3e635", stroke: "#a3e635", label: "terhubung (IDX)" },
  entity: { fill: "#1c1e29", stroke: "#9a9aa8", label: "entitas pemegang" },
} as const;

export default function GraphView() {
  const [data, setData] = useState<Response | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/portfolio").then((r) => r.json());
    setData(res as Response);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh" }) });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) setError(data.error ?? "Gagal menyegarkan.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const g = data?.graph?.graph ?? null;
  const positioned = useMemo(() => (g ? layoutGraph(g.nodes) : null), [g]);
  const nodePos = useMemo(() => new Map((positioned?.positioned ?? []).map((p) => [p.node.id, p])), [positioned]);

  if (!data) return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted">Memuat portofolio…</div>;
  if (!data.profile)
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="card p-5 text-sm">
          Belum ada profil portofolio. <Link href="/" className="text-accent underline">Kembali ke chat untuk onboarding</Link> (wajib sebelum tanya jawab).
        </div>
      </div>
    );

  const profile = data.profile;
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Portofolio saya — graph konglomerasi</h1>
          <p className="mt-0.5 text-sm text-muted">
            {profile.items.length} emiten · profil {profile.risk} · investigasi sekali jalan cap 80 kr, hasil tersimpan ·{" "}
            <span className="tabular">{data.graph!.creditsKr.toFixed(0)} kr terpakai · {g?.calls.length ?? 0} panggilan API</span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link href="/" className="chip hover:border-accent">← kembali ke chat</Link>
          <button type="button" onClick={() => void refresh()} disabled={busy} className="chip border-accent/50 text-accent disabled:opacity-40">
            {busy ? "menyegarkan… (minta ulang ke API)" : "refresh graph"}
          </button>
        </div>
      </header>

      {error ? <div className="card border-negative/40 p-3 text-sm text-negative">{error}</div> : null}
      {data.graph?.error ? <div className="card border-warn/40 p-3 text-sm text-warn">{data.graph.error}</div> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        {g && positioned ? (
          <section className="card overflow-hidden p-2">
            <svg viewBox={`0 0 860 ${positioned.height}`} className="w-full" role="img" aria-label="Graph keterhubungan pemegang saham">
              {g.edges.map((e, i) => {
                const a = nodePos.get(e.from);
                const b = nodePos.get(e.to);
                if (!a || !b) return null;
                return (
                  <g key={i}>
                    <path
                      d={`M ${a.x} ${a.y} C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y}`}
                      fill="none"
                      stroke={e.crossPortfolio ? "#ff8b3d" : "#4b4d5f"}
                      strokeWidth={Math.max(1, Math.min(4, e.pct * 5))}
                      strokeOpacity={0.85}
                    />
                    <text x={(a.x + b.x) / 2 + (i % 2 ? 8 : -8)} y={(a.y + b.y) / 2} fill="#9a9aa8" fontSize={10} textAnchor="middle">
                      {formatPercent(e.pct)}
                    </text>
                  </g>
                );
              })}
              {positioned.positioned.map(({ node, x, y }) => {
                const s = KIND_STYLE[node.kind];
                return (
                  <g key={node.id}>
                    <circle cx={x} cy={y} r={node.kind === "entity" ? 13 : 17} fill={node.kind === "entity" ? s.fill : "#14151d"} stroke={s.stroke} strokeWidth={2} />
                    {node.kind === "entity" ? null : <text x={x} y={y + 3.5} fill={s.stroke} fontSize={9} fontWeight={700} textAnchor="middle">{node.symbol}</text>}
                    <text x={x} y={y + (node.kind === "entity" ? 26 : 30)} fill="#f2f1ee" fontSize={10.5} textAnchor="middle" style={{ paintOrder: "stroke" }} stroke="#0b0c10" strokeWidth={3}>
                      {node.name.length > 28 ? `${node.name.slice(0, 27)}…` : node.name}
                    </text>
                    {node.weightPct !== undefined ? (
                      <text x={x} y={y - 24} fill="#ff8b3d" fontSize={10} textAnchor="middle" fontWeight={600}>
                        bobot {node.weightPct}%
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
            <div className="flex flex-wrap gap-3 px-3 pb-2 pt-1 text-[11px] text-muted">
              {(Object.keys(KIND_STYLE) as Array<keyof typeof KIND_STYLE>).map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: KIND_STYLE[k].stroke }} /> {KIND_STYLE[k].label}
                </span>
              ))}
              <span>· tebal garis = besar porsi kepemilikan</span>
            </div>
          </section>
        ) : (
          <section className="card p-5 text-sm text-muted">Graph belum tersedia — jalankan refresh.</section>
        )}

        <aside className="flex flex-col gap-3">
          <section className="card p-4">
            <h2 className="text-sm font-semibold">Kluster konglomerasi</h2>
            <ul className="mt-2 flex flex-col gap-2 text-xs">
              {g?.clusters.length ? (
                g.clusters.map((c) => {
                  const members = c.nodeIds.map((id) => g.nodes.find((n) => n.id === id)).filter((n): n is NonNullable<typeof n> => Boolean(n));
                  const holdings = members.filter((m) => m.kind === "holding").map((m) => m.symbol);
                  if (holdings.length < 2) return null;
                  return (
                    <li key={c.id} className="rounded-lg border border-line bg-surface2/60 p-2">
                      <b className="text-ink">{holdings.join(" ↔ ")}</b>
                      <div className="mt-0.5 text-muted">satu grup: {c.label}</div>
                    </li>
                  );
                })
              ) : (
                <li className="text-muted">Tidak ada dua emiten Anda yang terhubung dalam grup yang sama.</li>
              )}
            </ul>
          </section>
          <section className="card p-4">
            <h2 className="text-sm font-semibold">Isi portofolio</h2>
            <ul className="mt-2 flex flex-col gap-2 text-xs">
              {profile.items.map((it) => {
                const node = g?.nodes.find((n) => n.id === it.symbol);
                return (
                  <li key={it.symbol} className="flex items-baseline justify-between gap-2">
                    <span>
                      <b className="font-mono text-ink">{it.symbol}</b>{" "}
                      <span className="text-muted">{node?.name.slice(0, 26)}</span>
                    </span>
                    <span className="tabular text-muted">{node?.marketCap ? formatIdr(node.marketCap) : "—"}</span>
                  </li>
                );
              })}
            </ul>
          </section>
          {g?.issues.length ? (
            <section className="card border-warn/30 p-4">
              <h2 className="text-sm font-semibold">Catatan investigasi</h2>
              <ul className="mt-2 list-disc pl-4 text-xs text-muted">
                {g.issues.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <p className="text-[11px] leading-relaxed text-muted">
            Sisi: halaman ini sekali menginvestigasi ≤80 kr (laporan kepemilikan + penelusuran nama pemegang ke IDX); setelahnya semua dibaca dari cache.
            Graph yang sama dipakai asisten untuk mengaitkan setiap jawaban dengan portofolio Anda. Bukan rekomendasi jual/beli.
          </p>
        </aside>
      </div>
    </main>
  );
}
