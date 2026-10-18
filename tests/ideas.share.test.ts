import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare, parseChord, readShareHash, shareUrl, defaultPartMeters, type SharePayload } from '../src/core';

const C = (s: string) => parseChord(s)!;
const base: SharePayload = {
  tonic: 'Eb', mode: 'minor', bpm: 96, timeSig: { num: 6, den: 8 },
  slots: [
    { chord: C('Ebm'), notes: [{ midi: 63, beat: 0, dur: 1.5 }, { midi: null, beat: 1.5 }] },
    { chord: C('Cb/Eb'), notes: [], bass: [{ midi: 39, beat: 0 }], locked: true },
    { chord: null, notes: [], drums: [{ voice: 'BD', beat: 0, vel: 0.8 }] },
    { chord: C('Bbm7'), notes: [] },
  ],
  grooveHits: [{ voice: 'SD', beat: 1 }],
  partMeters: defaultPartMeters({ num: 6, den: 8 }),
};

describe('share links (idea 11)', () => {
  it('round-trips key, tempo, meter and every bar', () => {
    const d = decodeShare(encodeShare(base))!;
    expect(d.tonic).toBe('Eb'); expect(d.mode).toBe('minor'); expect(d.bpm).toBe(96);
    expect(d.timeSig).toEqual({ num: 6, den: 8 });
    expect(d.slots).toEqual(base.slots);
    expect(d.grooveHits).toEqual(base.grooveHits);
    expect(d.partMeters).toBeUndefined(); // defaults are omitted from the link
    const custom = { ...base.partMeters!, melody: { timeSig: { num: 6, den: 8 }, subdiv: 2 as const } };
    expect(decodeShare(encodeShare({ ...base, partMeters: custom }))!.partMeters).toEqual(custom);
  });
  it('produces URL-safe, reasonably short codes', () => {
    const code = encodeShare({ ...base, slots: Array.from({ length: 8 }, () => ({ chord: C('Cmaj7'), notes: [] })), partMeters: undefined, grooveHits: [] });
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(300);
  });
  it('rejects garbage and invalid data', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('!!!')).toBeNull();
    expect(decodeShare(btoa('{"v":1}'))).toBeNull();
    expect(decodeShare(encodeShare({ ...base, tonic: 'H' }))).toBeNull();
    const bad = btoa(JSON.stringify({ v: 1, k: 'C', m: 'major', b: 9999, t: '4/4', s: [[[0, 0, 'nope'], []], [[0, 0, 'maj'], [60, 0, 0]]] })).replace(/=+$/, '');
    const d = decodeShare(bad)!;
    expect(d.slots.length).toBe(1);
    expect(d.bpm).toBeLessThanOrEqual(300);
  });
  it('builds and reads the hash', () => {
    const url = shareUrl('https://x.dev/muse/#old', base);
    expect(url.startsWith('https://x.dev/muse/#s=')).toBe(true);
    const code = readShareHash(new URL(url).hash)!;
    expect(decodeShare(code)?.tonic).toBe('Eb');
    expect(readShareHash('#foo')).toBeNull();
  });
});
