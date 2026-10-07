"use client";

import { Fragment, useEffect, useRef } from "react";
import type { Card } from "@/lib/struk";
import { num, pct, rupiah, share } from "@/lib/struk";
import { SrcNote, Term } from "./bits";
import { FiveSidesRadar, MoneySankey, TrendChart } from "./charts";
import { FiveSides } from "./five-sides";

// Satu tampilan untuk 1–5 emiten. Satu emiten = perbandingan dengan satu kolom yang lebar: kepala, bagian 01–05,
// dan label barisnya sama persis dengan tampilan 2–5 kolom, jadi pindah dari satu ke banyak emiten tidak mengubah
// cara membaca. Kolom lebar hanya mendapat isi tambahan (peta aliran uang, daftar pemegang, tabel pembanding,
// rincian 30 cek). Semua isi berasal dari kartu yang sama: tidak ada panggilan Sectors tambahan.

const id1 = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 1 });
const isPublic = (name: string) => /public|publik|masyarakat/i.test(name);

type PeerKey = "revenue" | "earnings" | "market_cap";
type Row = { key: string; label: React.ReactNode; cell: (c: Card) => React.ReactNode; cls?: string };

// Urutan emiten ini di antara pembandingnya (5 emiten bernilai pasar terbesar se-industri + emiten ini).
function peerRank(c: Card, k: PeerKey): { rank: number; n: number; max: number } | null {
  const vals = c.peers.filter((p) => p[k] !== null);
  const self = vals.find((p) => p.is_self);
  if (!self || vals.length < 2) return null;
  const sorted = [...vals].sort((a, b) => (b[k] as number) - (a[k] as number));
  return { rank: sorted.indexOf(self) + 1, n: vals.length, max: Math.max(...vals.map((p) => Math.abs(p[k] as number))) };
}

