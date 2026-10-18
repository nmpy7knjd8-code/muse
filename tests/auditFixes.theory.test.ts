import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  parseChord, key, chordSymbol, colourPaletteChords, secondaryPaletteChords, spellWithChords, spellInKey, noteName,
  pianoVoicing, closeVoicings, staffStep, trebleY, chordRarity, moodJourney, SuggestionEngine, normalizeKB, pc,
} from '../src/core';

const ch = (s: string) => parseChord(s)!;
const syms = (cs: ReturnType<typeof colourPaletteChords>) => cs.map((c) => chordSymbol(c));

describe('minor-key palette (audit #3)', () => {
  it('secondaries in A minor aim at real minor-key degrees', () => {
    const sec = syms(secondaryPaletteChords(key('A', 'minor')));
    expect(sec).toEqual(['B7', 'G7', 'A7', 'C7']); // V7/V, V7/♭III, V7/iv, V7/♭VI
    expect(sec).not.toContain('G#7');
    expect(sec).not.toContain('C#7');
  });
  it('extra colour in A minor uses vii° not a G♯ major triad, and no F♯ major', () => {
    const cs = syms(colourPaletteChords(key('A', 'minor')));
    expect(cs).toEqual(expect.arrayContaining(['D', 'E', 'G#dim', 'Bb', 'A']));
    expect(cs).not.toContain('G#');
    expect(cs).not.toContain('F#');
  });
  it('modal minor-family keys get the same fix (E Phrygian)', () => {
    const sec = syms(secondaryPaletteChords(key('E', 'phrygian')));
    expect(sec).toContain('D7'); // V7/♭III (G)
    expect(sec).not.toContain('G#7');
  });
});

describe('chord-aware spelling (audit #6)', () => {
  const k = key('C');
  const sp = (c: string) => { const f = spellWithChords([ch(c)], (p) => spellInKey(k, p)); return (m: number) => noteName(f(m)); };
  it('spells secondary dominants by chord, not key', () => {
    expect(sp('A7')(61)).toBe('C#');
    expect(sp('E7')(68)).toBe('G#');
    expect(sp('Am(maj7)')(68)).toBe('G#');
    expect(sp('Bb')(70)).toBe('Bb');
  });
  it('falls back to key spelling for non-chord tones and honours slash bass', () => {
    expect(sp('A7')(65)).toBe('F');
    expect(sp('D/F#')(66)).toBe('F#');
  });
  it('earlier chord wins on conflicting spellings', () => {
    const f = spellWithChords([ch('E7'), ch('Ab')], (p) => spellInKey(k, p));
    expect(noteName(f(68))).toBe('G#');
    expect(noteName(f(63))).toBe('Eb'); // only in Ab
  });
});

describe('voicing bottom note (audit #7)', () => {
  it('never puts a 9th or ♯11 at the bottom', () => {
    for (const s of ['Fadd9', 'Cmaj7#11', 'G9', 'Am9', 'Cadd9', 'Dm9', 'Cmaj9']) {
      const c = ch(s);
      const v = pianoVoicing(c);
      const roots = { Fadd9: 'G', 'Cmaj7#11': 'F#' } as Record<string, string>;
      expect(v.length).toBeGreaterThan(0);
      if (roots[s]) expect(v[0] % 12).not.toBe(pc(parseChord(roots[s] )!.root));
      for (const cand of closeVoicings(c)) {
        const ninth = (pc(c.root) + 2) % 12;
        if (!['Cmaj7#11'].includes(s)) expect(cand[0] % 12).not.toBe(ninth);
      }
      // also with a previous voicing pulling it around
      const led = pianoVoicing(c, [55, 59, 62, 65]);
      expect(led[0] % 12).not.toBe((pc(c.root) + 2) % 12);
    }
    expect(pianoVoicing(ch('Cmaj7#11'))[0] % 12).not.toBe(6);
  });
  it('slash chords keep the written bass lowest', () => {
    expect(pianoVoicing(ch('C/E'))[0] % 12).toBe(4);
    expect(pianoVoicing(ch('Bb/D'))[0] % 12).toBe(2);
    expect(pianoVoicing(ch('C/Bb'))[0] % 12).toBe(10); // non-chord-tone bass added below
  });
});

describe('treble staff geometry (audit #5)', () => {
  const gap = 5;
  it('places E4 on the bottom line and F5 on the top line', () => {
    expect(trebleY(staffStep(64), gap)).toBe(4 * gap);
    expect(trebleY(staffStep(77), gap)).toBe(0);
    expect(trebleY(staffStep(71), gap)).toBe(2 * gap); // B4 = middle line
  });
  it('middle C sits one ledger line below the staff', () => {
    expect(trebleY(staffStep(60), gap)).toBe(5 * gap);
  });
  it('accidentals share the letter position', () => {
    expect(trebleY(staffStep(61, { letter: 0, acc: 1 }), gap)).toBe(trebleY(staffStep(60), gap));
    expect(trebleY(staffStep(61, { letter: 1, acc: -1 }), gap)).toBe(trebleY(staffStep(62), gap));
  });
});

describe('rarity follows chord colour (audit #14)', () => {
  it('plain diatonic chords are common even as openers; altered colour is never common', () => {
    expect(chordRarity(0.35, 'min', true)).toBe('common');
    expect(chordRarity(0.9, 'maj7#11', true)).not.toBe('common');
    expect(chordRarity(0.2, '7', false)).toBe('adventurous');
  });
});

describe('engine copy + journeys (audit #13/#15)', () => {
  const kb = normalizeKB(JSON.parse(readFileSync('public/theory_kb.json', 'utf8')));
  const e = new SuggestionEngine(kb);
  const k = key('C');
  it('opening-chord copy does not describe a cadence and never repeats the numeral', () => {
    const s0 = e.suggestChords({ key: k, progression: [], profile: null, adventure: 0.35, limit: 30 });
    const one = s0.find((s) => s.symbol === 'C')!;
    expect(one.why).not.toMatch(/leading tone rises|root falls a fifth/i);
    expect(one.why).toMatch(/home/i);
    const s1 = e.suggestChords({ key: k, progression: [ch('C'), ch('F')], profile: null, adventure: 0.35, limit: 40 });
    for (const s of [...s0, ...s1]) expect(s.why.startsWith(`${s.roman}: ${s.roman} `)).toBe(false);
    expect(s0.find((s) => s.symbol === 'Am')?.rarity ?? 'common').toBe('common');
  });
  it('journeys avoid three chords in a row on the same root', () => {
    for (const [a, b] of [['peaceful', 'aggressive'], ['jazzy', 'energetic'], ['bright', 'warm']]) {
      const j = moodJourney(e, k, a, b, { length: 6, adventure: 0.35 });
      const roots = j.map((s) => pc(s.chord.root));
      for (let i = 2; i < roots.length; i++) expect(roots[i] === roots[i - 1] && roots[i - 1] === roots[i - 2]).toBe(false);
    }
  }, 60000);
});
