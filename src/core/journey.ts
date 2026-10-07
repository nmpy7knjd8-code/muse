// Mood journey: generate a progression that travels from one mood (or profile) to another.
// Beam search over the suggestion engine with a profile that is interpolated step by step.
import { Chord, chordSymbol } from './chords';
import { MoodProfile, normalizeWeights } from './profile';
import { Key, MODE_BY_ID, diatonicChords } from './scales';
import { ChordSuggestion, SuggestionEngine } from './suggest';
import { romanOf } from './roman';
import { pc } from './notes';
import { MoodWeight } from './moods';

export type MoodSpec = string | MoodProfile;

export interface JourneyStep {
  chord: Chord;
  symbol: string;
  roman: string;
  moods: MoodWeight[];
  /** 0 = start mood … 1 = end mood */
  t: number;
  matchStart: number;
  matchEnd: number;
}

export interface JourneyOptions {
  length?: number; // 4..8
  beam?: number;
  adventure?: number;
  start?: Chord; // optional fixed first chord
}

function toProfile(spec: MoodSpec): MoodProfile {
  return typeof spec === 'string' ? { moods: { [spec]: 1 }, dims: {}, modes: [], source: 'preset' } : spec;
}

/** Linear blend of two profiles (moods, dims and modes). */
export function blendProfiles(a: MoodProfile, b: MoodProfile, t: number): MoodProfile {
  const moods: Record<string, number> = {};
  for (const [k, v] of Object.entries(a.moods)) moods[k] = (moods[k] ?? 0) + v * (1 - t);
  for (const [k, v] of Object.entries(b.moods)) moods[k] = (moods[k] ?? 0) + v * t;
  const dims: MoodProfile['dims'] = {};
  const keys = new Set([...Object.keys(a.dims), ...Object.keys(b.dims)]) as Set<keyof MoodProfile['dims']>;
  for (const d of keys) {
    const va = a.dims[d], vb = b.dims[d];
    dims[d] = va === undefined ? vb : vb === undefined ? va : va * (1 - t) + vb * t;
  }
  const modes = t < 0.5 ? a.modes : b.modes;
  return { moods: normalizeWeights(moods), dims, modes, source: 'manual' };
}

interface Beam { chords: Chord[]; sugs: ChordSuggestion[]; score: number }

export function moodJourney(engine: SuggestionEngine, k: Key, from: MoodSpec, to: MoodSpec, opts: JourneyOptions = {}): JourneyStep[] {
  const n = Math.max(2, Math.min(8, opts.length ?? 4));
  const width = opts.beam ?? 5;
  const pa = toProfile(from), pb = toProfile(to);
  const tAt = (i: number) => (n === 1 ? 1 : i / (n - 1));
  let beams: Beam[];
  if (opts.start) {
    beams = [{ chords: [opts.start], sugs: [], score: 0 }];
  } else {
    // first chord: home chord coloured toward the start mood (tonic strongly preferred)
    // Journeys start from home: a chord on the tonic (any colour) that best fits the start mood.
    const tonic = diatonicChords(k)[0];
    const first = engine.suggestChords({ key: k, progression: [], profile: pa, adventure: opts.adventure ?? 0.3, limit: 40 });
    // home = any chord on the tonic, or the relative (vi in major / III in minor) for contrasting start moods
    const rel = diatonicChords(k)[MODE_BY_ID[k.mode].family === 'minor' ? 2 : 5];
    const home = first.filter((s) => !s.chord.bass && (pc(s.chord.root) === pc(tonic.root) || chordSymbol(s.chord) === chordSymbol(rel)));
    const pool = home.length ? home : first;
    beams = pool.slice(0, width).map((s) => ({ chords: [s.chord], sugs: [s], score: s.score + (chordSymbol(s.chord) === chordSymbol(tonic) ? 0.6 : 0) }));
  }
  for (let i = 1; i < n; i++) {
    const t = tAt(i);
    const prof = blendProfiles(pa, pb, t);
    const next: Beam[] = [];
    for (const b of beams) {
      const cands = engine.suggestChords({ key: k, progression: b.chords, profile: prof, adventure: opts.adventure ?? 0.3, limit: 8 });
      for (const s of cands.slice(0, 6)) {
        const sym = chordSymbol(s.chord);
        const seen = b.chords.filter((c) => chordSymbol(c) === sym).length;
        const prevRoot = pc(b.chords[b.chords.length - 1].root);
        let score = b.score + s.score - seen * 0.8 - (pc(s.chord.root) === prevRoot ? 0.6 : 0);
        if (i === n - 1) score += (s.match?.total ?? 0) * 1.5; // land firmly in the target mood
        next.push({ chords: [...b.chords, s.chord], sugs: [...b.sugs, s], score });
      }
    }
    next.sort((x, y) => y.score - x.score);
    const uniq: Beam[] = [];
    const keys = new Set<string>();
    for (const b of next) {
      const key = b.chords.map((c) => chordSymbol(c)).join(' ');
      if (keys.has(key)) continue;
      keys.add(key);
      uniq.push(b);
      if (uniq.length >= width) break;
    }
    beams = uniq;
  }
  const best = beams[0];
  return best.chords.map((c, i) => {
    const moods = engine.chordMoods(c, k, i > 0 ? best.chords[i - 1] : undefined);
    const ms = engine.scoreAgainst(pa, c, k, moods);
    const me = engine.scoreAgainst(pb, c, k, moods);
    return { chord: c, symbol: chordSymbol(c, true), roman: romanOf(c, k), moods, t: tAt(i), matchStart: ms, matchEnd: me };
  });
}
