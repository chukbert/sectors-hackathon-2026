"use client";
// SATU permukaan: chat (keputusan v1.1 §13 — GrupGraph inline, Autopsi = intent).
import { useEffect, useRef, useState } from "react";
import Grafik from "@/components/grafik";
import type { ChatEvent, Kartu, AutopsiKartu } from "@/lib/types";

type Item =
  | { k: "user"; text: string }
  | { k: "trace"; lines: { l: string; ok?: boolean }[] }
  | { k: "kartu"; c: Kartu }
  | { k: "autopsi"; a: AutopsiKartu }
  | { k: "pagi"; b: Extract<ChatEvent, { type: "pagi" }>["brief"] }
  | { k: "teks"; text: string }
  | { k: "error"; text: string };

const fmtM = (x: number) => (x >= 0 ? "+" : "−") + "Rp " + Math.abs(x) + " M";
const hotChip = (n: number) => n >= 65 ? "chip hot" : "chip";

function Fomo({ c }: { c: Kartu["fomo"] }) {
  return <div className="fomo">
    <div className="lab"><span>Meter FOMO</span><span>{c.label}</span></div>
    <div className="fomo-track" role="img" aria-label={`Meter FOMO ${c.score} dari 100`}><div className="fomo-fill" style={{ width: c.score + "%", background: c.score >= 65 ? "var(--bad)" : c.score >= 40 ? "var(--warn)" : "var(--good)" }} /></div>
    <div className="fomo-ticks" style={{ fontFamily: "JetBrains Mono, monospace" }}><span>0</span><span>dingin</span><span>panas</span><span>100</span></div>
    <div className="fomo-comp">{c.components.map((k, i) => <span key={i} className="chip" style={k.bad ? { color: "var(--bad)" } : undefined}>{k.label} {k.value}</span>)}</div>
  </div>;
}

function FlowViz({ f }: { f: NonNullable<Kartu["flow"]> }) {
  const S = 46 / Math.max(12, ...f.days.map((d) => Math.max(Math.abs(d.retail), Math.abs(d.institusi))));
  const mx = Math.max(1, f.retail_net_m, -f.institusi_net_m);
  return <div>
    <div className="flowsum">
      <span className="lbl">Broker ritel</span>
      <div className="axisbar" data-tip={`Kohort ritel · net 7 hari: ${fmtM(f.retail_net_m)}`}><div className="bar" style={{ left: "50%", width: Math.min(50, Math.abs(f.retail_net_m) / mx * 50) + "%", background: "var(--c-ritel)" }}><span className="val" style={{ fontFamily: "JetBrains Mono, monospace" }}>{fmtM(f.retail_net_m)}</span></div></div>
      <span className="lbl">Asing + institusi</span>
      <div className="axisbar" data-tip={`Asing + institusional · net 7 hari: ${fmtM(f.institusi_net_m)}`}><div className={`bar ${f.institusi_net_m < 0 ? "neg" : ""}`} style={f.institusi_net_m < 0 ? { right: "50%", width: Math.min(50, Math.abs(f.institusi_net_m) / mx * 50) + "%", background: "var(--c-institusi)" } : { left: "50%", width: Math.min(50, Math.abs(f.institusi_net_m) / mx * 50) + "%", background: "var(--c-institusi)" }}><span className="val" style={{ fontFamily: "JetBrains Mono, monospace" }}>{fmtM(f.institusi_net_m)}</span></div></div>
    </div>
    <div className="days" aria-label="Net flow harian, 7 hari">
      {f.days.map((d, i) => <div className="day" key={i}>
        <div className="stack"><div className="up" style={{ height: Math.max(2, d.retail * S) + "px", background: "var(--c-ritel)" }} /></div>
        <div className="sep" /><div className="stack"><div className="dn" style={{ height: Math.max(2, -d.institusi * S) + "px", background: "var(--c-institusi)" }} /></div>
        <span className="d">{d.d}</span>
      </div>)}
    </div>
  </div>;
}

