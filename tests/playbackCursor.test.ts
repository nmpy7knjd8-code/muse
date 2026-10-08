import { describe, expect, it } from 'vitest';
import {
  activeAt, timelineEvents, setSlotChord, insertNote, parseChord,
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
