// Plain-text and Standard MIDI File export (framework-free).
import { Chord, chordSymbol } from './chords';
import { romanOf } from './roman';
import { Key, keyName, spellInKey } from './scales';
import { midiName } from './notes';
import { voiceProgression } from './suggest';
import { bassNote } from './voicing';
import {
  DEFAULT_TIME_SIG, PartMeters, TimeSig, beatsPerBar, defaultPartMeters, midiTimeSigBytes, timeSigLabel,
} from './meter';
import { DrumHit, DrumVoiceId, drumTabAscii } from './drums';
import { TimelineSlot, isSounding, labelSlot, noteDurations, slotBass, slotDrums } from './timeline';

export function progressionText(k: Key, chords: Chord[], melody: number[] = []): string {
  const lines = [`Key: ${keyName(k)}`];
  if (chords.length) {
    lines.push(`Chords: ${chords.map((c) => chordSymbol(c, true)).join(' | ')}`);
    lines.push(`Roman:  ${chords.map((c) => romanOf(c, k)).join(' | ')}`);
  }
  if (melody.length) lines.push(`Melody: ${melody.map((m) => midiName(m, spellInKey(k, m))).join(' ')}`);
  return lines.join('\n');
}

function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number) => [(n >>> 8) & 255, n & 255];

function track(events: Array<{ tick: number; bytes: number[] }>): number[] {
  events.sort((a, b) => a.tick - b.tick || (a.bytes[0] & 0xf0) - (b.bytes[0] & 0xf0)); // note-offs (0x80) before note-ons (0x90)
  const data: number[] = [];
  let last = 0;
  for (const e of events) {
    data.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  data.push(0, 0xff, 0x2f, 0x00);
  return [0x4d, 0x54, 0x72, 0x6b, ...u32(data.length), ...data];
}

/** General MIDI percussion keys (channel 10) for Muse's kit voices. Key-tuned hits keep their GM key —
 *  GM drums are fixed-pitch, so the tuning lives only in Muse's own playback. */
export const GM_DRUM: Record<DrumVoiceId, number> = {
  CC: 49, Cs: 55, Rd: 51, Rb: 53, HH: 42, HHs: 46, HO: 46, Hf: 44,
  SD: 38, RS: 37, T1: 50, T2: 47, FT: 43, BD: 36, BDp: 35,
};
const ARTIC_VEL: Record<string, number> = { ghost: 0.28, accent: 0.95, normal: 0.78, open: 0.8, closed: 0.78 };
export function drumVelocity(h: DrumHit): number {
  const v = h.vel ?? ARTIC_VEL[h.artic ?? 'normal'] ?? 0.78;
  return Math.max(1, Math.min(127, Math.round(v * 127)));
}

/**
 * MIDI of the unified timeline:
 * track 1 = chords (voice-led; low root omitted when a composed bass lane exists on that bar),
 * track 2 = melody, track 3 = composed bass (when any bar has bass notes),
 * last track = drums on channel 10 (GM keys) from the drum lane — or, when the lane is empty, the session
 * groove (`opts.groove`, one bar) repeated under every bar, the same way “Add to notes” stamps it.
 * Chordless (N.C.) bars keep their melody/bass. Beat unit follows the time-signature denominator.
 */
export function toMidiTimeline(
  slots: TimelineSlot[],
  bpm = 90,
  timeSig: TimeSig = DEFAULT_TIME_SIG,
  partMeters?: PartMeters,
  opts: { groove?: DrumHit[] } = {},
): Uint8Array<ArrayBuffer> {
  const PPQ = 480;
  const beats = beatsPerBar(timeSig);
  const parts = partMeters ?? defaultPartMeters(timeSig);
  const melBeats = beatsPerBar(parts.melody.timeSig);
  const bassBeats = beatsPerBar(parts.bass.timeSig);
  const barTicks = PPQ * beats;
  const melTick = barTicks / melBeats;
  const bassTick = barTicks / bassBeats;
  const tempo = Math.round(60000000 / bpm);
  const hasBassLane = slots.some((s) => slotBass(s).length > 0);
  const t1: Array<{ tick: number; bytes: number[] }> = [
    { tick: 0, bytes: [0xff, 0x51, 0x03, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255] },
    { tick: 0, bytes: midiTimeSigBytes(timeSig) },
    { tick: 0, bytes: [0xc0, 0] },
  ];
  const withChord = slots.map((s, i) => ({ s, i })).filter((x) => x.s.chord);
  const voicings = voiceProgression(withChord.map((x) => x.s.chord as Chord));
  withChord.forEach(({ s, i }, j) => {
    const start = i * barTicks;
    const composed = slotBass(s).length > 0;
    const notes = composed ? voicings[j] : [bassNote(s.chord as Chord), ...voicings[j]];
    for (const n of notes) {
      t1.push({ tick: start, bytes: [0x90, n, 80] });
      t1.push({ tick: start + barTicks - 10, bytes: [0x80, n, 0] });
    }
  });
  const t2: Array<{ tick: number; bytes: number[] }> = [{ tick: 0, bytes: [0xc1, 0] }];
  slots.forEach((s, i) => {
    const d = noteDurations(s.notes, melBeats);
    s.notes.forEach((n, j) => {
      if (!isSounding(n)) return;
      const start = Math.round(i * barTicks + n.beat * melTick);
      t2.push({ tick: start, bytes: [0x91, n.midi, n.beat === 0 ? 100 : 90] });
      t2.push({ tick: start + Math.round(d[j]! * melTick) - 10, bytes: [0x81, n.midi, 0] });
    });
  });
  const tracks = [track(t1), track(t2)];
  if (hasBassLane) {
    const t3: Array<{ tick: number; bytes: number[] }> = [{ tick: 0, bytes: [0xc2, 32] }]; // Acoustic Bass
    slots.forEach((s, i) => {
      const bass = slotBass(s);
      const d = noteDurations(bass, bassBeats);
      bass.forEach((n, j) => {
        if (!isSounding(n)) return;
        const start = Math.round(i * barTicks + n.beat * bassTick);
        t3.push({ tick: start, bytes: [0x92, n.midi, n.beat === 0 ? 100 : 90] });
        t3.push({ tick: start + Math.round(d[j]! * bassTick) - 10, bytes: [0x82, n.midi, 0] });
      });
    });
    tracks.push(track(t3));
  }
  const drumBeats = beatsPerBar(parts.drums.timeSig);
  const drumTick = barTicks / drumBeats;
  const laneHits = slots.some((s) => slotDrums(s).length > 0);
  const groove = !laneHits && opts.groove?.length ? opts.groove.filter((h) => h.beat < drumBeats) : [];
  if (laneHits || groove.length) {
    const name = [...'Drums'].map((c) => c.charCodeAt(0));
    const t4: Array<{ tick: number; bytes: number[] }> = [{ tick: 0, bytes: [0xff, 0x03, name.length, ...name] }];
    const len = Math.max(20, Math.round(PPQ / 8));
    slots.forEach((s, i) => {
      for (const h of laneHits ? slotDrums(s) : groove) {
        const key = GM_DRUM[h.voice];
        if (key === undefined || !(h.beat >= 0)) continue;
        const start = Math.round(i * barTicks + h.beat * drumTick);
        t4.push({ tick: start, bytes: [0x99, key, drumVelocity(h)] });
        t4.push({ tick: start + len, bytes: [0x89, key, 0] });
      }
    });
    tracks.push(track(t4));
  }
  const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(PPQ)];
  return new Uint8Array([...header, ...tracks.flat()]);
}

