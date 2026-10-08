// Polyphonic chord recognition: spectrum → 12-bin chroma → template match against chord qualities.
// Pure functions (no Web Audio) so they can be unit-tested with synthesized signals and ported.
//
// Templates are *harmonic-aware*: each chord tone contributes its first 6 harmonics (decaying), so a
// real instrument's overtones (e.g. the 3rd harmonic of E is B) don't turn C major into Cmaj7.
// A single-note template competes too, so one sustained note isn't mistaken for a triad.
import { QualityId } from './chords';

export interface ChromaFrame {
  /** 12 values (C..B), L2-normalised; all zeros if silent */
  chroma: number[];
  /** energy per pitch class in the bass band (L2-normalised), used to pick the root of symmetric chords */
  bass: number[];
  /** total linear magnitude (pre-normalisation) — lets callers gate on loudness */
  energy: number;
}

export type ChordQualityId = Extract<QualityId, 'maj' | 'min' | '7' | 'maj7' | 'm7' | 'sus2' | 'sus4' | 'dim' | 'aug'>;
export const RECOGNIZED_QUALITIES: ChordQualityId[] = ['maj', 'min', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'aug'];
const QUALITY_INTERVALS: Record<ChordQualityId | 'note', number[]> = {
  note: [0], maj: [0, 4, 7], min: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  sus2: [0, 2, 7], sus4: [0, 5, 7], dim: [0, 3, 6], aug: [0, 4, 8],
};
/** Small prior: simpler/common chords win near-ties (a sus or 7th must be clearly heard). */
const QUALITY_PRIOR: Record<ChordQualityId | 'note', number> = {
  note: 0, maj: 0.02, min: 0.02, '7': 0, maj7: 0, m7: 0, sus2: -0.01, sus4: -0.01, dim: -0.01, aug: -0.02,
};

const HARMONICS = 6;
const HARMONIC_DECAY = 0.6;
const mod12 = (n: number) => ((n % 12) + 12) % 12;
const norm = (v: number[]) => { const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)); return n > 0 ? v.map((x) => x / n) : v.map(() => 0); };
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

/** Harmonic-aware chroma template for a set of pitch classes. */
export function chordTemplate(pcs: number[]): number[] {
  const t = new Array(12).fill(0);
  for (const p of pcs) for (let h = 1; h <= HARMONICS; h++) t[mod12(p + Math.round(12 * Math.log2(h)))] += Math.pow(HARMONIC_DECAY, h - 1);
  return norm(t);
}

const TEMPLATES: Array<{ root: number; quality: ChordQualityId | 'note'; pcs: number[]; t: number[] }> = [];
for (let root = 0; root < 12; root++)
  for (const q of Object.keys(QUALITY_INTERVALS) as Array<ChordQualityId | 'note'>) {
    const pcs = QUALITY_INTERVALS[q].map((i) => mod12(root + i));
    TEMPLATES.push({ root, quality: q, pcs, t: chordTemplate(pcs) });
  }

/** In-place iterative radix-2 FFT (length must be a power of two). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** Hann-windowed magnitude spectrum (bins 0..N/2-1) of a time-domain frame (length padded to a power of 2). */
export function magnitudeSpectrum(samples: ArrayLike<number>): Float64Array {
  let n = 1;
  while (n < samples.length) n <<= 1;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < samples.length; i++) re[i] = samples[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (samples.length - 1)));
  fft(re, im);
  const out = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) out[k] = Math.hypot(re[k], im[k]);
  return out;
}

/** Convert Web Audio `getFloatFrequencyData` dB values into linear magnitudes. */
export function dbToMagnitudes(db: ArrayLike<number>): Float64Array {
  const out = new Float64Array(db.length);
  for (let i = 0; i < db.length; i++) out[i] = isFinite(db[i]) ? Math.pow(10, db[i] / 20) : 0;
  return out;
}

/**
 * Fold a magnitude spectrum into a chroma vector. Only local spectral peaks count (reduces smear from
 * windowing and broadband noise), weighted by how close they sit to an equal-tempered pitch.
 */
export function chromaFromSpectrum(
  mags: ArrayLike<number>, sampleRate: number, fftSize: number,
  opts: { minHz?: number; maxHz?: number; bassMaxHz?: number; a4?: number } = {},
): ChromaFrame {
  const minHz = opts.minHz ?? 60, maxHz = opts.maxHz ?? 2200, bassMax = opts.bassMaxHz ?? 260, a4 = opts.a4 ?? 440;
  const binHz = sampleRate / fftSize;
  const lo = Math.max(1, Math.floor(minHz / binHz)), hi = Math.min(mags.length - 2, Math.ceil(maxHz / binHz));
  let peak = 0;
  for (let k = lo; k <= hi; k++) peak = Math.max(peak, mags[k]);
  const chroma = new Array(12).fill(0), bass = new Array(12).fill(0);
  let energy = 0;
  if (peak <= 0) return { chroma, bass, energy };
  const floor = peak * 0.04;
  for (let k = lo; k <= hi; k++) {
    const m = mags[k];
    energy += m;
    if (m < floor || m < mags[k - 1] || m < mags[k + 1]) continue;
    // parabolic interpolation for the true peak frequency
    const a = mags[k - 1], b = m, c = mags[k + 1];
    const den = a - 2 * b + c;
    const delta = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
    const f = (k + delta) * binHz;
    const midi = 69 + 12 * Math.log2(f / a4);
    const r = Math.round(midi);
    const cents = Math.abs(midi - r) * 100;
    const w = Math.sqrt(m) * Math.max(0, 1 - cents / 50); // compress dynamics; detuned peaks count less
    chroma[mod12(r)] += w;
    if (f <= bassMax) bass[mod12(r)] += w;
  }
  return { chroma: norm(chroma), bass: norm(bass), energy };
}

