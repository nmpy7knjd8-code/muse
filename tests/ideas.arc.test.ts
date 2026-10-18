import { describe, expect, it } from 'vitest';
import { loadKB } from './helpers';
import { SuggestionEngine, key, resampleArc, arcToChords, arcFit, arcLevel, levelToArc, ARC_PRESETS, chordSymbol } from '../src/core';

const eng = new SuggestionEngine(loadKB('theory_kb.json'));

describe('tension arc → chords (idea 1)', () => {
  it('resamples a stroke to n bar targets', () => {
    const t = resampleArc([{ x: 0, y: 0 }, { x: 1, y: 1 }], 4);
    expect(t).toHaveLength(4);
    expect(t[0]).toBeCloseTo(0.125, 2);
    expect(t[3]).toBeCloseTo(0.875, 2);
    expect(resampleArc([], 3)).toEqual([0.3, 0.3, 0.3]);
    expect(levelToArc(arcLevel(0.6))).toBeCloseTo(0.6, 5);
  });
  it('a rising arc produces rising measured tension, ending tenser than it starts', () => {
    const targets = Array.from({ length: 6 }, (_, i) => ARC_PRESETS.build!.shape(i / 5));
    const steps = arcToChords(eng, key('C'), targets);
    expect(steps).toHaveLength(6);
    expect(steps[5]!.level).toBeGreaterThan(steps[0]!.level);
    expect(arcFit(steps)).toBeGreaterThan(0.3);
  });
  it('a calm-then-home arc starts on the tonic and changes chord every bar', () => {
    const steps = arcToChords(eng, key('G'), [0.1, 0.5, 0.8, 0.1]);
    expect(chordSymbol(steps[0]!.chord)).toBe('G');
    for (let i = 1; i < steps.length; i++) expect(steps[i]!.symbol).not.toBe(steps[i - 1]!.symbol);
    expect(steps[3]!.level).toBeLessThan(steps[2]!.level);
  });
});
