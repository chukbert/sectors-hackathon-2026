// lib/share.ts — snapshot immutable → /k/{id} (tanpa data pribadi).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const DIR = path.join(process.cwd(), ".cache", "share");
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
export function saveCard(card: unknown): string {
  const id = crypto.randomBytes(6).toString("hex");
  fs.writeFileSync(path.join(DIR, id + ".json"), JSON.stringify({ id, card, at: new Date().toISOString() }));
  return id;
}
export function loadCard(id: string): unknown | null {
  const f = path.join(DIR, id + ".json");
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8"));
}
