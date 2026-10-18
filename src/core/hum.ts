// Hum → harmony: turn a sung/hummed pitch track into quantised melody notes, then harmonise it
// three ways (different moods) with the suggestion engine's melody-aware ranking. Framework-free.
import { Chord, chordPcs, chordSymbol, QUALITY_BY_ID } from './chords';
import { pc } from './notes';
import { profileFromMoods, type MoodProfile } from './profile';
import { diatonicChords, type Key } from './scales';
import type { SuggestionEngine } from './suggest';

export interface PitchFrame { t: number; midi: number | null }
export interface HumNote { midi: number; start: number; dur: number }
/** Melody note on a beat grid (absolute beats from the first note). */
export interface BeatNote { midi: number; beat: number; dur: number }

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };

/**
 * Per-frame pitch estimates (seconds, fractional MIDI or null for silence) → discrete notes.
 * A 5-frame median removes YIN blips; same-pitch runs separated by short dropouts merge; very short
 * runs are dropped; single-frame octave slips are folded back.
 */
export function segmentHum(frames: PitchFrame[], opts: { minDur?: number; maxGap?: number } = {}): HumNote[] {
  const minDur = opts.minDur ?? 0.12, maxGap = opts.maxGap ?? 0.09;
  if (!frames.length) return [];
  const sm = frames.map((f, i) => {
    if (f.midi == null) return { t: f.t, m: null as number | null };
    const win = frames.slice(Math.max(0, i - 2), i + 3).map((x) => x.midi).filter((x): x is number => x != null);
    let m = median(win);
    if (Math.abs(f.midi - m) > 10) m = f.midi; // keep genuine leaps once the window catches up
    return { t: f.t, m: Math.round(m) };
  });
  const frameDur = frames.length > 1 ? (frames[frames.length - 1]!.t - frames[0]!.t) / (frames.length - 1) : 0.033;
  const runs: HumNote[] = [];
  let cur: { midi: number; start: number; end: number } | null = null;
  for (const f of sm) {
    if (f.m == null) continue;
    if (cur && f.m === cur.midi && f.t - cur.end <= maxGap + frameDur) { cur.end = f.t; continue; }
    if (cur) runs.push({ midi: cur.midi, start: cur.start, dur: cur.end - cur.start + frameDur });
    cur = { midi: f.m, start: f.t, end: f.t };
  }
  if (cur) runs.push({ midi: cur.midi, start: cur.start, dur: cur.end - cur.start + frameDur });
  const kept = runs.filter((r) => r.dur >= minDur);
  // fold octave slips (a note an octave away from both neighbours that are themselves close)
  for (let i = 1; i < kept.length - 1; i++) {
    const a = kept[i - 1]!, b = kept[i]!, c = kept[i + 1]!;
    const d = b.midi - a.midi;
    if (Math.abs(d) >= 11 && Math.abs(d) <= 13 && Math.abs(c.midi - a.midi) <= 4) b.midi -= 12 * Math.sign(d);
  }
  // merge neighbours that ended up on the same pitch with a tiny gap
  const out: HumNote[] = [];
  for (const n of kept) {
    const last = out[out.length - 1];
    if (last && last.midi === n.midi && n.start - (last.start + last.dur) <= maxGap) last.dur = n.start + n.dur - last.start;
    else out.push({ ...n });
  }
  return out;
}

/** Notes in seconds → beat grid (default half-beat). Overlapping grid positions keep the longer note. */
export function quantizeHum(notes: HumNote[], beatSec: number, grid = 0.5, origin?: number): BeatNote[] {
  if (!notes.length || !(beatSec > 0)) return [];
  // With a click track the grid starts at `origin` (the downbeat); otherwise at the first note.
  const t0 = origin ?? notes[0]!.start;
  const q = (v: number) => Math.round(v / grid) * grid;
  const byBeat = new Map<number, BeatNote>();
  for (const n of notes) {
    const beat = q((n.start - t0) / beatSec);
    if (beat < 0) continue;
    const dur = Math.max(grid, q(n.dur / beatSec));
    const prev = byBeat.get(beat);
    if (!prev || prev.dur < dur) byBeat.set(beat, { midi: n.midi, beat, dur });
  }
  const out = [...byBeat.values()].sort((a, b) => a.beat - b.beat);
  for (let i = 0; i < out.length - 1; i++) out[i]!.dur = Math.min(out[i]!.dur, out[i + 1]!.beat - out[i]!.beat);
  return out;
}

export interface HumHarmony { mood: string; chords: Chord[]; fit: number; barFit: number[] }
export interface HumOptions { beatsPerBar?: number; span?: number; moods?: string[]; adventure?: number; maxBars?: number; profile?: MoodProfile | null }

export const HUM_MOODS = ['hopeful', 'melancholy', 'dreamy', 'dramatic', 'jazzy', 'warm', 'mystical'];

/** Group beat notes into spans (bars or half-bars), with beats relative to each span. */
export function humSpans(notes: BeatNote[], span: number, maxSpans = 16): BeatNote[][] {
  if (!notes.length) return [];
  const last = notes[notes.length - 1]!;
  const count = Math.min(maxSpans, Math.max(1, Math.ceil((last.beat + Math.min(last.dur, span) - 1e-6) / span)));
  const out: BeatNote[][] = Array.from({ length: count }, () => []);
  for (const n of notes) {
    const i = Math.floor(n.beat / span + 1e-9);
    if (i < count) out[i]!.push({ midi: n.midi, beat: n.beat - i * span, dur: Math.min(n.dur, span - (n.beat - i * span)) });
  }
  return out;
}

