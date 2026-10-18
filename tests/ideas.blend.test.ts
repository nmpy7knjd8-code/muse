import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadKB } from './helpers';
import { SuggestionEngine, normalizeArtists, artistProfile, artistAdventure, blendArtists, blendProgression, key, chordSymbol } from '../src/core';

const eng = new SuggestionEngine(loadKB('theory_kb.json'));
const file = normalizeArtists(JSON.parse(readFileSync(resolve(process.cwd(), 'public/artists.json'), 'utf8')))!;
const byName = (n: string) => file.artists.find((a) => a.name === n)!;

describe('artist style blend (idea 7)', () => {
  const A = byName('The Beatles'), B = byName('Meshuggah');
  it('profiles carry canonical moods and polarity-derived dimension targets', () => {
    const p = artistProfile(eng, byName('Bernard Herrmann'));
    expect(Object.values(p.moods).reduce((s, w) => s + w, 0)).toBeCloseTo(1, 5);
    for (const id of Object.keys(p.moods)) expect(eng.lexicon.canonical(id)).toBe(id);
    expect(p.dims.brightness!).toBeLessThan(artistProfile(eng, A).dims.brightness ?? 1);
  });
  it('slider ends reproduce each artist; the middle mixes moods from both', () => {
    const at0 = blendArtists(eng, A, B, 0), at1 = blendArtists(eng, A, B, 1), mid = blendArtists(eng, A, B, 0.5);
    expect(at0.moods[0]!.id).toBe(artistProfile(eng, A) && Object.entries(artistProfile(eng, A).moods).sort((x, y) => y[1] - x[1])[0]![0]);
    expect(at0.adventure).toBeCloseTo(artistAdventure(A), 6);
    expect(at1.adventure).toBeCloseTo(artistAdventure(B), 6);
    const aTop = new Set(Object.keys(artistProfile(eng, A).moods)), bTop = new Set(Object.keys(artistProfile(eng, B).moods));
    const midTop = mid.moods.slice(0, 6).map((m) => m.id);
    expect(midTop.some((m) => aTop.has(m))).toBe(true);
    expect(midTop.some((m) => bTop.has(m))).toBe(true);
    for (const l of mid.leans) expect(l.mix).toBeCloseTo((l.a + l.b) / 2, 6);
  });
  it('writes a progression of the requested length; moving the slider changes it', () => {
    const k = key('E', 'minor');
    const left = blendProgression(eng, k, blendArtists(eng, A, B, 0), { length: 4 });
    const right = blendProgression(eng, k, blendArtists(eng, A, B, 1), { length: 4 });
    expect(left).toHaveLength(4);
    expect(right).toHaveLength(4);
    expect(left.map((s) => chordSymbol(s.chord)).join()).not.toBe(right.map((s) => chordSymbol(s.chord)).join());
  });
});
