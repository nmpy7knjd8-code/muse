import { describe, expect, it } from 'vitest';
import {
  SESSION_KEY, chordSymbol, defaultPartMeters, deserializeSession, parseChord, parseNote, replaceKeepingLocked,
  serializeSession, transposeSlots, type TimelineSlot,
} from '../src/core';

const bar = (sym: string, extra: Partial<TimelineSlot> = {}): TimelineSlot => ({ chord: parseChord(sym), notes: [], ...extra });

describe('session autosave (audit #1)', () => {
  it('round-trips slots, groove and part meters', () => {
    const slots: TimelineSlot[] = [
      bar('C', { notes: [{ midi: 72, beat: 0 }, { midi: null, beat: 2, dur: 1 }], locked: true }),
      bar('Bb/D', { bass: [{ midi: 38, beat: 0 }] }),
      { chord: null, notes: [{ midi: 74, beat: 1 }], drums: [{ voice: 'kick', beat: 0, vel: 0.9 }] },
    ];
    const grooveHits = [{ voice: 'snare' as const, beat: 1 }];
    const partMeters = defaultPartMeters({ num: 3, den: 4 });
    const back = deserializeSession(serializeSession({ slots, grooveHits, partMeters }, 123));
    expect(back).not.toBeNull();
    expect(back!.slots).toEqual(slots);
    expect(back!.grooveHits).toEqual(grooveHits);
    expect(back!.partMeters).toEqual(partMeters);
    expect(back!.savedAt).toBe(123);
    expect(SESSION_KEY).toBe('muse.session');
  });
  it('rejects corrupt or foreign data and drops bad bars', () => {
    expect(deserializeSession(null)).toBeNull();
    expect(deserializeSession('{oops')).toBeNull();
    expect(deserializeSession(JSON.stringify({ v: 99, slots: [] }))).toBeNull();
    const raw = JSON.stringify({ v: 1, slots: [
      { chord: { root: { letter: 0, acc: 0 }, quality: 'maj' }, notes: [] },
      { chord: { root: { letter: 9, acc: 0 }, quality: 'maj' }, notes: [] }, // bad letter
      { chord: { root: { letter: 1, acc: 0 }, quality: 'nope' }, notes: [] }, // bad quality
      { chord: null, notes: [{ midi: 'x', beat: 0 }, { midi: 60, beat: 0 }] }, // bad note filtered
      'junk',
    ], grooveHits: 'nope', partMeters: { chords: 1 } });
    const s = deserializeSession(raw)!;
    expect(s.slots).toHaveLength(2);
    expect(s.slots[1]!.notes).toEqual([{ midi: 60, beat: 0 }]);
    expect(s.grooveHits).toEqual([]);
    expect(s.partMeters).toBeUndefined();
  });
});

describe('transpose on key change', () => {
  it('moves chords with key-correct spelling and shifts melody/bass the short way', () => {
    const slots = [bar('C', { notes: [{ midi: 64, beat: 0 }] }), bar('F/A', { bass: [{ midi: 45, beat: 0 }] }), bar('G7'), bar('Am')];
    const out = transposeSlots(slots, parseNote('C')!, parseNote('Eb')!);
    expect(out.map((s) => chordSymbol(s.chord!))).toEqual(['Eb', 'Ab/C', 'Bb7', 'Cm']);
    expect(out[0]!.notes[0]!.midi).toBe(67);
    expect(out[1]!.bass![0]!.midi).toBe(48);
    const down = transposeSlots(slots, parseNote('C')!, parseNote('A')!);
    expect(down.map((s) => chordSymbol(s.chord!))).toEqual(['A', 'D/F#', 'E7', 'F#m']);
    expect(down[0]!.notes[0]!.midi).toBe(61); // −3, not +9
  });
});

describe('journey "Use as progression" keeps locked bars (audit #18)', () => {
  it('locked bars stay put, journey fills the rest', () => {
    const cur = [bar('C'), bar('F', { locked: true }), bar('G'), bar('Am', { locked: true })];
    const inc = ['Dm', 'Em', 'Bdim', 'E7', 'A'].map((x) => bar(x));
    const out = replaceKeepingLocked(cur, inc);
    expect(out.map((s) => chordSymbol(s.chord!))).toEqual(['Dm', 'F', 'Em', 'Am', 'Bdim', 'E7', 'A']);
    expect(out[1]!.locked && out[3]!.locked).toBe(true);
    expect(replaceKeepingLocked([], inc)).toHaveLength(5);
  });
});
