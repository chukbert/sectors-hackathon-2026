"use client";

import { useEffect, useRef, useState } from "react";
import "./struk.css";
import type { BasketCompany, Card, ScanResult, SectorsOff, Status } from "@/lib/struk";
import { company, isOff, num, scan, search, status } from "@/lib/struk";
import { SrcNote } from "@/components/struk/bits";
import { CompanyCard } from "@/components/struk/company-card";

const EXAMPLES: { label: string; text: string }[] = [
  { label: "Belanja Indomaret", text: "INDOMARET\nIDM GRG SPCL 85G x3\nPEPSODENT 190G\nTEH PUCUK HRM 350ML\nULTRA MILK COKLAT 250\nSARI ROTI TAWAR\nTOLAK ANGIN CAIR\nBayar: BRImo" },
  { label: "Anak kos sebulan", text: "Pulsa Telkomsel, Gojek, GoFood, Indomie, Le Minerale, Kopiko, Rinso, Lifebuoy" },
  { label: "Rumah tangga", text: "Bimoli 2L, Segitiga Biru 1kg, Royco, Bango kecap, So Good nugget, Semen Tiga Roda, Avian cat tembok" },
];

const RELATION: Record<string, { text: string; cls: string; title: string }> = {
  direct: { text: "terverifikasi", cls: "ok", title: "Merek ada di katalog kurasi kami dan emitennya ada di data Sectors." },
  indirect: { text: "tidak langsung", cls: "warn", title: "Emiten ini hanya memegang sebagian saham pemilik merek." },
  dugaan: { text: "dugaan AI", cls: "warn", title: "Ditebak AI dari nama merek; kodenya ada di Sectors tapi hubungannya belum kami verifikasi." },
};

