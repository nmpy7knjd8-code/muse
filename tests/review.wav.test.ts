import { describe, expect, it } from 'vitest';
import { encodeWav, exportFileName } from '../src/core';

const src = (chans: number[][], sr = 44100) => ({ numberOfChannels: chans.length, length: chans[0]!.length, sampleRate: sr, getChannelData: (c: number) => Float32Array.from(chans[c]!) });

describe('WAV export (review #12)', () => {
  it('writes a valid 16-bit PCM RIFF header', () => {
    const w = encodeWav(src([[0, 0.5, -0.5], [0, 0.25, -1]], 48000));
    const dv = new DataView(w.buffer);
    const tag = (o: number) => String.fromCharCode(...w.slice(o, o + 4));
    expect(tag(0)).toBe('RIFF'); expect(tag(8)).toBe('WAVE'); expect(tag(12)).toBe('fmt '); expect(tag(36)).toBe('data');
    expect(dv.getUint16(20, true)).toBe(1); // PCM
    expect(dv.getUint16(22, true)).toBe(2);
    expect(dv.getUint32(24, true)).toBe(48000);
    expect(dv.getUint32(28, true)).toBe(48000 * 4);
    expect(dv.getUint16(34, true)).toBe(16);
    expect(dv.getUint32(40, true)).toBe(3 * 2 * 2);
    expect(dv.getUint32(4, true)).toBe(w.length - 8);
  });
  it('interleaves channels and clamps to 16-bit', () => {
    const w = encodeWav(src([[0.5, 2], [-0.5, -3]]));
    const dv = new DataView(w.buffer);
    expect([dv.getInt16(44, true), dv.getInt16(46, true), dv.getInt16(48, true), dv.getInt16(50, true)]).toEqual([Math.trunc(0.5 * 0x7fff), -0x4000, 0x7fff, -0x8000]);
  });
  it('names files from the key and first chords', () => {
    expect(exportFileName('F♯ minor', ['F♯m', 'D', 'A', 'E', 'Bm'], 'wav')).toBe('muse-Fs-minor-Fsm-D-A-E.wav');
    expect(exportFileName('', [], 'wav')).toBe('muse-sketch.wav');
  });
});
