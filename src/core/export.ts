// Plain-text and Standard MIDI File export (framework-free).
import { Chord, chordSymbol } from './chords';
import { romanOf } from './roman';
import { Key, keyName, spellInKey } from './scales';
import { midiName } from './notes';
import { voiceProgression } from './suggest';
import { bassNote } from './voicing';

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
 * Type-1 MIDI file: track 1 = chords (one bar each, voice-led, with bass), track 2 = melody (quarter notes).
 * 480 ticks per quarter note.
 */
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
