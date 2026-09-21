import { z } from "zod";
import { getDb } from "@/lib/db";
import type { PortfolioGraph } from "@/lib/portfolio/graph";

export const MAX_PORTFOLIO_ITEMS = 8;
export const INVESTIGATION_CAP_KR = 80;

export const portfolioItemSchema = z.object({
  symbol: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase().replace(/\.JK$/i, ""))
    .refine((s) => /^[A-Z]{4}$/.test(s), "Kode emiten harus 4 huruf (IDX)"),
  lots: z.number().int().nonnegative().max(1_000_000_000).optional(),
  avgPrice: z.number().positive().max(1_000_000_000).optional(),
});

export const profileSchema = z.object({
  displayName: z.string().trim().max(60).optional(),
  risk: z.enum(["konservatif", "moderat", "agresif"]),
  goal: z.string().trim().max(120).optional(),
  horizonDays: z.number().int().positive().max(3650).optional(),
  items: z.array(portfolioItemSchema).min(1).max(MAX_PORTFOLIO_ITEMS),
  note: z.string().trim().max(400).optional(),
});

export type PortfolioProfile = z.infer<typeof profileSchema> & { createdAt: string };

type ProfileRow = { profile: string; updated_at: string };
type GraphRow = { status: string; credits_kr: number; error: string | null; graph: string | null; created_at: string };

export type StoredGraph = { status: "ok" | "partial" | "failed"; creditsKr: number; error: string | null; graph: PortfolioGraph | null; createdAt: string };

export function getProfile(): PortfolioProfile | null {
  const row = getDb().prepare(`SELECT profile, updated_at FROM portfolio_profile WHERE id = 1`).get() as ProfileRow | undefined;
  if (!row) return null;
  const parsed = profileSchema.safeParse(JSON.parse(row.profile));
  if (!parsed.success) return null;
  return { ...parsed.data, createdAt: row.updated_at };
}

export function saveProfile(input: z.input<typeof profileSchema>): PortfolioProfile {
  const data = profileSchema.parse(input);
  const seen = new Set<string>();
  const items = data.items.filter((i) => (seen.has(i.symbol) ? false : (seen.add(i.symbol), true)));
  if (!items.length) throw new Error("Portofolio kosong setelah validasi.");
  const profile: PortfolioProfile = { ...data, items, createdAt: new Date().toISOString() };
  getDb()
    .prepare(
      `INSERT INTO portfolio_profile (id, profile, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET profile = excluded.profile, updated_at = excluded.updated_at`,
    )
    .run(JSON.stringify(profile), profile.createdAt);
  return profile;
}

export function getLatestGraph(): StoredGraph | null {
  const row = getDb()
    .prepare(`SELECT status, credits_kr, error, graph, created_at FROM portfolio_graphs ORDER BY id DESC LIMIT 1`)
    .get() as GraphRow | undefined;
  if (!row) return null;
  return {
    status: row.status as StoredGraph["status"],
    creditsKr: row.credits_kr,
    error: row.error,
    graph: row.graph ? (JSON.parse(row.graph) as PortfolioGraph) : null,
    createdAt: row.created_at,
  };
}

export function saveGraph(status: StoredGraph["status"], creditsKr: number, error: string | null, graph: PortfolioGraph | null): void {
  getDb()
    .prepare(`INSERT INTO portfolio_graphs (status, credits_kr, error, graph, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(status, creditsKr, error, graph ? JSON.stringify(graph) : null, new Date().toISOString());
}

export function portfolioSymbols(profile: PortfolioProfile): string[] {
  return profile.items.map((i) => i.symbol);
}

export function portfolioOneLiner(profile: PortfolioProfile): string {
  return `${profile.items.map((i) => i.symbol).join(", ")} · profil ${profile.risk}${profile.horizonDays ? ` · horizon ${profile.horizonDays}h` : ""}`;
}
