// "Hum it in": microphone → YIN pitch detection → discrete melody notes.
// getUserMedia needs a secure context (https or localhost) — on iPhone use the HTTPS deploy.
import { NoteTracker, detectPitch, freqToMidi } from '../core';

export interface MicSession {
  stop(): void;
}

export async function startHumming(onNote: (midi: number) => void, onPitch?: (midi: number | null) => void): Promise<MicSession> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone not available (needs HTTPS or localhost).');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const tracker = new NoteTracker(5);
  let raf = 0;
  let running = true;
  const tick = () => {
    if (!running) return;
    analyser.getFloatTimeDomainData(buf);
    const p = detectPitch(buf, ctx.sampleRate, { minFreq: 70, maxFreq: 1100, minRms: 0.015 });
    onPitch?.(p && p.clarity > 0.6 ? Math.round(freqToMidi(p.freq)) : null);
    const note = tracker.push(p);
    if (note !== null) onNote(note);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
