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
import { TimelineSlot, isSounding, labelSlot, noteDurations, slotBass } from './timeline';

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

/**
 * MIDI of the unified timeline:
 * track 1 = chords (voice-led; low root omitted when a composed bass lane exists on that bar),
 * track 2 = melody, track 3 = composed bass (when any bar has bass notes).
 * Chordless (N.C.) bars keep their melody/bass. Beat unit follows the time-signature denominator.
 */
export function toMidiTimeline(
  slots: TimelineSlot[],
  bpm = 90,
  timeSig: TimeSig = DEFAULT_TIME_SIG,
  partMeters?: PartMeters,
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
    const bits = [notes ? `mel ${notes}` : '', bass ? `bass ${bass}` : ''].filter(Boolean).join(' · ');
    lines.push(`Bar ${i + 1}: ${sym}${bits ? ` — ${bits}` : ''}`);
  });
  return lines.join('\n');
}
