// Pure playback planning shared by the realtime player and the offline preview renderer:
// instrument definitions, sample selection, pleasant chord registers, strum timing and humanization.
import { Chord } from './chords';
import { guitarVoicings, shapeMidi } from './guitar';
import { bassNote } from './voicing';

export type InstrumentId = 'piano' | 'nylon' | 'steel' | 'electric' | 'rhodes' | 'pad' | 'bass';
export interface InstrumentDef {
  id: InstrumentId;
  label: string;
  /** how chords are voiced: keyboard, guitar shape, or bass (root in low register) */
  voicing: 'keys' | 'guitar' | 'bass';
  /** sampled MIDI notes: from..to step (files at samples/<id>/<midi>.mp3) */
  samples: { from: number; to: number; step: number };
  attack: number; // s
  /** time constant (s) of the release after note-off */
  release: number;
  /** extra hold after the nominal duration before releasing (lets plucked/struck notes ring) */
  ring: number;
  strumMs: number; // spacing between chord notes, low → high
  reverb: number; // send level 0..1
  gain: number;
  /** velocity-dependent low-pass (brighter when played harder) */
  velocityFilter: boolean;
  source: string;
}

const SALAMANDER = 'Salamander Grand Piano V3 — Alexander Holm, CC BY 3.0';
const FLUID = 'FluidR3_GM soundfont — Frank Wen; MP3 renders by gleitz/midi-js-soundfonts, CC BY 3.0';
export const INSTRUMENTS: Record<InstrumentId, InstrumentDef> = {
  piano: { id: 'piano', label: 'Piano', voicing: 'keys', samples: { from: 33, to: 96, step: 3 }, attack: 0.004, release: 0.28, ring: 0.25, strumMs: 6, reverb: 0.22, gain: 0.9, velocityFilter: true, source: SALAMANDER },
  nylon: { id: 'nylon', label: 'Nylon guitar', voicing: 'guitar', samples: { from: 40, to: 85, step: 3 }, attack: 0.003, release: 0.35, ring: 0.6, strumMs: 24, reverb: 0.2, gain: 0.95, velocityFilter: true, source: FLUID },
  steel: { id: 'steel', label: 'Steel guitar', voicing: 'guitar', samples: { from: 40, to: 85, step: 3 }, attack: 0.003, release: 0.35, ring: 0.6, strumMs: 20, reverb: 0.18, gain: 1.0, velocityFilter: true, source: FLUID },
  electric: { id: 'electric', label: 'Electric guitar', voicing: 'guitar', samples: { from: 40, to: 85, step: 3 }, attack: 0.002, release: 0.4, ring: 0.7, strumMs: 18, reverb: 0.26, gain: 0.85, velocityFilter: true, source: FLUID },
  rhodes: { id: 'rhodes', label: 'Rhodes', voicing: 'keys', samples: { from: 36, to: 90, step: 3 }, attack: 0.006, release: 0.3, ring: 0.2, strumMs: 5, reverb: 0.28, gain: 0.55, velocityFilter: true, source: FLUID },
  pad: { id: 'pad', label: 'Soft pad', voicing: 'keys', samples: { from: 36, to: 84, step: 3 }, attack: 0.16, release: 0.55, ring: 0.1, strumMs: 0, reverb: 0.4, gain: 0.85, velocityFilter: false, source: FLUID },
  bass: { id: 'bass', label: 'Bass guitar', voicing: 'bass', samples: { from: 28, to: 55, step: 3 }, attack: 0.004, release: 0.32, ring: 0.45, strumMs: 0, reverb: 0.12, gain: 1.05, velocityFilter: true, source: FLUID },
};
export const INSTRUMENT_IDS = Object.keys(INSTRUMENTS) as InstrumentId[];

export function sampleNotes(def: InstrumentDef): number[] {
  const out: number[] = [];
  for (let m = def.samples.from; m <= def.samples.to; m += def.samples.step) out.push(m);
  return out;
}

