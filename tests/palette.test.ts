import { describe, expect, it } from 'vitest';
import {
  parseChord, key, rootMotion, colourPaletteChords, openPaletteChords, secondaryPaletteChords,
  degreeRole, nrtTag, chordSymbol,
} from '../src/core';

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
  it('keeps Extra colour as borrowed / modal (not secondaries)', () => {
    const cs = colourPaletteChords(key('C')).map((c) => chordSymbol(c));
    expect(cs).toContain('Bb'); // bVII
    expect(cs).toContain('Ab'); // bVI
    expect(cs).toContain('Fm'); // iv
    expect(cs).not.toContain('D7'); // secondaries have their own row
  });
  it('gives minor Extra colour non-diatonic options (not just V / VII)', () => {
    const cs = colourPaletteChords(key('Eb', 'minor')).map((c) => chordSymbol(c));
    // natural-minor ♭VI/♭VII are already In this key — Extra should add real colour
    expect(cs).toEqual(expect.arrayContaining(['Ab', 'Bb', 'D'])); // IV, V, VII
    expect(cs.some((s) => s === 'Fb' || s === 'E')).toBe(true); // bII Neapolitan
    expect(cs).toContain('Eb'); // Picardy I
    expect(cs).not.toContain('Db'); // diatonic bVII stays in In this key
  });
  it('exposes open colour (sus / add / 6) and secondaries', () => {
    const open = openPaletteChords(key('C')).map((c) => chordSymbol(c));
    expect(open).toEqual(expect.arrayContaining(['Cadd9', 'Csus2', 'Csus4', 'C6', 'Fadd9', 'G7sus4']));
    const sec = secondaryPaletteChords(key('C')).map((c) => chordSymbol(c));
    expect(sec).toEqual(expect.arrayContaining(['D7', 'E7', 'A7', 'C7', 'B7']));
    const openMin = openPaletteChords(key('A', 'minor')).map((c) => chordSymbol(c));
    expect(openMin.some((s) => s.startsWith('Am') || s.startsWith('A'))).toBe(true);
    const secMin = secondaryPaletteChords(key('Eb', 'minor')).map((c) => chordSymbol(c));
    expect(secMin.length).toBeGreaterThanOrEqual(3);
  });
  it('tags single-step NRT and degree roles', () => {
    expect(nrtTag(ch('C'), ch('Am'))).toBe('R');
    expect(nrtTag(ch('C'), ch('Cm'))).toBe('P');
    expect(degreeRole(1)).toBe('home');
    expect(degreeRole(5)).toBe('pulls home');
    expect(degreeRole(4)).toBe('builds toward home');
  });
});
