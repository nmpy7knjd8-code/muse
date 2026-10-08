import { describe, expect, it } from 'vitest';
import {
  analyzeRoman, chordNotes, chordSymbol, diatonicChords, key, noteName, parseChord, parseNote, parseRoman, pc,
  romanOf, scaleNotes, spellInKey, detectKey, detectKeys, parseKey, keyName, parseDegreeLabel,
} from '../src/core';

const names = (sym: string) => chordNotes(parseChord(sym)!).map((n) => noteName(n)).join(' ');
const ch = (s: string) => parseChord(s)!;

describe('notes', () => {
  it('parses and spells notes', () => {
    expect(pc(parseNote('C')!)).toBe(0);
    expect(pc(parseNote('F#')!)).toBe(6);
    expect(pc(parseNote('Bb')!)).toBe(10);
    expect(pc(parseNote('E♭')!)).toBe(3);
    expect(pc(parseNote('Cb')!)).toBe(11);
    expect(parseNote('H')).toBeNull();
    expect(parseDegreeLabel('b6')).toBe(8);
    expect(parseDegreeLabel('♯4')).toBe(6);
  });
});

describe('chord parsing & spelling', () => {
  it.each([
    ['C', 'C E G'], ['Cm', 'C Eb G'], ['C#m7', 'C# E G# B'], ['Bbmaj7', 'Bb D F A'], ['F#m7b5', 'F# A C E'],
    ['Bdim7', 'B D F Ab'], ['Ebaug', 'Eb G B'], ['Abm', 'Ab Cb Eb'], ['G7', 'G B D F'], ['Dsus4', 'D G A'],
    ['Asus2', 'A B E'], ['Cø7', 'C Eb Gb Bb'], ['E7#9', 'E G# B D F##'], ['Fmaj7#11', 'F A C E B'], ['Cm(maj7)', 'C Eb G B'],
    ['Gb', 'Gb Bb Db'], ['D9', 'D F# A C E'], ['C6', 'C E G A'], ['Am6', 'A C E F#'],
  ])('%s → %s', (sym, expected) => {
    expect(names(sym)).toBe(expected);
  });
  it('handles slash chords and symbols', () => {
    const c = ch('G7/B');
    expect(noteName(c.bass!)).toBe('B');
    expect(chordSymbol(c)).toBe('G7/B');
    expect(chordSymbol(ch('CΔ7'))).toBe('Cmaj7');
    expect(chordSymbol(ch('C-7'))).toBe('Cm7');
    expect(chordSymbol(ch('Bbm7b5'), true)).toBe('B♭m7♭5');
  });
  it('rejects junk', () => {
    expect(parseChord('Hm')).toBeNull();
    expect(parseChord('Cxyz')).toBeNull();
    expect(parseChord('')).toBeNull();
  });
});

describe('scales & keys', () => {
  it('spells scales with one letter per degree', () => {
    expect(scaleNotes(key('F#', 'major')).map((n) => noteName(n)).join(' ')).toBe('F# G# A# B C# D# E#');
    expect(scaleNotes(key('Eb', 'minor')).map((n) => noteName(n)).join(' ')).toBe('Eb F Gb Ab Bb Cb Db');
    expect(scaleNotes(key('D', 'dorian')).map((n) => noteName(n)).join(' ')).toBe('D E F G A B C');
    expect(scaleNotes(key('F', 'lydian')).map((n) => noteName(n)).join(' ')).toBe('F G A B C D E');
    expect(scaleNotes(key('A', 'harmonicMinor')).map((n) => noteName(n)).join(' ')).toBe('A B C D E F G#');
  });
  it('builds diatonic triads and sevenths', () => {
    expect(diatonicChords(key('C')).map((c) => chordSymbol(c)).join(' ')).toBe('C Dm Em F G Am Bdim');
    expect(diatonicChords(key('C'), true).map((c) => chordSymbol(c)).join(' ')).toBe('Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5');
    expect(diatonicChords(key('A', 'minor')).map((c) => chordSymbol(c)).join(' ')).toBe('Am Bdim C Dm Em F G');
    expect(diatonicChords(key('A', 'harmonicMinor')).map((c) => chordSymbol(c)).join(' ')).toBe('Am Bdim Caug Dm E F G#dim');
  });
  it('spells chromatic notes conventionally in a key', () => {
    expect(noteName(spellInKey(key('C'), 8))).toBe('Ab');
    expect(noteName(spellInKey(key('C'), 10))).toBe('Bb');
    expect(noteName(spellInKey(key('C'), 6))).toBe('F#');
    expect(noteName(spellInKey(key('E'), 0))).toBe('C');
  });
  it('parses key names', () => {
    expect(keyName(parseKey('F# dorian')!)).toBe('F♯ Dorian');
    expect(keyName(parseKey('Am')!)).toBe('A minor');
  });
});