function KartuView({ c }: { c: Kartu }) {
  const [busy, setBusy] = useState(false);
  const catat = async (action: string) => {
    setBusy(true);
    try { await fetch("/api/decision", { method: "POST", body: JSON.stringify({ ticker: c.ticker, action, note: "dari Kartu Arus", price: c.price, chg_pct: c.change_pct }) }); toast(action); }
    catch { toast("gagal mencatat"); } finally { setBusy(false); }
  };
  return <article className="kartu">
    <div className="kartu-head">
      <span className="tkr" style={{ fontFamily: "JetBrains Mono, monospace" }}>{c.ticker}</span>
      <span className="nama">{c.company}</span>
      <span className="chip" style={{ fontFamily: "JetBrains Mono, monospace" }}>Rp {c.price.toLocaleString("id-ID")}</span>
      <span className={"chip " + (c.change_pct >= 0 ? "up" : "")}>{c.change_pct >= 0 ? "+" : ""}{c.change_pct}% /7d</span>
      <span className="chip" style={{ fontFamily: "JetBrains Mono, monospace" }}>vol {c.vol_mult}×</span>
      <span className={hotChip(c.fomo.score)}>FOMO {c.fomo.score}/100</span>
    </div>
    <Fomo c={c.fomo} />
    {c.memory && <div className="pilar" style={{ background: "var(--surface2)" }}>
      <div className="plabel">🪞 Jejak kamu</div>
      <div><h3 className="verdict">{c.memory.title}</h3><ul>{c.memory.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul></div>
    </div>}
    {c.pillars.map((p) => <div className="pilar" key={p.id}>
      <div className="plabel"><span className="ic">{p.ic}</span>{p.label}</div>
      <div>
        <h3 className={p.ok === false ? "verdict" : p.ok ? "verdict ok" : undefined}>{p.title}</h3>
        {p.id === "flow" && c.flow && <FlowViz f={c.flow} />}
        <ul>{p.bullets.map((b, i) => <li key={i} dangerouslySetInnerHTML={{ __html: escMd(b) }} />)}</ul>
        {p.id === "grup" && c.graph && c.graph.nodes.length > 0 && <div className="egobox">
          <div className="egohd">GrupGraph · ego {c.ticker}</div>
          <Grafik data={c.graph} height={200} />
          <div className="hint">satu garis = satu jalur kepemilikan · cincin = di portofoliomu · merah = yang kamu tanyakan · label = kemungkinan relasi</div>
        </div>}
      </div>
    </div>)}
    <div className="bantah">
      <div className="plabel">🗣 Bantahan<br /><span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(wajib · sisi lawanmu)</span></div>
      <div>
        <div className="q">{c.bantah.user_case}</div>
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: escMd(c.bantah.rebuttal) }} />
        {c.memory && <p style={{ margin: "8px 0 0", color: "var(--accent)", fontWeight: 600 }}>{c.memory.reflection}</p>}
      </div>
    </div>
    <div className="kartu-foot">
      <span><b>Pertanyaan untukmu:</b> {c.question}</span>
      {c.flags.map((f, i) => <span key={i} className="chip" style={{ color: "var(--warn)" }}>{f}</span>)}
      <button className="btn primary" disabled={busy} onClick={() => catat("menunda — ditanyakan lagi nanti")}>tandai &amp; pantau</button>
    </div>
    <div className="disc">Alat bantu riset &amp; edukasi — <b>bukan nasihat keuangan</b>, bukan rekomendasi beli/jual/hold. “Broker kohort ritel” = proxy statistik, bukan identitas pemilik akun. Kepemilikan per laporan terakhir. · data Sectors · {c.stamp}</div>
  </article>;
}

