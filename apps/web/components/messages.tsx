"use client";

import React from "react";
import type { L0, Memo, Plan, RunResult } from "@/lib/types";

export function SparkIcon({ size = 32 }: { size?: number }) {
  return (
    <svg className="spark" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id="idxspark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4285f4" />
          <stop offset="0.5" stopColor="#9b72cb" />
          <stop offset="1" stopColor="#d96570" />
        </linearGradient>
      </defs>
      <path
        fill="url(#idxspark)"
        d="M12 2c.6 4.8 2.4 7.6 4.6 9.4 1.5 1.2 3.4 2 5.4 2.4-2 .4-3.9 1.2-5.4 2.4-2.2 1.8-4 4.6-4.6 9.4-.6-4.8-2.4-7.6-4.6-9.4-1.5-1.2-3.4-2-5.4-2.4 2-.4 3.9-1.2 5.4-2.4C9.6 9.6 11.4 6.8 12 2z"
      />
    </svg>
  );
}

export function Typing() {
  return (
    <div className="typing">
      <i />
      <i />
      <i />
    </div>
  );
}

export function PlanCard({
  plan,
  phase,
  onApprove,
  onOpenPlan,
}: {
  plan: Plan;
  phase: "planned" | "running" | "done" | "error";
  onApprove: (force?: boolean) => void;
  onOpenPlan: () => void;
}) {
  const stats = {
    ok: plan.nodes.filter((n) => n.status === "ok").length,
    err: plan.nodes.filter((n) => n.status === "error" || n.status === "not_found").length,
    running: plan.nodes.filter((n) => n.status === "running").length,
    pending: plan.nodes.filter((n) => n.status === "pending").length,
  };
  const finished = stats.ok + stats.err;
  return (
    <details className="plan" open>
      <summary>
        ✦&nbsp;Rencana agen · {plan.intents.length} intent → {plan.nodes.length} pengambilan data ·{" "}
        {plan.estimates.store_hits} Store-hit + {plan.estimates.live} live ≈ {plan.estimates.credits_live} kredit
        {phase === "done" ? <span className="chip done" style={{ marginLeft: 8 }}>selesai ✓</span> : null}
        {phase === "running" ? <span className="chip warn" style={{ marginLeft: 8 }}>berjalan…</span> : null}
      </summary>
      <div className="pbody">
        <div className="planrow">
          <span className="l">Persona &amp; playbook</span>
          <span className="r">
            <b>{plan.persona}</b> · {plan.playbooks.map((p) => p.label).join(", ")}
          </span>
        </div>
        <div className="planrow">
          <span className="l">Scope</span>
          <span className="r">{(plan.scope.symbols ?? []).join(", ") || "—"}{plan.scope.regional?.length ? ` + ${plan.scope.regional.map((r) => `${r.exchange.toUpperCase()}:${r.symbol}`).join(", ")}` : ""}</span>
        </div>
        <div className="planrow">
          <span className="l">Estimasi</span>
          <span className="r">
            {plan.estimates.store_hits} dari Store (<span className="hit">0 kredit</span>) + {plan.estimates.live} live (
            <span className="live">±{plan.estimates.credits_live} kredit</span>) · {plan.estimates.waves} gelombang
          </span>
        </div>
        {plan.estimates.over_budget ? (
          <div className="planrow">
            <span className="l">Budget</span>
            <span className="r bad">estimasi melebihi budget {plan.estimates.budget_max} kredit — bisa tetap jalan dengan persetujuan</span>
          </div>
        ) : null}
        {plan.compiler?.where ? (
          <div className="planrow">
            <span className="l">Compiler NL→where</span>
            <span className="r">{JSON.stringify(plan.compiler.where)}</span>
          </div>
        ) : null}
        {phase !== "planned" ? (
          <div className="planrow">
            <span className="l">Progres</span>
            <span className="r">
              {finished}/{plan.nodes.length} selesai · {stats.running} berjalan · {stats.err} gagal
            </span>
          </div>
        ) : null}
        <details className="nodedetails" open={plan.nodes.length <= 12}>
          <summary>
            {plan.nodes.length <= 12 ? "Node → endpoint" : `Lihat ${plan.nodes.length} pengambilan data (node → endpoint)`}
          </summary>
          <div className="nodegrid">
            {plan.nodes.map((node) => (
              <div className="node" key={node.id} title={`${node.endpoint} ${JSON.stringify(node.params)}`}>
                <span
                  className={`dot ${
                    node.status === "ok"
                      ? "ok"
                      : node.status === "error" || node.status === "not_found"
                        ? "err"
                        : node.status === "running"
                          ? "run"
                          : node.status === "skipped_budget"
                            ? "skip"
                            : ""
                  }`}
                />
                <span>
                  {node.label}{" "}
                  {node.hit ? <span className="hit">· hit</span> : node.credits_spent ? <span className="live">· {node.credits_spent} kredit</span> : null}
                </span>
              </div>
            ))}
          </div>
        </details>
        {phase === "planned" || (phase === "error" && stats.pending === plan.nodes.length) ? (
          <>
            <button
              className="btn"
              onClick={() => onApprove(plan.estimates.over_budget)}
              title={
                plan.estimates.over_budget
                  ? `Estimasi ${plan.estimates.credits_live} kredit melebihi budget ${plan.estimates.budget_max}/run — persetujuan ini menjalankannya.`
                  : undefined
              }
            >
              Setujui &amp; jalankan ({plan.estimates.credits_live} kredit
              {plan.estimates.over_budget ? ` · di atas budget ${plan.estimates.budget_max}` : ""})
            </button>{" "}
            <button className="btn ghost" onClick={onOpenPlan}>
              Detail node
            </button>
          </>
        ) : null}
        {phase === "running" ? <div className="src">Menjalankan… panel akan terisi progresif. Klik node untuk audit endpoint.</div> : null}
      </div>
    </details>
  );
}

