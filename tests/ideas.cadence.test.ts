import { describe, expect, it } from 'vitest';
import { loadKB } from './helpers';
import { SuggestionEngine, key, findApproaches, approachKind, parseChord, chordSymbol } from '../src/core';

const eng = new SuggestionEngine(loadKB('theory_kb.json'));
const C = (s: string) => parseChord(s)!;

describe('backward cadence finder (idea 5)', () => {
  it('classifies the final move', () => {
    expect(approachKind(C('G7'), C('C'))).toBe('dominant');
    expect(approachKind(C('Bdim7'), C('C'))).toBe('leading');
    expect(approachKind(C('F'), C('C'))).toBe('plagal');
    expect(approachKind(C('Fm'), C('C'))).toBe('minorPlagal');
    expect(approachKind(C('Db7'), C('C'))).toBe('tritone');
    expect(approachKind(C('Bb'), C('C'))).toBe('backdoor');
    expect(approachKind(C('Ab'), C('C'))).toBe('lift');
    expect(approachKind(C('E7'), C('Am'))).toBe('dominant');
  });
  it('every approach ends on the target, has the requested length and a distinct kind', () => {
    for (const L of [1, 2, 3]) {
      const res = findApproaches(eng, key('C'), C('C'), { length: L });
      expect(res.length).toBeGreaterThanOrEqual(3);
      for (const a of res) {
        expect(a.chords).toHaveLength(L + 1);
        expect(chordSymbol(a.chords[L]!)).toBe('C');
        expect(a.levels).toHaveLength(L + 1);
      }
      expect(new Set(res.map((a) => a.kind)).size).toBe(res.length);
    }
  });
  it('to land on home in C, the dominant pull is among the best and lands with real release', () => {
    const res = findApproaches(eng, key('C'), C('C'), { length: 2 });
    const dom = res.find((a) => a.kind === 'dominant');
    expect(dom).toBeTruthy();
    expect(res.indexOf(dom!)).toBeLessThan(3);
    expect(dom!.release).toBeGreaterThan(0.3);
    // tension builds then drops onto the target
    expect(dom!.levels[2]!).toBeLessThan(Math.max(dom!.levels[0]!, dom!.levels[1]!));
  });
  it('works for a non-tonic target (landing on vi with its own dominant)', () => {
    const res = findApproaches(eng, key('C'), C('Am'), { length: 2 });
    expect(res.some((a) => a.kind === 'dominant' && /^E/.test(chordSymbol(a.chords[1]!)))).toBe(true);
  });
});
