// Zero-numeric-hallucination (NFR §7.1) ditegakkan di KODE, bukan cuma prompt:
// setiap angka dalam kalimat agen harus hadir (±0.5%) di beberapa JSON tool output.
export function numbersInText(t: string): { raw: string; value: number }[] {
  const out: { raw: string; value: number }[] = [];
  // format Indonesia: titik = ribuan, koma = desimal. "2023" utuh → kandidat tahun, bukan angka finansial.
  const re = /(?:Rp\s*)?([−+-]?)(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s*(t|m|rb|jt|%|x|×)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const tok = m[2];
    const sign = m[1] === "−" || m[1] === "-" ? -1 : 1;
    let v: number;
    if (/^\d{1,3}(\.\d{3})+$/.test(tok)) v = parseFloat(tok.replace(/\./g, ""));
    else v = parseFloat(tok.replace(",", "."));
    if (!Number.isFinite(v)) continue;
    v = sign * Math.abs(v);
    const u = (m[3] ?? "").toLowerCase();
    if (u === "t") v *= 1000;       // triliun → juta (unit kartu = Rp juta)
    else if (u === "rb") v /= 1000; // ribu → juta
    // gate hanya klaim angka finansial: bersatuan, desimal, atau ≥100; tahun/prosa-kecil dilewati
    const decimal = /[.,]\d/.test(tok);
    const financial = !!u || decimal || Math.abs(v) >= 100;
    if (!financial || (!u && !decimal && v >= 1900 && v <= 2100)) continue;
    out.push({ raw: m[0].trim(), value: v });
  }
  return out;
}

// kumpulkan semua angka dari JSON tool (semua skala: IDR mentah, persen, harga)
export function numbersInJson(j: unknown, sink: number[] = []): number[] {
  if (typeof j === "number" && Number.isFinite(j)) sink.push(j);
  else if (typeof j === "string") { if (/^-?\d+(\.\d+)?$/.test(j)) sink.push(parseFloat(j)); }
  else if (Array.isArray(j)) for (const x of j) numbersInJson(x, sink);
  else if (j && typeof j === "object") for (const v of Object.values(j)) numbersInJson(v, sink);
  return sink;
}

function matches(v: number, pool: number[]): boolean {
  for (const p of pool) {
    // toleransi pembulatan: ±0.5% ATAU ±0.6 satuan ( utk angka kecil spt z-score/PER )
    if (Math.abs(p - v) <= 0.006 * Math.max(1, Math.abs(p))) return true;
    // pool IDR mentah vs teks Rp juta / triliun
    if (Math.abs(p / 1e6 - v) <= 0.006 * Math.max(1, p / 1e6)) return true;
    if (Math.abs(p / 1e9 - v) <= 0.006 * Math.max(1, p / 1e9)) return true;
    // persentase: pool 0..1 vs teks 0..100
    if (Math.abs(p * 100 - v) <= 0.5) return true;
  }
  return false;
}

export function verifyGrounding(claims: string[], toolJsons: unknown[]): { ok: boolean; ungrounded: string[] } {
  const pool = toolJsons.flatMap((j) => numbersInJson(j));
  const ungrounded: string[] = [];
  for (const c of claims) {
    for (const { raw, value } of numbersInText(c)) {
      if (!matches(value, pool)) ungrounded.push(`${raw} ∈ "${c.slice(0, 60)}"`);
    }
  }
  return { ok: ungrounded.length === 0, ungrounded };
}
