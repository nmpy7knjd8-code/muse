import { describe, expect, it } from 'vitest';
import { loadKB } from './helpers';
import { SuggestionEngine, key, parseChord, recordVote, tasteBonus, rerankByTaste, describeTaste, parseTaste, romanFunction, EMPTY_TASTE } from '../src/core';

const eng = new SuggestionEngine(loadKB('theory_kb.json'));

describe('taste learning (idea 9)', () => {
  const sugs = eng.suggestChords({ key: key('C'), progression: [parseChord('C')!], limit: 20, tensionStyle: null });
  it('strips roman numerals to their function', () => {
    expect(romanFunction('IVmaj7')).toBe('IV');
    expect(romanFunction('♭VII7')).toBe('♭VII');
    expect(romanFunction('V7/V')).toBe('V/V');
    expect(romanFunction('vi')).toBe('vi');
  });
  it('no votes → no change in order', () => {
    expect(rerankByTaste(sugs, EMPTY_TASTE)).toBe(sugs);
    expect(tasteBonus(EMPTY_TASTE, sugs[0]!)).toBe(0);
  });
  it('liking maj7 chords lifts maj7 suggestions; disliking a chord sinks it', () => {
    const maj7 = sugs.filter((s) => s.chord.quality === 'maj7');
    expect(maj7.length).toBeGreaterThan(0);
    let t = EMPTY_TASTE;
    for (const s of maj7.slice(0, 2)) for (let i = 0; i < 3; i++) t = recordVote(t, s, true);
    const before = sugs.indexOf(maj7[maj7.length - 1]!);
    const after = rerankByTaste(sugs, t).indexOf(maj7[maj7.length - 1]!);
    expect(after).toBeLessThan(before);
    const top = sugs[0]!;
    let d = EMPTY_TASTE;
    for (let i = 0; i < 6; i++) d = recordVote(d, top, false);
    expect(tasteBonus(d, top)).toBeLessThan(-0.3);
    expect(rerankByTaste(sugs, d).indexOf(top)).toBeGreaterThan(0);
  });
  it('bonus grows with confidence and stays within −1..1', () => {
    let t = EMPTY_TASTE;
    const s = sugs[3]!;
    t = recordVote(t, s, true);
    const one = tasteBonus(t, s);
    for (let i = 0; i < 30; i++) t = recordVote(t, s, true);
    const many = tasteBonus(t, s);
    expect(many).toBeGreaterThan(one);
    expect(many).toBeLessThanOrEqual(1);
  });
  it('describes likes/dislikes and survives storage round-trips and junk', () => {
    let t = EMPTY_TASTE;
    const maj7 = sugs.find((s) => s.chord.quality === 'maj7')!;
    for (let i = 0; i < 3; i++) t = recordVote(t, maj7, true);
    const d = describeTaste(t);
    expect(d.likes.some((x) => /major 7th/.test(x))).toBe(true);
    expect(parseTaste(JSON.stringify(t))).toEqual(t);
    expect(parseTaste('nope')).toEqual(EMPTY_TASTE);
    expect(parseTaste(JSON.stringify({ votes: 2, up: 7, quality: { maj7: 99, bad: 'x' } }))).toMatchObject({ up: 2, quality: { maj7: 12 } });
  });
});
