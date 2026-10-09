// Playback cursor helpers: which timeline events are sounding at time t (seconds from start).
import type { TimelineEvents } from './timeline';

export interface ActivePlayback {
  /** Seconds into the piece (clamped to [0, total]). */
  t: number;
  /** Slot index of the chord currently sounding, or null. */
  chordIndex: number | null;
  /** Melody notes whose window contains t. */
  melodies: Array<{ index: number; beat: number; midi: number }>;
  /** Bass notes whose window contains t. */
  basses: Array<{ index: number; beat: number; midi: number }>;
  /** Drum hits whose window contains t (often several at once = simultaneous). */
  drums: Array<{ index: number; beat: number; voice: string }>;
  /** True when t is past the scheduled end. */
  done: boolean;
}

function inWindow(at: number, dur: number, t: number): boolean {
  return t + 1e-4 >= at && t < at + Math.max(dur, 0.05);
}

/** Resolve which chord / melody / bass events are active at playback time `t`. */
export function activeAt(ev: TimelineEvents, tRaw: number): ActivePlayback {
  const t = Math.max(0, tRaw);
  const done = t >= ev.total;
  let chordIndex: number | null = null;
  for (const c of ev.chords) {
    if (inWindow(c.at, c.dur, t)) {
      chordIndex = c.index;
      break;
    }
  }
  // If between chord attacks (chord-only short steps), pick the latest started chord.
  if (chordIndex === null && ev.chords.length) {
    for (let i = ev.chords.length - 1; i >= 0; i--) {
      if (ev.chords[i]!.at <= t) {
        chordIndex = ev.chords[i]!.index;
        break;
      }
    }
  }
  const melodies = ev.notes
    .filter((n) => inWindow(n.at, n.dur, t))
    .map((n) => ({ index: n.index, beat: n.beat, midi: n.midi }));
  const basses = ev.bass
    .filter((n) => inWindow(n.at, n.dur, t))
    .map((n) => ({ index: n.index, beat: n.beat, midi: n.midi }));
  const drums = (ev.drums ?? [])
    .filter((n) => inWindow(n.at, n.dur, t))
    .map((n) => ({ index: n.index, beat: n.beat, voice: n.voice }));
  return { t: Math.min(t, ev.total), chordIndex, melodies, basses, drums, done };
}

/** Pixel x for an event start given pixels-per-second. */
export function timeToX(at: number, pxPerSec: number): number {
  return at * pxPerSec;
}
