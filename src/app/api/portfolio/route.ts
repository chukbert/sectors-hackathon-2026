import { getProfile, getLatestGraph, profileSchema, saveProfile, INVESTIGATION_CAP_KR } from "@/lib/db/portfolio-store";
import { investigatePortfolio } from "@/lib/portfolio/investigate";
import { getMode } from "@/lib/db/api-hit-store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return Response.json({ profile: getProfile(), graph: getLatestGraph(), mode: getMode(), capKr: INVESTIGATION_CAP_KR });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: string; profile?: unknown };
  const profile = getProfile();
  if (body.action === "refresh") {
    if (!profile) return Response.json({ error: "Belum ada profil portofolio." }, { status: 400 });
    try {
      const outcome = await investigatePortfolio(profile);
      return Response.json({ profile, graph: outcome.graph, status: outcome.status, error: outcome.error });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
    }
  }
  const parsed = profileSchema.safeParse(body.profile);
  if (!parsed.success) {
    return Response.json({ error: "Data onboarding tidak valid.", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  }
  let saved;
  try {
    saved = saveProfile(parsed.data);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
  try {
    const outcome = await investigatePortfolio(saved);
    return Response.json({ profile: saved, graph: outcome.graph, status: outcome.status, error: outcome.error });
  } catch (err) {
    return Response.json({ profile: saved, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
