const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

let apiTodayOverride: string | null = null;

export function setApiToday(date: string): void {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) apiTodayOverride = date;
}

export function apiTodayOverrideValue(): string | null {
  return apiTodayOverride;
}

export function currentDay(): string {
  return apiTodayOverride ?? isoDate(new Date());
}

export function todayJakarta(): string {
  return new Date(Date.now() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

export function daysAgo(days: number): string {
  return addDays(currentDay(), -days);
}

export function window(days: number): { start: string; end: string } {
  return { start: daysAgo(days), end: currentDay() };
}

export function isOlderThanDays(iso: string, days: number): boolean {
  return daysBetween(iso.slice(0, 10), todayJakarta()) > days;
}