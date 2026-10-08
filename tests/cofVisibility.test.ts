import { describe, expect, it } from 'vitest';
import {
  COF_MAX_RIM_DOTS,
  COF_MAX_VARIANTS_PER_PC,
  COF_VARIANT_RADIAL_STEP,
  cofPcVisibility,
  cofVariantSlots,
  cofVariantTag,
} from '../src/ui/visuals';

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

describe('cofVariantTag', () => {
  it('strips the root and shortens common qualities', () => {
    expect(cofVariantTag('Cmaj7')).toBe('Δ7');
    expect(cofVariantTag('Am')).toBe('m');
    expect(cofVariantTag('G7')).toBe('7');
    expect(cofVariantTag('Bdim')).toBe('°');
    expect(cofVariantTag('F♯aug')).toBe('+');
    expect(cofVariantTag('C')).toBe('');
  });
});

describe('cofVariantSlots', () => {
  const opts = { cx: 260, cy: 260, nodeR: 152 };

  it('stacks variants of the same root on one radial spoke without overlap', () => {
    const others = [
      { pc: 0, color: '#a', id: 'C', label: 'C' },
      { pc: 0, color: '#b', id: 'Cmaj7', label: 'Cmaj7' },
      { pc: 0, color: '#c', id: 'C6', label: 'C6' },
      { pc: 7, color: '#d', id: 'G', label: 'G' },
    ];
    const slots = cofVariantSlots(others, opts);
    const atC = slots.filter((s) => s.pc === 0).sort((a, b) => a.localRank - b.localRank);
    expect(atC).toHaveLength(3);
    // Same spoke angle for every variant of this root.
    expect(atC.every((s) => Math.abs(s.angle - atC[0].angle) < 1e-9)).toBe(true);
    // Best sits nearest the letter; weaker steps outward by the radial step.
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);
    const origin = { x: opts.cx, y: opts.cy };
    expect(dist(atC[0], origin)).toBeLessThan(dist(atC[1], origin));
    expect(dist(atC[1], origin)).toBeLessThan(dist(atC[2], origin));
    expect(dist(atC[0], atC[1])).toBeGreaterThanOrEqual(COF_VARIANT_RADIAL_STEP - 0.01);
    expect(dist(atC[1], atC[2])).toBeGreaterThanOrEqual(COF_VARIANT_RADIAL_STEP - 0.01);
    // Pairwise distance clears finger hit targets.
    for (let i = 0; i < atC.length; i++) {
      for (let j = i + 1; j < atC.length; j++) {
        expect(dist(atC[i], atC[j])).toBeGreaterThan(28);
      }
    }
    expect(atC[1].tag).toBe('Δ7');
    expect(atC[2].tag).toBe('6');
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
    expect(slots.map((s) => s.id).sort()).toEqual(
      Array.from({ length: COF_MAX_VARIANTS_PER_PC }, (_, i) => `C${i}`).sort(),
    );
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
