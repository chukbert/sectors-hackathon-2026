// lib/ground.ts — zero-numeric-hallucination ditegakkan di KODE, bukan prompt.
// Setiap angka finansial dalam prosa LLM harus hadir (±0.5%) di pool JSON tool + angka turunan kode.
export function numbersInText(t: string): { raw: string; value: number }[] {
  const out: { raw: string; value: number }[] = [];
  const re = /(?:Rp\s*)?([−+-]?)(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s*(t|m|rb|jt|%|x|×)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const tok = m[2]!;
    const sign = m[1] === "−" || m[1] === "-" ? -1 : 1;
    let v: number;
    if (/^\d{1,3}(\.\d{3})+$/.test(tok)) v = parseFloat(tok.replace(/\./g, ""));
    else v = parseFloat(tok.replace(",", "."));
    if (!Number.isFinite(v)) continue;
    v = sign * Math.abs(v);
    let u = (m[3] ?? "").toLowerCase();
    const after = t[re.lastIndex] ?? "";
    if (u && /[a-z]/i.test(after)) u = ""; // "5thn" / "64.64Mt" → satuan nempel huruf, bukan klaim unit
    if (u === "t") v *= 1000;
    else if (u === "rb") v /= 1000;
    const decimal = /[.,]\d/.test(tok);
    const financial = !!u || decimal || Math.abs(v) >= 100;
    if (!financial || (!u && !decimal && v >= 1900 && v <= 2100)) continue;
    out.push({ raw: m[0].trim(), value: v });
  }
  return out;
}

export function numbersInJson(j: unknown, sink: number[] = []): number[] {
  if (typeof j === "number" && Number.isFinite(j)) sink.push(j);
  else if (typeof j === "string") {
    if (/^-?\d+(\.\d+)?$/.test(j)) sink.push(parseFloat(j));
  } else if (Array.isArray(j)) for (const x of j) numbersInJson(x, sink);
  else if (j && typeof j === "object") for (const v of Object.values(j)) numbersInJson(v, sink);
  return sink;
}

const close = (a: number, b: number) => Math.abs(a - b) <= 0.006 * Math.max(1, Math.abs(a));

function matches(v: number, pool: number[]): boolean {
  for (const p of pool) {
    // skala: IDR mentah → rb/jt/M/T · persen 0..1 vs 0..100 · nilai absolut (teks kerap menghilangkan tanda minus)
    for (const q of [p, p / 1e3, p / 1e6, p / 1e9, p / 1e12, p * 100, Math.abs(p), Math.abs(p / 1e3), Math.abs(p / 1e6), Math.abs(p / 1e9), Math.abs(p / 1e12)]) {
      if (close(q, v) || close(Math.abs(q), Math.abs(v))) return true;
    }
  }
  return false;
}

export function verifyGrounding(claims: string[], pool: unknown[]): { ok: boolean; ungrounded: string[] } {
  const numbers = pool.flatMap((j) => numbersInJson(j));
  const ungrounded: string[] = [];
  for (const c of claims)
    for (const { raw, value } of numbersInText(c)) if (!matches(value, numbers)) ungrounded.push(`${raw}`);
  return { ok: ungrounded.length === 0, ungrounded };
}