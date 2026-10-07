"use client";

import { useEffect, useRef, useState } from "react";
import "./struk.css";
import type { Card, SearchHit, SectorsOff, Status } from "@/lib/struk";
import { company, isOff, num, search, status } from "@/lib/struk";
import { ResultView } from "@/components/struk/result";

// Contoh cepat: kode saham yang sering dibicarakan, dari sektor yang berbeda-beda.
const QUICK = ["BBCA", "TLKM", "ICBP", "ROTI", "GOTO"];
// Satu kode = kartu lengkap; 2–5 kode = kolom berdampingan.
const MAX_PICK = 5;
// Titik mulai untuk yang belum punya kode di kepala: emiten satu industri yang sering dibandingkan orang.
// Hanya pengelompokan, bukan rekomendasi; semua kode dicek ada di 962 emiten data Sectors.
const PRESETS: { title: string; q: string; symbols: string[] }[] = [
  { title: "Bank besar", q: "Siapa yang paling besar labanya dari setiap Rp100?", symbols: ["BBCA", "BBRI", "BMRI", "BBNI"] },
  { title: "Mi instan & makanan", q: "Merek di dapur kita — siapa pemiliknya, siapa paling sehat?", symbols: ["ICBP", "INDF", "MYOR", "ROTI"] },
  { title: "Operator seluler", q: "Pulsa yang kita beli tiap bulan jadi laba siapa?", symbols: ["TLKM", "ISAT", "EXCL"] },
  { title: "Ritel sehari-hari", q: "Minimarket, mal, dan toko rumah tangga.", symbols: ["AMRT", "MAPI", "ACES"] },
  { title: "Rokok", q: "Industri lama dengan dividen besar — masih bertumbuh?", symbols: ["HMSP", "GGRM", "WIIM"] },
  { title: "Teknologi", q: "Pendapatan naik, tapi sudah untung atau masih rugi?", symbols: ["GOTO", "BUKA", "EMTK"] },
];

