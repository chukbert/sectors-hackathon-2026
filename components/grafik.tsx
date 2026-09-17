"use client";
// GrupGraph — force-directed canvas, dipindah apa adanya dari arus-mock.html (sudah terbukti).
// Nol dependency: 60 baris simulasi sendiri (ponytail: three.js/d3 saat >2k node; tidak terjadi di sini).
import { useEffect, useRef } from "react";
import type { GraphPayload } from "@/lib/types";

const PALETTE = ["#A64CA0", "#009E8E", "#3568C7", "#C96A00", "#2E7D5B", "#B23A3A", "#7A5CC7", "#0E8F8F"];

interface N { id: string; lab?: string; hub?: number; g: number; w?: number; me?: number; flag?: number; x: number; y: number; vx: number; vy: number }

export default function Grafik({ data, height = 300, groupNames }: { data: GraphPayload; height?: number; groupNames?: string[] }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cv = cvRef.current!; if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nodes: N[] = data.nodes.map((n) => ({ id: n.id, lab: n.label, hub: n.hub ? 1 : 0, g: n.group, w: n.w, me: n.me ? 1 : 0, flag: n.flag ? 1 : 0, x: 0, y: 0, vx: 0, vy: 0 }));
    const links = data.links;
    const byId: Record<string, N> = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const tip = document.getElementById("tip")!;
    let W = 0, H = 0, dpr = 1, drag: N | null = null, hover: N | null = null, alpha = 1, raf = 0, placed = false;
    const cssV = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const gc = (g: number) => g < 0 ? cssV("--muted") : (g < PALETTE.length ? PALETTE[g] : cssV("--muted"));
    const rad = (n: N) => n.hub ? 16 : (n.w ? 9 + Math.sqrt(n.w) * 2.1 : 7);
    function fit() {
      const r = cv.getBoundingClientRect(); if (r.width < 10) return;
      dpr = devicePixelRatio || 1; W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr;
      if (!placed) { placed = true; nodes.forEach((n, i) => { const a = i / nodes.length * 6.28; n.x = W / 2 + Math.cos(a) * Math.min(W, H) / 3.2; n.y = H / 2 + Math.sin(a) * Math.min(W, H) / 3.4; n.vx = n.vy = 0 }); }
      relax();
    }
    function relax() { if (reduced) { for (let i = 0; i < 260; i++) tick(); draw() } else { alpha = 1; loop() } }
    function tick() {
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]; let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy || 1; if (d2 > 1e5) continue;
        const f = 1400 / d2; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
      links.forEach(([ai, bi]) => { const a = byId[ai], b = byId[bi]; if (!a || !b) return; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, f = (d - 90) * .018;
        a.vx += dx / d * f * 10; a.vy += dy / d * f * 10; b.vx -= dx / d * f * 10; b.vy -= dy / d * f * 10 });
      nodes.forEach((n) => { n.vx += (W / 2 - n.x) * .004; n.vy += (H / 2 - n.y) * .005;
        if (n !== drag) { n.x += Math.max(-6, Math.min(6, n.vx * alpha * 3)); n.y += Math.max(-6, Math.min(6, n.vy * alpha * 3)) }
        n.x = Math.max(rad(n) + 6, Math.min(W - rad(n) - 6, n.x)); n.y = Math.max(rad(n) + 6, Math.min(H - rad(n) - 18, n.y)) });
      alpha *= .985;
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      links.forEach(([ai, bi]) => { const a = byId[ai], b = byId[bi]; if (!a || !b) return;
        ctx.strokeStyle = gc(a.g ?? b.g); ctx.globalAlpha = hover === b || hover === a ? .9 : .38; ctx.lineWidth = hover === b ? 2.5 : 1.6;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke() });
      ctx.globalAlpha = 1;
      nodes.forEach((n) => { const r = rad(n);
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 7);
        if (n.g === -1) { ctx.fillStyle = cssV("--surface"); ctx.fill(); ctx.strokeStyle = cssV("--muted"); ctx.lineWidth = n.me ? 2 : 1.4; ctx.setLineDash(n.me ? [] : [3, 3]); ctx.stroke(); ctx.setLineDash([]) }
        else { ctx.fillStyle = gc(n.g); ctx.globalAlpha = n.me ? 1 : .45; ctx.fill(); ctx.globalAlpha = 1;
          if (n.hub) { ctx.lineWidth = 3; ctx.strokeStyle = cssV("--surface"); ctx.stroke() }
          if (n.me) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 3.5, 0, 7); ctx.strokeStyle = gc(n.g); ctx.globalAlpha = .55; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1 } }
        if (n.flag) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 6, 0, 7); ctx.strokeStyle = cssV("--bad"); ctx.lineWidth = 2; ctx.stroke() }
        ctx.fillStyle = cssV("--ink"); ctx.font = `${n.me ? 600 : 400} ${n.hub ? 10 : 11}px "JetBrains Mono", monospace`; ctx.textAlign = "center";
        ctx.fillText(n.lab || n.id, n.x, n.y + r + 14) });
    }
    function loop() { tick(); draw(); raf = alpha > .02 ? requestAnimationFrame(loop) : 0 }
    const nearest = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return nodes.find((n) => Math.hypot(n.x - (e.clientX - r.left), n.y - (e.clientY - r.top)) < rad(n) + 7) };
    const showTip = (html: string, x: number, y: number) => { tip.innerHTML = html; tip.style.opacity = "1"; const r = tip.getBoundingClientRect(); tip.style.left = Math.min(x + 12, innerWidth - r.width - 8) + "px"; tip.style.top = Math.min(y + 12, innerHeight - r.height - 8) + "px" };
    const hideTip = () => { tip.style.opacity = "0" };
    const onMove = (e: PointerEvent) => { const n = nearest(e); hover = n || null;
      if (drag) { drag.x += e.movementX; drag.y += e.movementY; if (reduced) draw(); return }
      if (n) { const hub = n.hub || links.some(([a, b]) => (a === n.id || b === n.id) && byId[a === n.id ? b : a]?.hub);
        const grp = groupNames?.[n.g] ?? (n.g < 0 ? "independen" : "satu grup");
        showTip(`<b>${n.hub ? n.lab : n.id}</b><br>${n.hub ? "induk/cluster grup" : n.me ? `${n.w ?? 0}% portofoliomu` : "di luar portofoliomu — tetangga grup"}<br>relasi: ${n.g === -1 ? "independen" : "kemungkinan relasi via " + grp}`, e.clientX, e.clientY);
        cv.style.cursor = "grab" } else { hideTip(); cv.style.cursor = "default" } if (!raf) draw() };
    const onLeave = () => { hover = null; hideTip(); if (!raf) draw() };
    const onDown = (e: PointerEvent) => { const n = nearest(e); if (n) { drag = n; cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing"; alpha = .5; if (!raf && !reduced) loop() } };
    const onUp = () => { drag = null; cv.style.cursor = "default" };
    cv.addEventListener("pointermove", onMove); cv.addEventListener("pointerleave", onLeave); cv.addEventListener("pointerdown", onDown);
    addEventListener("pointerup", onUp);
    const ro = new ResizeObserver(fit); ro.observe(cv.parentElement!);
    const mq = matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener("change", () => draw());
    const mo = new MutationObserver(() => draw()); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    fit();
    return () => { cv.removeEventListener("pointermove", onMove); cv.removeEventListener("pointerleave", onLeave); cv.removeEventListener("pointerdown", onDown); removeEventListener("pointerup", onUp); ro.disconnect(); mo.disconnect(); cancelAnimationFrame(raf) };
  }, [data, groupNames]);
  return (
    <div ref={boxRef}>
      <canvas ref={cvRef} style={{ display: "block", width: "100%", height, touchAction: "none", borderRadius: 10 }} aria-label="Grafik kepemilikan antar emiten" />
    </div>
  );
}
