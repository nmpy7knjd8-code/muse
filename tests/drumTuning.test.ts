import { describe, expect, it } from 'vitest';
import {
  defaultMidiForVoice, drumTuningForKey, key, mod, pc, scalePcs, voiceTuneLabel,
} from '../src/core';

describe('drum key / mode pairing', () => {
  it('tunes kick and floor to the tonic, toms to 3rd/5th in major', () => {
    const t = drumTuningForKey(key('C', 'major'));
    expect(mod(t.kick, 12)).toBe(0); // C
    expect(mod(t.floor, 12)).toBe(0);
    expect(mod(t.mid, 12)).toBe(4); // E = 3rd
    expect(mod(t.high, 12)).toBe(7); // G = 5th
    expect(mod(t.rideBell, 12)).toBe(7);
    expect(defaultMidiForVoice('BD', t)).toBe(t.kick);
    expect(voiceTuneLabel('T1', t)).toMatch(/G/);
  });

  it('uses ♭3 for mid tom in natural minor', () => {
    const t = drumTuningForKey(key('A', 'minor'));
    expect(mod(t.mid, 12)).toBe(mod(pc(t.key.tonic) + 3, 12)); // C = ♭3 of A
    expect(t.scaleTones.map((s) => s.interval)).toEqual(scalePcs(t.key).map((p) => mod(p - pc(t.key.tonic), 12)));
  });

  it('phrygian dominant keeps a major 3rd on the mid tom', () => {
    const t = drumTuningForKey(key('D', 'phrygianDominant'));
    expect(mod(t.mid, 12)).toBe(mod(pc(t.key.tonic) + 4, 12)); // F#
    expect(t.scaleTones.some((s) => s.label === '♭2')).toBe(true);
  });
});
