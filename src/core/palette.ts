// Chord-palette helpers: root motion vs the previous chord, and a small set of "colour"
// (borrowed / secondary) chords shown under the diatonic triads + sevenths.
import { Chord, triadClass } from './chords';
import { mod, pc } from './notes';
import { neoRiemannianPath } from './relations';
import { Key, MODE_BY_ID } from './scales';
import { parseRoman } from './roman';

export interface RootMotion {
  /** Higher / lower / same root vs previous (nearest pitch-class move, −6..6). */
  dir: '↑' | '↓' | '→';
  /** Compact label, e.g. "↑ higher · 4th", "↓ lower · step", "→ same root". */
  label: string;
  /** Signed semitone distance −6..6. */
  semitones: number;
}

function motionName(abs: number): string {
  if (abs <= 2) return 'step';
  if (abs <= 4) return '3rd';
  if (abs === 5) return '4th';
  if (abs === 6) return 'tritone';
  return `${abs}`;
}

/**
 * How the next chord's root sits relative to the previous.
 * Perfect 4ths/5ths use the ascending functional label (↑ 4th / ↑ 5th); other intervals
 * take the shorter pitch-class path so "higher/lower" matches a nearby bass move.
 */
export function rootMotion(prev: Chord, next: Chord): RootMotion {
  const asc = mod(pc(next.root) - pc(prev.root), 12);
  if (asc === 0) return { dir: '→', label: '→ same root', semitones: 0 };
  if (asc === 7) return { dir: '↑', label: '↑ higher · 5th', semitones: 7 };
  if (asc === 5) return { dir: '↑', label: '↑ higher · 4th', semitones: 5 };
  const d = mod(asc + 6, 12) - 6;
  const dir: '↑' | '↓' = d > 0 ? '↑' : '↓';
  const word = dir === '↑' ? 'higher' : 'lower';
  return { dir, label: `${dir} ${word} · ${motionName(Math.abs(d))}`, semitones: d };
}

/** Short P/L/R tag when the move is a single neo-Riemannian step; otherwise null. */
export function nrtTag(prev: Chord, next: Chord): string | null {
  const p = neoRiemannianPath(prev, next, 1);
  return p && p.length === 1 ? p : null;
}

/** Functional family of a diatonic degree (1..7), for when there is no previous chord. */
export function degreeRole(degree: number): string {
  if (degree === 1 || degree === 6 || degree === 3) return 'home';
  if (degree === 4 || degree === 2) return 'builds toward home';
  return 'pulls home';
}

/**
 * Extra palette chords beyond diatonic triads/7ths: borrowed modal colour and a couple of
 * common secondaries. Realised via roman numerals so spelling follows the key.
 */
export function colourPaletteChords(k: Key): Chord[] {
  const fam = MODE_BY_ID[k.mode].family;
  const romans = fam === 'major'
    ? ['bVII', 'bVI', 'iv', 'II', 'V7/V', 'bIII']
    : ['bVII', 'bVI', 'IV', 'V', 'VII', 'iiø7'];
  const seen = new Set<string>();
  const out: Chord[] = [];
  for (const r of romans) {
    const c = parseRoman(r, k);
    if (!c) continue;
    const id = `${pc(c.root)}:${c.quality}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(c);
  }
  return out;
}

/** True when `c` is the same triad class + root as a diatonic triad (so the colour row can skip it). */
export function isDiatonicTriadClone(c: Chord, diatonic: Chord[]): boolean {
  return diatonic.some((d) => pc(d.root) === pc(c.root) && triadClass(d.quality) === triadClass(c.quality) && d.quality === c.quality);
}
