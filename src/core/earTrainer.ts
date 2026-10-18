// Mood A/B ear trainer: "Which of these sounds more <mood>?" built from the engine's own mood
// evidence, so what the trainer calls "dreamy" is exactly what the suggestion cards call dreamy.
// Framework-free.
import { Chord, chordSymbol } from './chords';
import type { MoodWeight } from './moods';
import { colourPaletteChords, openPaletteChords } from './palette';
import { Key, diatonicChords } from './scales';
import type { SuggestionEngine } from './suggest';

export type EarLevel = 'easy' | 'hard';
export interface EarOption { chord: Chord; symbol: string; moods: MoodWeight[]; share: number }
export interface EarQuestion {
  mood: string;
  context: Chord;
  options: [EarOption, EarOption];
  /** Index (0 = A, 1 = B) of the chord that carries the mood more. */
  answer: 0 | 1;
}
export interface EarStats { asked: number; right: number; streak: number; best: number; byMood: Record<string, { asked: number; right: number }> }
export const EMPTY_EAR_STATS: EarStats = { asked: 0, right: 0, streak: 0, best: 0, byMood: {} };

/** Share (0..1) of a chord's mood evidence that belongs to `mood`. */
export function moodShare(moods: MoodWeight[], mood: string): number {
  const total = moods.reduce((s, m) => s + Math.max(0, m.weight), 0);
  if (!total) return 0;
  return Math.max(0, moods.find((m) => m.id === mood)?.weight ?? 0) / total;
}

function earPool(k: Key): Chord[] {
  const seen = new Set<string>();
  const out: Chord[] = [];
  for (const c of [...diatonicChords(k), ...diatonicChords(k, true), ...colourPaletteChords(k), ...openPaletteChords(k)]) {
    const s = chordSymbol(c);
    if (!seen.has(s)) { seen.add(s); out.push(c); }
  }
  return out;
}

interface Scored { chord: Chord; symbol: string; moods: MoodWeight[] }
const cache = new WeakMap<SuggestionEngine, Map<string, Scored[]>>();
function scoredPool(engine: SuggestionEngine, k: Key): Scored[] {
  let m = cache.get(engine);
  if (!m) { m = new Map(); cache.set(engine, m); }
  const id = `${k.tonic}-${k.mode}`;
  let s = m.get(id);
  if (!s) {
    const tonic = diatonicChords(k)[0]!;
    s = earPool(k).filter((c) => chordSymbol(c) !== chordSymbol(tonic))
      .map((c) => ({ chord: c, symbol: chordSymbol(c), moods: engine.chordMoods(c, k, tonic) }));
    m.set(id, s);
  }
  return s;
}

/** Moods the trainer can ask about in this key (each has a clear "yes" chord and a clear "no" chord). */
export function earMoods(engine: SuggestionEngine, k: Key, level: EarLevel = 'easy'): string[] {
  const pool = scoredPool(engine, k);
  const ids = new Set(pool.flatMap((p) => p.moods.slice(0, 2).map((m) => m.id)));
  return [...ids].filter((mood) => pairsFor(engine, pool, mood, level).length > 0).sort();
}

function pairsFor(engine: SuggestionEngine, pool: Scored[], mood: string, level: EarLevel): [Scored, Scored][] {
  const ratio = level === 'easy' ? 0.3 : 0.6;
  const yes = pool.filter((p) => p.moods.slice(0, 2).some((m) => m.id === mood) && moodShare(p.moods, mood) >= 0.2);
  const out: [Scored, Scored][] = [];
  for (const y of yes) {
    const ys = moodShare(y.moods, mood);
    for (const n of pool) {
      if (n === y) continue;
      const primary = n.moods[0]?.id;
      if (!primary || primary === mood) continue;
      if (moodShare(n.moods, mood) > ys * ratio) continue;
      // Easy: the wrong chord's main colour is far from the asked mood. Hard: it can be a neighbour.
      if (level === 'easy' && engine.lexicon.similarity(primary, mood) > 0.6) continue;
      out.push([y, n]);
    }
  }
  return out;
}

/** Build one A/B question. `rand` is injectable for tests (defaults to Math.random). */
export function makeEarQuestion(
  engine: SuggestionEngine, k: Key, opts: { level?: EarLevel; mood?: string; avoid?: string; rand?: () => number } = {},
): EarQuestion | null {
  const rand = opts.rand ?? Math.random;
  const level = opts.level ?? 'easy';
  const pool = scoredPool(engine, k);
  let moods = opts.mood ? [opts.mood] : earMoods(engine, k, level);
  if (opts.avoid && moods.length > 1) moods = moods.filter((m) => m !== opts.avoid);
  if (!moods.length) return null;
  const mood = moods[Math.floor(rand() * moods.length) % moods.length]!;
  const pairs = pairsFor(engine, pool, mood, level);
  if (!pairs.length) return null;
  const [y, n] = pairs[Math.floor(rand() * pairs.length) % pairs.length]!;
  const answer: 0 | 1 = rand() < 0.5 ? 0 : 1;
  const opt = (s: Scored): EarOption => ({ chord: s.chord, symbol: s.symbol, moods: s.moods, share: moodShare(s.moods, mood) });
  const options: [EarOption, EarOption] = answer === 0 ? [opt(y), opt(n)] : [opt(n), opt(y)];
  return { mood, context: diatonicChords(k)[0]!, options, answer };
}

export function updateEarStats(s: EarStats, mood: string, correct: boolean): EarStats {
  const m = s.byMood[mood] ?? { asked: 0, right: 0 };
  const streak = correct ? s.streak + 1 : 0;
  return {
    asked: s.asked + 1,
    right: s.right + (correct ? 1 : 0),
    streak,
    best: Math.max(s.best, streak),
    byMood: { ...s.byMood, [mood]: { asked: m.asked + 1, right: m.right + (correct ? 1 : 0) } },
  };
}

/** Moods sorted weakest first (needs at least 2 tries to count). */
export function weakestMoods(s: EarStats, n = 3): string[] {
  return Object.entries(s.byMood).filter(([, v]) => v.asked >= 2)
    .sort((a, b) => a[1].right / a[1].asked - b[1].right / b[1].asked).slice(0, n).map(([id]) => id);
}

export function parseEarStats(raw: string | null): EarStats {
  try {
    const o = raw ? JSON.parse(raw) : null;
    if (!o || typeof o !== 'object') return EMPTY_EAR_STATS;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    const byMood: EarStats['byMood'] = {};
    if (o.byMood && typeof o.byMood === 'object') {
      for (const [id, v] of Object.entries(o.byMood as Record<string, { asked?: unknown; right?: unknown }>)) {
        const asked = num(v?.asked), right = Math.min(asked, num(v?.right));
        if (asked) byMood[id] = { asked, right };
      }
    }
    const asked = num(o.asked);
    return { asked, right: Math.min(asked, num(o.right)), streak: num(o.streak), best: num(o.best), byMood };
  } catch { return EMPTY_EAR_STATS; }
}
