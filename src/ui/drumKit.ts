// Drum playback: real FluidR3 GM Power-kit one-shots for Acoustic / Fusion kits,
// synthesised path kept for Electronic (and as a fallback before samples load).
// Optional steel/taiko layers still colour key-tuned melodic accents.
import type { DrumKitId, DrumVoiceId } from '../core';
import { DEFAULT_DRUM_KIT, nearestSample } from '../core';

const BASE = (import.meta.env?.BASE_URL as string | undefined) ?? '/';

type Stopper = (t: number) => void;

/** GM percussion map → Muse drum voices (FluidR3 Power kit, bank 16). */
export const DRUM_GM_NOTE: Record<DrumVoiceId, number> = {
  BD: 36,   // Bass Drum 1
  BDp: 35,  // Acoustic Bass Drum (punchier alt)
  SD: 38,   // Acoustic Snare
  RS: 37,   // Side Stick
  HH: 42,   // Closed Hi-Hat
  HHs: 46,  // Half-open ≈ open sample, cut short
  HO: 46,   // Open Hi-Hat
  Hf: 44,   // Pedal Hi-Hat
  T1: 50,   // High Tom
  T2: 47,   // Low-Mid Tom
  FT: 41,   // Low Floor Tom
  CC: 49,   // Crash Cymbal 1
  Cs: 55,   // Splash Cymbal
  Rd: 51,   // Ride Cymbal 1
  Rb: 53,   // Ride Bell
};

/** GM note numbers shipped under public/samples/drums/. */
export const DRUM_SAMPLE_NOTES = [...new Set(Object.values(DRUM_GM_NOTE))].sort((a, b) => a - b);

/** Per-kit multipliers for the synthesised Electronic path (and light sample EQ). */
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
  /** Prefer real GM one-shots over the synth path. */
  useSamples: boolean;
  sampleGain: number;
}

