"use client";

import { useEffect, useState } from "react";
import type { ScanItem, ScanResult, Spend } from "@/lib/struk";
import { pct, rp } from "@/lib/struk";
import { SrcNote, Term } from "./bits";
import { SpendSankey } from "./charts";

const NOT_GOODS = /\b(bayar|tunai|cash|debit|kredit|qris|brimo|gopay|ovo|dana|shopeepay|flazz|e-?money|livin|total|subtotal|kembali|kembalian|ppn|pajak|diskon)\b/i;

function groupName(g: Spend["groups"][number]): string {
  return g.kind === "dispersed" ? "perusahaan tanpa pengendali tunggal" : g.label;
}

function list(xs: string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} dan ${xs[xs.length - 1]}`;
}

// Kalimat utama: ke grup mana porsi terbesar belanjamu pergi. Semua angka di sini dijumlah dari harga di strukmu.
function Headline({ s }: { s: Spend }) {
  const top = s.groups[0];
  if (!top) return <>Belanjamu {rp(s.total)} belum mengalir ke perusahaan terbuka yang kami kenali.</>;
  return (
    <>
      Dari belanjamu <span className="n">{rp(s.total)}</span>, <span className="n">{rp(top.amount)}</span> ({pct(top.share)}) masuk ke{" "}
      <span className="n">{groupName(top)}</span> lewat {list(top.symbols)}.
    </>
  );
}

export function SpendFlow({
  r,
  onRecount,
  onPick,
  busy,
}: {
  r: ScanResult;
  onRecount: (items: ScanItem[]) => void;
  onPick: (s: string) => void;
  busy: boolean;
}) {
  const s = r.spend;
  const names = Object.fromEntries(r.companies.map((c) => [c.symbol, c.name]));
  const symOf = (raw: string) => r.companies.find((c) => c.items.includes(raw))?.symbol ?? null;
  const editable = r.items.filter((it) => !NOT_GOODS.test(it.raw || it.brand));
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [open, setOpen] = useState(s.priced_lines === 0);

  // Hasil baru (scan ulang / hitung ulang) → isi editor dari harga terbaru.
  useEffect(() => {
    setDraft(Object.fromEntries(r.items.map((it, i) => [i, it.price ? String(it.price) : ""])));
    setOpen(r.spend.priced_lines === 0);
  }, [r]);

  const dirty = r.items.some((it, i) => (it.price ? String(it.price) : "") !== (draft[i] ?? ""));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onRecount(
      r.items.map((it, i) => {
        const v = parseInt((draft[i] ?? "").replace(/\D/g, ""), 10);
        return { ...it, price: Number.isFinite(v) && v > 0 ? v : null };
      }),
    );
  };

  return (
    <section className="sj-section" id="aliran">
      <div className="sj-eyebrow">aliran uang belanjamu</div>
      {s.total > 0 ? (
        <h2 className="sj-big">
          <Headline s={s} />
        </h2>
      ) : (
        <h2 className="sj-big">Isi harga per baris, lalu lihat ke grup usaha mana uang belanjamu mengalir.</h2>
      )}

      <div className="sj-spend">
        {s.total > 0 && (
          <div className="sj-spend-main">
            <div className="sj-spend-kpis">
              <div>
                <b>{rp(s.to_issuers)}</b>
                <span>
                  ({pct(s.to_issuers_share)}) ke {s.companies.length} perusahaan terbuka
                </span>
              </div>
              <div>
                <b>{s.groups.length}</b>
                <span>grup / pemilik pengendali</span>
              </div>
              <div>
                <b>{rp(s.other)}</b>
                <span>ke barang tanpa emiten</span>
              </div>
            </div>
            {s.companies.length > 0 && <SpendSankey spend={s} names={names} />}

            {s.companies.length > 0 && (
              <div className="sj-spend-rows">
                <div className="sj-col-h">
                  Per perusahaan — lalu, dari setiap Rp100 <Term k="pendapatan">pendapatan</Term> mereka, berapa yang jadi <Term k="laba">laba bersih</Term>?
                </div>
                {s.companies.map((c) => (
                  <div className="sj-spend-row" key={c.symbol}>
                    <button className="sj-sym" onClick={() => onPick(c.symbol)} title="Buka kartu kenalan">
                      {c.symbol}
                    </button>
                    <span className="nm">{c.name}</span>
                    <span className="amt">
                      {rp(c.amount)} <small>{pct(c.share)}</small>
                    </span>
                    <span className="p100">
                      {c.per_100 === null ? (
                        "margin belum tersedia"
                      ) : c.per_100 < 0 ? (
                        <>
                          tiap Rp100 pendapatan → <b className="neg">rugi Rp{Math.abs(c.per_100).toLocaleString("id-ID")}</b>
                        </>
                      ) : (
                        <>
                          tiap Rp100 pendapatan → <b>laba Rp{c.per_100.toLocaleString("id-ID")}</b>
                        </>
                      )}
                    </span>
                  </div>
                ))}
                <SrcNote src={s.margin_src} label={`laba per Rp100 = margin laba bersih ${s.year} dari Sectors`} />
              </div>
            )}
            <p className="sj-spend-note">
              Nominal di atas dijumlah dari <b>harga di strukmu sendiri</b>, bukan data perusahaan. Harga di rak sudah termasuk bagian toko,
              distributor, dan pajak — jadi ini menunjukkan <b>ke merek siapa</b> belanjamu pergi, bukan berapa rupiah yang diterima perusahaannya.
            </p>
          </div>
        )}

        <form className={`sj-prices${open ? " open" : ""}`} onSubmit={submit}>
          <button type="button" className="sj-prices-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
            {s.priced_lines === 0 ? "Isi harga per baris" : `Koreksi harga (${s.priced_lines}/${s.lines} baris berharga)`}
            <span className="arr">{open ? "−" : "+"}</span>
          </button>
          {open && (
            <>
              <div className="sj-prices-list">
                {r.items.map((it, i) => {
                  if (!editable.includes(it)) return null;
                  const sym = symOf(it.raw || it.brand);
                  return (
                    <label className="sj-price" key={i}>
                      <span className="raw">
                        {it.raw || it.brand}
                        {sym ? <em>{sym}</em> : null}
                      </span>
                      <span className="in">
                        <span>Rp</span>
                        <input
                          inputMode="numeric"
                          value={draft[i] ?? ""}
                          placeholder="0"
                          onChange={(e) => setDraft({ ...draft, [i]: e.target.value.replace(/[^\d]/g, "") })}
                          aria-label={`Harga ${it.raw || it.brand}`}
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
              <button type="submit" className="sj-go small" disabled={busy || !dirty}>
                {busy ? (
                  <>
                    <span>Menghitung…</span>
                    <span className="sj-spin" />
                  </>
                ) : (
                  <span>Hitung ulang aliran uang</span>
                )}
              </button>
              <div className="sj-prices-hint">Dihitung ulang tanpa AI dan tanpa kredit API. Baris bayar/total tidak dihitung sebagai belanja.</div>
            </>
          )}
        </form>
      </div>
    </section>
  );
}
