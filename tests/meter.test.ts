import { describe, expect, it } from 'vitest';
import {
  parseMeter, beatsPerBar, strongBeats, midiTimeSigBytes, timeSigLabel,
  beatSecFromBpm, clampBpm, DEFAULT_BPM,
  clampSlotsToMeter, insertNote, setSlotChord, timelineEvents, toMidiTimeline,
  parseChord, loadTryIt, normalizeArtists,
} from '../src/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ch = (s: string) => parseChord(s)!;

describe('parseMeter', () => {
  it('reads the first N/D from prose meter notes', () => {
    expect(parseMeter('7/8 grouped 2+2+3, with a 4/4 bar on the final chord')).toEqual({ num: 7, den: 8 });
    expect(parseMeter('4/4 with 16ths accented 7+7+2 in each bar')).toEqual({ num: 4, den: 4 });
    expect(parseMeter('Play chords as bars of 9/8, 8/8, 7/8')).toEqual({ num: 9, den: 8 });
    expect(parseMeter('no numbers here')).toBeNull();
  });
  it('encodes MIDI time-signature meta', () => {
    expect(midiTimeSigBytes({ num: 3, den: 4 }).slice(3, 5)).toEqual([3, 2]);
    expect(midiTimeSigBytes({ num: 7, den: 8 }).slice(3, 5)).toEqual([7, 3]);
    expect(timeSigLabel({ num: 5, den: 4 })).toBe('5/4');
  });
  it('knows strong beats for compound and odd meters', () => {
    expect(strongBeats({ num: 4, den: 4 })).toEqual([0, 2]);
    expect(strongBeats({ num: 6, den: 8 })).toEqual([0, 3]);
    expect(strongBeats({ num: 7, den: 8 })).toEqual([0, 2, 4]);
    expect(beatsPerBar({ num: 3, den: 4 })).toBe(3);
  });
  it('maps BPM to beat seconds for playback', () => {
    expect(clampBpm(120)).toBe(120);
    expect(clampBpm(10)).toBe(40);
    expect(beatSecFromBpm(120)).toBeCloseTo(0.5);
    expect(beatSecFromBpm(DEFAULT_BPM)).toBeCloseTo(60 / DEFAULT_BPM);
  });
});

describe('timeline respects meter', () => {
  it('fills 3 beats per bar in 3/4 then spills', () => {
    let slots = setSlotChord([], 0, ch('C'));
    for (const m of [60, 62, 64, 65]) slots = insertNote(slots, m, undefined, 3).slots;
    expect(slots[0].notes).toHaveLength(3);
    expect(slots[1].notes).toHaveLength(1);
    const clamped = clampSlotsToMeter(slots, 2);
    expect(clamped[0].notes).toHaveLength(2);
  });
  it('playback length scales with beats per bar and BPM', () => {
    const slots = setSlotChord([], 0, ch('C'));
    const a = timelineEvents(slots, { timeSig: { num: 4, den: 4 }, beatSec: 0.5 });
    const b = timelineEvents([{ chord: ch('C'), notes: [{ midi: 60, beat: 0 }] }], { timeSig: { num: 3, den: 4 }, beatSec: 0.5 });
    expect(b.total).toBe(1.5);
    expect(a.total).toBeCloseTo(0.5 * 2.14); // chord-only step scales with beat
    const fast = timelineEvents(slots, { timeSig: { num: 4, den: 4 }, bpm: 180 });
    const slow = timelineEvents(slots, { timeSig: { num: 4, den: 4 }, bpm: 90 });
    expect(fast.total).toBeLessThan(slow.total);
    const mid = toMidiTimeline(slots, 90, { num: 5, den: 4 });
    expect(mid[0]).toBe(0x4d);
  });
});

describe('Artist Lens try-it meters', () => {
  it('loadTryIt attaches a parsed time signature when present', () => {
    const raw = JSON.parse(readFileSync(resolve('public/artists.json'), 'utf8'));
    const file = normalizeArtists(raw)!;
    const withMeter = file.artists.flatMap((a) => a.tryIt.map((t) => ({ a, t }))).find((x) => x.t.meter?.includes('/'));
    expect(withMeter).toBeTruthy();
    const l = loadTryIt(withMeter!.t)!;
    expect(l.timeSig).not.toBeNull();
    expect(l.meterNote).toBe(withMeter!.t.meter);
  });
});
