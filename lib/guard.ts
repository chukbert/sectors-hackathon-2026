// lib/guard.ts — disclaimer + blokir anjuran eksplisit + blokir klaim tanpa sitasi.
export const DISCLAIMER =
  "Alat riset & edukasi. Bukan nasihat keuangan. Tanpa eksekusi order.";

const BLOCKED = [/pasti cuan/i, /\bbeli\b.*\bsekarang\b/i, /jual semua/i, /all in/i, /dijamin naik/i];

export function guardText(text: string, hasCitation: boolean): { ok: boolean; reason?: string } {
  for (const re of BLOCKED) if (re.test(text)) return { ok: false, reason: `diblokir guardrail (${re})` };
  if (!hasCitation) return { ok: false, reason: "klaim tanpa sitasi" };
  return { ok: true };
}
