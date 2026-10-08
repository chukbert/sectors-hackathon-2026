import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CORE_URL = process.env.CORE_URL ?? "http://127.0.0.1:8788";

// Proxy GET ke Core supaya browser cukup bicara ke satu origin. Core hanya membuka /v1/health dan /v1/struk/*.
export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  const path = (ctx.params.path ?? []).join("/");
  const res = await fetch(`${CORE_URL}/${path}${req.nextUrl.search}`, { cache: "no-store" });
  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
      "cache-control": "no-cache, no-transform",
    },
  });
}
