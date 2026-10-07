// Layout helpers for the 2D mood map: de-overlap dots and place labels without collisions.
// Pure geometry (pixel space), so it can be unit-tested and reused by a native port.

export interface LayoutIn { id: string; x: number; y: number; label: string; priority?: number }
export interface LayoutOut { id: string; x: number; y: number; label: string; labelX: number; labelY: number; showLabel: boolean; anchor: 'middle' | 'start' | 'end' }

/** Push overlapping dots apart (a few relaxation passes) keeping them inside the box. */
export function spreadDots<T extends { x: number; y: number }>(pts: T[], minDist: number, box: { x0: number; y0: number; x1: number; y1: number }, iters = 30): T[] {
  const out = pts.map((p) => ({ ...p }));
  for (let it = 0; it < iters; it++) {
    let moved = false;
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= minDist) continue;
        if (d < 1e-6) { dx = Math.cos(i * 2.4 + j); dy = Math.sin(i * 2.4 + j); d = 1; }
        const push = (minDist - d) / 2;
        const ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
        moved = true;
      }
    for (const p of out) { p.x = Math.min(box.x1, Math.max(box.x0, p.x)); p.y = Math.min(box.y1, Math.max(box.y0, p.y)); }
    if (!moved) break;
  }
  return out;
}

interface Rect { x0: number; y0: number; x1: number; y1: number }
const hit = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Greedy label placement: highest priority first; try above/below/right/left; hide the label if nothing fits. */
export function layoutMoodMap(points: LayoutIn[], opts: { r: number; charW: number; lineH: number; box: Rect; minDist?: number }): LayoutOut[] {
  const { r, charW, lineH, box } = opts;
  const dots = spreadDots(points, opts.minDist ?? r * 2.1, box);
  const order = [...dots].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const taken: Rect[] = dots.map((d) => ({ x0: d.x - r, y0: d.y - r, x1: d.x + r, y1: d.y + r }));
  const res = new Map<string, LayoutOut>();
  for (const d of order) {
    const w = d.label.length * charW;
    const cands: { lx: number; ly: number; anchor: LayoutOut['anchor']; rect: Rect }[] = [
      { lx: d.x, ly: d.y - r - 3, anchor: 'middle', rect: { x0: d.x - w / 2, y0: d.y - r - 3 - lineH, x1: d.x + w / 2, y1: d.y - r - 3 } },
      { lx: d.x, ly: d.y + r + lineH, anchor: 'middle', rect: { x0: d.x - w / 2, y0: d.y + r + 1, x1: d.x + w / 2, y1: d.y + r + lineH + 1 } },
      { lx: d.x + r + 3, ly: d.y + lineH / 3, anchor: 'start', rect: { x0: d.x + r + 3, y0: d.y - lineH / 2, x1: d.x + r + 3 + w, y1: d.y + lineH / 2 } },
      { lx: d.x - r - 3, ly: d.y + lineH / 3, anchor: 'end', rect: { x0: d.x - r - 3 - w, y0: d.y - lineH / 2, x1: d.x - r - 3, y1: d.y + lineH / 2 } },
    ];
    const ok = cands.find((c) => c.rect.x0 >= box.x0 - 20 && c.rect.x1 <= box.x1 + 20 && c.rect.y0 >= box.y0 - lineH && !taken.some((t) => hit(t, c.rect)));
    if (ok) taken.push(ok.rect);
    res.set(d.id, { id: d.id, x: d.x, y: d.y, label: d.label, labelX: ok?.lx ?? d.x, labelY: ok?.ly ?? d.y, showLabel: !!ok, anchor: ok?.anchor ?? 'middle' });
  }
  return dots.map((d) => res.get(d.id)!);
}
