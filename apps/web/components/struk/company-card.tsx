"use client";

import { useState } from "react";
import type { Card, Kritis } from "@/lib/struk";
import { fieldLabel, fieldValue, num, pct, reflect, rupiah, share } from "@/lib/struk";
import { SrcNote, Term } from "./bits";
import { MoneySankey, TrendChart } from "./charts";

const id1 = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 1 });

function BlockHead({ no, title, children }: { no: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="sj-block-h">
      <span className="no">{no}</span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function CompanyCard({ card, onPick }: { card: Card; onPick: (symbol: string) => void }) {
  const f = card.facts;
  const meta = [
    card.listing_date ? `Tercatat di bursa sejak ${card.listing_date.slice(0, 4)}` : null,
    card.employees ? `${num(card.employees)} karyawan` : null,
    card.industry,
  ].filter(Boolean);
  return (
    <article className="sj-card" id="kartu">
      <header className="sj-card-head">
        <div className="code">
          {card.symbol} <span>· {card.sub_sector ?? card.sector ?? "—"}</span>
        </div>
        <h2>{card.name}</h2>
        <div className="meta">{meta.join(" · ")}</div>
        {card.brands.length > 0 && (
          <div className="sj-brands">
            {card.brands.map((b) => (
              <span key={b} className="sj-brand">
                {b}
              </span>
            ))}
          </div>
        )}
      </header>

      <section className="sj-block">
        <BlockHead no="01" title="Seberapa besar perusahaan ini?">
          Tahun buku {card.year}, dari laporan keuangan yang dirangkum Sectors.
        </BlockHead>
        {f.per_100 !== null && <Rp100 name={shortName(card.name)} per100={f.per_100} />}
        <div className="sj-stats">
          <div className="sj-stat">
            <div className="k">
              <Term k="pendapatan">Pendapatan setahun</Term>
            </div>
            <div className="v">{rupiah(f.revenue)}</div>
          </div>
          <div className="sj-stat">
            <div className="k">
              <Term k="laba">Laba bersih</Term>
            </div>
            <div className={`v${f.earnings !== null && f.earnings < 0 ? " neg" : ""}`}>{rupiah(f.earnings)}</div>
          </div>
          <div className="sj-stat">
            <div className="k">
              <Term k="kapitalisasi">Nilai pasar</Term>
            </div>
            <div className="v">{rupiah(f.market_cap)}</div>
            {f.market_cap_rank !== null && (
              <div className="h">
                peringkat {num(f.market_cap_rank)} dari {num(f.universe_total)} emiten
              </div>
            )}
          </div>
          <div className="sj-stat">
            <div className="k">
              <Term k="utang">Utang</Term>
            </div>
            <div className="v">{rupiah(f.total_debt)}</div>
            <div className="h">
              <Term k="modal">modal sendiri</Term> {rupiah(f.total_equity)}
            </div>
          </div>
          {f.payout_ratio !== null && (
            <div className="sj-stat">
              <div className="k">
                Laba yang dibagi sebagai <Term k="dividen">dividen</Term>
              </div>
              <div className="v">{pct(f.payout_ratio, 0)}</div>
            </div>
          )}
        </div>
        <SrcNote src={card.facts_src} />
        <div style={{ marginTop: 24 }}>
          <TrendChart trend={card.trend} />
          <SrcNote src={card.trend.src} label="sumber tren 4 tahun" />
        </div>
      </section>

      <section className="sj-block">
        <BlockHead no="02" title="Peta uang: dari mana datang, ke mana pergi">
          {card.money
            ? `Aliran pendapatan tahun ${card.money.year}. Kiri: sumber penjualan. Kanan: biaya dan laba yang tersisa. Arahkan kursor ke aliran untuk melihat nilainya.`
            : null}
        </BlockHead>
        {card.money ? (
          <>
            {card.money.explain?.summary && <div className="sj-summary">{card.money.explain.summary}</div>}
            <MoneySankey money={card.money} />
            <SrcNote src={card.money.src} />
            {card.money.explain?.llm && <div className="sj-ai-note">Label diterjemahkan dan diringkas AI dari label Sectors — AI tidak menambah angka.</div>}
          </>
        ) : (
          <div className="sj-empty">Sectors belum punya rincian segmen pendapatan untuk {card.symbol}, jadi peta uang tidak kami tampilkan — bukan kami karang.</div>
        )}
      </section>

      <Owners card={card} onPick={onPick} />

      {card.peers.length > 1 && (
        <section className="sj-block">
          <BlockHead no="04" title="Dibanding teman sejenisnya">
            Perusahaan lain di industri yang sama, urut dari nilai pasar terbesar.
          </BlockHead>
          <div className="sj-scroll">
            <table className="sj-table">
              <thead>
                <tr>
                  <th>Perusahaan</th>
                  <th className="r">Pendapatan</th>
                  <th className="r">Laba bersih</th>
                  <th className="r">Sisa per Rp100</th>
                </tr>
              </thead>
              <tbody>
                {card.peers.map((p) => {
                  const neg = (p.earnings ?? 0) < 0;
                  return (
                    <tr key={p.symbol} className={p.is_self ? "self" : ""}>
                      <td>
                        <button className="sj-sym ghost" onClick={() => onPick(p.symbol)} disabled={p.is_self}>
                          {p.symbol}
                        </button>{" "}
                        <span style={{ fontSize: 13 }}>{p.name}</span>
                      </td>
                      <td className="r">{rupiah(p.revenue)}</td>
                      <td className={`r${neg ? " neg" : ""}`}>{rupiah(p.earnings)}</td>
                      <td className={`r${neg ? " neg" : ""}`}>{p.net_margin === null ? "—" : `Rp${id1(p.net_margin * 100)}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <SrcNote src={card.peers_src} />
        </section>
      )}

      <section className="sj-block">
        <BlockHead no="05" title="Pertanyaan kritis">
          Pola di angka {card.symbol} yang layak dipertanyakan. Tiap pola adalah rumus yang dijalankan Sectors ke seluruh bursa, jadi kamu tahu ada berapa
          perusahaan lain dengan pola yang sama. Kami tidak memberi jawaban — kami mengajakmu berpikir.
        </BlockHead>
        {card.kritis.length ? (
          <div className="sj-kritis">
            {card.kritis.map((k) => (
              <KritisCard key={k.id} k={k} symbol={card.symbol} onPick={onPick} />
            ))}
          </div>
        ) : (
          <div className="sj-empty">Tidak ada pola mencolok dari 9 pola yang kami periksa. Bukan berarti sempurna — hanya tidak tertangkap rumus kami.</div>
        )}
      </section>
    </article>
  );
}

// Batang Rp100 dengan proporsi nyata: bagian biru = laba, arsir = biaya/beban/pajak, tangerine = rugi.
function Rp100({ name, per100 }: { name: string; per100: number }) {
  if (per100 >= 0) {
    const p = Math.min(100, per100);
    return (
      <div className="sj-r100">
        <p>
          Dari setiap <b>Rp100</b> pendapatan {name}, yang tersisa jadi <Term k="laba">laba bersih</Term> sekitar <b className="p">Rp{id1(p)}</b>.
        </p>
        <div className="sj-r100-bar" role="img" aria-label={`Rp${id1(100 - p)} habis untuk biaya, Rp${id1(p)} jadi laba`}>
          <div className="cost" />
          <div className="profit" style={{ width: `${p}%` }} />
        </div>
        <div className="sj-r100-scale">
          <span>biaya, beban &amp; pajak Rp{id1(100 - p)}</span>
          <span className="p">laba Rp{id1(p)}</span>
        </div>
      </div>
    );
  }
  const loss = Math.abs(per100);
  const total = 100 + loss;
  return (
    <div className="sj-r100">
      <p>
        Dari setiap <b>Rp100</b> pendapatan {name}, perusahaan justru <b className="l">rugi Rp{id1(loss)}</b> — biayanya sekitar Rp{id1(total)}, lebih besar
        dari pendapatannya.
      </p>
      <div className="sj-r100-bar" role="img" aria-label={`Biaya Rp${id1(total)}: Rp100 ditutup pendapatan, Rp${id1(loss)} rugi`}>
        <div className="cost" style={{ flex: "none", width: `${(100 / total) * 100}%` }} />
        <div className="loss" style={{ width: `${(loss / total) * 100}%` }} />
      </div>
      <div className="sj-r100-scale">
        <span>ditutup pendapatan Rp100</span>
        <span className="l">rugi Rp{id1(loss)}</span>
      </div>
    </div>
  );
}

function Owners({ card, onPick }: { card: Card; onPick: (symbol: string) => void }) {
  const o = card.owners;
  const chain = o.group.chain;
  return (
    <section className="sj-block">
      <BlockHead no="03" title="Siapa pemiliknya?">
        Pemegang saham menurut data Sectors. Bagian <Term k="publik">publik</Term> adalah saham yang bisa dibeli siapa pun, termasuk kamu.
      </BlockHead>
      <div className="sj-holders">
        {o.holders.map((h) => {
          const pub = /public|publik|masyarakat/i.test(h.name);
          return (
            <div className="sj-holder" key={h.name}>
              <div>
                {h.symbol ? (
                  <button className="sj-sym ghost" onClick={() => onPick(h.symbol!)}>
                    {h.symbol}
                  </button>
                ) : null}{" "}
                {pub ? "Publik (masyarakat)" : h.name}
                <div className={`sj-bar${pub ? " pub" : ""}`}>
                  <span style={{ width: `${Math.min(100, h.pct * 100)}%` }} />
                </div>
              </div>
              <div className="pct">{share(h.pct)}</div>
            </div>
          );
        })}
      </div>
      {chain.length > 0 && (
        <div className="sj-chain">
          <span className="node self">{card.symbol}</span>
          {chain.map((c) => (
            <span key={c.name + c.of} style={{ display: "contents" }}>
              <span className="arrow">← {share(c.pct)} dimiliki</span>
              <span className="node">
                {c.symbol ? (
                  <button className="sj-sym ghost" onClick={() => onPick(c.symbol!)}>
                    {c.symbol}
                  </button>
                ) : null}{" "}
                {c.name}
              </span>
            </span>
          ))}
        </div>
      )}
      {o.group.kind === "affiliates" && (
        <p className="sj-group-note">
          Sectors mencatat perusahaan ini terafiliasi dengan <b>{o.group.label}</b>.
        </p>
      )}
      <SrcNote src={o.src} />
    </section>
  );
}

function KritisCard({ k, symbol, onPick }: { k: Kritis; symbol: string; onPick: (s: string) => void }) {
  const [answer, setAnswer] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hints, setHints] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const r = await reflect(symbol, k.id, answer);
      setReply(r.text);
    } catch (e) {
      setReply(`Gagal menghubungi pendamping: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const examples = k.cohort_examples.filter((e) => e.symbol !== symbol).slice(0, 4);
  return (
    <div className={`sj-q ${k.tone}`}>
      <div className="tone">{k.tone === "positif" ? "pola positif" : "pola yang perlu ditanyakan"}</div>
      <h4>{k.title}</h4>
      <div className="vals">
        {k.values.map((v) => (
          <span key={v.field} className="val">
            {fieldLabel(v.field)} <b>{fieldValue(v.field, v.value)}</b>
          </span>
        ))}
      </div>
      {k.cohort_total !== null && (
        <div className="cohort">
          Pola ini dimiliki <span className="count">{num(k.cohort_total)}</span> dari {num(k.universe_total)} perusahaan di bursa
          {examples.length > 0 && (
            <>
              , misalnya
              {examples.map((e) => (
                <button key={e.symbol} className="sj-sym ghost" onClick={() => onPick(e.symbol)} title={e.name}>
                  {e.symbol}
                </button>
              ))}
            </>
          )}
        </div>
      )}
      <details>
        <summary>lihat rumus yang dijalankan Sectors</summary>
        <code>{k.where}</code>
        <SrcNote src={k.src} label="sumber hitungan seluruh bursa" />
      </details>
      <div className="ask">{k.question}</div>
      <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Tulis tebakanmu dulu — tidak ada jawaban salah" />
      <div className="row">
        <button className="sj-btn" onClick={send} disabled={busy || !answer.trim()}>
          {busy ? "Memikirkan…" : "Kirim jawabanku"}
        </button>
        <button className="sj-btn ghost" onClick={() => setHints((h) => !h)}>
          {hints ? "Sembunyikan petunjuk" : "Beri petunjuk"}
        </button>
      </div>
      {hints && (
        <ul className="sj-hints">
          {k.hints.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      {reply && <div className="sj-reply">{reply}</div>}
    </div>
  );
}

// "PT GoTo Gojek Tokopedia Tbk" → "GoTo"; "Indofood CBP Sukses Makmur Tbk" → "Indofood".
function shortName(name: string): string {
  const words = name.replace(/^(PT\.?|Perusahaan Perseroan)\s+/i, "").replace(/\s*\(?Persero\)?/i, "").split(/\s+/);
  return words[0] || name;
}
