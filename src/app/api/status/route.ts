import { getMode, recentHits, setMode, spentInSession, spentToday } from "@/lib/db/api-hit-store";
import { factCount } from "@/lib/db/fact-memory";
import { getDb } from "@/lib/db";
import type { RunMode } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId") ?? undefined;
  const cacheRow = getDb().prepare(`SELECT COUNT(*) AS n, MAX(fetched_at) AS latest FROM cache_entries`).get() as { n: number; latest: string | null };
  return Response.json({
    mode: getMode(),
    spentTodayKr: spentToday(),
    sessionSpentKr: sessionId ? spentInSession(sessionId) : 0,
    facts: factCount(),
    cacheEntries: cacheRow.n,
    cacheLatest: cacheRow.latest,
    hits: sessionId ? recentHits(sessionId, 60) : [],
  });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { mode?: RunMode };
  if (!body.mode || !["replay", "hybrid", "live"].includes(body.mode)) {
    return Response.json({ error: "mode harus replay|hybrid|live" }, { status: 400 });
  }
  setMode(body.mode);
  return Response.json({ mode: getMode() });
}