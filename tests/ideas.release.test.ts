import { describe, expect, it } from 'vitest';
import { buildPressure, chordSymbol, findReleaseMoments, key, parseChord, HOME_LEVEL } from '../src/core';

const P = (s: string) => s.split(' ').map((x) => parseChord(x)!);
const C = key('C');
const Cm = { ...key('C'), mode: 'minor' as const };

describe('release-moment finder (idea 12)', () => {
  it('pressure accumulates away from home and falls back on arrival', () => {
    const pr = buildPressure([0.05, 0.3, 0.32, 0.3, 0.08]);
    expect(pr[0]).toBe(0);
    expect(pr[1]!).toBeLessThan(pr[2]!);
    expect(pr[2]!).toBeLessThan(pr[3]!);
    expect(pr[4]!).toBeLessThan(pr[3]! * 0.5);
    expect(HOME_LEVEL).toBeGreaterThan(0.1);
  });
  it('recognises a well-placed cadence', () => {
    const r = findReleaseMoments(P('C F G C'), C);
    expect(r.status).toBe('placed');
    expect(r.best).toEqual({ index: 3, append: false });
    expect(r.releases).toEqual([expect.objectContaining({ index: 3, kind: 'earned' })]);
  });
  it('finds the build and puts the release after an open-ended loop', () => {
    const r = findReleaseMoments(P('C G Am F'), C);
    expect(r.peak?.index).toBe(3);
    expect(r.build).toEqual({ from: 1, to: 3 });
    expect(r.best?.append).toBe(true);
    expect(r.message).toMatch(/loop returns/);
  });
  it('flags an overdue release when nothing ever comes home', () => {
    const r = findReleaseMoments(P('Am F G Em Dm G'), C);
    expect(r.status).toBe('overdue');
    expect(r.best).toEqual({ index: 6, append: true });
  });
  it('flags early arrivals and flat progressions', () => {
    const r = findReleaseMoments(P('C G C F Dm Bb Fm G7'), C);
    expect(r.releases.find((x) => x.index === 2)?.kind).toBe('early');
    expect(r.message).toMatch(/early/);
    expect(findReleaseMoments(P('C C F C'), C).status).toBe('flat');
    expect(findReleaseMoments(P('C G'), C).status).toBe('short');
  });
  it('offers strongest / softer / surprising landings that differ', () => {
    for (const [prog, k, home] of [['C G Am F', C, 'C'], ['Cm Ab Eb Bb', Cm, 'Cm']] as const) {
      const r = findReleaseMoments(P(prog), k);
      expect(r.options.map((o) => o.kind)).toEqual(['strongest', 'softer', 'surprising']);
      expect(chordSymbol(r.options[0]!.chord)).toBe(home);
      expect(new Set(r.options.map((o) => chordSymbol(o.chord))).size).toBe(3);
      expect(r.options[2]!.chord.root).not.toEqual(r.options[0]!.chord.root);
    }
  });
  it('suggests a dominant set-up when the approach is weak', () => {
    const r = findReleaseMoments(P('C G Am F'), C);
    expect(r.setup && chordSymbol(r.setup.chord)).toBe('G7');
    expect(findReleaseMoments(P('C Am Dm G7 Em A7 Dm G7'), C).setup).toBeNull();
  });
});
