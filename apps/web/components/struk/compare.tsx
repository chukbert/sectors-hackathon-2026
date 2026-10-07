"use client";

import type { Card } from "@/lib/struk";
import { num, pct, rupiah, share } from "@/lib/struk";
import { Term } from "./bits";
import { FiveSidesRadar, TrendChart } from "./charts";

// Bandingkan 2–5 emiten berdampingan. Satu kolom per emiten, satu baris per ukuran, jadi angka yang sama selalu sejajar.
// Semua isi berasal dari kartu yang sama dengan tampilan satu emiten: tidak ada panggilan Sectors tambahan.

const id1 = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 1 });

type Row = { label: React.ReactNode; hint?: string; cell: (c: Card) => React.ReactNode };

// Batang relatif terhadap nilai terbesar di baris itu, supaya beda skala langsung terlihat.
function Mag({ v, max, neg }: { v: number | null; max: number; neg?: boolean }) {
  if (v === null) return <span className="sj-cmp-na">—</span>;
  const w = max > 0 ? Math.max(2, (Math.abs(v) / max) * 100) : 0;
  return (
    <>
      <div className={`sj-cmp-v${neg ? " neg" : ""}`}>{rupiah(v)}</div>
      <div className={`sj-cmp-bar${neg ? " neg" : ""}`}>
        <span style={{ width: `${w}%` }} />
      </div>
    </>
  );
}

function rowMax(cards: Card[], get: (c: Card) => number | null): number {
  return Math.max(0, ...cards.map((c) => Math.abs(get(c) ?? 0)));
}

