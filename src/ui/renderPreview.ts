// Offline preview renderer: plays a progression through the *same* AudioEngine into an
// OfflineAudioContext and returns a 16-bit stereo WAV. Loaded only when the page URL has ?render-preview
// (used by scripts to produce audio previews; not part of the normal UI).
import { INSTRUMENTS, InstrumentId, chordMidis, parseChord, voiceProgression } from '../core';
import { AudioEngine } from './audio';

export async function renderProgression(instrument: InstrumentId, symbols: string[], opts: { step?: number; tail?: number; sampleRate?: number } = {}): Promise<Uint8Array> {
  const step = opts.step ?? 1.6, tail = opts.tail ?? 2.5, sr = opts.sampleRate ?? 44100;
  const chords = symbols.map((s) => parseChord(s)!);
  const length = Math.ceil((chords.length * step + tail) * sr);
  const ctx = new OfflineAudioContext(2, length, sr);
  const eng = new AudioEngine({ seed: 42 });
  eng.attach(ctx);
  eng.setInstrument(instrument);
  await eng.ensureLoaded(instrument);
  if (eng.loadState(instrument).state !== 'ready') throw new Error('samples failed to load');
  const voicings = voiceProgression(chords);
  chords.forEach((c, i) => eng.playNotes(chordMidis(c, voicings[i], INSTRUMENTS[instrument]), { at: 0.1 + i * step, dur: step * 0.92, vel: 0.72 }));
  const buf = await ctx.startRendering();
  return encodeWav(buf);
}

export function encodeWav(buf: AudioBuffer): Uint8Array {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true);
  out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Uint8Array(out.buffer);
}

/** Peak / clipped-sample stats for QA. */
export function stats(wav: Uint8Array): { peak: number; clipped: number } {
  const dv = new DataView(wav.buffer, wav.byteOffset);
  let peak = 0, clipped = 0;
  for (let o = 44; o + 1 < wav.length; o += 2) { const v = Math.abs(dv.getInt16(o, true)) / 32768; peak = Math.max(peak, v); if (v > 0.999) clipped++; }
  return { peak, clipped };
}
