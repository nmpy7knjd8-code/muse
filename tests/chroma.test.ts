import { describe, expect, it } from 'vitest';
import { HoldTracker, chordTemplate, chromaFromSignal, fft, matchChord, rms } from '../src/core';

const SR = 44100;
const N = 8192;
// deterministic PRNG so the noise is reproducible
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Harmonic-rich tones (6 partials, 1/h amplitude, random phase + ±6 cent detune) plus white noise. */
function synth(midis: number[], opts: { noise?: number; seed?: number; partials?: number } = {}): Float32Array {
  const r = rng(opts.seed ?? 1);
  const out = new Float32Array(N);
  for (const m of midis) {
    const f0 = hz(m) * 2 ** (((r() - 0.5) * 12) / 1200);
    for (let h = 1; h <= (opts.partials ?? 6); h++) {
      const ph = r() * 2 * Math.PI, amp = 0.2 / h;
      for (let i = 0; i < N; i++) out[i] += amp * Math.sin((2 * Math.PI * f0 * h * i) / SR + ph);
    }
  }
  const nz = opts.noise ?? 0.01;
  for (let i = 0; i < N; i++) out[i] += nz * (r() * 2 - 1);
  return out;
}
const PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const label = (m: ReturnType<typeof matchChord>) => (m ? `${PC[m.root]}${m.quality}` : 'none');

describe('FFT', () => {
  it('finds a pure tone at the right bin', () => {
    const n = 1024, re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 37 * i) / n);
    fft(re, im);
    const mags = Array.from(re.slice(0, n / 2), (x, k) => Math.hypot(x, im[k]));
    expect(mags.indexOf(Math.max(...mags))).toBe(37);
  });
});

describe('chroma + chord template matching (synthesized signals)', () => {
  // voicings: bass root in octave 3, upper structure around octave 4
  const cases: Array<[string, number[]]> = [
    ['Cmaj', [48, 60, 64, 67]],
    ['Amin', [45, 57, 60, 64]],
    ['G7', [43, 59, 62, 65]],
    ['Fmaj7', [41, 57, 60, 64]],
    ['Em7', [40, 55, 59, 62]],
    ['Dsus4', [50, 62, 67, 69]],
    ['Dsus2', [50, 62, 64, 69]],
    ['Bdim', [47, 59, 62, 65]],
    ['Caug', [48, 60, 64, 68]],
    ['F#min', [42, 57, 61, 66]],
    ['Ebmaj', [51, 58, 63, 67]],
  ];
  for (const [name, midis] of cases) {
    it(`recognises ${name}`, () => {
      const m = matchChord(chromaFromSignal(synth(midis, { seed: midis[0] }), SR));
      const want = name.replace('Eb', 'D#').replace(/maj$/, 'maj').replace(/^([A-G]#?)(min|maj|7|maj7|m7|sus4|sus2|dim|aug)$/, '$1$2');
      expect(label(m)).toBe(want);
      expect(m!.kind).toBe('chord');
      expect(m!.confidence).toBeGreaterThan(0.5);
    });
  }
  it('is robust to moderate noise and different seeds', () => {
    let ok = 0;
    for (let s = 1; s <= 10; s++) if (label(matchChord(chromaFromSignal(synth([48, 55, 64, 72], { noise: 0.05, seed: s }), SR))) === 'Cmaj') ok++;
    expect(ok).toBeGreaterThanOrEqual(9);
  });
  it('a single sustained note is reported as a note, not a triad', () => {
    const m = matchChord(chromaFromSignal(synth([57], { seed: 3 }), SR));
    expect(m!.kind).toBe('note');
    expect(PC[m!.root]).toBe('A');
  });
  it('broadband noise yields low confidence; silence yields null', () => {
    const r = rng(9);
    const noise = Float32Array.from({ length: N }, () => (r() * 2 - 1) * 0.3);
    const m = matchChord(chromaFromSignal(noise, SR));
    expect(m === null || m.confidence < 0.5).toBe(true);
    expect(matchChord(chromaFromSignal(new Float32Array(N), SR))).toBeNull();
    expect(rms(new Float32Array(N))).toBe(0);
  });
  it('harmonic-aware templates: C major triad (whose E has a B overtone) is not mistaken for Cmaj7', () => {
    const t = chordTemplate([0, 4, 7]);
    expect(t[11]).toBeGreaterThan(0); // B from E's 3rd harmonic
    expect(label(matchChord(chromaFromSignal(synth([48, 52, 55, 60], { seed: 5 }), SR)))).toBe('Cmaj');
  });
  it('restricting qualities works', () => {
    const m = matchChord(chromaFromSignal(synth([43, 59, 62, 65], { seed: 2 }), SR), { qualities: ['maj', 'min'] });
    expect(label(m)).toBe('Gmaj');
  });
});

describe('HoldTracker (debounce for live listening)', () => {
  it('emits once after the hold time, never re-adds a sustained label', () => {
    const tr = new HoldTracker<string>(250, 180);
    const out: string[] = [];
    for (let t = 0; t <= 1000; t += 20) { const v = tr.push('C', 'C', t); if (v) out.push(v); }
    expect(out).toEqual(['C']);
  });
  it('ignores blips shorter than the hold time', () => {
    const tr = new HoldTracker<string>(250, 180);
    const out: string[] = [];
    const seq = [...Array(15).fill('C'), ...Array(5).fill('D'), ...Array(15).fill('C')];
    seq.forEach((k, i) => { const v = tr.push(k, k, i * 20); if (v) out.push(v); });
    expect(out).toEqual(['C']);
  });
  it('re-adds the same label only after a silent gap; a new label is added after its own hold', () => {
    const tr = new HoldTracker<string>(250, 180);
    const out: string[] = [];
    let t = 0;
    const feed = (k: string | null, ms: number) => { for (const end = t + ms; t < end; t += 20) { const v = tr.push(k, k, t); if (v) out.push(v); } };
    feed('C', 400); feed(null, 100); feed('C', 400); // short gap: no repeat
    feed(null, 300); feed('C', 400); // real gap: repeat
    feed('E', 400);
    expect(out).toEqual(['C', 'C', 'E']);
  });
  it('reset() (used while the app is playing) clears pending state', () => {
    const tr = new HoldTracker<string>(250, 180);
    tr.push('C', 'C', 0); tr.push('C', 'C', 200); tr.reset();
    expect(tr.push('C', 'C', 260)).toBeNull();
    expect(tr.progress(300)).toBeGreaterThan(0);
  });
});
