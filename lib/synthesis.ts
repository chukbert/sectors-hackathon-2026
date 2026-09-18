// lib/synthesis.ts — semua panggilan LLM naratif ARUS via OpenRouter:
//   narrate()         : prosa kartu (dilarang bikin angka)
//   tutorAwam()       : tulis ulang Bagian 2 gaya tutor awam (angka & istilah tetap)
//   counterLlm()      : bantahan / sisi lain
//   followUps()       : pertanyaan lanjutan
//   summarizeMemory() : ringkas memori
// Tanpa OPENROUTER_API_KEY → semua null; pemanggil memakai versi deterministik (dipakai eval).
import type { Awam } from "./awam.js";
const URL = "https://openrouter.ai/api/v1/chat/completions";
export const MODEL = process.env.OPENROUTER_MODEL ?? "meta/muse-spark-1.2";
const EFFORT = process.env.OPENROUTER_REASONING_EFFORT ?? "xhigh";

const SYSTEM = `Kamu narator Bahasa Indonesia untuk kartu riset saham ARUS (alat riset & edukasi, BUKAN nasihat keuangan).
Aturan keras:
1. JANGAN membuat, mengubah, atau mengarang angka/probabilitas — pakai HANYA angka dari data yang diberikan.
2. JANGAN memberi anjuran beli/jual ("beli sekarang", "pasti cuan", "all in" dilarang).
3. Maksimal 3 kalimat singkat, gaya santai tapi presisi. Pertahankan verdict, probabilitas, dan sitasi apa adanya.`;

const SYSTEM_TUTOR = `Kamu tutor pasar saham untuk pemula, bagian dari ARUS. Kamu menerima penjelasan yang sudah jadi (fakta + angka tetap).
Tugasmu: menulis ulang supaya lebih ramah dan mengalir, dengan analogi sehari-hari.
Aturan keras:
1. JANGAN mengubah, menambah, atau menghilangkan angka — pakai persis angka di input.
2. JANGAN menambah fakta, ticker, atau istilah baru di luar input.
3. JANGAN menasihati membeli/menjual/menahan saham, dan jangan menyuruh belajar/daftar rekening.
4. Angka keyakinan = kekuatan bukti, BUKAN peluang untung.
5. Jaga "istilah" tiap bagian persis seperti input dan jumlah bagian tetap.
6. Keluarkan HANYA JSON valid: {"pembuka":"...","bagian":[{"istilah":"...","arti":"...","analogi":"...","kondisi":"..."}],"intisari":"...","penutup":"..."}`;

const SYSTEM_COUNTER = `Kamu penulis bantahan (devil's advocate) untuk kartu riset ARUS.
Tulis 1-2 kalimat Bahasa Indonesia: alasan kuat kenapa pembacaan data ini BISA salah atau menyesatkan pembaca.
Aturan: pakai HANYA angka/fakta di input; jangan menambah angka; jangan menasihati jual/beli/tahan; jangan mengarang kejadian; fokus ke keterbatasan data (EOD, window pendek, proxy kohort, aksi korporasi bisa mengubah volume). Keluarkan teks saja, maks 220 karakter.`;

const SYSTEM_FOLLOW = `Kamu membuat 2-3 pertanyaan lanjutan singkat yang BISA dijawab ARUS dari data Sectors.
Topik yang didukung HANYA: ticker IDX, broker/bandar, dividen/yield, ex-date/kalender/AGM, likuiditas/volume, FOMO, arus asing, insider/cluster, komoditas coal/nikel, portofolio/grup kepemilikan, IHSG/pasar, banding dua saham, risiko/drawdown, anomali harga.
JANGAN menawarkan topik lain (mis. CPO, emas, minyak, kripto, forex, obligasi, properti, IPO). Jangan menasihati. Bahasa Indonesia, maks 60 karakter per pertanyaan. Keluarkan HANYA JSON array string.`;

const SYSTEM_MEM = `Ringkas memori pengguna ARUS dalam 1-2 kalimat netral (jumlah pola, watchlist, portofolio, keputusan) tanpa nasihat dan tanpa mengarang data.
Keluarkan teks saja, maks 180 karakter.`;

function headers() {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
    "X-Title": "ARUS v6",
  };
}