const KIT_SCALE: Record<DrumKitId, KitScale> = {
  acoustic: {
    kickDecay: 1, kickClick: 1, kickSample: 0,
    snareDecay: 1, snareNoise: 1,
    hatBright: 1, hatDecay: 1, cymbalWash: 1, tomDecay: 1, steelGain: 0.15, pitchSweep: 1,
    useSamples: true, sampleGain: 1,
  },
  electronic: {
    kickDecay: 0.55, kickClick: 1.7, kickSample: 0,
    snareDecay: 0.62, snareNoise: 1.4,
    hatBright: 1.3, hatDecay: 0.65, cymbalWash: 0.5, tomDecay: 0.55, steelGain: 0, pitchSweep: 0.45,
    useSamples: false, sampleGain: 0,
  },
  fusion: {
    kickDecay: 1.15, kickClick: 0.7, kickSample: 0,
    snareDecay: 1.1, snareNoise: 0.85,
    hatBright: 0.9, hatDecay: 1.2, cymbalWash: 1.35, tomDecay: 1.2, steelGain: 0.55, pitchSweep: 1.1,
    useSamples: true, sampleGain: 0.95,
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
  let s = (seed * 1103515245 + 12345) >>> 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const white = (s / 0xffffffff) * 2 - 1;
    lp = lp * 0.97 + white * 0.03;
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

/** Shared sample banks: GM kit one-shots + pitched steel/taiko colour. */
export class DrumSampleBanks {
  private kit = new Map<number, AudioBuffer>();
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
      ...DRUM_SAMPLE_NOTES.map(async (m) => {
        try {
          const buf = await decode(ctx, await fetchBytes(`${BASE}samples/drums/${m}.mp3`));
          this.kit.set(m, buf);
        } catch { /* missing note ok */ }
      }),
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

  hasKitSample(gm: number): boolean {
    return this.kit.has(gm);
  }

  playKit(
    ctx: BaseAudioContext,
    dest: AudioNode,
    gm: number,
    start: number,
    vel: number,
    opts: { peak?: number; dur?: number; rate?: number; fadeIn?: number } = {},
  ): { end: number; stop: Stopper } | null {
    const buf = this.kit.get(gm);
    if (!buf) return null;
    const rate = Math.max(0.5, Math.min(1.8, opts.rate ?? 1));
    const natural = buf.duration / rate;
    const dur = Math.min(natural, opts.dur ?? natural);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = envGain(ctx, start, (opts.peak ?? 0.9) * vel, opts.fadeIn ?? 0.002, Math.max(0.04, dur));
    src.connect(g).connect(dest);
    src.start(start);
    src.stop(start + dur + 0.05);
    return {
      end: start + dur,
      stop: (t) => {
        try {
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(0, t);
        } catch { /* ok */ }
        try { src.stop(t); } catch { /* ok */ }
      },
    };
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

function articVel(vel: number, artic: string): number {
  if (artic === 'ghost') return vel * 0.38;
  if (artic === 'accent') return Math.min(1, vel * 1.12);
  return vel;
}

/** Natural (unpitched) length hint for truncating open hats / ghosts. */
function sampleDur(voice: DrumVoiceId, artic: string, kit: KitScale): number | undefined {
  if (voice === 'HHs') return 0.14 * kit.hatDecay;
  if (voice === 'HH' || voice === 'Hf') return artic === 'ghost' ? 0.06 : undefined;
  if (voice === 'SD' && artic === 'ghost') return 0.12 * kit.snareDecay;
  if (voice === 'HO') return Math.min(1.1, 0.85 * kit.hatDecay);
  if (voice === 'CC') return Math.min(2.8, 2.2 * kit.cymbalWash);
  if (voice === 'Cs') return Math.min(1.2, 0.9 * kit.cymbalWash);
  if (voice === 'Rd' || voice === 'Rb') return Math.min(2.0, 1.4 * kit.cymbalWash);
  return undefined;
}

/**
 * Play a real GM one-shot for Acoustic / Fusion. Returns null if the sample isn't loaded yet.
 */
function scheduleSampledHit(
  ctx: BaseAudioContext,
  dest: AudioNode,
  voice: DrumVoiceId,
  opts: DrumPlayOpts,
  kit: KitScale,
): { end: number; stop: Stopper } | null {
  const gm = DRUM_GM_NOTE[voice];
  if (!drumBanks.hasKitSample(gm)) return null;
  const start = opts.at;
  const artic = opts.artic ?? 'normal';
  const vel = articVel(Math.max(0.05, Math.min(1, opts.vel)), artic);
  const stoppers: Stopper[] = [];
  const out = ctx.createGain();
  out.gain.value = kit.sampleGain;
  out.connect(dest);

  // Mild pitch for punch kick vs main kick; toms stay natural (real drum pitches).
  let rate = 1;
  if (voice === 'BDp') rate = 1.06;
  if (voice === 'BD') rate = 0.98;

  const peak =
    voice === 'CC' || voice === 'Cs' ? 0.72
      : voice === 'HH' || voice === 'Hf' || voice === 'HHs' ? 0.55
        : voice === 'RS' ? 0.62
          : 0.88;

  const hit = drumBanks.playKit(ctx, out, gm, start, vel, {
    peak,
    dur: sampleDur(voice, artic, kit),
    rate,
  });
  if (!hit) return null;
  stoppers.push(hit.stop);
  let end = hit.end;

  // Soft steel colour on fusion melodic accents (does not replace the real tom/bell).
  if (kit.steelGain > 0.2 && opts.melodic && opts.midi != null && (voice === 'T1' || voice === 'T2' || voice === 'FT' || voice === 'Rb')) {
    const st = drumBanks.playSteel(ctx, out, opts.midi, start, vel * 0.22 * kit.steelGain, 0.45);
    if (st) stoppers.push(st);
  }

  return {
    end,
    stop: (t) => {
      stoppers.forEach((s) => s(t));
      try {
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(0, t);
      } catch { /* ok */ }
    },
  };
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
  const kitId = opts.kit ?? DEFAULT_DRUM_KIT;
  const kit = KIT_SCALE[kitId];

  // Acoustic / Fusion: real GM one-shots when loaded.
  if (kit.useSamples) {
    const sampled = scheduleSampledHit(ctx, dest, voice, opts, kit);
    if (sampled) return sampled;
  }

  // Electronic kit (or sample miss): synthesised path.
  const start = opts.at;
  const vel = Math.max(0.05, Math.min(1, opts.vel));
  const artic = opts.artic ?? 'normal';
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

  if (voice === 'BD' || voice === 'BDp') {
    const midi = opts.midi ?? (voice === 'BDp' ? 43 : 36);
    const fFund = freqFromMidi(midi);
    const punch = voice === 'BDp';
    const decay = (punch ? 0.22 : 0.42) * kit.kickDecay;
    addTone('sine', fFund * (punch ? 2.2 : 2.8), fFund, 0.95 * vel, 0.003, decay, punch ? 0.04 : 0.09);
    addTone('triangle', fFund * 3.2, fFund * 1.1, 0.22 * vel, 0.002, 0.05, 0.03);
    addNoise(0.08, 0.2 * vel * kit.kickClick, 0.001, 0.05, { type: 'highpass', freq: 1200 * kit.hatBright, Q: 0.6 }, 3);
    end = start + (punch ? 0.32 : 0.5) * kit.kickDecay;
  } else if (voice === 'SD' || voice === 'RS') {
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
  } else if (voice === 'HH' || voice === 'HHs' || voice === 'HO' || voice === 'Hf') {
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
    if (!foot) {
      addTone('square', 6200 * kit.hatBright, 5200 * kit.hatBright, 0.04 * vel, 0.001, (open ? 0.2 : 0.03) * kit.hatDecay, 0.02);
    }
    end = start + len + 0.05;
  } else if (voice === 'CC' || voice === 'Cs' || voice === 'Rd' || voice === 'Rb') {
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
    } else if (ride) {
      addTone('sine', 880, 860, 0.08 * vel, 0.002, 0.4 * kit.cymbalWash, 0.05);
    } else {
      addTone('sine', 540, 420, 0.1 * vel, 0.003, (splash ? 0.25 : 0.7) * kit.cymbalWash, 0.08);
    }
    end = start + len;
  } else {
    const midi = opts.midi ?? (voice === 'T1' ? 67 : voice === 'T2' ? 60 : 50);
    const f = freqFromMidi(midi);
    const tomDec = 0.38 * kit.tomDecay;
    addTone('sine', f * 1.55, f, 0.72 * vel, 0.004, tomDec, 0.07);
    addTone('sine', f * 2.15, f * 1.05, 0.18 * vel, 0.003, 0.22 * kit.tomDecay, 0.05);
    addNoise(0.12 * kit.tomDecay, 0.18 * vel, 0.002, 0.08 * kit.tomDecay, { type: 'bandpass', freq: f * 2.4, Q: 0.8 }, 41);
    end = start + 0.45 * kit.tomDecay;
  }

  out.gain.value = 1;
  return {
    end,
    stop: (t) => {
      stoppers.forEach((s) => s(t));
      try {
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(0, t);
      } catch { /* ok */ }
    },
  };
}
