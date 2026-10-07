import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadKB } from './helpers';
import {
  SuggestionEngine, key, moodJourney, blendProfiles, chordSymbol, normalizeLore, findLore, parseChord,
  detectPitch, freqToMidi, NoteTracker,
} from '../src/core';

const eng = new SuggestionEngine(loadKB('theory_kb.json'));

describe('mood journey', () => {
  it.each([4, 6, 8])('generates %i chords from melancholy to triumphant', (n) => {
    const j = moodJourney(eng, key('C'), 'melancholy', 'triumphant', { length: n });
    expect(j).toHaveLength(n);
    for (let i = 1; i < j.length; i++) expect(chordSymbol(j[i].chord)).not.toBe(chordSymbol(j[i - 1].chord));
    expect(j[0].t).toBe(0);
    expect(j[n - 1].t).toBe(1);
  });
  it('the path travels: the ending fits the end mood better than the start mood', () => {
    const j = moodJourney(eng, key('A', 'minor'), 'dark', 'hopeful', { length: 6 });
    const last = j[j.length - 1];
    expect(last.matchEnd).toBeGreaterThan(last.matchStart);
    const firstHalf = j.slice(0, 3).reduce((a, s) => a + s.matchEnd, 0) / 3;
    const secondHalf = j.slice(3).reduce((a, s) => a + s.matchEnd, 0) / 3;
    expect(secondHalf).toBeGreaterThan(firstHalf);
  });
  it('can start from a given chord', () => {
    const j = moodJourney(eng, key('G'), 'warm', 'mystical', { length: 4, start: parseChord('G')! });
    expect(chordSymbol(j[0].chord)).toBe('G');
  });
  it('blends profiles linearly', () => {
    const p = blendProfiles({ moods: { dark: 1 }, dims: { tension: 0 }, modes: [], source: 'manual' }, { moods: { bright: 1 }, dims: { tension: 1 }, modes: ['lydian'], source: 'manual' }, 0.25);
    expect(p.moods.dark).toBeCloseTo(0.75);
    expect(p.dims.tension).toBeCloseTo(0.25);
    expect(p.modes).toEqual([]);
  });
});

describe('lore', () => {
  const lore = normalizeLore(JSON.parse(readFileSync(resolve(process.cwd(), 'public/lore.json'), 'utf8')));
  it('is clearly labelled', () => {
    expect(lore.disclaimer).toMatch(/not science/i);
    expect(lore.entries.length).toBeGreaterThan(15);
    expect(lore.entries.every((e) => e.source && e.caution)).toBe(true);
  });
  it('finds key, mode and chord lore', () => {
    expect(findLore(lore, key('D')).map((e) => e.id)).toContain('schubart_d_major');
    expect(findLore(lore, key('F', 'lydian')).map((e) => e.id)).toContain('lydian_wonder');
    expect(findLore(lore, key('C'), parseChord('Bdim7')!).map((e) => e.id)).toEqual(expect.arrayContaining(['dim7_villain', 'diabolus']));
    expect(findLore(lore, key('C'), parseChord('Fm7b5')!).map((e) => e.id)).toContain('tristan');
    expect(findLore(lore, key('C'), parseChord('C')!).map((e) => e.id)).toEqual(['schubart_c_major']);
  });
});

describe('pitch detection (hum it in)', () => {
  const sr = 44100;
  const tone = (f: number, n = 2048, amp = 0.4, harmonics = true) => {
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      b[i] = amp * (Math.sin(2 * Math.PI * f * t) + (harmonics ? 0.5 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t) : 0));
    }
    return b;
  };
  it.each([[110, 45], [220, 57], [261.63, 60], [440, 69], [659.25, 76]])('%f Hz → MIDI %i', (f, midi) => {
    const p = detectPitch(tone(f), sr)!;
    expect(p).not.toBeNull();
    expect(Math.round(freqToMidi(p.freq))).toBe(midi);
    expect(Math.abs(p.freq - f) / f).toBeLessThan(0.01);
  });
  it('ignores silence and noise', () => {
    expect(detectPitch(new Float32Array(2048), sr)).toBeNull();
    let seed = 1;
    const noise = new Float32Array(2048).map(() => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.5);
    const p = detectPitch(noise, sr);
    expect(p === null || p.clarity < 0.6).toBe(true);
  });
  it('segments a hummed sequence into notes', () => {
    const tr = new NoteTracker(4);
    const notes: number[] = [];
    const feed = (f: number | null, frames: number) => {
      for (let i = 0; i < frames; i++) {
        const r = tr.push(f === null ? null : detectPitch(tone(f * (1 + (i % 2 ? 0.003 : -0.003))), sr));
        if (r !== null) notes.push(r);
      }
    };
    feed(261.63, 8); feed(293.66, 8); feed(null, 3); feed(293.66, 6); feed(329.63, 8);
    expect(notes).toEqual([60, 62, 62, 64]);
  });
});

describe('spelling of journey chords', () => {
  it('never produces double-accidental roman numerals across keys', async () => {
    const core = await import('../src/core');
    const eng = new core.SuggestionEngine(loadKB('theory_kb.json'));
    for (const t of ['C', 'G', 'D', 'F', 'Bb', 'Eb', 'A', 'E']) {
      for (const mode of ['major', 'minor'] as const) {
        const steps = core.moodJourney(eng, core.key(t, mode), 'mystical', 'epic', { length: 6 });
        for (const s of steps) expect(s.roman + s.symbol).not.toMatch(/𝄫|𝄪|bb|##/);
      }
    }
  });
});

describe('mood map layout', () => {
  it('separates coincident dots and never overlaps visible labels', async () => {
    const { layoutMoodMap } = await import('../src/core');
    const pts = Array.from({ length: 14 }, (_, i) => ({ id: 'c' + i, x: 200 + (i % 3), y: 150 + (i % 2), label: 'Fmaj7', priority: 14 - i }));
    const box = { x0: 30, y0: 30, x1: 310, y1: 220 };
    const out = layoutMoodMap(pts, { r: 8, charW: 6.4, lineH: 11, box });
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++)
      expect(Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y)).toBeGreaterThan(14);
    for (const o of out) { expect(o.x).toBeGreaterThanOrEqual(box.x0); expect(o.y).toBeLessThanOrEqual(box.y1); }
    expect(out.find((o) => o.id === 'c0')!.showLabel).toBe(true); // highest priority always labelled
    const vis = out.filter((o) => o.showLabel);
    const rect = (o: typeof out[0]) => { const w = o.label.length * 6.4; const x0 = o.anchor === 'middle' ? o.labelX - w / 2 : o.anchor === 'start' ? o.labelX : o.labelX - w; return { x0, x1: x0 + w, y0: o.labelY - 10, y1: o.labelY }; };
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const a = rect(vis[i]), b = rect(vis[j]);
      expect(a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5).toBe(false);
    }
  });
});
