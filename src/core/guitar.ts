// Guitar chord voicings for standard tuning: curated open shapes, movable E-/A-shape barres,
// and an algorithmic search fallback. Every returned shape passes `isPlayable`.
import { Chord, QUALITY_BY_ID, QualityId, chordNotes, chordSymbol } from './chords';
import { mod, pc } from './notes';

/** Standard tuning, low E (string 6) to high e (string 1), as MIDI numbers. */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64];

export interface Barre {
  fret: number;
  /** string indexes 0 (low E) .. 5 (high e), inclusive */
  from: number;
  to: number;
  finger: number;
}

export interface GuitarShape {
  /** per string low→high: null = muted, 0 = open, n = fret */
  frets: Array<number | null>;
  /** per string: finger 1-4 (0 for open, null for muted) */
  fingers: Array<number | null>;
  barre?: Barre;
  /** fret shown at the top of the diagram (1 = nut visible) */
  baseFret: number;
  label: string;
  source: 'open' | 'movable' | 'generated';
  /** true when some non-essential extension had to be omitted */
  partial?: boolean;
}

type F = number | null;
const x = null;

// ---- Curated open shapes (keyed by root pitch class + quality) ----
interface Curated { root: number; q: QualityId; frets: F[]; fingers: F[] }
const OPEN: Curated[] = [
  { root: 0, q: 'maj', frets: [x, 3, 2, 0, 1, 0], fingers: [x, 3, 2, 0, 1, 0] },
  { root: 9, q: 'maj', frets: [x, 0, 2, 2, 2, 0], fingers: [x, 0, 1, 2, 3, 0] },
  { root: 7, q: 'maj', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  { root: 4, q: 'maj', frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  { root: 2, q: 'maj', frets: [x, x, 0, 2, 3, 2], fingers: [x, x, 0, 1, 3, 2] },
  { root: 9, q: 'min', frets: [x, 0, 2, 2, 1, 0], fingers: [x, 0, 2, 3, 1, 0] },
  { root: 4, q: 'min', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  { root: 2, q: 'min', frets: [x, x, 0, 2, 3, 1], fingers: [x, x, 0, 2, 3, 1] },
  { root: 9, q: '7', frets: [x, 0, 2, 0, 2, 0], fingers: [x, 0, 2, 0, 3, 0] },
  { root: 11, q: '7', frets: [x, 2, 1, 2, 0, 2], fingers: [x, 2, 1, 3, 0, 4] },
  { root: 0, q: '7', frets: [x, 3, 2, 3, 1, 0], fingers: [x, 3, 2, 4, 1, 0] },
  { root: 2, q: '7', frets: [x, x, 0, 2, 1, 2], fingers: [x, x, 0, 2, 1, 3] },
  { root: 4, q: '7', frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  { root: 7, q: '7', frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  { root: 9, q: 'm7', frets: [x, 0, 2, 0, 1, 0], fingers: [x, 0, 2, 0, 1, 0] },
  { root: 2, q: 'm7', frets: [x, x, 0, 2, 1, 1], fingers: [x, x, 0, 2, 1, 1] },
  { root: 4, q: 'm7', frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] },
  { root: 0, q: 'maj7', frets: [x, 3, 2, 0, 0, 0], fingers: [x, 3, 2, 0, 0, 0] },
  { root: 2, q: 'maj7', frets: [x, x, 0, 2, 2, 2], fingers: [x, x, 0, 1, 2, 3] },
  { root: 5, q: 'maj7', frets: [x, x, 3, 2, 1, 0], fingers: [x, x, 3, 2, 1, 0] },
  { root: 9, q: 'maj7', frets: [x, 0, 2, 1, 2, 0], fingers: [x, 0, 2, 1, 3, 0] },
  { root: 4, q: 'maj7', frets: [0, 2, 1, 1, 0, 0], fingers: [0, 3, 1, 2, 0, 0] },
  { root: 9, q: 'sus2', frets: [x, 0, 2, 2, 0, 0], fingers: [x, 0, 1, 2, 0, 0] },
  { root: 9, q: 'sus4', frets: [x, 0, 2, 2, 3, 0], fingers: [x, 0, 1, 2, 3, 0] },
  { root: 2, q: 'sus2', frets: [x, x, 0, 2, 3, 0], fingers: [x, x, 0, 1, 3, 0] },
  { root: 2, q: 'sus4', frets: [x, x, 0, 2, 3, 3], fingers: [x, x, 0, 1, 2, 3] },
  { root: 4, q: 'sus4', frets: [0, 2, 2, 2, 0, 0], fingers: [0, 2, 3, 4, 0, 0] },
  { root: 0, q: 'add9', frets: [x, 3, 2, 0, 3, 0], fingers: [x, 2, 1, 0, 3, 0] },
  { root: 7, q: '6', frets: [3, 2, 0, 0, 0, 0], fingers: [2, 1, 0, 0, 0, 0] },
  { root: 4, q: '5', frets: [0, 2, 2, x, x, x], fingers: [0, 1, 2, x, x, x] },
  { root: 9, q: '5', frets: [x, 0, 2, 2, x, x], fingers: [x, 0, 1, 2, x, x] },
  { root: 4, q: '7#9', frets: [0, 7, 6, 7, 8, 0], fingers: [0, 2, 1, 3, 4, 0] },
  { root: 9, q: 'm6', frets: [x, 0, 2, 2, 1, 2], fingers: [x, 0, 2, 3, 1, 4] },
  { root: 4, q: 'dim7', frets: [0, 1, 2, 0, 2, 0], fingers: [0, 1, 2, 0, 3, 0] },
];

// ---- Movable shapes: offsets relative to the root fret r on string 6 (E-shape) or string 5 (A-shape) ----
interface Movable { q: QualityId; frets: F[]; fingers: F[]; barre?: { from: number; to: number; finger: number; off: number } }
const E_SHAPES: Movable[] = [
  { q: 'maj', frets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1], barre: { from: 0, to: 5, finger: 1, off: 0 } },
  { q: 'min', frets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1], barre: { from: 0, to: 5, finger: 1, off: 0 } },
  { q: '7', frets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1], barre: { from: 0, to: 5, finger: 1, off: 0 } },
  { q: 'm7', frets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1], barre: { from: 0, to: 5, finger: 1, off: 0 } },
  { q: 'maj7', frets: [0, x, 1, 1, 0, x], fingers: [1, x, 3, 4, 2, x] },
  { q: 'sus4', frets: [0, 2, 2, 2, 0, 0], fingers: [1, 2, 3, 4, 1, 1], barre: { from: 0, to: 5, finger: 1, off: 0 } },
  { q: '7sus4', frets: [0, 2, 0, 2, 0, 0], fingers: [1, 3, 1, 4, 1, 1], barre: { from: 0, to: 5, finger: 1, off: 0 } },
  { q: '5', frets: [0, 2, 2, x, x, x], fingers: [1, 3, 4, x, x, x] },
  { q: 'm7b5', frets: [0, x, 0, 0, -1, x], fingers: [2, x, 3, 4, 1, x] },
  { q: 'dim7', frets: [0, x, -1, 0, -1, x], fingers: [3, x, 1, 4, 2, x] },
];
const A_SHAPES: Movable[] = [
  { q: 'maj', frets: [x, 0, 2, 2, 2, 0], fingers: [x, 1, 2, 3, 4, 1], barre: { from: 1, to: 5, finger: 1, off: 0 } },
  { q: 'min', frets: [x, 0, 2, 2, 1, 0], fingers: [x, 1, 3, 4, 2, 1], barre: { from: 1, to: 5, finger: 1, off: 0 } },
  { q: '7', frets: [x, 0, 2, 0, 2, 0], fingers: [x, 1, 3, 1, 4, 1], barre: { from: 1, to: 5, finger: 1, off: 0 } },
  { q: 'm7', frets: [x, 0, 2, 0, 1, 0], fingers: [x, 1, 3, 1, 2, 1], barre: { from: 1, to: 5, finger: 1, off: 0 } },
  { q: 'maj7', frets: [x, 0, 2, 1, 2, 0], fingers: [x, 1, 3, 2, 4, 1], barre: { from: 1, to: 5, finger: 1, off: 0 } },
  { q: 'sus4', frets: [x, 0, 2, 2, 3, 0], fingers: [x, 1, 2, 3, 4, 1], barre: { from: 1, to: 5, finger: 1, off: 0 } },
  { q: 'sus2', frets: [x, 0, 2, 2, 0, 0], fingers: [x, 1, 3, 4, 1, 1], barre: { from: 1, to: 5, finger: 1, off: 0 } },
  { q: '7sus4', frets: [x, 0, 2, 0, 3, 0], fingers: [x, 1, 3, 1, 4, 1], barre: { from: 1, to: 5, finger: 1, off: 0 } },
  { q: 'm7b5', frets: [x, 0, 1, 0, 1, x], fingers: [x, 1, 3, 2, 4, x] },
  { q: 'dim7', frets: [x, 0, 1, -1, 1, x], fingers: [x, 2, 3, 1, 4, x] },
  { q: 'dim', frets: [x, 0, 1, 2, 1, x], fingers: [x, 1, 2, 4, 3, x] },
  { q: 'aug', frets: [x, 0, 3, 2, 2, x], fingers: [x, 1, 4, 2, 3, x] },
  { q: '7#9', frets: [x, 0, -1, 0, 1, x], fingers: [x, 2, 1, 3, 4, x] },
  { q: '7b9', frets: [x, 0, -1, 0, -1, x], fingers: [x, 3, 1, 4, 2, x] },
  { q: '9', frets: [x, 0, -1, 0, 0, 0], fingers: [x, 2, 1, 3, 3, 3], barre: { from: 3, to: 5, finger: 3, off: 0 } },
  { q: 'm6', frets: [x, 0, 2, -1, 1, x], fingers: [x, 2, 4, 1, 3, x] },
  { q: '6', frets: [x, 0, 2, 2, 2, 2], fingers: [x, 1, 3, 3, 3, 3], barre: { from: 2, to: 5, finger: 3, off: 2 } },
  { q: 'mMaj7', frets: [x, 0, 2, 1, 1, 0], fingers: [x, 1, 4, 2, 3, 1], barre: { from: 1, to: 5, finger: 1, off: 0 } },
  { q: 'add9', frets: [x, 0, 2, 2, 0, 0], fingers: [x, 1, 3, 4, 1, 1], barre: { from: 1, to: 5, finger: 1, off: 0 } },
];
// (A-shape add9 above is actually sus2 — filtered out automatically by the chord-tone check.)

