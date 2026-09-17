// Diagnostic: model mana yang HIDUP untuk GEMINI_API_KEY kamu sekarang.
// node --experimental-strip-types scripts/probe-models.ts
import { readFileSync, existsSync } from "node:fs";
if (existsSync(".env")) for (const ln of readFileSync(".env", "utf8").split("\n")) {
  const m = ln.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error("GEMINI_API_KEY kosong"); process.exit(1); }
const H = { "x-goog-api-key": key };
const B = "https://generativelanguage.googleapis.com/v1beta";

const list = await fetch(`${B}/models?pageSize=200`, { headers: H }).then((r) => r.json()) as { models?: { name: string }[]; error?: unknown };
if (list.error) { console.log("LIST GAGAL:", JSON.stringify(list.error).slice(0, 300)); process.exit(1); }
const flash = (list.models ?? []).filter((m) => /flash|lite|2\.5|3/i.test(m.name)).map((m) => m.name.replace("models/", ""));
console.log(`total ${list.models?.length} model terlihat key ini; kandidat flash-like (${flash.length}):\n`, flash.join(", "), "\n");

for (const id of [...new Set([...flash, process.env.GEMINI_MODEL || "gemini-3.8-flash"])]) {
  const t0 = Date.now();
  const r = await fetch(`${B}/models/${id}:generateContent`, {
    method: "POST", headers: { ...H, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: "sapa 3 kata" }] }] }),
  });
  const j = await r.json().catch(() => ({})) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { status?: string; message?: string } };
  const ok = r.ok && j.candidates?.length;
  console.log(`${ok ? "OK  " : r.status} ${id.padEnd(34)} ${String(Date.now() - t0).padStart(5)}ms  ${ok ? JSON.stringify(j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").slice(0, 30) : (j.error?.status ?? r.status) + " " + String(j.error?.message ?? "").slice(0, 90)}`);
}
