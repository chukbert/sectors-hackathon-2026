// lib/chain.ts — graph reasoning v7 ("kalau coal jatuh, siapa di grup ADRO yang kena?").
// Dekomposisi hop dari LLM (compiler, tervalidasi) → telusur edge deterministik di kode:
//   ownership · group · affiliate (data §ownership) — contractor · buyer · segment (label gap bila data belum diambil).
// Aturan keras: setiap edge yang DIKLAIM wajib bersitasi; edge tanpa data = dibuang & dilabeli, bukan fakta.
// Kausalitas selalu KONDISIONAL + bantahan per hop. Semua label grup = "kemungkinan relasi".
import { sameName } from "./graph.js";

export type ChainEdge = "ownership" | "affiliate" | "contractor" | "buyer" | "segment" | "group";
export interface ChainHop { from: string; edge: ChainEdge; to: string }

export interface ChainOwnership {
  symbol: string;
  group?: string;
  holders: { name: string; pct: number }[];
  cited: string;
  seed?: boolean;
}
export interface ClaimEdge {
  from: string;
  to: string;
  edge: ChainEdge;
  verified: boolean;
  label: string;
  cited?: string;
  reason?: string;
}
export interface NodeClaim { node: string; text: string; cited?: string; verified: boolean }

export interface ChainInput {
  focus: string[];
  requested: ChainHop[];
  ownerships: ChainOwnership[];
  knownGroups: Record<string, string[]>;
  commodity?: { word: string; pct: number; cited: string; seed: boolean };
  maxRelatives?: number;
}
export interface ChainResult {
  nodes: string[];
  edges: ClaimEdge[];
  nodeClaims: NodeClaim[];
  conditional: string[];
  counters: string[];
  dropped: string[];
  citations: string[];
  seed: boolean;
}

const controlHolders = (o: ChainOwnership) => o.holders.filter((h) => h.pct >= 5).slice(0, 4);