export function toMidiFile(chords: Chord[], melody: number[] = [], bpm = 90): Uint8Array<ArrayBuffer> {
  const PPQ = 480;
  const tempo = Math.round(60000000 / bpm);
  const t1: Array<{ tick: number; bytes: number[] }> = [
    { tick: 0, bytes: [0xff, 0x51, 0x03, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255] },
    { tick: 0, bytes: [0xc0, 0] },
  ];
  voiceProgression(chords).forEach((v, i) => {
    const start = i * PPQ * 4;
    const notes = [bassNote(chords[i]), ...v];
    for (const n of notes) {
      t1.push({ tick: start, bytes: [0x90, n, 80] });
      t1.push({ tick: start + PPQ * 4 - 10, bytes: [0x80, n, 0] });
    }
  });
  const t2: Array<{ tick: number; bytes: number[] }> = [{ tick: 0, bytes: [0xc1, 0] }];
  melody.forEach((n, i) => {
    t2.push({ tick: i * PPQ, bytes: [0x91, n, 96] });
    t2.push({ tick: (i + 1) * PPQ - 10, bytes: [0x81, n, 0] });
  });
  const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(1), ...u16(2), ...u16(PPQ)];
  return new Uint8Array([...header, ...track(t1), ...track(t2)]);
}

/** Plain-text timeline: one bar per slot, melody notes with their beat and chord relation. */
export function timelineText(k: Key, slots: TimelineSlot[], timeSig: TimeSig = DEFAULT_TIME_SIG): string {
  const beats = beatsPerBar(timeSig);
  const lines = [`Key: ${keyName(k)}`, `Meter: ${timeSigLabel(timeSig)}`];
  slots.forEach((s, i) => {
    const sym = s.chord ? `${chordSymbol(s.chord, true)} (${romanOf(s.chord, k)})` : 'no chord';
    const notes = labelSlot(s, null, beats).map((n) => (
      isSounding(n)
        ? `${midiName(n.midi, spellInKey(k, n.midi))}@${n.beat + 1}${n.relation ? `[${n.relation.label}]` : ''}`
        : `rest@${n.beat + 1}`
    )).join(' ');
    const bass = slotBass(s).map((n) => (
      isSounding(n) ? `${midiName(n.midi, spellInKey(k, n.midi))}@${n.beat + 1}` : `rest@${n.beat + 1}`
    )).join(' ');
    const drums = slotDrums(s);
    const bits = [notes ? `mel ${notes}` : '', bass ? `bass ${bass}` : ''].filter(Boolean).join(' · ');
    lines.push(`Bar ${i + 1}: ${sym}${bits ? ` — ${bits}` : ''}`);
    if (drums.length) {
      lines.push(drumTabAscii(drums, beats, 4));
    }
  });
  return lines.join('\n');
}