function baseFretFor(frets: F[]): number {
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  if (!fretted.length) return 1;
  const max = Math.max(...fretted);
  return max <= 4 ? 1 : Math.min(...fretted);
}

/** Pitch classes sounding in a shape. */
export function shapePcs(shape: Pick<GuitarShape, 'frets'>, tuning = STANDARD_TUNING): number[] {
  return shape.frets.map((f, i) => (f === null ? null : mod(tuning[i] + f, 12))).filter((p): p is number => p !== null);
}

export function shapeMidi(shape: Pick<GuitarShape, 'frets'>, tuning = STANDARD_TUNING): number[] {
  return shape.frets.map((f, i) => (f === null ? null : tuning[i] + f)).filter((p): p is number => p !== null);
}

/** Physical playability: ≤4-fret span, ≤4 fingers, consistent finger order, valid barres. */
export function isPlayable(shape: GuitarShape): boolean {
  const { frets, fingers } = shape;
  if (frets.length !== 6 || fingers.length !== 6) return false;
  const fretted: Array<{ s: number; f: number; fg: number }> = [];
  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    const fg = fingers[s];
    if (f === null) { if (fg !== null) return false; continue; }
    if (f < 0 || f > 15) return false;
    if (f === 0) { if (fg !== 0) return false; continue; }
    if (fg === null || fg < 1 || fg > 4) return false;
    fretted.push({ s, f, fg });
  }
  if (frets.every((f) => f === null)) return false;
  if (fretted.length) {
    const lo = Math.min(...fretted.map((n) => n.f));
    const hi = Math.max(...fretted.map((n) => n.f));
    if (hi - lo > 3) return false; // max 4-fret span
  }
  // each finger presses one fret (several strings only when barring)
  const fingerFret = new Map<number, number>();
  for (const n of fretted) {
    const prev = fingerFret.get(n.fg);
    if (prev !== undefined && prev !== n.f) return false;
    fingerFret.set(n.fg, n.f);
  }
  if (fingerFret.size > 4) return false;
  // barres: a finger on several strings must cover a contiguous range with no open string under it
  for (const [fg, f] of fingerFret) {
    const strings = fretted.filter((n) => n.fg === fg).map((n) => n.s);
    if (strings.length < 2) continue;
    const a = Math.min(...strings), b = Math.max(...strings);
    for (let s = a; s <= b; s++) {
      const fs = frets[s];
      if (fs === 0) return false; // open string under a barre
      if (fs !== null && fs < f) return false;
    }
  }
  // lower frets use lower-numbered fingers
  for (const p of fretted) for (const q of fretted) if (p.f < q.f && p.fg >= q.fg) return false;
  return true;
}