/** Share (0..1) of the span's melody — weighted by length and downbeats — that sits on the chord's triad. */
export function chordCoverage(notes: BeatNote[], chord: Chord): number {
  if (!notes.length) return 0.5;
  // Triad tones only: extensions (9ths, 7ths) can technically "contain" a note without supporting it.
  const root = pc(chord.root);
  const pcs = new Set(QUALITY_BY_ID[chord.quality].tones.slice(0, 3).map(([, semi]) => (root + semi) % 12));
  let hit = 0, w = 0;
  for (const n of notes) {
    const wt = Math.max(0.25, n.dur) * (n.beat === 0 ? 1.6 : Number.isInteger(n.beat) ? 1 : 0.6);
    w += wt;
    if (pcs.has(((n.midi % 12) + 12) % 12)) hit += wt;
  }
  return w ? hit / w : 0;
}

/** Harmonise one melody with a mood: beam search over melody-aware suggestions per span. */
export function harmonizeWithMood(engine: SuggestionEngine, k: Key, spans: BeatNote[][], mood: string | MoodProfile, adventure = 0.3): HumHarmony {
  const tonic = diatonicChords(k)[0]!;
  const tonicPcs = new Set(chordPcs(tonic));
  const profile = typeof mood === 'string' ? profileFromMoods([engine.lexicon.canonical(mood)]) : mood;
  type B = { chords: Chord[]; fits: number[]; cost: number };
  let beams: B[] = [{ chords: [], fits: [], cost: 0 }];
  spans.forEach((notes, si) => {
    const next: B[] = [];
    const isLast = si === spans.length - 1;
    for (const b of beams) {
      const sugg = engine.suggestChords({
        key: k, progression: b.chords, profile, adventure, limit: 20, tensionStyle: null,
        harmonize: notes.length ? notes.map((n) => ({ midi: n.midi, beat: n.beat, dur: n.dur })) : undefined,
      });
      const top = Math.max(1e-6, ...sugg.map((x) => x.score));
      for (const s of sugg) {
        const fit = s.harmony?.fit ?? 0.3;
        const prev = b.chords[b.chords.length - 1];
        const same = prev && chordSymbol(prev) === s.symbol;
        const repeats = b.chords.filter((c) => chordSymbol(c) === s.symbol).length;
        // A melody that clashes is the worst outcome; then mood score; then variety.
        // Chromatic colour is welcome but should earn its place; home at the very end makes it land.
        const outside = s.diatonic ? 0 : 0.55 * (1 - adventure);
        const home = chordPcs(s.chord).every((x) => tonicPcs.has(x)) || (s.chord.root.letter === tonic.root.letter && s.chord.root.acc === tonic.root.acc);
        const cadence = isLast && home ? -0.5 : si === 0 && home ? -0.2 : 0;
        const cover = chordCoverage(notes, s.chord);
        const cost = b.cost - 1.3 * (s.score / top) - 1.2 * fit - 1.8 * cover + outside + cadence + (same ? 0.6 : 0) + 0.15 * repeats + (fit < 0 ? 1.2 : 0);
        next.push({ chords: [...b.chords, s.chord], fits: [...b.fits, fit], cost });
      }
    }
    next.sort((x, y) => x.cost - y.cost);
    const seen = new Set<string>();
    beams = next.filter((x) => { const id = x.chords.map((c) => chordSymbol(c)).join(' '); if (seen.has(id)) return false; seen.add(id); return true; }).slice(0, 3);
  });
  const best = beams[0] ?? { chords: [], fits: [] };
  const voiced = best.fits.filter((_, i) => spans[i]!.length > 0);
  const avg = voiced.length ? voiced.reduce((s, f) => s + f, 0) / voiced.length : 0;
  return { mood: typeof mood === 'string' ? engine.lexicon.canonical(mood) : 'yours', chords: best.chords, fit: Math.max(0, Math.min(1, (avg + 1) / 2)), barFit: best.fits };
}

/** Three harmonisations of the same melody, each in a different mood (distinct chord sequences). */
export function harmonizeHum(engine: SuggestionEngine, k: Key, notes: BeatNote[], opts: HumOptions = {}): HumHarmony[] {
  const bpb = opts.beatsPerBar ?? 4;
  const span = opts.span ?? bpb;
  const spans = humSpans(notes, span, opts.maxBars ?? 16);
  if (!spans.length) return [];
  const moods = [...(opts.moods ?? []), ...HUM_MOODS.filter((m) => !(opts.moods ?? []).includes(m))];
  const out: HumHarmony[] = [];
  const seen = new Set<string>();
  if (opts.profile) {
    const h = harmonizeWithMood(engine, k, spans, opts.profile, opts.adventure);
    seen.add(h.chords.map((c) => chordSymbol(c)).join(' ')); out.push(h);
  }
  for (const m of moods) {
    if (out.length >= 3) break;
    const h = harmonizeWithMood(engine, k, spans, m, opts.adventure);
    const id = h.chords.map((c) => chordSymbol(c)).join(' ');
    if (seen.has(id)) continue;
    seen.add(id); out.push(h);
  }
  return out;
}

/** Taps (start times in seconds) → notes: each lasts until the next tap; the last gets one beat. */
export function tapsToNotes(taps: Array<{ midi: number; t: number }>, beatSec: number): HumNote[] {
  return taps.map((tp, i) => ({ midi: tp.midi, start: tp.t, dur: i < taps.length - 1 ? Math.max(0.05, taps[i + 1]!.t - tp.t) : beatSec }));
}
