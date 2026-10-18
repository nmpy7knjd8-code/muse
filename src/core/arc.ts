// Tension-arc → chords: the user draws how tense each bar should feel; we search the suggestion
// engine's candidates for the progression whose measured tension (tension model) follows that line.
// Framework-free.
import { Chord, chordSymbol } from './chords';
import { pc } from './notes';
import { romanOf } from './roman';
import { Key, diatonicChords } from './scales';
import type { MoodProfile } from './profile';
import type { SuggestionEngine } from './suggest';
import { progressionTension, TENSION_MAX, type TensionStyleId } from './harmonyTension';

export interface ArcPoint { x: number; y: number }
export interface ArcStep { chord: Chord; symbol: string; roman: string; level: number; target: number }
export interface ArcOptions {
  style?: TensionStyleId;
  adventure?: number;
  profile?: MoodProfile | null;
  beam?: number;
}

/** Drawn y (0 calm … 1 tense) → tension-model level. Event levels live in ~0.05..0.65. */
export const arcLevel = (y: number): number => 0.05 + Math.max(0, Math.min(1, y)) * (TENSION_MAX - 0.1);
/** Inverse of arcLevel for drawing measured levels back on the canvas. */
export const levelToArc = (level: number): number => Math.max(0, Math.min(1, (level - 0.05) / (TENSION_MAX - 0.1)));

/** Resample a freehand stroke (x,y in 0..1) to `n` evenly spaced bar targets (y values). */
export function resampleArc(points: ArcPoint[], n: number): number[] {
  const pts = [...points].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x);
  if (!pts.length) return Array.from({ length: n }, () => 0.3);
  const at = (x: number): number => {
    if (x <= pts[0]!.x) return pts[0]!.y;
    if (x >= pts[pts.length - 1]!.x) return pts[pts.length - 1]!.y;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!, b = pts[i]!;
      if (x <= b.x) return b.x === a.x ? b.y : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
    }
    return pts[pts.length - 1]!.y;
  };
  return Array.from({ length: n }, (_, i) => Math.max(0, Math.min(1, at(n === 1 ? 0.5 : (i + 0.5) / n))));
}

/** Preset shapes (y per bar) for one-tap starting points. */
export const ARC_PRESETS: Record<string, { label: string; shape: (t: number) => number }> = {
  build: { label: 'Slow build', shape: (t) => 0.15 + 0.8 * t },
  arch: { label: 'Rise & fall', shape: (t) => 0.15 + 0.8 * Math.sin(Math.PI * t) },
  wave: { label: 'Waves', shape: (t) => 0.45 + 0.35 * Math.sin(2 * Math.PI * t * 1.5 - Math.PI / 2) },
  drop: { label: 'Tense → home', shape: (t) => 0.9 - 0.8 * t },
};

interface Beam { chords: Chord[]; levels: number[]; cost: number }

/** Beam search over engine suggestions so each bar's measured tension sits near its target. */
export function arcToChords(engine: SuggestionEngine, k: Key, targetsY: number[], opts: ArcOptions = {}): ArcStep[] {
  const n = targetsY.length;
  if (!n) return [];
  const style = opts.style ?? 'pop';
  const settings = { style, adventure: opts.adventure ?? 0.4, target: null };
  const width = opts.beam ?? 4;
  const targets = targetsY.map(arcLevel);
  const tonic = diatonicChords(k)[0]!;
  let beams: Beam[] = [{ chords: [], levels: [], cost: 0 }];
  for (let i = 0; i < n; i++) {
    const next: Beam[] = [];
    for (const b of beams) {
      const cands = engine.suggestChords({
        key: k, progression: b.chords, profile: opts.profile ?? null, adventure: settings.adventure, limit: 14, tensionStyle: null,
      });
      // Always consider home: it is the calmest option and an arc often needs it.
      const pool = cands.map((s) => ({ chord: s.chord, score: s.score }));
      if (!pool.some((p) => chordSymbol(p.chord) === chordSymbol(tonic))) pool.push({ chord: tonic, score: 0 });
      for (const cand of pool) {
        const seq = [...b.chords, cand.chord];
        const pts = progressionTension(seq, k, settings).points;
        const level = pts[pts.length - 1]!.level;
        const sym = chordSymbol(cand.chord);
        const prev = b.chords[b.chords.length - 1];
        const repeats = b.chords.filter((c) => chordSymbol(c) === sym).length;
        let cost = b.cost + 5 * Math.abs(level - targets[i]!) - 0.25 * cand.score + 0.35 * repeats;
        if (prev && chordSymbol(prev) === sym) cost += 0.9; // a chord change every bar reads better
        if (prev && pc(prev.root) === pc(cand.chord.root)) cost += 0.3;
        if (i === 0 && targetsY[0]! < 0.35 && sym === chordSymbol(tonic)) cost -= 0.4; // calm start = home
        next.push({ chords: seq, levels: [...b.levels, level], cost });
      }
    }
    next.sort((a, b) => a.cost - b.cost);
    const seen = new Set<string>();
    beams = [];
    for (const b of next) {
      const key = b.chords.map((c) => chordSymbol(c)).join(' ');
      if (seen.has(key)) continue;
      seen.add(key);
      beams.push(b);
      if (beams.length >= width) break;
    }
  }
  const best = beams[0]!;
  return best.chords.map((c, i) => ({
    chord: c, symbol: chordSymbol(c, true), roman: romanOf(c, k), level: best.levels[i]!, target: targets[i]!,
  }));
}

/** How closely the result follows the drawing: 1 = exact, 0 = unrelated. */
export function arcFit(steps: ArcStep[]): number {
  if (!steps.length) return 0;
  const err = steps.reduce((s, x) => s + Math.abs(x.level - x.target), 0) / steps.length;
  return Math.max(0, 1 - err / 0.3);
}