export function L0Strip({ l0, onEvidenceReady }: { l0: L0; onEvidenceReady?: () => void }) {
  return (
    <div>
      <h4 style={{ margin: "6px 0 2px", fontSize: 17 }}>{l0.title}</h4>
      <p className="sub">
        {l0.persona} · {l0.playbooks.join(", ")} · {l0.query}
      </p>
      <div className="kpis">
        {l0.kpis.map((kpi, i) => (
          <div className={`kpi ${kpi.tone ?? ""}`} key={i}>
            <div className="l">{kpi.label}</div>
            <div className="v">{kpi.value}</div>
            {kpi.sub ? <div className="s">{kpi.sub}</div> : null}
          </div>
        ))}
      </div>
      <ul style={{ margin: "8px 0 0 18px", padding: 0, fontSize: 14 }}>
        {l0.bullets.map((b, i) => (
          <li key={i} style={{ marginBottom: 4 }}>
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MemoCard({
  memo,
  followups,
  runId,
  result,
  onExport,
  onFollowup,
}: {
  memo: Memo;
  followups: string[];
  runId: string;
  result: RunResult;
  onExport: (fmt: "xlsx" | "docx" | "pdf") => void;
  onFollowup: (text: string) => void;
}) {
  const ver = memo.verification;
  return (
    <>
      <div className="memo">
        <h3>Memo 3 lensa</h3>
        <p className="sub" style={{ marginBottom: 8 }}>
          Disintesis dari {result.usage.calls} pengambilan data · verifier{" "}
          {ver?.numeric ? `${ver.numeric.checked} angka dicek` : "—"}
        </p>
        {memo.lenses.map((lens, i) => (
          <div className="lens" key={i}>
            <b>{lens.title}</b>
            <p>{lens.text}</p>
          </div>
        ))}
        <div className="badges" style={{ marginTop: 10 }}>
          {ver?.numeric ? (
            <span className={`chip ${ver.numeric.ok ? "ok" : "warn"}`}>
              {ver.numeric.ok ? "✓ semua angka terlacak ke ledger" : `${ver.numeric.unverified.length} angka belum terlacak`}
            </span>
          ) : null}
          {ver?.policy ? (
            <span className={`chip ${ver.policy.ok ? "ok" : "warn"}`}>
              {ver.policy.ok ? "✓ tanpa bahasa rekomendasi" : `frasa terblokir: ${ver.policy.banned.join(", ")}`}
            </span>
          ) : null}
          <span className="chip">{ver?.source === "llm-xhigh" ? "sintesis xhigh" : "sintesis template"}</span>
        </div>
        <div className="usage">
          <span className="chip">{result.usage.sectors_credits} kredit Sectors</span>
          <span className="chip">
            {result.usage.store_hits} Store-hit / {result.usage.store_misses} miss
          </span>
          {result.usage.llm ? <span className="chip">LLM US${result.usage.llm.cost_usd.toFixed(3)} ({result.usage.llm.calls} call)</span> : null}
          {result.usage.budget_stopped ? <span className="chip warn">budget stop</span> : null}
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn small ghost" onClick={() => onExport("xlsx")}>
            ⤓ XLSX (data + sumber)
          </button>{" "}
          <button className="btn small ghost" onClick={() => onExport("docx")}>
            ⤓ DOCX (memo)
          </button>{" "}
          <button className="btn small ghost" onClick={() => onExport("pdf")}>
            ⤓ PDF (print)
          </button>{" "}
          <button className="btn small ghost" onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 1))}>
            ⧉ Salin sitasi
          </button>
        </div>
        <div className="disclaimer">{memo.disclaimer}</div>
      </div>
      {followups.length ? (
        <div className="fups">
          {followups.map((f) => (
            <button key={f} onClick={() => onFollowup(f)}>
              {f}
            </button>
          ))}
        </div>
      ) : null}
      <div className="src">Run {runId}</div>
    </>
  );
}