export type LangMode = "pemula" | "menengah" | "advanced";

export function langMode(value: string | null | undefined): LangMode {
  return value === "pemula" || value === "advanced" ? value : "menengah";
}

function sig(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  if (abs >= 1000) return value.toLocaleString("id-ID", { maximumFractionDigits: digits });
  return value.toLocaleString("id-ID", { maximumSignificantDigits: Math.max(2, digits + 1) });
}

export function formatNumber(value: number, mode: LangMode = "menengah"): string {
  if (mode === "pemula") return sig(value, 1);
  if (mode === "advanced") return sig(value, 6);
  return sig(value, 3);
}

export function formatIdr(value: number, mode: LangMode = "menengah"): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}Rp ${formatNumber(abs / 1e12, mode)} T`;
  if (abs >= 1e9) return `${sign}Rp ${formatNumber(abs / 1e9, mode)} M`;
  if (abs >= 1e6) return `${sign}Rp ${formatNumber(abs / 1e6, mode)} jt`;
  return `${sign}Rp ${formatNumber(abs, mode)}`;
}

export function formatPercent(value: number, mode: LangMode = "menengah"): string {
  const pct = Math.abs(value) <= 1.5 ? value * 100 : value;
  const digits = mode === "pemula" ? 1 : mode === "advanced" ? 2 : 2;
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(pct)}%`;
}

export function formatPer(value: number, mode: LangMode = "menengah"): string {
  return `${formatNumber(value, mode)}×`;
}

export function formatSigned(value: number, mode: LangMode = "menengah"): string {
  const s = formatNumber(Math.abs(value), mode);
  return value > 0 ? `+${s}` : value < 0 ? `-${s}` : "0";
}