function AutopsiView({ a }: { a: AutopsiKartu }) {
  return <article className="kartu" style={{ padding: 16 }}>
    <div className="viewhd" style={{ marginBottom: 12 }}><h2>Autopsi Portofolio — Ilusi Diversifikasi</h2><p>{a.headline} — dari kepemilikan ter-cluster, bukan tebakan.</p></div>
    <div className="gscore">
      <div className="score-tile" style={{ boxShadow: "none", background: "var(--surface2)" }}>
        <div className="n" style={{ color: a.group_score >= 40 ? "var(--warn)" : "var(--good)" }}>{a.group_score}<small>/100</small></div>
        <p style={{ margin: "10px 0 0" }}><b>Group Score</b> = % nilai yang ternyata satu pengendali.</p>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: ".72rem" }}>{a.bullets[1]}</p>
      </div>
      <div className="grouplist">{a.groups.map((g, i) => <div className="grow" key={i}>
        <span className="dot" style={{ background: g.name === "Independen" ? "transparent" : undefined, borderColor: "var(--muted)" }} />
        <b style={{ fontFamily: "JetBrains Mono, monospace" }}>{g.name}</b> <span>{g.tickers.join(" + ")}</span><span className="pct">{g.pct}%</span>
        <span className="note">{g.note}</span>
      </div>)}</div>
    </div>
    <div className="graphbox" style={{ boxShadow: "none" }}>
      <div className="gh"><b style={{ fontFamily: "JetBrains Mono, monospace" }}>GrupGraph</b><span style={{ color: "var(--muted)", fontSize: ".82rem" }}>node = saham · ukuran = % portofolio · benang = kepemilikan</span></div>
      <Grafik data={a.graph} height={400} groupNames={a.groups.map((g) => g.name)} />
      <div className="hint">geser node untuk mengurai · angka kecil = tetangga grup di luar portofoliomu · hover = detail · {a.bullets[2]}</div>
    </div>
    <div className="disc" style={{ marginTop: 12 }}>Riset &amp; edukasi — bukan nasihat keuangan. Kemungkinan relasi dari data kepemilikan per laporan terakhir. · data Sectors</div>
  </article>;
}

