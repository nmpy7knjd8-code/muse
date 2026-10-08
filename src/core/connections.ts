// How notes connect chords: sequences *within* a bar (melody steps) and *between*
// consecutive chords (voice leading + melodic bridge). Pure analysis over the timeline.
import { Chord, chordNotes, chordSymbol } from './chords';
import type { TheoryKB } from './kb';
import { midiName } from './notes';
import { noteRelation, type RelKind } from './noteRelation';
import { mod, pc } from './notes';
import { neoRiemannianPath, nrtPathLabel } from './relations';
import { rootMotion, type RootMotion } from './palette';
import { Key, spellInKey } from './scales';
import { TimelineSlot, isSounding, labelSlot, slotBass } from './timeline';
import { VoiceLine, commonTones, moveKind, pianoVoicing, voiceLeading, type MoveKind } from './voicing';

/** Sequential voice-led piano voicings (same idea as suggest.voiceProgression, kept local to avoid cycles). */
function voiceChain(chords: Chord[]): number[][] {
  const out: number[][] = [];
  let prev: number[] | undefined;
  for (const c of chords) {
    const v = pianoVoicing(c, prev);
    out.push(v);
    prev = v;
  }
  return out;
}

export interface MelStep {
  from: number;
  to: number;
  delta: number;
  kind: MoveKind;
}

export interface SeqNote {
  midi: number;
  beat: number;
  /** Relation label vs the bar’s chord (R, 3, 9…), when known. */
  relationLabel: string | null;
  relationKind: RelKind | null;
}

/** One timeline bar: chord voicing + ordered melody (and optional bass) sequence. */
export interface BarSequence {
  slotIndex: number;
  chord: Chord | null;
  symbol: string;
  voicing: number[];
  melody: SeqNote[];
  bass: SeqNote[];
  /** Steps between consecutive melody notes inside this bar. */
  withinMelody: MelStep[];
  /** Steps between consecutive bass notes inside this bar. */
  withinBass: MelStep[];
}

/** Connection from one chorded bar to the next. */
export interface ChordBridge {
  fromIndex: number;
  toIndex: number;
  fromSymbol: string;
  toSymbol: string;
  voiceLines: VoiceLine[];
  commonToneCount: number;
  /** Sum of |Δ| across voice lines (semitones). */
  totalMotion: number;
  root: RootMotion;
  nrt: string | null;
  /** Last melody of from → first melody of to, when both exist. */
  melodyBridge: MelStep | null;
  /** Last bass of from → first bass of to, when both exist. */
  bassBridge: MelStep | null;
  /**
   * A pitch that sits well under both chords near the melodic/bass anchor —
   * a “passing” glue tone between the pillars (hint only; not written to the timeline).
   */
  linkHintMidi: number | null;
}

export interface ProgressionConnections {
  bars: BarSequence[];
  bridges: ChordBridge[];
  /** True when there is anything useful to show (melody/bass sequence or ≥1 bridge). */
  hasContent: boolean;
}

function stepsOf(midis: number[]): MelStep[] {
  const out: MelStep[] = [];
  for (let i = 1; i < midis.length; i++) {
    const from = midis[i - 1]!;
    const to = midis[i]!;
    const delta = to - from;
    out.push({ from, to, delta, kind: moveKind(delta) });
  }
  return out;
}

/**
 * Pick a connecting pitch-class (as MIDI near `anchor`) that is a chord tone of both
 * chords when possible, else of the arrival. Mimics the spirit of path “link” tones.
 */
export function linkHintMidi(a: Chord, b: Chord, anchor = 64): number | null {
  const pcsA = new Set(chordNotes(a).map((n) => pc(n)));
  const pcsB = chordNotes(b).map((n) => pc(n));
  if (!pcsB.length) return null;
  const shared = pcsB.filter((p) => pcsA.has(p));
  const pool = shared.length ? shared : pcsB;
  let best = pool[0]! + 60;
  let bestDist = Infinity;
  for (const p of pool) {
    for (let oct = 3; oct <= 6; oct++) {
      const m = p + 12 * oct;
      const d = Math.abs(m - anchor);
      if (d < bestDist) {
        bestDist = d;
        best = m;
      }
    }
  }
  return best;
}

function seqFromLabeled(
  labeled: ReturnType<typeof labelSlot>,
): SeqNote[] {
  const out: SeqNote[] = [];
  for (const n of labeled) {
    if (!isSounding(n)) continue;
    out.push({
      midi: n.midi,
      beat: n.beat,
      relationLabel: n.relation?.label ?? null,
      relationKind: n.relation?.kind ?? null,
    });
  }
  return out;
}

