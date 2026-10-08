import { describe, expect, it } from 'vitest';
import { COF_MAX_RIM_DOTS, COF_MAX_VARIANTS_PER_PC, cofPcVisibility, cofVariantSlots } from '../src/ui/visuals';

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

describe('cofVariantSlots', () => {
  const opts = { cx: 170, cy: 170, nodeR: 112 };

  it('fans variants of the same root so centers are spaced for tapping', () => {
    const others = [
      { pc: 0, color: '#a', id: 'C', label: 'C' },
      { pc: 0, color: '#b', id: 'Cmaj7', label: 'Cmaj7' },
      { pc: 0, color: '#c', id: 'C6', label: 'C6' },
      { pc: 7, color: '#d', id: 'G', label: 'G' },
    ];
    const slots = cofVariantSlots(others, opts);
    const atC = slots.filter((s) => s.pc === 0).sort((a, b) => a.localRank - b.localRank);
    expect(atC).toHaveLength(3);
    // Pairwise distance between variant centers should clear ~28px finger hit targets.
    for (let i = 0; i < atC.length; i++) {
      for (let j = i + 1; j < atC.length; j++) {
        const dx = atC[i].x - atC[j].x, dy = atC[i].y - atC[j].y;
        expect(Math.hypot(dx, dy)).toBeGreaterThan(28);
      }
    }
  });

  it('marks best overall / best-of-root larger and stronger than worse variants', () => {
    const others = [
      { pc: 7, color: '#a', id: 'G' },
      { pc: 7, color: '#b', id: 'G7' },
      { pc: 5, color: '#c', id: 'F' },
    ];
    const slots = cofVariantSlots(others, opts);
    const g = slots.find((s) => s.id === 'G')!;
    const g7 = slots.find((s) => s.id === 'G7')!;
    const f = slots.find((s) => s.id === 'F')!;
    expect(g.rank).toBe(0);
    expect(g.localRank).toBe(0);
    expect(g7.localRank).toBe(1);
    expect(g.r).toBeGreaterThan(g7.r);
    expect(g.strength).toBeGreaterThan(g7.strength);
    expect(g.strength).toBeGreaterThan(f.strength);
  });

  it('caps variants per pitch class', () => {
    const others = Array.from({ length: 8 }, (_, i) => ({ pc: 0, color: '#x', id: `C${i}` }));
    const slots = cofVariantSlots(others, opts);
    expect(slots.filter((s) => s.pc === 0)).toHaveLength(COF_MAX_VARIANTS_PER_PC);
    // Keeps the best-first ids
    expect(slots.map((s) => s.id).sort()).toEqual(['C0', 'C1', 'C2', 'C3'].sort());
  });

  it('only lays out the top rim suggestions', () => {
    const others = Array.from({ length: 30 }, (_, i) => ({
      pc: i % 12,
      color: '#x',
      id: `s${i}`,
    }));
    const slots = cofVariantSlots(others, opts);
    expect(slots.length).toBeLessThanOrEqual(COF_MAX_RIM_DOTS);
    expect(slots.every((s) => s.rank < COF_MAX_RIM_DOTS)).toBe(true);
    expect(Math.max(...slots.map((s) => s.rank))).toBeLessThan(COF_MAX_RIM_DOTS);
  });
});
