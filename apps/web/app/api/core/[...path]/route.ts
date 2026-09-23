import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300;

const CORE_URL = process.env.CORE_URL ?? "http://127.0.0.1:8788";

async function proxy(req: NextRequest, ctx: { params: { path: string[] } }) {
  const path = (ctx.params.path ?? []).join("/");
  const target = `${CORE_URL}/${path}${req.nextUrl.search}`;
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await req.text();
  const init = {
    method: req.method,
    headers: { "content-type": req.headers.get("content-type") ?? "application/json" },
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