/** Closest available sample and the playback rate that pitch-shifts it to `midi` (≤ 1.5 semitones away when in range). */
export function nearestSample(midi: number, available: number[]): { sample: number; rate: number } {
  let best = available[0];
  for (const s of available) if (Math.abs(s - midi) < Math.abs(best - midi) || (Math.abs(s - midi) === Math.abs(best - midi) && s > best)) best = s;
  return { sample: best, rate: Math.pow(2, (midi - best) / 12) };
}

/**
 * Low-interval limits: close intervals sound muddy in the bass. Below ~C3 keep ≥ a 5th between
 * adjacent notes, below ~G3 ≥ a minor 3rd; offending upper notes move up an octave (or are dropped
 * when that note is already present higher up). The bass note itself is kept.
 */
export function avoidMud(midis: number[]): number[] {
  const notes = [...new Set(midis)].sort((a, b) => a - b);
  if (notes.length < 2) return notes;
  const out = [notes[0]];
  const rest = notes.slice(1);
  while (rest.length) {
    const n = rest.shift()!;
    const prev = out[out.length - 1];
    const minGap = prev < 48 ? 7 : prev < 55 ? 3 : 1;
    if (n - prev >= minGap) { out.push(n); continue; }
    const up = n + 12;
    if (up <= 84 && !rest.includes(up) && !out.includes(up)) { rest.push(up); rest.sort((a, b) => a - b); }
  }
  return out;
}

/** Bass note placed in a warm register (D2..C#3) under the upper voicing. */
export function keysVoicing(chord: Chord, upper: number[]): number[] {
  const bass = bassNote(chord, 38);
  return avoidMud([bass, ...upper.filter((m) => m !== bass)]);
}

/** MIDI notes to sound for a chord on an instrument (keys: voice-led + bass; guitar: shape; bass: low root). */
export function chordMidis(chord: Chord, upper: number[], def: InstrumentDef): number[] {
  if (def.voicing === 'guitar') {
    const shape = guitarVoicings(chord, 1)[0];
    if (shape) return shapeMidi(shape).sort((a, b) => a - b);
  }
  if (def.voicing === 'bass') {
    // Single low root (or slash-bass) in the sample range — bass guitar, not a full chord stack.
    const lo = def.samples.from, hi = def.samples.to;
    let m = bassNote(chord, lo);
    while (m < lo) m += 12;
    while (m > hi) m -= 12;
    return [m];
  }
  return keysVoicing(chord, upper);
}

/** Small deterministic PRNG (so offline renders and tests are reproducible). */
export function rng(seed = 1): () => number {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

export interface NoteEvent { midi: number; time: number; dur: number; vel: number }

/**
 * Turn a chord into timed note events: strummed low→high (guitar ~15-30 ms per string), slight
 * timing/velocity humanization, the bass a touch softer than the top voice so melodies sing.
 */
export function chordEvents(midis: number[], at: number, dur: number, vel: number, def: InstrumentDef, rand: () => number = Math.random): NoteEvent[] {
  const sorted = [...midis].sort((a, b) => a - b);
  let strum = 0;
  return sorted.map((midi, i) => {
    // strum: each string follows the previous by spacing ±15 %; unstrummed chords get ±4 ms looseness
    if (i > 0 && def.strumMs > 0) strum += (def.strumMs / 1000) * (0.85 + rand() * 0.3);
    const jitter = i && def.strumMs < 10 ? (rand() - 0.5) * 0.008 : 0;
    const shape = sorted.length > 1 ? 0.88 + 0.12 * (i / (sorted.length - 1)) : 1; // softer bass, present top
    const v = Math.max(0.05, Math.min(1, vel * shape * (0.94 + rand() * 0.12)));
    return { midi, time: Math.max(0, at + strum + jitter), dur, vel: v };
  });
}