/** Analyze the timeline: within-bar note sequences and between-chord voice leading. */
export function analyzeConnections(
  slots: TimelineSlot[],
  _key: Key,
  kb?: TheoryKB | null,
  beats = 4,
): ProgressionConnections {
  void _key; // reserved for key-aware link scoring / display helpers
  const chorded = slots
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s.chord);
  const chords = chorded.map((x) => x.s.chord as Chord);
  const voicings = voiceChain(chords);
  const vBySlot = new Map<number, number[]>();
  chorded.forEach((x, j) => vBySlot.set(x.i, voicings[j]!));

  const bars: BarSequence[] = slots.map((s, i) => {
    const melLabeled = labelSlot(s, kb, beats);
    const bassLabeled = slotBass(s).filter(isSounding).map((n) => {
      const rel = s.chord ? noteRelation(n.midi, s.chord, kb) : null;
      return {
        midi: n.midi,
        beat: n.beat,
        relationLabel: rel?.label ?? null,
        relationKind: rel?.kind ?? null,
      } satisfies SeqNote;
    });
    const melody = seqFromLabeled(melLabeled.filter(isSounding));
    return {
      slotIndex: i,
      chord: s.chord,
      symbol: s.chord ? chordSymbol(s.chord, true) : 'no chord',
      voicing: vBySlot.get(i) ?? (s.chord ? voicings[0] ?? [] : []),
      melody,
      bass: bassLabeled,
      withinMelody: stepsOf(melody.map((n) => n.midi)),
      withinBass: stepsOf(bassLabeled.map((n) => n.midi)),
    };
  });

  // Fix voicing for N.C. bars (empty) and chorded bars that weren't in voiceProgression order —
  // already handled via vBySlot. For chorded bars missing voicing (shouldn't happen), recompute.
  chorded.forEach((x, j) => {
    bars[x.i]!.voicing = voicings[j]!;
  });

  const bridges: ChordBridge[] = [];
  for (let j = 0; j < chorded.length - 1; j++) {
    const from = chorded[j]!;
    const to = chorded[j + 1]!;
    const a = from.s.chord as Chord;
    const b = to.s.chord as Chord;
    const va = voicings[j]!;
    const vb = voicings[j + 1]!;
    const voiceLines = voiceLeading(va, vb);
    const fromBar = bars[from.i]!;
    const toBar = bars[to.i]!;
    const lastMel = fromBar.melody.at(-1)?.midi;
    const firstMel = toBar.melody[0]?.midi;
    const lastBass = fromBar.bass.at(-1)?.midi;
    const firstBass = toBar.bass[0]?.midi;
    const anchor = lastMel ?? lastBass ?? va[va.length - 1] ?? 64;
    const nrtPath = neoRiemannianPath(a, b);
    bridges.push({
      fromIndex: from.i,
      toIndex: to.i,
      fromSymbol: chordSymbol(a, true),
      toSymbol: chordSymbol(b, true),
      voiceLines,
      commonToneCount: commonTones(a, b),
      totalMotion: voiceLines.reduce((s, l) => s + Math.abs(l.delta), 0),
      root: rootMotion(a, b),
      nrt: nrtPath ? nrtPathLabel(nrtPath) : null,
      melodyBridge: lastMel !== undefined && firstMel !== undefined
        ? { from: lastMel, to: firstMel, delta: firstMel - lastMel, kind: moveKind(firstMel - lastMel) }
        : null,
      bassBridge: lastBass !== undefined && firstBass !== undefined
        ? { from: lastBass, to: firstBass, delta: firstBass - lastBass, kind: moveKind(firstBass - lastBass) }
        : null,
      linkHintMidi: linkHintMidi(a, b, anchor),
    });
  }

  const hasWithin = bars.some((b) => b.withinMelody.length || b.withinBass.length || b.melody.length || b.bass.length);
  const hasContent = bridges.length > 0 || hasWithin;

  return { bars, bridges, hasContent };
}

/** Plain-language summary of a bridge for tooltips / why text. */
export function bridgeSummary(b: ChordBridge): string {
  const bits = [
    `${b.commonToneCount} common tone${b.commonToneCount === 1 ? '' : 's'}`,
    `${b.totalMotion} st voice motion`,
    b.root.label,
  ];
  if (b.nrt) bits.push(b.nrt);
  return bits.join(' · ');
}

/** Spell a MIDI in the active key (display helper for tests / export). */
export function spellConnMidi(k: Key, midi: number): string {
  return midiName(midi, spellInKey(k, midi)).replace('#', '♯').replace(/b(?=\d)/, '♭');
}

/** Format an intra-bar sequence like `E4 —(+2)→ G4 —(0)→ G4`. */
export function formatSequence(midis: number[], spell: (m: number) => string): string {
  if (!midis.length) return '';
  const parts = [spell(midis[0]!)];
  for (let i = 1; i < midis.length; i++) {
    const d = midis[i]! - midis[i - 1]!;
    const tag = d === 0 ? 'held' : `${d > 0 ? '+' : ''}${d}`;
    parts.push(`—(${tag})→`, spell(midis[i]!));
  }
  return parts.join(' ');
}

/** Nearest-octave distance in pitch-class space (for tests / helpers). */
export function pcDistance(a: number, b: number): number {
  return Math.min(mod(b - a, 12), mod(a - b, 12));
}
