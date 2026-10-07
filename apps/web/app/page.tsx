"use client";

import { useEffect, useRef, useState } from "react";
import "./struk.css";
import type { Card, SearchHit, SectorsOff, Status } from "@/lib/struk";
import { company, isOff, num, search, status } from "@/lib/struk";
import { CompanyCard } from "@/components/struk/company-card";
import { CompareView } from "@/components/struk/compare";

// Contoh cepat: kode saham yang sering dibicarakan, dari sektor yang berbeda-beda.
const QUICK = ["BBCA", "TLKM", "ICBP", "ROTI", "GOTO"];
// Satu kode = kartu lengkap; 2–5 kode = kolom berdampingan.
const MAX_PICK = 5;

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
    if (scroll && next.length) setTimeout(() => document.getElementById("kartu")?.scrollIntoView({ behavior: "smooth" }), 80);
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
  const single = sel.length === 1 ? cards[sel[0]] : undefined;
  const firstLoad = sel.length === 1 && !single && loading.includes(sel[0]);

  return (
    <div className="sj">
      <div className="sj-hero-band">
        <div className="sj-wrap">
          <div className="sj-top">
            <div className="sj-wordmark">
              Paham<span className="hl">Emiten</span>
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
            <div className="sj-intro">
              <h1>
                Sudah punya akun saham, tapi ragu pilih yang mana? <span className="hl">Pahami dulu perusahaannya.</span>
              </h1>
              <p className="sub">
                Ketik kode sahamnya. Kamu dapat satu kartu yang menjelaskan kondisi perusahaan itu dalam bahasa sehari-hari — tanpa perlu membaca laporan
                keuangan sendiri. Masih bingung memilih? Masukkan sampai lima kode dan bandingkan berdampingan.
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
                  <b>Bagus atau tidak, dicek 30 syarat</b> di lima sisi — harga, pertumbuhan, kinerja, kesehatan, dividen — dibandingkan dengan pesaing dan{" "}
                  {num(962)} emiten lain.
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
                kode saham (ticker) di Bursa Efek Indonesia · 1 kode untuk kartu lengkap, 2–{MAX_PICK} untuk dibandingkan
              </div>
              {sel.length > 0 && (
                <div className="sj-picked" aria-label="Emiten yang dipilih">
                  <span className="lab">
                    Dipilih {sel.length}/{MAX_PICK}:
                  </span>
                  {sel.map((x) => (
                    <span className="sj-pick" key={x}>
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
                  <button className="sj-link" onClick={() => choose([], false)}>
                    kosongkan
                  </button>
                  {full && <span className="full">Maksimal {MAX_PICK} emiten. Hapus salah satu dulu.</span>}
                </div>
              )}
              <form
                className="sj-find"
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
                  }}
                  placeholder={sel.length ? "tambah kode, mis. BBRI" : "mis. BBCA"}
                  aria-label="Kode saham"
                  maxLength={8}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <button type="submit" className={`sj-go${searching ? " busy" : ""}`} disabled={!q.trim() || searching}>
                  {searching ? (
                    <>
                      <span>Mencari…</span>
                      <span className="sj-spin" />
                    </>
                  ) : (
                    <>
                      <span>{sel.length === 0 ? "Cek kondisinya" : sel.length >= MAX_PICK ? `Sudah ${MAX_PICK} emiten` : "Tambah untuk dibandingkan"}</span>
                      <span className="arr">{sel.length === 0 ? "→" : "+"}</span>
                    </>
                  )}
                </button>
              </form>
              <div className="sj-quick">
                <span>{sel.length ? "Tambah:" : "Coba:"}</span>
                {QUICK.map((sym) => (
                  <button key={sym} className="sj-ex" disabled={sel.includes(sym)} onClick={() => open(sym)}>
                    {sym}
                  </button>
                ))}
              </div>
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
                    <button key={h.symbol} role="option" aria-selected={false} onClick={() => open(h.symbol)}>
                      <b style={{ fontFamily: "var(--mono)" }}>{h.symbol}</b> <span style={{ color: "var(--muted)" }}>{h.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {err && <div className="sj-err">Ada masalah: {err}</div>}
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

        {firstLoad && (
          <div className="sj-loading">
            <span className="sj-spin" /> Menyusun kartu {sel[0]}…
          </div>
        )}
        {single && <CompanyCard card={single} onPick={(x) => choose([x])} onCompare={(xs) => choose(xs)} />}
        {sel.length > 1 && (
          <CompareView
            cards={sel.filter((x) => cards[x]).map((x) => cards[x])}
            loading={sel.filter((x) => !cards[x])}
            onRemove={(x) => choose(sel.filter((y) => y !== x), false)}
          />
        )}
        {sel.length === 0 && !off && (
          <div className="sj-empty sj-start">
            Belum ada emiten yang dibuka. Ketik kode saham yang ingin kamu pahami di kotak di atas — atau{" "}
            <button className="sj-link" onClick={() => inputRef.current?.focus()}>
              mulai dari sini
            </button>
            .
          </div>
        )}
      </div>

      <footer className="sj-foot">
        <div className="sj-wrap">
          <div>
            <b>{st?.disclaimer ?? "Alat informasi dan analisis, bukan rekomendasi investasi."}</b>
          </div>
          <div>Data keuangan, pemegang saham, dan segmen pendapatan: Sectors (sectors.app). Merek di kepala kartu: katalog kurasi yang dicek ke data Sectors.</div>
        </div>
      </footer>
    </div>
  );
}