async function fileToDataUrl(file: File): Promise<string> {
  // Perkecil foto di browser agar hemat bandwidth & token (sisi terpanjang 1600px, JPEG).
  const raw = await new Promise<string>((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => bad(r.error);
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((ok, bad) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = bad;
    i.src = raw;
  });
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

export default function StrukPage() {
  const [st, setSt] = useState<Status | null>(null);
  const [mode, setMode] = useState<"foto" | "teks">("foto");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [off, setOff] = useState<SectorsOff | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [cardBusy, setCardBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ symbol: string; name: string; brand: string | null }[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshStatus = () =>
    status()
      .then(setSt)
      .catch(() => setSt(null));
  useEffect(() => {
    refreshStatus();
  }, []);

  function handle<T>(x: T | SectorsOff): T | null {
    if (isOff(x)) {
      setOff(x);
      return null;
    }
    setOff(null);
    return x;
  }

  async function onScan() {
    setBusy(true);
    setErr(null);
    try {
      const body = mode === "foto" ? { image: image ?? undefined } : { text };
      const r = handle(await scan(body));
      setResult(r);
      setCard(null);
      if (r) setTimeout(() => document.getElementById("hasil")?.scrollIntoView({ behavior: "smooth" }), 50);
      // Pengguna baru langsung melihat kartu kenalan perusahaan teratas — bukti bahwa ada data di balik tiap merek.
      const first = r && firstProduct(r);
      if (first) void pick(first, false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      refreshStatus();
    }
  }

  async function pick(symbol: string, scroll = true) {
    setCardBusy(symbol);
    setErr(null);
    try {
      const c = handle(await company(symbol));
      setCard(c);
      if (c && scroll) setTimeout(() => document.getElementById("kartu")?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCardBusy(null);
      refreshStatus();
    }
  }

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    try {
      const r = handle(await search(q.trim()));
      setHits(r ? r.results : null);
    } catch (e2) {
      setErr((e2 as Error).message);
    }
  }

  const canScan = mode === "foto" ? !!image : text.trim().length > 1;
  const sectorsDown = st?.sectors_off || !!off;

  return (
    <div className="sj" ref={rootRef}>
      <div className="sj-hero-band">
        <div className="sj-wrap">
          <div className="sj-top">
            <div className="sj-wordmark">
              Struk<span className="arrow">→</span>Saham
            </div>
            <div className="sj-chips">
              <span className={`sj-chip${sectorsDown ? " off" : ""}`}>
                <span className="dot" />
                {sectorsDown ? (
                  "data Sectors mati"
                ) : (
                  <span>
                    data Sectors · <b>{num(962)}</b> emiten
                  </span>
                )}
              </span>
              {st?.store && (
                <span className="sj-chip" title="Kredit API Sectors yang dipakai aplikasi ini. Data disimpan agar tidak dibayar dua kali.">
                  kredit <b>{st.store.credits_spent}</b> · hemat <b>{st.store.credits_saved}</b>
                </span>
              )}
            </div>
          </div>

          <div className="sj-hero">
            <div>
              <h1>
                Kamu sudah jadi pelanggan mereka. <span className="hl">Sekarang kenali perusahaannya.</span>
              </h1>
              <p className="sub">
                Foto struk belanjamu. Kami cari perusahaan terbuka di balik tiap merek, lalu tunjukkan dari mana uangnya datang, siapa pemiliknya, dan
                pertanyaan kritis yang layak kamu ajukan.
              </p>
              <ol className="sj-steps">
                <li>
                  <span>
                    <b>AI hanya membaca nama merek</b> di strukmu — tidak pernah menulis angka.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Merek dicocokkan</b> ke {num(962)} perusahaan yang tercatat di Bursa Efek Indonesia.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Semua angka dari API Sectors</b> — tiap angka bisa kamu telusuri sumbernya.
                  </span>
                </li>
              </ol>
            </div>

            <div className="sj-receipt">
              <div className="sj-receipt-head">
                <b>STRUK BELANJA</b>
                foto atau ketik — data pribadi diabaikan
              </div>
              <div className="sj-tabs" role="tablist">
                <button className="sj-tab" role="tab" aria-selected={mode === "foto"} onClick={() => setMode("foto")}>
                  Foto struk
                </button>
                <button className="sj-tab" role="tab" aria-selected={mode === "teks"} onClick={() => setMode("teks")}>
                  Ketik belanjaan
                </button>
              </div>
              {mode === "foto" ? (
                <>
                  <div
                    className="sj-drop"
                    onClick={() => fileRef.current?.click()}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
                    role="button"
                    tabIndex={0}
                  >
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="Pratinjau struk" />
                    ) : (
                      <div>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <circle cx="12" cy="13" r="3.5" />
                        </svg>
                        <strong>Ambil foto atau pilih gambar</strong>
                        <span style={{ fontSize: 13 }}>Struk Indomaret, Alfamart, supermarket, apa saja</span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setImage(await fileToDataUrl(f));
                    }}
                  />
                </>
              ) : (
                <>
                  <textarea
                    className="sj-textarea"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={"Indomie goreng\nPepsodent 190g\npulsa Telkomsel\nGoFood"}
                    aria-label="Daftar belanjaan"
                  />
                  <div className="sj-examples">
                    <span>Contoh:</span>
                    {EXAMPLES.map((ex) => (
                      <button key={ex.label} className="sj-ex" onClick={() => setText(ex.text)}>
                        {ex.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button className={`sj-go${busy ? " busy" : ""}`} onClick={onScan} disabled={!canScan || busy}>
                {busy ? (
                  <>
                    <span>Membaca struk…</span>
                    <span className="sj-spin" />
                  </>
                ) : (
                  <>
                    <span>Siapa di balik belanjaanku?</span>
                    <span className="arr">→</span>
                  </>
                )}
              </button>
              {err && <div className="sj-err">Ada masalah: {err}</div>}

              <form className="sj-search" onSubmit={onSearch}>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="atau cari merek / kode: Kopiko, BBCA" aria-label="Cari merek atau kode saham" />
                <button type="submit">Cari</button>
              </form>
              {hits && (
                <div className="sj-results">
                  {hits.length === 0 && <div className="none">Tidak ketemu di data Sectors.</div>}
                  {hits.map((h) => (
                    <button key={h.symbol} onClick={() => pick(h.symbol)}>
                      <b style={{ fontFamily: "var(--mono)" }}>{h.symbol}</b> {h.name}
                      {h.brand ? <span style={{ color: "var(--muted)" }}> · {h.brand}</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="sj-wrap">
        {off && (
          <div className="sj-off">
            <h3>Data Sectors tidak tersedia</h3>
            <p style={{ margin: 0 }}>{off.message}</p>
          </div>
        )}

        {result && <Basket r={result} onPick={pick} active={cardBusy ?? card?.symbol ?? null} loading={!!cardBusy} />}

        {cardBusy && !card && (
          <div className="sj-loading">
            <span className="sj-spin" /> Menyusun kartu kenalan {cardBusy}…
          </div>
        )}
        {card && <CompanyCard card={card} onPick={pick} />}
      </div>

      <footer className="sj-foot">
        <div className="sj-wrap">
          <div>
            <b>{st?.disclaimer ?? "Alat informasi dan analisis, bukan rekomendasi investasi."}</b>
          </div>
          <div>Data keuangan, pemegang saham, dan segmen pendapatan: Sectors (sectors.app). Pemetaan merek → emiten: katalog kurasi + bacaan AI (ditandai).</div>
        </div>
      </footer>
    </div>
  );
}

// Kartu pertama yang dibuka otomatis: merek BARANG di baris struk paling atas — bukan alat bayar (bank/e-wallet)
// dan bukan toko tempat belanja, karena itu yang paling dikenali pemula sebagai "yang aku beli".
const PAYMENT_RE = /(bayar|tunai|debit|kredit|qris|brimo|gopay|ovo|dana|shopeepay|flazz|e-?money|livin)/i;
function firstProduct(r: ScanResult): string | null {
  const store = (r.store_name ?? "").toLowerCase();
  const isProduct = (c: BasketCompany, raw: string) =>
    c.verified &&
    c.relation === "direct" &&
    !/bank|financ|insur/i.test(c.sub_sector ?? "") &&
    !PAYMENT_RE.test(raw) &&
    !(store && raw.toLowerCase().includes(store));
  for (const it of r.items) {
    const c = r.companies.find((x) => x.items.includes(it.raw));
    if (c && isProduct(c, it.raw)) return c.symbol;
  }
  const any = r.companies.find((c) => c.items.some((raw) => isProduct(c, raw)));
  return (any ?? r.companies.find((c) => c.verified) ?? r.companies[0])?.symbol ?? null;
}

// Baris struk dalam urutan aslinya (bukan urutan nilai pasar), masing-masing dengan emitennya bila ada.
function receiptLines(r: ScanResult): { raw: string; c: BasketCompany | null }[] {
  const seen = new Set<string>();
  const lines = r.items.map((it) => {
    const raw = it.raw || it.brand;
    const c = r.companies.find((x) => x.items.includes(raw)) ?? null;
    if (c) seen.add(`${c.symbol}|${raw}`);
    return { raw, c };
  });
  // Jaring pengaman: item emiten yang tak tercantum di daftar baca (mis. fallback tanpa AI).
  for (const c of r.companies) for (const raw of c.items) if (!seen.has(`${c.symbol}|${raw}`) && !lines.some((l) => l.raw === raw)) lines.push({ raw, c });
  return lines;
}

// Judul hasil: sebut temuan yang paling menarik, bukan sekadar mengulang dua hitungan.
function Headline({ r }: { r: ScanResult }) {
  const n = r.companies.length;
  const top = r.groups[0];
  if (n === 1) {
    return (
      <>
        Uangmu mengalir ke <span className="n">1 perusahaan terbuka</span>: {r.companies[0].name}.
      </>
    );
  }
  if (top && top.symbols.length > 1) {
    return (
      <>
        Uangmu mengalir ke <span className="n">{n} perusahaan terbuka</span> — {top.symbols.length === n ? "semuanya" : `${top.symbols.length} di antaranya`} di
        bawah <span className="n">{top.label}</span>.
      </>
    );
  }
  return (
    <>
      Uangmu mengalir ke <span className="n">{n} perusahaan terbuka</span>, masing-masing dengan pemilik yang berbeda.
    </>
  );
}

function Basket({ r, onPick, active, loading }: { r: ScanResult; onPick: (s: string) => void; active: string | null; loading: boolean }) {
  const bySym = Object.fromEntries(r.companies.map((c) => [c.symbol, c]));
  const nGroups = r.groups.length;
  const kind = (k: string) => (k === "affiliates" ? "kelompok usaha" : k === "controller" ? "pemegang pengendali" : "kepemilikan tersebar");
  return (
    <section className="sj-section" id="hasil">
      <div className="sj-eyebrow">hasil {r.store_name ? `struk ${r.store_name}` : "belanjaanmu"}</div>
      {r.companies.length ? (
        <h2 className="sj-big">
          <Headline r={r} />
        </h2>
      ) : (
        <h2 className="sj-big">Belum ada merek yang cocok dengan perusahaan terbuka di bursa.</h2>
      )}
      {active && (
        <button className="sj-jump" onClick={() => document.getElementById("kartu")?.scrollIntoView({ behavior: "smooth" })} disabled={loading}>
          {loading ? <span className="sj-spin" /> : <span className="arr">↓</span>}
          <span>
            {loading ? "Menyusun" : "Lihat"} kartu kenalan <b>{active}</b>
            {bySym[active] ? ` — ${bySym[active].name}` : ""}
          </span>
          <small>atau ketuk kode saham lain</small>
        </button>
      )}

      <div className="sj-result">
        <div>
          <div className="sj-col-h">Baris struk → kode saham</div>
          <div className="sj-lines">
            {receiptLines(r).map(({ raw, c }, i) =>
              c ? (
                <div className="sj-line" key={i}>
                  <span className="raw">{raw}</span>
                  <span className="lead" />
                  <span className="to">
                    <span className={`sj-tag ${RELATION[c.relation]?.cls ?? ""}`} title={c.note ?? RELATION[c.relation]?.title}>
                      {RELATION[c.relation]?.text ?? c.relation}
                    </span>
                    <button className={`sj-sym${active === c.symbol ? " on" : ""}`} onClick={() => onPick(c.symbol)}>
                      {c.symbol}
                    </button>
                  </span>
                </div>
              ) : (
                <div className="sj-line miss" key={i}>
                  <span className="raw">{raw}</span>
                  <span className="lead" />
                  <span className="to">
                    <span className="sj-tag" title="Merek ini bukan milik perusahaan terbuka yang kami kenali, atau belum ada di katalog.">
                      bukan emiten
                    </span>
                  </span>
                </div>
              ),
            )}
          </div>
          <SrcNote src={r.src} label="emiten dicek ke data Sectors" />
        </div>

        {nGroups > 0 && (
          <div>
            <div className="sj-col-h">Peta pemilik — pilih perusahaan untuk kartu kenalannya</div>
            <div className="sj-groups">
              {r.groups.map((g) => (
                <div className="sj-group" key={g.label}>
                  <div className="sj-group-head">
                    <h4>{g.label}</h4>
                    <span className="kind">{kind(g.kind)}</span>
                  </div>
                  <div className="syms">
                    {g.symbols.map((s) => (
                      <button key={s} className="sj-company-btn" aria-pressed={active === s} onClick={() => onPick(s)}>
                        <b>{s}</b>
                        <small>{bySym[s]?.name ?? ""}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