// Segmen sumber pendapatan = simpul peta uang yang tidak pernah jadi tujuan aliran, kecuali yang mengalir ke biaya
// (mis. "Operating Income → Operating Expense" pada emiten rugi: itu rugi, bukan sumber penjualan).
const COST = /cost|expense|tax/i;
function segments(c: Card, top: number): { name: string; share: number }[] {
  if (!c.money) return [];
  const targets = new Set(c.money.links.map((l) => l.target));
  const src = new Map<string, number>();
  for (const l of c.money.links)
    if (!targets.has(l.source) && !COST.test(l.target) && l.value > 0) src.set(l.source, (src.get(l.source) ?? 0) + l.value);
  const total = [...src.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  const all = [...src.entries()].map(([name, v]) => ({ name, share: v / total })).sort((a, b) => b.share - a.share);
  if (all.length <= top + 1) return all;
  const rest = all.slice(top).reduce((a, s) => a + s.share, 0);
  return [...all.slice(0, top), { name: `${all.length - top} segmen lain`, share: rest }];
}

// "PT GoTo Gojek Tokopedia Tbk" → "GoTo"; "Indofood CBP Sukses Makmur Tbk" → "Indofood".
function shortName(name: string): string {
  const words = name.replace(/^(PT\.?|Perusahaan Perseroan)\s+/i, "").replace(/\s*\(?Persero\)?/i, "").split(/\s+/);
  return words[0] || name;
}

const NA = ({ children = "—" }: { children?: React.ReactNode }) => <span className="sj-res-na">{children}</span>;

// Angka + batang (fraksi 0–1 terhadap pembandingnya) + keterangan kecil.
function Val({ v, bar, neg, hint, tone }: { v: React.ReactNode; bar?: number | null; neg?: boolean; hint?: React.ReactNode; tone?: "pub" }) {
  return (
    <div className="sj-val">
      <div className={`sj-res-v${neg ? " neg" : ""}`}>{v}</div>
      {bar !== undefined && bar !== null && (
        <div className={`sj-res-bar${neg ? " neg" : ""}${tone ? ` ${tone}` : ""}`}>
          <span style={{ width: `${Math.max(2, Math.min(100, bar * 100))}%` }} />
        </div>
      )}
      {hint && <div className="sj-res-h">{hint}</div>}
    </div>
  );
}

// Batang Rp100 dengan proporsi nyata: biru = laba, arsir = biaya/beban/pajak, tangerine = rugi.
// Kolom lebar memakai kalimat lengkap; kolom sempit hanya angka + batang yang sama.
function Rp100({ name, per100, wide }: { name: string; per100: number; wide: boolean }) {
  const loss = per100 < 0;
  const p = Math.min(100, Math.abs(per100));
  const total = 100 + (loss ? p : 0);
  const bar = loss ? (
    <div className="sj-r100-bar" role="img" aria-label={`Biaya Rp${id1(total)}: Rp100 ditutup pendapatan, Rp${id1(p)} rugi`}>
      <div className="cost" style={{ flex: "none", width: `${(100 / total) * 100}%` }} />
      <div className="loss" style={{ width: `${(p / total) * 100}%` }} />
    </div>
  ) : (
    <div className="sj-r100-bar" role="img" aria-label={`Rp${id1(100 - p)} habis untuk biaya, Rp${id1(p)} jadi laba`}>
      <div className="cost" />
      <div className="profit" style={{ width: `${p}%` }} />
    </div>
  );
  const scale = (
    <div className="sj-r100-scale">
      {loss ? <span>ditutup pendapatan Rp100</span> : <span>biaya, beban &amp; pajak Rp{id1(100 - p)}</span>}
      {loss ? <span className="l">rugi Rp{id1(p)}</span> : <span className="p">laba Rp{id1(p)}</span>}
    </div>
  );
  if (!wide)
    return (
      <div className="sj-r100 mini">
        <div className={`sj-res-v${loss ? " neg" : ""}`}>{loss ? `rugi Rp${id1(p)}` : `Rp${id1(p)}`}</div>
        {bar}
      </div>
    );
  return (
    <div className="sj-r100">
      {loss ? (
        <p>
          Dari setiap <b>Rp100</b> pendapatan {name}, perusahaan justru <b className="l">rugi Rp{id1(p)}</b> — biayanya sekitar Rp{id1(total)}, lebih besar dari
          pendapatannya.
        </p>
      ) : (
        <p>
          Dari setiap <b>Rp100</b> pendapatan {name}, yang tersisa jadi <Term k="laba">laba bersih</Term> sekitar <b className="p">Rp{id1(p)}</b>.
        </p>
      )}
      {bar}
      {scale}
    </div>
  );
}

function Dots({ checks }: { checks: { id: string; result: boolean | null }[] }) {
  return (
    <span className="sj-dots" aria-hidden>
      {checks.map((k) => (
        <i key={k.id} className={k.result === true ? "pass" : k.result === false ? "fail" : "none"} />
      ))}
    </span>
  );
}

export function ResultView({
  symbols,
  cards,
  max,
  onRemove,
  onAdd,
  onSet,
  onPick,
}: {
  symbols: string[];
  cards: Record<string, Card>;
  max: number;
  onRemove: (symbol: string) => void;
  onAdd: (symbol: string) => void;
  onSet: (symbols: string[]) => void;
  onPick: (symbol: string) => void;
}) {
  const n = symbols.length;
  const wide = n === 1;
  const full = n >= max;
  const loaded = symbols.map((s) => cards[s]).filter(Boolean);

  const rootRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const stripInRef = useRef<HTMLDivElement>(null);

  // Ukuran diukur lewat ref (bukan state) supaya menggulir tidak me-render ulang grafik.
  useEffect(() => {
    const root = rootRef.current;
    const sc = scrollRef.current;
    const grid = gridRef.current;
    if (!root || !sc || !grid) return;
    const measure = () => {
      const bar = document.querySelector<HTMLElement>(".sj-appbar");
      root.style.setProperty("--bar-h", `${bar?.offsetHeight ?? 0}px`);
      root.style.setProperty("--res-vw", `${sc.clientWidth}px`);
      const corner = grid.firstElementChild as HTMLElement | null;
      if (stripInRef.current && corner) stripInRef.current.style.width = `${grid.scrollWidth - corner.offsetWidth}px`;
      root.classList.toggle("scrolls", sc.scrollWidth > sc.clientWidth + 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    ro.observe(sc);
    return () => ro.disconnect();
  }, [n]);

  // Bilah nama kolom muncul menempel di atas begitu kepala kolom tergulir keluar layar.
  useEffect(() => {
    const head = headRef.current;
    const strip = stripRef.current;
    if (wide || !head || !strip) return;
    const top = document.querySelector<HTMLElement>(".sj-appbar")?.offsetHeight ?? 0;
    const io = new IntersectionObserver(([e]) => strip.classList.toggle("show", !e.isIntersecting && e.boundingClientRect.top < top + 1), {
      rootMargin: `-${top}px 0px 0px 0px`,
    });
    io.observe(head);
    return () => io.disconnect();
  }, [wide, n]);

  const syncStrip = () => {
    if (stripInRef.current && scrollRef.current) stripInRef.current.style.transform = `translateX(${-scrollRef.current.scrollLeft}px)`;
  };

  const rowMax = (get: (c: Card) => number | null) => Math.max(0, ...loaded.map((c) => Math.abs(get(c) ?? 0)));
  const revMax = rowMax((c) => c.facts.revenue);
  const earnMax = rowMax((c) => c.facts.earnings);
  const capMax = rowMax((c) => c.facts.market_cap);
  const balMax = rowMax((c) => Math.max(c.facts.total_debt ?? 0, c.facts.total_equity ?? 0));

  // Kolom lebar: batang dibanding pembanding terbesar se-industri. Banyak kolom: dibanding yang terbesar di baris itu.
  const frac = (c: Card, v: number | null, rowM: number, k: PeerKey) => {
    if (v === null) return null;
    if (!wide) return rowM > 0 ? Math.abs(v) / rowM : null;
    const r = peerRank(c, k);
    return r && r.max > 0 ? Math.abs(v) / r.max : null;
  };
  const rankHint = (c: Card, k: PeerKey) => {
    const r = peerRank(c, k);
    return r ? `ke-${r.rank} dari ${r.n} di industrinya` : undefined;
  };
  const balFrac = (c: Card, v: number | null) => {
    if (v === null) return null;
    const m = wide ? Math.max(c.facts.total_debt ?? 0, c.facts.total_equity ?? 0) : balMax;
    return m > 0 ? Math.abs(v) / m : null;
  };
  // Simbol di dalam kolom: satu emiten → buka kartunya; banyak emiten → tambahkan ke perbandingan.
  const symBtn = (sym: string) => {
    const on = symbols.includes(sym);
    return (
      <button
        className={`sj-sym ghost${on ? " on" : ""}`}
        disabled={on || (!wide && full)}
        onClick={() => (wide ? onPick(sym) : onAdd(sym))}
        title={on ? "sudah dipilih" : wide ? `Buka kartu ${sym}` : `Tambahkan ${sym} ke perbandingan`}
      >
        {sym}
      </button>
    );
  };

  const years = Array.from(new Set(loaded.map((c) => c.year)));

  const size: Row[] = [
    {
      key: "r100",
      label: (
        <>
          Sisa <Term k="laba">laba</Term> dari setiap Rp100 penjualan
        </>
      ),
      cell: (c) => (c.facts.per_100 === null ? <NA /> : <Rp100 name={shortName(c.name)} per100={c.facts.per_100} wide={wide} />),
    },
    {
      key: "rev",
      label: <Term k="pendapatan">Pendapatan setahun</Term>,
      cell: (c) => (c.facts.revenue === null ? <NA /> : <Val v={rupiah(c.facts.revenue)} bar={frac(c, c.facts.revenue, revMax, "revenue")} hint={rankHint(c, "revenue")} />),
    },
    {
      key: "earn",
      label: <Term k="laba">Laba bersih</Term>,
      cell: (c) => {
        const e = c.facts.earnings;
        if (e === null) return <NA />;
        return <Val v={rupiah(e)} neg={e < 0} bar={frac(c, e, earnMax, "earnings")} hint={e < 0 ? "rugi tahun ini" : rankHint(c, "earnings")} />;
      },
    },
    {
      key: "cap",
      label: <Term k="kapitalisasi">Nilai pasar</Term>,
      cell: (c) =>
        c.facts.market_cap === null ? (
          <NA />
        ) : (
          <Val
            v={rupiah(c.facts.market_cap)}
            bar={frac(c, c.facts.market_cap, capMax, "market_cap")}
            hint={c.facts.market_cap_rank !== null ? `peringkat ${num(c.facts.market_cap_rank)} dari ${num(c.facts.universe_total)} di bursa` : undefined}
          />
        ),
    },
    {
      key: "debt",
      label: <Term k="utang">Utang</Term>,
      cell: (c) => {
        const d = c.facts.total_debt;
        const q = c.facts.total_equity;
        if (d === null) return <NA />;
        return <Val v={rupiah(d)} bar={balFrac(c, d)} hint={q && q > 0 ? (d / q < 0.05 ? "kurang dari 0,05× modal sendiri" : `${(d / q).toLocaleString("id-ID", { maximumFractionDigits: d / q < 1 ? 2 : 1 })}× modal sendiri`) : undefined} />;
      },
    },
    {
      key: "eq",
      label: <Term k="modal">Modal sendiri</Term>,
      cell: (c) => (c.facts.total_equity === null ? <NA /> : <Val v={rupiah(c.facts.total_equity)} neg={c.facts.total_equity < 0} bar={balFrac(c, c.facts.total_equity)} />),
    },
    {
      key: "roe",
      label: <Term k="roe">ROE</Term>,
      cell: (c) =>
        c.facts.roe === null ? (
          <NA />
        ) : (
          <Val v={pct(c.facts.roe)} neg={c.facts.roe < 0} hint={c.facts.roe >= 0 ? `laba Rp${id1(c.facts.roe * 100)} dari tiap Rp100 modal pemilik` : undefined} />
        ),
    },
    {
      key: "div",
      label: (
        <>
          Laba yang dibagi sebagai <Term k="dividen">dividen</Term>
        </>
      ),
      cell: (c) =>
        c.facts.payout_ratio === null ? (
          <NA>tidak membagi / belum ada data</NA>
        ) : (
          <Val v={pct(c.facts.payout_ratio, 0)} hint={c.facts.payout_ratio > 1 ? "lebih besar dari labanya tahun itu" : undefined} />
        ),
    },
    {
      key: "trend",
      cls: "chart",
      label: "Pendapatan & laba 4 tahun",
      cell: (c) => <TrendChart trend={c.trend} height={wide ? 260 : 190} compact={!wide} />,
    },
  ];

  const money: Row[] = [
    {
      key: "segs",
      label: "Sumber penjualan",
      cell: (c) => {
        const segs = segments(c, wide ? 5 : 3);
        if (segs.length === 0) return <NA>Sectors belum punya rincian segmen pendapatan {c.symbol} — tidak kami karang.</NA>;
        return (
          <div className="sj-res-segs">
            {segs.map((s) => (
              <div key={s.name}>
                <div className="seg">
                  <span>{s.name}</span>
                  <b>{pct(s.share, 0)}</b>
                </div>
                <div className="sj-res-bar pub">
                  <span style={{ width: `${Math.max(2, s.share * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        );
      },
    },
    ...(wide && loaded[0]?.money
      ? [
          {
            key: "sankey",
            cls: "chart",
            label: (
              <>
                Aliran uang {loaded[0].money.year}
                <small>kiri: sumber · kanan: biaya &amp; laba · arahkan kursor untuk nilainya</small>
              </>
            ),
            cell: (c: Card) => (c.money ? <MoneySankey money={c.money} /> : null),
          },
        ]
      : []),
  ];

  const owners: Row[] = [
    {
      key: "pub",
      label: <Term k="publik">Dimiliki publik</Term>,
      cell: (c) => {
        const ff = c.owners.free_float ?? c.owners.holders.find((h) => isPublic(h.name))?.pct ?? null;
        return ff === null ? <NA /> : <Val v={share(ff)} bar={ff} tone="pub" />;
      },
    },
    {
      key: "top",
      label: <Term k="pengendali">Pemegang terbesar</Term>,
      cell: (c) => {
        const top = c.owners.holders.filter((h) => !isPublic(h.name)).sort((a, b) => b.pct - a.pct)[0];
        if (!top) return <NA />;
        return (
          <div className="sj-res-holder">
            <div className="nm">
              {top.symbol && symBtn(top.symbol)} {top.name}
            </div>
            <b>{share(top.pct)}</b>
            <div className="sj-res-bar">
              <span style={{ width: `${Math.max(2, top.pct * 100)}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: "grp",
      label: "Grup usaha",
      cell: (c) =>
        c.owners.group.label ? (
          <>
            <div className="sj-res-t">{c.owners.group.label}</div>
          </>
        ) : (
          <NA />
        ),
    },
    ...(wide && loaded[0]
      ? [
          {
            key: "all",
            label: "Semua pemegang",
            cell: (c: Card) => (
              <div className="sj-res-holders">
                {c.owners.holders.map((h) => {
                  const pub = isPublic(h.name);
                  return (
                    <div className="sj-res-holder" key={h.name}>
                      <div className="nm">
                        {h.symbol && symBtn(h.symbol)} {pub ? "Publik (masyarakat)" : h.name}
                      </div>
                      <b>{share(h.pct)}</b>
                      <div className={`sj-res-bar${pub ? " pub" : ""}`}>
                        <span style={{ width: `${Math.max(2, Math.min(100, h.pct * 100))}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ),
          },
          ...(loaded[0].owners.group.chain.length > 0
            ? [
                {
                  key: "chain",
                  label: "Rantai kepemilikan",
                  cell: (c: Card) => (
                    <div className="sj-chain">
                      <span className="node self">{c.symbol}</span>
                      {c.owners.group.chain.map((x) => (
                        <Fragment key={x.name + x.of}>
                          <span className="arrow">← {share(x.pct)} dimiliki</span>
                          <span className="node">
                            {x.symbol && symBtn(x.symbol)} {x.name}
                          </span>
                        </Fragment>
                      ))}
                    </div>
                  ),
                },
              ]
            : []),
        ]
      : []),
  ];

  const industry: Row[] = [
    {
      key: "ind",
      label: "Industri",
      cell: (c) => (
        <>
          <div className="sj-res-t">{c.industry ?? c.sub_sector ?? "—"}</div>
          {c.sub_sector && c.sub_sector !== c.industry && <div className="sj-res-h">subsektor {c.sub_sector}</div>}
        </>
      ),
    },
    {
      key: "rank",
      label: (
        <>
          <Term k="kapitalisasi">Nilai pasar</Term> dibanding pembandingnya
        </>
      ),
      cell: (c) => {
        const ps = c.peers.filter((p) => p.market_cap !== null).sort((a, b) => (b.market_cap as number) - (a.market_cap as number));
        if (ps.length < 2) return <NA>belum ada pembanding se-industri di data Sectors</NA>;
        const m = ps[0].market_cap as number;
        const r = ps.findIndex((p) => p.is_self) + 1;
        return (
          <>
            <ol className="sj-res-rank">
              {ps.map((p) => {
                const on = symbols.includes(p.symbol);
                return (
                  <li key={p.symbol} className={p.is_self ? "self" : on ? "on" : ""}>
                    {p.is_self || on ? (
                      <span className="code">{p.symbol}</span>
                    ) : (
                      <button className="code" disabled={full} onClick={() => onAdd(p.symbol)} title={full ? `Maksimal ${max} emiten` : `Bandingkan dengan ${p.symbol}`}>
                        {p.symbol}
                        <span aria-hidden>+</span>
                      </button>
                    )}
                    <span className="b">
                      <span style={{ width: `${Math.max(2, ((p.market_cap as number) / m) * 100)}%` }} />
                    </span>
                    <span className="v">{rupiah(p.market_cap)}</span>
                  </li>
                );
              })}
            </ol>
            {r > 0 && <div className="sj-res-h">ke-{r} dari {ps.length}</div>}
          </>
        );
      },
    },
    ...(wide && loaded[0] && loaded[0].peers.length > 1
      ? [
          {
            key: "tbl",
            label: "Angka pembanding",
            cell: (c: Card) => (
              <div className="sj-scroll">
                <table className="sj-table">
                  <thead>
                    <tr>
                      <th>Perusahaan</th>
                      <th className="r">Pendapatan</th>
                      <th className="r">Laba bersih</th>
                      <th className="r">Sisa per Rp100</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {c.peers.map((p) => {
                      const neg = (p.earnings ?? 0) < 0;
                      return (
                        <tr key={p.symbol} className={p.is_self ? "self" : ""}>
                          <td>
                            <span className="sj-sym-t">{p.symbol}</span> <span className="nm">{p.name}</span>
                          </td>
                          <td className="r">{rupiah(p.revenue)}</td>
                          <td className={`r${neg ? " neg" : ""}`}>{rupiah(p.earnings)}</td>
                          <td className={`r${neg ? " neg" : ""}`}>{p.net_margin === null ? "—" : `Rp${id1(p.net_margin * 100)}`}</td>
                          <td className="r">
                            {!p.is_self && (
                              <button className="add" onClick={() => onAdd(p.symbol)} aria-label={`Bandingkan ${c.symbol} dengan ${p.symbol}`}>
                                + bandingkan
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ),
          },
        ]
      : []),
  ];

  const axes = loaded[0]?.snowflake?.axes.map((a) => ({ id: a.id, label: a.label })) ?? [];
  const sides: Row[] = wide
    ? [{ key: "sf", label: loaded[0]?.snowflake.is_bank ? "28 cek (versi bank)" : "30 cek, 6 per sisi", cell: (c) => <FiveSides sf={c.snowflake} symbol={c.symbol} /> }]
    : [
        { key: "radar", cls: "chart", label: "Bentuk lima sisi", cell: (c) => <FiveSidesRadar sf={c.snowflake} height={220} compact /> },
        {
          key: "tot",
          label: "Total cek lolos",
          cell: (c) => (
            <>
              <div className="sj-res-v">
                {c.snowflake.passed} <span className="of">dari {c.snowflake.total}</span>
              </div>
              {(c.snowflake.is_bank || c.snowflake.assessed < c.snowflake.total) && (
                <div className="sj-res-h">
                  {[
                    c.snowflake.is_bank ? "bank: Kesehatan pakai 4 cek khusus bank" : null,
                    c.snowflake.assessed < c.snowflake.total ? `${c.snowflake.total - c.snowflake.assessed} cek belum bisa dinilai (data kosong)` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
            </>
          ),
        },
        ...axes.map(
          (ax): Row => ({
            key: `ax-${ax.id}`,
            label: ax.label,
            cell: (c) => {
              const a = c.snowflake.axes.find((x) => x.id === ax.id);
              if (!a) return <NA />;
              return (
                <div className="sj-res-axis">
                  <Dots checks={a.checks} />
                  <span className="n">
                    {a.passed}/{a.total}
                  </span>
                </div>
              );
            },
          }),
        ),
      ];

  const cols = wide ? "var(--res-label) minmax(0, 1fr)" : `var(--res-label) repeat(${n}, minmax(var(--res-col), 1fr))`;

  const cells = (key: string, fn: (c: Card) => React.ReactNode, cls = "") =>
    symbols.map((s) => {
      const c = cards[s];
      return (
        <div key={key + s} className={`sj-res-cell${cls ? ` ${cls}` : ""}`}>
          {c ? <div className="in">{fn(c)}</div> : <span className={`sk ${cls === "chart" ? "sk-chart" : "sk-line"}`} />}
        </div>
      );
    });
  const rows = (list: Row[]) =>
    list.map((r) => (
      <Fragment key={r.key}>
        <div className="sj-res-lab">{r.label}</div>
        {cells(r.key, r.cell, r.cls)}
      </Fragment>
    ));
  const src = (key: string, get: (c: Card) => React.ReactNode) => (
    <Fragment key={`src-${key}`}>
      <div className="sj-res-lab src">Sumber</div>
      {cells(`src-${key}`, get, "src")}
    </Fragment>
  );
  const sec = (no: string, title: string, note?: React.ReactNode) => (
    <div className="sj-res-sec" key={`sec-${no}`}>
      <div className="in">
        <span className="no">{no}</span>
        <h3>{title}</h3>
        {note && <p>{note}</p>}
      </div>
    </div>
  );

  const legend = (
    <span className="sj-legend">
      <Dots checks={[{ id: "a", result: true }]} /> lolos <Dots checks={[{ id: "b", result: false }]} /> tidak lolos <Dots checks={[{ id: "c", result: null }]} /> data belum ada
    </span>
  );

  const head = (s: string) => {
    const c = cards[s];
    if (!c)
      return (
        <div className="sj-res-head" key={`h-${s}`}>
          <div className="top">
            <div className="code">
              {s} <span className="sj-spin" />
            </div>
          </div>
          <div className="sk sk-h dark" />
          <div className="sk sk-m dark" />
          <div className="meta">menyusun kartu dari data Sectors…</div>
        </div>
      );
    const others = c.peers.filter((p) => !p.is_self).map((p) => p.symbol);
    const meta = [c.listing_date ? `Tercatat di bursa sejak ${c.listing_date.slice(0, 4)}` : null, c.employees ? `${num(c.employees)} karyawan` : null, `tahun buku ${c.year}`].filter(
      Boolean,
    );
    const brands = wide ? c.brands : c.brands.slice(0, 4);
    return (
      <div className="sj-res-head" key={`h-${s}`}>
        <div className="top">
          <div className="code">
            {c.symbol} <span>· {c.sub_sector ?? c.sector ?? "—"}</span>
          </div>
          {!wide && (
            <button className="x" onClick={() => onRemove(c.symbol)} aria-label={`Hapus ${c.symbol} dari perbandingan`} title="Hapus dari perbandingan">
              ×
            </button>
          )}
        </div>
        <h2>{c.name}</h2>
        <div className="meta">{meta.join(" · ")}</div>
        {brands.length > 0 && (
          <div className="sj-brands">
            {brands.map((b) => (
              <span key={b} className="sj-brand">
                {b}
              </span>
            ))}
            {c.brands.length > brands.length && <span className="sj-brand more">+{c.brands.length - brands.length}</span>}
          </div>
        )}
        <div className="acts">
          {wide ? (
            others.length > 0 && (
              <button className="btn" onClick={() => onSet([c.symbol, ...others.slice(0, max - 1)])}>
                Bandingkan dengan {Math.min(max - 1, others.length)} teman sejenis <span aria-hidden>→</span>
              </button>
            )
          ) : (
            // Tab baru: perbandingan yang sedang dibuka tetap utuh.
            <a className="lnk" href={`?emiten=${c.symbol}`} target="_blank" rel="noopener">
              kartu lengkap ↗
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <article className={`sj-card sj-res${wide ? " wide" : ""}`} id="kartu" ref={rootRef} aria-busy={loaded.length < n}>
      {!wide && (
        <div className="sj-res-strip" ref={stripRef} aria-hidden>
          <div className="in">
            <div className="corner">{n} emiten</div>
            <div className="vp">
              <div className="row" ref={stripInRef} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
                {symbols.map((s) => (
                  <div key={s}>
                    <b>{s}</b> <span>{cards[s] ? shortName(cards[s].name) : "…"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="sj-res-x" ref={scrollRef} onScroll={syncStrip}>
        <div className="sj-res-grid" ref={gridRef} style={{ gridTemplateColumns: cols }}>
          {wide ? (
            <div className="sj-res-headrow" ref={headRef}>
              {head(symbols[0])}
            </div>
          ) : (
            <>
              <div className="sj-res-corner" ref={headRef}>
                <b>Bandingkan</b>
                <span>
                  {n} emiten, baris demi baris. <span className="hint">Geser ke samping →</span>
                </span>
              </div>
              {symbols.map(head)}
            </>
          )}

          {sec(
            "01",
            "Seberapa besar perusahaan ini?",
            <>
              {years.length === 1 ? `Tahun buku ${years[0]}` : "Tahun buku terakhir tiap emiten"}, dari laporan keuangan yang dirangkum Sectors.{" "}
              {wide ? "Batang = dibanding pembanding terbesar di industrinya." : "Batang = dibanding yang terbesar di baris itu."}
            </>,
          )}
          {rows(size)}
          {src("01", (c) => (
            <>
              <SrcNote src={c.facts_src} />
              <SrcNote src={c.trend.src} label="sumber tren 4 tahun" />
            </>
          ))}

          {sec(
            "02",
            "Peta uang: dari mana datang, ke mana pergi",
            <>Segmen penjualan terbesar dan porsinya. Nama segmen ditulis apa adanya dari laporan (bahasa Inggris).</>,
          )}
          {rows(money)}
          {src("02", (c) => (c.money ? <SrcNote src={c.money.src} /> : <NA />))}

          {sec(
            "03",
            "Siapa pemiliknya?",
            <>
              Pemegang saham menurut data Sectors. Bagian <Term k="publik">publik</Term> adalah saham yang bisa dibeli siapa pun.
            </>,
          )}
          {rows(owners)}
          {src("03", (c) => <SrcNote src={c.owners.src} />)}

          {sec(
            "04",
            "Posisi di industrinya",
            <>Pembanding = 5 emiten bernilai pasar terbesar di industri yang sama. Tekan kodenya untuk menjajarkannya kolom demi kolom.</>,
          )}
          {rows(industry)}
          {src("04", (c) => <SrcNote src={c.peers_src} />)}

          {sec(
            "05",
            "Lima sisi: 30 cek fundamental",
            <>
              Harga, prospek, rekam jejak, kesehatan, dan dividen — masing-masing 6 pertanyaan ya/tidak atas angka Sectors. Untuk bank, sisi Kesehatan memakai 4 cek khusus bank
              (kredit macet, LDR, leverage, CAR), jadi totalnya 28. {legend}
            </>,
          )}
          {rows(sides)}
          {!wide && src("05", (c) => <SrcNote src={c.snowflake.src} />)}
        </div>
      </div>
      {!wide && (
        <p className="sj-res-foot">
          Lima sisi bukan rating dan bukan saran beli/jual: lolos berarti sebuah syarat terpenuhi, bukan berarti sahamnya bagus. Buka <b>kartu lengkap ↗</b> untuk
          angka dan rumus tiap cek.
        </p>
      )}
    </article>
  );
}
