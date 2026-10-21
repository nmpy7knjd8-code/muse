import { describe, expect, it } from 'vitest';
import {
  EMPTY_GYM, GYM_STAGES, bassDegree, bassMidiFor, chordSymbol, degreeMidi, gymAccuracy, gymAnswer, gymDue, gymLevel, gymLoop,
  gymMastery, gymPick, homeCadence, judgeSung, key, makeBass, makeName, makeSwap, modeDegrees, openStringNote, parseChord,
  parseGym, resolvePath, romanOf, suggestedStage, tuningById, rng,
} from '../src/core';

const C = (s: string) => parseChord(s)!;

describe('scale degrees (#1)', () => {
  it('labels are mode-aware with feel words', () => {
    expect(modeDegrees(key('C', 'major')).map((d) => d.label)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(modeDegrees(key('A', 'minor')).map((d) => d.label)).toEqual(['1', '2', 'b3', '4', '5', 'b6', 'b7']);
    expect(modeDegrees(key('B', 'locrian'))[4]!.label).toBe('b5');
    expect(modeDegrees(key('F', 'lydian'))[3]!.feel).toBe('floating');
    for (const d of modeDegrees(key('D', 'dorian'))) expect(d.pull.length).toBeGreaterThan(10);
  });
  it('home cadence is the mode’s own 1-4-5-1', () => {
    expect(homeCadence(key('D', 'minor')).map((c) => chordSymbol(c))).toEqual(['Dm', 'Gm', 'Am', 'Dm']);
    expect(homeCadence(key('G', 'mixolydian')).map((c) => chordSymbol(c))).toEqual(['G', 'C', 'Dm', 'G']);
  });
  it('degree MIDI has the right pitch class and resolves to home', () => {
    const k = key('E', 'minor');
    for (const d of modeDegrees(k)) {
      const m = degreeMidi(k, d);
      expect((m - 4 + 120) % 12).toBe(d.semis);
      const path = resolvePath(k, d);
      expect((path.at(-1)! - 4 + 120) % 12).toBe(0);
      expect(path.length).toBeLessThanOrEqual(5);
    }
  });
});

describe('adaptive engine (#4) and stages (#5)', () => {
  it('Leitner boxes advance on right, reset on wrong, and come due', () => {
    let s = gymAnswer(EMPTY_GYM, 'degree', 'x', true, 0);
    expect(s.items.x!.box).toBe(1);
    s = gymAnswer(s, 'degree', 'x', true, 1);
    expect(s.items.x!.box).toBe(2);
    expect(gymDue(s, 2)).toEqual([]);
    expect(gymDue(s, 2 + 864e5)).toEqual(['x']);
    s = gymAnswer(s, 'degree', 'x', false, 3);
    expect(s.items.x!.box).toBe(1);
    expect(gymMastery(s, ['x', 'y'])).toBeCloseTo(0.1);
  });
  it('level rises after 8/10 and accuracy is windowed', () => {
    let s = EMPTY_GYM;
    for (let i = 0; i < 12; i++) s = gymAnswer(s, 'swap', 'i' + i, i % 10 !== 0);
    expect(s.recent.swap!.length).toBe(10);
    expect(gymLevel(s, 'swap')).toBe('close');
    expect(gymLevel(EMPTY_GYM, 'swap')).toBe('easy');
    expect(gymAccuracy(EMPTY_GYM, 'swap')).toBeNull();
  });
  it('picks weak/new items and avoids repeats', () => {
    let s = EMPTY_GYM;
    for (let i = 0; i < 5; i++) s = gymAnswer(s, 'd', 'a', true, 0);
    expect(gymPick(s, ['a', 'b'], () => 0.9, 1)).toBe('b');
    expect(gymPick(s, ['a', 'b'], () => 0.5, 1, 'b')).toBe('a');
  });
  it('stages keep 1 as anchor and suggest the next group after 8/10', () => {
    for (const st of GYM_STAGES) expect(st.idx).toContain(0);
    expect(suggestedStage(EMPTY_GYM)).toBe('s135');
    let s = EMPTY_GYM;
    for (let i = 0; i < 10; i++) s = gymAnswer(s, 'degree-s135', 'q' + i, true);
    expect(suggestedStage(s)).toBe('s27');
  });
  it('parses stored stats defensively', () => {
    expect(parseGym('garbage')).toEqual(EMPTY_GYM);
    expect(parseGym(JSON.stringify({ items: { a: { box: 9, due: 0, asked: 1, right: 1 }, b: { box: 'x' } }, recent: { d: [true, 1] } }))).toEqual({ items: { a: { box: 5, due: 0, asked: 1, right: 1 } }, recent: { d: [true] } });
  });
});

describe('sing it back (#6)', () => {
  const frames = (midis: Array<number | null>) => midis.map((m, i) => ({ t: i * 0.033, midi: m }));
  it('accepts any octave within half a semitone, held', () => {
    expect(judgeSung(frames(Array(15).fill(57.3)), 69).ok).toBe(true);
    expect(judgeSung(frames(Array(15).fill(70)), 69).ok).toBe(false);
    expect(judgeSung(frames(Array(5).fill(69)), 69).ok).toBe(false);
    expect(judgeSung(frames([null, null]), 69)).toMatchObject({ ok: false, heard: null });
    expect(judgeSung(frames(Array(15).fill(70)), 69).offset).toBe(1);
  });
});

describe('chord games (#2, #3, #7)', () => {
  const k = key('C', 'major');
  it('loop prefers your bars, else style progression, with a note', () => {
    expect(gymLoop([C('C'), C('Am'), C('F'), C('G')], k, null).source).toBe('mine');
    const st = gymLoop([C('C')], key('D', 'minor'), 'tool');
    expect(st.source).toBe('style');
    expect(st.note).toMatch(/short.*TOOL progression/);
    expect(gymLoop([C('C')], k, null).note).toMatch(/common progression/);
    expect(gymLoop([C('C'), C('F#'), C('C#'), C('Bb')], k, null).note).toMatch(/outside the key/);
    expect(gymLoop([C('C'), C('G'), C('F')], k, null, 'style').source).not.toBe('mine');
  });
  it('swap changes exactly one non-first bar; answer is among options', () => {
    const loop = [C('C'), C('G'), C('Am'), C('F')];
    for (let seed = 1; seed < 30; seed++) {
      for (const level of ['easy', 'close'] as const) {
        const q = makeSwap(loop, k, level, rng(seed))!;
        expect(q.bar).toBeGreaterThan(0);
        expect(q.changed.filter((c, i) => chordSymbol(c) !== chordSymbol(loop[i]!)).length).toBe(1);
        expect(q.options.map((c) => chordSymbol(c))).toContain(chordSymbol(q.replacement));
        expect(new Set(q.options.map((c) => chordSymbol(c))).size).toBe(q.options.length);
      }
    }
  });
  it('name hides a non-first bar with 4 distinct numeral options', () => {
    const loop = [C('C'), C('G'), C('Am'), C('F')];
    const q = makeName(loop, k, EMPTY_GYM, 'easy', rng(3))!;
    expect(q.bar).toBeGreaterThan(0);
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options.map((c) => romanOf(c, k))).size).toBe(4);
    expect(q.options.some((c) => chordSymbol(c) === chordSymbol(q.answer))).toBe(true);
  });
  it('bass asks two bars with in-loop steps plus a distractor', () => {
    const loop = [C('C'), C('G/B'), C('Am'), C('F')];
    expect(bassDegree(C('G/B'), k)!.label).toBe('7');
    const q = makeBass(loop, k, EMPTY_GYM, rng(5))!;
    expect(q.bars).toHaveLength(2);
    expect(q.bars).not.toContain(0);
    for (const a of q.answers) expect(q.options.map((o) => o.label)).toContain(a.label);
    expect(q.options.length).toBeGreaterThan(q.answers.length);
  });
  it('bass register follows the tuning and names the open low string', () => {
    const dropD = tuningById('dropD');
    expect(bassMidiFor(C('Dm'), dropD)).toBe(38);
    expect(bassMidiFor(C('Dm'), tuningById('standard'))).toBe(50);
    expect(openStringNote(C('Dm'), dropD, key('D', 'minor'))).toMatch(/home/);
    expect(openStringNote(C('Am'), dropD, key('D', 'minor'))).toBeNull();
  });
});
