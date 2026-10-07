"use client";

import { useState } from "react";
import type { SfCheck, Snowflake } from "@/lib/struk";
import { num, sfLabel, sfValue } from "@/lib/struk";
import { SrcNote } from "./bits";
import { FiveSidesRadar } from "./charts";

const MARK = { pass: "✓", fail: "✕", none: "–" } as const;

function state(c: SfCheck): keyof typeof MARK {
  return c.result === true ? "pass" : c.result === false ? "fail" : "none";
}

export function FiveSides({ sf, symbol }: { sf: Snowflake; symbol: string }) {
  const [open, setOpen] = useState(sf.axes[0]?.id ?? "value");
  const axis = sf.axes.find((a) => a.id === open) ?? sf.axes[0];
  return (
    <>
      <div className="sj-sf">
        <FiveSidesRadar sf={sf} />
        <div className="sj-sf-sum">
          <p className="lead">
            <b>{symbol}</b> lolos <span className="count">{sf.passed}</span> dari {sf.total} cek
            {sf.assessed < sf.total && <> ({sf.total - sf.assessed} cek tidak bisa dinilai karena datanya belum ada di Sectors)</>}.
          </p>
          <div className="sj-sf-axes" role="tablist" aria-label="Sisi">
            {sf.axes.map((a) => (
              <button key={a.id} role="tab" aria-selected={a.id === open} className={`sj-sf-axis${a.id === open ? " on" : ""}`} onClick={() => setOpen(a.id)}>
                <span className="name">{a.label}</span>
                <span className="dots" aria-hidden>
                  {a.checks.map((c) => (
                    <i key={c.id} className={state(c)} />
                  ))}
                </span>
                <span className="n">
                  {a.passed}/{a.total}
                </span>
              </button>
            ))}
          </div>
          {sf.is_bank && <p className="sj-sf-note">{symbol} adalah bank, jadi sisi Kesehatan memakai 4 cek khusus bank (kredit macet, LDR, leverage, CAR) — utang bank sebagian besar adalah simpanan nasabah.</p>}
        </div>
      </div>

      {axis && (
        <div className="sj-sf-detail" role="tabpanel">
          <p className="blurb">{axis.blurb}</p>
          <ul className="sj-sf-checks">
            {axis.checks.map((c) => (
              <CheckRow key={c.id} c={c} universe={sf.universe_total} />
            ))}
          </ul>
        </div>
      )}
      <p className="sj-sf-note">
        Kerangka diadaptasi dari model analisis terbuka Simply Wall St; semua angka dari Sectors dan pembandingnya (median bursa, median {sf.peer_group ?? "industri"})
        dihitung dari {num(sf.universe_total)} emiten yang sama — 0 kredit tambahan. Ini bukan rating dan bukan saran beli/jual: lolos berarti sebuah syarat terpenuhi,
        bukan berarti sahamnya bagus.
      </p>
      <SrcNote src={sf.src} />
    </>
  );
}

function CheckRow({ c, universe }: { c: SfCheck; universe: number }) {
  const st = state(c);
  return (
    <li className={`sj-sf-check ${st}`}>
      <span className="mark" aria-label={st === "pass" ? "lolos" : st === "fail" ? "tidak lolos" : "tidak bisa dinilai"}>
        {MARK[st]}
      </span>
      <div>
        <div className="t">{c.title}</div>
        <div className="vals">
          {c.values.map((v) => (
            <span key={v.field} className="val">
              {sfLabel(v.field)} <b>{sfValue(v.field, v.value)}</b>
            </span>
          ))}
        </div>
        <div className="mkt">
          {st === "none" ? "Data Sectors untuk cek ini belum lengkap. · " : ""}
          Lolos oleh <b>{num(c.market_pass)}</b> dari {num(universe)} emiten di bursa
        </div>
        <details>
          <summary>rumus setara di Screener Sectors</summary>
          <code>{c.where}</code>
          {c.note && <p className="dev">{c.note}</p>}
        </details>
      </div>
    </li>
  );
}