/** Chroma for a raw time-domain frame (used by tests and any non-Web-Audio host). */
export function chromaFromSignal(samples: ArrayLike<number>, sampleRate: number, opts: Parameters<typeof chromaFromSpectrum>[3] = {}): ChromaFrame {
  const mags = magnitudeSpectrum(samples);
  return chromaFromSpectrum(mags, sampleRate, mags.length * 2, opts);
}

/**
 * Chroma from held MIDI notes (Web MIDI / keyboard). Uses the same harmonic-aware
 * templates as mic recognition so `matchChord` stays consistent across input modes.
 */
export function chromaFromMidis(midis: number[]): ChromaFrame {
  if (!midis.length) return { chroma: new Array(12).fill(0), bass: new Array(12).fill(0), energy: 0 };
  const pcs = [...new Set(midis.map((m) => mod12(Math.round(m))))];
  const sorted = [...midis].map((m) => Math.round(m)).sort((a, b) => a - b);
  const bass = new Array(12).fill(0);
  bass[mod12(sorted[0])] = 1;
  return { chroma: chordTemplate(pcs), bass: norm(bass), energy: midis.length };
}

export interface ChordMatch {
  kind: 'chord' | 'note';
  root: number; // pitch class
  quality: ChordQualityId | 'note';
  pcs: number[];
  /** cosine similarity with the winning template (0..1) */
  score: number;
  /** gap to the best competing template with a different pitch-class set */
  margin: number;
  /** 0..1 combined confidence for display/thresholding */
  confidence: number;
}

/** Template-match a chroma frame. Returns null for silence. */
export function matchChord(frame: ChromaFrame, opts: { qualities?: ChordQualityId[] } = {}): ChordMatch | null {
  if (!frame.chroma.some((x) => x > 0)) return null;
  const allowed = new Set<string>([...(opts.qualities ?? RECOGNIZED_QUALITIES), 'note']);
  const hasBass = frame.bass.some((x) => x > 0);
  const scored = TEMPLATES.filter((t) => allowed.has(t.quality)).map((t) => {
    const cos = dot(frame.chroma, t.t);
    // root in the bass resolves symmetric/ambiguous sets (Csus2 = Gsus4, augmented triads, C6 vs Am7…)
    const bassBonus = hasBass ? 0.04 * frame.bass[t.root] : 0;
    return { t, cos, s: cos + QUALITY_PRIOR[t.quality] + bassBonus };
  }).sort((a, b) => b.s - a.s);
  const best = scored[0];
  const key = (pcs: number[]) => [...pcs].sort((a, b) => a - b).join(',');
  const bk = key(best.t.pcs);
  const rival = scored.find((x) => key(x.t.pcs) !== bk);
  const margin = rival ? best.cos - rival.cos : best.cos;
  const confidence = Math.max(0, Math.min(1, (best.cos - 0.6) / 0.35)) * Math.max(0, Math.min(1, 0.4 + margin * 12));
  return { kind: best.t.quality === 'note' ? 'note' : 'chord', root: best.t.root, quality: best.t.quality, pcs: best.t.pcs, score: best.cos, margin, confidence };
}

/**
 * Debounces a stream of frame-level labels: emits a label once it has been stable for `minMs`;
 * a sustained label is never re-emitted; the same label can be emitted again only after a gap
 * (silence/null for `gapMs`) or after a different label was emitted. Time-based, so frame rate doesn't matter.
 */
export class HoldTracker<T> {
  private cand: string | null = null;
  private candSince = 0;
  private candValue: T | null = null;
  private lastEmitted: string | null = null;
  private silentSince: number | null = null;
  constructor(private minMs = 250, private gapMs = 180) {}

  reset(): void {
    this.cand = null;
    this.candValue = null;
    this.lastEmitted = null;
    this.silentSince = null;
  }

  /** Feed one frame. `key` identifies the label (null = silence/low confidence). Returns the value when it should be added. */
  push(key: string | null, value: T | null, tMs: number): T | null {
    if (key === null) {
      if (this.silentSince === null) this.silentSince = tMs;
      if (tMs - this.silentSince >= this.gapMs) this.lastEmitted = null;
      this.cand = null;
      return null;
    }
    this.silentSince = null;
    if (key !== this.cand) {
      this.cand = key;
      this.candSince = tMs;
      this.candValue = value;
      return null;
    }
    this.candValue = value ?? this.candValue;
    if (tMs - this.candSince >= this.minMs && this.lastEmitted !== key) {
      this.lastEmitted = key;
      return this.candValue;
    }
    return null;
  }

  /** Progress (0..1) of the current candidate toward being accepted — for a live indicator. */
  progress(tMs: number): number {
    return this.cand === null || this.cand === this.lastEmitted ? 0 : Math.min(1, (tMs - this.candSince) / this.minMs);
  }
}
