import { describe, expect, it } from 'vitest';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { INSTRUMENTS, INSTRUMENT_IDS, avoidMud, chordEvents, chordMidis, keysVoicing, nearestSample, parseChord, pianoVoicing, pc, rng, sampleNotes, chordPcs } from '../src/core';

const ch = (s: string) => parseChord(s)!;

describe('sample selection', () => {
  it('every instrument sample file exists, and the whole set stays within budget', () => {
    let total = 0;
    for (const id of INSTRUMENT_IDS) for (const m of sampleNotes(INSTRUMENTS[id])) {
      const f = resolve(process.cwd(), `public/samples/${id}/${m}.mp3`);
      expect(existsSync(f), f).toBe(true);
      total += statSync(f).size;
    }
    const all = INSTRUMENT_IDS.flatMap((id) => readdirSync(resolve(process.cwd(), `public/samples/${id}`)));
    expect(all.length).toBe(INSTRUMENT_IDS.reduce((s, id) => s + sampleNotes(INSTRUMENTS[id]).length, 0));
    expect(total / 1e6).toBeLessThan(6);
    expect(total / 1e6).toBeGreaterThan(2);
  });
  it('picks the nearest sample and pitch-shifts at most 1.5 semitones inside the range', () => {
    const notes = sampleNotes(INSTRUMENTS.piano);
    for (let m = 33; m <= 96; m++) {
      const { sample, rate } = nearestSample(m, notes);
      expect(Math.abs(sample - m)).toBeLessThanOrEqual(1.5);
      expect(rate).toBeCloseTo(2 ** ((m - sample) / 12), 9);
    }
    expect(nearestSample(60, notes)).toEqual({ sample: 60, rate: 1 });
  });
});

describe('pleasant voicing', () => {
  it('avoids muddy close intervals in the low register', () => {
    const v = avoidMud([36, 40, 43, 48]); // C2 E2 G2 C3: thirds down low are mud
    for (let i = 1; i < v.length; i++) if (v[i - 1] < 48) expect(v[i] - v[i - 1]).toBeGreaterThanOrEqual(7);
    expect(v[0]).toBe(36);
  });
  it('keys voicing: bass in D2..C#3 with the voice-led upper structure, all chord tones kept', () => {
    for (const s of ['C', 'Am', 'F', 'G7', 'Bdim', 'Ebmaj7', 'F#m7b5', 'C/E']) {
      const c = ch(s);
      const v = keysVoicing(c, pianoVoicing(c));
      expect(v[0]).toBeGreaterThanOrEqual(38);
      expect(v[0]).toBeLessThanOrEqual(49);
      expect(new Set(v.map((m) => m % 12))).toEqual(new Set(v.map((m) => m % 12)));
      for (let i = 1; i < v.length; i++) if (v[i - 1] < 48) expect(v[i] - v[i - 1]).toBeGreaterThanOrEqual(7);
      const pcs = new Set(chordPcs(c));
      expect(v.every((m) => pcs.has(m % 12))).toBe(true);
    }
  });
  it('guitar instruments play a real guitar shape (6-string range, chord tones only)', () => {
    for (const s of ['C', 'Am', 'F', 'G7', 'Bm', 'E']) {
      const c = ch(s);
      const v = chordMidis(c, pianoVoicing(c), INSTRUMENTS.nylon);
      expect(v.length).toBeGreaterThanOrEqual(3);
      expect(Math.min(...v)).toBeGreaterThanOrEqual(40);
      const pcs = new Set(chordPcs(c));
      expect(v.every((m) => pcs.has(m % 12))).toBe(true);
    }
  });
  it('bass guitar plays a single low root in the sample range', () => {
    for (const s of ['C', 'Am', 'F', 'G7', 'C/E']) {
      const c = ch(s);
      const v = chordMidis(c, pianoVoicing(c), INSTRUMENTS.bass);
      expect(v).toHaveLength(1);
      expect(v[0]).toBeGreaterThanOrEqual(28);
      expect(v[0]).toBeLessThanOrEqual(55);
      expect(v[0] % 12).toBe(pc(c.bass ?? c.root));
    }
  });
});

describe('strum + humanization', () => {
  it('guitar strums low→high with ~15–30 ms per string; piano chords are near-simultaneous', () => {
    const notes = [40, 45, 52, 57, 60, 64];
    const g = chordEvents(notes, 1, 1, 0.7, INSTRUMENTS.nylon, rng(3));
    for (let i = 1; i < g.length; i++) {
      const gap = g[i].time - g[i - 1].time;
      expect(gap).toBeGreaterThan(0.012);
      expect(gap).toBeLessThan(0.034);
      expect(g[i].midi).toBeGreaterThan(g[i - 1].midi);
    }
    const p = chordEvents(notes, 1, 1, 0.7, INSTRUMENTS.piano, rng(3));
    expect(Math.max(...p.map((e) => e.time)) - Math.min(...p.map((e) => e.time))).toBeLessThan(0.04);
  });
  it('velocity humanization stays gentle and in range; top voice not quieter than bass on average', () => {
    const r = rng(11);
    for (let k = 0; k < 50; k++) {
      const ev = chordEvents([48, 55, 64, 67, 72], 0, 1, 0.75, INSTRUMENTS.piano, r);
      for (const e of ev) { expect(e.vel).toBeGreaterThan(0.55); expect(e.vel).toBeLessThanOrEqual(0.85); expect(e.time).toBeGreaterThanOrEqual(0); }
    }
  });
  it('is deterministic with a seeded rng (offline renders are reproducible)', () => {
    expect(chordEvents([48, 52, 55], 0, 1, 0.7, INSTRUMENTS.steel, rng(5))).toEqual(chordEvents([48, 52, 55], 0, 1, 0.7, INSTRUMENTS.steel, rng(5)));
  });
});
