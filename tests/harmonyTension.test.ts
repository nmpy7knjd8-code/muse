import { describe, expect, it } from 'vitest';
import { loadKB } from './helpers';
import {
  Chord, Key, SuggestionEngine, key, candidateTension, idiomDiscount, melodyDissonance, parseChord, progressionTension, toChordIn, toKeyCtx, tooEarlyToResolve, tensionModel as T,
} from '../src/core';

const C: Key = key('C');
const P = (s: string): Chord[] => s.split(/\s+/).map((x) => { const c = parseChord(x); if (!c) throw new Error(x); return c; });
const pop = { style: 'pop' as const, adventure: 0.5, target: null };
const eng = new SuggestionEngine(loadKB('theory_kb.json'));

describe('tension bridge', () => {
  it('maps Muse chords/keys to the research model', () => {
    expect(toKeyCtx(key('A', 'dorian'))).toEqual({ tonic: 9, mode: 'minor' });
    expect(toChordIn(P('G7')[0])).toMatchObject({ root: 7, pcs: expect.arrayContaining([7, 11, 2, 5]) });
    expect(toChordIn(P('F/C')[0]).bass).toBe(0);
  });

  it('reproduces the report worked example: tension piles up, then Gsus4–G7–C pays it back', () => {
    const prog = P('C Am7 Fmaj7 G7 C E7 Am Ab Bb Db Bdim7 G7b9 Gsus4 G7 C');
    const s = progressionTension(prog, C, pop);
    const debts = s.points.map((p) => p.debt);
    const peak = Math.max(...debts);
    expect(peak).toBeGreaterThan(s.limits.ceiling);
    expect(debts.indexOf(peak)).toBeGreaterThanOrEqual(9);
    expect(debts[debts.length - 1]).toBeLessThan(peak / 3);
    expect(s.budget.status).not.toBe('over-budget');
  });

  it('flags a long unresolved stretch and ranks resolving chords higher', () => {
    const prog = P('C E7 Ab Bb Db Bdim7');
    const s = progressionTension(prog, C, pop);
    expect(['over-budget', 'resolve-soon']).toContain(s.budget.status);
    const res = candidateTension(s, prog[prog.length - 1], P('C')[0], C);
    const away = candidateTension(s, prog[prog.length - 1], P('F#')[0], C);
    expect(res.adjust).toBeGreaterThan(away.adjust);
    const sugg = eng.suggestChords({ key: C, progression: prog, adventure: 0.35 });
    const top = sugg.slice(0, 4).map((x) => x.symbol);
    expect(top.some((x) => ['C', 'Am', 'G', 'G7', 'Cmaj7'].includes(x))).toBe(true);
    expect(sugg.find((x) => x.symbol === 'C')?.tension?.reasons).toContain('resolves built-up tension');
  });

  it('withholds an early cadence home while the recent stretch is still building', () => {
    // I→V has barely left home — Best fit should not shove tonic back to #1 yet.
    const short = P('C G');
    const building = progressionTension(short, C, pop);
    expect(building.budget.status).toBe('building');
    const earlyHome = candidateTension(building, short[1], P('C')[0], C);
    const continueColour = candidateTension(building, short[1], P('Am')[0], C);
    expect(earlyHome.reasons).toContain('too early to resolve — keep the build going');
    expect(earlyHome.adjust).toBeLessThan(continueColour.adjust);
    const sugg = eng.suggestChords({ key: C, progression: short, adventure: 0.35 });
    expect(sugg[0]?.symbol).not.toBe('C');
    expect(sugg.find((x) => x.symbol === 'C')?.tension?.reasons)
      .toContain('too early to resolve — keep the build going');
  });

  it('still prefers home after a long earned stretch (resolve-soon)', () => {
    const prog = P('C E7 Ab Bb Db Bdim7');
    const s = progressionTension(prog, C, pop);
    expect(tooEarlyToResolve(s)).toBe(false);
    const res = candidateTension(s, prog[prog.length - 1], P('C')[0], C);
    expect(res.reasons).toContain('resolves built-up tension');
    expect(res.reasons.join(' ')).not.toMatch(/too early/);
  });

  it('folds recent melody notes into Best-fit tension (same stretch as the curve)', () => {
    const prog = P('C Am F');
    const calm = progressionTension(prog.map((chord) => ({ chord, melody: [60, 64] })), C, pop);
    const tenseMel = progressionTension(prog.map((chord) => ({ chord, melody: [61, 66, 68] })), C, pop);
    expect(tenseMel.points[tenseMel.points.length - 1]!.debt)
      .toBeGreaterThanOrEqual(calm.points[calm.points.length - 1]!.debt);
    // Engine path: dissonant recent notes raise the shared curve used for ranking.
    const withMel = eng.suggestChords({
      key: C, progression: prog, adventure: 0.35,
      tensionMelody: [[61, 66], [61, 68], [66, 70]],
    });
    expect(withMel.some((x) => x.tension != null)).toBe(true);
  });

  it('calls a settled loop too static and rewards colour', () => {
    const prog = P('C F C F C F C F');
    const s = progressionTension(prog, C, pop);
    expect(s.budget.status).toBe('too-static');
    const sugg = eng.suggestChords({ key: C, progression: prog, adventure: 0.5 });
    expect(sugg.some((x) => x.tension?.reasons.includes('adds colour after a settled stretch'))).toBe(true);
  });

  it('style changes the cost: m7 colours are cheaper in jazz than pop', () => {
    const prog = P('C Dm7 G7 Cmaj7 Am7 Dm7 G7');
    const pj = progressionTension(prog, C, { ...pop, style: 'jazz' }).points;
    const pp = progressionTension(prog, C, pop).points;
    expect(pj[1].level).toBeLessThan(pp[1].level);
  });

  it('slider and tense moods raise the ceiling', () => {
    const a = progressionTension(P('C G'), C, { style: 'pop', adventure: 0, target: 0.05 }).limits.ceiling;
    const b = progressionTension(P('C G'), C, { style: 'pop', adventure: 1, target: 0.95 }).limits.ceiling;
    expect(b).toBeGreaterThan(a * 2);
  });

  it('discounts modal / blues idioms that common-practice anchoring over-rates', () => {
    expect(idiomDiscount(P('Bb')[0], C).factor).toBeLessThan(1);
    expect(idiomDiscount(P('C7')[0], C).factor).toBeLessThan(1);
    expect(idiomDiscount(P('D')[0], key('A', 'dorian')).factor).toBeLessThan(1);
    expect(idiomDiscount(P('G')[0], C).factor).toBe(1);
    const raw = T.eventTension(toChordIn(P('C')[0]), toChordIn(P('Bb')[0]), toKeyCtx(C)).level;
    expect(progressionTension(P('C Bb'), C, pop).points[1].harmonyLevel).toBeLessThan(raw);
  });

  it('melody-vs-chord dissonance raises the chord tension', () => {
    const c = P('C')[0];
    expect(melodyDissonance([64], c, C)!).toBeLessThan(melodyDissonance([61], c, C)!);
    const calm = progressionTension([{ chord: c, melody: [64, 67] }], C, pop).points[0];
    const clash = progressionTension([{ chord: c, melody: [61, 66] }], C, pop).points[0];
    expect(clash.level).toBeGreaterThan(calm.level);
    expect(calm.melody).not.toBeNull();
  });

  it('is fast enough to run on every keystroke', () => {
    const prog = P('C Am7 Fmaj7 G7 C E7 Am Ab Bb Db Bdim7 G7b9 Gsus4 G7 C Am');
    const t0 = performance.now();
    eng.suggestChords({ key: C, progression: prog });
    expect(performance.now() - t0).toBeLessThan(400);
  });
});
