import { describe, expect, it } from 'vitest';
import {
  HOOK_VARIATIONS, STRUMS, arrangeLayers, arpDensity, chordPcs, chordSymbol, fitStress, guessStress, key, makeHooks, melodyCoach,
  modulationRoutes, modulationTargets, parseChord, rng, strumHits, strumsFor, suggestedStrum, syllabify, tuningById, varyHook,
  type BeatNote,
} from '../src/core';
const C = (s: string) => parseChord(s)!;
const k = key('C', 'major');

describe('melody coach (#14)', () => {
  it('needs a melody', () => { expect(melodyCoach([], [C('C')], k, 4)).toBeNull(); });
  it('praises a smooth repeated melody ending home and flags a jumpy one with its bar', () => {
    const good: BeatNote[] = [64, 62, 60, 62, 64, 62, 60, 62, 64, 65, 64, 62, 60, 62, 60, 60].map((m, i) => ({ midi: m, beat: i, dur: 1 }));
    const r = melodyCoach(good, [C('C'), C('G'), C('F'), C('C')], k, 4)!;
    expect(r.traits.find((t) => t.id === 'smooth')!.value).toBeGreaterThan(0.8);
    expect(r.traits.find((t) => t.id === 'home')!.value).toBe(1);
    const jumpy: BeatNote[] = [60, 72, 79, 84, 62, 74, 65, 77].map((m, i) => ({ midi: m, beat: i, dur: 1 }));
    const j = melodyCoach(jumpy, [C('C'), C('F')], k, 4)!;
    expect(j.tip).toMatch(/Bar \d/);
    expect(j.traits.every((t) => t.value >= 0 && t.value <= 1)).toBe(true);
  });
});

describe('strums (#15)', () => {
  it('fit the time signature and follow the style', () => {
    for (const s of STRUMS) for (const n of s.num) expect(strumHits(s, n).every((h) => h.beat < n)).toBe(true);
    expect(suggestedStrum('tool', 4).id).toBe('chug');
    expect(suggestedStrum('reggae', 4).id).toBe('skank');
    expect(suggestedStrum(null, 3).id).toBe('waltz');
    expect(suggestedStrum('reggae', 3).num).toContain(3);
    expect(strumsFor(7).length).toBeGreaterThan(0);
  });
});

describe('hooks (#16)', () => {
  it('motifs start on chord tones and variations make 2 bars', () => {
    const hooks = makeHooks([C('Am'), C('F')], key('A', 'minor'), 4, rng(2));
    expect(hooks).toHaveLength(3);
    for (const h of hooks) {
      expect(chordPcs(C('Am'))).toContain(((h.notes[0]!.midi % 12) + 12) % 12);
      for (const v of HOOK_VARIATIONS) {
        const two = varyHook(h.notes, v.id, key('A', 'minor'), C('F'), 4);
        expect(two.some((n) => n.beat >= 4)).toBe(true);
        expect(two.every((n) => n.beat < 8)).toBe(true);
        expect(chordPcs(C('F'))).toContain(((two.find((n) => n.beat >= 4)!.midi % 12) + 12) % 12);
      }
    }
  });
});

describe('lyric stress (#17)', () => {
  it('syllabifies and guesses stress plausibly', () => {
    expect(syllabify('yesterday').length).toBe(3);
    expect(syllabify('love')).toEqual(['love']);
    expect(syllabify('nation').length).toBe(2);
    const s = guessStress('I want to hold your hand');
    expect(s.filter((x) => x.stress).map((x) => x.text)).toEqual(['want', 'hold', 'hand']);
    const t = guessStress('imagination');
    expect(t.findIndex((x) => x.stress)).toBe(t.length - 2);
  });
  it('places stresses on strong beats', () => {
    const placed = fitStress(guessStress('I want to hold your hand'), 4);
    for (const p of placed.filter((x) => x.stress)) expect(p.strong).toBe(true);
  });
});

describe('modulation (#18)', () => {
  it('targets keep mode and tag tuning-friendly keys', () => {
    const t = modulationTargets(key('C', 'major'), tuningById('dropD'));
    expect(t[0]!.tonic).toBe('Db');
    expect(t.find((x) => x.tonic === 'D')!.easy).toBe(true);
    expect(modulationTargets(key('A', 'minor'), null).at(-1)!.tonic).toBe('C');
  });
  it('routes end on the new home; dominant route uses V7', () => {
    const r = modulationRoutes(key('C', 'major'), 'G');
    expect(r.map((x) => x.kind)).toEqual(['pivot', 'dominant', 'jump']);
    for (const x of r) expect(chordSymbol(x.chords.at(-1)!)).toBe('G');
    expect(chordSymbol(r[1]!.chords[0]!)).toBe('D7');
    expect(modulationRoutes(key('C', 'major'), 'Db').map((x) => x.kind)).toContain('dominant');
  });
});

describe('layers (#19)', () => {
  it('honours toggles, style density and tuning floor', () => {
    const ev = arrangeLayers([C('Dm'), C('Bb')], 4, 'tool', tuningById('dropD'), ['bass', 'arp']);
    expect(new Set(ev.map((e) => e.layer))).toEqual(new Set(['bass', 'arp']));
    expect(Math.min(...ev.filter((e) => e.layer === 'bass').map((e) => e.midi!))).toBe(38);
    expect(arpDensity('tool')).toBe(4); expect(arpDensity('cinematic')).toBe(1);
    expect(ev.filter((e) => e.layer === 'arp').length).toBe(2 * 4 * 4);
  });
});
describe('post-build fixes', () => {
  it('to- prefix words stress the second syllable', () => {
    const s = guessStress('tonight');
    expect(s.find((x) => x.stress)!.text.toLowerCase()).toMatch(/night/);
  });
  it('an unrecovered leap gets the leap tip', () => {
    const m: BeatNote[] = [64, 62, 60, 62, 71, 74, 79, 81, 65, 64, 62, 60].map((x, i) => ({ midi: x, beat: i, dur: 1 }));
    expect(melodyCoach(m, [C('C'), C('G'), C('Am')], k, 4)!.tip).toMatch(/leaps/);
  });
});
describe('pickup', () => {
  it('leading weak syllables become a pickup so the first stress is a downbeat', () => {
    const placed = fitStress(guessStress('I want to hold your hand'), 4);
    expect(placed[0]!.slot).toBe(7);
    expect(placed[1]!.slot).toBe(8);
    expect(placed.filter((x) => x.clash)).toHaveLength(0);
  });
});
