import { describe, it, expect } from 'vitest';
import * as T from '../src/core/tension';

const C: T.KeyCtx = { tonic: 0, mode: 'major' };
const ch = (root: number, ivs: number[], bass?: number): T.ChordIn => ({ root, pcs: ivs.map((i) => T.mod12(root + i)), bass });
const I = ch(0, [0, 4, 7]), IV = ch(5, [0, 4, 7]), V = ch(7, [0, 4, 7]), V7 = ch(7, [0, 4, 7, 10]);
const ii = ch(2, [0, 3, 7]), vi = ch(9, [0, 3, 7]);

describe('Lerdahl TPS (Lerdahl 2001; Lerdahl & Krumhansl 2007 Fig. 5)', () => {
  it('reproduces published chord distances', () => {
    expect(T.tpsDistance(I, C, V, C).total).toBe(5);
    expect(T.tpsDistance(I, C, V, { tonic: 7, mode: 'major' }).total).toBe(7); // I/C -> I/G
    expect(T.tpsDistance(I, C, vi, C).total).toBe(7); // I -> vi within C
    expect(T.tpsDistance(I, C, ch(9, [0, 3, 7]), { tonic: 9, mode: 'minor' }).total).toBe(7); // I/C -> i/a
    expect(T.tpsDistance(I, C, ch(0, [0, 3, 7]), { tonic: 0, mode: 'minor' }).total).toBe(7); // I/C -> i/c
  });
  it('tonic is at distance 0 from home', () => expect(T.distanceFromHome(I, C).total).toBe(0));
});

describe('melodic & harmonic attraction (Lerdahl 2001 Fig. 13)', () => {
  it('matches the published melodic attraction examples', () => {
    expect(T.melodicAttraction(11, 0, I, C)).toBeCloseTo(2);
    expect(T.melodicAttraction(2, 0, I, C)).toBeCloseTo(0.5);
    expect(T.melodicAttraction(5, 4, I, C)).toBeCloseTo(1.5);
    expect(T.melodicAttraction(4, 5, I, C)).toBeCloseTo(2 / 3);
  });
  it('V7->I is the strongest of the common cadential moves', () => {
    const a = (x: T.ChordIn) => T.harmonicAttraction(x, I, C);
    expect(a(V7)).toBeGreaterThan(a(IV));
    expect(a(V7)).toBeGreaterThan(a(ii));
    expect(a(IV)).toBeGreaterThan(a(vi));
  });
});

describe('vertical dissonance', () => {
  it('Huron (1994) aggregate dyadic consonance orders major triad above cluster', () => {
    expect(T.huronConsonance([0, 4, 7])).toBeGreaterThan(T.huronConsonance([0, 1, 2]));
    expect(T.intervalClassVector([0, 4, 7])).toEqual([0, 0, 1, 1, 1, 0]);
  });
  it('Parncutt (1988) root ambiguity: major triad clearer than diminished seventh', () => {
    expect(T.rootAmbiguity([0, 4, 7])).toBeLessThan(T.rootAmbiguity([0, 3, 6, 9]));
  });
  it('dyad roughness: m2 > M2 > m3, P5 and P8 smooth (Plomp & Levelt 1965 shape)', () => {
    const d = T.dyadRoughnessTable(60, 12);
    expect(d[1]).toBeGreaterThan(d[2]);
    expect(d[2]).toBeGreaterThan(d[3]);
    expect(d[7]).toBeLessThan(d[3]);
    expect(d[12]).toBeLessThan(d[7]);
  });
  it('the same interval is rougher low in the register (critical bandwidth)', () => {
    expect(T.dyadRoughnessTable(36, 12)[4]).toBeGreaterThan(T.dyadRoughnessTable(72, 12)[4]);
  });
  it('ranks chord types sensibly', () => {
    const v = (ivs: number[]) => T.verticalDissonance(ch(0, ivs)).score;
    expect(v([0, 7])).toBeLessThan(v([0, 4, 7]));
    expect(v([0, 4, 7])).toBeLessThan(v([0, 4, 7, 10]));
    expect(v([0, 4, 7, 10])).toBeLessThan(v([0, 4, 7, 10, 13]));
    expect(v([0, 4, 7])).toBeLessThan(v([0, 3, 6, 9]));
  });
  it('familiarity (enculturation) lowers vertical dissonance', () => {
    const c = ch(0, [0, 3, 7, 10]);
    expect(T.verticalDissonance(c, 1).score).toBeLessThan(T.verticalDissonance(c, 0).score);
    expect(T.APP_QUALITY_FAMILIARITY.jazz.m7).toBeGreaterThan(T.APP_QUALITY_FAMILIARITY.pop.m7);
  });
  it('flags muddy low intervals', () => {
    expect(T.lowIntervalViolations([40, 44]).length).toBe(1); // E2-G#2 major third: too low
    expect(T.lowIntervalViolations([38, 45]).length).toBe(0); // D2-A2 fifth is fine
  });
});

describe('event tension', () => {
  it('tonic is the least tense; dominant seventh tenser than plain dominant', () => {
    const L = (c: T.ChordIn, prev: T.ChordIn | null = I) => T.eventTension(prev, c, C).level;
    expect(L(I, null)).toBeLessThan(L(V));
    expect(L(V)).toBeLessThan(L(V7));
    expect(L(I, V7)).toBeLessThan(L(ch(9, [0, 3, 6, 9])));
  });
  it('preparation (common-tone dissonance) discounts salience', () => {
    const sus = ch(0, [0, 5, 7]);
    const prepared = T.eventTension(IV, sus, C); // F is held over from IV
    const unprepared = T.eventTension(V, sus, C);
    expect(prepared.prepared).toBe(true);
    expect(unprepared.prepared).toBe(false);
    expect(prepared.parts.vertical).toBeLessThan(unprepared.parts.vertical);
  });
  it('weak-beat placement lowers salience', () => {
    expect(T.eventTension(I, V7, C, { beatStrength: 0 }).level).toBeLessThan(T.eventTension(I, V7, C, { beatStrength: 1 }).level);
  });
});

