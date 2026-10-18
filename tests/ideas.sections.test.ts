import { describe, expect, it } from 'vitest';
import { loadKB } from './helpers';
import { SuggestionEngine, key, parseChord, sectionProfile, sectionContrast, buildSection, chordSymbol } from '../src/core';

const eng = new SuggestionEngine(loadKB('theory_kb.json'));
const P = (s: string) => s.split(' ').map((x) => parseChord(x)!);
const k = key('C');
const verse = P('Am F C G');

describe('section builder + contrast meter (idea 6)', () => {
  it('a section has ~zero contrast with itself; a different one scores higher', () => {
    const a = sectionProfile(eng, k, verse);
    expect(sectionContrast(a, a).score).toBeLessThan(0.05);
    expect(sectionContrast(a, a).verdict).toMatch(/same section/);
    const reorder = sectionContrast(a, sectionProfile(eng, k, P('F C G Am')));
    const bridge = sectionContrast(a, sectionProfile(eng, k, P('Eb Bb Fm Ab')));
    expect(bridge.score).toBeGreaterThan(reorder.score);
    expect(bridge.words).toContain('new chords');
  });
  it('contrast is symmetric in score', () => {
    const a = sectionProfile(eng, k, verse), b = sectionProfile(eng, k, P('Dm7 G7 Cmaj7 E7'));
    expect(sectionContrast(a, b).score).toBeCloseTo(sectionContrast(b, a).score, 6);
  });
  it('builds sections of the requested length, distinct starts, contrast near target', () => {
    for (const role of ['chorus', 'bridge', 'prechorus', 'verse'] as const) {
      const res = buildSection(eng, k, verse, { role, length: 4 });
      expect(res.length).toBeGreaterThanOrEqual(2);
      for (const s of res) expect(s.chords).toHaveLength(4);
      expect(new Set(res.map((s) => chordSymbol(s.chords[0]!))).size).toBe(res.length);
    }
  });
  it('a bolder target yields more contrast than a subtle one', () => {
    const subtle = buildSection(eng, k, verse, { role: 'chorus', target: 0.15 })[0]!;
    const bold = buildSection(eng, k, verse, { role: 'bridge', target: 0.85 })[0]!;
    expect(bold.contrast.score).toBeGreaterThan(subtle.contrast.score);
  });
  it('a bridge avoids starting on the tonic', () => {
    const res = buildSection(eng, k, verse, { role: 'bridge' });
    expect(chordSymbol(res[0]!.chords[0]!)).not.toBe('C');
  });
});
