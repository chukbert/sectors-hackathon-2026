import { extractSlots } from "@/lib/agent/slots";
import { composeLevel, detectIntents } from "@/lib/agent/classifier";
import { shortId } from "@/lib/util/ids";

// 5 tier query untuk intent "harga" (L1 fakta → L5 perbandingan)
const CASES: Array<{ tier: string; question: string; expectOnly: string[] }> = [
  { tier: "L1 Fakta tunggal", question: "Harga BRMS sekarang berapa?", expectOnly: ["harga"] },
  { tier: "L2 Fakta + makna", question: "Harga BBRI turun 3% hari ini, kapitalisasi pasarnya jadi berapa?", expectOnly: ["harga"] },
  { tier: "L3 Ringkasan terarah", question: "Ringkas pergerakan harga dan volume ANTM minggu ini.", expectOnly: ["harga"] },
  { tier: "L4 Tren", question: "Gimana tren harga ASII 3 bulan terakhir?", expectOnly: ["harga"] },
  { tier: "L5 Perbandingan", question: "Bandingkan harga dan market cap BBCA dengan BBRI dalam sebulan terakhir.", expectOnly: ["harga"] },
];

async function main(): Promise<void> {
  for (const c of CASES) {
    const turnId = shortId("probe");
    const slots = await extractSlots(c.question);
    const v = await detectIntents(c.question, "", { sessionId: "probe", turnId });
    const level = composeLevel(v.intents, v.depth, v.rumor, v.wantsRecommendation);
    const ids = v.intents.map((i) => i.id);
    const pass = v.intents.every((i) => c.expectOnly.includes(i.id)) && ids.includes("harga");
    console.log(
      `${pass ? "✓" : "✗"} ${c.tier} · "${c.question}"\n   symbols=${slots.symbols.join(",") || "-"} · intents=${v.intents.map((i) => `${i.id}(${i.probability.toFixed(2)})`).join(" + ")} · depth=${v.depth ?? "-"} → level L${level} · failed=${v.failed}\n`,
    );
  }
}

void main();
