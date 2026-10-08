// Geometric relationships: circle of fifths, neo-Riemannian (P/L/R) moves and Tonnetz coordinates.
import { Chord, triadClass } from './chords';
import { mod, pc } from './notes';

/** Position 0..11 on the circle of fifths (C=0, G=1, D=2 … F=11). */
export function fifthsIndex(pitch: number): number {
  return mod(pitch * 7, 12);
}

/** Angle in radians (0 = top, clockwise) of a pitch class on the circle of fifths. */
export function fifthsAngle(pitch: number): number {
  return (fifthsIndex(pitch) / 12) * Math.PI * 2;
}

/** Signed steps around the circle of fifths from a to b (-6..6; positive = clockwise/sharpward). */
export function fifthsDistance(a: number, b: number): number {
  return mod(fifthsIndex(b) - fifthsIndex(a) + 6, 12) - 6;
}

/** Compact signed fifths-step tag for a pitch relative to a reference (tonic or current root). */
export function fifthsStepTag(from: number, to: number): string {
  const d = fifthsDistance(from, to);
  if (d === 0) return '·';
  if (d === 6 || d === -6) return 'tt';
  return d > 0 ? `+${d}` : `${d}`;
}

/**
 * Plain-language label for a root move on the circle of fifths.
 * Positive steps = clockwise / sharpward (dominant side); negative = counter-clockwise / flatward (subdominant).
 */
export function fifthsMoveLabel(from: number, to: number): string {
  const d = fifthsDistance(from, to);
  if (d === 0) return 'same root · no circle move';
  if (d === 1) return 'CW +1 · dominant side — pulls toward home';
  if (d === -1) return 'CCW −1 · subdominant — opens / relaxes';
  if (d === 2) return 'CW +2 · toward V of V — brightens, more pull';
  if (d === -2) return 'CCW −2 · deeper subdominant — darker open';
  if (d === 3) return 'CW +3 · sharpward climb — restless / bright';
  if (d === -3) return 'CCW −3 · flatward sink — earthy / dark';
  if (d === 6 || d === -6) return 'tritone · opposite — maximum distance / unstable';
  if (d > 0) return `CW +${d} · sharpward (dominant side of the circle)`;
  return `CCW ${d} · flatward (subdominant side of the circle)`;
}

export type Triad = { root: number; minor: boolean };

export function asTriad(c: Chord): Triad | null {
  const cls = triadClass(c.quality);
  if (cls !== 'maj' && cls !== 'min') return null;
  return { root: pc(c.root), minor: cls === 'min' };
}

export const NRT_OPS: Record<'P' | 'L' | 'R', (t: Triad) => Triad> = {
  P: (t) => ({ root: t.root, minor: !t.minor }),
  L: (t) => (t.minor ? { root: mod(t.root + 8, 12), minor: false } : { root: mod(t.root + 4, 12), minor: true }),
  R: (t) => (t.minor ? { root: mod(t.root + 3, 12), minor: false } : { root: mod(t.root + 9, 12), minor: true }),
};

/** Shortest P/L/R path (applied left to right) between two major/minor triads; '' if equal, null if n/a. */
export function neoRiemannianPath(a: Chord, b: Chord, maxDepth = 4): string | null {
  const ta = asTriad(a), tb = asTriad(b);
  if (!ta || !tb) return null;
  const key = (t: Triad) => `${t.root}${t.minor ? 'm' : 'M'}`;
  if (key(ta) === key(tb)) return '';
  const seen = new Map<string, string>([[key(ta), '']]);
  let frontier: Triad[] = [ta];
  for (let d = 0; d < maxDepth; d++) {
    const next: Triad[] = [];
    for (const t of frontier) {
      for (const op of ['P', 'L', 'R'] as const) {
        const u = NRT_OPS[op](t);
        const k = key(u);
        if (seen.has(k)) continue;
        const path = seen.get(key(t))! + op;
        seen.set(k, path);
        if (k === key(tb)) return path;
        next.push(u);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * Tonnetz lattice coordinates: x steps are perfect fifths (+7), y steps are major thirds (+4).
 * Returns the lattice point nearest the origin (within the given window) whose pitch class matches.
 */
export function tonnetzCoord(pitch: number, cols = 7, rows = 3): { x: number; y: number } {
  let best = { x: 0, y: 0, d: Infinity };
  for (let y = -Math.floor(rows / 2); y <= Math.floor(rows / 2); y++) {
    for (let x = -Math.floor(cols / 2); x <= Math.floor(cols / 2); x++) {
      if (mod(7 * x + 4 * y, 12) === mod(pitch, 12)) {
        const d = Math.abs(x + y * 0.5) + Math.abs(y);
        if (d < best.d) best = { x, y, d };
      }
    }
  }
  return { x: best.x, y: best.y };
}

/** Pitch class at a Tonnetz lattice point relative to a centre pitch. */
export function tonnetzPc(centre: number, x: number, y: number): number {
  return mod(centre + 7 * x + 4 * y, 12);
}

export const NRT_NAMES: Record<string, string> = {
  P: 'Parallel (P): flip major↔minor, same root',
  L: 'Leading-tone exchange (L): one note moves by semitone',
  R: 'Relative (R): one note moves by whole tone',
};