// Segmen sumber pendapatan = simpul peta uang yang tidak pernah jadi tujuan aliran, kecuali yang mengalir ke biaya
// (mis. "Operating Income → Operating Expense" pada emiten rugi: itu rugi, bukan sumber penjualan).
const COST = /cost|expense|tax/i;
function segments(c: Card): { name: string; share: number }[] {
  if (!c.money) return [];
  const targets = new Set(c.money.links.map((l) => l.target));
  const src = new Map<string, number>();
  for (const l of c.money.links)
    if (!targets.has(l.source) && !COST.test(l.target) && l.value > 0) src.set(l.source, (src.get(l.source) ?? 0) + l.value);
  const total = [...src.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  const all = [...src.entries()].map(([name, v]) => ({ name, share: v / total })).sort((a, b) => b.share - a.share);
  if (all.length <= 4) return all;
  const rest = all.slice(3).reduce((a, s) => a + s.share, 0);
  return [...all.slice(0, 3), { name: `${all.length - 3} segmen lain`, share: rest }];
}

const isPublic = (name: string) => /public|publik|masyarakat/i.test(name);

export function CompareView({
  cards,
  loading,
  onRemove,
}: {
  cards: Card[];
  loading: string[];
  onRemove: (symbol: string) => void;
}) {
  const n = cards.length + loading.length;
  const revMax = rowMax(cards, (c) => c.facts.revenue);
  const earnMax = rowMax(cards, (c) => c.facts.earnings);
  const capMax = rowMax(cards, (c) => c.facts.market_cap);
  const debtMax = rowMax(cards, (c) => Math.max(c.facts.total_debt ?? 0, c.facts.total_equity ?? 0));

  const size: Row[] = [
    { label: <Term k="pendapatan">Pendapatan setahun</Term>, cell: (c) => <Mag v={c.facts.revenue} max={revMax} /> },
    { label: <Term k="laba">Laba bersih</Term>, cell: (c) => <Mag v={c.facts.earnings} max={earnMax} neg={(c.facts.earnings ?? 0) < 0} /> },
    {
      label: "Sisa laba per Rp100 penjualan",
      cell: (c) => {
        const p = c.facts.per_100;
        if (p === null) return <span className="sj-cmp-na">—</span>;
        return (
          <>
            <div className={`sj-cmp-v${p < 0 ? " neg" : ""}`}>{p < 0 ? `rugi Rp${id1(-p)}` : `Rp${id1(p)}`}</div>
            <div className={`sj-cmp-bar${p < 0 ? " neg" : ""}`}>
              <span style={{ width: `${Math.max(2, Math.min(100, Math.abs(p)))}%` }} />
            </div>
          </>
        );
      },
    },
    {
      label: <Term k="kapitalisasi">Nilai pasar</Term>,
      cell: (c) => (
        <>
          <Mag v={c.facts.market_cap} max={capMax} />
          {c.facts.market_cap_rank !== null && (
            <div className="sj-cmp-h">
              peringkat {num(c.facts.market_cap_rank)} dari {num(c.facts.universe_total)}
            </div>
          )}
        </>
      ),
    },
    { label: <Term k="utang">Utang</Term>, cell: (c) => <Mag v={c.facts.total_debt} max={debtMax} /> },
    { label: <Term k="modal">Modal sendiri</Term>, cell: (c) => <Mag v={c.facts.total_equity} max={debtMax} /> },
    {
      label: <Term k="roe">ROE</Term>,
      cell: (c) => <div className={`sj-cmp-v${(c.facts.roe ?? 0) < 0 ? " neg" : ""}`}>{pct(c.facts.roe)}</div>,
    },
    {
      label: (
        <>
          Laba yang dibagi sebagai <Term k="dividen">dividen</Term>
        </>
      ),
      cell: (c) =>
        c.facts.payout_ratio === null ? <span className="sj-cmp-na">tidak membagi / belum ada data</span> : <div className="sj-cmp-v">{pct(c.facts.payout_ratio, 0)}</div>,
    },
  ];

  const owners: Row[] = [
    {
      label: <Term k="publik">Dimiliki publik</Term>,
      cell: (c) => {
        const ff = c.owners.free_float ?? c.owners.holders.find((h) => isPublic(h.name))?.pct ?? null;
        return (
          <>
            <div className="sj-cmp-v">{share(ff)}</div>
            {ff !== null && (
              <div className="sj-cmp-bar pub">
                <span style={{ width: `${Math.min(100, ff * 100)}%` }} />
              </div>
            )}
          </>
        );
      },
    },
    {
      label: <Term k="pengendali">Pemegang terbesar</Term>,
      cell: (c) => {
        const top = c.owners.holders.filter((h) => !isPublic(h.name)).sort((a, b) => b.pct - a.pct)[0];
        if (!top) return <span className="sj-cmp-na">—</span>;
        return (
          <div className="sj-cmp-t">
            {top.name} <b>{share(top.pct)}</b>
          </div>
        );
      },
    },
    {
      label: "Grup usaha",
      cell: (c) => <div className="sj-cmp-t">{c.owners.group.label || <span className="sj-cmp-na">—</span>}</div>,
    },
  ];

  const axes = cards[0]?.snowflake?.axes.map((a) => ({ id: a.id, label: a.label })) ?? [];

  const cols = `var(--cmp-label) repeat(${n}, minmax(var(--cmp-col), 1fr))`;

  const section = (no: string, title: string, note?: string) => (
    <div className="sj-cmp-sec" style={{ gridColumn: "1 / -1" }}>
      <div className="in">
        <span className="no">{no}</span> <b>{title}</b>
        {note && <span className="note">{note}</span>}
      </div>
    </div>
  );

  const rows = (list: Row[]) =>
    list.map((r, i) => (
      <div className="sj-cmp-row" key={i} style={{ display: "contents" }}>
        <div className="sj-cmp-lab">{r.label}</div>
        {cards.map((c) => (
          <div className="sj-cmp-cell" key={c.symbol}>
            {r.cell(c)}
          </div>
        ))}
        {loading.map((s) => (
          <div className="sj-cmp-cell" key={s} />
        ))}
      </div>
    ));

  return (
    <section className="sj-card sj-cmp-card" id="kartu">
      <header className="sj-card-head sj-cmp-head">
        <div className="code">BANDINGKAN {n} EMITEN</div>
        <p>Geser ke samping untuk melihat semua kolom. Setiap baris memakai ukuran yang sama, jadi angkanya bisa dibaca sejajar.</p>
      </header>
      <div className="sj-cmp">
        <div className="sj-cmp-grid" style={{ gridTemplateColumns: cols }}>
          <div className="sj-cmp-lab top" />
          {cards.map((c) => (
            <div className="sj-cmp-col" key={c.symbol}>
              <div className="row">
                <span className="sym">{c.symbol}</span>
                <button className="x" onClick={() => onRemove(c.symbol)} aria-label={`Hapus ${c.symbol} dari perbandingan`} title="Hapus dari perbandingan">
                  ×
                </button>
              </div>
              <div className="name">{c.name}</div>
              <div className="sub">{c.sub_sector ?? c.sector ?? "—"}</div>
              {/* Tab baru: perbandingan yang sedang dibuka tetap utuh. */}
              <a className="sj-link" href={`?emiten=${c.symbol}`} target="_blank" rel="noopener">
                kartu lengkap ↗
              </a>
            </div>
          ))}
          {loading.map((s) => (
            <div className="sj-cmp-col" key={s}>
              <div className="row">
                <span className="sym">{s}</span>
                <span className="sj-spin" />
              </div>
              <div className="sub">menyusun kolom…</div>
            </div>
          ))}

          {section("01", "Ukuran dan untung-rugi", "tahun buku terakhir di Sectors; batang = dibanding yang terbesar di baris itu")}
          {rows([{ label: "Tahun buku", cell: (c) => <div className="sj-cmp-t">{c.year}</div> }, ...size])}
          <div className="sj-cmp-lab">Pendapatan &amp; laba 4 tahun</div>
          {cards.map((c) => (
            <div className="sj-cmp-cell chart" key={c.symbol}>
              <TrendChart trend={c.trend} height={190} compact />
            </div>
          ))}
          {loading.map((s) => (
            <div className="sj-cmp-cell" key={s} />
          ))}

          {section("02", "Dari mana pendapatannya", "segmen terbesar dan porsinya; nama segmen apa adanya dari laporan (bahasa Inggris)")}
          <div className="sj-cmp-lab">Sumber penjualan</div>
          {cards.map((c) => {
            const segs = segments(c);
            return (
              <div className="sj-cmp-cell" key={c.symbol}>
                {segs.length === 0 ? (
                  <span className="sj-cmp-na">Sectors belum punya rincian segmen.</span>
                ) : (
                  <div className="sj-cmp-segs">
                    {segs.map((s) => (
                      <div key={s.name}>
                        <div className="seg">
                          <span>{s.name}</span>
                          <b>{pct(s.share, 0)}</b>
                        </div>
                        <div className="sj-cmp-bar">
                          <span style={{ width: `${Math.max(2, s.share * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {loading.map((s) => (
            <div className="sj-cmp-cell" key={s} />
          ))}

          {section("03", "Siapa pemiliknya")}
          {rows(owners)}

          {section("05", "Lima sisi: 30 cek fundamental", "■ lolos · □ tidak lolos · ┆ data belum ada")}
          <div className="sj-cmp-lab">Bentuk lima sisi</div>
          {cards.map((c) => (
            <div className="sj-cmp-cell chart" key={c.symbol}>
              {c.snowflake && <FiveSidesRadar sf={c.snowflake} height={220} compact />}
            </div>
          ))}
          {loading.map((s) => (
            <div className="sj-cmp-cell" key={s} />
          ))}
          {rows([
            {
              label: "Total cek lolos",
              cell: (c) =>
                c.snowflake ? (
                  <div className="sj-cmp-v">
                    {c.snowflake.passed} <span className="of">dari {c.snowflake.total}</span>
                  </div>
                ) : (
                  <span className="sj-cmp-na">—</span>
                ),
            },
            ...axes.map(
              (ax): Row => ({
                label: ax.label,
                cell: (c) => {
                  const a = c.snowflake?.axes.find((x) => x.id === ax.id);
                  if (!a) return <span className="sj-cmp-na">—</span>;
                  return (
                    <div className="sj-cmp-axis">
                      <span className="dots" aria-hidden>
                        {a.checks.map((k) => (
                          <i key={k.id} className={k.result === true ? "pass" : k.result === false ? "fail" : "none"} />
                        ))}
                      </span>
                      <span className="n">
                        {a.passed}/{a.total}
                      </span>
                    </div>
                  );
                },
              }),
            ),
          ])}
        </div>
      </div>
    </section>
  );
}
