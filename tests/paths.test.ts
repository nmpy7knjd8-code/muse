import { describe, expect, it } from 'vitest';
import { loadKB } from './helpers';
import { SuggestionEngine, key, parseChord, suggestChordPaths, suggestNotePaths } from '../src/core';

const kb = loadKB('theory_kb.json');
const eng = new SuggestionEngine(kb);
const ch = (s: string) => parseChord(s)!;

describe('short paths', () => {
  it('suggests 2- and 3-chord paths with connecting melody', () => {
    const two = suggestChordPaths(eng, { key: key('C'), progression: [ch('C')], steps: 2, limit: 3, adventure: 0.3 });
    expect(two.length).toBeGreaterThan(0);
    expect(two[0].chords).toHaveLength(2);
    expect(two[0].links).toHaveLength(2);
    expect(two[0].symbols.join(' ')).not.toContain('C ');
    const three = suggestChordPaths(eng, { key: key('C'), progression: [ch('C')], steps: 3, limit: 2, adventure: 0.3 });
    expect(three[0]?.chords).toHaveLength(3);
    expect(three[0]?.linkNames.length).toBe(3);
  });
  it('suggests short melody lines over a chord', () => {
    const lines = suggestNotePaths(eng, { key: key('C'), melody: [60], chord: ch('C'), steps: 2, limit: 3 });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].midis).toHaveLength(2);
    expect(lines[0].names).toHaveLength(2);
  });
});
