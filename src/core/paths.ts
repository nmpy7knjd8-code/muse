// Short next paths: 2–3 chord (or note) steps from the current material, with an optional
// connecting melody tone between chords. Uses the suggestion engine's ranking.
import { Chord, chordSymbol } from './chords';
import { Key } from './scales';
import { MoodProfile } from './profile';
import { ChordSuggestion, NoteSuggestion, SuggestionEngine } from './suggest';
import { TensionStyleId } from './harmonyTension';
import { noteRelation } from './noteRelation';
import { midiName } from './notes';
import { spellInKey } from './scales';

export interface ChordPath {
  id: string;
  chords: Chord[];
  symbols: string[];
  /** Connecting melody into each path chord (same length as chords). */
  links: number[];
  linkNames: string[];
  score: number;
  why: string;
}

/** Display like `Am — E4 → F — C5 → G` (chord, connecting note, chord…). */
export function formatChordPath(p: Pick<ChordPath, 'symbols' | 'linkNames'>): string {
  const parts: string[] = [];
  p.symbols.forEach((sym, i) => {
    if (i > 0) parts.push('→');
    parts.push(sym);
    if (p.linkNames[i]) {
      parts.push('—');
      parts.push(p.linkNames[i]);
    }
  });
  return parts.join(' ');
}

export interface NotePath {
  id: string;
  midis: number[];
  names: string[];
  score: number;
  why: string;
}

/** Display like `E4 → G4 → A4`. */
export function formatNotePath(p: Pick<NotePath, 'names'>): string {
  return p.names.join(' → ');
}

function linkTone(engine: SuggestionEngine, k: Key, a: Chord, b: Chord, melody: number[]): number {
  // Prefer a chord tone of both, else of the arrival, near the last melody pitch.
  const anchor = melody[melody.length - 1] ?? 64;
  const pool = engine.suggestNotes({ key: k, melody: [...melody, anchor], chord: b, progression: [a, b], limit: 16, beat: 0 });
  const scored = pool.map((n) => {
    const ra = noteRelation(n.midi, a, engine.kb);
    const rb = noteRelation(n.midi, b, engine.kb);
    let s = n.score;
    if (ra.kind === 'chord') s += 0.8;
    if (rb.kind === 'chord') s += 1.2;
    if (ra.kind === 'clash' || rb.kind === 'clash') s -= 1.5;
    s -= Math.abs(n.midi - anchor) * 0.04;
    return { midi: n.midi, s };
  });
  scored.sort((x, y) => y.s - x.s);
  return scored[0]?.midi ?? (anchor + 2);
}

