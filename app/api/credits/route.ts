import { credits } from "@/lib/sectors.ts";
export const runtime = "nodejs";
export async function GET() { return Response.json({ used: credits.used }); } // monitor pemborosan saat shooting video
