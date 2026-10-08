import { describe, expect, it } from 'vitest';
import { parseChord, key, rootMotion, colourPaletteChords, degreeRole, nrtTag, chordSymbol } from '../src/core';

const ch = (s: string) => parseChord(s)!;

describe('rootMotion', () => {
  it('marks higher / lower / same roots with functional 4ths/5ths', () => {
    expect(rootMotion(ch('C'), ch('G'))).toMatchObject({ dir: '↑', label: '↑ higher · 5th' });
    expect(rootMotion(ch('C'), ch('F'))).toMatchObject({ dir: '↑', label: '↑ higher · 4th' });
    expect(rootMotion(ch('C'), ch('D')).dir).toBe('↑');
    expect(rootMotion(ch('C'), ch('Bb')).dir).toBe('↓');
    expect(rootMotion(ch('C'), ch('C'))).toMatchObject({ dir: '→', label: '→ same root' });
    expect(rootMotion(ch('C'), ch('Am')).label).toBe('↓ lower · 3rd');
    expect(rootMotion(ch('C'), ch('Bb')).label).toMatch(/lower/i);
    expect(rootMotion(ch('C'), ch('D')).label).toMatch(/higher/i);
  });
});

describe('palette extras', () => {
  it('exposes borrowed / secondary colour chords in major', () => {
    const cs = colourPaletteChords(key('C')).map((c) => chordSymbol(c));
    expect(cs).toContain('Bb'); // bVII
    expect(cs).toContain('Ab'); // bVI
    expect(cs.some((s) => s.includes('D') || s.includes('7'))).toBe(true);
  });
  it('tags single-step NRT and degree roles', () => {
    expect(nrtTag(ch('C'), ch('Am'))).toBe('R');
    expect(nrtTag(ch('C'), ch('Cm'))).toBe('P');
    expect(degreeRole(1)).toBe('home');
    expect(degreeRole(5)).toBe('pulls home');
    expect(degreeRole(4)).toBe('builds toward home');
  });
});
