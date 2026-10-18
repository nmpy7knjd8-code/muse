import { describe, expect, it } from 'vitest';
import { parseChord, chordSymbol, smoothInversions, smoothness, bassOptions } from '../src/core';

const P = (s: string) => s.split(' ').map((x) => parseChord(x)!);
const syms = (cs: ReturnType<typeof P>) => cs.map((c) => chordSymbol(c)).join(' ');

describe('smooth it — auto-inversions (idea 8)', () => {
  it('offers root, 3rd, 5th (and 7th) basses; keeps an explicit slash bass fixed', () => {
    expect(bassOptions(parseChord('C')!).length).toBe(3);
    expect(bassOptions(parseChord('G7')!).length).toBe(4);
    expect(bassOptions(parseChord('C/E')!)).toHaveLength(1);
  });
  it('turns I–V–vi–IV into a walking bass line and scores it smoother', () => {
    const r = smoothInversions(P('C G Am F'));
    expect(syms(r.chords)).toBe('C G/B Am F');
    expect(r.changed).toEqual([1]);
    expect(r.after).toBeGreaterThan(r.before);
    expect(r.bassLine).toEqual(['C', 'B', 'A', 'F']);
  });
  it('first and last chords stay in root position; never gets worse', () => {
    for (const s of ['C F G C', 'Am Dm E7 Am', 'C Em F G Am F G C', 'Dm7 G7 Cmaj7 A7']) {
      const r = smoothInversions(P(s));
      expect(r.chords[0]!.bass).toBeUndefined();
      expect(r.chords[r.chords.length - 1]!.bass).toBeUndefined();
      expect(r.after).toBeGreaterThanOrEqual(r.before);
      expect(r.chords.map((c) => c.quality)).toEqual(P(s).map((c) => c.quality));
    }
  });
  it('smoothness is 0..100 and a stepwise line beats leaps', () => {
    const leap = smoothness(P('C F#  Bb E'.replace(/\s+/g, ' ')));
    const step = smoothness(P('C G/B Am G'));
    expect(step).toBeGreaterThan(leap);
    expect(step).toBeLessThanOrEqual(100);
    expect(leap).toBeGreaterThanOrEqual(0);
    expect(smoothness(P('C'))).toBe(100);
  });
});
