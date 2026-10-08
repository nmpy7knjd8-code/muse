// "Listen" live mode: keeps the mic open and turns what it hears into melody notes (YIN, monophonic)
// or chords (FFT → chroma → template match, polyphonic). Debounced with HoldTracker so a sustained
// note/chord is added once; an RMS gate ignores silence/noise; listening pauses while Muse itself plays.
// getUserMedia needs a secure context (HTTPS or localhost).
// iOS: the page AudioSession must be `play-and-record` before capture — `playback` (set on unlock
// so Muse plays through the silent switch) throws "AudioSession category is not compatible…".
import { HoldTracker, chromaFromSpectrum, dbToMagnitudes, detectPitch, freqToMidi, matchChord, rms, type ChordMatch } from '../core';
import { setAudioSession } from './audio';

export type ListenTarget = 'melody' | 'chords';
export interface ListenStatus {
  state: 'listening' | 'paused' | 'quiet';
  /** what is being heard right now (may not be accepted yet) */
  label: string | null;
  confidence: number;
  /** 0..1 progress toward being added (hold timer) */
  hold: number;
  level: number;
}
export interface ListenOptions {
  target: () => ListenTarget;
  isPaused: () => boolean;
  onNote: (midi: number) => void;
  onChord: (m: ChordMatch) => void;
  onStatus: (s: ListenStatus) => void;
  noteName: (midi: number) => string;
  chordName: (m: ChordMatch) => string;
  /** RMS gate (linear, 0..1) */
  minRms?: number;
  noteHoldMs?: number;
  chordHoldMs?: number;
  minChordConfidence?: number;
}
export interface ListenSession { stop(): void }

/** Friendlier copy for the iOS AudioSession / permission failures. */
export function listenErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const s = raw.toLowerCase();
  if (s.includes('audiosession') || s.includes('not compatible with audio capture')) {
    return 'Mic needs play-and-record audio — tap Listen again. If it still fails, reload the page and try Listen before playing chords.';
  }
  if (s.includes('notallowed') || s.includes('permission') || s.includes('denied')) {
    return 'Microphone permission denied — allow mic access for this site in Safari settings.';
  }
  if (s.includes('secure') || s.includes('https')) {
    return 'Microphone needs HTTPS (or localhost).';
  }
  return raw || 'Microphone unavailable';
}

export async function startListening(o: ListenOptions): Promise<ListenSession> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone not available (needs HTTPS or localhost).');
  // Must run in the same user-gesture turn as the tap when possible; unlock() may have set `playback`.
  setAudioSession('play-and-record');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch (e) {
    setAudioSession('playback');
    throw e;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 8192; // ~5.4 Hz bins at 44.1 kHz: enough to separate low chord tones
  analyser.smoothingTimeConstant = 0.35;
  src.connect(analyser);
  const time = new Float32Array(analyser.fftSize);
  const freq = new Float32Array(analyser.frequencyBinCount);
  const minRms = o.minRms ?? 0.012;
  const minConf = o.minChordConfidence ?? 0.55;
  const notes = new HoldTracker<number>(o.noteHoldMs ?? 250, 180);
  const chords = new HoldTracker<ChordMatch>(o.chordHoldMs ?? 350, 250);
  let lastTarget: ListenTarget = o.target();
  let lastStatus = 0;
  let running = true;
  let timer = 0;

  const status = (s: ListenStatus, now: number, force = false) => {
    if (force || now - lastStatus > 90) { lastStatus = now; o.onStatus(s); }
  };

  const tick = () => {
    if (!running) return;
    const now = performance.now();
    const target = o.target();
    if (target !== lastTarget) { notes.reset(); chords.reset(); lastTarget = target; }
    if (o.isPaused()) {
      // our own playback must not feed back into detection
      notes.reset(); chords.reset();
      status({ state: 'paused', label: null, confidence: 0, hold: 0, level: 0 }, now);
      return;
    }
    analyser.getFloatTimeDomainData(time);
    const recent = time.subarray(time.length - 2048);
    const level = rms(recent);
    if (level < minRms) {
      notes.push(null, null, now); chords.push(null, null, now);
      status({ state: 'quiet', label: null, confidence: 0, hold: 0, level }, now);
      return;
    }
    if (target === 'melody') {
      const p = detectPitch(recent, ctx.sampleRate, { minFreq: 70, maxFreq: 1100, minRms });
      const m = p ? freqToMidi(p.freq) : null;
      const r = m !== null ? Math.round(m) : null;
      const ok = p !== null && r !== null && p.clarity >= 0.75 && Math.abs((m as number) - r) <= 0.4;
      const got = notes.push(ok ? String(r) : null, ok ? r : null, now);
      if (got !== null) o.onNote(got);
      status({ state: 'listening', label: ok ? o.noteName(r as number) : null, confidence: p ? p.clarity : 0, hold: notes.progress(now), level }, now, got !== null);
    } else {
      analyser.getFloatFrequencyData(freq);
      const frame = chromaFromSpectrum(dbToMagnitudes(freq), ctx.sampleRate, analyser.fftSize, { minHz: 60, maxHz: 2200 });
      const m = matchChord(frame);
      const ok = m !== null && m.kind === 'chord' && m.confidence >= minConf;
      const got = chords.push(ok ? `${m!.root}:${m!.quality}` : null, ok ? m : null, now);
      if (got) o.onChord(got);
      status({ state: 'listening', label: m ? (m.kind === 'chord' ? o.chordName(m) : `${o.noteName(60 + m.root).replace(/\d+$/, '')} (single note)`) : null, confidence: m?.confidence ?? 0, hold: ok ? chords.progress(now) : 0, level }, now, got !== null);
    }
  };
  // a timer (not rAF) keeps a steady ~30 fps analysis rate independent of rendering
  timer = window.setInterval(tick, 33);
  return {
    stop() {
      if (!running) return; // idempotent: React cleanup may call stop() after the toggle already did
      running = false;
      window.clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      if (ctx.state !== 'closed') ctx.close().catch(() => {});
      // Restore playback-only so Muse keeps sounding through the silent switch after Listen.
      setAudioSession('playback');
    },
  };
}
