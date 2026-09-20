import { createSession, listSessions, setSessionTitle } from "@/lib/db/session-store";
import { langMode } from "@/lib/util/format";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ sessions: listSessions() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { title?: string; langMode?: string };
  const session = createSession(body.title ?? "Investigasi baru", langMode(body.langMode));
  return Response.json({ session });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: string; title?: string };
  if (!body.id || !body.title) return Response.json({ error: "id & title wajib" }, { status: 400 });
  setSessionTitle(body.id, body.title);
  return Response.json({ ok: true });
}