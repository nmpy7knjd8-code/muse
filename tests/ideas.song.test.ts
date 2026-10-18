import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadKB } from './helpers';
import { SuggestionEngine, normalizeArtists, parseChordSheet, parseChordLoose, analyzeSong, findLoop, chordSymbol, key } from '../src/core';

const eng = new SuggestionEngine(loadKB('theory_kb.json'));
const artists = normalizeArtists(JSON.parse(readFileSync(resolve(process.cwd(), 'public/artists.json'), 'utf8')))!;
const syms = (t: string) => parseChordSheet(t).chords.map((c) => chordSymbol(c));

describe('song analysis from a chord sheet (idea 3)', () => {
  it('reads chords-over-lyrics and ignores lyric lines (even ones with "A" in them)', () => {
    const sheet = `[Verse]
C        G
When I find myself in times of trouble
Am          F
A voice comes to me, A light in the dark
[Chorus]
C  G  F  C   (x2)`;
    const p = parseChordSheet(sheet);
    expect(p.chords.map((c) => chordSymbol(c))).toEqual(['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'C', 'C', 'G', 'F', 'C']);
    expect(p.sections.map((s) => [s.name, s.start, s.end])).toEqual([['Verse', 0, 4], ['Chorus', 4, 12]]);
  });
  it('handles inline ChordPro, bar charts, % repeats and odd extensions', () => {
    expect(syms('[Am]Hello [F]darkness my [C]old [G]friend')).toEqual(['Am', 'F', 'C', 'G']);
    expect(syms('| Dm7 | G7 | Cmaj7 | % |')).toEqual(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);
    expect(chordSymbol(parseChordLoose('Am11')!)).toBe('Am9');
    expect(chordSymbol(parseChordLoose('G13')!)).toBe('G9');
    expect(parseChordLoose('N.C.')).toBeNull();
    expect(syms('Hello there, how are you')).toEqual([]);
  });
  it('finds loops', () => {
    expect(findLoop(parseChordSheet('C G Am F C G Am F C G Am F').chords)).toBe(4);
    expect(findLoop(parseChordSheet('C F G Am Dm E7').chords)).toBeNull();
  });
  it('analyses key, moods, tension, borrowed chords and closest artists', () => {
    const a = analyzeSong(eng, parseChordSheet('C G Am F C G F C Fm C').chords, artists)!;
    expect(a.key).toEqual(key('C'));
    expect(a.levels).toHaveLength(10);
    expect(a.moods.length).toBeGreaterThan(2);
    expect(a.borrowed.map((b) => b.symbol)).toEqual(['Fm']);
    expect(a.artists).toHaveLength(3);
    expect(a.artists[0]!.score).toBeGreaterThanOrEqual(a.artists[1]!.score);
    expect(a.summary).toMatch(/C major/);
  });
  it('a dark, dissonant minor sheet matches darker artists than a bright pop loop', () => {
    const dark = analyzeSong(eng, parseChordSheet('Em Cdim7 B7 Em Fmaj7#11 Em Bb Em B7b9').chords, artists)!;
    const pop = analyzeSong(eng, parseChordSheet('G D Em C G D C G').chords, artists)!;
    const lean = (x: typeof dark) => x.artists[0]!.artist.polarities.find((p) => p.id === 'light_dark')?.lean ?? 0.5;
    expect(dark.polarity.light_dark).toBeGreaterThan(pop.polarity.light_dark!);
    expect(lean(dark)).toBeGreaterThanOrEqual(lean(pop));
  });
});

describe('song analysis — minor-key dominants', () => {
  it('treats the harmonic-minor V7 as home, not an outside colour', () => {
    const a = analyzeSong(eng, parseChordSheet('Am Dm E7 Am F G E7 Am').chords, artists)!;
    expect(a.key).toEqual(key('A', 'minor'));
    expect(a.borrowed).toEqual([]);
  });
});
