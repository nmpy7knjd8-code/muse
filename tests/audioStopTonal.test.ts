// stopTonal must leave kit voices scheduled while silencing pitched parts —
// the contract that keeps a drum loop alive while auditioning chords.
import { afterEach, describe, expect, it } from 'vitest';
import { AudioEngine } from '../src/ui/audio';

type VoiceKind = 'tonal' | 'drum';
type EnginePriv = {
  voices: Array<{ kind: VoiceKind; stop: (t: number) => void; end: number }>;
  ctx: BaseAudioContext | null;
};

function kinds(eng: AudioEngine): VoiceKind[] {
  return (eng as unknown as EnginePriv).voices.map((v) => v.kind);
}

describe('AudioEngine.stopTonal', () => {
  let eng: AudioEngine;

  afterEach(() => {
    eng?.stopAll();
  });

  it('keeps drum voices when stopTonal runs; stopAll clears both', () => {
    const Offline = (globalThis as unknown as {
      OfflineAudioContext?: new (c: number, l: number, sr: number) => OfflineAudioContext;
      webkitOfflineAudioContext?: new (c: number, l: number, sr: number) => OfflineAudioContext;
    }).OfflineAudioContext
      ?? (globalThis as unknown as { webkitOfflineAudioContext: new (c: number, l: number, sr: number) => OfflineAudioContext })
        .webkitOfflineAudioContext;
    if (!Offline) return; // skip in environments without Web Audio

    eng = new AudioEngine({ remember: false, seed: 1 });
    const ctx = new Offline(1, 44100, 44100);
    eng.attach(ctx);

    // Schedule pitched + kit hits into the future so they stay in the voice list.
    eng.playNotes([60, 64, 67], { at: 0.2, dur: 0.5 });
    eng.playDrum('BD', { at: 0.25, vel: 0.8 });
    eng.playDrum('SD', { at: 0.5, vel: 0.7 });
    eng.playDrum('HH', { at: 0.1, vel: 0.5 });

    const before = kinds(eng);
    expect(before.filter((k) => k === 'tonal').length).toBeGreaterThan(0);
    expect(before.filter((k) => k === 'drum')).toEqual(['drum', 'drum', 'drum']);

    eng.stopTonal();
    expect(kinds(eng)).toEqual(['drum', 'drum', 'drum']);

    eng.stopAll();
    expect(kinds(eng)).toEqual([]);
  });

  it('stopAll clears a long queue of future loop hits (Clear while Looping)', () => {
    const Offline = (globalThis as unknown as {
      OfflineAudioContext?: new (c: number, l: number, sr: number) => OfflineAudioContext;
      webkitOfflineAudioContext?: new (c: number, l: number, sr: number) => OfflineAudioContext;
    }).OfflineAudioContext
      ?? (globalThis as unknown as { webkitOfflineAudioContext: new (c: number, l: number, sr: number) => OfflineAudioContext })
        .webkitOfflineAudioContext;
    if (!Offline) return;

    eng = new AudioEngine({ remember: false, seed: 2 });
    eng.attach(new Offline(1, 44100 * 8, 44100));

    // Simulate several primed loop cycles of dense drums + chords.
    for (let cycle = 0; cycle < 4; cycle++) {
      const o = cycle * 2;
      eng.playNotes([60, 64, 67], { at: o, dur: 1.5, origin: 0 });
      for (let i = 0; i < 8; i++) {
        eng.playDrum('HH', { at: o + i * 0.25, vel: 0.5, origin: 0 });
      }
      eng.playDrum('BD', { at: o, vel: 0.9, origin: 0 });
      eng.playDrum('SD', { at: o + 1, vel: 0.85, origin: 0 });
    }
    expect(kinds(eng).length).toBeGreaterThan(20);

    eng.stopAll();
    expect(kinds(eng)).toEqual([]);
  });
});
