// Muse audio engine: sampled instruments (piano / nylon & steel guitar / Rhodes / pad) with ADSR,
// velocity, humanized strums, a generated convolution reverb, and a compressor + limiter master bus.
// Works on any BaseAudioContext, so the offline preview renderer uses exactly the same code.
// Realtime use must be unlocked from a user gesture (iOS Safari autoplay rules).
import { INSTRUMENTS, InstrumentDef, InstrumentId, chordEvents, nearestSample, rng, sampleNotes } from '../core';

type AudioSessionNav = Navigator & { audioSession?: { type: string } };
export type LoadState = { state: 'idle' | 'loading' | 'ready' | 'error'; progress: number };
/** iOS Safari AudioSession types we use (WebKit 16.4+). */
export type AudioSessionType = 'playback' | 'play-and-record' | 'auto';

/**
 * Set the page-level audio session. iOS rejects getUserMedia while the session is
 * `playback` ("AudioSession category is not compatible with audio capture") — Listen
 * must switch to `play-and-record` first; normal play prefers `playback` so sound
 * still comes through the silent/ringer switch.
 */
export function setAudioSession(type: AudioSessionType): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as AudioSessionNav;
  try { if (nav.audioSession) nav.audioSession.type = type; } catch { /* unsupported / ignored */ }
}

const BASE = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
const sampleUrl = (id: InstrumentId, midi: number) => `${BASE}samples/${id}/${midi}.mp3`;
const STORAGE_KEY = 'muse.instrument';

// Raw (encoded) bytes are shared between contexts; decoded buffers are per context.
const bytesCache = new Map<string, Promise<ArrayBuffer>>();
function fetchBytes(url: string): Promise<ArrayBuffer> {
  let p = bytesCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.arrayBuffer(); });
    p.catch(() => bytesCache.delete(url));
    bytesCache.set(url, p);
  }
  return p;
}
function decode(ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // older Safari only supports the callback form
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(data.slice(0), resolve, reject);
    if (p && typeof (p as Promise<AudioBuffer>).then === 'function') (p as Promise<AudioBuffer>).then(resolve, reject);
  });
}

/** Small stereo room impulse response: decaying, progressively darker noise with a short pre-delay. */
function makeImpulse(ctx: BaseAudioContext, seconds = 1.7, preDelay = 0.012): AudioBuffer {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
  const ir = ctx.createBuffer(2, len, sr);
  const rand = rng(7);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = Math.floor(preDelay * sr); i < len; i++) {
      const t = i / sr;
      const k = Math.min(0.92, 0.25 + t * 0.55); // more smoothing later → darker tail
      lp = lp * k + (rand() * 2 - 1) * (1 - k);
      d[i] = lp * Math.pow(1 - t / seconds, 2.2) * 2.2;
    }
  }
  return ir;
}

interface Voice { stop(at: number): void; end: number }

export class AudioEngine {
  ctx: BaseAudioContext | null = null;
  private input: GainNode | null = null;
  private wet: GainNode | null = null;
  private voices: Voice[] = [];
  private buffers = new Map<InstrumentId, Map<number, { buf: AudioBuffer; norm: number }>>();
  private load = new Map<InstrumentId, LoadState>();
  private loading = new Map<InstrumentId, Promise<void>>();
  private listeners = new Set<() => void>();
  private busyUntil = 0;
  private rand: () => number = Math.random;
  instrument: InstrumentId = 'piano';
  unlocked = false;

