// WAV export: renders the whole timeline (chords, auto/composed bass, melody, drums) through the same
// AudioEngine + drum kit used by ▶ Play, into an OfflineAudioContext, and encodes 16-bit stereo WAV.
// Lazy chunk (loaded from the Share menu, prefetched when idle so it works offline).
import {
  INSTRUMENTS, bassLineMidi, chordMidis, defaultMidiForVoice, drumTuningForKey, fitMidiToInstrument, pianoVoicing,
  timelineEvents, voiceProgression, type Chord, type DrumKitId, type InstrumentId, type Key, type PartMeters, type TimeSig, type TimelineSlot,
} from '../core';
import { AudioEngine } from './audio';
import { drumBanks } from './drumKit';
import { encodeWav } from '../core';

export interface RenderOpts {
  slots: TimelineSlot[];
  timeSig: TimeSig;
  beatSec: number;
  partMeters: PartMeters;
  k: Key;
  chordInst: InstrumentId;
  melodyInst: InstrumentId;
  bassInst: InstrumentId | 'off';
  drumKit: DrumKitId;
  sampleRate?: number;
  /** stage: 'load' | 'render' | 'encode', progress 0..1 */
  onProgress?: (stage: 'load' | 'render' | 'encode', p: number) => void;
}

export const MAX_RENDER_SEC = 600;
export const TAIL_SEC = 2.5;

export async function renderTimelineWav(o: RenderOpts): Promise<{ wav: Uint8Array; seconds: number }> {
  const sr = o.sampleRate ?? 44100;
  const ev = timelineEvents(o.slots, { timeSig: o.timeSig, beatSec: o.beatSec, partMeters: o.partMeters });
  if (ev.total <= 0) throw new Error('Nothing to render yet');
  const seconds = Math.min(MAX_RENDER_SEC, ev.total + TAIL_SEC);
  const AC = (window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext);
  const ctx = new AC(2, Math.ceil(seconds * sr), sr);
  const eng = new AudioEngine({ seed: 7 });
  eng.setInstrument(o.chordInst); // sets the reverb send for the mix, like ▶ Play
  eng.setDrumKit(o.drumKit);
  eng.attach(ctx);
  const bassId = o.bassInst === 'off' ? null : o.bassInst;
  const parts = [...new Set<InstrumentId>([o.chordInst, ...(ev.notes.length ? [o.melodyInst] : []), ...(bassId ? [bassId] : [])])];
  const loads = [...parts.map((id) => eng.ensureLoaded(id)), ...(ev.drums.length ? [drumBanks.ensure(ctx)] : [])];
  let done = 0;
  o.onProgress?.('load', 0);
  await Promise.all(loads.map((p) => p.then(() => o.onProgress?.('load', ++done / loads.length))));
  for (const id of parts) if (eng.loadState(id).state !== 'ready') throw new Error('Some instrument sounds couldn’t load — try again online');

  // Same scheduling as ▶ Play's timeline pass (origin 0 in the offline clock).
  const withC = o.slots.map((s, i) => ({ s, i })).filter((x) => x.s.chord);
  const voicings = voiceProgression(withC.map((x) => x.s.chord as Chord));
  const vBy = new Map(withC.map((x, j) => [x.i, voicings[j]!]));
  const composedBassBars = new Set(ev.bass.map((b) => b.index));
  const drumTune = drumTuningForKey(o.k);
  const lead = 0.05;
  const keep = (at: number) => at + lead < seconds;
  for (const c of ev.chords) {
    if (!keep(c.at)) continue;
    eng.playNotes(chordMidis(c.chord, vBy.get(c.index) ?? pianoVoicing(c.chord), INSTRUMENTS[o.chordInst], { omitBass: !!bassId }), { at: c.at, dur: c.dur, vel: 0.7, instrument: o.chordInst, origin: lead });
    if (bassId && !composedBassBars.has(c.index)) {
      eng.playNotes([bassLineMidi(c.chord, INSTRUMENTS[bassId])], { at: c.at, dur: c.dur, vel: 0.7 * 0.92, instrument: bassId, origin: lead });
    }
  }
  for (const n of ev.notes) if (keep(n.at)) eng.playNotes([fitMidiToInstrument(n.midi, INSTRUMENTS[o.melodyInst])], { at: n.at, dur: n.dur, vel: n.beat === 0 ? 0.95 : 0.85, instrument: o.melodyInst, origin: lead });
  if (bassId) for (const n of ev.bass) if (keep(n.at)) eng.playNotes([fitMidiToInstrument(n.midi, INSTRUMENTS[bassId])], { at: n.at, dur: n.dur, vel: n.beat === 0 ? 0.95 : 0.88, instrument: bassId, origin: lead });
  for (const d of ev.drums) if (keep(d.at)) eng.playDrum(d.voice, { at: d.at, vel: d.vel, artic: d.artic, midi: d.midi ?? defaultMidiForVoice(d.voice, drumTune), melodic: true, origin: lead });

  // Progress via suspend points where supported (Chrome, Safari 14.1+); harmless otherwise.
  const steps = 10;
  for (let i = 1; i < steps; i++) {
    const t = (seconds * i) / steps;
    try {
      void ctx.suspend(t).then(() => { o.onProgress?.('render', i / steps); void ctx.resume(); });
    } catch { break; }
  }
  o.onProgress?.('render', 0);
  const buf = await ctx.startRendering();
  o.onProgress?.('encode', 0);
  await new Promise((r) => setTimeout(r, 0));
  const wav = encodeWav(buf);
  o.onProgress?.('encode', 1);
  return { wav, seconds };
}

/** Hand the file to the user: share sheet on phones that support sharing files (iPhone → Save to Files),
 *  otherwise a normal download. Returns how it was delivered. */
export async function deliverFile(bytes: Uint8Array, name: string, type: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (coarse && typeof File === 'function' && nav.share && nav.canShare) {
    const file = new File([blob], name, { type });
    if (nav.canShare({ files: [file] })) {
      try { await nav.share({ files: [file], title: name }); return 'shared'; }
      catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; /* fall through to download */ }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
