import { extractSlots } from "@/lib/agent/slots";
import { composeLevel, detectIntents } from "@/lib/agent/classifier";
import { shortId } from "@/lib/util/ids";

const Q =
  "Cari saham yang CEO-nya baru saja resign karena kasus korupsi, tapi harga sahamnya malah naik 3 hari berturut-turut karena ada rumor akuisisi tambang nikel. Siapa mereka dan gimana valuasi EV/EBITDA-nya?";

async function main(): Promise<void> {
  const turnId = shortId("probe");
  const slots = await extractSlots(Q);
  const v = await detectIntents(Q, "", { sessionId: "probe", turnId });
  const level = composeLevel(v.intents, v.depth, v.rumor, v.wantsRecommendation);
  const ids = v.intents.map((i) => i.id);
  const checks: Array<[string, boolean]> = [
    ["symbols kosong (discovery)", slots.symbols.length === 0],
    ["intent komoditas ikut", ids.includes("komoditas")],
    ["intent harga ikut", ids.includes("harga")],
    ["flag rumor aktif", v.rumor === true],
    ["level >= 7", level >= 7],
  ];
  console.log(`Q: "${Q.slice(0, 80)}..."\nintents: ${v.intents.map((i) => `${i.id}(${i.probability.toFixed(2)})`).join(" + ")} · depth=${v.depth ?? "-"} → L${level}`);
  let allOk = true;
  for (const [label, ok] of checks) {
    if (!ok) allOk = false;
    console.log(`${ok ? "✓" : "✗"} ${label}`);
  }
  if (!allOk) process.exitCode = 1;
}

void main();
