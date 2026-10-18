// Play-along practice: count-in, looped chord bars, and mic scoring of what you play/sing against
// each bar's chord (chord tone / in-key / outside). Framework-free.
import { Chord, chordNotes, chordSymbol } from './chords';
import { mod, pc } from './notes';
import { Key, inScale } from './scales';

export type NoteClass = 'chord' | 'scale' | 'outside';
export function classifyNote(midi: number, chord: Chord, k: Key): NoteClass {
  const p = mod(Math.round(midi), 12);
  const tones = new Set(chordNotes(chord).map(pc));
  if (chord.bass) tones.add(pc(chord.bass));
  if (tones.has(p)) return 'chord';
  return inScale(k, p) ? 'scale' : 'outside';
}

export interface PracticeSchedule { beatSec: number; beatsPerBar: number; bars: number; countInBeats: number; loops: number | null }
export interface PracticePos { loop: number; bar: number; beat: number; countIn: boolean; done: boolean }

export function practiceSchedule(o: { beatSec: number; beatsPerBar: number; bars: number; countInBars?: number; loops?: number | null }): PracticeSchedule {
  return { beatSec: o.beatSec, beatsPerBar: o.beatsPerBar, bars: Math.max(1, o.bars), countInBeats: (o.countInBars ?? 1) * o.beatsPerBar, loops: o.loops === undefined ? 2 : o.loops };
}
/** Start time (s from origin) of bar `bar` in loop `loop`. */
export function barStart(s: PracticeSchedule, loop: number, bar: number): number {
  return (s.countInBeats + (loop * s.bars + bar) * s.beatsPerBar) * s.beatSec;
}
/** Where are we at `t` seconds after the origin? */
export function practicePos(s: PracticeSchedule, t: number): PracticePos {
  const beats = t / s.beatSec;
  if (beats < s.countInBeats) return { loop: 0, bar: -1, beat: Math.floor(Math.max(0, beats)), countIn: true, done: false };
  const after = beats - s.countInBeats;
  const barIdx = Math.floor(after / s.beatsPerBar);
  const loop = Math.floor(barIdx / s.bars);
  const done = s.loops != null && loop >= s.loops;
  return { loop, bar: barIdx % s.bars, beat: Math.floor(after % s.beatsPerBar), countIn: false, done };
}

export interface BarScore { chord: number; scale: number; outside: number; frames: number }
export interface PracticeResult { bars: BarScore[]; total: number; heard: number; words: string }

/** Accumulates mic frames (one MIDI estimate each) per bar. */
export class PracticeScorer {
  private bars: BarScore[];
  constructor(private chords: Chord[], private k: Key) {
    this.bars = chords.map(() => ({ chord: 0, scale: 0, outside: 0, frames: 0 }));
  }
  push(bar: number, midi: number | null): NoteClass | null {
    if (midi == null || bar < 0 || bar >= this.chords.length) return null;
    const c = classifyNote(midi, this.chords[bar]!, this.k);
    const b = this.bars[bar]!;
    b[c]++; b.frames++;
    return c;
  }
  result(): PracticeResult {
    const heard = this.bars.reduce((s, b) => s + b.frames, 0);
    const w = this.bars.reduce((s, b) => s + b.chord + 0.5 * b.scale, 0);
    const total = heard ? Math.round((100 * w) / heard) : 0;
    const words = !heard ? 'Didn’t hear anything — check the mic and play a little louder.'
      : total >= 85 ? 'Locked in — you’re landing on the chord tones.'
        : total >= 65 ? 'Nice — mostly inside the harmony, a few passing notes.'
          : total >= 40 ? 'Getting there — aim for the notes of each chord on the downbeats.'
            : 'Lots of outside notes — slow it down and target one chord tone per bar.';
    return { bars: this.bars.map((b) => ({ ...b })), total, heard, words };
  }
  /** Bar to work on: lowest score among bars that were played. */
  weakest(): number | null {
    let best: number | null = null, worst = Infinity;
    this.bars.forEach((b, i) => {
      if (b.frames < 3) return;
      const s = (b.chord + 0.5 * b.scale) / b.frames;
      if (s < worst) { worst = s; best = i; }
    });
    return best;
  }
}

/** Chord-tone names for a tip ("aim for A, C or E"). */
export function chordToneHint(chord: Chord): string {
  const names = chordNotes(chord).map((n) => chordSymbol({ root: n, quality: 'maj' }));
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0] ?? '';
}
