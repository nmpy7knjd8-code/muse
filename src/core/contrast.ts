// WCAG contrast helpers for mood-coloured chips. Framework-free.

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export function luminance(hex: string): number {
  const c = rgb(hex);
  if (!c) return 0;
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** Dark or light ink, whichever reads better on a coloured chip. */
export function inkOn(bg: string, dark = '#111111', light = '#ffffff'): string {
  return contrastRatio(bg, dark) >= contrastRatio(bg, light) ? dark : light;
}
/** Lighten a colour toward white just enough to reach `min` contrast on `bg` (keeps hue; unchanged if already fine). */
export function legibleOn(fg: string, bg: string, min = 4.5): string {
  const c = rgb(fg);
  if (!c || contrastRatio(fg, bg) >= min) return fg;
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const mix = c.map((v) => Math.round(v + (255 - v) * t));
    const hex = '#' + mix.map((v) => v.toString(16).padStart(2, '0')).join('');
    if (contrastRatio(hex, bg) >= min) return hex;
  }
  return '#ffffff';
}