const toast = (t: string) => { const el = document.getElementById("toast"); if (!el) return; el.textContent = t; el.classList.add("on"); clearTimeout((el as HTMLElement & { _t?: number })._t); (el as HTMLElement & { _t?: number })._t = window.setTimeout(() => el.classList.remove("on"), 2600); };
const escMd = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }) }, [items]);

  const send = async (text: string) => {
    text = text.trim(); if (!text || busy) return;
    setQ(""); setBusy(true);
    setItems((x) => [...x, { k: "user", text }, { k: "trace", lines: [] }]);
    try {
      const res = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ message: text }) });
      const rd = res.body!.getReader(); const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const ln of lines.filter(Boolean)) {
          const e = JSON.parse(ln) as ChatEvent;
          setItems((x) => {
            const y = [...x];
            const tr = y[y.length - 1]?.k === "trace" ? (y[y.length - 1] as Extract<Item, { k: "trace" }>) : null;
            if (e.type === "trace") { if (tr) tr.lines = [...tr.lines, { l: e.line, ok: e.ok }]; else y.push({ k: "trace", lines: [{ l: e.line, ok: e.ok }] }); }
            else {
              if (e.type === "kartu") y.push({ k: "kartu", c: e.kartu });
              else if (e.type === "autopsi") y.push({ k: "autopsi", a: e.autopsi });
              else if (e.type === "pagi") y.push({ k: "pagi", b: e.brief });
              else if (e.type === "teks") y.push({ k: "teks", text: e.text });
              else y.push({ k: "error", text: e.text });
            }
            return y;
          });
        }
      }
    } catch (e) {
      setItems((x) => [...x, { k: "error", text: "koneksi ke pipeline putus: " + (e as Error).message }]);
    } finally { setBusy(false); }
  };

  return <>
    <header className="topbar">
      <div className="topbar-row">
        <span className="brand">A<em>R</em>US</span>
        <span className="eyebrow">Sectors Hackathon 2026 · Track 01 · multi-agent di atas Sectors API</span>
        <button className="btn" style={{ padding: "4px 10px", fontSize: ".78rem" }} onClick={() => {
          const cur = document.documentElement.dataset.theme;
          const next = !cur || cur === "light" ? "dark" : "light";
          document.documentElement.dataset.theme = next;
          try { localStorage.setItem("arus-theme", next) } catch { /* noop */ }
        }}>◐</button>
      </div>
    </header>
    <main>
      <section className="view">
        <div className="chat">
          {items.length === 0 && <div className="msg arus"><div className="who">ARUS</div><div className="bubble">
            Ikan kecil lihat harga. ARUS lihat <b>arus</b>. Tanya: “kenapa ANTM naik? boleh ikut?” · “autopsi portofolio saya” (paste ≤10 ticker dulu) · “brief pagi”.<br />
            Semua angka di kartu dihitung dari data Sectors oleh kode — bukan dikarang model. Tidak ada rekomendasi beli/jual.
          </div></div>}
          {items.map((it, i) => {
            if (it.k === "user") return <div className="msg user" key={i}><div className="who">Kamu</div><div className="bubble">{it.text}</div></div>;
            if (it.k === "trace") return <div className="trace" key={i} aria-label="Jejak orkestrasi agen">
              {it.lines.map((l, j) => <span key={j}><span dangerouslySetInnerHTML={{ __html: escMd(l.l).replace(/^◇ |^▸ |^◈ |^◆ /, "") }} />{l.ok ? " ✓" : ""}<br /></span>)}
            </div>;
            if (it.k === "kartu") return <div className="msg arus" style={{ maxWidth: "100%" }} key={i}><div className="who">ARUS</div><KartuView c={it.c} /></div>;
            if (it.k === "autopsi") return <div className="msg arus" style={{ maxWidth: "100%" }} key={i}><div className="who">ARUS · GrupGraph</div><AutopsiView a={it.a} /></div>;
            if (it.k === "pagi") return <div className="msg arus" style={{ maxWidth: "100%" }} key={i}><div className="who">ARUS · 08:30</div><div>
              <div className="pagihd"><span className="jam" style={{ fontFamily: "Bricolage Grotesque, sans-serif", fontWeight: 800, fontSize: "2rem" }}>08:30</span>
                <div><h2 style={{ fontFamily: "Bricolage Grotesque, sans-serif", fontWeight: 800, fontSize: "1.35rem" }}>Morning Arus — tidak ada yang bertanya</h2>
                  <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: ".88rem" }}>cron · scan {it.b.scanned} ticker anomali (cache harian) · {it.b.entries.length} entri · tiap entri ada counter-argument</p></div></div>
              {it.b.entries.map((e) => <details className="anom" key={e.ticker}>
                <summary><span className="tkr" style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 600, width: 64 }}>{e.ticker}</span>
                  <span className={"delta " + (e.delta >= 0 ? "up" : "dn")} style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 600, width: 56 }}>{e.delta >= 0 ? "+" : ""}{e.delta}%</span>
                  <span style={{ color: "var(--muted)", fontSize: ".86rem", flex: 1, minWidth: 180 }}>{e.one}</span><span className={"sev " + e.sev}>{e.sev}</span></summary>
                <div className="body"><p>{e.body}</p><p style={{ color: "var(--accent)", fontWeight: 600 }}>Counter-argument: {e.counter}</p></div>
              </details>)}
              {!it.b.entries.length && <p style={{ color: "var(--muted)" }}>Tidak ada anomali di atas ambang (z&nbsp;≥&nbsp;2 / |Δ|&nbsp;&gt;&nbsp;9%) hari ini — itu jawaban, bukan kegagalan.</p>}
            </div></div>;
            if (it.k === "teks") return <div className="msg arus" key={i}><div className="who">ARUS</div><div className="bubble">{it.text}</div></div>;
            return <div className="msg arus" key={i}><div className="who">ARUS</div><div className="bubble" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>{it.text}</div></div>;
          })}
          <div ref={endRef} />
        </div>
        <div className="composer">
          <form id="ask" onSubmit={(e) => { e.preventDefault(); send(q) }}>
            <input aria-label="Tanya ARUS" placeholder={busy ? "agen sedang bekerja…" : "Tanya: kenapa XXXX naik? boleh ikut?"} value={q} onChange={(e) => setQ(e.target.value)} disabled={busy} />
            <button className="btn primary" type="submit">Kirim</button>
          </form>
          <div className="chips">
            <button type="button" onClick={() => send("kenapa BRMS 3 hari naik terus? boleh ikut?")} disabled={busy}>kenapa BRMS naik?</button>
            <button type="button" onClick={() => send("mau average down BRMS nih, sekalian balikin yang hilang")} disabled={busy}>mau average down…</button>
            <button type="button" onClick={() => send("autopsi portofolio saya BBCA INDF ICBP BUMI BRMS TLKM SMGR")} disabled={busy}>bedah portofolio</button>
            <button type="button" onClick={() => send("brief pagi")} disabled={busy}>brief pagi</button>
          </div>
        </div>
      </section>
    </main>
    <footer className="pagefoot">ARUS · ikan kecil lihat harga, ARUS lihat arus — tidak memberi rekomendasi, itu disengaja. Data: Sectors.</footer>
    <div id="tip" role="status" /><div id="toast" role="status" />
  </>;
}