function requiredTones(chord: Chord, relaxed: boolean): { all: Set<number>; required: Set<number>; bass: number } {
  const def = QUALITY_BY_ID[chord.quality];
  const rootPc = pc(chord.root);
  const all = new Set(chordNotes(chord).map(pc));
  const required = new Set<number>();
  def.tones.forEach(([, semis]) => {
    const s = mod(semis, 12);
    if (semis === 7) return; // perfect 5th optional
    if (relaxed && semis > 12) return; // drop extensions
    required.add(mod(rootPc + s, 12));
  });
  const bass = chord.bass ? pc(chord.bass) : rootPc;
  if (chord.bass) all.add(bass);
  return { all, required, bass };
}

/** Does the shape spell this chord (no foreign notes, essential tones present, right bass)? */
export function shapeMatchesChord(shape: Pick<GuitarShape, 'frets'>, chord: Chord, relaxed = false): boolean {
  const { all, required, bass } = requiredTones(chord, relaxed);
  const pcs = shapePcs(shape);
  if (pcs.length < 3 && chord.quality !== '5') return false;
  if (!pcs.every((p) => all.has(p))) return false;
  for (const r of required) if (!pcs.includes(r)) return false;
  return pcs[0] === bass;
}

/** Assign fingers (and a barre if needed) to a fret pattern; null if impossible. */
export function assignFingers(frets: F[]): { fingers: F[]; barre?: Barre } | null {
  const fingers: F[] = frets.map((f) => (f === null ? null : f === 0 ? 0 : -1));
  const fretted = frets.map((f, s) => ({ f, s })).filter((n): n is { f: number; s: number } => n.f !== null && n.f > 0);
  if (!fretted.length) return { fingers };
  const minF = Math.min(...fretted.map((n) => n.f));
  const tryAssign = (useBarre: boolean): { fingers: F[]; barre?: Barre } | null => {
    const out = [...fingers];
    let barre: Barre | undefined;
    let rest = fretted;
    let prevFinger = 0;
    if (useBarre) {
      const at = fretted.filter((n) => n.f === minF).map((n) => n.s);
      if (at.length < 2) return null;
      const a = Math.min(...at), b = Math.max(...at);
      for (let s = a; s <= b; s++) if (frets[s] === 0 || (frets[s] !== null && (frets[s] as number) < minF)) return null;
      barre = { fret: minF, from: a, to: b, finger: 1 };
      for (const s of at) out[s] = 1;
      rest = fretted.filter((n) => n.f !== minF);
      prevFinger = 1;
    }
    const sorted = [...rest].sort((p, q) => p.f - q.f || p.s - q.s);
    let lastFret = useBarre ? minF : -1;
    for (const n of sorted) {
      let fg = Math.max(prevFinger + 1, 1 + (n.f - minF));
      if (n.f === lastFret && !useBarre) fg = prevFinger + 1;
      if (fg > 4) return null;
      out[n.s] = fg;
      prevFinger = fg;
      lastFret = n.f;
    }
    const shape: GuitarShape = { frets, fingers: out, barre, baseFret: 1, label: '', source: 'generated' };
    return isPlayable(shape) ? { fingers: out, barre } : null;
  };
  return tryAssign(false) ?? tryAssign(true);
}

