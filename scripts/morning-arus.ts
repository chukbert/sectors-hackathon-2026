// Cron 08:30 WIB:   30 8 * * 1-5  cd <repo> && npm run morning
// Nol aksi user (bukti "autonomous execution" track requirement). Output: .cache/morning-<date>.json
// yang dibaca intent chat "pagi".
import { morningBrief, briefPath } from "../lib/morning.ts";

const b = await morningBrief({ live: true });
console.log(`Morning Arus ${b.date} · ${b.scanned} kandidat · ${b.entries.length} anomali → ${briefPath(b.date)}`);
for (const e of b.entries) console.log(`  ${e.ticker.padEnd(5)} ${String(e.delta).padStart(4)}%  [${e.sev}] ${e.one}`);
