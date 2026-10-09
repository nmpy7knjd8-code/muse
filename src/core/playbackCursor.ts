// Playback cursor helpers: which timeline events are sounding at time t (seconds from start).
import type { TimelineEvents } from './timeline';

/**
 * How far before the loop seam we must have the next cycle already in the AudioContext
 * queue. Larger than one animation frame so rAF jitter can’t create a silent gap.
 */
export const LOOP_PRE_SCHEDULE_SEC = 0.08;

/**
 * Extra cushion beyond one full period so a slow React/rAF frame on mobile
 * can’t leave the AudioContext queue empty at the seam.
 */
export const LOOP_LOOKAHEAD_SEC = 0.25;

/** Exact audio-clock origin of the next loop cycle (zero-gap seam). */
export function nextLoopOrigin(origin: number, period: number): number {
  return origin + period;
}

/** True when elapsed time is close enough to the seam that the next cycle should already be scheduled. */
export function shouldPrimeLoop(elapsed: number, period: number, lead = LOOP_PRE_SCHEDULE_SEC): boolean {
  return period > 1e-6 && elapsed >= period - lead;
}

/**
 * Cycle start times that still need to be queued so the schedule stays ahead of `now`.
 * Always keeps at least one full period (+ cushion) in the queue — critical for drum loops.
 * `nextOrigin` is the first not-yet-scheduled cycle; returns at most `maxCycles` origins.
 */
export function loopOriginsToPrime(
  nextOrigin: number,
  period: number,
  now: number,
  lookahead = LOOP_LOOKAHEAD_SEC,
  maxCycles = 8,
): number[] {
  if (period <= 1e-6 || maxCycles <= 0) return [];
  // ≥ one period ahead so the upcoming seam is already fully scheduled.
  const until = now + period + Math.max(lookahead, LOOP_PRE_SCHEDULE_SEC);
  const out: number[] = [];
  let o = nextOrigin;
  for (let i = 0; i < maxCycles && o < until; i++) {
    out.push(o);
    o += period;
  }
  return out;
}

/** Playhead seconds within a looping period (never negative). */
export function loopPlayhead(elapsed: number, period: number): number {
  if (period <= 1e-6) return Math.max(0, elapsed);
  const t = elapsed % period;
  return t < 0 ? t + period : t;
}

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
