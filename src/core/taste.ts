// Taste learning: thumbs up / down on suggestions build a small local profile (chord qualities,
// functions, rarity, moods, exact chords) that gently re-ranks Best fit. Stored only on the device.
// Framework-free.
import { QUALITY_BY_ID, type QualityId } from './chords';
import type { MoodWeight } from './moods';

export interface TasteState {
  votes: number;
  up: number;
  quality: Record<string, number>;
  fn: Record<string, number>;
  rarity: Record<string, number>;
  mood: Record<string, number>;
  chord: Record<string, number>;
}
export const EMPTY_TASTE: TasteState = { votes: 0, up: 0, quality: {}, fn: {}, rarity: {}, mood: {}, chord: {} };

/** The bits of a suggestion taste looks at (ChordSuggestion satisfies this). */
export interface TasteItem { symbol: string; chord: { quality: QualityId }; roman: string; rarity: string; moods: MoodWeight[] }

/** Roman numeral without quality/extension suffix: "IVmaj7" → "IV", "♭VII7" → "♭VII", "V7/V" → "V/V". */
export function romanFunction(roman: string): string {
  const [main, of] = roman.split('/');
  const head = (main ?? '').match(/^[♭♯b#]?[ivIV]+/)?.[0] ?? main ?? '';
  return of ? `${head}/${of.match(/^[♭♯b#]?[ivIV]+/)?.[0] ?? of}` : head;
}

const add = (rec: Record<string, number>, k: string, d: number) => {
  const v = (rec[k] ?? 0) + d;
  const out = { ...rec };
  if (Math.abs(v) < 1e-6) delete out[k]; else out[k] = Math.max(-12, Math.min(12, v));
  return out;
};

export function recordVote(s: TasteState, item: TasteItem, up: boolean): TasteState {
  const d = up ? 1 : -1;
  const total = item.moods.slice(0, 3).reduce((t, m) => t + m.weight, 0) || 1;
  let mood = s.mood;
  for (const m of item.moods.slice(0, 3)) mood = add(mood, m.id, d * (m.weight / total) * 1.5);
  return {
    votes: s.votes + 1,
    up: s.up + (up ? 1 : 0),
    quality: add(s.quality, item.chord.quality, d),
    fn: add(s.fn, romanFunction(item.roman), d),
    rarity: add(s.rarity, item.rarity, d * 0.7),
    mood,
    chord: add(s.chord, item.symbol, d),
  };
}

const squash = (v: number | undefined) => Math.tanh((v ?? 0) / 3);

/** −1 … +1 preference for an item; scaled down until there are a few votes. */
export function tasteBonus(s: TasteState, item: TasteItem): number {
  if (!s.votes) return 0;
  const total = item.moods.slice(0, 3).reduce((t, m) => t + m.weight, 0) || 1;
  const mood = item.moods.slice(0, 3).reduce((t, m) => t + squash(s.mood[m.id]) * (m.weight / total), 0);
  const raw = 0.3 * squash(s.quality[item.chord.quality]) + 0.25 * squash(s.fn[romanFunction(item.roman)])
    + 0.15 * squash(s.rarity[item.rarity]) + 0.3 * mood + 0.25 * squash(s.chord[item.symbol]);
  return Math.max(-1, Math.min(1, raw)) * Math.min(1, s.votes / 5);
}

/** Stable re-rank: score + weight × bonus × (typical score spread). Order only changes when taste disagrees enough. */
export function rerankByTaste<T extends TasteItem & { score: number }>(list: T[], s: TasteState, weight = 0.4): T[] {
  if (!s.votes || list.length < 2) return list;
  const scores = list.map((x) => x.score).sort((a, b) => b - a);
  const spread = Math.max(0.5, scores[0]! - scores[Math.floor(scores.length / 2)]!);
  return list.map((x, i) => ({ x, i, v: x.score + weight * spread * tasteBonus(s, x) }))
    .sort((a, b) => b.v - a.v || a.i - b.i).map((e) => e.x);
}

export interface TasteSummary { likes: string[]; dislikes: string[] }
/** Plain-language summary of the strongest leanings (moods labelled via `moodLabel`). */
export function describeTaste(s: TasteState, moodLabel: (id: string) => string = (x) => x): TasteSummary {
  const items: Array<{ text: string; v: number }> = [];
  for (const [q, v] of Object.entries(s.quality)) items.push({ text: `${QUALITY_BY_ID[q as QualityId]?.name ?? q} chords`, v });
  for (const [f, v] of Object.entries(s.fn)) items.push({ text: `${f} chords`, v: v * 0.9 });
  for (const [r, v] of Object.entries(s.rarity)) items.push({ text: `${r} picks`, v });
  for (const [m, v] of Object.entries(s.mood)) items.push({ text: `${moodLabel(m).toLowerCase()} sounds`, v });
  const likes = items.filter((x) => x.v >= 1).sort((a, b) => b.v - a.v).slice(0, 4).map((x) => x.text);
  const dislikes = items.filter((x) => x.v <= -1).sort((a, b) => a.v - b.v).slice(0, 4).map((x) => x.text);
  return { likes, dislikes };
}

export function parseTaste(raw: string | null): TasteState {
  try {
    const o = raw ? JSON.parse(raw) : null;
    if (!o || typeof o !== 'object') return EMPTY_TASTE;
    const rec = (v: unknown): Record<string, number> => {
      const out: Record<string, number> = {};
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (typeof x === 'number' && Number.isFinite(x) && k.length < 40) out[k] = Math.max(-12, Math.min(12, x));
      }
      return out;
    };
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    const votes = n(o.votes);
    return { votes, up: Math.min(votes, n(o.up)), quality: rec(o.quality), fn: rec(o.fn), rarity: rec(o.rarity), mood: rec(o.mood), chord: rec(o.chord) };
  } catch { return EMPTY_TASTE; }
}
