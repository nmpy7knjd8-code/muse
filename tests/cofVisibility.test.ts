import { describe, expect, it } from 'vitest';
import { cofPcVisibility } from '../src/ui/visuals';

describe('cofPcVisibility', () => {
  it('with no suggestions, every pitch class is fully visible', () => {
    const v = cofPcVisibility([]);
    for (let p = 0; p < 12; p++) expect(v.get(p)).toBe(1);
  });

  it('ranks best-first roots brightest and leaves unranked dim', () => {
    // C (0) best, G (7) second, F (5) third — others unranked
    const v = cofPcVisibility([{ pc: 0 }, { pc: 7 }, { pc: 5 }, { pc: 0 }]);
    expect(v.get(0)!).toBeGreaterThan(v.get(7)!);
    expect(v.get(7)!).toBeGreaterThan(v.get(5)!);
    expect(v.get(5)!).toBeGreaterThan(v.get(2)!); // unranked D
    expect(v.get(0)!).toBeCloseTo(1, 5);
    expect(v.get(2)!).toBeLessThan(0.2);
  });

  it('uses the best index when the same pc appears twice', () => {
    const v = cofPcVisibility([{ pc: 9 }, { pc: 2 }, { pc: 9 }]);
    // A appears first → top; D second
    expect(v.get(9)!).toBeGreaterThan(v.get(2)!);
  });
});
