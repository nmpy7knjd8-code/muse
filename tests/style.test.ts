import { describe, expect, it } from 'vitest';
import {
  GENERAL_STYLE, MODES, STYLES, TUNINGS, chordSymbol, deserializeSession, guitarVoicings, isPlayable, key, parseChord,
  serializeSession, shapeMatchesChord, shapePcs, styleFit, styleLens, styleProgressions, styleRerank, tuningById,
  tuningStringNames, pc, type ModeId,
} from '../src/core';

const C = (s: string) => parseChord(s)!;
const TONICS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];

describe('style progressions per key/mode', () => {
  it('every style yields realisable progressions in every key and mode', () => {
    for (const s of [GENERAL_STYLE, ...STYLES]) for (const t of TONICS) for (const m of MODES) {
      const ps = styleProgressions(s, key(t, m.id));
      expect(ps.length, `${s.id} ${t} ${m.id}`).toBeGreaterThan(0);
      for (const p of ps) expect(p.chords.length).toBe(p.roman.length);
    }
  });
  it('realises numerals in the current key (pop in C major, TOOL in D minor / A minor)', () => {
    expect(styleProgressions(STYLES.find((s) => s.id === 'pop'), key('C'))[0]!.symbols).toEqual(['C', 'G', 'Am', 'F']);
    const tool = STYLES.find((s) => s.id === 'tool')!;
    expect(styleProgressions(tool, key('D', 'minor'))[0]!.symbols).toEqual(['D5', 'B♭', 'D5', 'E♭5', 'D5']);
    expect(styleProgressions(tool, key('A', 'minor'))[0]!.symbols).toEqual(['A5', 'F', 'A5', 'B♭5', 'A5']);
  });
  it('prefers mode-tagged progressions (Dorian vamp, Phrygian-dominant TOOL)', () => {
    expect(styleProgressions(null, key('D', 'dorian'))[0]!.symbols).toEqual(['Dm', 'G', 'Dm']);
    expect(styleProgressions(STYLES.find((s) => s.id === 'tool'), key('E', 'phrygianDominant' as ModeId))[0]!.symbols).toEqual(['E5', 'F5', 'E5', 'C5']);
  });
  it('borrows from the other mode when a style has none in this one', () => {
    const ps = styleProgressions(STYLES.find((s) => s.id === 'opeth'), key('C'));
    expect(ps.every((p) => p.borrowed)).toBe(true);
  });
});

describe('style highlighting', () => {
  it('marks typical chords per key and mode, and leaves others as “other”', () => {
    const pop = styleLens('pop', key('C'));
    expect(styleFit(C('G'), pop)).toBe('typical');
    expect(styleFit(C('Am7'), pop)).toBe('typical'); // same family as Am
    expect(styleFit(C('Bdim'), pop)).toBe('other');
    const toolA = styleLens('tool', key('A', 'minor'));
    expect(styleFit(C('Bb'), toolA)).toBe('typical'); // ♭II
    expect(styleFit(C('F'), toolA)).toBe('typical'); // ♭VI
    expect(styleFit(C('E'), toolA)).toBe('other');
    const toolC = styleLens('tool', key('C', 'minor'));
    expect(styleFit(C('Cm'), toolC)).toBe('typical'); // C5 in C minor stands for Cm
    expect(styleFit(C('Cm7'), toolC)).toBe('typical');
    expect(styleFit(C('C'), toolC)).toBe('other');
    expect(styleFit(C('Csus2'), toolC)).toBe('typical'); // thirdless, like the power chord
    expect(styleFit(C('C7'), toolC)).toBe('other');
    expect(styleFit(C('Db'), toolC)).toBe('typical'); // ♭II
    const toolD = styleLens('tool', key('D', 'minor'));
    expect(styleFit(C('Eb'), toolD)).toBe('typical');
    expect(styleFit(C('Bb'), toolA)).toBe('typical');
  });
  it('jazz-type styles only count 7th-or-richer chords', () => {
    const jazz = styleLens('jazz', key('C'));
    expect(styleFit(C('Dm7'), jazz)).toBe('typical');
    expect(styleFit(C('Dm'), jazz)).toBe('other');
  });
  it('a drop tuning nudges its open-string roots', () => {
    const plain = styleLens('pop', key('C'));
    const drop = styleLens('pop', key('C'), tuningById('dropD'));
    expect(styleFit(C('D5'), plain)).toBe('other');
    expect(styleFit(C('D5'), drop)).toBe('tuning');
    expect(styleFit(C('D'), styleLens('pop', key('C'), tuningById('halfDown')))).toBe('other'); // shifted tunings add nothing
  });
  it('Any style: no lens, no dimming, ranking untouched', () => {
    expect(styleLens(null, key('C'))).toBeNull();
    expect(styleLens('nope', key('C'))).toBeNull();
    expect(styleFit(C('G'), null)).toBeNull();
    const items = ['Bdim', 'Ebmaj7', 'F#', 'G', 'Am'].map(C);
    expect(styleRerank(items, (c) => c, null)).toBe(items);
  });
  it('re-ranks style-typical suggestions upward, stably', () => {
    const items = ['Bdim', 'Ebmaj7', 'F#', 'Db', 'E', 'G', 'Am'].map(C);
    const out = styleRerank(items, (c) => c, styleLens('pop', key('C'))).map((c) => chordSymbol(c));
    expect(out.indexOf('G')).toBeLessThan(5);
    expect(out.indexOf('Am')).toBeLessThan(6);
    expect(out.slice().sort()).toEqual(items.map((c) => chordSymbol(c)).sort());
  });
});

