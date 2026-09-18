// lib/chats.ts — riwayat chat ala ChatGPT, persist di .cache/chats/{id}.json (0 kredit).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DIR = path.join(process.cwd(), ".cache", "chats");
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

export interface ChatMsg {
  role: "user" | "assistant";
  q?: string;
  kartu?: unknown;
  at: string;
}
export interface Chat {
  id: string;
  title: string;
  messages: ChatMsg[];
  createdAt: string;
  updatedAt: string;
}

const fpath = (id: string) => path.join(DIR, id.replace(/[^a-z0-9]/gi, "").slice(0, 32) + ".json");

export function getChat(id: string): Chat | null {
  try {
    return JSON.parse(fs.readFileSync(fpath(id), "utf8")) as Chat;
  } catch {
    return null;
  }
}

export function listChats(): { id: string; title: string; updatedAt: string; n: number }[] {
  const out: { id: string; title: string; updatedAt: string; n: number }[] = [];
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const c = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as Chat;
      out.push({ id: c.id, title: c.title, updatedAt: c.updatedAt, n: c.messages.length });
    } catch {
      /* abaikan file rusak */
    }
  }
  return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 100);
}

export function appendMsg(id: string, msg: ChatMsg, titleHint?: string): Chat {
  let c = getChat(id);
  if (!c) {
    const now = new Date().toISOString();
    c = { id, title: (titleHint ?? "Chat baru").slice(0, 48), messages: [], createdAt: now, updatedAt: now };
  }
  c.messages.push(msg);
  if (c.messages.length <= 2 && titleHint) c.title = titleHint.slice(0, 48);
  c.updatedAt = new Date().toISOString();
  fs.writeFileSync(fpath(id), JSON.stringify(c));
  return c;
}

export function newChatId(): string {
  return crypto.randomBytes(8).toString("hex");
}

export function deleteChat(id: string): boolean {
  try {
    fs.unlinkSync(fpath(id));
    return true;
  } catch {
    return false;
  }
}
