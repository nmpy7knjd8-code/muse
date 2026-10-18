import { describe, expect, it } from 'vitest';
import { loadKB } from './helpers';
import { SuggestionEngine, key, makeEarQuestion, earMoods, moodShare, updateEarStats, parseEarStats, weakestMoods, EMPTY_EAR_STATS, chordSymbol } from '../src/core';

const eng = new SuggestionEngine(loadKB('theory_kb.json'));
const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

describe('mood A/B ear trainer (idea 2)', () => {
  it('offers several askable moods in major and minor keys', () => {
    expect(earMoods(eng, key('C')).length).toBeGreaterThanOrEqual(4);
    expect(earMoods(eng, key('A', 'minor')).length).toBeGreaterThanOrEqual(3);
  });
  it('the right answer always carries clearly more of the asked mood', () => {
    const rand = seeded(7);
    for (let i = 0; i < 40; i++) {
      const q = makeEarQuestion(eng, key('D'), { rand })!;
      expect(q).toBeTruthy();
      const right = q.options[q.answer], wrong = q.options[1 - q.answer]!;
      expect(right.share).toBeGreaterThan(0);
      expect(wrong.share).toBeLessThanOrEqual(right.share * 0.3 + 1e-9);
      expect(right.symbol).not.toBe(wrong.symbol);
      expect(wrong.moods[0]!.id).not.toBe(q.mood);
      expect(chordSymbol(q.context)).toBe('D');
    }
  });
  it('answers land on both A and B, and `avoid` changes the mood when possible', () => {
    const rand = seeded(3);
    const qs = Array.from({ length: 30 }, () => makeEarQuestion(eng, key('C'), { rand })!);
    expect(new Set(qs.map((q) => q.answer)).size).toBe(2);
    const q = makeEarQuestion(eng, key('C'), { rand, mood: undefined, avoid: qs[0]!.mood })!;
    expect(q.mood).not.toBe(qs[0]!.mood);
  });
  it('hard mode allows closer pairs than easy', () => {
    expect(earMoods(eng, key('C'), 'hard').length).toBeGreaterThanOrEqual(earMoods(eng, key('C'), 'easy').length);
  });
  it('tracks streaks, best and per-mood accuracy; survives bad storage', () => {
    let s = EMPTY_EAR_STATS;
    s = updateEarStats(s, 'dreamy', true); s = updateEarStats(s, 'dreamy', true); s = updateEarStats(s, 'dark', false);
    s = updateEarStats(s, 'dark', false);
    expect(s).toMatchObject({ asked: 4, right: 2, streak: 0, best: 2 });
    expect(weakestMoods(s)[0]).toBe('dark');
    expect(parseEarStats(JSON.stringify(s))).toEqual(s);
    expect(parseEarStats('{nope')).toEqual(EMPTY_EAR_STATS);
    expect(parseEarStats(JSON.stringify({ asked: 2, right: 9, byMood: { x: { asked: 1, right: 5 } } }))).toMatchObject({ right: 2, byMood: { x: { right: 1 } } });
    expect(moodShare([{ id: 'a', weight: 1 }, { id: 'b', weight: 3 }], 'b')).toBe(0.75);
  });
});