function realiseMovable(m: Movable, r: number, label: string): GuitarShape | null {
  const frets = m.frets.map((f) => (f === null ? null : f + r));
  if (frets.some((f) => f !== null && (f < 1 || f > 15))) return null;
  const shape: GuitarShape = {
    frets,
    fingers: [...m.fingers],
    baseFret: baseFretFor(frets),
    label,
    source: 'movable',
  };
  if (m.barre) shape.barre = { fret: r + m.barre.off, from: m.barre.from, to: m.barre.to, finger: m.barre.finger };
  return shape;
}

/** Brute-force search for a playable voicing with the chord's essential tones. */
export function generateShapes(chord: Chord, relaxed = false, limit = 3): GuitarShape[] {
  const { all } = requiredTones(chord, relaxed);
  const results: Array<{ shape: GuitarShape; score: number }> = [];
  const seen = new Set<string>();
  for (let pos = 1; pos <= 12; pos++) {
    const options: F[][] = STANDARD_TUNING.map((open) => {
      const o: F[] = [null];
      if (all.has(mod(open, 12))) o.push(0);
      for (let f = pos; f <= pos + 3; f++) if (all.has(mod(open + f, 12))) o.push(f);
      return o;
    });
    const cur: F[] = new Array(6).fill(null);
    const rec = (s: number) => {
      if (s === 6) {
        const sounding = cur.filter((f) => f !== null).length;
        if (sounding < 4 && !(sounding === 3 && QUALITY_BY_ID[chord.quality].tones.length <= 3)) return;
        // mutes: only below the bass, plus at most one interior/top mute
        const first = cur.findIndex((f) => f !== null);
        const innerMutes = cur.slice(first).filter((f) => f === null).length;
        if (innerMutes > 1) return;
        const frets = [...cur];
        const key = frets.join(',');
        if (seen.has(key)) return;
        if (!shapeMatchesChord({ frets }, chord, relaxed)) return;
        const fing = assignFingers(frets);
        if (!fing) return;
        seen.add(key);
        const fretted = frets.filter((f): f is number => f !== null && f > 0);
        const opens = frets.filter((f) => f === 0).length;
        const lowPos = fretted.length ? Math.min(...fretted) : 0;
        const usedFingers = new Set(fing.fingers.filter((g) => g && g > 0)).size;
        const pcs = shapePcs({ frets });
        const hasFifth = pcs.includes(mod(pc(chord.root) + 7, 12));
        const score = sounding * 1.0 + (lowPos <= 4 ? opens * 0.3 : 0) - lowPos * 0.15 - usedFingers * 0.2
          + (hasFifth ? 0.4 : 0) - innerMutes * 0.8 - (fing.barre ? 0.3 : 0);
        results.push({
          shape: { frets, fingers: fing.fingers, barre: fing.barre, baseFret: baseFretFor(frets), label: 'generated', source: 'generated', partial: relaxed || undefined },
          score,
        });
        return;
      }
      for (const o of options[s]) {
        cur[s] = o;
        rec(s + 1);
      }
      cur[s] = null;
    };
    rec(0);
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map((r) => r.shape);
}

/** Playable guitar voicings for a chord, easiest first (open → movable barre → generated). */
export function guitarVoicings(chord: Chord, max = 4): GuitarShape[] {
  const rootPc = pc(chord.root);
  const out: GuitarShape[] = [];
  const add = (s: GuitarShape | null) => {
    if (!s) return;
    if (!isPlayable(s) || !shapeMatchesChord(s, chord)) return;
    if (out.some((o) => o.frets.join() === s.frets.join())) return;
    out.push(s);
  };
  if (!chord.bass) {
    for (const c of OPEN) if (c.root === rootPc && c.q === chord.quality) {
      add({ frets: [...c.frets], fingers: [...c.fingers], baseFret: baseFretFor(c.frets), label: 'open', source: 'open', barre: openBarre(c) });
    }
    const rE = mod(rootPc - 4, 12);
    const rA = mod(rootPc - 9, 12);
    const shapes: Array<[Movable[], number, string]> = [[E_SHAPES, rE, 'E-shape'], [A_SHAPES, rA, 'A-shape']];
    const movable: GuitarShape[] = [];
    for (const [list, r0, name] of shapes) {
      for (const m of list) {
        if (m.q !== chord.quality) continue;
        for (const r of [r0, r0 + 12]) {
          if (r < 1) continue;
          const s = realiseMovable(m, r, `${name}${m.barre && m.barre.finger === 1 ? ' barre' : ''} @${r}`);
          if (s) { movable.push(s); break; }
        }
      }
    }
    movable.sort((a, b) => a.baseFret - b.baseFret).forEach(add);
  }
  if (out.length < 2) generateShapes(chord, false).forEach(add);
  if (!out.length) {
    for (const s of generateShapes(chord, true)) {
      if (isPlayable(s) && shapeMatchesChord(s, chord, true) && !out.some((o) => o.frets.join() === s.frets.join())) out.push(s);
    }
  }
  return out.slice(0, max);
}

function openBarre(c: Curated): Barre | undefined {
  // detect a one-finger barre in curated open shapes (e.g. Dm7: finger 1 on strings 2 and 1)
  const counts = new Map<number, number[]>();
  c.fingers.forEach((f, s) => { if (f && f > 0) counts.set(f, [...(counts.get(f) ?? []), s]); });
  for (const [finger, strings] of counts) if (strings.length > 1) {
    return { fret: c.frets[strings[0]] as number, from: Math.min(...strings), to: Math.max(...strings), finger };
  }
  return undefined;
}

export function describeShape(shape: GuitarShape): string {
  return shape.frets.map((f) => (f === null ? 'x' : String(f))).join(' ');
}

export function shapeTitle(chord: Chord, shape: GuitarShape): string {
  return `${chordSymbol(chord, true)} — ${shape.label}`;
}
