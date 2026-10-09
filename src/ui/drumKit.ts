// High-quality multi-layer drum one-shots + sampled taiko / steel-drum accents.
// Unpitched voices are synthesised with shaped noise + tonal bodies; pitched voices
// (kick/toms/ride bell) prefer key MIDI and can layer FluidR3 steel/taiko samples.
// Kit presets (acoustic / electronic / fusion) scale the same voices — mix with any pattern.
import type { DrumKitId, DrumVoiceId } from '../core';
import { DEFAULT_DRUM_KIT, nearestSample } from '../core';

const BASE = (import.meta.env?.BASE_URL as string | undefined) ?? '/';

type Stopper = (t: number) => void;

/** Per-kit multipliers applied to the shared synthesis path. */
interface KitScale {
  kickDecay: number;
  kickClick: number;
  kickSample: number;
  snareDecay: number;
  snareNoise: number;
  hatBright: number;
  hatDecay: number;
  cymbalWash: number;
  tomDecay: number;
  steelGain: number;
  pitchSweep: number;
}

const KIT_SCALE: Record<DrumKitId, KitScale> = {
  acoustic: {
    kickDecay: 1, kickClick: 1, kickSample: 1,
    snareDecay: 1, snareNoise: 1,
    hatBright: 1, hatDecay: 1, cymbalWash: 1, tomDecay: 1, steelGain: 1, pitchSweep: 1,
  },
  electronic: {
    kickDecay: 0.55, kickClick: 1.7, kickSample: 0,
    snareDecay: 0.62, snareNoise: 1.4,
    hatBright: 1.3, hatDecay: 0.65, cymbalWash: 0.5, tomDecay: 0.55, steelGain: 0, pitchSweep: 0.45,
  },
  fusion: {
    kickDecay: 1.2, kickClick: 0.65, kickSample: 0.9,
    snareDecay: 1.15, snareNoise: 0.8,
    hatBright: 0.82, hatDecay: 1.25, cymbalWash: 1.5, tomDecay: 1.3, steelGain: 1.35, pitchSweep: 1.15,
  },
};

export interface DrumPlayOpts {
  at: number; // absolute AudioContext time
  vel: number;
  artic?: string;
  /** Key-tuned or melodic MIDI (toms / kick / bell / steel). */
  midi?: number;
  /** Layer melodic steel-drum sample when pitching in key. */
  melodic?: boolean;
  /** Sound character — independent of the groove pattern. */
  kit?: DrumKitId;
}

function makeNoise(ctx: BaseAudioContext, seconds: number, seed = 1): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // Simple LCG — reproducible “noise” with less zipper than Math.random in OfflineAudioContext tests.
  let s = (seed * 1103515245 + 12345) >>> 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const white = (s / 0xffffffff) * 2 - 1;
    lp = lp * 0.97 + white * 0.03; // slight pink tilt
    d[i] = white * 0.7 + lp * 0.3;
  }
  return buf;
}

function envGain(
  ctx: BaseAudioContext,
  start: number,
  peak: number,
  attack: number,
  decay: number,
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + Math.max(0.001, attack));
  g.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(attack + 0.01, decay));
  return g;
}

const bytesCache = new Map<string, Promise<ArrayBuffer>>();
function fetchBytes(url: string): Promise<ArrayBuffer> {
  let p = bytesCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.arrayBuffer(); });
    p.catch(() => bytesCache.delete(url));
    bytesCache.set(url, p);
  }
  return p;
}

function decode(ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(data.slice(0), resolve, reject);
    if (p && typeof (p as Promise<AudioBuffer>).then === 'function') (p as Promise<AudioBuffer>).then(resolve, reject);
  });
}

/** Shared sample banks for pitched kit colour (CC BY 3.0 FluidR3). */
export class DrumSampleBanks {
  private steel = new Map<number, AudioBuffer>();
  private taiko = new Map<number, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private ready = false;

