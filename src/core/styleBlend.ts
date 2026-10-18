// Artist style blend: mix two Artist Lens artists' mood profiles and polarity leans with a slider,
// then write a progression in the blended style (mood journey with a fixed blended profile).
// Framework-free.
import type { Artist } from './artists';
import { blendProfiles, moodJourney, type JourneyStep } from './journey';
import { normalizeWeights, type MoodProfile } from './profile';
import type { Key, ModeId } from './scales';
import { MODE_BY_ID } from './scales';
import type { SuggestionEngine } from './suggest';

const lean = (a: Artist, id: string): number | null => a.polarities.find((p) => p.id === id)?.lean ?? null;

/** Artist → mood profile: mood weights + dimension targets from polarity leans + the mode its exercises favour. */
export function artistProfile(engine: SuggestionEngine, a: Artist): MoodProfile {
  const moods = normalizeWeights(Object.fromEntries(a.moodProfile.map((m) => [engine.lexicon.canonical(m.mood), m.weight])));
  const dims: MoodProfile['dims'] = {};
  const ld = lean(a, 'light_dark'); if (ld != null) dims.brightness = 1 - 2 * ld; // lean 1 = dark
  const tr = lean(a, 'tension_release'); if (tr != null) dims.tension = 1 - tr; // lean 0 = tension
  const sc = lean(a, 'simple_complex'); if (sc != null) dims.chromaticism = sc;
  const su = lean(a, 'stable_unstable'); if (su != null) dims.stability = 1 - su;
  const counts = new Map<ModeId, number>();
  for (const t of a.tryIt) {
    const m = t.key?.mode as ModeId;
    if (m && MODE_BY_ID[m] && m !== 'major' && m !== 'minor') counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  const modes = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 1).map(([m]) => m);
  return { moods, dims, modes, source: 'manual' };
}

/** Adventure 0..1 from how surprising / complex an artist leans. */
export function artistAdventure(a: Artist): number {
  const xs = [lean(a, 'expectation_surprise'), lean(a, 'simple_complex')].filter((x): x is number => x != null);
  return xs.length ? 0.15 + 0.65 * (xs.reduce((s, x) => s + x, 0) / xs.length) : 0.4;
}

export interface StyleBlend {
  profile: MoodProfile;
  adventure: number;
  /** blended lean per polarity either artist defines (0 = first pole … 1 = second; undocumented = 0.5) */
  leans: Array<{ id: string; a: number; b: number; mix: number }>;
  moods: Array<{ id: string; weight: number }>;
}

export function blendArtists(engine: SuggestionEngine, a: Artist, b: Artist, t: number): StyleBlend {
  const tt = Math.max(0, Math.min(1, t));
  const profile = blendProfiles(artistProfile(engine, a), artistProfile(engine, b), tt);
  const adventure = artistAdventure(a) * (1 - tt) + artistAdventure(b) * tt;
  // Union of both artists' polarities; a side that doesn't document one sits in the middle (balanced).
  const ids = [...new Set([...a.polarities.map((p) => p.id), ...b.polarities.map((p) => p.id)])];
  const leans = ids.map((id) => {
    const la = lean(a, id) ?? 0.5, lb = lean(b, id) ?? 0.5;
    return { id, a: la, b: lb, mix: la * (1 - tt) + lb * tt };
  });
  const moods = Object.entries(profile.moods).map(([id, weight]) => ({ id, weight })).sort((x, y) => y.weight - x.weight);
  return { profile, adventure, leans, moods };
}

/** A progression in the blended style. `variant` nudges adventure for "another take". */
export function blendProgression(engine: SuggestionEngine, k: Key, blend: StyleBlend, opts: { length?: number; variant?: number } = {}): JourneyStep[] {
  const v = opts.variant ?? 0;
  const adventure = Math.max(0, Math.min(1, blend.adventure + (v % 3 === 1 ? 0.15 : v % 3 === 2 ? -0.12 : 0)));
  return moodJourney(engine, k, blend.profile, blend.profile, { length: opts.length ?? 4, adventure, beam: 4 + (v % 2) });
}
