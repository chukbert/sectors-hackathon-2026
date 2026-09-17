// POST /api/chat { message, history: [{role,text}] } → NDJSON ChatEvent stream.
// Streaming dipakai supaya juri melihat kartu TERBENTUK (trace per agen), bukan hasil jadi.
import { NextRequest } from "next/server";
import { planner, runTickerAnalysis, planFallback } from "@/lib/agents.ts";
import { loadOwnerships, autopsiKartu } from "@/lib/graph.ts";
import { morningBrief } from "@/lib/morning.ts";
import { getPortfolio, setPortfolio, logDecision } from "@/lib/memory.ts";
import { llmOk } from "@/lib/llm.ts";
import { SectorsUnavailable } from "@/lib/sectors.ts";
import type { ChatEvent } from "@/lib/types.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER = process.env.ARUS_USER || "default";
const PASTE_RE = /\b([A-Z]{4})\b/g;

async function handle(req: NextRequest): Promise<AsyncGenerator<ChatEvent>> {
  const { message = "", history = [] } = (await req.json().catch(() => ({}))) as { message?: string; history?: { role: string; text: string }[] };
  const text = message.trim();
  const seen = [...text.matchAll(PASTE_RE)].map((m) => m[1]); // teks ASLI: hanya token Kapital-persis = ticker

  // simpan ticker yang diketik user sbg portofolio kalau bentuknya daftar panjang (autopsi paste)
  if (/autopsi|bedah|portofolio/i.test(text) && seen.length >= 2) setPortfolio(USER, seen.slice(0, 10).map((t) => ({ ticker: t, pct: 100 / Math.min(seen.length, 10) })));

  async function* gen(): AsyncGenerator<ChatEvent> {
    try {
      if (!text) { yield { type: "teks", text: "Tanya apa pun soal ticker IDX — contoh: “kenapa ANTM naik? boleh ikut?” atau “autopsi portofolio saya”." }; return; }
      const plan = await planner(text, [...new Set([...getPortfolio(USER).map((p) => p.ticker), ...seen])]);
      if (plan.intent === "autopsi-portofolio") {
        const port = getPortfolio(USER);
        if (port.length < 2) { yield { type: "teks", text: "Paste dulu daftarnya (≤10 ticker, mis. “BBCA INDF ICBP BUMI BRMS TLKM SMGR”) — autopsi jalan dari portofolio yang kamu simpan, bukan yang aku karang." }; return; }
        yield { type: "trace", line: `◇ planner · intent autopsi → Graph-Agent · ${port.length} ticker × ownership (cache 1×/minggu)` };
        const own = await loadOwnerships(port.map((p) => p.ticker));
        yield { type: "trace", line: `◈ bantah-agent ✓ kasus lawan disusun`, ok: true };
        yield { type: "autopsi", autopsi: autopsiKartu(port, own) };
        return;
      }
      if (plan.intent === "pagi") {
        yield { type: "trace", line: "◇ planner · intent pagi → baca brief cron 08:30 (atau scan sekarang)" };
        yield { type: "pagi", brief: await morningBrief() };
        return;
      }
      if (plan.intent === "obrolan" && !/[A-Z]{4}/.test(text)) {
        if (llmOk()) {
          const { completeText } = await import("@/lib/llm.ts");
          const ctx = history.slice(-4).map((h) => `${h.role}: ${h.text}`).join("\n");
          try {
            yield { type: "teks", text: await completeText(
              "Kamu ARUS, asisten riset investor ritel IDX berbasis data Sectors. Bicara Bahasa Indonesia santai, jujur, tidak pernah menyuruh beli/jual/hold. Kalau ditanya sesuatu yang butuh data, arahkan ke pertanyaan ticker.",
              `${ctx}\nuser: ${text}`) };
            return;
          } catch { yield { type: "teks", text: "LLM sedang sibuk (503) — jalur deterministik tetap hidup: coba “kenapa BRMS naik?” atau “brief pagi”." }; return; }
        }
        {
          yield { type: "teks", text: "ARUS butuh ticker agar datanya bicara. Coba: “kenapa BRMS naik? boleh ikut?” · “autopsi portofolio saya” · “brief pagi”. (Mode deterministik: GEMINI_API_KEY belum diisi — semua kartu tetap terhitung dari data, tanpa LLM.)" };
        }
        return;
      }
      const kartu = await runTickerAnalysis(plan, (e) => { queue.push(e); }, USER, getPortfolio(USER));
      // catatan keputusan user yang mengandung niat beli → memori (F6)
      if (/(nambah|beli|average|dca|masuk|gas)/i.test(text) && plan.tickers[0])
        logDecision(USER, { ticker: plan.tickers[0], action: text.slice(0, 80), note: "niat tercatat dari chat", price: kartu.price, chg_pct: kartu.change_pct });
      void kartu;
    } catch (e) {
      if (e instanceof SectorsUnavailable) yield { type: "error", text: `Sectors data unavailable — ${e.message} ARUS sengaja tidak punya sumber cadangan: cabut Sectors = mati. Isi SECTORS_API_KEY (atau jalankan dengan ARUS_SEED=1 untuk mode seed-cache yang dinyatakan jujur).` };
      else yield { type: "error", text: `galat pipeline: ${(e as Error).message}` };
    }
  }
  // bridge: runTickerAnalysis memakai callback emit → kumpulkan lalu drain dalam generator
  const queue: ChatEvent[] = [];
  const g = gen();
  // karena runTickerAnalysis menyelesaikan sebelum generator yield kartu, drain queue tiap tick:
  async function* bridged(): AsyncGenerator<ChatEvent> {
    for (;;) {
      const { value, done: d } = await g.next();
      while (queue.length) yield queue.shift()!;
      if (d) return;
      yield value;
    }
  }
  return bridged();
}

export async function POST(req: NextRequest) {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      try { for await (const e of await handle(req)) c.enqueue(enc.encode(JSON.stringify(e) + "\n")); }
      catch (e) { c.enqueue(enc.encode(JSON.stringify({ type: "error", text: (e as Error).message }) + "\n")); }
      finally { c.close() }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
