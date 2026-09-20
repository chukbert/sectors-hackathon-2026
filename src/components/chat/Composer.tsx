"use client";

import { useState } from "react";

const EXAMPLES = [
  { label: "L1 · fakta", text: "Berapa harga dan kapitalisasi pasar BRMS sekarang?" },
  { label: "L7 · verifikasi", text: "Katanya BRMS mau terbang karena proyek tembaganya, benar gak? Cek datanya." },
  { label: "L8 · bandarmologi", text: "Tolong cek bandarmologi PTBA 30 hari terakhir: siapa akumulasi, gimana asing?" },
  { label: "L10 · riset lengkap", text: "Saya pertimbangkan BBCA untuk jangka panjang. Tolong riset lengkap dulu sebelum saya putuskan." },
];

export default function Composer({ onSend, busy }: { onSend: (text: string) => void; busy: boolean }) {
  const [text, setText] = useState("");
  const send = () => {
    const value = text.trim();
    if (!value || busy) return;
    setText("");
    onSend(value);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <button
            key={e.label}
            type="button"
            onClick={() => setText(e.text)}
            className="rounded-full border border-line bg-surface2/60 px-3 py-1 text-[11px] text-muted transition hover:border-accent/50 hover:text-ink"
          >
            {e.label}
          </button>
        ))}
      </div>
      <div className="card flex items-end gap-2 p-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Tanya apa saja soal saham IDX — harga, fundamental, bandarmologi, dividen, klaim yang beredar…"
          className="max-h-40 min-h-[44px] flex-1 resize-y bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted/70"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !text.trim()}
          className="rounded-xl bg-accent/90 px-4 py-2 text-sm font-medium text-canvas transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Bekerja…" : "Kirim"}
        </button>
      </div>
    </div>
  );
}