describe('roman numerals', () => {
  const C = key('C');
  const Am = key('A', 'minor');
  it.each([
    ['C', 'I'], ['Dm', 'ii'], ['Em7', 'iii7'], ['F', 'IV'], ['G7', 'V7'], ['Am', 'vi'], ['Bdim', 'vii°'],
    ['Ab', '♭VI'], ['Bb', '♭VII'], ['Fm', 'iv'], ['Db', '♭II'], ['Eb', '♭III'], ['Bm7b5', 'viiø7'], ['Cmaj7', 'Imaj7'],
  ])('%s in C = %s', (sym, rn) => {
    expect(analyzeRoman(ch(sym), C).text).toBe(rn);
  });
  it('labels secondary dominants', () => {
    expect(romanOf(ch('D7'), C)).toBe('V7/V');
    expect(romanOf(ch('E'), C)).toBe('V/vi');
    expect(romanOf(ch('A7'), C)).toBe('V7/ii');
    expect(romanOf(ch('G'), C)).toBe('V');
  });
  it('uses major-relative accidentals in minor keys', () => {
    expect(analyzeRoman(ch('F'), Am).text).toBe('♭VI');
    expect(analyzeRoman(ch('G'), Am).text).toBe('♭VII');
    expect(analyzeRoman(ch('C'), Am).text).toBe('♭III');
    expect(analyzeRoman(ch('E7'), Am).text).toBe('V7');
    expect(analyzeRoman(ch('Dm'), Am).text).toBe('iv');
  });
  it('labels minor borrowed majors as modal colour, not false secondaries', () => {
    const Ebm = key('Eb', 'minor');
    expect(romanOf(ch('Ab'), Ebm)).toBe('IV'); // not V/♭VII
    expect(romanOf(ch('Eb'), Ebm)).toBe('I'); // Picardy, not V/iv
    expect(romanOf(ch('Fb'), Ebm)).toBe('♭II');
    expect(romanOf(ch('D7'), C)).toBe('V7/V'); // true secondaries still win
  });
  it('realises roman numerals as chords', () => {
    const sym = (r: string, k = C) => chordSymbol(parseRoman(r, k)!);
    expect(sym('bVI')).toBe('Ab');
    expect(sym('♭VII7')).toBe('Bb7');
    expect(sym('ii7')).toBe('Dm7');
    expect(sym('V7/V')).toBe('D7');
    expect(sym('vii°7/V')).toBe('F#dim7');
    expect(sym('N6')).toBe('Db');
    expect(sym('iiø7')).toBe('Dm7b5');
    expect(sym('IVmaj7')).toBe('Fmaj7');
    expect(sym('I6/4')).toBe('C');
    expect(sym('bVI', key('E', 'minor'))).toBe('C');
    expect(sym('iv', key('Eb'))).toBe('Abm');
  });
});

describe('key detection', () => {
  const prog = (s: string) => s.split(' ').map((x) => ch(x));
  it.each([
    ['C F G C', 'C major'],
    ['Am Dm E Am', 'A minor'],
    ['G D Em C G', 'G major'],
    ['D A Bm G D', 'D major'],
    ['Em Am B7 Em', 'E minor'],
    ['Bb Eb F7 Bb', 'B♭ major'],
    ['Dm Bb C Dm', 'D minor'],
    ['F#m D A E F#m', 'F♯ minor'],
  ])('%s → %s', (p, expected) => {
    expect(keyName(detectKey(prog(p))!.key)).toBe(expected);
  });
  it('gives a confidence distribution', () => {
    const ranked = detectKeys(prog('C F G C'));
    expect(ranked[0].confidence).toBeGreaterThan(0.5);
    expect(ranked.reduce((s, c) => s + c.confidence, 0)).toBeCloseTo(1, 5);
  });
  it('uses melody notes', () => {
    // A natural-minor melody ending on A
    expect(keyName(detectKey([], [69, 71, 72, 74, 76, 72, 71, 69])!.key)).toBe('A minor');
    expect(keyName(detectKey([], [60, 62, 64, 65, 67, 65, 64, 62, 60])!.key)).toBe('C major');
  });
});

describe('key detection while writing', () => {
  it('a progression that starts on the tonic keeps that key even if it stops elsewhere', () => {
    expect(keyName(detectKey(['C', 'Am', 'F'].map((x) => parseChord(x)!))!.key)).toBe('C major');
    expect(keyName(detectKey(['G', 'Em', 'C'].map((x) => parseChord(x)!))!.key)).toBe('G major');
  });
});
