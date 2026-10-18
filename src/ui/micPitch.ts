// Raw mic pitch stream for tools that need timing (Hum → harmony, Play-along): ~30 frames/s of
// { t, midi | null, level }. Shares the iOS AudioSession handling with Listen (see listen.ts).
import { detectPitch, freqToMidi, rms } from '../core';
import { setAudioSession } from './audio';

export interface MicFrame { t: number; midi: number | null; level: number; clarity: number }
export interface MicSession { stop(): void; sampleRate: number }

export async function startMicPitch(o: {
  onFrame: (f: MicFrame) => void;
  /** Return true to ignore frames (e.g. while our own audio is sounding without headphones). */
  isPaused?: () => boolean;
  minFreq?: number; maxFreq?: number; minRms?: number;
}): Promise<MicSession> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone not available (needs HTTPS or localhost).');
  setAudioSession('play-and-record');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
  } catch (e) {
    setAudioSession('playback');
    throw e;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const minRms = o.minRms ?? 0.012;
  const t0 = performance.now();
  let running = true;
  const timer = window.setInterval(() => {
    if (!running) return;
    const t = (performance.now() - t0) / 1000;
    analyser.getFloatTimeDomainData(buf);
    const level = rms(buf);
    if (o.isPaused?.() || level < minRms) { o.onFrame({ t, midi: null, level, clarity: 0 }); return; }
    const p = detectPitch(buf, ctx.sampleRate, { minFreq: o.minFreq ?? 70, maxFreq: o.maxFreq ?? 1100, minRms });
    const ok = p && p.clarity >= 0.7;
    o.onFrame({ t, midi: ok ? freqToMidi(p.freq) : null, level, clarity: p?.clarity ?? 0 });
  }, 33);
  return {
    sampleRate: ctx.sampleRate,
    stop() {
      if (!running) return;
      running = false;
      window.clearInterval(timer);
      stream.getTracks().forEach((tr) => tr.stop());
      if (ctx.state !== 'closed') ctx.close().catch(() => {});
      setAudioSession('playback');
    },
  };
}