  ensure(ctx: BaseAudioContext): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.loading) return this.loading;
    const steelNotes: number[] = [];
    for (let m = 48; m <= 84; m++) steelNotes.push(m);
    const taikoNotes = [36, 39, 42, 45, 48, 51, 54, 57, 60];
    this.loading = Promise.all([
      ...steelNotes.map(async (m) => {
        try {
          const buf = await decode(ctx, await fetchBytes(`${BASE}samples/steeldrum/${m}.mp3`));
          this.steel.set(m, buf);
        } catch { /* missing note ok */ }
      }),
      ...taikoNotes.map(async (m) => {
        try {
          const buf = await decode(ctx, await fetchBytes(`${BASE}samples/taiko/${m}.mp3`));
          this.taiko.set(m, buf);
        } catch { /* missing note ok */ }
      }),
    ]).then(() => { this.ready = true; }).catch(() => { this.loading = null; });
    return this.loading;
  }

  playSteel(ctx: BaseAudioContext, dest: AudioNode, midi: number, start: number, vel: number, dur = 0.9): Stopper | null {
    if (!this.steel.size) return null;
    const { sample, rate } = nearestSample(midi, [...this.steel.keys()]);
    const buf = this.steel.get(sample);
    if (!buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = envGain(ctx, start, 0.45 * vel, 0.004, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'highshelf';
    bp.frequency.value = 2500;
    bp.gain.value = 2;
    src.connect(bp).connect(g).connect(dest);
    src.start(start);
    src.stop(start + dur + 0.05);
    return (t) => { try { src.stop(t); } catch { /* ok */ } };
  }

  playTaiko(ctx: BaseAudioContext, dest: AudioNode, midi: number, start: number, vel: number, dur = 0.55): Stopper | null {
    if (!this.taiko.size) return null;
    const { sample, rate } = nearestSample(midi, [...this.taiko.keys()]);
    const buf = this.taiko.get(sample);
    if (!buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.5, Math.min(1.8, rate));
    const g = envGain(ctx, start, 0.55 * vel, 0.003, dur);
    src.connect(g).connect(dest);
    src.start(start);
    src.stop(start + dur + 0.05);
    return (t) => { try { src.stop(t); } catch { /* ok */ } };
  }
}

export const drumBanks = new DrumSampleBanks();

function freqFromMidi(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/**
 * Schedule a kit voice. Returns end time and stop callback for the voice list.
 */
export function scheduleDrumHit(
  ctx: BaseAudioContext,
  dest: AudioNode,
  voice: DrumVoiceId,
  opts: DrumPlayOpts,
): { end: number; stop: Stopper } {
  const start = opts.at;
  const vel = Math.max(0.05, Math.min(1, opts.vel));
  const artic = opts.artic ?? 'normal';
  const kit = KIT_SCALE[opts.kit ?? DEFAULT_DRUM_KIT];
  const stoppers: Stopper[] = [];
  let end = start + 0.4;
  const out = ctx.createGain();
  out.connect(dest);

  const addNoise = (
    seconds: number,
    peak: number,
    attack: number,
    decay: number,
    filter: { type: BiquadFilterType; freq: number; Q?: number },
    seed: number,
  ) => {
    const src = ctx.createBufferSource();
    src.buffer = makeNoise(ctx, seconds, seed);
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.value = filter.freq;
    if (filter.Q != null) f.Q.value = filter.Q;
    const g = envGain(ctx, start, peak, attack, decay);
    src.connect(f).connect(g).connect(out);
    src.start(start);
    src.stop(start + seconds);
    stoppers.push((t) => { try { src.stop(t); } catch { /* ok */ } });
  };

  const addTone = (
    type: OscillatorType,
    f0: number,
    f1: number,
    peak: number,
    attack: number,
    decay: number,
    sweep = 0.06,
  ) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), start);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), start + sweep * kit.pitchSweep);
    const g = envGain(ctx, start, peak, attack, decay);
    o.connect(g).connect(out);
    o.start(start);
    o.stop(start + decay + 0.05);
    stoppers.push((t) => { try { o.stop(t); } catch { /* ok */ } });
  };

  // ---- Kick family ----
  if (voice === 'BD' || voice === 'BDp') {
    const midi = opts.midi ?? (voice === 'BDp' ? 43 : 36);
    const fFund = freqFromMidi(midi);
    const punch = voice === 'BDp';
    const decay = (punch ? 0.22 : 0.42) * kit.kickDecay;
    addTone('sine', fFund * (punch ? 2.2 : 2.8), fFund, 0.95 * vel, 0.003, decay, punch ? 0.04 : 0.09);
    addTone('triangle', fFund * 3.2, fFund * 1.1, 0.22 * vel, 0.002, 0.05, 0.03);
    addNoise(0.08, 0.2 * vel * kit.kickClick, 0.001, 0.05, { type: 'highpass', freq: 1200 * kit.hatBright, Q: 0.6 }, 3);
    if (kit.kickSample > 0.05) {
      const tk = drumBanks.playTaiko(ctx, out, midi, start, vel * (punch ? 0.55 : 0.7) * kit.kickSample, (punch ? 0.35 : 0.6) * kit.kickDecay);
      if (tk) stoppers.push(tk);
    }
    end = start + (punch ? 0.32 : 0.5) * kit.kickDecay;
  }

  // ---- Snare / rim ----
  else if (voice === 'SD' || voice === 'RS') {
    const ghost = artic === 'ghost';
    if (voice === 'RS') {
      addNoise(0.12 * kit.snareDecay, 0.4 * vel, 0.001, 0.06 * kit.snareDecay, { type: 'bandpass', freq: 2400 * kit.hatBright, Q: 2.5 }, 9);
      addTone('triangle', 420, 280, 0.15 * vel, 0.001, 0.05, 0.02);
      end = start + 0.14 * kit.snareDecay;
    } else {
      const bodyDec = (ghost ? 0.08 : 0.14) * kit.snareDecay;
      const noiseDec = (ghost ? 0.07 : 0.18) * kit.snareDecay;
      addTone('triangle', ghost ? 190 : 235, ghost ? 150 : 180, (ghost ? 0.18 : 0.38) * vel, 0.002, bodyDec, 0.04);
      addNoise(0.28 * kit.snareDecay, (ghost ? 0.28 : 0.62) * vel * kit.snareNoise, 0.001, noiseDec, { type: 'bandpass', freq: 1800 * kit.hatBright, Q: 0.85 }, 11);
      addNoise(0.2 * kit.snareDecay, (ghost ? 0.12 : 0.28) * vel * kit.snareNoise, 0.001, (ghost ? 0.05 : 0.12) * kit.snareDecay, { type: 'highpass', freq: 5500 * kit.hatBright, Q: 0.5 }, 12);
      end = start + (ghost ? 0.16 : 0.28) * kit.snareDecay;
    }
  }

  // ---- Hats (closed / half / open / foot) ----
  else if (voice === 'HH' || voice === 'HHs' || voice === 'HO' || voice === 'Hf') {
    const open = voice === 'HO';
    const half = voice === 'HHs';
    const foot = voice === 'Hf';
    const len = (open ? 0.55 : half ? 0.22 : foot ? 0.08 : 0.11) * kit.hatDecay;
    const peak = (open ? 0.38 : half ? 0.34 : foot ? 0.28 : 0.32) * vel
      * (artic === 'accent' ? 1.15 : artic === 'ghost' ? 0.4 : 1);
    addNoise(len, peak, 0.001, (open ? 0.4 : half ? 0.16 : 0.06) * kit.hatDecay, {
      type: 'highpass', freq: (open ? 4800 : half ? 6200 : 7800) * kit.hatBright, Q: 0.7,
    }, 21);
    addNoise(len * 0.8, peak * 0.55, 0.001, (open ? 0.28 : 0.05) * kit.hatDecay, {
      type: 'bandpass', freq: (open ? 7500 : 9500) * kit.hatBright, Q: open ? 0.55 : 1.1,
    }, 22);
    // Metallic partials
    if (!foot) {
      addTone('square', 6200 * kit.hatBright, 5200 * kit.hatBright, 0.04 * vel, 0.001, (open ? 0.2 : 0.03) * kit.hatDecay, 0.02);
    }
    end = start + len + 0.05;
  }

  // ---- Cymbals: crash / splash / ride / bell ----
  else if (voice === 'CC' || voice === 'Cs' || voice === 'Rd' || voice === 'Rb') {
    const splash = voice === 'Cs';
    const ride = voice === 'Rd';
    const bell = voice === 'Rb';
    const len = (splash ? 0.45 : ride ? 0.85 : bell ? 0.7 : 1.35) * kit.cymbalWash;
    const hp = (splash ? 900 : ride ? 700 : bell ? 1200 : 450) * kit.hatBright;
    addNoise(len, (splash ? 0.42 : ride ? 0.32 : bell ? 0.28 : 0.5) * vel, 0.002, (splash ? 0.28 : ride ? 0.5 : 0.95) * kit.cymbalWash, {
      type: 'highpass', freq: hp, Q: 0.55,
    }, 31);
    addNoise(len * 0.7, 0.22 * vel, 0.002, (splash ? 0.2 : 0.55) * kit.cymbalWash, {
      type: 'bandpass', freq: (splash ? 4800 : ride ? 3800 : 3200) * kit.hatBright, Q: 0.7,
    }, 32);
    if (bell) {
      const midi = opts.midi ?? 72;
      const f = freqFromMidi(midi);
      addTone('sine', f * 2.01, f * 1.99, 0.35 * vel, 0.002, 0.55 * kit.cymbalWash, 0.01);
      addTone('triangle', f * 3.02, f * 2.95, 0.12 * vel, 0.002, 0.35 * kit.cymbalWash, 0.02);
      if (kit.steelGain > 0.05) {
        const st = drumBanks.playSteel(ctx, out, midi, start, vel * 0.55 * kit.steelGain, 0.7 * kit.cymbalWash);
        if (st) stoppers.push(st);
      }
    } else if (ride) {
      addTone('sine', 880, 860, 0.08 * vel, 0.002, 0.4 * kit.cymbalWash, 0.05);
    } else {
      addTone('sine', 540, 420, 0.1 * vel, 0.003, (splash ? 0.25 : 0.7) * kit.cymbalWash, 0.08);
    }
    end = start + len;
  }

  // ---- Toms (key-tuned) ----
  else {
    const midi = opts.midi ?? (voice === 'T1' ? 67 : voice === 'T2' ? 60 : 50);
    const f = freqFromMidi(midi);
    const tomDec = 0.38 * kit.tomDecay;
    addTone('sine', f * 1.55, f, 0.72 * vel, 0.004, tomDec, 0.07);
    addTone('sine', f * 2.15, f * 1.05, 0.18 * vel, 0.003, 0.22 * kit.tomDecay, 0.05);
    addNoise(0.12 * kit.tomDecay, 0.18 * vel, 0.002, 0.08 * kit.tomDecay, { type: 'bandpass', freq: f * 2.4, Q: 0.8 }, 41);
    if (opts.melodic !== false && kit.steelGain > 0.05) {
      const st = drumBanks.playSteel(ctx, out, midi, start, vel * 0.35 * kit.steelGain, 0.55 * kit.tomDecay);
      if (st) stoppers.push(st);
    }
    end = start + 0.45 * kit.tomDecay;
  }

  out.gain.value = 1;
  return {
    end,
    stop: (t) => {
      stoppers.forEach((s) => s(t));
      try {
        out.gain.cancelScheduledValues(t);
        out.gain.setTargetAtTime(0, t, 0.02);
      } catch { /* ok */ }
    },
  };
}
