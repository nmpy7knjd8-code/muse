// Tuner (idea 22) and tempo ramp for Play-along (idea 23). Framework-free; see docs/dialectic/22–23.
import { midiName } from './notes';
import type { Tuning } from './tunings';

export interface TunerReading { string: number; target: number; cents: number; state: 'flat' | 'sharp' | 'in' }
/** Nearest string of the tuning (or the locked one) and the offset in cents (±5 = in tune). */
export function tunerReading(midi: number, t: Tuning, locked: number | null = null): TunerReading {
  let idx = locked ?? 0;
  if (locked === null) { let best = Infinity; t.strings.forEach((s, i) => { const d = Math.abs(midi - s); if (d < best) { best = d; idx = i; } }); }
  const target = t.strings[idx]!;
  const cents = Math.round((midi - target) * 100);
  return { string: idx, target, cents, state: Math.abs(cents) <= 5 ? 'in' : cents < 0 ? 'flat' : 'sharp' };
}
/** "6 · D (low)" style labels, string 6 = lowest. */
export function stringLabel(t: Tuning, i: number): string {
  const n = t.strings.length - i;
  const name = midiName(t.strings[i]!).replace(/-?\d+$/, '');
  return `${n} · ${name}${i === 0 ? ' (low)' : i === t.strings.length - 1 ? ' (high)' : ''}`;
}
/** Next run's speed: +5% when ≥80% chord tones (or no score), −5% under 50%; clamped 0.4…1.0. */
export function nextTempo(speed: number, score: number | null): number {
  const step = score === null || score >= 0.8 ? 0.05 : score < 0.5 ? -0.05 : 0;
  return Math.round(Math.max(0.4, Math.min(1, speed + step)) * 100) / 100;
}
/** Bars in a loop range [a, b] (inclusive, any order), clamped. */
export function loopRange<T>(xs: T[], a: number | null, b: number | null): { items: T[]; from: number; to: number } {
  if (a === null) return { items: xs, from: 0, to: xs.length - 1 };
  const lo = Math.max(0, Math.min(a, b ?? a)); const hi = Math.min(xs.length - 1, Math.max(a, b ?? a));
  return { items: xs.slice(lo, hi + 1), from: lo, to: hi };
}
