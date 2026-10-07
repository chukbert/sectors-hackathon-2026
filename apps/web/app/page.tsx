"use client";

import { useEffect, useRef, useState } from "react";
import "./struk.css";
import type { Card, SearchHit, SectorsOff, Status } from "@/lib/struk";
import { company, isOff, num, search, status } from "@/lib/struk";
import { CompanyCard } from "@/components/struk/company-card";

// Contoh cepat: kode saham yang sering dibicarakan, dari sektor yang berbeda-beda.
const QUICK = ["BBCA", "TLKM", "ICBP", "ROTI", "GOTO"];

export default function PahamEmitenPage() {
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [off, setOff] = useState<SectorsOff | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [cardBusy, setCardBusy] = useState<string | null>(null);
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
    // Tautan siap-bagikan: /?emiten=ICBP langsung membuka kartunya.
    const sym = new URLSearchParams(window.location.search).get("emiten");
    if (sym) void pick(sym.toUpperCase());
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

  async function pick(symbol: string, scroll = true) {
    setCardBusy(symbol);
    setErr(null);
    try {
      const c = handle(await company(symbol));
      setCard(c);
      if (c) {
        window.history.replaceState(null, "", `?emiten=${c.symbol}`);
        if (scroll) setTimeout(() => document.getElementById("kartu")?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    } catch (e) {
      setErr((e as Error).message === "Not Found" ? `Kode ${symbol} tidak ada di data Sectors.` : (e as Error).message);
    } finally {
      setCardBusy(null);
      refreshStatus();
    }
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
    void pick(symbol);
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
  const busy = searching || !!cardBusy;

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
                keuangan sendiri.
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
                kode saham (ticker) di Bursa Efek Indonesia
              </div>
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
                  placeholder="mis. BBCA"
                  aria-label="Kode saham"
                  maxLength={8}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <button type="submit" className={`sj-go${busy ? " busy" : ""}`} disabled={!q.trim() || busy}>
                  {busy ? (
                    <>
                      <span>{cardBusy ? `Menyusun kartu ${cardBusy}…` : "Mencari…"}</span>
                      <span className="sj-spin" />
                    </>
                  ) : (
                    <>
                      <span>Cek kondisinya</span>
                      <span className="arr">→</span>
                    </>
                  )}
                </button>
              </form>
              <div className="sj-quick">
                <span>Coba:</span>
                {QUICK.map((sym) => (
                  <button key={sym} className="sj-ex" disabled={busy} onClick={() => open(sym)}>
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

        {cardBusy && !card && (
          <div className="sj-loading">
            <span className="sj-spin" /> Menyusun kartu {cardBusy}…
          </div>
        )}
        {card && <CompanyCard card={card} onPick={pick} />}
        {!card && !cardBusy && !off && (
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
