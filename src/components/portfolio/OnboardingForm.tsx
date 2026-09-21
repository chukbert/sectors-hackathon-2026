"use client";

import { useState } from "react";

type ItemRow = { symbol: string; lots: string; avgPrice: string };

const EMPTY_ROWS: ItemRow[] = Array.from({ length: 4 }, () => ({ symbol: "", lots: "", avgPrice: "" }));

const DEMO: ItemRow[] = [
  { symbol: "BBCA", lots: "10", avgPrice: "9000" },
  { symbol: "BMRI", lots: "15", avgPrice: "6200" },
  { symbol: "TLKM", lots: "20", avgPrice: "3100" },
  { symbol: "INDF", lots: "8", avgPrice: "7000" },
  { symbol: "ICBP", lots: "6", avgPrice: "11000" },
  { symbol: "ANTM", lots: "12", avgPrice: "1600" },
  { symbol: "MDKA", lots: "10", avgPrice: "2450" },
  { symbol: "PGAS", lots: "9", avgPrice: "1700" },
];

export default function OnboardingForm({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<ItemRow[]>(EMPTY_ROWS);
  const [risk, setRisk] = useState<"konservatif" | "moderat" | "agresif">("moderat");
  const [goal, setGoal] = useState("");
  const [horizon, setHorizon] = useState("365");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [krSpent, setKrSpent] = useState<number | null>(null);

  const filled = rows.filter((r) => r.symbol.trim());
  const setRow = (i: number, patch: Partial<ItemRow>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const items = filled.map((r) => ({
        symbol: r.symbol.toUpperCase().trim(),
        ...(Number(r.lots) > 0 ? { lots: Number(r.lots) } : {}),
        ...(Number(r.avgPrice) > 0 ? { avgPrice: Number(r.avgPrice) } : {}),
      }));
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: { risk, goal: goal || undefined, horizonDays: Number(horizon) || undefined, items } }),
      });
      const data = (await res.json()) as { error?: string; issues?: string[]; graph?: { creditsKr: number; issues?: string[] } };
      if (!res.ok) {
        setError([data.error, ...(data.issues ?? [])].filter(Boolean).join(" · ") || `HTTP ${res.status}`);
        return;
      }
      setKrSpent(data.graph?.creditsKr ?? 0);
      await new Promise((r) => setTimeout(r, 900));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/60 p-4 backdrop-blur-sm">
      <div className="card my-8 w-full max-w-2xl p-6">
        <h1 className="text-xl font-semibold">Kenali dulu portofolio Anda</h1>
        <p className="mt-1 text-sm text-muted">
          Setiap jawaban INVESTIGRAPH akan dikaitkan dengan isi portofolio Anda. Satu kali di awal: ceritakan maksimum <b>8 emiten</b>, lalu sistem
          menginvestigasi <b>graph keterhubungan konglomerasi</b> antar-emiten Anda langsung dari Sectors API (sekali jalan, cap 80 kr, hasil disimpan).
        </p>

        {krSpent === null ? (
          <>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {(["konservatif", "moderat", "agresif"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRisk(r)}
                  className={`rounded-xl border px-3 py-2 text-sm capitalize ${risk === r ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:text-ink"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Tujuan (mis. dana pendidikan, passive income)" className="rounded-xl border border-line bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent" />
              <select value={horizon} onChange={(e) => setHorizon(e.target.value)} className="rounded-xl border border-line bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent">
                <option value="90">horizon &lt; 3 bulan</option>
                <option value="365">horizon 1 tahun</option>
                <option value="1825">horizon 5 tahun</option>
                <option value="3650">horizon &gt; 5 tahun</option>
              </select>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm font-medium">Emiten Anda {filled.length}/8</span>
              <div className="flex gap-2 text-xs">
                <button type="button" className="chip hover:border-accent" onClick={() => setRows(DEMO)}>isi contoh portofolio</button>
                {filled.length < 8 && filled.length > 0 ? <button type="button" className="chip hover:border-accent" onClick={() => setRows((p) => [...p, { symbol: "", lots: "", avgPrice: "" }])}>+ tambah baris</button> : null}
              </div>
            </div>
            <div className="mt-2 grid gap-1.5">
              {rows.slice(0, Math.max(filled.length + 1, 4)).map((r, i) => (
                <div key={i} className="grid grid-cols-[110px_1fr_1fr] items-center gap-1.5">
                  <input
                    value={r.symbol}
                    onChange={(e) => setRow(i, { symbol: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) })}
                    placeholder="KODE"
                    className={`rounded-lg border px-2 py-1.5 font-mono text-sm uppercase outline-none ${r.symbol.length === 4 ? "border-accent/50" : "border-line"} bg-surface2 focus:border-accent`}
                  />
                  <input value={r.lots} onChange={(e) => setRow(i, { lots: e.target.value.replace(/[^0-9]/g, "") })} placeholder="lot (opsional)" className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-sm tabular outline-none focus:border-accent" />
                  <input value={r.avgPrice} onChange={(e) => setRow(i, { avgPrice: e.target.value.replace(/[^0-9]/g, "") })} placeholder="harga rata-rata (opsional)" className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-sm tabular outline-none focus:border-accent" />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">Lot &amp; harga rata-rata opsional — tanpanya, analisis memakai estimasi bobot kapitalisasi pasar. Kode akan divalidasi ke IDX saat investigasi.</p>

            {error ? <div className="mt-3 rounded-xl border border-negative/40 bg-negative/10 p-2.5 text-sm text-negative">{error}</div> : null}

            <button
              type="button"
              disabled={busy || filled.filter((r) => r.symbol.length === 4).length === 0}
              onClick={() => void submit()}
              className="mt-4 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Menginvestigasi graph konglomerasi… hingga 80 kr, sekali jalan" : "Simpan & investigasi portofolio"}
            </button>
          </>
        ) : (
          <div className="mt-6 text-center">
            <div className="text-3xl">✓</div>
            <p className="mt-2 text-sm">
              Investigasi selesai — <b className="tabular">{krSpent.toFixed(0)} kr</b> terpakai. graph &amp; hasil dibaca ulang dari cache (gratis).
            </p>
            <button type="button" onClick={onDone} className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink">Mulai ngobrol →</button>
          </div>
        )}
        <p className="mt-4 text-[11px] text-muted">Bukan rekomendasi jual/beli. Data: Sectors API. Portofolio hanya memengaruhi konteks jawaban, tidak pernah memicu eksekusi order.</p>
      </div>
    </div>
  );
}