async function askLLM(system: string, user: string, timeoutMs = 25_000): Promise<string | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;
  try {
    const res = await fetch(URL, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: headers(),
      body: JSON.stringify({
        model: MODEL,
        reasoning: { effort: EFFORT },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
const unquote = (t: string) => t.replace(/^["“']|["”']$/g, "").trim();

export async function narrate(intent: string, body: string): Promise<{ prose: string; via: string }> {
  if (!process.env.OPENROUTER_API_KEY) return { prose: body, via: "deterministik ↩" };
  const res = await fetch(URL, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: headers(),
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: EFFORT },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Intent: ${intent}\nData kartu (jangan ubah angka): ${body}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const prose = data.choices?.[0]?.message?.content?.trim() || body;
  return { prose, via: `openrouter:${MODEL}` };
}

export interface TutorOut { pembuka: string; bagian: { arti: string; analogi: string; kondisi: string }[]; intisari: string; penutup: string }

/** Tulis ulang Bagian 2 gaya tutor; null bila gagal/struktur rusak (pemanggil pakai versi deterministik). */
export async function tutorAwam(a: Awam): Promise<TutorOut | null> {
  const payload = {
    pembuka: a.pembuka,
    bagian: a.bagian.map((b) => ({ istilah: b.istilah, arti: b.arti, analogi: b.analogi, kondisi: b.kondisi })),
    intisari: a.intisari,
    penutup: a.penutup,
  };
  const raw = await askLLM(SYSTEM_TUTOR, JSON.stringify(payload));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw.replace(/^```json?\s*|\s*```$/g, "").trim()) as { pembuka?: unknown; bagian?: unknown; intisari?: unknown; penutup?: unknown };
    const bagian = Array.isArray(parsed.bagian)
      ? parsed.bagian.map((x) => { const o = x as Record<string, unknown>; return { arti: str(o.arti), analogi: str(o.analogi), kondisi: str(o.kondisi) }; })
      : [];
    const out: TutorOut = { pembuka: str(parsed.pembuka), bagian, intisari: str(parsed.intisari), penutup: str(parsed.penutup) };
    const all = [out.pembuka, ...out.bagian.flatMap((b) => [b.arti, b.analogi, b.kondisi]), out.intisari, out.penutup];
    if (out.bagian.length !== a.bagian.length || all.some((s) => !s) || all.some((s) => s.length > 700)) return null;
    return out;
  } catch {
    return null;
  }
}

/** Bantahan LLM; null bila kosong/kelewat panjang (pemanggil pakai versi deterministik). */
export async function counterLlm(i: { verdict: string; probability: number; bukti: string[] }): Promise<string | null> {
  const raw = await askLLM(SYSTEM_COUNTER, `Verdict: ${i.verdict} (${i.probability})\nBukti:\n- ${i.bukti.slice(0, 6).join("\n- ")}`);
  if (!raw) return null;
  const t = unquote(raw);
  return t.length >= 15 && t.length <= 320 ? t : null;
}

/** 2-3 pertanyaan lanjutan; null bila gagal (pemanggil pakai fallback deterministik). */
export async function followUps(i: { subjek?: string; verdict: string; bukti: string[] }): Promise<string[] | null> {
  const raw = await askLLM(SYSTEM_FOLLOW, JSON.stringify({ subjek: i.subjek ?? "-", verdict: i.verdict, bukti: i.bukti.slice(0, 4) }));
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw.replace(/^```json?\s*|\s*```$/g, "").trim()) as unknown;
    if (!Array.isArray(arr)) return null;
    const qs = [...new Set(arr.map(str).filter((x) => x.length >= 5 && x.length <= 70))].slice(0, 3);
    return qs.length >= 2 ? qs : null;
  } catch {
    return null;
  }
}

/** Ringkasan memori 1-2 kalimat; null bila gagal (pemanggil pakai versi deterministik). */
export async function summarizeMemory(mem: unknown): Promise<string | null> {
  const raw = await askLLM(SYSTEM_MEM, JSON.stringify(mem).slice(0, 1200), 12_000);
  if (!raw) return null;
  const t = unquote(raw);
  return t.length >= 10 && t.length <= 220 ? t : null;
}
