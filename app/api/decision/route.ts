import { NextRequest } from "next/server";
import { logDecision } from "@/lib/memory.ts";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const { ticker = "", action = "", note = "", price = 0, chg_pct = 0 } = await req.json().catch(() => ({}));
  if (!/^[A-Z]{4}$/.test(String(ticker))) return Response.json({ ok: false }, { status: 400 });
  logDecision(process.env.ARUS_USER || "default", { ticker: String(ticker), action: String(action).slice(0, 120), note: String(note).slice(0, 200), price: Number(price) || 0, chg_pct: Number(chg_pct) || 0 });
  return Response.json({ ok: true }); // ARUS tidak mengeksekusi apa pun — ini hanya catatan memori perilaku
}