describe('tunings re-fret guitar chords', () => {
  const chords = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Am', 'Em', 'Dm', 'F#m', 'D5', 'E5', 'A5', 'G7', 'Cmaj7', 'Am7', 'Dsus2'];
  it('every voicing in every tuning is playable and spells the chord with the root in the bass', () => {
    for (const t of TUNINGS) for (const s of chords) {
      const c = C(s);
      const vs = guitarVoicings(c, 4, t.strings);
      expect(vs.length, `${t.id} ${s}`).toBeGreaterThan(0);
      for (const v of vs) {
        expect(isPlayable(v), `${t.id} ${s} ${v.frets}`).toBe(true);
        const relaxed = !!v.partial;
        expect(shapeMatchesChord(v, c, relaxed, t.strings), `${t.id} ${s} ${v.frets}`).toBe(true);
        expect(shapePcs(v, t.strings)[0]).toBe(pc(c.root));
      }
    }
  });
  it('drop D puts the one-finger power chord first; open G rings G on open strings', () => {
    expect(guitarVoicings(C('D5'), 4, tuningById('dropD').strings)[0]!.frets).toEqual([0, 0, 0, null, null, null]);
    expect(guitarVoicings(C('E5'), 4, tuningById('dropD').strings)[0]!.frets).toEqual([2, 2, 2, null, null, null]);
    expect(guitarVoicings(C('G'), 4, tuningById('openG').strings).map((v) => v.frets.join())).toContain(',0,0,0,0,0');
    expect(guitarVoicings(C('D'), 4, tuningById('openD').strings)[0]!.frets).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it('shifted tunings keep standard shapes (E♭ chord = E shape in half-step down)', () => {
    const e = guitarVoicings(C('E'), 1)[0]!;
    const eb = guitarVoicings(C('Eb'), 1, tuningById('halfDown').strings)[0]!;
    expect(eb.frets).toEqual(e.frets);
    expect(eb.label).toMatch(/E shape/);
  });
  it('labels strings for the diagram', () => {
    expect(tuningStringNames(tuningById('standard').strings)).toEqual(['E', 'A', 'D', 'G', 'B', 'e']);
    expect(tuningStringNames(tuningById('dadgad').strings)).toEqual(['D', 'A', 'D', 'G', 'A', 'd']);
  });
  it('standard tuning is unchanged by default', () => {
    expect(guitarVoicings(C('C'), 4, tuningById('standard').strings)).toEqual(guitarVoicings(C('C')));
  });
});

describe('session keeps style + tuning', () => {
  it('round-trips and omits defaults', () => {
    const raw = serializeSession({ slots: [], grooveHits: [], style: 'tool', tuning: 'dropD' });
    expect(deserializeSession(raw)).toMatchObject({ style: 'tool', tuning: 'dropD' });
    const plain = JSON.parse(serializeSession({ slots: [], grooveHits: [], style: null, tuning: 'standard' }));
    expect(plain.style).toBeUndefined();
    expect(plain.tuning).toBeUndefined();
  });
});
