import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300;

const CORE_URL = process.env.CORE_URL ?? "http://127.0.0.1:8788";
// Demo publik: hanya endpoint Paham Emiten yang dibuka (IDXMACA lama memakai kredit per pertanyaan).
const PUBLIC_DEMO = process.env.PUBLIC_DEMO === "1";
const PUBLIC_PREFIXES = ["v1/struk/", "v1/health"];

async function proxy(req: NextRequest, ctx: { params: { path: string[] } }) {
  const path = (ctx.params.path ?? []).join("/");
  if (PUBLIC_DEMO && !PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    return Response.json({ detail: "Tidak tersedia di demo publik." }, { status: 404 });
  }
  const target = `${CORE_URL}/${path}${req.nextUrl.search}`;
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await req.text();
  // IP pengunjung diteruskan ke Core (log), bukan IP proxy.
  const fwd = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? req.ip ?? "";
  const init = {
    method: req.method,
    headers: {
      "content-type": req.headers.get("content-type") ?? "application/json",
      ...(fwd ? { "x-forwarded-for": fwd } : {}),
    },
    body,
    cache: "no-store",
    duplex: "half",
  } as RequestInit & { duplex: "half" };
  const res = await fetch(target, init);
  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

export const GET = proxy;
export const POST = proxy;
