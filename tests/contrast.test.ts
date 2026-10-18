import { describe, expect, it } from 'vitest';
import { contrastRatio, inkOn, legibleOn } from '../src/core';

describe('mood chip contrast (audit #19)', () => {
  const colours = ['#8D6E63', '#A1887F', '#795548', '#FFB74D', '#CE93D8', '#4FC3F7', '#E57373', '#9E9E9E', '#5C6BC0', '#26A69A'];
  it('tag ink always reaches WCAG AA on the mood colour', () => {
    for (const c of colours) expect(contrastRatio(inkOn(c), c)).toBeGreaterThanOrEqual(4.5);
  });
  it('preset chip text is lifted to AA on the dark panel without changing good colours', () => {
    for (const c of colours) expect(contrastRatio(legibleOn(c, '#1b1a22'), '#1b1a22')).toBeGreaterThanOrEqual(4.5);
    expect(legibleOn('#ECEAF4', '#1b1a22')).toBe('#ECEAF4');
  });
});
