// Time signatures for the timeline and Artist Lens try-its.
// Melody slots use `num` pulses per bar (quarters in x/4, eighths in x/8).

export interface TimeSig {
  /** Beats (pulses) per bar — also the number of melody slots. */
  num: number;
  /** Beat unit: 2, 4, 8, or 16. */
  den: number;
}

export const DEFAULT_TIME_SIG: TimeSig = { num: 4, den: 4 };

/** Quarter-/pulse-note tempos for ▶ Play and MIDI export. 140 ≈ the old fixed 0.42s beat. */
export const DEFAULT_BPM = 140;
export const BPM_PRESETS = [60, 80, 90, 100, 120, 140, 160, 180] as const;
export function clampBpm(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_BPM;
  return Math.max(40, Math.min(240, Math.round(n)));
}
/** Seconds per beat (timeline pulse) at the given BPM. */
export function beatSecFromBpm(bpm: number): number {
  return 60 / clampBpm(bpm);
}

export interface TimeSigPreset extends TimeSig {
  label: string;
  /** Short hint shown in the picker. */
  hint: string;
}

export const TIME_SIG_PRESETS: TimeSigPreset[] = [
  { num: 4, den: 4, label: '4/4', hint: 'common' },
  { num: 3, den: 4, label: '3/4', hint: 'waltz' },
  { num: 2, den: 4, label: '2/4', hint: 'march' },
  { num: 6, den: 8, label: '6/8', hint: 'compound' },
  { num: 5, den: 4, label: '5/4', hint: 'odd' },
  { num: 5, den: 8, label: '5/8', hint: 'odd' },
  { num: 7, den: 8, label: '7/8', hint: 'odd' },
  { num: 9, den: 8, label: '9/8', hint: 'compound' },
];

export const timeSigLabel = (ts: TimeSig) => `${ts.num}/${ts.den}`;
export const timeSigEqual = (a: TimeSig, b: TimeSig) => a.num === b.num && a.den === b.den;
export const beatsPerBar = (ts: TimeSig) => Math.max(1, Math.min(16, ts.num | 0));

/** Pulses that feel strong in this meter (for note-suggestion weighting). */
export function strongBeats(ts: TimeSig): number[] {
  const n = beatsPerBar(ts);
  if (n <= 1) return [0];
  if (ts.den === 8 && n % 3 === 0) {
    // compound: every dotted-quarter group
    const out: number[] = [];
    for (let i = 0; i < n; i += 3) out.push(i);
    return out;
  }
  if (n === 5) return [0, 3];
  if (n === 7) return [0, 2, 4];
  if (n % 2 === 0) return [0, n / 2];
  return [0];
}

/**
 * Pull the first N/D time signature out of a free-text meter note
 * (Artist Lens try-its use prose like "7/8 grouped 2+2+3…").
 */
export function parseMeter(text?: string | null): TimeSig | null {
  if (!text) return null;
  const m = /(\d+)\s*\/\s*(\d+)/.exec(text);
  if (!m) return null;
  const num = Number(m[1]), den = Number(m[2]);
  if (!Number.isFinite(num) || !Number.isFinite(den)) return null;
  if (num < 1 || num > 16 || ![2, 4, 8, 16].includes(den)) return null;
  return { num, den };
}

/** MIDI meta denominator byte: den = 2^dd. */
export function midiTimeSigBytes(ts: TimeSig): number[] {
  const dd = ts.den === 2 ? 1 : ts.den === 4 ? 2 : ts.den === 8 ? 3 : 4;
  // clocks per metronome click: quarter=24; for x/8 click every dotted quarter when compound
  const cc = ts.den === 8 && ts.num % 3 === 0 ? 36 : ts.den === 8 ? 12 : 24;
  return [0xff, 0x58, 0x04, ts.num, dd, cc, 8];
}