describe('tension budget', () => {
  const pop = T.STYLE_PRESETS.pop;
  const tense = [I, ch(3, [0, 3, 6, 9]), ch(1, [0, 4, 7]), ch(6, [0, 4, 7]), ch(8, [0, 4, 7, 10]), ch(2, [0, 4, 7, 10, 13]), ch(11, [0, 3, 6, 9])];
  it('debt accumulates through tense chords and is paid back by resolution', () => {
    const curve = T.tensionCurve([...tense, V7, I, IV, I], C, { style: pop });
    const peak = Math.max(...curve.map((p) => p.debt));
    expect(peak).toBeGreaterThan(pop.ceiling);
    expect(curve[curve.length - 1].debt).toBeLessThan(peak);
  });
  it('reports over-budget for a long chromatic excursion and sweet spot / static for simple pop', () => {
    expect(T.budgetState(T.tensionCurve(tense, C, { style: pop }), pop).status).toMatch(/over-budget|resolve-soon/);
    const loop = [I, I, I, I, I];
    expect(T.budgetState(T.tensionCurve(loop, C, { style: pop }), pop).status).toBe('too-static');
  });
  it('jazz tolerates more tension than pop for the same ii-V-I chain', () => {
    const iiVI = [ch(2, [0, 3, 7, 10]), ch(7, [0, 4, 7, 10]), ch(0, [0, 4, 7, 11]), ch(9, [0, 4, 7, 10, 13])];
    const prog = [...iiVI, ...iiVI];
    const fam = (st: string) => prog.map((c) => ({ familiarity: T.familiarityFor(c, null) ?? (c.pcs.length >= 4 ? T.APP_QUALITY_FAMILIARITY[st]['7'] : 1) }));
    const jz = T.tensionCurve(prog, C, { style: T.STYLE_PRESETS.jazz, events: fam('jazz') });
    const pp = T.tensionCurve(prog, C, { style: pop, events: fam('pop') });
    expect(jz[jz.length - 1].debt).toBeLessThan(pp[pp.length - 1].debt);
  });
  it('slider and mood raise the ceiling monotonically', () => {
    const lim = (a: number, m: number | null) => T.effectiveLimits(pop, a, m).ceiling;
    expect(lim(0, null)).toBeLessThan(lim(0.5, null));
    expect(lim(0.5, null)).toBeLessThan(lim(1, null));
    expect(lim(0.5, T.moodTargetTension({ peaceful: 1 }))).toBeLessThan(lim(0.5, T.moodTargetTension({ tense: 1 })));
    expect(T.effectiveLimits(pop, 0.5, 0.95).bandLow).toBeGreaterThan(T.effectiveLimits(pop, 0.5, 0.05).bandLow);
  });
  it('when over budget, a resolving candidate outranks a further-out one', () => {
    const ctx = { home: C, style: pop, adventure: 0.5 };
    const resolve = T.evaluateCandidate(tense, I, ctx);
    const further = T.evaluateCandidate(tense, ch(6, [0, 3, 6, 9]), ctx);
    expect(resolve.adjust).toBeGreaterThan(further.adjust);
    expect(resolve.reasons.join(' ')).toMatch(/resolves/);
  });
  it('Cheung et al. (2019) saddle: surprise rewarded in predictable context, penalised in uncertain one', () => {
    const base = { home: C, style: pop };
    const sPred = T.evaluateCandidate([I, IV], ch(8, [0, 4, 7]), { ...base, contextUncertainty: 0.1 }, { surprise: 0.9 }).adjust
      - T.evaluateCandidate([I, IV], ch(8, [0, 4, 7]), { ...base, contextUncertainty: 0.1 }, { surprise: 0.5 }).adjust;
    const sUnc = T.evaluateCandidate([I, IV], ch(8, [0, 4, 7]), { ...base, contextUncertainty: 0.9 }, { surprise: 0.9 }).adjust
      - T.evaluateCandidate([I, IV], ch(8, [0, 4, 7]), { ...base, contextUncertainty: 0.9 }, { surprise: 0.5 }).adjust;
    expect(sPred).toBeGreaterThan(sUnc);
  });
});

describe('melody notes', () => {
  it('root is calmer than a chromatic non-chord tone', () => {
    expect(T.noteTension(0, I, C).level).toBeLessThan(T.noteTension(6, I, C).level);
  });
  it('flags suspensions and appoggiaturas', () => {
    expect(T.noteTension(0, V, C, 0, I).flags).toContain('suspension'); // C held from I over G
    expect(T.noteTension(5, I, C, 0, I).flags).toContain('appoggiatura'); // leap C->F over C major
  });
});

describe('spiral-array tension ribbons (Herremans & Chew 2016)', () => {
  it('returns finite values and larger cloud diameter for a cluster', () => {
    const r = T.tensionRibbons([I, ch(0, [0, 1, 2, 6])], C);
    expect(r.every((x) => Number.isFinite(x.diameter) && Number.isFinite(x.strain))).toBe(true);
    expect(r[1].diameter).toBeGreaterThan(r[0].diameter);
  });
});

describe('module hygiene', () => {
  it('has no DOM dependency', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../src/core/tension.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\b(document|window)\.|HTMLElement|addEventListener/);
    expect(src).not.toMatch(/^import /m);
  });
});
