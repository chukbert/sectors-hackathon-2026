// lib/envfix.ts — muat .env, lalu pastikan model LLM dari .env MENANG atas env shell yang basi.
// Kasus nyata (19 Sep): shell membawa OPENROUTER_MODEL=google/gemini-3.8-flash dari proyek lain; dotenv tidak menimpa
// variabel yang sudah ada → kartu ternarasi model yang salah. Wajib diimpor SEBELUM modul yang membaca env.
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const FILE_WINS = ["OPENROUTER_MODEL", "OPENROUTER_REASONING_EFFORT"];
try {
  const fileEnv = dotenv.parse(fs.readFileSync(path.join(process.cwd(), ".env"), "utf8"));
  for (const k of FILE_WINS) if (fileEnv[k]) process.env[k] = fileEnv[k]!;
} catch {
  /* tanpa .env → env shell dipakai apa adanya (mode offline/eval) */
}