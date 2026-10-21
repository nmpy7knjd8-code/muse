import { describe, expect, it } from 'vitest';
import {
  BRIGHTNESS, CONCEPTS, checkPuzzle, chordSymbol, conceptExample, degreeColor, detectConcepts, key, keyRing, makePuzzle, missions,
  modeStepNote, morphChords, newConcepts, parseChord, rng, transposeChords, tuningById, type ConceptId, type PuzzleKind,
} from '../src/core';
const C = (s: string) => parseChord(s)!;
const syms = (cs: { root: unknown }[]) => cs.map((c) => chordSymbol(c as never));

describe('concepts (#10)', () => {
  const k = key('C', 'major');
  it('detects cadences and colours accurately', () => {
    const d = detectConcepts([C('C'), C('F'), C('G'), C('C')], k);
    expect(d.authentic).toEqual([3]);
    expect(detectConcepts([C('C'), C('G'), C('Am')], k).deceptive).toEqual([2]);
    expect(detectConcepts([C('C'), C('F'), C('C')], k).plagal).toEqual([2]);
    expect(detectConcepts([C('C'), C('F'), C('G')], k).half).toEqual([2]);
    expect(detectConcepts([C('C'), C('Fm'), C('C')], k).borrowed).toEqual([1]);
    expect(detectConcepts([C('C'), C('Bb'), C('F')], k).modalColour).toEqual([1]);
    expect(detectConcepts([C('C'), C('D7'), C('G')], k).secondary).toEqual([1]);
    expect(detectConcepts([C('C'), C('Am'), C('F'), C('G')], k).borrowed).toBeUndefined();
    expect(detectConcepts([C('Am'), C('E'), C('Am')], key('A', 'minor')).borrowed).toBeUndefined();
    expect(detectConcepts([C('Am'), C('D'), C('Am')], key('A', 'minor')).modalColour).toEqual([1]);
  });
  it('reports only new, unseen concepts', () => {
    expect(newConcepts([C('C'), C('G')], [C('C'), C('G'), C('Am')], k, [])).toEqual(['deceptive']);
    expect(newConcepts([C('C'), C('G')], [C('C'), C('G'), C('Am')], k, ['deceptive'])).toEqual([]);
  });
  it('every concept example demonstrates itself, in major and minor', () => {
    for (const kk of [key('C', 'major'), key('E', 'minor'), key('Bb', 'major')]) {
      for (const c of CONCEPTS) {
        const ex = conceptExample(c.id as ConceptId, kk);
        expect(detectConcepts(ex, kk)[c.id as ConceptId], `${c.id} in ${kk.tonic.letter}`).toBeTruthy();
      }
    }
  });
});

describe('degree colours (#11)', () => {
  it('colours by mode step, null outside', () => {
    const k = key('D', 'dorian');
    expect(degreeColor(C('Dm'), k)).toBe(degreeColor(C('Am'), key('A', 'minor')));
    expect(degreeColor(C('G'), k)).not.toBeNull();
    expect(degreeColor(C('Eb'), k)).toBeNull();
  });
});

describe('puzzles (#8)', () => {
  const kinds: PuzzleKind[] = ['finish', 'clash', 'stuck', 'lift'];
  it('every generated puzzle starts unsolved and a sensible fix solves it', () => {
    for (const kk of [key('C', 'major'), key('A', 'minor'), key('D', 'dorian')]) for (const kind of kinds) for (let s = 1; s < 8; s++) {
      const p = makePuzzle(kind, kk, null, rng(s));
      expect(checkPuzzle(p, p.chords, kk).ok, `${kind} starts broken`).toBe(false);
      const d = p.choices;
      const fixed = [...p.chords];
      if (kind === 'finish') { fixed[2] = { root: { letter: (kk.tonic.letter + 4) % 7, acc: 0 }, quality: 'maj' } as never; fixed[3] = d[0]!; }
      if (kind === 'clash') for (let i = 0; i < 4; i++) if (checkPuzzle({ ...p, kind: 'clash' }, [fixed[i]!], kk).ok === false) fixed[i] = d[0]!;
      if (kind === 'stuck') fixed[1] = d[3]!;
      if (kind === 'lift') fixed[2] = d.find((c) => chordSymbol(c) !== chordSymbol(fixed[0]!))!;
      if (kind !== 'finish') expect(checkPuzzle(p, fixed, kk).ok, `${kind} fix`).toBe(true);
    }
  });
  it('finish accepts V→I, and ♭VII→I only for modal styles', () => {
    const k = key('A', 'major');
    const p = makePuzzle('finish', k, null, rng(1));
    expect(checkPuzzle(p, [C('A'), C('D'), C('E'), C('A')], k).ok).toBe(true);
    expect(checkPuzzle(p, [C('A'), C('D'), C('G'), C('A')], k).ok).toBe(false);
    expect(checkPuzzle(p, [C('A'), C('D'), C('G'), C('A')], k, 'led-zeppelin').ok || checkPuzzle(p, [C('A'), C('D'), C('G'), C('A')], k, 'zeppelin').ok).toBe(true);
  });
});

describe('missions (#9)', () => {
  it('are mode-aware and checkable', () => {
    expect(missions(key('C', 'major')).find((m) => m.id === 'borrow')!.title).toMatch(/sad/);
    expect(missions(key('A', 'minor')).find((m) => m.id === 'borrow')!.title).toMatch(/bright/);
    const m = Object.fromEntries(missions(key('C', 'major')).map((x) => [x.id, x]));
    const k = key('C', 'major');
    expect(m.unfinished!.check([C('C'), C('G')], k)).toBe(true);
    expect(m.finished!.check([C('C'), C('G'), C('C')], k)).toBe(true);
    expect(m.borrow!.check([C('C'), C('Fm')], k)).toBe(true);
    expect(m.sus!.check([C('C'), C('Gsus4'), C('G')], k)).toBe(true);
    expect(m.sus!.check([C('C'), C('Gsus4'), C('C')], k)).toBe(false);
    expect(m.loop4!.check([C('C'), C('G'), C('Am'), C('F')], k)).toBe(true);
    expect(m.home2!.check([C('C'), C('F'), C('C'), C('G'), C('C')], k)).toBe(true);
  });
});

describe('key slide (#12) and mode morph (#13)', () => {
  it('key ring marks current and tuning-easy keys', () => {
    const r = keyRing(key('E', 'minor'), tuningById('dropD'));
    expect(r).toHaveLength(12);
    expect(r.find((x) => x.current)!.tonic).toBe('E');
    expect(r.find((x) => x.tonic === 'D')!.easy).toBe(true);
  });
  it('transposes letters but keeps numerals', () => {
    expect(syms(transposeChords([C('C'), C('Am'), C('F'), C('G7')], { letter: 0, acc: 0 }, { letter: 4, acc: 0 }))).toEqual(['G', 'Em', 'C', 'D7']);
  });
  it('brightness ladder neighbours differ by one note', () => {
    for (let i = 1; i < BRIGHTNESS.length; i++) expect(modeStepNote(BRIGHTNESS[i - 1]!, BRIGHTNESS[i]!)).toMatch(/^Lower the/);
    expect(modeStepNote('major', 'mixolydian')).toBe('Lower the 7th — a shade darker.');
  });
  it('morph keeps steps and tonic', () => {
    expect(syms(morphChords([C('C'), C('F'), C('G'), C('C')], key('C', 'major'), 'minor'))).toEqual(['Cm', 'Fm', 'Gm', 'Cm']);
    expect(syms(morphChords([C('C'), C('G7')], key('C', 'major'), 'mixolydian'))).toEqual(['C', 'Gm7']);
  });
});