/** Top short chord paths of length `steps` (2 or 3), each with connecting melody notes. */
export function suggestChordPaths(
  engine: SuggestionEngine,
  opts: {
    key: Key;
    progression: Chord[];
    profile?: MoodProfile | null;
    adventure?: number;
    tensionStyle?: TensionStyleId;
    melody?: number[];
    steps?: 2 | 3;
    limit?: number;
  },
): ChordPath[] {
  const steps = opts.steps ?? 2;
  const limit = opts.limit ?? 4;
  const melody = opts.melody ?? [];
  type Beam = { chords: Chord[]; sugs: ChordSuggestion[]; score: number };
  let beams: Beam[] = [{ chords: [...opts.progression], sugs: [], score: 0 }];
  for (let i = 0; i < steps; i++) {
    const next: Beam[] = [];
    for (const b of beams) {
      const cands = engine.suggestChords({
        key: opts.key,
        progression: b.chords,
        profile: opts.profile ?? null,
        adventure: opts.adventure ?? 0.35,
        tensionStyle: opts.tensionStyle,
        limit: 8,
      });
      for (const s of cands.slice(0, 5)) {
        const sym = chordSymbol(s.chord);
        if (b.chords.some((c) => chordSymbol(c) === sym)) continue;
        next.push({ chords: [...b.chords, s.chord], sugs: [...b.sugs, s], score: b.score + s.score });
      }
    }
    next.sort((a, b) => b.score - a.score);
    const uniq: Beam[] = [];
    const seen = new Set<string>();
    for (const b of next) {
      const key = b.chords.slice(opts.progression.length).map((c) => chordSymbol(c)).join('>');
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(b);
      if (uniq.length >= limit * 3) break;
    }
    beams = uniq;
  }
  const baseLen = opts.progression.length;
  const out: ChordPath[] = [];
  for (const b of beams) {
    const added = b.chords.slice(baseLen);
    if (added.length !== steps) continue;
    const links: number[] = [];
    const linkNames: string[] = [];
    let mel = [...melody];
    for (let i = 0; i < added.length; i++) {
      const prev = i === 0 ? (opts.progression[opts.progression.length - 1] ?? added[0]) : added[i - 1];
      const midi = linkTone(engine, opts.key, prev, added[i], mel);
      links.push(midi);
      linkNames.push(midiName(midi, spellInKey(opts.key, midi)).replace('#', '♯').replace(/b(?=\d)/, '♭'));
      mel = [...mel, midi];
    }
    const symbols = added.map((c) => chordSymbol(c, true));
    // Feel-first blurb: mood of the first step + that the blue notes smooth the jumps.
    const moodBit = b.sugs[0]?.moodShift?.text
      ?? (b.sugs[0]?.primaryMood ? `leans ${b.sugs[0].primaryMood}` : '');
    const why = [
      `${steps} chords Muse thinks work well next`,
      moodBit,
      linkNames.length ? 'passing notes smooth each jump' : '',
    ].filter(Boolean).join(' · ');
    out.push({
      id: `path:${symbols.join('>')}`,
      chords: added,
      symbols,
      links,
      linkNames,
      score: b.score,
      why,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Top short melody paths of length `steps` (2 or 3). */
export function suggestNotePaths(
  engine: SuggestionEngine,
  opts: {
    key: Key;
    melody: number[];
    chord: Chord | null;
    progression?: Chord[];
    profile?: MoodProfile | null;
    adventure?: number;
    steps?: 2 | 3;
    limit?: number;
    beat?: number;
  },
): NotePath[] {
  const steps = opts.steps ?? 2;
  const limit = opts.limit ?? 4;
  type Beam = { midis: number[]; sugs: NoteSuggestion[]; score: number };
  let beams: Beam[] = [{ midis: [...opts.melody], sugs: [], score: 0 }];
  for (let i = 0; i < steps; i++) {
    const next: Beam[] = [];
    for (const b of beams) {
      const cands = engine.suggestNotes({
        key: opts.key,
        melody: b.midis,
        chord: opts.chord,
        progression: opts.progression,
        profile: opts.profile ?? null,
        adventure: opts.adventure ?? 0.35,
        limit: 10,
        beat: ((opts.beat ?? 0) + i) % 4,
      });
      for (const s of cands.slice(0, 5)) {
        if (b.midis[b.midis.length - 1] === s.midi) continue;
        next.push({ midis: [...b.midis, s.midi], sugs: [...b.sugs, s], score: b.score + s.score });
      }
    }
    next.sort((a, b) => b.score - a.score);
    beams = next.slice(0, limit * 4);
  }
  const base = opts.melody.length;
  const out: NotePath[] = [];
  const seen = new Set<string>();
  for (const b of beams) {
    const added = b.midis.slice(base);
    if (added.length !== steps) continue;
    const key = added.join('>');
    if (seen.has(key)) continue;
    seen.add(key);
    const names = added.map((m) => midiName(m, spellInKey(opts.key, m)).replace('#', '♯').replace(/b(?=\d)/, '♭'));
    const first = b.sugs[0];
    const feel = first?.relation?.why
      ?? (first?.isChordTone ? 'lands on notes already in the chord — stable' : first?.why?.split(' — ')[0])
      ?? 'fits the current chord and key';
    out.push({
      id: `npath:${key}`,
      midis: added,
      names,
      score: b.score,
      why: feel,
    });
    if (out.length >= limit) break;
  }
  return out;
}
