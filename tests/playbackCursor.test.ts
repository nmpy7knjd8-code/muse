import { describe, expect, it } from 'vitest';
import {
  activeAt, loopPlayhead, nextLoopOrigin, shouldPrimeLoop, timelineEvents,
  setSlotChord, insertNote, parseChord, LOOP_PRE_SCHEDULE_SEC,
} from '../src/core';

const ch = (s: string) => parseChord(s)!;

describe('activeAt playhead', () => {
  it('highlights the sounding chord and melody note at time t', () => {
    let slots = setSlotChord([], 0, ch('C'));
    slots = insertNote(slots, 64).slots; // beat 0
    slots = insertNote(slots, 67).slots; // beat 1
    slots = setSlotChord(slots, 1, ch('Am'));
    const ev = timelineEvents(slots, { beatSec: 0.5 }); // bar = 2s
    expect(ev.total).toBe(4);
    const early = activeAt(ev, 0.1);
    expect(early.chordIndex).toBe(0);
    expect(early.melodies).toHaveLength(1);
    expect(early.melodies[0]!.midi).toBe(64);
    const mid = activeAt(ev, 0.6); // second melody (beat 1 at 0.5s)
    expect(mid.melodies.some((m) => m.midi === 67)).toBe(true);
    const bar2 = activeAt(ev, 2.2);
    expect(bar2.chordIndex).toBe(1);
    expect(activeAt(ev, 4).done).toBe(true);
  });
});

describe('seamless loop timing', () => {
  it('advances the origin by exactly one period (zero-gap seam)', () => {
    expect(nextLoopOrigin(12.5, 4)).toBe(16.5);
    expect(nextLoopOrigin(0, 2.25)).toBe(2.25);
  });
  it('primes the next cycle before the seam (ahead of rAF jitter)', () => {
    const period = 2;
    expect(shouldPrimeLoop(period - LOOP_PRE_SCHEDULE_SEC, period)).toBe(true);
    expect(shouldPrimeLoop(period - LOOP_PRE_SCHEDULE_SEC - 0.01, period)).toBe(false);
    expect(shouldPrimeLoop(period, period)).toBe(true);
    expect(shouldPrimeLoop(0, period)).toBe(false);
  });
  it('wraps the playhead inside the loop period', () => {
    expect(loopPlayhead(0.25, 2)).toBeCloseTo(0.25);
    expect(loopPlayhead(2.25, 2)).toBeCloseTo(0.25);
    expect(loopPlayhead(-0.1, 2)).toBeCloseTo(1.9);
  });
});
