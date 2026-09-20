import { getSession, listTurns, setSessionLangMode } from "@/lib/db/session-store";
import { langMode } from "@/lib/util/format";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return Response.json({ error: "sesi tidak ditemukan" }, { status: 404 });
  return Response.json({ session, turns: listTurns(id) });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return Response.json({ error: "sesi tidak ditemukan" }, { status: 404 });
  const body = (await request.json()) as { langMode?: string };
  if (body.langMode) setSessionLangMode(id, langMode(body.langMode));
  return Response.json({ session: getSession(id) });
}