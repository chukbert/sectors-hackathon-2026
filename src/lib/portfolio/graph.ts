export type HolderRef = { name: string; pct: number; factId?: string };

export type GraphRecord = {
  symbol: string;
  companyName: string;
  subsector?: string;
  marketCap?: number;
  inPortfolio: boolean;
  holders: HolderRef[];
  factIds: string[];
};

export type GraphNode = {
  id: string;
  kind: "holding" | "listed" | "entity";
  name: string;
  symbol?: string;
  subsector?: string;
  marketCap?: number;
  weightPct?: number;
  clusterId?: string;
  factIds: string[];
};

export type GraphEdge = {
  from: string;
  to: string;
  pct: number;
  factId?: string;
  crossPortfolio: boolean;
};

export type GraphCluster = { id: string; label: string; nodeIds: string[] };

export type PortfolioGraph = {
  createdAt: string;
  creditsKr: number;
  calls: Array<{ endpoint: string; args: Record<string, unknown>; kr: number; source: string }>;
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  issues: string[];
};

const NOISE_HOLDER = /^(public|masyarakat|treasury|others|lain-lain)/i;

export function normCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bpt\.?\b/g, " ")
    .replace(/\btbk\.?\b/g, " ")
    .replace(/\(persero\)/g, " ")
    .replace(/&/g, " dan ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function distinctiveToken(name: string): string {
  const stop = new Set(["dan", "dengan", "utama", "resources", "indonesia", "persero", "investama", "management", "limited", "holding"]);
  const words = normCompanyName(name).split(" ").filter((w) => w.length >= 5 && !stop.has(w));
  const fallback = normCompanyName(name).split(" ").sort((a, b) => b.length - a.length)[0] ?? "";
  return words[0] ?? fallback;
}

function unionFind(parent: Map<string, string>): { find: (x: string) => string; union: (a: string, b: string) => void } {
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    let cur = x;
    while (parent.get(cur) !== r) {
      const next = parent.get(cur) as string;
      parent.set(cur, r);
      cur = next;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  return { find, union };
}

export function buildGraphResult(records: GraphRecord[], weights: Record<string, number>): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
} {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const seenEdge = new Set<string>();
  const byCompany = new Map<string, string>();
  for (const r of records) byCompany.set(normCompanyName(r.companyName), r.symbol);

  const ensureRecordNode = (rec: GraphRecord): string => {
    const existing = nodes.get(rec.symbol);
    if (existing) return existing.id;
    nodes.set(rec.symbol, {
      id: rec.symbol,
      kind: rec.inPortfolio ? "holding" : "listed",
      name: rec.companyName,
      symbol: rec.symbol,
      subsector: rec.subsector,
      marketCap: rec.marketCap,
      weightPct: weights[rec.symbol],
      factIds: [...rec.factIds],
    });
    return rec.symbol;
  };
  for (const r of records) ensureRecordNode(r);

  const ensureEntityNode = (name: string): string => {
    const id = `ent:${normCompanyName(name)}`;
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        kind: "entity",
        name: name.replace(/\bPT\.?\b\s*/i, "").replace(/\bTbk\.?\b/gi, "").replace(/\(Persero\)/gi, "").trim(),
        factIds: [],
      });
    }
    return id;
  };

  for (const r of records) {
    const to = ensureRecordNode(r);
    for (const h of r.holders) {
      if (NOISE_HOLDER.test(h.name.trim()) || h.pct < 0.005) continue;
      const matched = byCompany.get(normCompanyName(h.name));
      const from = matched && matched !== r.symbol ? ensureRecordNode(records.find((x) => x.symbol === matched) as GraphRecord) : ensureEntityNode(h.name);
      if (from === to || seenEdge.has(`${from}->${to}`)) continue;
      seenEdge.add(`${from}->${to}`);
      edges.push({
        from,
        to,
        pct: h.pct,
        factId: h.factId,
        crossPortfolio: !from.startsWith("ent:") && !to.startsWith("ent:"),
      });
    }
  }

  const parent = new Map<string, string>();
  for (const n of nodes.keys()) parent.set(n, n);
  const { find, union } = unionFind(parent);
  for (const e of edges) union(e.from, e.to);

  const groups = new Map<string, string[]>();
  for (const n of nodes.keys()) {
    const root = find(n);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(n);
  }

  const clusters: GraphCluster[] = [];
  let ci = 0;
  for (const memberIds of groups.values()) {
    if (memberIds.length < 2) continue;
    const outSum = new Map<string, number>();
    for (const e of edges) outSum.set(e.from, (outSum.get(e.from) ?? 0) + e.pct);
    const hub = [...memberIds].sort(
      (a, b) =>
        (outSum.get(b) ?? 0) - (outSum.get(a) ?? 0) || (nodes.get(b)?.marketCap ?? 0) - (nodes.get(a)?.marketCap ?? 0),
    )[0];
    const id = `grup-${ci++}`;
    clusters.push({ id, label: nodes.get(hub)?.name ?? id, nodeIds: memberIds });
    for (const m of memberIds) {
      const node = nodes.get(m);
      if (node && !node.clusterId) node.clusterId = id;
    }
  }
  return { nodes: [...nodes.values()], edges, clusters };
}

export type PositionedNode = { node: GraphNode; x: number; y: number };

export function layoutGraph(nodes: GraphNode[], width = 860, rowGap = 300): { positioned: PositionedNode[]; height: number } {
  const byCluster = new Map<string | undefined, GraphNode[]>();
  for (const n of nodes) {
    const key = n.clusterId;
    (byCluster.get(key) ?? byCluster.set(key, []).get(key)!).push(n);
  }
  const groups = [...byCluster.entries()].sort((a, b) => {
    const rank = (g: GraphNode[]) => (g.some((n) => n.kind === "entity") ? 0 : 1);
    return rank(a[1]) - rank(b[1]) || b[1].length - a[1].length;
  });
  const positioned: PositionedNode[] = [];
  let y = 90;
  for (const [clusterId, members] of groups) {
    const hub = clusterId
      ? (members.find((m) => m.kind === "entity") ?? [...members].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))[0])
      : [...members].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))[0];
    const rest = members.filter((m) => m !== hub);
    positioned.push({ node: hub, x: width / 2, y });
    const n = rest.length;
    const spread = Math.min(width - 160, Math.max(n - 1, 1) * 170);
    rest.forEach((m, i) => {
      const x = n <= 0 ? width / 2 : width / 2 - spread / 2 + (spread / Math.max(n - 1, 1)) * i;
      positioned.push({ node: m, x, y: y + 150 });
    });
    y += rest.length ? rowGap : rowGap - 120;
  }
  return { positioned, height: Math.max(y, 260) };
}