export default function PahamEmitenPage() {
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [off, setOff] = useState<SectorsOff | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [cards, setCards] = useState<Record<string, Card>>({});
  const [loading, setLoading] = useState<string[]>([]);
  const [full, setFull] = useState(false);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshStatus = () =>
    status()
      .then(setSt)
      .catch(() => setSt(null));
  useEffect(() => {
    refreshStatus();
    // Tautan siap-bagikan: /?emiten=ICBP membuka kartunya; /?emiten=ICBP,MYOR,ROTI langsung membandingkan.
    const raw = new URLSearchParams(window.location.search).get("emiten");
    if (raw) choose(raw.split(","), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handle<T>(x: T | SectorsOff): T | null {
    if (isOff(x)) {
      setOff(x);
      return null;
    }
    setOff(null);
    return x;
  }

  // Kartu disimpan per kode: menambah kolom tidak mengambil ulang kartu yang sudah ada.
  async function load(symbol: string) {
    setLoading((l) => (l.includes(symbol) ? l : [...l, symbol]));
    try {
      const c = handle(await company(symbol));
      if (c) setCards((m) => ({ ...m, [symbol]: c }));
      else setSel((s) => s.filter((x) => x !== symbol));
    } catch (e) {
      setSel((s) => s.filter((x) => x !== symbol));
      setErr((e as Error).message === "Not Found" ? `Kode ${symbol} tidak ada di data Sectors.` : (e as Error).message);
    } finally {
      setLoading((l) => l.filter((x) => x !== symbol));
      refreshStatus();
    }
  }

  function choose(symbols: string[], scroll = true) {
    const next = Array.from(new Set(symbols.map((x) => x.trim().toUpperCase()).filter(Boolean))).slice(0, MAX_PICK);
    setSel(next);
    setErr(null);
    setFull(false);
    window.history.replaceState(null, "", next.length ? `?emiten=${next.join(",")}` : window.location.pathname);
    next.filter((x) => !cards[x] && !loading.includes(x)).forEach((x) => void load(x));
    // Mode aplikasi: hasil langsung di bawah bilah pencarian, jadi cukup kembali ke atas.
    if (scroll || next.length === 0) rootRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Kode baru ditambahkan ke pilihan: satu kode = kartu lengkap, dua atau lebih = dibandingkan berdampingan.
  function add(symbol: string) {
    if (sel.includes(symbol)) return choose(sel);
    if (sel.length >= MAX_PICK) {
      setFull(true);
      return;
    }
    choose([...sel, symbol]);
  }

  // Saran kode saat mengetik (BB → BBCA, BBRI, …): lokal di Core, 0 kredit.
  useEffect(() => {
    const v = q.trim();
    if (!v) {
      setHits(null);
      return;
    }
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const r = await search(v);
        if (!stale && !isOff(r)) setHits(r.results);
      } catch {
        /* saran opsional; kesalahan ditampilkan saat submit */
      }
    }, 150);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);

  function open(symbol: string) {
    setQ("");
    setHits(null);
    setNotFound(null);
    add(symbol);
  }

  async function find(query: string) {
    const v = query.trim();
    if (!v) return;
    setSearching(true);
    setErr(null);
    setNotFound(null);
    try {
      const r = handle(await search(v));
      if (!r) return;
      // Kode persis, atau hanya satu kode yang cocok: langsung buka kartunya.
      if (r.exact || r.results.length === 1) open(r.results[0].symbol);
      else if (r.results.length === 0) setNotFound(r.query || v);
      else setHits(r.results);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  const sectorsDown = st?.sectors_off || !!off;
  const app = sel.length > 0;

  const chips = (
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
        <span className="sj-chip hide-sm" title="Kredit API Sectors yang dipakai aplikasi ini. Data disimpan agar tidak dibayar dua kali.">
          kredit <b>{st.store.credits_spent}</b> · hemat <b>{st.store.credits_saved}</b>
        </span>
      )}
    </div>
  );

  // Saran / kode tidak ditemukan / galat — sama untuk kotak besar dan bilah ringkas.
  const feedback = (
    <>
      {notFound && (
        <div className="sj-results">
          <div className="none">
            Kode &ldquo;{notFound}&rdquo; tidak ada di {num(962)} emiten data Sectors. Cek lagi ejaannya — kode saham BEI umumnya 4 huruf.
          </div>
        </div>
      )}
      {!notFound && hits && hits.length > 0 && (
        <div className="sj-results" role="listbox" aria-label="Saran kode saham">
          {hits.map((h) => (
            <button key={h.symbol} role="option" aria-selected={false} disabled={sel.includes(h.symbol)} onClick={() => open(h.symbol)}>
              <b>{h.symbol}</b> <span>{h.name}</span>
              {sel.includes(h.symbol) && <em>sudah dipilih</em>}
            </button>
          ))}
        </div>
      )}
      {full && <div className="sj-err">Maksimal {MAX_PICK} emiten. Hapus salah satu dulu.</div>}
      {err && <div className="sj-err">Ada masalah: {err}</div>}
    </>
  );

  const form = (compact: boolean) => (
    <form
      className={`sj-find${compact ? " compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        void find(q);
      }}
    >
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value.toUpperCase().replace(/[^A-Z0-9.]/g, ""));
          setNotFound(null);
          setFull(false);
        }}
        placeholder={sel.length >= MAX_PICK ? `sudah ${MAX_PICK} emiten` : sel.length ? "tambah kode…" : "mis. BBCA"}
        aria-label="Kode saham"
        maxLength={8}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
      />
      <button type="submit" className={`sj-go${searching ? " busy" : ""}`} disabled={!q.trim() || searching} aria-label={sel.length ? "Tambah kode" : "Cek kondisinya"}>
        {searching ? (
          <>
            <span>Mencari…</span>
            <span className="sj-spin" />
          </>
        ) : compact ? (
          <>
            <span className="arr">+</span>
            <span className="hide-sm">Tambah</span>
          </>
        ) : (
          <>
            <span>Cek kondisinya</span>
            <span className="arr">→</span>
          </>
        )}
      </button>
    </form>
  );

  return (
    <div className="sj" ref={rootRef}>
      {app ? (
        // Mode aplikasi: hero diganti bilah ringkas yang menempel, jadi kartu langsung terlihat dan kode bisa ditambah dari mana saja.
        <div className="sj-appbar">
          <div className="sj-wrap sj-appbar-in">
            <button className="sj-wordmark as-btn" onClick={() => choose([])} title="Kembali ke beranda">
              Paham<span className="hl">Emiten</span>
            </button>
            <div className="sj-appbar-picks" aria-label="Emiten yang dipilih">
              {sel.map((x) => (
                <span className={`sj-pick${loading.includes(x) ? " wait" : ""}`} key={x}>
                  {x}
                  {loading.includes(x) ? (
                    <span className="sj-spin" />
                  ) : (
                    <button onClick={() => choose(sel.filter((y) => y !== x), false)} aria-label={`Hapus ${x}`} title={`Hapus ${x}`}>
                      ×
                    </button>
                  )}
                </span>
              ))}
              <span className="sj-appbar-count">
                {sel.length}/{MAX_PICK}
              </span>
            </div>
            <div className="sj-appbar-find">
              {form(true)}
              <div className="sj-appbar-pop">{feedback}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="sj-hero-band">
          <div className="sj-wrap">
            <div className="sj-top">
              <div className="sj-wordmark">
                Paham<span className="hl">Emiten</span>
              </div>
              {chips}
            </div>

            <div className="sj-hero">
              <div className="sj-intro">
                <h1>
                  Sudah punya akun saham, tapi ragu pilih yang mana? <span className="hl">Pahami dulu perusahaannya.</span>
                </h1>
                <p className="sub">
                  Ketik kode sahamnya. Kamu dapat satu kartu yang menjelaskan kondisi perusahaan itu dalam bahasa sehari-hari — tanpa perlu membaca
                  laporan keuangan sendiri. Masih bingung memilih? Masukkan sampai lima kode dan bandingkan berdampingan.
                </p>
              </div>
              <ol className="sj-steps">
                <li>
                  <span>
                    <b>Kondisinya sekarang:</b> seberapa besar, untung atau rugi, dari mana uangnya, dan siapa pemiliknya.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Bagus atau tidak, dicek 30 syarat</b> di lima sisi — harga, pertumbuhan, kinerja, kesehatan, dividen — dibandingkan dengan pesaing
                    dan {num(962)} emiten lain.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Semua angka dari API Sectors</b>, tiap angka bisa ditelusuri sumbernya. Tanpa AI generatif, jadi tidak ada yang dikarang.
                  </span>
                </li>
              </ol>

              <div className="sj-finder">
                <div className="sj-finder-head">
                  <b>CEK EMITEN</b>
                  kode saham (ticker) di Bursa Efek Indonesia
                </div>
                {form(false)}
                <div className="sj-quick">
                  <span>Coba:</span>
                  {QUICK.map((sym) => (
                    <button key={sym} className="sj-ex" onClick={() => open(sym)}>
                      {sym}
                    </button>
                  ))}
                </div>
                {feedback}
                <p className="sj-finder-foot">1 kode = kartu lengkap · 2–{MAX_PICK} kode = dibandingkan berdampingan</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="sj-wrap">
        {off && (
          <div className="sj-off">
            <h3>Data Sectors tidak tersedia</h3>
            <p style={{ margin: 0 }}>{off.message}</p>
          </div>
        )}

        {app && (
          <ResultView
            symbols={sel}
            cards={cards}
            max={MAX_PICK}
            onRemove={(x) => choose(sel.filter((y) => y !== x), false)}
            onAdd={(x) => add(x)}
            onSet={(xs) => choose(xs)}
            onPick={(x) => choose([x])}
          />
        )}

        {!app && !off && (
          <section className="sj-presets" aria-labelledby="mulai">
            <div className="sj-presets-h">
              <h2 id="mulai">Belum punya kode di kepala? Mulai dari satu industri.</h2>
              <p>Pilih satu kelompok untuk melihat emitennya berdampingan — angka yang sama, baris yang sama. Ini hanya pengelompokan, bukan rekomendasi.</p>
            </div>
            <div className="sj-preset-grid">
              {PRESETS.map((p) => (
                <button key={p.title} className="sj-preset" onClick={() => choose(p.symbols)}>
                  <span className="t">{p.title}</span>
                  <span className="q">{p.q}</span>
                  <span className="syms">
                    {p.symbols.map((s) => (
                      <span key={s}>{s}</span>
                    ))}
                  </span>
                  <span className="go">
                    Bandingkan {p.symbols.length} emiten <span aria-hidden>→</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <footer className="sj-foot">
        <div className="sj-wrap">
          <div>
            <b>{st?.disclaimer ?? "Alat informasi dan analisis, bukan rekomendasi investasi."}</b>
          </div>
          <div>Data keuangan, pemegang saham, dan segmen pendapatan: Sectors (sectors.app). Merek di kepala kartu: katalog kurasi yang dicek ke data Sectors.</div>
          {app && <div className="sj-foot-chips">{chips}</div>}
        </div>
      </footer>
    </div>
  );
}