export function buildChain(input: ChainInput): ChainResult {
  const edges: ClaimEdge[] = [];
  const nodeClaims: NodeClaim[] = [];
  const conditional: string[] = [];
  const counters: string[] = [];
  const dropped: string[] = [];
  const citations = new Set<string>();
  const maxRel = input.maxRelatives ?? 3;
  let seed = input.commodity?.seed ?? false;

  for (const o of input.ownerships) {
    seed = seed || !!o.seed;
    citations.add(o.cited);
    const holdersTxt = controlHolders(o).map((h) => `${h.name} ${h.pct}%`).join(" · ") || "-";
    nodeClaims.push({
      node: o.symbol,
      text: `${o.symbol} pemegang saham utama: ${holdersTxt}${o.group ? ` · label grup "${o.group}"` : " · tidak ada label grup di laporan"}`,
      cited: o.cited,
      verified: true,
    });
  }

  const byFocus = new Map(input.ownerships.map((o) => [o.symbol.toUpperCase(), o]));
  const relatives: { from: string; to: string; group: string; cited: string }[] = [];
  const relSeen = new Set<string>();

  for (const o of input.ownerships) {
    if (!o.group) continue;
    const members = input.knownGroups[o.group] ?? [];
    for (const member of members) {
      if (member === o.symbol.toUpperCase() || relSeen.has(member)) continue;
      relSeen.add(member);
      relatives.push({ from: o.symbol, to: member, group: o.group, cited: `${o.cited} + known-list grup` });
    }
    // anggota grup yang ikut disebut di pertanyaan (di luar ownership pertama) tetap dihitung
    for (const f of input.focus) {
      const fo = byFocus.get(f.toUpperCase());
      if (fo && fo.symbol !== o.symbol && fo.group && fo.group === o.group && !relSeen.has(fo.symbol)) {
        relSeen.add(fo.symbol);
        relatives.push({ from: o.symbol, to: fo.symbol, group: o.group, cited: `${o.cited} + ${fo.cited}` });
      }
    }
  }
  const rels = relatives.slice(0, maxRel);

  for (const r of rels) {
    edges.push({
      from: r.from, to: r.to, edge: "group", verified: true,
      label: `satu grup "${r.group}" (kemungkinan relasi: label laporan + known-list)`,
      cited: r.cited,
    });
    citations.add("known-list grup");
  }

  // afiliasi: dua emiten berbagi pemegang saham ≥5% (data, bukan asumsi)
  for (let i = 0; i < input.ownerships.length; i++) {
    for (let j = i + 1; j < input.ownerships.length; j++) {
      const a = input.ownerships[i]!, b = input.ownerships[j]!;
      const shared = a.holders.filter((h) => h.pct >= 5).find((h) => b.holders.some((x) => x.pct >= 5 && sameName(h.name, x.name)));
      if (!shared) continue;
      const key = [a.symbol, b.symbol].sort().join("-");
      if (relSeen.has(key)) continue;
      relSeen.add(key);
      edges.push({
        from: a.symbol, to: b.symbol, edge: "affiliate", verified: true,
        label: `berbagi pemegang saham "${shared.name}" ≥5% (afiliasi, kemungkinan relasi)`,
        cited: `${a.cited} + ${b.cited}`,
      });
    }
  }

  const groupRel = (from: string): string[] => edges.filter((e) => e.verified && e.from === from.toUpperCase() && (e.edge === "group" || e.edge === "affiliate")).map((e) => e.to);

  // Telusuri permintaan hop dari LLM: verifikasi ke edge data; sisanya dibuang dengan alasan jujur.
  for (const h of input.requested) {
    const from = h.from.toUpperCase();
    const rel = groupRel(from);
    if (h.edge === "group" || h.edge === "ownership" || h.edge === "affiliate") {
      if (rel.length) {
        const label = `tertelusur: ${from} berelasi dengan ${rel.join(", ")} — ${h.to ? `mencakup "${h.to}"` : "anggota grup teridentifikasi"}`;
        if (!edges.some((e) => e.from === from && e.to === h.to && e.verified)) {
          edges.push({ from, to: h.to || rel[0]!, edge: h.edge, verified: true, label, cited: byFocus.get(from)?.cited ?? "company/report §ownership" });
        }
      } else {
        dropped.push(`${from} -${h.edge}→ ${h.to || "?"}: tidak ada label grup/relasi terverifikasi di laporan — edge tidak diklaim`);
      }
      continue;
    }
    const gap: Record<string, string> = {
      contractor: `edge contractor belum diimplementasikan di ARUS (mining/contractors + licenses tersedia di Sectors; paket P1)`,
      buyer: `edge buyer per emiten belum ditelusuri (mining/sales-destination tersedia tapi level negara, bukan per perusahaan)`,
      segment: `edge segment belum dipakai di jalur rantai ini (company/get-segments tersedia — dijalankan lewat intent fundamental segmen)`,
    };
    dropped.push(`${h.from} -${h.edge}→ ${h.to}: ${gap[h.edge] ?? "edge tidak dikenal"} — dibuang, bukan diklaim`);
  }

  const nodes = [...new Set([...input.focus.map((f) => f.toUpperCase()), ...edges.flatMap((e) => [e.from, e.to])])];
  const cw = input.commodity;
  for (const e of edges.filter((x) => x.verified && x.edge === "group")) {
    if (cw) {
      conditional.push(`Jika ${cw.word} ${cw.pct < 0 ? "tertekan" : "menguat"} (${cw.pct >= 0 ? "+" : ""}${cw.pct}% 12 bulan — ${cw.cited}), ${e.to} (satu grup dengan ${e.from}) berpotensi ikut terpengaruh lewat eksposur grup — kondisional, bukan vonis arah harga.`);
    } else {
      conditional.push(`${e.from} dan ${e.to} satu grup; arah dampaknya bergantung eksposur lini usaha masing-masing — kondisional, bukan vonis.`);
    }
    counters.push(`Bantahan untuk ${e.from}→${e.to}: bisa jadi tidak menular — lini usaha/buyer bisa berbeda; cek segmen & kontrak masing-masing sebelum menyimpulkan (kemungkinan relasi, bukan kendali pasti).`);
  }
  if (cw) counters.push(`Harga komoditas bersifat bulanan/EOD — jeda & revisi data bisa menyembunyikan hubungan jangka pendek.`);
  if (!edges.length) counters.push(`Tidak ada edge terverifikasi di kartu ini — ARUS memilih tidak menyimpulkan relasi daripada mengarang.`);

  return { nodes, edges, nodeClaims, conditional, counters, dropped, citations: [...citations], seed };
}