  constructor(opts: { remember?: boolean; seed?: number } = {}) {
    if (opts.seed) this.rand = rng(opts.seed);
    if (opts.remember && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY) as InstrumentId | null;
      if (saved && saved in INSTRUMENTS) this.instrument = saved;
    }
    this.remember = !!opts.remember;
  }
  private remember: boolean;

  get def(): InstrumentDef { return INSTRUMENTS[this.instrument]; }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit() { this.listeners.forEach((f) => f()); }
  loadState(id: InstrumentId = this.instrument): LoadState { return this.load.get(id) ?? { state: 'idle', progress: 0 }; }

  /** Build the mixing graph on a context (realtime or offline). */
  attach(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    this.buffers.clear();
    this.load.clear();
    this.loading.clear();
    const input = ctx.createGain();
    input.gain.value = 0.55;
    // gentle glue compression, then a fast limiter so dense chords never clip
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 2.5; comp.attack.value = 0.01; comp.release.value = 0.25;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2.5; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.12;
    const master = ctx.createGain();
    master.gain.value = 0.95;
    const verb = ctx.createConvolver();
    verb.buffer = makeImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = this.def.reverb;
    const hp = ctx.createBiquadFilter(); // keep low-end mud out of the reverb
    hp.type = 'highpass'; hp.frequency.value = 220;
    input.connect(comp);
    input.connect(hp).connect(verb).connect(wet).connect(comp);
    comp.connect(limiter).connect(master).connect(ctx.destination);
    this.input = input;
    this.wet = wet;
  }

  /** Realtime: call synchronously inside a tap/click handler. */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      // iOS 16.4+/17: play through the ringer/silent switch like a media app.
      // Listen mode temporarily overrides this to play-and-record (see setAudioSession).
      setAudioSession('playback');
      this.attach(new AC({ latencyHint: 'interactive' }));
      void this.ensureLoaded();
    }
    const ctx = this.ctx as AudioContext;
    if (ctx.state !== 'running' && typeof ctx.resume === 'function') void ctx.resume();
    if (!this.unlocked) {
      // a 1-sample silent buffer started inside the gesture fully unlocks older iOS versions
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
      this.unlocked = true;
    }
  }

  /** Is the realtime context actually producing sound? (false → show the silent-switch tip) */
  isRunning(): boolean { return !!this.ctx && (this.ctx as AudioContext).state === 'running'; }

  setInstrument(id: InstrumentId): void {
    this.instrument = id;
    if (this.remember) try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode */ }
    if (this.wet && this.ctx) this.wet.gain.setTargetAtTime(this.def.reverb, this.ctx.currentTime, 0.05);
    this.emit();
    if (this.ctx) void this.ensureLoaded(id);
  }

  /** Lazy-load (fetch + decode) an instrument's samples; resolves when ready (or failed → synth fallback). */
  ensureLoaded(id: InstrumentId = this.instrument): Promise<void> {
    if (!this.ctx) return Promise.resolve();
    const existing = this.loading.get(id);
    if (existing) return existing;
    const ctx = this.ctx;
    const notes = sampleNotes(INSTRUMENTS[id]);
    let done = 0;
    this.load.set(id, { state: 'loading', progress: 0 });
    this.emit();
    const map = new Map<number, { buf: AudioBuffer; norm: number }>();
    const p = Promise.all(notes.map(async (m) => {
      const buf = await decode(ctx, await fetchBytes(sampleUrl(id, m)));
      // normalise each sample's peak so loudness is even across the keyboard
      let peak = 0;
      for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i += 4) peak = Math.max(peak, Math.abs(d[i])); }
      map.set(m, { buf, norm: peak > 0 ? 0.7 / peak : 1 });
      done++;
      this.load.set(id, { state: 'loading', progress: done / notes.length });
      if (done % 4 === 0) this.emit();
    })).then(() => {
      if (this.ctx !== ctx) return;
      this.buffers.set(id, map);
      this.load.set(id, { state: 'ready', progress: 1 });
      this.emit();
    }).catch(() => {
      this.load.set(id, { state: 'error', progress: 0 });
      this.loading.delete(id);
      this.emit();
    });
    this.loading.set(id, p);
    return p;
  }

  /** True while our own playback (plus a short room tail) could reach the microphone (Listen mode pauses). */
  isPlaying(): boolean { return performance.now() < this.busyUntil; }
  private markBusy(endCtxTime: number) {
    if (!this.ctx) return;
    const ms = (endCtxTime - this.ctx.currentTime) * 1000 + 400;
    this.busyUntil = Math.max(this.busyUntil, performance.now() + ms);
  }

  stopAll(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const v of this.voices) v.stop(t);
    this.voices = [];
    this.busyUntil = Math.min(this.busyUntil, performance.now() + 450);
  }

  private now() { return this.ctx ? this.ctx.currentTime + 0.03 : 0; }

  /** One note: sampled when the instrument is loaded, otherwise the fallback synth. */
  private voice(midi: number, start: number, dur: number, vel: number) {
    const ctx = this.ctx, input = this.input;
    if (!ctx || !input) return;
    const def = this.def;
    const set = this.buffers.get(def.id);
    const out = ctx.createGain();
    // gentle stereo spread by pitch
    let tail: AudioNode = out;
    if (typeof ctx.createStereoPanner === 'function') {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-0.35, Math.min(0.35, (midi - 64) / 60));
      out.connect(pan); tail = pan;
    }
    tail.connect(input);
    const off = start + dur + def.ring;
    let v: Voice;
    if (set && set.size) {
      const { sample, rate } = nearestSample(midi, [...set.keys()]);
      const { buf, norm } = set.get(sample)!;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      let node: AudioNode = src;
      if (def.velocityFilter) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1400 + vel * vel * 9000;
        lp.Q.value = 0.3;
        src.connect(lp); node = lp;
      }
      const level = def.gain * norm * (0.25 + 0.75 * vel);
      const g = out.gain;
      g.setValueAtTime(0, start);
      g.linearRampToValueAtTime(level, start + def.attack); // click-free attack
      g.setValueAtTime(level, off);
      g.setTargetAtTime(0, off, def.release); // natural exponential release
      node.connect(out);
      const natural = start + buf.duration / rate;
      const stopAt = Math.min(natural, off + def.release * 6);
      src.start(start);
      src.stop(stopAt + 0.01);
      v = { end: stopAt, stop: (t) => { g.cancelScheduledValues(t); g.setTargetAtTime(0, t, 0.04); try { src.stop(t + 0.3); } catch { /* already stopped */ } } };
    } else {
      v = this.fallbackVoice(midi, start, vel, out, off);
    }
    this.voices.push(v);
    this.markBusy(v.end);
    if (this.voices.length > 64) this.voices.splice(0, this.voices.length - 64);
  }

  /** Improved synth used until samples load: FM e-piano/pluck, or detuned saws through a filter envelope for the pad. */
  private fallbackVoice(midi: number, start: number, vel: number, out: GainNode, off: number): Voice {
    const ctx = this.ctx!;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const def = this.def;
    const g = out.gain;
    const oscs: OscillatorNode[] = [];
    let end: number;
    if (def.id === 'pad') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 0.7;
      lp.frequency.setValueAtTime(350, start);
      lp.frequency.linearRampToValueAtTime(1800 + vel * 1200, start + 0.35);
      lp.frequency.setTargetAtTime(900, start + 0.35, 0.6);
      for (const det of [-7, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(lp); oscs.push(o); }
      lp.connect(out);
      const level = 0.09 * (0.4 + 0.6 * vel);
      g.setValueAtTime(0, start); g.linearRampToValueAtTime(level, start + 0.18); g.setValueAtTime(level, off); g.setTargetAtTime(0, off, 0.5);
      end = off + 3;
    } else {
      // 2-operator FM: modulator index decays → bright "tine" attack mellowing into a sine
      const plucked = def.voicing === 'guitar' || def.voicing === 'bass';
      const car = ctx.createOscillator(); car.frequency.value = f;
      const mod = ctx.createOscillator(); mod.frequency.value = f * (plucked ? 3 : 1);
      const idx = ctx.createGain();
      idx.gain.setValueAtTime(f * (plucked ? 1.2 : 2.2) * vel, start);
      idx.gain.setTargetAtTime(f * 0.15, start, plucked ? 0.08 : 0.25);
      mod.connect(idx).connect(car.frequency);
      car.connect(out); oscs.push(car, mod);
      const level = 0.22 * (0.35 + 0.65 * vel);
      const decay = plucked ? 0.5 : 0.9;
      g.setValueAtTime(0, start); g.linearRampToValueAtTime(level, start + 0.005);
      g.setTargetAtTime(level * 0.35, start + 0.005, decay);
      g.setTargetAtTime(0, off, def.release);
      end = off + def.release * 6;
    }
    oscs.forEach((o) => { o.start(start); o.stop(end); });
    return { end, stop: (t) => { g.cancelScheduledValues(t); g.setTargetAtTime(0, t, 0.04); oscs.forEach((o) => { try { o.stop(t + 0.3); } catch { /* ok */ } }); } };
  }

  /** Play notes together (a chord is strummed/rolled per instrument, with slight humanization). */
  playNotes(midis: number[], opts: { at?: number; dur?: number; vel?: number } = {}): void {
    if (!this.ctx) return;
    const t = (opts.at ?? 0) + this.now();
    for (const e of chordEvents(midis, t, opts.dur ?? 1.1, opts.vel ?? 0.75, this.def, this.rand)) this.voice(e.midi, e.time, e.dur, e.vel);
  }

  /** Play note-groups one after another (e.g. previous chord → suggestion). */
  playSequence(groups: number[][], step = 0.9, dur = 0.85): void {
    if (!this.ctx) return;
    this.stopAll();
    groups.forEach((g, i) => this.playNotes(g, { at: i * step, dur, vel: i === groups.length - 1 ? 0.78 : 0.7 }));
  }
}

export const synth = new AudioEngine({ remember: true });
