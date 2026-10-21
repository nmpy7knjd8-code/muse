import { describe, expect, it } from 'vitest';
import { SONG_CATALOG, chordSymbol, key, loopRange, nextTempo, parseChord, parseRoman, songMatches, stringLabel, tunerReading, tuningById } from '../src/core';
const C = (s: string) => parseChord(s)!;

describe('song catalogue (#21)', () => {
  it('every entry parses in its key', () => {
    for (const s of SONG_CATALOG) for (const r of s.roman) expect(parseRoman(r, key(s.key, s.mode)), `${s.title} ${r}`).not.toBeNull();
  });
  it('matches key-independently, including rotations', () => {
    const m = songMatches([C('E'), C('B'), C('C#m'), C('A')], key('E', 'major'));
    const same = m.filter((x) => x.kind === 'same').map((x) => x.song.title);
    expect(same).toContain('Let It Be');
    expect(same).toContain('Despacito');
    expect(m.find((x) => x.song.title === 'Let It Be')!.inMyKey.map((c) => chordSymbol(c))).toEqual(['E', 'B', 'C#m', 'A']);
  });
  it('minor loops find minor songs; tuning marks easy originals', () => {
    const m = songMatches([C('Em'), C('C'), C('G'), C('D')], key('E', 'minor'), tuningById('standard'));
    const z = m.find((x) => x.song.title === 'Zombie')!;
    expect(z.kind).toBe('same');
    expect(z.easy).toBe(true);
    expect(songMatches([C('C')], key('C', 'major'))).toEqual([]);
  });
});

describe('tuner (#22)', () => {
  it('finds the nearest string of the selected tuning', () => {
    const d = tuningById('dropD');
    expect(tunerReading(38.02, d)).toMatchObject({ string: 0, state: 'in' });
    expect(tunerReading(37.7, d)).toMatchObject({ string: 0, state: 'flat' });
    expect(tunerReading(40, tuningById('standard')).state).toBe('in');
    expect(tunerReading(40, d, 0)).toMatchObject({ string: 0, state: 'sharp', cents: 200 });
    expect(stringLabel(d, 0)).toBe('6 · D (low)');
  });
});

describe('tempo ramp + loop range (#23)', () => {
  it('ramps by accuracy and clamps', () => {
    expect(nextTempo(0.7, 0.9)).toBe(0.75);
    expect(nextTempo(0.7, 0.3)).toBe(0.65);
    expect(nextTempo(0.7, 0.6)).toBe(0.7);
    expect(nextTempo(1, null)).toBe(1);
    expect(nextTempo(0.4, 0)).toBe(0.4);
  });
  it('loop range picks inclusive bars in any order', () => {
    expect(loopRange([1, 2, 3, 4, 5], 3, 1)).toEqual({ items: [2, 3, 4], from: 1, to: 3 });
    expect(loopRange([1, 2, 3], null, null).items).toEqual([1, 2, 3]);
    expect(loopRange([1, 2, 3], 2, null).items).toEqual([3]);
  });
});
