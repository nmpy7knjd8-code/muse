// Monophonic pitch detection (YIN, de Cheveigné & Kawahara 2002) + note segmentation for "hum it in".
// Pure functions on Float32Array frames — no Web Audio dependency, so it is unit-testable.

export interface PitchResult {
  freq: number;
  /** 0..1, higher = more periodic */
  clarity: number;
}

export function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

export function detectPitch(buf: Float32Array, sampleRate: number, opts: { minFreq?: number; maxFreq?: number; threshold?: number; minRms?: number } = {}): PitchResult | null {
  const minF = opts.minFreq ?? 70, maxF = opts.maxFreq ?? 1100, thr = opts.threshold ?? 0.15;
  if (rms(buf) < (opts.minRms ?? 0.01)) return null;
  const maxTau = Math.min(Math.floor(sampleRate / minF), Math.floor(buf.length / 2));
  const minTau = Math.max(2, Math.floor(sampleRate / maxF));
  const W = buf.length - maxTau;
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    cmnd[tau] = running ? (d[tau] * tau) / running : 1;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t] < thr) {
      while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  // parabolic interpolation
  const a = cmnd[tau - 1] ?? cmnd[tau], b = cmnd[tau], c = cmnd[tau + 1] ?? cmnd[tau];
  const denom = a + c - 2 * b;
  const better = denom ? tau + (a - c) / (2 * denom) : tau;
  return { freq: sampleRate / better, clarity: Math.max(0, Math.min(1, 1 - b)) };
}

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

/**
 * Turns a stream of per-frame pitch estimates into discrete notes: a note is emitted once the same
 * (rounded) MIDI pitch has been stable for `minFrames` frames; it re-arms after silence or a pitch change.
 */
export class NoteTracker {
  private candidate: number | null = null;
  private count = 0;
  private emitted: number | null = null;
  constructor(private minFrames = 5, private maxCents = 45) {}

  push(p: PitchResult | null): number | null {
    if (!p || p.clarity < 0.6) {
      this.candidate = null;
      this.count = 0;
      this.emitted = null; // silence re-arms repeated notes
      return null;
    }
    const m = freqToMidi(p.freq);
    const r = Math.round(m);
    if (Math.abs(m - r) * 100 > this.maxCents) return null;
    if (r === this.candidate) this.count++;
    else {
      this.candidate = r;
      this.count = 1;
    }
    if (this.count >= this.minFrames && this.emitted !== r) {
      this.emitted = r;
      return r;
    }
    return null;
  }
}
