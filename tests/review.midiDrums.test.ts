import { describe, expect, it } from 'vitest';
import { GM_DRUM, drumVelocity, parseChord, toMidiTimeline, type DrumHit, type TimelineSlot } from '../src/core';

/** Minimal SMF reader: tracks → note-on events {tick, ch, key, vel} (running status not used by our writer). */
function readMidi(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ntrk = dv.getUint16(10), ppq = dv.getUint16(12);
  let o = 14;
  const tracks: Array<{ name?: string; on: Array<{ tick: number; ch: number; key: number; vel: number }>; offs: number }> = [];
  for (let t = 0; t < ntrk; t++) {
    expect(String.fromCharCode(...bytes.slice(o, o + 4))).toBe('MTrk');
    const len = dv.getUint32(o + 4); let p = o + 8; const end = p + len; let tick = 0;
    const tr: (typeof tracks)[number] = { on: [], offs: 0 };
    const vlq = () => { let v = 0, b; do { b = bytes[p++]!; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
    while (p < end) {
      tick += vlq();
      const st = bytes[p++]!;
      if (st === 0xff) { const type = bytes[p++]!; const l = vlq(); if (type === 0x03) tr.name = String.fromCharCode(...bytes.slice(p, p + l)); p += l; }
      else if ((st & 0xf0) === 0x90) { tr.on.push({ tick, ch: st & 0x0f, key: bytes[p]!, vel: bytes[p + 1]! }); p += 2; }
      else if ((st & 0xf0) === 0x80) { tr.offs++; p += 2; }
      else if ((st & 0xf0) === 0xc0) p += 1;
      else throw new Error('unexpected status ' + st.toString(16));
    }
    tracks.push(tr); o = end;
  }
  return { ppq, tracks };
}

const C = (s: string) => parseChord(s)!;
const rock: DrumHit[] = [
  { voice: 'BD', beat: 0, vel: 0.9 }, { voice: 'HH', beat: 0 }, { voice: 'HH', beat: 0.5, artic: 'ghost' },
  { voice: 'SD', beat: 1, artic: 'accent' }, { voice: 'BD', beat: 2 }, { voice: 'SD', beat: 3 },
];

describe('drums in MIDI export (review #11)', () => {
  it('adds a channel-10 "Drums" track from the drum lane with GM keys, timing and velocity', () => {
    const slots: TimelineSlot[] = [{ chord: C('C'), notes: [], drums: rock }, { chord: C('G'), notes: [] }];
    const { ppq, tracks } = readMidi(toMidiTimeline(slots, 120));
    expect(tracks.length).toBe(3); // chords, melody, drums
    const d = tracks[2]!;
    expect(d.name).toBe('Drums');
    expect(d.on.every((e) => e.ch === 9)).toBe(true);
    expect(d.offs).toBe(d.on.length);
    expect(d.on.map((e) => [e.tick / ppq, e.key])).toEqual([[0, 36], [0, 42], [0.5, 42], [1, 38], [2, 36], [3, 38]]);
    expect(d.on[0]!.vel).toBe(Math.round(0.9 * 127));
    expect(d.on[2]!.vel).toBe(drumVelocity({ voice: 'HH', beat: 0, artic: 'ghost' }));
    expect(d.on[3]!.vel).toBeGreaterThan(d.on[1]!.vel);
    // other tracks never use channel 10
    expect(tracks.slice(0, 2).flatMap((t) => t.on).some((e) => e.ch === 9)).toBe(false);
  });
  it('places drums per bar and after the bass track when one exists', () => {
    const slots: TimelineSlot[] = [
      { chord: C('C'), notes: [], bass: [{ midi: 36, beat: 0 }] },
      { chord: C('F'), notes: [], drums: [{ voice: 'CC', beat: 0 }, { voice: 'RS', beat: 1.5 }] },
    ];
    const { ppq, tracks } = readMidi(toMidiTimeline(slots, 100, { num: 4, den: 4 }));
    expect(tracks.length).toBe(4);
    expect(tracks[3]!.on.map((e) => [e.tick / ppq, e.key])).toEqual([[4, 49], [5.5, 37]]);
  });
  it('uses the session groove under every bar only when the drum lane is empty', () => {
    const slots: TimelineSlot[] = [{ chord: C('C'), notes: [] }, { chord: C('Am'), notes: [] }, { chord: C('F'), notes: [] }];
    const g = readMidi(toMidiTimeline(slots, 120, undefined, undefined, { groove: rock })).tracks.at(-1)!;
    expect(g.name).toBe('Drums');
    expect(g.on.length).toBe(rock.length * 3);
    expect(g.on.filter((e) => e.key === 38).map((e) => e.tick / 480)).toEqual([1, 3, 5, 7, 9, 11]);
    const withLane = [{ ...slots[0]!, drums: [{ voice: 'BD' as const, beat: 0 }] }, slots[1]!];
    expect(readMidi(toMidiTimeline(withLane, 120, undefined, undefined, { groove: rock })).tracks.at(-1)!.on.length).toBe(1);
  });
  it('has no drum track when there are no drums, and respects the drum part meter', () => {
    expect(readMidi(toMidiTimeline([{ chord: C('C'), notes: [] }])).tracks.length).toBe(2);
    // 6/8 drums in a 3/4 session: drum beats are eighths → half the tick spacing
    const pm = { chords: { timeSig: { num: 3, den: 4 }, subdiv: 1 as const }, melody: { timeSig: { num: 3, den: 4 }, subdiv: 1 as const }, bass: { timeSig: { num: 3, den: 4 }, subdiv: 1 as const }, drums: { timeSig: { num: 6, den: 8 }, subdiv: 1 as const } };
    const t = readMidi(toMidiTimeline([{ chord: C('C'), notes: [], drums: [{ voice: 'BD', beat: 0 }, { voice: 'SD', beat: 3 }] }], 90, { num: 3, den: 4 }, pm)).tracks.at(-1)!;
    expect(t.on.map((e) => e.tick / 480)).toEqual([0, 1.5]);
  });
  it('maps every kit voice to a GM percussion key', () => {
    for (const k of Object.values(GM_DRUM)) { expect(k).toBeGreaterThanOrEqual(35); expect(k).toBeLessThanOrEqual(81); }
  });
});
