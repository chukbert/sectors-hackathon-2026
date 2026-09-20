import { runTurn } from "@/lib/agent/pipeline";
import { createSession, getSession, setSessionLangMode } from "@/lib/db/session-store";
import { config } from "@/lib/config";
import { getMode } from "@/lib/db/api-hit-store";
import { langMode } from "@/lib/util/format";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const missing: string[] = [];
  if (!config.openrouter.apiKey) missing.push("OPENROUTER_API_KEY");
  if (getMode() !== "replay" && !config.sectors.apiKey) missing.push("SECTORS_API_KEY (atau ubah mode ke replay)");
  if (missing.length) {
    return Response.json({ error: `Kunci API belum diisi: ${missing.join(", ")}` }, { status: 500 });
  }
  const body = (await request.json()) as { sessionId?: string; question?: string; langMode?: string; title?: string };
  const question = (body.question ?? "").trim();
  if (!question) return Response.json({ error: "question wajib" }, { status: 400 });

  let session = body.sessionId ? getSession(body.sessionId) : null;
  if (!session) {
    session = createSession(body.title ?? question.slice(0, 60), langMode(body.langMode));
  } else if (body.langMode) {
    setSessionLangMode(session.id, langMode(body.langMode));
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      send({ type: "session", sessionId: session.id, title: session.title });
      try {
        const result = await runTurn({
          sessionId: session.id,
          question,
          langMode: langMode(body.langMode ?? session.langMode),
          emit: (event) => send({ type: "event", ...event }),
        });
        send({ type: "doc", doc: result.doc });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}